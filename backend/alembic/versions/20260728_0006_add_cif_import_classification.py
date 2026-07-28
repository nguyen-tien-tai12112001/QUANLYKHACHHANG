"""Add CIF import classification counters.

Revision ID: 20260728_0006
Revises: 20260728_0005
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260728_0006"
down_revision: str | None = "20260728_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for column_name in (
        "unchanged_identifiers",
        "duplicate_rows",
        "multi_branch_identifiers",
        "review_rows",
    ):
        op.add_column(
            "cif_import_batches",
            sa.Column(column_name, sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    for column_name in reversed(
        (
            "unchanged_identifiers",
            "duplicate_rows",
            "multi_branch_identifiers",
            "review_rows",
        )
    ):
        op.drop_column("cif_import_batches", column_name)
