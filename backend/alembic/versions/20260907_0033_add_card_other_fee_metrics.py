"""Add KH02 card and other fee metrics.

Revision ID: 20260907_0033
Revises: 20260904_0032
"""

import sqlalchemy as sa
from alembic import op


revision = "20260907_0033"
down_revision = "20260904_0032"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("customer_period_branch_details", "customer_period_profiles"):
        op.add_column(table, sa.Column("phi_the", sa.Numeric(24, 2), nullable=True))
        op.add_column(table, sa.Column("phi_khac", sa.Numeric(24, 2), nullable=True))

    op.execute("""
        INSERT INTO system_configuration_entries
          (category,config_code,config_name,source_type,config_value,description,effective_from,active)
        VALUES
          ('ACCOUNT_FORMULA','PHI_THE','Phí thẻ','KH02',
           '{"account_codes":["711015","711016","711022","711023","711024","711025","711026","711027","711028","711051","711052","711059"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}'::json,
           'Tính theo mã khách hàng lõi và chi nhánh; mỗi mã tài khoản chỉ thuộc một nhóm phí chính','2026-01-01',true),
          ('ACCOUNT_FORMULA','PHI_KHAC','Phí khác','KH02',
           '{"account_codes":["711031","711035","711042","711044","711098"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}'::json,
           'Không gồm 711037, 711039 và 711096 vì đã thuộc NHĐT/TTQT','2026-01-01',true)
        ON CONFLICT (category,config_code) DO UPDATE SET
          config_name=EXCLUDED.config_name, source_type=EXCLUDED.source_type,
          config_value=EXCLUDED.config_value, description=EXCLUDED.description, active=true
    """)
    op.execute("""
        UPDATE system_configuration_entries
        SET config_value = '{"account_range":["711003","711014"],"account_codes":["711096"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}'::json,
            description = '711003-711014 và 711096; loại 711002 vì đã thuộc phí chuyển tiền'
        WHERE category='ACCOUNT_FORMULA' AND config_code='PHI_TTQT'
    """)
    op.execute("""
        UPDATE profile_metric_definitions
        SET status_code=1, description=CASE metric_code
          WHEN 'PHI_THE' THEN 'KH02: ACCTCD 711015, 711016, 711022-711028, 711051, 711052, 711059; SUM(CRAMT)-SUM(DRAMT)'
          ELSE 'KH02: ACCTCD 711031, 711035, 711042, 711044, 711098; SUM(CRAMT)-SUM(DRAMT); loại mã đã thuộc nhóm phí khác'
        END, updated_at=now()
        WHERE metric_code IN ('PHI_THE','PHI_KHAC')
    """)


def downgrade():
    op.execute("DELETE FROM system_configuration_entries WHERE category='ACCOUNT_FORMULA' AND config_code IN ('PHI_THE','PHI_KHAC')")
    op.execute("UPDATE profile_metric_definitions SET status_code=4 WHERE metric_code='PHI_THE'")
    op.execute("UPDATE profile_metric_definitions SET status_code=3 WHERE metric_code='PHI_KHAC'")
    for table in ("customer_period_profiles", "customer_period_branch_details"):
        op.drop_column(table, "phi_khac")
        op.drop_column(table, "phi_the")
