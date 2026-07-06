import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import UploadFile
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
from app.imports.readers import read_file_rows
from app.imports.summarizer import summarize_period
from app.models import (
    CN05CustomerService,
    Customer,
    DP01DepositAccount,
    ImportBatch,
    ImportFile,
    LN01Loan,
    PF14AccountBalance,
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
BULK_CHUNK_SIZE = 5000


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
        db.bulk_insert_mappings(model, chunk)


def get_or_create_batch(db: Session, meta: ImportFileMeta) -> ImportBatch:
    batch = db.query(ImportBatch).filter(ImportBatch.period_key == meta.period_key).first()
    if batch:
        return batch

    batch = ImportBatch(period_key=meta.period_key, period_date=meta.period_date)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def save_upload_file(upload_file: UploadFile, meta: ImportFileMeta) -> tuple[Path, int, str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{meta.period_key}_{meta.branch_code}_{meta.file_type}_{upload_file.filename}"
    file_path = UPLOAD_DIR / stored_filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return file_path, file_path.stat().st_size, stored_filename


def _create_import_file(db: Session, upload_file: UploadFile, meta: ImportFileMeta, batch: ImportBatch, file_path: Path, file_size: int, stored_filename: str) -> ImportFile:
    import_file = ImportFile(
        import_batch_id=batch.id,
        original_filename=upload_file.filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_type=meta.file_type,
        branch_code=meta.branch_code,
        period_key=meta.period_key,
        period_date=meta.period_date,
        file_ext=meta.file_ext,
        file_size=file_size,
        status="processing",
    )
    db.add(import_file)
    db.commit()
    db.refresh(import_file)
    return import_file


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

    for values in chunked(list(customer_map.values())):
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


def import_uploaded_file(db: Session, upload_file: UploadFile, replace_existing: bool = False) -> ImportFile:
    meta = parse_import_filename(upload_file.filename)
    batch = get_or_create_batch(db, meta)
    file_path, file_size, stored_filename = save_upload_file(upload_file, meta)

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
            db.query(DP01DepositAccount).filter(DP01DepositAccount.import_file_id == existing.id).delete()
            db.query(CN05CustomerService).filter(CN05CustomerService.import_file_id == existing.id).delete()
            db.query(LN01Loan).filter(LN01Loan.import_file_id == existing.id).delete()
            db.query(PF14AccountBalance).filter(PF14AccountBalance.import_file_id == existing.id).delete()
            existing.status = "replaced"
            existing.original_filename = f"{existing.original_filename}.replaced.{existing.id}"
            db.flush()

    try:
        import_file = _create_import_file(db, upload_file, meta, batch, file_path, file_size, stored_filename)
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("File này đã được import. Nếu muốn import lại, hãy bật replace_existing.") from exc

    try:
        rows = read_file_rows(file_path)
        validate_required_columns(rows, meta.file_type)
        success_rows = IMPORT_HANDLERS[meta.file_type](db, rows, import_file)
        import_file.total_rows = len(rows)
        import_file.success_rows = success_rows
        import_file.error_rows = len(rows) - success_rows
        import_file.status = "success"
        db.commit()
        summarize_period(db, meta.period_key)
        db.refresh(import_file)
        return import_file
    except Exception as exc:
        db.rollback()
        import_file.status = "error"
        import_file.error_message = str(exc)
        db.add(import_file)
        db.commit()
        raise
