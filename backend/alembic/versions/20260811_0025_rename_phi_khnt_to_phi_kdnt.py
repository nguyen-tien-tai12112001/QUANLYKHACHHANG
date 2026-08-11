"""Rename PHI_KHNT to the correct business code PHI_KDNT.

Revision ID: 20260811_0025
Revises: 20260811_0024
"""
from alembic import op

revision = "20260811_0025"
down_revision = "20260811_0024"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("customer_period_branch_details", "customer_period_profiles"):
        op.alter_column(table, "phi_khnt", new_column_name="phi_kdnt")
    op.execute("""
        UPDATE system_configuration_entries
        SET config_code='PHI_KDNT', config_name='Phí kinh doanh ngoại tệ', updated_at=now()
        WHERE category='ACCOUNT_FORMULA' AND config_code='PHI_KHNT'
    """)


def downgrade():
    op.execute("""
        UPDATE system_configuration_entries
        SET config_code='PHI_KHNT', updated_at=now()
        WHERE category='ACCOUNT_FORMULA' AND config_code='PHI_KDNT'
    """)
    for table in ("customer_period_profiles", "customer_period_branch_details"):
        op.alter_column(table, "phi_kdnt", new_column_name="phi_khnt")
