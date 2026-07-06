from datetime import date, datetime
from decimal import Decimal, InvalidOperation


def clean_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.startswith("'"):
        text = text[1:]
    text = text.strip()
    return text or None


def clean_customer_code(value) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    return text.replace(" ", "")


def build_ma_kh_chuan(branch_code, customer_code) -> str | None:
    branch = clean_text(branch_code)
    customer = clean_customer_code(customer_code)
    if not branch or not customer:
        return None
    return f"{branch}{customer}"


def parse_yyyymmdd(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = clean_text(value)
    if not text or text == "00000000":
        return None
    text = text.replace("-", "").replace("/", "")
    if len(text) != 8:
        return None
    try:
        return datetime.strptime(text, "%Y%m%d").date()
    except ValueError:
        return None


def parse_decimal(value) -> Decimal | None:
    text = clean_text(value)
    if text is None:
        return None
    text = text.replace(",", "")
    if text == "":
        return None
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def parse_int(value) -> int | None:
    number = parse_decimal(value)
    if number is None:
        return None
    return int(number)


def parse_service_flag(value) -> int:
    number = parse_decimal(value)
    if number is None:
        return 0
    return 1 if number > 0 else 0


def decimal_or_zero(value) -> Decimal:
    return parse_decimal(value) or Decimal("0")

