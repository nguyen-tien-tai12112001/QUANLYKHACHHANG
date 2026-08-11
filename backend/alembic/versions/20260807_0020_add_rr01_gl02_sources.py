"""add RR01 and GL02 source warehouses and profile metrics

Revision ID: 20260807_0020
Revises: 20260805_0019
"""

from alembic import op
import sqlalchemy as sa


revision = "20260807_0020"
down_revision = "20260805_0019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rr01_handled_risk_loans",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("import_file_id", sa.Integer(), sa.ForeignKey("import_files.id"), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("period_key", sa.String(8), nullable=False), sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("branch_code", sa.String(10)), sa.Column("customer_code", sa.String(32)),
        sa.Column("customer_name", sa.String(255)), sa.Column("lds_number", sa.String(100)),
        sa.Column("lav_number", sa.String(100)), sa.Column("currency_code", sa.String(10)),
        sa.Column("customer_type", sa.String(30)), sa.Column("disbursement_date", sa.Date()),
        sa.Column("maturity_date", sa.Date()), sa.Column("vamc_flag", sa.String(10)),
        sa.Column("risk_handling_date", sa.Date()),
        *[sa.Column(name, sa.Numeric(24, 6)) for name in (
            "original_principal", "original_accrued_interest", "recovered_principal_before_period",
            "current_principal", "current_interest", "short_term_principal", "medium_term_principal",
            "long_term_principal", "recovered_principal_period", "recovered_interest_period",
            "real_estate_amount", "movable_asset_amount", "other_asset_amount")],
        sa.Column("raw_data", sa.JSON()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for name in ("import_file_id", "import_batch_id", "period_key", "branch_code", "customer_code", "lds_number", "lav_number"):
        op.create_index(f"ix_rr01_handled_risk_loans_{name}", "rr01_handled_risk_loans", [name])

    op.create_table(
        "gl02_ledger_transactions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("import_file_id", sa.Integer(), sa.ForeignKey("import_files.id"), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("period_key", sa.String(8), nullable=False), sa.Column("transaction_date", sa.Date()),
        sa.Column("transaction_branch_code", sa.String(10)), sa.Column("customer_branch_code", sa.String(10)),
        sa.Column("customer_code", sa.String(32)), sa.Column("user_id", sa.String(50)),
        sa.Column("journal_sequence", sa.String(30)), sa.Column("daily_transaction_sequence", sa.String(30)),
        sa.Column("account_code", sa.String(30)), sa.Column("currency_code", sa.String(10)),
        sa.Column("business_code", sa.String(20)), sa.Column("unit_code", sa.String(20)),
        sa.Column("transaction_code", sa.String(30)), sa.Column("transaction_type", sa.String(30)),
        sa.Column("reference", sa.String(100)), sa.Column("remark", sa.Text()),
        sa.Column("debit_amount", sa.Numeric(24, 6)), sa.Column("credit_amount", sa.Numeric(24, 6)),
        sa.Column("created_datetime", sa.DateTime()), sa.Column("source_row_hash", sa.String(64)),
        sa.Column("raw_data", sa.JSON()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for name in ("import_file_id", "import_batch_id", "period_key", "transaction_date", "transaction_branch_code", "customer_branch_code", "customer_code", "account_code", "transaction_type", "reference", "source_row_hash"):
        op.create_index(f"ix_gl02_ledger_transactions_{name}", "gl02_ledger_transactions", [name])
    op.create_index("ix_gl02_period_account_customer", "gl02_ledger_transactions", ["period_key", "account_code", "customer_code"])

    op.add_column("customer_period_profiles", sa.Column("du_no_xlrr", sa.Numeric(24, 6), server_default="0"))
    op.add_column("customer_period_profiles", sa.Column("ds_thu_no_xlrr", sa.Numeric(24, 6), server_default="0"))
    op.execute("""
        UPDATE profile_metric_definitions
        SET metric_code = 'DS_THUNO_XLRR', metric_name = 'Doanh số thu nợ XLRR trong tháng',
            status_code = 1, description = 'RR01: SUM(THU_GOC) + SUM(THU_LAI) theo mã KH lõi'
        WHERE metric_code = 'DUNO_XLRRBQ';
        UPDATE profile_metric_definitions
        SET metric_name = 'Dư nợ xử lý rủi ro cuối tháng', status_code = 1,
            description = 'RR01: SUM(DUNO_GOC_HIENTAI) theo mã KH lõi'
        WHERE metric_code = 'DUNO_XLRR';
    """)


def downgrade():
    op.execute("UPDATE profile_metric_definitions SET metric_code='DUNO_XLRRBQ', metric_name='Dư nợ XLRR bình quân' WHERE metric_code='DS_THUNO_XLRR'")
    op.drop_column("customer_period_profiles", "ds_thu_no_xlrr")
    op.drop_column("customer_period_profiles", "du_no_xlrr")
    op.drop_table("gl02_ledger_transactions")
    op.drop_table("rr01_handled_risk_loans")
