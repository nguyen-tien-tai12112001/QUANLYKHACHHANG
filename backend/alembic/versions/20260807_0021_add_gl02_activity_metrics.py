"""add GL02 account activity metrics

Revision ID: 20260807_0021
Revises: 20260807_0020
"""

from alembic import op
import sqlalchemy as sa

revision = "20260807_0021"
down_revision = "20260807_0020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customer_period_profiles", sa.Column("last_tktt_transaction_at", sa.DateTime()))
    op.add_column("customer_period_profiles", sa.Column("tktt_inactive_days", sa.Integer()))
    op.add_column("customer_period_profiles", sa.Column("tktt_activity_status", sa.String(30)))
    op.execute("UPDATE gl02_ledger_transactions SET customer_code = NULL WHERE customer_code = '000000000'")
    op.execute("""
        UPDATE profile_metric_definitions
        SET status_code=1, description='GL02: MAX(CRTDTM), dự phòng MAX(TRDATE), với LOCAC=421101 và khách hàng hợp lệ'
        WHERE metric_code='NGAY_UPDATE'
    """)


def downgrade():
    op.drop_column("customer_period_profiles", "tktt_activity_status")
    op.drop_column("customer_period_profiles", "tktt_inactive_days")
    op.drop_column("customer_period_profiles", "last_tktt_transaction_at")
