"""Add private pinned customers and presentation permission.

Revision ID: 20260914_0035
Revises: 20260914_0034
"""

import sqlalchemy as sa
from alembic import op


revision = "20260914_0035"
down_revision = "20260914_0034"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_pinned_customers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("customer_code", sa.String(length=32), nullable=False),
        sa.Column("customer_name", sa.String(length=255), nullable=True),
        sa.Column("branch_code", sa.String(length=20), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["system_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "customer_code", name="uq_user_pinned_customer"),
    )
    op.create_index("ix_user_pinned_customers_id", "user_pinned_customers", ["id"])
    op.create_index("ix_user_pinned_customers_user_id", "user_pinned_customers", ["user_id"])
    op.create_index("ix_user_pinned_customers_customer_code", "user_pinned_customers", ["customer_code"])
    op.create_index("ix_user_pinned_customers_branch_code", "user_pinned_customers", ["branch_code"])
    op.create_index("ix_user_pinned_customers_user_created", "user_pinned_customers", ["user_id", "created_at"])

    op.execute("""
        INSERT INTO system_permissions (permission_code, permission_name, permission_group)
        VALUES ('dashboard:presentation', 'Trình chiếu Dashboard điều hành', 'Tổng quan')
        ON CONFLICT (permission_code) DO NOTHING
    """)


def downgrade():
    op.execute("DELETE FROM system_user_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'dashboard:presentation')")
    op.execute("DELETE FROM system_role_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'dashboard:presentation')")
    op.execute("DELETE FROM system_permissions WHERE permission_code = 'dashboard:presentation'")
    op.drop_index("ix_user_pinned_customers_user_created", table_name="user_pinned_customers")
    op.drop_index("ix_user_pinned_customers_branch_code", table_name="user_pinned_customers")
    op.drop_index("ix_user_pinned_customers_customer_code", table_name="user_pinned_customers")
    op.drop_index("ix_user_pinned_customers_user_id", table_name="user_pinned_customers")
    op.drop_index("ix_user_pinned_customers_id", table_name="user_pinned_customers")
    op.drop_table("user_pinned_customers")
