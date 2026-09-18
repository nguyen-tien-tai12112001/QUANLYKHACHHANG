"""Add controlled user login sessions.

Revision ID: 20260914_0034
Revises: 20260907_0033
"""

import sqlalchemy as sa
from alembic import op


revision = "20260914_0034"
down_revision = "20260907_0033"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("logged_in_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(length=80), nullable=True),
        sa.Column("revoked_by", sa.String(length=80), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["system_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_device_id", "user_sessions", ["device_id"])
    op.create_index("ix_user_sessions_last_activity_at", "user_sessions", ["last_activity_at"])
    op.create_index("ix_user_sessions_revoked_at", "user_sessions", ["revoked_at"])
    op.create_index("ix_user_sessions_user_active", "user_sessions", ["user_id", "revoked_at"])


def downgrade():
    op.drop_index("ix_user_sessions_user_active", table_name="user_sessions")
    op.drop_index("ix_user_sessions_revoked_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_last_activity_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_device_id", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
