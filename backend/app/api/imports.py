import calendar
import os
import subprocess
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, distinct, func, or_
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth.branch_scope import BranchScope
from app.auth.dependencies import get_branch_scope, require_any_permission
from app.analysis_cache import get_shared_analysis_cache, set_shared_analysis_cache
from app.config import settings
from app.database import get_db
from app.imports.importer import (
    delete_import_file_rows,
    enqueue_import_file,
    import_uploaded_file,
    queue_uploaded_file,
    recover_import_jobs,
    remove_stored_upload_file,
)
from app.imports.summarizer import SOURCE_CONFIGS, refresh_report_sources, summarize_period
from app.models import (
    AuditLog,
    BC06CustomerClassification,
    BC29CustomerCreditRisk,
    CN05CustomerService,
    CustomerDepositPeriodMetric,
    CustomerFeePeriodMetric,
    CustomerLoanPeriodMetric,
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerPeriodSummary,
    CustomerProductPeriodStatus,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    CustomerRevenuePeriodMetric,
    CustomerSourceReconciliation,
    DP01DepositAccount,
    FTPLNDailyLoanFTP,
    ImportBatch,
    ImportFile,
    LN01Loan,
    KH02CustomerTransaction,
    PF10LoanProfitability,
    PF14AccountBalance,
    ReportSourceStatus,
    RR01HandledRiskLoan,
    GL02LedgerTransaction,
    SupplementalBaoLanhRecord,
    SupplementalBillPaymentTransaction,
    SupplementalOABRecord,
)


router = APIRouter(prefix="/api/imports", tags=["imports"])
RUNNING_IMPORT_STATUSES = {"queued", "processing", "deleting"}
RUNNING_PROCESSING_STATUSES = {"queued", "processing", "running"}


class DeleteDataPayload(BaseModel):
    reason: str
    backup_before_delete: bool = False
    backup_dir: str | None = None


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


def require_delete_reason(reason: str | None) -> str:
    cleaned = str(reason or "").strip()
    if len(cleaned) < 5:
        raise HTTPException(status_code=400, detail="Vui lòng nhập lý do xóa dữ liệu, tối thiểu 5 ký tự")
    return cleaned


def log_data_action(
    db: Session,
    request: Request,
    action: str,
    entity_type: str,
    entity_id: str | int | None,
    description: str,
) -> None:
    username = request.headers.get("X-C360-User") or "system"
    actor_name = unquote(request.headers.get("X-C360-User-Name") or username)
    db.add(
        AuditLog(
            actor_username=username,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            description=description,
        )
    )


def processed_customer_count(db: Session, period_key: str) -> int:
    profile_count = db.query(func.count(CustomerPeriodProfile.id)).filter(CustomerPeriodProfile.period_key == period_key).scalar() or 0
    if profile_count:
        return int(profile_count)
    return int(db.query(func.count(CustomerPeriodSummary.id)).filter(CustomerPeriodSummary.period_key == period_key).scalar() or 0)


def has_running_period_jobs(db: Session, period_key: str) -> bool:
    running_import = (
        db.query(ImportFile.id)
        .filter(ImportFile.period_key == period_key, ImportFile.status.in_(RUNNING_IMPORT_STATUSES))
        .first()
    )
    running_processing = (
        db.query(CustomerProcessingJob.id)
        .filter(CustomerProcessingJob.period_key == period_key, CustomerProcessingJob.status.in_(RUNNING_PROCESSING_STATUSES))
        .first()
    )
    return bool(running_import or running_processing)


def comparison_periods_for_delete_warning(db: Session, period_key: str) -> list[str]:
    rows = (
        db.query(CustomerPeriodProfile.period_key)
        .filter(CustomerPeriodProfile.period_key != period_key)
        .group_by(CustomerPeriodProfile.period_key)
        .order_by(desc(CustomerPeriodProfile.period_key))
        .limit(6)
        .all()
    )
    return [row.period_key for row in rows]


def mark_period_needs_reprocess(db: Session, period_key: str) -> bool:
    if processed_customer_count(db, period_key) <= 0:
        return False
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    if not batch:
        return False
    batch.status = "needs_reprocess"
    batch.note = "Cần chạy lại xử lý vì file nguồn trong kỳ đã thay đổi."
    db.add(batch)
    return True


def create_database_backup(period_key: str, backup_dir: str | None = None) -> str:
    target_dir = Path(backup_dir or (Path(__file__).resolve().parents[2] / "exports" / "backups"))
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = target_dir / f"c360_backup_truoc_xoa_ky_{period_key}_{timestamp}.dump"

    db_url = make_url(settings.DATABASE_URL)
    command = [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        str(backup_path),
    ]
    if db_url.host:
        command.extend(["--host", db_url.host])
    if db_url.port:
        command.extend(["--port", str(db_url.port)])
    if db_url.username:
        command.extend(["--username", db_url.username])
    if db_url.database:
        command.append(db_url.database)

    env = os.environ.copy()
    if db_url.password:
        env["PGPASSWORD"] = db_url.password

    try:
        result = subprocess.run(command, env=env, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="Không tìm thấy pg_dump. Hãy cài PostgreSQL client hoặc thêm thư mục bin của PostgreSQL vào PATH trước khi bật backup.",
        ) from exc
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Backup không thành công: {result.stderr or result.stdout}")
    return str(backup_path)


def delete_file_record_and_rows(db: Session, import_file: ImportFile) -> None:
    delete_import_file_rows(db, import_file.id)
    remove_stored_upload_file(import_file)
    db.delete(import_file)


def delete_period_data(db: Session, period_key: str) -> dict:
    import_files = db.query(ImportFile).filter(ImportFile.period_key == period_key).all()
    optional_files = db.query(CustomerProcessingOptionalFile).filter(CustomerProcessingOptionalFile.period_key == period_key).all()
    deleted_file_count = len(import_files) + len(optional_files)

    for import_file in import_files:
        remove_stored_upload_file(import_file)
    for optional_file in optional_files:
        if optional_file.file_path:
            try:
                path = Path(optional_file.file_path)
                if path.exists() and path.is_file():
                    path.unlink()
            except Exception:
                pass

    for model in (
        SupplementalBaoLanhRecord,
        SupplementalBillPaymentTransaction,
        SupplementalOABRecord,
        CustomerDepositPeriodMetric,
        CustomerLoanPeriodMetric,
        CustomerRevenuePeriodMetric,
        CustomerFeePeriodMetric,
        CustomerProductPeriodStatus,
        CustomerSourceReconciliation,
        CustomerPeriodBranchDetail,
        CustomerPeriodProfile,
        CustomerPeriodSummary,
        CustomerPeriodExchangeRate,
        ReportSourceStatus,
        DP01DepositAccount,
        CN05CustomerService,
        LN01Loan,
        PF10LoanProfitability,
        PF14AccountBalance,
        BC06CustomerClassification,
        BC29CustomerCreditRisk,
        KH02CustomerTransaction,
        FTPLNDailyLoanFTP,
        RR01HandledRiskLoan,
        GL02LedgerTransaction,
        CustomerProcessingOptionalFile,
        CustomerProcessingJob,
        ImportFile,
        ImportBatch,
    ):
        db.query(model).filter(model.period_key == period_key).delete(synchronize_session=False)

    return {"deleted_file_count": deleted_file_count}


@router.post("/upload", dependencies=[Depends(require_any_permission("warehouse:import"))])
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
            enqueue_import_file(import_file.id)
        else:
            import_file = import_uploaded_file(db, file, replace_existing=replace_existing)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=compact_error_message(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=compact_error_message(exc)) from exc

    affects_profile = import_file.file_type in {"DP01", "LN01", "CN05", "PF14", "RR01", "GL02"}
    needs_reprocess = mark_period_needs_reprocess(db, import_file.period_key) if affects_profile else False
    if needs_reprocess:
        db.commit()

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
        "summary_required": affects_profile,
        "needs_reprocess": needs_reprocess,
    }


@router.get("/files", dependencies=[Depends(require_any_permission("warehouse:view"))])
def list_import_files(
    period_key: str | None = None,
    file_type: str | None = None,
    branch_code: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    uploaded_from: str | None = None,
    uploaded_to: str | None = None,
    compact: bool = Query(default=False),
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
    fields = [
        "id",
        "original_filename",
        "file_type",
        "branch_code",
        "period_key",
        "business_date",
        "total_rows",
        "success_rows",
        "error_rows",
        "status",
        "error_message",
        "started_at",
        "finished_at",
        "uploaded_at",
    ] if compact else [
        "id",
        "original_filename",
        "file_type",
        "branch_code",
        "period_key",
        "period_start",
        "period_end",
        "business_date",
        "filename_suffix",
        "frequency",
        "content_sha256",
        "file_size",
        "total_rows",
        "success_rows",
        "error_rows",
        "status",
        "error_message",
        "started_at",
        "finished_at",
        "duration_seconds",
        "uploaded_at",
    ]
    return [
        serialize_model(
            item,
            fields,
        )
        for item in files
    ]


@router.get("/periods", dependencies=[Depends(require_any_permission("warehouse:view", "dashboard:view"))])
def list_periods(db: Session = Depends(get_db)):
    periods = db.query(ImportBatch).order_by(desc(ImportBatch.period_key)).all()
    files = db.query(
        ImportFile.period_key,
        ImportFile.file_type,
        ImportFile.branch_code,
        ImportFile.file_size,
        ImportFile.status,
        ImportFile.business_date,
    ).all()
    latest_success_counts = {}
    success_jobs = (
        db.query(
            CustomerProcessingJob.period_key,
            CustomerProcessingJob.total_customers,
            CustomerProcessingJob.processed_customers,
        )
        .filter(CustomerProcessingJob.status == "success")
        .order_by(desc(CustomerProcessingJob.created_at))
        .all()
    )
    for job_period, total_customers, processed_customers in success_jobs:
        latest_success_counts.setdefault(
            job_period,
            int(processed_customers or total_customers or 0),
        )
    running_import_periods = {
        row[0]
        for row in db.query(ImportFile.period_key)
        .filter(ImportFile.status.in_(RUNNING_IMPORT_STATUSES))
        .distinct()
        .all()
    }
    running_processing_periods = {
        row[0]
        for row in db.query(CustomerProcessingJob.period_key)
        .filter(CustomerProcessingJob.status.in_(RUNNING_PROCESSING_STATUSES))
        .distinct()
        .all()
    }
    comparison_period_keys = sorted(
        (key for key, count in latest_success_counts.items() if count > 0),
        reverse=True,
    )[:6]
    files_by_period = {}
    for file in files:
        files_by_period.setdefault(file.period_key, []).append(file)

    result = []
    for item in periods:
        period_files = files_by_period.get(item.period_key, [])
        active_files = [file for file in period_files if file.status not in {"deleted", "replaced", "deleting"}]
        file_types = sorted({file.file_type for file in active_files})
        branches = sorted({file.branch_code for file in active_files})
        processed_count = latest_success_counts.get(item.period_key, 0)
        ftpln_files = [file for file in active_files if file.file_type == "FTPLN"]
        ftpln_branches = {file.branch_code for file in ftpln_files}
        expected_days = calendar.monthrange(item.period_date.year, item.period_date.month)[1]
        ftpln_success_keys = {
            (file.branch_code, file.business_date)
            for file in ftpln_files
            if file.status == "success" and file.business_date is not None
        }
        ftpln_expected_count = expected_days * len(ftpln_branches) if ftpln_branches else 0
        expected_dates = {
            date(item.period_date.year, item.period_date.month, day)
            for day in range(1, expected_days + 1)
        }
        ftpln_branch_readiness = []
        for branch_code in sorted(ftpln_branches):
            success_dates = {
                file.business_date
                for file in ftpln_files
                if file.branch_code == branch_code
                and file.status == "success"
                and file.business_date is not None
            }
            missing_dates = sorted(expected_dates - success_dates)
            ftpln_branch_readiness.append(
                {
                    "branch_code": branch_code,
                    "success_days": len(success_dates),
                    "expected_days": expected_days,
                    "missing_dates": [value.isoformat() for value in missing_dates],
                }
            )
        payload = serialize_model(item, ["id", "period_key", "period_date", "status", "description", "note", "created_at"])
        payload.update(
            {
                "file_count": len(active_files),
                "history_count": len(period_files),
                "total_size": sum(file.file_size or 0 for file in active_files),
                "file_types": file_types,
                "branches": branches,
                "processed": processed_count > 0,
                "processed_customer_count": processed_count,
                "needs_reprocess": item.status == "needs_reprocess",
                "running_job": item.period_key in running_import_periods or item.period_key in running_processing_periods,
                "comparison_periods": [key for key in comparison_period_keys if key != item.period_key] if processed_count > 0 else [],
                "ftpln_readiness": {
                    "success_file_count": len(ftpln_success_keys),
                    "expected_file_count": ftpln_expected_count,
                    "is_ready": bool(ftpln_expected_count) and len(ftpln_success_keys) == ftpln_expected_count,
                    "missing_dates": sorted(
                        {
                            missing
                            for branch in ftpln_branch_readiness
                            for missing in branch["missing_dates"]
                        }
                    ),
                    "branch_readiness": ftpln_branch_readiness,
                },
            }
        )
        result.append(payload)
    return result


@router.delete("/files/{file_id}", dependencies=[Depends(require_any_permission("warehouse:delete"))])
def delete_import_file(
    file_id: int,
    payload: DeleteDataPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    reason = require_delete_reason(payload.reason)
    import_file = db.query(ImportFile).filter(ImportFile.id == file_id).first()
    if not import_file:
        raise HTTPException(status_code=404, detail="Không tìm thấy file import")
    if import_file.status in RUNNING_IMPORT_STATUSES or has_running_period_jobs(db, import_file.period_key):
        raise HTTPException(status_code=409, detail="Không thể xóa vì kỳ dữ liệu đang có job import hoặc xử lý đang chạy")

    period_key = import_file.period_key
    affects_profile = import_file.file_type in {"DP01", "LN01", "CN05", "PF14", "RR01", "GL02"}
    original_filename = import_file.original_filename
    was_processed = processed_customer_count(db, period_key) > 0
    delete_file_record_and_rows(db, import_file)
    needs_reprocess = mark_period_needs_reprocess(db, period_key) if affects_profile else False
    refresh_report_sources(db, period_key, refresh_customer_counts=False)
    log_data_action(
        db,
        request,
        action="delete_import_file",
        entity_type="import_file",
        entity_id=file_id,
        description=f"Xóa file {original_filename} thuộc kỳ {period_key}. Lý do: {reason}",
    )
    db.commit()

    return {
        "id": file_id,
        "status": "deleted",
        "period_key": period_key,
        "summary_required": True,
        "needs_reprocess": needs_reprocess or was_processed,
        "message": "Đã xóa file và dữ liệu chi tiết khỏi DB",
    }


@router.delete("/periods/{period_key}", dependencies=[Depends(require_any_permission("warehouse:delete"))])
def delete_period(
    period_key: str,
    payload: DeleteDataPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    reason = require_delete_reason(payload.reason)
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ dữ liệu")
    if has_running_period_jobs(db, period_key):
        raise HTTPException(status_code=409, detail="Không thể xóa kỳ vì đang có job import hoặc xử lý dữ liệu chạy nền")

    processed_count = processed_customer_count(db, period_key)
    comparison_periods = comparison_periods_for_delete_warning(db, period_key) if processed_count > 0 else []
    backup_path = create_database_backup(period_key, payload.backup_dir) if payload.backup_before_delete else None
    result = delete_period_data(db, period_key)
    log_data_action(
        db,
        request,
        action="delete_import_period",
        entity_type="import_period",
        entity_id=period_key,
        description=(
            f"Xóa kỳ {period_key}; {result['deleted_file_count']} file; "
            f"hồ sơ đã xử lý: {processed_count}; kỳ có thể đang dùng để so sánh: {', '.join(comparison_periods) or 'không'}; "
            f"backup: {backup_path or 'không'}; lý do: {reason}"
        ),
    )
    db.commit()
    return {
        "period_key": period_key,
        "status": "deleted",
        "deleted_file_count": result["deleted_file_count"],
        "processed_customer_count": processed_count,
        "comparison_periods": comparison_periods,
        "backup_path": backup_path,
    }

@router.post("/summarize/{period_key}", dependencies=[Depends(require_any_permission("warehouse:summarize"))])
def summarize(period_key: str, db: Session = Depends(get_db)):
    count = summarize_period(db, period_key)
    return {"period_key": period_key, "summary_rows": count}


@router.post("/jobs/recover", dependencies=[Depends(require_any_permission("processing:recover"))])
def recover_jobs(period_key: str | None = Query(default=None)):
    queued_count = recover_import_jobs(period_key=period_key)
    return {
        "status": "ok",
        "period_key": period_key,
        "queued_count": queued_count,
        "message": "Đã đưa job import bị kẹt về hàng chờ xử lý lại",
    }


@router.get("/jobs/stalled", dependencies=[Depends(require_any_permission("processing:view"))])
def list_stalled_jobs(
    period_key: str | None = Query(default=None),
    stale_minutes: int = Query(default=15, ge=5, le=1440),
    db: Session = Depends(get_db),
):
    threshold = datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)
    query = db.query(ImportFile).filter(
        or_(
            (ImportFile.status == "processing") & (ImportFile.started_at < threshold),
            (ImportFile.status == "queued") & (ImportFile.uploaded_at < threshold),
        )
    )
    if period_key:
        query = query.filter(ImportFile.period_key == period_key)
    rows = query.order_by(ImportFile.uploaded_at).all()
    return [
        {
            "id": item.id,
            "original_filename": item.original_filename,
            "file_type": item.file_type,
            "branch_code": item.branch_code,
            "period_key": item.period_key,
            "status": item.status,
            "started_at": serialize_value(item.started_at),
            "uploaded_at": serialize_value(item.uploaded_at),
            "error_message": item.error_message,
            "stalled_reason": item.error_message or (
                f"Đang xử lý quá {stale_minutes} phút nhưng chưa hoàn tất"
                if item.status == "processing"
                else f"Đã chờ quá {stale_minutes} phút nhưng worker chưa nhận"
            ),
        }
        for item in rows
    ]


@router.get("/source-readiness", dependencies=[Depends(require_any_permission("warehouse:view", "dashboard:view"))])
def source_readiness(period_key: str = Query(...), db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ dữ liệu")

    files = (
        db.query(ImportFile)
        .filter(
            ImportFile.period_key == period_key,
            ImportFile.status.notin_(["deleted", "replaced", "deleting"]),
        )
        .all()
    )
    cache_key = (
        period_key,
        tuple(sorted(
            (
                item.id,
                item.status,
                int(item.success_rows or 0),
                int(item.error_rows or 0),
                item.finished_at.isoformat() if item.finished_at else None,
            )
            for item in files
        )),
    )
    cached = get_shared_analysis_cache("source-readiness", cache_key)
    if cached is not None:
        return cached
    source_rows = []
    for source_code in ("DP01", "LN01", "CN05", "PF10", "PF14", "BC06", "BC29", "KH02", "RR01", "GL02"):
        source_files = [item for item in files if item.file_type == source_code]
        success_files = [item for item in source_files if item.status == "success"]
        source_rows.append({
            "source_code": source_code,
            "frequency": "MONTH_RANGE" if source_code in {"KH02", "GL02"} else "PERIOD",
            "expected_file_count": None,
            "received_file_count": len(source_files),
            "success_file_count": len(success_files),
            "error_file_count": len([item for item in source_files if item.status == "error"]),
            "is_ready": bool(success_files),
            "branches": sorted({item.branch_code for item in success_files}),
            "missing_dates": [],
        })

    expected_branches = sorted({
        item.branch_code for item in files
        if item.status == "success" and item.file_type in {"DP01", "LN01", "CN05", "PF10", "PF14", "BC06", "BC29", "KH02"}
    })

    rr_source = next(item for item in source_rows if item["source_code"] == "RR01")
    rr_branch_readiness = []
    for branch_code in expected_branches:
        branch_files = [item for item in files if item.file_type == "RR01" and item.branch_code == branch_code]
        successful = [item for item in branch_files if item.status == "success"]
        errors = [item for item in branch_files if item.status == "error"]
        ready = len(successful) == 1 and not errors
        rr_branch_readiness.append({
            "branch_code": branch_code, "expected_file_count": 1,
            "success_file_count": len(successful), "error_file_count": len(errors),
            "is_ready": ready,
            "message": "Đã đủ một snapshot RR01 cuối kỳ." if ready else (
                "Thiếu file RR01 cuối kỳ." if not successful else "Có nhiều file RR01 hoặc file lỗi; cần kiểm tra."
            ),
        })
    rr_source["expected_file_count"] = len(expected_branches)
    rr_source["is_ready"] = bool(rr_branch_readiness) and all(item["is_ready"] for item in rr_branch_readiness)
    rr_source["branch_readiness"] = rr_branch_readiness

    gl_source = next(item for item in source_rows if item["source_code"] == "GL02")
    gl_branch_readiness = []
    expected_days = calendar.monthrange(batch.period_date.year, batch.period_date.month)[1]
    for branch_code in expected_branches:
        branch_files = [item for item in files if item.file_type == "GL02" and item.branch_code == branch_code]
        successful = [item for item in branch_files if item.status == "success"]
        errors = [item for item in branch_files if item.status == "error"]
        suffix_numbers = sorted(int(item.filename_suffix[1:]) for item in successful if item.filename_suffix)
        expected_suffixes = list(range(1, max(suffix_numbers) + 1)) if suffix_numbers else []
        missing_parts = sorted(set(expected_suffixes) - set(suffix_numbers))
        has_base = any(not item.filename_suffix for item in successful)
        stats = None
        if successful:
            ids = [item.id for item in successful]
            stats = db.query(
                func.min(GL02LedgerTransaction.transaction_date),
                func.max(GL02LedgerTransaction.transaction_date),
                func.count(distinct(GL02LedgerTransaction.transaction_date)),
                func.coalesce(func.sum(GL02LedgerTransaction.debit_amount), 0),
                func.coalesce(func.sum(GL02LedgerTransaction.credit_amount), 0),
            ).filter(GL02LedgerTransaction.import_file_id.in_(ids)).one()
        first_date = stats[0] if stats else None
        last_date = stats[1] if stats else None
        day_count = int(stats[2] or 0) if stats else 0
        debit_total = Decimal(stats[3] or 0) if stats else Decimal(0)
        credit_total = Decimal(stats[4] or 0) if stats else Decimal(0)
        date_ready = bool(first_date and last_date and first_date.day == 1 and last_date.day == expected_days and day_count == expected_days)
        balanced = bool(stats) and debit_total == credit_total
        ready = bool(successful) and has_base and not missing_parts and not errors and date_ready and balanced
        issues = []
        if not successful: issues.append("Thiếu bộ file GL02")
        if successful and not has_base: issues.append("Thiếu file gốc")
        if missing_parts: issues.append("Thiếu phần " + ", ".join(f"_{item}" for item in missing_parts))
        if successful and not date_ready: issues.append(f"Chưa đủ ngày 01-{expected_days:02d}")
        if successful and not balanced: issues.append(f"Lệch Nợ/Có {debit_total - credit_total}")
        if errors: issues.append(f"{len(errors)} file lỗi")
        gl_branch_readiness.append({
            "branch_code": branch_code, "success_file_count": len(successful),
            "part_count": len(successful), "missing_parts": [f"_{item}" for item in missing_parts],
            "first_date": first_date.isoformat() if first_date else None,
            "last_date": last_date.isoformat() if last_date else None,
            "success_days": day_count, "expected_days": expected_days,
            "debit_total": serialize_value(debit_total), "credit_total": serialize_value(credit_total),
            "is_balanced": balanced, "error_file_count": len(errors), "is_ready": ready,
            "message": "Đủ ngày, đủ phần và cân bằng Nợ/Có." if ready else "; ".join(issues),
        })
    gl_source["expected_file_count"] = None
    gl_source["is_ready"] = bool(gl_branch_readiness) and all(item["is_ready"] for item in gl_branch_readiness)
    gl_source["branch_readiness"] = gl_branch_readiness

    ftpln_files = [item for item in files if item.file_type == "FTPLN"]
    ftpln_branches = sorted({item.branch_code for item in ftpln_files})
    expected_days = calendar.monthrange(batch.period_date.year, batch.period_date.month)[1]
    expected_dates = {
        date(batch.period_date.year, batch.period_date.month, day)
        for day in range(1, expected_days + 1)
    }
    branch_readiness = []
    for branch_code in ftpln_branches:
        branch_files = [item for item in ftpln_files if item.branch_code == branch_code]
        success_dates = {
            item.business_date
            for item in branch_files
            if item.status == "success" and item.business_date is not None
        }
        duplicate_dates = sorted({
            item.business_date.isoformat()
            for item in branch_files
            if item.business_date
            and sum(
                1
                for candidate in branch_files
                if candidate.business_date == item.business_date and candidate.status == "success"
            ) > 1
        })
        missing_dates = sorted(expected_dates - success_dates)
        error_count = len([item for item in branch_files if item.status == "error"])
        branch_readiness.append({
            "branch_code": branch_code,
            "expected_days": expected_days,
            "success_days": len(success_dates),
            "missing_dates": [item.isoformat() for item in missing_dates],
            "duplicate_dates": duplicate_dates,
            "error_file_count": error_count,
            "is_ready": len(success_dates) == expected_days and not duplicate_dates and error_count == 0,
        })

    source_rows.append({
        "source_code": "FTPLN",
        "frequency": "DAILY",
        "expected_file_count": expected_days * len(ftpln_branches) if ftpln_branches else expected_days,
        "received_file_count": len(ftpln_files),
        "success_file_count": len([item for item in ftpln_files if item.status == "success"]),
        "error_file_count": len([item for item in ftpln_files if item.status == "error"]),
        "is_ready": bool(branch_readiness) and all(item["is_ready"] for item in branch_readiness),
        "branches": ftpln_branches,
        "missing_dates": sorted({
            missing
            for branch in branch_readiness
            for missing in branch["missing_dates"]
        }),
        "branch_readiness": branch_readiness,
    })
    payload = {"period_key": period_key, "sources": source_rows}
    # The key contains the complete import-file version, so this remains valid
    # until a file/status changes and can safely outlive the generic UI cache.
    set_shared_analysis_cache("source-readiness", cache_key, payload, ttl_seconds=24 * 60 * 60)
    return payload


@router.get("/report-sources", dependencies=[Depends(require_any_permission("warehouse:view"))])
def list_report_sources(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(ReportSourceStatus)
        .filter(ReportSourceStatus.period_key == period_key)
        .order_by(ReportSourceStatus.source_code)
        .all()
    )
    expected_source_codes = {config["code"] for config in SOURCE_CONFIGS}
    current_source_codes = {row.source_code for row in rows}
    if not rows or current_source_codes != expected_source_codes:
        refresh_report_sources(db, period_key)
        db.commit()
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


@router.get("/summary", dependencies=[Depends(require_any_permission("warehouse:view"))])
def list_summary(
    period_key: str = Query(...),
    limit: int = Query(default=100, ge=1, le=1000),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    query = (
        db.query(CustomerPeriodSummary)
        .filter(CustomerPeriodSummary.period_key == period_key)
    )
    if scope.ma_cn:
        query = query.filter(CustomerPeriodSummary.ma_cn == scope.ma_cn)
    if scope.ma_pgd:
        query = query.filter(CustomerPeriodSummary.ma_pgd == scope.ma_pgd)
    rows = query.order_by(CustomerPeriodSummary.ma_kh_chuan).limit(limit).all()
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

