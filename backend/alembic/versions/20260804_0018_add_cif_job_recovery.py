"""Add CIF job heartbeat and recovery attempt tracking.

Revision ID: 20260804_0018
Revises: 20260804_0017
"""

from alembic import op
import sqlalchemy as sa

revision = "20260804_0018"
down_revision = "20260804_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cif_import_batches", sa.Column("heartbeat_at", sa.DateTime(timezone=True)))
    op.add_column("cif_import_batches", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_cif_import_batches_heartbeat_at", "cif_import_batches", ["heartbeat_at"])
    op.execute("UPDATE cif_import_batches SET heartbeat_at = COALESCE(finished_at, started_at, uploaded_at), attempt_count = CASE WHEN started_at IS NULL THEN 0 ELSE 1 END")


def downgrade() -> None:
    op.drop_index("ix_cif_import_batches_heartbeat_at", table_name="cif_import_batches")
    op.drop_column("cif_import_batches", "attempt_count")
    op.drop_column("cif_import_batches", "heartbeat_at")
