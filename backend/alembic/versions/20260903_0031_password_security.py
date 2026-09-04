"""Add first-login password change and login protection fields.

Revision ID: 20260903_0031
Revises: 20260827_0030
"""

import sqlalchemy as sa
from alembic import op


revision = "20260903_0031"
down_revision = "20260827_0030"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "system_users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("system_users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "system_users",
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("system_users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("system_users", "locked_until")
    op.drop_column("system_users", "failed_login_attempts")
    op.drop_column("system_users", "password_changed_at")
    op.drop_column("system_users", "must_change_password")
