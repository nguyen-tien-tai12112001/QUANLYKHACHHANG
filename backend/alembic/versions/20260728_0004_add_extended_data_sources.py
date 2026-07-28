"""Add BC06, BC29, KH02 and FTPLN warehouse sources.

Revision ID: 20260728_0004
Revises: 20260723_0003
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.database import Base


revision: str = "20260728_0004"
down_revision: str | None = "20260723_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {
        "period_start": sa.Column("period_start", sa.Date(), nullable=True),
        "period_end": sa.Column("period_end", sa.Date(), nullable=True),
        "business_date": sa.Column("business_date", sa.Date(), nullable=True),
        "filename_suffix": sa.Column("filename_suffix", sa.String(length=255), nullable=True),
        "frequency": sa.Column("frequency", sa.String(length=30), nullable=True),
        "content_sha256": sa.Column("content_sha256", sa.String(length=64), nullable=True),
    }
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("import_files")}
    for name, column in columns.items():
        if name not in existing:
            op.add_column("import_files", column)

    op.create_index("ix_import_files_business_date", "import_files", ["business_date"], unique=False, if_not_exists=True)
    op.create_index("ix_import_files_content_sha256", "import_files", ["content_sha256"], unique=False, if_not_exists=True)

    for table_name in (
        "bc06_customer_classifications",
        "bc29_customer_credit_risks",
        "kh02_customer_transactions",
        "ftpln_daily_loan_ftp",
    ):
        Base.metadata.tables[table_name].create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    for table_name in (
        "ftpln_daily_loan_ftp",
        "kh02_customer_transactions",
        "bc29_customer_credit_risks",
        "bc06_customer_classifications",
    ):
        op.drop_table(table_name, if_exists=True)
    op.drop_index("ix_import_files_content_sha256", table_name="import_files", if_exists=True)
    op.drop_index("ix_import_files_business_date", table_name="import_files", if_exists=True)
    for name in ("content_sha256", "frequency", "filename_suffix", "business_date", "period_end", "period_start"):
        op.drop_column("import_files", name)
