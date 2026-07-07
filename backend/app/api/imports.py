from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.imports.importer import (
    delete_import_file_rows,
    import_uploaded_file,
    process_delete_import_file,
    process_import_file,
    queue_uploaded_file,
)
from app.imports.summarizer import summarize_period
from app.models import CustomerPeriodSummary, ImportBatch, ImportFile, ReportSourceStatus


router = APIRouter(prefix="/api/imports", tags=["imports"])


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def serialize_model(model, fields: list[str]) -> dict:
    return {field: serialize_value(getattr(model, field)) for field in fields}


def compact_error_message(exc: Exception) -> str:
    message = str(exc)
    for marker in ("[SQL:", "[parameters:"):
        if marker in message:
            message = message.split(marker, 1)[0].strip()
    return message[:1000]


@router.post("/upload")
def upload_import_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    replace_existing: bool = Query(default=False),
    background: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    try:
        if background:
            import_file = queue_uploaded_file(db, file, replace_existing=replace_existing)
            background_tasks.add_task(process_import_file, import_file.id)
        else:
            import_file = import_uploaded_file(db, file, replace_existing=replace_existing)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=compact_error_message(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=compact_error_message(exc)) from exc

    return {
        "id": import_file.id,
        "original_filename": import_file.original_filename,
        "file_type": import_file.file_type,
        "branch_code": import_file.branch_code,
        "period_key": import_file.period_key,
        "status": import_file.status,
        "total_rows": import_file.total_rows,
        "success_rows": import_file.success_rows,
        "error_rows": import_file.error_rows,
        "background": background,
        "summary_required": True,
    }


@router.get("/files")
def list_import_files(
    period_key: str | None = None,
    file_type: str | None = None,
    branch_code: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    uploaded_from: str | None = None,
    uploaded_to: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ImportFile)
    if period_key:
        query = query.filter(ImportFile.period_key == period_key)
    if file_type:
        query = query.filter(ImportFile.file_type == file_type.upper())
    if branch_code:
        query = query.filter(ImportFile.branch_code == branch_code.strip())
    if status:
        query = query.filter(ImportFile.status == status)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(or_(ImportFile.original_filename.ilike(like), ImportFile.stored_filename.ilike(like)))
    if uploaded_from:
        query = query.filter(ImportFile.uploaded_at >= datetime.fromisoformat(uploaded_from))
    if uploaded_to:
        to_value = datetime.fromisoformat(uploaded_to)
        if to_value.hour == 0 and to_value.minute == 0 and to_value.second == 0:
            to_value = to_value.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(ImportFile.uploaded_at <= to_value)

    files = query.order_by(desc(ImportFile.uploaded_at)).all()
    return [
        serialize_model(
            item,
            [
                "id",
                "original_filename",
                "file_type",
                "branch_code",
                "period_key",
                "file_size",
                "total_rows",
                "success_rows",
                "error_rows",
                "status",
                "error_message",
                "uploaded_at",
            ],
        )
        for item in files
    ]


@router.get("/periods")
def list_periods(db: Session = Depends(get_db)):
    periods = db.query(ImportBatch).order_by(desc(ImportBatch.period_key)).all()
    files = db.query(
        ImportFile.period_key,
        ImportFile.file_type,
        ImportFile.branch_code,
        ImportFile.file_size,
        ImportFile.status,
    ).all()
    files_by_period = {}
    for file in files:
        files_by_period.setdefault(file.period_key, []).append(file)

    result = []
    for item in periods:
        period_files = files_by_period.get(item.period_key, [])
        active_files = [file for file in period_files if file.status not in {"deleted", "replaced", "deleting"}]
        file_types = sorted({file.file_type for file in active_files})
        branches = sorted({file.branch_code for file in active_files})
        payload = serialize_model(item, ["id", "period_key", "period_date", "status", "description", "created_at"])
        payload.update(
            {
                "file_count": len(active_files),
                "history_count": len(period_files),
                "total_size": sum(file.file_size or 0 for file in active_files),
                "file_types": file_types,
                "branches": branches,
            }
        )
        result.append(payload)
    return result


@router.delete("/files/{file_id}")
def delete_import_file(
    file_id: int,
    background_tasks: BackgroundTasks,
    background: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    import_file = db.query(ImportFile).filter(ImportFile.id == file_id).first()
    if not import_file:
        raise HTTPException(status_code=404, detail="Không tìm thấy file import")
    if import_file.status == "deleted":
        return {"id": file_id, "status": "deleted", "message": "File đã được xóa trước đó"}

    period_key = import_file.period_key
    original_filename = import_file.original_filename

    if background:
        import_file.status = "deleting"
        import_file.error_message = f"Deleting original filename: {original_filename}"
        db.commit()
        background_tasks.add_task(process_delete_import_file, file_id)
        return {"id": file_id, "status": "deleting", "period_key": period_key, "summary_required": True}

    delete_import_file_rows(db, file_id)

    import_file.status = "deleted"
    import_file.error_message = f"Deleted original filename: {original_filename}"
    import_file.original_filename = f"{original_filename}.deleted.{file_id}"
    db.commit()

    return {"id": file_id, "status": "deleted", "period_key": period_key, "summary_required": True}


@router.post("/summarize/{period_key}")
def summarize(period_key: str, db: Session = Depends(get_db)):
    count = summarize_period(db, period_key)
    return {"period_key": period_key, "summary_rows": count}


@router.get("/report-sources")
def list_report_sources(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(ReportSourceStatus)
        .filter(ReportSourceStatus.period_key == period_key)
        .order_by(ReportSourceStatus.source_code)
        .all()
    )
    fields = [
        "period_key",
        "period_date",
        "source_code",
        "source_name",
        "source_table",
        "status",
        "file_count",
        "success_file_count",
        "error_file_count",
        "row_count",
        "customer_count",
        "total_file_size",
        "mapped_fields",
        "message",
        "built_at",
    ]
    return [serialize_model(item, fields) for item in rows]


@router.get("/summary")
def list_summary(
    period_key: str = Query(...),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CustomerPeriodSummary)
        .filter(CustomerPeriodSummary.period_key == period_key)
        .order_by(CustomerPeriodSummary.ma_kh_chuan)
        .limit(limit)
        .all()
    )
    fields = [
        "period_key",
        "ma_kh_chuan",
        "ma_cn",
        "ma_pgd",
        "ma_kh",
        "ten_kh",
        "loai_khach_hang",
        "so_du_tien_vay",
        "so_du_tien_gui_ckh",
        "loai_vay",
        "doanh_so_chuyen_tien_ve_tai_khoan",
        "so_du_tgtt_binh_quan",
        "thau_chi",
        "tk_so_dep",
        "agribank_plus",
        "tin_nhan_ott",
        "e_banking",
        "sms_nhac_no_vay",
        "sms_tien_gui",
        "the_ghi_no_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "tt_tien_dien",
        "tt_tien_nuoc",
        "tt_cuoc_vien_thong",
        "tra_luong_qua_the",
        "batd",
        "batk",
        "bh_oto_xe_may",
        "bh_khac",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phan_mem_ban_hang",
        "pos",
        "chi_tra_kieu_hoi",
        "phat_hanh_lc",
        "thanh_toan_quoc_te",
        "mua_ban_ngoai_te",
        "tong_loi_ich_thang",
        "ma_cb",
        "ten_can_bo",
        "telephone",
        "ghi_chu",
    ]
    return [serialize_model(item, fields) for item in rows]
