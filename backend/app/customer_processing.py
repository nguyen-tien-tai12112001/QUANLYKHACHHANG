import shutil
import calendar
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import delete, func, text
from sqlalchemy.orm import Session
from openpyxl import load_workbook

from app.config import settings
from app.database import SessionLocal
from app.fee_rules import FEE_FIELDS, fee_aggregate_select_sql
from app.models import (
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    CustomerSourceReconciliation,
    ImportBatch,
    ImportFile,
    SupplementalBaoLanhRecord,
    SupplementalBillPaymentTransaction,
    SupplementalOABRecord,
    SupplementalPOSRecord,
)


OPTIONAL_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "optional"
REQUIRED_FILE_TYPES = ("DP01", "LN01", "CN05", "PF10", "PF14", "BC06", "BC29", "KH02", "FTPLN")
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


UPDATE_PROFILES_TRANSFER_INFLOW_SQL = text(
    """
    WITH current_bal AS MATERIALIZED (
        SELECT
            dp.ma_kh_chuan AS customer_key,
            SUM(
                CASE
                    WHEN COALESCE(dp.current_balance, 0) >= 0
                    THEN COALESCE(dp.current_balance, 0) * COALESCE(rate.exchange_rate, 1)
                    ELSE 0
                END
            ) AS total_balance
        FROM dp01_deposit_accounts dp
        LEFT JOIN customer_period_exchange_rates rate
            ON rate.period_key = dp.period_key
            AND rate.ccy = UPPER(TRIM(COALESCE(dp.ccy, 'VND')))
        WHERE dp.period_key = :period_key
            AND dp.ma_kh_chuan IS NOT NULL
        GROUP BY dp.ma_kh_chuan
    ),
    previous_bal AS MATERIALIZED (
        SELECT
            dp.ma_kh_chuan AS customer_key,
            SUM(
                CASE
                    WHEN COALESCE(dp.current_balance, 0) >= 0
                    THEN COALESCE(dp.current_balance, 0) * COALESCE(rate.exchange_rate, 1)
                    ELSE 0
                END
            ) AS total_balance
        FROM dp01_deposit_accounts dp
        LEFT JOIN customer_period_exchange_rates rate
            ON rate.period_key = dp.period_key
            AND rate.ccy = UPPER(TRIM(COALESCE(dp.ccy, 'VND')))
        WHERE dp.period_key = :previous_period_key
            AND dp.ma_kh_chuan IS NOT NULL
        GROUP BY dp.ma_kh_chuan
    )
    UPDATE customer_period_profiles profile
    SET doanh_so_chuyen_tien_ve_tk = CASE
        WHEN prev.customer_key IS NULL THEN 0
        ELSE GREATEST(0, COALESCE(curr.total_balance, 0) - COALESCE(prev.total_balance, 0))
    END
    FROM current_bal curr
    LEFT JOIN previous_bal prev ON prev.customer_key = curr.customer_key
    WHERE profile.period_key = :period_key
        AND profile.ma_kh = curr.customer_key
    """
)


UPDATE_SUMMARIES_TRANSFER_INFLOW_SQL = text(
    """
    WITH dp_balance AS (
        SELECT
            dp.period_key,
            COALESCE(NULLIF(TRIM(dp.ma_kh_chuan), ''), TRIM(dp.ma_kh)) AS customer_key,
            SUM(
                CASE
                    WHEN COALESCE(dp.current_balance, 0) >= 0
                    THEN COALESCE(dp.current_balance, 0) * COALESCE(rate.exchange_rate, 1)
                    ELSE 0
                END
            ) AS total_balance
        FROM dp01_deposit_accounts dp
        LEFT JOIN customer_period_exchange_rates rate
            ON rate.period_key = dp.period_key
            AND rate.ccy = UPPER(TRIM(COALESCE(dp.ccy, 'VND')))
        WHERE dp.period_key IN (:period_key, :previous_period_key)
            AND (dp.ma_kh IS NOT NULL OR dp.ma_kh_chuan IS NOT NULL)
        GROUP BY dp.period_key, COALESCE(NULLIF(TRIM(dp.ma_kh_chuan), ''), TRIM(dp.ma_kh))
    ),
    current_bal AS (
        SELECT customer_key, total_balance
        FROM dp_balance
        WHERE period_key = :period_key
    ),
    previous_bal AS (
        SELECT customer_key, total_balance
        FROM dp_balance
        WHERE period_key = :previous_period_key
    )
    UPDATE customer_period_summaries summary
    SET doanh_so_chuyen_tien_ve_tai_khoan = CASE
        WHEN prev.customer_key IS NULL THEN 0
        ELSE GREATEST(0, COALESCE(curr.total_balance, 0) - COALESCE(prev.total_balance, 0))
    END
    FROM current_bal curr
    LEFT JOIN previous_bal prev ON prev.customer_key = curr.customer_key
    WHERE summary.period_key = :period_key
        AND summary.ma_kh_chuan = curr.customer_key
    """
)


def get_previous_period_key(db: Session, period_key: str) -> str | None:
    row = (
        db.query(ImportBatch.period_key)
        .filter(ImportBatch.period_key < period_key)
        .order_by(ImportBatch.period_key.desc())
        .first()
    )
    return row[0] if row else None


def apply_transfer_inflow_to_profiles(db: Session, period_key: str) -> None:
    db.execute(text(f"SET LOCAL work_mem = '{settings.PROCESSING_WORK_MEM}'"))
    db.execute(
        text("""
            WITH gl AS (
                SELECT customer_code,
                       SUM(COALESCE(credit_amount, 0)) AS amount,
                       MAX(COALESCE(created_datetime, transaction_date::timestamp)) AS last_transaction_at
                FROM gl02_ledger_transactions tx
                WHERE tx.period_key = :period_key AND tx.account_code = '421101'
                  AND COALESCE(tx.transaction_type, 'Normal') = 'Normal'
                  AND tx.customer_code IS NOT NULL AND tx.customer_code <> '000000000'
                GROUP BY customer_code
            )
            UPDATE customer_period_profiles profile
            SET doanh_so_chuyen_tien_ve_tk = gl.amount,
                last_tktt_transaction_at = gl.last_transaction_at,
                tktt_inactive_days = GREATEST(0, profile.period_date - gl.last_transaction_at::date),
                tktt_activity_status = CASE
                    WHEN profile.period_date - gl.last_transaction_at::date <= 7 THEN 'active'
                    WHEN profile.period_date - gl.last_transaction_at::date <= 30 THEN 'low_activity'
                    ELSE 'inactive'
                END
            FROM gl WHERE profile.period_key = :period_key AND profile.ma_kh = gl.customer_code
        """),
        {"period_key": period_key},
    )


def apply_rr01_metrics_to_profiles(db: Session, period_key: str) -> None:
    db.execute(text("""
        WITH rr AS (
            SELECT customer_code,
                   SUM(COALESCE(current_principal, 0)) AS du_no_xlrr,
                   SUM(COALESCE(recovered_principal_period, 0) + COALESCE(recovered_interest_period, 0)) AS ds_thu_no_xlrr
            FROM rr01_handled_risk_loans src
            WHERE src.period_key = :period_key AND src.customer_code IS NOT NULL
            GROUP BY customer_code
        )
        UPDATE customer_period_profiles profile
        SET du_no_xlrr = rr.du_no_xlrr, ds_thu_no_xlrr = rr.ds_thu_no_xlrr
        FROM rr WHERE profile.period_key = :period_key AND profile.ma_kh = rr.customer_code
    """), {"period_key": period_key})


def apply_transfer_inflow_to_summaries(db: Session, period_key: str) -> None:
    db.execute(
        text("""
            WITH gl AS (
                SELECT customer_code, SUM(COALESCE(credit_amount, 0)) AS amount
                FROM gl02_ledger_transactions
                WHERE period_key = :period_key AND account_code = '421101'
                  AND COALESCE(transaction_type, 'Normal') = 'Normal'
                  AND customer_code IS NOT NULL AND customer_code <> '000000000'
                GROUP BY customer_code
            )
            UPDATE customer_period_summaries summary
            SET doanh_so_chuyen_tien_ve_tai_khoan = gl.amount
            FROM gl
            WHERE summary.period_key = :period_key
              AND (summary.ma_kh = gl.customer_code OR summary.ma_kh_chuan = gl.customer_code)
        """),
        {"period_key": period_key},
    )


BRANCH_DETAIL_SQL = text(
    """
    WITH cif AS (
        SELECT
            identifier.customer_core_code AS ma_kh,
            identifier.branch_code,
            identifier.customer_id,
            COALESCE(identifier.customer_name, customer.customer_name) AS ten_kh,
            COALESCE(identifier.customer_detail_type, customer.customer_detail_type,
                     identifier.customer_type, customer.customer_type) AS loai_khach_hang
        FROM cif_customer_identifiers identifier
        JOIN cif_customers customer ON customer.id = identifier.customer_id
        WHERE identifier.customer_core_code IS NOT NULL
          AND identifier.branch_code IS NOT NULL
    ),
    cif_master AS (
        SELECT id AS customer_id, customer_core_code AS ma_kh
        FROM cif_customers
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
            -- Số dư DP01 âm là dư nợ thấu chi, không phải tiền gửi. Phần này đã
            -- được ghi nhận ở LN01/PF10 nên tuyệt đối không cộng lại vào tiền gửi.
            SUM(CASE WHEN COALESCE(current_balance, 0) > 0 THEN current_balance ELSE 0 END) AS so_du_tien_gui,
            SUM(COALESCE(cramt, 0)) AS doanh_so_cramt,
            SUM(COALESCE(dramt, 0)) AS doanh_so_dramt
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
          AND COALESCE(current_balance, 0) >= 0
        GROUP BY period_key, ma_kh, ma_cn
    ),
    dp_staff AS (
        SELECT DISTINCT ON (deposit.ma_kh, deposit.ma_cn)
            deposit.ma_kh,
            deposit.ma_cn AS branch_code,
            COALESCE(users.credit_officer_code, users.employee_code) AS ma_cb,
            users.full_name AS ten_can_bo,
            users.employee_code AS officer_employee_code
        FROM dp01_deposit_accounts deposit
        JOIN system_users users
          ON users.is_active=true AND TRIM(users.employee_code)=TRIM(deposit.employee_number)
        JOIN org_branches branch
          ON branch.id=users.branch_id AND branch.branch_code=TRIM(deposit.ma_cn)
        WHERE deposit.period_key=:period_key
          AND deposit.ma_kh IS NOT NULL
          AND NULLIF(TRIM(deposit.employee_number), '') IS NOT NULL
          AND COALESCE(deposit.current_balance, 0) > 0
        ORDER BY deposit.ma_kh, deposit.ma_cn,
                 COALESCE(deposit.current_balance, 0) DESC, deposit.id
    ),
    valid_users AS (
        SELECT DISTINCT ON (TRIM(credit_officer_code))
            TRIM(credit_officer_code) AS credit_officer_code,
            full_name AS ten_can_bo,
            employee_code AS officer_employee_code
        FROM system_users
        WHERE credit_officer_code IS NOT NULL
            AND TRIM(credit_officer_code) <> ''
        ORDER BY TRIM(credit_officer_code), is_active DESC, full_name
    ),
    ln_base AS (
        SELECT
            loans.custseq AS ma_kh,
            loans.brcd AS branch_code,
            COALESCE(loans.du_no, 0) AS du_no,
            loans.loan_type,
            valid_users.credit_officer_code AS ma_cb,
            valid_users.ten_can_bo,
            valid_users.officer_employee_code,
            CASE WHEN loan_type = 'Thấu chi trên TK khách hàng' THEN 1 ELSE 0 END AS is_thau_chi,
            CASE WHEN loan_type = 'Vay ngắn hạn (TK 211)' THEN 1 ELSE 0 END AS is_ngan,
            CASE WHEN loan_type = 'Vay trung hạn (TK 212)' THEN 1 ELSE 0 END AS is_trung,
            CASE WHEN loan_type = 'Vay dài hạn (TK 213)' THEN 1 ELSE 0 END AS is_dai
        FROM ln01_loans loans
        LEFT JOIN valid_users
            ON valid_users.credit_officer_code = TRIM(COALESCE(loans.officer_id, ''))
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
    pf10 AS (
        SELECT
            customer_code AS ma_kh,
            branch_code,
            SUM(CASE WHEN loan_type = '100' THEN COALESCE(end_of_month_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_ngan_han,
            SUM(CASE WHEN loan_type = '100' THEN COALESCE(average_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_ngan_han_bq,
            SUM(CASE WHEN loan_type IN ('110', '120') THEN COALESCE(end_of_month_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_trung_dai_han,
            SUM(CASE WHEN loan_type IN ('110', '120') THEN COALESCE(average_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_trung_dai_han_bq,
            SUM(CASE WHEN loan_type = '241' THEN COALESCE(end_of_month_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_thau_chi,
            SUM(CASE WHEN loan_type = '241' THEN COALESCE(average_balance, 0) * COALESCE(rate.exchange_rate, CASE WHEN UPPER(TRIM(COALESCE(currency_code,'VND')))='VND' THEN 1 END) ELSE 0 END) AS du_no_thau_chi_bq,
            COUNT(DISTINCT account_number) AS pf10_lds_count,
            SUM(COALESCE(interest_amount, 0)) AS pf10_interest,
            SUM(COALESCE(accruals, 0)) AS pf10_accruals,
            SUM(COALESCE(book_correction_interest, 0)) AS pf10_book_correction_interest
        FROM pf10_loan_profitability p
        LEFT JOIN customer_period_exchange_rates rate
          ON rate.period_key=p.period_key AND rate.ccy=UPPER(TRIM(COALESCE(p.currency_code,'VND')))
        WHERE p.period_key = :period_key
          AND customer_code IS NOT NULL
          AND branch_code IS NOT NULL
        GROUP BY customer_code, branch_code
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
            MAX(CASE WHEN COALESCE(the_ghi_no_quoc_te, 0) > 0 THEN 1 ELSE 0 END) AS the_ghi_no_quoc_te,
            0 AS the_td_noi_dia,
            MAX(CASE WHEN COALESCE(the_tin_dung_quoc_te, 0) > 0 THEN 1 ELSE 0 END) AS the_td_quoc_te,
            MAX(CASE WHEN COALESCE(the_tin_dung_noi_dia, 0) > 0 THEN 1 ELSE 0 END) AS the_td_loc_viet
        FROM cn05_customer_services
        WHERE period_key = :period_key AND ma_kh IS NOT NULL
        GROUP BY ma_kh, ma_cn
    ),
    kh02 AS (
        SELECT
            TRIM(customer_code) AS ma_kh,
            TRIM(branch_code) AS branch_code
        FROM kh02_customer_transactions
        WHERE period_key = :period_key
          AND NULLIF(TRIM(customer_code), '') IS NOT NULL
          AND NULLIF(TRIM(branch_code), '') IS NOT NULL
        GROUP BY TRIM(customer_code), TRIM(branch_code)
    ),
    keys AS (
        SELECT ma_kh, branch_code FROM cif
        UNION SELECT ma_kh, branch_code FROM dp WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=dp.ma_kh)
        UNION SELECT ma_kh, branch_code FROM ln WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=ln.ma_kh)
        UNION SELECT ma_kh, branch_code FROM pf WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=pf.ma_kh)
        UNION SELECT ma_kh, branch_code FROM cn WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=cn.ma_kh)
        UNION SELECT ma_kh, branch_code FROM pf10 WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=pf10.ma_kh)
        UNION SELECT ma_kh, branch_code FROM kh02 WHERE EXISTS (SELECT 1 FROM cif WHERE cif.ma_kh=kh02.ma_kh)
    )
    INSERT INTO customer_period_branch_details (
        period_key,
        period_date,
        customer_id,
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
        du_no_ngan_han,
        du_no_ngan_han_bq,
        du_no_trung_dai_han,
        du_no_trung_dai_han_bq,
        du_no_thau_chi,
        du_no_thau_chi_bq,
        pf10_lds_count,
        pf10_interest,
        pf10_accruals,
        pf10_book_correction_interest,
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
        the_ghi_no_quoc_te,
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
        cif_master.customer_id,
        keys.ma_kh,
        keys.branch_code,
        dp.ma_pgd,
        dp.ten_pgd,
        COALESCE(cif.ten_kh, dp.ten_kh),
        COALESCE(cif.loai_khach_hang, dp.loai_khach_hang),
        COALESCE(dp.dp_record_count, 0),
        COALESCE(pf.so_du_tien_gui_ckh, 0),
        COALESCE(dp.doanh_so_cramt, 0),
        COALESCE(dp.doanh_so_dramt, 0),
        COALESCE(ln.so_du_tien_vay, 0),
        COALESCE(pf10.du_no_ngan_han, 0),
        COALESCE(pf10.du_no_ngan_han_bq, 0),
        COALESCE(pf10.du_no_trung_dai_han, 0),
        COALESCE(pf10.du_no_trung_dai_han_bq, 0),
        COALESCE(pf10.du_no_thau_chi, 0),
        COALESCE(pf10.du_no_thau_chi_bq, 0),
        COALESCE(pf10.pf10_lds_count, 0),
        COALESCE(pf10.pf10_interest, 0),
        COALESCE(pf10.pf10_accruals, 0),
        COALESCE(pf10.pf10_book_correction_interest, 0),
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
        COALESCE(cn.the_ghi_no_quoc_te, 0),
        COALESCE(cn.the_td_noi_dia, 0),
        COALESCE(cn.the_td_quoc_te, 0),
        COALESCE(cn.the_td_loc_viet, 0),
        COALESCE(ln.ma_cb, dp_staff.ma_cb),
        COALESCE(ln.ten_can_bo, dp_staff.ten_can_bo),
        COALESCE(ln.officer_employee_code, dp_staff.officer_employee_code),
        :job_id
    FROM keys
    JOIN cif_master ON cif_master.ma_kh = keys.ma_kh
    LEFT JOIN cif ON cif.ma_kh = keys.ma_kh AND cif.branch_code = keys.branch_code
    LEFT JOIN dp ON dp.ma_kh = keys.ma_kh AND dp.branch_code = keys.branch_code
    LEFT JOIN dp_staff ON dp_staff.ma_kh = keys.ma_kh AND dp_staff.branch_code = keys.branch_code
    LEFT JOIN ln ON ln.ma_kh = keys.ma_kh AND ln.branch_code = keys.branch_code
    LEFT JOIN pf10 ON pf10.ma_kh = keys.ma_kh AND pf10.branch_code = keys.branch_code
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
                COALESCE(the_ghi_no_quoc_te, 0) +
                COALESCE(the_td_noi_dia, 0) +
                COALESCE(the_td_quoc_te, 0) +
                COALESCE(the_td_loc_viet, 0) +
                COALESCE(bao_lanh, 0) +
                COALESCE(loa_bien_dong_so_du, 0) +
                COALESCE(phat_hanh_lc, 0) +
                COALESCE(pos, 0)
            ) AS service_count,
            (
                GREATEST(
                    COALESCE(so_du_tien_vay, 0),
                    COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
                ) +
                COALESCE(so_du_tien_gui, 0) +
                COALESCE(so_du_tgtt_binh_quan, 0)
            ) AS financial_value,
            ROUND(
                (
                    (
                        GREATEST(
                            COALESCE(so_du_tien_vay, 0),
                            COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
                        ) +
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
                        COALESCE(the_ghi_no_quoc_te, 0) +
                        COALESCE(the_td_noi_dia, 0) +
                        COALESCE(the_td_quoc_te, 0) +
                        COALESCE(the_td_loc_viet, 0) +
                        COALESCE(bao_lanh, 0) +
                        COALESCE(loa_bien_dong_so_du, 0) +
                        COALESCE(phat_hanh_lc, 0) +
                        COALESCE(pos, 0)
                    ) * 10 * 0.30
                )
                + (COALESCE(dp_record_count, 0) * 2 * 0.10),
                2
            ) AS engagement_score,
            CONCAT_WS(
                '; ',
                CASE WHEN GREATEST(
                    COALESCE(so_du_tien_vay, 0),
                    COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
                ) > 0 THEN 'Có dư nợ' END,
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
                    COALESCE(the_ghi_no_quoc_te, 0) +
                    COALESCE(the_td_noi_dia, 0) +
                    COALESCE(the_td_quoc_te, 0) +
                    COALESCE(the_td_loc_viet, 0) +
                    COALESCE(bao_lanh, 0) +
                    COALESCE(loa_bien_dong_so_du, 0) +
                    COALESCE(phat_hanh_lc, 0) +
                    COALESCE(pos, 0)
                ) > 0 THEN 'Có dịch vụ đang dùng' END
            ) AS engagement_reason
        FROM details
    ),
    detail_agg AS (
        SELECT
            ma_kh,
            MAX(customer_id) AS customer_id,
            MAX(period_date) AS period_date,
            MAX(ten_kh) AS ten_kh,
            MAX(loai_khach_hang) AS loai_khach_hang,
            string_agg(DISTINCT branch_code, ', ' ORDER BY branch_code) AS branch_codes,
            string_agg(DISTINCT CONCAT(branch_code, ':', COALESCE(ma_pgd, '')), ', ' ORDER BY CONCAT(branch_code, ':', COALESCE(ma_pgd, ''))) AS pgd_codes,
            COUNT(DISTINCT branch_code) AS branch_count,
            COUNT(DISTINCT CONCAT(branch_code, ':', COALESCE(ma_pgd, ''))) AS pgd_count,
            SUM(dp_record_count) AS dp_record_count,
            SUM(COALESCE(so_du_tien_gui, 0)) AS so_du_tien_gui,
            0 AS doanh_so_chuyen_tien_ve_tk,
            SUM(COALESCE(so_du_tien_vay, 0)) AS so_du_tien_vay,
            SUM(COALESCE(du_no_ngan_han, 0)) AS du_no_ngan_han,
            SUM(COALESCE(du_no_ngan_han_bq, 0)) AS du_no_ngan_han_bq,
            SUM(COALESCE(du_no_trung_dai_han, 0)) AS du_no_trung_dai_han,
            SUM(COALESCE(du_no_trung_dai_han_bq, 0)) AS du_no_trung_dai_han_bq,
            SUM(COALESCE(du_no_thau_chi, 0)) AS du_no_thau_chi,
            SUM(COALESCE(du_no_thau_chi_bq, 0)) AS du_no_thau_chi_bq,
            SUM(COALESCE(pf10_lds_count, 0)) AS pf10_lds_count,
            SUM(COALESCE(pf10_interest, 0)) AS pf10_interest,
            SUM(COALESCE(pf10_accruals, 0)) AS pf10_accruals,
            SUM(COALESCE(pf10_book_correction_interest, 0)) AS pf10_book_correction_interest,
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
            MAX(the_ghi_no_quoc_te) AS the_ghi_no_quoc_te,
            MAX(the_td_noi_dia) AS the_td_noi_dia,
            MAX(the_td_quoc_te) AS the_td_quoc_te,
            MAX(the_td_loc_viet) AS the_td_loc_viet,
            MAX(bao_lanh) AS bao_lanh,
            MAX(loa_bien_dong_so_du) AS loa_bien_dong_so_du,
            MAX(phat_hanh_lc) AS phat_hanh_lc,
            MAX(pos) AS pos,
            SUM(COALESCE(so_thiet_bi_pos, 0)) AS so_thiet_bi_pos,
            MAX(pos_moi) AS pos_moi,
            MAX(pos_khong_hoat_dong) AS pos_khong_hoat_dong,
            MAX(pos_ngung_hoat_dong) AS pos_ngung_hoat_dong,
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
                    'du_no_ngan_han', du_no_ngan_han,
                    'du_no_ngan_han_bq', du_no_ngan_han_bq,
                    'du_no_trung_dai_han', du_no_trung_dai_han,
                    'du_no_trung_dai_han_bq', du_no_trung_dai_han_bq,
                    'du_no_thau_chi', du_no_thau_chi,
                    'du_no_thau_chi_bq', du_no_thau_chi_bq,
                    'pf10_lds_count', pf10_lds_count,
                    'pf10_interest', pf10_interest,
                    'pf10_accruals', pf10_accruals,
                    'pf10_book_correction_interest', pf10_book_correction_interest,
                    'loai_vay', loai_vay,
                    'so_du_tgtt_binh_quan', so_du_tgtt_binh_quan,
                    'thau_chi', thau_chi,
                    'tk_so_dep', tk_so_dep,
                    'agribank_plus', agribank_plus,
                    'tin_nhan_ott', tin_nhan_ott,
                    'sms_nhac_no_vay', sms_nhac_no_vay,
                    'sms_tien_gui', sms_tien_gui,
                    'the_ghi_no_noi_dia', the_ghi_no_noi_dia,
                    'the_ghi_no_quoc_te', the_ghi_no_quoc_te,
                    'the_td_quoc_te', the_td_quoc_te,
                    'the_td_loc_viet', the_td_loc_viet,
                    'bao_lanh', bao_lanh,
                    'loa_bien_dong_so_du', loa_bien_dong_so_du,
                    'phat_hanh_lc', phat_hanh_lc,
                    'pos', pos,
                    'so_thiet_bi_pos', so_thiet_bi_pos,
                    'pos_moi', pos_moi,
                    'pos_khong_hoat_dong', pos_khong_hoat_dong,
                    'pos_ngung_hoat_dong', pos_ngung_hoat_dong,
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
            CASE
                WHEN GREATEST(
                    COALESCE(so_du_tien_vay, 0),
                    COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
                ) > 0 THEN 'LOAN_BALANCE'
                WHEN COALESCE(so_du_tien_gui, 0) > 0 THEN 'TERM_DEPOSIT_BALANCE'
                WHEN COALESCE(so_du_tgtt_binh_quan, 0) > 0 THEN 'CASA_AVERAGE_BALANCE'
                WHEN COALESCE(doanh_so_cramt, 0) > 0 THEN 'PAYMENT_TURNOVER'
                WHEN COALESCE(service_count, 0) > 0 THEN 'SERVICE_RELATION'
                ELSE 'CIF_BRANCH'
            END AS primary_location_source,
            engagement_score AS primary_location_score,
            engagement_reason AS primary_location_reason
        FROM detail_scored
        ORDER BY
            ma_kh,
            -- Quan hệ tín dụng được ưu tiên tuyệt đối trước tiền gửi. Dùng
            -- GREATEST để hỗ trợ cả LN01 và PF10 mà không cộng trùng dư nợ.
            CASE WHEN GREATEST(
                COALESCE(so_du_tien_vay, 0),
                COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
            ) > 0 THEN 1 ELSE 0 END DESC,
            GREATEST(
                COALESCE(so_du_tien_vay, 0),
                COALESCE(du_no_ngan_han, 0) + COALESCE(du_no_trung_dai_han, 0) + COALESCE(du_no_thau_chi, 0)
            ) DESC,
            COALESCE(so_du_tien_gui, 0) DESC,
            COALESCE(so_du_tgtt_binh_quan, 0) DESC,
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
    primary_staff AS (
        SELECT DISTINCT ON (location.ma_kh)
            location.ma_kh,
            detail.ma_cb,
            detail.ten_can_bo,
            detail.officer_employee_code
        FROM primary_location location
        LEFT JOIN details detail
          ON detail.ma_kh=location.ma_kh
         AND detail.branch_code=location.primary_branch_code
        ORDER BY
            location.ma_kh,
            CASE WHEN NULLIF(TRIM(detail.ma_cb), '') IS NOT NULL
                       OR NULLIF(TRIM(detail.officer_employee_code), '') IS NOT NULL THEN 0 ELSE 1 END,
            GREATEST(
                COALESCE(detail.so_du_tien_vay, 0),
                COALESCE(detail.du_no_ngan_han, 0)
                  + COALESCE(detail.du_no_trung_dai_han, 0)
                  + COALESCE(detail.du_no_thau_chi, 0)
            ) DESC,
            COALESCE(detail.so_du_tien_gui, 0) DESC,
            detail.ma_pgd NULLS LAST
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
        customer_id,
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
        du_no_ngan_han,
        du_no_ngan_han_bq,
        du_no_trung_dai_han,
        du_no_trung_dai_han_bq,
        du_no_thau_chi,
        du_no_thau_chi_bq,
        pf10_lds_count,
        pf10_interest,
        pf10_accruals,
        pf10_book_correction_interest,
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
        the_ghi_no_quoc_te,
        the_td_noi_dia,
        the_td_quoc_te,
        the_td_loc_viet,
        bao_lanh,
        loa_bien_dong_so_du,
        phat_hanh_lc,
        pos,
        so_thiet_bi_pos,
        pos_moi,
        pos_khong_hoat_dong,
        pos_ngung_hoat_dong,
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
        ten_chu_doanh_nghiep, so_cccd, ma_so_thue, ngay_thanh_lap,
        dia_chi, gioi_tinh, ngay_sinh, nghe_nghiep,
        management_source, managing_branch_code,
        managing_department_code, managing_department_name,
        processing_job_id
    )
    SELECT
        :period_key,
        detail_agg.period_date,
        detail_agg.customer_id,
        detail_agg.ma_kh,
        COALESCE(enrichment.ten_kh, detail_agg.ten_kh),
        COALESCE(enrichment.loai_khach_hang, detail_agg.loai_khach_hang),
        detail_agg.branch_codes,
        detail_agg.pgd_codes,
        detail_agg.branch_count,
        detail_agg.pgd_count,
        detail_agg.dp_record_count,
        detail_agg.so_du_tien_gui,
        detail_agg.doanh_so_chuyen_tien_ve_tk,
        detail_agg.so_du_tien_vay,
        detail_agg.du_no_ngan_han,
        detail_agg.du_no_ngan_han_bq,
        detail_agg.du_no_trung_dai_han,
        detail_agg.du_no_trung_dai_han_bq,
        detail_agg.du_no_thau_chi,
        detail_agg.du_no_thau_chi_bq,
        detail_agg.pf10_lds_count,
        detail_agg.pf10_interest,
        detail_agg.pf10_accruals,
        detail_agg.pf10_book_correction_interest,
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
        detail_agg.the_ghi_no_quoc_te,
        detail_agg.the_td_noi_dia,
        detail_agg.the_td_quoc_te,
        detail_agg.the_td_loc_viet,
        detail_agg.bao_lanh,
        detail_agg.loa_bien_dong_so_du,
        detail_agg.phat_hanh_lc,
        detail_agg.pos,
        detail_agg.so_thiet_bi_pos,
        detail_agg.pos_moi,
        detail_agg.pos_khong_hoat_dong,
        detail_agg.pos_ngung_hoat_dong,
        COALESCE(enrichment.ma_cb, primary_staff.ma_cb),
        COALESCE(enrichment.ten_can_bo, primary_staff.ten_can_bo),
        COALESCE(enrichment.officer_employee_code, primary_staff.officer_employee_code),
        COALESCE(enrichment.telephone, phones.telephone),
        COALESCE(enrichment.primary_branch_code, primary_location.primary_branch_code),
        COALESCE(enrichment.primary_pgd_code, primary_location.primary_pgd_code),
        COALESCE(enrichment.primary_pgd_name, primary_location.primary_pgd_name),
        primary_location.primary_location_score,
        primary_location.primary_location_reason,
        detail_agg.branch_details,
        enrichment.ten_chu_doanh_nghiep,
        enrichment.so_cccd,
        enrichment.ma_so_thue,
        enrichment.ngay_thanh_lap,
        enrichment.dia_chi,
        enrichment.gioi_tinh,
        enrichment.ngay_sinh,
        enrichment.nghe_nghiep,
        COALESCE(enrichment.management_source, primary_location.primary_location_source),
        COALESCE(enrichment.managing_branch_code, primary_location.primary_branch_code),
        enrichment.managing_department_code,
        enrichment.managing_department_name,
        :job_id
    FROM detail_agg
    LEFT JOIN tmp_profile_enrichment enrichment ON enrichment.customer_id=detail_agg.customer_id
    LEFT JOIN primary_staff ON primary_staff.ma_kh = detail_agg.ma_kh
    LEFT JOIN phones ON phones.ma_kh = detail_agg.ma_kh
    LEFT JOIN primary_location ON primary_location.ma_kh = detail_agg.ma_kh
    """
)


# A CIF customer is the processing population for every period. Some valid CIF
# records can temporarily have no usable branch identifier (for example while a
# conflict is waiting for review). They must still be visible in C360 instead of
# silently disappearing from the processed population.
MISSING_CIF_PROFILE_SQL = text(
    """
    INSERT INTO customer_period_profiles (
        period_key, period_date, customer_id, ma_kh, ten_kh, loai_khach_hang,
        ten_chu_doanh_nghiep, so_cccd, ma_so_thue, ngay_thanh_lap, dia_chi,
        gioi_tinh, ngay_sinh, nghe_nghiep, management_source,
        managing_branch_code, managing_department_code, managing_department_name,
        ma_cb, officer_employee_code, ten_can_bo, telephone,
        primary_branch_code, primary_pgd_code, primary_pgd_name,
        processing_job_id
    )
    SELECT
        :period_key, batch.period_date, c.id, c.customer_core_code,
        e.ten_kh, e.loai_khach_hang, e.ten_chu_doanh_nghiep, e.so_cccd,
        e.ma_so_thue, e.ngay_thanh_lap, e.dia_chi, e.gioi_tinh, e.ngay_sinh,
        e.nghe_nghiep, e.management_source, e.managing_branch_code,
        e.managing_department_code, e.managing_department_name, e.ma_cb,
        e.officer_employee_code, e.ten_can_bo, e.telephone,
        e.primary_branch_code, e.primary_pgd_code, e.primary_pgd_name, :job_id
    FROM cif_customers c
    JOIN import_batches batch ON batch.period_key=:period_key
    LEFT JOIN tmp_profile_enrichment e ON e.customer_id=c.id
    LEFT JOIN customer_period_profiles p
      ON p.period_key=:period_key AND p.ma_kh=c.customer_core_code
    WHERE p.id IS NULL
    ON CONFLICT (period_key, ma_kh) DO NOTHING
    """
)


def validate_processed_period(db: Session, period_key: str) -> dict:
    """Run non-negotiable customer-level integrity checks before publishing a job."""
    row = db.execute(text("""
        SELECT
          (SELECT count(*) FROM cif_customers) AS cif_count,
          count(*) AS profile_count,
          count(DISTINCT p.ma_kh) AS unique_customer_count,
          count(*) FILTER (WHERE NULLIF(TRIM(p.ma_kh),'') IS NULL) AS blank_customer_codes,
          count(*) FILTER (WHERE c.id IS NULL) AS customers_not_in_cif,
          count(*) FILTER (WHERE p.customer_id IS DISTINCT FROM c.id) AS wrong_customer_links
        FROM customer_period_profiles p
        LEFT JOIN cif_customers c ON c.customer_core_code=p.ma_kh
        WHERE p.period_key=:period_key
    """), {"period_key": period_key}).mappings().one()
    report = {key: int(value or 0) for key, value in row.items()}
    report["duplicate_customer_codes"] = report["profile_count"] - report["unique_customer_count"]
    validation_fee_select = fee_aggregate_select_sql(
        account_column="trim(k.account_code)",
        amount_sql="coalesce(k.credit_amount,0)-coalesce(k.debit_amount,0)",
    )
    expected_fee_columns = ",\n".join(
        f"COALESCE(f.{field},0) AS {field}" for field in FEE_FIELDS
    )
    actual_fee_columns = ",\n".join(
        f"COALESCE(sum({field}),0) AS {field}" for field in FEE_FIELDS
    )
    totals = db.execute(text(f"""
        WITH fee_expected AS (
          SELECT {validation_fee_select}
          FROM kh02_customer_transactions k
          JOIN cif_customers c ON c.customer_core_code=TRIM(k.customer_code)
          WHERE k.period_key=:period_key
        ), expected AS (
          SELECT
            (SELECT COALESCE(sum(l.du_no),0) FROM ln01_loans l JOIN cif_customers c ON c.customer_core_code=TRIM(l.custseq) WHERE l.period_key=:period_key) AS so_du_tien_vay,
            (SELECT COALESCE(sum(customer_amount),0) FROM (
               SELECT CAST(sum(CASE WHEN p.monterm>0 THEN p.monthlyendbalance*COALESCE(r.exchange_rate,1) ELSE 0 END) AS numeric(20,2)) customer_amount
               FROM pf14_account_balances p JOIN cif_customers c ON c.customer_core_code=TRIM(BOTH FROM REPLACE(COALESCE(p.custseq,''),'''',''))
               LEFT JOIN customer_period_exchange_rates r ON r.period_key=p.period_key AND r.ccy=UPPER(TRIM(COALESCE(p.ccy,'VND')))
               WHERE p.period_key=:period_key GROUP BY c.customer_core_code
             ) customer_totals) AS so_du_tien_gui,
            (SELECT COALESCE(sum(customer_amount),0) FROM (
               SELECT CAST(sum(CASE WHEN p.monterm=0 THEN p.averagebalance*COALESCE(r.exchange_rate,1) ELSE 0 END) AS numeric(20,2)) customer_amount
               FROM pf14_account_balances p JOIN cif_customers c ON c.customer_core_code=TRIM(BOTH FROM REPLACE(COALESCE(p.custseq,''),'''',''))
               LEFT JOIN customer_period_exchange_rates r ON r.period_key=p.period_key AND r.ccy=UPPER(TRIM(COALESCE(p.ccy,'VND')))
               WHERE p.period_key=:period_key GROUP BY c.customer_core_code
             ) customer_totals) AS so_du_tgtt_binh_quan,
            {expected_fee_columns},
            (SELECT COALESCE(sum(r.current_principal),0) FROM rr01_handled_risk_loans r JOIN cif_customers c ON c.customer_core_code=TRIM(r.customer_code) WHERE r.period_key=:period_key) AS du_no_xlrr,
            (SELECT COALESCE(sum(COALESCE(r.recovered_principal_period,0)+COALESCE(r.recovered_interest_period,0)),0) FROM rr01_handled_risk_loans r JOIN cif_customers c ON c.customer_core_code=TRIM(r.customer_code) WHERE r.period_key=:period_key) AS ds_thu_no_xlrr,
            (SELECT COALESCE(sum(g.credit_amount),0) FROM gl02_ledger_transactions g JOIN cif_customers c ON c.customer_core_code=TRIM(g.customer_code)
               WHERE g.period_key=:period_key AND g.account_code='421101' AND COALESCE(g.transaction_type,'Normal')='Normal' AND g.customer_code<>'000000000') AS doanh_so_chuyen_tien_ve_tk
          FROM fee_expected f
        ), actual AS (
          SELECT COALESCE(sum(so_du_tien_vay),0) so_du_tien_vay,
                 COALESCE(sum(so_du_tien_gui),0) so_du_tien_gui,
                 COALESCE(sum(so_du_tgtt_binh_quan),0) so_du_tgtt_binh_quan,
                 {actual_fee_columns},
                 COALESCE(sum(du_no_xlrr),0) du_no_xlrr,
                 COALESCE(sum(ds_thu_no_xlrr),0) ds_thu_no_xlrr,
                 COALESCE(sum(doanh_so_chuyen_tien_ve_tk),0) doanh_so_chuyen_tien_ve_tk
          FROM customer_period_profiles WHERE period_key=:period_key
        )
        SELECT to_jsonb(expected) expected, to_jsonb(actual) actual FROM expected,actual
    """), {"period_key": period_key}).mappings().one()
    expected_totals = totals["expected"] or {}
    actual_totals = totals["actual"] or {}
    metric_checks = []
    for code, expected in expected_totals.items():
        actual = actual_totals.get(code, 0)
        difference = Decimal(str(actual or 0)) - Decimal(str(expected or 0))
        metric_checks.append({
            "code": code,
            "expected": float(expected or 0),
            "actual": float(actual or 0),
            "difference": float(difference),
            "passed": abs(difference) <= Decimal("0.01"),
        })
    report["metric_checks"] = metric_checks
    report["metric_mismatch_count"] = sum(1 for item in metric_checks if not item["passed"])
    report["is_valid"] = all((
        report["profile_count"] == report["cif_count"],
        report["duplicate_customer_codes"] == 0,
        report["blank_customer_codes"] == 0,
        report["customers_not_in_cif"] == 0,
        report["wrong_customer_links"] == 0,
        report["metric_mismatch_count"] == 0,
    ))
    return report


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


POS_BRANCH_UPDATE_SQL = text(
    """
    WITH matched_rows AS (
        SELECT DISTINCT
            pos.id AS pos_id,
            dp.ma_kh,
            COALESCE(dp.ma_cn, dp.branch_code) AS branch_code,
            pos.terminal_count,
            pos.is_new,
            pos.is_inactive,
            pos.is_discontinued
        FROM supplemental_pos_records pos
        JOIN dp01_deposit_accounts dp
          ON dp.period_key = pos.period_key
         AND dp.so_tai_khoan = pos.settlement_account
        WHERE pos.period_key = :period_key
          AND pos.settlement_account IS NOT NULL
          AND dp.ma_kh IS NOT NULL
    ), flags AS (
        SELECT
            ma_kh,
            branch_code,
            MAX(CASE WHEN is_discontinued = 0 THEN 1 ELSE 0 END) AS pos,
            SUM(CASE WHEN is_discontinued = 0 THEN terminal_count ELSE 0 END) AS so_thiet_bi_pos,
            MAX(CASE WHEN is_discontinued = 0 THEN is_new ELSE 0 END) AS pos_moi,
            MAX(CASE WHEN is_discontinued = 0 THEN is_inactive ELSE 0 END) AS pos_khong_hoat_dong,
            MAX(is_discontinued) AS pos_ngung_hoat_dong
        FROM matched_rows
        GROUP BY ma_kh, branch_code
    )
    UPDATE customer_period_branch_details detail SET
        pos = flags.pos,
        so_thiet_bi_pos = flags.so_thiet_bi_pos,
        pos_moi = flags.pos_moi,
        pos_khong_hoat_dong = flags.pos_khong_hoat_dong,
        pos_ngung_hoat_dong = flags.pos_ngung_hoat_dong
    FROM flags
    WHERE detail.period_key = :period_key
      AND detail.ma_kh = flags.ma_kh
      AND detail.branch_code = flags.branch_code
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
    if "list_transaction" in normalized or "billpayment" in normalized or "bill_payment" in normalized:
        return "BILLPAYMENT"
    ascii_name = unicodedata.normalize("NFKD", filename)
    ascii_name = "".join(char for char in ascii_name if not unicodedata.combining(char)).lower()
    if re.search(r"(^|[^a-z0-9])pos([^a-z0-9]|$)", ascii_name):
        return "POS"
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
        # Một số báo cáo xuất từ hệ thống khai báo sai vùng sử dụng A1:A1 dù
        # thực tế có hàng chục nghìn dòng; reset để openpyxl quét đúng dữ liệu.
        sheet.reset_dimensions()
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

    def normalize_oab_header(value) -> str:
        normalized = unicodedata.normalize("NFKD", str(value or "").strip())
        without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
        without_accents = without_accents.replace("Đ", "D").replace("đ", "d")
        return re.sub(r"[^A-Z0-9]+", "_", without_accents.upper()).strip("_")

    header_aliases = {
        "ma": {"MA", "STT"},
        "branch": {"CHI_NHANH", "DON_VI", "BRANCH"},
        "provider": {"NHA_CUNG_CAP_LOA", "NHA_CUNG_CAP", "PROVIDER"},
        "customer_name": {"TEN_KH", "TEN_KHACH_HANG", "CUSTOMER_NAME"},
        "virtual_account": {"TK_AO", "SO_TK_AO", "TAI_KHOAN_AO"},
        "agribank_account": {
            "TK_AGRIBANK",
            "SO_TK_AGRIBANK",
            "TAI_KHOAN_AGRIBANK",
            "TK_MO_TAI_NGAN_HANG",
            "TAI_KHOAN_MO_TAI_NGAN_HANG",
        },
        "phone": {"SDT", "SO_DIEN_THOAI", "DIEN_THOAI", "PHONE"},
        "id_number": {"SO_CAN_CUOC", "CAN_CUOC", "CCCD", "SO_CCCD", "ID_NUMBER"},
    }
    header_indexes: dict[str, int] | None = None

    def find_header_indexes(row) -> dict[str, int] | None:
        normalized_cells = [normalize_oab_header(value) for value in row]
        indexes: dict[str, int] = {}
        for field, aliases in header_aliases.items():
            for index, header in enumerate(normalized_cells):
                if header in aliases:
                    indexes[field] = index
                    break
        if {"branch", "agribank_account"}.issubset(indexes):
            return indexes
        return None

    def cell_value(row, field: str):
        if not header_indexes or field not in header_indexes:
            return None
        index = header_indexes[field]
        return row[index] if index < len(row) else None

    for row in rows:
        if header_indexes is None:
            header_indexes = find_header_indexes(row)
            continue
        branch_full = clean_text(cell_value(row, "branch"))
        ten_kh = clean_text(cell_value(row, "customer_name"))
        tk_agribank = clean_text(cell_value(row, "agribank_account"))
        if not branch_full or not tk_agribank:
            continue
        branch_code = branch_full.split("-", 1)[0].strip()
        branch_name = branch_full.split("-", 1)[1].strip() if "-" in branch_full else branch_full
        record = SupplementalOABRecord(
            optional_file_id=item.id,
            period_key=item.period_key,
            branch_code=branch_code,
            branch_name=branch_name,
            provider=clean_text(cell_value(row, "provider")),
            ten_kh=ten_kh,
            tk_ao=clean_text(cell_value(row, "virtual_account")),
            tk_agribank=tk_agribank,
            phone=clean_text(cell_value(row, "phone")),
            id_number=clean_text(cell_value(row, "id_number")),
            raw_data={
                "ma": clean_text(cell_value(row, "ma")),
                "chi_nhanh": branch_full,
                "nha_cung_cap_loa": clean_text(cell_value(row, "provider")),
                "ten_kh": ten_kh,
                "tk_ao": clean_text(cell_value(row, "virtual_account")),
                "tk_agribank": tk_agribank,
                "sdt": clean_text(cell_value(row, "phone")),
                "so_can_cuoc": clean_text(cell_value(row, "id_number")),
            },
        )
        batch.append(record)
        inserted += 1
        if len(batch) >= 1000:
            db.add_all(batch)
            db.flush()
            batch = []

    if header_indexes is None:
        raise ValueError("Không tìm thấy dòng tiêu đề OAB có cột Chi nhánh và TK Agribank")
    if inserted == 0:
        raise ValueError("File OAB không có bản ghi hợp lệ sau dòng tiêu đề")
    if batch:
        db.add_all(batch)
        db.flush()
    return inserted


def parse_billpayment_file(db: Session, item: CustomerProcessingOptionalFile) -> int:
    file_path = Path(item.file_path)
    rows = excel_rows_from_xls(file_path) if file_path.suffix.lower() == ".xls" else excel_rows_from_xlsx(file_path)
    inserted = 0
    headers = None
    batch: list[SupplementalBillPaymentTransaction] = []
    required = {"Mã GD", "Ngày GD", "STK chuyển", "Số tiền", "Mã DV"}

    for row in rows:
        cells = [str(value or "").strip() for value in row]
        if headers is None:
            if required.issubset(set(cells)):
                headers = cells
            continue
        values = {headers[index]: row[index] if index < len(row) else None for index in range(len(headers))}
        transaction_id = clean_text(values.get("Mã GD"))
        if not transaction_id:
            continue
        raw_datetime = clean_text(values.get("Ngày GD")) or ""
        transaction_datetime = None
        for fmt in ("%Y%m%d%H%M%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                transaction_datetime = datetime.strptime(raw_datetime, fmt)
                break
            except ValueError:
                continue
        record = SupplementalBillPaymentTransaction(
            optional_file_id=item.id,
            period_key=item.period_key,
            transaction_id=transaction_id,
            transaction_status=clean_text(values.get("Tình trạng GD")),
            transaction_datetime=transaction_datetime,
            biller_customer_code=clean_text(values.get("Mã khách hàng")),
            customer_name=clean_text(values.get("Tên khách hàng")),
            debit_account=clean_text(values.get("STK chuyển")),
            amount=parse_decimal_value(values.get("Số tiền")),
            content=clean_text(values.get("Nội dung")),
            branch_code=clean_text(values.get("CN thực hiện")),
            lead_bank_code=clean_text(values.get("NH đầu mối")),
            service_code=clean_text(values.get("Mã DV")),
            provider_code=clean_text(values.get("Mã NCC")),
            user_id=clean_text(values.get("USERID")),
            raw_data={key: clean_text(value) for key, value in values.items() if key},
        )
        batch.append(record)
        inserted += 1
        if len(batch) >= 1000:
            db.add_all(batch)
            db.flush()
            batch = []
    if headers is None:
        raise ValueError("Không tìm thấy dòng tiêu đề Bill Payment hợp lệ")
    if batch:
        db.add_all(batch)
        db.flush()
    return inserted


def _normalize_pos_header(value) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip())
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    without_accents = without_accents.replace("Đ", "D").replace("đ", "d")
    return re.sub(r"[^A-Z0-9]+", "_", without_accents.upper()).strip("_")


def _pos_source_month(sheet) -> int | None:
    title_match = re.search(r"T\s*(\d{1,2})[.\-/ ]*20\d{2}", sheet.title, re.IGNORECASE)
    if title_match:
        month = int(title_match.group(1))
        if 1 <= month <= 12:
            return month
    for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row, 12), values_only=True):
        joined = " ".join(str(value or "") for value in row)
        month_match = re.search(r"(?:THANG|THÁNG)\s*(\d{1,2})", joined, re.IGNORECASE)
        if month_match:
            month = int(month_match.group(1))
            if 1 <= month <= 12:
                return month
    return None


def _read_pos_snapshots(file_path: Path) -> dict[int, dict[str, dict]]:
    """Read each POS worksheet into one relationship snapshot per source month.

    A relationship is keyed by settlement account when available, otherwise by Merchant ID.
    Multi-row terminals are consolidated so monthly activity is not counted repeatedly.
    """
    if file_path.suffix.lower() == ".xls":
        raise ValueError("Nguồn POS nhiều sheet hiện chỉ hỗ trợ định dạng XLSX; hãy lưu file XLS thành XLSX")
    workbook = load_workbook(file_path, read_only=True, data_only=True)
    snapshots: dict[int, dict[str, dict]] = {}
    try:
        for sheet in workbook.worksheets:
            source_month = _pos_source_month(sheet)
            if source_month is None:
                continue
            rows = list(sheet.iter_rows(values_only=True))
            header_index = None
            header_values = None
            for index, row in enumerate(rows[:20]):
                normalized = [_normalize_pos_header(value) for value in row]
                if "SO_TAI_KHOAN" in normalized and "MERCHANT_ID" in normalized:
                    header_index = index
                    header_values = normalized
                    break
            if header_index is None or header_values is None:
                continue

            def index_of(*aliases):
                for alias in aliases:
                    if alias in header_values:
                        return header_values.index(alias)
                return None

            account_index = index_of("SO_TAI_KHOAN")
            customer_index = index_of("TEN_KHACH_HANG_DVCNT", "TEN_KHACH_HANG")
            store_index = index_of("TEN_CUA_HANG")
            merchant_index = index_of("MERCHANT_ID")
            terminal_index = index_of("MA_THIET_BI")
            terminal_count_index = index_of("SO_LUONG_THIET_BI")
            monthly_group_index = next(
                (index for index, value in enumerate(header_values) if value.startswith("DOANH_SO_PHAT_SINH")),
                None,
            )
            transaction_index = monthly_group_index

            snapshot = snapshots.setdefault(source_month, {})
            parent: dict[str, str | None] = {
                "account": None, "customer": None, "store": None, "merchant": None,
            }
            for row_number, row in enumerate(rows[header_index + 2:], start=header_index + 3):
                def value_at(index):
                    return row[index] if index is not None and index < len(row) else None

                raw_account = clean_text(value_at(account_index))
                raw_customer = clean_text(value_at(customer_index))
                raw_store = clean_text(value_at(store_index))
                raw_merchant = clean_text(value_at(merchant_index))
                terminal_id = clean_text(value_at(terminal_index))

                # A blank Merchant ID denotes another terminal of the preceding merchant.
                # A new Merchant ID without an account remains unresolved and must not inherit
                # the preceding customer's account silently.
                continuation = not raw_merchant and bool(terminal_id)
                account = raw_account or (parent["account"] if continuation else None)
                customer_name = raw_customer or (parent["customer"] if continuation else None)
                store_name = raw_store or (parent["store"] if continuation else None)
                merchant_id = raw_merchant or (parent["merchant"] if continuation else None)
                if raw_merchant:
                    parent = {
                        "account": raw_account,
                        "customer": raw_customer,
                        "store": raw_store,
                        "merchant": raw_merchant,
                    }
                elif continuation:
                    parent.update({
                        "account": account,
                        "customer": customer_name,
                        "store": store_name,
                        "merchant": merchant_id,
                    })

                if not account and not merchant_id:
                    continue
                if account and not re.match(r"^\d{8,20}$", account):
                    account = None
                # POS status is deliberately resolved only through the settlement-account
                # chain POS -> DP01 -> core customer -> CIF. Merchant-only rows remain a
                # source-quality exception and must never be guessed onto a customer.
                if not account:
                    continue
                relation_key = f"A:{account}"
                branch_source = account or merchant_id or terminal_id or ""
                branch_code = branch_source[:4] if re.match(r"^26\d{2}", branch_source) else None
                declared_count = parse_decimal_value(value_at(terminal_count_index)) or Decimal(0)
                transaction_count = parse_decimal_value(value_at(transaction_index)) or Decimal(0)
                record = snapshot.setdefault(relation_key, {
                    "account": account,
                    "customer_name": customer_name,
                    "store_name": store_name,
                    "merchant_id": merchant_id,
                    "branch_code": branch_code,
                    "terminals": set(),
                    "declared_terminal_count": 0,
                    "transaction_count": 0,
                    "source_rows": [],
                })
                if terminal_id:
                    record["terminals"].add(terminal_id)
                record["declared_terminal_count"] = max(
                    record["declared_terminal_count"], int(declared_count),
                )
                record["transaction_count"] = max(record["transaction_count"], int(transaction_count))
                record["source_rows"].append(row_number)
        return snapshots
    finally:
        workbook.close()


def parse_pos_file(
    db: Session,
    item: CustomerProcessingOptionalFile,
    target_period_key: str,
) -> int:
    if target_period_key not in {"20260630", "20260731", "20260831"}:
        return 0
    snapshots = _read_pos_snapshots(Path(item.file_path))
    if not snapshots:
        raise ValueError("Không tìm thấy sheet POS có cột SỐ TÀI KHOẢN và Merchant ID")

    target_month = int(target_period_key[4:6])
    available_months = sorted(snapshots)
    source_month = max((month for month in available_months if month <= target_month), default=available_months[-1])
    current = snapshots[source_month]
    # Kỳ 08 kế thừa ảnh chụp T7 nên không suy diễn POS mới/ngừng nếu chưa có sheet T8.
    previous_month = source_month if target_month > source_month else max(
        (month for month in available_months if month < source_month),
        default=source_month,
    )
    previous = snapshots[previous_month]
    current_keys, previous_keys = set(current), set(previous)
    inserted = 0

    for relation_key, relation in current.items():
        terminals = sorted(relation["terminals"])
        terminal_count = max(len(terminals), relation["declared_terminal_count"])
        transaction_count = int(relation["transaction_count"])
        db.add(SupplementalPOSRecord(
            optional_file_id=item.id,
            period_key=target_period_key,
            source_period_key=f"2026{source_month:02d}{calendar.monthrange(2026, source_month)[1]:02d}",
            branch_code=relation["branch_code"],
            settlement_account=relation["account"],
            customer_name=relation["customer_name"],
            store_name=relation["store_name"],
            merchant_id=relation["merchant_id"],
            terminal_id=", ".join(terminals) or None,
            terminal_count=terminal_count,
            transaction_count=transaction_count,
            is_active=1 if transaction_count > 0 else 0,
            is_new=1 if relation_key not in previous_keys else 0,
            is_inactive=1 if transaction_count <= 0 else 0,
            is_discontinued=0,
            raw_data={"source_rows": relation["source_rows"], "source_sheet_month": source_month},
        ))
        inserted += 1

    for relation_key in sorted(previous_keys - current_keys):
        relation = previous[relation_key]
        terminals = sorted(relation["terminals"])
        db.add(SupplementalPOSRecord(
            optional_file_id=item.id,
            period_key=target_period_key,
            source_period_key=f"2026{source_month:02d}{calendar.monthrange(2026, source_month)[1]:02d}",
            branch_code=relation["branch_code"],
            settlement_account=relation["account"],
            customer_name=relation["customer_name"],
            store_name=relation["store_name"],
            merchant_id=relation["merchant_id"],
            terminal_id=", ".join(terminals) or None,
            terminal_count=max(len(terminals), relation["declared_terminal_count"]),
            transaction_count=0,
            is_active=0,
            is_new=0,
            is_inactive=0,
            is_discontinued=1,
            raw_data={"source_rows": relation["source_rows"], "previous_sheet_month": previous_month},
        ))
        inserted += 1
    db.flush()
    return inserted


def load_supported_optional_files(db: Session, period_key: str) -> int:
    db.execute(delete(SupplementalBaoLanhRecord).where(SupplementalBaoLanhRecord.period_key == period_key))
    db.execute(delete(SupplementalOABRecord).where(SupplementalOABRecord.period_key == period_key))
    db.execute(delete(SupplementalBillPaymentTransaction).where(SupplementalBillPaymentTransaction.period_key == period_key))
    db.execute(delete(SupplementalPOSRecord).where(SupplementalPOSRecord.period_key == period_key))
    db.flush()

    total_rows = 0
    rows = (
        db.query(CustomerProcessingOptionalFile)
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .order_by(CustomerProcessingOptionalFile.uploaded_at)
        .all()
    )
    if period_key in {"20260630", "20260731", "20260831"}:
        rows = [row for row in rows if detect_optional_file_type(row.original_filename) != "POS"]
        shared_pos = (
            db.query(CustomerProcessingOptionalFile)
            .order_by(CustomerProcessingOptionalFile.uploaded_at.desc())
            .all()
        )
        latest_pos = next((row for row in shared_pos if detect_optional_file_type(row.original_filename) == "POS"), None)
        if latest_pos:
            rows.append(latest_pos)
    for item in rows:
        file_type = detect_optional_file_type(item.original_filename)
        if not file_type:
            continue
        if not Path(item.file_path).is_file():
            item.status = "error"
            item.note = f"Không tìm thấy file bổ sung trên đĩa: {item.file_path}"
            continue
        try:
            if file_type == "BAO_LANH":
                total_rows += parse_bao_lanh_file(db, item)
            elif file_type == "OAB_LOA":
                total_rows += parse_oab_file(db, item)
            elif file_type == "BILLPAYMENT":
                total_rows += parse_billpayment_file(db, item)
            elif file_type == "POS":
                total_rows += parse_pos_file(db, item, period_key)
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


def build_period_file_summary(
    files: list[ImportFile],
    optional_count: int = 0,
    period_date: date | None = None,
) -> dict:
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

    available_required = sum(1 for file_type in REQUIRED_FILE_TYPES if success_by_type[file_type] > 0)
    branch_codes = sorted({
        item.branch_code
        for item in files
        if item.file_type in REQUIRED_FILE_TYPES and item.branch_code
    })
    successful_pairs = {
        (item.file_type, item.branch_code)
        for item in files
        if item.file_type in REQUIRED_FILE_TYPES and item.branch_code and item.status == "success"
    }
    ftpln_missing_dates: dict[str, list[str]] = {}
    if period_date:
        expected_dates = {
            date(period_date.year, period_date.month, day)
            for day in range(1, calendar.monthrange(period_date.year, period_date.month)[1] + 1)
        }
        for branch_code in branch_codes:
            branch_ftpln_files = [
                item
                for item in files
                if item.file_type == "FTPLN" and item.branch_code == branch_code
            ]
            success_dates = {
                item.business_date
                for item in branch_ftpln_files
                if item.status == "success" and item.business_date is not None
            }
            duplicate_dates = {
                business_date
                for business_date in success_dates
                if sum(
                    1
                    for item in branch_ftpln_files
                    if item.status == "success" and item.business_date == business_date
                ) > 1
            }
            missing_dates = sorted(expected_dates - success_dates)
            has_errors = any(item.status == "error" for item in branch_ftpln_files)
            if missing_dates or duplicate_dates or has_errors:
                successful_pairs.discard(("FTPLN", branch_code))
                ftpln_missing_dates[branch_code] = [item.isoformat() for item in missing_dates]
    missing_required_files = [
        {
            "file_type": file_type,
            "branch_code": branch_code,
            **(
                {"missing_dates": ftpln_missing_dates.get(branch_code, [])}
                if file_type == "FTPLN"
                else {}
            ),
        }
        for branch_code in branch_codes
        for file_type in REQUIRED_FILE_TYPES
        if (file_type, branch_code) not in successful_pairs
    ]
    required_matrix_count = len(REQUIRED_FILE_TYPES) * len(branch_codes)
    available_matrix_count = required_matrix_count - len(missing_required_files)
    ready_branch_count = sum(
        1
        for branch_code in branch_codes
        if all((file_type, branch_code) in successful_pairs for file_type in REQUIRED_FILE_TYPES)
    )
    return {
        "success_by_type": success_by_type,
        "error_by_type": error_by_type,
        "processing_by_type": processing_by_type,
        "required_file_count": len(REQUIRED_FILE_TYPES),
        "available_required_file_count": available_required,
        "total_file_count": len(files),
        "optional_file_count": optional_count,
        "is_ready": bool(branch_codes) and not missing_required_files,
        "branch_codes": branch_codes,
        "branch_count": len(branch_codes),
        "ready_branch_count": ready_branch_count,
        "required_matrix_count": required_matrix_count,
        "available_matrix_count": available_matrix_count,
        "branch_readiness_percent": (
            round(available_matrix_count * 100 / required_matrix_count)
            if required_matrix_count
            else 0
        ),
        "missing_required_files": missing_required_files,
        "is_fully_ready": bool(branch_codes) and not missing_required_files,
    }


def get_period_file_summary(db: Session, period_key: str) -> dict:
    files = active_import_files_query(db, period_key).all()
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    optional_count = (
        db.query(func.count(CustomerProcessingOptionalFile.id))
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .scalar()
        or 0
    )
    return build_period_file_summary(
        files,
        int(optional_count),
        batch.period_date if batch else None,
    )


def update_job(db: Session, job: CustomerProcessingJob, status: str, stage: str, progress: int) -> None:
    job.status = status
    job.stage = stage
    job.progress_percent = progress
    db.commit()
    db.refresh(job)


def create_processing_job(
    db: Session,
    period_key: str,
    *,
    allowed_missing_types: set[str] | None = None,
) -> CustomerProcessingJob:
    summary = get_period_file_summary(db, period_key)
    missing = summary.get("missing_required_files") or []
    allowed_missing = {str(item).strip().upper() for item in (allowed_missing_types or set())}
    blocking_missing = [
        item for item in missing
        if str(item.get("file_type") or "").strip().upper() not in allowed_missing
    ]
    if not summary["is_fully_ready"] and blocking_missing:
        preview = ", ".join(
            f"{item['branch_code']}-{item['file_type']}"
            for item in blocking_missing[:8]
        )
        suffix = f" và {len(blocking_missing) - 8} nguồn khác" if len(blocking_missing) > 8 else ""
        raise ValueError(
            "Kỳ dữ liệu chưa đủ nguồn bắt buộc theo chi nhánh"
            + (f": {preview}{suffix}." if preview else ".")
        )

    skipped_types = sorted({
        str(item.get("file_type") or "").strip().upper()
        for item in missing
        if str(item.get("file_type") or "").strip().upper() in allowed_missing
    })

    job = CustomerProcessingJob(
        period_key=period_key,
        status="queued",
        stage=(
            f"Đã tạo job xử lý dữ liệu khách hàng; bỏ qua nguồn thiếu: {', '.join(skipped_types)}"
            if skipped_types else "Đã tạo job xử lý dữ liệu khách hàng"
        ),
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


FINANCIAL_METRIC_COLUMNS = (
    *FEE_FIELDS,
    "dprr_chung_tt", "dprr_chung_lk", "dprr_cuthe_tt", "dprr_cuthe_lk",
)

KH02_FEE_AGGREGATE_SELECT_SQL = fee_aggregate_select_sql()


BILLPAYMENT_BRANCH_UPDATE_SQL = text(
    """
    WITH active_rules AS (
        SELECT rule_code, service_codes, amount_equals
        FROM business_matching_rules
        WHERE active = true AND source_type = 'BILLPAYMENT'
          AND (effective_from IS NULL OR effective_from <= to_date(:period_key, 'YYYYMMDD'))
          AND (effective_to IS NULL OR effective_to >= to_date(:period_key, 'YYYYMMDD'))
    ), eligible AS (
        SELECT tx.*, rule.rule_code
        FROM supplemental_billpayment_transactions tx
        JOIN active_rules rule ON EXISTS (
            SELECT 1 FROM json_array_elements_text(rule.service_codes) code
            WHERE code = TRIM(tx.service_code)
        ) AND (rule.amount_equals IS NULL OR tx.amount = rule.amount_equals)
        WHERE tx.period_key = :period_key
    ), matched AS (
        SELECT DISTINCT dp.ma_kh, COALESCE(dp.ma_cn, dp.branch_code) AS branch_code, tx.rule_code
        FROM eligible tx
        JOIN dp01_deposit_accounts dp
          ON dp.period_key = tx.period_key
         AND dp.so_tai_khoan = tx.debit_account
        WHERE dp.ma_kh IS NOT NULL
        UNION
        SELECT DISTINCT cn.ma_kh, COALESCE(cn.ma_cn,cn.branch_code), tx.rule_code
        FROM eligible tx
        JOIN cn05_customer_services cn ON cn.period_key=tx.period_key
          AND trim(cn.ma_kh)=substring(regexp_replace(coalesce(tx.debit_account,''),'[^0-9]','','g') from 5)
        WHERE tx.rule_code='THUHO_DT' AND regexp_replace(coalesce(tx.debit_account,''),'[^0-9]','','g') LIKE '8888%%'
          AND cn.ma_kh IS NOT NULL
        UNION
        SELECT DISTINCT cif.customer_core_code, COALESCE(tx.branch_code, split_part(cif.customer_core_code,'-',1)), tx.rule_code
        FROM eligible tx
        JOIN cif_customers cif ON regexp_replace(coalesce(cif.registration_number,''),'[^0-9]','','g') =
          substring(coalesce(tx.content,'') from '([0-9]{9,12})')
        WHERE tx.rule_code='THUHO_DT' AND lower(trim(coalesce(tx.debit_account,'')))='user deposit'
    ), matched_flags AS (
        SELECT ma_kh, branch_code,
               MAX((rule_code='THUHO_DIEN')::int) AS thuho_dien,
               MAX((rule_code='THUHO_NUOC')::int) AS thuho_nuoc,
               MAX((rule_code='THUHO_DT')::int) AS thuho_dt,
               MAX((rule_code='ABIC_BATK')::int) AS abic_batk,
               MAX((rule_code='ABIC_BATHE')::int) AS abic_bathe
        FROM matched GROUP BY ma_kh, branch_code
    ), hkd AS (
        SELECT ma_kh, COALESCE(ma_cn, branch_code) AS branch_code,
               string_agg(DISTINCT so_tai_khoan, ', ' ORDER BY so_tai_khoan) AS accounts
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND TRIM(COALESCE(cust_type, '')) = '570'
          AND ma_kh IS NOT NULL AND so_tai_khoan IS NOT NULL
        GROUP BY ma_kh, COALESCE(ma_cn, branch_code)
    ), flags AS (
        SELECT COALESCE(m.ma_kh,h.ma_kh) AS ma_kh,
               COALESCE(m.branch_code,h.branch_code) AS branch_code,
               COALESCE(m.thuho_dien,0) AS thuho_dien,
               COALESCE(m.thuho_nuoc,0) AS thuho_nuoc,
               COALESCE(m.thuho_dt,0) AS thuho_dt,
               COALESCE(m.abic_batk,0) AS abic_batk,
               COALESCE(m.abic_bathe,0) AS abic_bathe,
               h.accounts
        FROM matched_flags m FULL OUTER JOIN hkd h
          ON h.ma_kh=m.ma_kh AND h.branch_code=m.branch_code
    )
    UPDATE customer_period_branch_details d SET
        thuho_dien=f.thuho_dien, thuho_nuoc=f.thuho_nuoc, thuho_dt=f.thuho_dt,
        abic_batk=f.abic_batk, abic_bathe=f.abic_bathe,
        hkd_tk=CASE WHEN f.accounts IS NOT NULL THEN 1 ELSE 0 END,
        hkd_account_numbers=f.accounts
    FROM flags f
    WHERE d.period_key=:period_key AND d.ma_kh=f.ma_kh AND d.branch_code=f.branch_code
    """
)


PRODUCT_FLAGS_PROFILE_UPDATE_SQL = text(
    """
    WITH flags AS (
        SELECT ma_kh,
               MAX(thuho_dien) AS thuho_dien, MAX(thuho_nuoc) AS thuho_nuoc, MAX(thuho_dt) AS thuho_dt,
               MAX(abic_batk) AS abic_batk, MAX(abic_bathe) AS abic_bathe,
               MAX(hkd_tk) AS hkd_tk,
               string_agg(DISTINCT hkd_account_numbers, ', ' ORDER BY hkd_account_numbers)
                   FILTER (WHERE hkd_account_numbers IS NOT NULL) AS hkd_accounts
        FROM customer_period_branch_details
        WHERE period_key=:period_key
          AND (thuho_dien=1 OR thuho_nuoc=1 OR thuho_dt=1 OR abic_batk=1 OR abic_bathe=1 OR hkd_tk=1)
        GROUP BY ma_kh
    )
    UPDATE customer_period_profiles p SET
        thuho_dien=f.thuho_dien, thuho_nuoc=f.thuho_nuoc, thuho_dt=f.thuho_dt,
        abic_batk=f.abic_batk, abic_bathe=f.abic_bathe,
        hkd_tk=f.hkd_tk, hkd_account_numbers=f.hkd_accounts
    FROM flags f WHERE p.period_key=:period_key AND p.ma_kh=f.ma_kh
    """
)

CIF_PROFILE_LINK_SQL = text("""
    UPDATE customer_period_profiles profile
    SET customer_id=customer.id
    FROM cif_customers customer
    WHERE profile.period_key=:period_key
      AND customer.customer_core_code=profile.ma_kh
""")

CIF_BRANCH_LINK_SQL = text("""
    UPDATE customer_period_branch_details detail
    SET customer_id=customer.id
    FROM cif_customers customer
    WHERE detail.period_key=:period_key
      AND customer.customer_core_code=detail.ma_kh
""")

PROFILE_CIF_ENRICH_SQL = text("""
    WITH latest_identifier AS (
        SELECT DISTINCT ON (i.customer_id)
            i.customer_id, i.full_cif_code, i.raw_data
        FROM cif_customer_identifiers i
        ORDER BY i.customer_id, i.imported_at DESC, i.id DESC
    ), user_owner AS (
        SELECT DISTINCT ON (i.customer_id)
            i.customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM system_users u
        JOIN cif_customer_identifiers i ON i.full_cif_code=TRIM(u.customer_cif_code)
        LEFT JOIN org_branches b ON b.id=u.branch_id
        LEFT JOIN org_departments d ON d.id=u.department_id
        WHERE u.is_active=true AND NULLIF(TRIM(u.customer_cif_code),'') IS NOT NULL
        ORDER BY i.customer_id, u.id
    ), bc_owner AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, b.branch_code
        FROM cif_customers c
        JOIN bc06_customer_classifications bc
          ON bc.period_key=:period_key AND TRIM(bc.customer_code)=c.customer_core_code
        JOIN org_branches b ON
          regexp_replace(lower(b.branch_name),'^(agribank\\s*)?(chi nhánh|cn)\\s*','','i') =
          regexp_replace(lower(TRIM(bc.managing_unit)),'^(agribank\\s*)?(chi nhánh|cn)\\s*','','i')
        ORDER BY c.id, bc.id DESC
    ), ln_owner AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM cif_customers c
        JOIN ln01_loans l ON l.period_key=:period_key AND TRIM(l.custseq)=c.customer_core_code
        JOIN system_users u ON u.is_active=true AND TRIM(u.credit_officer_code)=TRIM(l.officer_id)
        LEFT JOIN org_branches b ON b.id=u.branch_id
        LEFT JOIN org_departments d ON d.id=u.department_id
        ORDER BY c.id, COALESCE(l.du_no,0) DESC, l.id
    ), dp_primary_branch AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, dp.ma_cn AS branch_code,
            SUM(CASE WHEN COALESCE(dp.current_balance, 0) > 0 THEN dp.current_balance ELSE 0 END) AS total_balance
        FROM cif_customers c
        JOIN dp01_deposit_accounts dp
          ON dp.period_key=:period_key AND TRIM(dp.ma_kh)=c.customer_core_code
        WHERE NULLIF(TRIM(dp.ma_cn), '') IS NOT NULL
          AND COALESCE(dp.current_balance, 0) > 0
        GROUP BY c.id, dp.ma_cn
        ORDER BY c.id, SUM(CASE WHEN COALESCE(dp.current_balance, 0) > 0 THEN dp.current_balance ELSE 0 END) DESC, dp.ma_cn
    ), dp_owner AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM cif_customers c
        JOIN dp_primary_branch dpb ON dpb.customer_id=c.id
        JOIN dp01_deposit_accounts dp ON dp.period_key=:period_key
          AND TRIM(dp.ma_kh)=c.customer_core_code AND TRIM(dp.ma_cn)=dpb.branch_code
          AND COALESCE(dp.current_balance, 0) > 0
        JOIN system_users u ON u.is_active=true AND TRIM(u.employee_code)=TRIM(dp.employee_number)
        JOIN org_branches b ON b.id=u.branch_id AND b.branch_code=dpb.branch_code
        LEFT JOIN org_departments d ON d.id=u.department_id
        ORDER BY c.id, COALESCE(dp.current_balance,0) DESC, dp.id
    ), dp_identity AS (
        SELECT ma_kh, MAX(id_number) FILTER (WHERE NULLIF(TRIM(id_number),'') IS NOT NULL) id_number
        FROM dp01_deposit_accounts WHERE period_key=:period_key GROUP BY ma_kh
    )
    UPDATE customer_period_profiles p SET
        ten_kh=COALESCE(c.customer_name,p.ten_kh),
        loai_khach_hang=COALESCE(c.customer_detail_type,c.customer_type,p.loai_khach_hang),
        ten_chu_doanh_nghiep=NULLIF(TRIM(li.raw_data->>'gd_ten'),''),
        so_cccd=COALESCE(NULLIF(TRIM(c.registration_number),''),dpid.id_number),
        ma_so_thue=NULLIF(TRIM(c.tax_number),''),
        ngay_thanh_lap=CASE WHEN COALESCE(li.raw_data->>'issuedt4','') ~ '^\\d{8}$' THEN to_date(li.raw_data->>'issuedt4','YYYYMMDD') END,
        dia_chi=c.full_address,
        gioi_tinh=CASE WHEN lower(COALESCE(c.customer_type,'')) LIKE '%cá nhân%' THEN c.gender_code END,
        ngay_sinh=CASE
          WHEN lower(COALESCE(c.customer_type,'')) LIKE '%cá nhân%' THEN c.birth_date
          WHEN COALESCE(li.raw_data->>'gd_ngaysinh','') ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(li.raw_data->>'gd_ngaysinh','DD/MM/YYYY')
        END,
        nghe_nghiep=c.occupation,
        management_source=CASE WHEN uo.customer_id IS NOT NULL THEN 'USER_CIF'
          WHEN lo.customer_id IS NOT NULL THEN 'LN01'
          WHEN dpo.customer_id IS NOT NULL THEN 'DP01_POSITIVE_BALANCE'
          WHEN bo.customer_id IS NOT NULL THEN 'BC06' ELSE 'CIF_BRANCH' END,
        managing_branch_code=COALESCE(uo.branch_code,lo.branch_code,dpb.branch_code,bo.branch_code,p.primary_branch_code),
        managing_department_code=CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_code WHEN lo.customer_id IS NOT NULL THEN lo.department_code ELSE dpo.department_code END,
        managing_department_name=CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_name WHEN lo.customer_id IS NOT NULL THEN lo.department_name ELSE dpo.department_name END,
        ma_cb=CASE WHEN uo.customer_id IS NOT NULL THEN COALESCE(uo.credit_officer_code,uo.employee_code) WHEN lo.customer_id IS NOT NULL THEN COALESCE(lo.credit_officer_code,lo.employee_code) ELSE COALESCE(dpo.credit_officer_code,dpo.employee_code,p.ma_cb) END,
        officer_employee_code=CASE WHEN uo.customer_id IS NOT NULL THEN uo.employee_code WHEN lo.customer_id IS NOT NULL THEN lo.employee_code ELSE COALESCE(dpo.employee_code,p.officer_employee_code) END,
        ten_can_bo=CASE WHEN uo.customer_id IS NOT NULL THEN uo.full_name WHEN lo.customer_id IS NOT NULL THEN lo.full_name ELSE COALESCE(dpo.full_name,p.ten_can_bo) END,
        telephone=COALESCE(c.telephone,p.telephone),
        primary_branch_code=COALESCE(uo.branch_code,p.primary_branch_code),
        primary_pgd_code=CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_code ELSE p.primary_pgd_code END,
        primary_pgd_name=CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_name ELSE p.primary_pgd_name END
    FROM cif_customers c
    LEFT JOIN latest_identifier li ON li.customer_id=c.id
    LEFT JOIN user_owner uo ON uo.customer_id=c.id
    LEFT JOIN bc_owner bo ON bo.customer_id=c.id
    LEFT JOIN ln_owner lo ON lo.customer_id=c.id
    LEFT JOIN dp_primary_branch dpb ON dpb.customer_id=c.id
    LEFT JOIN dp_owner dpo ON dpo.customer_id=c.id
    LEFT JOIN dp_identity dpid ON dpid.ma_kh=c.customer_core_code
    WHERE p.period_key=:period_key AND p.customer_id=c.id;
""")


PROFILE_ENRICHMENT_TEMP_SQL = text("""
    CREATE TEMP TABLE tmp_profile_enrichment ON COMMIT PRESERVE ROWS AS
    WITH latest_identifier AS (
        SELECT DISTINCT ON (i.customer_id)
            i.customer_id, i.raw_data
        FROM cif_customer_identifiers i
        ORDER BY i.customer_id, i.imported_at DESC, i.id DESC
    ), user_owner AS (
        SELECT DISTINCT ON (i.customer_id)
            i.customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM system_users u
        JOIN cif_customer_identifiers i ON i.full_cif_code=TRIM(u.customer_cif_code)
        LEFT JOIN org_branches b ON b.id=u.branch_id
        LEFT JOIN org_departments d ON d.id=u.department_id
        WHERE u.is_active=true AND NULLIF(TRIM(u.customer_cif_code),'') IS NOT NULL
        ORDER BY i.customer_id, u.id
    ), bc_owner AS (
        SELECT DISTINCT ON (c.id) c.id customer_id, b.branch_code
        FROM cif_customers c
        JOIN bc06_customer_classifications bc
          ON bc.period_key=:period_key AND TRIM(bc.customer_code)=c.customer_core_code
        JOIN org_branches b ON
          regexp_replace(lower(b.branch_name),'^(agribank\\s*)?(chi nhánh|cn)\\s*','','i') =
          regexp_replace(lower(TRIM(bc.managing_unit)),'^(agribank\\s*)?(chi nhánh|cn)\\s*','','i')
        ORDER BY c.id, bc.id DESC
    ), ln_owner AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM cif_customers c
        JOIN ln01_loans l ON l.period_key=:period_key AND TRIM(l.custseq)=c.customer_core_code
        JOIN system_users u ON u.is_active=true AND TRIM(u.credit_officer_code)=TRIM(l.officer_id)
        LEFT JOIN org_branches b ON b.id=u.branch_id
        LEFT JOIN org_departments d ON d.id=u.department_id
        ORDER BY c.id, COALESCE(l.du_no,0) DESC, l.id
    ), dp_primary_branch AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, dp.ma_cn AS branch_code,
            SUM(CASE WHEN COALESCE(dp.current_balance, 0) > 0 THEN dp.current_balance ELSE 0 END) AS total_balance
        FROM cif_customers c
        JOIN dp01_deposit_accounts dp
          ON dp.period_key=:period_key AND TRIM(dp.ma_kh)=c.customer_core_code
        WHERE NULLIF(TRIM(dp.ma_cn), '') IS NOT NULL
          AND COALESCE(dp.current_balance, 0) > 0
        GROUP BY c.id, dp.ma_cn
        ORDER BY c.id, SUM(CASE WHEN COALESCE(dp.current_balance, 0) > 0 THEN dp.current_balance ELSE 0 END) DESC, dp.ma_cn
    ), dp_owner AS (
        SELECT DISTINCT ON (c.id)
            c.id customer_id, u.employee_code, u.credit_officer_code, u.full_name,
            b.branch_code, d.department_code, d.department_name
        FROM cif_customers c
        JOIN dp_primary_branch dpb ON dpb.customer_id=c.id
        JOIN dp01_deposit_accounts dp ON dp.period_key=:period_key
          AND TRIM(dp.ma_kh)=c.customer_core_code AND TRIM(dp.ma_cn)=dpb.branch_code
          AND COALESCE(dp.current_balance, 0) > 0
        JOIN system_users u ON u.is_active=true AND TRIM(u.employee_code)=TRIM(dp.employee_number)
        JOIN org_branches b ON b.id=u.branch_id AND b.branch_code=dpb.branch_code
        LEFT JOIN org_departments d ON d.id=u.department_id
        ORDER BY c.id, COALESCE(dp.current_balance,0) DESC, dp.id
    ), dp_identity AS (
        SELECT ma_kh, MAX(id_number) FILTER (WHERE NULLIF(TRIM(id_number),'') IS NOT NULL) id_number
        FROM dp01_deposit_accounts WHERE period_key=:period_key GROUP BY ma_kh
    )
    SELECT
        c.id AS customer_id,
        c.customer_name AS ten_kh,
        COALESCE(c.customer_detail_type,c.customer_type) AS loai_khach_hang,
        NULLIF(TRIM(li.raw_data->>'gd_ten'),'') AS ten_chu_doanh_nghiep,
        COALESCE(NULLIF(TRIM(c.registration_number),''),dpid.id_number) AS so_cccd,
        NULLIF(TRIM(c.tax_number),'') AS ma_so_thue,
        CASE WHEN COALESCE(li.raw_data->>'issuedt4','') ~ '^\\d{8}$'
             THEN to_date(li.raw_data->>'issuedt4','YYYYMMDD') END AS ngay_thanh_lap,
        c.full_address AS dia_chi,
        CASE WHEN lower(COALESCE(c.customer_type,'')) LIKE '%cá nhân%'
             THEN c.gender_code END AS gioi_tinh,
        CASE WHEN lower(COALESCE(c.customer_type,'')) LIKE '%cá nhân%' THEN c.birth_date
             WHEN COALESCE(li.raw_data->>'gd_ngaysinh','') ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
             THEN to_date(li.raw_data->>'gd_ngaysinh','DD/MM/YYYY') END AS ngay_sinh,
        c.occupation AS nghe_nghiep,
        CASE WHEN uo.customer_id IS NOT NULL THEN 'USER_CIF'
             WHEN lo.customer_id IS NOT NULL THEN 'LN01'
             WHEN dpo.customer_id IS NOT NULL THEN 'DP01_POSITIVE_BALANCE'
             WHEN bo.customer_id IS NOT NULL THEN 'BC06' ELSE NULL END AS management_source,
        COALESCE(uo.branch_code,lo.branch_code,dpb.branch_code,bo.branch_code) AS managing_branch_code,
        CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_code WHEN lo.customer_id IS NOT NULL THEN lo.department_code ELSE dpo.department_code END AS managing_department_code,
        CASE WHEN uo.customer_id IS NOT NULL THEN uo.department_name WHEN lo.customer_id IS NOT NULL THEN lo.department_name ELSE dpo.department_name END AS managing_department_name,
        CASE WHEN uo.customer_id IS NOT NULL THEN COALESCE(uo.credit_officer_code,uo.employee_code) WHEN lo.customer_id IS NOT NULL THEN COALESCE(lo.credit_officer_code,lo.employee_code) ELSE COALESCE(dpo.credit_officer_code,dpo.employee_code) END AS ma_cb,
        CASE WHEN uo.customer_id IS NOT NULL THEN uo.employee_code WHEN lo.customer_id IS NOT NULL THEN lo.employee_code ELSE dpo.employee_code END AS officer_employee_code,
        CASE WHEN uo.customer_id IS NOT NULL THEN uo.full_name WHEN lo.customer_id IS NOT NULL THEN lo.full_name ELSE dpo.full_name END AS ten_can_bo,
        c.telephone,
        uo.branch_code AS primary_branch_code,
        uo.department_code AS primary_pgd_code,
        uo.department_name AS primary_pgd_name
    FROM cif_customers c
    LEFT JOIN latest_identifier li ON li.customer_id=c.id
    LEFT JOIN user_owner uo ON uo.customer_id=c.id
    LEFT JOIN bc_owner bo ON bo.customer_id=c.id
    LEFT JOIN ln_owner lo ON lo.customer_id=c.id
    LEFT JOIN dp_primary_branch dpb ON dpb.customer_id=c.id
    LEFT JOIN dp_owner dpo ON dpo.customer_id=c.id
    LEFT JOIN dp_identity dpid ON dpid.ma_kh=c.customer_core_code
""")


def prepare_profile_enrichment(db: Session, period_key: str) -> None:
    db.execute(text("DROP TABLE IF EXISTS tmp_profile_enrichment"))
    db.execute(PROFILE_ENRICHMENT_TEMP_SQL, {"period_key": period_key})
    db.execute(text("CREATE UNIQUE INDEX ON tmp_profile_enrichment (customer_id)"))
    db.execute(text("ANALYZE tmp_profile_enrichment"))

SOURCE_RECONCILIATION_SQL = text("""
    WITH source_rows AS (
      SELECT 'DP01' source_type, ma_cn branch_code, ma_kh customer_code, MAX(ten_kh) customer_name, COUNT(*) row_count, SUM(COALESCE(current_balance,0)) amount FROM dp01_deposit_accounts WHERE period_key=:period_key GROUP BY ma_cn,ma_kh
      UNION ALL SELECT 'LN01',brcd,custseq,MAX(custnm),COUNT(*),SUM(COALESCE(du_no,0)) FROM ln01_loans WHERE period_key=:period_key GROUP BY brcd,custseq
      UNION ALL SELECT 'PF14',trbrcd,custseq,MAX(custname),COUNT(*),SUM(COALESCE(monthlyendbalance,0)) FROM pf14_account_balances WHERE period_key=:period_key GROUP BY trbrcd,custseq
      UNION ALL SELECT 'PF10',branch_code,customer_code,MAX(customer_name),COUNT(*),SUM(COALESCE(end_of_month_balance,0)) FROM pf10_loan_profitability WHERE period_key=:period_key GROUP BY branch_code,customer_code
      UNION ALL SELECT 'CN05',ma_cn,ma_kh,MAX(ten_kh),COUNT(*),NULL FROM cn05_customer_services WHERE period_key=:period_key GROUP BY ma_cn,ma_kh
      UNION ALL SELECT 'BC06',branch_code,customer_code,MAX(customer_name),COUNT(*),NULL FROM bc06_customer_classifications WHERE period_key=:period_key GROUP BY branch_code,customer_code
      UNION ALL SELECT 'BC29',branch_code,customer_code,MAX(customer_name),COUNT(*),SUM(COALESCE(total_outstanding,0)) FROM bc29_customer_credit_risks WHERE period_key=:period_key GROUP BY branch_code,customer_code
      UNION ALL SELECT 'KH02',branch_code,customer_code,MAX(customer_name),COUNT(*),SUM(COALESCE(credit_amount,0)-COALESCE(debit_amount,0)) FROM kh02_customer_transactions WHERE period_key=:period_key GROUP BY branch_code,customer_code
      UNION ALL SELECT 'FTPLN',branch_code,customer_code,MAX(customer_name),COUNT(*),SUM(COALESCE(ledger_balance,0)) FROM ftpln_daily_loan_ftp WHERE period_key=:period_key GROUP BY branch_code,customer_code
    )
    INSERT INTO customer_source_reconciliations(processing_job_id,period_key,source_type,branch_code,customer_core_code,customer_name,source_row_count,source_amount,reason_code,status,details)
    SELECT :job_id,:period_key,s.source_type,s.branch_code,NULLIF(TRIM(s.customer_code),''),s.customer_name,s.row_count,s.amount,
      CASE WHEN NULLIF(TRIM(s.customer_code),'') IS NULL THEN 'MISSING_CUSTOMER_CODE' ELSE 'NOT_FOUND_IN_CIF' END,
      'pending',jsonb_build_object('source_branch',s.branch_code)
    FROM source_rows s
    LEFT JOIN cif_customers c ON c.customer_core_code=NULLIF(TRIM(s.customer_code),'')
    WHERE c.id IS NULL;
""")


def apply_customer_financial_metrics(db: Session, period_key: str) -> None:
    """Calculate KH02/LN01/BC29 metrics by branch and roll them up to the core customer."""
    previous_ln_period = db.execute(
        text("SELECT max(period_key) FROM ln01_loans WHERE period_key < :period_key"),
        {"period_key": period_key},
    ).scalar()
    previous_bc29_period = db.execute(
        text("SELECT max(period_key) FROM bc29_customer_credit_risks WHERE period_key < :period_key"),
        {"period_key": period_key},
    ).scalar()
    # The period rows were freshly inserted by BRANCH_DETAIL_SQL, therefore all
    # financial metrics are already NULL. Resetting every row here rewrote the
    # complete (very wide) period table before calculating only a small subset.
    # BRANCH_DETAIL_SQL creates exactly one row for each period/customer/branch.
    # Avoid rebuilding and scanning a redundant canonical-row CTE for every metric.
    canonical = "TRUE"
    canonical_cte = ""

    db.execute(text(f"""
        WITH {canonical_cte} fees AS (
            SELECT trim(customer_code) ma_kh, trim(branch_code) branch_code,
              {KH02_FEE_AGGREGATE_SELECT_SQL}
            FROM kh02_customer_transactions
            WHERE period_key=:period_key AND nullif(trim(customer_code),'') IS NOT NULL
              AND nullif(trim(branch_code),'') IS NOT NULL
            GROUP BY trim(customer_code), trim(branch_code)
        )
        UPDATE customer_period_branch_details d
        SET phi_bao_lanh=f.phi_bao_lanh, phi_chuyen_tien=f.phi_chuyen_tien,
            phi_nhdt=f.phi_nhdt, abic_batd=f.abic_batd,
            phi_kdnt=f.phi_kdnt, phi_lc=f.phi_lc, phi_ttqt=f.phi_ttqt,
            phi_the=f.phi_the, phi_khac=f.phi_khac,
            ttqt=CASE WHEN f.phi_kdnt<>0 OR f.phi_lc<>0 OR f.phi_ttqt<>0 THEN 1 ELSE 0 END
        FROM fees f
        WHERE d.period_key=:period_key AND d.ma_kh=f.ma_kh AND d.branch_code=f.branch_code
          AND {canonical}
    """), {"period_key": period_key})
    db.execute(text(f"""
        WITH {canonical_cte} current_value AS (
            SELECT trim(custseq) ma_kh, trim(coalesce(nullif(brcd,''),branch_code)) branch_code,
                   sum(coalesce(du_no,0)) eligible_debt
            FROM ln01_loans
            WHERE period_key=:period_key
              AND lpad(nullif(regexp_replace(coalesce(nullif(trim(debt_group),''),
                    raw_data->>'NHOM_NO',''),'[^0-9]','','g'),''),2,'0') IN ('01','02','03','04')
            GROUP BY trim(custseq), trim(coalesce(nullif(brcd,''),branch_code))
        ), previous_value AS (
            SELECT trim(custseq) ma_kh, trim(coalesce(nullif(brcd,''),branch_code)) branch_code,
                   sum(coalesce(du_no,0)) eligible_debt
            FROM ln01_loans
            WHERE period_key=:previous_period
              AND lpad(nullif(regexp_replace(coalesce(nullif(trim(debt_group),''),
                    raw_data->>'NHOM_NO',''),'[^0-9]','','g'),''),2,'0') IN ('01','02','03','04')
            GROUP BY trim(custseq), trim(coalesce(nullif(brcd,''),branch_code))
        ), metrics AS (
            SELECT coalesce(c.ma_kh,p.ma_kh) ma_kh, coalesce(c.branch_code,p.branch_code) branch_code,
                   coalesce(c.eligible_debt,0)*0.0075 dprr_chung_lk,
                   CASE WHEN :has_previous THEN
                     (coalesce(c.eligible_debt,0)-coalesce(p.eligible_debt,0))*0.0075 END dprr_chung_tt
            FROM current_value c FULL JOIN previous_value p USING (ma_kh,branch_code)
        )
        UPDATE customer_period_branch_details d
        SET dprr_chung_lk=m.dprr_chung_lk, dprr_chung_tt=m.dprr_chung_tt
        FROM metrics m
        WHERE d.period_key=:period_key AND d.ma_kh=m.ma_kh AND d.branch_code=m.branch_code
          AND {canonical}
    """), {"period_key": period_key, "previous_period": previous_ln_period or "",
            "has_previous": previous_ln_period is not None})

    db.execute(text(f"""
        WITH {canonical_cte} current_value AS (
            SELECT trim(customer_code) ma_kh, trim(branch_code) branch_code,
                   sum(coalesce(period_provision_amount,0)) provision_amount
            FROM bc29_customer_credit_risks
            WHERE period_key=:period_key
              AND lpad(nullif(regexp_replace(coalesce(debt_group,''),'[^0-9]','','g'),''),2,'0')
                  IN ('02','03','04','05')
            GROUP BY trim(customer_code), trim(branch_code)
        ), previous_value AS (
            SELECT trim(customer_code) ma_kh, trim(branch_code) branch_code,
                   sum(coalesce(period_provision_amount,0)) provision_amount
            FROM bc29_customer_credit_risks
            WHERE period_key=:previous_period
              AND lpad(nullif(regexp_replace(coalesce(debt_group,''),'[^0-9]','','g'),''),2,'0')
                  IN ('02','03','04','05')
            GROUP BY trim(customer_code), trim(branch_code)
        ), metrics AS (
            SELECT coalesce(c.ma_kh,p.ma_kh) ma_kh, coalesce(c.branch_code,p.branch_code) branch_code,
                   coalesce(c.provision_amount,0) dprr_cuthe_lk,
                   CASE WHEN :has_previous THEN
                     coalesce(c.provision_amount,0)-coalesce(p.provision_amount,0) END dprr_cuthe_tt
            FROM current_value c FULL JOIN previous_value p USING (ma_kh,branch_code)
        )
        UPDATE customer_period_branch_details d
        SET dprr_cuthe_lk=m.dprr_cuthe_lk, dprr_cuthe_tt=m.dprr_cuthe_tt
        FROM metrics m
        WHERE d.period_key=:period_key AND d.ma_kh=m.ma_kh AND d.branch_code=m.branch_code
          AND {canonical}
    """), {"period_key": period_key, "previous_period": previous_bc29_period or "",
            "has_previous": previous_bc29_period is not None})

    sums = ", ".join(f"sum({column}) AS {column}" for column in FINANCIAL_METRIC_COLUMNS)
    assignments = ", ".join(f"{column}=a.{column}" for column in FINANCIAL_METRIC_COLUMNS)
    db.execute(text(f"""
        WITH a AS (
            SELECT period_key, ma_kh, {sums}
            FROM customer_period_branch_details
            WHERE period_key=:period_key
              AND ({" OR ".join(f"{column} IS NOT NULL" for column in FINANCIAL_METRIC_COLUMNS)})
            GROUP BY period_key,ma_kh
        )
        UPDATE customer_period_profiles p SET {assignments}
        FROM a WHERE p.period_key=a.period_key AND p.ma_kh=a.ma_kh
    """), {"period_key": period_key})
    db.execute(text("""
        UPDATE customer_period_profiles
        SET ttqt=1
        WHERE period_key=:period_key
          AND (coalesce(phi_kdnt,0)<>0 OR coalesce(phi_lc,0)<>0 OR coalesce(phi_ttqt,0)<>0)
    """), {"period_key": period_key})


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

        update_job(db, job, "processing", "Đọc file bổ sung Bảo lãnh/OAB/Bill Payment/POS nếu có", 24)
        load_supported_optional_files(db, job.period_key)
        db.commit()

        update_job(db, job, "processing", "Tạo bảng tỷ giá theo CCY từ DP01 trong kỳ", 30)
        db.execute(EXCHANGE_RATE_SQL, {"period_key": job.period_key})
        db.execute(DEFAULT_VND_RATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Khởi tạo từ Kho CIF và ghép DP01, LN01, PF10, CN05, PF14 theo mã khách hàng lõi", 48)
        db.execute(BRANCH_DETAIL_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.commit()

        update_job(db, job, "processing", "Đối chiếu Bảo lãnh, OAB, Bill Payment và POS theo tài khoản DP01", 62)
        db.execute(SUPPLEMENT_BRANCH_UPDATE_SQL, {"period_key": job.period_key})
        db.execute(BILLPAYMENT_BRANCH_UPDATE_SQL, {"period_key": job.period_key})
        db.execute(POS_BRANCH_UPDATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Gom khách hàng trùng MA_KH trên nhiều chi nhánh thành một hồ sơ", 78)
        prepare_profile_enrichment(db, job.period_key)
        db.execute(PROFILE_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.execute(MISSING_CIF_PROFILE_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.execute(PRODUCT_FLAGS_PROFILE_UPDATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Tính phí KH02 và dự phòng rủi ro LN01/BC29", 86)
        apply_customer_financial_metrics(db, job.period_key)
        db.commit()

        update_job(db, job, "processing", "Tính doanh số chuyển tiền về TK theo số dư DP", 88)
        apply_transfer_inflow_to_profiles(db, job.period_key)
        apply_rr01_metrics_to_profiles(db, job.period_key)
        db.commit()

        update_job(db, job, "processing", "Luu danh sach ma nguon chua doi chieu duoc voi Kho CIF", 94)
        db.execute(
            delete(CustomerSourceReconciliation).where(
                CustomerSourceReconciliation.processing_job_id == job.id
            )
        )
        db.execute(SOURCE_RECONCILIATION_SQL, {"period_key": job.period_key, "job_id": job.id})
        db.commit()

        update_job(db, job, "processing", "Kiểm định tính toàn vẹn dữ liệu theo khách hàng", 98)
        quality_report = validate_processed_period(db, job.period_key)
        job.quality_report = quality_report
        if not quality_report["is_valid"]:
            raise ValueError(f"Kiểm định dữ liệu C360 không đạt: {quality_report}")

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
