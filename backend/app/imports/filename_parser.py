import re
from dataclasses import dataclass
from pathlib import Path

from app.imports.cleaners import parse_yyyymmdd


FILE_PATTERN = re.compile(
    r"^(?P<branch_code>\d+)_(?P<file_type>CN05|DP01|LN01|PF14)_(?P<period_key>\d{8})\.(?P<ext>csv|xlsx)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ImportFileMeta:
    branch_code: str
    file_type: str
    period_key: str
    file_ext: str

    @property
    def period_date(self):
        return parse_yyyymmdd(self.period_key)


def parse_import_filename(filename: str) -> ImportFileMeta:
    name = Path(filename).name
    match = FILE_PATTERN.match(name)
    if not match:
        raise ValueError("Tên file không đúng định dạng MACN_LOAIFILE_yyyymmdd.csv/xlsx")

    data = match.groupdict()
    meta = ImportFileMeta(
        branch_code=data["branch_code"],
        file_type=data["file_type"].upper(),
        period_key=data["period_key"],
        file_ext=data["ext"].lower(),
    )
    if meta.period_date is None:
        raise ValueError("Ngày kỳ dữ liệu trong tên file không hợp lệ")
    return meta
