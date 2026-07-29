"""Add PF10 loan profitability warehouse source.

Revision ID: 20260729_0007
Revises: 20260728_0006
Create Date: 2026-07-29
"""

from collections.abc import Sequence

from alembic import op

from app import models  # noqa: F401
from app.database import Base


revision: str = "20260729_0007"
down_revision: str | None = "20260728_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.tables["pf10_loan_profitability"].create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    op.drop_table("pf10_loan_profitability", if_exists=True)
