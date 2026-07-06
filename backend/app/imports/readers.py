import csv
from io import StringIO
from pathlib import Path

import openpyxl
import polars as pl


def normalize_header(header) -> str:
    return str(header or "").lstrip("\ufeff").strip().upper()


def detect_delimiter(sample: str) -> str:
    if not sample:
        return ","
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def decode_csv_bytes(raw: bytes) -> tuple[str, str]:
    encodings = ("utf-8-sig", "utf-8", "cp1258", "latin-1")
    last_error = None
    for encoding in encodings:
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ValueError(f"Không đọc được encoding CSV: {last_error}")


def read_csv_rows(file_path: str | Path) -> list[dict]:
    path = Path(file_path)
    raw = path.read_bytes()
    text, _encoding = decode_csv_bytes(raw)
    delimiter = detect_delimiter(text[:8192])

    # Infer_schema_length=0 keeps every column as text. This protects customer
    # codes, account numbers, ID numbers, leading zeroes, and Excel-style ticks.
    df = pl.read_csv(
        StringIO(text),
        separator=delimiter,
        infer_schema_length=0,
        null_values=[""],
        ignore_errors=False,
        truncate_ragged_lines=False,
    )

    df = df.rename({column: normalize_header(column) for column in df.columns})
    df = df.drop([column for column in df.columns if not column])
    return df.to_dicts()


def read_excel_rows(file_path: str | Path) -> list[dict]:
    workbook = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    worksheet = workbook.worksheets[0]
    rows = worksheet.iter_rows(values_only=True)
    headers = [normalize_header(value) for value in next(rows)]

    data = []
    for row in rows:
        item = {}
        has_value = False
        for index, header in enumerate(headers):
            if not header:
                continue
            value = row[index] if index < len(row) else None
            if value is not None and str(value).strip() != "":
                has_value = True
            item[header] = value
        if has_value:
            data.append(item)

    workbook.close()
    return data


def read_file_rows(file_path: str | Path) -> list[dict]:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".csv":
        return read_csv_rows(file_path)
    if suffix == ".xlsx":
        return read_excel_rows(file_path)
    raise ValueError("Định dạng file chưa hỗ trợ")
