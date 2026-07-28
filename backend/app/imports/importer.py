import shutil
import threading
import hashlib
import json
from uuid import uuid4
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from queue import Queue

from fastapi import UploadFile
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.imports.cleaners import (
    build_ma_kh_chuan,
    clean_customer_code,
    clean_text,
    parse_decimal,
    parse_int,
    parse_yyyymmdd,
)
from app.imports.filename_parser import ImportFileMeta, parse_import_filename
from app.imports.mappings import validate_required_columns
from app.imports.readers import DEFAULT_CHUNK_SIZE, iter_file_row_chunks
from app.config import settings
from app.database import SessionLocal
from app.models import (
    BC06CustomerClassification,
    BC29CustomerCreditRisk,
    CN05CustomerService,
    Customer,
    DP01DepositAccount,
    FTPLNDailyLoanFTP,
    ImportBatch,
    ImportFile,
    KH02CustomerTransaction,
    LN01Loan,
    PF14AccountBalance,
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
BULK_CHUNK_SIZE = 10000
CUSTOMER_UPSERT_CHUNK_SIZE = 3000
IMPORT_READ_CHUNK_SIZE = max(1000, int(settings.IMPORT_CHUNK_SIZE or DEFAULT_CHUNK_SIZE))
IMPORT_WORKER_COUNT = max(1, int(settings.IMPORT_WORKER_COUNT or 1))
_IMPORT_QUEUE: Queue[int] = Queue()
_IMPORT_QUEUED_IDS: set[int] = set()
_IMPORT_QUEUE_LOCK = threading.Lock()
_IMPORT_WORKERS_STARTED = False


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def json_safe_raw(raw: dict) -> dict:
    safe = {}
    for key, value in raw.items():
        if isinstance(value, (date, datetime)):
            safe[key] = value.isoformat()
        elif isinstance(value, Decimal):
            safe[key] = str(value)
        else:
            safe[key] = value
    return safe


def chunked(items: list[dict], size: int = BULK_CHUNK_SIZE):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def bulk_insert_in_chunks(db: Session, model, mappings: list[dict]) -> None:
    for chunk in chunked(mappings):
        db.bulk_insert_mappings(model, chunk, render_nulls=True)


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def get_driver_connection(db: Session):
    connection = db.connection().connection
    return getattr(connection, "driver_connection", connection)


def copy_insert_mappings(db: Session, model, mappings: list[dict]) -> None:
    if not mappings:
        return
    columns = list(mappings[0].keys())
    table_name = quote_identifier(model.__tablename__)
    column_sql = ", ".join(quote_identifier(column) for column in columns)
    copy_sql = f"COPY {table_name} ({column_sql}) FROM STDIN"
    raw_connection = get_driver_connection(db)
    with raw_connection.cursor() as cursor:
        with cursor.copy(copy_sql) as copy:
            for item in mappings:
                copy.write_row([item.get(column) for column in columns])


def delete_import_file_rows(db: Session, file_id: int) -> None:
    for model in (
        DP01DepositAccount,
        CN05CustomerService,
        LN01Loan,
        PF14AccountBalance,
        BC06CustomerClassification,
        BC29CustomerCreditRisk,
        KH02CustomerTransaction,
        FTPLNDailyLoanFTP,
    ):
        db.execute(delete(model).where(model.import_file_id == file_id))


def get_or_create_batch(db: Session, meta: ImportFileMeta) -> ImportBatch:
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == meta.period_key).first()
    if batch:
        return batch

    batch = ImportBatch(period_key=meta.period_key, period_date=meta.period_date)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def save_upload_file(upload_file: UploadFile, meta: ImportFileMeta) -> tuple[Path, int, str, str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = (
        f"{meta.period_key}_{meta.branch_code}_{meta.file_type}_{uuid4().hex[:12]}_{upload_file.filename}"
    )
    file_path = UPLOAD_DIR / stored_filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer, length=4 * 1024 * 1024)
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return file_path, file_path.stat().st_size, stored_filename, digest.hexdigest()


def delete_uploaded_source_file(import_file: ImportFile) -> str | None:
    if not settings.DELETE_UPLOAD_AFTER_SUCCESS:
        return None
    if not import_file.file_path:
        return None

    file_path = Path(import_file.file_path)
    try:
        resolved_file = file_path.resolve()
        resolved_upload_dir = UPLOAD_DIR.resolve()
        if resolved_upload_dir not in resolved_file.parents and resolved_file != resolved_upload_dir:
            return f"Không xóa file nguồn vì đường dẫn nằm ngoài thư mục uploads: {file_path}"
        if resolved_file.exists() and resolved_file.is_file():
            resolved_file.unlink()
    except Exception as exc:
        return f"Đã import thành công nhưng không xóa được file nguồn: {exc}"
    return None


def remove_stored_upload_file(import_file: ImportFile) -> str | None:
    if not import_file.file_path:
        return None

    file_path = Path(import_file.file_path)
    try:
        resolved_file = file_path.resolve()
        resolved_upload_dir = UPLOAD_DIR.resolve()
        if resolved_upload_dir not in resolved_file.parents and resolved_file != resolved_upload_dir:
            return f"Không xóa file nguồn vì đường dẫn nằm ngoài thư mục uploads: {file_path}"
        if resolved_file.exists() and resolved_file.is_file():
            resolved_file.unlink()
    except Exception as exc:
        return f"Không xóa được file nguồn tạm: {exc}"
    return None


def cleanup_after_success(db: Session, import_file: ImportFile) -> None:
    cleanup_message = delete_uploaded_source_file(import_file)
    if cleanup_message:
        import_file.error_message = cleanup_message
        db.add(import_file)
        db.commit()


def _create_import_file(
    db: Session,
    upload_file: UploadFile,
    meta: ImportFileMeta,
    batch: ImportBatch,
    file_path: Path,
    file_size: int,
    stored_filename: str,
    content_sha256: str,
) -> ImportFile:
    import_file = ImportFile(
        import_batch_id=batch.id,
        original_filename=upload_file.filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_type=meta.file_type,
        branch_code=meta.branch_code,
        period_key=meta.period_key,
        period_date=meta.period_date,
        period_start=meta.period_start,
        period_end=meta.period_end,
        business_date=meta.business_date,
        filename_suffix=meta.filename_suffix,
        frequency=meta.frequency,
        content_sha256=content_sha256,
        file_ext=meta.file_ext,
        file_size=file_size,
        status="processing",
        started_at=utc_now(),
    )
    db.add(import_file)
    db.commit()
    db.refresh(import_file)
    return import_file


def ensure_unique_file_content(
    db: Session,
    meta: ImportFileMeta,
    content_sha256: str,
) -> None:
    duplicate = (
        db.query(ImportFile)
        .filter(
            ImportFile.branch_code == meta.branch_code,
            ImportFile.file_type == meta.file_type,
            ImportFile.period_key == meta.period_key,
            ImportFile.content_sha256 == content_sha256,
            ImportFile.status.notin_(["deleted", "replaced"]),
        )
        .first()
    )
    if duplicate:
        raise ValueError(
            f"Nội dung file đã tồn tại trong kho dưới tên {duplicate.original_filename}"
        )


def source_row_hash(raw: dict) -> str:
    payload = json.dumps(json_safe_raw(raw), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_source_identity(import_file: ImportFile, branch_code, source_date=None) -> None:
    branch = clean_text(branch_code)
    if branch and branch != import_file.branch_code:
        raise ValueError(
            f"Mã chi nhánh trong dữ liệu ({branch}) không khớp tên file ({import_file.branch_code})"
        )
    if source_date and import_file.file_type == "FTPLN" and source_date != import_file.business_date:
        raise ValueError(
            f"Ngày TRDT ({source_date}) không khớp ngày FTPLN trên tên file ({import_file.business_date})"
        )
    if source_date and import_file.file_type == "KH02":
        if not import_file.period_start or not import_file.period_end:
            raise ValueError("File KH02 thiếu metadata khoảng ngày")
        if source_date < import_file.period_start or source_date > import_file.period_end:
            raise ValueError(
                f"Ngày TRDATE ({source_date}) nằm ngoài khoảng ngày trên tên file"
            )


def _upsert_customers_from_dp01(db: Session, rows: list[dict], period_key: str) -> None:
    customer_map = {}
    for row in rows:
        ma_kh_chuan = row.get("ma_kh_chuan")
        if not ma_kh_chuan:
            continue
        customer_map[ma_kh_chuan] = {
            "ma_kh_chuan": ma_kh_chuan,
            "ma_cn": row.get("ma_cn"),
            "ma_kh": row.get("ma_kh"),
            "ten_kh": row.get("ten_kh"),
            "id_number": row.get("id_number"),
            "birth_date": row.get("birth_date"),
            "sex_type": row.get("sex_type"),
            "telephone": row.get("telephone"),
            "first_seen_period": period_key,
            "last_seen_period": period_key,
        }

    if not customer_map:
        return

    for values in chunked(list(customer_map.values()), CUSTOMER_UPSERT_CHUNK_SIZE):
        statement = insert(Customer).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[Customer.ma_kh_chuan],
            set_={
                "ten_kh": statement.excluded.ten_kh,
                "id_number": statement.excluded.id_number,
                "birth_date": statement.excluded.birth_date,
                "sex_type": statement.excluded.sex_type,
                "telephone": statement.excluded.telephone,
                "last_seen_period": statement.excluded.last_seen_period,
            },
        )
        db.execute(statement)


def _import_dp01(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        ma_cn = clean_text(raw.get("MA_CN")) or import_file.branch_code
        ma_kh = clean_customer_code(raw.get("MA_KH"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(ma_cn, ma_kh),
                "ma_cn": ma_cn,
                "ma_kh": ma_kh,
                "ten_kh": clean_text(raw.get("TEN_KH")),
                "dp_type_name": clean_text(raw.get("DP_TYPE_NAME")),
                "ccy": clean_text(raw.get("CCY")),
                "current_balance": parse_decimal(raw.get("CURRENT_BALANCE")),
                "so_tai_khoan": clean_text(raw.get("SO_TAI_KHOAN")),
                "opening_date": parse_yyyymmdd(raw.get("OPENING_DATE")),
                "maturity_date": parse_yyyymmdd(raw.get("MATURITY_DATE")),
                "month_term": clean_text(raw.get("MONTH_TERM")),
                "ma_pgd": clean_text(raw.get("MA_PGD")),
                "ten_pgd": clean_text(raw.get("TEN_PGD")),
                "dp_type_code": clean_text(raw.get("DP_TYPE_CODE")),
                "cust_type": clean_text(raw.get("CUST_TYPE")),
                "cust_type_name": clean_text(raw.get("CUST_TYPE_NAME")),
                "id_number": clean_text(raw.get("ID_NUMBER")),
                "sex_type": clean_text(raw.get("SEX_TYPE")),
                "birth_date": parse_yyyymmdd(raw.get("BIRTH_DATE")),
                "telephone": clean_text(raw.get("TELEPHONE")),
                "dramt": parse_decimal(raw.get("DRAMT")),
                "cramt": parse_decimal(raw.get("CRAMT")),
                "employee_number": clean_text(raw.get("EMPLOYEE_NUMBER")),
                "employee_name": clean_text(raw.get("EMPLOYEE_NAME")),
                "tygia": parse_decimal(raw.get("TYGIA")),
            }
        )
    bulk_insert_in_chunks(db, DP01DepositAccount, mappings)
    _upsert_customers_from_dp01(db, mappings, import_file.period_key)
    return len(mappings)


def _import_cn05(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        ma_cn = clean_text(raw.get("MA_CN")) or import_file.branch_code
        ma_kh = clean_customer_code(raw.get("MA_KH"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(ma_cn, ma_kh),
                "ma_cn": ma_cn,
                "ma_kh": ma_kh,
                "ten_kh": clean_text(raw.get("TEN_KH")),
                "tktt_so_tk": parse_int(raw.get("TKTT_SO_TK")),
                "tktt_tk_sodep": parse_int(raw.get("TKTT_TK_SODEP")),
                "tk_osb": parse_int(raw.get("TK_OSB")),
                "tg_tien_gui_loi_thong_minh": parse_int(raw.get("TG_TIEN_GUI_LOI_THONG_MINH")),
                "tg_tien_gui_truc_tuyen": parse_int(raw.get("TG_TIEN_GUI_TRUC_TUYEN")),
                "tg_tien_gui_tai_quay": parse_int(raw.get("TG_TIEN_GUI_TAI_QUAY")),
                "tg_sms_tien_gui": parse_int(raw.get("TG_SMS_TIEN_GUI")),
                "vv_tong_so_lds": parse_int(raw.get("VV_TONG_SO_LDS")),
                "vv_sms_tien_vay": parse_int(raw.get("VV_SMS_TIEN_VAY")),
                "vv_tong_so_lds_centercut": parse_int(raw.get("VV_TONG_SO_LDS_CENTERCUT")),
                "the_ghi_no_noi_dia": parse_int(raw.get("THE_GHI_NO_NOI_DIA")),
                "the_ghi_no_quoc_te": parse_int(raw.get("THE_GHI_NO_QUOC_TE")),
                "the_tin_dung_noi_dia": parse_int(raw.get("THE_TIN_DUNG_NOI_DIA")),
                "the_tin_dung_quoc_te": parse_int(raw.get("THE_TIN_DUNG_QUOC_TE")),
                "visa": parse_int(raw.get("VISA")),
                "master": parse_int(raw.get("MASTER")),
                "jcb": parse_int(raw.get("JCB")),
                "dk_agribank_plus": parse_int(raw.get("DK_AGRIBANK_PLUS")),
                "dk_agribank_plus_ott": parse_int(raw.get("DK_AGRIBANK_PLUS_OTT")),
                "sms_banking": parse_int(raw.get("SMS_BANKING")),
                "tien_vay": parse_int(raw.get("TIEN_VAY")),
            }
        )
    bulk_insert_in_chunks(db, CN05CustomerService, mappings)
    return len(mappings)


def _import_ln01(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        brcd = clean_text(raw.get("BRCD")) or import_file.branch_code
        custseq = clean_customer_code(raw.get("CUSTSEQ"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(brcd, custseq),
                "brcd": brcd,
                "custseq": custseq,
                "custnm": clean_text(raw.get("CUSTNM")),
                "ccy": clean_text(raw.get("CCY")),
                "du_no": parse_decimal(raw.get("DU_NO")),
                "dsbsseq": clean_text(raw.get("DSBSSEQ")),
                "transaction_date": parse_yyyymmdd(raw.get("TRANSACTION_DATE")),
                "interest_rate": parse_decimal(raw.get("INTEREST_RATE")),
                "apprseq": clean_text(raw.get("APPRSEQ")),
                "loan_type": clean_text(raw.get("LOAN_TYPE")),
                "officer_id": clean_text(raw.get("OFFICER_ID")),
                "officer_name": clean_text(raw.get("OFFICER_NAME")),
                "trctcd": clean_text(raw.get("TRCTCD")),
                "trctnm": clean_text(raw.get("TRCTNM")),
                "accrual_amount": parse_decimal(raw.get("ACCRUAL_AMOUNT")),
                "accrual_amount_end_of_month": parse_decimal(raw.get("ACCRUAL_AMOUNT_END_OF_MONTH")),
                "ty_gia": parse_decimal(raw.get("TY_GIA")),
                "officer_ipcas": clean_text(raw.get("OFFICER_IPCAS")),
            }
        )
    bulk_insert_in_chunks(db, LN01Loan, mappings)
    return len(mappings)


def _import_pf14(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        trbrcd = clean_text(raw.get("TRBRCD")) or import_file.branch_code
        custseq = clean_customer_code(raw.get("CUSTSEQ"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(trbrcd, custseq),
                "trbrcd": trbrcd,
                "productcode": clean_text(raw.get("PRODUCTCODE")),
                "accountno": clean_text(raw.get("ACCOUNTNO")),
                "custseq": custseq,
                "custname": clean_text(raw.get("CUSTNAME")),
                "averagebalance": parse_decimal(raw.get("AVERAGEBALANCE")),
                "monthlyendbalance": parse_decimal(raw.get("MONTHLYENDBALANCE")),
                "operationalfunds": parse_decimal(raw.get("OPERATIONALFUNDS")),
                "monterm": parse_int(raw.get("MONTERM")),
                "ccy": clean_text(raw.get("CCY")),
            }
        )
    bulk_insert_in_chunks(db, PF14AccountBalance, mappings)
    return len(mappings)


IMPORT_HANDLERS = {
    "DP01": _import_dp01,
    "CN05": _import_cn05,
    "LN01": _import_ln01,
    "PF14": _import_pf14,
}


def _copy_dp01_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        ma_cn = clean_text(raw.get("MA_CN")) or import_file.branch_code
        ma_kh = clean_customer_code(raw.get("MA_KH"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(ma_cn, ma_kh),
                "ma_cn": ma_cn,
                "ma_kh": ma_kh,
                "ten_kh": clean_text(raw.get("TEN_KH")),
                "dp_type_name": clean_text(raw.get("DP_TYPE_NAME")),
                "ccy": clean_text(raw.get("CCY")),
                "current_balance": parse_decimal(raw.get("CURRENT_BALANCE")),
                "so_tai_khoan": clean_text(raw.get("SO_TAI_KHOAN")),
                "opening_date": parse_yyyymmdd(raw.get("OPENING_DATE")),
                "maturity_date": parse_yyyymmdd(raw.get("MATURITY_DATE")),
                "month_term": clean_text(raw.get("MONTH_TERM")),
                "ma_pgd": clean_text(raw.get("MA_PGD")),
                "ten_pgd": clean_text(raw.get("TEN_PGD")),
                "dp_type_code": clean_text(raw.get("DP_TYPE_CODE")),
                "cust_type": clean_text(raw.get("CUST_TYPE")),
                "cust_type_name": clean_text(raw.get("CUST_TYPE_NAME")),
                "id_number": clean_text(raw.get("ID_NUMBER")),
                "sex_type": clean_text(raw.get("SEX_TYPE")),
                "birth_date": parse_yyyymmdd(raw.get("BIRTH_DATE")),
                "telephone": clean_text(raw.get("TELEPHONE")),
                "dramt": parse_decimal(raw.get("DRAMT")),
                "cramt": parse_decimal(raw.get("CRAMT")),
                "employee_number": clean_text(raw.get("EMPLOYEE_NUMBER")),
                "employee_name": clean_text(raw.get("EMPLOYEE_NAME")),
                "tygia": parse_decimal(raw.get("TYGIA")),
            }
        )
    copy_insert_mappings(db, DP01DepositAccount, mappings)
    _upsert_customers_from_dp01(db, mappings, import_file.period_key)
    return len(mappings)


def _copy_cn05_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        ma_cn = clean_text(raw.get("MA_CN")) or import_file.branch_code
        ma_kh = clean_customer_code(raw.get("MA_KH"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(ma_cn, ma_kh),
                "ma_cn": ma_cn,
                "ma_kh": ma_kh,
                "ten_kh": clean_text(raw.get("TEN_KH")),
                "tktt_so_tk": parse_int(raw.get("TKTT_SO_TK")),
                "tktt_tk_sodep": parse_int(raw.get("TKTT_TK_SODEP")),
                "tk_osb": parse_int(raw.get("TK_OSB")),
                "tg_tien_gui_loi_thong_minh": parse_int(raw.get("TG_TIEN_GUI_LOI_THONG_MINH")),
                "tg_tien_gui_truc_tuyen": parse_int(raw.get("TG_TIEN_GUI_TRUC_TUYEN")),
                "tg_tien_gui_tai_quay": parse_int(raw.get("TG_TIEN_GUI_TAI_QUAY")),
                "tg_sms_tien_gui": parse_int(raw.get("TG_SMS_TIEN_GUI")),
                "vv_tong_so_lds": parse_int(raw.get("VV_TONG_SO_LDS")),
                "vv_sms_tien_vay": parse_int(raw.get("VV_SMS_TIEN_VAY")),
                "vv_tong_so_lds_centercut": parse_int(raw.get("VV_TONG_SO_LDS_CENTERCUT")),
                "the_ghi_no_noi_dia": parse_int(raw.get("THE_GHI_NO_NOI_DIA")),
                "the_ghi_no_quoc_te": parse_int(raw.get("THE_GHI_NO_QUOC_TE")),
                "the_tin_dung_noi_dia": parse_int(raw.get("THE_TIN_DUNG_NOI_DIA")),
                "the_tin_dung_quoc_te": parse_int(raw.get("THE_TIN_DUNG_QUOC_TE")),
                "visa": parse_int(raw.get("VISA")),
                "master": parse_int(raw.get("MASTER")),
                "jcb": parse_int(raw.get("JCB")),
                "dk_agribank_plus": parse_int(raw.get("DK_AGRIBANK_PLUS")),
                "dk_agribank_plus_ott": parse_int(raw.get("DK_AGRIBANK_PLUS_OTT")),
                "sms_banking": parse_int(raw.get("SMS_BANKING")),
                "tien_vay": parse_int(raw.get("TIEN_VAY")),
            }
        )
    copy_insert_mappings(db, CN05CustomerService, mappings)
    return len(mappings)


def _copy_ln01_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        brcd = clean_text(raw.get("BRCD")) or import_file.branch_code
        custseq = clean_customer_code(raw.get("CUSTSEQ"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(brcd, custseq),
                "brcd": brcd,
                "custseq": custseq,
                "custnm": clean_text(raw.get("CUSTNM")),
                "ccy": clean_text(raw.get("CCY")),
                "du_no": parse_decimal(raw.get("DU_NO")),
                "dsbsseq": clean_text(raw.get("DSBSSEQ")),
                "transaction_date": parse_yyyymmdd(raw.get("TRANSACTION_DATE")),
                "interest_rate": parse_decimal(raw.get("INTEREST_RATE")),
                "apprseq": clean_text(raw.get("APPRSEQ")),
                "loan_type": clean_text(raw.get("LOAN_TYPE")),
                "officer_id": clean_text(raw.get("OFFICER_ID")),
                "officer_name": clean_text(raw.get("OFFICER_NAME")),
                "trctcd": clean_text(raw.get("TRCTCD")),
                "trctnm": clean_text(raw.get("TRCTNM")),
                "accrual_amount": parse_decimal(raw.get("ACCRUAL_AMOUNT")),
                "accrual_amount_end_of_month": parse_decimal(raw.get("ACCRUAL_AMOUNT_END_OF_MONTH")),
                "ty_gia": parse_decimal(raw.get("TY_GIA")),
                "officer_ipcas": clean_text(raw.get("OFFICER_IPCAS")),
            }
        )
    copy_insert_mappings(db, LN01Loan, mappings)
    return len(mappings)


def _copy_pf14_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        trbrcd = clean_text(raw.get("TRBRCD")) or import_file.branch_code
        custseq = clean_customer_code(raw.get("CUSTSEQ"))
        mappings.append(
            {
                "import_file_id": import_file.id,
                "import_batch_id": import_file.import_batch_id,
                "period_key": import_file.period_key,
                "period_date": import_file.period_date,
                "branch_code": import_file.branch_code,
                "ma_kh_chuan": build_ma_kh_chuan(trbrcd, custseq),
                "trbrcd": trbrcd,
                "productcode": clean_text(raw.get("PRODUCTCODE")),
                "accountno": clean_text(raw.get("ACCOUNTNO")),
                "custseq": custseq,
                "custname": clean_text(raw.get("CUSTNAME")),
                "averagebalance": parse_decimal(raw.get("AVERAGEBALANCE")),
                "monthlyendbalance": parse_decimal(raw.get("MONTHLYENDBALANCE")),
                "operationalfunds": parse_decimal(raw.get("OPERATIONALFUNDS")),
                "monterm": parse_int(raw.get("MONTERM")),
                "ccy": clean_text(raw.get("CCY")),
            }
        )
    copy_insert_mappings(db, PF14AccountBalance, mappings)
    return len(mappings)


def _import_bc06_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    expected_month = import_file.period_key[:6]
    for raw in rows:
        branch_code = clean_text(raw.get("MA_CHI_NHANH")) or import_file.branch_code
        validate_source_identity(import_file, branch_code)
        classification_month = clean_text(raw.get("THANG_PHAN_LOAI"))
        if classification_month and classification_month != expected_month:
            raise ValueError(
                f"THANG_PHAN_LOAI {classification_month} không khớp kỳ {expected_month} trên tên file"
            )
        mappings.append({
            "import_file_id": import_file.id,
            "import_batch_id": import_file.import_batch_id,
            "period_key": import_file.period_key,
            "period_date": import_file.period_date,
            "branch_code": branch_code,
            "branch_name": clean_text(raw.get("TEN_CHI_NHANH")),
            "customer_code": clean_customer_code(raw.get("MA_KHACH_HANG")),
            "customer_name": clean_text(raw.get("TEN_KHACH_HANG")),
            "customer_type": clean_text(raw.get("LOAI_KHACH_HANG")),
            "classification_month": classification_month,
            "deposit_benefit_branch": parse_decimal(raw.get("LOI_ICH_TG_TAI_CN")),
            "loan_benefit_branch": parse_decimal(raw.get("LOI_ICH_TV_TAI_CN")),
            "service_benefit_branch": parse_decimal(raw.get("LOI_ICH_DV_TAI_CN")),
            "term_deposit_avg_branch": parse_decimal(raw.get("SDBQ_TGCKH_CN")),
            "demand_deposit_avg_branch": parse_decimal(raw.get("SDBQ_TGKKH_CN")),
            "loan_avg_balance": parse_decimal(raw.get("SDBQ_TV")),
            "benefit_score_branch": parse_decimal(raw.get("DIEM_LOI_ICH_CN")),
            "balance_score_branch": parse_decimal(raw.get("DIEM_SDBQ_CN")),
            "qualitative_score_branch": parse_decimal(raw.get("DIEM_DINH_TINH_CN")),
            "customer_score_branch": parse_decimal(raw.get("DIEM_KH_CN")),
            "additional_criteria_branch": clean_text(raw.get("TIEU_CHI_BS_CN")),
            "segment_branch": clean_text(raw.get("NHOM_TAI_CN")),
            "rank_branch": clean_text(raw.get("HANG_TAI_CN")),
            "market_segment_branch": clean_text(raw.get("NHOM_TT_CN")),
            "market_rank_branch": clean_text(raw.get("HANG_TT_CN")),
            "additional_criteria_system": clean_text(raw.get("TIEU_CHI_BS_AGR")),
            "segment_system": clean_text(raw.get("NHOM_AGR")),
            "rank_system": clean_text(raw.get("HANG_AGR")),
            "market_segment_system": clean_text(raw.get("NHOM_TT_AGR")),
            "market_rank_system": clean_text(raw.get("HANG_TT_AGR")),
            "adjustment_unit": clean_text(raw.get("DON_VI_DIEU_CHINH")),
            "managing_unit": clean_text(raw.get("DON_VI_DAU_MOI")),
            "raw_data": json_safe_raw(raw),
        })
    bulk_insert_in_chunks(db, BC06CustomerClassification, mappings)
    return len(mappings)


def _import_bc29_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        branch_code = clean_text(raw.get("MA_CN")) or import_file.branch_code
        validate_source_identity(import_file, branch_code)
        mappings.append({
            "import_file_id": import_file.id,
            "import_batch_id": import_file.import_batch_id,
            "period_key": import_file.period_key,
            "period_date": import_file.period_date,
            "branch_code": branch_code,
            "customer_code": clean_customer_code(raw.get("MA_KH")),
            "customer_name": clean_text(raw.get("TEN_KH")),
            "debt_group": clean_text(raw.get("NHOM_NO")),
            "total_outstanding": parse_decimal(raw.get("TONG_DN")),
            "provision_base_amount": parse_decimal(raw.get("TONG_DN_PHAI_TRICH")),
            "period_provision_amount": parse_decimal(raw.get("SO_TRICH_LAP_TRONG_KY")),
            "classification": clean_text(raw.get("XEP_LOAI")),
            "total_collateral_deductible_value": parse_decimal(raw.get("TONG_GTKT_TSDB")),
            "total_collateral_value": parse_decimal(raw.get("TONG_TSDB")),
            "real_estate_collateral": parse_decimal(raw.get("BDS")),
            "movable_asset_collateral": parse_decimal(raw.get("DS")),
            "valuable_paper_collateral": parse_decimal(raw.get("GTCG")),
            "other_collateral": parse_decimal(raw.get("KHAC")),
            "principal_overdue_days": parse_int(raw.get("SO_NGAY_QHG")),
            "interest_overdue_days": parse_int(raw.get("SO_NGAY_QHL")),
            "risk_handling_date": parse_yyyymmdd(raw.get("NGAY_XLRR")),
            "accrued_interest": parse_decimal(raw.get("LAI_DU_THU")),
            "off_balance_outstanding": parse_decimal(raw.get("DN_NGOAI_BANG")),
            "credit_outstanding": parse_decimal(raw.get("DN_TIN_DUNG")),
            "overdraft_outstanding": parse_decimal(raw.get("DN_THAU_CHI")),
            "handled_risk_amount": parse_decimal(raw.get("SO_TIEN_DA_XLRR")),
            "employee_code": clean_text(raw.get("MA_NHAN_VIEN")),
            "employee_unit": clean_text(raw.get("DON_VI_CONG_TAC")),
            "raw_data": json_safe_raw(raw),
        })
    bulk_insert_in_chunks(db, BC29CustomerCreditRisk, mappings)
    return len(mappings)


def _import_kh02_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        transaction_date = parse_yyyymmdd(raw.get("TRDATE"))
        if not transaction_date:
            raise ValueError(f"TRDATE không hợp lệ: {raw.get('TRDATE')}")
        branch_code = clean_text(raw.get("TRBRCD")) or import_file.branch_code
        validate_source_identity(import_file, branch_code, transaction_date)
        mappings.append({
            "import_file_id": import_file.id,
            "import_batch_id": import_file.import_batch_id,
            "period_key": import_file.period_key,
            "transaction_date": transaction_date,
            "branch_code": branch_code,
            "customer_code": clean_customer_code(raw.get("CUSTSEQ")),
            "customer_name": clean_text(raw.get("CUSTNAME")),
            "transaction_user": clean_text(raw.get("USERHT")),
            "daily_sequence": clean_text(raw.get("DYSEQ")),
            "daily_transaction_sequence": clean_text(raw.get("DYTRSEQ")),
            "account_code": clean_text(raw.get("ACCTCD")),
            "business_code": clean_text(raw.get("BUSCD")),
            "unit_business_code": clean_text(raw.get("UNITBUSCD")),
            "transaction_code": clean_text(raw.get("TRCD")),
            "transaction_reference_type": clean_text(raw.get("TRREF")),
            "transaction_sequence": clean_text(raw.get("TRSEQ")),
            "transaction_counterparty_code": clean_text(raw.get("TRCTCD")),
            "credit_officer_code": clean_text(raw.get("CBTD")),
            "debit_amount": parse_decimal(raw.get("DRAMT")),
            "credit_amount": parse_decimal(raw.get("CRAMT")),
            "source_row_hash": source_row_hash(raw),
            "raw_data": json_safe_raw(raw),
        })
    bulk_insert_in_chunks(db, KH02CustomerTransaction, mappings)
    return len(mappings)


def _import_ftpln_chunk(db: Session, rows: list[dict], import_file: ImportFile) -> int:
    mappings = []
    for raw in rows:
        business_date = parse_yyyymmdd(raw.get("TRDT"))
        if not business_date:
            raise ValueError(f"TRDT không hợp lệ: {raw.get('TRDT')}")
        branch_code = clean_text(raw.get("BRCD")) or import_file.branch_code
        validate_source_identity(import_file, branch_code, business_date)
        mappings.append({
            "import_file_id": import_file.id,
            "import_batch_id": import_file.import_batch_id,
            "period_key": import_file.period_key,
            "business_date": business_date,
            "branch_code": branch_code,
            "parent_branch_code": clean_text(raw.get("PRNTBRCD")),
            "business_code": clean_text(raw.get("BUSCD")),
            "unit_business_code": clean_text(raw.get("UNTBUSCD")),
            "credit_contract_number": clean_text(raw.get("SO_HDTD")),
            "transaction_reference": clean_text(raw.get("TRREF")),
            "transaction_sequence": clean_text(raw.get("TRSEQ")),
            "reference_number": clean_text(raw.get("REFNO")),
            "account_code": clean_text(raw.get("NACCTCD")),
            "ftp_code": clean_text(raw.get("FTPCD")),
            "customer_code": clean_customer_code(raw.get("CUSTSEQ")),
            "customer_name": clean_text(raw.get("CUSTNM")),
            "customer_type": clean_text(raw.get("CUSTTP")),
            "term_type_code": clean_text(raw.get("TIMETPCD")),
            "customer_segment": clean_text(raw.get("PLKH")),
            "ftp_rate": parse_decimal(raw.get("FTP")),
            "interest_rate": parse_decimal(raw.get("INTRT")),
            "ftp_adjustment": parse_decimal(raw.get("MUCFTPDC")),
            "opening_date": parse_yyyymmdd(raw.get("OPNDT")),
            "maturity_date": parse_yyyymmdd(raw.get("MATDT")),
            "currency_code": clean_text(raw.get("CCY")),
            "ledger_balance": parse_decimal(raw.get("LDRBAL")),
            "capital_price_amount": parse_decimal(raw.get("CPAMT")),
            "accumulated_capital_price": parse_decimal(raw.get("CPLKAMT")),
            "economic_sector_code": clean_text(raw.get("ECONO_SECT")),
            "udp_code": clean_text(raw.get("UDP")),
            "transaction_counterparty_code": clean_text(raw.get("TRCTCD")),
            "credit_officer_code": clean_text(raw.get("CBTD")),
            "final_acquisition_code": clean_text(raw.get("AQCCDFIN")),
            "final_rank": clean_text(raw.get("HANGFINAL")),
            "raw_data": json_safe_raw(raw),
        })
    bulk_insert_in_chunks(db, FTPLNDailyLoanFTP, mappings)
    return len(mappings)


COPY_CHUNK_HANDLERS = {
    "DP01": _copy_dp01_chunk,
    "CN05": _copy_cn05_chunk,
    "LN01": _copy_ln01_chunk,
    "PF14": _copy_pf14_chunk,
    "BC06": _import_bc06_chunk,
    "BC29": _import_bc29_chunk,
    "KH02": _import_kh02_chunk,
    "FTPLN": _import_ftpln_chunk,
}


def import_file_with_copy_chunks(db: Session, import_file: ImportFile) -> int:
    total_rows = 0
    saw_data = False
    handler = COPY_CHUNK_HANDLERS[import_file.file_type]
    for rows in iter_file_row_chunks(import_file.file_path, chunk_size=IMPORT_READ_CHUNK_SIZE):
        if not saw_data:
            validate_required_columns(rows, import_file.file_type)
            saw_data = True
        total_rows += handler(db, rows, import_file)
        import_file.total_rows = total_rows
        import_file.success_rows = total_rows
        db.commit()
    if not saw_data:
        raise ValueError("File không có dữ liệu")
    return total_rows


def import_uploaded_file(db: Session, upload_file: UploadFile, replace_existing: bool = False) -> ImportFile:
    meta = parse_import_filename(upload_file.filename)
    batch = get_or_create_batch(db, meta)
    file_path, file_size, stored_filename, content_sha256 = save_upload_file(upload_file, meta)

    if replace_existing:
        existing = (
            db.query(ImportFile)
            .filter(
                ImportFile.branch_code == meta.branch_code,
                ImportFile.file_type == meta.file_type,
                ImportFile.period_key == meta.period_key,
                ImportFile.original_filename == upload_file.filename,
            )
            .first()
        )
        if existing:
            delete_import_file_rows(db, existing.id)
            remove_stored_upload_file(existing)
            db.delete(existing)
            db.flush()

    try:
        ensure_unique_file_content(db, meta, content_sha256)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    try:
        import_file = _create_import_file(
            db, upload_file, meta, batch, file_path, file_size, stored_filename, content_sha256
        )
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("File này đã được import. Nếu muốn import lại, hãy bật replace_existing.") from exc

    try:
        success_rows = import_file_with_copy_chunks(db, import_file)
        now = utc_now()
        import_file.total_rows = success_rows
        import_file.success_rows = success_rows
        import_file.error_rows = 0
        import_file.status = "success"
        import_file.finished_at = now
        import_file.duration_seconds = max(1, int((now - import_file.started_at).total_seconds())) if import_file.started_at else 0
        db.commit()
        cleanup_after_success(db, import_file)
        db.refresh(import_file)
        return import_file
    except Exception as exc:
        db.rollback()
        delete_import_file_rows(db, import_file.id)
        now = utc_now()
        import_file.status = "error"
        import_file.error_message = str(exc)
        import_file.finished_at = now
        import_file.duration_seconds = max(1, int((now - import_file.started_at).total_seconds())) if import_file.started_at else 0
        db.add(import_file)
        db.commit()
        raise


def queue_uploaded_file(db: Session, upload_file: UploadFile, replace_existing: bool = False) -> ImportFile:
    meta = parse_import_filename(upload_file.filename)
    batch = get_or_create_batch(db, meta)
    file_path, file_size, stored_filename, content_sha256 = save_upload_file(upload_file, meta)

    if replace_existing:
        existing = (
            db.query(ImportFile)
            .filter(
                ImportFile.branch_code == meta.branch_code,
                ImportFile.file_type == meta.file_type,
                ImportFile.period_key == meta.period_key,
                ImportFile.original_filename == upload_file.filename,
            )
            .first()
        )
        if existing:
            delete_import_file_rows(db, existing.id)
            remove_stored_upload_file(existing)
            db.delete(existing)
            db.flush()

    try:
        ensure_unique_file_content(db, meta, content_sha256)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    import_file = _create_import_file(
        db, upload_file, meta, batch, file_path, file_size, stored_filename, content_sha256
    )
    import_file.status = "queued"
    import_file.started_at = None
    import_file.finished_at = None
    import_file.duration_seconds = 0
    db.commit()
    db.refresh(import_file)
    return import_file


def process_import_file(import_file_id: int) -> None:
    db = SessionLocal()
    try:
        claimed = (
            db.query(ImportFile)
            .filter(ImportFile.id == import_file_id, ImportFile.status == "queued")
            .update(
                {
                    "status": "processing",
                    "error_message": None,
                    "started_at": utc_now(),
                    "finished_at": None,
                    "duration_seconds": 0,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        if claimed != 1:
            return

        import_file = db.query(ImportFile).filter(ImportFile.id == import_file_id).first()
        if not import_file:
            return

        if import_file.total_rows or import_file.success_rows:
            delete_import_file_rows(db, import_file.id)
            import_file.total_rows = 0
            import_file.success_rows = 0
            import_file.error_rows = 0
            db.commit()

        success_rows = import_file_with_copy_chunks(db, import_file)
        now = utc_now()
        import_file.total_rows = success_rows
        import_file.success_rows = success_rows
        import_file.error_rows = 0
        import_file.status = "success"
        import_file.finished_at = now
        import_file.duration_seconds = max(1, int((now - import_file.started_at).total_seconds())) if import_file.started_at else 0
        db.commit()
        cleanup_after_success(db, import_file)
    except Exception as exc:
        db.rollback()
        import_file = db.query(ImportFile).filter(ImportFile.id == import_file_id).first()
        if import_file:
            delete_import_file_rows(db, import_file.id)
            now = utc_now()
            import_file.status = "error"
            import_file.error_message = str(exc)
            import_file.finished_at = now
            import_file.duration_seconds = max(1, int((now - import_file.started_at).total_seconds())) if import_file.started_at else 0
            db.commit()
    finally:
        db.close()


def _import_worker_loop(worker_name: str) -> None:
    while True:
        import_file_id = _IMPORT_QUEUE.get()
        try:
            process_import_file(import_file_id)
        finally:
            with _IMPORT_QUEUE_LOCK:
                _IMPORT_QUEUED_IDS.discard(import_file_id)
            _IMPORT_QUEUE.task_done()


def start_import_workers() -> None:
    global _IMPORT_WORKERS_STARTED
    with _IMPORT_QUEUE_LOCK:
        if _IMPORT_WORKERS_STARTED:
            return
        _IMPORT_WORKERS_STARTED = True
        for index in range(IMPORT_WORKER_COUNT):
            thread = threading.Thread(
                target=_import_worker_loop,
                args=(f"import-worker-{index + 1}",),
                name=f"import-worker-{index + 1}",
                daemon=True,
            )
            thread.start()


def enqueue_import_file(import_file_id: int) -> None:
    start_import_workers()
    with _IMPORT_QUEUE_LOCK:
        if import_file_id in _IMPORT_QUEUED_IDS:
            return
        _IMPORT_QUEUED_IDS.add(import_file_id)
    _IMPORT_QUEUE.put(import_file_id)


def enqueue_pending_import_files() -> int:
    start_import_workers()
    db = SessionLocal()
    try:
        stale_processing = db.query(ImportFile).filter(ImportFile.status == "processing").all()
        for item in stale_processing:
            item.status = "queued"
            item.error_message = "Đưa lại vào hàng chờ sau khi backend khởi động lại"
        if stale_processing:
            db.commit()

        rows = db.query(ImportFile.id).filter(ImportFile.status == "queued").all()
        for row in rows:
            enqueue_import_file(row.id)
        return len(rows)
    finally:
        db.close()


def recover_import_jobs(period_key: str | None = None) -> int:
    start_import_workers()
    db = SessionLocal()
    try:
        query = db.query(ImportFile).filter(ImportFile.status == "processing")
        if period_key:
            query = query.filter(ImportFile.period_key == period_key)
        processing_files = query.all()
        for item in processing_files:
            delete_import_file_rows(db, item.id)
            item.status = "queued"
            item.error_message = "Đưa lại vào hàng chờ do job import bị kẹt hoặc backend reload giữa chừng"
            item.total_rows = 0
            item.success_rows = 0
            item.error_rows = 0
            item.started_at = None
            item.finished_at = None
            item.duration_seconds = 0
        if processing_files:
            db.commit()

        queued_query = db.query(ImportFile.id).filter(ImportFile.status == "queued")
        if period_key:
            queued_query = queued_query.filter(ImportFile.period_key == period_key)
        rows = queued_query.order_by(ImportFile.uploaded_at).all()
        for row in rows:
            enqueue_import_file(row.id)
        return len(rows)
    finally:
        db.close()


def process_delete_import_file(import_file_id: int) -> None:
    db = SessionLocal()
    try:
        import_file = db.query(ImportFile).filter(ImportFile.id == import_file_id).first()
        if not import_file or import_file.status in {"deleted", "replaced"}:
            return
        original_filename = import_file.original_filename
        delete_import_file_rows(db, import_file_id)
        import_file.status = "deleted"
        import_file.error_message = f"Deleted original filename: {original_filename}"
        import_file.original_filename = f"{original_filename}.deleted.{import_file_id}"
        db.commit()
    except Exception as exc:
        db.rollback()
        import_file = db.query(ImportFile).filter(ImportFile.id == import_file_id).first()
        if import_file:
            import_file.status = "error"
            import_file.error_message = str(exc)
            db.commit()
    finally:
        db.close()
