from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.auth.branch_scope import BranchScope
from app.auth.dependencies import get_branch_scope
from app.database import get_db
from app.models import CustomerPeriodSummary, ImportBatch


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
}

CAMPAIGN_GROUP_PRIORITY = {
    "KHCN": ["Digital", "Thẻ", "Thanh toán", "Tài khoản", "Bảo hiểm", "Bảo lãnh/TTQT", "Khác"],
    "KHDN": ["Bảo lãnh/TTQT", "Digital", "Thanh toán", "Tài khoản", "Thẻ", "Bảo hiểm", "Khác"],
}


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _base_query(db: Session, period_key: str, ma_cn: str | None, ma_pgd: str | None):
    query = db.query(CustomerPeriodSummary).filter(CustomerPeriodSummary.period_key == period_key)
    if ma_cn:
        query = query.filter(CustomerPeriodSummary.ma_cn == ma_cn)
    if ma_pgd:
        query = query.filter(CustomerPeriodSummary.ma_pgd == ma_pgd)
    return query


def _count_used(row: CustomerPeriodSummary) -> int:
    return sum(1 for key in ACTIVE_SERVICE_KEYS if getattr(row, key, 0) > 0)


def _unused_services(row: CustomerPeriodSummary) -> list[dict]:
    unused = []
    for key in ACTIVE_SERVICE_KEYS:
        if getattr(row, key, 0) == 0:
            unused.append({"key": key, "label": SERVICE_LABELS[key], "group": SERVICE_GROUPS.get(key, "Khác")})
    priority = CAMPAIGN_GROUP_PRIORITY.get(row.loai_khach_hang or "", CAMPAIGN_GROUP_PRIORITY["KHCN"])
    unused.sort(key=lambda item: priority.index(item["group"]) if item["group"] in priority else 99)
    return unused


def _row_to_dict(row: CustomerPeriodSummary) -> dict:
    fields = [
        "period_key", "ma_kh_chuan", "ma_cn", "ma_pgd", "ma_kh", "ten_kh", "loai_khach_hang",
        "so_du_tien_vay", "so_du_tien_gui_ckh", "loai_vay", "doanh_so_chuyen_tien_ve_tai_khoan",
        "so_du_tgtt_binh_quan", "ma_cb", "ten_can_bo", "telephone",
    ] + ACTIVE_SERVICE_KEYS
    return {field: serialize_value(getattr(row, field)) for field in fields}


@router.get("/summary")
def dashboard_summary(
    period_key: str = Query(...),
    scope: BranchScope = Depends(get_branch_scope),
    db: Session = Depends(get_db),
):
    query = _base_query(db, period_key, scope.ma_cn, scope.ma_pgd)

    total_customers = query.count()
    totals = query.with_entities(
        func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_gui_ckh), 0),
        func.coalesce(func.sum(CustomerPeriodSummary.so_du_tgtt_binh_quan), 0),
    ).one()

    service_penetration = []
    for key in ACTIVE_SERVICE_KEYS:
        count = query.filter(getattr(CustomerPeriodSummary, key) > 0).count()
        service_penetration.append({
            "key": key,
            "label": SERVICE_LABELS[key],
            "group": SERVICE_GROUPS.get(key, "Khác"),
            "count": count,
            "pct": round((count / total_customers) * 100) if total_customers else 0,
        })
    service_penetration.sort(key=lambda item: item["pct"], reverse=True)

    cn_count = query.filter(CustomerPeriodSummary.loai_khach_hang == "KHCN").count()
    dn_count = query.filter(CustomerPeriodSummary.loai_khach_hang == "KHDN").count()
    cn_loan = query.filter(CustomerPeriodSummary.loai_khach_hang == "KHCN").with_entities(
        func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0)
    ).scalar() or 0
    dn_loan = query.filter(CustomerPeriodSummary.loai_khach_hang == "KHDN").with_entities(
        func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0)
    ).scalar() or 0

    loan_type_rows = (
        query.with_entities(
            func.coalesce(CustomerPeriodSummary.loai_vay, "Không xác định"),
            func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0),
        )
        .group_by(CustomerPeriodSummary.loai_vay)
        .all()
    )
    total_loan = float(totals[0] or 0)
    loan_type_breakdown = [
        {
            "type": loan_type or "Không xác định",
            "amt": float(amt or 0),
            "pct": round((float(amt or 0) / total_loan) * 100) if total_loan else 0,
        }
        for loan_type, amt in loan_type_rows
    ]
    loan_type_breakdown.sort(key=lambda item: item["amt"], reverse=True)

    officer_rows = (
        query.filter(CustomerPeriodSummary.ma_cb.isnot(None))
        .with_entities(
            CustomerPeriodSummary.ma_cb,
            CustomerPeriodSummary.ten_can_bo,
            func.count(CustomerPeriodSummary.id),
            func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodSummary.so_du_tgtt_binh_quan), 0),
        )
        .group_by(CustomerPeriodSummary.ma_cb, CustomerPeriodSummary.ten_can_bo)
        .all()
    )

    officer_leaderboard = []
    for ma_cb, ten_can_bo, cust_count, total_loan_amt, total_casa in officer_rows:
        officer_query = query.filter(CustomerPeriodSummary.ma_cb == ma_cb)
        used_services_total = 0
        for officer_row in officer_query.all():
            used_services_total += _count_used(officer_row)
        officer_leaderboard.append({
            "code": ma_cb,
            "name": ten_can_bo or ma_cb,
            "custCount": cust_count,
            "totalLoan": float(total_loan_amt or 0),
            "totalCASA": float(total_casa or 0),
            "avgCrossSell": round(used_services_total / cust_count, 1) if cust_count else 0,
        })
    officer_leaderboard.sort(key=lambda item: item["totalLoan"], reverse=True)

    all_rows = query.all()
    no_service_count = sum(1 for row in all_rows if _count_used(row) == 0)

    campaign_candidates = []
    for row in all_rows:
        total_assets = float(row.so_du_tien_vay or 0) + float(row.so_du_tien_gui_ckh or 0) + float(row.so_du_tgtt_binh_quan or 0)
        used_count = _count_used(row)
        if total_assets < 80_000_000 or used_count > 2:
            continue
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
        for item in db.query(ImportBatch.period_key)
        .order_by(desc(ImportBatch.period_key))
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
            func.coalesce(func.sum(CustomerPeriodSummary.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodSummary.so_du_tgtt_binh_quan), 0),
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
