"""Canonical KH02 fee classification rules.

Every KH02 account prefix belongs to at most one primary fee category.  Keeping
the rules in one module prevents customer processing, dashboards and source
lineage from silently using different account-code lists.
"""

from collections import OrderedDict


FEE_CATEGORY_PREFIXES = OrderedDict([
    ("phi_bao_lanh", ("7040",)),
    ("phi_chuyen_tien", ("711001", "711002")),
    ("phi_nhdt", ("711036", "711037", "711039")),
    ("abic_batd", ("714",)),
    ("phi_kdnt", ("721001",)),
    ("phi_lc", ("709002",)),
    # 711002 belongs to transfer fees, therefore TTQT starts at 711003.
    ("phi_ttqt", tuple(f"711{suffix:03d}" for suffix in range(3, 15)) + ("711096",)),
    ("phi_the", (
        "711015", "711016", "711022", "711023", "711024", "711025",
        "711026", "711027", "711028", "711051", "711052", "711059",
    )),
    # Codes already classified as NHDT/TTQT are intentionally excluded.
    ("phi_khac", ("711031", "711035", "711042", "711044", "711098")),
])

FEE_CATEGORY_LABELS = {
    "phi_bao_lanh": "Phí bảo lãnh",
    "phi_chuyen_tien": "Phí chuyển tiền",
    "phi_nhdt": "Phí ngân hàng điện tử",
    "abic_batd": "Phí ABIC/BATĐ",
    "phi_kdnt": "Phí kinh doanh ngoại tệ",
    "phi_lc": "Phí LC",
    "phi_ttqt": "Phí thanh toán quốc tế",
    "phi_the": "Phí thẻ",
    "phi_khac": "Phí khác",
}

# Broad revenue-account families that form the reconciliation population.  A
# row in these families that does not match a primary category is reported as
# unclassified instead of being hidden.
FEE_CANDIDATE_PREFIXES = ("7040", "709", "711", "714", "721")
FEE_FIELDS = tuple(FEE_CATEGORY_PREFIXES)


def _validate_no_cross_category_overlap() -> None:
    entries = [
        (category, prefix)
        for category, prefixes in FEE_CATEGORY_PREFIXES.items()
        for prefix in prefixes
    ]
    for index, (left_category, left_prefix) in enumerate(entries):
        for right_category, right_prefix in entries[index + 1:]:
            if left_category != right_category and (
                left_prefix.startswith(right_prefix) or right_prefix.startswith(left_prefix)
            ):
                raise RuntimeError(
                    f"KH02 fee prefix {left_prefix}/{right_prefix} overlaps "
                    f"between {left_category} and {right_category}"
                )


_validate_no_cross_category_overlap()


def normalize_account_code(value: object) -> str:
    return str(value or "").strip()


def classify_fee_account(value: object) -> str | None:
    code = normalize_account_code(value)
    for category, prefixes in FEE_CATEGORY_PREFIXES.items():
        if any(code.startswith(prefix) for prefix in prefixes):
            return category
    return None


def fee_sql_condition(column_sql: str, prefixes: tuple[str, ...]) -> str:
    return " OR ".join(f"{column_sql} LIKE '{prefix}%'" for prefix in prefixes)


def fee_aggregate_select_sql(
    account_column: str = "trim(account_code)",
    amount_sql: str = "coalesce(credit_amount,0)-coalesce(debit_amount,0)",
) -> str:
    return ",\n".join(
        f"sum(CASE WHEN {fee_sql_condition(account_column, prefixes)} "
        f"THEN {amount_sql} ELSE 0 END) {field}"
        for field, prefixes in FEE_CATEGORY_PREFIXES.items()
    )
