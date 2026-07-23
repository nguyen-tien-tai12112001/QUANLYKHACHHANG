"""Remove temporary test columns from organization branches.

Revision ID: 20260723_0003
Revises: 20260723_0002
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260723_0003"
down_revision: str | None = "20260723_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("org_branches", "test_note")
    op.drop_column("org_branches", "test_code")


def downgrade() -> None:
    op.add_column("org_branches", sa.Column("test_code", sa.String(length=50), nullable=True))
    op.add_column("org_branches", sa.Column("test_note", sa.String(length=255), nullable=True))
