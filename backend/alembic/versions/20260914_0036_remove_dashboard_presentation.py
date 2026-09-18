"""Remove the dashboard presentation permission.

Revision ID: 20260914_0036
Revises: 20260914_0035
"""

from alembic import op


revision = "20260914_0036"
down_revision = "20260914_0035"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DELETE FROM system_user_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'dashboard:presentation')")
    op.execute("DELETE FROM system_role_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'dashboard:presentation')")
    op.execute("DELETE FROM system_permissions WHERE permission_code = 'dashboard:presentation'")


def downgrade():
    op.execute("""
        INSERT INTO system_permissions (permission_code, permission_name, permission_group)
        VALUES ('dashboard:presentation', 'Trình chiếu Dashboard điều hành', 'Tổng quan')
        ON CONFLICT (permission_code) DO NOTHING
    """)
