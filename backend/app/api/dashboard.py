from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from time import monotonic

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
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
    ReportSourceStatus,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
_INSIGHTS_CACHE: dict[tuple[str, str | None, str | None], tuple[float, dict]] = {}
_SUMMARY_CACHE: dict[tuple[str, str | None, str | None], tuple[float, dict]] = {}
_BUSINESS_CACHE: dict[tuple[str, str | None, str | None], tuple[float, dict]] = {}
_BUSINESS_TREND_CACHE: dict[tuple[int, str | None, str | None], tuple[float, dict]] = {}
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
    "ttqt",
    "thuho_dt",
]
FEE_FIELDS = ("phi_bao_lanh", "phi_chuyen_tien", "phi_nhdt", "abic_batd", "phi_kdnt", "phi_lc", "phi_ttqt")


def _advanced_filters(
    keyword: str | None = Query(default=None), customer_type: str | None = Query(default=None),
    loan_type: str | None = Query(default=None), officer_code: str | None = Query(default=None),
    multi_branch: bool | None = Query(default=None), no_service: bool = Query(default=False),
    has_deposit: bool | None = Query(default=None), has_loan: bool | None = Query(default=None),
    min_deposit: float | None = Query(default=None, ge=0), max_deposit: float | None = Query(default=None, ge=0),
    min_loan: float | None = Query(default=None, ge=0), max_loan: float | None = Query(default=None, ge=0),
    min_casa: float | None = Query(default=None, ge=0), max_casa: float | None = Query(default=None, ge=0),
    service_codes: str | None = Query(default=None), min_service_count: int | None = Query(default=None, ge=0, le=30),
    missing_phone: bool | None = Query(default=None),
):
    values = {key: value for key, value in locals().items() if value is not None and value != ""}
    if not no_service:
        values.pop("no_service", None)
    return values


def _matching_customer_ids(db: Session, period_key: str, scope: BranchScope, filters: dict):
    """Một tập mã KH duy nhất dùng chung cho KPI, bảng tổng hợp, cảnh báo và drill-down."""
    from app.api.customer_processing import apply_profile_filters

    query = db.query(CustomerPeriodProfile.ma_kh).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        branch_code=scope.ma_cn,
        pgd_code=scope.ma_pgd,
        **filters,
    )
    return query.distinct().subquery()


def _restrict_to_matching_customers(query, model, customer_ids):
    return query.filter(model.ma_kh.in_(customer_ids))

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
    "ttqt": "LC/TTQT/KDNT",
    "thuho_dt": "Thu hộ điện thoại/viễn thông",
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
    "ttqt": "Bảo lãnh/TTQT",
    "thuho_dt": "Thanh toán",
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
    customer_ids=None,
) -> int:
    """KH có TK thanh toán theo CN05.TKTT_SO_TK > 0, trong tập KH của phạm vi dashboard."""
    q = db.query(func.count(func.distinct(CN05CustomerService.ma_kh))).filter(
        CN05CustomerService.period_key == period_key,
        CN05CustomerService.ma_kh.isnot(None),
        func.coalesce(CN05CustomerService.tktt_so_tk, 0) > 0,
    )
    if customer_ids is not None:
        q = q.filter(CN05CustomerService.ma_kh.in_(db.query(customer_ids.c.ma_kh)))
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
    customer_ids=None,
) -> list[dict]:
    """Thêm chỉ tiêu độ phủ TK thanh toán / tổng KH (không ghi vào ACTIVE_SERVICE_KEYS)."""
    count = _count_kh_with_payment_account(db, period_key, ma_cn, ma_pgd, customer_ids)
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


def _summary_from_profiles(db: Session, period_key: str, ma_pgd: str | None, customer_ids=None) -> dict:
    """Toàn tỉnh: 1 mã KH = 1 hồ sơ, không cộng trùng theo chi nhánh."""
    query = _base_query(db, period_key, None, ma_pgd)
    if customer_ids is not None:
        query = query.filter(CustomerPeriodProfile.ma_kh.in_(customer_ids))
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
        customer_ids=customer_ids,
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


def _summary_from_branch(db: Session, period_key: str, ma_cn: str, ma_pgd: str | None, customer_ids=None) -> dict:
    """Theo chi nhánh: số liệu lấy từ branch_details, không lấy tổng hồ sơ đa CN."""
    agg = _customer_branch_agg_subquery(db, period_key, ma_cn, ma_pgd)
    if customer_ids is not None:
        agg = db.query(agg).filter(agg.c.ma_kh.in_(customer_ids)).subquery()

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
        customer_ids=customer_ids,
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
    filters: dict = Depends(_advanced_filters),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    filter_key = tuple(sorted((key, str(value)) for key, value in filters.items()))
    cache_key = (period_key, scope.ma_cn, f"{scope.ma_pgd or ''}:{filter_key}")
    cached = _SUMMARY_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < _INSIGHTS_CACHE_TTL_SECONDS:
        return cached[1]

    customer_ids = _matching_customer_ids(db, period_key, scope, filters)
    if scope.ma_cn:
        payload = _summary_from_branch(db, period_key, scope.ma_cn, scope.ma_pgd, customer_ids)
    else:
        payload = _summary_from_profiles(db, period_key, scope.ma_pgd, customer_ids)

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


def _analytics_source(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None):
    """Return the correctly scoped, non-duplicated source for executive analytics."""
    if ma_cn:
        return _branch_detail_query(db, period_key, ma_cn, ma_pgd), CustomerPeriodBranchDetail
    return _base_query(db, period_key, None, ma_pgd), CustomerPeriodProfile


@router.get("/business-analytics")
def dashboard_business_analytics(
    period_key: str = Query(...),
    include_rankings: bool = Query(default=True),
    filters: dict = Depends(_advanced_filters),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    """Compact aggregate shared by the executive dashboard and four domain pages."""
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    filter_key = tuple(sorted((key, str(value)) for key, value in filters.items()))
    cache_key = (period_key, scope.ma_cn, f"{scope.ma_pgd or ''}:{int(include_rankings)}:{filter_key}")
    cached = _BUSINESS_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < _INSIGHTS_CACHE_TTL_SECONDS:
        return cached[1]
    query, model = _analytics_source(db, period_key, scope.ma_cn, scope.ma_pgd)
    customer_ids = _matching_customer_ids(db, period_key, scope, filters)
    query = _restrict_to_matching_customers(query, model, customer_ids)
    fee_expr = sum(func.coalesce(getattr(model, field), 0) for field in FEE_FIELDS)
    service_expr = sum(func.coalesce(getattr(model, field), 0) for field in ACTIVE_SERVICE_KEYS)
    service_count_exprs = []
    for key in ACTIVE_SERVICE_KEYS:
        condition = getattr(model, key) > 0
        base_kind = SERVICE_PENETRATION_BASE.get(key)
        if base_kind == "loan":
            condition = and_(condition, func.coalesce(model.so_du_tien_vay, 0) > 0)
        elif base_kind == "agribank_plus":
            condition = and_(condition, model.agribank_plus > 0)
        service_count_exprs.append(func.sum(case((condition, 1), else_=0)))
    fee_count_exprs = [
        func.sum(case((func.coalesce(getattr(model, field), 0) != 0, 1), else_=0))
        for field in FEE_FIELDS
    ]
    totals = query.with_entities(
        func.count(func.distinct(model.ma_kh)),
        func.coalesce(func.sum(model.so_du_tien_gui), 0),
        func.coalesce(func.sum(model.so_du_tgtt_binh_quan), 0),
        func.coalesce(func.sum(model.doanh_so_chuyen_tien_ve_tk if model is CustomerPeriodProfile else model.doanh_so_cramt), 0),
        func.coalesce(func.sum(model.so_du_tien_vay), 0),
        func.coalesce(func.sum(model.du_no_ngan_han), 0),
        func.coalesce(func.sum(model.du_no_trung_dai_han), 0),
        func.coalesce(func.sum(model.du_no_thau_chi), 0),
        func.coalesce(func.sum(model.dprr_chung_tt), 0),
        func.coalesce(func.sum(model.dprr_chung_lk), 0),
        func.coalesce(func.sum(model.dprr_cuthe_tt), 0),
        func.coalesce(func.sum(model.dprr_cuthe_lk), 0),
        func.coalesce(func.sum(getattr(model, "du_no_xlrr", 0)), 0) if model is CustomerPeriodProfile else 0,
        func.coalesce(func.sum(getattr(model, "ds_thu_no_xlrr", 0)), 0) if model is CustomerPeriodProfile else 0,
        func.coalesce(func.sum(model.phi_bao_lanh), 0),
        func.coalesce(func.sum(model.phi_chuyen_tien), 0),
        func.coalesce(func.sum(model.phi_nhdt), 0),
        func.coalesce(func.sum(model.abic_batd), 0),
        func.coalesce(func.sum(model.phi_kdnt), 0),
        func.coalesce(func.sum(model.phi_lc), 0),
        func.coalesce(func.sum(model.phi_ttqt), 0),
        func.sum(case((service_expr > 0, 1), else_=0)),
        func.sum(case((func.coalesce(model.so_du_tien_gui, 0) + func.coalesce(model.so_du_tgtt_binh_quan, 0) > 0, 1), else_=0)),
        func.sum(case((func.coalesce(model.so_du_tien_vay, 0) > 0, 1), else_=0)),
        *service_count_exprs,
        func.sum(case((model.agribank_plus > 0, 1), else_=0)),
        *fee_count_exprs,
    ).one()

    fee_count_start = 25 + len(ACTIVE_SERVICE_KEYS)
    fee_rows = [
        {"key": "phi_bao_lanh", "label": "Phí bảo lãnh", "value": float(totals[14] or 0), "customers": int(totals[fee_count_start] or 0)},
        {"key": "phi_chuyen_tien", "label": "Phí chuyển tiền", "value": float(totals[15] or 0), "customers": int(totals[fee_count_start + 1] or 0)},
        {"key": "phi_nhdt", "label": "Phí ngân hàng điện tử", "value": float(totals[16] or 0), "customers": int(totals[fee_count_start + 2] or 0)},
        {"key": "abic_batd", "label": "Phí ABIC/BATĐ", "value": float(totals[17] or 0), "customers": int(totals[fee_count_start + 3] or 0)},
        {"key": "phi_kdnt", "label": "Phí kinh doanh ngoại tệ", "value": float(totals[18] or 0), "customers": int(totals[fee_count_start + 4] or 0)},
        {"key": "phi_lc", "label": "Phí LC", "value": float(totals[19] or 0), "customers": int(totals[fee_count_start + 5] or 0)},
        {"key": "phi_ttqt", "label": "Phí thanh toán quốc tế", "value": float(totals[20] or 0), "customers": int(totals[fee_count_start + 6] or 0)},
    ]
    for item in fee_rows:
        item["average"] = item["value"] / item["customers"] if item["customers"] else 0

    branch_rows_query = db.query(
        CustomerPeriodBranchDetail.branch_code,
        func.count(func.distinct(CustomerPeriodBranchDetail.ma_kh)),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_gui), 0),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0),
        func.coalesce(func.sum(
            func.coalesce(CustomerPeriodBranchDetail.phi_bao_lanh, 0)
            + func.coalesce(CustomerPeriodBranchDetail.phi_chuyen_tien, 0)
            + func.coalesce(CustomerPeriodBranchDetail.phi_nhdt, 0)
            + func.coalesce(CustomerPeriodBranchDetail.abic_batd, 0)
            + func.coalesce(CustomerPeriodBranchDetail.phi_kdnt, 0)
            + func.coalesce(CustomerPeriodBranchDetail.phi_lc, 0)
            + func.coalesce(CustomerPeriodBranchDetail.phi_ttqt, 0)
        ), 0),
        func.count(func.distinct(CustomerPeriodBranchDetail.ma_cb)),
    ).filter(CustomerPeriodBranchDetail.period_key == period_key)
    if scope.ma_cn:
        branch_rows_query = branch_rows_query.filter(CustomerPeriodBranchDetail.branch_code == scope.ma_cn)
    if scope.ma_pgd:
        branch_rows_query = branch_rows_query.filter(CustomerPeriodBranchDetail.ma_pgd == scope.ma_pgd)
    branch_rows_query = branch_rows_query.filter(CustomerPeriodBranchDetail.ma_kh.in_(customer_ids))
    branch_rows = branch_rows_query.group_by(CustomerPeriodBranchDetail.branch_code).all()

    loan_group_rows = (
        _ln01_query(db, period_key, scope.ma_cn, scope.ma_pgd)
        .filter(LN01Loan.custseq.in_(customer_ids))
        .with_entities(
            LN01Loan.debt_group,
            func.count(func.distinct(LN01Loan.custseq)),
            func.coalesce(func.sum(LN01Loan.du_no), 0),
        )
        .group_by(LN01Loan.debt_group)
        .order_by(LN01Loan.debt_group)
        .all()
    )

    service_counts = {key: int(totals[24 + index] or 0) for index, key in enumerate(ACTIVE_SERVICE_KEYS)}
    result = {
        "period_key": period_key,
        "scope": {"branch_code": scope.ma_cn, "pgd_code": scope.ma_pgd},
        "customer": {
            "total": int(totals[0] or 0), "with_deposit": int(totals[22] or 0),
            "with_loan": int(totals[23] or 0), "with_service": int(totals[21] or 0),
        },
        "deposit": {"term": float(totals[1] or 0), "casa_average": float(totals[2] or 0), "payment_turnover": float(totals[3] or 0)},
        "credit": {
            "total": float(totals[4] or 0), "short_term": float(totals[5] or 0),
            "medium_long_term": float(totals[6] or 0), "overdraft": float(totals[7] or 0),
        },
        "risk": {
            "general_period": float(totals[8] or 0), "general_accumulated": float(totals[9] or 0),
            "specific_period": float(totals[10] or 0), "specific_accumulated": float(totals[11] or 0),
            "written_off_balance": float(totals[12] or 0), "written_off_recovery": float(totals[13] or 0),
            "debt_groups": [{"group": str(group or "Chưa xác định"), "customers": int(count or 0), "balance": float(balance or 0)} for group, count, balance in loan_group_rows],
        },
        "income": {"total_fee": float(sum(item["value"] for item in fee_rows)), "fees": fee_rows},
        "services": _build_service_penetration_rows(
            count_fn=lambda key, _base_kind: service_counts[key],
            loan_base=int(totals[23] or 0), plus_base=int(totals[24 + len(ACTIVE_SERVICE_KEYS)] or 0),
            total_customers=int(totals[0] or 0),
        ),
        "branches": [{
            "branch_code": row[0], "customers": int(row[1] or 0), "deposit": float(row[2] or 0),
            "casa": float(row[3] or 0), "loan": float(row[4] or 0), "fee": float(row[5] or 0),
            "officers": int(row[6] or 0),
        } for row in branch_rows],
        "officers": _build_officer_leaderboard(db, period_key, scope.ma_cn, scope.ma_pgd) if include_rankings else [],
    }
    _BUSINESS_CACHE[cache_key] = (monotonic(), result)
    return result


@router.get("/business-trends")
def dashboard_business_trends(
    periods: int = Query(default=6, ge=2, le=24),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    cache_key = (periods, scope.ma_cn, scope.ma_pgd)
    cached = _BUSINESS_TREND_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < _INSIGHTS_CACHE_TTL_SECONDS:
        return cached[1]
    period_keys = [row[0] for row in (
        db.query(CustomerPeriodProfile.period_key)
        .distinct().order_by(desc(CustomerPeriodProfile.period_key)).limit(periods).all()
    )]
    period_keys.reverse()
    model = CustomerPeriodBranchDetail if scope.ma_cn else CustomerPeriodProfile
    query = db.query(model).filter(model.period_key.in_(period_keys))
    if scope.ma_cn:
        query = query.filter(CustomerPeriodBranchDetail.branch_code == scope.ma_cn)
    if scope.ma_pgd:
        query = query.filter(
            CustomerPeriodBranchDetail.ma_pgd == scope.ma_pgd
            if model is CustomerPeriodBranchDetail
            else CustomerPeriodProfile.pgd_codes.ilike(f"%{scope.ma_pgd}%")
        )
    aggregate_rows = query.with_entities(
        model.period_key,
        func.count(func.distinct(model.ma_kh)),
        func.coalesce(func.sum(model.so_du_tien_gui), 0),
        func.coalesce(func.sum(model.so_du_tgtt_binh_quan), 0),
        func.coalesce(func.sum(model.so_du_tien_vay), 0),
        func.coalesce(func.sum(model.phi_bao_lanh), 0),
        func.coalesce(func.sum(model.phi_chuyen_tien), 0),
        func.coalesce(func.sum(model.phi_nhdt), 0),
        func.coalesce(func.sum(model.abic_batd), 0),
        func.coalesce(func.sum(model.phi_kdnt), 0),
        func.coalesce(func.sum(model.phi_lc), 0),
        func.coalesce(func.sum(model.phi_ttqt), 0),
        func.coalesce(func.sum(model.dprr_chung_lk), 0),
        func.coalesce(func.sum(model.dprr_cuthe_lk), 0),
    ).group_by(model.period_key).all()
    values_by_period = {row[0]: row for row in aggregate_rows}
    source_rows = db.query(ReportSourceStatus.period_key, ReportSourceStatus.source_code, ReportSourceStatus.status).filter(
        ReportSourceStatus.period_key.in_(period_keys)
    ).all()
    ready_sources: dict[str, set[str]] = {}
    for source_period, source_code, source_status in source_rows:
        if source_status in {"ready", "success", "partial"}:
            ready_sources.setdefault(source_period, set()).add(source_code)
    rows = []
    for key in period_keys:
        values = values_by_period.get(key)
        if not values:
            continue
        rows.append({
            "period_key": key, "customers": int(values[1] or 0),
            "deposit": float(values[2] or 0), "casa": float(values[3] or 0),
            "loan": float(values[4] or 0),
            "fee": float(sum(float(value or 0) for value in values[5:12])),
            "provision": float((values[12] or 0) + (values[13] or 0)),
            "availability": {
                "deposit": "PF14" in ready_sources.get(key, set()),
                "casa": "PF14" in ready_sources.get(key, set()),
                "loan": bool({"LN01", "PF10"} & ready_sources.get(key, set())),
                "fee": "KH02" in ready_sources.get(key, set()),
                "provision": bool({"LN01", "BC29"} & ready_sources.get(key, set())),
                "customers": True,
            },
        })
    result = {"items": rows, "scope": {"branch_code": scope.ma_cn, "pgd_code": scope.ma_pgd}}
    _BUSINESS_TREND_CACHE[cache_key] = (monotonic(), result)
    return result


BUSINESS_DRILLDOWN_LABELS = {
    "all": "Toàn bộ khách hàng trong phạm vi",
    "deposit": "Khách hàng có tiền gửi",
    "term_deposit": "Khách hàng có tiền gửi có kỳ hạn",
    "casa": "Khách hàng có TGTT bình quân",
    "payment_turnover": "Khách hàng có doanh số TKTT",
    "loan": "Khách hàng có dư nợ",
    "short_loan": "Khách hàng có dư nợ ngắn hạn",
    "medium_long_loan": "Khách hàng có dư nợ trung dài hạn",
    "overdraft": "Khách hàng có dư nợ thấu chi",
    "fee": "Khách hàng phát sinh phí",
    "guarantee_fee": "Khách hàng phát sinh phí bảo lãnh",
    "transfer_fee": "Khách hàng phát sinh phí chuyển tiền",
    "digital_fee": "Khách hàng phát sinh phí NHĐT",
    "abic_fee": "Khách hàng phát sinh phí ABIC/BATĐ",
    "fx_fee": "Khách hàng phát sinh phí kinh doanh ngoại tệ",
    "lc_fee": "Khách hàng phát sinh phí LC",
    "international_fee": "Khách hàng phát sinh phí thanh toán quốc tế",
    "service": "Khách hàng sử dụng sản phẩm",
    "no_service": "Khách hàng chưa sử dụng sản phẩm",
    "risk": "Khách hàng có dự phòng",
    "written_off": "Khách hàng có dư nợ XLRR",
}


def _business_drilldown_condition(model, metric: str):
    deposit = func.coalesce(model.so_du_tien_gui, 0) + func.coalesce(model.so_du_tgtt_binh_quan, 0)
    fee = sum(func.coalesce(getattr(model, field), 0) for field in FEE_FIELDS)
    services = sum(func.coalesce(getattr(model, field), 0) for field in ACTIVE_SERVICE_KEYS)
    conditions = {
        "all": text("1=1"),
        "deposit": deposit > 0,
        "term_deposit": func.coalesce(model.so_du_tien_gui, 0) > 0,
        "casa": func.coalesce(model.so_du_tgtt_binh_quan, 0) > 0,
        "payment_turnover": func.coalesce(
            model.doanh_so_chuyen_tien_ve_tk if model is CustomerPeriodProfile else model.doanh_so_cramt, 0
        ) > 0,
        "loan": func.coalesce(model.so_du_tien_vay, 0) > 0,
        "short_loan": func.coalesce(model.du_no_ngan_han, 0) > 0,
        "medium_long_loan": func.coalesce(model.du_no_trung_dai_han, 0) > 0,
        "overdraft": func.coalesce(model.du_no_thau_chi, 0) > 0,
        "fee": fee != 0,
        "guarantee_fee": func.coalesce(model.phi_bao_lanh, 0) != 0,
        "transfer_fee": func.coalesce(model.phi_chuyen_tien, 0) != 0,
        "digital_fee": func.coalesce(model.phi_nhdt, 0) != 0,
        "abic_fee": func.coalesce(model.abic_batd, 0) != 0,
        "fx_fee": func.coalesce(model.phi_kdnt, 0) != 0,
        "lc_fee": func.coalesce(model.phi_lc, 0) != 0,
        "international_fee": func.coalesce(model.phi_ttqt, 0) != 0,
        "service": services > 0,
        "no_service": services == 0,
        "risk": (func.abs(func.coalesce(model.dprr_chung_lk, 0)) + func.abs(func.coalesce(model.dprr_cuthe_lk, 0))) > 0,
    }
    if model is CustomerPeriodProfile:
        conditions["written_off"] = func.coalesce(model.du_no_xlrr, 0) > 0
    if metric.startswith("service:"):
        key = metric.split(":", 1)[1]
        return func.coalesce(getattr(model, key), 0) > 0 if key in ACTIVE_SERVICE_KEYS else services > 0
    if metric.startswith("no_service:"):
        key = metric.split(":", 1)[1]
        return func.coalesce(getattr(model, key), 0) == 0 if key in ACTIVE_SERVICE_KEYS else services == 0
    return conditions.get(metric, or_(deposit > 0, func.coalesce(model.so_du_tien_vay, 0) > 0))


@router.get("/business-drilldown")
def dashboard_business_drilldown(
    period_key: str = Query(...),
    metric: str = Query(default="deposit"),
    detail_keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    filters: dict = Depends(_advanced_filters),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    query, model = _analytics_source(db, period_key, scope.ma_cn, scope.ma_pgd)
    customer_ids = _matching_customer_ids(db, period_key, scope, filters)
    query = _restrict_to_matching_customers(query, model, customer_ids)
    query = query.filter(_business_drilldown_condition(model, metric))
    if detail_keyword:
        pattern = f"%{detail_keyword.strip()}%"
        query = query.filter(or_(model.ma_kh.ilike(pattern), model.ten_kh.ilike(pattern)))
    total = query.with_entities(func.count(func.distinct(model.ma_kh))).scalar() or 0
    fee_expr = sum(func.coalesce(getattr(model, field), 0) for field in FEE_FIELDS)
    risk_expr = func.coalesce(model.dprr_chung_lk, 0) + func.coalesce(model.dprr_cuthe_lk, 0)
    service_expr = sum(func.coalesce(getattr(model, field), 0) for field in ACTIVE_SERVICE_KEYS)
    order_expr = {
        "all": func.cast(0, model.so_du_tien_vay.type),
        "deposit": func.coalesce(model.so_du_tien_gui, 0) + func.coalesce(model.so_du_tgtt_binh_quan, 0),
        "term_deposit": model.so_du_tien_gui,
        "casa": model.so_du_tgtt_binh_quan,
        "payment_turnover": model.doanh_so_chuyen_tien_ve_tk if model is CustomerPeriodProfile else model.doanh_so_cramt,
        "loan": model.so_du_tien_vay, "fee": fee_expr, "risk": risk_expr,
        "short_loan": model.du_no_ngan_han,
        "medium_long_loan": model.du_no_trung_dai_han,
        "overdraft": model.du_no_thau_chi,
        "guarantee_fee": model.phi_bao_lanh,
        "transfer_fee": model.phi_chuyen_tien,
        "digital_fee": model.phi_nhdt,
        "abic_fee": model.abic_batd,
        "fx_fee": model.phi_kdnt,
        "lc_fee": model.phi_lc,
        "international_fee": model.phi_ttqt,
        "written_off": getattr(model, "du_no_xlrr", model.so_du_tien_vay),
    }.get(metric, service_expr)
    selected = query.with_entities(
        model.ma_kh, model.ten_kh, model.loai_khach_hang,
        model.so_du_tien_gui, model.so_du_tgtt_binh_quan, model.so_du_tien_vay,
        fee_expr.label("fee"), risk_expr.label("provision"), service_expr.label("service_count"),
        getattr(model, "du_no_xlrr", func.cast(0, model.so_du_tien_vay.type)).label("written_off"),
        (model.branch_code if model is CustomerPeriodBranchDetail else model.primary_branch_code).label("branch_code"),
        model.ma_cb, model.ten_can_bo,
    ).order_by(desc(order_expr), model.ma_kh).offset((page - 1) * page_size).limit(page_size).all()
    items = [{
        "ma_kh": row[0], "ten_kh": row[1], "customer_type": row[2],
        "deposit": float(row[3] or 0), "casa": float(row[4] or 0), "loan": float(row[5] or 0),
        "fee": float(row[6] or 0), "provision": float(row[7] or 0), "service_count": int(row[8] or 0),
        "written_off": float(row[9] or 0), "branch_code": row[10], "officer_code": row[11], "officer_name": row[12],
    } for row in selected]
    if metric.startswith("service:"):
        label = f"Khách hàng đang dùng {SERVICE_LABELS.get(metric.split(':', 1)[1], metric)}"
    elif metric.startswith("no_service:"):
        label = f"Khách hàng chưa dùng {SERVICE_LABELS.get(metric.split(':', 1)[1], metric)}"
    else:
        label = BUSINESS_DRILLDOWN_LABELS.get(metric, metric)
    total_value = query.with_entities(func.coalesce(func.sum(order_expr), 0)).scalar() or 0
    return {
        "metric": metric, "label": label, "total": int(total),
        "total_value": float(total_value), "page": page, "page_size": page_size,
        "scope": {"branch_code": scope.ma_cn, "pgd_code": scope.ma_pgd},
        "items": items,
    }


@router.get("/business-export")
def dashboard_business_export(
    period_key: str = Query(...),
    metric: str = Query(default="deposit"),
    filters: dict = Depends(_advanced_filters),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    payload = dashboard_business_drilldown(
        period_key=period_key, metric=metric, detail_keyword=None, page=1, page_size=50_000,
        filters=filters, scope=scope, db=db,
    )
    workbook = Workbook()
    info = workbook.active
    info.title = "Thong tin"
    info.append(["Chỉ tiêu", BUSINESS_DRILLDOWN_LABELS.get(metric, metric)])
    info.append(["Kỳ dữ liệu", period_key])
    info.append(["Tổng số bản ghi theo bộ lọc", payload["total"]])
    info.append(["Số bản ghi trong file", len(payload["items"])])
    if payload["total"] > len(payload["items"]):
        info.append(["Lưu ý", "File giới hạn 50.000 dòng để bảo đảm hiệu năng; hãy thu hẹp chi nhánh/PGD trước khi xuất."])
    sheet = workbook.create_sheet()
    sheet.title = "Phan tich nghiep vu"
    headers = ["Mã KH", "Tên khách hàng", "Loại KH", "Chi nhánh", "Cán bộ", "Tiền gửi CKH", "TGTT bình quân", "Dư nợ", "Thu phí", "Dự phòng", "Số SP", "Dư nợ XLRR"]
    sheet.append(headers)
    for item in payload["items"]:
        sheet.append([item["ma_kh"], item["ten_kh"], item["customer_type"], item["branch_code"], item["officer_name"] or item["officer_code"], item["deposit"], item["casa"], item["loan"], item["fee"], item["provision"], item["service_count"], item["written_off"]])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(max(len(str(cell.value or "")) for cell in column) + 2, 36)
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"phan_tich_{metric}_{period_key}.xlsx"
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/insights")
def dashboard_insights(
    period_key: str = Query(...),
    include_top_changes: bool = Query(default=False),
    filters: dict = Depends(_advanced_filters),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    filter_key = tuple(sorted((key, str(value)) for key, value in filters.items()))
    cache_key = (period_key, scope.ma_cn, f"{scope.ma_pgd or ''}:top={int(include_top_changes)}:{filter_key}")
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
    customer_ids = _matching_customer_ids(db, period_key, scope, filters)
    joined = joined.filter(current.ma_kh.in_(customer_ids))
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

    def serialize_change_rows(rows, value_kind: str):
        items = []
        for row, old in rows:
            if value_kind == "deposit":
                current_value = float((row.so_du_tien_gui or 0) + (row.so_du_tgtt_binh_quan or 0))
                previous_value = float((old.so_du_tien_gui or 0) + (old.so_du_tgtt_binh_quan or 0)) if old else 0
            elif value_kind == "loan":
                current_value = float(row.so_du_tien_vay or 0)
                previous_value = float(old.so_du_tien_vay or 0) if old else 0
            else:
                current_value = float(sum(getattr(row, key) or 0 for key in FEE_FIELDS))
                previous_value = float(sum(getattr(old, key) or 0 for key in FEE_FIELDS)) if old else 0
            items.append({
                "ma_kh": row.ma_kh, "ten_kh": row.ten_kh,
                "primary_branch_code": row.primary_branch_code,
                "current": current_value, "previous": previous_value,
                "change": current_value - previous_value,
                "change_pct": ((current_value - previous_value) / abs(previous_value) * 100) if previous_value else None,
            })
        return items

    deposit_difference = current_deposit - previous_deposit
    loan_difference = func.coalesce(current.so_du_tien_vay, 0) - func.coalesce(previous.so_du_tien_vay, 0)
    top_deposit_increase = joined.filter(previous.id.isnot(None), deposit_difference > 0).order_by(desc(deposit_difference)).limit(10).all() if include_top_changes else []
    top_deposit_decrease = joined.filter(previous.id.isnot(None), deposit_difference < 0).order_by(deposit_difference).limit(10).all() if include_top_changes else []
    top_loan_increase = joined.filter(previous.id.isnot(None), loan_difference > 0).order_by(desc(loan_difference)).limit(10).all() if include_top_changes else []
    fee_current = sum(func.coalesce(getattr(current, key), 0) for key in FEE_FIELDS)
    top_fee = joined.filter(fee_current != 0).order_by(desc(func.abs(fee_current))).limit(10).all() if include_top_changes else []

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
        current_accounts_query = current_accounts_query.filter(PF14AccountBalance.custseq.in_(customer_ids))
        previous_accounts_query = previous_accounts_query.filter(PF14AccountBalance.custseq.in_(customer_ids))
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

    ln_query = _ln01_query(db, period_key, scope.ma_cn, scope.ma_pgd).filter(LN01Loan.custseq.in_(customer_ids))
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
        "top_changes": {
            "deposit_increase": serialize_change_rows(top_deposit_increase, "deposit"),
            "deposit_decrease": serialize_change_rows(top_deposit_decrease, "deposit"),
            "loan_increase": serialize_change_rows(top_loan_increase, "loan"),
            "fee": serialize_change_rows(top_fee, "fee"),
        },
    }
    _INSIGHTS_CACHE[cache_key] = (monotonic(), result)
    return result
