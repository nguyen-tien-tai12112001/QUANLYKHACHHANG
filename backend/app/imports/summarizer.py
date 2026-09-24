import calendar

from sqlalchemy import delete, distinct, func, text
from sqlalchemy.orm import Session

from app.customer_processing import apply_transfer_inflow_to_summaries
from app.models import (
    BC06CustomerClassification,
    BC29CustomerCreditRisk,
    CN05CustomerService,
    CustomerPeriodSummary,
    DP01DepositAccount,
    FTPLNDailyLoanFTP,
    ImportBatch,
    ImportFile,
    KH02CustomerTransaction,
    LN01Loan,
    PF10LoanProfitability,
    PF14AccountBalance,
    ReportSourceStatus,
    RR01HandledRiskLoan,
    GL02LedgerTransaction,
)


SOURCE_CONFIGS = [
    {
        "code": "DP01",
        "name": "Thông tin khách hàng và tiền gửi",
        "table": "dp01_deposit_accounts",
        "model": DP01DepositAccount,
        "fields": [
            "MA_CN",
            "MA_KH",
            "TEN_KH",
            "MA_PGD",
            "CURRENT_BALANCE",
            "DRAMT",
            "CRAMT",
            "EMPLOYEE_NUMBER",
        ],
    },
    {
        "code": "LN01",
        "name": "Khoản vay",
        "table": "ln01_loans",
        "model": LN01Loan,
        "fields": ["BRCD", "CUSTSEQ", "CUSTNM", "DU_NO", "LOAN_TYPE", "OFFICER_ID"],
    },
    {
        "code": "PF10",
        "name": "Hiệu quả và lãi khoản vay",
        "table": "pf10_loan_profitability",
        "model": PF10LoanProfitability,
        "fields": [
            "TRDATE", "TRBRCD", "ACCTNO", "CUSTSEQ", "LNTYPE", "AVGBAL",
            "EOMBAL", "CONTRATE", "INTEREST", "RATIO", "CCY",
        ],
    },
    {
        "code": "PF14",
        "name": "CASA bình quân",
        "table": "pf14_account_balances",
        "model": PF14AccountBalance,
        "fields": ["TRBRCD", "CUSTSEQ", "CUSTNAME", "AVERAGEBALANCE", "MONTHLYENDBALANCE"],
    },
    {
        "code": "CN05",
        "name": "Dịch vụ khách hàng",
        "table": "cn05_customer_services",
        "model": CN05CustomerService,
        "fields": [
            "TK_OSB",
            "TKTT_TK_SODEP",
            "DK_AGRIBANK_PLUS",
            "DK_AGRIBANK_PLUS_OTT",
            "SMS_BANKING",
            "VV_SMS_TIEN_VAY",
            "TG_SMS_TIEN_GUI",
            "THE_GHI_NO_NOI_DIA",
            "THE_TIN_DUNG_NOI_DIA",
            "THE_TIN_DUNG_QUOC_TE",
        ],
    },
    {
        "code": "BC06",
        "name": "Phân loại và lợi ích khách hàng",
        "table": "bc06_customer_classifications",
        "model": BC06CustomerClassification,
        "customer_field": "customer_code",
        "fields": ["MA_KHACH_HANG", "NHOM_TAI_CN", "HANG_TAI_CN", "LOI_ICH_TG_TAI_CN", "LOI_ICH_TV_TAI_CN", "LOI_ICH_DV_TAI_CN"],
    },
    {
        "code": "BC29",
        "name": "Nợ xấu, XLRR và tài sản bảo đảm",
        "table": "bc29_customer_credit_risks",
        "model": BC29CustomerCreditRisk,
        "customer_field": "customer_code",
        "fields": ["MA_KH", "NHOM_NO", "TONG_DN", "SO_TRICH_LAP_TRONG_KY", "SO_TIEN_DA_XLRR"],
    },
    {
        "code": "KH02",
        "name": "Giao dịch khách hàng theo tháng",
        "table": "kh02_customer_transactions",
        "model": KH02CustomerTransaction,
        "customer_field": "customer_code",
        "fields": ["TRDATE", "CUSTSEQ", "ACCTCD", "BUSCD", "TRCD", "DRAMT", "CRAMT"],
    },
    {
        "code": "FTPLN",
        "name": "FTP khoản vay hằng ngày",
        "table": "ftpln_daily_loan_ftp",
        "model": FTPLNDailyLoanFTP,
        "customer_field": "customer_code",
        "fields": ["TRDT", "CUSTSEQ", "FTPCD", "FTP", "LDRBAL", "CPAMT", "CPLKAMT"],
    },
    {
        "code": "RR01", "name": "Nợ xử lý rủi ro và thu hồi nợ", "table": "rr01_handled_risk_loans",
        "model": RR01HandledRiskLoan, "customer_field": "customer_code",
        "fields": ["MA_KH", "SO_LAV", "SO_LDS", "DUNO_GOC_HIENTAI", "THU_GOC", "THU_LAI"],
    },
    {
        "code": "GL02", "name": "Giao dịch sổ cái và doanh số TKTT", "table": "gl02_ledger_transactions",
        "model": GL02LedgerTransaction, "customer_field": "customer_code",
        "fields": ["TRDATE", "LOCAC", "CUSTOMER", "TRTP", "DRAMOUNT", "CRAMOUNT"],
    },
    {
        "code": "MANUAL",
        "name": "Dữ liệu bổ sung",
        "table": None,
        "model": None,
        "fields": [
            "Tổng lợi ích tháng",
            "Bảo hiểm",
            "POS",
            "Thanh toán quốc tế",
            "Ghi chú chăm sóc",
        ],
    },
]


def refresh_report_sources(
    db: Session,
    period_key: str,
    *,
    refresh_customer_counts: bool = True,
) -> None:
    existing_customer_counts = dict(
        db.query(
            ReportSourceStatus.source_code,
            ReportSourceStatus.customer_count,
        )
        .filter(ReportSourceStatus.period_key == period_key)
        .all()
    )
    db.execute(delete(ReportSourceStatus).where(ReportSourceStatus.period_key == period_key))

    batch = db.query(ImportBatch).filter(ImportBatch.period_key == period_key).first()
    period_date = batch.period_date if batch else None
    period_files = db.query(ImportFile).filter(ImportFile.period_key == period_key).all()
    expected_branches = sorted({
        item.branch_code for item in period_files
        if item.status == "success" and item.file_type in {"DP01", "LN01", "CN05", "PF10", "PF14", "BC06", "BC29", "KH02"}
    })
    source_rows = []

    for config in SOURCE_CONFIGS:
        source_code = config["code"]
        files = [item for item in period_files if item.file_type == source_code] if source_code != "MANUAL" else []
        active_files = [file for file in files if file.status not in {"deleted", "replaced"}]
        success_files = [file for file in active_files if file.status == "success"]
        error_files = [file for file in active_files if file.status == "error"]
        waiting_files = [file for file in active_files if file.status in {"queued", "processing", "deleting"}]

        row_count = sum(int(file.success_rows or 0) for file in success_files)
        customer_count = int(existing_customer_counts.get(source_code, 0) or 0)
        model = config["model"]
        if model is not None and refresh_customer_counts:
            customer_column = getattr(model, config.get("customer_field", "ma_kh_chuan"))
            customer_count = (
                db.query(func.count(distinct(customer_column)))
                .filter(model.period_key == period_key, customer_column.isnot(None))
                .scalar()
                or 0
            )

        if source_code == "MANUAL":
            status = "planned"
            message = "Nguồn bổ sung thủ công sẽ cấu hình ở giai đoạn sau."
        elif source_code in {"RR01", "GL02"}:
            successful_branches = {file.branch_code for file in success_files}
            missing_branches = [code for code in expected_branches if code not in successful_branches]
            if waiting_files:
                status = "processing"
                message = "Đang có file chờ xử lý hoặc đang xử lý."
            elif error_files:
                status = "partial" if success_files else "error"
                message = f"Có {len(error_files)} file lỗi; cần kiểm tra lại."
            elif success_files and not missing_branches:
                status = "ready"
                message = f"Đã có {source_code} cho đủ {len(expected_branches)} chi nhánh; xem ma trận để kiểm tra chi tiết."
            elif success_files:
                status = "partial"
                message = f"Thiếu {source_code} tại chi nhánh: {', '.join(missing_branches)}."
            else:
                status = "missing"
                message = f"Chưa có file {source_code} thành công cho kỳ này."
        elif source_code == "FTPLN" and success_files:
            branch_codes = {file.branch_code for file in success_files}
            expected_days = (
                calendar.monthrange(period_date.year, period_date.month)[1]
                if period_date
                else 0
            )
            successful_day_keys = {
                (file.branch_code, file.business_date)
                for file in success_files
                if file.business_date is not None
            }
            expected_count = expected_days * len(branch_codes)
            if not error_files and expected_count > 0 and len(successful_day_keys) == expected_count:
                status = "ready"
                message = f"Đã đủ {expected_days}/{expected_days} ngày cho {len(branch_codes)} chi nhánh."
            else:
                status = "partial"
                message = (
                    f"Mới có {len(successful_day_keys)}/{expected_count or expected_days} "
                    "file-ngày FTPLN thành công; chưa sẵn sàng đối chiếu tháng."
                )
        elif waiting_files:
            status = "processing"
            message = "Đang có file chờ xử lý hoặc đang xử lý."
        elif success_files and error_files:
            status = "partial"
            message = "Có file thành công và có file lỗi, cần kiểm tra lại kho dữ liệu."
        elif success_files and row_count > 0:
            status = "ready"
            message = "Nguồn đã sẵn sàng cho báo cáo."
        elif error_files:
            status = "error"
            message = "Nguồn đang lỗi, cần import lại file."
        else:
            status = "missing"
            message = "Chưa có file nguồn thành công cho kỳ này."

        source_rows.append(
            {
                "period_key": period_key,
                "period_date": period_date,
                "source_code": source_code,
                "source_name": config["name"],
                "source_table": config["table"],
                "status": status,
                "file_count": len(active_files),
                "success_file_count": len(success_files),
                "error_file_count": len(error_files),
                "row_count": row_count,
                "customer_count": customer_count,
                "total_file_size": sum(file.file_size or 0 for file in active_files),
                "mapped_fields": {"fields": config["fields"]},
                "message": message,
            }
        )

    db.bulk_insert_mappings(ReportSourceStatus, source_rows)


SUMMARY_INSERT_SQL = text(
    """
    WITH dp AS (
        SELECT
            ma_kh_chuan,
            MAX(period_date) AS period_date,
            MAX(ma_cn) AS ma_cn,
            MAX(ma_kh) AS ma_kh,
            MAX(ten_kh) AS ten_kh,
            MAX(ma_pgd) AS ma_pgd,
            MAX(cust_type_name) AS cust_type_name,
            MAX(cust_type) AS cust_type,
            MAX(employee_number) AS ma_cb,
            MAX(employee_name) AS ten_can_bo,
            SUM(CASE WHEN COALESCE(current_balance, 0) >= 0 THEN COALESCE(current_balance, 0) ELSE 0 END) AS so_du_tien_gui_ckh,
            0 AS doanh_so_chuyen_tien_ve_tai_khoan
        FROM dp01_deposit_accounts
        WHERE period_key = :period_key AND ma_kh_chuan IS NOT NULL
        GROUP BY ma_kh_chuan
    ),
    ln AS (
        SELECT
            ma_kh_chuan,
            MAX(period_date) AS period_date,
            MAX(brcd) AS ma_cn,
            MAX(custseq) AS ma_kh,
            MAX(custnm) AS ten_kh,
            MAX(loan_type) AS loai_vay,
            MAX(officer_id) AS ma_cb,
            MAX(officer_name) AS ten_can_bo,
            SUM(COALESCE(du_no, 0)) AS so_du_tien_vay
        FROM ln01_loans
        WHERE period_key = :period_key AND ma_kh_chuan IS NOT NULL
        GROUP BY ma_kh_chuan
    ),
    pf AS (
        SELECT
            ma_kh_chuan,
            MAX(period_date) AS period_date,
            MAX(trbrcd) AS ma_cn,
            MAX(custseq) AS ma_kh,
            MAX(custname) AS ten_kh,
            SUM(COALESCE(averagebalance, 0)) AS so_du_tgtt_binh_quan
        FROM pf14_account_balances
        WHERE period_key = :period_key AND ma_kh_chuan IS NOT NULL
        GROUP BY ma_kh_chuan
    ),
    cn AS (
        SELECT
            ma_kh_chuan,
            MAX(period_date) AS period_date,
            MAX(ma_cn) AS ma_cn,
            MAX(ma_kh) AS ma_kh,
            MAX(ten_kh) AS ten_kh,
            MAX(CASE WHEN COALESCE(tk_osb, 0) > 0 THEN 1 ELSE 0 END) AS thau_chi,
            MAX(CASE WHEN COALESCE(tktt_tk_sodep, 0) > 0 THEN 1 ELSE 0 END) AS tk_so_dep,
            MAX(CASE WHEN COALESCE(dk_agribank_plus, 0) > 0 THEN 1 ELSE 0 END) AS agribank_plus,
            MAX(CASE WHEN COALESCE(dk_agribank_plus_ott, 0) > 0 THEN 1 ELSE 0 END) AS tin_nhan_ott,
            MAX(CASE WHEN COALESCE(sms_banking, 0) > 0 THEN 1 ELSE 0 END) AS e_banking,
            MAX(CASE WHEN COALESCE(vv_sms_tien_vay, 0) > 0 THEN 1 ELSE 0 END) AS sms_nhac_no_vay,
            MAX(CASE WHEN COALESCE(tg_sms_tien_gui, 0) > 0 THEN 1 ELSE 0 END) AS sms_tien_gui,
            MAX(CASE WHEN COALESCE(the_ghi_no_noi_dia, 0) > 0 THEN 1 ELSE 0 END) AS the_ghi_no_noi_dia,
            MAX(CASE WHEN COALESCE(the_ghi_no_quoc_te, 0) > 0 THEN 1 ELSE 0 END) AS the_ghi_no_quoc_te,
            MAX(CASE WHEN COALESCE(the_tin_dung_noi_dia, 0) > 0 THEN 1 ELSE 0 END) AS the_td_loc_viet,
            MAX(CASE WHEN COALESCE(the_tin_dung_quoc_te, 0) > 0 THEN 1 ELSE 0 END) AS the_td_quoc_te
        FROM cn05_customer_services
        WHERE period_key = :period_key AND ma_kh_chuan IS NOT NULL
        GROUP BY ma_kh_chuan
    ),
    keys AS (
        SELECT ma_kh_chuan FROM dp
        UNION SELECT ma_kh_chuan FROM ln
        UNION SELECT ma_kh_chuan FROM pf
        UNION SELECT ma_kh_chuan FROM cn
    )
    INSERT INTO customer_period_summaries (
        period_key,
        period_date,
        ma_kh_chuan,
        ma_cn,
        ma_pgd,
        ma_kh,
        ten_kh,
        loai_khach_hang,
        so_du_tien_vay,
        so_du_tien_gui_ckh,
        loai_vay,
        doanh_so_chuyen_tien_ve_tai_khoan,
        so_du_tgtt_binh_quan,
        thau_chi,
        tk_so_dep,
        agribank_plus,
        tin_nhan_ott,
        e_banking,
        sms_nhac_no_vay,
        sms_tien_gui,
        the_ghi_no_noi_dia,
        the_ghi_no_quoc_te,
        the_td_quoc_te,
        the_td_loc_viet,
        tt_tien_dien,
        tt_tien_nuoc,
        tt_cuoc_vien_thong,
        tra_luong_qua_the,
        batd,
        batk,
        bh_oto_xe_may,
        bh_khac,
        bao_lanh,
        loa_bien_dong_so_du,
        phan_mem_ban_hang,
        pos,
        chi_tra_kieu_hoi,
        phat_hanh_lc,
        thanh_toan_quoc_te,
        mua_ban_ngoai_te,
        tong_loi_ich_thang,
        ma_cb,
        ten_can_bo,
        telephone
    )
    SELECT
        :period_key AS period_key,
        COALESCE(dp.period_date, ln.period_date, pf.period_date, cn.period_date) AS period_date,
        keys.ma_kh_chuan,
        COALESCE(dp.ma_cn, ln.ma_cn, pf.ma_cn, cn.ma_cn) AS ma_cn,
        dp.ma_pgd AS ma_pgd,
        COALESCE(dp.ma_kh, ln.ma_kh, pf.ma_kh, cn.ma_kh) AS ma_kh,
        COALESCE(dp.ten_kh, ln.ten_kh, pf.ten_kh, cn.ten_kh) AS ten_kh,
        COALESCE(dp.cust_type_name, dp.cust_type) AS loai_khach_hang,
        COALESCE(ln.so_du_tien_vay, 0) AS so_du_tien_vay,
        COALESCE(dp.so_du_tien_gui_ckh, 0) AS so_du_tien_gui_ckh,
        ln.loai_vay,
        COALESCE(dp.doanh_so_chuyen_tien_ve_tai_khoan, 0) AS doanh_so_chuyen_tien_ve_tai_khoan,
        COALESCE(pf.so_du_tgtt_binh_quan, 0) AS so_du_tgtt_binh_quan,
        COALESCE(cn.thau_chi, 0) AS thau_chi,
        COALESCE(cn.tk_so_dep, 0) AS tk_so_dep,
        COALESCE(cn.agribank_plus, 0) AS agribank_plus,
        COALESCE(cn.tin_nhan_ott, 0) AS tin_nhan_ott,
        COALESCE(cn.e_banking, 0) AS e_banking,
        COALESCE(cn.sms_nhac_no_vay, 0) AS sms_nhac_no_vay,
        COALESCE(cn.sms_tien_gui, 0) AS sms_tien_gui,
        COALESCE(cn.the_ghi_no_noi_dia, 0) AS the_ghi_no_noi_dia,
        COALESCE(cn.the_ghi_no_quoc_te, 0) AS the_ghi_no_quoc_te,
        COALESCE(cn.the_td_quoc_te, 0) AS the_td_quoc_te,
        COALESCE(cn.the_td_loc_viet, 0) AS the_td_loc_viet,
        0 AS tt_tien_dien,
        0 AS tt_tien_nuoc,
        0 AS tt_cuoc_vien_thong,
        0 AS tra_luong_qua_the,
        0 AS batd,
        0 AS batk,
        0 AS bh_oto_xe_may,
        0 AS bh_khac,
        0 AS bao_lanh,
        0 AS loa_bien_dong_so_du,
        0 AS phan_mem_ban_hang,
        0 AS pos,
        0 AS chi_tra_kieu_hoi,
        0 AS phat_hanh_lc,
        0 AS thanh_toan_quoc_te,
        0 AS mua_ban_ngoai_te,
        0 AS tong_loi_ich_thang,
        COALESCE(dp.ma_cb, ln.ma_cb) AS ma_cb,
        COALESCE(dp.ten_can_bo, ln.ten_can_bo) AS ten_can_bo,
        customers.telephone
    FROM keys
    LEFT JOIN dp ON dp.ma_kh_chuan = keys.ma_kh_chuan
    LEFT JOIN ln ON ln.ma_kh_chuan = keys.ma_kh_chuan
    LEFT JOIN pf ON pf.ma_kh_chuan = keys.ma_kh_chuan
    LEFT JOIN cn ON cn.ma_kh_chuan = keys.ma_kh_chuan
    LEFT JOIN customers ON customers.ma_kh_chuan = keys.ma_kh_chuan
    """
)


def summarize_period(db: Session, period_key: str) -> int:
    db.execute(delete(CustomerPeriodSummary).where(CustomerPeriodSummary.period_key == period_key))
    db.execute(SUMMARY_INSERT_SQL, {"period_key": period_key})
    apply_transfer_inflow_to_summaries(db, period_key)
    refresh_report_sources(db, period_key)
    db.commit()
    return (
        db.query(func.count(CustomerPeriodSummary.id))
        .filter(CustomerPeriodSummary.period_key == period_key)
        .scalar()
        or 0
    )
