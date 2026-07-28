"""Add CIF customer master warehouse.

Revision ID: 20260728_0005
Revises: 20260728_0004
Create Date: 2026-07-28
"""

from collections.abc import Sequence

from alembic import op

from app import models  # noqa: F401
from app.database import Base


revision: str = "20260728_0005"
down_revision: str | None = "20260728_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = (
    "cif_import_batches",
    "cif_customers",
    "cif_customer_identifiers",
    "cif_import_errors",
    "cif_identity_conflicts",
)


def upgrade() -> None:
    for table_name in TABLES:
        Base.metadata.tables[table_name].create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    for table_name in reversed(TABLES):
        op.drop_table(table_name, if_exists=True)
