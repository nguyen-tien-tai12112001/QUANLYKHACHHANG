"""Add direct user permissions and personal profile fields.

Revision ID: 20260827_0028
Revises: 20260818_0027
"""

import sqlalchemy as sa
from alembic import op


revision = "20260827_0028"
down_revision = "20260818_0027"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("system_users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("system_users", sa.Column("phone", sa.String(30), nullable=True))
    op.create_table(
        "system_user_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("system_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("system_permissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "permission_id", name="uq_system_user_permissions"),
    )
    op.create_index("ix_system_user_permissions_user_id", "system_user_permissions", ["user_id"])
    op.create_index("ix_system_user_permissions_permission_id", "system_user_permissions", ["permission_id"])


def downgrade():
    op.drop_index("ix_system_user_permissions_permission_id", table_name="system_user_permissions")
    op.drop_index("ix_system_user_permissions_user_id", table_name="system_user_permissions")
    op.drop_table("system_user_permissions")
    op.drop_column("system_users", "phone")
    op.drop_column("system_users", "email")
