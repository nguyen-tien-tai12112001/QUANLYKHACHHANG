"""Baseline schema for the existing QUANLYKHACHHANG database.

Revision ID: 20260722_0001
Revises:
Create Date: 2026-07-22

This revision is intentionally idempotent. On an empty database it creates all
tables declared by SQLAlchemy metadata. On an existing database create_all()
leaves current tables and data untouched, then Alembic records the baseline.
"""

from alembic import op

from app import models  # noqa: F401
from app.database import Base


revision = "20260722_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    # A baseline must never drop a pre-existing production schema automatically.
    pass
