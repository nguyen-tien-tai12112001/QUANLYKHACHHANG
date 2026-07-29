"""Add read-performance indexes for C360 screens.

Revision ID: 20260729_0012
Revises: 20260729_0011
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260729_0012"
down_revision: str | None = "20260729_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_period_deposit_sort "
        "ON customer_period_profiles "
        "(period_key, (COALESCE(so_du_tien_gui, 0)) DESC, ma_kh)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_period_loan_sort "
        "ON customer_period_profiles "
        "(period_key, (COALESCE(so_du_tien_vay, 0)) DESC, ma_kh)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_period_casa_sort "
        "ON customer_period_profiles "
        "(period_key, (COALESCE(so_du_tgtt_binh_quan, 0)) DESC, ma_kh)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_branch_codes_trgm "
        "ON customer_period_profiles USING gin (branch_codes gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_pgd_codes_trgm "
        "ON customer_period_profiles USING gin (pgd_codes gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_name_trgm "
        "ON customer_period_profiles USING gin (ten_kh gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_profiles_officer_name_trgm "
        "ON customer_period_profiles USING gin (ten_can_bo gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customer_branch_period_scope_customer "
        "ON customer_period_branch_details "
        "(period_key, branch_code, ma_pgd, ma_kh)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pf14_period_account_identity "
        "ON pf14_account_balances (period_key, trbrcd, custseq, accountno)"
    )


def downgrade() -> None:
    for index_name in (
        "ix_pf14_period_account_identity",
        "ix_customer_branch_period_scope_customer",
        "ix_customer_profiles_officer_name_trgm",
        "ix_customer_profiles_name_trgm",
        "ix_customer_profiles_pgd_codes_trgm",
        "ix_customer_profiles_branch_codes_trgm",
        "ix_customer_profiles_period_casa_sort",
        "ix_customer_profiles_period_loan_sort",
        "ix_customer_profiles_period_deposit_sort",
    ):
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
