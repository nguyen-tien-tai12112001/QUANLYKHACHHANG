from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, desc, func, or_
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
}


def no_service_condition():
    return and_(*(getattr(CustomerPeriodProfile, field) == 0 for field in PROFILE_SERVICE_FIELDS))


def split_filter_values(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def apply_profile_filters(
    query,
    *,
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
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
    if no_service:
        query = query.filter(no_service_condition())
    return query


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
    no_service: bool = False,
    multi_branch: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    limit: int | None = Query(default=None, ge=1, le=1000),
    include_total: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        multi_branch=multi_branch,
        no_service=no_service,
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
        "ma_cb",
        "ten_can_bo",
        "telephone",
        "branch_details",
        "processing_job_id",
    ]
    total = query.count() if include_total else None
    effective_page_size = limit if isinstance(limit, int) else page_size
    rows = (
        query.order_by(desc(CustomerPeriodProfile.branch_count), CustomerPeriodProfile.ma_kh)
        .offset((page - 1) * effective_page_size)
        .limit(effective_page_size)
        .all()
    )
    items = [serialize_model(item, fields) for item in rows]
    if include_total:
        return {"items": items, "total": total, "page": page, "page_size": effective_page_size}
    return items


@router.get("/profile-summary")
def get_profile_summary(
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
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
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
    pgds = sorted(pgds)

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

    department_rows = (
        db.query(OrgBranch.branch_code, OrgDepartment.department_code, OrgDepartment.department_name)
        .join(OrgDepartment, OrgDepartment.branch_id == OrgBranch.id)
        .filter(OrgDepartment.department_code.isnot(None))
        .all()
    )
    for branch, pgd, name in department_rows:
        branch_value = str(branch or "").strip()
        pgd_value = str(pgd or "").strip()
        name_value = str(name or "").strip()
        if not pgd_value or not name_value:
            continue
        pgd_name_map.setdefault(pgd_value, name_value)
        if branch_value:
            pgd_name_map.setdefault(f"{branch_value}:{pgd_value}", name_value)

    pgd_options = [
        {
            "value": pgd,
            "label": (pgd_name_map.get(f"{branch_code}:{pgd}") if branch_code else None) or pgd_name_map.get(pgd) or pgd,
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
        scoped_query.with_entities(CustomerPeriodProfile.ma_cb, CustomerPeriodProfile.ten_can_bo)
        .filter(CustomerPeriodProfile.ma_cb.isnot(None))
        .distinct()
        .order_by(CustomerPeriodProfile.ten_can_bo, CustomerPeriodProfile.ma_cb)
        .limit(1000)
        .all()
    )
    officers = [
        {"value": row.ma_cb, "label": f"{row.ten_can_bo or row.ma_cb} ({row.ma_cb})"}
        for row in officer_rows
        if row.ma_cb
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
        "ma_cb",
        "ten_can_bo",
    ]
    return [serialize_model(item, fields) for item in rows]
