from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from time import monotonic

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import DateTime as SQLDateTime, Float, Integer, Numeric, and_, asc, case, desc, distinct, func, or_, text
from sqlalchemy.orm import Session

from app.customer_processing import (
    REQUIRED_FILE_TYPES,
    build_period_file_summary,
    create_processing_job,
    get_period_file_summary,
    process_customer_period,
    save_optional_file,
    validate_processed_period,
)
from app.database import get_db
from app.models import (
    BC06CustomerClassification,
    BC29CustomerCreditRisk,
    BusinessMatchingRule,
    CifCustomer,
    CifImportBatch,
    CustomerPeriodBranchDetail,
    CustomerPeriodExchangeRate,
    CustomerPeriodProfile,
    CustomerProcessingJob,
    CustomerProcessingOptionalFile,
    CustomerSourceReconciliation,
    DP01DepositAccount,
    GL02LedgerTransaction,
    ImportFile,
    ImportBatch,
    LN01Loan,
    OrgBranch,
    OrgDepartment,
    PF10LoanProfitability,
    PF14AccountBalance,
    RR01HandledRiskLoan,
    SupplementalBaoLanhRecord,
    SupplementalBillPaymentTransaction,
    SupplementalOABRecord,
    SystemUser,
    SystemConfigurationEntry,
)


router = APIRouter(prefix="/api/customer-processing", tags=["customer-processing"])
PF10_LOAN_TYPE_GROUPS = {
    "short_term": {"100"},
    "medium_long_term": {"110", "120"},
    "overdraft": {"241"},
}
PF10_LOAN_TYPE_LABELS = {
    "100": "Ngắn hạn",
    "110": "Trung hạn",
    "120": "Dài hạn",
    "241": "Thấu chi",
}

PROFILE_DICTIONARY_FIELD_MAP = {
    "MCN": "primary_branch_code",
    "MPGD": "primary_pgd_code",
    "MKH": "ma_kh",
    "TENKH": "ten_kh",
    "TEN_CHUDN": "ten_chu_doanh_nghiep",
    "CCCD": "so_cccd",
    "MST": "ma_so_thue",
    "NGAY_THANHLAP": "ngay_thanh_lap",
    "DIACHI": "dia_chi",
    "LOAIKH": "loai_khach_hang",
    "GIOITINH": "gioi_tinh",
    "NAM_SINH": "ngay_sinh",
    "NGHE NGHIEP": "nghe_nghiep",
    "DIEN_THOAI": "telephone",
    "MACB": "ma_cb",
    "TENCB": "ten_can_bo",
    "DS_TKTT": "doanh_so_chuyen_tien_ve_tk",
    "SODU_TGCKH": "so_du_tien_gui",
    "SODU_TKTTBQ": "so_du_tgtt_binh_quan",
    "DUNO_NHTT": "du_no_ngan_han",
    "DUNO_NHTTBQ": "du_no_ngan_han_bq",
    "DUNO_TDHTT": "du_no_trung_dai_han",
    "DUNO_TDHTTBQ": "du_no_trung_dai_han_bq",
    "DUNO_TC": "du_no_thau_chi",
    "DUNO_TCBQ": "du_no_thau_chi_bq",
    "PHI_BAOLANH": "phi_bao_lanh",
    "PHI_CHUYENTIEN": "phi_chuyen_tien",
    "PHI_NHDT": "phi_nhdt",
    "ABIC_BATD": "abic_batd",
    "PHI_KDNT": "phi_kdnt",
    "PHI_LC": "phi_lc",
    "PHI_TTQT": "phi_ttqt",
    "TTQT": "ttqt",
    "DPRR_CHUNG_TT": "dprr_chung_tt",
    "DPRR_CHUNG_LK": "dprr_chung_lk",
    "DPRR_CUTHE_TT": "dprr_cuthe_tt",
    "DPRR_CUTHE_LK": "dprr_cuthe_lk",
    "DUNO_XLRR": "du_no_xlrr",
    "DS_THUNO_XLRR": "ds_thu_no_xlrr",
    "NGAY_UPDATE": "last_tktt_transaction_at",
    "TKSODEP": "tk_so_dep",
    "AGRIBANKPLUS": "agribank_plus",
    "OTT": "tin_nhan_ott",
    "EBANKING": "e_banking",
    "SMS_TKTV": "sms_nhac_no_vay",
    "SMS_TKTG": "sms_tien_gui",
    "THE_GNND": "the_ghi_no_noi_dia",
    "THE_LOCVIET": "the_td_loc_viet",
    "THE_TDQT": "the_td_quoc_te",
    "LOATHANTAI": "loa_bien_dong_so_du",
    "THUHO_DIEN": "thuho_dien",
    "THUHO_NUOC": "thuho_nuoc",
    "THUHO_DT": "thuho_dt",
    "HKD_TK": "hkd_tk",
    "ABIC_BATK": "abic_batk",
    "ABIC_BATHE": "abic_bathe",
}


def _source_dictionary_coverage(db: Session, period_key: str) -> dict[str, tuple[str, int]]:
    """Độ phủ các chỉ tiêu đã có logic khai thác trực tiếp từ bảng nguồn.

    Các chỉ tiêu này chưa lưu vật lý trong customer_period_profiles nhưng đã được
    API chi tiết C360 tính/hiển thị từ nguồn tương ứng.
    """
    pf14 = db.query(
        func.count(func.distinct(PF14AccountBalance.custseq)).filter(
            func.coalesce(PF14AccountBalance.monterm, 0) == 0,
            func.coalesce(PF14AccountBalance.monthlyendbalance, 0) != 0,
        ),
        func.count(func.distinct(PF14AccountBalance.custseq)).filter(
            func.coalesce(PF14AccountBalance.monterm, 0) > 0,
            func.coalesce(PF14AccountBalance.averagebalance, 0) != 0,
        ),
    ).filter(PF14AccountBalance.period_key == period_key).one()
    bc06_segment = (
        db.query(func.count(func.distinct(BC06CustomerClassification.customer_code)))
        .filter(
            BC06CustomerClassification.period_key == period_key,
            BC06CustomerClassification.segment_branch.isnot(None),
            func.trim(BC06CustomerClassification.segment_branch) != "",
        )
        .scalar()
        or 0
    )
    bc29 = db.query(
        func.count(func.distinct(BC29CustomerCreditRisk.customer_code)).filter(
            BC29CustomerCreditRisk.debt_group.in_(["3", "4", "5"]),
            func.coalesce(BC29CustomerCreditRisk.total_outstanding, 0) != 0,
        ),
        func.count(func.distinct(BC29CustomerCreditRisk.customer_code)).filter(
            func.coalesce(BC29CustomerCreditRisk.handled_risk_amount, 0) != 0,
        ),
        func.count(func.distinct(BC29CustomerCreditRisk.customer_code)).filter(
            func.coalesce(BC29CustomerCreditRisk.period_provision_amount, 0) != 0,
        ),
    ).filter(BC29CustomerCreditRisk.period_key == period_key).one()
    rr01 = db.query(
        func.count(func.distinct(RR01HandledRiskLoan.customer_code)).filter(
            func.coalesce(RR01HandledRiskLoan.current_principal, 0) != 0,
        ),
        func.count(func.distinct(RR01HandledRiskLoan.customer_code)).filter(
            (func.coalesce(RR01HandledRiskLoan.recovered_principal_period, 0)
             + func.coalesce(RR01HandledRiskLoan.recovered_interest_period, 0)) != 0,
        ),
    ).filter(RR01HandledRiskLoan.period_key == period_key).one()
    return {
        "SODU_TKTT": ("pf14_account_balances.monthlyendbalance", int(pf14[0] or 0)),
        "SODU_TGCKHBQ": ("pf14_account_balances.averagebalance", int(pf14[1] or 0)),
        "PHAN_LOAIKH": ("bc06_customer_classifications.segment_branch", int(bc06_segment)),
        "DUNO_XAU": ("bc29_customer_credit_risks.total_outstanding", int(bc29[0] or 0)),
        "DUNO_XLRR": ("rr01_handled_risk_loans.current_principal", int(rr01[0] or 0)),
        "DS_THUNO_XLRR": ("rr01_handled_risk_loans.recovered_principal_period + recovered_interest_period", int(rr01[1] or 0)),
        "DPRR_TT": ("bc29_customer_credit_risks.period_provision_amount", int(bc29[2] or 0)),
    }
_PROFILE_COVERAGE_CACHE: dict[str, tuple[float, dict]] = {}


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def serialize_model(model, fields: list[str]) -> dict:
    return {field: serialize_value(getattr(model, field)) for field in fields}


def serialize_job(job: CustomerProcessingJob | None) -> dict | None:
    if not job:
        return None
    return serialize_model(
        job,
        [
            "id",
            "period_key",
            "status",
            "stage",
            "progress_percent",
            "required_file_count",
            "available_required_file_count",
            "total_file_count",
            "optional_file_count",
            "total_customers",
            "processed_customers",
            "error_message",
            "started_at",
            "finished_at",
            "created_at",
            "updated_at",
        ],
    )


def enrich_profile_org_names(db: Session, payloads: list[dict]) -> list[dict]:
    registry, _, _ = _load_active_org_department_registry(db)
    staff_rows = (
        db.query(SystemUser, OrgBranch, OrgDepartment)
        .outerjoin(OrgBranch, OrgBranch.id == SystemUser.branch_id)
        .outerjoin(OrgDepartment, OrgDepartment.id == SystemUser.department_id)
        .all()
    )
    staff_registry = {}
    for user, branch, department in staff_rows:
        staff_info = {
            "ma_cb": user.credit_officer_code,
            "officer_employee_code": user.employee_code,
            "officer_ipcas": user.ipcas_username,
            "ten_can_bo": user.full_name,
            "officer_branch_code": branch.branch_code if branch else None,
            "officer_branch_name": branch.branch_name if branch else None,
            "officer_department_code": department.department_code if department else None,
            "officer_department_name": department.department_name if department else None,
        }
        for value in (user.credit_officer_code, user.employee_code, user.ipcas_username):
            key = str(value or "").strip().upper()
            if key:
                staff_registry[key] = staff_info

    def enrich_officer(target: dict) -> dict | None:
        staff_info = None
        for field in ("ma_cb", "officer_employee_code", "officer_ipcas"):
            key = str(target.get(field) or "").strip().upper()
            if key and key in staff_registry:
                staff_info = staff_registry[key]
                break
        if staff_info:
            target.update({key: value for key, value in staff_info.items() if value is not None})
        return staff_info

    for payload in payloads:
        # Hồ sơ cũ có thể chưa được backfill primary_branch_code nhưng vẫn có
        # quan hệ chi nhánh hợp lệ. Không để giao diện mất chi nhánh trong trường hợp đó.
        if not str(payload.get("primary_branch_code") or "").strip():
            details = payload.get("branch_details")
            detail_branch = next((str(item.get("branch_code") or "").strip() for item in (details or []) if str(item.get("branch_code") or "").strip()), "") if isinstance(details, list) else ""
            branch_code = detail_branch or next((item.strip() for item in str(payload.get("branch_codes") or "").replace(";", ",").split(",") if item.strip()), "")
            if branch_code:
                payload["primary_branch_code"] = branch_code
        enrich_officer(payload)
        labels = []
        for raw_item in str(payload.get("pgd_codes") or "").split(","):
            item = raw_item.strip()
            if not item:
                continue
            if ":" in item:
                branch_code, department_code = [part.strip() for part in item.split(":", 1)]
            else:
                branch_code = str(payload.get("primary_branch_code") or "").strip()
                department_code = item
            if not department_code:
                continue
            name = registry.get((branch_code, department_code))
            labels.append(f"{name or department_code} ({branch_code})" if branch_code else (name or department_code))
        payload["pgd_names"] = ", ".join(dict.fromkeys(labels)) or None

        primary_branch = str(payload.get("primary_branch_code") or "").strip()
        primary_pgd = str(payload.get("primary_pgd_code") or "").strip()
        if primary_branch and primary_pgd:
            payload["primary_pgd_name"] = registry.get(
                (primary_branch, primary_pgd),
                payload.get("primary_pgd_name"),
            )

        details = payload.get("branch_details")
        if isinstance(details, list):
            for detail in details:
                # Cán bộ quản lý là quan hệ theo từng khách hàng + chi nhánh.
                # Không kế thừa cán bộ đại diện của hồ sơ tổng xuống chi nhánh
                # không có cán bộ trong dữ liệu LN01.
                detail_staff = enrich_officer(detail)
                if detail_staff:
                    detail.update({key: value for key, value in detail_staff.items() if value is not None})
                branch = str(detail.get("branch_code") or "").strip()
                pgd = str(detail.get("ma_pgd") or "").strip()
                if branch and pgd:
                    detail["ten_pgd"] = registry.get((branch, pgd), detail.get("ten_pgd"))
    return payloads


PROFILE_SERVICE_FIELDS = {
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
    "thuho_dien",
    "thuho_nuoc",
    "thuho_dt",
    "ttqt",
    "hkd_tk",
    "abic_batk",
    "abic_bathe",
}

GROUP_DEPOSIT_THRESHOLD = 1_000_000_000
GROUP_LOAN_THRESHOLD = 1_000_000_000
GROUP_CASA_THRESHOLD = 500_000_000

# KH cá nhân / hộ — mới được gợi ý thẻ và Agribank Plus (không áp cho DN/tổ chức).
RETAIL_CUSTOMER_TYPES = ("Cá nhân", "KHCN")


def is_retail_customer_expr():
    return CustomerPeriodProfile.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES)


def no_service_condition():
    return and_(*(getattr(CustomerPeriodProfile, field) == 0 for field in PROFILE_SERVICE_FIELDS))


def cross_sell_condition():
    return or_(
        and_(
            is_retail_customer_expr(),
            (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
            >= GROUP_DEPOSIT_THRESHOLD,
            CustomerPeriodProfile.agribank_plus == 0,
        ),
        and_(func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) > 0, CustomerPeriodProfile.sms_nhac_no_vay == 0),
        and_(
            is_retail_customer_expr(),
            func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD,
            CustomerPeriodProfile.the_ghi_no_noi_dia == 0,
            CustomerPeriodProfile.the_td_quoc_te == 0,
            CustomerPeriodProfile.the_td_loc_viet == 0,
        ),
    )


def group_condition(group_key: str):
    if group_key == "large_deposit":
        return (
            (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
            >= GROUP_DEPOSIT_THRESHOLD
        )
    if group_key == "large_loan":
        return func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD
    if group_key == "high_casa":
        return func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD
    if group_key == "multi_branch":
        return CustomerPeriodProfile.branch_count > 1
    if group_key == "primary_location_attention":
        return and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))
    if group_key == "cross_sell":
        return cross_sell_condition()
    return None


def _branch_finance_agg_subquery(db: Session, period_key: str, branch_code: str, pgd_code: str | None = None):
    """Gom số liệu tài chính theo mã KH tại đúng chi nhánh (và PGD nếu có)."""
    query = db.query(
        CustomerPeriodBranchDetail.ma_kh.label("ma_kh"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0).label("so_du_tien_vay"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_gui), 0).label("so_du_tien_gui"),
        func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0).label("so_du_tgtt_binh_quan"),
        func.max(CustomerPeriodBranchDetail.agribank_plus).label("agribank_plus"),
        func.max(CustomerPeriodBranchDetail.sms_nhac_no_vay).label("sms_nhac_no_vay"),
        func.max(CustomerPeriodBranchDetail.the_ghi_no_noi_dia).label("the_ghi_no_noi_dia"),
        func.max(CustomerPeriodBranchDetail.the_td_quoc_te).label("the_td_quoc_te"),
        func.max(CustomerPeriodBranchDetail.the_td_loc_viet).label("the_td_loc_viet"),
        func.max(CustomerPeriodBranchDetail.loai_khach_hang).label("loai_khach_hang"),
    ).filter(
        CustomerPeriodBranchDetail.period_key == period_key,
        CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
    )
    if pgd_code:
        query = query.filter(CustomerPeriodBranchDetail.ma_pgd == pgd_code.strip())
    return query.group_by(CustomerPeriodBranchDetail.ma_kh).subquery()


def _branch_cross_sell_condition(agg):
    retail = agg.c.loai_khach_hang.in_(RETAIL_CUSTOMER_TYPES)
    return or_(
        and_(
            retail,
            (func.coalesce(agg.c.so_du_tien_gui, 0) + func.coalesce(agg.c.so_du_tgtt_binh_quan, 0)) >= GROUP_DEPOSIT_THRESHOLD,
            func.coalesce(agg.c.agribank_plus, 0) == 0,
        ),
        and_(func.coalesce(agg.c.so_du_tien_vay, 0) > 0, func.coalesce(agg.c.sms_nhac_no_vay, 0) == 0),
        and_(
            retail,
            func.coalesce(agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD,
            func.coalesce(agg.c.the_ghi_no_noi_dia, 0) == 0,
            func.coalesce(agg.c.the_td_quoc_te, 0) == 0,
            func.coalesce(agg.c.the_td_loc_viet, 0) == 0,
        ),
    )


def _ma_kh_query_for_group_at_branch(
    db: Session,
    period_key: str,
    branch_code: str,
    pgd_code: str | None,
    group_key: str,
):
    """Danh sách mã KH thuộc nhóm phân tích, tính trên số liệu đúng tại CN/PGD."""
    agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
    if group_key == "large_deposit":
        return db.query(agg.c.ma_kh).filter(
            (func.coalesce(agg.c.so_du_tien_gui, 0) + func.coalesce(agg.c.so_du_tgtt_binh_quan, 0)) >= GROUP_DEPOSIT_THRESHOLD
        )
    if group_key == "large_loan":
        return db.query(agg.c.ma_kh).filter(func.coalesce(agg.c.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD)
    if group_key == "high_casa":
        return db.query(agg.c.ma_kh).filter(func.coalesce(agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD)
    if group_key == "cross_sell":
        return db.query(agg.c.ma_kh).filter(_branch_cross_sell_condition(agg))
    if group_key in {"multi_branch", "primary_location_attention"}:
        scoped = db.query(agg.c.ma_kh)
        profile_filter = (
            and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))
            if group_key == "primary_location_attention"
            else CustomerPeriodProfile.branch_count > 1
        )
        return (
            db.query(CustomerPeriodProfile.ma_kh)
            .filter(
                CustomerPeriodProfile.period_key == period_key,
                CustomerPeriodProfile.ma_kh.in_(scoped),
                profile_filter,
            )
        )
    return None


def profile_brief_fields() -> list[str]:
    return [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "ten_kh",
        "loai_khach_hang",
        "ten_chu_doanh_nghiep",
        "so_cccd",
        "ma_so_thue",
        "ngay_thanh_lap",
        "dia_chi",
        "gioi_tinh",
        "ngay_sinh",
        "nghe_nghiep",
        "management_source",
        "managing_branch_code",
        "managing_department_code",
        "managing_department_name",
        "branch_codes",
        "pgd_codes",
        "branch_count",
        "pgd_count",
        "so_du_tien_gui",
        "doanh_so_chuyen_tien_ve_tk",
        "so_du_tien_vay",
        "du_no_ngan_han",
        "du_no_ngan_han_bq",
        "du_no_trung_dai_han",
        "du_no_trung_dai_han_bq",
        "du_no_thau_chi",
        "du_no_thau_chi_bq",
        "pf10_lds_count",
        "pf10_interest",
        "pf10_accruals",
        "pf10_book_correction_interest",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
        "telephone",
        "primary_branch_code",
        "primary_pgd_code",
        "primary_pgd_name",
        "primary_location_score",
        "primary_location_reason",
        "phi_bao_lanh",
        "phi_chuyen_tien",
        "phi_nhdt",
        "abic_batd",
        "phi_kdnt",
        "phi_lc",
        "phi_ttqt",
        "dprr_chung_tt",
        "dprr_chung_lk",
        "dprr_cuthe_tt",
        "dprr_cuthe_lk",
        *sorted(PROFILE_SERVICE_FIELDS),
    ]


def split_filter_values(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


PROFILE_SORT_COLUMNS = {
    "ma_cn": CustomerPeriodProfile.primary_branch_code,
    "ten_cn": CustomerPeriodProfile.primary_branch_code,
    "ma_pgd": CustomerPeriodProfile.primary_pgd_code,
    "ma_kh_chuan": CustomerPeriodProfile.ma_kh,
    "ma_kh": CustomerPeriodProfile.ma_kh,
    "ten_kh": CustomerPeriodProfile.ten_kh,
    "loai_khach_hang": CustomerPeriodProfile.loai_khach_hang,
    "so_du_tien_vay": CustomerPeriodProfile.so_du_tien_vay,
    "so_du_tien_gui_ckh": CustomerPeriodProfile.so_du_tien_gui,
    "so_du_tien_gui": CustomerPeriodProfile.so_du_tien_gui,
    "loai_vay": CustomerPeriodProfile.loai_vay,
    "dsctt": CustomerPeriodProfile.doanh_so_chuyen_tien_ve_tk,
    "doanh_so_chuyen_tien_ve_tai_khoan": CustomerPeriodProfile.doanh_so_chuyen_tien_ve_tk,
    "so_du_tgtt_binh_quan": CustomerPeriodProfile.so_du_tgtt_binh_quan,
    "can_bo": CustomerPeriodProfile.ten_can_bo,
    "ten_can_bo": CustomerPeriodProfile.ten_can_bo,
    "branch_count": CustomerPeriodProfile.branch_count,
}

# Sort số → NULL/None coi như 0 để DESC/ASC ổn định.
PROFILE_NUMERIC_SORT_KEYS = {
    "so_du_tien_vay",
    "so_du_tien_gui_ckh",
    "so_du_tien_gui",
    "dsctt",
    "doanh_so_chuyen_tien_ve_tai_khoan",
    "so_du_tgtt_binh_quan",
    "branch_count",
}

# Khi lọc CN/PGD: sort dư nợ/CKH/CASA theo số liệu đúng phạm vi (branch_details).
BRANCH_SCOPE_SORT_FIELDS = {
    "so_du_tien_vay": "so_du_tien_vay",
    "so_du_tien_gui_ckh": "so_du_tien_gui",
    "so_du_tien_gui": "so_du_tien_gui",
    "so_du_tgtt_binh_quan": "so_du_tgtt_binh_quan",
}


def apply_profile_filters(
    query,
    *,
    period_key: str | None = None,
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    multi_branch: bool | None = None,
    no_service: bool = False,
    customer_type: str | None = None,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = None,
    missing_phone: bool | None = None,
):
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                CustomerPeriodProfile.ma_kh.ilike(like),
                CustomerPeriodProfile.ten_kh.ilike(like),
                CustomerPeriodProfile.ma_cb.ilike(like),
                CustomerPeriodProfile.ten_can_bo.ilike(like),
                CustomerPeriodProfile.telephone.ilike(like),
            )
        )
    if branch_code:
        query = query.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{branch_code.strip()}%"))
    if pgd_code:
        query = query.filter(CustomerPeriodProfile.pgd_codes.ilike(f"%{pgd_code.strip()}%"))
    if loan_type:
        loan_types = split_filter_values(loan_type)
        if loan_types:
            query = query.filter(or_(*(CustomerPeriodProfile.loai_vay.ilike(f"%{item}%") for item in loan_types)))
    if officer_code:
        query = query.filter(CustomerPeriodProfile.ma_cb == officer_code)
    if customer_type:
        customer_types = split_filter_values(customer_type)
        if customer_types:
            query = query.filter(CustomerPeriodProfile.loai_khach_hang.in_(customer_types))
    deposit_expr = (
        func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0)
        + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0)
    )
    loan_expr = func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0)
    casa_expr = func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0)
    if has_deposit is not None:
        query = query.filter(deposit_expr > 0 if has_deposit else deposit_expr <= 0)
    if has_loan is not None:
        query = query.filter(loan_expr > 0 if has_loan else loan_expr <= 0)
    for value, expression, operator in (
        (min_deposit, deposit_expr, "min"),
        (max_deposit, deposit_expr, "max"),
        (min_loan, loan_expr, "min"),
        (max_loan, loan_expr, "max"),
        (min_casa, casa_expr, "min"),
        (max_casa, casa_expr, "max"),
    ):
        if value is not None:
            query = query.filter(expression >= value if operator == "min" else expression <= value)
    required_services = [item for item in split_filter_values(service_codes) if item in PROFILE_SERVICE_FIELDS]
    for service in required_services:
        query = query.filter(getattr(CustomerPeriodProfile, service) > 0)
    if min_service_count is not None:
        service_count_expr = sum(func.coalesce(getattr(CustomerPeriodProfile, key), 0) for key in PROFILE_SERVICE_FIELDS)
        query = query.filter(service_count_expr >= min_service_count)
    if missing_phone is not None:
        phone_missing = or_(
            CustomerPeriodProfile.telephone.is_(None),
            func.trim(CustomerPeriodProfile.telephone) == "",
        )
        query = query.filter(phone_missing if missing_phone else ~phone_missing)
    if multi_branch is not None:
        query = query.filter(CustomerPeriodProfile.branch_count > 1 if multi_branch else CustomerPeriodProfile.branch_count <= 1)
    unused_services = [item for item in split_filter_values(unused_service) if item in PROFILE_SERVICE_FIELDS]
    for service in unused_services:
        query = query.filter(getattr(CustomerPeriodProfile, service) == 0)
    if group_key:
        branch_group_keys = {
            "large_deposit",
            "large_loan",
            "high_casa",
            "cross_sell",
            "multi_branch",
            "primary_location_attention",
        }
        if branch_code and period_key and group_key in branch_group_keys:
            ma_kh_query = _ma_kh_query_for_group_at_branch(
                query.session,
                period_key,
                branch_code,
                pgd_code,
                group_key,
            )
            if ma_kh_query is not None:
                query = query.filter(CustomerPeriodProfile.ma_kh.in_(ma_kh_query))
            else:
                condition = group_condition(group_key)
                if condition is not None:
                    query = query.filter(condition)
        else:
            condition = group_condition(group_key)
            if condition is not None:
                query = query.filter(condition)
    if no_service:
        query = query.filter(no_service_condition())
    return query


def apply_profile_sort(
    query,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    *,
    db: Session | None = None,
    period_key: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
):
    """Sắp xếp toàn bộ kết quả đã lọc (trước phân trang).

    Có lọc CN/PGD + sort dư nợ/CKH/CASA → xếp theo số phát sinh đúng phạm vi lọc.
    """
    sort_key = (sort_by or "").strip()
    direction = (sort_dir or "").strip().lower()
    order_fn = desc if direction == "desc" else asc

    if (
        db is not None
        and period_key
        and branch_code
        and direction in {"asc", "desc"}
        and sort_key in BRANCH_SCOPE_SORT_FIELDS
    ):
        agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
        amount_col = getattr(agg.c, BRANCH_SCOPE_SORT_FIELDS[sort_key])
        query = query.outerjoin(agg, CustomerPeriodProfile.ma_kh == agg.c.ma_kh)
        return query.order_by(order_fn(func.coalesce(amount_col, 0)), CustomerPeriodProfile.ma_kh)

    column = PROFILE_SORT_COLUMNS.get(sort_key)
    if column is None or direction not in {"asc", "desc"}:
        return query.order_by(desc(CustomerPeriodProfile.branch_count), CustomerPeriodProfile.ma_kh)
    order_expr = func.coalesce(column, 0) if sort_key in PROFILE_NUMERIC_SORT_KEYS else column
    return query.order_by(order_fn(order_expr), CustomerPeriodProfile.ma_kh)


def _branch_finance_by_ma_kh(
    db: Session,
    period_key: str,
    branch_code: str,
    pgd_code: str | None,
    ma_khs: list[str],
) -> dict[str, object]:
    if not ma_khs:
        return {}
    agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
    rows = (
        db.query(
            agg.c.ma_kh,
            agg.c.so_du_tien_vay,
            agg.c.so_du_tien_gui,
            agg.c.so_du_tgtt_binh_quan,
        )
        .filter(agg.c.ma_kh.in_(ma_khs))
        .all()
    )
    return {row.ma_kh: row for row in rows}


def _apply_branch_finance_to_payloads(
    db: Session,
    period_key: str,
    branch_code: str | None,
    pgd_code: str | None,
    payloads: list[dict],
) -> list[dict]:
    """Khi đang lọc CN/PGD: số dư trên payload = số phát sinh đúng phạm vi (khớp sort/nhóm)."""
    if not branch_code or not payloads:
        return payloads
    finance_map = _branch_finance_by_ma_kh(
        db,
        period_key,
        branch_code,
        pgd_code,
        [str(item.get("ma_kh") or "") for item in payloads if item.get("ma_kh")],
    )
    for item in payloads:
        fin = finance_map.get(str(item.get("ma_kh") or ""))
        if fin is None:
            item["so_du_tien_vay"] = 0
            item["so_du_tien_gui"] = 0
            item["so_du_tgtt_binh_quan"] = 0
            continue
        item["so_du_tien_vay"] = serialize_value(fin.so_du_tien_vay)
        item["so_du_tien_gui"] = serialize_value(fin.so_du_tien_gui)
        item["so_du_tgtt_binh_quan"] = serialize_value(fin.so_du_tgtt_binh_quan)
    return payloads


@router.get("/periods")
def list_processing_periods(db: Session = Depends(get_db)):
    batches = db.query(ImportBatch).order_by(desc(ImportBatch.period_key)).all()
    period_files: dict[str, list[ImportFile]] = {}
    files = (
        db.query(ImportFile)
        .filter(ImportFile.status.notin_(["deleted", "replaced"]))
        .all()
    )
    for item in files:
        period_files.setdefault(item.period_key, []).append(item)
    optional_counts = dict(
        db.query(
            CustomerProcessingOptionalFile.period_key,
            func.count(CustomerProcessingOptionalFile.id),
        )
        .group_by(CustomerProcessingOptionalFile.period_key)
        .all()
    )
    latest_jobs = {}
    latest_success_jobs = {}
    latest_success_counts = {}
    all_jobs = db.query(CustomerProcessingJob).order_by(desc(CustomerProcessingJob.created_at)).all()
    for item in all_jobs:
        latest_jobs.setdefault(item.period_key, item)
        if item.status == "success":
            latest_success_jobs.setdefault(item.period_key, item)
            latest_success_counts.setdefault(
                item.period_key,
                int(item.processed_customers or item.total_customers or 0),
            )

    latest_cif_batch = (
        db.query(CifImportBatch)
        .filter(CifImportBatch.status == "success")
        .order_by(desc(CifImportBatch.finished_at), desc(CifImportBatch.id))
        .first()
    )
    current_cif_customer_count = int(db.query(func.count(CifCustomer.id)).scalar() or 0)

    result = []
    for batch in batches:
        summary = build_period_file_summary(
            period_files.get(batch.period_key, []),
            int(optional_counts.get(batch.period_key, 0) or 0),
            batch.period_date,
        )
        last_job = latest_jobs.get(batch.period_key)
        last_success_job = latest_success_jobs.get(batch.period_key)
        profile_count = latest_success_counts.get(batch.period_key, 0)
        reprocess_reasons = []
        cif_changed_since_processing = bool(
            last_success_job
            and latest_cif_batch
            and latest_cif_batch.finished_at
            and (
                not last_success_job.finished_at
                or latest_cif_batch.finished_at > last_success_job.finished_at
            )
        )
        cif_customer_count_changed = bool(
            last_success_job
            and current_cif_customer_count
            and profile_count != current_cif_customer_count
        )
        if cif_changed_since_processing:
            reprocess_reasons.append("Kho CIF đã được cập nhật sau lần xử lý gần nhất")
        if cif_customer_count_changed:
            reprocess_reasons.append(
                f"Kết quả đang có {profile_count:,} KH, khác Kho CIF hiện tại {current_cif_customer_count:,} KH"
            )
        if last_success_job and batch.status == "needs_reprocess":
            reprocess_reasons.append("Dữ liệu nguồn của kỳ đã thay đổi")
        payload = serialize_model(batch, ["id", "period_key", "period_date", "status", "description", "created_at"])
        payload.update(
            {
                "required_types": list(REQUIRED_FILE_TYPES),
                "success_by_type": summary["success_by_type"],
                "error_by_type": summary["error_by_type"],
                "processing_by_type": summary["processing_by_type"],
                "required_file_count": summary["required_file_count"],
                "available_required_file_count": summary["available_required_file_count"],
                "total_file_count": summary["total_file_count"],
                "optional_file_count": summary["optional_file_count"],
                "is_ready": summary["is_ready"],
                "branch_codes": summary["branch_codes"],
                "branch_count": summary["branch_count"],
                "ready_branch_count": summary["ready_branch_count"],
                "required_matrix_count": summary["required_matrix_count"],
                "available_matrix_count": summary["available_matrix_count"],
                "branch_readiness_percent": summary["branch_readiness_percent"],
                "missing_required_files": summary["missing_required_files"],
                "is_fully_ready": summary["is_fully_ready"],
                "profile_count": profile_count,
                "last_job": serialize_job(last_job),
                "last_success_job_finished_at": serialize_value(last_success_job.finished_at) if last_success_job else None,
                "current_cif_customer_count": current_cif_customer_count,
                "cif_changed_since_processing": cif_changed_since_processing,
                "cif_customer_count_changed": cif_customer_count_changed,
                "needs_reprocess": bool(reprocess_reasons),
                "reprocess_reasons": reprocess_reasons,
                "latest_cif_import": serialize_model(
                    latest_cif_batch,
                    ["id", "original_filename", "branch_code", "new_customers", "new_identifiers", "finished_at"],
                ) if latest_cif_batch else None,
            }
        )
        result.append(payload)
    return result


@router.get("/profile-field-coverage")
def profile_field_coverage(
    period_key: str = Query(...),
    db: Session = Depends(get_db),
):
    cached = _PROFILE_COVERAGE_CACHE.get(period_key)
    if cached and monotonic() - cached[0] < 60:
        return cached[1]
    total = (
        db.query(func.count(CustomerPeriodProfile.id))
        .filter(CustomerPeriodProfile.period_key == period_key)
        .scalar()
        or 0
    )
    expressions = []
    codes = []
    for code, attribute in PROFILE_DICTIONARY_FIELD_MAP.items():
        column = getattr(CustomerPeriodProfile, attribute)
        condition = column.isnot(None)
        if hasattr(column.type, "length"):
            condition = and_(condition, func.trim(column) != "")
        elif isinstance(column.type, (Integer, Numeric, Float)):
            condition = and_(condition, column != 0)
        expressions.append(func.count(CustomerPeriodProfile.id).filter(condition).label(code))
        codes.append(code)
    row = (
        db.query(*expressions)
        .filter(CustomerPeriodProfile.period_key == period_key)
        .one()
    )
    fields = {}
    for code, count in zip(codes, row, strict=True):
        value = int(count or 0)
        fields[code] = {
            "profile_field": PROFILE_DICTIONARY_FIELD_MAP[code],
            "populated_count": value,
            "total_count": int(total),
            "coverage_percent": round(value * 100 / total, 2) if total else 0,
        }
    for code, (source_field, count) in _source_dictionary_coverage(db, period_key).items():
        fields[code] = {
            "profile_field": source_field,
            "populated_count": count,
            "total_count": int(total),
            "coverage_percent": round(count * 100 / total, 2) if total else 0,
            "storage_scope": "source",
        }
    payload = {"period_key": period_key, "total_profiles": int(total), "fields": fields}
    _PROFILE_COVERAGE_CACHE[period_key] = (monotonic(), payload)
    return payload


@router.post("/optional-files")
def upload_optional_file(
    period_key: str = Query(...),
    note: str | None = Query(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    try:
        item = save_optional_file(db, period_key, file, note=note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_model(
        item,
        ["id", "period_key", "original_filename", "file_ext", "file_size", "status", "note", "uploaded_at"],
    )


@router.get("/optional-files")
def list_optional_files(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerProcessingOptionalFile)
        .filter(CustomerProcessingOptionalFile.period_key == period_key)
        .order_by(desc(CustomerProcessingOptionalFile.uploaded_at))
        .all()
    )
    return [
        serialize_model(
            item,
            ["id", "period_key", "original_filename", "file_ext", "file_size", "status", "note", "uploaded_at"],
        )
        for item in rows
    ]


@router.get("/exchange-rates")
def list_exchange_rates(period_key: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerPeriodExchangeRate)
        .filter(CustomerPeriodExchangeRate.period_key == period_key)
        .order_by(CustomerPeriodExchangeRate.ccy)
        .all()
    )
    return [
        serialize_model(item, ["id", "period_key", "ccy", "exchange_rate", "source", "created_at"])
        for item in rows
    ]


@router.post("/jobs/{period_key}")
def start_processing_job(
    period_key: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    running = (
        db.query(CustomerProcessingJob)
        .filter(
            CustomerProcessingJob.period_key == period_key,
            CustomerProcessingJob.status.in_(["queued", "processing"]),
        )
        .first()
    )
    if running:
        return serialize_job(running)

    try:
        job = create_processing_job(db, period_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(process_customer_period, job.id)
    return serialize_job(job)


@router.post("/jobs/{period_key}/recover")
def recover_processing_job(
    period_key: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    active_processing_query = db.execute(
        text(
            """
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state = 'active'
              AND (
                query LIKE '%customer_period_branch_details%'
                OR query LIKE '%customer_period_profiles%'
              )
            """
        )
    ).scalar() or 0
    if active_processing_query > 0:
        raise HTTPException(
            status_code=409,
            detail="PostgreSQL vẫn đang có query xử lý dữ liệu chạy thật. Không tạo job mới để tránh chạy trùng và khóa dữ liệu.",
        )

    running_jobs = (
        db.query(CustomerProcessingJob)
        .filter(
            CustomerProcessingJob.period_key == period_key,
            CustomerProcessingJob.status.in_(["queued", "processing"]),
        )
        .order_by(desc(CustomerProcessingJob.created_at))
        .all()
    )
    for running in running_jobs:
        running.status = "error"
        running.stage = "Job xử lý bị kẹt, đã tạo job mới để chạy lại"
        running.error_message = "Job cũ không còn tiến trình xử lý thực tế hoặc backend đã reload giữa chừng."
        running.finished_at = datetime.now(timezone.utc)
    if running_jobs:
        db.commit()

    try:
        job = create_processing_job(db, period_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(process_customer_period, job.id)
    return serialize_job(job)


@router.get("/jobs")
def list_jobs(period_key: str | None = None, db: Session = Depends(get_db)):
    query = db.query(CustomerProcessingJob)
    if period_key:
        query = query.filter(CustomerProcessingJob.period_key == period_key)
    rows = query.order_by(desc(CustomerProcessingJob.created_at)).limit(20).all()
    return [serialize_job(item) for item in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(CustomerProcessingJob).filter(CustomerProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy job xử lý dữ liệu")
    return serialize_job(job)


@router.get("/reconciliations")
def list_source_reconciliations(
    period_key: str = Query(...),
    source_type: str | None = None,
    branch_code: str | None = None,
    reason_code: str | None = None,
    keyword: str | None = None,
    latest_job_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(CustomerSourceReconciliation).filter(
        CustomerSourceReconciliation.period_key == period_key
    )
    if latest_job_only:
        latest_job_id = db.query(func.max(CustomerSourceReconciliation.processing_job_id)).filter(
            CustomerSourceReconciliation.period_key == period_key
        ).scalar()
        if latest_job_id is not None:
            query = query.filter(CustomerSourceReconciliation.processing_job_id == latest_job_id)
    if source_type:
        query = query.filter(CustomerSourceReconciliation.source_type == source_type.strip().upper())
    if branch_code:
        query = query.filter(CustomerSourceReconciliation.branch_code == branch_code.strip())
    if reason_code:
        query = query.filter(CustomerSourceReconciliation.reason_code == reason_code.strip().upper())
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.filter(or_(
            CustomerSourceReconciliation.customer_core_code.ilike(pattern),
            CustomerSourceReconciliation.customer_name.ilike(pattern),
        ))
    total = query.count()
    rows = (
        query.order_by(
            CustomerSourceReconciliation.source_type,
            CustomerSourceReconciliation.branch_code,
            CustomerSourceReconciliation.customer_core_code,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    fields = [
        "id", "processing_job_id", "period_key", "source_type", "branch_code",
        "customer_core_code", "customer_name", "source_row_count", "source_amount",
        "reason_code", "status", "details", "reviewed_by", "reviewed_at", "created_at",
    ]


@router.get("/quality-audit")
def get_processing_quality_audit(
    period_key: str = Query(...),
    db: Session = Depends(get_db),
):
    batch_exists = db.query(ImportBatch.id).filter(ImportBatch.period_key == period_key).first()
    if not batch_exists:
        raise HTTPException(status_code=404, detail="Kỳ dữ liệu không tồn tại")
    report = validate_processed_period(db, period_key)
    report["period_key"] = period_key
    report["checks"] = [
        {"code": "CIF_POPULATION", "label": "Đủ tập khách hàng CIF", "passed": report["profile_count"] == report["cif_count"], "actual": report["profile_count"], "expected": report["cif_count"]},
        {"code": "UNIQUE_CUSTOMER", "label": "Một mã KH lõi/một hồ sơ", "passed": report["duplicate_customer_codes"] == 0, "actual": report["duplicate_customer_codes"], "expected": 0},
        {"code": "VALID_CUSTOMER_CODE", "label": "Không có mã KH rỗng", "passed": report["blank_customer_codes"] == 0, "actual": report["blank_customer_codes"], "expected": 0},
        {"code": "CIF_REFERENCE", "label": "Mọi hồ sơ đều tham chiếu CIF", "passed": report["customers_not_in_cif"] == 0, "actual": report["customers_not_in_cif"], "expected": 0},
        {"code": "CUSTOMER_LINK", "label": "Liên kết đúng customer_id", "passed": report["wrong_customer_links"] == 0, "actual": report["wrong_customer_links"], "expected": 0},
        {"code": "SOURCE_TOTALS", "label": "Tổng chỉ tiêu khớp dữ liệu nguồn", "passed": report["metric_mismatch_count"] == 0, "actual": report["metric_mismatch_count"], "expected": 0},
    ]
    return report
    return {
        "items": [serialize_model(row, fields) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/optional-files/{optional_file_id}")
def delete_optional_file(optional_file_id: int, db: Session = Depends(get_db)):
    item = db.query(CustomerProcessingOptionalFile).filter(
        CustomerProcessingOptionalFile.id == optional_file_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy file bổ sung")
    running_job = db.query(CustomerProcessingJob.id).filter(
        CustomerProcessingJob.period_key == item.period_key,
        CustomerProcessingJob.status.in_(["queued", "processing"]),
    ).first()
    if running_job:
        raise HTTPException(status_code=409, detail="Không thể xóa khi kỳ đang có job xử lý")
    for model in (SupplementalBaoLanhRecord, SupplementalOABRecord, SupplementalBillPaymentTransaction):
        db.query(model).filter(model.optional_file_id == item.id).delete(synchronize_session=False)
    file_path = Path(item.file_path) if item.file_path else None
    period_key = item.period_key
    db.delete(item)
    db.commit()
    if file_path and file_path.is_file():
        try:
            file_path.unlink()
        except OSError:
            pass
    return {"deleted": True, "id": optional_file_id, "period_key": period_key}


RECONCILIATION_REASON_LABELS = {
    "NOT_FOUND_IN_CIF": "Không tìm thấy mã khách hàng trong Kho CIF",
    "INVALID_CUSTOMER_CODE": "Mã khách hàng không đúng định dạng",
    "MISSING_CORE_CODE": "Thiếu mã khách hàng lõi",
    "MISSING_CUSTOMER_CODE": "Thiếu mã khách hàng",
    "DUPLICATE_CIF": "Mã khách hàng trùng trong Kho CIF",
    "BRANCH_CONFLICT": "Chi nhánh nguồn không khớp thông tin quản lý",
}


@router.get("/reconciliations-export")
def export_source_reconciliations(
    period_key: str = Query(...),
    source_type: str | None = None,
    branch_code: str | None = None,
    reason_code: str | None = None,
    keyword: str | None = None,
    latest_job_only: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerSourceReconciliation).filter(
        CustomerSourceReconciliation.period_key == period_key
    )
    if latest_job_only:
        latest_job_id = db.query(func.max(CustomerSourceReconciliation.processing_job_id)).filter(
            CustomerSourceReconciliation.period_key == period_key
        ).scalar()
        if latest_job_id is not None:
            query = query.filter(CustomerSourceReconciliation.processing_job_id == latest_job_id)
    if source_type:
        query = query.filter(CustomerSourceReconciliation.source_type == source_type.strip().upper())
    if branch_code:
        query = query.filter(CustomerSourceReconciliation.branch_code == branch_code.strip())
    if reason_code:
        query = query.filter(CustomerSourceReconciliation.reason_code == reason_code.strip().upper())
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.filter(or_(
            CustomerSourceReconciliation.customer_core_code.ilike(pattern),
            CustomerSourceReconciliation.customer_name.ilike(pattern),
        ))
    rows = query.order_by(
        CustomerSourceReconciliation.source_type,
        CustomerSourceReconciliation.branch_code,
        CustomerSourceReconciliation.customer_core_code,
    ).all()

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Doi chieu CIF"
    headers = [
        "STT", "Kỳ dữ liệu", "Mã KH lõi", "Tên khách hàng", "Nguồn", "Chi nhánh",
        "Lý do chưa khớp", "Mã lý do", "Số dòng nguồn", "Số tiền nguồn",
        "Trạng thái", "Người rà soát", "Thời gian rà soát", "Thời gian ghi nhận",
    ]
    worksheet.append(headers)
    for index, row in enumerate(rows, 1):
        worksheet.append([
            index, row.period_key, row.customer_core_code, row.customer_name, row.source_type,
            row.branch_code, RECONCILIATION_REASON_LABELS.get(row.reason_code, row.reason_code),
            row.reason_code, row.source_row_count, float(row.source_amount or 0), row.status,
            row.reviewed_by, row.reviewed_at.isoformat() if row.reviewed_at else None,
            row.created_at.isoformat() if row.created_at else None,
        ])
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    widths = [8, 14, 18, 34, 12, 12, 48, 25, 16, 20, 16, 24, 22, 22]
    for index, width in enumerate(widths, 1):
        worksheet.column_dimensions[chr(64 + index)].width = width
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"doi_chieu_cif_{period_key}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/reconciliations/{reconciliation_id}")
def review_source_reconciliation(
    reconciliation_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    row = db.query(CustomerSourceReconciliation).filter(
        CustomerSourceReconciliation.id == reconciliation_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi đối chiếu")

    next_status = str(payload.get("status") or "").strip().lower()
    allowed_statuses = {"pending", "reviewed", "resolved", "ignored"}
    if next_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Trạng thái xử lý không hợp lệ")

    details = dict(row.details or {})
    note = str(payload.get("note") or "").strip()
    if note:
        details["review_note"] = note
    row.details = details
    row.status = next_status
    row.reviewed_by = str(payload.get("reviewed_by") or "Người dùng hệ thống").strip()
    row.reviewed_at = datetime.now(timezone.utc) if next_status != "pending" else None
    db.commit()
    db.refresh(row)
    fields = [
        "id", "processing_job_id", "period_key", "source_type", "branch_code",
        "customer_core_code", "customer_name", "source_row_count", "source_amount",
        "reason_code", "status", "details", "reviewed_by", "reviewed_at", "created_at",
    ]
    return serialize_model(row, fields)


@router.get("/profiles")
def list_profiles(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    no_service: bool = False,
    multi_branch: bool | None = None,
    customer_type: str | None = None,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = Query(default=None, ge=0, le=20),
    missing_phone: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    limit: int | None = Query(default=None, ge=1, le=1000),
    include_total: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
        no_service=no_service,
        customer_type=customer_type,
        has_deposit=has_deposit,
        has_loan=has_loan,
        min_deposit=min_deposit,
        max_deposit=max_deposit,
        min_loan=min_loan,
        max_loan=max_loan,
        min_casa=min_casa,
        max_casa=max_casa,
        service_codes=service_codes,
        min_service_count=min_service_count,
        missing_phone=missing_phone,
    )
    total = query.count() if include_total else None
    query = apply_profile_sort(
        query,
        sort_by=sort_by,
        sort_dir=sort_dir,
        db=db,
        period_key=period_key,
        branch_code=branch_code,
        pgd_code=pgd_code,
    )

    fields = [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "ten_kh",
        "loai_khach_hang",
        "branch_codes",
        "pgd_codes",
        "branch_count",
        "pgd_count",
        "dp_record_count",
        "ten_chu_doanh_nghiep",
        "so_cccd",
        "ma_so_thue",
        "ngay_thanh_lap",
        "dia_chi",
        "gioi_tinh",
        "ngay_sinh",
        "nghe_nghiep",
        "management_source",
        "managing_branch_code",
        "managing_department_code",
        "managing_department_name",
        "so_du_tien_gui",
        "doanh_so_chuyen_tien_ve_tk",
        "last_tktt_transaction_at",
        "tktt_inactive_days",
        "tktt_activity_status",
        "so_du_tien_vay",
        "du_no_ngan_han",
        "du_no_ngan_han_bq",
        "du_no_trung_dai_han",
        "du_no_trung_dai_han_bq",
        "du_no_thau_chi",
        "du_no_thau_chi_bq",
        "pf10_lds_count",
        "pf10_interest",
        "pf10_accruals",
        "pf10_book_correction_interest",
        "du_no_xlrr",
        "ds_thu_no_xlrr",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "thau_chi",
        "tk_so_dep",
        "agribank_plus",
        "tin_nhan_ott",
        "e_banking",
        "sms_nhac_no_vay",
        "sms_tien_gui",
        "the_ghi_no_noi_dia",
        "the_td_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phat_hanh_lc",
        "thuho_dien",
        "thuho_nuoc",
        "hkd_tk",
        "hkd_account_numbers",
        "abic_batk",
        "abic_bathe",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
        "telephone",
        "primary_branch_code",
        "primary_pgd_code",
        "primary_pgd_name",
        "primary_location_score",
        "primary_location_reason",
        "branch_details",
        "processing_job_id",
    ]
    effective_page_size = limit if isinstance(limit, int) else page_size
    rows = (
        query
        .offset((page - 1) * effective_page_size)
        .limit(effective_page_size)
        .all()
    )
    items = _apply_branch_finance_to_payloads(
        db,
        period_key,
        branch_code,
        pgd_code,
        [serialize_model(item, fields) for item in rows],
    )
    items = enrich_profile_org_names(db, items)
    if include_total:
        return {"items": items, "total": total, "page": page, "page_size": effective_page_size}
    return items


@router.get("/financial-metrics")
def get_customer_financial_metrics(
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    db: Session = Depends(get_db),
):
    metric_fields = [
        "phi_bao_lanh", "phi_chuyen_tien", "phi_nhdt", "abic_batd", "phi_kdnt", "phi_lc", "phi_ttqt",
        "dprr_chung_tt", "dprr_chung_lk", "dprr_cuthe_tt", "dprr_cuthe_lk",
    ]
    query = db.query(CustomerPeriodBranchDetail).filter(
        CustomerPeriodBranchDetail.period_key == period_key,
        CustomerPeriodBranchDetail.ma_kh == ma_kh,
    )
    if branch_code:
        query = query.filter(CustomerPeriodBranchDetail.branch_code == branch_code)
    rows = query.all()
    grouped: dict[str, dict] = {}
    for row in rows:
        code = row.branch_code or "UNKNOWN"
        item = grouped.setdefault(code, {"branch_code": code, **{field: Decimal(0) for field in metric_fields}})
        for field in metric_fields:
            value = getattr(row, field)
            if value is not None:
                item[field] += value

    branches = []
    for code in sorted(grouped):
        item = grouped[code]
        branches.append({key: serialize_value(value) if key in metric_fields else value for key, value in item.items()})
    totals = {
        field: serialize_value(sum((Decimal(str(item[field])) for item in branches), Decimal(0)))
        for field in metric_fields
    }
    return {"period_key": period_key, "ma_kh": ma_kh, "totals": totals, "branches": branches}


@router.get("/rr01-handled-risk")
def get_rr01_handled_risk(
    period_key: str = Query(...), ma_kh: str = Query(...), branch_code: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(RR01HandledRiskLoan).filter(
        RR01HandledRiskLoan.period_key == period_key,
        RR01HandledRiskLoan.customer_code == ma_kh,
    )
    if branch_code:
        query = query.filter(RR01HandledRiskLoan.branch_code == branch_code)
    rows = query.order_by(RR01HandledRiskLoan.lav_number, RR01HandledRiskLoan.lds_number).all()
    fields = [
        "id", "branch_code", "customer_code", "customer_name", "lav_number", "lds_number", "currency_code",
        "customer_type", "disbursement_date", "maturity_date", "vamc_flag", "risk_handling_date",
        "original_principal", "original_accrued_interest", "recovered_principal_before_period",
        "current_principal", "current_interest", "short_term_principal", "medium_term_principal",
        "long_term_principal", "recovered_principal_period", "recovered_interest_period",
        "real_estate_amount", "movable_asset_amount", "other_asset_amount",
    ]
    groups = {}
    for row in rows:
        key = row.lav_number or "CHUA_XAC_DINH"
        item = groups.setdefault(key, {"lav_number": row.lav_number, "lds_count": 0, "current_principal": Decimal(0), "recovered_amount": Decimal(0)})
        item["lds_count"] += 1
        item["current_principal"] += row.current_principal or 0
        item["recovered_amount"] += (row.recovered_principal_period or 0) + (row.recovered_interest_period or 0)
    return {
        "period_key": period_key, "ma_kh": ma_kh,
        "total_current_principal": serialize_value(sum((row.current_principal or 0 for row in rows), Decimal(0))),
        "total_recovered_amount": serialize_value(sum(((row.recovered_principal_period or 0) + (row.recovered_interest_period or 0) for row in rows), Decimal(0))),
        "lav_groups": [{**value, "current_principal": serialize_value(value["current_principal"]), "recovered_amount": serialize_value(value["recovered_amount"])} for value in groups.values()],
        "items": [serialize_model(row, fields) for row in rows],
    }


@router.get("/gl02-account-activity")
def get_gl02_account_activity(
    period_key: str = Query(...), ma_kh: str = Query(...), branch_code: str | None = None,
    db: Session = Depends(get_db),
):
    base_filters = [
        GL02LedgerTransaction.period_key == period_key,
        GL02LedgerTransaction.customer_code == ma_kh,
        GL02LedgerTransaction.account_code == "421101",
        func.coalesce(GL02LedgerTransaction.transaction_type, "Normal") == "Normal",
    ]
    if branch_code:
        base_filters.append(GL02LedgerTransaction.customer_branch_code == branch_code)

    daily_rows = db.query(
        GL02LedgerTransaction.transaction_date.label("transaction_date"),
        func.sum(func.coalesce(GL02LedgerTransaction.credit_amount, 0)).label("credit_amount"),
        func.sum(func.coalesce(GL02LedgerTransaction.debit_amount, 0)).label("debit_amount"),
        func.count(GL02LedgerTransaction.id).label("transaction_count"),
        func.max(func.coalesce(GL02LedgerTransaction.created_datetime, func.cast(GL02LedgerTransaction.transaction_date, SQLDateTime))).label("last_transaction_at"),
    ).filter(*base_filters).group_by(GL02LedgerTransaction.transaction_date).order_by(GL02LedgerTransaction.transaction_date).all()

    branch_rows = db.query(
        GL02LedgerTransaction.customer_branch_code.label("branch_code"),
        func.sum(func.coalesce(GL02LedgerTransaction.credit_amount, 0)).label("credit_amount"),
        func.sum(func.coalesce(GL02LedgerTransaction.debit_amount, 0)).label("debit_amount"),
        func.count(GL02LedgerTransaction.id).label("transaction_count"),
        func.count(distinct(GL02LedgerTransaction.transaction_date)).label("active_days"),
        func.max(func.coalesce(GL02LedgerTransaction.created_datetime, func.cast(GL02LedgerTransaction.transaction_date, SQLDateTime))).label("last_transaction_at"),
    ).filter(*base_filters).group_by(GL02LedgerTransaction.customer_branch_code).order_by(GL02LedgerTransaction.customer_branch_code).all()

    history_rows = db.query(
        GL02LedgerTransaction.period_key.label("period_key"),
        ImportBatch.period_date.label("period_date"),
        func.sum(func.coalesce(GL02LedgerTransaction.credit_amount, 0)).label("credit_amount"),
        func.sum(func.coalesce(GL02LedgerTransaction.debit_amount, 0)).label("debit_amount"),
        func.count(GL02LedgerTransaction.id).label("transaction_count"),
        func.count(distinct(GL02LedgerTransaction.transaction_date)).label("active_days"),
        func.max(func.coalesce(GL02LedgerTransaction.created_datetime, func.cast(GL02LedgerTransaction.transaction_date, SQLDateTime))).label("last_transaction_at"),
    ).join(ImportBatch, ImportBatch.id == GL02LedgerTransaction.import_batch_id).filter(
        GL02LedgerTransaction.customer_code == ma_kh,
        GL02LedgerTransaction.account_code == "421101",
        func.coalesce(GL02LedgerTransaction.transaction_type, "Normal") == "Normal",
        *([GL02LedgerTransaction.customer_branch_code == branch_code] if branch_code else []),
    ).group_by(GL02LedgerTransaction.period_key, ImportBatch.period_date).order_by(GL02LedgerTransaction.period_key.desc()).limit(12).all()

    def activity(period_date, last_transaction_at):
        if not period_date or not last_transaction_at:
            return None, "inactive"
        days = max(0, (period_date - last_transaction_at.date()).days)
        return days, "active" if days <= 7 else "low_activity" if days <= 30 else "inactive"

    daily = [{
        "transaction_date": serialize_value(row.transaction_date),
        "credit_amount": serialize_value(row.credit_amount), "debit_amount": serialize_value(row.debit_amount),
        "net_amount": serialize_value((row.credit_amount or 0) - (row.debit_amount or 0)),
        "transaction_count": row.transaction_count, "last_transaction_at": serialize_value(row.last_transaction_at),
    } for row in daily_rows]
    branches = [{
        "branch_code": row.branch_code, "credit_amount": serialize_value(row.credit_amount),
        "debit_amount": serialize_value(row.debit_amount),
        "net_amount": serialize_value((row.credit_amount or 0) - (row.debit_amount or 0)),
        "transaction_count": row.transaction_count, "active_days": row.active_days,
        "last_transaction_at": serialize_value(row.last_transaction_at),
    } for row in branch_rows if row.branch_code]
    history = []
    for row in history_rows:
        inactive_days, status = activity(row.period_date, row.last_transaction_at)
        history.append({
            "period_key": row.period_key, "credit_amount": serialize_value(row.credit_amount),
            "debit_amount": serialize_value(row.debit_amount),
            "net_amount": serialize_value((row.credit_amount or 0) - (row.debit_amount or 0)),
            "transaction_count": row.transaction_count, "active_days": row.active_days,
            "last_transaction_at": serialize_value(row.last_transaction_at),
            "inactive_days": inactive_days, "activity_status": status,
        })
    return {"period_key": period_key, "ma_kh": ma_kh, "daily": daily, "branches": branches, "history": history}


@router.get("/pf10-loans")
def get_pf10_customer_loans(
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    category: str | None = None,
    branch_code: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(CustomerPeriodProfile)
        .filter(
            CustomerPeriodProfile.period_key == period_key,
            CustomerPeriodProfile.ma_kh == ma_kh,
        )
        .first()
    )
    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Khách hàng chưa có trong kết quả xử lý dữ liệu của kỳ",
        )

    all_branch_query = db.query(PF10LoanProfitability).filter(
        PF10LoanProfitability.period_key == period_key,
        PF10LoanProfitability.customer_code == ma_kh,
    )
    branch_rows = (
        all_branch_query.with_entities(PF10LoanProfitability.branch_code)
        .distinct()
        .order_by(PF10LoanProfitability.branch_code)
        .all()
    )
    branches = [row[0] for row in branch_rows if row[0]]
    base_query = all_branch_query
    if branch_code:
        base_query = base_query.filter(PF10LoanProfitability.branch_code == branch_code)

    category_rows = []
    for key, loan_types in PF10_LOAN_TYPE_GROUPS.items():
        values = (
            base_query.filter(PF10LoanProfitability.loan_type.in_(loan_types))
            .with_entities(
                func.count(func.distinct(PF10LoanProfitability.account_number)),
                func.coalesce(func.sum(PF10LoanProfitability.end_of_month_balance), 0),
                func.coalesce(func.sum(PF10LoanProfitability.average_balance), 0),
                func.coalesce(func.sum(PF10LoanProfitability.interest_amount), 0),
                func.coalesce(func.sum(PF10LoanProfitability.accruals), 0),
                func.coalesce(func.sum(PF10LoanProfitability.book_correction_interest), 0),
                func.count(func.distinct(PF10LoanProfitability.branch_code)),
            )
            .one()
        )
        category_rows.append({
            "key": key,
            "loan_types": sorted(loan_types),
            "account_count": int(values[0] or 0),
            "end_balance": serialize_value(values[1]),
            "average_balance": serialize_value(values[2]),
            "interest": serialize_value(values[3]),
            "accruals": serialize_value(values[4]),
            "book_correction_interest": serialize_value(values[5]),
            "branch_count": int(values[6] or 0),
        })

    detail_query = base_query
    selected_types = PF10_LOAN_TYPE_GROUPS.get(category or "")
    if selected_types:
        detail_query = detail_query.filter(PF10LoanProfitability.loan_type.in_(selected_types))
    total = detail_query.count()
    rows = (
        detail_query.order_by(
            PF10LoanProfitability.branch_code,
            PF10LoanProfitability.loan_type,
            desc(PF10LoanProfitability.end_of_month_balance),
            PF10LoanProfitability.account_number,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    dp01_branches = {
        row[0]
        for row in (
            db.query(DP01DepositAccount.branch_code)
            .filter(
                DP01DepositAccount.period_key == period_key,
                DP01DepositAccount.ma_kh == ma_kh,
            )
            .distinct()
            .all()
        )
        if row[0]
    }

    fields = [
        "id", "branch_code", "account_number", "customer_code", "customer_name",
        "loan_type", "balance_sheet_account_code", "average_balance",
        "end_of_month_balance", "month_term", "opening_date", "maturity_date",
        "closing_date", "contract_rate", "monthly_total_interest",
        "book_correction_interest", "accruals", "interest_amount", "ratio",
        "currency_code",
    ]
    items = []
    for row in rows:
        payload = serialize_model(row, fields)
        payload["loan_type_label"] = PF10_LOAN_TYPE_LABELS.get(row.loan_type, row.loan_type or "Khác")
        payload["dp01_match_status"] = (
            "same_branch" if row.branch_code in dp01_branches else "other_branch"
        )
        balance = float(row.end_of_month_balance or 0)
        if row.closing_date and row.closing_date <= profile.period_date:
            status = "closed"
        elif balance == 0:
            status = "closed"
        elif (
            row.maturity_date
            and row.maturity_date.year == profile.period_date.year
            and row.maturity_date.month == profile.period_date.month
        ):
            status = "due_in_month"
        elif row.maturity_date and 0 < (row.maturity_date - profile.period_date).days <= 90:
            status = "due_soon"
        else:
            status = "active"
        payload["loan_status"] = status
        items.append(payload)

    risk_query = db.query(BC29CustomerCreditRisk).filter(
        BC29CustomerCreditRisk.period_key == period_key,
        BC29CustomerCreditRisk.customer_code == ma_kh,
    )
    if branch_code:
        risk_query = risk_query.filter(BC29CustomerCreditRisk.branch_code == branch_code)
    risk_rows = risk_query.order_by(BC29CustomerCreditRisk.branch_code).all()
    risk = {
        "available": bool(risk_rows),
        "debt_groups": sorted({str(row.debt_group) for row in risk_rows if row.debt_group is not None}),
        "max_principal_overdue_days": max((row.principal_overdue_days or 0 for row in risk_rows), default=0),
        "max_interest_overdue_days": max((row.interest_overdue_days or 0 for row in risk_rows), default=0),
        "specific_provision": serialize_value(sum((row.period_provision_amount or 0 for row in risk_rows), Decimal(0))),
        "collateral_value": serialize_value(sum((row.total_collateral_value or 0 for row in risk_rows), Decimal(0))),
        "handled_risk_amount": serialize_value(sum((row.handled_risk_amount or 0 for row in risk_rows), Decimal(0))),
        "items": [
            serialize_model(
                row,
                [
                    "id", "branch_code", "debt_group", "classification", "total_outstanding",
                    "period_provision_amount", "total_collateral_value",
                    "principal_overdue_days", "interest_overdue_days",
                    "handled_risk_amount", "risk_handling_date",
                ],
            )
            for row in risk_rows
        ],
    }

    if profile.period_date.month == 12:
        next_month_start = date(profile.period_date.year + 1, 1, 1)
        next_month_end = date(profile.period_date.year + 1, 2, 1)
    else:
        next_month_start = date(profile.period_date.year, profile.period_date.month + 1, 1)
        if next_month_start.month == 12:
            next_month_end = date(next_month_start.year + 1, 1, 1)
        else:
            next_month_end = date(next_month_start.year, next_month_start.month + 1, 1)

    ln_scope = db.query(LN01Loan).filter(
        LN01Loan.period_key == period_key,
        LN01Loan.custseq == ma_kh,
    )
    if branch_code:
        ln_scope = ln_scope.filter(LN01Loan.brcd == branch_code)
    ln_rows = ln_scope.all()
    for item in items:
        candidates = [row for row in ln_rows if row.brcd == item.get("branch_code")]
        if len(candidates) > 1:
            target = Decimal(str(item.get("end_of_month_balance") or 0))
            candidates.sort(key=lambda row: abs(Decimal(row.du_no or 0) - target))
        matched_ln = candidates[0] if candidates else None
        item["lds_number"] = matched_ln.dsbsseq if matched_ln else None
        item["approval_number"] = matched_ln.apprseq if matched_ln else None
    def ln_raw(row, key):
        return (row.raw_data or {}).get(key)

    def ln_decimal(row, attr, raw_key):
        value = getattr(row, attr, None)
        if value is not None:
            return value
        raw = str(ln_raw(row, raw_key) or "").strip().strip("'")
        try:
            return Decimal(raw) if raw else Decimal(0)
        except Exception:
            return Decimal(0)

    def ln_date(row, attr, raw_key):
        value = getattr(row, attr, None)
        if value is not None:
            return value
        raw = str(ln_raw(row, raw_key) or "").strip().strip("'")
        try:
            return date(int(raw[:4]), int(raw[4:6]), int(raw[6:8])) if len(raw) == 8 and raw != "00000000" else None
        except Exception:
            return None

    principal_due = sum(
        ln_decimal(row, "next_repayment_amount", "NEXT_REPAY_AMOUNT")
        for row in ln_rows
        if (next_date := ln_date(row, "next_repayment_date", "NEXT_REPAY_DATE"))
        and next_month_start <= next_date < next_month_end
    )
    interest_due = sum(
        (ln_decimal(row, "total_interest_repayment_amount", "TOTAL_INTEREST_REPAY_AMOUNT")
         or ln_decimal(row, "interest_amount", "INTEREST_AMOUNT"))
        for row in ln_rows
        if (next_date := ln_date(row, "next_interest_repayment_date", "NEXT_INT_REPAY_DATE"))
        and next_month_start <= next_date < next_month_end
    )
    overdue_interest = sum(ln_decimal(row, "pastdue_interest_amount", "PASTDUE_INTEREST_AMOUNT") for row in ln_rows)
    current_groups = sorted({str(row.debt_group or str(ln_raw(row, "NHOM_NO") or "").strip().strip("'")).lstrip("0") or "0" for row in ln_rows if row.debt_group or ln_raw(row, "NHOM_NO")})
    previous_ln_period = (
        db.query(func.max(LN01Loan.period_key))
        .filter(LN01Loan.period_key < period_key, LN01Loan.custseq == ma_kh)
        .scalar()
    )
    previous_group_query = db.query(LN01Loan).filter(
        LN01Loan.period_key == previous_ln_period,
        LN01Loan.custseq == ma_kh,
    ) if previous_ln_period else None
    if previous_group_query is not None and branch_code:
        previous_group_query = previous_group_query.filter(LN01Loan.brcd == branch_code)
    previous_groups = sorted({
        str(row.debt_group or str((row.raw_data or {}).get("NHOM_NO") or "").strip().strip("'")).lstrip("0") or "0"
        for row in previous_group_query.all()
        if row.debt_group or (row.raw_data or {}).get("NHOM_NO")
    }) if previous_group_query is not None else []
    obligations = {
        "source_available": bool(ln_rows),
        "next_month": next_month_start.strftime("%m/%Y"),
        "principal_due": serialize_value(principal_due),
        "interest_due": serialize_value(interest_due),
        "overdue_interest": serialize_value(overdue_interest),
        "overdue_loan_count": sum(1 for row in ln_rows if ln_decimal(row, "pastdue_interest_amount", "PASTDUE_INTEREST_AMOUNT") > 0),
        "current_debt_groups": current_groups,
        "previous_period": previous_ln_period,
        "previous_debt_groups": previous_groups,
        "debt_group_changed": bool(previous_groups and current_groups and previous_groups != current_groups),
    }

    return {
        "period_key": period_key,
        "ma_kh": ma_kh,
        "customer_name": profile.ten_kh,
        "categories": category_rows,
        "branches": branches,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "risk": risk,
        "obligations": obligations,
    }


@router.get("/deposit-accounts")
def get_customer_deposit_accounts(
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    category: str | None = None,
    branch_code: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(CustomerPeriodProfile)
        .filter(
            CustomerPeriodProfile.period_key == period_key,
            CustomerPeriodProfile.ma_kh == ma_kh,
        )
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Khách hàng chưa có trong kết quả xử lý của kỳ")

    all_branch_query = db.query(PF14AccountBalance).filter(
        PF14AccountBalance.period_key == period_key,
        PF14AccountBalance.custseq == ma_kh,
    )
    branches = [
        row[0]
        for row in (
            all_branch_query.with_entities(PF14AccountBalance.trbrcd)
            .distinct()
            .order_by(PF14AccountBalance.trbrcd)
            .all()
        )
        if row[0]
    ]
    base_query = all_branch_query
    if branch_code:
        base_query = base_query.filter(PF14AccountBalance.trbrcd == branch_code)

    categories = []
    rate_join = and_(
        CustomerPeriodExchangeRate.period_key == PF14AccountBalance.period_key,
        CustomerPeriodExchangeRate.ccy == func.upper(func.trim(func.coalesce(PF14AccountBalance.ccy, "VND"))),
    )
    for key, condition in (
        ("demand", func.coalesce(PF14AccountBalance.monterm, 0) == 0),
        ("term", func.coalesce(PF14AccountBalance.monterm, 0) > 0),
    ):
        values = (
            base_query.outerjoin(CustomerPeriodExchangeRate, rate_join)
            .filter(condition)
            .with_entities(
                func.count(func.distinct(PF14AccountBalance.accountno)),
                func.coalesce(func.sum(
                    PF14AccountBalance.monthlyendbalance
                    * func.coalesce(CustomerPeriodExchangeRate.exchange_rate, 1)
                ), 0),
                func.coalesce(func.sum(
                    PF14AccountBalance.averagebalance
                    * func.coalesce(CustomerPeriodExchangeRate.exchange_rate, 1)
                ), 0),
                func.count(func.distinct(PF14AccountBalance.trbrcd)),
            )
            .one()
        )
        categories.append({
            "key": key,
            "account_count": int(values[0] or 0),
            "end_balance": serialize_value(values[1]),
            "average_balance": serialize_value(values[2]),
            "branch_count": int(values[3] or 0),
        })

    previous_period = (
        db.query(func.max(PF14AccountBalance.period_key))
        .filter(
            PF14AccountBalance.period_key < period_key,
            PF14AccountBalance.custseq == ma_kh,
        )
        .scalar()
    )
    current_rows = base_query.all()
    previous_query = db.query(PF14AccountBalance).filter(
        PF14AccountBalance.period_key == previous_period,
        PF14AccountBalance.custseq == ma_kh,
    ) if previous_period else None
    if previous_query is not None and branch_code:
        previous_query = previous_query.filter(PF14AccountBalance.trbrcd == branch_code)
    previous_rows = previous_query.all() if previous_query is not None else []
    rate_periods = [value for value in (period_key, previous_period) if value]
    rate_rows = (
        db.query(CustomerPeriodExchangeRate)
        .filter(CustomerPeriodExchangeRate.period_key.in_(rate_periods))
        .all()
    )
    rates = {(item.period_key, item.ccy): item.exchange_rate for item in rate_rows}

    def exchange_rate(source_period: str | None, ccy: str | None) -> Decimal:
        code = str(ccy or "VND").strip().upper()
        return Decimal(rates.get((source_period, code)) or (1 if code == "VND" else 1))

    current_map = {(row.trbrcd, row.accountno): row for row in current_rows if row.accountno}
    previous_map = {(row.trbrcd, row.accountno): row for row in previous_rows if row.accountno}
    combined_keys = set(current_map) | set(previous_map)
    if category == "demand":
        combined_keys = {
            key for key in combined_keys
            if (current_map.get(key) or previous_map.get(key)).monterm in (None, 0)
        }
    elif category == "term":
        combined_keys = {
            key for key in combined_keys
            if ((current_map.get(key) or previous_map.get(key)).monterm or 0) > 0
        }

    account_keys = [key[1] for key in combined_keys]
    dp_rows = (
        db.query(DP01DepositAccount)
        .filter(
            DP01DepositAccount.period_key.in_([value for value in (period_key, previous_period) if value]),
            DP01DepositAccount.ma_kh == ma_kh,
        )
        .all()
        if account_keys else []
    )
    dp_by_account = {
        (row.period_key, row.branch_code or row.ma_cn, row.so_tai_khoan): row
        for row in dp_rows
    }
    dp_product_names = {
        (row.period_key, row.branch_code or row.ma_cn, row.dp_type_code): row.dp_type_name
        for row in dp_rows
        if row.dp_type_code and row.dp_type_name
    }

    items = []
    for key in combined_keys:
        current = current_map.get(key)
        previous = previous_map.get(key)
        row = current or previous
        current_original = current.monthlyendbalance if current else Decimal(0)
        previous_original = previous.monthlyendbalance if previous else Decimal(0)
        current_rate = exchange_rate(period_key, current.ccy if current else row.ccy)
        previous_rate = exchange_rate(previous_period, previous.ccy if previous else row.ccy)
        current_balance = (current_original or 0) * current_rate
        previous_balance = (previous_original or 0) * previous_rate
        if current is None or (float(current_balance or 0) == 0 and float(previous_balance or 0) > 0):
            account_status = "closed"
        elif previous is None:
            account_status = "new"
        else:
            account_status = "active"
        dp = (
            dp_by_account.get((period_key, row.trbrcd, row.accountno))
            or dp_by_account.get((previous_period, row.trbrcd, row.accountno))
        )
        fallback_deposit_type = (
            dp_product_names.get((period_key, row.trbrcd, row.productcode))
            or dp_product_names.get((previous_period, row.trbrcd, row.productcode))
        )
        items.append({
            "id": row.id if current else f"closed-{row.id}",
            "branch_code": row.trbrcd,
            "account_number": row.accountno,
            "product_code": row.productcode,
            "deposit_type": dp.dp_type_name if dp else fallback_deposit_type,
            "deposit_type_source": "DP01" if (dp or fallback_deposit_type) else None,
            "deposit_type_match": "account_number" if dp else ("product_code" if fallback_deposit_type else None),
            "account_source": "PF14",
            "currency_code": row.ccy,
            "exchange_rate": serialize_value(current_rate if current else previous_rate),
            "month_term": row.monterm,
            "opening_date": serialize_value(dp.opening_date) if dp else None,
            "maturity_date": serialize_value(dp.maturity_date) if dp else None,
            "end_balance": serialize_value(current_balance),
            "end_balance_original": serialize_value(current_original),
            "average_balance": serialize_value(
                (current.averagebalance or 0) * current_rate if current else 0
            ),
            "average_balance_original": serialize_value(current.averagebalance if current else 0),
            "previous_balance": serialize_value(previous_balance),
            "previous_balance_original": serialize_value(previous_original),
            "balance_change": serialize_value((current_balance or 0) - (previous_balance or 0)),
            "account_status": (
                "closed"
                if dp and dp.close_date and dp.close_date <= profile.period_date
                else (
                    "inactive"
                    if dp and str(dp.account_status or "").strip().lower() == "inactive"
                    else account_status
                )
            ),
            "source_account_status": dp.account_status if dp else None,
        })
    status_order = {"new": 0, "active": 1, "closed": 2}
    items.sort(
        key=lambda item: (
            status_order.get(item["account_status"], 9),
            item["branch_code"] or "",
            -float(item["end_balance"] or 0),
            item["account_number"] or "",
        )
    )
    total = len(items)
    total_end_balance = sum(float(item["end_balance"] or 0) for item in items)
    total_average_balance = sum(float(item["average_balance"] or 0) for item in items)
    total_previous_balance = sum(float(item["previous_balance"] or 0) for item in items)
    for item in items:
        end_balance = float(item["end_balance"] or 0)
        average_balance = float(item["average_balance"] or 0)
        item["retention_rate"] = (
            round(average_balance * 100 / end_balance, 2) if end_balance > 0 else None
        )
        item["low_average_high_end"] = bool(end_balance > 0 and average_balance / end_balance < 0.5)
        item["high_average_end_drop"] = bool(average_balance > 0 and end_balance / average_balance < 0.5)
    status_counts = {
        status: sum(1 for item in items if item["account_status"] == status)
        for status in ("active", "inactive", "new", "closed")
    }
    analytics = {
        **status_counts,
        "total_end_balance": total_end_balance,
        "total_average_balance": total_average_balance,
        "total_previous_balance": total_previous_balance,
        "balance_change": total_end_balance - total_previous_balance,
        "volatility_rate": (
            round(abs(total_end_balance - total_previous_balance) * 100 / abs(total_previous_balance), 2)
            if total_previous_balance else None
        ),
        "retention_rate": (
            round(total_average_balance * 100 / total_end_balance, 2)
            if total_end_balance > 0 else None
        ),
        "balance_usage_rate": (
            round(total_average_balance * 100 / max(total_average_balance, total_end_balance), 2)
            if max(total_average_balance, total_end_balance) > 0 else None
        ),
        "low_average_high_end_count": sum(1 for item in items if item["low_average_high_end"]),
        "high_average_end_drop_count": sum(1 for item in items if item["high_average_end_drop"]),
    }

    # DP01 contains the real customer account/passbook number. PF14 ACCOUNTNO can
    # be an analytical identifier, so it must not be presented as the account number.
    dp_current = db.query(DP01DepositAccount).filter(
        DP01DepositAccount.period_key == period_key,
        DP01DepositAccount.ma_kh == ma_kh,
        DP01DepositAccount.so_tai_khoan.isnot(None),
    )
    dp_previous = db.query(DP01DepositAccount).filter(
        DP01DepositAccount.period_key == previous_period,
        DP01DepositAccount.ma_kh == ma_kh,
        DP01DepositAccount.so_tai_khoan.isnot(None),
    ) if previous_period else None
    if branch_code:
        dp_current = dp_current.filter(DP01DepositAccount.branch_code == branch_code)
        if dp_previous is not None:
            dp_previous = dp_previous.filter(DP01DepositAccount.branch_code == branch_code)
    # OSB is still a payment-account product and must remain in the TKTT group.
    dp_current_rows = dp_current.all()
    dp_previous_rows = dp_previous.all() if dp_previous is not None else []
    dp_current_map = {(row.branch_code, row.so_tai_khoan): row for row in dp_current_rows}
    dp_previous_map = {(row.branch_code, row.so_tai_khoan): row for row in dp_previous_rows}
    dp_keys = set(dp_current_map) | set(dp_previous_map)

    def dp_is_term(row):
        try:
            return int(str(row.month_term or "0").strip().strip("'") or 0) > 0
        except ValueError:
            return False

    if category == "demand":
        dp_keys = {key for key in dp_keys if not dp_is_term(dp_current_map.get(key) or dp_previous_map.get(key))}
    elif category == "term":
        dp_keys = {key for key in dp_keys if dp_is_term(dp_current_map.get(key) or dp_previous_map.get(key))}

    pf_by_account = {(row.trbrcd, row.accountno): row for row in current_rows if row.accountno}
    pf_by_product = {}
    for row in current_rows:
        if row.productcode:
            pf_by_product.setdefault((row.trbrcd, str(row.productcode).strip()), []).append(row)

    dp_items = []
    for key in dp_keys:
        current_dp, previous_dp = dp_current_map.get(key), dp_previous_map.get(key)
        row = current_dp or previous_dp
        pf = pf_by_account.get(key)
        if not pf:
            product_matches = pf_by_product.get((row.branch_code, str(row.dp_type_code or "").strip()), [])
            pf = product_matches[0] if len(product_matches) == 1 else None
        current_original = current_dp.current_balance if current_dp else Decimal(0)
        previous_original = previous_dp.current_balance if previous_dp else Decimal(0)
        current_rate = exchange_rate(period_key, (current_dp or row).ccy)
        previous_rate = exchange_rate(previous_period, (previous_dp or row).ccy)
        end_balance = (current_original or 0) * current_rate
        previous_balance = (previous_original or 0) * previous_rate
        average_original = pf.averagebalance if pf else None
        average_balance = (average_original or 0) * current_rate
        status = "closed" if current_dp is None else "new" if previous_dp is None else "active"
        if current_dp and current_dp.close_date and current_dp.close_date <= profile.period_date:
            status = "closed"
        elif current_dp and str(current_dp.account_status or "").strip().lower() == "inactive":
            status = "inactive"
        dp_items.append({
            "id": current_dp.id if current_dp else f"closed-dp-{previous_dp.id}",
            "branch_code": row.branch_code,
            "account_number": row.so_tai_khoan,
            "product_code": row.dp_type_code,
            "deposit_type": row.dp_type_name,
            "deposit_type_source": "DP01",
            "deposit_type_match": "account_number",
            "account_source": "DP01",
            "currency_code": row.ccy or "VND",
            "exchange_rate": serialize_value(current_rate if current_dp else previous_rate),
            "month_term": int(str(row.month_term or "0").strip().strip("'") or 0),
            "opening_date": serialize_value(row.opening_date),
            "maturity_date": serialize_value(row.maturity_date),
            "end_balance": serialize_value(end_balance),
            "end_balance_original": serialize_value(current_original),
            "average_balance": serialize_value(average_balance) if pf else None,
            "average_balance_original": serialize_value(average_original) if pf else None,
            "previous_balance": serialize_value(previous_balance),
            "previous_balance_original": serialize_value(previous_original),
            "balance_change": serialize_value(end_balance - previous_balance),
            "account_status": status,
            "source_account_status": row.account_status,
            "retention_rate": round(float(average_balance) * 100 / float(end_balance), 2) if pf and end_balance > 0 else None,
            "low_average_high_end": False,
            "high_average_end_drop": False,
        })
    dp_items.sort(key=lambda item: (status_order.get(item["account_status"], 9), item["branch_code"] or "", item["account_number"] or ""))
    items = dp_items
    total = len(items)
    categories = []
    for key, wants_term in (("demand", False), ("term", True)):
        rows_for_category = [row for row in dp_current_rows if dp_is_term(row) == wants_term]
        categories.append({
            "key": key,
            "account_count": len({row.so_tai_khoan for row in rows_for_category}),
            "end_balance": serialize_value(sum(((row.current_balance or 0) * exchange_rate(period_key, row.ccy) for row in rows_for_category), Decimal(0))),
            "average_balance": serialize_value(sum((Decimal(str(item.get("average_balance") or 0)) for item in dp_items if dp_is_term(dp_current_map.get((item["branch_code"], item["account_number"])) or dp_previous_map.get((item["branch_code"], item["account_number"]))) == wants_term), Decimal(0))),
            "branch_count": len({row.branch_code for row in rows_for_category}),
        })
    analytics["active"] = sum(1 for item in dp_items if item["account_status"] == "active")
    analytics["inactive"] = sum(1 for item in dp_items if item["account_status"] == "inactive")
    analytics["new"] = sum(1 for item in dp_items if item["account_status"] == "new")
    analytics["closed"] = sum(1 for item in dp_items if item["account_status"] == "closed")
    start = (page - 1) * page_size
    items = items[start:start + page_size]

    return {
        "period_key": period_key,
        "ma_kh": ma_kh,
        "customer_name": profile.ten_kh,
        "categories": categories,
        "branches": branches,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "previous_period": previous_period,
        "analytics": analytics,
    }


@router.get("/customer-classification-history")
def get_customer_classification_history(
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(BC06CustomerClassification).filter(
        BC06CustomerClassification.customer_code == ma_kh,
    )
    if branch_code:
        query = query.filter(BC06CustomerClassification.branch_code == branch_code)
    rows = query.order_by(
        BC06CustomerClassification.period_key,
        BC06CustomerClassification.branch_code,
    ).all()
    fields = [
        "id", "period_key", "period_date", "branch_code", "branch_name",
        "customer_code", "customer_name", "customer_type",
        "benefit_score_branch", "balance_score_branch", "qualitative_score_branch",
        "customer_score_branch", "segment_branch", "rank_branch",
        "segment_system", "rank_system", "market_segment_branch", "market_rank_branch",
    ]
    return {
        "ma_kh": ma_kh,
        "branches": sorted({row.branch_code for row in rows if row.branch_code}),
        "items": [serialize_model(row, fields) for row in rows],
    }


EXPORT_MAX_ROWS = 100_000

PROFILE_EXPORT_COLUMNS = [
    ("ma_kh", "Mã KH"),
    ("ten_kh", "Tên KH"),
    ("loai_khach_hang", "Loại KH"),
    ("branch_codes", "Mã CN"),
    ("primary_branch_code", "CN chính"),
    ("pgd_codes", "PGD"),
    ("primary_pgd_code", "PGD chính"),
    ("primary_pgd_name", "Tên PGD chính"),
    ("so_du_tien_vay", "Dư nợ vay"),
    ("so_du_tien_gui", "Tiền gửi CKH"),
    ("so_du_tgtt_binh_quan", "TGTT bình quân"),
    ("doanh_so_chuyen_tien_ve_tk", "DS chuyển tiền về TK"),
    ("loai_vay", "Loại vay"),
    ("ma_cb", "Mã cán bộ"),
    ("ten_can_bo", "Tên cán bộ"),
    ("telephone", "Số điện thoại"),
    ("branch_count", "Số CN"),
    ("pgd_count", "Số PGD"),
    ("thau_chi", "Thấu chi"),
    ("tk_so_dep", "TK số đẹp"),
    ("agribank_plus", "Agribank Plus"),
    ("tin_nhan_ott", "Tin nhắn OTT"),
    ("sms_nhac_no_vay", "SMS nhắc nợ vay"),
    ("sms_tien_gui", "SMS tiền gửi"),
    ("the_ghi_no_noi_dia", "Thẻ ghi nợ nội địa"),
    ("the_td_quoc_te", "Thẻ TD quốc tế"),
    ("the_td_loc_viet", "Thẻ TD Lộc Việt"),
]


@router.get("/profiles/export")
def export_profiles(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    no_service: bool = False,
    multi_branch: bool | None = None,
    customer_type: str | None = None,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = Query(default=None, ge=0, le=20),
    missing_phone: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
):
    """Xuất Excel theo đúng bộ lọc báo cáo (tối đa EXPORT_MAX_ROWS dòng)."""
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
        no_service=no_service,
        customer_type=customer_type,
        has_deposit=has_deposit,
        has_loan=has_loan,
        min_deposit=min_deposit,
        max_deposit=max_deposit,
        min_loan=min_loan,
        max_loan=max_loan,
        min_casa=min_casa,
        max_casa=max_casa,
        service_codes=service_codes,
        min_service_count=min_service_count,
        missing_phone=missing_phone,
    )
    total = query.count()
    if total == 0:
        raise HTTPException(status_code=404, detail="Không có khách hàng phù hợp bộ lọc để xuất Excel")
    if total > EXPORT_MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Có {total:,} KH phù hợp, vượt giới hạn xuất {EXPORT_MAX_ROWS:,} dòng. "
                "Hãy thu hẹp bộ lọc (CN/PGD/cán bộ/…) rồi xuất lại."
            ),
        )

    query = apply_profile_sort(
        query,
        sort_by=sort_by,
        sort_dir=sort_dir,
        db=db,
        period_key=period_key,
        branch_code=branch_code,
        pgd_code=pgd_code,
    )
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("Bao_cao_KH")
    sheet.append([label for _, label in PROFILE_EXPORT_COLUMNS])

    field_names = [field for field, _ in PROFILE_EXPORT_COLUMNS]
    batch: list = []
    for item in query.yield_per(1_000):
        batch.append(item)
        if len(batch) >= 1_000:
            payloads = _apply_branch_finance_to_payloads(
                db,
                period_key,
                branch_code,
                pgd_code,
                [serialize_model(row, field_names) for row in batch],
            )
            for payload in payloads:
                sheet.append([payload.get(field) for field in field_names])
            batch = []
    if batch:
        payloads = _apply_branch_finance_to_payloads(
            db,
            period_key,
            branch_code,
            pgd_code,
            [serialize_model(row, field_names) for row in batch],
        )
        for payload in payloads:
            sheet.append([payload.get(field) for field in field_names])

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    filename = f"bao_cao_kh_{period_key}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Row-Count": str(total),
        },
    )


@router.get("/profile-summary")
def get_profile_summary(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    group_key: str | None = None,
    multi_branch: bool | None = None,
    no_service: bool = False,
    customer_type: str | None = None,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = Query(default=None, ge=0, le=20),
    missing_phone: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        group_key=group_key,
        multi_branch=multi_branch,
        no_service=no_service,
        customer_type=customer_type,
        has_deposit=has_deposit,
        has_loan=has_loan,
        min_deposit=min_deposit,
        max_deposit=max_deposit,
        min_loan=min_loan,
        max_loan=max_loan,
        min_casa=min_casa,
        max_casa=max_casa,
        service_codes=service_codes,
        min_service_count=min_service_count,
        missing_phone=missing_phone,
    )
    summary = query.with_entities(
        func.count(CustomerPeriodProfile.id),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_vay), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tien_gui), 0),
        func.coalesce(func.sum(CustomerPeriodProfile.so_du_tgtt_binh_quan), 0),
    ).one()
    no_service_count = query.filter(no_service_condition()).count()
    return {
        "total_customers": serialize_value(summary[0]),
        "total_loan": serialize_value(summary[1]),
        "total_deposit": serialize_value(summary[2]),
        "total_casa": serialize_value(summary[3]),
        "no_service_customers": no_service_count,
    }


@router.get("/profile-groups")
def get_profile_groups(
    period_key: str = Query(...),
    keyword: str | None = None,
    branch_code: str | None = None,
    pgd_code: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    unused_service: str | None = None,
    multi_branch: bool | None = None,
    no_service: bool = False,
    customer_type: str | None = None,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = Query(default=None, ge=0, le=30),
    missing_phone: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    query = apply_profile_filters(
        query,
        period_key=period_key,
        keyword=keyword,
        branch_code=branch_code,
        pgd_code=pgd_code,
        loan_type=loan_type,
        officer_code=officer_code,
        unused_service=unused_service,
        multi_branch=multi_branch,
        no_service=no_service,
        customer_type=customer_type,
        has_deposit=has_deposit,
        has_loan=has_loan,
        min_deposit=min_deposit,
        max_deposit=max_deposit,
        min_loan=min_loan,
        max_loan=max_loan,
        min_casa=min_casa,
        max_casa=max_casa,
        service_codes=service_codes,
        min_service_count=min_service_count,
        missing_phone=missing_phone,
    )
    scope = "branch" if branch_code else "province"
    scope_label = f"CN {branch_code.strip()}" if branch_code else "Toàn hệ thống"
    if branch_code and pgd_code:
        scope_label = f"CN {branch_code.strip()} / PGD {pgd_code.strip()}"

    if branch_code:
        agg = _branch_finance_agg_subquery(db, period_key, branch_code, pgd_code)
        eligible = query.with_entities(CustomerPeriodProfile.ma_kh)
        scoped_agg = db.query(agg).filter(agg.c.ma_kh.in_(eligible)).subquery()
        multi_branch_count = (
            query.filter(CustomerPeriodProfile.branch_count > 1).count()
        )
        primary_attention_count = (
            query.filter(
                CustomerPeriodProfile.branch_count > 1,
                CustomerPeriodProfile.primary_branch_code.isnot(None),
            ).count()
        )
        groups = [
            {
                "key": "large_deposit",
                "label": "Nhóm tiền gửi lớn",
                "description": f"CKH + TGTT tại {scope_label} từ {GROUP_DEPOSIT_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    (func.coalesce(scoped_agg.c.so_du_tien_gui, 0) + func.coalesce(scoped_agg.c.so_du_tgtt_binh_quan, 0))
                    >= GROUP_DEPOSIT_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "large_loan",
                "label": "Nhóm dư nợ lớn",
                "description": f"Dư nợ tại {scope_label} từ {GROUP_LOAN_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    func.coalesce(scoped_agg.c.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "high_casa",
                "label": "Nhóm CASA cao",
                "description": f"TGTT bình quân tại {scope_label} từ {GROUP_CASA_THRESHOLD:,} đồng",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    func.coalesce(scoped_agg.c.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD
                ).scalar() or 0,
            },
            {
                "key": "multi_branch",
                "label": "Nhóm khách hàng nhiều chi nhánh",
                "description": f"KH thuộc phạm vi {scope_label} và phát sinh > 1 chi nhánh",
                "count": multi_branch_count,
            },
            {
                "key": "cross_sell",
                "label": "Nhóm tiềm năng bán chéo",
                "description": f"Cơ hội bán chéo tính trên số liệu tại {scope_label}",
                "count": db.query(func.count()).select_from(scoped_agg).filter(
                    _branch_cross_sell_condition(scoped_agg)
                ).scalar() or 0,
            },
            {
                "key": "primary_location_attention",
                "label": "KH cần phân công nơi chăm sóc chính",
                "description": f"KH nhiều CN trong phạm vi {scope_label}, đã có điểm giao dịch chính",
                "count": primary_attention_count,
            },
        ]
    else:
        groups = [
            {
                "key": "large_deposit",
                "label": "Nhóm tiền gửi lớn",
                "description": f"Tiền gửi CKH + TGTT bình quân từ {GROUP_DEPOSIT_THRESHOLD:,} đồng",
                "count": query.filter(
                    (func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) + func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0))
                    >= GROUP_DEPOSIT_THRESHOLD
                ).count(),
            },
            {
                "key": "large_loan",
                "label": "Nhóm dư nợ lớn",
                "description": f"Dư nợ từ {GROUP_LOAN_THRESHOLD:,} đồng",
                "count": query.filter(func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) >= GROUP_LOAN_THRESHOLD).count(),
            },
            {
                "key": "high_casa",
                "label": "Nhóm CASA cao",
                "description": f"TGTT bình quân từ {GROUP_CASA_THRESHOLD:,} đồng",
                "count": query.filter(func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) >= GROUP_CASA_THRESHOLD).count(),
            },
            {
                "key": "multi_branch",
                "label": "Nhóm khách hàng nhiều chi nhánh",
                "description": "Khách hàng phát sinh tại hơn 1 chi nhánh",
                "count": query.filter(CustomerPeriodProfile.branch_count > 1).count(),
            },
            {
                "key": "cross_sell",
                "label": "Nhóm tiềm năng bán chéo",
                "description": "Có ít nhất một cảnh báo bán chéo từ dữ liệu hiện có",
                "count": query.filter(cross_sell_condition()).count(),
            },
            {
                "key": "primary_location_attention",
                "label": "KH cần phân công nơi chăm sóc chính",
                "description": "Khách hàng nhiều chi nhánh đã xác định điểm giao dịch nổi trội",
                "count": query.filter(and_(CustomerPeriodProfile.branch_count > 1, CustomerPeriodProfile.primary_branch_code.isnot(None))).count(),
            },
        ]

    return {
        "period_key": period_key,
        "scope": scope,
        "scope_label": scope_label,
        "thresholds": {
            "large_deposit": GROUP_DEPOSIT_THRESHOLD,
            "large_loan": GROUP_LOAN_THRESHOLD,
            "high_casa": GROUP_CASA_THRESHOLD,
        },
        "groups": groups,
    }


@router.get("/profile-history")
def get_profile_history(
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    db: Session = Depends(get_db),
):
    if branch_code:
        rows = (
            db.query(CustomerPeriodBranchDetail)
            .filter(
                CustomerPeriodBranchDetail.ma_kh == ma_kh,
                CustomerPeriodBranchDetail.branch_code == branch_code,
            )
            .order_by(CustomerPeriodBranchDetail.period_key)
            .all()
        )
        fields = [
            "id", "period_key", "period_date", "ma_kh", "branch_code", "ma_pgd",
            "ten_kh", "loai_khach_hang", "so_du_tien_gui", "so_du_tien_vay",
            "du_no_ngan_han", "du_no_ngan_han_bq", "du_no_trung_dai_han",
            "du_no_trung_dai_han_bq", "du_no_thau_chi", "du_no_thau_chi_bq",
            "pf10_lds_count", "pf10_interest", "so_du_tgtt_binh_quan",
            *sorted(PROFILE_SERVICE_FIELDS),
        ]
    else:
        rows = (
            db.query(CustomerPeriodProfile)
            .filter(CustomerPeriodProfile.ma_kh == ma_kh)
            .order_by(CustomerPeriodProfile.period_key)
            .all()
        )
        fields = [
            "id", "period_key", "period_date", "ma_kh", "primary_branch_code",
            "ten_kh", "loai_khach_hang", "so_du_tien_gui", "so_du_tien_vay",
            "du_no_ngan_han", "du_no_ngan_han_bq", "du_no_trung_dai_han",
            "du_no_trung_dai_han_bq", "du_no_thau_chi", "du_no_thau_chi_bq",
            "pf10_lds_count", "pf10_interest", "so_du_tgtt_binh_quan",
            "doanh_so_chuyen_tien_ve_tk", "phi_bao_lanh", "phi_chuyen_tien",
            "phi_nhdt", "abic_batd", "phi_kdnt", "phi_lc", "phi_ttqt", "dprr_chung_tt", "dprr_chung_lk",
            "dprr_cuthe_tt", "dprr_cuthe_lk", "du_no_xlrr", "ds_thu_no_xlrr",
            *sorted(PROFILE_SERVICE_FIELDS),
        ]
    return [serialize_model(item, fields) for item in rows]


@router.get("/business-matching-rules")
def list_business_matching_rules(source_type: str | None = None, db: Session = Depends(get_db)):
    query = db.query(BusinessMatchingRule)
    if source_type:
        query = query.filter(BusinessMatchingRule.source_type == source_type.strip().upper())
    rows = query.order_by(BusinessMatchingRule.rule_code, desc(BusinessMatchingRule.effective_from)).all()
    fields = ["id", "rule_code", "rule_name", "source_type", "service_codes", "amount_equals",
              "effective_from", "effective_to", "priority", "active", "description", "updated_by", "updated_at"]
    return [serialize_model(row, fields) for row in rows]


@router.get("/configuration-catalog")
def get_configuration_catalog(db: Session = Depends(get_db)):
    source_names = {
        "DP01": "Tiền gửi và tài khoản", "LN01": "Dư nợ và khoản vay",
        "CN05": "Sản phẩm dịch vụ", "PF10": "Hiệu quả khoản vay",
        "PF14": "Số dư tài khoản", "BC06": "Phân hạng khách hàng",
        "BC29": "Rủi ro tín dụng", "KH02": "Phát sinh phí",
        "FTPLN": "FTP khoản vay theo ngày",
    }
    sources = [{
        "code": code, "name": source_names.get(code, code), "required": True,
        "extensions": ["csv", "xlsx"], "configuration_status": "code_config",
    } for code in REQUIRED_FILE_TYPES]
    sources.extend([
        {"code": "CIF", "name": "Kho khách hàng nền", "required": False, "extensions": ["csv", "xls", "xlsx"], "configuration_status": "code_config"},
        {"code": "RR01", "name": "Nợ xử lý rủi ro", "required": False, "extensions": ["csv", "xlsx"], "configuration_status": "code_config"},
        {"code": "GL02", "name": "Giao dịch sổ cái", "required": False, "extensions": ["csv", "xlsx"], "configuration_status": "code_config"},
        {"code": "BILLPAYMENT", "name": "Giao dịch Bill Payment", "required": False, "extensions": ["xls", "xlsx"], "configuration_status": "database_config"},
        {"code": "BAO_LANH", "name": "Bảo lãnh và LC bổ sung", "required": False, "extensions": ["xls", "xlsx"], "configuration_status": "code_config"},
        {"code": "OAB_LOA", "name": "Loa biến động số dư", "required": False, "extensions": ["xlsx"], "configuration_status": "code_config"},
    ])
    formulas = [
        {"code": "DS_TKTT", "source": "GL02", "condition": "LOCAC = 421101; TRTP = Normal", "formula": "SUM(CRAMOUNT)", "status": "code_config"},
        {"code": "PHI_BAOLANH", "source": "KH02", "condition": "ACCTCD LIKE 7040%", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
        {"code": "PHI_CHUYENTIEN", "source": "KH02", "condition": "ACCTCD bắt đầu 711001 hoặc 711002", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
        {"code": "PHI_NHDT", "source": "KH02", "condition": "ACCTCD bắt đầu 711036, 711037, 711039", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
        {"code": "ABIC_BATD", "source": "KH02", "condition": "ACCTCD LIKE 714%", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
        {"code": "DPRR_CHUNG", "source": "LN01", "condition": "Nhóm nợ 1–4", "formula": "Dư nợ × 0,75%", "status": "code_config"},
    ]
    catalogs = [
        {"group": "Loại vay PF10", "values": [{"code": key, "label": value} for key, value in PF10_LOAN_TYPE_LABELS.items()], "status": "code_config"},
        {"group": "Trạng thái TKTT", "values": [{"code": "0–7", "label": "Đang hoạt động"}, {"code": "8–30", "label": "Ít hoạt động"}, {"code": ">30", "label": "Không hoạt động"}], "status": "code_config"},
        {"group": "Ngưỡng phân nhóm", "values": [{"code": "DEPOSIT", "label": "1 tỷ"}, {"code": "LOAN", "label": "1 tỷ"}, {"code": "CASA", "label": "500 triệu"}], "status": "code_config"},
        {"group": "Loại khách hàng bán lẻ", "values": [{"code": value, "label": value} for value in RETAIL_CUSTOMER_TYPES], "status": "code_config"},
    ]
    return {"sources": sources, "formulas": formulas, "catalogs": catalogs,
            "rule_count": db.query(func.count(BusinessMatchingRule.id)).scalar() or 0}


@router.put("/business-matching-rules/{rule_id}")
def update_business_matching_rule(rule_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    row = db.query(BusinessMatchingRule).filter(BusinessMatchingRule.id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy quy tắc nghiệp vụ")
    if "service_codes" in payload:
        codes = payload.get("service_codes") or []
        row.service_codes = sorted({str(code).strip() for code in codes if str(code).strip()})
    if "amount_equals" in payload:
        row.amount_equals = Decimal(str(payload["amount_equals"])) if payload["amount_equals"] not in (None, "") else None
    for key in ("rule_name", "description", "updated_by"):
        if key in payload:
            setattr(row, key, payload[key])
    for key in ("active", "priority"):
        if key in payload:
            setattr(row, key, payload[key])
    for key in ("effective_from", "effective_to"):
        if key in payload:
            setattr(row, key, date.fromisoformat(payload[key]) if payload[key] else None)
    db.commit()
    db.refresh(row)
    return serialize_model(row, ["id", "rule_code", "rule_name", "source_type", "service_codes",
                                 "amount_equals", "effective_from", "effective_to", "priority", "active",
                                 "description", "updated_by", "updated_at"])


@router.post("/business-matching-rules")
def create_business_matching_rule(payload: dict = Body(...), db: Session = Depends(get_db)):
    code = str(payload.get("rule_code") or "").strip().upper()
    if not code or not payload.get("rule_name"):
        raise HTTPException(status_code=400, detail="Mã và tên quy tắc là bắt buộc")
    row = BusinessMatchingRule(
        rule_code=code, rule_name=str(payload["rule_name"]).strip(),
        source_type=str(payload.get("source_type") or "BILLPAYMENT").strip().upper(),
        service_codes=sorted({str(value).strip() for value in payload.get("service_codes", []) if str(value).strip()}),
        amount_equals=Decimal(str(payload["amount_equals"])) if payload.get("amount_equals") not in (None, "") else None,
        effective_from=date.fromisoformat(payload["effective_from"]) if payload.get("effective_from") else None,
        effective_to=date.fromisoformat(payload["effective_to"]) if payload.get("effective_to") else None,
        priority=int(payload.get("priority") or 100), active=bool(payload.get("active", True)),
        description=payload.get("description"), updated_by=payload.get("updated_by"),
    )
    db.add(row); db.commit(); db.refresh(row)
    return serialize_model(row, ["id", "rule_code", "rule_name", "source_type", "service_codes", "amount_equals", "effective_from", "effective_to", "priority", "active", "description"])


@router.delete("/business-matching-rules/{rule_id}")
def delete_business_matching_rule(rule_id: int, db: Session = Depends(get_db)):
    row = db.query(BusinessMatchingRule).filter(BusinessMatchingRule.id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy quy tắc nghiệp vụ")
    db.delete(row); db.commit()
    return {"deleted": True, "id": rule_id}


SYSTEM_CONFIG_FIELDS = ["id", "category", "config_code", "config_name", "source_type", "config_value",
                        "description", "effective_from", "effective_to", "active", "updated_by", "updated_at"]


@router.get("/system-configuration-entries")
def list_system_configuration_entries(category: str | None = None, db: Session = Depends(get_db)):
    query = db.query(SystemConfigurationEntry)
    if category:
        query = query.filter(SystemConfigurationEntry.category == category.strip().upper())
    return [serialize_model(row, SYSTEM_CONFIG_FIELDS) for row in query.order_by(SystemConfigurationEntry.category, SystemConfigurationEntry.config_code).all()]


@router.post("/system-configuration-entries")
def create_system_configuration_entry(payload: dict = Body(...), db: Session = Depends(get_db)):
    category = str(payload.get("category") or "").strip().upper()
    code = str(payload.get("config_code") or "").strip().upper()
    if category not in {"ACCOUNT_FORMULA", "BUSINESS_CATALOG"} or not code or not payload.get("config_name"):
        raise HTTPException(status_code=400, detail="Nhóm, mã và tên cấu hình không hợp lệ")
    row = SystemConfigurationEntry(category=category, config_code=code, config_name=str(payload["config_name"]).strip(),
        source_type=str(payload.get("source_type") or "").strip().upper() or None,
        config_value=payload.get("config_value") or {}, description=payload.get("description"),
        effective_from=date.fromisoformat(payload["effective_from"]) if payload.get("effective_from") else None,
        effective_to=date.fromisoformat(payload["effective_to"]) if payload.get("effective_to") else None,
        active=bool(payload.get("active", True)), updated_by=payload.get("updated_by"))
    db.add(row); db.commit(); db.refresh(row)
    return serialize_model(row, SYSTEM_CONFIG_FIELDS)


@router.put("/system-configuration-entries/{entry_id}")
def update_system_configuration_entry(entry_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    row = db.query(SystemConfigurationEntry).filter(SystemConfigurationEntry.id == entry_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy cấu hình")
    for key in ("config_name", "source_type", "config_value", "description", "active", "updated_by"):
        if key in payload: setattr(row, key, payload[key])
    for key in ("effective_from", "effective_to"):
        if key in payload: setattr(row, key, date.fromisoformat(payload[key]) if payload[key] else None)
    db.commit(); db.refresh(row)
    return serialize_model(row, SYSTEM_CONFIG_FIELDS)


@router.delete("/system-configuration-entries/{entry_id}")
def delete_system_configuration_entry(entry_id: int, db: Session = Depends(get_db)):
    row = db.query(SystemConfigurationEntry).filter(SystemConfigurationEntry.id == entry_id).first()
    if not row: raise HTTPException(status_code=404, detail="Không tìm thấy cấu hình")
    db.delete(row); db.commit()
    return {"deleted": True, "id": entry_id}
    rows = (
        db.query(CustomerPeriodProfile)
        .filter(CustomerPeriodProfile.ma_kh == ma_kh)
        .order_by(CustomerPeriodProfile.period_key)
        .all()
    )
    return [serialize_model(item, profile_brief_fields()) for item in rows]


@router.get("/period-comparison")
def compare_periods(
    current_period: str = Query(...),
    previous_period: str = Query(...),
    branch_code: str | None = None,
    pgd_code: str | None = None,
    keyword: str | None = None,
    loan_type: str | None = None,
    officer_code: str | None = None,
    customer_type: str | None = None,
    multi_branch: bool | None = None,
    no_service: bool = False,
    has_deposit: bool | None = None,
    has_loan: bool | None = None,
    min_deposit: float | None = None,
    max_deposit: float | None = None,
    min_loan: float | None = None,
    max_loan: float | None = None,
    min_casa: float | None = None,
    max_casa: float | None = None,
    service_codes: str | None = None,
    min_service_count: int | None = Query(default=None, ge=0, le=30),
    missing_phone: bool | None = None,
    db: Session = Depends(get_db),
):
    db.execute(text("SET LOCAL max_parallel_workers_per_gather = 0"))
    current_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == current_period)
    previous_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == previous_period)
    common_filters = dict(
        keyword=keyword, branch_code=branch_code, pgd_code=pgd_code, loan_type=loan_type,
        officer_code=officer_code, customer_type=customer_type, multi_branch=multi_branch,
        no_service=no_service, has_deposit=has_deposit, has_loan=has_loan,
        min_deposit=min_deposit, max_deposit=max_deposit, min_loan=min_loan, max_loan=max_loan,
        min_casa=min_casa, max_casa=max_casa, service_codes=service_codes,
        min_service_count=min_service_count, missing_phone=missing_phone,
    )
    current_query = apply_profile_filters(current_query, period_key=current_period, **common_filters)
    previous_query = apply_profile_filters(previous_query, period_key=previous_period, **common_filters)

    service_fields = sorted(PROFILE_SERVICE_FIELDS)
    current_data = current_query.with_entities(
        CustomerPeriodProfile.ma_kh.label("ma_kh"),
        CustomerPeriodProfile.so_du_tien_gui.label("deposit"),
        CustomerPeriodProfile.so_du_tien_vay.label("loan"),
        CustomerPeriodProfile.so_du_tgtt_binh_quan.label("casa"),
        *[getattr(CustomerPeriodProfile, field).label(field) for field in service_fields],
    ).subquery()
    previous_data = previous_query.with_entities(
        CustomerPeriodProfile.ma_kh.label("ma_kh"),
        CustomerPeriodProfile.so_du_tien_gui.label("deposit"),
        CustomerPeriodProfile.so_du_tien_vay.label("loan"),
        CustomerPeriodProfile.so_du_tgtt_binh_quan.label("casa"),
        *[getattr(CustomerPeriodProfile, field).label(field) for field in service_fields],
    ).subquery()

    aggregate_columns = [
        func.count(current_data.c.ma_kh),
        func.count(previous_data.c.ma_kh),
        func.coalesce(func.sum(current_data.c.deposit), 0),
        func.coalesce(func.sum(previous_data.c.deposit), 0),
        func.coalesce(func.sum(current_data.c.loan), 0),
        func.coalesce(func.sum(previous_data.c.loan), 0),
        func.coalesce(func.sum(current_data.c.casa), 0),
        func.coalesce(func.sum(previous_data.c.casa), 0),
        func.sum(case((previous_data.c.ma_kh.is_(None), 1), else_=0)),
        func.sum(case((current_data.c.ma_kh.is_(None), 1), else_=0)),
    ]
    for field in service_fields:
        aggregate_columns.extend([
            func.sum(
                case(
                    (
                        and_(
                            previous_data.c.ma_kh.isnot(None),
                            func.coalesce(current_data.c[field], 0) > 0,
                            func.coalesce(previous_data.c[field], 0) <= 0,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (
                        and_(
                            current_data.c.ma_kh.isnot(None),
                            func.coalesce(previous_data.c[field], 0) > 0,
                            func.coalesce(current_data.c[field], 0) <= 0,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        ])
    aggregate_result = (
        db.query(*aggregate_columns)
        .select_from(current_data)
        .join(previous_data, previous_data.c.ma_kh == current_data.c.ma_kh, full=True)
        .one()
    )
    new_services = {
        field: int(aggregate_result[10 + index * 2] or 0)
        for index, field in enumerate(service_fields)
    }
    lost_services = {
        field: int(aggregate_result[11 + index * 2] or 0)
        for index, field in enumerate(service_fields)
    }
    current_summary = (aggregate_result[0], aggregate_result[2], aggregate_result[4], aggregate_result[6])
    previous_summary = (aggregate_result[1], aggregate_result[3], aggregate_result[5], aggregate_result[7])
    new_customers = int(aggregate_result[8] or 0)
    lost_customers = int(aggregate_result[9] or 0)

    def number(value):
        return serialize_value(value) or 0

    return {
        "current_period": current_period,
        "previous_period": previous_period,
        "summary": {
            "customers": {
                "current": number(current_summary[0]),
                "previous": number(previous_summary[0]),
                "delta": number(current_summary[0]) - number(previous_summary[0]),
            },
            "deposit": {
                "current": number(current_summary[1]),
                "previous": number(previous_summary[1]),
                "delta": number(current_summary[1]) - number(previous_summary[1]),
            },
            "loan": {
                "current": number(current_summary[2]),
                "previous": number(previous_summary[2]),
                "delta": number(current_summary[2]) - number(previous_summary[2]),
            },
            "casa": {
                "current": number(current_summary[3]),
                "previous": number(previous_summary[3]),
                "delta": number(current_summary[3]) - number(previous_summary[3]),
            },
        },
        "new_customers": int(new_customers),
        "lost_customers": int(lost_customers),
        "new_services": {key: value for key, value in new_services.items() if value > 0},
        "lost_services": {key: value for key, value in lost_services.items() if value > 0},
    }


def _load_active_org_department_registry(
    db: Session,
) -> tuple[dict[tuple[str, str], str], dict[str, set[str]], set[str]]:
    rows = (
        db.query(OrgBranch.branch_code, OrgDepartment.department_code, OrgDepartment.department_name)
        .join(OrgDepartment, OrgDepartment.branch_id == OrgBranch.id)
        .filter(OrgDepartment.department_code.isnot(None), OrgDepartment.status == "active")
        .all()
    )
    branch_pgd_to_name: dict[tuple[str, str], str] = {}
    branch_to_pgds: dict[str, set[str]] = {}
    all_pgd_codes: set[str] = set()
    for branch, pgd, name in rows:
        branch_value = str(branch or "").strip()
        pgd_value = str(pgd or "").strip()
        name_value = str(name or "").strip()
        if not pgd_value:
            continue
        all_pgd_codes.add(pgd_value)
        if branch_value:
            branch_to_pgds.setdefault(branch_value, set()).add(pgd_value)
            if name_value:
                branch_pgd_to_name[(branch_value, pgd_value)] = name_value
    return branch_pgd_to_name, branch_to_pgds, all_pgd_codes


def _pgd_allowed_in_org(
    pgd: str,
    *,
    branch_code: str | None,
    branch_to_pgds: dict[str, set[str]],
    all_pgd_codes: set[str],
) -> bool:
    if branch_code:
        return pgd in branch_to_pgds.get(branch_code.strip(), set())
    return pgd in all_pgd_codes


def _pgd_option_label(
    pgd: str,
    branch_code: str | None,
    branch_pgd_to_name: dict[tuple[str, str], str],
    pgd_name_map: dict[str, str],
) -> str:
    if branch_code:
        org_name = branch_pgd_to_name.get((branch_code.strip(), pgd))
        if org_name:
            return org_name
    scoped = pgd_name_map.get(f"{branch_code}:{pgd}") if branch_code else None
    return scoped or pgd_name_map.get(pgd) or pgd


@router.get("/profile-filter-options")
def get_profile_filter_options(
    period_key: str = Query(...),
    branch_code: str | None = None,
    pgd_code: str | None = None,
    db: Session = Depends(get_db),
):
    base_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    scoped_query = apply_profile_filters(base_query, branch_code=branch_code, pgd_code=pgd_code)

    branch_rows = (
        db.query(CustomerPeriodProfile.branch_codes)
        .filter(CustomerPeriodProfile.period_key == period_key, CustomerPeriodProfile.branch_codes.isnot(None))
        .distinct()
        .all()
    )
    branches = sorted(
        {
            item.strip()
            for row in branch_rows
            for item in str(row[0] or "").split(",")
            if item.strip()
        }
    )

    pgd_rows = scoped_query.with_entities(CustomerPeriodProfile.pgd_codes).filter(CustomerPeriodProfile.pgd_codes.isnot(None)).distinct().all()
    pgds = set()
    for row in pgd_rows:
        for item in str(row[0] or "").split(","):
            value = item.strip()
            if not value:
                continue
            if ":" in value:
                branch, pgd = [part.strip() for part in value.split(":", 1)]
                if branch_code and branch != branch_code:
                    continue
                if pgd:
                    pgds.add(pgd)
            else:
                pgds.add(value)
    branch_pgd_to_name, branch_to_pgds, all_pgd_codes = _load_active_org_department_registry(db)
    pgds = sorted(
        pgd
        for pgd in pgds
        if _pgd_allowed_in_org(
            pgd,
            branch_code=branch_code,
            branch_to_pgds=branch_to_pgds,
            all_pgd_codes=all_pgd_codes,
        )
    )

    pgd_name_map: dict[str, str] = {}
    detail_rows = (
        db.query(CustomerPeriodBranchDetail.branch_code, CustomerPeriodBranchDetail.ma_pgd, CustomerPeriodBranchDetail.ten_pgd)
        .filter(CustomerPeriodBranchDetail.period_key == period_key, CustomerPeriodBranchDetail.ma_pgd.isnot(None))
        .distinct()
        .all()
    )
    for branch, pgd, name in detail_rows:
        branch_value = str(branch or "").strip()
        pgd_value = str(pgd or "").strip()
        name_value = str(name or "").strip()
        if not pgd_value or not name_value:
            continue
        pgd_name_map.setdefault(pgd_value, name_value)
        if branch_value:
            pgd_name_map.setdefault(f"{branch_value}:{pgd_value}", name_value)

    for (branch_value, pgd_value), name_value in branch_pgd_to_name.items():
        pgd_name_map.setdefault(pgd_value, name_value)
        pgd_name_map.setdefault(f"{branch_value}:{pgd_value}", name_value)

    pgd_options = [
        {
            "value": pgd,
            "label": _pgd_option_label(pgd, branch_code, branch_pgd_to_name, pgd_name_map),
        }
        for pgd in pgds
    ]

    loan_rows = scoped_query.with_entities(CustomerPeriodProfile.loai_vay).filter(CustomerPeriodProfile.loai_vay.isnot(None)).distinct().all()
    loan_types = sorted(
        {
            item.strip()
            for row in loan_rows
            for item in str(row[0] or "").split("/")
            if item.strip()
        }
    )
    customer_types = [
        row[0]
        for row in scoped_query.with_entities(CustomerPeriodProfile.loai_khach_hang)
        .filter(CustomerPeriodProfile.loai_khach_hang.isnot(None))
        .distinct()
        .order_by(CustomerPeriodProfile.loai_khach_hang)
        .all()
        if row[0]
    ]

    officer_rows = (
        scoped_query.with_entities(
            CustomerPeriodProfile.ma_cb,
            func.max(CustomerPeriodProfile.ten_can_bo),
            func.max(CustomerPeriodProfile.officer_employee_code),
        )
        .filter(CustomerPeriodProfile.ma_cb.isnot(None))
        .group_by(CustomerPeriodProfile.ma_cb)
        .order_by(func.max(CustomerPeriodProfile.ten_can_bo), CustomerPeriodProfile.ma_cb)
        .limit(1000)
        .all()
    )
    active_users = db.query(SystemUser).filter(SystemUser.is_active.is_(True)).all()
    configured_officer_codes = {
        str(code).strip()
        for user in active_users
        for code in (user.credit_officer_code, user.employee_code)
        if code and str(code).strip()
    }
    officers = [
        {
            "value": row[0],
            "label": f"{row[1] or row[0]} ({row[2] or '-'} - {row[0]})",
        }
        for row in officer_rows
        if row[0] and (
            str(row[0]).strip() in configured_officer_codes
            or (row[2] and str(row[2]).strip() in configured_officer_codes)
        )
    ]

    return {
        "branches": branches,
        "pgds": pgds,
        "pgd_options": pgd_options,
        "pgd_names": pgd_name_map,
        "loan_types": loan_types,
        "customer_types": customer_types,
        "officers": officers,
    }


@router.get("/branch-details")
def list_branch_details(period_key: str = Query(...), ma_kh: str = Query(...), db: Session = Depends(get_db)):
    profile = (
        db.query(CustomerPeriodProfile)
        .filter(CustomerPeriodProfile.period_key == period_key, CustomerPeriodProfile.ma_kh == ma_kh)
        .first()
    )
    rows = (
        db.query(CustomerPeriodBranchDetail)
        .filter(CustomerPeriodBranchDetail.period_key == period_key, CustomerPeriodBranchDetail.ma_kh == ma_kh)
        .order_by(CustomerPeriodBranchDetail.branch_code, CustomerPeriodBranchDetail.ma_pgd)
        .all()
    )
    fields = [
        "id",
        "period_key",
        "period_date",
        "ma_kh",
        "branch_code",
        "ma_pgd",
        "ten_pgd",
        "ten_kh",
        "loai_khach_hang",
        "dp_record_count",
        "so_du_tien_gui",
        "doanh_so_cramt",
        "doanh_so_dramt",
        "so_du_tien_vay",
        "loai_vay",
        "so_du_tgtt_binh_quan",
        "thau_chi",
        "tk_so_dep",
        "agribank_plus",
        "tin_nhan_ott",
        "e_banking",
        "sms_nhac_no_vay",
        "sms_tien_gui",
        "the_ghi_no_noi_dia",
        "the_td_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phat_hanh_lc",
        "thuho_dien", "thuho_nuoc", "thuho_dt", "ttqt", "hkd_tk", "hkd_account_numbers", "abic_batk", "abic_bathe",
        "ma_cb",
        "ten_can_bo",
        "officer_employee_code",
    ]
    result = []
    for item in rows:
        payload = serialize_model(item, fields)
        service_count = sum(int(payload.get(field) or 0) for field in PROFILE_SERVICE_FIELDS)
        financial_value = (
            float(payload.get("so_du_tien_vay") or 0)
            + float(payload.get("so_du_tien_gui") or 0)
            + float(payload.get("so_du_tgtt_binh_quan") or 0)
        )
        engagement_score = round(
            financial_value / 1_000_000 * 0.40
            + float(payload.get("doanh_so_cramt") or 0) / 1_000_000 * 0.20
            + service_count * 10 * 0.30
            + int(payload.get("dp_record_count") or 0) * 2 * 0.10,
            2,
        )
        reasons = []
        if float(payload.get("so_du_tien_vay") or 0) > 0:
            reasons.append("Có dư nợ")
        if float(payload.get("so_du_tien_gui") or 0) > 0:
            reasons.append("Có tiền gửi CKH")
        if float(payload.get("so_du_tgtt_binh_quan") or 0) > 0:
            reasons.append("Có TGTT bình quân")
        if float(payload.get("doanh_so_cramt") or 0) > 0:
            reasons.append("Có doanh số chuyển tiền về TK")
        if service_count > 0:
            reasons.append("Có dịch vụ đang dùng")
        payload.update(
            {
                "service_count": service_count,
                "financial_value": financial_value,
                "engagement_score": engagement_score,
                "engagement_reason": "; ".join(reasons),
                "has_primary_location": bool(profile and profile.primary_branch_code),
                "is_primary_location": bool(
                    profile
                    and profile.primary_branch_code == payload.get("branch_code")
                    and (profile.primary_pgd_code or "") == (payload.get("ma_pgd") or "")
                ),
            }
        )
        result.append(payload)
    return sorted(
        result,
        key=lambda row: (
            0 if row.get("is_primary_location") else 1,
            -float(row.get("engagement_score") or 0),
            str(row.get("branch_code") or ""),
            str(row.get("ma_pgd") or ""),
        ),
    )
