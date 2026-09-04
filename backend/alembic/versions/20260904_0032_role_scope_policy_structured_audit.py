"""Add configurable role scope policies and structured audit snapshots.

Revision ID: 20260904_0032
Revises: 20260903_0031
"""

import sqlalchemy as sa
from alembic import op


revision = "20260904_0032"
down_revision = "20260903_0031"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "role_scope_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("system_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("default_scope", sa.String(length=30), nullable=False),
        sa.Column("allowed_scopes", sa.JSON(), nullable=False),
        sa.Column("warning_level", sa.String(length=20), nullable=False, server_default="warning"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("role_id", name="uq_role_scope_policies_role_id"),
    )
    role_table = sa.table(
        "system_roles",
        sa.column("id", sa.Integer()),
        sa.column("role_code", sa.String()),
    )
    policy_table = sa.table(
        "role_scope_policies",
        sa.column("role_id", sa.Integer()),
        sa.column("default_scope", sa.String()),
        sa.column("allowed_scopes", sa.JSON()),
        sa.column("warning_level", sa.String()),
    )
    defaults = {
        "ADMIN": ("province", ["province"]),
        "HEAD_OFFICE_LEADER": ("province", ["province"]),
        "BRANCH_MANAGER": ("branch", ["branch"]),
        "DEPARTMENT_MANAGER": ("department", ["department"]),
        "USER": ("own", ["own", "department"]),
    }
    connection = op.get_bind()
    roles = connection.execute(sa.select(role_table.c.id, role_table.c.role_code)).mappings().all()
    rows = []
    for role in roles:
        default_scope, allowed_scopes = defaults.get(role["role_code"], ("own", ["own"]))
        rows.append({
            "role_id": role["id"],
            "default_scope": default_scope,
            "allowed_scopes": allowed_scopes,
            "warning_level": "warning",
        })
    if rows:
        op.bulk_insert(policy_table, rows)

    op.add_column("audit_logs", sa.Column("before_data", sa.JSON(), nullable=True))
    op.add_column("audit_logs", sa.Column("after_data", sa.JSON(), nullable=True))
    op.add_column("audit_logs", sa.Column("changed_fields", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("audit_logs", "changed_fields")
    op.drop_column("audit_logs", "after_data")
    op.drop_column("audit_logs", "before_data")
    op.drop_table("role_scope_policies")
