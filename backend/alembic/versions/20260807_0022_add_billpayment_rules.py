"""Add configurable Bill Payment supplemental processing.

Revision ID: 20260807_0022
Revises: 20260807_0021
"""
from alembic import op
import sqlalchemy as sa

revision = "20260807_0022"
down_revision = "20260807_0021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "business_matching_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_code", sa.String(50), nullable=False),
        sa.Column("rule_name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("service_codes", sa.JSON()),
        sa.Column("amount_equals", sa.Numeric(20, 2)),
        sa.Column("effective_from", sa.Date()),
        sa.Column("effective_to", sa.Date()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("description", sa.Text()),
        sa.Column("updated_by", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("rule_code", "effective_from", name="uq_business_rule_effective"),
    )
    op.create_index("ix_business_rules_code_active", "business_matching_rules", ["rule_code", "active"])
    op.create_table(
        "supplemental_billpayment_transactions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("optional_file_id", sa.Integer(), sa.ForeignKey("customer_processing_optional_files.id"), index=True),
        sa.Column("period_key", sa.String(8), nullable=False, index=True),
        sa.Column("transaction_id", sa.String(100), nullable=False),
        sa.Column("transaction_status", sa.String(255)),
        sa.Column("transaction_datetime", sa.DateTime(), index=True),
        sa.Column("biller_customer_code", sa.String(100)),
        sa.Column("customer_name", sa.String(255)),
        sa.Column("debit_account", sa.String(120), index=True),
        sa.Column("amount", sa.Numeric(20, 2)),
        sa.Column("content", sa.Text()),
        sa.Column("branch_code", sa.String(10), index=True),
        sa.Column("lead_bank_code", sa.String(20)),
        sa.Column("service_code", sa.String(30), index=True),
        sa.Column("provider_code", sa.String(50)),
        sa.Column("user_id", sa.String(50)),
        sa.Column("raw_data", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("period_key", "transaction_id", name="uq_billpayment_period_transaction"),
    )
    for table in ("customer_period_branch_details", "customer_period_profiles"):
        op.add_column(table, sa.Column("thuho_dien", sa.Integer(), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("thuho_nuoc", sa.Integer(), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("hkd_tk", sa.Integer(), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("hkd_account_numbers", sa.Text()))
        op.add_column(table, sa.Column("abic_batk", sa.Integer(), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("abic_bathe", sa.Integer(), nullable=False, server_default="0"))
    op.execute("""
        INSERT INTO business_matching_rules
            (rule_code, rule_name, source_type, service_codes, amount_equals, effective_from, priority, active, description)
        VALUES
            ('THUHO_DIEN','Thu hộ tiền điện','BILLPAYMENT','["994","995","996","997","999","1003"]',NULL,'2026-01-01',100,true,'Ghép STK chuyển với DP01.SO_TAI_KHOAN'),
            ('THUHO_NUOC','Thu hộ tiền nước','BILLPAYMENT','["1235","6626","10929","10930","10931","10932","6541"]',NULL,'2026-01-01',100,true,'Ghép STK chuyển với DP01.SO_TAI_KHOAN'),
            ('ABIC_BATK','Bảo an tài khoản','BILLPAYMENT','["1218"]',77000,'2026-01-01',100,true,'Mã DV 1218, số tiền 77.000 đồng'),
            ('ABIC_BATHE','Bảo an thẻ','BILLPAYMENT','["1218"]',18000,'2026-01-01',100,true,'Mã DV 1218, số tiền 18.000 đồng')
    """)


def downgrade():
    for table in ("customer_period_profiles", "customer_period_branch_details"):
        for column in ("abic_bathe", "abic_batk", "hkd_account_numbers", "hkd_tk", "thuho_nuoc", "thuho_dien"):
            op.drop_column(table, column)
    op.drop_table("supplemental_billpayment_transactions")
    op.drop_index("ix_business_rules_code_active", table_name="business_matching_rules")
    op.drop_table("business_matching_rules")
