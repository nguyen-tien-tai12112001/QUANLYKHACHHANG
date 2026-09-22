from datetime import datetime, time, timedelta
from typing import Literal
from urllib.parse import unquote
from uuid import uuid4
from tempfile import NamedTemporaryFile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_any_permission
from app.auth.schemas import CurrentUser
from app.auth.permissions import PERMISSION_PREREQUISITES, expand_denied_permissions
from app.auth.user_mapper import effective_permission_codes, permission_code_sets
from app.models import (
    AuditLog,
    CustomerPeriodBranchDetail,
    CustomerPeriodProfile,
    OrgBranch,
    OrgDepartment,
    RoleScopePolicy,
    SystemPermission,
    SystemRole,
    SystemRolePermission,
    SystemUser,
    SystemUserPermission,
    UserSession,
)
from app.security import hash_password
from app.seed_data import norm_code, norm_text, read_excel_rows
from app.session_management import ensure_aware, reason_message, revoke_session, revoke_user_sessions, session_is_idle, utc_now


router = APIRouter(prefix="/api/admin", tags=["admin"])


class BranchPayload(BaseModel):
    branch_code: str
    branch_name: str
    branch_level: str = "LEVEL_2"
    parent_branch_id: int | None = None
    status: str = "active"


class DepartmentPayload(BaseModel):
    branch_id: int
    department_code: str
    department_name: str
    department_type: str | None = None
    parent_department_id: int | None = None
    manager_user_id: int | None = None
    status: str = "active"


class UserPayload(BaseModel):
    username: str | None = None
    full_name: str
    email: str | None = None
    phone: str | None = None
    password: str | None = None
    employee_code: str
    credit_officer_code: str | None = None
    customer_cif_code: str | None = None
    ipcas_username: str | None = None
    branch_id: int | None = None
    department_id: int | None = None
    role_id: int | None = None
    data_scope: str = "own"
    is_active: bool = True
    is_superuser: bool = False
    extra_permission_codes: list[str] = Field(default_factory=list)
    denied_permission_codes: list[str] = Field(default_factory=list)


class ResetPasswordPayload(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)


class RolePayload(BaseModel):
    role_code: str
    role_name: str
    description: str | None = None
    permission_codes: list[str] = Field(default_factory=list)
    default_scope: str | None = None
    allowed_scopes: list[str] | None = None
    scope_warning_level: str | None = None


class AccessCheckPayload(BaseModel):
    user_id: int
    permission_code: str
    branch_code: str | None = None
    department_code: str | None = None
    period_key: str | None = None
    customer_code: str | None = None


class BulkUserActionPayload(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=500)
    action: Literal[
        "grant_permissions",
        "deny_permissions",
        "remove_overrides",
        "assign_role",
        "set_scope",
        "lock_accounts",
        "unlock_accounts",
        "force_logout",
    ]
    permission_codes: list[str] = Field(default_factory=list)
    role_id: int | None = None
    data_scope: str | None = None
    clear_overrides: bool = True


VALID_DATA_SCOPES = {"province", "branch", "department", "own"}
ROLE_SCOPE_DEFAULTS = {
    "ADMIN": ("province", ["province"]),
    "HEAD_OFFICE_LEADER": ("province", ["province"]),
    "BRANCH_MANAGER": ("branch", ["branch"]),
    "DEPARTMENT_MANAGER": ("department", ["department"]),
    "USER": ("own", ["own", "department"]),
}
SCOPE_LABELS = {
    "province": "Toàn tỉnh",
    "branch": "Theo chi nhánh",
    "department": "Theo phòng ban",
    "own": "Khách hàng được phân công",
}


def role_scope_values(role: SystemRole) -> tuple[str, list[str], str]:
    fallback_default, fallback_allowed = ROLE_SCOPE_DEFAULTS.get(role.role_code, ("own", ["own"]))
    policy = role.scope_policy
    default_scope = str(policy.default_scope if policy else fallback_default).strip().lower()
    allowed_scopes = [
        str(value).strip().lower()
        for value in ((policy.allowed_scopes if policy else fallback_allowed) or [])
        if str(value).strip().lower() in VALID_DATA_SCOPES
    ]
    allowed_scopes = list(dict.fromkeys(allowed_scopes)) or [default_scope]
    if default_scope not in allowed_scopes:
        allowed_scopes.insert(0, default_scope)
    return default_scope, allowed_scopes, str(policy.warning_level if policy else "warning")


def sync_role_scope_policy(db: Session, role: SystemRole, payload: RolePayload) -> RoleScopePolicy:
    fallback_default, fallback_allowed = ROLE_SCOPE_DEFAULTS.get(role.role_code, ("own", ["own"]))
    current_default, current_allowed, current_warning = role_scope_values(role)
    default_scope = str(payload.default_scope or current_default or fallback_default).strip().lower()
    allowed_scopes = payload.allowed_scopes if payload.allowed_scopes is not None else current_allowed or fallback_allowed
    allowed_scopes = list(dict.fromkeys(str(value).strip().lower() for value in allowed_scopes if str(value).strip()))
    invalid_scopes = [value for value in allowed_scopes if value not in VALID_DATA_SCOPES]
    if invalid_scopes:
        raise HTTPException(status_code=400, detail=f"Phạm vi không hợp lệ: {', '.join(invalid_scopes)}")
    if not allowed_scopes:
        raise HTTPException(status_code=400, detail="Nhóm quyền phải cho phép ít nhất một phạm vi dữ liệu")
    if default_scope not in VALID_DATA_SCOPES:
        raise HTTPException(status_code=400, detail="Phạm vi mặc định không hợp lệ")
    if default_scope not in allowed_scopes:
        raise HTTPException(status_code=400, detail="Phạm vi mặc định phải nằm trong danh sách phạm vi được phép")
    warning_level = str(payload.scope_warning_level or current_warning or "warning").strip().lower()
    if warning_level not in {"info", "warning", "critical"}:
        raise HTTPException(status_code=400, detail="Mức cảnh báo phạm vi không hợp lệ")
    policy = role.scope_policy or RoleScopePolicy(role=role)
    policy.default_scope = default_scope
    policy.allowed_scopes = allowed_scopes
    policy.warning_level = warning_level
    db.add(policy)
    return policy

HIGH_RISK_PERMISSIONS = {
    "admin",
    "warehouse:delete",
    "cif:override",
    "processing:recover",
    "admin:user:write",
    "admin:role:write",
    "admin:config:write",
    "customer:sensitive:identity",
    "customer:sensitive:contact",
    "customer:sensitive:account",
    "customer:sensitive:transaction",
    "customer:sensitive:loan",
    "customer:sensitive:copy",
}


def clean_code(value: str | None) -> str:
    return str(value or "").strip().upper()


def validate_permission_dependencies(permission_codes: set[str]) -> None:
    missing = [
        f"{code} cần {required}"
        for code, required in PERMISSION_PREREQUISITES.items()
        if code in permission_codes and required not in permission_codes
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Cấu hình quyền chưa hợp lệ: " + "; ".join(missing),
        )


def is_superuser_actor(user: CurrentUser) -> bool:
    return "admin" in set(user.permissions or [])


def require_superuser_actor(user: CurrentUser, message: str) -> None:
    if not is_superuser_actor(user):
        raise HTTPException(status_code=403, detail=message)


def require_value(value, message: str):
    if value is None or str(value).strip() == "":
        raise HTTPException(status_code=400, detail=message)
    return value


def validate_department_payload(db: Session, payload: DepartmentPayload) -> None:
    require_value(payload.branch_id, "Vui lòng chọn chi nhánh")
    require_value(payload.department_code, "Vui lòng nhập mã phòng ban")
    require_value(payload.department_name, "Vui lòng nhập tên phòng ban")
    branch = db.query(OrgBranch).filter(OrgBranch.id == payload.branch_id).first()
    if not branch:
        raise HTTPException(status_code=400, detail="Chi nhánh không tồn tại")
    if payload.manager_user_id:
        manager = db.query(SystemUser).filter(SystemUser.id == payload.manager_user_id).first()
        if not manager:
            raise HTTPException(status_code=400, detail="Trưởng phòng không tồn tại")
        if manager.branch_id and manager.branch_id != payload.branch_id:
            raise HTTPException(status_code=400, detail="Trưởng phòng phải thuộc cùng chi nhánh")
    if payload.parent_department_id:
        parent = db.query(OrgDepartment).filter(OrgDepartment.id == payload.parent_department_id).first()
        if not parent or parent.branch_id != payload.branch_id:
            raise HTTPException(status_code=400, detail="Đơn vị cha phải thuộc cùng chi nhánh")


def validate_branch_payload(db: Session, payload: BranchPayload, branch_id: int | None = None) -> None:
    branch_code = clean_code(payload.branch_code)
    level = clean_code(payload.branch_level)
    if level not in {"HEAD_OFFICE", "LEVEL_2"}:
        raise HTTPException(status_code=400, detail="Loại đơn vị không hợp lệ")
    if branch_code == "2600" and level != "HEAD_OFFICE":
        raise HTTPException(status_code=400, detail="Đơn vị 2600 phải là Hội sở")
    if level == "HEAD_OFFICE":
        if payload.parent_branch_id:
            raise HTTPException(status_code=400, detail="Hội sở không được có đơn vị cha")
        existing = db.query(OrgBranch).filter(OrgBranch.branch_level == "HEAD_OFFICE")
        if branch_id:
            existing = existing.filter(OrgBranch.id != branch_id)
        if existing.first():
            raise HTTPException(status_code=400, detail="Hệ thống chỉ được có một Hội sở")
    else:
        parent = db.query(OrgBranch).filter(OrgBranch.id == payload.parent_branch_id).first()
        if not parent or parent.branch_level != "HEAD_OFFICE":
            raise HTTPException(status_code=400, detail="Chi nhánh loại II phải trực thuộc Hội sở")


def validate_user_payload(
    db: Session,
    payload: UserPayload,
    user_id: int | None = None,
) -> None:
    require_value(payload.employee_code, "Vui lòng nhập mã nhân viên")
    require_value(payload.full_name, "Vui lòng nhập họ tên")
    require_value(payload.branch_id, "Vui lòng chọn chi nhánh")
    require_value(payload.department_id, "Vui lòng chọn phòng ban")
    require_value(payload.role_id, "Vui lòng chọn nhóm quyền")

    department = db.query(OrgDepartment).filter(OrgDepartment.id == payload.department_id).first()
    if not department:
        raise HTTPException(status_code=400, detail="Phòng ban không tồn tại")
    if department.branch_id != payload.branch_id:
        raise HTTPException(status_code=400, detail="Phòng ban không thuộc chi nhánh đã chọn")

    role = db.query(SystemRole).filter(SystemRole.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Nhóm quyền không tồn tại")
    _, allowed_scopes, _ = role_scope_values(role)
    if payload.data_scope not in allowed_scopes:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Nhóm quyền {role.role_name} chỉ cho phép phạm vi: "
                + ", ".join(SCOPE_LABELS.get(scope, scope) for scope in allowed_scopes)
            ),
        )
    if payload.is_superuser and role.role_code != "ADMIN":
        raise HTTPException(status_code=400, detail="Chỉ vai trò Quản trị hệ thống được cấp quyền quản trị viên")
    branch = db.query(OrgBranch).filter(OrgBranch.id == payload.branch_id).first()
    if role.role_code == "HEAD_OFFICE_LEADER" and branch.branch_code != "2600":
        raise HTTPException(status_code=400, detail="Lãnh đạo Hội sở phải thuộc đơn vị 2600")
    if role.role_code == "BRANCH_MANAGER" and branch.branch_level != "LEVEL_2":
        raise HTTPException(status_code=400, detail="Lãnh đạo chi nhánh loại II phải thuộc chi nhánh loại II")

    employee_code = clean_code(payload.employee_code)
    exists_employee = db.query(SystemUser).filter(SystemUser.employee_code == employee_code)
    if user_id:
        exists_employee = exists_employee.filter(SystemUser.id != user_id)
    if exists_employee.first():
        raise HTTPException(status_code=400, detail="Mã nhân viên đã tồn tại")


    ipcas_username = clean_code(payload.ipcas_username) if payload.ipcas_username else None
    if ipcas_username:
        exists_ipcas = db.query(SystemUser).filter(SystemUser.ipcas_username == ipcas_username)
        if user_id:
            exists_ipcas = exists_ipcas.filter(SystemUser.id != user_id)
        if exists_ipcas.first():
            raise HTTPException(status_code=400, detail="User IPCAS đã tồn tại")
    customer_cif_code = clean_code(payload.customer_cif_code) if payload.customer_cif_code else None
    if customer_cif_code and (len(customer_cif_code) != 13 or not customer_cif_code.isdigit()):
        raise HTTPException(status_code=400, detail="Mã CIF của user phải gồm đúng 13 chữ số")
    if customer_cif_code:
        exists_cif = db.query(SystemUser).filter(SystemUser.customer_cif_code == customer_cif_code)
        if user_id:
            exists_cif = exists_cif.filter(SystemUser.id != user_id)
        if exists_cif.first():
            raise HTTPException(status_code=400, detail="Mã CIF này đã được gắn cho user khác")


def user_scope_configuration_issue(user: SystemUser) -> str | None:
    """Validate structural prerequisites of a selected data scope.

    Role controls available functions; data_scope independently controls which
    records are visible. A scope different from the role default is therefore
    not an error when an administrator intentionally selected it.
    """
    scope_labels = {
        "province": "Toàn tỉnh",
        "branch": "Theo chi nhánh",
        "department": "Theo phòng ban",
        "own": "Khách hàng được phân công",
    }
    scope = str(user.data_scope or "").strip().lower()
    if scope not in scope_labels:
        return f"Phạm vi dữ liệu '{user.data_scope or 'chưa cấu hình'}' không hợp lệ."
    if user.role:
        _, allowed_scopes, _ = role_scope_values(user.role)
        if scope not in allowed_scopes:
            return (
                f"Phạm vi {scope_labels[scope]} không nằm trong chính sách của nhóm "
                f"{user.role.role_name}. Phạm vi được phép: "
                + ", ".join(scope_labels.get(value, value) for value in allowed_scopes)
            )
    if scope == "province":
        return None
    if not user.branch:
        return f"Phạm vi {scope_labels[scope]} yêu cầu người dùng phải được gán chi nhánh."
    if user.branch.status != "active":
        return f"Chi nhánh {user.branch.branch_code} đang ngừng hoạt động."
    if scope in {"department", "own"}:
        if not user.department:
            return f"Phạm vi {scope_labels[scope]} yêu cầu người dùng phải được gán phòng ban/PGD."
        if user.department.branch_id != user.branch_id:
            return "Phòng ban/PGD không thuộc chi nhánh đã gán cho người dùng."
        if user.department.status != "active":
            return f"Phòng ban/PGD {user.department.department_name} đang ngừng hoạt động."
    if scope == "own" and not str(user.employee_code or "").strip():
        return "Phạm vi Khách hàng được phân công yêu cầu phải có mã nhân viên để đối chiếu cán bộ quản lý."
    return None


def _changed_fields(before_data: dict | None, after_data: dict | None) -> list[str]:
    before = before_data or {}
    after = after_data or {}
    return sorted(key for key in set(before) | set(after) if before.get(key) != after.get(key))


def log_action(
    db: Session,
    request: Request,
    action: str,
    entity_type: str,
    entity_id=None,
    description: str | None = None,
    *,
    before_data: dict | None = None,
    after_data: dict | None = None,
) -> None:
    username = request.headers.get("X-C360-User") or "system"
    actor_name = unquote(request.headers.get("X-C360-User-Name") or username)
    db.add(
        AuditLog(
            actor_username=username,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            description=description,
            before_data=before_data,
            after_data=after_data,
            changed_fields=_changed_fields(before_data, after_data),
        )
    )


def branch_audit_snapshot(branch: OrgBranch) -> dict:
    return {
        "branch_code": branch.branch_code,
        "branch_name": branch.branch_name,
        "branch_level": branch.branch_level,
        "parent_branch_id": branch.parent_branch_id,
        "status": branch.status,
    }


def department_audit_snapshot(department: OrgDepartment) -> dict:
    return {
        "branch_id": department.branch_id,
        "department_code": department.department_code,
        "department_name": department.department_name,
        "department_type": department.department_type,
        "parent_department_id": department.parent_department_id,
        "manager_user_id": department.manager_user_id,
        "status": department.status,
    }


def user_audit_snapshot(user: SystemUser) -> dict:
    snapshot = {
        "username": user.username,
        "employee_code": user.employee_code,
        "credit_officer_code": user.credit_officer_code,
        "customer_cif_code": user.customer_cif_code,
        "ipcas_username": user.ipcas_username,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "must_change_password": bool(user.must_change_password),
        **user_authorization_snapshot(user),
    }
    return snapshot


def role_audit_snapshot(role: SystemRole) -> dict:
    default_scope, allowed_scopes, warning_level = role_scope_values(role)
    return {
        "role_code": role.role_code,
        "role_name": role.role_name,
        "description": role.description,
        "permission_codes": sorted(
            item.permission.permission_code for item in role.permissions if item.permission
        ),
        "default_scope": default_scope,
        "allowed_scopes": sorted(allowed_scopes),
        "scope_warning_level": warning_level,
    }


def serialize_branch(branch: OrgBranch) -> dict:
    return {
        "id": branch.id,
        "branch_code": branch.branch_code,
        "branch_name": branch.branch_name,
        "branch_level": branch.branch_level,
        "parent_branch_id": branch.parent_branch_id,
        "parent_branch_code": branch.parent_branch.branch_code if branch.parent_branch else None,
        "parent_branch_name": branch.parent_branch.branch_name if branch.parent_branch else None,
        "status": branch.status,
        "department_count": len(branch.departments),
        "user_count": len(branch.users),
    }


def serialize_department(department: OrgDepartment) -> dict:
    return {
        "id": department.id,
        "branch_id": department.branch_id,
        "branch_code": department.branch.branch_code if department.branch else None,
        "branch_name": department.branch.branch_name if department.branch else None,
        "department_code": department.department_code,
        "department_name": department.department_name,
        "department_type": department.department_type,
        "parent_department_id": department.parent_department_id,
        "parent_department_name": department.parent_department.department_name if department.parent_department else None,
        "manager_user_id": department.manager_user_id,
        "manager_name": department.manager.full_name if department.manager else None,
        "status": department.status,
        "user_count": len(department.users),
    }


def serialize_user(user: SystemUser) -> dict:
    role_permissions = [item.permission for item in (user.role.permissions if user.role else []) if item.permission]
    role_permission_codes = {item.permission_code for item in role_permissions}
    extra_permissions = [
        item.permission for item in user.permission_grants
        if item.permission
        and str(item.effect or "allow").lower() != "deny"
        and item.permission.permission_code not in role_permission_codes
    ]
    denied_permissions = [
        item.permission for item in user.permission_grants
        if item.permission and str(item.effect or "allow").lower() == "deny"
    ]
    effective_codes = set(effective_permission_codes(user))
    permission_catalog = {item.permission_code: item for item in [*role_permissions, *extra_permissions]}
    effective_permissions = {
        code: permission_catalog[code]
        for code in effective_codes
        if code in permission_catalog
    }
    locked_until = ensure_aware(user.locked_until)
    temporarily_locked = bool(locked_until and locked_until > utc_now())
    return {
        "id": user.id,
        "username": user.username,
        "employee_code": user.employee_code,
        "credit_officer_code": user.credit_officer_code,
        "customer_cif_code": user.customer_cif_code,
        "ipcas_username": user.ipcas_username,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "branch_id": user.branch_id,
        "department_id": user.department_id,
        "role_id": user.role_id,
        "branch_code": user.branch.branch_code if user.branch else None,
        "branch_name": user.branch.branch_name if user.branch else None,
        "department_code": user.department.department_code if user.department else None,
        "department_name": user.department.department_name if user.department else None,
        "role_code": user.role.role_code if user.role else None,
        "role_name": user.role.role_name if user.role else None,
        "data_scope": user.data_scope,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "must_change_password": bool(user.must_change_password),
        "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
        "failed_login_attempts": int(user.failed_login_attempts or 0),
        "is_temporarily_locked": temporarily_locked,
        "role_permission_codes": sorted(role_permission_codes),
        "extra_permission_codes": sorted(item.permission_code for item in extra_permissions),
        "extra_permissions": [serialize_permission(item) for item in sorted(extra_permissions, key=lambda value: value.permission_code)],
        "denied_permission_codes": sorted(item.permission_code for item in denied_permissions),
        "effective_denied_permission_codes": sorted(expand_denied_permissions(item.permission_code for item in denied_permissions)),
        "denied_permissions": [serialize_permission(item) for item in sorted(denied_permissions, key=lambda value: value.permission_code)],
        "effective_permission_codes": sorted(effective_codes),
        "effective_permissions": [serialize_permission(item) for item in sorted(effective_permissions.values(), key=lambda value: value.permission_code)],
    }


def serialize_role(role: SystemRole, user_count: int | None = None) -> dict:
    permissions = [item.permission for item in role.permissions if item.permission]
    default_scope, allowed_scopes, warning_level = role_scope_values(role)
    return {
        "id": role.id,
        "role_code": role.role_code,
        "role_name": role.role_name,
        "description": role.description,
        "is_system": role.is_system,
        "user_count": int(user_count) if user_count is not None else len(role.users),
        "default_scope": default_scope,
        "allowed_scopes": allowed_scopes,
        "scope_warning_level": warning_level,
        "permission_codes": [permission.permission_code for permission in permissions],
        "permissions": [
            {
                "permission_code": permission.permission_code,
                "permission_name": permission.permission_name,
                "permission_group": permission.permission_group,
            }
            for permission in permissions
        ],
    }


def serialize_permission(item: SystemPermission) -> dict:
    return {
        "id": item.id,
        "permission_code": item.permission_code,
        "permission_name": item.permission_name,
        "permission_group": item.permission_group,
        "prerequisite_code": PERMISSION_PREREQUISITES.get(item.permission_code),
        "risk_level": "high" if item.permission_code in HIGH_RISK_PERMISSIONS else "normal",
    }


def sync_user_permission_overrides(
    db: Session,
    user: SystemUser,
    permission_codes: list[str],
    denied_permission_codes: list[str],
) -> None:
    requested_codes = {clean_code(code).lower() for code in permission_codes if clean_code(code)}
    denied_codes = {clean_code(code).lower() for code in denied_permission_codes if clean_code(code)}
    overlap = requested_codes & denied_codes
    if overlap:
        raise HTTPException(status_code=400, detail=f"Một quyền không thể vừa cho phép vừa từ chối: {', '.join(sorted(overlap))}")
    role_codes = {
        row[0] for row in db.query(SystemPermission.permission_code)
        .join(SystemRolePermission, SystemRolePermission.permission_id == SystemPermission.id)
        .filter(SystemRolePermission.role_id == user.role_id)
        .all()
    } if user.role_id else set()
    extra_codes = requested_codes - role_codes - {"admin"}
    irrelevant_denies = denied_codes - (role_codes | extra_codes)
    if irrelevant_denies:
        raise HTTPException(status_code=400, detail=f"Chỉ có thể từ chối quyền đang được cấp: {', '.join(sorted(irrelevant_denies))}")
    all_override_codes = extra_codes | denied_codes
    permissions = db.query(SystemPermission).filter(SystemPermission.permission_code.in_(all_override_codes)).all() if all_override_codes else []
    permission_map = {item.permission_code: item for item in permissions}
    found_codes = set(permission_map)
    unknown_codes = all_override_codes - found_codes
    if unknown_codes:
        raise HTTPException(status_code=400, detail=f"Quyền không tồn tại: {', '.join(sorted(unknown_codes))}")
    validate_permission_dependencies(role_codes | extra_codes)
    db.query(SystemUserPermission).filter(SystemUserPermission.user_id == user.id).delete(synchronize_session=False)
    for code in sorted(extra_codes):
        db.add(SystemUserPermission(user_id=user.id, permission_id=permission_map[code].id, effect="allow"))
    for code in sorted(denied_codes):
        db.add(SystemUserPermission(user_id=user.id, permission_id=permission_map[code].id, effect="deny"))


def permission_codes_with_prerequisites(permission_codes: set[str]) -> set[str]:
    expanded = set(permission_codes)
    pending = list(permission_codes)
    while pending:
        code = pending.pop()
        prerequisite = PERMISSION_PREREQUISITES.get(code)
        if prerequisite and prerequisite not in expanded:
            expanded.add(prerequisite)
            pending.append(prerequisite)
    return expanded


def validate_bulk_scope(user: SystemUser, role: SystemRole | None, data_scope: str | None) -> str | None:
    scope = str(data_scope or "").strip().lower()
    if scope not in VALID_DATA_SCOPES:
        return "Phạm vi dữ liệu không hợp lệ"
    if not role:
        return "Người dùng chưa có nhóm quyền"
    _, allowed_scopes, _ = role_scope_values(role)
    if scope not in allowed_scopes:
        labels = ", ".join(SCOPE_LABELS.get(item, item) for item in allowed_scopes)
        return f"Nhóm {role.role_name} chỉ cho phép phạm vi: {labels}"
    if scope != "province" and not user.branch:
        return "Phạm vi đã chọn yêu cầu người dùng có chi nhánh"
    if scope in {"department", "own"}:
        if not user.department:
            return "Phạm vi đã chọn yêu cầu người dùng có phòng ban/PGD"
        if user.department.branch_id != user.branch_id:
            return "Phòng ban/PGD không thuộc chi nhánh của người dùng"
    if scope == "own" and not str(user.employee_code or "").strip():
        return "Phạm vi khách hàng được phân công yêu cầu mã nhân viên"
    return None


def bulk_action_preview(
    db: Session,
    payload: BulkUserActionPayload,
    current_user: CurrentUser,
) -> dict:
    requested_ids = list(dict.fromkeys(payload.user_ids))
    users = db.query(SystemUser).filter(SystemUser.id.in_(requested_ids)).all()
    users_by_id = {item.id: item for item in users}
    missing_ids = [item for item in requested_ids if item not in users_by_id]
    requested_codes = {
        str(code or "").strip().lower()
        for code in payload.permission_codes
        if str(code or "").strip()
    }
    permission_rows = (
        db.query(SystemPermission)
        .filter(SystemPermission.permission_code.in_(requested_codes))
        .all()
        if requested_codes else []
    )
    known_codes = {item.permission_code for item in permission_rows}
    unknown_codes = sorted(requested_codes - known_codes)
    target_role = db.query(SystemRole).filter(SystemRole.id == payload.role_id).first() if payload.role_id else None
    rows = []
    action_requires_permissions = payload.action in {"grant_permissions", "deny_permissions"}
    global_errors = []
    if missing_ids:
        global_errors.append(f"Không tìm thấy người dùng ID: {', '.join(map(str, missing_ids))}")
    if action_requires_permissions and not requested_codes:
        global_errors.append("Chưa chọn quyền cần áp dụng")
    if unknown_codes:
        global_errors.append(f"Quyền không tồn tại: {', '.join(unknown_codes)}")
    if "admin" in requested_codes:
        global_errors.append("Không cấp hoặc từ chối quyền admin trực tiếp; hãy cấu hình riêng tài khoản quản trị")
    if payload.action == "assign_role" and not target_role:
        global_errors.append("Nhóm quyền được chọn không tồn tại")
    if payload.action == "set_scope" and str(payload.data_scope or "").strip().lower() not in VALID_DATA_SCOPES:
        global_errors.append("Phạm vi dữ liệu được chọn không hợp lệ")
    high_risk_requested = bool(requested_codes.intersection(HIGH_RISK_PERMISSIONS))
    if high_risk_requested and not is_superuser_actor(current_user):
        global_errors.append("Chỉ siêu quản trị viên được phân quyền rủi ro cao")
    if target_role and target_role.role_code == "ADMIN":
        global_errors.append("Không gán nhóm Quản trị hệ thống bằng thao tác hàng loạt; hãy cập nhật riêng từng tài khoản")

    for user_id in requested_ids:
        user = users_by_id.get(user_id)
        if not user:
            continue
        role_codes, extra_codes, denied_codes, _ = permission_code_sets(user)
        proposed_role = target_role if payload.action == "assign_role" else user.role
        proposed_scope = user.data_scope
        proposed_extra = set(extra_codes)
        proposed_denied = set(denied_codes)
        errors = []
        warnings = []
        changes = []
        if str(user.id) == str(current_user.id):
            errors.append("Không thể thao tác hàng loạt trên chính tài khoản đang đăng nhập")
        if user.is_superuser or (user.role and user.role.role_code == "ADMIN"):
            errors.append("Tài khoản siêu quản trị phải được cập nhật riêng, không qua thao tác hàng loạt")

        if payload.action == "grant_permissions":
            expanded = permission_codes_with_prerequisites(requested_codes)
            auto_added = expanded - requested_codes
            if auto_added:
                warnings.append("Tự bổ sung quyền nền: " + ", ".join(sorted(auto_added)))
            proposed_extra |= expanded - role_codes
            proposed_denied -= expanded
            changes.append(f"Cấp thêm {len(expanded)} quyền")
        elif payload.action == "deny_permissions":
            unavailable = requested_codes - (role_codes | extra_codes)
            if unavailable:
                errors.append("Không đang được cấp các quyền: " + ", ".join(sorted(unavailable)))
            proposed_extra -= requested_codes
            proposed_denied |= requested_codes & role_codes
            changes.append(f"Từ chối {len(requested_codes)} quyền")
        elif payload.action == "remove_overrides":
            if requested_codes:
                proposed_extra -= requested_codes
                proposed_denied -= requested_codes
                changes.append(f"Gỡ ngoại lệ của {len(requested_codes)} quyền")
            else:
                proposed_extra.clear()
                proposed_denied.clear()
                changes.append("Gỡ toàn bộ quyền cấp thêm và quyền từ chối")
        elif payload.action == "assign_role":
            proposed_scope = role_scope_values(target_role)[0] if target_role else user.data_scope
            if payload.clear_overrides:
                proposed_extra.clear()
                proposed_denied.clear()
            elif target_role:
                next_role_codes = {
                    item.permission.permission_code for item in target_role.permissions if item.permission
                }
                proposed_extra -= next_role_codes
                proposed_denied &= next_role_codes
            changes.append(f"Gán nhóm {target_role.role_name if target_role else 'không xác định'}")
            changes.append(f"Đưa phạm vi về {SCOPE_LABELS.get(proposed_scope, proposed_scope)}")
            if target_role and target_role.role_code == "HEAD_OFFICE_LEADER" and (not user.branch or user.branch.branch_code != "2600"):
                errors.append("Lãnh đạo Hội sở phải thuộc chi nhánh 2600")
            if target_role and target_role.role_code == "BRANCH_MANAGER" and (not user.branch or user.branch.branch_level != "LEVEL_2"):
                errors.append("Lãnh đạo chi nhánh phải thuộc chi nhánh loại II")
        elif payload.action == "set_scope":
            proposed_scope = str(payload.data_scope or "").strip().lower()
            changes.append(f"Đổi phạm vi sang {SCOPE_LABELS.get(proposed_scope, proposed_scope)}")
        elif payload.action == "lock_accounts":
            if user.is_superuser:
                errors.append("Không khóa tài khoản siêu quản trị bằng thao tác hàng loạt")
            changes.append("Khóa tài khoản và kết thúc các phiên đang hoạt động")
        elif payload.action == "unlock_accounts":
            if user.is_superuser:
                errors.append("Không mở khóa tài khoản siêu quản trị bằng thao tác hàng loạt")
            changes.append("Mở khóa tài khoản")
        elif payload.action == "force_logout":
            changes.append("Kết thúc toàn bộ phiên đăng nhập")

        if payload.action in {"assign_role", "set_scope"}:
            scope_error = validate_bulk_scope(user, proposed_role, proposed_scope)
            if scope_error:
                errors.append(scope_error)
        effective_before = (role_codes | extra_codes) - expand_denied_permissions(denied_codes)
        proposed_role_codes = {
            grant.permission.permission_code
            for grant in (proposed_role.permissions if proposed_role else [])
            if grant.permission
        }
        effective_after = (proposed_role_codes | proposed_extra) - expand_denied_permissions(proposed_denied)
        rows.append({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "employee_code": user.employee_code,
            "branch_code": user.branch.branch_code if user.branch else None,
            "department_name": user.department.department_name if user.department else None,
            "role_code": user.role.role_code if user.role else None,
            "proposed_role_code": proposed_role.role_code if proposed_role else None,
            "current_scope": user.data_scope,
            "proposed_scope": proposed_scope,
            "current_permission_count": len(effective_before),
            "proposed_permission_count": len(effective_after),
            "changes": changes,
            "warnings": warnings,
            "errors": errors,
            "valid": not errors,
        })
    invalid_count = sum(not item["valid"] for item in rows)
    return {
        "action": payload.action,
        "requested_count": len(requested_ids),
        "valid_count": len(rows) - invalid_count,
        "invalid_count": invalid_count + len(missing_ids),
        "global_errors": global_errors,
        "can_apply": not global_errors and invalid_count == 0 and bool(rows),
        "items": rows,
    }


def user_authorization_snapshot(user: SystemUser) -> dict:
    return {
        "role_id": user.role_id,
        "branch_id": user.branch_id,
        "department_id": user.department_id,
        "data_scope": user.data_scope,
        "is_active": bool(user.is_active),
        "is_superuser": bool(user.is_superuser),
        "extra_permissions": sorted(
            item.permission.permission_code
            for item in user.permission_grants
            if item.permission and str(item.effect or "allow").lower() != "deny"
        ),
        "denied_permissions": sorted(
            item.permission.permission_code
            for item in user.permission_grants
            if item.permission and str(item.effect or "allow").lower() == "deny"
        ),
    }


def authorization_change_description(before: dict, after: dict) -> str:
    labels = {
        "role_id": "nhóm quyền",
        "branch_id": "chi nhánh",
        "department_id": "phòng ban",
        "data_scope": "phạm vi dữ liệu",
        "is_active": "trạng thái",
        "is_superuser": "quản trị viên",
        "extra_permissions": "quyền cấp thêm",
        "denied_permissions": "quyền từ chối",
    }
    changes = [
        f"{labels[key]}: {before.get(key)} → {after.get(key)}"
        for key in labels
        if before.get(key) != after.get(key)
    ]
    return "; ".join(changes)


@router.get("/overview", dependencies=[Depends(require_any_permission("admin:branch:view", "admin:department:view", "admin:user:view", "admin:role:view"))])
def overview(db: Session = Depends(get_db)):
    return {
        "branch_count": db.query(OrgBranch).count(),
        "department_count": db.query(OrgDepartment).count(),
        "user_count": db.query(SystemUser).count(),
        "role_count": db.query(SystemRole).count(),
        "direct_permission_grant_count": db.query(SystemUserPermission).count(),
        "direct_permission_allow_count": db.query(SystemUserPermission).filter(SystemUserPermission.effect == "allow").count(),
        "direct_permission_deny_count": db.query(SystemUserPermission).filter(SystemUserPermission.effect == "deny").count(),
        "warning_count": db.query(SystemUser).filter(
            or_(SystemUser.role_id.is_(None), SystemUser.department_id.is_(None))
        ).count(),
    }


@router.get("/branches", dependencies=[Depends(require_any_permission("admin:branch:view", "dashboard:view"))])
def list_branches(keyword: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(OrgBranch)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(or_(OrgBranch.branch_code.ilike(like), OrgBranch.branch_name.ilike(like)))
    if status:
        query = query.filter(OrgBranch.status == status)
    return [serialize_branch(item) for item in query.order_by(OrgBranch.branch_code).all()]


@router.post("/branches", dependencies=[Depends(require_any_permission("admin:branch:write"))])
def create_branch(payload: BranchPayload, request: Request, db: Session = Depends(get_db)):
    validate_branch_payload(db, payload)
    branch = OrgBranch(
        branch_code=clean_code(payload.branch_code),
        branch_name=payload.branch_name.strip(),
        branch_level=clean_code(payload.branch_level),
        parent_branch_id=payload.parent_branch_id,
        status=payload.status,
    )
    db.add(branch)
    try:
        db.flush()
        log_action(
            db, request, "create", "branch", branch.id, f"Thêm chi nhánh {branch.branch_code}",
            after_data=branch_audit_snapshot(branch),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã chi nhánh đã tồn tại") from exc
    db.refresh(branch)
    return serialize_branch(branch)


@router.put("/branches/{branch_id}", dependencies=[Depends(require_any_permission("admin:branch:write"))])
def update_branch(branch_id: int, payload: BranchPayload, request: Request, db: Session = Depends(get_db)):
    branch = db.query(OrgBranch).filter(OrgBranch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Không tìm thấy chi nhánh")
    before_data = branch_audit_snapshot(branch)
    validate_branch_payload(db, payload, branch_id)
    branch.branch_code = clean_code(payload.branch_code)
    branch.branch_name = payload.branch_name.strip()
    branch.branch_level = clean_code(payload.branch_level)
    branch.parent_branch_id = payload.parent_branch_id
    branch.status = payload.status
    try:
        log_action(
            db, request, "update", "branch", branch.id, f"Cập nhật chi nhánh {branch.branch_code}",
            before_data=before_data, after_data=branch_audit_snapshot(branch),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã chi nhánh đã tồn tại") from exc
    db.refresh(branch)
    return serialize_branch(branch)


@router.delete("/branches/{branch_id}", dependencies=[Depends(require_any_permission("admin:branch:write"))])
def delete_branch(branch_id: int, request: Request, db: Session = Depends(get_db)):
    branch = db.query(OrgBranch).filter(OrgBranch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Không tìm thấy chi nhánh")
    if branch.departments or branch.users or branch.child_branches:
        raise HTTPException(status_code=400, detail="Đơn vị còn chi nhánh con, phòng ban hoặc người dùng, không thể xóa")
    before_data = branch_audit_snapshot(branch)
    db.delete(branch)
    log_action(
        db, request, "delete", "branch", branch_id, f"Xóa chi nhánh {branch.branch_code}",
        before_data=before_data,
    )
    db.commit()
    return {"status": "deleted", "id": branch_id}


@router.get("/departments", dependencies=[Depends(require_any_permission("admin:department:view", "dashboard:view"))])
def list_departments(
    keyword: str | None = None,
    branch_id: int | None = Query(default=None),
    department_type: str | None = None,
    manager_user_id: int | None = Query(default=None),
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(OrgDepartment).join(OrgBranch)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(or_(OrgDepartment.department_code.ilike(like), OrgDepartment.department_name.ilike(like)))
    if branch_id:
        query = query.filter(OrgDepartment.branch_id == branch_id)
    if department_type:
        query = query.filter(OrgDepartment.department_type == department_type)
    if manager_user_id:
        query = query.filter(OrgDepartment.manager_user_id == manager_user_id)
    if status:
        query = query.filter(OrgDepartment.status == status)
    rows = query.order_by(OrgBranch.branch_code, OrgDepartment.department_code).all()
    return [serialize_department(item) for item in rows]


@router.post("/departments", dependencies=[Depends(require_any_permission("admin:department:write"))])
def create_department(payload: DepartmentPayload, request: Request, db: Session = Depends(get_db)):
    validate_department_payload(db, payload)
    department = OrgDepartment(
        branch_id=payload.branch_id,
        department_code=clean_code(payload.department_code),
        department_name=payload.department_name.strip(),
        department_type=clean_code(payload.department_type) or None,
        parent_department_id=payload.parent_department_id,
        manager_user_id=payload.manager_user_id,
        status=payload.status,
    )
    db.add(department)
    try:
        db.flush()
        log_action(
            db, request, "create", "department", department.id, f"Thêm phòng ban {department.department_code}",
            after_data=department_audit_snapshot(department),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã phòng ban đã tồn tại trong chi nhánh") from exc
    db.refresh(department)
    return serialize_department(department)


@router.put("/departments/{department_id}", dependencies=[Depends(require_any_permission("admin:department:write"))])
def update_department(department_id: int, payload: DepartmentPayload, request: Request, db: Session = Depends(get_db)):
    department = db.query(OrgDepartment).filter(OrgDepartment.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    before_data = department_audit_snapshot(department)
    validate_department_payload(db, payload)
    department.branch_id = payload.branch_id
    department.department_code = clean_code(payload.department_code)
    department.department_name = payload.department_name.strip()
    department.department_type = clean_code(payload.department_type) or None
    department.parent_department_id = payload.parent_department_id
    department.manager_user_id = payload.manager_user_id
    department.status = payload.status
    try:
        log_action(
            db, request, "update", "department", department.id, f"Cập nhật phòng ban {department.department_code}",
            before_data=before_data, after_data=department_audit_snapshot(department),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã phòng ban đã tồn tại trong chi nhánh") from exc
    db.refresh(department)
    return serialize_department(department)


@router.delete("/departments/{department_id}", dependencies=[Depends(require_any_permission("admin:department:write"))])
def delete_department(department_id: int, request: Request, db: Session = Depends(get_db)):
    department = db.query(OrgDepartment).filter(OrgDepartment.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    before_data = department_audit_snapshot(department)
    if department.users or department.child_departments:
        department.status = "inactive"
        log_action(
            db, request, "deactivate", "department", department_id, f"Ngừng hoạt động phòng ban {department.department_code}",
            before_data=before_data, after_data=department_audit_snapshot(department),
        )
        db.commit()
        return {"status": "inactive", "id": department_id, "message": "Phòng ban còn đơn vị con hoặc người dùng nên đã chuyển sang ngừng hoạt động"}
    db.delete(department)
    log_action(
        db, request, "delete", "department", department_id, f"Xóa phòng ban {department.department_code}",
        before_data=before_data,
    )
    db.commit()
    return {"status": "deleted", "id": department_id}


@router.get("/users", dependencies=[Depends(require_any_permission("admin:user:view"))])
def list_users(
    keyword: str | None = None,
    branch_id: int | None = None,
    department_id: int | None = None,
    role_id: int | None = None,
    data_scope: str | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(SystemUser)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                SystemUser.username.ilike(like),
                SystemUser.full_name.ilike(like),
                SystemUser.employee_code.ilike(like),
                SystemUser.ipcas_username.ilike(like),
                SystemUser.email.ilike(like),
                SystemUser.phone.ilike(like),
            )
        )
    if branch_id:
        query = query.filter(SystemUser.branch_id == branch_id)
    if department_id:
        query = query.filter(SystemUser.department_id == department_id)
    if role_id:
        query = query.filter(SystemUser.role_id == role_id)
    if data_scope:
        query = query.filter(SystemUser.data_scope == data_scope)
    if is_active is not None:
        query = query.filter(SystemUser.is_active == is_active)
    return [serialize_user(item) for item in query.order_by(SystemUser.full_name).all()]


@router.post("/users", dependencies=[Depends(require_any_permission("admin:user:write"))])
def create_user(
    payload: UserPayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_user_payload(db, payload)
    target_role = db.query(SystemRole).filter(SystemRole.id == payload.role_id).first()
    requested_extra_codes = {str(code or "").strip().lower() for code in payload.extra_permission_codes}
    requested_denied_codes = {str(code or "").strip().lower() for code in payload.denied_permission_codes}
    if (
        payload.is_superuser
        or (target_role and target_role.role_code == "ADMIN")
        or (requested_extra_codes | requested_denied_codes).intersection(HIGH_RISK_PERMISSIONS)
    ):
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được tạo tài khoản quản trị hệ thống")
    employee_code = clean_code(payload.employee_code)
    if not payload.password:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mật khẩu tạm thời cho tài khoản mới")
    temporary_password = payload.password
    user = SystemUser(
        username=(payload.username or employee_code).strip().lower(),
        password_hash=hash_password(temporary_password),
        employee_code=employee_code,
        credit_officer_code=clean_code(payload.credit_officer_code) or None,
        customer_cif_code=clean_code(payload.customer_cif_code) or None,
        ipcas_username=clean_code(payload.ipcas_username).upper() or None,
        full_name=payload.full_name.strip(),
        email=str(payload.email or "").strip().lower() or None,
        phone=str(payload.phone or "").strip() or None,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        role_id=payload.role_id,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
        data_scope=payload.data_scope,
        must_change_password=True,
    )
    db.add(user)
    try:
        db.flush()
        sync_user_permission_overrides(db, user, payload.extra_permission_codes, payload.denied_permission_codes)
        db.flush()
        db.expire(user, ["permission_grants"])
        log_action(
            db, request, "create", "user", user.id, f"Thêm người dùng {user.username}",
            after_data=user_audit_snapshot(user),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Tên đăng nhập hoặc mã nhân viên đã tồn tại") from exc
    db.refresh(user)
    return serialize_user(user)


@router.post("/users/bulk-action/preview", dependencies=[Depends(require_any_permission("admin:user:write"))])
def preview_bulk_user_action(
    payload: BulkUserActionPayload,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bulk_action_preview(db, payload, current_user)


@router.post("/users/bulk-action", dependencies=[Depends(require_any_permission("admin:user:write"))])
def apply_bulk_user_action(
    payload: BulkUserActionPayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preview = bulk_action_preview(db, payload, current_user)
    if not preview["can_apply"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Chưa thể áp dụng vì còn người dùng hoặc cấu hình không hợp lệ",
                "preview": preview,
            },
        )
    requested_codes = {
        str(code or "").strip().lower()
        for code in payload.permission_codes
        if str(code or "").strip()
    }
    users_by_id = {
        item.id: item
        for item in db.query(SystemUser).filter(SystemUser.id.in_(payload.user_ids)).all()
    }
    target_role = db.query(SystemRole).filter(SystemRole.id == payload.role_id).first() if payload.role_id else None
    batch_id = str(uuid4())
    affected = []
    try:
        for user_id in dict.fromkeys(payload.user_ids):
            user = users_by_id[user_id]
            before_data = user_audit_snapshot(user)
            role_codes, extra_codes, denied_codes, _ = permission_code_sets(user)
            if payload.action == "grant_permissions":
                expanded = permission_codes_with_prerequisites(requested_codes)
                next_extra = extra_codes | (expanded - role_codes)
                next_denied = denied_codes - expanded
                sync_user_permission_overrides(db, user, sorted(next_extra), sorted(next_denied))
            elif payload.action == "deny_permissions":
                next_extra = extra_codes - requested_codes
                next_denied = denied_codes | (requested_codes & role_codes)
                sync_user_permission_overrides(db, user, sorted(next_extra), sorted(next_denied))
            elif payload.action == "remove_overrides":
                next_extra = extra_codes - requested_codes if requested_codes else set()
                next_denied = denied_codes - requested_codes if requested_codes else set()
                sync_user_permission_overrides(db, user, sorted(next_extra), sorted(next_denied))
            elif payload.action == "assign_role":
                user.role = target_role
                user.role_id = target_role.id
                user.data_scope = role_scope_values(target_role)[0]
                user.is_superuser = target_role.role_code == "ADMIN"
                if payload.clear_overrides:
                    sync_user_permission_overrides(db, user, [], [])
                else:
                    next_role_codes = {
                        item.permission.permission_code for item in target_role.permissions if item.permission
                    }
                    next_extra = extra_codes - next_role_codes
                    next_denied = denied_codes & next_role_codes
                    sync_user_permission_overrides(db, user, sorted(next_extra), sorted(next_denied))
            elif payload.action == "set_scope":
                user.data_scope = str(payload.data_scope).strip().lower()
            elif payload.action == "lock_accounts":
                user.is_active = False
            elif payload.action == "unlock_accounts":
                user.is_active = True

            db.flush()
            if payload.action in {"grant_permissions", "deny_permissions", "remove_overrides", "assign_role"}:
                db.expire(user, ["permission_grants"])
            if payload.action != "unlock_accounts":
                if payload.action != "force_logout":
                    user.auth_version = int(user.auth_version or 1) + 1
                revoke_user_sessions(
                    db,
                    user.id,
                    "account_locked" if payload.action == "lock_accounts" else
                    "admin_revoked" if payload.action == "force_logout" else
                    "authorization_changed",
                    current_user.username,
                )
            after_data = user_audit_snapshot(user)
            after_data["bulk_batch_id"] = batch_id
            log_action(
                db,
                request,
                "bulk_authorization_change" if payload.action != "force_logout" else "bulk_force_logout",
                "user",
                user.id,
                f"Thao tác hàng loạt {payload.action} cho người dùng {user.username}",
                before_data=before_data,
                after_data=after_data,
            )
            affected.append({"id": user.id, "username": user.username, "full_name": user.full_name})
        log_action(
            db,
            request,
            "bulk_user_action",
            "user_bulk_action",
            batch_id,
            f"Hoàn tất thao tác hàng loạt {payload.action} cho {len(affected)} người dùng",
            after_data={
                "batch_id": batch_id,
                "action": payload.action,
                "user_ids": [item["id"] for item in affected],
                "user_count": len(affected),
                "permission_codes": sorted(requested_codes),
                "role_id": payload.role_id,
                "data_scope": payload.data_scope,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "status": "success",
        "batch_id": batch_id,
        "action": payload.action,
        "affected_count": len(affected),
        "items": affected,
    }


@router.put("/users/{user_id}", dependencies=[Depends(require_any_permission("admin:user:write"))])
def update_user(
    user_id: int,
    payload: UserPayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    validate_user_payload(db, payload, user_id=user_id)
    target_role = db.query(SystemRole).filter(SystemRole.id == payload.role_id).first()
    _, current_extra_codes_set, current_denied_codes_set, _ = permission_code_sets(user)
    requested_extra_codes = {str(code or "").strip().lower() for code in payload.extra_permission_codes}
    requested_denied_codes = {str(code or "").strip().lower() for code in payload.denied_permission_codes}
    high_risk_direct_changed = bool(
        (
            (current_extra_codes_set ^ requested_extra_codes)
            | (current_denied_codes_set ^ requested_denied_codes)
        ).intersection(HIGH_RISK_PERMISSIONS)
    )
    if (
        user.is_superuser
        or payload.is_superuser
        or (target_role and target_role.role_code == "ADMIN")
        or high_risk_direct_changed
    ):
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được thay đổi tài khoản quản trị hệ thống")
    if str(current_user.id) == str(user.id):
        current_extra_codes = sorted(current_extra_codes_set)
        self_authorization_changed = any((
            user.role_id != payload.role_id,
            user.branch_id != payload.branch_id,
            user.department_id != payload.department_id,
            user.data_scope != payload.data_scope,
            bool(user.is_active) != bool(payload.is_active),
            bool(user.is_superuser) != bool(payload.is_superuser),
            current_extra_codes != sorted(set(payload.extra_permission_codes)),
            sorted(current_denied_codes_set) != sorted(set(payload.denied_permission_codes)),
        ))
        if self_authorization_changed:
            raise HTTPException(
                status_code=400,
                detail="Không thể tự thay đổi vai trò, đơn vị, phạm vi hoặc quyền của tài khoản đang đăng nhập",
            )
    if user.is_superuser and user.is_active and (not payload.is_superuser or not payload.is_active):
        active_superusers = db.query(SystemUser).filter(
            SystemUser.is_superuser.is_(True), SystemUser.is_active.is_(True)
        ).count()
        if active_superusers <= 1:
            raise HTTPException(status_code=400, detail="Hệ thống phải còn ít nhất một siêu quản trị viên hoạt động")
    before_data = user_audit_snapshot(user)
    authorization_before = user_authorization_snapshot(user)
    employee_code = clean_code(payload.employee_code)
    user.username = (payload.username or employee_code).strip().lower()
    if payload.password:
        user.password_hash = hash_password(payload.password)
        user.must_change_password = True
        user.password_changed_at = None
        user.failed_login_attempts = 0
        user.locked_until = None
    user.employee_code = employee_code
    user.credit_officer_code = clean_code(payload.credit_officer_code) or None
    user.customer_cif_code = clean_code(payload.customer_cif_code) or None
    user.ipcas_username = clean_code(payload.ipcas_username).upper() or None
    user.full_name = payload.full_name.strip()
    user.email = str(payload.email or "").strip().lower() or None
    user.phone = str(payload.phone or "").strip() or None
    user.branch_id = payload.branch_id
    user.department_id = payload.department_id
    user.role_id = payload.role_id
    user.is_active = payload.is_active
    user.is_superuser = payload.is_superuser
    user.data_scope = payload.data_scope
    try:
        db.flush()
        sync_user_permission_overrides(db, user, payload.extra_permission_codes, payload.denied_permission_codes)
        db.flush()
        db.expire(user, ["permission_grants"])
        authorization_after = {
            "role_id": payload.role_id,
            "branch_id": payload.branch_id,
            "department_id": payload.department_id,
            "data_scope": payload.data_scope,
            "is_active": bool(payload.is_active),
            "is_superuser": bool(payload.is_superuser),
            "extra_permissions": sorted(set(payload.extra_permission_codes)),
            "denied_permissions": sorted(set(payload.denied_permission_codes)),
        }
        authorization_changes = authorization_change_description(authorization_before, authorization_after)
        if authorization_changes or payload.password:
            user.auth_version = int(user.auth_version or 1) + 1
            revoke_user_sessions(
                db,
                user.id,
                "password_reset" if payload.password else "authorization_changed",
                current_user.username,
            )
        log_action(
            db,
            request,
            "authorization_change" if authorization_changes else "update",
            "user",
            user.id,
            authorization_changes or f"Cập nhật người dùng {user.username}",
            before_data=before_data,
            after_data=user_audit_snapshot(user),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Tên đăng nhập hoặc mã nhân viên đã tồn tại") from exc
    db.refresh(user)
    return serialize_user(user)


@router.delete("/users/{user_id}", dependencies=[Depends(require_any_permission("admin:user:write"))])
def delete_user(
    user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if str(current_user.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Không thể tự xóa tài khoản đang đăng nhập")
    if user.is_superuser:
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được xóa tài khoản quản trị")
    if user.is_superuser and user.is_active:
        active_superusers = db.query(SystemUser).filter(
            SystemUser.is_superuser.is_(True), SystemUser.is_active.is_(True)
        ).count()
        if active_superusers <= 1:
            raise HTTPException(status_code=400, detail="Hệ thống phải còn ít nhất một siêu quản trị viên hoạt động")
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản quản trị mặc định")
    before_data = user_audit_snapshot(user)
    db.delete(user)
    log_action(
        db, request, "delete", "user", user_id, f"Xóa người dùng {user.username}",
        before_data=before_data,
    )
    db.commit()
    return {"status": "deleted", "id": user_id}


@router.post("/users/{user_id}/reset-password", dependencies=[Depends(require_any_permission("admin:user:write"))])
def reset_user_password(
    user_id: int,
    payload: ResetPasswordPayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if str(current_user.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Hãy đổi mật khẩu tại mục Thông tin cá nhân")
    if user.is_superuser:
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được reset mật khẩu tài khoản quản trị")
    temporary_password = payload.password
    if temporary_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Xác nhận mật khẩu tạm thời không khớp")
    before_data = {
        "must_change_password": bool(user.must_change_password),
        "failed_login_attempts": int(user.failed_login_attempts or 0),
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
    }
    user.password_hash = hash_password(temporary_password)
    user.auth_version = int(user.auth_version or 1) + 1
    user.must_change_password = True
    user.password_changed_at = None
    user.failed_login_attempts = 0
    user.locked_until = None
    revoke_user_sessions(db, user.id, "password_reset", current_user.username)
    log_action(
        db, request, "reset_password", "user", user.id, f"Reset mật khẩu người dùng {user.username}",
        before_data=before_data,
        after_data={"must_change_password": True, "failed_login_attempts": 0, "locked_until": None},
    )
    db.commit()
    return {
        "id": user.id,
        "status": "password_reset",
        "must_change_password": True,
    }


@router.post("/users/{user_id}/toggle-active", dependencies=[Depends(require_any_permission("admin:user:write"))])
def toggle_user_active(
    user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if str(current_user.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản đang đăng nhập")
    if user.is_superuser:
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được khóa hoặc mở tài khoản quản trị")
        if user.is_active:
            active_superusers = db.query(SystemUser).filter(
                SystemUser.is_superuser.is_(True), SystemUser.is_active.is_(True)
            ).count()
            if active_superusers <= 1:
                raise HTTPException(status_code=400, detail="Hệ thống phải còn ít nhất một siêu quản trị viên hoạt động")
    if user.username == "admin" and user.is_active:
        raise HTTPException(status_code=400, detail="Không thể khóa tài khoản quản trị mặc định")
    before_data = user_audit_snapshot(user)
    user.is_active = not user.is_active
    user.auth_version = int(user.auth_version or 1) + 1
    if not user.is_active:
        revoke_user_sessions(db, user.id, "account_locked", current_user.username)
    action = "unlock" if user.is_active else "lock"
    log_action(
        db, request, action, "user", user.id, f"{'Mở khóa' if user.is_active else 'Khóa'} người dùng {user.username}",
        before_data=before_data, after_data=user_audit_snapshot(user),
    )
    db.commit()
    return serialize_user(user)


@router.post("/users/{user_id}/unlock-login", dependencies=[Depends(require_any_permission("admin:user:write"))])
def unlock_user_login(
    user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.is_superuser:
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được mở khóa đăng nhập tài khoản quản trị")
    before_data = {
        "failed_login_attempts": int(user.failed_login_attempts or 0),
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
    }
    user.failed_login_attempts = 0
    user.locked_until = None
    log_action(
        db,
        request,
        "unlock_login",
        "user",
        user.id,
        f"Mở khóa đăng nhập tạm thời cho người dùng {user.username}",
        before_data=before_data,
        after_data={"failed_login_attempts": 0, "locked_until": None},
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


def serialize_login_session(item: UserSession) -> dict:
    if item.revoked_at is None and session_is_idle(item):
        revoke_session(item, "idle_timeout", "system")
    user_agent = str(item.user_agent or "")
    return {
        "id": item.id,
        "user_id": item.user_id,
        "username": item.user.username if item.user else None,
        "full_name": item.user.full_name if item.user else None,
        "role_code": item.user.role.role_code if item.user and item.user.role else None,
        "device_id": item.device_id,
        "ip_address": item.ip_address,
        "user_agent": user_agent,
        "logged_in_at": item.logged_in_at.isoformat() if item.logged_in_at else None,
        "last_activity_at": item.last_activity_at.isoformat() if item.last_activity_at else None,
        "revoked_at": item.revoked_at.isoformat() if item.revoked_at else None,
        "revoke_reason": item.revoke_reason,
        "revoke_reason_label": reason_message(item.revoke_reason) if item.revoke_reason else None,
        "revoked_by": item.revoked_by,
        "is_active": item.revoked_at is None,
    }


@router.get("/sessions", dependencies=[Depends(require_any_permission("admin:user:view"))])
def list_login_sessions(
    active_only: bool = True,
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(UserSession)
    if user_id is not None:
        query = query.filter(UserSession.user_id == user_id)
    items = query.order_by(UserSession.logged_in_at.desc()).limit(500).all()
    payload = [serialize_login_session(item) for item in items]
    db.commit()
    if active_only:
        payload = [item for item in payload if item["is_active"]]
    return {"items": payload, "total": len(payload)}


@router.post("/sessions/{session_id}/revoke", dependencies=[Depends(require_any_permission("admin:user:write"))])
def revoke_login_session(
    session_id: str,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên đăng nhập")
    if item.user and item.user.is_superuser:
        require_superuser_actor(
            current_user,
            "Chỉ siêu quản trị viên được kết thúc phiên của tài khoản quản trị",
        )
    if str(item.user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Không thể kết thúc phiên đang sử dụng tại đây")
    revoke_session(item, "admin_revoked", current_user.username)
    log_action(
        db,
        request,
        "revoke_session",
        "user_session",
        item.id,
        f"Kết thúc phiên đăng nhập của {item.user.username if item.user else item.user_id}",
        after_data={"revoke_reason": "admin_revoked", "revoked_by": current_user.username},
    )
    db.commit()
    return {"status": "revoked", "id": item.id}


@router.get("/roles", dependencies=[Depends(require_any_permission("admin:role:view"))])
def list_roles(
    keyword: str | None = None,
    permission_group: str | None = None,
    permission_code: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(SystemRole).options(
        selectinload(SystemRole.permissions).selectinload(SystemRolePermission.permission),
        selectinload(SystemRole.scope_policy),
    )
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(or_(SystemRole.role_code.ilike(like), SystemRole.role_name.ilike(like)))
    roles = query.order_by(SystemRole.role_code).all()
    if permission_group or permission_code:
        filtered = []
        for role in roles:
            permissions = [item.permission for item in role.permissions if item.permission]
            if permission_group and not any(item.permission_group == permission_group for item in permissions):
                continue
            if permission_code and not any(item.permission_code == permission_code for item in permissions):
                continue
            filtered.append(role)
        roles = filtered
    role_user_counts = {
        role_id: int(count or 0)
        for role_id, count in (
            db.query(SystemUser.role_id, func.count(SystemUser.id))
            .filter(SystemUser.role_id.isnot(None))
            .group_by(SystemUser.role_id)
            .all()
        )
    }
    return [serialize_role(item, role_user_counts.get(item.id, 0)) for item in roles]


def sync_role_permissions(db: Session, role: SystemRole, permission_codes: list[str]) -> None:
    requested_codes = {str(code or "").strip().lower() for code in permission_codes if str(code or "").strip()}
    validate_permission_dependencies(requested_codes)
    permissions = db.query(SystemPermission).filter(SystemPermission.permission_code.in_(requested_codes)).all()
    found_codes = {item.permission_code for item in permissions}
    unknown_codes = requested_codes - found_codes
    if unknown_codes:
        raise HTTPException(status_code=400, detail=f"Quyền không tồn tại: {', '.join(sorted(unknown_codes))}")
    db.query(SystemRolePermission).filter(SystemRolePermission.role_id == role.id).delete()
    for permission in permissions:
        db.add(SystemRolePermission(role_id=role.id, permission_id=permission.id))


@router.post("/roles", dependencies=[Depends(require_any_permission("admin:role:write"))])
def create_role(
    payload: RolePayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requested_codes = {str(code or "").strip().lower() for code in payload.permission_codes}
    if requested_codes.intersection(HIGH_RISK_PERMISSIONS):
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được tạo nhóm có quyền rủi ro cao")
    role = SystemRole(
        role_code=payload.role_code.strip().upper(),
        role_name=payload.role_name.strip(),
        description=payload.description,
        is_system=False,
    )
    db.add(role)
    try:
        db.flush()
        sync_role_permissions(db, role, payload.permission_codes)
        sync_role_scope_policy(db, role, payload)
        db.flush()
        db.expire(role, ["permissions", "scope_policy"])
        log_action(
            db, request, "create", "role", role.id, f"Thêm nhóm quyền {role.role_code}",
            after_data=role_audit_snapshot(role),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã nhóm quyền đã tồn tại") from exc
    db.refresh(role)
    return serialize_role(role)


@router.put("/roles/{role_id}", dependencies=[Depends(require_any_permission("admin:role:write"))])
def update_role(
    role_id: int,
    payload: RolePayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm quyền")
    if role.is_system:
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được thay đổi nhóm quyền chuẩn của hệ thống")
    before_data = role_audit_snapshot(role)
    previous_permission_codes = {
        item.permission.permission_code
        for item in role.permissions
        if item.permission
    }
    requested_permission_codes = {str(code or "").strip().lower() for code in payload.permission_codes}
    if role.is_system and role.role_code != payload.role_code.strip().upper():
        raise HTTPException(status_code=400, detail="Không thể đổi mã của nhóm quyền chuẩn hệ thống")
    if (previous_permission_codes ^ requested_permission_codes).intersection(HIGH_RISK_PERMISSIONS):
        require_superuser_actor(current_user, "Chỉ siêu quản trị viên được thay đổi quyền rủi ro cao")
    role.role_code = payload.role_code.strip().upper()
    role.role_name = payload.role_name.strip()
    role.description = payload.description
    try:
        sync_role_permissions(db, role, payload.permission_codes)
        sync_role_scope_policy(db, role, payload)
        db.flush()
        db.expire(role, ["permissions", "scope_policy"])
        after_data = role_audit_snapshot(role)
        authorization_changed = any(
            before_data.get(key) != after_data.get(key)
            for key in ("permission_codes", "default_scope", "allowed_scopes", "scope_warning_level")
        )
        if authorization_changed:
            for assigned_user in role.users:
                assigned_user.auth_version = int(assigned_user.auth_version or 1) + 1
                revoke_user_sessions(
                    db,
                    assigned_user.id,
                    "authorization_changed",
                    current_user.username,
                )
        log_action(
            db,
            request,
            "authorization_change" if authorization_changed else "update",
            "role",
            role.id,
            f"Cập nhật nhóm quyền {role.role_code}",
            before_data=before_data,
            after_data=after_data,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã nhóm quyền đã tồn tại") from exc
    db.refresh(role)
    return serialize_role(role)


@router.delete("/roles/{role_id}", dependencies=[Depends(require_any_permission("admin:role:write"))])
def delete_role(role_id: int, request: Request, db: Session = Depends(get_db)):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm quyền")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Không thể xóa nhóm quyền chuẩn của hệ thống")
    if role.users:
        raise HTTPException(status_code=400, detail="Nhóm quyền còn người dùng, không thể xóa")
    before_data = role_audit_snapshot(role)
    db.query(SystemRolePermission).filter(SystemRolePermission.role_id == role.id).delete()
    db.delete(role)
    log_action(
        db, request, "delete", "role", role_id, f"Xóa nhóm quyền {role.role_code}",
        before_data=before_data,
    )
    db.commit()
    return {"status": "deleted", "id": role_id}


@router.get("/permissions", dependencies=[Depends(require_any_permission("admin:role:view"))])
def list_permissions(db: Session = Depends(get_db)):
    rows = db.query(SystemPermission).order_by(SystemPermission.permission_group, SystemPermission.permission_code).all()
    return [serialize_permission(item) for item in rows]


@router.post("/access-check", dependencies=[Depends(require_any_permission("admin:access_test"))])
def check_effective_access(payload: AccessCheckPayload, db: Session = Depends(get_db)):
    user = db.query(SystemUser).filter(SystemUser.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    permission_code = payload.permission_code.strip().lower()
    permission = db.query(SystemPermission).filter(SystemPermission.permission_code == permission_code).first()
    if not permission:
        raise HTTPException(status_code=404, detail="Quyền chức năng không tồn tại")

    role_codes = {
        item.permission.permission_code
        for item in (user.role.permissions if user.role else [])
        if item.permission
    }
    _, direct_codes, explicit_denied_codes, effective_denied_codes = permission_code_sets(user)
    granted_codes = set(effective_permission_codes(user))
    function_allowed = "admin" in granted_codes or permission_code in granted_codes
    permission_source = (
        "superuser" if "admin" in granted_codes
        else "denied" if permission_code in effective_denied_codes
        else "role" if permission_code in role_codes
        else "direct" if permission_code in direct_codes
        else "missing"
    )

    home_branch = user.branch.branch_code if user.branch else None
    home_department = user.department.department_code if user.department else None
    requested_branch = (payload.branch_code or "").strip() or None
    requested_department = (payload.department_code or "").strip() or None
    scope = user.data_scope or "own"
    scope_allowed = True
    scope_reason = "Phạm vi toàn tỉnh cho phép truy cập tất cả đơn vị."
    if scope == "branch":
        scope_allowed = not requested_branch or requested_branch == home_branch
        scope_reason = f"Chỉ được truy cập chi nhánh {home_branch or 'chưa cấu hình'}."
    elif scope == "department":
        scope_allowed = (
            (not requested_branch or requested_branch == home_branch)
            and (not requested_department or requested_department == home_department)
        )
        scope_reason = f"Chỉ được truy cập {home_branch or '—'} / {home_department or 'phòng ban chưa cấu hình'}."
    elif scope == "own":
        scope_allowed = (
            (not requested_branch or requested_branch == home_branch)
            and (not requested_department or requested_department == home_department)
        )
        scope_reason = "Chỉ được truy cập khách hàng được giao trực tiếp cho cán bộ."

    customer_match = None
    customer_reason = None
    if payload.customer_code and payload.period_key:
        customer_code = payload.customer_code.strip()
        relation_query = db.query(CustomerPeriodBranchDetail).filter(
            CustomerPeriodBranchDetail.period_key == payload.period_key,
            CustomerPeriodBranchDetail.ma_kh == customer_code,
        )
        if requested_branch:
            relation_query = relation_query.filter(CustomerPeriodBranchDetail.branch_code == requested_branch)
        relations = relation_query.all()
        customer_match = bool(relations)
        if scope == "branch":
            customer_match = any(item.branch_code == home_branch for item in relations)
        elif scope == "department":
            customer_match = any(
                item.branch_code == home_branch and item.ma_pgd == home_department
                for item in relations
            )
        elif scope == "own":
            profile = db.query(CustomerPeriodProfile).filter(
                CustomerPeriodProfile.period_key == payload.period_key,
                CustomerPeriodProfile.ma_kh == customer_code,
            ).first()
            employee_code = (user.employee_code or "").strip()
            customer_match = bool(employee_code) and (
                any((item.officer_employee_code or "").strip() == employee_code for item in relations)
                or bool(profile and (profile.officer_employee_code or "").strip() == employee_code)
            )
        customer_reason = (
            "Khách hàng thuộc phạm vi dữ liệu của người dùng."
            if customer_match
            else "Không tìm thấy quan hệ khách hàng phù hợp với chi nhánh/phòng ban/cán bộ được giao."
        )
        scope_allowed = scope_allowed and customer_match

    allowed = bool(user.is_active and function_allowed and scope_allowed)
    reasons = []
    reasons.append("Tài khoản đang hoạt động." if user.is_active else "Tài khoản đang bị khóa.")
    reasons.append(
        f"Có quyền {permission_code} từ {'nhóm quyền' if permission_source == 'role' else 'quyền cấp thêm' if permission_source == 'direct' else 'quản trị viên'}."
        if function_allowed
        else (
            f"Quyền {permission_code} bị từ chối trực tiếp hoặc do quyền cha bị từ chối."
            if permission_source == "denied"
            else f"Thiếu quyền chức năng {permission_code}."
        )
    )
    reasons.append(scope_reason)
    if customer_reason:
        reasons.append(customer_reason)
    return {
        "allowed": allowed,
        "decision": "ALLOWED" if allowed else "DENIED",
        "user": serialize_user(user),
        "permission": serialize_permission(permission),
        "permission_source": permission_source,
        "explicit_denied": permission_code in explicit_denied_codes,
        "function_allowed": function_allowed,
        "scope_allowed": scope_allowed,
        "scope": scope,
        "home_branch": home_branch,
        "home_department": home_department,
        "requested_branch": requested_branch,
        "requested_department": requested_department,
        "period_key": payload.period_key,
        "customer_code": payload.customer_code,
        "customer_match": customer_match,
        "reasons": reasons,
    }


def parse_date_boundary(value: str | None, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    if end_of_day and parsed.time() == time.min:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed


@router.get("/audit-logs", dependencies=[Depends(require_any_permission("admin:audit:view"))])
def list_audit_logs(
    keyword: str | None = None,
    actor_username: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                AuditLog.actor_username.ilike(like),
                AuditLog.actor_name.ilike(like),
                AuditLog.description.ilike(like),
                AuditLog.entity_id.ilike(like),
            )
        )
    if actor_username:
        query = query.filter(AuditLog.actor_username.ilike(f"%{actor_username.strip()}%"))
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    from_value = parse_date_boundary(date_from)
    to_value = parse_date_boundary(date_to, end_of_day=True)
    if from_value:
        query = query.filter(AuditLog.created_at >= from_value)
    if to_value:
        query = query.filter(AuditLog.created_at <= to_value)

    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": item.id,
            "actor_username": item.actor_username,
            "actor_name": item.actor_name,
            "action": item.action,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "description": item.description,
            "before_data": item.before_data,
            "after_data": item.after_data,
            "changed_fields": item.changed_fields or [],
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in rows
    ]


@router.get("/users/warnings", dependencies=[Depends(require_any_permission("admin:user:view"))])
def user_warnings(db: Session = Depends(get_db)):
    missing_role = db.query(SystemUser).filter(SystemUser.role_id.is_(None)).count()
    missing_department = db.query(SystemUser).filter(SystemUser.department_id.is_(None)).count()
    duplicate_ipcas_rows = (
        db.query(SystemUser.ipcas_username, func.count(SystemUser.id))
        .filter(SystemUser.ipcas_username.isnot(None), SystemUser.ipcas_username != "")
        .group_by(SystemUser.ipcas_username)
        .having(func.count(SystemUser.id) > 1)
        .all()
    )
    users = db.query(SystemUser).all()
    scope_mismatch = sum(1 for user in users if user_scope_configuration_issue(user))
    direct_permission_users = db.query(func.count(func.distinct(SystemUserPermission.user_id))).scalar() or 0
    stale_cutoff = datetime.utcnow() - timedelta(days=90)
    return {
        "missing_role": missing_role,
        "missing_department": missing_department,
        "missing_branch": db.query(SystemUser).filter(SystemUser.branch_id.is_(None)).count(),
        "scope_mismatch": scope_mismatch,
        "direct_permission_users": int(direct_permission_users),
        "never_login": db.query(SystemUser).filter(SystemUser.last_login_at.is_(None)).count(),
        "stale_login": db.query(SystemUser).filter(SystemUser.last_login_at.isnot(None), SystemUser.last_login_at < stale_cutoff).count(),
        "inactive_users": db.query(SystemUser).filter(SystemUser.is_active.is_(False)).count(),
        "duplicate_ipcas": [{"ipcas_username": item[0], "count": item[1]} for item in duplicate_ipcas_rows],
    }


@router.get("/users/warnings/details", dependencies=[Depends(require_any_permission("admin:user:view"))])
def user_warning_details(
    warning_type: str = Query(...),
    ipcas_username: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(SystemUser)
    if warning_type == "missing_role":
        query = query.filter(SystemUser.role_id.is_(None))
    elif warning_type == "missing_department":
        query = query.filter(SystemUser.department_id.is_(None))
    elif warning_type == "duplicate_ipcas":
        if ipcas_username:
            query = query.filter(SystemUser.ipcas_username == ipcas_username)
        else:
            duplicates = (
                db.query(SystemUser.ipcas_username)
                .filter(SystemUser.ipcas_username.isnot(None), SystemUser.ipcas_username != "")
                .group_by(SystemUser.ipcas_username)
                .having(func.count(SystemUser.id) > 1)
                .subquery()
            )
            query = query.filter(SystemUser.ipcas_username.in_(duplicates))
    elif warning_type == "missing_branch":
        query = query.filter(SystemUser.branch_id.is_(None))
    elif warning_type == "direct_permissions":
        query = query.join(SystemUserPermission, SystemUserPermission.user_id == SystemUser.id).distinct()
    elif warning_type == "never_login":
        query = query.filter(SystemUser.last_login_at.is_(None))
    elif warning_type == "stale_login":
        query = query.filter(
            SystemUser.last_login_at.isnot(None),
            SystemUser.last_login_at < datetime.utcnow() - timedelta(days=90),
        )
    elif warning_type == "inactive_users":
        query = query.filter(SystemUser.is_active.is_(False))
    elif warning_type == "scope_mismatch":
        rows = query.order_by(SystemUser.full_name).all()
        result = []
        for item in rows:
            reason = user_scope_configuration_issue(item)
            if not reason:
                continue
            payload = serialize_user(item)
            payload["warning_reason"] = reason
            result.append(payload)
            if len(result) >= 500:
                break
        return result
    else:
        raise HTTPException(status_code=400, detail="Loại cảnh báo không hợp lệ")

    reason_labels = {
        "missing_role": "Tài khoản chưa được gán nhóm quyền.",
        "missing_department": "Tài khoản chưa được gán phòng ban quản lý.",
        "missing_branch": "Tài khoản chưa được gán chi nhánh quản lý.",
        "duplicate_ipcas": "User IPCAS đang được sử dụng bởi nhiều tài khoản.",
        "direct_permissions": "Tài khoản có quyền cấp thêm ngoài nhóm quyền nền.",
        "never_login": "Tài khoản chưa từng đăng nhập hệ thống.",
        "stale_login": "Tài khoản không đăng nhập trong hơn 90 ngày.",
        "inactive_users": "Tài khoản hiện đang bị khóa.",
    }
    result = []
    for item in query.order_by(SystemUser.full_name).limit(500).all():
        payload = serialize_user(item)
        payload["warning_reason"] = reason_labels.get(warning_type)
        result.append(payload)
    return result


def save_temp_upload(file: UploadFile) -> Path:
    suffix = ".xlsx"
    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        return Path(tmp.name)


@router.post("/import/branches", dependencies=[Depends(require_any_permission("admin:branch:write", "admin:department:write"))])
def import_branches(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    rows = read_excel_rows(save_temp_upload(file))
    count = 0
    for row in rows:
        branch_code = norm_code(row.get("BRCD"))
        branch_name = norm_text(row.get("Name"))
        department_code = norm_code(row.get("TRSTCD"))
        department_name = norm_text(row.get("TRSTName"))
        if not branch_code:
            continue
        branch = db.query(OrgBranch).filter(OrgBranch.branch_code == branch_code).first()
        if not branch:
            branch = OrgBranch(branch_code=branch_code, branch_name=branch_name or f"Chi nhánh {branch_code}")
            db.add(branch)
            db.flush()
        else:
            branch.branch_name = branch_name or branch.branch_name
        if department_code:
            department = (
                db.query(OrgDepartment)
                .filter(OrgDepartment.branch_id == branch.id, OrgDepartment.department_code == department_code)
                .first()
            )
            if not department:
                db.add(OrgDepartment(branch_id=branch.id, department_code=department_code, department_name=department_name or department_code))
            else:
                department.department_name = department_name or department.department_name
        count += 1
    log_action(db, request, "import", "organization", None, f"Import {count} dòng chi nhánh/phòng ban từ Excel")
    db.commit()
    return {"status": "ok", "rows": count}


@router.post("/import/users", dependencies=[Depends(require_any_permission("admin:user:write"))])
def import_users(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    rows = read_excel_rows(save_temp_upload(file))
    role_user = db.query(SystemRole).filter(SystemRole.role_code == "USER").first()
    default_hash = hash_password("1")
    count = 0
    for row in rows:
        employee_code = norm_code(row.get("Mã NV"))
        if not employee_code:
            continue
        branch_code = norm_code(row.get("BRCD"))
        branch = db.query(OrgBranch).filter(OrgBranch.branch_code == branch_code).first()
        department = None
        if branch:
            department_code = norm_code(row.get("TRSTCD"))
            department = (
                db.query(OrgDepartment)
                .filter(OrgDepartment.branch_id == branch.id, OrgDepartment.department_code == department_code)
                .first()
            )
        user = db.query(SystemUser).filter(SystemUser.employee_code == employee_code).first()
        payload = {
            "username": employee_code.lower(),
            "employee_code": employee_code,
            "customer_cif_code": norm_code(row.get("MA_CIF") or row.get("CUSTNO")) or None,
            "credit_officer_code": norm_code(row.get("Mã CBTD")) or None,
            "ipcas_username": norm_text(row.get("User IPCAS")).upper() or None,
            "full_name": norm_text(row.get("Tên NV")) or employee_code,
            "branch_id": branch.id if branch else None,
            "department_id": department.id if department else None,
            "role_id": role_user.id if role_user else None,
            "is_active": True,
            "data_scope": "own",
        }
        if not user:
            db.add(SystemUser(password_hash=default_hash, must_change_password=True, **payload))
        else:
            for key, value in payload.items():
                setattr(user, key, value)
        count += 1
    log_action(db, request, "import", "user", None, f"Import {count} cán bộ từ Excel")
    db.commit()
    return {"status": "ok", "rows": count}


@router.get("/organization-tree", dependencies=[Depends(require_any_permission("admin:branch:view", "admin:department:view"))])
def organization_tree(db: Session = Depends(get_db)):
    branches = db.query(OrgBranch).order_by(OrgBranch.branch_code).all()
    result = []
    for branch in branches:
        result.append(
            {
                "title": f"{branch.branch_code} - {branch.branch_name}",
                "key": f"branch-{branch.id}",
                "type": "branch",
                "children": [
                    {
                        "title": f"{department.department_code} - {department.department_name} ({len(department.users)} cán bộ)",
                        "key": f"department-{department.id}",
                        "type": "department",
                    }
                    for department in sorted(branch.departments, key=lambda item: item.department_code)
                ],
            }
        )
    return result
