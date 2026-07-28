import calendar
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.imports.cleaners import parse_yyyymmdd


STANDARD_PATTERN = re.compile(
    r"^(?P<branch_code>\d+)_(?P<file_type>CN05|DP01|LN01|PF14|BC29)_(?P<period_key>\d{8})\.(?P<ext>csv|xlsx)$",
    re.IGNORECASE,
)
BC06_PATTERN = re.compile(
    r"^(?P<branch_code>\d+)_(?P<file_type>BC06)_(?P<period_key>\d{8})(?P<suffix>_.+)?\.(?P<ext>csv|xlsx)$",
    re.IGNORECASE,
)
KH02_PATTERN = re.compile(
    r"^(?P<branch_code>\d+)_(?P<file_type>KH02)_(?P<period_start>\d{8})(?P<period_end>\d{8})\.(?P<ext>csv|xlsx)$",
    re.IGNORECASE,
)
FTPLN_PATTERN = re.compile(
    r"^(?P<branch_code>\d+)_(?P<file_type>FTPLN)_(?P<business_date>\d{8})\.(?P<ext>csv|xlsx)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ImportFileMeta:
    branch_code: str
    file_type: str
    period_key: str
    file_ext: str
    period_start: date | None = None
    period_end: date | None = None
    business_date: date | None = None
    filename_suffix: str | None = None
    frequency: str = "PERIOD"

    @property
    def period_date(self):
        return parse_yyyymmdd(self.period_key)


def month_end(value: date) -> date:
    return date(value.year, value.month, calendar.monthrange(value.year, value.month)[1])


def parse_import_filename(filename: str) -> ImportFileMeta:
    name = Path(filename).name

    match = KH02_PATTERN.match(name)
    if match:
        values = match.groupdict()
        period_start = parse_yyyymmdd(values["period_start"])
        period_end = parse_yyyymmdd(values["period_end"])
        if not period_start or not period_end or period_start > period_end:
            raise ValueError("Khoảng ngày KH02 trong tên file không hợp lệ")
        if period_start.year != period_end.year or period_start.month != period_end.month:
            raise ValueError("File KH02 phải có ngày bắt đầu và kết thúc trong cùng một tháng")
        if period_start.day != 1 or period_end != month_end(period_start):
            raise ValueError("File KH02 phải bao phủ từ ngày đầu đến ngày cuối cùng của tháng")
        return ImportFileMeta(
            branch_code=values["branch_code"],
            file_type="KH02",
            period_key=period_end.strftime("%Y%m%d"),
            file_ext=values["ext"].lower(),
            period_start=period_start,
            period_end=period_end,
            frequency="MONTH_RANGE",
        )

    match = FTPLN_PATTERN.match(name)
    if match:
        values = match.groupdict()
        business_date = parse_yyyymmdd(values["business_date"])
        if not business_date:
            raise ValueError("Ngày nghiệp vụ FTPLN trong tên file không hợp lệ")
        period_end = month_end(business_date)
        return ImportFileMeta(
            branch_code=values["branch_code"],
            file_type="FTPLN",
            period_key=period_end.strftime("%Y%m%d"),
            file_ext=values["ext"].lower(),
            period_start=business_date.replace(day=1),
            period_end=period_end,
            business_date=business_date,
            frequency="DAILY",
        )

    match = BC06_PATTERN.match(name)
    if match:
        values = match.groupdict()
        if not parse_yyyymmdd(values["period_key"]):
            raise ValueError("Ngày kỳ BC06 trong tên file không hợp lệ")
        return ImportFileMeta(
            branch_code=values["branch_code"],
            file_type="BC06",
            period_key=values["period_key"],
            file_ext=values["ext"].lower(),
            filename_suffix=values.get("suffix"),
            frequency="PERIOD_PART",
        )

    match = STANDARD_PATTERN.match(name)
    if match:
        values = match.groupdict()
        if not parse_yyyymmdd(values["period_key"]):
            raise ValueError("Ngày kỳ dữ liệu trong tên file không hợp lệ")
        return ImportFileMeta(
            branch_code=values["branch_code"],
            file_type=values["file_type"].upper(),
            period_key=values["period_key"],
            file_ext=values["ext"].lower(),
        )

    raise ValueError(
        "Tên file không đúng quy tắc DP01/LN01/CN05/PF14/BC06/BC29/KH02/FTPLN đã cấu hình"
    )
