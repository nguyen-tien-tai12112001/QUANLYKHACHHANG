"""Add raw CIF source records.

Revision ID: 20260804_0014
Revises: 20260730_0013
"""

from alembic import op
import sqlalchemy as sa


revision = "20260804_0014"
down_revision = "20260730_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cif_customer_identifiers", sa.Column("birth_date", sa.Date()))
    op.add_column("cif_customer_identifiers", sa.Column("gender_code", sa.String(length=20)))
    op.add_column("cif_customer_identifiers", sa.Column("establishment_date", sa.Date()))
    op.add_column("cif_customer_identifiers", sa.Column("occupation", sa.String(length=255)))
    op.create_table(
        "cif_source_records",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("cif_import_batches.id"), nullable=False),
        sa.Column("source_sheet", sa.String(length=255)),
        sa.Column("source_row_number", sa.Integer(), nullable=False),
        sa.Column("full_cif_code", sa.String(length=32)),
        sa.Column("branch_code", sa.String(length=10)),
        sa.Column("customer_core_code", sa.String(length=32)),
        sa.Column("row_hash", sa.String(length=64), nullable=False),
        sa.Column("validation_status", sa.String(length=30), nullable=False),
        sa.Column("duplicate_of_row_number", sa.Integer()),
        sa.Column("raw_data", sa.JSON(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("import_batch_id", "source_sheet", "source_row_number", name="uq_cif_source_row"),
    )
    for column in ("import_batch_id", "full_cif_code", "branch_code", "customer_core_code", "row_hash", "validation_status"):
        op.create_index(f"ix_cif_source_records_{column}", "cif_source_records", [column])


def downgrade() -> None:
    op.drop_table("cif_source_records")
    op.drop_column("cif_customer_identifiers", "occupation")
    op.drop_column("cif_customer_identifiers", "establishment_date")
    op.drop_column("cif_customer_identifiers", "gender_code")
    op.drop_column("cif_customer_identifiers", "birth_date")
