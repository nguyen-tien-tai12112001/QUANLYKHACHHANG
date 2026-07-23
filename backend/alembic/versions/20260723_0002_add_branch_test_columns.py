"""Add test columns to organization branches.

Revision ID: 20260723_0002
Revises: 20260722_0001
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260723_0002"
down_revision: str | None = "20260722_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("org_branches", sa.Column("test_code", sa.String(length=50), nullable=True))
    op.add_column("org_branches", sa.Column("test_note", sa.String(length=255), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE org_branches
            SET test_code = 'TEST-' || branch_code,
                test_note = 'Dữ liệu kiểm thử migration C360'
            """
        )
    )


def downgrade() -> None:
    op.drop_column("org_branches", "test_note")
    op.drop_column("org_branches", "test_code")
