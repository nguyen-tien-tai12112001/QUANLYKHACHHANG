"""Add detailed CIF import stage history.

Revision ID: 20260804_0017
Revises: 20260804_0016
"""

from alembic import op
import sqlalchemy as sa

revision = "20260804_0017"
down_revision = "20260804_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cif_import_batches", sa.Column("stage_history", sa.JSON()))
    op.execute("""
        UPDATE cif_import_batches
        SET stage_history = json_build_array(json_build_object(
            'key', CASE WHEN status = 'success' THEN 'completed' WHEN status = 'error' THEN 'failed' ELSE status END,
            'label', COALESCE(stage, status), 'status', status,
            'progress', progress_percent, 'at', COALESCE(finished_at, started_at, uploaded_at)
        ))
        WHERE stage_history IS NULL
    """)


def downgrade() -> None:
    op.drop_column("cif_import_batches", "stage_history")
