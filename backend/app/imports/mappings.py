DP01_COLUMNS = [
    "MA_CN",
    "MA_KH",
    "TEN_KH",
    "DP_TYPE_NAME",
    "CCY",
    "CURRENT_BALANCE",
    "SO_TAI_KHOAN",
    "OPENING_DATE",
    "MATURITY_DATE",
    "MONTH_TERM",
    "MA_PGD",
    "TEN_PGD",
    "DP_TYPE_CODE",
    "CUST_TYPE",
    "CUST_TYPE_NAME",
    "ID_NUMBER",
    "SEX_TYPE",
    "BIRTH_DATE",
    "TELEPHONE",
    "DRAMT",
    "CRAMT",
    "EMPLOYEE_NUMBER",
    "EMPLOYEE_NAME",
    "TYGIA",
]

CN05_COLUMNS = [
    "MA_CN",
    "MA_KH",
    "TEN_KH",
    "TKTT_SO_TK",
    "TKTT_TK_SODEP",
    "TK_OSB",
    "TG_TIEN_GUI_LOI_THONG_MINH",
    "TG_TIEN_GUI_TRUC_TUYEN",
    "TG_TIEN_GUI_TAI_QUAY",
    "TG_SMS_TIEN_GUI",
    "VV_TONG_SO_LDS",
    "VV_SMS_TIEN_VAY",
    "VV_TONG_SO_LDS_CENTERCUT",
    "THE_GHI_NO_NOI_DIA",
    "THE_GHI_NO_QUOC_TE",
    "THE_TIN_DUNG_NOI_DIA",
    "THE_TIN_DUNG_QUOC_TE",
    "VISA",
    "MASTER",
    "JCB",
    "DK_AGRIBANK_PLUS",
    "DK_AGRIBANK_PLUS_OTT",
    "SMS_BANKING",
    "TIEN_VAY",
]

LN01_COLUMNS = [
    "BRCD",
    "CUSTSEQ",
    "CUSTNM",
    "CCY",
    "DU_NO",
    "DSBSSEQ",
    "TRANSACTION_DATE",
    "INTEREST_RATE",
    "APPRSEQ",
    "LOAN_TYPE",
    "OFFICER_ID",
    "OFFICER_NAME",
    "TRCTCD",
    "TRCTNM",
    "ACCRUAL_AMOUNT",
    "ACCRUAL_AMOUNT_END_OF_MONTH",
    "TY_GIA",
    "OFFICER_IPCAS",
]

PF14_COLUMNS = [
    "TRBRCD",
    "PRODUCTCODE",
    "ACCOUNTNO",
    "CUSTSEQ",
    "CUSTNAME",
    "AVERAGEBALANCE",
    "MONTHLYENDBALANCE",
    "OPERATIONALFUNDS",
    "MONTERM",
    "CCY",
]

BC06_COLUMNS = [
    "MA_CHI_NHANH", "TEN_CHI_NHANH", "MA_KHACH_HANG", "TEN_KHACH_HANG",
    "LOAI_KHACH_HANG", "THANG_PHAN_LOAI", "LOI_ICH_TG_TAI_CN",
    "LOI_ICH_TV_TAI_CN", "LOI_ICH_DV_TAI_CN", "SDBQ_TGCKH_CN",
    "SDBQ_TGKKH_CN", "SDBQ_TV", "DIEM_LOI_ICH_CN", "DIEM_SDBQ_CN",
    "DIEM_DINH_TINH_CN", "DIEM_KH_CN", "TIEU_CHI_BS_CN", "NHOM_TAI_CN",
    "HANG_TAI_CN", "NHOM_TT_CN", "HANG_TT_CN", "TIEU_CHI_BS_AGR",
    "NHOM_AGR", "HANG_AGR", "NHOM_TT_AGR", "HANG_TT_AGR",
    "DON_VI_DIEU_CHINH", "DON_VI_DAU_MOI",
]

BC29_COLUMNS = [
    "MA_CN", "MA_KH", "TEN_KH", "NHOM_NO", "TONG_DN", "TONG_DN_PHAI_TRICH",
    "SO_TRICH_LAP_TRONG_KY", "XEP_LOAI", "TONG_GTKT_TSDB", "TONG_TSDB",
    "BDS", "DS", "GTCG", "KHAC", "SO_NGAY_QHG", "SO_NGAY_QHL", "NGAY_XLRR",
    "LAI_DU_THU", "DN_NGOAI_BANG", "DN_TIN_DUNG", "DN_THAU_CHI",
    "SO_TIEN_DA_XLRR", "MA_NHAN_VIEN", "DON_VI_CONG_TAC",
]

KH02_COLUMNS = [
    "TRDATE", "TRBRCD", "CUSTSEQ", "CUSTNAME", "USERHT", "DYSEQ", "DYTRSEQ",
    "ACCTCD", "BUSCD", "UNITBUSCD", "TRCD", "TRREF", "TRSEQ", "TRCTCD",
    "CBTD", "DRAMT", "CRAMT",
]

FTPLN_COLUMNS = [
    "TRDT", "BRCD", "PRNTBRCD", "BUSCD", "UNTBUSCD", "SO_HDTD", "TRREF",
    "TRSEQ", "REFNO", "NACCTCD", "FTPCD", "CUSTSEQ", "CUSTNM", "CUSTTP",
    "TIMETPCD", "PLKH", "FTP", "INTRT", "MUCFTPDC", "OPNDT", "MATDT", "CCY",
    "LDRBAL", "CPAMT", "CPLKAMT", "ECONO_SECT", "UDP", "TRCTCD", "CBTD",
    "AQCCDFIN", "HANGFINAL",
]

REQUIRED_COLUMNS = {
    "DP01": DP01_COLUMNS,
    "CN05": CN05_COLUMNS,
    "LN01": LN01_COLUMNS,
    "PF14": PF14_COLUMNS,
    "BC06": BC06_COLUMNS,
    "BC29": BC29_COLUMNS,
    "KH02": KH02_COLUMNS,
    "FTPLN": FTPLN_COLUMNS,
}


def validate_required_columns(rows: list[dict], file_type: str) -> None:
    if not rows:
        raise ValueError("File không có dữ liệu")
    columns = set(rows[0].keys())
    missing = [column for column in REQUIRED_COLUMNS[file_type] if column not in columns]
    if missing:
        raise ValueError(f"Thiếu cột bắt buộc: {', '.join(missing)}")
