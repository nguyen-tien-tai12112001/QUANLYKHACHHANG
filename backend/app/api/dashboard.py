from datetime import date, datetime
from decimal import Decimal
from time import monotonic

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, or_, text
from sqlalchemy.orm import Query as OrmQuery, Session
from sqlalchemy.orm import aliased

from app.auth.branch_scope import BranchScope
from app.auth.dependencies import get_branch_scope
from app.database import get_db
from app.models import (
    CN05CustomerService,
    CustomerPeriodBranchDetail,
    CustomerPeriodProfile,
    LN01Loan,
    PF14AccountBalance,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
_INSIGHTS_CACHE: dict[tuple[str, str | None, str | None], tuple[float, dict]] = {}
_SUMMARY_CACHE: dict[tuple[str, str | None, str | None], tuple[float, dict]] = {}
_INSIGHTS_CACHE_TTL_SECONDS = 60

ACTIVE_SERVICE_KEYS = [
    "thau_chi",
    "tk_so_dep",
    "agribank_plus",
    "tin_nhan_ott",
    "sms_nhac_no_vay",
    "sms_tien_gui",
    "the_ghi_no_noi_dia",
    "the_td_quoc_te",
    "the_td_loc_viet",
    "bao_lanh",
    "loa_bien_dong_so_du",
    "phat_hanh_lc",
]

# Đồng bộ với quy tắc cơ hội bán chéo / loại KH thực tế từ DP01.
RETAIL_CUSTOMER_TYPES = ("Cá nhân", "KHCN")

SERVICE_LABELS = {
    "thau_chi": "Thấu chi",
    "tk_so_dep": "TK số đẹp",
    "agribank_plus": "Agribank Plus",
    "tin_nhan_ott": "Tin nhắn OTT",
    "sms_nhac_no_vay": "SMS nhắc nợ vay",
    "sms_tien_gui": "SMS tiền gửi",
    "the_ghi_no_noi_dia": "Thẻ ghi nợ nội địa",
    "the_td_quoc_te": "Thẻ TD quốc tế",
    "the_td_loc_viet": "Thẻ TD Lộc Việt",
    "bao_lanh": "Bảo lãnh",
    "loa_bien_dong_so_du": "Loa biến động số dư",
    "phat_hanh_lc": "Phát hành LC",
}

SERVICE_GROUPS = {
    "thau_chi": "Tài khoản",
    "tk_so_dep": "Tài khoản",
    "agribank_plus": "Digital",
    "tin_nhan_ott": "Digital",
    "sms_nhac_no_vay": "Digital",
    "sms_tien_gui": "Digital",
    "the_ghi_no_noi_dia": "Thẻ",
    "the_td_quoc_te": "Thẻ",
    "the_td_loc_viet": "Thẻ",
    "bao_lanh": "Bảo lãnh/TTQT",
    "loa_bien_dong_so_du": "Khác",
    "phat_hanh_lc": "Bảo lãnh/TTQT",
}

CAMPAIGN_GROUP_PRIORITY = {
    "KHCN": ["Digital", "Thẻ", "Thanh toán", "Tài khoản", "Bảo hiểm", "Bảo lãnh/TTQT", "Khác"],
    "KHDN": ["Bảo lãnh/TTQT", "Digital", "Thanh toán", "Tài khoản", "Thẻ", "Bảo hiểm", "Khác"],
}

LOAN_TYPE_LABELS = ("Thấu chi", "Ngắn", "Trung", "Dài", "Khác")

# Mẫu số thâm nhập đặc thù (mặc định = toàn bộ KH trong phạm vi).
SERVICE_PENETRATION_BASE = {
    "sms_nhac_no_vay": "loan",           # / số KH có dư nợ vay
    "tin_nhan_ott": "agribank_plus",     # / số KH đăng ký Agribank Plus
}


def _loan_type_category_expr():
    return case(
        (LN01Loan.loan_type == "Thấu chi trên TK khách hàng", "Thấu chi"),
        (LN01Loan.loan_type == "Vay ngắn hạn (TK 211)", "Ngắn"),
        (LN01Loan.loan_type == "Vay trung hạn (TK 212)", "Trung"),
        (LN01Loan.loan_type == "Vay dài hạn (TK 213)", "Dài"),
        else_="Khác",
    )


def _build_service_penetration_rows(*, count_fn, loan_base: int, plus_base: int, total_customers: int) -> list[dict]:
    """count_fn(key, base_kind) -> số KH đã dùng dịch vụ trong đúng tập mẫu số."""
    rows = []
    for key in ACTIVE_SERVICE_KEYS:
        base_kind = SERVICE_PENETRATION_BASE.get(key)
        if base_kind == "loan":
            base = loan_base
            base_label = "KH vay"
            count = count_fn(key, "loan")
        elif base_kind == "agribank_plus":
            base = plus_base
            base_label = "KH Agribank Plus"
            count = count_fn(key, "agribank_plus")
        else:
            base = total_customers
            base_label = "KH"
            count = count_fn(key, "all")
        rows.append({
            "key": key,
            "label": SERVICE_LABELS[key],
            "group": SERVICE_GROUPS.get(key, "Khác"),
            "count": count,
            "base": base,
            "base_label": base_label,
            "pct": round((count / base) * 100) if base else 0,
        })
    rows.sort(key=lambda item: item["pct"], reverse=True)
    return rows


def _count_kh_with_payment_account(
    db: Session,
    period_key: str,
    ma_cn: str | None,
    ma_pgd: str | None,
) -> int:
    """KH có TK thanh toán theo CN05.TKTT_SO_TK > 0, trong tập KH của phạm vi dashboard."""
    q = db.query(func.count(func.distinct(CN05CustomerService.ma_kh))).filter(
        CN05CustomerService.period_key == period_key,
        CN05CustomerService.ma_kh.isnot(None),
        func.coalesce(CN05CustomerService.tktt_so_tk, 0) > 0,
    )
    if ma_cn:
        scoped_kh = (
            _branch_detail_query(db, period_key, ma_cn, ma_pgd)
            .with_entities(CustomerPeriodBranchDetail.ma_kh)
            .distinct()
            .subquery()
        )
        q = q.filter(
            CN05CustomerService.ma_cn == ma_cn.strip(),
            CN05CustomerService.ma_kh.in_(db.query(scoped_kh.c.ma_kh)),
        )
    else:
        scoped_kh = (
            _base_query(db, period_key, None, ma_pgd)
            .with_entities(CustomerPeriodProfile.ma_kh)
            .subquery()
        )
        q = q.filter(CN05CustomerService.ma_kh.in_(db.query(scoped_kh.c.ma_kh)))
    return int(q.scalar() or 0)


def _with_payment_account_penetration(
    rows: list[dict],
    *,
    db: Session,
    period_key: str,
    ma_cn: str | None,
    ma_pgd: str | None,
    total_customers: int,
) -> list[dict]:
    """Thêm chỉ tiêu độ phủ TK thanh toán / tổng KH (không ghi vào ACTIVE_SERVICE_KEYS)."""
    count = _count_kh_with_payment_account(db, period_key, ma_cn, ma_pgd)
    rows = [
        *rows,
        {
            "key": "tk_thanh_toan",
            "label": "Tài khoản thanh toán",
            "group": "Tài khoản",
            "count": count,
            "base": total_customers,
            "base_label": "KH",
            "pct": round((count / total_customers) * 100) if total_customers else 0,
        },
    ]
    rows.sort(key=lambda item: item["pct"], reverse=True)
    return rows


def _ln01_query(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None) -> OrmQuery:
    query = db.query(LN01Loan).filter(LN01Loan.period_key == period_key)
    if ma_cn:
        query = query.filter(LN01Loan.brcd == ma_cn.strip())
    if ma_pgd:
        profile_subq = (
            db.query(CustomerPeriodProfile.ma_kh)
            .filter(CustomerPeriodProfile.period_key == period_key)
            .filter(CustomerPeriodProfile.pgd_codes.ilike(f"%{ma_pgd}%"))
        )
        if ma_cn:
            profile_subq = profile_subq.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{ma_cn}%"))
        query = query.filter(LN01Loan.custseq.in_(profile_subq))
    return query


def _build_loan_type_breakdown(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None) -> list[dict]:
    category_expr = _loan_type_category_expr()
    loan_type_rows = (
        _ln01_query(db, period_key, ma_cn, ma_pgd)
        .with_entities(
            category_expr.label("loan_category"),
            func.coalesce(func.sum(LN01Loan.du_no), 0),
        )
        .group_by(category_expr)
        .all()
    )
    total_ln_amt = sum(float(amt or 0) for _, amt in loan_type_rows)
    order_map = {label: index for index, label in enumerate(LOAN_TYPE_LABELS)}
    loan_type_breakdown = [
        {
            "type": loan_category,
            "amt": float(amt or 0),
            "pct": round((float(amt or 0) / total_ln_amt) * 100) if total_ln_amt else 0,
        }
        for loan_category, amt in loan_type_rows
        if float(amt or 0) > 0
    ]
    loan_type_breakdown.sort(key=lambda item: (order_map.get(item["type"], 99), -item["amt"]))
    return loan_type_breakdown


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _base_query(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    if ma_cn:
        query = query.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{ma_cn}%"))
    if ma_pgd:
        query = query.filter(CustomerPeriodProfile.pgd_codes.ilike(f"%{ma_pgd}%"))
    return query


def _branch_detail_query(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None):
    query = db.query(CustomerPeriodBranchDetail).filter(CustomerPeriodBranchDetail.period_key == period_key)
    if ma_cn:
        query = query.filter(CustomerPeriodBranchDetail.branch_code == ma_cn.strip())
    if ma_pgd:
        query = query.filter(CustomerPeriodBranchDetail.ma_pgd == ma_pgd.strip())
    return query


def _customer_branch_agg_subquery(db: Session, period_key: str, ma_cn: str, ma_pgd: str | None):
    """Gom theo mã KH trong một chi nhánh (cộng nhiều PGD cùng CN)."""
    detail_query = _branch_detail_query(db, period_key, ma_cn, ma_pgd)
    service_max = [
        func.max(getattr(CustomerPeriodBranchDetail, key)).label(key)
        for key in ACTIVE_SERVICE_KEYS
    ]
    return (
        detail_query.with_entities(
            CustomerPeriodBranchDetail.ma_kh.label("ma_kh"),
            func.max(CustomerPeriodBranchDetail.ten_kh).label("ten_kh"),
            func.max(CustomerPeriodBranchDetail.loai_khach_hang).label("loai_khach_hang"),
            func.max(CustomerPeriodBranchDetail.ma_pgd).label("ma_pgd"),
            func.max(CustomerPeriodBranchDetail.ten_pgd).label("ten_pgd"),
            func.max(CustomerPeriodBranchDetail.loai_vay).label("loai_vay"),
            func.max(CustomerPeriodBranchDetail.ma_cb).label("ma_cb"),
            func.max(CustomerPeriodBranchDetail.ten_can_bo).label("ten_can_bo"),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0).label("so_du_tien_vay"),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_gui), 0).label("so_du_tien_gui"),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0).label("so_du_tgtt_binh_quan"),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.doanh_so_cramt), 0).label("doanh_so_cramt"),
            *service_max,
        )
        .group_by(CustomerPeriodBranchDetail.ma_kh)
        .subquery()
    )


def _build_officer_leaderboard(
    db: Session,
    period_key: str,
    ma_cn: str | None,
    ma_pgd: str | None,
) -> list[dict]:
    """Top cán bộ theo dư nợ. Có CN → branch_details; chọn tất cả → profiles toàn tỉnh (không trùng KH)."""
    if ma_cn:
        source_query = _branch_detail_query(db, period_key, ma_cn, ma_pgd)
        model = CustomerPeriodBranchDetail
        cust_count_expr = func.count(func.distinct(model.ma_kh))
    else:
        source_query = _base_query(db, period_key, None, ma_pgd)
        model = CustomerPeriodProfile
        cust_count_expr = func.count(model.ma_kh)

    loan_expr = func.coalesce(func.sum(model.so_du_tien_vay), 0)
    casa_expr = func.coalesce(func.sum(model.so_du_tgtt_binh_quan), 0)
    service_exprs = [
        func.coalesce(func.sum(getattr(model, key)), 0).label(key)
        for key in ACTIVE_SERVICE_KEYS
    ]
    emp_code_expr = getattr(model, "officer_employee_code", model.ma_cb)
    officer_rows = (
        source_query.filter(model.ma_cb.isnot(None))
        .with_entities(
            model.ma_cb,
            model.ten_can_bo,
            emp_code_expr,
            cust_count_expr,
            loan_expr,
            casa_expr,
            *service_exprs,
        )
        .group_by(model.ma_cb, model.ten_can_bo, emp_code_expr)
        .all()
    )

    officer_leaderboard = []
    for row in officer_rows:
        ma_cb, ten_can_bo, officer_employee_code, cust_count, total_loan_amt, total_casa = row[:6]
        used_services_total = sum(float(value or 0) for value in row[6:])
        officer_leaderboard.append({
            "code": ma_cb,
            "employeeCode": officer_employee_code,
            "name": ten_can_bo or ma_cb,
            "custCount": cust_count,
            "totalLoan": float(total_loan_amt or 0),
            "totalCASA": float(total_casa or 0),
            "avgCrossSell": round(used_services_total / cust_count, 1) if cust_count else 0,
        })
    officer_leaderboard.sort(key=lambda item: item["totalLoan"], reverse=True)
    return officer_leaderboard[:20]


def _count_used_from_mapping(row) -> int:
    return sum(1 for key in ACTIVE_SERVICE_KEYS if _as_number(getattr(row, key, 0)) > 0)


def _as_number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _unused_services_from_mapping(row) -> list[dict]:
    unused = []
    loai = getattr(row, "loai_khach_hang", None) or ""
    priority = CAMPAIGN_GROUP_PRIORITY.get(
        "KHCN" if loai in RETAIL_CUSTOMER_TYPES else "KHDN",
        CAMPAIGN_GROUP_PRIORITY["KHCN"],
    )
    for key in ACTIVE_SERVICE_KEYS:
        if _as_number(getattr(row, key, 0)) == 0:
            unused.append({"key": key, "label": SERVICE_LABELS[key], "group": SERVICE_GROUPS.get(key, "Khác")})
    unused.sort(key=lambda item: priority.index(item["group"]) if item["group"] in priority else 99)
    return unused


def _count_used(row: CustomerPeriodProfile) -> int:
    return sum(1 for key in ACTIVE_SERVICE_KEYS if getattr(row, key, 0) > 0)


def _unused_services(row: CustomerPeriodProfile) -> list[dict]:
    unused = []
    for key in ACTIVE_SERVICE_KEYS:
        if getattr(row, key, 0) == 0:
            unused.append({"key": key, "label": SERVICE_LABELS[key], "group": SERVICE_GROUPS.get(key, "Khác")})
    priority_key = "KHCN" if (row.loai_khach_hang or "") in RETAIL_CUSTOMER_TYPES else "KHDN"
    priority = CAMPAIGN_GROUP_PRIORITY.get(priority_key, CAMPAIGN_GROUP_PRIORITY["KHCN"])
    unused.sort(key=lambda item: priority.index(item["group"]) if item["group"] in priority else 99)
    return unused


def _used_count_expr(model=CustomerPeriodProfile):
    return sum(getattr(model, key) for key in ACTIVE_SERVICE_KEYS)


def _asset_expr(model=CustomerPeriodProfile):
    return (
        func.coalesce(model.so_du_tien_vay, 0)
        + func.coalesce(model.so_du_tien_gui, 0)
        + func.coalesce(model.so_du_tgtt_binh_quan, 0)
    )


def _no_service_condition(model=CustomerPeriodProfile):
    return and_(*(getattr(model, key) == 0 for key in ACTIVE_SERVICE_KEYS))


def _row_to_dict(row: CustomerPeriodProfile) -> dict:
    data = {
        "period_key": row.period_key,
        "ma_kh_chuan": row.ma_kh,
        "ma_cn": row.branch_codes,
        "ma_pgd": row.pgd_codes,
        "ma_kh": row.ma_kh,
        "ten_kh": row.ten_kh,
        "loai_khach_hang": row.loai_khach_hang,
        "so_du_tien_vay": row.so_du_tien_vay,
        "so_du_tien_gui_ckh": row.so_du_tien_gui,
        "loai_vay": row.loai_vay,
        "doanh_so_chuyen_tien_ve_tai_khoan": row.doanh_so_chuyen_tien_ve_tk,
        "so_du_tgtt_binh_quan": row.so_du_tgtt_binh_quan,
        "ma_cb": row.ma_cb,
        "ten_can_bo": row.ten_can_bo,
        "officer_employee_code": row.officer_employee_code,
        "telephone": row.telephone,
    }
    for key in ACTIVE_SERVICE_KEYS:
        data[key] = getattr(row, key)
    return {field: serialize_value(value) for field, value in data.items()}


def _branch_row_to_campaign(period_key: str, branch_code: str, row) -> dict:
    total_assets = (
        _as_number(row.so_du_tien_vay)
        + _as_number(row.so_du_tien_gui)
        + _as_number(row.so_du_tgtt_binh_quan)
    )
    used_count = _count_used_from_mapping(row)
    unused = _unused_services_from_mapping(row)
    data = {
        "period_key": period_key,
        "ma_kh_chuan": row.ma_kh,
        "ma_cn": branch_code,
        "ma_pgd": row.ma_pgd,
        "ma_kh": row.ma_kh,
        "ten_kh": row.ten_kh,
        "loai_khach_hang": row.loai_khach_hang,
        "so_du_tien_vay": row.so_du_tien_vay,
        "so_du_tien_gui_ckh": row.so_du_tien_gui,
        "loai_vay": row.loai_vay,
        "doanh_so_chuyen_tien_ve_tai_khoan": row.doanh_so_cramt,
        "so_du_tgtt_binh_quan": row.so_du_tgtt_binh_quan,
        "ma_cb": row.ma_cb,
        "ten_can_bo": row.ten_can_bo,
        "telephone": None,
        "totalAssets": total_assets,
        "usedCount": used_count,
        "unused": unused,
        "crossSellPct": round((used_count / len(ACTIVE_SERVICE_KEYS)) * 100),
    }
    for key in ACTIVE_SERVICE_KEYS:
        data[key] = getattr(row, key)
    return {field: serialize_value(value) if field not in {"unused"} else value for field, value in data.items()}


def _summary_from_profiles(db: Session, period_key: str, ma_pgd: str | None) -> dict:
    """Toàn tỉnh: 1 mã KH = 1 hồ sơ, không cộng trùng theo chi nhánh."""
    query = _base_query(db, period_key, None, ma_pgd)
    retail_filter = CustomerPeriodProfile.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES)
    aggregate_columns = [
        func.count(CustomerPeriodProfile.id),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_gui), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
        func.sum(case((CustomerPeriodProfile.so_du_tien_vay > 0, 1), else_=0)),
        func.sum(case((CustomerPeriodProfile.agribank_plus > 0, 1), else_=0)),
        func.sum(case((retail_filter, 1), else_=0)),
        func.coalesce(func.sum(case((retail_filter, CustomerPeriodProfile.so_du_tien_vay), else_=0)), 0),
        func.sum(case((_no_service_condition(), 1), else_=0)),
    ]
    for key in ACTIVE_SERVICE_KEYS:
        base_kind = SERVICE_PENETRATION_BASE.get(key, "all")
        condition = getattr(CustomerPeriodProfile, key) > 0
        if base_kind == "loan":
            condition = and_(condition, CustomerPeriodProfile.so_du_tien_vay > 0)
        elif base_kind == "agribank_plus":
            condition = and_(condition, CustomerPeriodProfile.agribank_plus > 0)
        aggregate_columns.append(func.sum(case((condition, 1), else_=0)))
    aggregate = query.with_entities(*aggregate_columns).one()

    total_customers = int(aggregate[0] or 0)
    totals = aggregate[1:4]
    loan_base = int(aggregate[4] or 0)
    plus_base = int(aggregate[5] or 0)
    service_counts = {
        key: int(aggregate[9 + index] or 0)
        for index, key in enumerate(ACTIVE_SERVICE_KEYS)
    }

    service_penetration = _build_service_penetration_rows(
        count_fn=lambda key, _base_kind: service_counts[key],
        loan_base=loan_base,
        plus_base=plus_base,
        total_customers=total_customers,
    )
    service_penetration = _with_payment_account_penetration(
        service_penetration,
        db=db,
        period_key=period_key,
        ma_cn=None,
        ma_pgd=ma_pgd,
        total_customers=total_customers,
    )

    cn_count = int(aggregate[6] or 0)
    dn_count = max(total_customers - cn_count, 0)
    cn_loan = aggregate[7] or 0
    total_loan_amt = float(totals[0] or 0)
    dn_loan = max(total_loan_amt - float(cn_loan or 0), 0)
    no_service_count = int(aggregate[8] or 0)

    campaign_candidates = []
    campaign_rows = (
        query.filter(_asset_expr() >= 80_000_000)
        .filter(_used_count_expr() <= 2)
        .order_by(desc(_asset_expr()), _used_count_expr())
        .limit(50)
        .all()
    )
    for row in campaign_rows:
        total_assets = float(row.so_du_tien_vay or 0) + float(row.so_du_tien_gui or 0) + float(row.so_du_tgtt_binh_quan or 0)
        used_count = _count_used(row)
        unused = _unused_services(row)
        campaign_candidates.append({
            **_row_to_dict(row),
            "totalAssets": total_assets,
            "usedCount": used_count,
            "unused": unused,
            "crossSellPct": round((used_count / len(ACTIVE_SERVICE_KEYS)) * 100),
        })
    campaign_candidates.sort(key=lambda item: (-item["totalAssets"], item["usedCount"]))

    return {
        "kpis": {
            "total_customers": total_customers,
            "total_loan": float(totals[0] or 0),
            "total_deposit": float(totals[1] or 0),
            "total_casa": float(totals[2] or 0),
            "no_service_count": no_service_count,
        },
        "service_penetration": service_penetration,
        "segment": {
            "cn": cn_count,
            "dn": dn_count,
            "cn_loan": float(cn_loan or 0),
            "dn_loan": float(dn_loan or 0),
        },
        "campaign_top5": campaign_candidates[:5],
    }


def _summary_from_branch(db: Session, period_key: str, ma_cn: str, ma_pgd: str | None) -> dict:
    """Theo chi nhánh: số liệu lấy từ branch_details, không lấy tổng hồ sơ đa CN."""
    agg = _customer_branch_agg_subquery(db, period_key, ma_cn, ma_pgd)

    total_customers = db.query(func.count()).select_from(agg).scalar() or 0
    totals = db.query(
        func.coalesce(func.sum(agg.c.so_du_tien_vay), 0),
        func.coalesce(func.sum(agg.c.so_du_tien_gui), 0),
        func.coalesce(func.sum(agg.c.so_du_tgtt_binh_quan), 0),
    ).one()

    loan_base = (
        db.query(func.count()).select_from(agg).filter(agg.c.so_du_tien_vay > 0).scalar() or 0
    )
    plus_base = (
        db.query(func.count()).select_from(agg).filter(agg.c.agribank_plus > 0).scalar() or 0
    )

    def _branch_service_count(key: str, base_kind: str) -> int:
        q = db.query(func.count()).select_from(agg)
        if base_kind == "loan":
            q = q.filter(agg.c.so_du_tien_vay > 0)
        elif base_kind == "agribank_plus":
            q = q.filter(agg.c.agribank_plus > 0)
        return q.filter(getattr(agg.c, key) > 0).scalar() or 0

    service_penetration = _build_service_penetration_rows(
        count_fn=_branch_service_count,
        loan_base=loan_base,
        plus_base=plus_base,
        total_customers=total_customers,
    )
    service_penetration = _with_payment_account_penetration(
        service_penetration,
        db=db,
        period_key=period_key,
        ma_cn=ma_cn,
        ma_pgd=ma_pgd,
        total_customers=total_customers,
    )

    cn_count = (
        db.query(func.count())
        .select_from(agg)
        .filter(agg.c.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES))
        .scalar()
        or 0
    )
    dn_count = max(total_customers - cn_count, 0)
    cn_loan = (
        db.query(func.coalesce(func.sum(agg.c.so_du_tien_vay), 0))
        .filter(agg.c.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES))
        .scalar()
        or 0
    )
    total_loan_amt = float(totals[0] or 0)
    dn_loan = max(total_loan_amt - float(cn_loan or 0), 0)

    used_expr = sum(getattr(agg.c, key) for key in ACTIVE_SERVICE_KEYS)
    asset_expr = (
        func.coalesce(agg.c.so_du_tien_vay, 0)
        + func.coalesce(agg.c.so_du_tien_gui, 0)
        + func.coalesce(agg.c.so_du_tgtt_binh_quan, 0)
    )
    no_service_count = (
        db.query(func.count())
        .select_from(agg)
        .filter(and_(*(getattr(agg.c, key) == 0 for key in ACTIVE_SERVICE_KEYS)))
        .scalar()
        or 0
    )

    campaign_rows = (
        db.query(agg)
        .filter(asset_expr >= 80_000_000)
        .filter(used_expr <= 2)
        .order_by(desc(asset_expr), used_expr)
        .limit(50)
        .all()
    )
    campaign_candidates = [_branch_row_to_campaign(period_key, ma_cn, row) for row in campaign_rows]
    campaign_candidates.sort(key=lambda item: (-item["totalAssets"], item["usedCount"]))

    return {
        "kpis": {
            "total_customers": total_customers,
            "total_loan": float(totals[0] or 0),
            "total_deposit": float(totals[1] or 0),
            "total_casa": float(totals[2] or 0),
            "no_service_count": no_service_count,
        },
        "service_penetration": service_penetration,
        "segment": {
            "cn": cn_count,
            "dn": dn_count,
            "cn_loan": float(cn_loan or 0),
            "dn_loan": float(dn_loan or 0),
        },
        "campaign_top5": campaign_candidates[:5],
    }


@router.get("/summary")
def dashboard_summary(
    period_key: str = Query(...),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    cache_key = (period_key, scope.ma_cn, scope.ma_pgd)
    cached = _SUMMARY_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < _INSIGHTS_CACHE_TTL_SECONDS:
        return cached[1]

    if scope.ma_cn:
        payload = _summary_from_branch(db, period_key, scope.ma_cn, scope.ma_pgd)
    else:
        payload = _summary_from_profiles(db, period_key, scope.ma_pgd)

    loan_type_breakdown = _build_loan_type_breakdown(db, period_key, scope.ma_cn, scope.ma_pgd)
    officer_leaderboard = _build_officer_leaderboard(db, period_key, scope.ma_cn, scope.ma_pgd)

    result = {
        "period_key": period_key,
        "ma_cn": scope.ma_cn,
        "ma_pgd": scope.ma_pgd,
        "kpis": payload["kpis"],
        "service_penetration": payload["service_penetration"],
        "officer_leaderboard": officer_leaderboard,
        "loan_type_breakdown": loan_type_breakdown,
        "segment": payload["segment"],
        "campaign_top5": payload["campaign_top5"],
    }
    _SUMMARY_CACHE[cache_key] = (monotonic(), result)
    return result


def _period_trend_totals(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None) -> tuple[float, float]:
    """Tổng dư nợ / CASA theo kỳ. Khi chọn chi nhánh thì lấy số liệu trong branch_details."""
    if ma_cn:
        detail_query = _branch_detail_query(db, period_key, ma_cn, ma_pgd)
        totals = detail_query.with_entities(
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0),
        ).one()
        return float(totals[0] or 0), float(totals[1] or 0)

    query = _base_query(db, period_key, None, ma_pgd)
    totals = query.with_entities(
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
    ).one()
    return float(totals[0] or 0), float(totals[1] or 0)


@router.get("/trends")
def dashboard_trends(
    periods: int = Query(default=6, ge=1, le=12),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    period_keys = [
        item.period_key
        for item in db.query(CustomerPeriodProfile.period_key)
        .distinct()
        .order_by(desc(CustomerPeriodProfile.period_key))
        .limit(periods)
        .all()
    ]
    period_keys.reverse()

    labels = []
    loans = []
    casa_values = []

    for index, period_key in enumerate(period_keys):
        total_loan, total_casa = _period_trend_totals(db, period_key, scope.ma_cn, scope.ma_pgd)
        is_current = index == len(period_keys) - 1
        month_label = f"T{period_key[4:6]}" if len(period_key) >= 6 else period_key
        if is_current:
            month_label = f"{month_label} (Hiện tại)"
        labels.append(month_label)
        loans.append(round(total_loan / 1e9, 2))
        casa_values.append(round(total_casa / 1e9, 2))

    return {
        "period_keys": period_keys,
        "labels": labels,
        "loans": loans,
        "casa": casa_values,
        "ma_cn": scope.ma_cn,
        "ma_pgd": scope.ma_pgd,
    }


@router.get("/insights")
def dashboard_insights(
    period_key: str = Query(...),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    cache_key = (period_key, scope.ma_cn, scope.ma_pgd)
    cached = _INSIGHTS_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < _INSIGHTS_CACHE_TTL_SECONDS:
        return cached[1]

    current = aliased(CustomerPeriodProfile)
    previous = aliased(CustomerPeriodProfile)
    previous_period = (
        db.query(func.max(CustomerPeriodProfile.period_key))
        .filter(CustomerPeriodProfile.period_key < period_key)
        .scalar()
    )
    joined = (
        db.query(current, previous)
        .outerjoin(
            previous,
            and_(
                previous.period_key == previous_period,
                previous.ma_kh == current.ma_kh,
            ),
        )
        .filter(current.period_key == period_key)
    )
    if scope.ma_cn:
        joined = joined.filter(current.branch_codes.ilike(f"%{scope.ma_cn}%"))
    if scope.ma_pgd:
        joined = joined.filter(current.pgd_codes.ilike(f"%{scope.ma_pgd}%"))

    current_deposit = (
        func.coalesce(current.so_du_tien_gui, 0)
        + func.coalesce(current.so_du_tgtt_binh_quan, 0)
    )
    previous_deposit = (
        func.coalesce(previous.so_du_tien_gui, 0)
        + func.coalesce(previous.so_du_tgtt_binh_quan, 0)
    )
    current_services = sum(func.coalesce(getattr(current, key), 0) for key in ACTIVE_SERVICE_KEYS)
    previous_services = sum(func.coalesce(getattr(previous, key), 0) for key in ACTIVE_SERVICE_KEYS)

    overview = joined.with_entities(
        func.count(current.id),
        func.sum(case((current_deposit > 0, 1), else_=0)),
        func.sum(case((func.coalesce(current.so_du_tien_vay, 0) > 0, 1), else_=0)),
        func.sum(case((current_services > 0, 1), else_=0)),
        func.sum(case((func.coalesce(current.branch_count, 0) > 1, 1), else_=0)),
        func.coalesce(func.sum(current_deposit), 0),
        func.coalesce(func.sum(previous_deposit), 0),
        func.coalesce(func.sum(current.so_du_tien_vay), 0),
        func.coalesce(func.sum(previous.so_du_tien_vay), 0),
        func.sum(case((and_(previous.id.isnot(None), current_deposit <= previous_deposit * 0.7, previous_deposit > 0), 1), else_=0)),
        func.sum(case((and_(previous.id.isnot(None), func.coalesce(current.so_du_tien_vay, 0) >= func.coalesce(previous.so_du_tien_vay, 0) * 1.3, func.coalesce(previous.so_du_tien_vay, 0) > 0), 1), else_=0)),
        func.sum(case((and_(previous.id.isnot(None), current_services < previous_services), 1), else_=0)),
    ).one()

    anomaly_condition = or_(
        and_(previous.id.isnot(None), previous_deposit > 0, current_deposit <= previous_deposit * 0.7),
        and_(
            previous.id.isnot(None),
            func.coalesce(previous.so_du_tien_vay, 0) > 0,
            func.coalesce(current.so_du_tien_vay, 0) >= func.coalesce(previous.so_du_tien_vay, 0) * 1.3,
        ),
        and_(previous.id.isnot(None), current_services < previous_services),
    )
    anomaly_rows = (
        joined.filter(anomaly_condition)
        .order_by(desc(func.abs(current_deposit - previous_deposit)))
        .limit(12)
        .all()
    )
    anomalies = []
    for row, old in anomaly_rows:
        flags = []
        now_deposit = float((row.so_du_tien_gui or 0) + (row.so_du_tgtt_binh_quan or 0))
        old_deposit = float((old.so_du_tien_gui or 0) + (old.so_du_tgtt_binh_quan or 0)) if old else 0
        if old_deposit > 0 and now_deposit <= old_deposit * 0.7:
            flags.append("Tiền gửi giảm mạnh")
        if old and float(old.so_du_tien_vay or 0) > 0 and float(row.so_du_tien_vay or 0) >= float(old.so_du_tien_vay or 0) * 1.3:
            flags.append("Dư nợ tăng nhanh")
        now_services = sum(float(getattr(row, key) or 0) for key in ACTIVE_SERVICE_KEYS)
        old_services = sum(float(getattr(old, key) or 0) for key in ACTIVE_SERVICE_KEYS) if old else 0
        if old and now_services < old_services:
            flags.append("Giảm sản phẩm")
        anomalies.append({
            "id": row.id,
            "ma_kh": row.ma_kh,
            "ten_kh": row.ten_kh,
            "primary_branch_code": row.primary_branch_code,
            "branch_codes": row.branch_codes,
            "deposit": now_deposit,
            "previous_deposit": old_deposit,
            "loan": float(row.so_du_tien_vay or 0),
            "previous_loan": float(old.so_du_tien_vay or 0) if old else 0,
            "flags": flags,
        })

    pf_previous_period = (
        db.query(func.max(PF14AccountBalance.period_key))
        .filter(PF14AccountBalance.period_key < period_key)
        .scalar()
    )
    new_accounts = 0
    closed_accounts = 0
    if pf_previous_period:
        current_accounts_query = db.query(
            PF14AccountBalance.trbrcd.label("branch"),
            PF14AccountBalance.custseq.label("customer"),
            PF14AccountBalance.accountno.label("account"),
        ).filter(PF14AccountBalance.period_key == period_key)
        previous_accounts_query = db.query(
            PF14AccountBalance.trbrcd.label("branch"),
            PF14AccountBalance.custseq.label("customer"),
            PF14AccountBalance.accountno.label("account"),
        ).filter(PF14AccountBalance.period_key == pf_previous_period)
        if scope.ma_cn:
            current_accounts_query = current_accounts_query.filter(PF14AccountBalance.trbrcd == scope.ma_cn)
            previous_accounts_query = previous_accounts_query.filter(PF14AccountBalance.trbrcd == scope.ma_cn)
        current_accounts = current_accounts_query.subquery()
        previous_accounts = previous_accounts_query.subquery()
        account_changes = (
            db.query(
                func.sum(case((previous_accounts.c.account.is_(None), 1), else_=0)),
                func.sum(case((current_accounts.c.account.is_(None), 1), else_=0)),
            )
            .select_from(current_accounts)
            .join(
                previous_accounts,
                and_(
                    previous_accounts.c.branch == current_accounts.c.branch,
                    previous_accounts.c.customer == current_accounts.c.customer,
                    previous_accounts.c.account == current_accounts.c.account,
                ),
                full=True,
            )
            .one()
        )
        new_accounts = int(account_changes[0] or 0)
        closed_accounts = int(account_changes[1] or 0)

    ln_query = _ln01_query(db, period_key, scope.ma_cn, scope.ma_pgd)
    period_date = datetime.strptime(period_key, "%Y%m%d").date()
    next_month_start = date(period_date.year + (period_date.month == 12), 1 if period_date.month == 12 else period_date.month + 1, 1)
    next_month_end = date(next_month_start.year + (next_month_start.month == 12), 1 if next_month_start.month == 12 else next_month_start.month + 1, 1)
    obligations = ln_query.with_entities(
        func.coalesce(func.sum(case((and_(LN01Loan.next_repayment_date >= next_month_start, LN01Loan.next_repayment_date < next_month_end), LN01Loan.next_repayment_amount), else_=0)), 0),
        func.coalesce(func.sum(case((and_(LN01Loan.next_interest_repayment_date >= next_month_start, LN01Loan.next_interest_repayment_date < next_month_end), LN01Loan.total_interest_repayment_amount), else_=0)), 0),
        func.coalesce(func.sum(LN01Loan.pastdue_interest_amount), 0),
        func.count(func.distinct(case((func.coalesce(LN01Loan.pastdue_interest_amount, 0) > 0, LN01Loan.custseq)))),
        func.count(LN01Loan.next_repayment_date),
    ).one()

    result = {
        "period_key": period_key,
        "previous_period": previous_period,
        "customer_overview": {
            "total": int(overview[0] or 0),
            "with_deposit": int(overview[1] or 0),
            "with_loan": int(overview[2] or 0),
            "with_digital_service": int(overview[3] or 0),
            "multi_branch": int(overview[4] or 0),
        },
        "deposit": {
            "total": float(overview[5] or 0),
            "previous_total": float(overview[6] or 0),
            "change": float((overview[5] or 0) - (overview[6] or 0)),
            "new_accounts": int(new_accounts or 0),
            "closed_accounts": int(closed_accounts or 0),
            "large_drop_customers": int(overview[9] or 0),
        },
        "credit": {
            "total": float(overview[7] or 0),
            "previous_total": float(overview[8] or 0),
            "change": float((overview[7] or 0) - (overview[8] or 0)),
            "principal_due_next_month": float(obligations[0] or 0),
            "interest_due_next_month": float(obligations[1] or 0),
            "overdue_interest": float(obligations[2] or 0),
            "overdue_customers": int(obligations[3] or 0),
            "obligation_source_available": bool(obligations[4]),
        },
        "abnormal": {
            "deposit_drop_count": int(overview[9] or 0),
            "loan_increase_count": int(overview[10] or 0),
            "service_drop_count": int(overview[11] or 0),
            "items": anomalies,
        },
    }
    _INSIGHTS_CACHE[cache_key] = (monotonic(), result)
    return result
