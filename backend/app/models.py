from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
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
    ma_kh: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    ten_kh: Mapped[str | None] = mapped_column(String(255), index=True)
    loai_khach_hang: Mapped[str | None] = mapped_column(String(100))
    branch_codes: Mapped[str | None] = mapped_column(Text)
    pgd_codes: Mapped[str | None] = mapped_column(Text)
    branch_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pgd_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dp_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    so_du_tien_gui: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    doanh_so_chuyen_tien_ve_tk: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
    so_du_tien_vay: Mapped[object | None] = mapped_column(Numeric(20, 2), default=0)
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
    ma_cb: Mapped[str | None] = mapped_column(String(50))
    ten_can_bo: Mapped[str | None] = mapped_column(String(255))
    telephone: Mapped[str | None] = mapped_column(String(50))
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
    ma_cb: Mapped[str | None] = mapped_column(String(50))
    ten_can_bo: Mapped[str | None] = mapped_column(String(255))
    processing_job_id: Mapped[int | None] = mapped_column(ForeignKey("customer_processing_jobs.id"), index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("period_key", "ma_kh", "branch_code", "ma_pgd", name="uq_customer_period_branch_detail"),
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
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    departments = relationship("OrgDepartment", back_populates="branch")
    users = relationship("SystemUser", back_populates="branch")


class OrgDepartment(Base):
    __tablename__ = "org_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("org_branches.id"), index=True, nullable=False)
    department_code: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_type: Mapped[str | None] = mapped_column(String(50), index=True)
    manager_user_id: Mapped[int | None] = mapped_column(ForeignKey("system_users.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    branch = relationship("OrgBranch", back_populates="departments")
    users = relationship("SystemUser", back_populates="department", foreign_keys="SystemUser.department_id")
    manager = relationship("SystemUser", foreign_keys=[manager_user_id])

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
