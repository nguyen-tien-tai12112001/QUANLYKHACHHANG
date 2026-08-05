"""Add KH02 fee and credit provision metrics to customer profiles.

Revision ID: 20260730_0013
Revises: 20260729_0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260730_0013"
down_revision: str | None = "20260729_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


METRIC_COLUMNS = (
    "phi_bao_lanh",
    "phi_chuyen_tien",
    "phi_nhdt",
    "abic_batd",
    "dprr_chung_tt",
    "dprr_chung_lk",
    "dprr_cuthe_tt",
    "dprr_cuthe_lk",
)


def upgrade() -> None:
    for table_name in ("customer_period_branch_details", "customer_period_profiles"):
        for column_name in METRIC_COLUMNS:
            op.add_column(table_name, sa.Column(column_name, sa.Numeric(24, 2)))


def downgrade() -> None:
    for table_name in ("customer_period_profiles", "customer_period_branch_details"):
        for column_name in reversed(METRIC_COLUMNS):
            op.drop_column(table_name, column_name)
