from decimal import Decimal

from sqlalchemy.orm import Session

from app.imports.cleaners import decimal_or_zero, parse_service_flag
from app.models import (
    CN05CustomerService,
    CustomerPeriodSummary,
    DP01DepositAccount,
    LN01Loan,
    PF14AccountBalance,
    Customer,
)


def _blank_summary(period_key: str, period_date, ma_kh_chuan: str) -> dict:
    return {
        "period_key": period_key,
        "period_date": period_date,
        "ma_kh_chuan": ma_kh_chuan,
        "telephone": None,
        "so_du_tien_vay": Decimal("0"),
        "so_du_tien_gui_ckh": Decimal("0"),
        "doanh_so_chuyen_tien_ve_tai_khoan": Decimal("0"),
        "so_du_tgtt_binh_quan": Decimal("0"),
        "tong_loi_ich_thang": Decimal("0"),
        "thau_chi": 0,
        "tk_so_dep": 0,
        "agribank_plus": 0,
        "tin_nhan_ott": 0,
        "e_banking": 0,
        "sms_nhac_no_vay": 0,
        "sms_tien_gui": 0,
        "the_ghi_no_noi_dia": 0,
        "the_td_quoc_te": 0,
        "the_td_loc_viet": 0,
        "tt_tien_dien": 0,
        "tt_tien_nuoc": 0,
        "tt_cuoc_vien_thong": 0,
        "tra_luong_qua_the": 0,
        "batd": 0,
        "batk": 0,
        "bh_oto_xe_may": 0,
        "bh_khac": 0,
        "bao_lanh": 0,
        "loa_bien_dong_so_du": 0,
        "phan_mem_ban_hang": 0,
        "pos": 0,
        "chi_tra_kieu_hoi": 0,
        "phat_hanh_lc": 0,
        "thanh_toan_quoc_te": 0,
        "mua_ban_ngoai_te": 0,
    }


def summarize_period(db: Session, period_key: str) -> int:
    db.query(CustomerPeriodSummary).filter(CustomerPeriodSummary.period_key == period_key).delete()

    summaries: dict[str, dict] = {}
    period_date = None

    def get_summary(ma_kh_chuan: str, source_period_date):
        nonlocal period_date
        if period_date is None:
            period_date = source_period_date
        if ma_kh_chuan not in summaries:
            summaries[ma_kh_chuan] = _blank_summary(period_key, source_period_date, ma_kh_chuan)
        return summaries[ma_kh_chuan]

    for row in db.query(DP01DepositAccount).filter(DP01DepositAccount.period_key == period_key):
        if not row.ma_kh_chuan:
            continue
        item = get_summary(row.ma_kh_chuan, row.period_date)
        item.setdefault("ma_cn", row.ma_cn or row.branch_code)
        item.setdefault("ma_kh", row.ma_kh)
        item.setdefault("ten_kh", row.ten_kh)
        item.setdefault("ma_pgd", row.ma_pgd)
        item.setdefault("loai_khach_hang", row.cust_type_name or row.cust_type)
        item.setdefault("ma_cb", row.employee_number)
        item.setdefault("ten_can_bo", row.employee_name)
        item["so_du_tien_gui_ckh"] += decimal_or_zero(row.current_balance)
        item["doanh_so_chuyen_tien_ve_tai_khoan"] += decimal_or_zero(row.dramt)
        item["doanh_so_chuyen_tien_ve_tai_khoan"] += decimal_or_zero(row.cramt)

    for row in db.query(LN01Loan).filter(LN01Loan.period_key == period_key):
        if not row.ma_kh_chuan:
            continue
        item = get_summary(row.ma_kh_chuan, row.period_date)
        item.setdefault("ma_cn", row.brcd or row.branch_code)
        item.setdefault("ma_kh", row.custseq)
        item.setdefault("ten_kh", row.custnm)
        item.setdefault("loai_vay", row.loan_type)
        item.setdefault("ma_cb", row.officer_id)
        item.setdefault("ten_can_bo", row.officer_name)
        item["so_du_tien_vay"] += decimal_or_zero(row.du_no)

    for row in db.query(PF14AccountBalance).filter(PF14AccountBalance.period_key == period_key):
        if not row.ma_kh_chuan:
            continue
        item = get_summary(row.ma_kh_chuan, row.period_date)
        item.setdefault("ma_cn", row.trbrcd or row.branch_code)
        item.setdefault("ma_kh", row.custseq)
        item.setdefault("ten_kh", row.custname)
        item["so_du_tgtt_binh_quan"] += decimal_or_zero(row.averagebalance)

    for row in db.query(CN05CustomerService).filter(CN05CustomerService.period_key == period_key):
        if not row.ma_kh_chuan:
            continue
        item = get_summary(row.ma_kh_chuan, row.period_date)
        item.setdefault("ma_cn", row.ma_cn or row.branch_code)
        item.setdefault("ma_kh", row.ma_kh)
        item.setdefault("ten_kh", row.ten_kh)
        item["thau_chi"] = max(item["thau_chi"], parse_service_flag(row.tk_osb))
        item["tk_so_dep"] = max(item["tk_so_dep"], parse_service_flag(row.tktt_tk_sodep))
        item["agribank_plus"] = max(item["agribank_plus"], parse_service_flag(row.dk_agribank_plus))
        item["tin_nhan_ott"] = max(item["tin_nhan_ott"], parse_service_flag(row.dk_agribank_plus_ott))
        item["sms_nhac_no_vay"] = max(item["sms_nhac_no_vay"], parse_service_flag(row.vv_sms_tien_vay))
        item["sms_tien_gui"] = max(item["sms_tien_gui"], parse_service_flag(row.tg_sms_tien_gui))
        item["the_ghi_no_noi_dia"] = max(item["the_ghi_no_noi_dia"], parse_service_flag(row.the_ghi_no_noi_dia))
        item["the_td_quoc_te"] = max(item["the_td_quoc_te"], parse_service_flag(row.the_tin_dung_quoc_te))

    if not summaries:
        db.commit()
        return 0

    # Lấy thông tin số điện thoại từ bảng Customer để điền vào bảng tổng hợp
    customers = db.query(Customer.ma_kh_chuan, Customer.telephone).filter(Customer.ma_kh_chuan.in_(list(summaries.keys()))).all()
    for ma_kh_chuan, tel in customers:
        if ma_kh_chuan in summaries:
            summaries[ma_kh_chuan]["telephone"] = tel

    db.bulk_insert_mappings(CustomerPeriodSummary, list(summaries.values()))
    db.commit()
    return len(summaries)

