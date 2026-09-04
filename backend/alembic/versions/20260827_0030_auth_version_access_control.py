"""Add user authorization version for immediate session revocation.

Revision ID: 20260827_0030
Revises: 20260827_0029
"""

import sqlalchemy as sa
from alembic import op


revision = "20260827_0030"
down_revision = "20260827_0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "system_users",
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade():
    op.drop_column("system_users", "auth_version")
