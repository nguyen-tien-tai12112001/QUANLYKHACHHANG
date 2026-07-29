"""Add deposit lifecycle and loan obligation fields.

Revision ID: 20260729_0011
Revises: 20260729_0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260729_0011"
down_revision: str | None = "20260729_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for column in (
        sa.Column("rate", sa.Numeric(18, 8)),
        sa.Column("account_status", sa.String(30)),
        sa.Column("close_date", sa.Date()),
        sa.Column("renewal_date", sa.Date()),
        sa.Column("auto_renewal", sa.String(20)),
        sa.Column("special_rate", sa.String(20)),
        sa.Column("accrual_amount", sa.Numeric(20, 2)),
    ):
        op.add_column("dp01_deposit_accounts", column)
    op.create_index("ix_dp01_deposit_accounts_account_status", "dp01_deposit_accounts", ["account_status"])

    for column in (
        sa.Column("disbursement_date", sa.Date()),
        sa.Column("disbursement_amount", sa.Numeric(20, 2)),
        sa.Column("disbursement_maturity_date", sa.Date()),
        sa.Column("repayment_amount", sa.Numeric(20, 2)),
        sa.Column("next_repayment_date", sa.Date()),
        sa.Column("next_repayment_amount", sa.Numeric(20, 2)),
        sa.Column("next_interest_repayment_date", sa.Date()),
        sa.Column("interest_amount", sa.Numeric(20, 2)),
        sa.Column("pastdue_interest_amount", sa.Numeric(20, 2)),
        sa.Column("total_interest_repayment_amount", sa.Numeric(20, 2)),
        sa.Column("last_repayment_date", sa.Date()),
        sa.Column("debt_group", sa.String(20)),
    ):
        op.add_column("ln01_loans", column)
    op.create_index("ix_ln01_loans_next_repayment_date", "ln01_loans", ["next_repayment_date"])
    op.create_index("ix_ln01_loans_next_interest_repayment_date", "ln01_loans", ["next_interest_repayment_date"])
    op.create_index("ix_ln01_loans_debt_group", "ln01_loans", ["debt_group"])


def downgrade() -> None:
    for name in ("debt_group", "next_interest_repayment_date", "next_repayment_date"):
        op.drop_index(f"ix_ln01_loans_{name}", table_name="ln01_loans")
    for name in (
        "debt_group", "last_repayment_date", "total_interest_repayment_amount",
        "pastdue_interest_amount", "interest_amount", "next_interest_repayment_date",
        "next_repayment_amount", "next_repayment_date", "repayment_amount",
        "disbursement_maturity_date", "disbursement_amount", "disbursement_date",
    ):
        op.drop_column("ln01_loans", name)
    op.drop_index("ix_dp01_deposit_accounts_account_status", table_name="dp01_deposit_accounts")
    for name in (
        "accrual_amount", "special_rate", "auto_renewal", "renewal_date",
        "close_date", "account_status", "rate",
    ):
        op.drop_column("dp01_deposit_accounts", name)
