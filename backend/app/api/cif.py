from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.cif_importer import import_cif_file
from app.database import get_db
from app.models import (
    CifCustomer,
    CifCustomerIdentifier,
    CifIdentityConflict,
    CifImportBatch,
)


router = APIRouter(prefix="/api/cif", tags=["cif"])
CIF_UPLOAD_DIR = Path("/app/uploads/cif")


def batch_payload(item: CifImportBatch) -> dict:
    return {
        "id": item.id,
        "original_filename": item.original_filename,
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
        "conflict_count": item.conflict_count,
        "format_warning": item.format_warning,
        "error_message": item.error_message,
        "started_at": item.started_at,
        "finished_at": item.finished_at,
        "uploaded_at": item.uploaded_at,
    }


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
        "latest_updated_at": latest_batch.finished_at if latest_batch else None,
        "quality": {
            "valid_cif_percent": round(total_identifiers * 100 / total_identifiers, 2) if total_identifiers else 0,
            "identity_percent": round(identity_count * 100 / total_customers, 2) if total_customers else 0,
            "telephone_percent": round(telephone_count * 100 / total_customers, 2) if total_customers else 0,
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
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix != ".xls":
        raise HTTPException(status_code=400, detail="Kho CIF hiện chỉ nhận file XLS")
    CIF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{Path(file.filename).name}"
    stored_path = CIF_UPLOAD_DIR / stored_name
    with stored_path.open("wb") as target:
        shutil.copyfileobj(file.file, target, length=1024 * 1024)
    background_tasks.add_task(import_cif_file, stored_path, file.filename)
    return {
        "status": "queued",
        "original_filename": file.filename,
        "stored_filename": stored_name,
        "message": "Đã tiếp nhận file CIF và bắt đầu xử lý nền",
    }


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


@router.get("/customers")
def list_cif_customers(
    keyword: str | None = None,
    branch_code: str | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(CifCustomer)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                CifCustomer.customer_core_code.ilike(like),
                CifCustomer.customer_name.ilike(like),
                CifCustomer.registration_number.ilike(like),
                CifCustomer.tax_number.ilike(like),
            )
        )
    if status:
        query = query.filter(CifCustomer.status == status)
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
    return {
        "items": [
            {
                "id": item.id,
                "customer_core_code": item.customer_core_code,
                "customer_name": item.customer_name,
                "customer_type": item.customer_type,
                "registration_number": item.registration_number,
                "tax_number": item.tax_number,
                "telephone": item.telephone,
                "full_address": item.full_address,
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


@router.get("/customers/{customer_id}")
def cif_customer_detail(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(CifCustomer).filter(CifCustomer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng CIF")
    identifiers = (
        db.query(CifCustomerIdentifier)
        .filter(CifCustomerIdentifier.customer_id == customer_id)
        .order_by(CifCustomerIdentifier.branch_code)
        .all()
    )
    return {
        "id": customer.id,
        "customer_core_code": customer.customer_core_code,
        "customer_name": customer.customer_name,
        "customer_name_ascii": customer.customer_name_ascii,
        "customer_type": customer.customer_type,
        "customer_detail_type": customer.customer_detail_type,
        "registration_number": customer.registration_number,
        "passport_number": customer.passport_number,
        "tax_number": customer.tax_number,
        "telephone": customer.telephone,
        "full_address": customer.full_address,
        "nationality_code": customer.nationality_code,
        "status": customer.status,
        "identifiers": [
            {
                "id": item.id,
                "full_cif_code": item.full_cif_code,
                "branch_code": item.branch_code,
                "customer_name": item.customer_name,
                "registration_number": item.registration_number,
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
    status: str = Query(default="pending"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
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
    return {
        "items": [
            {
                "id": item.id,
                "conflict_type": item.conflict_type,
                "identity_value": item.identity_value,
                "customer_ids": item.customer_ids,
                "full_cif_codes": item.full_cif_codes,
                "details": item.details,
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in rows
        ],
        "total": total,
    }
