"""Add KH02 international fee and Bill Payment telecom metrics.

Revision ID: 20260811_0024
Revises: 20260807_0023
"""
from alembic import op
import sqlalchemy as sa

revision = "20260811_0024"
down_revision = "20260807_0023"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("customer_period_branch_details", "customer_period_profiles"):
        op.add_column(table, sa.Column("phi_khnt", sa.Numeric(24, 2)))
        op.add_column(table, sa.Column("phi_lc", sa.Numeric(24, 2)))
        op.add_column(table, sa.Column("phi_ttqt", sa.Numeric(24, 2)))
        op.add_column(table, sa.Column("ttqt", sa.Integer(), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("thuho_dt", sa.Integer(), nullable=False, server_default="0"))
    op.execute("""
        INSERT INTO business_matching_rules
          (rule_code,rule_name,source_type,service_codes,effective_from,priority,active,description)
        VALUES
          ('THUHO_DT','Thu hộ điện thoại, viễn thông','BILLPAYMENT','["312","333","360","409","363"]','2026-01-01',100,true,
           'Ghép STK thường qua DP01; tài khoản 8888 qua mã lõi CN05; user deposit qua CCCD trong nội dung và Kho CIF')
        ON CONFLICT (rule_code,effective_from) DO NOTHING
    """)
    op.execute("""
        INSERT INTO system_configuration_entries
          (category,config_code,config_name,source_type,config_value,description,effective_from,active)
        VALUES
          ('ACCOUNT_FORMULA','PHI_KHNT','Phí kinh doanh ngoại tệ','KH02','{"account_codes":["721001"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Tính theo mã KH lõi và chi nhánh','2026-01-01',true),
          ('ACCOUNT_FORMULA','PHI_LC','Phí LC','KH02','{"account_codes":["709002"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Tính theo mã KH lõi và chi nhánh','2026-01-01',true),
          ('ACCOUNT_FORMULA','PHI_TTQT','Phí thanh toán quốc tế','KH02','{"account_range":["711002","711014"],"account_codes":["711096"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','711002-711014 và 711096; chỉ vào C360 khi khớp CIF','2026-01-01',true)
        ON CONFLICT (category,config_code) DO NOTHING
    """)


def downgrade():
    op.execute("DELETE FROM business_matching_rules WHERE rule_code='THUHO_DT'")
    op.execute("DELETE FROM system_configuration_entries WHERE category='ACCOUNT_FORMULA' AND config_code IN ('PHI_KHNT','PHI_LC','PHI_TTQT')")
    for table in ("customer_period_profiles", "customer_period_branch_details"):
        for column in ("thuho_dt", "ttqt", "phi_ttqt", "phi_lc", "phi_khnt"):
            op.drop_column(table, column)
