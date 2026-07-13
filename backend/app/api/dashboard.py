from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func
from sqlalchemy.orm import Query as OrmQuery, Session

from app.auth.branch_scope import BranchScope
from app.auth.dependencies import get_branch_scope
from app.database import get_db
from app.models import CustomerPeriodProfile, LN01Loan


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

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


def _loan_type_category_expr():
    return case(
        (LN01Loan.loan_type == "Thấu chi trên TK khách hàng", "Thấu chi"),
        (LN01Loan.loan_type == "Vay ngắn hạn (TK 211)", "Ngắn"),
        (LN01Loan.loan_type == "Vay trung hạn (TK 212)", "Trung"),
        (LN01Loan.loan_type == "Vay dài hạn (TK 213)", "Dài"),
        else_="Khác",
    )


def _ln01_query(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None) -> OrmQuery:
    query = db.query(LN01Loan).filter(LN01Loan.period_key == period_key)
    if ma_cn:
        query = query.filter(LN01Loan.brcd.ilike(f"%{ma_cn}%"))
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


def _count_used(row: CustomerPeriodProfile) -> int:
    return sum(1 for key in ACTIVE_SERVICE_KEYS if getattr(row, key, 0) > 0)


def _unused_services(row: CustomerPeriodProfile) -> list[dict]:
    unused = []
    for key in ACTIVE_SERVICE_KEYS:
        if getattr(row, key, 0) == 0:
            unused.append({"key": key, "label": SERVICE_LABELS[key], "group": SERVICE_GROUPS.get(key, "Khác")})
    priority = CAMPAIGN_GROUP_PRIORITY.get(row.loai_khach_hang or "", CAMPAIGN_GROUP_PRIORITY["KHCN"])
    unused.sort(key=lambda item: priority.index(item["group"]) if item["group"] in priority else 99)
    return unused


def _used_count_expr():
    return sum(getattr(CustomerPeriodProfile, key) for key in ACTIVE_SERVICE_KEYS)


def _asset_expr():
    return (
        func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0)
        + func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0)
        + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0)
    )


def _no_service_condition():
    return and_(*(getattr(CustomerPeriodProfile, key) == 0 for key in ACTIVE_SERVICE_KEYS))


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
        "telephone": row.telephone,
    }
    for key in ACTIVE_SERVICE_KEYS:
        data[key] = getattr(row, key)
    return {field: serialize_value(value) for field, value in data.items()}


@router.get("/summary")
def dashboard_summary(
    period_key: str = Query(...),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    query = _base_query(db, period_key, scope.ma_cn, scope.ma_pgd)

    total_customers = query.count()
    totals = query.with_entities(
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_gui), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
    ).one()

    service_penetration = []
    for key in ACTIVE_SERVICE_KEYS:
        count = query.filter(getattr(CustomerPeriodProfile, key) > 0).count()
        service_penetration.append({
            "key": key,
            "label": SERVICE_LABELS[key],
            "group": SERVICE_GROUPS.get(key, "Khác"),
            "count": count,
            "pct": round((count / total_customers) * 100) if total_customers else 0,
        })
    service_penetration.sort(key=lambda item: item["pct"], reverse=True)

    cn_count = query.filter(CustomerPeriodProfile.loai_khach_hang == "KHCN").count()
    dn_count = query.filter(CustomerPeriodProfile.loai_khach_hang == "KHDN").count()
    cn_loan = query.filter(CustomerPeriodProfile.loai_khach_hang == "KHCN").with_entities(
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0)
    ).scalar() or 0
    dn_loan = query.filter(CustomerPeriodProfile.loai_khach_hang == "KHDN").with_entities(
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0)
    ).scalar() or 0

    loan_type_breakdown = _build_loan_type_breakdown(db, period_key, scope.ma_cn, scope.ma_pgd)

    officer_rows = (
        query.filter(CustomerPeriodProfile.ma_cb.isnot(None))
        .with_entities(
            CustomerPeriodProfile.ma_cb,
            CustomerPeriodProfile.ten_can_bo,
            func.count(CustomerPeriodProfile.id),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
            *[
                func.coalesce(func.sum(getattr(CustomerPeriodProfile, key)), 0).label(key)
                for key in ACTIVE_SERVICE_KEYS
            ],
        )
        .group_by(CustomerPeriodProfile.ma_cb, CustomerPeriodProfile.ten_can_bo)
        .all()
    )

    officer_leaderboard = []
    for row in officer_rows:
        ma_cb, ten_can_bo, cust_count, total_loan_amt, total_casa = row[:5]
        used_services_total = sum(float(value or 0) for value in row[5:])
        officer_leaderboard.append({
            "code": ma_cb,
            "name": ten_can_bo or ma_cb,
            "custCount": cust_count,
            "totalLoan": float(total_loan_amt or 0),
            "totalCASA": float(total_casa or 0),
            "avgCrossSell": round(used_services_total / cust_count, 1) if cust_count else 0,
        })
    officer_leaderboard.sort(key=lambda item: item["totalLoan"], reverse=True)

    no_service_count = query.filter(_no_service_condition()).count()

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
    campaign_top5 = campaign_candidates[:5]

    return {
        "period_key": period_key,
        "kpis": {
            "total_customers": total_customers,
            "total_loan": float(totals[0] or 0),
            "total_deposit": float(totals[1] or 0),
            "total_casa": float(totals[2] or 0),
            "no_service_count": no_service_count,
        },
        "service_penetration": service_penetration,
        "officer_leaderboard": officer_leaderboard,
        "loan_type_breakdown": loan_type_breakdown,
        "segment": {
            "cn": cn_count,
            "dn": dn_count,
            "cn_loan": float(cn_loan or 0),
            "dn_loan": float(dn_loan or 0),
        },
        "campaign_top5": campaign_top5,
    }


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
        query = _base_query(db, period_key, scope.ma_cn, scope.ma_pgd)
        totals = query.with_entities(
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
        ).one()
        is_current = index == len(period_keys) - 1
        month_label = f"T{period_key[4:6]}" if len(period_key) >= 6 else period_key
        if is_current:
            month_label = f"{month_label} (Hiện tại)"
        labels.append(month_label)
        loans.append(round(float(totals[0] or 0) / 1e9, 2))
        casa_values.append(round(float(totals[1] or 0) / 1e9, 2))

    return {
        "period_keys": period_keys,
        "labels": labels,
        "loans": loans,
        "casa": casa_values,
    }
