from __future__ import annotations

import shutil
import uuid
from io import BytesIO
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.cif_importer import (
    REVIEW_FIELDS,
    date_yyyymmdd,
    file_sha256,
    full_address,
    import_cif_file,
    normalized_identity,
    normalized_status,
    telephone,
)
from app.auth.dependencies import get_current_user, require_all_permissions, require_any_permission
from app.auth.schemas import CurrentUser
from app.database import get_db
from app.security_audit import record_security_event
from app.export_progress import begin_export, update_export
from app.models import (
    CifCustomer,
    CifCustomerIdentifier,
    CifIdentityConflict,
    CifImportBatch,
    CifImportError,
    CifSourceRecord,
    CifChangeAudit,
    CifGoldenRule,
)


router = APIRouter(
    prefix="/api/cif",
    tags=["cif"],
    dependencies=[Depends(require_any_permission("cif:view"))],
)
CIF_UPLOAD_DIR = Path("/app/uploads/cif")
ALLOWED_CIF_SUFFIXES = {".csv", ".xls", ".xlsx"}
MAX_CIF_FILES_PER_UPLOAD = 20
STUCK_JOB_MINUTES = 20


def require_cif_manager(user: CurrentUser, permission: str = "cif:import") -> None:
    if "admin" not in user.permissions and permission not in user.permissions:
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật kho CIF")


def has_permission(user: CurrentUser, permission_code: str) -> bool:
    granted = set(user.permissions or [])
    return "admin" in granted or permission_code in granted


def mask_identifier(value, visible: int = 4):
    text_value = str(value or "").strip()
    if not text_value:
        return None
    if len(text_value) <= visible:
        return "•" * len(text_value)
    return f"{'•' * min(8, len(text_value) - visible)}{text_value[-visible:]}"


def import_cif_files_sequentially(files: list[tuple[str, str]], uploaded_by: str) -> None:
    """Process large CIF files one at a time to protect database capacity."""
    for stored_path, original_filename in files:
        import_cif_file(stored_path, original_filename, uploaded_by)


def batch_payload(item: CifImportBatch) -> dict:
    heartbeat = item.heartbeat_at or item.started_at or item.uploaded_at
    if heartbeat and heartbeat.tzinfo is None:
        heartbeat = heartbeat.replace(tzinfo=timezone.utc)
    is_stuck = item.status in {"queued", "processing"} and bool(
        heartbeat and datetime.now(timezone.utc) - heartbeat > timedelta(minutes=STUCK_JOB_MINUTES)
    )
    return {
        "id": item.id,
        "original_filename": item.original_filename,
        "stored_filename": item.stored_filename,
        "content_sha256": item.content_sha256,
        "actual_format": item.actual_format,
        "branch_code": item.branch_code,
        "sheet_name": item.sheet_name,
        "file_size": item.file_size,
        "status": item.status,
        "stage": item.stage,
        "progress_percent": item.progress_percent,
        "total_rows": item.total_rows,
        "processed_rows": item.processed_rows,
        "accepted_rows": item.accepted_rows,
        "warning_rows": item.warning_rows,
        "rejected_rows": item.rejected_rows,
        "new_customers": item.new_customers,
        "new_identifiers": item.new_identifiers,
        "updated_identifiers": item.updated_identifiers,
        "unchanged_identifiers": item.unchanged_identifiers,
        "duplicate_rows": item.duplicate_rows,
        "multi_branch_identifiers": item.multi_branch_identifiers,
        "review_rows": item.review_rows,
        "conflict_count": item.conflict_count,
        "format_warning": item.format_warning,
        "uploaded_by": item.uploaded_by,
        "importer_version": item.importer_version,
        "column_stats": item.column_stats,
        "comparison_summary": item.comparison_summary,
        "stage_history": item.stage_history or [],
        "heartbeat_at": item.heartbeat_at,
        "attempt_count": item.attempt_count,
        "is_stuck": is_stuck,
        "error_message": item.error_message,
        "started_at": item.started_at,
        "finished_at": item.finished_at,
        "uploaded_at": item.uploaded_at,
    }


def incoming_identifier_values(raw: dict) -> dict:
    return {
        "customer_name": raw.get("nmloc") or raw.get("nm") or None,
        "customer_name_ascii": raw.get("nm") or None,
        "short_name": raw.get("shrtnmloc") or raw.get("shrtnm") or None,
        "customer_type": raw.get("custtpcd") or None,
        "customer_detail_type": raw.get("custdtltpcd") or None,
        "registration_number": normalized_identity(raw.get("regno", "")),
        "passport_number": normalized_identity(raw.get("passno", "")),
        "driver_license_number": normalized_identity(raw.get("dlno", "")),
        "tax_number": normalized_identity(raw.get("taxno", "")),
        "telephone": telephone(raw),
        "address_type": raw.get("addrtpcd") or None,
        "full_address": full_address(raw),
        "province": raw.get("province") or None,
        "district": raw.get("district") or None,
        "commune_ward": raw.get("commune_ward") or None,
        "nationality_code": raw.get("ctrycdnatl") or None,
        "birth_date": date_yyyymmdd(raw.get("name_1", "")),
        "gender_code": raw.get("name_3") or None,
        "establishment_date": date_yyyymmdd(raw.get("incrdt", "")),
        "occupation": raw.get("profnm") or None,
        "source_status": raw.get("stscd") or None,
        "normalized_status": normalized_status(raw.get("stscd", "")),
        "operator_user": raw.get("usridop1") or None,
    }


def json_safe(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


@router.get("/overview")
def cif_overview(db: Session = Depends(get_db)):
    total_customers = db.query(func.count(CifCustomer.id)).scalar() or 0
    total_identifiers = db.query(func.count(CifCustomerIdentifier.id)).scalar() or 0
    multi_branch = db.query(func.count(CifCustomer.id)).filter(CifCustomer.branch_count > 1).scalar() or 0
    pending_conflicts = (
        db.query(func.count(CifIdentityConflict.id))
        .filter(CifIdentityConflict.status == "pending")
        .scalar()
        or 0
    )
    identity_count = (
        db.query(func.count(CifCustomer.id))
        .filter(
            or_(
                CifCustomer.registration_number.isnot(None),
                CifCustomer.passport_number.isnot(None),
                CifCustomer.tax_number.isnot(None),
            )
        )
        .scalar()
        or 0
    )
    telephone_count = (
        db.query(func.count(CifCustomer.id))
        .filter(CifCustomer.telephone.isnot(None), func.trim(CifCustomer.telephone) != "")
        .scalar()
        or 0
    )
    address_count = db.query(func.count(CifCustomer.id)).filter(CifCustomer.full_address.isnot(None), func.trim(CifCustomer.full_address) != "").scalar() or 0
    birth_count = db.query(func.count(CifCustomer.id)).filter(CifCustomer.birth_date.isnot(None)).scalar() or 0
    pending_changes = db.query(func.count(CifSourceRecord.id)).filter(CifSourceRecord.review_status == "pending").scalar() or 0
    active_count = db.query(func.count(CifCustomer.id)).filter(CifCustomer.status == "active").scalar() or 0
    branch_rows = (
        db.query(
            CifCustomerIdentifier.branch_code,
            func.count(CifCustomerIdentifier.id),
            func.count(func.distinct(CifCustomerIdentifier.customer_id)),
        )
        .group_by(CifCustomerIdentifier.branch_code)
        .order_by(CifCustomerIdentifier.branch_code)
        .all()
    )
    latest_batch = (
        db.query(CifImportBatch)
        .filter(CifImportBatch.status == "success")
        .order_by(desc(CifImportBatch.finished_at))
        .first()
    )
    return {
        "total_customers": int(total_customers),
        "total_identifiers": int(total_identifiers),
        "multi_branch_customers": int(multi_branch),
        "pending_conflicts": int(pending_conflicts),
        "pending_changes": int(pending_changes),
        "latest_updated_at": latest_batch.finished_at if latest_batch else None,
        "quality": {
            "valid_cif_percent": round(total_identifiers * 100 / total_identifiers, 2) if total_identifiers else 0,
            "identity_percent": round(identity_count * 100 / total_customers, 2) if total_customers else 0,
            "telephone_percent": round(telephone_count * 100 / total_customers, 2) if total_customers else 0,
            "address_percent": round(address_count * 100 / total_customers, 2) if total_customers else 0,
            "birth_percent": round(birth_count * 100 / total_customers, 2) if total_customers else 0,
            "active_percent": round(active_count * 100 / total_customers, 2) if total_customers else 0,
        },
        "branches": [
            {
                "branch_code": branch_code,
                "identifier_count": int(identifier_count),
                "customer_count": int(customer_count),
            }
            for branch_code, identifier_count, customer_count in branch_rows
        ],
    }


@router.post("/imports")
def upload_cif(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    require_cif_manager(user, "cif:import")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_CIF_SUFFIXES:
        raise HTTPException(status_code=400, detail="Kho CIF chỉ nhận file CSV, XLS hoặc XLSX")
    CIF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{Path(file.filename).name}"
    stored_path = CIF_UPLOAD_DIR / stored_name
    with stored_path.open("wb") as target:
        shutil.copyfileobj(file.file, target, length=1024 * 1024)
    background_tasks.add_task(import_cif_file, stored_path, file.filename, user.username)
    return {
        "status": "queued",
        "original_filename": file.filename,
        "stored_filename": stored_name,
        "message": "Đã tiếp nhận file CIF và bắt đầu xử lý nền",
    }


@router.post("/imports/bulk")
def upload_cif_bulk(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_cif_manager(user, "cif:import")
    if not files:
        raise HTTPException(status_code=400, detail="Chưa chọn file CIF")
    if len(files) > MAX_CIF_FILES_PER_UPLOAD:
        raise HTTPException(status_code=400, detail=f"Mỗi lần chỉ được chọn tối đa {MAX_CIF_FILES_PER_UPLOAD} file CIF")
    invalid_names = [item.filename or "(không tên)" for item in files if Path(item.filename or "").suffix.lower() not in ALLOWED_CIF_SUFFIXES]
    if invalid_names:
        raise HTTPException(status_code=400, detail=f"File không đúng định dạng: {', '.join(invalid_names)}")

    CIF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    queued: list[tuple[str, str]] = []
    response_files = []
    for item in files:
        original_name = Path(item.filename or "cif").name
        stored_name = f"{uuid.uuid4().hex}_{original_name}"
        stored_path = CIF_UPLOAD_DIR / stored_name
        with stored_path.open("wb") as target:
            shutil.copyfileobj(item.file, target, length=1024 * 1024)
        checksum = file_sha256(stored_path)
        existing = db.query(CifImportBatch).filter(CifImportBatch.content_sha256 == checksum).first()
        if existing:
            response_files.append({
                "batch_id": existing.id, "original_filename": original_name,
                "stored_filename": stored_name, "file_size": stored_path.stat().st_size,
                "status": "duplicate" if existing.status == "success" else existing.status,
            })
            # Never start the same checksum concurrently. Failed/stuck jobs are
            # recovered explicitly from their original archived file.
            stored_path.unlink(missing_ok=True)
            continue
        batch = CifImportBatch(
            original_filename=original_name,
            stored_filename=stored_name,
            file_path=str(stored_path),
            content_sha256=checksum,
            file_size=stored_path.stat().st_size,
            actual_format=stored_path.suffix.lower().lstrip("."),
            status="queued",
            stage="Đang chờ xử lý",
            stage_history=[{"key": "queued", "label": "Đã tiếp nhận, đang chờ xử lý", "status": "completed", "progress": 0, "at": datetime.now(timezone.utc).isoformat()}],
            progress_percent=0,
            uploaded_by=user.username,
            importer_version="2.0",
            heartbeat_at=datetime.now(timezone.utc),
            attempt_count=0,
        )
        db.add(batch)
        db.flush()
        queued.append((str(stored_path), original_name))
        response_files.append({
            "batch_id": batch.id, "original_filename": original_name,
            "stored_filename": stored_name, "file_size": stored_path.stat().st_size,
            "status": "queued",
        })
    db.commit()
    background_tasks.add_task(import_cif_files_sequentially, queued, user.username)
    return {
        "status": "queued",
        "file_count": len(response_files),
        "files": response_files,
        "message": f"Đã tiếp nhận {len(response_files)} file CIF; hệ thống sẽ xử lý tuần tự ở nền",
    }


@router.post("/imports/{batch_id}/recover")
def recover_cif_import(
    batch_id: int,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_cif_manager(user, "cif:import")
    item = db.query(CifImportBatch).filter(CifImportBatch.id == batch_id).with_for_update().first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy job CIF")
    heartbeat = item.heartbeat_at or item.started_at or item.uploaded_at
    if heartbeat and heartbeat.tzinfo is None:
        heartbeat = heartbeat.replace(tzinfo=timezone.utc)
    is_stuck = item.status in {"queued", "processing"} and bool(
        heartbeat and datetime.now(timezone.utc) - heartbeat > timedelta(minutes=STUCK_JOB_MINUTES)
    )
    if item.status not in {"error"} and not is_stuck:
        raise HTTPException(status_code=409, detail="Job vẫn đang hoạt động hoặc đã hoàn thành; không được chạy trùng")
    path = Path(item.file_path)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="Không còn file nguồn để khôi phục job")
    now = datetime.now(timezone.utc)
    history = list(item.stage_history or [])
    history.append({
        "key": "recovery_queued", "label": f"Đã yêu cầu khôi phục lần {(item.attempt_count or 0) + 1}",
        "status": "completed", "progress": item.progress_percent, "at": now.isoformat(),
        "details": {"requested_by": user.username},
    })
    item.stage_history = history
    item.status = "queued"
    item.stage = "Đang chờ khôi phục job"
    item.error_message = None
    item.heartbeat_at = now
    item.attempt_count = (item.attempt_count or 0) + 1
    db.commit()
    background_tasks.add_task(import_cif_file, str(path), item.original_filename, user.username)
    return {"status": "queued", "batch_id": item.id, "attempt_count": item.attempt_count}


@router.get("/imports")
def list_cif_imports(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = db.query(CifImportBatch).order_by(desc(CifImportBatch.uploaded_at)).limit(limit).all()
    return [batch_payload(item) for item in rows]


@router.get("/imports/{batch_id}")
def get_cif_import(batch_id: int, db: Session = Depends(get_db)):
    item = db.query(CifImportBatch).filter(CifImportBatch.id == batch_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy lần import CIF")
    return batch_payload(item)


@router.get(
    "/imports/{batch_id}/file",
    dependencies=[Depends(require_all_permissions("customer:sensitive:identity", "customer:sensitive:contact"))],
)
def download_cif_import_file(
    batch_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    item = db.query(CifImportBatch).filter(CifImportBatch.id == batch_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy lần import CIF")
    path = Path(item.file_path)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="File nguồn không còn trên vùng lưu trữ dùng chung")
    record_security_event(
        request,
        user,
        "cif_source_download",
        "cif_import_file",
        batch_id,
        "Tải file CIF nguồn đã import",
        {"filename": item.original_filename, "branch_code": item.branch_code, "row_count": item.total_rows},
    )
    return FileResponse(path, filename=item.original_filename, media_type="application/octet-stream")


@router.get(
    "/imports/{batch_id}/issues",
    dependencies=[Depends(require_all_permissions("customer:sensitive:identity", "customer:sensitive:contact"))],
)
def get_cif_import_issues(
    batch_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    batch_exists = db.query(CifImportBatch.id).filter(CifImportBatch.id == batch_id).first()
    if not batch_exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy lần import CIF")
    rows = (
        db.query(CifImportError)
        .filter(CifImportError.import_batch_id == batch_id)
        .order_by(CifImportError.source_row_number, CifImportError.id)
        .limit(limit)
        .all()
    )
    issues = [
        {
            "id": f"error-{item.id}",
            "source_row_number": item.source_row_number,
            "full_cif_code": item.full_cif_code,
            "severity": item.severity,
            "error_code": item.error_code,
            "field_name": item.field_name,
            "raw_value": item.raw_value,
            "message": item.message,
        }
        for item in rows
    ]
    conflicts = (
        db.query(CifIdentityConflict)
        .filter(CifIdentityConflict.import_batch_id == batch_id)
        .order_by(CifIdentityConflict.id)
        .limit(limit)
        .all()
    )
    for item in conflicts:
        details = item.details or {}
        issues.append(
            {
                "id": f"conflict-{item.id}",
                "source_row_number": details.get("source_row_number"),
                "full_cif_code": (item.full_cif_codes or [None])[0],
                "severity": "warning",
                "error_code": item.conflict_type,
                "field_name": None,
                "raw_value": item.identity_value,
                "message": (
                    "Thông tin định danh của cùng mã khách hàng lõi không khớp"
                    if item.conflict_type == "core_identity_mismatch"
                    else "Giấy tờ định danh đang gắn với nhiều mã khách hàng"
                ),
            }
        )
    return issues[:limit]


@router.get("/customers")
def list_cif_customers(
    request: Request,
    keyword: str | None = None,
    branch_code: str | None = None,
    status: str | None = None,
    quality_issue: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    query = db.query(CifCustomer)
    if keyword:
        like = f"%{keyword.strip()}%"
        search_columns = [
            CifCustomer.customer_core_code.ilike(like),
            CifCustomer.customer_name.ilike(like),
        ]
        if has_permission(user, "customer:sensitive:identity"):
            search_columns.extend([
                CifCustomer.registration_number.ilike(like),
                CifCustomer.tax_number.ilike(like),
            ])
        query = query.filter(or_(*search_columns))
    if status:
        query = query.filter(CifCustomer.status == status)
    if quality_issue == "missing_identity":
        query = query.filter(
            CifCustomer.registration_number.is_(None),
            CifCustomer.passport_number.is_(None),
            CifCustomer.tax_number.is_(None),
        )
    elif quality_issue == "missing_phone":
        query = query.filter(or_(CifCustomer.telephone.is_(None), func.trim(CifCustomer.telephone) == ""))
    elif quality_issue == "missing_address":
        query = query.filter(or_(CifCustomer.full_address.is_(None), func.trim(CifCustomer.full_address) == ""))
    elif quality_issue == "missing_birth_date":
        query = query.filter(CifCustomer.birth_date.is_(None))
    elif quality_issue == "inactive":
        query = query.filter(CifCustomer.status != "active")
    if branch_code:
        query = query.filter(
            CifCustomer.id.in_(
                db.query(CifCustomerIdentifier.customer_id).filter(CifCustomerIdentifier.branch_code == branch_code)
            )
        )
    total = query.count()
    rows = (
        query.order_by(CifCustomer.customer_core_code)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    customer_ids = [item.id for item in rows]
    identifiers_by_customer: dict[int, list[CifCustomerIdentifier]] = {}
    if customer_ids:
        page_identifiers = (
            db.query(CifCustomerIdentifier)
            .filter(CifCustomerIdentifier.customer_id.in_(customer_ids))
            .order_by(
                CifCustomerIdentifier.customer_id,
                CifCustomerIdentifier.branch_code,
                CifCustomerIdentifier.full_cif_code,
            )
            .all()
        )
        for identifier in page_identifiers:
            identifiers_by_customer.setdefault(identifier.customer_id, []).append(identifier)

    can_view_identity = has_permission(user, "customer:sensitive:identity")
    can_view_contact = has_permission(user, "customer:sensitive:contact")
    if rows and (can_view_identity or can_view_contact):
        record_security_event(
            request,
            user,
            "cif_customer_list_view",
            "cif_customer",
            description="Xem danh sách khách hàng CIF có dữ liệu nhạy cảm",
            metadata={
                "branch_code": branch_code,
                "page": page,
                "row_count": len(rows),
                "identity_visible": can_view_identity,
                "contact_visible": can_view_contact,
            },
        )
    if keyword:
        record_security_event(
            request,
            user,
            "cif_customer_search",
            "cif_customer",
            description="Tìm kiếm khách hàng trong Kho CIF",
            metadata={"keyword": keyword, "branch_code": branch_code, "result_count": len(rows)},
        )
    return {
        "items": [
            {
                "id": item.id,
                "customer_core_code": item.customer_core_code,
                "branch_codes": sorted(
                    {
                        identifier.branch_code
                        for identifier in identifiers_by_customer.get(item.id, [])
                    }
                ),
                "full_cif_codes": [
                    identifier.full_cif_code
                    for identifier in identifiers_by_customer.get(item.id, [])
                ],
                "customer_name": item.customer_name,
                "customer_type": item.customer_type,
                "registration_number": item.registration_number if can_view_identity else mask_identifier(item.registration_number),
                "tax_number": item.tax_number if can_view_identity else mask_identifier(item.tax_number),
                "telephone": item.telephone if can_view_contact else mask_identifier(item.telephone, visible=3),
                "full_address": item.full_address if can_view_contact else ("Thông tin được bảo vệ" if item.full_address else None),
                "status": item.status,
                "branch_count": item.branch_count,
                "identifier_count": item.identifier_count,
                "updated_at": item.updated_at,
            }
            for item in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/changes",
    dependencies=[Depends(require_all_permissions("customer:sensitive:identity", "customer:sensitive:contact"))],
)
def list_cif_changes(
    review_status: str = Query(default="pending"),
    branch_code: str | None = None,
    batch_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(CifSourceRecord).filter(CifSourceRecord.comparison_status == "changed")
    if review_status:
        query = query.filter(CifSourceRecord.review_status == review_status)
    if branch_code:
        query = query.filter(CifSourceRecord.branch_code == branch_code)
    if batch_id:
        query = query.filter(CifSourceRecord.import_batch_id == batch_id)
    total = query.count()
    rows = query.order_by(desc(CifSourceRecord.imported_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [{
            "id": item.id, "import_batch_id": item.import_batch_id,
            "source_row_number": item.source_row_number, "full_cif_code": item.full_cif_code,
            "branch_code": item.branch_code, "customer_core_code": item.customer_core_code,
            "changed_fields": item.changed_fields or {}, "current_snapshot": item.current_snapshot or {},
            "incoming": incoming_identifier_values(item.raw_data or {}),
            "review_status": item.review_status, "reviewed_by": item.reviewed_by,
            "reviewed_at": item.reviewed_at, "review_note": item.review_note,
            "imported_at": item.imported_at,
        } for item in rows],
        "total": total, "page": page, "page_size": page_size,
    }


@router.post("/changes/{source_record_id}/apply")
def apply_cif_change(
    source_record_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_cif_manager(user, "cif:override")
    source = db.query(CifSourceRecord).filter(CifSourceRecord.id == source_record_id).first()
    if not source or source.comparison_status != "changed":
        raise HTTPException(status_code=404, detail="Không tìm thấy bản thay đổi CIF")
    if source.review_status != "pending":
        raise HTTPException(status_code=409, detail="Bản thay đổi này đã được xử lý")
    identifier = db.query(CifCustomerIdentifier).filter(CifCustomerIdentifier.full_cif_code == source.full_cif_code).first()
    if not identifier:
        raise HTTPException(status_code=404, detail="Mã CIF hiện tại không còn tồn tại")
    incoming = incoming_identifier_values(source.raw_data or {})
    selected_fields = payload.get("fields") or list((source.changed_fields or {}).keys())
    selected_fields = [field for field in selected_fields if field in REVIEW_FIELDS]
    if not selected_fields:
        raise HTTPException(status_code=400, detail="Chưa chọn trường cần áp dụng")
    before = {field: json_safe(getattr(identifier, field)) for field in selected_fields}
    after = {}
    for field in selected_fields:
        setattr(identifier, field, incoming.get(field))
        after[field] = json_safe(incoming.get(field))
    identifier.import_batch_id = source.import_batch_id
    identifier.raw_data = source.raw_data
    customer = db.query(CifCustomer).filter(CifCustomer.id == identifier.customer_id).first()
    customer_field_map = {
        "customer_name": "customer_name", "customer_name_ascii": "customer_name_ascii",
        "customer_type": "customer_type", "customer_detail_type": "customer_detail_type",
        "registration_number": "registration_number", "passport_number": "passport_number",
        "tax_number": "tax_number", "telephone": "telephone", "full_address": "full_address",
        "nationality_code": "nationality_code", "birth_date": "birth_date",
        "gender_code": "gender_code", "establishment_date": "establishment_date",
        "occupation": "occupation", "normalized_status": "status",
    }
    if customer:
        for source_field in selected_fields:
            target = customer_field_map.get(source_field)
            if target:
                setattr(customer, target, incoming.get(source_field))
        customer.last_import_batch_id = source.import_batch_id
    source.review_status = "applied"
    source.reviewed_by = user.username
    source.reviewed_at = datetime.now(timezone.utc)
    source.review_note = payload.get("note")
    db.add(CifChangeAudit(
        source_record_id=source.id, import_batch_id=source.import_batch_id,
        customer_id=identifier.customer_id, full_cif_code=source.full_cif_code,
        action="apply_change", before_data=before, after_data=after,
        changed_fields={field: (source.changed_fields or {}).get(field) for field in selected_fields},
        performed_by=user.username, note=payload.get("note"),
    ))
    db.commit()
    return {"status": "applied", "source_record_id": source.id, "fields": selected_fields, "reviewed_by": user.username}


@router.post("/changes/{source_record_id}/reject")
def reject_cif_change(
    source_record_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_cif_manager(user, "cif:review")
    source = db.query(CifSourceRecord).filter(CifSourceRecord.id == source_record_id).first()
    if not source or source.comparison_status != "changed":
        raise HTTPException(status_code=404, detail="Không tìm thấy bản thay đổi CIF")
    if source.review_status != "pending":
        raise HTTPException(status_code=409, detail="Bản thay đổi này đã được xử lý")
    source.review_status = "rejected"
    source.reviewed_by = user.username
    source.reviewed_at = datetime.now(timezone.utc)
    source.review_note = payload.get("note")
    db.add(CifChangeAudit(
        source_record_id=source.id, import_batch_id=source.import_batch_id,
        full_cif_code=source.full_cif_code, action="reject_change",
        before_data=source.current_snapshot, after_data=source.current_snapshot,
        changed_fields=source.changed_fields, performed_by=user.username, note=payload.get("note"),
    ))
    db.commit()
    return {"status": "rejected", "source_record_id": source.id, "reviewed_by": user.username}


@router.get(
    "/identifiers/{full_cif_code}/history",
    dependencies=[Depends(require_all_permissions("customer:sensitive:identity", "customer:sensitive:contact"))],
)
def cif_identifier_history(full_cif_code: str, db: Session = Depends(get_db)):
    sources = db.query(CifSourceRecord).filter(CifSourceRecord.full_cif_code == full_cif_code).order_by(desc(CifSourceRecord.imported_at)).all()
    audits = db.query(CifChangeAudit).filter(CifChangeAudit.full_cif_code == full_cif_code).order_by(desc(CifChangeAudit.performed_at)).all()
    return {
        "sources": [{
            "id": item.id, "import_batch_id": item.import_batch_id,
            "source_row_number": item.source_row_number, "comparison_status": item.comparison_status,
            "review_status": item.review_status, "changed_fields": item.changed_fields,
            "reviewed_by": item.reviewed_by, "reviewed_at": item.reviewed_at,
            "imported_at": item.imported_at,
        } for item in sources],
        "audits": [{
            "id": item.id, "action": item.action, "before_data": item.before_data,
            "after_data": item.after_data, "changed_fields": item.changed_fields,
            "performed_by": item.performed_by, "note": item.note, "performed_at": item.performed_at,
        } for item in audits],
    }


@router.get("/golden-rules")
def list_cif_golden_rules(db: Session = Depends(get_db)):
    rows = db.query(CifGoldenRule).order_by(CifGoldenRule.id).all()
    return [{
        "id": row.id, "target_field": row.target_field, "source_columns": row.source_columns,
        "strategy": row.strategy, "priority_order": row.priority_order,
        "requires_review_on_conflict": row.requires_review_on_conflict,
        "is_active": row.is_active, "description": row.description,
        "updated_by": row.updated_by, "updated_at": row.updated_at,
    } for row in rows]


@router.get("/customers/{customer_id}")
def cif_customer_detail(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    customer = db.query(CifCustomer).filter(CifCustomer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng CIF")
    identifiers = (
        db.query(CifCustomerIdentifier)
        .filter(CifCustomerIdentifier.customer_id == customer_id)
        .order_by(CifCustomerIdentifier.branch_code)
        .all()
    )
    can_view_identity = has_permission(user, "customer:sensitive:identity")
    can_view_contact = has_permission(user, "customer:sensitive:contact")
    record_security_event(
        request,
        user,
        "cif_customer_view",
        "cif_customer",
        customer.id,
        "Mở chi tiết khách hàng trong Kho CIF",
        {
            "customer_core_code": customer.customer_core_code,
            "identity_visible": can_view_identity,
            "contact_visible": can_view_contact,
        },
    )
    return {
        "id": customer.id,
        "customer_core_code": customer.customer_core_code,
        "customer_name": customer.customer_name,
        "customer_name_ascii": customer.customer_name_ascii,
        "customer_type": customer.customer_type,
        "customer_detail_type": customer.customer_detail_type,
        "registration_number": customer.registration_number if can_view_identity else mask_identifier(customer.registration_number),
        "passport_number": customer.passport_number if can_view_identity else mask_identifier(customer.passport_number),
        "tax_number": customer.tax_number if can_view_identity else mask_identifier(customer.tax_number),
        "telephone": customer.telephone if can_view_contact else mask_identifier(customer.telephone, visible=3),
        "full_address": customer.full_address if can_view_contact else ("Thông tin được bảo vệ" if customer.full_address else None),
        "nationality_code": customer.nationality_code,
        "status": customer.status,
        "identifiers": [
            {
                "id": item.id,
                "full_cif_code": item.full_cif_code,
                "branch_code": item.branch_code,
                "customer_name": item.customer_name,
                "registration_number": item.registration_number if can_view_identity else mask_identifier(item.registration_number),
                "source_status": item.source_status,
                "normalized_status": item.normalized_status,
                "import_batch_id": item.import_batch_id,
                "imported_at": item.imported_at,
            }
            for item in identifiers
        ],
    }


@router.get("/conflicts")
def list_cif_conflicts(
    request: Request,
    status: str = Query(default="pending"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    query = db.query(CifIdentityConflict)
    if status:
        query = query.filter(CifIdentityConflict.status == status)
    total = query.count()
    rows = (
        query.order_by(desc(CifIdentityConflict.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    can_view_identity = has_permission(user, "customer:sensitive:identity")
    if rows:
        record_security_event(
            request,
            user,
            "cif_conflict_view",
            "cif_conflict",
            description="Xem danh sách xung đột định danh CIF",
            metadata={"status": status, "row_count": len(rows), "identity_visible": can_view_identity},
        )
    return {
        "items": [
            {
                "id": item.id,
                "conflict_type": item.conflict_type,
                "identity_value": item.identity_value if can_view_identity else mask_identifier(item.identity_value),
                "customer_ids": item.customer_ids,
                "full_cif_codes": item.full_cif_codes,
                "details": item.details if can_view_identity else {"protected": True},
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in rows
        ],
        "total": total,
    }


@router.get(
    "/conflicts-export",
    dependencies=[Depends(require_all_permissions("customer:sensitive:identity"))],
)
def export_cif_conflicts(
    request: Request,
    status: str = Query(default="pending"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    export_task = begin_export(request, user, "Đang lọc xung đột CIF")
    query = db.query(CifIdentityConflict)
    if status:
        query = query.filter(CifIdentityConflict.status == status)
    rows = query.order_by(desc(CifIdentityConflict.created_at)).all()
    update_export(export_task, 20, f"Đã tìm thấy {len(rows):,} bản ghi; đang ghi Excel")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Xung dot CIF"
    sheet.append(["STT", "Loại xung đột", "Giá trị định danh", "Mã CIF liên quan", "Trạng thái", "Chi tiết", "Ngày phát hiện"])
    for index, item in enumerate(rows, 1):
        sheet.append([
            index, item.conflict_type, item.identity_value,
            ", ".join(item.full_cif_codes or []), item.status,
            str(item.details or {}), item.created_at.isoformat() if item.created_at else None,
        ])
        if index % 500 == 0 or index == len(rows):
            update_export(export_task, 20 + int(70 * index / max(len(rows), 1)), f"Đã ghi {index:,}/{len(rows):,} dòng")
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column, width in zip("ABCDEFG", [8, 24, 24, 48, 18, 70, 24]):
        sheet.column_dimensions[column].width = width
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    update_export(export_task, 96, "Đã tạo file; đang gửi về trình duyệt")
    record_security_event(
        request,
        user,
        "cif_conflict_export",
        "cif_conflict_export",
        status,
        "Xuất danh sách xung đột CIF",
        {"status": status, "row_count": len(rows)},
    )
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={
        "Content-Disposition": 'attachment; filename="doi_chieu_xung_dot_cif.xlsx"',
        "Content-Length": str(output.getbuffer().nbytes),
    })


@router.post("/conflicts/{conflict_id}/resolve")
def resolve_cif_conflict(
    conflict_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_cif_manager(user, "cif:review")
    item = db.query(CifIdentityConflict).filter(CifIdentityConflict.id == conflict_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy xung đột CIF")
    resolution = payload.get("resolution")
    allowed = {"resolved_keep", "not_conflict", "waiting_branch", "verified_separate"}
    if resolution not in allowed:
        raise HTTPException(status_code=400, detail="Hướng xử lý xung đột không hợp lệ")
    item.status = resolution
    item.resolution_note = payload.get("note")
    item.resolved_by = user.username
    item.resolved_at = datetime.now(timezone.utc)
    db.add(CifChangeAudit(
        import_batch_id=item.import_batch_id, full_cif_code=(item.full_cif_codes or [None])[0],
        action=f"resolve_conflict:{resolution}", before_data={"status": "pending"},
        after_data={"status": resolution}, performed_by=user.username, note=payload.get("note"),
    ))
    db.commit()
    return {"status": item.status, "resolved_by": item.resolved_by, "resolved_at": item.resolved_at}
