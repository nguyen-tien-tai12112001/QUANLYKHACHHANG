from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

import xlrd
from sqlalchemy import distinct, func

from app.database import SessionLocal
from app.models import (
    CifCustomer,
    CifCustomerIdentifier,
    CifIdentityConflict,
    CifImportBatch,
    CifImportError,
)


REQUIRED_COLUMNS = {
    "custno",
    "nm",
    "nmloc",
    "custtpcd",
    "custdtltpcd",
    "regno",
    "stscd",
}
DATE_COLUMNS = ("issuedt1", "issuedt2", "issuedt3", "issuedt4", "issuedt5", "issuedt6", "incrdt")
STATUS_MAP = {
    "bình thường": "active",
    "không hoạt động": "inactive",
    "không hợp lệ": "invalid",
    "không xác nhận": "unverified",
}


def clean(value) -> str:
    if value is None:
        return ""
    result = str(value).strip()
    if result.endswith(".0") and result[:-2].isdigit():
        result = result[:-2]
    return result


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def chunked(values: list[str], size: int = 5000):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def parse_yyyymmdd(value: str) -> bool:
    if not re.fullmatch(r"\d{8}", value):
        return False
    try:
        parsed = datetime.strptime(value, "%Y%m%d").date()
    except ValueError:
        return False
    return 1900 <= parsed.year <= datetime.now().year


def normalized_status(value: str) -> str:
    return STATUS_MAP.get(value.strip().lower(), "unknown")


def normalized_identity(value: str) -> str | None:
    result = re.sub(r"\s+", "", value or "").upper()
    return result or None


def full_address(row: dict) -> str | None:
    parts = [row.get("addr1loc"), row.get("addr2loc"), row.get("addr3loc")]
    result = ", ".join(part for part in parts if part)
    return result or None


def telephone(row: dict) -> str | None:
    parts = [row.get("telnoctry"), row.get("telnoarea"), row.get("telno"), row.get("telnoextn")]
    result = "".join(part for part in parts if part)
    return result or None


def infer_branch_code(filename: str) -> str | None:
    match = re.match(r"^(\d{4})\s*CIF", filename, re.IGNORECASE)
    return match.group(1) if match else None


def _refresh_customer_counts(db) -> None:
    rows = (
        db.query(
            CifCustomerIdentifier.customer_id,
            func.count(CifCustomerIdentifier.id),
            func.count(distinct(CifCustomerIdentifier.branch_code)),
        )
        .group_by(CifCustomerIdentifier.customer_id)
        .all()
    )
    for customer_id, identifier_count, branch_count in rows:
        db.query(CifCustomer).filter(CifCustomer.id == customer_id).update(
            {
                CifCustomer.identifier_count: int(identifier_count or 0),
                CifCustomer.branch_count: int(branch_count or 0),
            },
            synchronize_session=False,
        )


def _refresh_registration_conflicts(db, batch_id: int) -> int:
    db.query(CifIdentityConflict).filter(
        CifIdentityConflict.conflict_type == "duplicate_registration_number",
        CifIdentityConflict.status == "pending",
    ).delete(synchronize_session=False)
    duplicate_values = (
        db.query(CifCustomerIdentifier.registration_number)
        .filter(
            CifCustomerIdentifier.registration_number.isnot(None),
            func.trim(CifCustomerIdentifier.registration_number) != "",
        )
        .group_by(CifCustomerIdentifier.registration_number)
        .having(func.count(distinct(CifCustomerIdentifier.customer_id)) > 1)
        .all()
    )
    mappings = []
    for (identity_value,) in duplicate_values:
        rows = (
            db.query(
                CifCustomerIdentifier.customer_id,
                CifCustomerIdentifier.full_cif_code,
                CifCustomerIdentifier.customer_name,
                CifCustomerIdentifier.branch_code,
            )
            .filter(CifCustomerIdentifier.registration_number == identity_value)
            .all()
        )
        mappings.append(
            {
                "import_batch_id": batch_id,
                "conflict_type": "duplicate_registration_number",
                "identity_value": identity_value,
                "customer_ids": sorted({int(row.customer_id) for row in rows}),
                "full_cif_codes": sorted({row.full_cif_code for row in rows}),
                "details": {
                    "records": [
                        {
                            "full_cif_code": row.full_cif_code,
                            "branch_code": row.branch_code,
                            "customer_name": row.customer_name,
                        }
                        for row in rows
                    ]
                },
                "status": "pending",
            }
        )
    if mappings:
        db.bulk_insert_mappings(CifIdentityConflict, mappings)
    return len(mappings)


def import_cif_file(file_path: str | Path, original_filename: str | None = None) -> int:
    path = Path(file_path)
    filename = original_filename or path.name
    checksum = file_sha256(path)
    db = SessionLocal()
    batch = None
    try:
        existing_batch = db.query(CifImportBatch).filter(CifImportBatch.content_sha256 == checksum).first()
        if existing_batch and existing_batch.status == "success":
            return existing_batch.id
        if existing_batch:
            batch = existing_batch
            batch.status = "processing"
            batch.error_message = None
        else:
            format_warning = None
            if path.stat().st_size > 512 and (path.stat().st_size - 512) % 512:
                format_warning = "Kích thước OLE không khớp biên sector 512 byte; workbook vẫn được phép đọc nếu cấu trúc hợp lệ."
            batch = CifImportBatch(
                original_filename=filename,
                stored_filename=path.name,
                file_path=str(path),
                content_sha256=checksum,
                file_size=path.stat().st_size,
                actual_format="xls",
                branch_code=infer_branch_code(filename),
                status="processing",
                stage="Đang mở workbook XLS",
                started_at=datetime.now(timezone.utc),
                format_warning=format_warning,
            )
            db.add(batch)
        db.commit()
        db.refresh(batch)

        workbook = xlrd.open_workbook(str(path), on_demand=True)
        if not workbook.sheet_names():
            raise ValueError("Workbook CIF không có sheet dữ liệu")
        if len(workbook.sheet_names()) > 1:
            batch.format_warning = (batch.format_warning or "") + " Workbook có nhiều sheet; importer sẽ xử lý toàn bộ sheet cùng cấu trúc."

        parsed_rows: list[dict] = []
        errors: list[dict] = []
        seen_full_codes: set[str] = set()
        detected_branches: set[str] = set()
        total_rows = 0
        for sheet_name in workbook.sheet_names():
            sheet = workbook.sheet_by_name(sheet_name)
            headers = [clean(sheet.cell_value(0, column)).lower() for column in range(sheet.ncols)]
            missing = sorted(REQUIRED_COLUMNS - set(headers))
            if missing:
                raise ValueError(f"Sheet {sheet_name} thiếu cột bắt buộc: {', '.join(missing)}")
            indexes = {header: index for index, header in enumerate(headers)}
            batch.sheet_name = sheet_name if not batch.sheet_name else f"{batch.sheet_name}; {sheet_name}"
            total_rows += max(0, sheet.nrows - 1)
            for row_index in range(1, sheet.nrows):
                raw = {
                    header: clean(sheet.cell_value(row_index, column))
                    for column, header in enumerate(headers)
                }
                full_code = raw.get("custno", "")
                row_number = row_index + 1
                row_errors = []
                if not re.fullmatch(r"\d{13}", full_code):
                    row_errors.append(("error", "invalid_cif_code", "custno", full_code, "Mã CIF phải gồm đúng 13 chữ số"))
                if full_code in seen_full_codes:
                    row_errors.append(("error", "duplicate_cif_in_file", "custno", full_code, "Mã CIF bị trùng trong cùng file"))
                seen_full_codes.add(full_code)
                branch_code = full_code[:4] if len(full_code) >= 4 else ""
                customer_core_code = full_code[4:] if len(full_code) == 13 else ""
                if branch_code:
                    detected_branches.add(branch_code)
                for date_column in DATE_COLUMNS:
                    value = raw.get(date_column, "")
                    if value and not parse_yyyymmdd(value):
                        row_errors.append(
                            ("warning", "invalid_date", date_column, value, f"{date_column} không phải ngày YYYYMMDD hợp lệ trong khoảng 1900 đến hiện tại")
                        )
                for severity, code, field, raw_value, message in row_errors:
                    errors.append(
                        {
                            "import_batch_id": batch.id,
                            "source_row_number": row_number,
                            "full_cif_code": full_code or None,
                            "severity": severity,
                            "error_code": code,
                            "field_name": field,
                            "raw_value": raw_value,
                            "message": message,
                        }
                    )
                if any(item[0] == "error" for item in row_errors):
                    continue
                parsed_rows.append(
                    {
                        "full_cif_code": full_code,
                        "branch_code": branch_code,
                        "customer_core_code": customer_core_code,
                        "source_row_number": row_number,
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
                        "source_status": raw.get("stscd") or None,
                        "normalized_status": normalized_status(raw.get("stscd", "")),
                        "operator_user": raw.get("usridop1") or None,
                        "raw_data": raw,
                        "has_warning": any(item[0] == "warning" for item in row_errors),
                    }
                )
            workbook.unload_sheet(sheet_name)

        filename_branch = infer_branch_code(filename)
        if len(detected_branches) != 1:
            raise ValueError(f"File CIF phải chứa đúng một chi nhánh, phát hiện: {', '.join(sorted(detected_branches))}")
        detected_branch = next(iter(detected_branches))
        if filename_branch and filename_branch != detected_branch:
            raise ValueError(f"Chi nhánh trong tên file {filename_branch} không khớp dữ liệu {detected_branch}")
        batch.branch_code = detected_branch
        batch.total_rows = total_rows
        batch.stage = "Đang cập nhật khách hàng CIF"
        batch.progress_percent = 35
        db.commit()

        core_codes = sorted({row["customer_core_code"] for row in parsed_rows})
        customer_by_core = {}
        for group in chunked(core_codes):
            for customer in db.query(CifCustomer).filter(CifCustomer.customer_core_code.in_(group)).all():
                customer_by_core[customer.customer_core_code] = customer
        first_by_core = {}
        for row in parsed_rows:
            first_by_core.setdefault(row["customer_core_code"], row)
        new_customer_mappings = []
        for core_code in core_codes:
            if core_code in customer_by_core:
                continue
            row = first_by_core[core_code]
            new_customer_mappings.append(
                {
                    "customer_core_code": core_code,
                    "customer_name": row["customer_name"],
                    "customer_name_ascii": row["customer_name_ascii"],
                    "customer_type": row["customer_type"],
                    "customer_detail_type": row["customer_detail_type"],
                    "registration_number": row["registration_number"],
                    "passport_number": row["passport_number"],
                    "tax_number": row["tax_number"],
                    "telephone": row["telephone"],
                    "full_address": row["full_address"],
                    "nationality_code": row["nationality_code"],
                    "status": row["normalized_status"],
                    "first_import_batch_id": batch.id,
                    "last_import_batch_id": batch.id,
                }
            )
        for start in range(0, len(new_customer_mappings), 5000):
            db.bulk_insert_mappings(CifCustomer, new_customer_mappings[start:start + 5000])
            db.commit()
        for group in chunked(core_codes):
            for customer in db.query(CifCustomer).filter(CifCustomer.customer_core_code.in_(group)).all():
                customer_by_core[customer.customer_core_code] = customer

        full_codes = [row["full_cif_code"] for row in parsed_rows]
        identifier_by_code = {}
        for group in chunked(full_codes):
            for identifier in db.query(CifCustomerIdentifier).filter(CifCustomerIdentifier.full_cif_code.in_(group)).all():
                identifier_by_code[identifier.full_cif_code] = identifier
        insert_mappings = []
        updated_identifiers = 0
        for row in parsed_rows:
            customer = customer_by_core[row["customer_core_code"]]
            identifier = identifier_by_code.get(row["full_cif_code"])
            payload = {key: value for key, value in row.items() if key != "has_warning"}
            payload.update({"customer_id": customer.id, "import_batch_id": batch.id})
            if identifier:
                for key, value in payload.items():
                    setattr(identifier, key, value)
                updated_identifiers += 1
            else:
                insert_mappings.append(payload)
            customer.last_import_batch_id = batch.id
            if not customer.customer_name and row["customer_name"]:
                customer.customer_name = row["customer_name"]
        for start in range(0, len(insert_mappings), 5000):
            db.bulk_insert_mappings(CifCustomerIdentifier, insert_mappings[start:start + 5000])
            db.commit()
        if errors:
            for start in range(0, len(errors), 5000):
                db.bulk_insert_mappings(CifImportError, errors[start:start + 5000])
                db.commit()

        batch.stage = "Đang kiểm tra xung đột định danh"
        batch.progress_percent = 85
        db.commit()
        _refresh_customer_counts(db)
        conflict_count = _refresh_registration_conflicts(db, batch.id)
        warning_rows = len({item["source_row_number"] for item in errors if item["severity"] == "warning"})
        rejected_rows = total_rows - len(parsed_rows)
        batch.processed_rows = total_rows
        batch.accepted_rows = len(parsed_rows)
        batch.warning_rows = warning_rows
        batch.rejected_rows = rejected_rows
        batch.new_customers = len(new_customer_mappings)
        batch.new_identifiers = len(insert_mappings)
        batch.updated_identifiers = updated_identifiers
        batch.conflict_count = conflict_count
        batch.status = "success"
        batch.stage = "Hoàn thành"
        batch.progress_percent = 100
        batch.finished_at = datetime.now(timezone.utc)
        db.commit()
        return batch.id
    except Exception as exc:
        db.rollback()
        if batch and batch.id:
            failed = db.query(CifImportBatch).filter(CifImportBatch.id == batch.id).first()
            if failed:
                failed.status = "error"
                failed.stage = "Import thất bại"
                failed.error_message = str(exc)
                failed.finished_at = datetime.now(timezone.utc)
                db.commit()
        raise
    finally:
        db.close()
