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

REQUIRED_COLUMNS = {
    "DP01": DP01_COLUMNS,
    "CN05": CN05_COLUMNS,
    "LN01": LN01_COLUMNS,
    "PF14": PF14_COLUMNS,
}


def validate_required_columns(rows: list[dict], file_type: str) -> None:
    if not rows:
        raise ValueError("File không có dữ liệu")
    columns = set(rows[0].keys())
    missing = [column for column in REQUIRED_COLUMNS[file_type] if column not in columns]
    if missing:
        raise ValueError(f"Thiếu cột bắt buộc: {', '.join(missing)}")

