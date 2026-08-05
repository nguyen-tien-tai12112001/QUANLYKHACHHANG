"""Backfill governance state for CIF data imported before review workflow.

Revision ID: 20260804_0016
Revises: 20260804_0015
"""

from alembic import op


revision = "20260804_0016"
down_revision = "20260804_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE cif_source_records
        SET comparison_status = CASE
                WHEN validation_status = 'duplicate_skipped' THEN 'duplicate'
                WHEN validation_status IN ('accepted', 'warning') THEN 'new'
                ELSE 'rejected'
            END,
            review_status = CASE
                WHEN validation_status IN ('accepted', 'warning') THEN 'applied'
                ELSE 'not_required'
            END
        WHERE comparison_status IS NULL
        """
    )
    op.execute(
        """
        UPDATE cif_import_batches
        SET importer_version = COALESCE(importer_version, '1.0-legacy'),
            uploaded_by = COALESCE(uploaded_by, 'legacy'),
            comparison_summary = COALESCE(
                comparison_summary,
                json_build_object(
                    'new', COALESCE(new_identifiers, 0),
                    'no_change', COALESCE(unchanged_identifiers, 0),
                    'pending_changes', 0,
                    'missing_from_latest', 0
                )
            )
        """
    )


def downgrade() -> None:
    # Governance state is an audit-safe enrichment and is intentionally retained.
    pass
