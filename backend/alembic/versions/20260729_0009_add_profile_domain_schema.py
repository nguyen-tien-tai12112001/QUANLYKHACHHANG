"""Add normalized schema for the customer profile fields.

Revision ID: 20260729_0009
Revises: 20260729_0008
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260729_0009"
down_revision: str | None = "20260729_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.add_column("cif_customers", sa.Column("birth_date", sa.Date()))
    op.add_column("cif_customers", sa.Column("gender_code", sa.String(20)))
    op.add_column("cif_customers", sa.Column("establishment_date", sa.Date()))
    op.add_column("cif_customers", sa.Column("occupation", sa.String(255)))
    op.add_column("cif_customers", sa.Column("economic_sector_code", sa.String(50)))
    op.add_column("cif_customers", sa.Column("customer_segment_code", sa.String(50)))
    op.add_column(
        "cif_customers",
        sa.Column("data_quality_status", sa.String(30), server_default="pending", nullable=False),
    )
    op.create_index("ix_cif_customers_customer_segment_code", "cif_customers", ["customer_segment_code"])
    op.create_index("ix_cif_customers_data_quality_status", "cif_customers", ["data_quality_status"])

    op.create_table(
        "customer_branch_relationships",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("pgd_code", sa.String(20)),
        sa.Column("officer_user_id", sa.Integer(), sa.ForeignKey("system_users.id")),
        sa.Column("officer_code", sa.String(50)),
        sa.Column("relationship_type", sa.String(30), server_default="servicing", nullable=False),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date()),
        sa.Column("source_code", sa.String(30)),
        sa.Column("source_record_id", sa.BigInteger()),
        *_timestamps(),
        sa.UniqueConstraint(
            "customer_id", "branch_code", "pgd_code", "valid_from",
            name="uq_customer_branch_relationship",
        ),
    )
    for column in ("customer_id", "branch_code", "pgd_code", "officer_user_id", "officer_code", "is_primary"):
        op.create_index(f"ix_customer_branch_relationships_{column}", "customer_branch_relationships", [column])

    op.create_table(
        "customer_representatives",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("representative_name", sa.String(255), nullable=False),
        sa.Column("identity_number", sa.String(100)),
        sa.Column("position", sa.String(100)),
        sa.Column("is_legal_representative", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_to", sa.Date()),
        sa.Column("source_code", sa.String(30)),
        sa.Column("source_record_id", sa.BigInteger()),
        *_timestamps(),
    )
    op.create_index("ix_customer_representatives_customer_id", "customer_representatives", ["customer_id"])
    op.create_index("ix_customer_representatives_identity_number", "customer_representatives", ["identity_number"])

    op.create_table(
        "customer_deposit_period_metrics",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("demand_deposit_eom", sa.Numeric(24, 2)),
        sa.Column("demand_deposit_average", sa.Numeric(24, 2)),
        sa.Column("term_deposit_eom", sa.Numeric(24, 2)),
        sa.Column("term_deposit_average", sa.Numeric(24, 2)),
        sa.Column("incoming_turnover", sa.Numeric(24, 2)),
        sa.Column("funding_ftp_income", sa.Numeric(24, 2)),
        sa.Column("last_transaction_date", sa.Date()),
        sa.Column("source_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        sa.Column("calculation_version", sa.String(30)),
        *_timestamps(),
        sa.UniqueConstraint("period_key", "customer_id", "branch_code", name="uq_customer_deposit_period_metric"),
    )
    op.create_index(
        "ix_customer_deposit_metrics_period_branch_customer",
        "customer_deposit_period_metrics", ["period_key", "branch_code", "customer_id"],
    )

    op.create_table(
        "customer_loan_period_metrics",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("short_term_eom", sa.Numeric(24, 2)),
        sa.Column("short_term_average", sa.Numeric(24, 2)),
        sa.Column("medium_long_term_eom", sa.Numeric(24, 2)),
        sa.Column("medium_long_term_average", sa.Numeric(24, 2)),
        sa.Column("overdraft_eom", sa.Numeric(24, 2)),
        sa.Column("overdraft_average", sa.Numeric(24, 2)),
        sa.Column("bad_debt_eom", sa.Numeric(24, 2)),
        sa.Column("bad_debt_average", sa.Numeric(24, 2)),
        sa.Column("written_off_debt_eom", sa.Numeric(24, 2)),
        sa.Column("written_off_debt_average", sa.Numeric(24, 2)),
        sa.Column("general_provision_period", sa.Numeric(24, 2)),
        sa.Column("specific_provision_period", sa.Numeric(24, 2)),
        sa.Column("general_provision_accumulated", sa.Numeric(24, 2)),
        sa.Column("specific_provision_accumulated", sa.Numeric(24, 2)),
        sa.Column("loan_ftp_income", sa.Numeric(24, 2)),
        sa.Column("source_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        sa.Column("calculation_version", sa.String(30)),
        *_timestamps(),
        sa.UniqueConstraint("period_key", "customer_id", "branch_code", name="uq_customer_loan_period_metric"),
    )
    op.create_index(
        "ix_customer_loan_metrics_period_branch_customer",
        "customer_loan_period_metrics", ["period_key", "branch_code", "customer_id"],
    )

    op.create_table(
        "customer_revenue_period_metrics",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("metric_code", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(24, 2)),
        sa.Column("quantity", sa.Integer()),
        sa.Column("source_code", sa.String(30)),
        sa.Column("source_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        sa.Column("calculation_version", sa.String(30)),
        *_timestamps(),
        sa.UniqueConstraint(
            "period_key", "customer_id", "branch_code", "metric_code",
            name="uq_customer_revenue_period_metric",
        ),
    )
    op.create_index(
        "ix_customer_revenue_metrics_period_code",
        "customer_revenue_period_metrics", ["period_key", "metric_code", "branch_code"],
    )

    op.create_table(
        "customer_fee_period_metrics",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("fee_code", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(24, 2)),
        sa.Column("transaction_count", sa.Integer()),
        sa.Column("source_code", sa.String(30)),
        sa.Column("source_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        sa.Column("calculation_version", sa.String(30)),
        *_timestamps(),
        sa.UniqueConstraint(
            "period_key", "customer_id", "branch_code", "fee_code",
            name="uq_customer_fee_period_metric",
        ),
    )
    op.create_index(
        "ix_customer_fee_metrics_period_code",
        "customer_fee_period_metrics", ["period_key", "fee_code", "branch_code"],
    )

    op.create_table(
        "product_definitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_code", sa.String(50), nullable=False, unique=True),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("product_group", sa.String(50), nullable=False),
        sa.Column("source_code", sa.String(30)),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_product_definitions_product_group", "product_definitions", ["product_group"])

    op.create_table(
        "customer_product_period_statuses",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("period_key", sa.String(8), nullable=False),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id"), nullable=False),
        sa.Column("branch_code", sa.String(10), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("product_definitions.id"), nullable=False),
        sa.Column("is_active", sa.Boolean()),
        sa.Column("quantity", sa.Integer()),
        sa.Column("activated_at", sa.Date()),
        sa.Column("deactivated_at", sa.Date()),
        sa.Column("source_code", sa.String(30)),
        sa.Column("source_record_id", sa.BigInteger()),
        sa.Column("source_job_id", sa.Integer(), sa.ForeignKey("customer_processing_jobs.id")),
        *_timestamps(),
        sa.UniqueConstraint(
            "period_key", "customer_id", "branch_code", "product_id",
            name="uq_customer_product_period_status",
        ),
    )
    op.create_index(
        "ix_customer_product_status_period_product",
        "customer_product_period_statuses", ["period_key", "product_id", "is_active"],
    )
    op.create_index(
        "ix_customer_product_status_period_branch_customer",
        "customer_product_period_statuses", ["period_key", "branch_code", "customer_id"],
    )

    op.create_table(
        "profile_metric_definitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("metric_code", sa.String(50), nullable=False, unique=True),
        sa.Column("metric_name", sa.String(255), nullable=False),
        sa.Column("group_code", sa.String(50), nullable=False),
        sa.Column("data_type", sa.String(20), nullable=False),
        sa.Column("unit", sa.String(30)),
        sa.Column("aggregation_type", sa.String(30)),
        sa.Column("default_visible", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status_code", sa.Integer(), server_default="3", nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_profile_metric_definitions_group_code", "profile_metric_definitions", ["group_code"])

    op.create_table(
        "profile_metric_rule_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("metric_id", sa.Integer(), sa.ForeignKey("profile_metric_definitions.id"), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("source_codes", sa.JSON()),
        sa.Column("source_columns", sa.JSON()),
        sa.Column("join_rule", sa.Text()),
        sa.Column("filter_rule", sa.Text()),
        sa.Column("calculation_sql", sa.Text()),
        sa.Column("reconciliation_rule", sa.Text()),
        sa.Column("valid_from_period", sa.String(8)),
        sa.Column("valid_to_period", sa.String(8)),
        sa.Column("approval_status", sa.String(30), server_default="draft", nullable=False),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("system_users.id")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint("metric_id", "version_no", name="uq_profile_metric_rule_version"),
    )
    op.create_index("ix_profile_metric_rule_versions_metric_id", "profile_metric_rule_versions", ["metric_id"])


def downgrade() -> None:
    for table_name in (
        "profile_metric_rule_versions",
        "profile_metric_definitions",
        "customer_product_period_statuses",
        "product_definitions",
        "customer_fee_period_metrics",
        "customer_revenue_period_metrics",
        "customer_loan_period_metrics",
        "customer_deposit_period_metrics",
        "customer_representatives",
        "customer_branch_relationships",
    ):
        op.drop_table(table_name)

    op.drop_index("ix_cif_customers_data_quality_status", table_name="cif_customers")
    op.drop_index("ix_cif_customers_customer_segment_code", table_name="cif_customers")
    for column in (
        "data_quality_status",
        "customer_segment_code",
        "economic_sector_code",
        "occupation",
        "establishment_date",
        "gender_code",
        "birth_date",
    ):
        op.drop_column("cif_customers", column)
