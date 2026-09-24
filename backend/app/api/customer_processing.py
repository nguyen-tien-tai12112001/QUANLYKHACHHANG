from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from time import monotonic

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import DateTime as SQLDateTime, Float, Integer, Numeric, and_, asc, case, desc, distinct, func, or_, text
from sqlalchemy.orm import Session, aliased

from app.auth.dependencies import get_current_user, require_all_permissions, require_any_permission
from app.auth.schemas import CurrentUser

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
from app.fee_rules import FEE_CATEGORY_PREFIXES
from app.models import (
    BC06CustomerClassification,
    BC29CustomerCreditRisk,
    BusinessMatchingRule,
    CifCustomer,
    CifCustomerIdentifier,
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
    KH02CustomerTransaction,
    LN01Loan,
    OrgBranch,
    OrgDepartment,
    PF10LoanProfitability,
    PF14AccountBalance,
    RR01HandledRiskLoan,
    SupplementalBaoLanhRecord,
    SupplementalBillPaymentTransaction,
    SupplementalOABRecord,
    SupplementalPOSRecord,
    SystemUser,
    SystemConfigurationEntry,
)
from app.security_audit import record_security_event
from app.export_progress import begin_export, update_export


router = APIRouter(prefix="/api/customer-processing", tags=["customer-processing"])


def _has_permission(user: CurrentUser, permission_code: str) -> bool:
    granted = set(user.permissions or [])
    return "admin" in granted or permission_code in granted


def _mask_identifier(value, visible: int = 4):
    text_value = str(value or "").strip()
    if not text_value:
        return None
    return f"{'*' * max(4, len(text_value) - visible)}{text_value[-visible:]}"
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
    "PHI_THE": "phi_the",
    "PHI_KHAC": "phi_khac",
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
    "THE_GNQT": "the_ghi_no_quoc_te",
    "THE_LOCVIET": "the_td_loc_viet",
    "THE_TDQT": "the_td_quoc_te",
    "LOATHANTAI": "loa_bien_dong_so_du",
    "THUHO_DIEN": "thuho_dien",
    "THUHO_NUOC": "thuho_nuoc",
    "THUHO_DT": "thuho_dt",
    "HKD_TK": "hkd_tk",
    "ABIC_BATK": "abic_batk",
    "ABIC_BATHE": "abic_bathe",
    "POS": "pos",
    "SO_THIET_BI_POS": "so_thiet_bi_pos",
    "POS_MOI": "pos_moi",
    "POS_KHONG_HOAT_DONG": "pos_khong_hoat_dong",
    "POS_NGUNG_HOAT_DONG": "pos_ngung_hoat_dong",
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
    tktt_by_customer = (
        db.query(
            DP01DepositAccount.ma_kh.label("ma_kh"),
            func.count(func.distinct(DP01DepositAccount.so_tai_khoan)).label("account_count"),
        )
        .filter(
            DP01DepositAccount.period_key == period_key,
            DP01DepositAccount.ma_kh.isnot(None),
            DP01DepositAccount.so_tai_khoan.isnot(None),
            func.coalesce(
                func.cast(func.nullif(func.regexp_replace(DP01DepositAccount.month_term, "[^0-9]", "", "g"), ""), Integer),
                0,
            ) == 0,
            or_(DP01DepositAccount.account_status.is_(None), func.lower(func.trim(DP01DepositAccount.account_status)) != "inactive"),
            or_(DP01DepositAccount.close_date.is_(None), DP01DepositAccount.close_date > DP01DepositAccount.period_date),
        )
        .group_by(DP01DepositAccount.ma_kh)
        .subquery()
    )
    tktt_counts = db.query(
        func.count().filter(tktt_by_customer.c.account_count >= 1),
        func.count().filter(tktt_by_customer.c.account_count >= 2),
        func.count().filter(tktt_by_customer.c.account_count >= 3),
    ).select_from(tktt_by_customer).one()
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
        "TKTT1": ("DP01.SO_TAI_KHOAN / PF14 số dư", int(tktt_counts[0] or 0)),
        "TKTT2": ("DP01.SO_TAI_KHOAN / PF14 số dư", int(tktt_counts[1] or 0)),
        "TKTT3": ("DP01.SO_TAI_KHOAN / PF14 số dư", int(tktt_counts[2] or 0)),
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


def enrich_profile_org_names(db: Session, payloads: list[dict], include_units: bool = False) -> list[dict]:
    registry, _, _ = _load_active_org_department_registry(db)
    staff_rows = (
        db.query(SystemUser, OrgBranch, OrgDepartment)
        .outerjoin(OrgBranch, OrgBranch.id == SystemUser.branch_id)
        .outerjoin(OrgDepartment, OrgDepartment.id == SystemUser.department_id)
        .filter(SystemUser.is_active.is_(True))
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
            "officer_department_code": department.department_code if department and department.status == "active" else None,
            "officer_department_name": department.department_name if department and department.status == "active" else None,
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
        else:
            # Không đưa tên/mã cán bộ từ file nguồn lên giao diện nếu cán bộ chưa
            # tồn tại trong danh mục người dùng đang hoạt động.
            for field in ("ma_cb", "ten_can_bo", "officer_employee_code", "officer_ipcas"):
                target[field] = None
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
        # Một số kỳ cũ đã xác định được cán bộ tại quan hệ chi nhánh nhưng bản
        # ghi tổng bị trống do nhánh DP01 được chọn trước khi đối chiếu user.
        # Dùng đúng quan hệ của chi nhánh chính làm giá trị dự phòng để danh
        # sách và hồ sơ chi tiết luôn thống nhất.
        details = payload.get("branch_details")
        if isinstance(details, list) and details:
            primary_branch = str(payload.get("primary_branch_code") or "").strip()
            primary_pgd = str(payload.get("primary_pgd_code") or "").strip()
            primary_detail = next((
                item for item in details
                if str(item.get("branch_code") or "").strip() == primary_branch
                and (not primary_pgd or str(item.get("ma_pgd") or "").strip() == primary_pgd)
            ), None) or next((
                item for item in details
                if str(item.get("branch_code") or "").strip() == primary_branch
            ), None)
            if primary_detail:
                for field in ("ma_cb", "ten_can_bo", "officer_employee_code"):
                    if not str(payload.get(field) or "").strip() and primary_detail.get(field):
                        payload[field] = primary_detail[field]
                if not primary_pgd and primary_detail.get("ma_pgd"):
                    payload["primary_pgd_code"] = primary_detail["ma_pgd"]
                    payload["primary_pgd_name"] = primary_detail.get("ten_pgd")
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
            if name:
                labels.append(f"{name} ({branch_code})" if branch_code else name)
        payload["pgd_names"] = ", ".join(dict.fromkeys(labels)) or None

        primary_branch = str(payload.get("primary_branch_code") or "").strip()
        primary_pgd = str(payload.get("primary_pgd_code") or "").strip()
        if primary_branch and primary_pgd:
            valid_name = registry.get((primary_branch, primary_pgd))
            payload["primary_pgd_code"] = primary_pgd if valid_name else None
            payload["primary_pgd_name"] = valid_name

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
                    valid_name = registry.get((branch, pgd))
                    detail["ma_pgd"] = pgd if valid_name else None
                    detail["ten_pgd"] = valid_name

    # Một chi nhánh có thể có tài khoản tại nhiều phòng/PGD. Không dùng MAX(ma_pgd)
    # làm đơn vị đại diện vì mã lớn nhất không mang ý nghĩa nghiệp vụ. Tổng hợp từng
    # đơn vị và xếp theo số dư; cán bộ tại đơn vị chỉ được công nhận khi khớp user.
    period_key = next((str(item.get("period_key") or "").strip() for item in payloads if item.get("period_key")), "")
    customer_codes = list(dict.fromkeys(
        str(item.get("ma_kh") or "").strip() for item in payloads if str(item.get("ma_kh") or "").strip()
    ))
    if include_units and period_key and customer_codes:
        unit_rows = db.execute(text("""
            WITH units AS (
                SELECT period_key, ma_kh, ma_cn AS branch_code,
                       COALESCE(NULLIF(TRIM(ma_pgd), ''), '00') AS unit_code,
                       MAX(NULLIF(TRIM(ten_pgd), '')) AS source_unit_name,
                       COUNT(*) AS account_count,
                       SUM(CASE WHEN COALESCE(current_balance, 0) > 0 THEN current_balance ELSE 0 END) AS balance
                FROM dp01_deposit_accounts
                WHERE period_key=:period_key AND ma_kh=ANY(:customer_codes)
                  AND COALESCE(current_balance, 0) >= 0
                GROUP BY period_key, ma_kh, ma_cn, COALESCE(NULLIF(TRIM(ma_pgd), ''), '00')
            ), valid_staff AS (
                SELECT DISTINCT ON (d.ma_kh, d.ma_cn, COALESCE(NULLIF(TRIM(d.ma_pgd), ''), '00'))
                       d.ma_kh, d.ma_cn AS branch_code,
                       COALESCE(NULLIF(TRIM(d.ma_pgd), ''), '00') AS unit_code,
                       u.employee_code, u.full_name
                FROM dp01_deposit_accounts d
                JOIN system_users u ON u.is_active=true
                  AND TRIM(u.employee_code)=TRIM(d.employee_number)
                JOIN org_branches b ON b.id=u.branch_id AND b.branch_code=TRIM(d.ma_cn)
                WHERE d.period_key=:period_key AND d.ma_kh=ANY(:customer_codes)
                  AND COALESCE(d.current_balance, 0) > 0
                ORDER BY d.ma_kh, d.ma_cn, COALESCE(NULLIF(TRIM(d.ma_pgd), ''), '00'),
                         COALESCE(d.current_balance, 0) DESC, d.id
            )
            SELECT units.*, valid_staff.employee_code, valid_staff.full_name
            FROM units
            LEFT JOIN valid_staff USING (ma_kh, branch_code, unit_code)
            ORDER BY units.ma_kh, units.branch_code, units.balance DESC, units.unit_code
        """), {"period_key": period_key, "customer_codes": customer_codes}).mappings().all()
        units_by_relation: dict[tuple[str, str], list[dict]] = {}
        for row in unit_rows:
            branch = str(row["branch_code"] or "").strip()
            unit_code = str(row["unit_code"] or "").strip()
            unit = {
                "unit_code": unit_code,
                "unit_name": registry.get((branch, unit_code), row["source_unit_name"] or unit_code),
                "account_count": int(row["account_count"] or 0),
                "balance": serialize_value(row["balance"]),
                "officer_employee_code": row["employee_code"],
                "officer_name": row["full_name"],
                "officer_verified": bool(row["employee_code"]),
            }
            units_by_relation.setdefault((str(row["ma_kh"]), branch), []).append(unit)
        for payload in payloads:
            for detail in payload.get("branch_details") or []:
                units = units_by_relation.get((str(payload.get("ma_kh") or ""), str(detail.get("branch_code") or "")), [])
                detail["unit_details"] = units
                detail["unit_count"] = len(units)
                if units:
                    detail["representative_unit_code"] = units[0]["unit_code"]
                    detail["representative_unit_name"] = units[0]["unit_name"]
    return payloads


PROFILE_SERVICE_FIELDS = {
    "thau_chi",
    "tk_so_dep",
    "agribank_plus",
    "tin_nhan_ott",
    "sms_nhac_no_vay",
    "sms_tien_gui",
    "the_ghi_no_noi_dia",
    "the_ghi_no_quoc_te",
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
    "pos",
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
            CustomerPeriodProfile.the_ghi_no_quoc_te == 0,
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
        func.max(CustomerPeriodBranchDetail.the_ghi_no_quoc_te).label("the_ghi_no_quoc_te"),
        func.max(CustomerPeriodBranchDetail.the_td_quoc_te).label("the_td_quoc_te"),
        func.max(CustomerPeriodBranchDetail.the_td_loc_viet).label("the_td_loc_viet"),
        func.max(CustomerPeriodBranchDetail.loai_khach_hang).label("loai_khach_hang"),
        func.max(CustomerPeriodBranchDetail.ma_pgd).label("ma_pgd"),
        func.max(CustomerPeriodBranchDetail.ten_pgd).label("ten_pgd"),
        func.max(CustomerPeriodBranchDetail.ma_cb).label("ma_cb"),
        func.max(CustomerPeriodBranchDetail.ten_can_bo).label("ten_can_bo"),
    ).filter(
        CustomerPeriodBranchDetail.period_key == period_key,
        CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
    )
    # pgd_code đã dùng để chọn tập KH theo cán bộ quản lý trong apply_profile_filters.
    # Khi cộng số liệu của KH, lấy toàn bộ quan hệ tại chi nhánh thay vì đơn vị
    # phát sinh nguồn để tránh làm mất tiền gửi/vay của cùng khách hàng.
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
            func.coalesce(agg.c.the_ghi_no_quoc_te, 0) == 0,
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
        "phi_the",
        "phi_khac",
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
):
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                CustomerPeriodProfile.ma_kh.ilike(like),
                CustomerPeriodProfile.ten_kh.ilike(like),
            )
        )
    if branch_code:
        query = query.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{branch_code.strip()}%"))
    if pgd_code:
        # Phòng ban là đơn vị quản lý của cán bộ đã cấu hình trong hệ thống,
        # không phải đơn vị phát sinh tài khoản lấy từ file nguồn.
        if period_key and branch_code:
            managed_customers = (
                query.session.query(CustomerPeriodBranchDetail.ma_kh)
                .join(
                    SystemUser,
                    and_(
                        SystemUser.is_active.is_(True),
                        or_(
                            SystemUser.credit_officer_code == CustomerPeriodBranchDetail.ma_cb,
                            SystemUser.employee_code == CustomerPeriodBranchDetail.ma_cb,
                            SystemUser.employee_code == CustomerPeriodBranchDetail.officer_employee_code,
                        ),
                    ),
                )
                .join(OrgDepartment, OrgDepartment.id == SystemUser.department_id)
                .join(OrgBranch, OrgBranch.id == SystemUser.branch_id)
                .filter(
                    CustomerPeriodBranchDetail.period_key == period_key,
                    CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
                    OrgBranch.branch_code == branch_code.strip(),
                    OrgBranch.status == "active",
                    OrgDepartment.department_code == pgd_code.strip(),
                    OrgDepartment.status == "active",
                )
                .distinct()
            )
            query = query.filter(CustomerPeriodProfile.ma_kh.in_(managed_customers))
        else:
            query = query.filter(CustomerPeriodProfile.pgd_codes.ilike(f"%{pgd_code.strip()}%"))
    if loan_type:
        loan_types = split_filter_values(loan_type)
        if loan_types:
            query = query.filter(or_(*(CustomerPeriodProfile.loai_vay.ilike(f"%{item}%") for item in loan_types)))
    if officer_code:
        officer_codes = split_filter_values(officer_code)
        if period_key and branch_code and officer_codes:
            managed_by_officer = (
                query.session.query(CustomerPeriodBranchDetail.ma_kh)
                .filter(
                    CustomerPeriodBranchDetail.period_key == period_key,
                    CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
                    or_(
                        CustomerPeriodBranchDetail.ma_cb.in_(officer_codes),
                        CustomerPeriodBranchDetail.officer_employee_code.in_(officer_codes),
                    ),
                )
                .distinct()
            )
            query = query.filter(CustomerPeriodProfile.ma_kh.in_(managed_by_officer))
        elif officer_codes:
            query = query.filter(or_(
                CustomerPeriodProfile.ma_cb.in_(officer_codes),
                CustomerPeriodProfile.officer_employee_code.in_(officer_codes),
            ))
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
    if missing_officer is not None:
        if branch_code and period_key:
            valid_managed_codes = (
                query.session.query(CustomerPeriodBranchDetail.ma_kh)
                .join(SystemUser, and_(
                    SystemUser.is_active.is_(True),
                    or_(
                        SystemUser.credit_officer_code == CustomerPeriodBranchDetail.ma_cb,
                        SystemUser.employee_code == CustomerPeriodBranchDetail.ma_cb,
                        SystemUser.employee_code == CustomerPeriodBranchDetail.officer_employee_code,
                    ),
                ))
                .filter(
                    CustomerPeriodBranchDetail.period_key == period_key,
                    CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
                )
            )
            query = query.filter(
                CustomerPeriodProfile.ma_kh.notin_(valid_managed_codes)
                if missing_officer else CustomerPeriodProfile.ma_kh.in_(valid_managed_codes)
            )
        else:
            valid_officer = query.session.query(SystemUser.id).filter(
                SystemUser.is_active.is_(True),
                or_(
                    SystemUser.credit_officer_code == CustomerPeriodProfile.ma_cb,
                    SystemUser.employee_code == CustomerPeriodProfile.ma_cb,
                    SystemUser.employee_code == CustomerPeriodProfile.officer_employee_code,
                ),
            ).exists()
            query = query.filter(~valid_officer if missing_officer else valid_officer)
    if unclear_primary_branch is not None:
        unclear_condition = and_(
            CustomerPeriodProfile.branch_count > 1,
            or_(
                CustomerPeriodProfile.primary_branch_code.is_(None),
                func.trim(CustomerPeriodProfile.primary_branch_code) == "",
                func.strpos(
                    func.coalesce(CustomerPeriodProfile.branch_codes, ""),
                    func.coalesce(CustomerPeriodProfile.primary_branch_code, ""),
                ) == 0,
            ),
        )
        query = query.filter(unclear_condition if unclear_primary_branch else ~unclear_condition)
    if new_in_period is not None and period_key:
        previous_period = query.session.query(func.max(CustomerPeriodProfile.period_key)).filter(
            CustomerPeriodProfile.period_key < period_key,
        ).scalar()
        if previous_period:
            previous_profile = aliased(CustomerPeriodProfile)
            appeared_previous_period = query.session.query(previous_profile.id).filter(
                previous_profile.period_key == previous_period,
                previous_profile.ma_kh == CustomerPeriodProfile.ma_kh,
            ).exists()
            query = query.filter(~appeared_previous_period if new_in_period else appeared_previous_period)
        elif not new_in_period:
            query = query.filter(False)
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
            agg.c.ma_pgd,
            agg.c.ten_pgd,
            agg.c.ma_cb,
            agg.c.ten_can_bo,
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
        item["viewing_branch_code"] = branch_code
        fin = finance_map.get(str(item.get("ma_kh") or ""))
        if fin is None:
            item["so_du_tien_vay"] = 0
            item["so_du_tien_gui"] = 0
            item["so_du_tgtt_binh_quan"] = 0
            continue
        item["so_du_tien_vay"] = serialize_value(fin.so_du_tien_vay)
        item["so_du_tien_gui"] = serialize_value(fin.so_du_tien_gui)
        item["so_du_tgtt_binh_quan"] = serialize_value(fin.so_du_tgtt_binh_quan)
        item["viewing_pgd_code"] = fin.ma_pgd
        item["viewing_pgd_name"] = fin.ten_pgd
        item["viewing_officer_code"] = fin.ma_cb
        item["viewing_officer_name"] = fin.ten_can_bo
        # Trong danh sách đang xem theo đơn vị, cán bộ và PGD phải là của đúng
        # quan hệ tại đơn vị đó; vẫn giữ primary_* để chú thích chi nhánh chính.
        item["ma_cb"] = fin.ma_cb
        item["ten_can_bo"] = fin.ten_can_bo
    return payloads


def _enrich_latest_relationship(
    db: Session,
    period_key: str,
    payloads: list[dict],
    branch_code: str | None = None,
) -> list[dict]:
    """Bổ sung lần quan hệ nghiệp vụ gần nhất cho đúng trang kết quả, tránh join nguồn lớn trước phân trang."""
    customer_codes = [str(item.get("ma_kh") or "").strip() for item in payloads if item.get("ma_kh")]
    if not customer_codes:
        return payloads

    candidates: dict[str, list[tuple[date, str, str]]] = {code: [] for code in customer_codes}

    gl_query = db.query(
        GL02LedgerTransaction.customer_code,
        func.max(GL02LedgerTransaction.transaction_date),
    ).filter(
        GL02LedgerTransaction.period_key == period_key,
        GL02LedgerTransaction.customer_code.in_(customer_codes),
        GL02LedgerTransaction.transaction_date.isnot(None),
        func.coalesce(GL02LedgerTransaction.transaction_type, "Normal") == "Normal",
    )
    if branch_code:
        gl_query = gl_query.filter(GL02LedgerTransaction.customer_branch_code == branch_code.strip())
    for customer_code, activity_date in gl_query.group_by(GL02LedgerTransaction.customer_code).all():
        if activity_date:
            candidates.setdefault(str(customer_code), []).append((activity_date, "Giao dịch TKTT", "GL02"))

    deposit_query = db.query(DP01DepositAccount.ma_kh, func.max(DP01DepositAccount.opening_date)).filter(
        DP01DepositAccount.period_key == period_key,
        DP01DepositAccount.ma_kh.in_(customer_codes),
        DP01DepositAccount.opening_date.isnot(None),
    )
    if branch_code:
        deposit_query = deposit_query.filter(DP01DepositAccount.ma_cn == branch_code.strip())
    for customer_code, activity_date in deposit_query.group_by(DP01DepositAccount.ma_kh).all():
        if activity_date:
            candidates.setdefault(str(customer_code), []).append((activity_date, "Mở tài khoản/tiền gửi", "DP01"))

    loan_query = db.query(
        LN01Loan.custseq,
        func.max(func.greatest(LN01Loan.disbursement_date, LN01Loan.transaction_date)),
    ).filter(
        LN01Loan.period_key == period_key,
        LN01Loan.custseq.in_(customer_codes),
        or_(LN01Loan.disbursement_date.isnot(None), LN01Loan.transaction_date.isnot(None)),
    )
    if branch_code:
        loan_query = loan_query.filter(func.coalesce(func.nullif(LN01Loan.brcd, ""), LN01Loan.branch_code) == branch_code.strip())
    for customer_code, activity_date in loan_query.group_by(LN01Loan.custseq).all():
        if activity_date:
            candidates.setdefault(str(customer_code), []).append((activity_date, "Giải ngân/khoản vay", "LN01"))

    pf10_query = db.query(PF10LoanProfitability.customer_code, func.max(PF10LoanProfitability.opening_date)).filter(
        PF10LoanProfitability.period_key == period_key,
        PF10LoanProfitability.customer_code.in_(customer_codes),
        PF10LoanProfitability.opening_date.isnot(None),
    )
    if branch_code:
        pf10_query = pf10_query.filter(PF10LoanProfitability.branch_code == branch_code.strip())
    for customer_code, activity_date in pf10_query.group_by(PF10LoanProfitability.customer_code).all():
        if activity_date:
            candidates.setdefault(str(customer_code), []).append((activity_date, "Giải ngân/khoản vay", "PF10"))

    source_priority = {"GL02": 3, "LN01": 2, "PF10": 2, "DP01": 1}
    for payload in payloads:
        values = candidates.get(str(payload.get("ma_kh") or ""), [])
        latest = max(values, key=lambda item: (item[0], source_priority.get(item[2], 0)), default=None)
        payload["latest_relationship_date"] = serialize_value(latest[0]) if latest else None
        payload["latest_relationship_type"] = latest[1] if latest else None
        payload["latest_relationship_source"] = latest[2] if latest else None
    return payloads


def _profile_quality_query(db: Session, period_key: str, issue: str, branch_code: str | None = None):
    query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    has_business_activity = or_(
        CustomerPeriodProfile.dp_record_count > 0,
        func.coalesce(CustomerPeriodProfile.so_du_tien_gui, 0) != 0,
        func.coalesce(CustomerPeriodProfile.so_du_tgtt_binh_quan, 0) != 0,
        func.coalesce(CustomerPeriodProfile.so_du_tien_vay, 0) != 0,
        CustomerPeriodProfile.pf10_lds_count > 0,
    )
    query = query.filter(has_business_activity)
    if branch_code:
        query = query.filter(CustomerPeriodProfile.branch_codes.ilike(f"%{branch_code.strip()}%"))
    if issue == "missing_officer":
        valid_officer = db.query(SystemUser.id).filter(
            SystemUser.is_active.is_(True),
            or_(
                SystemUser.credit_officer_code == CustomerPeriodProfile.ma_cb,
                SystemUser.employee_code == CustomerPeriodProfile.ma_cb,
                SystemUser.employee_code == CustomerPeriodProfile.officer_employee_code,
            ),
        ).exists()
        return query.filter(~valid_officer)
    if issue == "unclear_primary_branch":
        return query.filter(
            CustomerPeriodProfile.branch_count > 1,
            or_(
                CustomerPeriodProfile.primary_branch_code.is_(None),
                func.trim(CustomerPeriodProfile.primary_branch_code) == "",
                func.strpos(
                    func.coalesce(CustomerPeriodProfile.branch_codes, ""),
                    func.coalesce(CustomerPeriodProfile.primary_branch_code, ""),
                ) == 0,
            ),
        )
    raise HTTPException(status_code=400, detail="Loại vấn đề chất lượng hồ sơ không hợp lệ")


@router.get("/profile-quality", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def get_profile_quality(
    period_key: str = Query(...),
    issue: str | None = None,
    keyword: str | None = None,
    branch_code: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    issue_keys = ("missing_officer", "unclear_primary_branch")
    effective_branch = branch_code if user.can_view_all_branches() else user.ma_cn
    summary = {key: int(_profile_quality_query(db, period_key, key, effective_branch).count()) for key in issue_keys}
    if not issue:
        return {"period_key": period_key, "summary": summary}
    query = _profile_quality_query(db, period_key, issue, effective_branch)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        query = query.filter(or_(CustomerPeriodProfile.ma_kh.ilike(pattern), CustomerPeriodProfile.ten_kh.ilike(pattern)))
    total = int(query.count())
    rows = query.order_by(desc(CustomerPeriodProfile.branch_count), CustomerPeriodProfile.ma_kh).offset((page - 1) * page_size).limit(page_size).all()
    fields = [
        "ma_kh", "ten_kh", "loai_khach_hang", "branch_codes", "branch_count",
        "primary_branch_code", "primary_pgd_name", "ma_cb", "ten_can_bo",
        "so_du_tien_gui", "so_du_tgtt_binh_quan", "so_du_tien_vay", "branch_details",
    ]
    items = [serialize_model(row, fields) for row in rows]
    for item in items:
        item["primary_branch_configured"] = bool(str(item.get("primary_branch_code") or "").strip())
        if not item["primary_branch_configured"] and isinstance(item.get("branch_details"), list):
            item["suggested_primary_branch"] = next((
                detail.get("branch_code") for detail in item["branch_details"] if detail.get("branch_code")
            ), None)
    return {"period_key": period_key, "issue": issue, "summary": summary, "total": total, "page": page, "page_size": page_size, "items": items}


def _require_admin(user: CurrentUser) -> None:
    if "admin" not in user.permissions:
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được xem truy vết nguồn dữ liệu")


@router.get("/value-lineage", dependencies=[Depends(require_any_permission("admin:audit:view"))])
def get_value_lineage(
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    metric: str = Query(...),
    branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(user)
    profile = db.query(CustomerPeriodProfile).filter_by(period_key=period_key, ma_kh=ma_kh).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ khách hàng trong kỳ")
    items = []
    if metric in {"loan", "income"}:
        query = db.query(PF10LoanProfitability, ImportFile).join(ImportFile, ImportFile.id == PF10LoanProfitability.import_file_id).filter(
            PF10LoanProfitability.period_key == period_key,
            PF10LoanProfitability.customer_code == ma_kh,
        )
        if branch_code:
            query = query.filter(PF10LoanProfitability.branch_code == branch_code)
        for row, source_file in query.order_by(PF10LoanProfitability.branch_code, PF10LoanProfitability.id).limit(1000):
            value = row.interest_amount if metric == "income" else row.end_of_month_balance
            items.append({
                "source": "PF10", "file": source_file.original_filename, "source_record_id": row.id,
                "branch_code": row.branch_code, "reference": row.account_number,
                "source_column": "INTEREST" if metric == "income" else "EOMBAL",
                "value": serialize_value(value), "formula": "SUM(INTEREST)" if metric == "income" else "SUM(EOMBAL) theo loại vay",
            })
    if metric in {"deposit", "casa"}:
        query = db.query(PF14AccountBalance, ImportFile).join(ImportFile, ImportFile.id == PF14AccountBalance.import_file_id).filter(
            PF14AccountBalance.period_key == period_key, PF14AccountBalance.custseq == ma_kh,
        )
        query = query.filter(
            func.coalesce(PF14AccountBalance.monterm, 0) > 0
            if metric == "deposit"
            else func.coalesce(PF14AccountBalance.monterm, 0) == 0
        )
        if branch_code:
            query = query.filter(PF14AccountBalance.trbrcd == branch_code)
        rate_rows = db.query(CustomerPeriodExchangeRate).filter(CustomerPeriodExchangeRate.period_key == period_key).all()
        rates = {str(row.ccy or "VND").strip().upper(): float(row.exchange_rate or 1) for row in rate_rows}
        for row, source_file in query.order_by(PF14AccountBalance.trbrcd, PF14AccountBalance.id).limit(1000):
            original_value = row.monthlyendbalance if metric == "deposit" else row.averagebalance
            ccy = str(row.ccy or "VND").strip().upper()
            rate = rates.get(ccy, 1)
            value = float(original_value or 0) * rate
            items.append({
                "source": "PF14", "file": source_file.original_filename, "source_record_id": row.id,
                "branch_code": row.trbrcd, "reference": row.accountno,
                "source_column": "MONTHLYENDBALANCE" if metric == "deposit" else "AVERAGEBALANCE",
                "value": serialize_value(value), "original_value": serialize_value(original_value),
                "currency_code": ccy, "exchange_rate": rate,
                "formula": "Số dư nguồn × tỷ giá DP01; sau đó SUM theo tài khoản",
            })
    if metric == "income":
        query = db.query(KH02CustomerTransaction, ImportFile).join(ImportFile, ImportFile.id == KH02CustomerTransaction.import_file_id).filter(
            KH02CustomerTransaction.period_key == period_key, KH02CustomerTransaction.customer_code == ma_kh,
        )
        if branch_code:
            query = query.filter(KH02CustomerTransaction.branch_code == branch_code)
        fee_prefixes = tuple(prefix for prefixes in FEE_CATEGORY_PREFIXES.values() for prefix in prefixes)
        for row, source_file in query.order_by(KH02CustomerTransaction.branch_code, KH02CustomerTransaction.id).limit(2000):
            code = str(row.account_code or "").strip()
            if not any(code.startswith(prefix) for prefix in fee_prefixes):
                continue
            items.append({
                "source": "KH02", "file": source_file.original_filename, "source_record_id": row.id,
                "branch_code": row.branch_code, "reference": row.transaction_sequence,
                "source_column": f"ACCTCD={code}; CRAMT-DRAMT", "value": serialize_value((row.credit_amount or 0) - (row.debit_amount or 0)),
                "formula": "SUM(CRAMT) - SUM(DRAMT) theo nhóm tài khoản cấu hình",
            })
    total = sum(float(item.get("value") or 0) for item in items)
    return {
        "period_key": period_key, "ma_kh": ma_kh, "metric": metric,
        "branch_code": branch_code, "total": total, "record_count": len(items), "items": items,
        "admin_only": True,
    }


@router.get("/periods", dependencies=[Depends(require_any_permission("dashboard:view", "customer:view", "analytics:view", "processing:view"))])
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


@router.get("/profile-field-coverage", dependencies=[Depends(require_any_permission("customer:profile:view"))])
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


@router.post("/optional-files", dependencies=[Depends(require_any_permission("warehouse:import"))])
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


@router.get("/optional-files", dependencies=[Depends(require_any_permission("warehouse:view", "processing:view"))])
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


@router.get("/exchange-rates", dependencies=[Depends(require_any_permission("warehouse:view", "analytics:view"))])
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


@router.post("/jobs/{period_key}", dependencies=[Depends(require_any_permission("processing:run"))])
def start_processing_job(
    period_key: str,
    background_tasks: BackgroundTasks,
    allow_missing_ftpln: bool = Query(default=False),
    allow_missing_sources: bool = Query(default=False),
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
        allowed_missing_types = (
            set(REQUIRED_FILE_TYPES)
            if allow_missing_sources
            else ({"FTPLN"} if allow_missing_ftpln else None)
        )
        job = create_processing_job(
            db,
            period_key,
            allowed_missing_types=allowed_missing_types,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(process_customer_period, job.id)
    return serialize_job(job)


@router.post("/jobs/{period_key}/recover", dependencies=[Depends(require_any_permission("processing:recover"))])
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


@router.get("/jobs", dependencies=[Depends(require_any_permission("processing:view"))])
def list_jobs(period_key: str | None = None, db: Session = Depends(get_db)):
    query = db.query(CustomerProcessingJob)
    if period_key:
        query = query.filter(CustomerProcessingJob.period_key == period_key)
    rows = query.order_by(desc(CustomerProcessingJob.created_at)).limit(20).all()
    return [serialize_job(item) for item in rows]


@router.get("/jobs/{job_id}", dependencies=[Depends(require_any_permission("processing:view"))])
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(CustomerProcessingJob).filter(CustomerProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy job xử lý dữ liệu")
    return serialize_job(job)


@router.get("/reconciliations", dependencies=[Depends(require_any_permission("reconciliation:view", "analytics:view"))])
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


@router.get("/quality-audit", dependencies=[Depends(require_any_permission("reconciliation:view", "processing:view"))])
def get_processing_quality_audit(
    period_key: str = Query(...),
    refresh: bool = Query(False),
    db: Session = Depends(get_db),
):
    batch_exists = db.query(ImportBatch.id).filter(ImportBatch.period_key == period_key).first()
    if not batch_exists:
        raise HTTPException(status_code=404, detail="Kỳ dữ liệu không tồn tại")
    latest_job = (
        db.query(CustomerProcessingJob)
        .filter(
            CustomerProcessingJob.period_key == period_key,
            CustomerProcessingJob.status == "success",
        )
        .order_by(CustomerProcessingJob.finished_at.desc(), CustomerProcessingJob.id.desc())
        .first()
    )
    report = latest_job.quality_report if latest_job and latest_job.quality_report else None
    if report is None and not refresh:
        return {
            "period_key": period_key,
            "status": "not_calculated",
            "is_valid": None,
            "checks": [],
            "message": "Chưa có kết quả kiểm định được lưu cho kỳ dữ liệu này.",
        }
    if report is None or refresh:
        report = validate_processed_period(db, period_key)
        if latest_job:
            latest_job.quality_report = report
            db.commit()
    else:
        report = dict(report)
    report["status"] = "ready"
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


@router.delete("/optional-files/{optional_file_id}", dependencies=[Depends(require_any_permission("warehouse:delete"))])
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
    for model in (SupplementalBaoLanhRecord, SupplementalOABRecord, SupplementalBillPaymentTransaction, SupplementalPOSRecord):
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


@router.get("/reconciliations-export", dependencies=[Depends(require_any_permission("reconciliation:view", "report:export"))])
def export_source_reconciliations(
    request: Request,
    period_key: str = Query(...),
    source_type: str | None = None,
    branch_code: str | None = None,
    reason_code: str | None = None,
    keyword: str | None = None,
    latest_job_only: bool = True,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    export_task = begin_export(request, user, "Đang lọc bản ghi đối chiếu CIF")
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
    update_export(export_task, 20, f"Đã tìm thấy {len(rows):,} bản ghi; đang ghi Excel")

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
        if index % 500 == 0 or index == len(rows):
            update_export(export_task, 20 + int(70 * index / max(len(rows), 1)), f"Đã ghi {index:,}/{len(rows):,} dòng")
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    widths = [8, 14, 18, 34, 12, 12, 48, 25, 16, 20, 16, 24, 22, 22]
    for index, width in enumerate(widths, 1):
        worksheet.column_dimensions[chr(64 + index)].width = width
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    update_export(export_task, 96, "Đã tạo file; đang gửi về trình duyệt")
    filename = f"doi_chieu_cif_{period_key}.xlsx"
    record_security_event(
        request,
        user,
        "reconciliation_export",
        "reconciliation_export",
        filename,
        "Xuất danh sách nguồn chưa đối chiếu được với CIF",
        {
            "period_key": period_key,
            "source_type": source_type,
            "branch_code": branch_code,
            "reason_code": reason_code,
            "keyword": keyword,
            "latest_job_only": latest_job_only,
            "row_count": len(rows),
        },
    )
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(output.getbuffer().nbytes),
        },
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


def _normalize_user_data_scope(
    user: CurrentUser,
    branch_code: str | None,
    pgd_code: str | None,
    officer_code: str | None,
) -> tuple[str | None, str | None, str | None]:
    """Force every customer query into the authenticated user's configured scope."""
    if user.can_view_all_branches():
        return branch_code, pgd_code, officer_code
    if not user.ma_cn:
        raise HTTPException(status_code=403, detail="Tài khoản chưa được gán chi nhánh dữ liệu")
    if branch_code and branch_code != user.ma_cn:
        raise HTTPException(status_code=403, detail="Không có quyền xem dữ liệu chi nhánh này")
    branch_code = user.ma_cn
    if user.scope in {"pgd", "own"}:
        if not user.ma_pgd:
            raise HTTPException(status_code=403, detail="Tài khoản chưa được gán phòng ban dữ liệu")
        if pgd_code and pgd_code != user.ma_pgd:
            raise HTTPException(status_code=403, detail="Không có quyền xem dữ liệu phòng ban này")
        pgd_code = user.ma_pgd
    if user.scope == "own":
        officer_code = user.employee_code or "__NO_ASSIGNED_CUSTOMER__"
    return branch_code, pgd_code, officer_code


def _enforce_customer_data_scope(
    db: Session,
    user: CurrentUser,
    ma_kh: str,
    period_key: str | None = None,
    branch_code: str | None = None,
) -> str | None:
    """Authorize one customer and return the effective branch for downstream queries."""
    effective_branch, effective_pgd, effective_officer = _normalize_user_data_scope(
        user, branch_code, None, None
    )
    if user.can_view_all_branches():
        return effective_branch
    query = db.query(CustomerPeriodBranchDetail.id).filter(
        CustomerPeriodBranchDetail.ma_kh == ma_kh,
        CustomerPeriodBranchDetail.branch_code == effective_branch,
    )
    if period_key:
        query = query.filter(CustomerPeriodBranchDetail.period_key == period_key)
    if user.scope in {"pgd", "own"}:
        query = query.filter(CustomerPeriodBranchDetail.ma_pgd == effective_pgd)
    if user.scope == "own":
        query = query.filter(CustomerPeriodBranchDetail.officer_employee_code == effective_officer)
    if query.first() is None:
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc phạm vi dữ liệu được giao")
    return effective_branch


PROFILE_QUICK_FIELDS = [
    "id", "period_key", "period_date", "ma_kh", "ten_kh", "loai_khach_hang",
    "branch_codes", "pgd_codes", "branch_count", "pgd_count", "dp_record_count",
    "ten_chu_doanh_nghiep", "so_cccd", "ma_so_thue", "ngay_thanh_lap", "dia_chi",
    "gioi_tinh", "ngay_sinh", "nghe_nghiep", "management_source", "managing_branch_code",
    "managing_department_code", "managing_department_name", "so_du_tien_gui",
    "doanh_so_chuyen_tien_ve_tk", "last_tktt_transaction_at", "tktt_inactive_days",
    "tktt_activity_status", "so_du_tien_vay", "du_no_ngan_han", "du_no_ngan_han_bq",
    "du_no_trung_dai_han", "du_no_trung_dai_han_bq", "du_no_thau_chi", "du_no_thau_chi_bq",
    "pf10_lds_count", "pf10_interest", "pf10_accruals", "pf10_book_correction_interest",
    "du_no_xlrr", "ds_thu_no_xlrr", "loai_vay", "so_du_tgtt_binh_quan", "thau_chi",
    "tk_so_dep", "agribank_plus", "tin_nhan_ott", "e_banking", "sms_nhac_no_vay",
    "sms_tien_gui", "the_ghi_no_noi_dia", "the_ghi_no_quoc_te", "the_td_noi_dia", "the_td_quoc_te",
    "the_td_loc_viet", "bao_lanh", "loa_bien_dong_so_du", "phat_hanh_lc", "thuho_dien",
    "thuho_nuoc", "thuho_dt", "hkd_tk", "hkd_account_numbers", "abic_batk", "abic_bathe",
    "pos", "so_thiet_bi_pos", "pos_moi", "pos_khong_hoat_dong", "pos_ngung_hoat_dong",
    "ma_cb", "ten_can_bo", "officer_employee_code", "telephone", "primary_branch_code",
    "primary_pgd_code", "primary_pgd_name", "primary_location_score", "primary_location_reason",
    "branch_details", "processing_job_id",
]


def _mask_quick_profile(payload: dict, user: CurrentUser) -> dict:
    """Apply the same sensitive-data policy as the customer list endpoint."""
    if not _has_permission(user, "customer:sensitive:identity"):
        payload["so_cccd"] = _mask_identifier(payload.get("so_cccd"))
        payload["ma_so_thue"] = _mask_identifier(payload.get("ma_so_thue"))
    if not _has_permission(user, "customer:sensitive:contact"):
        payload["telephone"] = _mask_identifier(payload.get("telephone"), visible=3)
        if payload.get("dia_chi"):
            payload["dia_chi"] = "Thông tin được bảo vệ theo quyền dữ liệu nhạy cảm"
    if not _has_permission(user, "customer:sensitive:account") and payload.get("hkd_account_numbers"):
        payload["hkd_account_numbers"] = ", ".join(
            _mask_identifier(account)
            for account in str(payload["hkd_account_numbers"]).split(",")
            if str(account).strip()
        )
    return payload


def _profile_representative_payload(
    db: Session,
    profile: CustomerPeriodProfile,
    preferred_branch: str | None,
    user: CurrentUser,
) -> dict | None:
    """Return the legal representative/owner fields retained in the CIF row.

    The normalized CIF master currently keeps the customer itself, while the
    GD_* columns remain in the identifier snapshot. Resolve the row closest to
    the branch being viewed and expose it separately so an organisation's
    representative is never confused with the customer's own demographics.
    """
    query = db.query(CifCustomerIdentifier).filter(
        or_(
            CifCustomerIdentifier.customer_id == profile.customer_id,
            CifCustomerIdentifier.customer_core_code == profile.ma_kh,
        )
    )
    branch_hint = preferred_branch or profile.primary_branch_code or profile.managing_branch_code
    if branch_hint:
        query = query.order_by(
            case((CifCustomerIdentifier.branch_code == branch_hint, 0), else_=1),
            CifCustomerIdentifier.imported_at.desc(),
            CifCustomerIdentifier.id.desc(),
        )
    else:
        query = query.order_by(
            CifCustomerIdentifier.imported_at.desc(),
            CifCustomerIdentifier.id.desc(),
        )
    identifier = query.first()
    raw = identifier.raw_data or {} if identifier else {}

    def raw_value(key: str):
        value = raw.get(key)
        text_value = str(value or "").strip()
        return text_value or None

    representative = {
        "name": raw_value("gd_ten") or profile.ten_chu_doanh_nghiep,
        "birth_date": raw_value("gd_ngaysinh"),
        "gender": raw_value("gd_gioitinh"),
        "phone": raw_value("gd_sdt"),
        "address": raw_value("gd_diachi"),
        "source": "CIF.GD_*",
        "source_branch_code": identifier.branch_code if identifier else branch_hint,
    }
    if not any(representative.get(key) for key in ("name", "birth_date", "gender", "phone", "address")):
        return None
    if not _has_permission(user, "customer:sensitive:identity"):
        representative["birth_date"] = None
        representative["gender"] = None
    if not _has_permission(user, "customer:sensitive:contact"):
        representative["phone"] = _mask_identifier(representative.get("phone"), visible=3)
        if representative.get("address"):
            representative["address"] = "Thông tin được bảo vệ theo quyền dữ liệu nhạy cảm"
    return representative


@router.get("/profiles", dependencies=[Depends(require_any_permission("customer:view"))])
def list_profiles(
    request: Request,
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    limit: int | None = Query(default=None, ge=1, le=1000),
    include_total: bool = False,
    include_units: bool = False,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, officer_code
    )
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
        missing_officer=missing_officer,
        unclear_primary_branch=unclear_primary_branch,
        new_in_period=new_in_period,
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
        "the_ghi_no_quoc_te",
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
        "pos",
        "so_thiet_bi_pos",
        "pos_moi",
        "pos_khong_hoat_dong",
        "pos_ngung_hoat_dong",
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
    items = _enrich_latest_relationship(db, period_key, items, branch_code)
    items = enrich_profile_org_names(db, items, include_units=include_units)
    can_view_identity = _has_permission(user, "customer:sensitive:identity")
    can_view_contact = _has_permission(user, "customer:sensitive:contact")
    can_view_accounts = _has_permission(user, "customer:sensitive:account")
    for item in items:
        if not can_view_identity:
            item["so_cccd"] = _mask_identifier(item.get("so_cccd"))
            item["ma_so_thue"] = _mask_identifier(item.get("ma_so_thue"))
        if not can_view_contact:
            item["telephone"] = _mask_identifier(item.get("telephone"), visible=3)
            if item.get("dia_chi"):
                item["dia_chi"] = "Thông tin được bảo vệ theo quyền dữ liệu nhạy cảm"
        if not can_view_accounts and item.get("hkd_account_numbers"):
            item["hkd_account_numbers"] = ", ".join(
                _mask_identifier(account)
                for account in str(item["hkd_account_numbers"]).split(",")
                if str(account).strip()
            )
    if keyword:
        record_security_event(
            request,
            user,
            "customer_search",
            "customer",
            description="Tìm kiếm danh sách khách hàng C360",
            metadata={
                "period_key": period_key,
                "keyword": keyword,
                "branch_code": branch_code,
                "department_code": pgd_code,
                "result_count": len(items),
                "include_units": bool(include_units),
                "sensitive_identity_visible": can_view_identity,
                "sensitive_contact_visible": can_view_contact,
                "sensitive_accounts_visible": can_view_accounts,
            },
        )
    if include_total:
        return {"items": items, "total": total, "page": page, "page_size": effective_page_size}
    return items


@router.get("/profile", dependencies=[Depends(require_any_permission("customer:view"))])
def get_profile(
    request: Request,
    ma_kh: str = Query(...),
    period_key: str | None = None,
    branch_code: str | None = None,
    include_units: bool = True,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Load exactly one profile without starting or restoring a global analysis session."""
    customer_code = str(ma_kh or "").strip()
    if not customer_code:
        raise HTTPException(status_code=422, detail="Mã khách hàng không hợp lệ")

    effective_branch, effective_pgd, effective_officer = _normalize_user_data_scope(
        user, branch_code, None, None
    )
    selected_period = str(period_key or "").strip() or None

    if selected_period:
        _enforce_customer_data_scope(
            db, user, customer_code, period_key=selected_period, branch_code=effective_branch
        )
        profile = db.query(CustomerPeriodProfile).filter(
            CustomerPeriodProfile.period_key == selected_period,
            CustomerPeriodProfile.ma_kh == customer_code,
        ).first()
    elif user.can_view_all_branches() and not effective_branch:
        profile = (
            db.query(CustomerPeriodProfile)
            .filter(CustomerPeriodProfile.ma_kh == customer_code)
            .order_by(CustomerPeriodProfile.period_date.desc(), CustomerPeriodProfile.id.desc())
            .first()
        )
    else:
        profile_query = (
            db.query(CustomerPeriodProfile)
            .join(
                CustomerPeriodBranchDetail,
                and_(
                    CustomerPeriodBranchDetail.period_key == CustomerPeriodProfile.period_key,
                    CustomerPeriodBranchDetail.ma_kh == CustomerPeriodProfile.ma_kh,
                ),
            )
            .filter(CustomerPeriodProfile.ma_kh == customer_code)
        )
        if effective_branch:
            profile_query = profile_query.filter(CustomerPeriodBranchDetail.branch_code == effective_branch)
        if effective_pgd:
            profile_query = profile_query.filter(CustomerPeriodBranchDetail.ma_pgd == effective_pgd)
        if effective_officer:
            profile_query = profile_query.filter(
                CustomerPeriodBranchDetail.officer_employee_code == effective_officer
            )
        profile = profile_query.order_by(
            CustomerPeriodProfile.period_date.desc(), CustomerPeriodProfile.id.desc()
        ).first()

    if not profile:
        detail = (
            f"Khách hàng chưa có hồ sơ ở kỳ {selected_period} hoặc không thuộc phạm vi dữ liệu được giao"
            if selected_period
            else "Khách hàng chưa có hồ sơ thuộc phạm vi dữ liệu được giao"
        )
        raise HTTPException(status_code=404, detail=detail)

    selected_period = profile.period_key
    payload = serialize_model(profile, PROFILE_QUICK_FIELDS)
    payload = _apply_branch_finance_to_payloads(
        db, selected_period, effective_branch, effective_pgd, [payload]
    )[0]
    payload = enrich_profile_org_names(db, [payload], include_units=include_units)[0]
    payload["representative"] = _profile_representative_payload(
        db, profile, effective_branch, user
    )
    _mask_quick_profile(payload, user)
    payload["_exact_profile"] = True

    record_security_event(
        request,
        user,
        "customer_profile_open",
        "customer",
        entity_id=customer_code,
        description="Mở nhanh hồ sơ khách hàng",
        metadata={
            "period_key": selected_period,
            "branch_code": effective_branch,
            "source": "exact_customer_profile",
        },
    )
    return {"period_key": selected_period, "customer": payload}


@router.get("/financial-metrics", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def get_customer_financial_metrics(
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
    metric_fields = [
        "phi_bao_lanh", "phi_chuyen_tien", "phi_nhdt", "abic_batd", "phi_kdnt", "phi_lc", "phi_ttqt", "phi_the", "phi_khac",
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


@router.get("/rr01-handled-risk", dependencies=[Depends(require_any_permission("customer:credit:view"))])
def get_rr01_handled_risk(
    request: Request,
    period_key: str = Query(...), ma_kh: str = Query(...), branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
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
    loan_details_masked = not _has_permission(user, "customer:sensitive:loan")
    payload_items = [serialize_model(row, fields) for row in rows]
    payload_groups = [{**value, "current_principal": serialize_value(value["current_principal"]), "recovered_amount": serialize_value(value["recovered_amount"])} for value in groups.values()]
    if loan_details_masked:
        for item in payload_items:
            item["lav_number"] = _mask_identifier(item.get("lav_number"))
            item["lds_number"] = _mask_identifier(item.get("lds_number"))
        for item in payload_groups:
            item["lav_number"] = _mask_identifier(item.get("lav_number"))
    else:
        record_security_event(
            request, user, "sensitive_loan_view", "customer", ma_kh,
            "Xem chi tiết LAV/LDS nợ xử lý rủi ro",
            {"period_key": period_key, "branch_code": branch_code, "record_count": len(payload_items)},
        )
    return {
        "period_key": period_key, "ma_kh": ma_kh,
        "total_current_principal": serialize_value(sum((row.current_principal or 0 for row in rows), Decimal(0))),
        "total_recovered_amount": serialize_value(sum(((row.recovered_principal_period or 0) + (row.recovered_interest_period or 0) for row in rows), Decimal(0))),
        "lav_groups": payload_groups,
        "items": payload_items,
        "loan_details_masked": loan_details_masked,
    }


def describe_gl02_transaction(remark: str | None, debit_amount, credit_amount) -> dict:
    """Diễn giải GL02; chiều giao dịch luôn căn cứ số tiền, không đoán từ REMARK."""
    normalized = " ".join(str(remark or "").strip().lower().split())
    descriptions = (
        ("arrear commission for deposits", "Thu phí dịch vụ tiền gửi/truy thu phí tiền gửi"),
        ("capitalisation for deposits", "Nhập lãi tiền gửi vào tài khoản"),
        ("loan repayment", "Thanh toán khoản vay"),
        ("withdrawal banknet atm", "Rút tiền tại ATM BankNet"),
        ("visa banknet cash transaction withdrawal", "Rút tiền mặt qua thẻ Visa/BankNet"),
        ("purchase banknet pos", "Thanh toán mua hàng qua POS BankNet"),
        ("time deposit open", "Mở tiền gửi có kỳ hạn"),
        ("time deposit auto close", "Tất toán tự động tiền gửi có kỳ hạn"),
        ("phi dich vu agribank plus", "Thu phí dịch vụ Agribank Plus"),
        ("phi tin nhan ott", "Thu phí tin nhắn OTT Agribank Plus"),
        ("phi dv sms banking", "Thu phí SMS Banking"),
    )
    description = next((label for marker, label in descriptions if marker in normalized), None)
    debit = float(debit_amount or 0)
    credit = float(credit_amount or 0)
    if debit > 0 and credit <= 0:
        direction, direction_label, amount = "debit", "Ghi Nợ", debit
    elif credit > 0 and debit <= 0:
        direction, direction_label, amount = "credit", "Ghi Có", credit
    elif debit > 0 and credit > 0:
        direction, direction_label, amount = "both", "Có cả Nợ và Có", None
    else:
        direction, direction_label, amount = "none", "Không phát sinh tiền", 0
    return {
        "direction": direction,
        "direction_label": direction_label,
        "amount": serialize_value(amount),
        "description": description or (str(remark).strip() if remark else "Chưa có nội dung giao dịch"),
        "description_translated": bool(description),
        **classify_gl02_transaction(remark, debit_amount, credit_amount),
    }


def classify_gl02_transaction(remark: str | None, debit_amount=0, credit_amount=0) -> dict:
    """Phân loại bảo thủ theo REMARK; không nhận diện được thì giữ riêng để rà soát."""
    normalized = " ".join(str(remark or "").strip().lower().split())
    rules = (
        ("fee", "Thu phí", ("commission", " fee", "fee ", "charge", "phi dich vu", "phí dịch vụ", "phi dv", "phí sms", "phi tin nhan")),
        ("interest", "Thu/trả lãi", ("interest", "capitalisation", "tien lai", "tiền lãi", "thu lai", "thu lãi")),
        ("loan_repayment", "Thu nợ khoản vay", ("loan repayment", "repay loan", "thu no", "thu nợ", "tra no", "trả nợ", "principal repayment")),
        ("cash_deposit", "Nộp tiền", ("cash deposit", "user deposit", "nop tien", "nộp tiền")),
        ("cash_withdrawal", "Rút tiền", ("cash withdrawal", "withdrawal", "rut tien", "rút tiền")),
        ("adjustment", "Điều chỉnh kế toán", ("adjustment", "reversal", "correction", "điều chỉnh", "dao giao dich", "đảo giao dịch")),
        ("transfer", "Chuyển tiền", ("transfer", "remittance", "chuyen tien", "chuyển tiền", "payment", "banknet pos")),
    )
    key = label = None
    matched_rule = None
    for candidate, candidate_label, markers in rules:
        matched_rule = next((marker for marker in markers if marker in normalized), None)
        if matched_rule:
            key, label = candidate, candidate_label
            break
    debit, credit = Decimal(str(debit_amount or 0)), Decimal(str(credit_amount or 0))
    if key == "transfer":
        if credit > 0 and debit <= 0:
            key, label = "transfer_in", "Chuyển tiền đến"
        elif debit > 0 and credit <= 0:
            key, label = "transfer_out", "Chuyển tiền đi"
    return {
        "category": key or "unclassified",
        "category_label": label or "Chưa phân loại",
        "classification_rule": matched_rule,
        "classification_confidence": "rule_matched" if key else "unrecognized",
    }


@router.get("/gl02-account-activity", dependencies=[Depends(require_any_permission("customer:deposit:view"))])
def get_gl02_account_activity(
    request: Request,
    period_key: str = Query(...), ma_kh: str = Query(...), branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
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

    latest_row = (
        db.query(GL02LedgerTransaction)
        .filter(*base_filters)
        .order_by(
            desc(func.coalesce(
                GL02LedgerTransaction.created_datetime,
                func.cast(GL02LedgerTransaction.transaction_date, SQLDateTime),
            )),
            desc(GL02LedgerTransaction.id),
        )
        .first()
    )

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

    remark_rows = db.query(
        GL02LedgerTransaction.remark,
        GL02LedgerTransaction.transaction_code,
        func.sum(func.coalesce(GL02LedgerTransaction.credit_amount, 0)),
        func.sum(func.coalesce(GL02LedgerTransaction.debit_amount, 0)),
        func.count(GL02LedgerTransaction.id),
        func.max(GL02LedgerTransaction.transaction_date),
    ).filter(*base_filters).group_by(
        GL02LedgerTransaction.remark, GL02LedgerTransaction.transaction_code,
    ).all()
    category_map = {}
    unknown_remarks = []
    for remark, transaction_code, credit, debit, row_count, last_date in remark_rows:
        classification = classify_gl02_transaction(remark, debit, credit)
        category = category_map.setdefault(classification["category"], {
            "key": classification["category"], "label": classification["category_label"],
            "credit_amount": Decimal(0), "debit_amount": Decimal(0), "transaction_count": 0,
        })
        category["credit_amount"] += credit or 0
        category["debit_amount"] += debit or 0
        category["transaction_count"] += int(row_count or 0)
        if classification["category"] == "unclassified":
            unknown_remarks.append({
                "remark": remark or "(Trống)", "transaction_code": transaction_code,
                "transaction_count": int(row_count or 0), "credit_amount": serialize_value(credit),
                "debit_amount": serialize_value(debit), "last_transaction_date": serialize_value(last_date),
            })
    categories = [{
        **item, "credit_amount": serialize_value(item["credit_amount"]),
        "debit_amount": serialize_value(item["debit_amount"]),
        "net_amount": serialize_value(item["credit_amount"] - item["debit_amount"]),
    } for item in sorted(category_map.values(), key=lambda value: value["transaction_count"], reverse=True)]
    unknown_remarks.sort(key=lambda value: value["transaction_count"], reverse=True)

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
    latest_transaction = None
    if latest_row:
        transaction_meaning = describe_gl02_transaction(
            latest_row.remark,
            latest_row.debit_amount,
            latest_row.credit_amount,
        )
        latest_transaction = {
            "transaction_at": serialize_value(latest_row.created_datetime or latest_row.transaction_date),
            "transaction_date": serialize_value(latest_row.transaction_date),
            "branch_code": latest_row.customer_branch_code,
            "reference": latest_row.reference,
            "remark": latest_row.remark,
            "transaction_code": latest_row.transaction_code,
            "debit_amount": serialize_value(latest_row.debit_amount),
            "credit_amount": serialize_value(latest_row.credit_amount),
            **transaction_meaning,
        }
    unclassified_count = sum(item["transaction_count"] for item in unknown_remarks)
    transaction_details_masked = not _has_permission(user, "customer:sensitive:transaction")
    if transaction_details_masked:
        if latest_transaction:
            latest_transaction.update({
                "reference": None,
                "remark": None,
                "transaction_code": None,
                "description": "Nội dung giao dịch được bảo vệ theo quyền dữ liệu nhạy cảm",
                "description_translated": False,
            })
        unknown_remarks = []
    else:
        record_security_event(
            request,
            user,
            "sensitive_transaction_view",
            "customer",
            ma_kh,
            "Xem nội dung giao dịch GL02 của khách hàng",
            {"period_key": period_key, "branch_code": branch_code},
        )
    return {
        "period_key": period_key, "ma_kh": ma_kh, "daily": daily,
        "branches": branches, "history": history, "latest_transaction": latest_transaction,
        "categories": categories, "unknown_remarks": unknown_remarks[:100],
        "unclassified_count": unclassified_count,
        "transaction_details_masked": transaction_details_masked,
    }


@router.get("/dp01-pf14-reconciliation", dependencies=[Depends(require_any_permission("customer:deposit:view"))])
def get_dp01_pf14_reconciliation(
    period_key: str = Query(...), branch_code: str | None = None,
    page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Đối chiếu vòng đời tài khoản trên đúng kỳ; không sửa dữ liệu nguồn."""
    branch_sql = "AND branch_code = :branch" if branch_code else ""
    sql = text(f"""
      WITH dp AS (
        SELECT trim(so_tai_khoan) account_no, max(ma_kh) customer_code, max(branch_code) branch_code,
               max(account_status) account_status, max(close_date) close_date,
               sum(coalesce(current_balance,0)) balance, max(month_term) month_term
        FROM dp01_deposit_accounts WHERE period_key=:period AND nullif(trim(so_tai_khoan),'') IS NOT NULL {branch_sql}
        GROUP BY trim(so_tai_khoan)
      ), pf AS (
        SELECT trim(accountno) account_no, max(custseq) customer_code, max(coalesce(trbrcd,branch_code)) branch_code,
               sum(coalesce(monthlyendbalance,0)) balance, max(monterm) month_term
        FROM pf14_account_balances WHERE period_key=:period AND nullif(trim(accountno),'') IS NOT NULL {branch_sql}
        GROUP BY trim(accountno)
      ), compared AS (
        SELECT coalesce(dp.account_no,pf.account_no) account_no,
          dp.customer_code dp_customer, pf.customer_code pf_customer,
          dp.branch_code dp_branch, pf.branch_code pf_branch,
          dp.balance dp_balance, pf.balance pf_balance,
          CASE WHEN dp.account_no IS NULL THEN 'pf14_missing_dp01'
               WHEN pf.account_no IS NULL THEN 'dp01_missing_pf14'
               WHEN coalesce(dp.customer_code,'') <> coalesce(pf.customer_code,'') THEN 'customer_mismatch'
               WHEN coalesce(dp.branch_code,'') <> coalesce(pf.branch_code,'') THEN 'branch_mismatch'
               WHEN (lower(coalesce(dp.account_status,'')) IN ('closed','close','đã đóng') OR dp.close_date IS NOT NULL)
                    AND (abs(coalesce(dp.balance,0)) > 0 OR abs(coalesce(pf.balance,0)) > 0) THEN 'closed_with_balance'
               WHEN coalesce(dp.month_term::text,'') <> coalesce(pf.month_term::text,'') THEN 'term_mismatch'
          END issue
        FROM dp FULL OUTER JOIN pf USING(account_no)
      )
      SELECT *, count(*) OVER() total FROM compared WHERE issue IS NOT NULL
      ORDER BY issue, account_no OFFSET :offset LIMIT :limit
    """)
    params = {"period": period_key, "branch": branch_code, "offset": (page - 1) * page_size, "limit": page_size}
    rows = db.execute(sql, params).mappings().all()
    summary_sql = text(f"""
      WITH dp AS (SELECT DISTINCT trim(so_tai_khoan) account_no FROM dp01_deposit_accounts WHERE period_key=:period AND nullif(trim(so_tai_khoan),'') IS NOT NULL {branch_sql}),
           pf AS (SELECT DISTINCT trim(accountno) account_no FROM pf14_account_balances WHERE period_key=:period AND nullif(trim(accountno),'') IS NOT NULL {branch_sql})
      SELECT (SELECT count(*) FROM dp) dp01_accounts, (SELECT count(*) FROM pf) pf14_accounts,
             (SELECT count(*) FROM dp LEFT JOIN pf USING(account_no) WHERE pf.account_no IS NULL) dp01_missing_pf14,
             (SELECT count(*) FROM pf LEFT JOIN dp USING(account_no) WHERE dp.account_no IS NULL) pf14_missing_dp01
    """)
    summary = dict(db.execute(summary_sql, params).mappings().one())
    return {"period_key": period_key, "summary": summary, "items": [dict(row) for row in rows],
            "total": int(rows[0]["total"] if rows else 0), "page": page, "page_size": page_size}


@router.get("/pf10-loans", dependencies=[Depends(require_any_permission("customer:credit:view"))])
def get_pf10_customer_loans(
    request: Request,
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    category: str | None = None,
    branch_code: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
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

    principal_dates = [ln_date(row, "next_repayment_date", "NEXT_REPAY_DATE") for row in ln_rows]
    interest_dates = [ln_date(row, "next_interest_repayment_date", "NEXT_INT_REPAY_DATE") for row in ln_rows]
    principal_dates = [value for value in principal_dates if value]
    interest_dates = [value for value in interest_dates if value]
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

    def schedule_status(rows, dates, date_attr, date_key, amount_attr, amount_key):
        if not rows:
            return "no_source"
        if not dates:
            return "missing_schedule"
        matching = [row for row in rows if (value := ln_date(row, date_attr, date_key)) and next_month_start <= value < next_month_end]
        if not matching:
            return "outside_next_month"
        raw_amounts = [getattr(row, amount_attr, None) if getattr(row, amount_attr, None) is not None else ln_raw(row, amount_key) for row in matching]
        if all(value is None or str(value).strip().strip("'") == "" for value in raw_amounts):
            return "missing_amount"
        return "available"
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
        "principal_schedule_status": schedule_status(ln_rows, principal_dates, "next_repayment_date", "NEXT_REPAY_DATE", "next_repayment_amount", "NEXT_REPAY_AMOUNT"),
        "interest_schedule_status": schedule_status(ln_rows, interest_dates, "next_interest_repayment_date", "NEXT_INT_REPAY_DATE", "total_interest_repayment_amount", "TOTAL_INTEREST_REPAY_AMOUNT"),
        "principal_schedule_dates": [serialize_value(value) for value in sorted(principal_dates)[:5]],
        "interest_schedule_dates": [serialize_value(value) for value in sorted(interest_dates)[:5]],
        "overdue_interest": serialize_value(overdue_interest),
        "overdue_loan_count": sum(1 for row in ln_rows if ln_decimal(row, "pastdue_interest_amount", "PASTDUE_INTEREST_AMOUNT") > 0),
        "current_debt_groups": current_groups,
        "previous_period": previous_ln_period,
        "previous_debt_groups": previous_groups,
        "debt_group_changed": bool(previous_groups and current_groups and previous_groups != current_groups),
    }

    loan_details_masked = not _has_permission(user, "customer:sensitive:loan")
    if loan_details_masked:
        for item in items:
            item["account_number"] = _mask_identifier(item.get("account_number"))
            item["lds_number"] = _mask_identifier(item.get("lds_number"))
            item["approval_number"] = _mask_identifier(item.get("approval_number"))
    else:
        record_security_event(
            request,
            user,
            "sensitive_loan_view",
            "customer",
            ma_kh,
            "Xem đầy đủ LDS và chi tiết khoản vay",
            {"period_key": period_key, "branch_code": branch_code, "record_count": len(items)},
        )

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
        "loan_details_masked": loan_details_masked,
    }


@router.get("/deposit-accounts", dependencies=[Depends(require_any_permission("customer:deposit:view"))])
def get_customer_deposit_accounts(
    request: Request,
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    category: str | None = None,
    branch_code: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
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

    # Luôn đối chiếu với kỳ dữ liệu liền trước của hệ thống. Không lấy "kỳ gần
    # nhất có mặt khách hàng" vì một khách hàng vắng ở tháng trước nhưng xuất
    # hiện lại ở tháng này phải được nhận diện là xuất hiện lại, không được âm
    # thầm so với một kỳ cũ hơn.
    previous_period = (
        db.query(func.max(DP01DepositAccount.period_key))
        .filter(DP01DepositAccount.period_key < period_key)
        .scalar()
        or db.query(func.max(PF14AccountBalance.period_key))
        .filter(PF14AccountBalance.period_key < period_key)
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
    status_order = {"new": 0, "reopened": 1, "active": 2, "inactive": 3, "closed": 4}
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
        previous_balance = float(item["previous_balance"] or 0)
        item["retention_rate"] = (
            round(min(max(average_balance, 0), previous_balance) * 100 / previous_balance, 2)
            if previous_balance > 0 else None
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
            round(min(total_average_balance, total_previous_balance) * 100 / total_previous_balance, 2)
            if total_previous_balance > 0 else None
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

    def dp_status_text(row) -> str:
        return str(getattr(row, "account_status", None) or "").strip().lower()

    def dp_is_closed(row) -> bool:
        if row is None:
            return False
        status_text = dp_status_text(row)
        return bool(
            status_text in {"close", "closed", "đã đóng", "đóng", "dong"}
            or status_text.startswith("close")
            or (row.close_date and row.close_date <= profile.period_date)
        )

    def dp_is_inactive(row) -> bool:
        return row is not None and dp_status_text(row) in {"inactive", "không hoạt động"}

    period_start = date(profile.period_date.year, profile.period_date.month, 1)

    def dp_opened_in_period(row) -> bool:
        return bool(
            row is not None
            and row.opening_date
            and period_start <= row.opening_date <= profile.period_date
        )

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
        has_average_balance = pf is not None and average_original is not None
        opened_in_period = dp_opened_in_period(current_dp)
        if current_dp is None or dp_is_closed(current_dp):
            status = "closed"
        elif dp_is_inactive(current_dp):
            status = "inactive"
        elif previous_dp is None:
            status = "new" if opened_in_period else "reopened"
        else:
            status = "active"
        lifecycle_status = (
            "opened_closed"
            if status == "closed" and previous_dp is None and opened_in_period
            else status
        )
        retention_rate = (
            round(
                min(max(float(average_balance), 0), float(previous_balance))
                * 100
                / float(previous_balance),
                2,
            )
            if previous_balance > 0 and lifecycle_status != "opened_closed" and has_average_balance
            else None
        )
        if lifecycle_status == "opened_closed":
            retention_note = "Mở và tất toán trong kỳ"
        elif status == "new":
            retention_note = "Mới mở · chưa có kỳ gốc"
        elif status == "reopened":
            retention_note = "Xuất hiện lại · chưa có kỳ gốc"
        elif previous_balance <= 0:
            retention_note = "Không có số dư kỳ gốc"
        elif not has_average_balance:
            retention_note = "Chưa có số dư bình quân PF14 để tính"
        elif status == "closed":
            retention_note = "Duy trì bình quân trước tất toán"
        else:
            retention_note = "So với số dư cuối kỳ trước"
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
            "is_negative_balance": bool(end_balance < 0),
            "account_status": status,
            "lifecycle_status": lifecycle_status,
            "opened_in_period": opened_in_period,
            "source_account_status": row.account_status,
            # Tỷ lệ duy trì chỉ so với số dư kỳ gốc và không vượt 100%.
            # Phần tăng thêm đã được phản ánh riêng trong cột biến động số dư.
            "retention_rate": retention_rate,
            "retention_note": retention_note,
            "low_average_high_end": False,
            "high_average_end_drop": False,
        })
    dp_items.sort(key=lambda item: (
        0 if item["is_negative_balance"] else 1,
        status_order.get(item["account_status"], 9),
        item["branch_code"] or "",
        item["account_number"] or "",
    ))
    primary_accounts = []
    for current_dp in dp_current_rows:
        if dp_is_term(current_dp) or not current_dp.so_tai_khoan:
            continue
        if dp_is_closed(current_dp):
            continue
        if dp_is_inactive(current_dp):
            continue
        key = (current_dp.branch_code, current_dp.so_tai_khoan)
        pf = pf_by_account.get(key)
        if not pf:
            product_matches = pf_by_product.get((current_dp.branch_code, str(current_dp.dp_type_code or "").strip()), [])
            pf = product_matches[0] if len(product_matches) == 1 else None
        rate = exchange_rate(period_key, current_dp.ccy)
        end_balance = (current_dp.current_balance or 0) * rate
        average_balance = (pf.averagebalance or 0) * rate if pf else Decimal(0)
        primary_accounts.append({
            "branch_code": current_dp.branch_code,
            "account_number": current_dp.so_tai_khoan,
            "deposit_type": current_dp.dp_type_name,
            "currency_code": current_dp.ccy or "VND",
            "end_balance": serialize_value(end_balance),
            "average_balance": serialize_value(average_balance),
            "is_negative_balance": bool(end_balance < 0),
            "account_status": (
                "new"
                if key not in dp_previous_map and dp_opened_in_period(current_dp)
                else "reopened"
                if key not in dp_previous_map
                else "active"
            ),
            "opening_date": serialize_value(current_dp.opening_date),
            "is_primary_branch": current_dp.branch_code == profile.primary_branch_code,
        })
    primary_accounts.sort(key=lambda item: (
        0 if item["is_negative_balance"] else 1,
        0 if item["is_primary_branch"] else 1,
        -float(item["average_balance"] or 0),
        -float(item["end_balance"] or 0),
        item["account_number"] or "",
    ))
    # Trả về toàn bộ TKTT đã xếp hạng. Giao diện mặc định chỉ trình bày ba
    # tài khoản chính, người dùng có thể chủ động mở phần còn lại.
    primary_accounts = [
        {
            **item,
            "display_rank": index,
            "dictionary_code": f"TKTT{index}" if index <= 3 else None,
        }
        for index, item in enumerate(primary_accounts, start=1)
    ]
    items = dp_items
    total = len(items)
    categories = []
    for key, wants_term in (("demand", False), ("term", True)):
        rows_for_category = [row for row in dp_current_rows if dp_is_term(row) == wants_term]
        positive_rows_for_category = [row for row in rows_for_category if Decimal(row.current_balance or 0) >= 0]
        categories.append({
            "key": key,
            "account_count": len({row.so_tai_khoan for row in rows_for_category}),
            # Số dư âm vẫn hiện đầy đủ trong danh sách. Chỉ tiêu quy mô nguồn
            # vốn không cộng số âm; loại tài khoản vẫn lấy đúng từ DP01.
            "end_balance": serialize_value(sum(((row.current_balance or 0) * exchange_rate(period_key, row.ccy) for row in positive_rows_for_category), Decimal(0))),
            "average_balance": serialize_value(sum((Decimal(str(item.get("average_balance") or 0)) for item in dp_items if not item["is_negative_balance"] and dp_is_term(dp_current_map.get((item["branch_code"], item["account_number"])) or dp_previous_map.get((item["branch_code"], item["account_number"]))) == wants_term), Decimal(0))),
            "branch_count": len({row.branch_code for row in rows_for_category}),
        })
    analytics["active"] = sum(1 for item in dp_items if item["account_status"] == "active")
    analytics["inactive"] = sum(1 for item in dp_items if item["account_status"] == "inactive")
    analytics["new"] = sum(1 for item in dp_items if item["account_status"] == "new")
    analytics["reopened"] = sum(1 for item in dp_items if item["account_status"] == "reopened")
    analytics["closed"] = sum(1 for item in dp_items if item["account_status"] == "closed")
    retention_items = [
        item for item in dp_items
        if float(item.get("previous_balance") or 0) > 0
        and item.get("average_balance") is not None
    ]
    retention_average_balance = sum(
        min(
            max(float(item.get("average_balance") or 0), 0),
            float(item.get("previous_balance") or 0),
        )
        for item in retention_items
    )
    retention_previous_balance = sum(
        max(float(item.get("previous_balance") or 0), 0) for item in retention_items
    )
    analytics["retention_average_balance"] = retention_average_balance
    analytics["retention_previous_balance"] = retention_previous_balance
    analytics["retention_rate"] = (
        round(retention_average_balance * 100 / retention_previous_balance, 2)
        if retention_previous_balance > 0 else None
    )
    analytics["retention_closed_count"] = sum(
        1 for item in dp_items
        if item["account_status"] == "closed"
        and float(item.get("previous_balance") or 0) > 0
        and item.get("average_balance") is not None
    )
    analytics["retention_eligible_count"] = len(retention_items)
    analytics["retention_missing_average_count"] = sum(
        1 for item in dp_items
        if float(item.get("previous_balance") or 0) > 0
        and item.get("average_balance") is None
    )
    start = (page - 1) * page_size
    items = items[start:start + page_size]
    account_numbers_masked = not _has_permission(user, "customer:sensitive:account")
    if account_numbers_masked:
        for item in [*items, *primary_accounts]:
            item["account_number"] = _mask_identifier(item.get("account_number"))
    else:
        record_security_event(
            request,
            user,
            "sensitive_account_view",
            "customer",
            ma_kh,
            "Xem đầy đủ số tài khoản/sổ tiết kiệm của khách hàng",
            {"period_key": period_key, "branch_code": branch_code, "account_count": total},
        )

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
        "primary_accounts": primary_accounts,
        "account_numbers_masked": account_numbers_masked,
    }


@router.get("/deposit-account-history", dependencies=[Depends(require_all_permissions("customer:deposit:view", "customer:sensitive:account"))])
def get_customer_deposit_account_history(
    request: Request,
    period_key: str = Query(...),
    ma_kh: str = Query(...),
    account_number: str = Query(..., min_length=1, max_length=50),
    branch_code: str = Query(..., min_length=1, max_length=10),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Vòng đời một tài khoản DP01, bổ sung số dư bình quân từ PF14 khi ghép được.

    GL02 không có số tài khoản khách hàng nên giao dịch gần nhất chỉ được trả ở
    mức khách hàng + chi nhánh, tuyệt đối không khẳng định thuộc riêng tài khoản.
    """
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, period_key, branch_code)
    record_security_event(
        request,
        user,
        "sensitive_account_history_view",
        "customer_account",
        account_number,
        "Xem vòng đời tài khoản tiền gửi",
        {"period_key": period_key, "customer_code": ma_kh, "branch_code": branch_code},
    )
    account_number = account_number.strip()
    if not account_number:
        raise HTTPException(status_code=400, detail="Số tài khoản không hợp lệ")

    source_rows = (
        db.query(DP01DepositAccount)
        .filter(
            DP01DepositAccount.ma_kh == ma_kh,
            DP01DepositAccount.branch_code == branch_code,
            func.trim(DP01DepositAccount.so_tai_khoan) == account_number,
            DP01DepositAccount.period_key <= period_key,
        )
        .order_by(DP01DepositAccount.period_key, DP01DepositAccount.id)
        .all()
    )
    if not source_rows:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy lịch sử tài khoản DP01 trong phạm vi đang xem",
        )

    # Nếu một kỳ được nhập thay thế nhiều lần, bản ghi có id lớn hơn là bản ghi
    # đang được dùng để trình bày; không cộng trùng các lần nhập.
    dp_by_period = {row.period_key: row for row in source_rows}
    periods = sorted(dp_by_period)
    pf_rows = (
        db.query(PF14AccountBalance)
        .filter(
            PF14AccountBalance.period_key.in_(periods),
            PF14AccountBalance.custseq == ma_kh,
            PF14AccountBalance.trbrcd == branch_code,
        )
        .order_by(PF14AccountBalance.period_key, PF14AccountBalance.id)
        .all()
    )
    pf_exact = {
        row.period_key: row
        for row in pf_rows
        if str(row.accountno or "").strip() == account_number
    }
    pf_by_product: dict[tuple[str, str], list[PF14AccountBalance]] = {}
    for row in pf_rows:
        product = str(row.productcode or "").strip()
        if product:
            pf_by_product.setdefault((row.period_key, product), []).append(row)

    rate_rows = (
        db.query(CustomerPeriodExchangeRate)
        .filter(CustomerPeriodExchangeRate.period_key.in_(periods))
        .all()
    )
    rates = {(row.period_key, str(row.ccy or "").strip().upper()): row.exchange_rate for row in rate_rows}

    def account_rate(row: DP01DepositAccount) -> Decimal:
        ccy = str(row.ccy or "VND").strip().upper() or "VND"
        if ccy == "VND":
            return Decimal(1)
        return Decimal(rates.get((row.period_key, ccy)) or row.tygia or 1)

    history = []
    previous_balance = None
    previous_period = None
    previous_period_date = None
    for index, source in enumerate(dp_by_period[value] for value in periods):
        rate = account_rate(source)
        end_original = Decimal(source.current_balance or 0)
        end_balance = end_original * rate
        product_matches = pf_by_product.get((source.period_key, str(source.dp_type_code or "").strip()), [])
        pf = pf_exact.get(source.period_key) or (product_matches[0] if len(product_matches) == 1 else None)
        average_original = Decimal(pf.averagebalance or 0) if pf else None
        average_balance = average_original * rate if average_original is not None else None
        source_status = str(source.account_status or "").strip().lower()
        if source.close_date and source.close_date <= source.period_date:
            status = "closed"
        elif source_status == "inactive":
            status = "inactive"
        elif index == 0:
            status = "new"
        elif previous_period_date and (source.period_date - previous_period_date).days > 45:
            status = "reopened"
        else:
            status = "active"
        history.append({
            "period_key": source.period_key,
            "period_date": serialize_value(source.period_date),
            "branch_code": source.branch_code,
            "account_number": source.so_tai_khoan,
            "product_code": source.dp_type_code,
            "deposit_type": source.dp_type_name,
            "currency_code": source.ccy or "VND",
            "exchange_rate": serialize_value(rate),
            "end_balance": serialize_value(end_balance),
            "end_balance_original": serialize_value(end_original),
            "average_balance": serialize_value(average_balance),
            "average_balance_original": serialize_value(average_original),
            "balance_change": serialize_value(end_balance - previous_balance) if previous_balance is not None else None,
            "opening_date": serialize_value(source.opening_date),
            "maturity_date": serialize_value(source.maturity_date),
            "close_date": serialize_value(source.close_date),
            "month_term": source.month_term,
            "status": status,
            "source_status": source.account_status,
            "average_source": "PF14_ACCOUNT" if source.period_key in pf_exact else ("PF14_PRODUCT" if pf else None),
        })
        previous_balance = end_balance
        previous_period = source.period_key
        previous_period_date = source.period_date

    latest_gl02 = (
        db.query(GL02LedgerTransaction)
        .filter(
            GL02LedgerTransaction.period_key <= period_key,
            GL02LedgerTransaction.customer_code == ma_kh,
            GL02LedgerTransaction.customer_branch_code == branch_code,
            GL02LedgerTransaction.account_code == "421101",
            func.coalesce(GL02LedgerTransaction.transaction_type, "Normal") == "Normal",
        )
        .order_by(
            desc(func.coalesce(
                GL02LedgerTransaction.created_datetime,
                func.cast(GL02LedgerTransaction.transaction_date, SQLDateTime),
            )),
            desc(GL02LedgerTransaction.id),
        )
        .first()
    )
    gl02_payload = None
    if latest_gl02:
        gl02_payload = {
            "match_level": "customer_branch",
            "scope_note": "GL02 không có số tài khoản khách hàng; đây là giao dịch TKTT gần nhất của KH tại chi nhánh, không khẳng định thuộc riêng tài khoản này.",
            "transaction_at": serialize_value(latest_gl02.created_datetime or latest_gl02.transaction_date),
            "transaction_date": serialize_value(latest_gl02.transaction_date),
            "reference": latest_gl02.reference,
            "remark": latest_gl02.remark,
            "transaction_code": latest_gl02.transaction_code,
            "debit_amount": serialize_value(latest_gl02.debit_amount),
            "credit_amount": serialize_value(latest_gl02.credit_amount),
            **describe_gl02_transaction(
                latest_gl02.remark,
                latest_gl02.debit_amount,
                latest_gl02.credit_amount,
            ),
        }
    transaction_details_masked = not _has_permission(user, "customer:sensitive:transaction")
    if gl02_payload and transaction_details_masked:
        gl02_payload.update({
            "reference": None,
            "remark": None,
            "transaction_code": None,
            "description": "Nội dung giao dịch được bảo vệ theo quyền dữ liệu nhạy cảm",
            "description_translated": False,
        })
    elif gl02_payload:
        record_security_event(
            request, user, "sensitive_transaction_view", "customer", ma_kh,
            "Xem nội dung giao dịch GL02 từ vòng đời tài khoản",
            {"period_key": period_key, "branch_code": branch_code, "account_number": account_number},
        )

    latest = history[-1]
    return {
        "period_key": period_key,
        "ma_kh": ma_kh,
        "branch_code": branch_code,
        "account_number": account_number,
        "deposit_type": latest.get("deposit_type"),
        "currency_code": latest.get("currency_code"),
        "first_seen_period": history[0]["period_key"],
        "last_seen_period": latest["period_key"],
        "period_count": len(history),
        "is_present_in_selected_period": latest["period_key"] == period_key,
        "latest_status": latest["status"],
        "history": history,
        "latest_gl02": gl02_payload,
        "transaction_details_masked": transaction_details_masked,
    }


@router.get("/customer-classification-history", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def get_customer_classification_history(
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, branch_code=branch_code)
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
    ("latest_relationship_date", "Ngày quan hệ gần nhất"),
    ("latest_relationship_type", "Loại quan hệ gần nhất"),
    ("latest_relationship_source", "Nguồn quan hệ gần nhất"),
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
    ("the_ghi_no_quoc_te", "Thẻ ghi nợ quốc tế"),
    ("the_td_quoc_te", "Thẻ TD quốc tế"),
    ("the_td_loc_viet", "Thẻ TD Lộc Việt"),
]


@router.get("/profiles/export", dependencies=[Depends(require_any_permission("customer:export"))])
def export_profiles(
    request: Request,
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Xuất Excel theo đúng bộ lọc báo cáo (tối đa EXPORT_MAX_ROWS dòng)."""
    export_task = begin_export(request, user, "Đang áp dụng bộ lọc khách hàng")
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, officer_code
    )
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
        missing_officer=missing_officer,
        unclear_primary_branch=unclear_primary_branch,
        new_in_period=new_in_period,
    )
    total = query.count()
    update_export(export_task, 7, f"Đã tìm thấy {total:,} khách hàng phù hợp")
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
    can_view_contact = _has_permission(user, "customer:sensitive:contact")

    def export_value(payload: dict, field: str):
        value = payload.get(field)
        if field == "telephone" and not can_view_contact:
            return _mask_identifier(value, visible=3)
        return value

    relationship_fields = {"latest_relationship_date", "latest_relationship_type", "latest_relationship_source"}
    model_field_names = [field for field in field_names if field not in relationship_fields]
    batch: list = []
    processed = 0
    for item in query.yield_per(1_000):
        batch.append(item)
        if len(batch) >= 1_000:
            payloads = _apply_branch_finance_to_payloads(
                db,
                period_key,
                branch_code,
                pgd_code,
                [serialize_model(row, model_field_names) for row in batch],
            )
            payloads = _enrich_latest_relationship(db, period_key, payloads, branch_code)
            for payload in payloads:
                sheet.append([export_value(payload, field) for field in field_names])
            processed += len(payloads)
            update_export(export_task, 7 + int(85 * processed / total), f"Đã ghi {processed:,}/{total:,} khách hàng")
            batch = []
    if batch:
        payloads = _apply_branch_finance_to_payloads(
            db,
            period_key,
            branch_code,
            pgd_code,
            [serialize_model(row, model_field_names) for row in batch],
        )
        payloads = _enrich_latest_relationship(db, period_key, payloads, branch_code)
        for payload in payloads:
            sheet.append([export_value(payload, field) for field in field_names])
        processed += len(payloads)
        update_export(export_task, 7 + int(85 * processed / total), f"Đã ghi {processed:,}/{total:,} khách hàng")

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    update_export(export_task, 96, "Đã tạo file; đang gửi về trình duyệt")
    record_security_event(
        request,
        user,
        "customer_export",
        "customer_export",
        period_key,
        "Xuất danh sách khách hàng C360 ra Excel",
        {
            "period_key": period_key,
            "branch_code": branch_code,
            "department_code": pgd_code,
            "officer_code": officer_code,
            "keyword": keyword,
            "row_count": total,
            "phone_unmasked": can_view_contact,
        },
    )
    filename = f"bao_cao_kh_{period_key}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(buffer.getbuffer().nbytes),
            "X-Export-Row-Count": str(total),
        },
    )


@router.get("/profile-summary", dependencies=[Depends(require_any_permission("dashboard:view", "customer:view"))])
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, officer_code
    )
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
        missing_officer=missing_officer,
        unclear_primary_branch=unclear_primary_branch,
        new_in_period=new_in_period,
    )
    if branch_code:
        # Bộ lọc nâng cao xác định tập KH; số tiền phải lấy đúng phần quan hệ tại
        # chi nhánh/PGD đang xem, không cộng tổng toàn tỉnh của khách đa chi nhánh.
        customer_ids = query.with_entities(CustomerPeriodProfile.ma_kh).distinct().subquery()
        detail_query = db.query(CustomerPeriodBranchDetail).filter(
            CustomerPeriodBranchDetail.period_key == period_key,
            CustomerPeriodBranchDetail.branch_code == branch_code.strip(),
            CustomerPeriodBranchDetail.ma_kh.in_(db.query(customer_ids.c.ma_kh)),
        )
        # Tập customer_ids đã được giới hạn theo phòng quản lý; cộng toàn bộ số
        # phát sinh của các KH đó tại chi nhánh đang xem.
        summary = detail_query.with_entities(
            func.count(func.distinct(CustomerPeriodBranchDetail.ma_kh)),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_vay), 0),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tien_gui), 0),
            func.coalesce(func.sum(CustomerPeriodBranchDetail.so_du_tgtt_binh_quan), 0),
        ).one()
    else:
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


@router.get("/profile-groups", dependencies=[Depends(require_any_permission("dashboard:view", "customer:view"))])
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, officer_code
    )
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
        missing_officer=missing_officer,
        unclear_primary_branch=unclear_primary_branch,
        new_in_period=new_in_period,
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


@router.get("/profile-history", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def get_profile_history(
    ma_kh: str = Query(...),
    branch_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code = _enforce_customer_data_scope(db, user, ma_kh, branch_code=branch_code)
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
            "ma_cb", "ten_can_bo", "officer_employee_code", "ten_pgd",
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
            "ma_cb", "ten_can_bo", "officer_employee_code", "primary_pgd_code", "primary_pgd_name",
            "du_no_ngan_han", "du_no_ngan_han_bq", "du_no_trung_dai_han",
            "du_no_trung_dai_han_bq", "du_no_thau_chi", "du_no_thau_chi_bq",
            "pf10_lds_count", "pf10_interest", "so_du_tgtt_binh_quan",
            "doanh_so_chuyen_tien_ve_tk", "phi_bao_lanh", "phi_chuyen_tien",
            "phi_nhdt", "abic_batd", "phi_kdnt", "phi_lc", "phi_ttqt", "phi_the", "phi_khac", "dprr_chung_tt", "dprr_chung_lk",
            "dprr_cuthe_tt", "dprr_cuthe_lk", "du_no_xlrr", "ds_thu_no_xlrr",
            *sorted(PROFILE_SERVICE_FIELDS),
        ]
    return enrich_profile_org_names(db, [serialize_model(item, fields) for item in rows])


@router.get("/relationship-map", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def get_customer_relationship_map(
    request: Request,
    period_key: str = Query(...), ma_kh: str = Query(...),
    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
):
    _enforce_customer_data_scope(db, user, ma_kh, period_key)
    profile = db.query(CustomerPeriodProfile).filter(
        CustomerPeriodProfile.period_key == period_key,
        CustomerPeriodProfile.ma_kh == ma_kh,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Khách hàng chưa có hồ sơ ở kỳ đã chọn")
    allowed_branches = None if user.can_view_all_branches() else set(user.allowed_branches or ([user.ma_cn] if user.ma_cn else []))
    detail_query = db.query(CustomerPeriodBranchDetail).filter(
        CustomerPeriodBranchDetail.period_key == period_key,
        CustomerPeriodBranchDetail.ma_kh == ma_kh,
    )
    if allowed_branches is not None:
        detail_query = detail_query.filter(CustomerPeriodBranchDetail.branch_code.in_(allowed_branches or ["__NONE__"]))
    if user.scope in {"pgd", "own"}:
        detail_query = detail_query.filter(CustomerPeriodBranchDetail.ma_pgd == user.ma_pgd)
    if user.scope == "own":
        detail_query = detail_query.filter(CustomerPeriodBranchDetail.officer_employee_code == user.employee_code)
    details = detail_query.order_by(CustomerPeriodBranchDetail.branch_code).all()
    # Phòng của cán bộ quản lý phải lấy từ danh mục user đang hoạt động, không
    # được dùng ma_pgd/ten_pgd của DP01 vì đó là đơn vị phát sinh tài khoản.
    # Hai khái niệm này có thể khác nhau (ví dụ cán bộ KHDN có tài khoản phát
    # sinh tại KTNQ), nên chuẩn hóa lại trước khi trả dữ liệu lên sơ đồ quan hệ.
    org_payload = enrich_profile_org_names(db, [{
        "period_key": period_key,
        "ma_kh": ma_kh,
        "primary_branch_code": profile.primary_branch_code,
        "branch_details": [{
            "branch_code": detail.branch_code,
            "ma_cb": detail.ma_cb,
            "ten_can_bo": detail.ten_can_bo,
            "officer_employee_code": detail.officer_employee_code,
            "ma_pgd": detail.ma_pgd,
            "ten_pgd": detail.ten_pgd,
        } for detail in details],
    }])[0]
    verified_details = {
        str(item.get("branch_code") or "").strip(): item
        for item in org_payload.get("branch_details") or []
    }
    branch_names = {
        str(code or "").strip(): name
        for code, name in db.query(OrgBranch.branch_code, OrgBranch.branch_name).filter(
            OrgBranch.status == "active"
        ).all()
    }
    rates = {
        str(row.ccy or "VND").strip().upper(): Decimal(str(row.exchange_rate or 1))
        for row in db.query(CustomerPeriodExchangeRate).filter(
            CustomerPeriodExchangeRate.period_key == period_key
        ).all()
    }
    account_map = {}
    for row in db.query(PF14AccountBalance).filter(
        PF14AccountBalance.period_key == period_key,
        func.trim(PF14AccountBalance.custseq) == ma_kh,
    ).all():
        branch = str(row.trbrcd or row.branch_code or "").strip()
        account = str(row.accountno or "").strip()
        if not branch or not account or (allowed_branches is not None and branch not in allowed_branches):
            continue
        ccy = str(row.ccy or "VND").strip().upper() or "VND"
        rate = rates.get(ccy, Decimal(1))
        value = Decimal(str(row.monthlyendbalance or 0)) * rate
        item = account_map.setdefault(branch, {})
        existing = item.setdefault(account, {
            "account_number": account, "type": "term" if int(row.monterm or 0) > 0 else "demand",
            "currency": ccy, "balance": Decimal(0),
        })
        existing["balance"] += value
    loan_map = {}
    for row in db.query(LN01Loan).filter(
        LN01Loan.period_key == period_key, LN01Loan.custseq == ma_kh,
    ).all():
        branch = str(row.brcd or row.branch_code or "").strip()
        lds = str(row.dsbsseq or row.apprseq or "").strip()
        if not branch or not lds or (allowed_branches is not None and branch not in allowed_branches):
            continue
        item = loan_map.setdefault(branch, {})
        existing = item.setdefault(lds, {
            "lds_number": lds, "loan_type": row.loan_type, "balance": Decimal(0),
        })
        existing["balance"] += Decimal(str(row.du_no or 0))

    branches = []
    for detail in details:
        branch = detail.branch_code
        verified_detail = verified_details.get(str(branch or "").strip(), {})
        accounts = list(account_map.get(branch, {}).values())
        loans = list(loan_map.get(branch, {}).values())
        active_services = [key for key in PROFILE_SERVICE_FIELDS if int(getattr(detail, key, 0) or 0) > 0]
        branches.append({
            "branch_code": branch,
            "branch_name": branch_names.get(str(branch or "").strip()),
            "is_primary": branch == profile.primary_branch_code,
            "primary_reason": profile.primary_location_reason if branch == profile.primary_branch_code else None,
            "officer_code": verified_detail.get("ma_cb"),
            "officer_name": verified_detail.get("ten_can_bo"),
            "department_code": verified_detail.get("officer_department_code"),
            "department_name": verified_detail.get("officer_department_name"),
            "term_deposit": serialize_value(detail.so_du_tien_gui),
            "casa_average": serialize_value(detail.so_du_tgtt_binh_quan),
            "loan_balance": serialize_value(detail.so_du_tien_vay),
            "account_count": len(accounts), "loan_count": len(loans),
            "service_count": len(active_services), "active_services": active_services,
            "accounts": [{**item, "balance": serialize_value(item["balance"])} for item in sorted(accounts, key=lambda value: abs(value["balance"]), reverse=True)[:8]],
            "loans": [{**item, "balance": serialize_value(item["balance"])} for item in sorted(loans, key=lambda value: abs(value["balance"]), reverse=True)[:8]],
        })
    can_view_accounts = _has_permission(user, "customer:sensitive:account")
    can_view_loans = _has_permission(user, "customer:sensitive:loan")
    if not can_view_accounts:
        for branch in branches:
            for item in branch["accounts"]:
                item["account_number"] = _mask_identifier(item.get("account_number"))
    if not can_view_loans:
        for branch in branches:
            for item in branch["loans"]:
                item["lds_number"] = _mask_identifier(item.get("lds_number"))
    record_security_event(
        request,
        user,
        "customer_profile_view",
        "customer",
        ma_kh,
        "Mở hồ sơ chi tiết khách hàng C360",
        {
            "period_key": period_key,
            "visible_branches": [item["branch_code"] for item in branches],
            "identity_visible": _has_permission(user, "customer:sensitive:identity"),
            "contact_visible": _has_permission(user, "customer:sensitive:contact"),
            "accounts_visible": can_view_accounts,
            "loans_visible": can_view_loans,
        },
    )
    return {
        "period_key": period_key, "ma_kh": ma_kh, "customer_name": profile.ten_kh,
        "primary_branch_code": profile.primary_branch_code,
        "primary_location_reason": profile.primary_location_reason,
        "branches": branches,
        "account_numbers_masked": not can_view_accounts,
        "loan_details_masked": not can_view_loans,
    }




@router.get("/business-matching-rules", dependencies=[Depends(require_any_permission("admin:config:view", "mapping:view"))])
def list_business_matching_rules(source_type: str | None = None, db: Session = Depends(get_db)):
    query = db.query(BusinessMatchingRule)
    if source_type:
        query = query.filter(BusinessMatchingRule.source_type == source_type.strip().upper())
    rows = query.order_by(BusinessMatchingRule.rule_code, desc(BusinessMatchingRule.effective_from)).all()
    fields = ["id", "rule_code", "rule_name", "source_type", "service_codes", "amount_equals",
              "effective_from", "effective_to", "priority", "active", "description", "updated_by", "updated_at"]
    return [serialize_model(row, fields) for row in rows]


@router.get("/configuration-catalog", dependencies=[Depends(require_any_permission("admin:config:view"))])
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
        {"code": "PHI_THE", "source": "KH02", "condition": "ACCTCD bắt đầu 711015, 711016, 711022-711028, 711051, 711052, 711059", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
        {"code": "PHI_KHAC", "source": "KH02", "condition": "ACCTCD bắt đầu 711031, 711035, 711042, 711044, 711098; loại mã đã thuộc nhóm phí khác", "formula": "SUM(CRAMT) - SUM(DRAMT)", "status": "code_config"},
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


@router.put("/business-matching-rules/{rule_id}", dependencies=[Depends(require_any_permission("admin:config:write", "mapping:write"))])
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


@router.post("/business-matching-rules", dependencies=[Depends(require_any_permission("admin:config:write", "mapping:write"))])
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


@router.delete("/business-matching-rules/{rule_id}", dependencies=[Depends(require_any_permission("admin:config:write", "mapping:write"))])
def delete_business_matching_rule(rule_id: int, db: Session = Depends(get_db)):
    row = db.query(BusinessMatchingRule).filter(BusinessMatchingRule.id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy quy tắc nghiệp vụ")
    db.delete(row); db.commit()
    return {"deleted": True, "id": rule_id}


SYSTEM_CONFIG_FIELDS = ["id", "category", "config_code", "config_name", "source_type", "config_value",
                        "description", "effective_from", "effective_to", "active", "updated_by", "updated_at"]


@router.get("/system-configuration-entries", dependencies=[Depends(require_any_permission("admin:config:view"))])
def list_system_configuration_entries(category: str | None = None, db: Session = Depends(get_db)):
    query = db.query(SystemConfigurationEntry)
    if category:
        query = query.filter(SystemConfigurationEntry.category == category.strip().upper())
    return [serialize_model(row, SYSTEM_CONFIG_FIELDS) for row in query.order_by(SystemConfigurationEntry.category, SystemConfigurationEntry.config_code).all()]


@router.post("/system-configuration-entries", dependencies=[Depends(require_any_permission("admin:config:write"))])
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


@router.put("/system-configuration-entries/{entry_id}", dependencies=[Depends(require_any_permission("admin:config:write"))])
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


@router.delete("/system-configuration-entries/{entry_id}", dependencies=[Depends(require_any_permission("admin:config:write"))])
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


@router.get("/period-comparison", dependencies=[Depends(require_any_permission("customer:profile:view"))])
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
    missing_officer: bool | None = None,
    unclear_primary_branch: bool | None = None,
    new_in_period: bool | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, officer_code
    )
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
        missing_officer=missing_officer, unclear_primary_branch=unclear_primary_branch,
        new_in_period=new_in_period,
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


@router.get("/profile-filter-options", dependencies=[Depends(require_any_permission("dashboard:view", "customer:view", "analytics:view"))])
def get_profile_filter_options(
    period_key: str = Query(...),
    branch_code: str | None = None,
    pgd_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch_code, pgd_code, officer_code = _normalize_user_data_scope(
        user, branch_code, pgd_code, None
    )
    base_query = db.query(CustomerPeriodProfile).filter(CustomerPeriodProfile.period_key == period_key)
    # Danh mục loại KH/loại vay lấy theo kỳ + chi nhánh. Không chạy lại phép
    # đối chiếu phòng ban nặng chỉ để dựng metadata; danh sách cán bộ bên dưới
    # mới là danh mục cần thu hẹp chính xác theo phòng.
    scoped_query = apply_profile_filters(
        base_query,
        period_key=period_key,
        branch_code=branch_code,
        pgd_code=pgd_code,
        officer_code=officer_code,
    )

    branch_query = (
        db.query(CustomerPeriodProfile.branch_codes)
        .filter(CustomerPeriodProfile.period_key == period_key, CustomerPeriodProfile.branch_codes.isnot(None))
    )
    if branch_code:
        branch_query = apply_profile_filters(
            branch_query,
            period_key=period_key,
            branch_code=branch_code,
            pgd_code=pgd_code,
            officer_code=officer_code,
        )
    branch_rows = branch_query.distinct().all()
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
    if branch_code:
        branches = [item for item in branches if item == branch_code]
    customer_types = [
        row[0]
        for row in scoped_query.with_entities(CustomerPeriodProfile.loai_khach_hang)
        .filter(CustomerPeriodProfile.loai_khach_hang.isnot(None))
        .distinct()
        .order_by(CustomerPeriodProfile.loai_khach_hang)
        .all()
        if row[0]
    ]

    user_query = (
        db.query(SystemUser, OrgBranch, OrgDepartment)
        .join(OrgBranch, OrgBranch.id == SystemUser.branch_id)
        .outerjoin(OrgDepartment, OrgDepartment.id == SystemUser.department_id)
        .filter(SystemUser.is_active.is_(True), OrgBranch.status == "active")
    )
    if branch_code:
        user_query = user_query.filter(OrgBranch.branch_code == branch_code.strip())
    if pgd_code:
        user_query = user_query.filter(
            OrgDepartment.department_code == pgd_code.strip(),
            OrgDepartment.status == "active",
        )

    relation_query = db.query(
        CustomerPeriodBranchDetail.ma_cb,
        CustomerPeriodBranchDetail.officer_employee_code,
    ).filter(CustomerPeriodBranchDetail.period_key == period_key)
    if branch_code:
        relation_query = relation_query.filter(CustomerPeriodBranchDetail.branch_code == branch_code.strip())
    relation_rows = relation_query.distinct().all()
    related_codes = {
        str(code).strip()
        for row in relation_rows
        for code in row
        if code and str(code).strip()
    }

    officers = []
    seen_officers = set()
    for user, branch, department in user_query.order_by(SystemUser.full_name, SystemUser.employee_code).all():
        matched_code = next((
            str(code).strip()
            for code in (user.credit_officer_code, user.employee_code)
            if code and str(code).strip() in related_codes
        ), None)
        if not matched_code or matched_code in seen_officers:
            continue
        seen_officers.add(matched_code)
        unit = department.department_name if department else "Chưa gắn phòng ban"
        officers.append({
            "value": matched_code,
            "label": f"{user.full_name} · {unit} ({matched_code})",
            "name": user.full_name,
            "code": matched_code,
            "employee_code": user.employee_code,
            "credit_officer_code": user.credit_officer_code,
            "branch_code": branch.branch_code,
            "department_code": department.department_code if department else None,
        })

    return {
        "branches": branches,
        "pgds": pgds,
        "pgd_options": pgd_options,
        "pgd_names": pgd_name_map,
        "loan_types": loan_types,
        "customer_types": customer_types,
        "officers": officers,
    }


@router.get("/branch-details", dependencies=[Depends(require_any_permission("customer:profile:view"))])
def list_branch_details(
    period_key: str = Query(...), ma_kh: str = Query(...),
    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
):
    effective_branch = _enforce_customer_data_scope(db, user, ma_kh, period_key)
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
    if effective_branch:
        rows = [item for item in rows if item.branch_code == effective_branch]
    if user.scope in {"pgd", "own"}:
        rows = [item for item in rows if item.ma_pgd == user.ma_pgd]
    if user.scope == "own":
        rows = [item for item in rows if item.officer_employee_code == user.employee_code]
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
        "the_ghi_no_quoc_te",
        "the_td_noi_dia",
        "the_td_quoc_te",
        "the_td_loc_viet",
        "bao_lanh",
        "loa_bien_dong_so_du",
        "phat_hanh_lc",
        "thuho_dien", "thuho_nuoc", "thuho_dt", "ttqt", "hkd_tk", "hkd_account_numbers", "abic_batk", "abic_bathe",
        "pos", "so_thiet_bi_pos", "pos_moi", "pos_khong_hoat_dong", "pos_ngung_hoat_dong",
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
                "is_primary_branch": bool(profile and profile.primary_branch_code == payload.get("branch_code")),
                "is_primary_location": bool(
                    profile
                    and str(profile.primary_branch_code or "").strip() == str(payload.get("branch_code") or "").strip()
                    and str(profile.primary_pgd_code or "").strip() == str(payload.get("ma_pgd") or "").strip()
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
