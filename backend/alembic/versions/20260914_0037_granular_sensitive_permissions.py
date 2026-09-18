"""Granular sensitive permissions and user ALLOW/DENY overrides.

Revision ID: 20260914_0037
Revises: 20260914_0036
"""

import sqlalchemy as sa
from alembic import op


revision = "20260914_0037"
down_revision = "20260914_0036"
branch_labels = None
depends_on = None


SENSITIVE_PERMISSIONS = (
    ("customer:sensitive:identity", "Xem đầy đủ CCCD và mã số thuế"),
    ("customer:sensitive:contact", "Xem đầy đủ điện thoại và địa chỉ"),
    ("customer:sensitive:account", "Xem đầy đủ số tài khoản và sổ tiết kiệm"),
    ("customer:sensitive:transaction", "Xem chi tiết nội dung giao dịch"),
    ("customer:sensitive:loan", "Xem đầy đủ LDS và chi tiết khoản vay"),
    ("customer:sensitive:copy", "Sao chép dữ liệu nhạy cảm"),
)


def upgrade():
    op.add_column(
        "system_user_permissions",
        sa.Column("effect", sa.String(10), nullable=False, server_default="allow"),
    )
    op.create_check_constraint(
        "ck_system_user_permissions_effect",
        "system_user_permissions",
        "effect IN ('allow', 'deny')",
    )
    for code, name in SENSITIVE_PERMISSIONS:
        op.execute(sa.text("""
            INSERT INTO system_permissions (permission_code, permission_name, permission_group)
            VALUES (:code, :name, 'Dữ liệu nhạy cảm')
            ON CONFLICT (permission_code) DO UPDATE
              SET permission_name = EXCLUDED.permission_name,
                  permission_group = EXCLUDED.permission_group
        """).bindparams(code=code, name=name))
    # Migrate any legacy umbrella grant to every granular permission before the
    # old permission is removed, preserving existing authorized users/roles.
    for code, _ in SENSITIVE_PERMISSIONS:
        op.execute(sa.text("""
            INSERT INTO system_role_permissions (role_id, permission_id)
            SELECT legacy.role_id, target.id
            FROM system_role_permissions legacy
            JOIN system_permissions old_permission ON old_permission.id = legacy.permission_id
            JOIN system_permissions target ON target.permission_code = :code
            WHERE old_permission.permission_code = 'customer:view_sensitive'
            ON CONFLICT (role_id, permission_id) DO NOTHING
        """).bindparams(code=code))
        op.execute(sa.text("""
            INSERT INTO system_user_permissions (user_id, permission_id, effect)
            SELECT legacy.user_id, target.id, legacy.effect
            FROM system_user_permissions legacy
            JOIN system_permissions old_permission ON old_permission.id = legacy.permission_id
            JOIN system_permissions target ON target.permission_code = :code
            WHERE old_permission.permission_code = 'customer:view_sensitive'
            ON CONFLICT (user_id, permission_id) DO NOTHING
        """).bindparams(code=code))
    op.execute("DELETE FROM system_user_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'customer:view_sensitive')")
    op.execute("DELETE FROM system_role_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code = 'customer:view_sensitive')")
    op.execute("DELETE FROM system_permissions WHERE permission_code = 'customer:view_sensitive'")


def downgrade():
    op.execute("""
        INSERT INTO system_permissions (permission_code, permission_name, permission_group)
        VALUES ('customer:view_sensitive', 'Xem đầy đủ dữ liệu định danh nhạy cảm', 'Khách hàng C360')
        ON CONFLICT (permission_code) DO NOTHING
    """)
    codes = ", ".join(f"'{code}'" for code, _ in SENSITIVE_PERMISSIONS)
    op.execute(f"DELETE FROM system_user_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code IN ({codes}))")
    op.execute(f"DELETE FROM system_role_permissions WHERE permission_id IN (SELECT id FROM system_permissions WHERE permission_code IN ({codes}))")
    op.execute(f"DELETE FROM system_permissions WHERE permission_code IN ({codes})")
    op.drop_constraint("ck_system_user_permissions_effect", "system_user_permissions", type_="check")
    op.drop_column("system_user_permissions", "effect")
