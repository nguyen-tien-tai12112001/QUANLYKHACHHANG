"""Store the quality report produced by customer processing jobs.

Revision ID: 20260827_0029
Revises: 20260827_0028
"""

import sqlalchemy as sa
from alembic import op


revision = "20260827_0029"
down_revision = "20260827_0028"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customer_processing_jobs", sa.Column("quality_report", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("customer_processing_jobs", "quality_report")
