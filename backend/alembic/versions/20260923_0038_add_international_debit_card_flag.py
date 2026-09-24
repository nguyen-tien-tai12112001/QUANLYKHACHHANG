"""Add international debit card flag to processed customer data.

Revision ID: 20260923_0038
Revises: 20260914_0037
"""

import sqlalchemy as sa
from alembic import op


revision = "20260923_0038"
down_revision = "20260914_0037"
branch_labels = None
depends_on = None


def upgrade():
    for table_name in (
        "customer_period_summaries",
        "customer_period_profiles",
        "customer_period_branch_details",
    ):
        op.add_column(
            table_name,
            sa.Column("the_ghi_no_quoc_te", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    for table_name in (
        "customer_period_branch_details",
        "customer_period_profiles",
        "customer_period_summaries",
    ):
        op.drop_column(table_name, "the_ghi_no_quoc_te")
