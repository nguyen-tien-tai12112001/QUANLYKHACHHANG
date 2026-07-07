import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import delete, func, text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    ImportBatch,
    ImportFile,
)


OPTIONAL_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "optional"
REQUIRED_FILE_TYPES = ("DP01", "LN01", "CN05", "PF14")


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
    ln_base AS (
        SELECT
            custseq AS ma_kh,
            brcd AS branch_code,
            COALESCE(du_no, 0) AS du_no,
            loan_type,
            COALESCE(officer_ipcas, officer_id) AS ma_cb,
            officer_name AS ten_can_bo,
            CASE WHEN loan_type = 'Thấu chi trên TK khách hàng' THEN 1 ELSE 0 END AS is_thau_chi,
            CASE WHEN loan_type = 'Vay ngắn hạn (TK 211)' THEN 1 ELSE 0 END AS is_ngan,
            CASE WHEN loan_type = 'Vay trung hạn (TK 212)' THEN 1 ELSE 0 END AS is_trung,
            CASE WHEN loan_type = 'Vay dài hạn (TK 213)' THEN 1 ELSE 0 END AS is_dai
        FROM ln01_loans
        WHERE period_key = :period_key AND custseq IS NOT NULL
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
        SELECT ma_kh, branch_code, ma_cb, ten_can_bo
        FROM (
            SELECT
                ma_kh,
                branch_code,
                ma_cb,
                ten_can_bo,
                ROW_NUMBER() OVER (
                    PARTITION BY ma_kh, branch_code
                    ORDER BY du_no DESC, ma_cb NULLS LAST, ten_can_bo NULLS LAST
                ) AS row_number
            FROM ln_base
            WHERE ma_cb IS NOT NULL OR ten_can_bo IS NOT NULL
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
            ln_top_officer.ten_can_bo
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
            jsonb_agg(
                jsonb_build_object(
                    'branch_code', branch_code,
                    'ma_pgd', ma_pgd,
                    'ten_pgd', ten_pgd,
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
                    'ma_cb', ma_cb,
                    'ten_can_bo', ten_can_bo
                )
                ORDER BY branch_code, ma_pgd
            ) AS branch_details
        FROM details
        GROUP BY ma_kh
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
        SELECT ma_kh, ma_cb AS ln_ma_cb, ten_can_bo AS ln_ten_can_bo
        FROM (
            SELECT
                custseq AS ma_kh,
                COALESCE(officer_ipcas, officer_id) AS ma_cb,
                officer_name AS ten_can_bo,
                ROW_NUMBER() OVER (
                    PARTITION BY custseq
                    ORDER BY COALESCE(du_no, 0) DESC, COALESCE(officer_ipcas, officer_id) NULLS LAST, officer_name NULLS LAST
                ) AS row_number
            FROM ln01_loans
            WHERE period_key = :period_key
                AND custseq IS NOT NULL
                AND (officer_ipcas IS NOT NULL OR officer_id IS NOT NULL OR officer_name IS NOT NULL)
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
        ma_cb,
        ten_can_bo,
        telephone,
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
        COALESCE(loan_staff.ln_ma_cb, staff.dp_ma_cb),
        COALESCE(loan_staff.ln_ten_can_bo, staff.dp_ten_can_bo),
        phones.telephone,
        detail_agg.branch_details,
        :job_id
    FROM detail_agg
    LEFT JOIN staff ON staff.ma_kh = detail_agg.ma_kh
    LEFT JOIN loan_staff ON loan_staff.ma_kh = detail_agg.ma_kh
    LEFT JOIN phones ON phones.ma_kh = detail_agg.ma_kh
    """
)


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

        update_job(db, job, "processing", "Tạo bảng tỷ giá theo CCY từ DP01 trong kỳ", 30)
        db.execute(EXCHANGE_RATE_SQL, {"period_key": job.period_key})
        db.execute(DEFAULT_VND_RATE_SQL, {"period_key": job.period_key})
        db.commit()

        update_job(db, job, "processing", "Đối chiếu DP01 với LN01, CN05, PF14 theo từng chi nhánh/PGD", 48)
        db.execute(BRANCH_DETAIL_SQL, {"period_key": job.period_key, "job_id": job.id})
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
