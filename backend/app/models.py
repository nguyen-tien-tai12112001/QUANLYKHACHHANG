from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    files = relationship("ImportFile", back_populates="batch")

    __table_args__ = (UniqueConstraint("period_key", name="uq_import_batches_period_key"),)


class ImportFile(Base):
    __tablename__ = "import_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    period_start: Mapped[object | None] = mapped_column(Date)
    period_end: Mapped[object | None] = mapped_column(Date)
    business_date: Mapped[object | None] = mapped_column(Date, index=True)
    filename_suffix: Mapped[str | None] = mapped_column(String(255))
    frequency: Mapped[str | None] = mapped_column(String(30))
    content_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    file_ext: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("ImportBatch", back_populates="files")

    __table_args__ = (
        UniqueConstraint(
            "branch_code",
            "file_type",
            "period_key",
            "original_filename",
            name="uq_import_files_source",
        ),
    )


class CifImportBatch(Base):
    __tablename__ = "cif_import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    actual_format: Mapped[str] = mapped_column(String(20), default="xls", nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    sheet_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True, nullable=False)
    stage: Mapped[str | None] = mapped_column(String(255))
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warning_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_customers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_identifiers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_identifiers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unchanged_identifiers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    multi_branch_identifiers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    review_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conflict_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    format_warning: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(100), index=True)
    importer_version: Mapped[str | None] = mapped_column(String(30))
    column_stats: Mapped[dict | None] = mapped_column(JSON)
    comparison_summary: Mapped[dict | None] = mapped_column(JSON)
    stage_history: Mapped[list | None] = mapped_column(JSON)
    heartbeat_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (UniqueConstraint("content_sha256", name="uq_cif_import_batches_sha256"),)


class CifCustomer(Base):
    __tablename__ = "cif_customers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_core_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), index=True)
    customer_name_ascii: Mapped[str | None] = mapped_column(String(255))
    customer_type: Mapped[str | None] = mapped_column(String(100), index=True)
    customer_detail_type: Mapped[str | None] = mapped_column(String(100))
    registration_number: Mapped[str | None] = mapped_column(String(100), index=True)
    passport_number: Mapped[str | None] = mapped_column(String(100), index=True)
    tax_number: Mapped[str | None] = mapped_column(String(100), index=True)
    telephone: Mapped[str | None] = mapped_column(String(100))
    full_address: Mapped[str | None] = mapped_column(Text)
    nationality_code: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[object | None] = mapped_column(Date)
    gender_code: Mapped[str | None] = mapped_column(String(20))
    establishment_date: Mapped[object | None] = mapped_column(Date)
    occupation: Mapped[str | None] = mapped_column(String(255))
    economic_sector_code: Mapped[str | None] = mapped_column(String(50))
    customer_segment_code: Mapped[str | None] = mapped_column(String(50), index=True)
    data_quality_status: Mapped[str] = mapped_column(String(30), default="pending", index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True, nullable=False)
    branch_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    identifier_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("cif_import_batches.id"))
    last_import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("cif_import_batches.id"))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)


class CustomerBranchRelationship(Base):
    __tablename__ = "customer_branch_relationships"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), index=True, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    pgd_code: Mapped[str | None] = mapped_column(String(20), index=True)
    officer_user_id: Mapped[int | None] = mapped_column(ForeignKey("system_users.id"), index=True)
    officer_code: Mapped[str | None] = mapped_column(String(50), index=True)
    relationship_type: Mapped[str] = mapped_column(String(30), default="servicing", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    valid_from: Mapped[object] = mapped_column(Date, nullable=False)
    valid_to: Mapped[object | None] = mapped_column(Date)
    source_code: Mapped[str | None] = mapped_column(String(30))
    source_record_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "customer_id",
            "branch_code",
            "pgd_code",
            "valid_from",
            name="uq_customer_branch_relationship",
        ),
    )


class CustomerRepresentative(Base):
    __tablename__ = "customer_representatives"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), index=True, nullable=False)
    representative_name: Mapped[str] = mapped_column(String(255), nullable=False)
    identity_number: Mapped[str | None] = mapped_column(String(100), index=True)
    position: Mapped[str | None] = mapped_column(String(100))
    is_legal_representative: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    valid_from: Mapped[object | None] = mapped_column(Date)
    valid_to: Mapped[object | None] = mapped_column(Date)
    source_code: Mapped[str | None] = mapped_column(String(30))
    source_record_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomerDepositPeriodMetric(Base):
    __tablename__ = "customer_deposit_period_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), nullable=False)
    demand_deposit_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    demand_deposit_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    term_deposit_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    term_deposit_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    incoming_turnover: Mapped[object | None] = mapped_column(Numeric(24, 2))
    funding_ftp_income: Mapped[object | None] = mapped_column(Numeric(24, 2))
    last_transaction_date: Mapped[object | None] = mapped_column(Date)
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"))
    calculation_version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "customer_id", "branch_code", name="uq_customer_deposit_period_metric"),
        Index(
            "ix_customer_deposit_metrics_period_branch_customer",
            "period_key",
            "branch_code",
            "customer_id",
        ),
    )


class CustomerLoanPeriodMetric(Base):
    __tablename__ = "customer_loan_period_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), nullable=False)
    short_term_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    short_term_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    medium_long_term_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    medium_long_term_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    overdraft_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    overdraft_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    bad_debt_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    bad_debt_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    written_off_debt_eom: Mapped[object | None] = mapped_column(Numeric(24, 2))
    written_off_debt_average: Mapped[object | None] = mapped_column(Numeric(24, 2))
    general_provision_period: Mapped[object | None] = mapped_column(Numeric(24, 2))
    specific_provision_period: Mapped[object | None] = mapped_column(Numeric(24, 2))
    general_provision_accumulated: Mapped[object | None] = mapped_column(Numeric(24, 2))
    specific_provision_accumulated: Mapped[object | None] = mapped_column(Numeric(24, 2))
    loan_ftp_income: Mapped[object | None] = mapped_column(Numeric(24, 2))
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"))
    calculation_version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "customer_id", "branch_code", name="uq_customer_loan_period_metric"),
        Index(
            "ix_customer_loan_metrics_period_branch_customer",
            "period_key",
            "branch_code",
            "customer_id",
        ),
    )


class CustomerRevenuePeriodMetric(Base):
    __tablename__ = "customer_revenue_period_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), nullable=False)
    metric_code: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    quantity: Mapped[int | None] = mapped_column(Integer)
    source_code: Mapped[str | None] = mapped_column(String(30))
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"))
    calculation_version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "period_key", "customer_id", "branch_code", "metric_code",
            name="uq_customer_revenue_period_metric",
        ),
        Index(
            "ix_customer_revenue_metrics_period_code",
            "period_key",
            "metric_code",
            "branch_code",
        ),
    )


class CustomerFeePeriodMetric(Base):
    __tablename__ = "customer_fee_period_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), nullable=False)
    fee_code: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    transaction_count: Mapped[int | None] = mapped_column(Integer)
    source_code: Mapped[str | None] = mapped_column(String(30))
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"))
    calculation_version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "period_key", "customer_id", "branch_code", "fee_code",
            name="uq_customer_fee_period_metric",
        ),
        Index(
            "ix_customer_fee_metrics_period_code",
            "period_key",
            "fee_code",
            "branch_code",
        ),
    )


class ProductDefinition(Base):
    __tablename__ = "product_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_group: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    source_code: Mapped[str | None] = mapped_column(String(30))
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomerProductPeriodStatus(Base):
    __tablename__ = "customer_product_period_statuses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("product_definitions.id"), nullable=False)
    is_active: Mapped[bool | None] = mapped_column(Boolean)
    quantity: Mapped[int | None] = mapped_column(Integer)
    activated_at: Mapped[object | None] = mapped_column(Date)
    deactivated_at: Mapped[object | None] = mapped_column(Date)
    source_code: Mapped[str | None] = mapped_column(String(30))
    source_record_id: Mapped[int | None] = mapped_column(BigInteger)
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "period_key", "customer_id", "branch_code", "product_id",
            name="uq_customer_product_period_status",
        ),
        Index(
            "ix_customer_product_status_period_product",
            "period_key",
            "product_id",
            "is_active",
        ),
        Index(
            "ix_customer_product_status_period_branch_customer",
            "period_key",
            "branch_code",
            "customer_id",
        ),
    )


class ProfileMetricDefinition(Base):
    __tablename__ = "profile_metric_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    metric_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    metric_name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(30))
    aggregation_type: Mapped[str | None] = mapped_column(String(30))
    default_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProfileMetricRuleVersion(Base):
    __tablename__ = "profile_metric_rule_versions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    metric_id: Mapped[int] = mapped_column(ForeignKey("profile_metric_definitions.id"), index=True, nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    source_codes: Mapped[list | None] = mapped_column(JSON)
    source_columns: Mapped[list | None] = mapped_column(JSON)
    join_rule: Mapped[str | None] = mapped_column(Text)
    filter_rule: Mapped[str | None] = mapped_column(Text)
    calculation_sql: Mapped[str | None] = mapped_column(Text)
    reconciliation_rule: Mapped[str | None] = mapped_column(Text)
    valid_from_period: Mapped[str | None] = mapped_column(String(8))
    valid_to_period: Mapped[str | None] = mapped_column(String(8))
    approval_status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("system_users.id"))
    approved_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("metric_id", "version_no", name="uq_profile_metric_rule_version"),
    )


class CifCustomerIdentifier(Base):
    __tablename__ = "cif_customer_identifiers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("cif_customers.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("cif_import_batches.id"), index=True, nullable=False)
    full_cif_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    customer_core_code: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_name_ascii: Mapped[str | None] = mapped_column(String(255))
    short_name: Mapped[str | None] = mapped_column(String(255))
    customer_type: Mapped[str | None] = mapped_column(String(100))
    customer_detail_type: Mapped[str | None] = mapped_column(String(100))
    registration_number: Mapped[str | None] = mapped_column(String(100), index=True)
    passport_number: Mapped[str | None] = mapped_column(String(100), index=True)
    driver_license_number: Mapped[str | None] = mapped_column(String(100))
    tax_number: Mapped[str | None] = mapped_column(String(100), index=True)
    telephone: Mapped[str | None] = mapped_column(String(100))
    address_type: Mapped[str | None] = mapped_column(String(100))
    full_address: Mapped[str | None] = mapped_column(Text)
    province: Mapped[str | None] = mapped_column(String(100))
    district: Mapped[str | None] = mapped_column(String(100))
    commune_ward: Mapped[str | None] = mapped_column(String(100))
    nationality_code: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[object | None] = mapped_column(Date)
    gender_code: Mapped[str | None] = mapped_column(String(20))
    establishment_date: Mapped[object | None] = mapped_column(Date)
    occupation: Mapped[str | None] = mapped_column(String(255))
    source_status: Mapped[str | None] = mapped_column(String(100))
    normalized_status: Mapped[str] = mapped_column(String(30), default="active", index=True, nullable=False)
    operator_user: Mapped[str | None] = mapped_column(String(100))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    imported_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CifSourceRecord(Base):
    __tablename__ = "cif_source_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("cif_import_batches.id"), index=True, nullable=False)
    source_sheet: Mapped[str | None] = mapped_column(String(255))
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    full_cif_code: Mapped[str | None] = mapped_column(String(32), index=True)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_core_code: Mapped[str | None] = mapped_column(String(32), index=True)
    row_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    validation_status: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    duplicate_of_row_number: Mapped[int | None] = mapped_column(Integer)
    comparison_status: Mapped[str | None] = mapped_column(String(30), index=True)
    changed_fields: Mapped[dict | None] = mapped_column(JSON)
    current_snapshot: Mapped[dict | None] = mapped_column(JSON)
    review_status: Mapped[str | None] = mapped_column(String(30), index=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(100))
    reviewed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)
    raw_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    imported_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("import_batch_id", "source_sheet", "source_row_number", name="uq_cif_source_row"),
    )


class CifImportError(Base):
    __tablename__ = "cif_import_errors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("cif_import_batches.id"), index=True, nullable=False)
    source_row_number: Mapped[int | None] = mapped_column(Integer)
    full_cif_code: Mapped[str | None] = mapped_column(String(32), index=True)
    severity: Mapped[str] = mapped_column(String(20), default="warning", index=True, nullable=False)
    error_code: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(100))
    raw_value: Mapped[str | None] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CifIdentityConflict(Base):
    __tablename__ = "cif_identity_conflicts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("cif_import_batches.id"), index=True)
    conflict_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    identity_value: Mapped[str | None] = mapped_column(String(255), index=True)
    customer_ids: Mapped[list | None] = mapped_column(JSON)
    full_cif_codes: Mapped[list | None] = mapped_column(JSON)
    details: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True, nullable=False)
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(String(100))
    resolved_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class CifChangeAudit(Base):
    __tablename__ = "cif_change_audits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_record_id: Mapped[int | None] = mapped_column(ForeignKey("cif_source_records.id"), index=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("cif_import_batches.id"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("cif_customers.id"), index=True)
    full_cif_code: Mapped[str | None] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    before_data: Mapped[dict | None] = mapped_column(JSON)
    after_data: Mapped[dict | None] = mapped_column(JSON)
    changed_fields: Mapped[dict | None] = mapped_column(JSON)
    performed_by: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    performed_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class CifGoldenRule(Base):
    __tablename__ = "cif_golden_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_field: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    source_columns: Mapped[list] = mapped_column(JSON, nullable=False)
    strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    priority_order: Mapped[list | None] = mapped_column(JSON)
    requires_review_on_conflict: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[str | None] = mapped_column(String(100))
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ma_kh_chuan: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    ma_cn: Mapped[str | None] = mapped_column(String(10), index=True)
    ma_kh: Mapped[str | None] = mapped_column(String(32), index=True)
    ten_kh: Mapped[str | None] = mapped_column(String(255), index=True)
    id_number: Mapped[str | None] = mapped_column(String(50))
    birth_date: Mapped[object | None] = mapped_column(Date)
    sex_type: Mapped[str | None] = mapped_column(String(20))
    telephone: Mapped[str | None] = mapped_column(String(50))
    first_seen_period: Mapped[str | None] = mapped_column(String(8))
    last_seen_period: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DP01DepositAccount(Base):
    __tablename__ = "dp01_deposit_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(32), index=True)
    ma_cn: Mapped[str | None] = mapped_column(String(10), index=True)
    ma_kh: Mapped[str | None] = mapped_column(String(32), index=True)
    ten_kh: Mapped[str | None] = mapped_column(String(255))
    dp_type_name: Mapped[str | None] = mapped_column(String(255))
    ccy: Mapped[str | None] = mapped_column(String(10))
    current_balance: Mapped[object | None] = mapped_column(Numeric(20, 2))
    so_tai_khoan: Mapped[str | None] = mapped_column(String(50), index=True)
    opening_date: Mapped[object | None] = mapped_column(Date)
    maturity_date: Mapped[object | None] = mapped_column(Date)
    month_term: Mapped[str | None] = mapped_column(String(20))
    ma_pgd: Mapped[str | None] = mapped_column(String(20), index=True)
    ten_pgd: Mapped[str | None] = mapped_column(String(255))
    dp_type_code: Mapped[str | None] = mapped_column(String(20))
    cust_type: Mapped[str | None] = mapped_column(String(20))
    cust_type_name: Mapped[str | None] = mapped_column(String(100))
    id_number: Mapped[str | None] = mapped_column(String(50))
    sex_type: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[object | None] = mapped_column(Date)
    telephone: Mapped[str | None] = mapped_column(String(50))
    dramt: Mapped[object | None] = mapped_column(Numeric(20, 2))
    cramt: Mapped[object | None] = mapped_column(Numeric(20, 2))
    employee_number: Mapped[str | None] = mapped_column(String(50))
    employee_name: Mapped[str | None] = mapped_column(String(255))
    tygia: Mapped[object | None] = mapped_column(Numeric(18, 6))
    rate: Mapped[object | None] = mapped_column(Numeric(18, 8))
    account_status: Mapped[str | None] = mapped_column(String(30), index=True)
    close_date: Mapped[object | None] = mapped_column(Date)
    renewal_date: Mapped[object | None] = mapped_column(Date)
    auto_renewal: Mapped[str | None] = mapped_column(String(20))
    special_rate: Mapped[str | None] = mapped_column(String(20))
    accrual_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CN05CustomerService(Base):
    __tablename__ = "cn05_customer_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(32), index=True)
    ma_cn: Mapped[str | None] = mapped_column(String(10), index=True)
    ma_kh: Mapped[str | None] = mapped_column(String(32), index=True)
    ten_kh: Mapped[str | None] = mapped_column(String(255))
    tktt_so_tk: Mapped[int | None] = mapped_column(Integer)
    tktt_tk_sodep: Mapped[int | None] = mapped_column(Integer)
    tk_osb: Mapped[int | None] = mapped_column(Integer)
    tg_tien_gui_loi_thong_minh: Mapped[int | None] = mapped_column(Integer)
    tg_tien_gui_truc_tuyen: Mapped[int | None] = mapped_column(Integer)
    tg_tien_gui_tai_quay: Mapped[int | None] = mapped_column(Integer)
    tg_sms_tien_gui: Mapped[int | None] = mapped_column(Integer)
    vv_tong_so_lds: Mapped[int | None] = mapped_column(Integer)
    vv_sms_tien_vay: Mapped[int | None] = mapped_column(Integer)
    vv_tong_so_lds_centercut: Mapped[int | None] = mapped_column(Integer)
    the_ghi_no_noi_dia: Mapped[int | None] = mapped_column(Integer)
    the_ghi_no_quoc_te: Mapped[int | None] = mapped_column(Integer)
    the_tin_dung_noi_dia: Mapped[int | None] = mapped_column(Integer)
    the_tin_dung_quoc_te: Mapped[int | None] = mapped_column(Integer)
    visa: Mapped[int | None] = mapped_column(Integer)
    master: Mapped[int | None] = mapped_column(Integer)
    jcb: Mapped[int | None] = mapped_column(Integer)
    dk_agribank_plus: Mapped[int | None] = mapped_column(Integer)
    dk_agribank_plus_ott: Mapped[int | None] = mapped_column(Integer)
    sms_banking: Mapped[int | None] = mapped_column(Integer)
    tien_vay: Mapped[int | None] = mapped_column(Integer)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LN01Loan(Base):
    __tablename__ = "ln01_loans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(32), index=True)
    brcd: Mapped[str | None] = mapped_column(String(10), index=True)
    custseq: Mapped[str | None] = mapped_column(String(32), index=True)
    custnm: Mapped[str | None] = mapped_column(String(255))
    ccy: Mapped[str | None] = mapped_column(String(10))
    du_no: Mapped[object | None] = mapped_column(Numeric(20, 2))
    dsbsseq: Mapped[str | None] = mapped_column(String(100), index=True)
    transaction_date: Mapped[object | None] = mapped_column(Date)
    interest_rate: Mapped[object | None] = mapped_column(Numeric(18, 6))
    apprseq: Mapped[str | None] = mapped_column(String(100))
    loan_type: Mapped[str | None] = mapped_column(String(255))
    officer_id: Mapped[str | None] = mapped_column(String(50))
    officer_name: Mapped[str | None] = mapped_column(String(255))
    trctcd: Mapped[str | None] = mapped_column(String(50))
    trctnm: Mapped[str | None] = mapped_column(String(255))
    accrual_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    accrual_amount_end_of_month: Mapped[object | None] = mapped_column(Numeric(20, 2))
    ty_gia: Mapped[object | None] = mapped_column(Numeric(18, 6))
    officer_ipcas: Mapped[str | None] = mapped_column(String(50))
    disbursement_date: Mapped[object | None] = mapped_column(Date)
    disbursement_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    disbursement_maturity_date: Mapped[object | None] = mapped_column(Date)
    repayment_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    next_repayment_date: Mapped[object | None] = mapped_column(Date, index=True)
    next_repayment_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    next_interest_repayment_date: Mapped[object | None] = mapped_column(Date, index=True)
    interest_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    pastdue_interest_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    total_interest_repayment_amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    last_repayment_date: Mapped[object | None] = mapped_column(Date)
    debt_group: Mapped[str | None] = mapped_column(String(20), index=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PF14AccountBalance(Base):
    __tablename__ = "pf14_account_balances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(32), index=True)
    trbrcd: Mapped[str | None] = mapped_column(String(10), index=True)
    productcode: Mapped[str | None] = mapped_column(String(50))
    accountno: Mapped[str | None] = mapped_column(String(50), index=True)
    custseq: Mapped[str | None] = mapped_column(String(32), index=True)
    custname: Mapped[str | None] = mapped_column(String(255))
    averagebalance: Mapped[object | None] = mapped_column(Numeric(20, 2))
    monthlyendbalance: Mapped[object | None] = mapped_column(Numeric(20, 2))
    operationalfunds: Mapped[object | None] = mapped_column(Numeric(20, 2))
    monterm: Mapped[int | None] = mapped_column(Integer)
    ccy: Mapped[str | None] = mapped_column(String(10))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PF10LoanProfitability(Base):
    __tablename__ = "pf10_loan_profitability"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    report_month: Mapped[str | None] = mapped_column(String(6), index=True)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(32), index=True)
    account_number: Mapped[str | None] = mapped_column(String(50), index=True)
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    loan_type: Mapped[str | None] = mapped_column(String(30), index=True)
    balance_sheet_account_code: Mapped[str | None] = mapped_column(String(100))
    average_balance: Mapped[object | None] = mapped_column(Numeric(24, 6))
    end_of_month_balance: Mapped[object | None] = mapped_column(Numeric(24, 6))
    month_term: Mapped[int | None] = mapped_column(Integer)
    opening_date: Mapped[object | None] = mapped_column(Date)
    maturity_date: Mapped[object | None] = mapped_column(Date)
    closing_date: Mapped[object | None] = mapped_column(Date)
    contract_rate: Mapped[object | None] = mapped_column(Numeric(18, 8))
    monthly_total_interest: Mapped[object | None] = mapped_column(Numeric(24, 6))
    book_correction_interest: Mapped[object | None] = mapped_column(Numeric(24, 6))
    accruals: Mapped[object | None] = mapped_column(Numeric(24, 6))
    interest_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    ratio: Mapped[object | None] = mapped_column(Numeric(18, 8))
    currency_code: Mapped[str | None] = mapped_column(String(10))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BC06CustomerClassification(Base):
    __tablename__ = "bc06_customer_classifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    branch_name: Mapped[str | None] = mapped_column(String(255))
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_type: Mapped[str | None] = mapped_column(String(30))
    classification_month: Mapped[str | None] = mapped_column(String(6), index=True)
    deposit_benefit_branch: Mapped[object | None] = mapped_column(Numeric(24, 6))
    loan_benefit_branch: Mapped[object | None] = mapped_column(Numeric(24, 6))
    service_benefit_branch: Mapped[object | None] = mapped_column(Numeric(24, 6))
    term_deposit_avg_branch: Mapped[object | None] = mapped_column(Numeric(24, 6))
    demand_deposit_avg_branch: Mapped[object | None] = mapped_column(Numeric(24, 6))
    loan_avg_balance: Mapped[object | None] = mapped_column(Numeric(24, 6))
    benefit_score_branch: Mapped[object | None] = mapped_column(Numeric(14, 2))
    balance_score_branch: Mapped[object | None] = mapped_column(Numeric(14, 2))
    qualitative_score_branch: Mapped[object | None] = mapped_column(Numeric(14, 2))
    customer_score_branch: Mapped[object | None] = mapped_column(Numeric(14, 2))
    additional_criteria_branch: Mapped[str | None] = mapped_column(String(100))
    segment_branch: Mapped[str | None] = mapped_column(String(100))
    rank_branch: Mapped[str | None] = mapped_column(String(100))
    market_segment_branch: Mapped[str | None] = mapped_column(String(100))
    market_rank_branch: Mapped[str | None] = mapped_column(String(100))
    additional_criteria_system: Mapped[str | None] = mapped_column(String(100))
    segment_system: Mapped[str | None] = mapped_column(String(100))
    rank_system: Mapped[str | None] = mapped_column(String(100))
    market_segment_system: Mapped[str | None] = mapped_column(String(100))
    market_rank_system: Mapped[str | None] = mapped_column(String(100))
    adjustment_unit: Mapped[str | None] = mapped_column(String(255))
    managing_unit: Mapped[str | None] = mapped_column(String(255))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BC29CustomerCreditRisk(Base):
    __tablename__ = "bc29_customer_credit_risks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    debt_group: Mapped[str | None] = mapped_column(String(10), index=True)
    total_outstanding: Mapped[object | None] = mapped_column(Numeric(24, 2))
    provision_base_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    period_provision_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    classification: Mapped[str | None] = mapped_column(String(20))
    total_collateral_deductible_value: Mapped[object | None] = mapped_column(Numeric(24, 2))
    total_collateral_value: Mapped[object | None] = mapped_column(Numeric(24, 2))
    real_estate_collateral: Mapped[object | None] = mapped_column(Numeric(24, 2))
    movable_asset_collateral: Mapped[object | None] = mapped_column(Numeric(24, 2))
    valuable_paper_collateral: Mapped[object | None] = mapped_column(Numeric(24, 2))
    other_collateral: Mapped[object | None] = mapped_column(Numeric(24, 2))
    principal_overdue_days: Mapped[int | None] = mapped_column(Integer)
    interest_overdue_days: Mapped[int | None] = mapped_column(Integer)
    risk_handling_date: Mapped[object | None] = mapped_column(Date)
    accrued_interest: Mapped[object | None] = mapped_column(Numeric(24, 2))
    off_balance_outstanding: Mapped[object | None] = mapped_column(Numeric(24, 2))
    credit_outstanding: Mapped[object | None] = mapped_column(Numeric(24, 2))
    overdraft_outstanding: Mapped[object | None] = mapped_column(Numeric(24, 2))
    handled_risk_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    employee_code: Mapped[str | None] = mapped_column(String(50))
    employee_unit: Mapped[str | None] = mapped_column(String(255))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KH02CustomerTransaction(Base):
    __tablename__ = "kh02_customer_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    transaction_date: Mapped[object | None] = mapped_column(Date, index=True)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    transaction_user: Mapped[str | None] = mapped_column(String(50))
    daily_sequence: Mapped[str | None] = mapped_column(String(30))
    daily_transaction_sequence: Mapped[str | None] = mapped_column(String(30))
    account_code: Mapped[str | None] = mapped_column(String(30), index=True)
    business_code: Mapped[str | None] = mapped_column(String(20))
    unit_business_code: Mapped[str | None] = mapped_column(String(20))
    transaction_code: Mapped[str | None] = mapped_column(String(30))
    transaction_reference_type: Mapped[str | None] = mapped_column(String(30))
    transaction_sequence: Mapped[str | None] = mapped_column(String(100))
    transaction_counterparty_code: Mapped[str | None] = mapped_column(String(50))
    credit_officer_code: Mapped[str | None] = mapped_column(String(50))
    debit_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    credit_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    source_row_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RR01HandledRiskLoan(Base):
    __tablename__ = "rr01_handled_risk_loans"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    lds_number: Mapped[str | None] = mapped_column(String(100), index=True)
    lav_number: Mapped[str | None] = mapped_column(String(100), index=True)
    currency_code: Mapped[str | None] = mapped_column(String(10))
    customer_type: Mapped[str | None] = mapped_column(String(30))
    disbursement_date: Mapped[object | None] = mapped_column(Date)
    maturity_date: Mapped[object | None] = mapped_column(Date)
    vamc_flag: Mapped[str | None] = mapped_column(String(10))
    risk_handling_date: Mapped[object | None] = mapped_column(Date)
    original_principal: Mapped[object | None] = mapped_column(Numeric(24, 6))
    original_accrued_interest: Mapped[object | None] = mapped_column(Numeric(24, 6))
    recovered_principal_before_period: Mapped[object | None] = mapped_column(Numeric(24, 6))
    current_principal: Mapped[object | None] = mapped_column(Numeric(24, 6))
    current_interest: Mapped[object | None] = mapped_column(Numeric(24, 6))
    short_term_principal: Mapped[object | None] = mapped_column(Numeric(24, 6))
    medium_term_principal: Mapped[object | None] = mapped_column(Numeric(24, 6))
    long_term_principal: Mapped[object | None] = mapped_column(Numeric(24, 6))
    recovered_principal_period: Mapped[object | None] = mapped_column(Numeric(24, 6))
    recovered_interest_period: Mapped[object | None] = mapped_column(Numeric(24, 6))
    real_estate_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    movable_asset_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    other_asset_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GL02LedgerTransaction(Base):
    __tablename__ = "gl02_ledger_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    transaction_date: Mapped[object | None] = mapped_column(Date, index=True)
    transaction_branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    user_id: Mapped[str | None] = mapped_column(String(50))
    journal_sequence: Mapped[str | None] = mapped_column(String(30))
    daily_transaction_sequence: Mapped[str | None] = mapped_column(String(30))
    account_code: Mapped[str | None] = mapped_column(String(30), index=True)
    currency_code: Mapped[str | None] = mapped_column(String(10))
    business_code: Mapped[str | None] = mapped_column(String(20))
    unit_code: Mapped[str | None] = mapped_column(String(20))
    transaction_code: Mapped[str | None] = mapped_column(String(30))
    transaction_type: Mapped[str | None] = mapped_column(String(30), index=True)
    # Chỉ lưu để truy vết giao dịch; không lập chỉ mục riêng vì C360 không lọc
    # theo trường này và chỉ mục trên hơn chục triệu dòng chiếm hàng trăm MB.
    reference: Mapped[str | None] = mapped_column(String(100))
    remark: Mapped[str | None] = mapped_column(Text)
    debit_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    credit_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    created_datetime: Mapped[object | None] = mapped_column(DateTime)
    # Hash được giữ nguyên trong dữ liệu nguồn để kiểm tra khi cần. Quy trình
    # import hiện không tra cứu trực tiếp theo hash nên không tạo index 1,6 GB.
    source_row_hash: Mapped[str | None] = mapped_column(String(64))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FTPLNDailyLoanFTP(Base):
    __tablename__ = "ftpln_daily_loan_ftp"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_file_id: Mapped[int] = mapped_column(ForeignKey("import_files.id"), index=True, nullable=False)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    business_date: Mapped[object | None] = mapped_column(Date, index=True)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    parent_branch_code: Mapped[str | None] = mapped_column(String(10))
    business_code: Mapped[str | None] = mapped_column(String(20))
    unit_business_code: Mapped[str | None] = mapped_column(String(20))
    credit_contract_number: Mapped[str | None] = mapped_column(String(100))
    transaction_reference: Mapped[str | None] = mapped_column(String(50))
    transaction_sequence: Mapped[str | None] = mapped_column(String(100), index=True)
    reference_number: Mapped[str | None] = mapped_column(String(100))
    account_code: Mapped[str | None] = mapped_column(String(30))
    ftp_code: Mapped[str | None] = mapped_column(String(30))
    customer_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_type: Mapped[str | None] = mapped_column(String(30))
    term_type_code: Mapped[str | None] = mapped_column(String(100))
    customer_segment: Mapped[str | None] = mapped_column(String(30))
    ftp_rate: Mapped[object | None] = mapped_column(Numeric(18, 8))
    interest_rate: Mapped[object | None] = mapped_column(Numeric(18, 8))
    ftp_adjustment: Mapped[object | None] = mapped_column(Numeric(18, 8))
    opening_date: Mapped[object | None] = mapped_column(Date)
    maturity_date: Mapped[object | None] = mapped_column(Date)
    currency_code: Mapped[str | None] = mapped_column(String(10))
    ledger_balance: Mapped[object | None] = mapped_column(Numeric(24, 6))
    capital_price_amount: Mapped[object | None] = mapped_column(Numeric(24, 6))
    accumulated_capital_price: Mapped[object | None] = mapped_column(Numeric(24, 6))
    economic_sector_code: Mapped[str | None] = mapped_column(String(30))
    udp_code: Mapped[str | None] = mapped_column(String(50))
    transaction_counterparty_code: Mapped[str | None] = mapped_column(String(50))
    credit_officer_code: Mapped[str | None] = mapped_column(String(50))
    final_acquisition_code: Mapped[str | None] = mapped_column(String(30))
    final_rank: Mapped[str | None] = mapped_column(String(30))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerPeriodSummary(Base):
    __tablename__ = "customer_period_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    ma_kh_chuan: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    ma_cn: Mapped[str | None] = mapped_column(String(10), index=True)
    ma_pgd: Mapped[str | None] = mapped_column(String(20), index=True)
    ma_kh: Mapped[str | None] = mapped_column(String(32), index=True)
    ten_kh: Mapped[str | None] = mapped_column(String(255), index=True)
    loai_khach_hang: Mapped[str | None] = mapped_column(String(100))
    so_du_tien_vay: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    so_du_tien_gui_ckh: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    loai_vay: Mapped[str | None] = mapped_column(String(255))
    doanh_so_chuyen_tien_ve_tai_khoan: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    so_du_tgtt_binh_quan: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    thau_chi: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tk_so_dep: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    agribank_plus: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tin_nhan_ott: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    e_banking: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_nhac_no_vay: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_tien_gui: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_ghi_no_noi_dia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_quoc_te: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_loc_viet: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tt_tien_dien: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tt_tien_nuoc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tt_cuoc_vien_thong: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tra_luong_qua_the: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    batd: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    batk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bh_oto_xe_may: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bh_khac: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bao_lanh: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loa_bien_dong_so_du: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phan_mem_ban_hang: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chi_tra_kieu_hoi: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phat_hanh_lc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thanh_toan_quoc_te: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mua_ban_ngoai_te: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tong_loi_ich_thang: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    ma_cb: Mapped[str | None] = mapped_column(String(50))
    ten_can_bo: Mapped[str | None] = mapped_column(String(255))
    telephone: Mapped[str | None] = mapped_column(String(50))
    ghi_chu: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "ma_kh_chuan", name="uq_customer_period_summary"),
    )


class ReportSourceStatus(Base):
    __tablename__ = "report_source_statuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object | None] = mapped_column(Date)
    source_code: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_table: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="missing", index=True, nullable=False)
    file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    mapped_fields: Mapped[dict | None] = mapped_column(JSON)
    message: Mapped[str | None] = mapped_column(Text)
    built_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "source_code", name="uq_report_source_status_period_source"),
    )


class CustomerProcessingJob(Base):
    __tablename__ = "customer_processing_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True, nullable=False)
    stage: Mapped[str | None] = mapped_column(String(255))
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    required_file_count: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    available_required_file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    optional_file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_customers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_customers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomerPeriodProfile(Base):
    __tablename__ = "customer_period_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("cif_customers.id"), index=True)
    ma_kh: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    ten_kh: Mapped[str | None] = mapped_column(String(255), index=True)
    loai_khach_hang: Mapped[str | None] = mapped_column(String(100))
    ten_chu_doanh_nghiep: Mapped[str | None] = mapped_column(String(255))
    so_cccd: Mapped[str | None] = mapped_column(String(100), index=True)
    ma_so_thue: Mapped[str | None] = mapped_column(String(100), index=True)
    ngay_thanh_lap: Mapped[object | None] = mapped_column(Date)
    dia_chi: Mapped[str | None] = mapped_column(Text)
    gioi_tinh: Mapped[str | None] = mapped_column(String(20))
    ngay_sinh: Mapped[object | None] = mapped_column(Date)
    nghe_nghiep: Mapped[str | None] = mapped_column(String(255))
    management_source: Mapped[str | None] = mapped_column(String(30), index=True)
    managing_branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    managing_department_code: Mapped[str | None] = mapped_column(String(20))
    managing_department_name: Mapped[str | None] = mapped_column(String(255))
    branch_codes: Mapped[str | None] = mapped_column(Text)
    pgd_codes: Mapped[str | None] = mapped_column(Text)
    branch_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pgd_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dp_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    so_du_tien_gui: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    doanh_so_chuyen_tien_ve_tk: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    last_tktt_transaction_at: Mapped[object | None] = mapped_column(DateTime)
    tktt_inactive_days: Mapped[int | None] = mapped_column(Integer)
    tktt_activity_status: Mapped[str | None] = mapped_column(String(30))
    so_du_tien_vay: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    du_no_ngan_han: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_ngan_han_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_trung_dai_han: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_trung_dai_han_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_thau_chi: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_thau_chi_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_lds_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phi_bao_lanh: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_chuyen_tien: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_nhdt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    abic_batd: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_kdnt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_lc: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_ttqt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    ttqt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dprr_chung_tt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_chung_lk: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_cuthe_tt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_cuthe_lk: Mapped[object | None] = mapped_column(Numeric(24, 2))
    du_no_xlrr: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    ds_thu_no_xlrr: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_interest: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_accruals: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_book_correction_interest: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    loai_vay: Mapped[str | None] = mapped_column(String(100))
    so_du_tgtt_binh_quan: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    thau_chi: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tk_so_dep: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    agribank_plus: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tin_nhan_ott: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    e_banking: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_nhac_no_vay: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_tien_gui: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_ghi_no_noi_dia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_noi_dia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_quoc_te: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_loc_viet: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bao_lanh: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loa_bien_dong_so_du: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phat_hanh_lc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_dien: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_nuoc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_dt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hkd_tk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hkd_account_numbers: Mapped[str | None] = mapped_column(Text)
    abic_batk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    abic_bathe: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ma_cb: Mapped[str | None] = mapped_column(String(50))
    ten_can_bo: Mapped[str | None] = mapped_column(String(255))
    officer_employee_code: Mapped[str | None] = mapped_column(String(50))
    telephone: Mapped[str | None] = mapped_column(String(50))
    primary_branch_code: Mapped[str | None] = mapped_column(String(10))
    primary_pgd_code: Mapped[str | None] = mapped_column(String(20))
    primary_pgd_name: Mapped[str | None] = mapped_column(String(255))
    primary_location_score: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    primary_location_reason: Mapped[str | None] = mapped_column(Text)
    branch_details: Mapped[dict | None] = mapped_column(JSON)
    processing_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"), index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "ma_kh", name="uq_customer_period_profile"),
    )


class CustomerPeriodBranchDetail(Base):
    __tablename__ = "customer_period_branch_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    period_date: Mapped[object] = mapped_column(Date, nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("cif_customers.id"), index=True)
    ma_kh: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    branch_code: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    ma_pgd: Mapped[str | None] = mapped_column(String(20), index=True)
    ten_pgd: Mapped[str | None] = mapped_column(String(255))
    ten_kh: Mapped[str | None] = mapped_column(String(255))
    loai_khach_hang: Mapped[str | None] = mapped_column(String(100))
    dp_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    so_du_tien_gui: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    doanh_so_cramt: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    doanh_so_dramt: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    so_du_tien_vay: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    du_no_ngan_han: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_ngan_han_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_trung_dai_han: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_trung_dai_han_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_thau_chi: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    du_no_thau_chi_bq: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_lds_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pf10_interest: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_accruals: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    pf10_book_correction_interest: Mapped[object | None] = mapped_column(Numeric(24, 6), default=0)
    phi_bao_lanh: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_chuyen_tien: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_nhdt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    abic_batd: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_kdnt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_lc: Mapped[object | None] = mapped_column(Numeric(24, 2))
    phi_ttqt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    ttqt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dprr_chung_tt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_chung_lk: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_cuthe_tt: Mapped[object | None] = mapped_column(Numeric(24, 2))
    dprr_cuthe_lk: Mapped[object | None] = mapped_column(Numeric(24, 2))
    loai_vay: Mapped[str | None] = mapped_column(String(100))
    so_du_tgtt_binh_quan: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    thau_chi: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tk_so_dep: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    agribank_plus: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tin_nhan_ott: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    e_banking: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_nhac_no_vay: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sms_tien_gui: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_ghi_no_noi_dia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_noi_dia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_quoc_te: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    the_td_loc_viet: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bao_lanh: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loa_bien_dong_so_du: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phat_hanh_lc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_dien: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_nuoc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thuho_dt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hkd_tk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hkd_account_numbers: Mapped[str | None] = mapped_column(Text)
    abic_batk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    abic_bathe: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ma_cb: Mapped[str | None] = mapped_column(String(50))
    ten_can_bo: Mapped[str | None] = mapped_column(String(255))
    officer_employee_code: Mapped[str | None] = mapped_column(String(50))
    processing_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"), index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "ma_kh", "branch_code", "ma_pgd", name="uq_customer_period_branch_detail"),
    )


class CustomerSourceReconciliation(Base):
    __tablename__ = "customer_source_reconciliations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    processing_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"), index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    customer_core_code: Mapped[str | None] = mapped_column(String(32), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    source_row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source_amount: Mapped[object | None] = mapped_column(Numeric(24, 2))
    reason_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON)
    reviewed_by: Mapped[str | None] = mapped_column(String(100))
    reviewed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint("processing_job_id", "source_type", "branch_code", "customer_core_code", "reason_code", name="uq_customer_source_reconciliation"),
    )


class CustomerProcessingOptionalFile(Base):
    __tablename__ = "customer_processing_optional_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_ext: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="uploaded", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class SupplementalBaoLanhRecord(Base):
    __tablename__ = "supplemental_bao_lanh_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    optional_file_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_optional_files.id"), index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    ma_kh: Mapped[str | None] = mapped_column(String(32), index=True)
    ma_kh_chuan: Mapped[str | None] = mapped_column(String(48), index=True)
    ten_kh: Mapped[str | None] = mapped_column(String(255))
    tai_khoan: Mapped[str | None] = mapped_column(String(80), index=True)
    so_hdbl: Mapped[str | None] = mapped_column(String(120))
    ngay_bd: Mapped[object | None] = mapped_column(Date)
    ngay_het_hl: Mapped[object | None] = mapped_column(Date)
    loai_bllc: Mapped[str | None] = mapped_column(String(30), index=True)
    tien_te: Mapped[str | None] = mapped_column(String(10))
    nguyen_te: Mapped[object | None] = mapped_column(Numeric(20, 2))
    ty_gia: Mapped[object | None] = mapped_column(Numeric(18, 6))
    vnd: Mapped[object | None] = mapped_column(Numeric(20, 2))
    so_tien: Mapped[object | None] = mapped_column(Numeric(20, 2))
    is_bao_lanh: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_lc: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupplementalOABRecord(Base):
    __tablename__ = "supplemental_oab_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    optional_file_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_optional_files.id"), index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    branch_name: Mapped[str | None] = mapped_column(String(255))
    provider: Mapped[str | None] = mapped_column(String(255))
    ten_kh: Mapped[str | None] = mapped_column(String(255), index=True)
    tk_ao: Mapped[str | None] = mapped_column(String(100), index=True)
    tk_agribank: Mapped[str | None] = mapped_column(String(100), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    id_number: Mapped[str | None] = mapped_column(String(80), index=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BusinessMatchingRule(Base):
    __tablename__ = "business_matching_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    service_codes: Mapped[list | None] = mapped_column(JSON)
    amount_equals: Mapped[object | None] = mapped_column(Numeric(20, 2))
    effective_from: Mapped[object | None] = mapped_column(Date)
    effective_to: Mapped[object | None] = mapped_column(Date)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SystemConfigurationEntry(Base):
    __tablename__ = "system_configuration_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    config_code: Mapped[str] = mapped_column(String(100), nullable=False)
    config_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(50))
    config_value: Mapped[dict] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    effective_from: Mapped[object | None] = mapped_column(Date)
    effective_to: Mapped[object | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SupplementalBillPaymentTransaction(Base):
    __tablename__ = "supplemental_billpayment_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    optional_file_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_optional_files.id"), index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(100), nullable=False)
    transaction_status: Mapped[str | None] = mapped_column(String(255))
    transaction_datetime: Mapped[object | None] = mapped_column(DateTime, index=True)
    biller_customer_code: Mapped[str | None] = mapped_column(String(100))
    customer_name: Mapped[str | None] = mapped_column(String(255))
    debit_account: Mapped[str | None] = mapped_column(String(120), index=True)
    amount: Mapped[object | None] = mapped_column(Numeric(20, 2))
    content: Mapped[str | None] = mapped_column(Text)
    branch_code: Mapped[str | None] = mapped_column(String(10), index=True)
    lead_bank_code: Mapped[str | None] = mapped_column(String(20))
    service_code: Mapped[str | None] = mapped_column(String(30), index=True)
    provider_code: Mapped[str | None] = mapped_column(String(50))
    user_id: Mapped[str | None] = mapped_column(String(50))
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerPeriodExchangeRate(Base):
    __tablename__ = "customer_period_exchange_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_key: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    ccy: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    exchange_rate: Mapped[object] = mapped_column(Numeric(18, 6), default=1, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="DP01", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint("period_key", "ccy", name="uq_customer_period_exchange_rate"),
    )


class OrgBranch(Base):
    __tablename__ = "org_branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_code: Mapped[str] = mapped_column(String(10), unique=True, index=True, nullable=False)
    branch_name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch_level: Mapped[str] = mapped_column(String(30), default="LEVEL_2", nullable=False, index=True)
    parent_branch_id: Mapped[int | None] = mapped_column(ForeignKey("org_branches.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    parent_branch = relationship("OrgBranch", remote_side=[id], back_populates="child_branches")
    child_branches = relationship("OrgBranch", back_populates="parent_branch")
    departments = relationship("OrgDepartment", back_populates="branch")
    users = relationship("SystemUser", back_populates="branch")


class OrgDepartment(Base):
    __tablename__ = "org_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("org_branches.id"), index=True, nullable=False)
    department_code: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_type: Mapped[str | None] = mapped_column(String(50), index=True)
    parent_department_id: Mapped[int | None] = mapped_column(ForeignKey("org_departments.id"), index=True)
    manager_user_id: Mapped[int | None] = mapped_column(ForeignKey("system_users.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    branch = relationship("OrgBranch", back_populates="departments")
    users = relationship("SystemUser", back_populates="department", foreign_keys="SystemUser.department_id")
    manager = relationship("SystemUser", foreign_keys=[manager_user_id])
    parent_department = relationship("OrgDepartment", remote_side=[id], back_populates="child_departments", foreign_keys=[parent_department_id])
    child_departments = relationship("OrgDepartment", back_populates="parent_department", foreign_keys=[parent_department_id])

    __table_args__ = (
        UniqueConstraint("branch_id", "department_code", name="uq_org_departments_branch_code"),
    )


class SystemRole(Base):
    __tablename__ = "system_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    role_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users = relationship("SystemUser", back_populates="role")
    permissions = relationship("SystemRolePermission", back_populates="role")


class SystemPermission(Base):
    __tablename__ = "system_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    permission_code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    permission_name: Mapped[str] = mapped_column(String(255), nullable=False)
    permission_group: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("SystemRolePermission", back_populates="permission")


class SystemRolePermission(Base):
    __tablename__ = "system_role_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("system_roles.id"), index=True, nullable=False)
    permission_id: Mapped[int] = mapped_column(ForeignKey("system_permissions.id"), index=True, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role = relationship("SystemRole", back_populates="permissions")
    permission = relationship("SystemPermission", back_populates="roles")

    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_system_role_permissions"),
    )


class SystemUser(Base):
    __tablename__ = "system_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_code: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    credit_officer_code: Mapped[str | None] = mapped_column(String(50), index=True)
    customer_cif_code: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    ipcas_username: Mapped[str | None] = mapped_column(String(80), index=True)
    full_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("org_branches.id"), index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("org_departments.id"), index=True)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("system_roles.id"), index=True)
    data_scope: Mapped[str] = mapped_column(String(30), default="own", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    branch = relationship("OrgBranch", back_populates="users")
    department = relationship("OrgDepartment", back_populates="users", foreign_keys=[department_id])
    role = relationship("SystemRole", back_populates="users")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_username: Mapped[str | None] = mapped_column(String(80), index=True)
    actor_name: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(80), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
