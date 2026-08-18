"""Add the 2600 organization hierarchy and standardized leadership roles.

Revision ID: 20260818_0027
Revises: 20260817_0026
"""

import sqlalchemy as sa
from alembic import op


revision = "20260818_0027"
down_revision = "20260817_0026"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("org_branches", sa.Column("branch_level", sa.String(30), nullable=False, server_default="LEVEL_2"))
    op.add_column("org_branches", sa.Column("parent_branch_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_org_branches_parent", "org_branches", "org_branches", ["parent_branch_id"], ["id"])
    op.create_index("ix_org_branches_branch_level", "org_branches", ["branch_level"])
    op.create_index("ix_org_branches_parent_branch_id", "org_branches", ["parent_branch_id"])

    op.add_column("org_departments", sa.Column("parent_department_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_org_departments_parent", "org_departments", "org_departments", ["parent_department_id"], ["id"])
    op.create_index("ix_org_departments_parent_department_id", "org_departments", ["parent_department_id"])

    op.execute("UPDATE org_branches SET branch_level='HEAD_OFFICE', parent_branch_id=NULL WHERE branch_code='2600'")
    op.execute("""
        UPDATE org_branches child
        SET branch_level='LEVEL_2', parent_branch_id=head.id
        FROM org_branches head
        WHERE head.branch_code='2600' AND child.branch_code<>'2600'
    """)
    op.execute("""
        UPDATE org_departments d
        SET department_type = CASE
            WHEN upper(d.department_name) LIKE '%PHÒNG GIAO DỊCH%'
              OR upper(d.department_name) LIKE '%PGD %'
              OR upper(d.department_name) LIKE 'PGD %' THEN 'TRANSACTION_OFFICE'
            WHEN b.branch_code='2600' THEN 'HEAD_OFFICE_DEPARTMENT'
            ELSE 'BRANCH_DEPARTMENT'
        END
        FROM org_branches b WHERE b.id=d.branch_id
    """)
    op.execute("""
        UPDATE system_roles SET role_code='BRANCH_MANAGER', role_name='Lãnh đạo chi nhánh loại II',
          description='Theo dõi toàn bộ phòng ban, PGD và khách hàng thuộc chi nhánh.'
        WHERE role_code='MANAGER'
    """)
    op.execute("UPDATE system_users SET data_scope='province' WHERE is_superuser=true")


def downgrade():
    op.execute("UPDATE system_roles SET role_code='MANAGER', role_name='Quản lý đơn vị' WHERE role_code='BRANCH_MANAGER'")
    op.drop_index("ix_org_departments_parent_department_id", table_name="org_departments")
    op.drop_constraint("fk_org_departments_parent", "org_departments", type_="foreignkey")
    op.drop_column("org_departments", "parent_department_id")
    op.drop_index("ix_org_branches_parent_branch_id", table_name="org_branches")
    op.drop_index("ix_org_branches_branch_level", table_name="org_branches")
    op.drop_constraint("fk_org_branches_parent", "org_branches", type_="foreignkey")
    op.drop_column("org_branches", "parent_branch_id")
    op.drop_column("org_branches", "branch_level")
