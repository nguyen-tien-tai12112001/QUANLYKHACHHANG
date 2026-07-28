from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import and_, asc, desc, func, or_, text
from sqlalchemy.orm import Session

from app.customer_processing import (
    REQUIRED_FILE_TYPES,
    create_processing_job,
    get_period_file_summary,
    process_customer_period,
    save_optional_file,
)
from app.database import get_db
from app.models import (
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    ImportBatch,
    OrgBranch,
    OrgDepartment,
)


router = APIRouter(prefix="/api/customer-processing", tags=["customer-processing"])


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def serialize_model(model, fields: list[str]) -> dict:
    return {field: serialize_value(getattr(model, field)) for field in fields}


def serialize_job(job: CustomerProcessingJob | None) -> dict | None:
    if not job:
        return None
    return serialize_model(
        job,
        [
            "id",
            "period_key",
            "status",
            "stage",
            "progress_percent",
            "required_file_count",
            "available_required_file_count",
            "total_file_count",
            "optional_file_count",
            "total_customers",
            "processed_customers",
            "error_message",
            "started_at",
            "finished_at",
            "created_at",
            "updated_at",
        ],
    )


PROFILE_SERVICE_FIELDS = {
    "thau_chi",
    "tk_so_dep",
    "agribank_plus",
    "tin_nhan_ott",
    "sms_nhac_no_vay",
    "sms_tien_gui",
    "the_ghi_no_noi_dia",
    "the_td_quoc_te",
    "the_td_loc_viet",
    "bao_lanh",
    "loa_bien_dong_so_du",
    "phat_hanh_lc",
}

GROUP_DEPOSIT_THRESHOLD = 1_000_000_000
GROUP_LOAN_THRESHOLD = 1_000_000_000
GROUP_CASA_THRESHOLD = 500_000_000

# KH cá nhân / hộ — mới được gợi ý thẻ và Agribank Plus (không áp cho DN/tổ chức).
RETAIL_CUSTOMER_TYPES = ("Cá nhân", "KHCN")


def is_retail_customer_expr():
    return CustomerPeriodProfile.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES)


def no_service_condition():
    return and_(*(getattr(CustomerPeriodProfile, field) == 0 for field in PROFILE_SERVICE_FIELDS))


def cross_sell_condition():
    return or_(
        and_(
            is_retail_customer_expr(),
            (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
            >= GROUP_DEPOSIT_THRESHOLD,
            CustomerPeriodProfile.agribank_plus == 0,
        ),
        and_(func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) > 0, CustomerPeriodProfile.sms_nhac_no_vay == 0),
        and_(
            is_retail_customer_expr(),
            func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD,
            CustomerPeriodProfile.the_ghi_no_noi_dia == 0,
            CustomerPeriodProfile.the_td_quoc_te == 0,
            CustomerPeriodProfile.the_td_loc_viet == 0,
        ),
    )


def group_condition(group_key: str):
    if group_key == "large_deposit":
        return (
            (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
            >= GROUP_DEPOSIT_THRESHOLD
        )
    if group_key == "large_loan":
        return func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD
    if group_key == "high_casa":
        return func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD
    if group_key == "multi_branch":
        return CustomerPeriodProfile.branch_count > 1
    if group_key == "primary_location_attention":
        return and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))
    if group_key == "cross_sell":
        return cross_sell_condition()
    return None


def _branch_finance_agg_subquery(db: Session, period_key: str, branch_code: str, pgd_code: str | None = None):
    """Gom số liệu tài chính theo mã KH tại đúng chi nhánh (và PGD nếu có)."""
    query = db.query(
        CustomerPeriodBranchDetail.ma_kh.label("ma_kh"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0).label("so_du_tien_vay"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_gui), 0).label("so_du_tien_gui"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0).label("so_du_tgtt_binh_quan"),
        func.max(CustomerPeriodBranchDetail.agribank_plus).label("agribank_plus"),
        func.max(CustomerPeriodBranchDetail.sms_nhac_no_vay).label("sms_nhac_no_vay"),
        func.max(CustomerPeriodBranchDetail.the_ghi_no_noi_dia).label("the_ghi_no_noi_dia"),
        func.max(CustomerPeriodBranchDetail.the_td_quoc_te).label("the_td_quoc_te"),
        func.max(CustomerPeriodBranchDetail.the_td_loc_viet).label("the_td_loc_viet"),
        func.max(CustomerPeriodBranchDetail.loai_khach_hang).label("loai_khach_hang"),
    ).filter(
        CustomerPeriodBranchDetail.period_key == period_key,
        CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
    )
    if pgd_code:
        query = query.filter(CustomerPeriodBranchDetail.ma_pgd == pgd_code.strip())
    return query.group_by(CustomerPeriodBranchDetail.ma_kh).subquery()


def _branch_cross_sell_condition(agg):
    retail = agg.c.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES)
    return or_(
        and_(
            retail,
            (func.coalesce(agg.c.so_du_tien_gui, 0) + func.coalesce(agg.c.so_du_tgtt_binh_quan, 0)) >= GROUP_DEPOSIT_THRESHOLD,
            func.coalesce(agg.c.agribank_plus, 0) == 0,
        ),
        and_(func.coalesce(agg.c.so_du_tien_vay, 0) > 0, func.coalesce(agg.c.sms_nhac_no_vay, 0) == 0),
        and_(
            retail,
            func.coalesce(agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD,
            func.coalesce(agg.c.the_ghi_no_noi_dia, 0) == 0,
            func.coalesce(agg.c.the_td_quoc_te, 0) == 0,
            func.coalesce(agg.c.the_td_loc_viet, 0) == 0,
        ),
    )


def _ma_kh_query_for_group_at_branch(
    db: Session,
    period_key: str,
    branch_code: str,
    pgd_code: str | None,
    group_key: str,
):
    """Danh sách mã KH thuộc nhóm phân tích, tính trên số liệu đúng tại CN/PGD."""
    agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
    if group_key == "large_deposit":
        return db.query(agg.c.ma_kh).filter(
            (func.coalesce(agg.c.so_du_tien_gui, 0) + func.coalesce(agg.c.so_du_tgtt_binh_quan, 0)) >= GROUP_DEPOSIT_THRESHOLD
        )
    if group_key == "large_loan":
        return db.query(agg.c.ma_kh).filter(func.coalesce(agg.c.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD)
    if group_key == "high_casa":
        return db.query(agg.c.ma_kh).filter(func.coalesce(agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD)
    if group_key == "cross_sell":
        return db.query(agg.c.ma_kh).filter(_branch_cross_sell_condition(agg))
    if group_key in {"multi_branch", "primary_location_attention"}:
        scoped = db.query(agg.c.ma_kh)
        profile_filter = (
            and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))
            if group_key == "primary_location_attention"
            else CustomerPeriodProfile.branch_count > 1
        )
        return (
            db.query(CustomerPeriodProfile.ma_kh)
            .filter(
                CustomerPeriodProfile.period_key == period_key,
                CustomerPeriodProfile.ma_kh.in_(scoped),
                profile_filter,
            )
        )
    return None


def profile_brief_fields() -> list[str]:
    return [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "ten_kh",
        "loai_khach_hang",
        "branch_codes",
        "pgd_codes",
        "branch_count",
        "pgd_count",
        "so_du_tien_gui",
        "doanh_so_chuyen_tien_ve_tk",
        "so_du_tien_vay",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
        "telephone",
        "primary_branch_code",
        "primary_pgd_code",
        "primary_pgd_name",
        "primary_location_score",
        "primary_location_reason",
        *sorted(PROFILE_SERVICE_FIELDS),
    ]


def split_filter_values(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


PROFILE_SORT_COLUMNS = {
    "ma_cn": CustomerPeriodProfile.primary_branch_code,
    "ten_cn": CustomerPeriodProfile.primary_branch_code,
    "ma_pgd": CustomerPeriodProfile.primary_pgd_code,
    "ma_kh_chuan": CustomerPeriodProfile.ma_kh,
    "ma_kh": CustomerPeriodProfile.ma_kh,
    "ten_kh": CustomerPeriodProfile.ten_kh,
    "loai_khach_hang": CustomerPeriodProfile.loai_khach_hang,
    "so_du_tien_vay": CustomerPeriodProfile.so_du_tien_vay,
    "so_du_tien_gui_ckh": CustomerPeriodProfile.so_du_tien_gui,
    "so_du_tien_gui": CustomerPeriodProfile.so_du_tien_gui,
    "loai_vay": CustomerPeriodProfile.loai_vay,
    "dsctt": CustomerPeriodProfile.doanh_so_chuyen_tien_ve_tk,
    "doanh_so_chuyen_tien_ve_tai_khoan": CustomerPeriodProfile.doanh_so_chuyen_tien_ve_tk,
    "so_du_tgtt_binh_quan": CustomerPeriodProfile.so_du_tgtt_binh_quan,
    "can_bo": CustomerPeriodProfile.ten_can_bo,
    "ten_can_bo": CustomerPeriodProfile.ten_can_bo,
    "branch_count": CustomerPeriodProfile.branch_count,
}

# Sort số → NULL/None coi như 0 để DESC/ASC ổn định.
PROFILE_NUMERIC_SORT_KEYS = {
    "so_du_tien_vay",
    "so_du_tien_gui_ckh",
    "so_du_tien_gui",
    "dsctt",
    "doanh_so_chuyen_tien_ve_tai_khoan",
    "so_du_tgtt_binh_quan",
    "branch_count",
}

# Khi lọc CN/PGD: sort dư nợ/CKH/CASA theo số liệu đúng phạm vi (branch_details).
BRANCH_SCOPE_SORT_FIELDS = {
    "so_du_tien_vay": "so_du_tien_vay",
    "so_du_tien_gui_ckh": "so_du_tien_gui",
    "so_du_tien_gui": "so_du_tien_gui",
    "so_du_tgtt_binh_quan": "so_du_tgtt_binh_quan",
}


def apply_profile_filters(
    query,
    *,
    period_key: str | None = None,
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    multi_branch: bool | None = None,
    no_service: bool = False,
):
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                CustomerPeriodProfile.ma_kh.ilike(like),
                CustomerPeriodProfile.ten_kh.ilike(like),
                CustomerPeriodProfile.ma_cb.ilike(like),
                CustomerPeriodProfile.ten_can_bo.ilike(like),
                CustomerPeriodProfile.telephone.ilike(like),
            )
        )
    if branch_code:
        query = query.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{branch_code.strip()}%"))
    if pgd_code:
        query = query.filter(CustomerPeriodProfile.pgd_codes.ilike(f"%{pgd_code.strip()}%"))
    if loan_type:
        loan_types = split_filter_values(loan_type)
        if loan_types:
            query = query.filter(or_(*(CustomerPeriodProfile.loai_vay.ilike(f"%{item}%") for item in loan_types)))
    if officer_code:
        query = query.filter(CustomerPeriodProfile.ma_cb == officer_code)
    if multi_branch is not None:
        query = query.filter(CustomerPeriodProfile.branch_count > 1 if multi_branch else CustomerPeriodProfile.branch_count <= 1)
    unused_services = [item for item in split_filter_values(unused_service) if item in PROFILE_SERVICE_FIELDS]
    for service in unused_services:
        query = query.filter(getattr(CustomerPeriodProfile, service) == 0)
    if group_key:
        branch_group_keys = {
            "large_deposit",
            "large_loan",
            "high_casa",
            "cross_sell",
            "multi_branch",
            "primary_location_attention",
        }
        if branch_code and period_key and group_key in branch_group_keys:
            ma_kh_query = _ma_kh_query_for_group_at_branch(
                query.session,
                period_key,
                branch_code,
                pgd_code,
                group_key,
            )
            if ma_kh_query is not None:
                query = query.filter(CustomerPeriodProfile.ma_kh.in_(ma_kh_query))
            else:
                condition = group_condition(group_key)
                if condition is not None:
                    query = query.filter(condition)
        else:
            condition = group_condition(group_key)
            if condition is not None:
                query = query.filter(condition)
    if no_service:
        query = query.filter(no_service_condition())
    return query


def apply_profile_sort(
    query,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    *,
    db: Session | None = None,
    period_key: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
):
    """Sắp xếp toàn bộ kết quả đã lọc (trước phân trang).

    Có lọc CN/PGD + sort dư nợ/CKH/CASA → xếp theo số phát sinh đúng phạm vi lọc.
    """
    sort_key = (sort_by or "").strip()
    direction = (sort_dir or "").strip().lower()
    order_fn = desc if direction == "desc" else asc

    if (
        db is not None
        and period_key
        and branch_code
        and direction in {"asc", "desc"}
        and sort_key in BRANCH_SCOPE_SORT_FIELDS
    ):
        agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
        amount_col = getattr(agg.c, BRANCH_SCOPE_SORT_FIELDS[sort_key])
        query = query.outerjoin(agg, CustomerPeriodProfile.ma_kh == agg.c.ma_kh)
        return query.order_by(order_fn(func.coalesce(amount_col, 0)), CustomerPeriodProfile.ma_kh)

    column = PROFILE_SORT_COLUMNS.get(sort_key)
    if column is None or direction not in {"asc", "desc"}:
        return query.order_by(desc(CustomerPeriodProfile.branch_count), CustomerPeriodProfile.ma_kh)
    order_expr = func.coalesce(column, 0) if sort_key in PROFILE_NUMERIC_SORT_KEYS else column
    return query.order_by(order_fn(order_expr), CustomerPeriodProfile.ma_kh)


def _branch_finance_by_ma_kh(
    db: Session,
    period_key: str,
    branch_code: str,
    pgd_code: str | None,
    ma_khs: list[str],
) -> dict[str, object]:
    if not ma_khs:
        return {}
    agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
    rows = (
        db.query(
            agg.c.ma_kh,
            agg.c.so_du_tien_vay,
            agg.c.so_du_tien_gui,
            agg.c.so_du_tgtt_binh_quan,
        )
        .filter(agg.c.ma_kh.in_(ma_khs))
        .all()
    )
    return {row.ma_kh: row for row in rows}


def _apply_branch_finance_to_payloads(
    db: Session,
    period_key: str,
    branch_code: str | None,
    pgd_code: str | None,
    payloads: list[dict],
) -> list[dict]:
    """Khi đang lọc CN/PGD: số dư trên payload = số phát sinh đúng phạm vi (khớp sort/nhóm)."""
    if not branch_code or not payloads:
        return payloads
    finance_map = _branch_finance_by_ma_kh(
        db,
        period_key,
        branch_code,
        pgd_code,
        [str(item.get("ma_kh") or "") for item in payloads if item.get("ma_kh")],
    )
    for item in payloads:
        fin = finance_map.get(str(item.get("ma_kh") or ""))
        if fin is None:
            item["so_du_tien_vay"] = 0
            item["so_du_tien_gui"] = 0
            item["so_du_tgtt_binh_quan"] = 0
            continue
        item["so_du_tien_vay"] = serialize_value(fin.so_du_tien_vay)
        item["so_du_tien_gui"] = serialize_value(fin.so_du_tien_gui)
        item["so_du_tgtt_binh_quan"] = serialize_value(fin.so_du_tgtt_binh_quan)
    return payloads


@router.get("/periods")
def list_processing_periods(db: Session = Depends(get_db)):
    batches = db.query(ImportBatch).order_by(desc(ImportBatch.period_key)).all()
    result = []
    for batch in batches:
        summary = get_period_file_summary(db, batch.period_key)
        last_job = (
            db.query(CustomerProcessingJob)
            .filter(CustomerProcessingJob.period_key == batch.period_key)
            .order_by(desc(CustomerProcessingJob.created_at))
            .first()
        )
        profile_count = (
            db.query(CustomerPeriodProfile)
            .filter(CustomerPeriodProfile.period_key == batch.period_key)
            .count()
        )
        payload = serialize_model(batch, ["id", "period_key", "period_date", "status", "description", "created_at"])
        payload.update(
            {
                "required_types": list(REQUIRED_FILE_TYPES),
                "success_by_type": summary["success_by_type"],
                "error_by_type": summary["error_by_type"],
                "processing_by_type": summary["processing_by_type"],
                "required_file_count": summary["required_file_count"],
                "available_required_file_count": summary["available_required_file_count"],
                "total_file_count": summary["total_file_count"],
                "optional_file_count": summary["optional_file_count"],
                "is_ready": summary["is_ready"],
                "branch_codes": summary["branch_codes"],
                "branch_count": summary["branch_count"],
                "ready_branch_count": summary["ready_branch_count"],
                "required_matrix_count": summary["required_matrix_count"],
                "available_matrix_count": summary["available_matrix_count"],
                "branch_readiness_percent": summary["branch_readiness_percent"],
                "missing_required_files": summary["missing_required_files"],
                "is_fully_ready": summary["is_fully_ready"],
                "profile_count": profile_count,
                "last_job": serialize_job(last_job),
            }
        )
        result.append(payload)
    return result


@router.post("/optional-files")
def upload_optional_file(
    period_key: str = Query(...),
    note: str | None = Query(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    try:
        item = save_optional_file(db, period_key, file, note=note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_model(
        item,
        ["id", "period_key", "original_filename", "file_ext", "file_size", "status", "note", "uploaded_at"],
    )


@router.get("/optional-files")
def list_optional_files(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerProcessingOptionalFile)
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .order_by(desc(CustomerProcessingOptionalFile.uploaded_at))
        .all()
    )
    return [
        serialize_model(
            item,
            ["id", "period_key", "original_filename", "file_ext", "file_size", "status", "note", "uploaded_at"],
        )
        for item in rows
    ]


@router.get("/exchange-rates")
def list_exchange_rates(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerPeriodExchangeRate)
        .filter(CustomerPeriodExchangeRate.period_key == period_key)
        .order_by(CustomerPeriodExchangeRate.ccy)
        .all()
    )
    return [
        serialize_model(item, ["id", "period_key", "ccy", "exchange_rate", "source", "created_at"])
        for item in rows
    ]


@router.post("/jobs/{period_key}")
def start_processing_job(
    period_key: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    running = (
        db.query(CustomerProcessingJob)
        .filter(
            CustomerProcessingJob.period_key == period_key,
            CustomerProcessingJob.status.in_(["queued", "processing"]),
        )
        .first()
    )
    if running:
        return serialize_job(running)

    try:
        job = create_processing_job(db, period_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(process_customer_period, job.id)
    return serialize_job(job)


@router.post("/jobs/{period_key}/recover")
def recover_processing_job(
    period_key: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    active_processing_query = db.execute(
        text(
            """
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state = 'active'
              AND (
                query LIKE '%customer_period_branch_details%'
                OR query LIKE '%customer_period_profiles%'
              )
            """
        )
    ).scalar() or 0
    if active_processing_query > 0:
        raise HTTPException(
            status_code=409,
            detail="PostgreSQL vẫn đang có query xử lý dữ liệu chạy thật. Không tạo job mới để tránh chạy trùng và khóa dữ liệu.",
        )

    running_jobs = (
        db.query(CustomerProcessingJob)
        .filter(
            CustomerProcessingJob.period_key == period_key,
            CustomerProcessingJob.status.in_(["queued", "processing"]),
        )
        .order_by(desc(CustomerProcessingJob.created_at))
        .all()
    )
    for running in running_jobs:
        running.status = "error"
        running.stage = "Job xử lý bị kẹt, đã tạo job mới để chạy lại"
        running.error_message = "Job cũ không còn tiến trình xử lý thực tế hoặc backend đã reload giữa chừng."
        running.finished_at = datetime.now(timezone.utc)
    if running_jobs:
        db.commit()

    try:
        job = create_processing_job(db, period_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(process_customer_period, job.id)
    return serialize_job(job)


@router.get("/jobs")
def list_jobs(period_key: str | None = None, db: Session = Depends(get_db)):
    query = db.query(CustomerProcessingJob)
    if period_key:
        query = query.filter(CustomerProcessingJob.period_key == period_key)
    rows = query.order_by(desc(CustomerProcessingJob.created_at)).limit(20).all()
    return [serialize_job(item) for item in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(CustomerProcessingJob).filter(CustomerProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy job xử lý dữ liệu")
    return serialize_job(job)


@router.get("/profiles")
def list_profiles(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    no_service: bool = False,
    multi_branch: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    limit: int | None = Query(default=None, ge=1, le=1000),
    include_total: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
        no_service=no_service,
    )
    total = query.count() if include_total else None
    query = apply_profile_sort(
        query,
        sort_by=sort_by,
        sort_dir=sort_dir,
        db=db,
        period_key=period_key,
        branch_code=branch_code,
        pgd_code=pgd_code,
    )

    fields = [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "ten_kh",
        "loai_khach_hang",
        "branch_codes",
        "pgd_codes",
        "branch_count",
        "pgd_count",
        "dp_record_count",
        "so_du_tien_gui",
        "doanh_so_chuyen_tien_ve_tk",
        "so_du_tien_vay",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "thau_chi",
        "tk_so_dep",
        "agribank_plus",
        "tin_nhan_ott",
        "e_banking",
        "sms_nhac_no_vay",
        "sms_tien_gui",
        "the_ghi_no_noi_dia",
        "the_td_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phat_hanh_lc",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
        "telephone",
        "primary_branch_code",
        "primary_pgd_code",
        "primary_pgd_name",
        "primary_location_score",
        "primary_location_reason",
        "branch_details",
        "processing_job_id",
    ]
    effective_page_size = limit if isinstance(limit, int) else page_size
    rows = (
        query
        .offset((page - 1) * effective_page_size)
        .limit(effective_page_size)
        .all()
    )
    items = _apply_branch_finance_to_payloads(
        db,
        period_key,
        branch_code,
        pgd_code,
        [serialize_model(item, fields) for item in rows],
    )
    if include_total:
        return {"items": items, "total": total, "page": page, "page_size": effective_page_size}
    return items


EXPORT_MAX_ROWS = 100_000

PROFILE_EXPORT_COLUMNS = [
    ("ma_kh", "Mã KH"),
    ("ten_kh", "Tên KH"),
    ("loai_khach_hang", "Loại KH"),
    ("branch_codes", "Mã CN"),
    ("primary_branch_code", "CN chính"),
    ("pgd_codes", "PGD"),
    ("primary_pgd_code", "PGD chính"),
    ("primary_pgd_name", "Tên PGD chính"),
    ("so_du_tien_vay", "Dư nợ vay"),
    ("so_du_tien_gui", "Tiền gửi CKH"),
    ("so_du_tgtt_binh_quan", "TGTT bình quân"),
    ("doanh_so_chuyen_tien_ve_tk", "DS chuyển tiền về TK"),
    ("loai_vay", "Loại vay"),
    ("ma_cb", "Mã cán bộ"),
    ("ten_can_bo", "Tên cán bộ"),
    ("telephone", "Số điện thoại"),
    ("branch_count", "Số CN"),
    ("pgd_count", "Số PGD"),
    ("thau_chi", "Thấu chi"),
    ("tk_so_dep", "TK số đẹp"),
    ("agribank_plus", "Agribank Plus"),
    ("tin_nhan_ott", "Tin nhắn OTT"),
    ("sms_nhac_no_vay", "SMS nhắc nợ vay"),
    ("sms_tien_gui", "SMS tiền gửi"),
    ("the_ghi_no_noi_dia", "Thẻ ghi nợ nội địa"),
    ("the_td_quoc_te", "Thẻ TD quốc tế"),
    ("the_td_loc_viet", "Thẻ TD Lộc Việt"),
]


@router.get("/profiles/export")
def export_profiles(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    no_service: bool = False,
    multi_branch: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
):
    """Xuất Excel theo đúng bộ lọc báo cáo (tối đa EXPORT_MAX_ROWS dòng)."""
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
        no_service=no_service,
    )
    total = query.count()
    if total == 0:
        raise HTTPException(status_code=404, detail="Không có khách hàng phù hợp bộ lọc để xuất Excel")
    if total > EXPORT_MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Có {total:,} KH phù hợp, vượt giới hạn xuất {EXPORT_MAX_ROWS:,} dòng. "
                "Hãy thu hẹp bộ lọc (CN/PGD/cán bộ/…) rồi xuất lại."
            ),
        )

    query = apply_profile_sort(
        query,
        sort_by=sort_by,
        sort_dir=sort_dir,
        db=db,
        period_key=period_key,
        branch_code=branch_code,
        pgd_code=pgd_code,
    )
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("Bao_cao_KH")
    sheet.append([label for _, label in PROFILE_EXPORT_COLUMNS])

    field_names = [field for field, _ in PROFILE_EXPORT_COLUMNS]
    batch: list = []
    for item in query.yield_per(1_000):
        batch.append(item)
        if len(batch) >= 1_000:
            payloads = _apply_branch_finance_to_payloads(
                db,
                period_key,
                branch_code,
                pgd_code,
                [serialize_model(row, field_names) for row in batch],
            )
            for payload in payloads:
                sheet.append([payload.get(field) for field in field_names])
            batch = []
    if batch:
        payloads = _apply_branch_finance_to_payloads(
            db,
            period_key,
            branch_code,
            pgd_code,
            [serialize_model(row, field_names) for row in batch],
        )
        for payload in payloads:
            sheet.append([payload.get(field) for field in field_names])

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    filename = f"bao_cao_kh_{period_key}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Row-Count": str(total),
        },
    )


@router.get("/profile-summary")
def get_profile_summary(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    multi_branch: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
    )
    summary = query.with_entities(
        func.count(CustomerPeriodProfile.id),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_gui), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
    ).one()
    no_service_count = query.filter(no_service_condition()).count()
    return {
        "total_customers": serialize_value(summary[0]),
        "total_loan": serialize_value(summary[1]),
        "total_deposit": serialize_value(summary[2]),
        "total_casa": serialize_value(summary[3]),
        "no_service_customers": no_service_count,
    }


@router.get("/profile-groups")
def get_profile_groups(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    multi_branch: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        multi_branch=multi_branch,
    )
    scope = "branch" if branch_code else "province"
    scope_label = f"CN {branch_code.strip()}" if branch_code else "Toàn hệ thống"
    if branch_code and pgd_code:
        scope_label = f"CN {branch_code.strip()} / PGD {pgd_code.strip()}"

    if branch_code:
        agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
        eligible = query.with_entities(CustomerPeriodProfile.ma_kh)
        scoped_agg = db.query(agg).filter(agg.c.ma_kh.in_(eligible)).subquery()
        multi_branch_count = (
            query.filter(CustomerPeriodProfile.branch_count > 1).count()
        )
        primary_attention_count = (
            query.filter(
                CustomerPeriodProfile.branch_count > 1,
                CustomerPeriodProfile.primary_branch_code.isnot(None),
            ).count()
        )
        groups = [
            {
                "key": "large_deposit",
                "label": "Nhóm tiền gửi lớn",
                "description": f"CKH + TGTT tại {scope_label} từ {GROUP_DEPOSIT_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    (func.coalesce(scoped_agg.c.so_du_tien_gui, 0) + func.coalesce(scoped_agg.c.so_du_tgtt_binh_quan, 0))
                    >= GROUP_DEPOSIT_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "large_loan",
                "label": "Nhóm dư nợ lớn",
                "description": f"Dư nợ tại {scope_label} từ {GROUP_LOAN_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    func.coalesce(scoped_agg.c.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "high_casa",
                "label": "Nhóm CASA cao",
                "description": f"TGTT bình quân tại {scope_label} từ {GROUP_CASA_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    func.coalesce(scoped_agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "multi_branch",
                "label": "Nhóm khách hàng nhiều chi nhánh",
                "description": f"KH thuộc phạm vi {scope_label} và phát sinh > 1 chi nhánh",
                "count": multi_branch_count,
            },
            {
                "key": "cross_sell",
                "label": "Nhóm tiềm năng bán chéo",
                "description": f"Cơ hội bán chéo tính trên số liệu tại {scope_label}",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    _branch_cross_sell_condition(scoped_agg)
                ).scalar() or 0,
            },
            {
                "key": "primary_location_attention",
                "label": "KH cần phân công nơi chăm sóc chính",
                "description": f"KH nhiều CN trong phạm vi {scope_label}, đã có điểm giao dịch chính",
                "count": primary_attention_count,
            },
        ]
    else:
        groups = [
            {
                "key": "large_deposit",
                "label": "Nhóm tiền gửi lớn",
                "description": f"Tiền gửi CKH + TGTT bình quân từ {GROUP_DEPOSIT_THRESHOLD:,} đồng",
                "count": query.filter(
                    (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
                    >= GROUP_DEPOSIT_THRESHOLD
                ).count(),
            },
            {
                "key": "large_loan",
                "label": "Nhóm dư nợ lớn",
                "description": f"Dư nợ từ {GROUP_LOAN_THRESHOLD:,} đồng",
                "count": query.filter(func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD).count(),
            },
            {
                "key": "high_casa",
                "label": "Nhóm CASA cao",
                "description": f"TGTT bình quân từ {GROUP_CASA_THRESHOLD:,} đồng",
                "count": query.filter(func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD).count(),
            },
            {
                "key": "multi_branch",
                "label": "Nhóm khách hàng nhiều chi nhánh",
                "description": "Khách hàng phát sinh tại hơn 1 chi nhánh",
                "count": query.filter(CustomerPeriodProfile.branch_count > 1).count(),
            },
            {
                "key": "cross_sell",
                "label": "Nhóm tiềm năng bán chéo",
                "description": "Có ít nhất một cảnh báo bán chéo từ dữ liệu hiện có",
                "count": query.filter(cross_sell_condition()).count(),
            },
            {
                "key": "primary_location_attention",
                "label": "KH cần phân công nơi chăm sóc chính",
                "description": "Khách hàng nhiều chi nhánh đã xác định điểm giao dịch nổi trội",
                "count": query.filter(and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))).count(),
            },
        ]

    return {
        "period_key": period_key,
        "scope": scope,
        "scope_label": scope_label,
        "thresholds": {
            "large_deposit": GROUP_DEPOSIT_THRESHOLD,
            "large_loan": GROUP_LOAN_THRESHOLD,
            "high_casa": GROUP_CASA_THRESHOLD,
        },
        "groups": groups,
    }


@router.get("/profile-history")
def get_profile_history(ma_kh: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerPeriodProfile)
        .filter(CustomerPeriodProfile.ma_kh == ma_kh)
        .order_by(CustomerPeriodProfile.period_key)
        .all()
    )
    return [serialize_model(item, profile_brief_fields()) for item in rows]


@router.get("/period-comparison")
def compare_periods(
    current_period: str = Query(...),
    previous_period: str = Query(...),
    branch_code: str | None = None,
    pgd_code: str | None = None,
    db: Session = Depends(get_db),
):
    current_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == current_period)
    previous_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == previous_period)
    current_query = apply_profile_filters(current_query, branch_code=branch_code, pgd_code=pgd_code)
    previous_query = apply_profile_filters(previous_query, branch_code=branch_code, pgd_code=pgd_code)

    def aggregate(query):
        return query.with_entities(
            func.count(CustomerPeriodProfile.id),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_gui), 0),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
        ).one()

    current_summary = aggregate(current_query)
    previous_summary = aggregate(previous_query)

    current_rows = current_query.with_entities(
        CustomerPeriodProfile.ma_kh,
        *[getattr(CustomerPeriodProfile, field) for field in sorted(PROFILE_SERVICE_FIELDS)],
    ).all()
    previous_rows = previous_query.with_entities(
        CustomerPeriodProfile.ma_kh,
        *[getattr(CustomerPeriodProfile, field) for field in sorted(PROFILE_SERVICE_FIELDS)],
    ).all()

    service_fields = sorted(PROFILE_SERVICE_FIELDS)
    current_map = {
        row[0]: {field for index, field in enumerate(service_fields, start=1) if int(row[index] or 0) > 0}
        for row in current_rows
    }
    previous_map = {
        row[0]: {field for index, field in enumerate(service_fields, start=1) if int(row[index] or 0) > 0}
        for row in previous_rows
    }
    current_customers = set(current_map)
    previous_customers = set(previous_map)

    new_services: dict[str, int] = {field: 0 for field in service_fields}
    lost_services: dict[str, int] = {field: 0 for field in service_fields}
    for ma_kh in current_customers & previous_customers:
        for field in current_map[ma_kh] - previous_map[ma_kh]:
            new_services[field] += 1
        for field in previous_map[ma_kh] - current_map[ma_kh]:
            lost_services[field] += 1

    def number(value):
        return serialize_value(value) or 0

    return {
        "current_period": current_period,
        "previous_period": previous_period,
        "summary": {
            "customers": {
                "current": number(current_summary[0]),
                "previous": number(previous_summary[0]),
                "delta": number(current_summary[0]) - number(previous_summary[0]),
            },
            "deposit": {
                "current": number(current_summary[1]),
                "previous": number(previous_summary[1]),
                "delta": number(current_summary[1]) - number(previous_summary[1]),
            },
            "loan": {
                "current": number(current_summary[2]),
                "previous": number(previous_summary[2]),
                "delta": number(current_summary[2]) - number(previous_summary[2]),
            },
            "casa": {
                "current": number(current_summary[3]),
                "previous": number(previous_summary[3]),
                "delta": number(current_summary[3]) - number(previous_summary[3]),
            },
        },
        "new_customers": len(current_customers - previous_customers),
        "lost_customers": len(previous_customers - current_customers),
        "new_services": {key: value for key, value in new_services.items() if value > 0},
        "lost_services": {key: value for key, value in lost_services.items() if value > 0},
    }


def _load_active_org_department_registry(
    db: Session,
) -> tuple[dict[tuple[str, str], str], dict[str, set[str]], set[str]]:
    rows = (
        db.query(OrgBranch.branch_code, OrgDepartment.department_code, OrgDepartment.department_name)
        .join(OrgDepartment, OrgDepartment.branch_id == OrgBranch.id)
        .filter(OrgDepartment.department_code.isnot(None), OrgDepartment.status == "active")
        .all()
    )
    branch_pgd_to_name: dict[tuple[str, str], str] = {}
    branch_to_pgds: dict[str, set[str]] = {}
    all_pgd_codes: set[str] = set()
    for branch, pgd, name in rows:
        branch_value = str(branch or "").strip()
        pgd_value = str(pgd or "").strip()
        name_value = str(name or "").strip()
        if not pgd_value:
            continue
        all_pgd_codes.add(pgd_value)
        if branch_value:
            branch_to_pgds.setdefault(branch_value, set()).add(pgd_value)
            if name_value:
                branch_pgd_to_name[(branch_value, pgd_value)] = name_value
    return branch_pgd_to_name, branch_to_pgds, all_pgd_codes


def _pgd_allowed_in_org(
    pgd: str,
    *,
    branch_code: str | None,
    branch_to_pgds: dict[str, set[str]],
    all_pgd_codes: set[str],
) -> bool:
    if branch_code:
        return pgd in branch_to_pgds.get(branch_code.strip(), set())
    return pgd in all_pgd_codes


def _pgd_option_label(
    pgd: str,
    branch_code: str | None,
    branch_pgd_to_name: dict[tuple[str, str], str],
    pgd_name_map: dict[str, str],
) -> str:
    if branch_code:
        org_name = branch_pgd_to_name.get((branch_code.strip(), pgd))
        if org_name:
            return org_name
    scoped = pgd_name_map.get(f"{branch_code}:{pgd}") if branch_code else None
    return scoped or pgd_name_map.get(pgd) or pgd


@router.get("/profile-filter-options")
def get_profile_filter_options(
    period_key: str = Query(...),
    branch_code: str | None = None,
    pgd_code: str | None = None,
    db: Session = Depends(get_db),
):
    base_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    scoped_query = apply_profile_filters(base_query, branch_code=branch_code, pgd_code=pgd_code)

    branch_rows = (
        db.query(CustomerPeriodProfile.branch_codes)
        .filter(CustomerPeriodProfile.period_key == period_key, CustomerPeriodProfile.branch_codes.isnot(None))
        .distinct()
        .all()
    )
    branches = sorted(
        {
            item.strip()
            for row in branch_rows
            for item in str(row[0] or "").split(",")
            if item.strip()
        }
    )

    pgd_rows = scoped_query.with_entities(CustomerPeriodProfile.pgd_codes).filter(CustomerPeriodProfile.pgd_codes.isnot(None)).distinct().all()
    pgds = set()
    for row in pgd_rows:
        for item in str(row[0] or "").split(","):
            value = item.strip()
            if not value:
                continue
            if ":" in value:
                branch, pgd = [part.strip() for part in value.split(":", 1)]
                if branch_code and branch != branch_code:
                    continue
                if pgd:
                    pgds.add(pgd)
            else:
                pgds.add(value)
    branch_pgd_to_name, branch_to_pgds, all_pgd_codes = _load_active_org_department_registry(db)
    pgds = sorted(
        pgd
        for pgd in pgds
        if _pgd_allowed_in_org(
            pgd,
            branch_code=branch_code,
            branch_to_pgds=branch_to_pgds,
            all_pgd_codes=all_pgd_codes,
        )
    )

    pgd_name_map: dict[str, str] = {}
    detail_rows = (
        db.query(CustomerPeriodBranchDetail.branch_code, CustomerPeriodBranchDetail.ma_pgd, CustomerPeriodBranchDetail.ten_pgd)
        .filter(CustomerPeriodBranchDetail.period_key == period_key, CustomerPeriodBranchDetail.ma_pgd.isnot(None))
        .distinct()
        .all()
    )
    for branch, pgd, name in detail_rows:
        branch_value = str(branch or "").strip()
        pgd_value = str(pgd or "").strip()
        name_value = str(name or "").strip()
        if not pgd_value or not name_value:
            continue
        pgd_name_map.setdefault(pgd_value, name_value)
        if branch_value:
            pgd_name_map.setdefault(f"{branch_value}:{pgd_value}", name_value)

    for (branch_value, pgd_value), name_value in branch_pgd_to_name.items():
        pgd_name_map.setdefault(pgd_value, name_value)
        pgd_name_map.setdefault(f"{branch_value}:{pgd_value}", name_value)

    pgd_options = [
        {
            "value": pgd,
            "label": _pgd_option_label(pgd, branch_code, branch_pgd_to_name, pgd_name_map),
        }
        for pgd in pgds
    ]

    loan_rows = scoped_query.with_entities(CustomerPeriodProfile.loai_vay).filter(CustomerPeriodProfile.loai_vay.isnot(None)).distinct().all()
    loan_types = sorted(
        {
            item.strip()
            for row in loan_rows
            for item in str(row[0] or "").split("/")
            if item.strip()
        }
    )

    officer_rows = (
        scoped_query.with_entities(
            CustomerPeriodProfile.ma_cb,
            func.max(CustomerPeriodProfile.ten_can_bo),
            func.max(CustomerPeriodProfile.officer_employee_code),
        )
        .filter(CustomerPeriodProfile.ma_cb.isnot(None))
        .group_by(CustomerPeriodProfile.ma_cb)
        .order_by(func.max(CustomerPeriodProfile.ten_can_bo), CustomerPeriodProfile.ma_cb)
        .limit(1000)
        .all()
    )
    officers = [
        {
            "value": row[0],
            "label": f"{row[1] or row[0]} ({row[2] or '-'} - {row[0]})",
        }
        for row in officer_rows
        if row[0]
    ]

    return {
        "branches": branches,
        "pgds": pgds,
        "pgd_options": pgd_options,
        "pgd_names": pgd_name_map,
        "loan_types": loan_types,
        "officers": officers,
    }


@router.get("/branch-details")
def list_branch_details(period_key: str = Query(...), ma_kh: str = Query(...), db: Session = Depends(get_db)):
    profile = (
        db.query(CustomerPeriodProfile)
        .filter(CustomerPeriodProfile.period_key == period_key, CustomerPeriodProfile.ma_kh == ma_kh)
        .first()
    )
    rows = (
        db.query(CustomerPeriodBranchDetail)
        .filter(CustomerPeriodBranchDetail.period_key == period_key, CustomerPeriodBranchDetail.ma_kh == ma_kh)
        .order_by(CustomerPeriodBranchDetail.branch_code, CustomerPeriodBranchDetail.ma_pgd)
        .all()
    )
    fields = [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "branch_code",
        "ma_pgd",
        "ten_pgd",
        "ten_kh",
        "loai_khach_hang",
        "dp_record_count",
        "so_du_tien_gui",
        "doanh_so_cramt",
        "doanh_so_dramt",
        "so_du_tien_vay",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "thau_chi",
        "tk_so_dep",
        "agribank_plus",
        "tin_nhan_ott",
        "e_banking",
        "sms_nhac_no_vay",
        "sms_tien_gui",
        "the_ghi_no_noi_dia",
        "the_td_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phat_hanh_lc",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
    ]
    result = []
    for item in rows:
        payload = serialize_model(item, fields)
        service_count = sum(int(payload.get(field) or 0) for field in PROFILE_SERVICE_FIELDS)
        financial_value = (
            float(payload.get("so_du_tien_vay") or 0)
            + float(payload.get("so_du_tien_gui") or 0)
            + float(payload.get("so_du_tgtt_binh_quan") or 0)
        )
        engagement_score = round(
            financial_value / 1_000_000 * 0.40
            + float(payload.get("doanh_so_cramt") or 0) / 1_000_000 * 0.20
            + service_count * 10 * 0.30
            + int(payload.get("dp_record_count") or 0) * 2 * 0.10,
            2,
        )
        reasons = []
        if float(payload.get("so_du_tien_vay") or 0) > 0:
            reasons.append("Có dư nợ")
        if float(payload.get("so_du_tien_gui") or 0) > 0:
            reasons.append("Có tiền gửi CKH")
        if float(payload.get("so_du_tgtt_binh_quan") or 0) > 0:
            reasons.append("Có TGTT bình quân")
        if float(payload.get("doanh_so_cramt") or 0) > 0:
            reasons.append("Có doanh số chuyển tiền về TK")
        if service_count > 0:
            reasons.append("Có dịch vụ đang dùng")
        payload.update(
            {
                "service_count": service_count,
                "financial_value": financial_value,
                "engagement_score": engagement_score,
                "engagement_reason": "; ".join(reasons),
                "has_primary_location": bool(profile and profile.primary_branch_code),
                "is_primary_location": bool(
                    profile
                    and profile.primary_branch_code == payload.get("branch_code")
                    and (profile.primary_pgd_code or "") == (payload.get("ma_pgd") or "")
                ),
            }
        )
        result.append(payload)
    return sorted(
        result,
        key=lambda row: (
            0 if row.get("is_primary_location") else 1,
            -float(row.get("engagement_score") or 0),
            str(row.get("branch_code") or ""),
            str(row.get("ma_pgd") or ""),
        ),
    )
