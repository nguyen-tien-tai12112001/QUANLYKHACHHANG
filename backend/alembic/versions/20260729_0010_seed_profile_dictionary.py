"""Seed the 88-field profile dictionary and link profiles to CIF.

Revision ID: 20260729_0010
Revises: 20260729_0009
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260729_0010"
down_revision: str | None = "20260729_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


GROUPS = {
    "CUSTOMER_INFO": [
        "MCN", "MPGD", "MKH", "TENKH", "TEN_CHUDN", "CCCD", "MST", "NGAY_THANHLAP",
        "DIACHI", "LOAIKH", "PHAN_LOAIKH", "GIOITINH", "NAM_SINH", "NGHE NGHIEP",
        "DIEN_THOAI", "MACB", "TENCB",
    ],
    "DEPOSIT": [
        "NGAY_UPDATE", "TKTT1", "TKTT2", "TKTT3", "SODU_TKTT", "SODU_TKTTBQ",
        "DS_TKTT", "SODU_TGCKH", "SODU_TGCKHBQ", "FTP_NGUONVON", "TKSODEP",
        "CN_TRALUONG", "PN_TRALUONG", "LOATHANTAI", "HKD_TK", "HKD_ETAX",
    ],
    "LOAN": [
        "DUNO_NHTT", "DUNO_NHTTBQ", "DUNO_TDHTT", "DUNO_TDHTTBQ", "DUNO_TC",
        "DUNO_TCBQ", "DUNO_XAU", "DUNO_XAUBQ", "DUNO_XLRR", "DUNO_XLRRBQ",
        "DPRR_TT", "DPRR_CHUNG_TT", "DPRR_CUTHE_TT", "DPRR_LK", "DPRR_CHUNG_LK",
        "DPRR_CUTHE_LK", "FTP_DUNO",
    ],
    "INTERNATIONAL_BUSINESS": ["DS_TTQT", "DS_LC", "KIEUHOI", "TTQT"],
    "FEE": [
        "PHI_BAOLANH", "PHI_CHUYENTIEN", "PHI_KDNT", "PHI_TTQT", "PHI_LC",
        "PHI_NHDT", "PHI_THE", "PHI_POS", "PHI_KHAC",
    ],
    "DIGITAL_BANKING": ["AGRIBANKPLUS", "OTT", "EBANKING", "SMS_TKTV", "SMS_TKTG"],
    "CARD": ["DS_TTPOS", "THE_GNND", "THE_LOCVIET", "THE_GNQT", "THE_TDQT", "POS"],
    "BILL_PAYMENT": ["THUHO_DIEN", "THUHO_NUOC", "THUHO_DT", "THUHO_HOCPHI", "THUHO_VIENPHI"],
    "ABIC": [
        "ABIC_BATD", "ABIC_BATK", "ABIC_BATHE", "ABIC_BHTS", "ABIC_BHPC",
        "ABIC_BHXM", "ABIC_BHOTO", "ABIC_BHNHAO", "ABIC_BHYT",
    ],
}

DATE_FIELDS = {"NGAY_THANHLAP", "NAM_SINH", "NGAY_UPDATE"}
LOGICAL_FIELDS = {
    "TKSODEP", "AGRIBANKPLUS", "OTT", "EBANKING", "SMS_TKTV", "SMS_TKTG",
    "THE_GNND", "THE_LOCVIET", "THE_GNQT", "THE_TDQT", "THUHO_DIEN",
    "THUHO_NUOC", "THUHO_DT", "THUHO_HOCPHI", "THUHO_VIENPHI", "KIEUHOI",
    "CN_TRALUONG", "PN_TRALUONG", "POS", "TTQT", "LOATHANTAI", "HKD_TK",
    "HKD_ETAX", "ABIC_BATD", "ABIC_BATK", "ABIC_BATHE", "ABIC_BHTS",
    "ABIC_BHPC", "ABIC_BHXM", "ABIC_BHOTO", "ABIC_BHNHAO", "ABIC_BHYT",
}
NUMBER_FIELDS = {
    code
    for group in ("LOAN", "FEE")
    for code in GROUPS[group]
} | {
    "LOAIKH", "SODU_TKTT", "SODU_TKTTBQ", "DS_TKTT", "SODU_TGCKH",
    "SODU_TGCKHBQ", "FTP_NGUONVON", "DS_TTQT", "DS_LC", "DS_TTPOS",
}

STATUS = {
    1: {
        "MCN", "MPGD", "MKH", "TENKH", "CCCD", "MST", "NGAY_THANHLAP", "DIACHI",
        "LOAIKH", "GIOITINH", "NAM_SINH", "NGHE NGHIEP", "SODU_TKTT", "SODU_TKTTBQ",
        "DS_TKTT", "SODU_TGCKH", "SODU_TGCKHBQ", "DUNO_NHTT", "DUNO_NHTTBQ",
        "DUNO_TDHTT", "DUNO_TDHTTBQ", "DUNO_TC", "DUNO_TCBQ", "DUNO_XAU",
        "DUNO_XAUBQ", "DUNO_XLRR", "FTP_DUNO", "PHI_BAOLANH", "PHI_CHUYENTIEN",
        "TKSODEP", "AGRIBANKPLUS", "OTT", "EBANKING", "SMS_TKTV", "SMS_TKTG",
        "THE_GNND", "THE_LOCVIET", "THE_GNQT", "THE_TDQT", "THUHO_DIEN",
        "THUHO_NUOC", "THUHO_DT", "THUHO_HOCPHI", "THUHO_VIENPHI", "PN_TRALUONG",
        "POS", "LOATHANTAI", "HKD_TK", "ABIC_BATD", "ABIC_BATK", "ABIC_BATHE",
    },
    2: {"TEN_CHUDN", "PHAN_LOAIKH", "DIEN_THOAI", "PHI_NHDT", "CN_TRALUONG"},
    3: {
        "MACB", "TENCB", "TKTT1", "TKTT2", "TKTT3", "DUNO_XLRRBQ", "DPRR_TT",
        "DPRR_CHUNG_TT", "DPRR_CUTHE_TT", "DPRR_LK", "DPRR_CHUNG_LK",
        "DPRR_CUTHE_LK", "PHI_KHAC",
    },
    4: {
        "NGAY_UPDATE", "DS_TTQT", "DS_LC", "DS_TTPOS", "FTP_NGUONVON",
        "PHI_KDNT", "PHI_TTQT", "PHI_LC", "PHI_THE", "PHI_POS", "KIEUHOI",
        "TTQT", "HKD_ETAX",
    },
    5: {"ABIC_BHTS", "ABIC_BHPC", "ABIC_BHXM", "ABIC_BHOTO", "ABIC_BHNHAO", "ABIC_BHYT"},
}


def _status(code: str) -> int:
    return next(status for status, codes in STATUS.items() if code in codes)


def _data_type(code: str) -> str:
    if code in DATE_FIELDS:
        return "DATE"
    if code in LOGICAL_FIELDS:
        return "BOOLEAN"
    if code in NUMBER_FIELDS:
        return "NUMERIC"
    return "STRING"


def upgrade() -> None:
    for table_name in ("customer_period_profiles", "customer_period_branch_details"):
        op.add_column(table_name, sa.Column("customer_id", sa.BigInteger()))
        op.create_foreign_key(
            f"fk_{table_name}_customer_id",
            table_name,
            "cif_customers",
            ["customer_id"],
            ["id"],
        )
        op.create_index(f"ix_{table_name}_customer_id", table_name, ["customer_id"])

    metric_table = sa.table(
        "profile_metric_definitions",
        sa.column("metric_code", sa.String),
        sa.column("metric_name", sa.String),
        sa.column("group_code", sa.String),
        sa.column("data_type", sa.String),
        sa.column("unit", sa.String),
        sa.column("aggregation_type", sa.String),
        sa.column("default_visible", sa.Boolean),
        sa.column("display_order", sa.Integer),
        sa.column("status_code", sa.Integer),
        sa.column("description", sa.Text),
        sa.column("is_active", sa.Boolean),
    )
    rows = []
    display_order = 0
    for group_code, codes in GROUPS.items():
        for code in codes:
            display_order += 1
            data_type = _data_type(code)
            rows.append(
                {
                    "metric_code": code,
                    "metric_name": code,
                    "group_code": group_code,
                    "data_type": data_type,
                    "unit": "VND" if data_type == "NUMERIC" and code != "LOAIKH" else None,
                    "aggregation_type": "SUM" if data_type == "NUMERIC" and code != "LOAIKH" else (
                        "MAX" if data_type == "BOOLEAN" else "NONE"
                    ),
                    "default_visible": True,
                    "display_order": display_order,
                    "status_code": _status(code),
                    "description": "Đăng ký từ Profile khach hang 23072026.xlsx",
                    "is_active": True,
                }
            )
    op.bulk_insert(metric_table, rows)

    product_table = sa.table(
        "product_definitions",
        sa.column("product_code", sa.String),
        sa.column("product_name", sa.String),
        sa.column("product_group", sa.String),
        sa.column("display_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    product_rows = []
    order = 0
    for group_code, codes in GROUPS.items():
        for code in codes:
            if code not in LOGICAL_FIELDS:
                continue
            order += 1
            product_rows.append(
                {
                    "product_code": code,
                    "product_name": code,
                    "product_group": group_code,
                    "display_order": order,
                    "is_active": True,
                }
            )
    op.bulk_insert(product_table, product_rows)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM product_definitions WHERE product_code = ANY(:codes)").bindparams(
        codes=sorted(LOGICAL_FIELDS)
    ))
    all_codes = [code for codes in GROUPS.values() for code in codes]
    op.execute(sa.text("DELETE FROM profile_metric_definitions WHERE metric_code = ANY(:codes)").bindparams(
        codes=all_codes
    ))
    for table_name in ("customer_period_branch_details", "customer_period_profiles"):
        op.drop_index(f"ix_{table_name}_customer_id", table_name=table_name)
        op.drop_constraint(f"fk_{table_name}_customer_id", table_name, type_="foreignkey")
        op.drop_column(table_name, "customer_id")
