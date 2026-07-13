import shutil
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import delete, func, text
from sqlalchemy.orm import Session
from openpyxl import load_workbook

from app.config import settings
from app.database import SessionLocal
from app.models import (
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    ImportBatch,
    ImportFile,
    SupplementalBaoLanhRecord,
    SupplementalOABRecord,
)


OPTIONAL_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "optional"
REQUIRED_FILE_TYPES = ("DP01", "LN01", "CN05", "PF14")
BAO_LANH_LC_CODES = {"ILU", "ILS"}
BAO_LANH_CODES = {"VPB", "VMB", "VAB", "VBB", "VSB", "VRT"}


EXCHANGE_RATE_SQL = text(
    """
    INSERT INTO customer_period_exchange_rates (period_key, ccy, exchange_rate, source)
    SELECT
        :period_key,
        ccy,
        COALESCE(NULLIF(MAX(tygia), 0), 1) AS exchange_rate,
        'DP01'
    FROM (
        SELECT
            UPPER(TRIM(COALESCE(ccy, 'VND'))) AS ccy,
            COALESCE(tygia, CASE WHEN UPPER(TRIM(COALESCE(ccy, 'VND'))) = 'VND' THEN 1 ELSE NULL END) AS tygia
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key
    ) rates
    WHERE ccy IS NOT NULL AND ccy <> ''
    GROUP BY ccy
    ON CONFLICT (period_key, ccy) DO UPDATE SET
        exchange_rate = EXCLUDED.exchange_rate,
        source = EXCLUDED.source
    """
)


DEFAULT_VND_RATE_SQL = text(
    """
    INSERT INTO customer_period_exchange_rates (period_key, ccy, exchange_rate, source)
    VALUES (:period_key, 'VND', 1, 'DEFAULT')
    ON CONFLICT (period_key, ccy) DO NOTHING
    """
)


BRANCH_DETAIL_SQL = text(
    """
    WITH dp_customers AS (
        SELECT DISTINCT ma_kh
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
    ),
    dp AS (
        SELECT
            period_key,
            MAX(period_date) AS period_date,
            ma_kh,
            ma_cn AS branch_code,
            MAX(ma_pgd) AS ma_pgd,
            MAX(ten_pgd) AS ten_pgd,
            MAX(ten_kh) AS ten_kh,
            MAX(COALESCE(cust_type_name, cust_type)) AS loai_khach_hang,
            COUNT(*) AS dp_record_count,
            SUM(COALESCE(current_balance, 0)) AS so_du_tien_gui,
            SUM(COALESCE(cramt, 0)) AS doanh_so_cramt,
            SUM(COALESCE(dramt, 0)) AS doanh_so_dramt
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
        GROUP BY period_key, ma_kh, ma_cn
    ),
    valid_users AS (
        SELECT DISTINCT ON (UPPER(TRIM(ipcas_username)))
            UPPER(TRIM(ipcas_username)) AS normalized_ipcas_username,
            TRIM(ipcas_username) AS ma_cb,
            full_name AS ten_can_bo,
            employee_code AS officer_employee_code
        FROM system_users
        WHERE ipcas_username IS NOT NULL
            AND TRIM(ipcas_username) <> ''
        ORDER BY UPPER(TRIM(ipcas_username)), is_active DESC, full_name
    ),
    ln_base AS (
        SELECT
            loans.custseq AS ma_kh,
            loans.brcd AS branch_code,
            COALESCE(loans.du_no, 0) AS du_no,
            loans.loan_type,
            valid_users.ma_cb,
            valid_users.ten_can_bo,
            valid_users.officer_employee_code,
            CASE WHEN loan_type = 'Thấu chi trên TK khách hàng' THEN 1 ELSE 0 END AS is_thau_chi,
            CASE WHEN loan_type = 'Vay ngắn hạn (TK 211)' THEN 1 ELSE 0 END AS is_ngan,
            CASE WHEN loan_type = 'Vay trung hạn (TK 212)' THEN 1 ELSE 0 END AS is_trung,
            CASE WHEN loan_type = 'Vay dài hạn (TK 213)' THEN 1 ELSE 0 END AS is_dai
        FROM ln01_loans loans
        LEFT JOIN valid_users
            ON valid_users.normalized_ipcas_username = UPPER(TRIM(COALESCE(loans.officer_ipcas, '')))
        WHERE loans.period_key = :period_key AND loans.custseq IS NOT NULL
    ),
    ln_agg AS (
        SELECT
            ma_kh,
            branch_code,
            SUM(du_no) AS so_du_tien_vay,
            MAX(is_thau_chi) AS thau_chi,
            CONCAT_WS(
                '/',
                CASE WHEN MAX(is_thau_chi) = 1 THEN 'Thấu chi' END,
                CASE WHEN MAX(is_ngan) = 1 THEN 'Ngắn' END,
                CASE WHEN MAX(is_trung) = 1 THEN 'Trung' END,
                CASE WHEN MAX(is_dai) = 1 THEN 'Dài' END
            ) AS loai_vay
        FROM ln_base
        GROUP BY ma_kh, branch_code
    ),
    ln_top_officer AS (
        SELECT ma_kh, branch_code, ma_cb, ten_can_bo, officer_employee_code
        FROM (
            SELECT
                ma_kh,
                branch_code,
                ma_cb,
                ten_can_bo,
                officer_employee_code,
                ROW_NUMBER() OVER (
                    PARTITION BY ma_kh, branch_code
                    ORDER BY du_no DESC, ma_cb NULLS LAST, ten_can_bo NULLS LAST
                ) AS row_number
            FROM ln_base
            WHERE ma_cb IS NOT NULL
        ) ranked
        WHERE row_number = 1
    ),
    ln AS (
        SELECT
            ln_agg.ma_kh,
            ln_agg.branch_code,
            ln_agg.so_du_tien_vay,
            ln_agg.loai_vay,
            ln_agg.thau_chi,
            ln_top_officer.ma_cb,
            ln_top_officer.ten_can_bo,
            ln_top_officer.officer_employee_code
        FROM ln_agg
        LEFT JOIN ln_top_officer
            ON ln_top_officer.ma_kh = ln_agg.ma_kh
            AND ln_top_officer.branch_code = ln_agg.branch_code
    ),
    exchange_rates AS (
        SELECT ccy, exchange_rate
        FROM customer_period_exchange_rates
        WHERE period_key = :period_key
    ),
    pf_base AS (
        SELECT
            TRIM(BOTH FROM REPLACE(COALESCE(pf14.custseq, ''), '''', '')) AS ma_kh,
            TRIM(COALESCE(pf14.trbrcd, '')) AS branch_code,
            UPPER(TRIM(COALESCE(pf14.ccy, 'VND'))) AS ccy,
            COALESCE(pf14.monterm, 0) AS monterm,
            COALESCE(pf14.averagebalance, 0) AS averagebalance,
            COALESCE(pf14.monthlyendbalance, 0) AS monthlyendbalance,
            COALESCE(exchange_rates.exchange_rate, 1) AS exchange_rate
        FROM pf14_account_balances pf14
        LEFT JOIN exchange_rates
            ON exchange_rates.ccy = UPPER(TRIM(COALESCE(pf14.ccy, 'VND')))
        WHERE pf14.period_key = :period_key AND pf14.custseq IS NOT NULL
    ),
    pf AS (
        SELECT
            ma_kh,
            branch_code,
            SUM(CASE WHEN monterm > 0 THEN monthlyendbalance * exchange_rate ELSE 0 END) AS so_du_tien_gui_ckh,
            SUM(CASE WHEN monterm = 0 THEN averagebalance * exchange_rate ELSE 0 END) AS so_du_tgtt_binh_quan
        FROM pf_base
        WHERE ma_kh <> '' AND branch_code <> ''
        GROUP BY ma_kh, branch_code
    ),
    cn AS (
        SELECT
            ma_kh,
            ma_cn AS branch_code,
            MAX(CASE WHEN COALESCE(tktt_tk_sodep, 0) > 0 THEN 1 ELSE 0 END) AS tk_so_dep,
            MAX(CASE WHEN COALESCE(dk_agribank_plus, 0) > 0 THEN 1 ELSE 0 END) AS agribank_plus,
            MAX(CASE WHEN COALESCE(dk_agribank_plus_ott, 0) > 0 THEN 1 ELSE 0 END) AS tin_nhan_ott,
            MAX(CASE WHEN COALESCE(sms_banking, 0) > 0 THEN 1 ELSE 0 END) AS e_banking,
            MAX(CASE WHEN COALESCE(vv_sms_tien_vay, 0) > 0 THEN 1 ELSE 0 END) AS sms_nhac_no_vay,
            MAX(CASE WHEN COALESCE(tg_sms_tien_gui, 0) > 0 THEN 1 ELSE 0 END) AS sms_tien_gui,
            MAX(CASE WHEN COALESCE(the_ghi_no_noi_dia, 0) > 0 THEN 1 ELSE 0 END) AS the_ghi_no_noi_dia,
            0 AS the_td_noi_dia,
            MAX(CASE WHEN COALESCE(the_tin_dung_quoc_te, 0) > 0 THEN 1 ELSE 0 END) AS the_td_quoc_te,
            MAX(CASE WHEN COALESCE(the_tin_dung_noi_dia, 0) > 0 THEN 1 ELSE 0 END) AS the_td_loc_viet
        FROM cn05_customer_services
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
        GROUP BY ma_kh, ma_cn
    ),
    keys AS (
        SELECT ma_kh, branch_code FROM dp
        UNION
        SELECT ln.ma_kh, ln.branch_code
        FROM ln
        INNER JOIN dp_customers ON dp_customers.ma_kh = ln.ma_kh
        UNION
        SELECT pf.ma_kh, pf.branch_code
        FROM pf
        INNER JOIN dp_customers ON dp_customers.ma_kh = pf.ma_kh
        UNION
        SELECT cn.ma_kh, cn.branch_code
        FROM cn
        INNER JOIN dp_customers ON dp_customers.ma_kh = cn.ma_kh
    )
    INSERT INTO customer_period_branch_details (
        period_key,
        period_date,
        ma_kh,
        branch_code,
        ma_pgd,
        ten_pgd,
        ten_kh,
        loai_khach_hang,
        dp_record_count,
        so_du_tien_gui,
        doanh_so_cramt,
        doanh_so_dramt,
        so_du_tien_vay,
        loai_vay,
        so_du_tgtt_binh_quan,
        thau_chi,
        tk_so_dep,
        agribank_plus,
        tin_nhan_ott,
        e_banking,
        sms_nhac_no_vay,
        sms_tien_gui,
        the_ghi_no_noi_dia,
        the_td_noi_dia,
        the_td_quoc_te,
        the_td_loc_viet,
        ma_cb,
        ten_can_bo,
        officer_employee_code,
        processing_job_id
    )
    SELECT
        :period_key,
        COALESCE(dp.period_date, batch.period_date),
        keys.ma_kh,
        keys.branch_code,
        dp.ma_pgd,
        dp.ten_pgd,
        dp.ten_kh,
        dp.loai_khach_hang,
        COALESCE(dp.dp_record_count, 0),
        COALESCE(pf.so_du_tien_gui_ckh, 0),
        COALESCE(dp.doanh_so_cramt, 0),
        COALESCE(dp.doanh_so_dramt, 0),
        COALESCE(ln.so_du_tien_vay, 0),
        ln.loai_vay,
        COALESCE(pf.so_du_tgtt_binh_quan, 0),
        COALESCE(ln.thau_chi, 0),
        COALESCE(cn.tk_so_dep, 0),
        COALESCE(cn.agribank_plus, 0),
        COALESCE(cn.tin_nhan_ott, 0),
        COALESCE(cn.e_banking, 0),
        COALESCE(cn.sms_nhac_no_vay, 0),
        COALESCE(cn.sms_tien_gui, 0),
        COALESCE(cn.the_ghi_no_noi_dia, 0),
        COALESCE(cn.the_td_noi_dia, 0),
        COALESCE(cn.the_td_quoc_te, 0),
        COALESCE(cn.the_td_loc_viet, 0),
        ln.ma_cb,
        ln.ten_can_bo,
        ln.officer_employee_code,
        :job_id
    FROM keys
    LEFT JOIN dp ON dp.ma_kh = keys.ma_kh AND dp.branch_code = keys.branch_code
    LEFT JOIN ln ON ln.ma_kh = keys.ma_kh AND ln.branch_code = keys.branch_code
    LEFT JOIN pf ON pf.ma_kh = keys.ma_kh AND pf.branch_code = keys.branch_code
    LEFT JOIN cn ON cn.ma_kh = keys.ma_kh AND cn.branch_code = keys.branch_code
    LEFT JOIN import_batches batch ON batch.period_key = :period_key
    """
)


PROFILE_SQL = text(
    """
    WITH details AS (
        SELECT *
        FROM customer_period_branch_details
        WHERE period_key = :period_key
    ),
    detail_scored AS (
        SELECT
            details.*,
            (
                COALESCE(thau_chi, 0) +
                COALESCE(tk_so_dep, 0) +
                COALESCE(agribank_plus, 0) +
                COALESCE(tin_nhan_ott, 0) +
                COALESCE(e_banking, 0) +
                COALESCE(sms_nhac_no_vay, 0) +
                COALESCE(sms_tien_gui, 0) +
                COALESCE(the_ghi_no_noi_dia, 0) +
                COALESCE(the_td_noi_dia, 0) +
                COALESCE(the_td_quoc_te, 0) +
                COALESCE(the_td_loc_viet, 0) +
                COALESCE(bao_lanh, 0) +
                COALESCE(loa_bien_dong_so_du, 0) +
                COALESCE(phat_hanh_lc, 0)
            ) AS service_count,
            (
                COALESCE(so_du_tien_vay, 0) +
                COALESCE(so_du_tien_gui, 0) +
                COALESCE(so_du_tgtt_binh_quan, 0)
            ) AS financial_value,
            ROUND(
                (
                    (
                        COALESCE(so_du_tien_vay, 0) +
                        COALESCE(so_du_tien_gui, 0) +
                        COALESCE(so_du_tgtt_binh_quan, 0)
                    ) / 1000000.0 * 0.40
                )
                + (COALESCE(doanh_so_cramt, 0) / 1000000.0 * 0.20)
                + (
                    (
                        COALESCE(thau_chi, 0) +
                        COALESCE(tk_so_dep, 0) +
                        COALESCE(agribank_plus, 0) +
                        COALESCE(tin_nhan_ott, 0) +
                        COALESCE(e_banking, 0) +
                        COALESCE(sms_nhac_no_vay, 0) +
                        COALESCE(sms_tien_gui, 0) +
                        COALESCE(the_ghi_no_noi_dia, 0) +
                        COALESCE(the_td_noi_dia, 0) +
                        COALESCE(the_td_quoc_te, 0) +
                        COALESCE(the_td_loc_viet, 0) +
                        COALESCE(bao_lanh, 0) +
                        COALESCE(loa_bien_dong_so_du, 0) +
                        COALESCE(phat_hanh_lc, 0)
                    ) * 10 * 0.30
                )
                + (COALESCE(dp_record_count, 0) * 2 * 0.10),
                2
            ) AS engagement_score,
            CONCAT_WS(
                '; ',
                CASE WHEN COALESCE(so_du_tien_vay, 0) > 0 THEN 'Có dư nợ' END,
                CASE WHEN COALESCE(so_du_tien_gui, 0) > 0 THEN 'Có tiền gửi CKH' END,
                CASE WHEN COALESCE(so_du_tgtt_binh_quan, 0) > 0 THEN 'Có TGTT bình quân' END,
                CASE WHEN COALESCE(doanh_so_cramt, 0) > 0 THEN 'Có doanh số chuyển tiền về TK' END,
                CASE WHEN (
                    COALESCE(thau_chi, 0) +
                    COALESCE(tk_so_dep, 0) +
                    COALESCE(agribank_plus, 0) +
                    COALESCE(tin_nhan_ott, 0) +
                    COALESCE(e_banking, 0) +
                    COALESCE(sms_nhac_no_vay, 0) +
                    COALESCE(sms_tien_gui, 0) +
                    COALESCE(the_ghi_no_noi_dia, 0) +
                    COALESCE(the_td_noi_dia, 0) +
                    COALESCE(the_td_quoc_te, 0) +
                    COALESCE(the_td_loc_viet, 0) +
                    COALESCE(bao_lanh, 0) +
                    COALESCE(loa_bien_dong_so_du, 0) +
                    COALESCE(phat_hanh_lc, 0)
                ) > 0 THEN 'Có dịch vụ đang dùng' END
            ) AS engagement_reason
        FROM details
    ),
    detail_agg AS (
        SELECT
            ma_kh,
            MAX(period_date) AS period_date,
            MAX(ten_kh) AS ten_kh,
            MAX(loai_khach_hang) AS loai_khach_hang,
            string_agg(DISTINCT branch_code, ', ' ORDER BY branch_code) AS branch_codes,
            string_agg(DISTINCT CONCAT(branch_code, ':', COALESCE(ma_pgd, '')), ', ' ORDER BY CONCAT(branch_code, ':', COALESCE(ma_pgd, ''))) AS pgd_codes,
            COUNT(DISTINCT branch_code) AS branch_count,
            COUNT(DISTINCT CONCAT(branch_code, ':', COALESCE(ma_pgd, ''))) AS pgd_count,
            SUM(dp_record_count) AS dp_record_count,
            SUM(COALESCE(so_du_tien_gui, 0)) AS so_du_tien_gui,
            SUM(COALESCE(doanh_so_cramt, 0)) AS doanh_so_chuyen_tien_ve_tk,
            SUM(COALESCE(so_du_tien_vay, 0)) AS so_du_tien_vay,
            CONCAT_WS(
                '/',
                CASE WHEN MAX(CASE WHEN loai_vay LIKE '%Thấu chi%' THEN 1 ELSE 0 END) = 1 THEN 'Thấu chi' END,
                CASE WHEN MAX(CASE WHEN loai_vay LIKE '%Ngắn%' THEN 1 ELSE 0 END) = 1 THEN 'Ngắn' END,
                CASE WHEN MAX(CASE WHEN loai_vay LIKE '%Trung%' THEN 1 ELSE 0 END) = 1 THEN 'Trung' END,
                CASE WHEN MAX(CASE WHEN loai_vay LIKE '%Dài%' THEN 1 ELSE 0 END) = 1 THEN 'Dài' END
            ) AS loai_vay,
            SUM(COALESCE(so_du_tgtt_binh_quan, 0)) AS so_du_tgtt_binh_quan,
            MAX(thau_chi) AS thau_chi,
            MAX(tk_so_dep) AS tk_so_dep,
            MAX(agribank_plus) AS agribank_plus,
            MAX(tin_nhan_ott) AS tin_nhan_ott,
            MAX(e_banking) AS e_banking,
            MAX(sms_nhac_no_vay) AS sms_nhac_no_vay,
            MAX(sms_tien_gui) AS sms_tien_gui,
            MAX(the_ghi_no_noi_dia) AS the_ghi_no_noi_dia,
            MAX(the_td_noi_dia) AS the_td_noi_dia,
            MAX(the_td_quoc_te) AS the_td_quoc_te,
            MAX(the_td_loc_viet) AS the_td_loc_viet,
            MAX(bao_lanh) AS bao_lanh,
            MAX(loa_bien_dong_so_du) AS loa_bien_dong_so_du,
            MAX(phat_hanh_lc) AS phat_hanh_lc,
            jsonb_agg(
                jsonb_build_object(
                    'branch_code', branch_code,
                    'ma_pgd', ma_pgd,
                    'ten_pgd', ten_pgd,
                    'service_count', service_count,
                    'financial_value', financial_value,
                    'engagement_score', engagement_score,
                    'engagement_reason', engagement_reason,
                    'so_du_tien_gui', so_du_tien_gui,
                    'doanh_so_cramt', doanh_so_cramt,
                    'so_du_tien_vay', so_du_tien_vay,
                    'loai_vay', loai_vay,
                    'so_du_tgtt_binh_quan', so_du_tgtt_binh_quan,
                    'thau_chi', thau_chi,
                    'tk_so_dep', tk_so_dep,
                    'agribank_plus', agribank_plus,
                    'tin_nhan_ott', tin_nhan_ott,
                    'sms_nhac_no_vay', sms_nhac_no_vay,
                    'sms_tien_gui', sms_tien_gui,
                    'the_ghi_no_noi_dia', the_ghi_no_noi_dia,
                    'the_td_quoc_te', the_td_quoc_te,
                    'the_td_loc_viet', the_td_loc_viet,
                    'bao_lanh', bao_lanh,
                    'loa_bien_dong_so_du', loa_bien_dong_so_du,
                    'phat_hanh_lc', phat_hanh_lc,
                    'ma_cb', ma_cb,
                    'ten_can_bo', ten_can_bo,
                    'officer_employee_code', officer_employee_code
                )
                ORDER BY engagement_score DESC, financial_value DESC, service_count DESC, branch_code, ma_pgd
            ) AS branch_details
        FROM detail_scored
        GROUP BY ma_kh
    ),
    primary_location AS (
        SELECT DISTINCT ON (ma_kh)
            ma_kh,
            branch_code AS primary_branch_code,
            ma_pgd AS primary_pgd_code,
            ten_pgd AS primary_pgd_name,
            engagement_score AS primary_location_score,
            engagement_reason AS primary_location_reason
        FROM detail_scored
        ORDER BY
            ma_kh,
            engagement_score DESC,
            financial_value DESC,
            service_count DESC,
            dp_record_count DESC,
            branch_code,
            ma_pgd
    ),
    staff AS (
        SELECT
            ma_kh,
            MAX(employee_number) FILTER (WHERE employee_number IS NOT NULL) AS dp_ma_cb,
            MAX(employee_name) FILTER (WHERE employee_name IS NOT NULL) AS dp_ten_can_bo
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
        GROUP BY ma_kh
    ),
    loan_staff AS (
        SELECT ma_kh, ma_cb AS ln_ma_cb, ten_can_bo AS ln_ten_can_bo, officer_employee_code AS ln_officer_employee_code
        FROM (
            SELECT
                ma_kh,
                ma_cb,
                ten_can_bo,
                officer_employee_code,
                ROW_NUMBER() OVER (
                    PARTITION BY ma_kh
                    ORDER BY COALESCE(so_du_tien_vay, 0) DESC, ma_cb NULLS LAST, ten_can_bo NULLS LAST
                ) AS row_number
            FROM details
            WHERE ma_cb IS NOT NULL
        ) ranked
        WHERE row_number = 1
    ),
    phones AS (
        SELECT ma_kh, MAX(telephone) FILTER (WHERE telephone IS NOT NULL) AS telephone
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
        GROUP BY ma_kh
    )
    INSERT INTO customer_period_profiles (
        period_key,
        period_date,
        ma_kh,
        ten_kh,
        loai_khach_hang,
        branch_codes,
        pgd_codes,
        branch_count,
        pgd_count,
        dp_record_count,
        so_du_tien_gui,
        doanh_so_chuyen_tien_ve_tk,
        so_du_tien_vay,
        loai_vay,
        so_du_tgtt_binh_quan,
        thau_chi,
        tk_so_dep,
        agribank_plus,
        tin_nhan_ott,
        e_banking,
        sms_nhac_no_vay,
        sms_tien_gui,
        the_ghi_no_noi_dia,
        the_td_noi_dia,
        the_td_quoc_te,
        the_td_loc_viet,
        bao_lanh,
        loa_bien_dong_so_du,
        phat_hanh_lc,
        ma_cb,
        ten_can_bo,
        officer_employee_code,
        telephone,
        primary_branch_code,
        primary_pgd_code,
        primary_pgd_name,
        primary_location_score,
        primary_location_reason,
        branch_details,
        processing_job_id
    )
    SELECT
        :period_key,
        detail_agg.period_date,
        detail_agg.ma_kh,
        detail_agg.ten_kh,
        detail_agg.loai_khach_hang,
        detail_agg.branch_codes,
        detail_agg.pgd_codes,
        detail_agg.branch_count,
        detail_agg.pgd_count,
        detail_agg.dp_record_count,
        detail_agg.so_du_tien_gui,
        detail_agg.doanh_so_chuyen_tien_ve_tk,
        detail_agg.so_du_tien_vay,
        detail_agg.loai_vay,
        detail_agg.so_du_tgtt_binh_quan,
        detail_agg.thau_chi,
        detail_agg.tk_so_dep,
        detail_agg.agribank_plus,
        detail_agg.tin_nhan_ott,
        detail_agg.e_banking,
        detail_agg.sms_nhac_no_vay,
        detail_agg.sms_tien_gui,
        detail_agg.the_ghi_no_noi_dia,
        detail_agg.the_td_noi_dia,
        detail_agg.the_td_quoc_te,
        detail_agg.the_td_loc_viet,
        detail_agg.bao_lanh,
        detail_agg.loa_bien_dong_so_du,
        detail_agg.phat_hanh_lc,
        loan_staff.ln_ma_cb,
        loan_staff.ln_ten_can_bo,
        loan_staff.ln_officer_employee_code,
        phones.telephone,
        primary_location.primary_branch_code,
        primary_location.primary_pgd_code,
        primary_location.primary_pgd_name,
        primary_location.primary_location_score,
        primary_location.primary_location_reason,
        detail_agg.branch_details,
        :job_id
    FROM detail_agg
    LEFT JOIN loan_staff ON loan_staff.ma_kh = detail_agg.ma_kh
    LEFT JOIN phones ON phones.ma_kh = detail_agg.ma_kh
    LEFT JOIN primary_location ON primary_location.ma_kh = detail_agg.ma_kh
    """
)


SUPPLEMENT_BRANCH_UPDATE_SQL = text(
    """
    UPDATE customer_period_branch_details detail
    SET
        bao_lanh = CASE
            WHEN EXISTS (
                SELECT 1
                FROM supplemental_bao_lanh_records bao_lanh
                WHERE bao_lanh.period_key = detail.period_key
                    AND bao_lanh.ma_kh = detail.ma_kh
                    AND bao_lanh.branch_code = detail.branch_code
                    AND bao_lanh.is_bao_lanh = 1
            ) THEN 1 ELSE detail.bao_lanh END,
        phat_hanh_lc = CASE
            WHEN EXISTS (
                SELECT 1
                FROM supplemental_bao_lanh_records bao_lanh
                WHERE bao_lanh.period_key = detail.period_key
                    AND bao_lanh.ma_kh = detail.ma_kh
                    AND bao_lanh.branch_code = detail.branch_code
                    AND bao_lanh.is_lc = 1
            ) THEN 1 ELSE detail.phat_hanh_lc END,
        loa_bien_dong_so_du = CASE
            WHEN EXISTS (
                SELECT 1
                FROM supplemental_oab_records oab
                INNER JOIN dp01_deposit_accounts dp
                    ON dp.period_key = oab.period_key
                    AND TRIM(BOTH FROM REPLACE(COALESCE(dp.so_tai_khoan, ''), '''', '')) =
                        TRIM(BOTH FROM REPLACE(COALESCE(oab.tk_agribank, ''), '''', ''))
                WHERE oab.period_key = detail.period_key
                    AND dp.ma_kh = detail.ma_kh
                    AND dp.ma_cn = detail.branch_code
            ) THEN 1 ELSE detail.loa_bien_dong_so_du END
    WHERE detail.period_key = :period_key
    """
)


def clean_text(value) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value:
        return None
    if text_value.endswith(".0") and text_value[:-2].isdigit():
        text_value = text_value[:-2]
    return text_value.replace("'", "").strip() or None


def clean_customer_code(value) -> str | None:
    text_value = clean_text(value)
    if not text_value:
        return None
    return text_value.lstrip("`'").strip()


def parse_decimal_value(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, Decimal):
            return value
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        normalized = str(value).strip().replace(",", "")
        if not normalized:
            return None
        return Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None


def parse_date_value(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    text_value = str(value).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text_value, fmt).date()
        except ValueError:
            continue
    return None


def detect_optional_file_type(filename: str) -> str | None:
    normalized = filename.lower().replace(" ", "")
    if "baolanh" in normalized or "bao_lanh" in normalized:
        return "BAO_LANH"
    if "oab" in normalized or "loa" in normalized:
        return "OAB_LOA"
    return None


def excel_rows_from_xls(path: Path):
    import xlrd

    workbook = xlrd.open_workbook(str(path))
    sheet = workbook.sheet_by_index(0)
    for row_index in range(sheet.nrows):
        yield [sheet.cell_value(row_index, col_index) for col_index in range(sheet.ncols)]


def excel_rows_from_xlsx(path: Path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    try:
        for row in sheet.iter_rows(values_only=True):
            yield list(row)
    finally:
        workbook.close()


def parse_bao_lanh_file(db: Session, item: CustomerProcessingOptionalFile) -> int:
    file_path = Path(item.file_path)
    rows = excel_rows_from_xls(file_path) if file_path.suffix.lower() == ".xls" else excel_rows_from_xlsx(file_path)
    inserted = 0
    headers: list[str] | None = None
    batch: list[SupplementalBaoLanhRecord] = []

    for row in rows:
        if headers is None:
            headers = [str(cell or "").strip() for cell in row]
            continue
        values = {headers[index]: row[index] if index < len(row) else None for index in range(len(headers))}
        branch_code = clean_text(values.get("Ma_CN"))
        ma_kh = clean_customer_code(values.get("Ma_Kh"))
        loai_bllc = (clean_text(values.get("Loaibllc")) or "").upper()
        if not branch_code or not ma_kh:
            continue
        record = SupplementalBaoLanhRecord(
            optional_file_id=item.id,
            period_key=item.period_key,
            branch_code=branch_code,
            ma_kh=ma_kh,
            ma_kh_chuan=f"{branch_code}{ma_kh}",
            ten_kh=clean_text(values.get("Ten_KH")),
            tai_khoan=clean_text(values.get("Tai_Khoan")),
            so_hdbl=clean_text(values.get("So_HDBL")),
            ngay_bd=parse_date_value(values.get("Ngay_bd")),
            ngay_het_hl=parse_date_value(values.get("Ngayhethl")),
            loai_bllc=loai_bllc or None,
            tien_te=clean_text(values.get("tien_te")),
            nguyen_te=parse_decimal_value(values.get("Nguyete")),
            ty_gia=parse_decimal_value(values.get("Ty_gia")),
            vnd=parse_decimal_value(values.get("VND")),
            so_tien=parse_decimal_value(values.get("SoTien")),
            is_bao_lanh=1 if loai_bllc in BAO_LANH_CODES or loai_bllc.startswith("V") else 0,
            is_lc=1 if loai_bllc in BAO_LANH_LC_CODES else 0,
            raw_data={key: clean_text(value) for key, value in values.items()},
        )
        batch.append(record)
        inserted += 1
        if len(batch) >= 1000:
            db.add_all(batch)
            db.flush()
            batch = []

    if batch:
        db.add_all(batch)
        db.flush()
    return inserted


def parse_oab_file(db: Session, item: CustomerProcessingOptionalFile) -> int:
    file_path = Path(item.file_path)
    rows = excel_rows_from_xls(file_path) if file_path.suffix.lower() == ".xls" else excel_rows_from_xlsx(file_path)
    inserted = 0
    batch: list[SupplementalOABRecord] = []

    for row_index, row in enumerate(rows):
        if row_index < 1:
            continue
        branch_full = clean_text(row[3] if len(row) > 3 else None)
        ten_kh = clean_text(row[6] if len(row) > 6 else None)
        tk_agribank = clean_text(row[8] if len(row) > 8 else None)
        if not branch_full or not tk_agribank:
            continue
        branch_code = branch_full.split("-", 1)[0].strip()
        branch_name = branch_full.split("-", 1)[1].strip() if "-" in branch_full else branch_full
        record = SupplementalOABRecord(
            optional_file_id=item.id,
            period_key=item.period_key,
            branch_code=branch_code,
            branch_name=branch_name,
            provider=clean_text(row[4] if len(row) > 4 else None),
            ten_kh=ten_kh,
            tk_ao=clean_text(row[7] if len(row) > 7 else None),
            tk_agribank=tk_agribank,
            phone=clean_text(row[9] if len(row) > 9 else None),
            id_number=clean_text(row[10] if len(row) > 10 else None),
            raw_data={
                "ma": clean_text(row[1] if len(row) > 1 else None),
                "chi_nhanh": branch_full,
                "nha_cung_cap_loa": clean_text(row[4] if len(row) > 4 else None),
                "ten_kh": ten_kh,
                "tk_ao": clean_text(row[7] if len(row) > 7 else None),
                "tk_agribank": tk_agribank,
                "sdt": clean_text(row[9] if len(row) > 9 else None),
                "so_can_cuoc": clean_text(row[10] if len(row) > 10 else None),
            },
        )
        batch.append(record)
        inserted += 1
        if len(batch) >= 1000:
            db.add_all(batch)
            db.flush()
            batch = []

    if batch:
        db.add_all(batch)
        db.flush()
    return inserted


def load_supported_optional_files(db: Session, period_key: str) -> int:
    db.execute(delete(SupplementalBaoLanhRecord).where(SupplementalBaoLanhRecord.period_key == period_key))
    db.execute(delete(SupplementalOABRecord).where(SupplementalOABRecord.period_key == period_key))
    db.flush()

    total_rows = 0
    rows = (
        db.query(CustomerProcessingOptionalFile)
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .order_by(CustomerProcessingOptionalFile.uploaded_at)
        .all()
    )
    for item in rows:
        file_type = detect_optional_file_type(item.original_filename)
        if not file_type:
            continue
        try:
            if file_type == "BAO_LANH":
                total_rows += parse_bao_lanh_file(db, item)
            elif file_type == "OAB_LOA":
                total_rows += parse_oab_file(db, item)
            item.status = "ready"
            item.note = f"{item.note or ''}".strip()
        except Exception as exc:
            item.status = "error"
            item.note = f"Lỗi đọc file bổ sung: {exc}"
            raise
    return total_rows


def active_import_files_query(db: Session, period_key: str):
    return db.query(ImportFile).filter(
        ImportFile.period_key == period_key,
        ImportFile.status.notin_(["deleted", "replaced"]),
    )


def get_period_file_summary(db: Session, period_key: str) -> dict:
    files = active_import_files_query(db, period_key).all()
    success_by_type = {file_type: 0 for file_type in REQUIRED_FILE_TYPES}
    error_by_type = {file_type: 0 for file_type in REQUIRED_FILE_TYPES}
    processing_by_type = {file_type: 0 for file_type in REQUIRED_FILE_TYPES}

    for item in files:
        if item.file_type not in REQUIRED_FILE_TYPES:
            continue
        if item.status == "success":
            success_by_type[item.file_type] += 1
        elif item.status == "error":
            error_by_type[item.file_type] += 1
        elif item.status in {"queued", "processing", "deleting"}:
            processing_by_type[item.file_type] += 1

    optional_count = (
        db.query(func.count(CustomerProcessingOptionalFile.id))
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .scalar()
        or 0
    )
    available_required = sum(1 for file_type in REQUIRED_FILE_TYPES if success_by_type[file_type] > 0)
    return {
        "success_by_type": success_by_type,
        "error_by_type": error_by_type,
        "processing_by_type": processing_by_type,
        "required_file_count": len(REQUIRED_FILE_TYPES),
        "available_required_file_count": available_required,
        "total_file_count": len(files),
        "optional_file_count": optional_count,
        "is_ready": available_required == len(REQUIRED_FILE_TYPES),
    }


def update_job(db: Session, job: CustomerProcessingJob, status: str, stage: str, progress: int) -> None:
    job.status = status
    job.stage = stage
    job.progress_percent = progress
    db.commit()
    db.refresh(job)


def create_processing_job(db: Session, period_key: str) -> CustomerProcessingJob:
    summary = get_period_file_summary(db, period_key)
    if summary["success_by_type"]["DP01"] <= 0:
        raise ValueError("Kỳ dữ liệu chưa có file DP01 thành công để làm dữ liệu nền.")

    job = CustomerProcessingJob(
        period_key=period_key,
        status="queued",
        stage="Đã tạo job xử lý dữ liệu khách hàng",
        progress_percent=0,
        required_file_count=summary["required_file_count"],
        available_required_file_count=summary["available_required_file_count"],
        total_file_count=summary["total_file_count"],
        optional_file_count=summary["optional_file_count"],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def process_customer_period(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(CustomerProcessingJob).filter(CustomerProcessingJob.id == job_id).first()
        if not job:
            return
        db.execute(text(f"SET work_mem = '{settings.PROCESSING_WORK_MEM}'"))
        db.execute(text("SET temp_buffers = '64MB'"))

        update_job(db, job, "processing", "Kiểm tra dữ liệu nguồn theo kỳ", 8)
        summary = get_period_file_summary(db, job.period_key)
        job.available_required_file_count = summary["available_required_file_count"]
        job.total_file_count = summary["total_file_count"]
        job.optional_file_count = summary["optional_file_count"]
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        update_job(db, job, "processing", "Xóa kết quả xử lý cũ của kỳ dữ liệu", 18)
        db.execute(delete(CustomerPeriodProfile).where(CustomerPeriodProfile.period_key == job.period_key))
        db.execute(delete(CustomerPeriodBranchDetail).where(CustomerPeriodBranchDetail.period_key == job.period_key))
        db.execute(delete(CustomerPeriodExchangeRate).where(CustomerPeriodExchangeRate.period_key == job.period_key))
        db.commit()

        update_job(db, job, "processing", "Đọc file bổ sung Bảo lãnh/OAB nếu có", 24)
        load_supported_optional_files(db, job.period_key)
        db.commit()

        update_job(db, job, "processing", "Tạo bảng tỷ giá theo CCY từ DP01 trong kỳ", 30)
        db.execute(EXCHANGE_RATE_SQL, {"period_key": job.period_key})
        db.execute(DEFAULT_VND_RATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Đối chiếu DP01 với LN01, CN05, PF14 theo từng chi nhánh/PGD", 48)
        db.execute(BRANCH_DETAIL_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.commit()

        update_job(db, job, "processing", "Đối chiếu file bổ sung Bảo lãnh, LC và Loa theo khách hàng", 62)
        db.execute(SUPPLEMENT_BRANCH_UPDATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Gom khách hàng trùng MA_KH trên nhiều chi nhánh thành một hồ sơ", 78)
        db.execute(PROFILE_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.commit()

        total_customers = (
            db.query(func.count(CustomerPeriodProfile.id))
            .filter(CustomerPeriodProfile.period_key == job.period_key)
            .scalar()
            or 0
        )
        job.total_customers = total_customers
        job.processed_customers = total_customers
        job.status = "success"
        job.stage = "Hoàn thành xử lý dữ liệu khách hàng"
        job.progress_percent = 100
        job.finished_at = datetime.now(timezone.utc)
        batch = db.query(ImportBatch).filter(ImportBatch.period_key == job.period_key).first()
        if batch and batch.status == "needs_reprocess":
            batch.status = "active"
            batch.note = None
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.query(CustomerProcessingJob).filter(CustomerProcessingJob.id == job_id).first()
        if job:
            job.status = "error"
            job.stage = "Xử lý dữ liệu bị lỗi"
            job.error_message = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def save_optional_file(db: Session, period_key: str, upload_file: UploadFile, note: str | None = None) -> CustomerProcessingOptionalFile:
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    if not batch:
        raise ValueError("Kỳ dữ liệu chưa tồn tại trong kho dữ liệu.")

    suffix = Path(upload_file.filename).suffix.lower()
    if suffix not in {".csv", ".xlsx", ".xls"}:
        raise ValueError("File bổ sung chỉ hỗ trợ CSV hoặc Excel.")

    OPTIONAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload_file.filename).name
    stored_filename = f"{period_key}_OPTIONAL_{safe_name}"
    file_path = OPTIONAL_UPLOAD_DIR / stored_filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer, length=4 * 1024 * 1024)

    item = CustomerProcessingOptionalFile(
        period_key=period_key,
        original_filename=safe_name,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_ext=suffix.replace(".", ""),
        file_size=file_path.stat().st_size,
        status="uploaded",
        note=note,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
