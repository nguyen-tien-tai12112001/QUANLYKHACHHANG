"""Use CIF as customer master during period processing.

Revision ID: 20260805_0019
Revises: 20260804_0018
"""

from alembic import op
import sqlalchemy as sa

revision = "20260805_0019"
down_revision = "20260804_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("system_users", sa.Column("customer_cif_code", sa.String(32)))
    op.create_index("ix_system_users_customer_cif_code", "system_users", ["customer_cif_code"], unique=True)
    for name, column in (
        ("ten_chu_doanh_nghiep", sa.String(255)), ("so_cccd", sa.String(100)),
        ("ma_so_thue", sa.String(100)), ("ngay_thanh_lap", sa.Date()),
        ("dia_chi", sa.Text()), ("gioi_tinh", sa.String(20)),
        ("ngay_sinh", sa.Date()), ("nghe_nghiep", sa.String(255)),
        ("management_source", sa.String(30)), ("managing_branch_code", sa.String(10)),
        ("managing_department_code", sa.String(20)), ("managing_department_name", sa.String(255)),
    ):
        op.add_column("customer_period_profiles", sa.Column(name, column))
    for name in ("so_cccd", "ma_so_thue", "management_source", "managing_branch_code"):
        op.create_index(f"ix_customer_period_profiles_{name}", "customer_period_profiles", [name])
    op.create_table(
        "customer_source_reconciliations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("processing_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("branch_code", sa.String(10)), sa.Column("customer_core_code", sa.String(32)),
        sa.Column("customer_name", sa.String(255)), sa.Column("source_row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_amount", sa.Numeric(24, 2)), sa.Column("reason_code", sa.String(50), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"), sa.Column("details", sa.JSON()),
        sa.Column("reviewed_by", sa.String(100)), sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("processing_job_id", "source_type", "branch_code", "customer_core_code", "reason_code", name="uq_customer_source_reconciliation"),
    )
    for name in ("processing_job_id", "period_key", "source_type", "branch_code", "customer_core_code", "reason_code", "status", "created_at"):
        op.create_index(f"ix_customer_source_reconciliations_{name}", "customer_source_reconciliations", [name])


def downgrade() -> None:
    op.drop_table("customer_source_reconciliations")
    for name in ("managing_branch_code", "management_source", "ma_so_thue", "so_cccd"):
        op.drop_index(f"ix_customer_period_profiles_{name}", table_name="customer_period_profiles")
    for name in ("managing_department_name", "managing_department_code", "managing_branch_code", "management_source", "nghe_nghiep", "ngay_sinh", "gioi_tinh", "dia_chi", "ngay_thanh_lap", "ma_so_thue", "so_cccd", "ten_chu_doanh_nghiep"):
        op.drop_column("customer_period_profiles", name)
    op.drop_index("ix_system_users_customer_cif_code", table_name="system_users")
    op.drop_column("system_users", "customer_cif_code")
