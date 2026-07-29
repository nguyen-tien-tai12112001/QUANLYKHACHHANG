"""Add PF10 metrics to processed customer profiles.

Revision ID: 20260729_0008
Revises: 20260729_0007
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260729_0008"
down_revision: str | None = "20260729_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


METRIC_COLUMNS = (
    "du_no_ngan_han",
    "du_no_ngan_han_bq",
    "du_no_trung_dai_han",
    "du_no_trung_dai_han_bq",
    "du_no_thau_chi",
    "du_no_thau_chi_bq",
    "pf10_interest",
    "pf10_accruals",
    "pf10_book_correction_interest",
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name in ("customer_period_profiles", "customer_period_branch_details"):
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name in METRIC_COLUMNS:
            if column_name not in existing:
                op.add_column(
                    table_name,
                    sa.Column(column_name, sa.Numeric(24, 6), nullable=False, server_default="0"),
                )
        if "pf10_lds_count" not in existing:
            op.add_column(
                table_name,
                sa.Column("pf10_lds_count", sa.Integer(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    for table_name in ("customer_period_branch_details", "customer_period_profiles"):
        op.drop_column(table_name, "pf10_lds_count")
        for column_name in reversed(METRIC_COLUMNS):
            op.drop_column(table_name, column_name)
