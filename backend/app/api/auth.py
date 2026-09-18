from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import expand_denied_permissions
from app.auth.user_mapper import effective_permission_codes
from app.auth.schemas import CurrentUser
from app.database import get_db
from app.config import settings
from app.client_ip import request_ip
from app.models import AuditLog, SystemRole, SystemUser, UserSession
from app.security import PASSWORD_POLICY, create_access_token, decode_access_token, hash_password, password_policy_errors, verify_password
from app.session_management import revoke_session, revoke_user_sessions, utc_now


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: str | None = Field(default=None, max_length=128)


class PersonalProfilePayload(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)
    confirm_password: str


def serialize_user(user: SystemUser) -> dict:
    role = user.role.role_code if isinstance(user.role, SystemRole) else None
    permission_codes = effective_permission_codes(user)

    data_scope = user.data_scope or "branch"
    scope = (
        "province" if user.is_superuser or data_scope in {"all", "system", "province"}
        else "pgd" if data_scope == "department"
        else "own" if data_scope == "own"
        else "branch"
    )
    branch_code = user.branch.branch_code if user.branch else None
    department_code = user.department.department_code if user.department else None
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.full_name,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "employee_code": user.employee_code,
        "ipcas_username": user.ipcas_username,
        "is_superuser": user.is_superuser,
        "role": role,
        "role_name": user.role.role_name if user.role else None,
        "branch": user.branch.branch_name if user.branch else None,
        "branch_code": branch_code,
        "ma_cn": branch_code,
        "department": user.department.department_name if user.department else None,
        "department_code": department_code,
        "ma_pgd": department_code if scope in {"pgd", "own"} else None,
        "data_scope": data_scope,
        "scope": scope,
        "allowed_branches": [branch_code] if branch_code and scope != "province" else [],
        "allowed_pgds": [department_code] if department_code and scope in {"pgd", "own"} else [],
        "permissions": permission_codes,
        "must_change_password": bool(user.must_change_password),
        "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
    }


def serialize_personal_profile(user: SystemUser) -> dict:
    role_permissions = {
        item.permission.permission_code: item.permission
        for item in (user.role.permissions if user.role else [])
        if item.permission
    }
    direct_permissions = {
        item.permission.permission_code: item.permission
        for item in user.permission_grants
        if item.permission and str(item.effect or "allow").lower() != "deny"
    }
    denied_permissions = {
        item.permission.permission_code: item.permission
        for item in user.permission_grants
        if item.permission and str(item.effect or "allow").lower() == "deny"
    }
    effective_codes = effective_permission_codes(user)
    permission_items = []
    for code in effective_codes:
        permission = direct_permissions.get(code) or role_permissions.get(code)
        permission_items.append({
            "permission_code": code,
            "permission_name": permission.permission_name if permission else "Toàn quyền hệ thống",
            "permission_group": permission.permission_group if permission else "Quản trị hệ thống",
            "source": "direct" if code in direct_permissions and code not in role_permissions else "role",
        })
    return {
        **serialize_user(user),
        "employee_code": user.employee_code,
        "credit_officer_code": user.credit_officer_code,
        "customer_cif_code": user.customer_cif_code,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "role_permission_codes": sorted(role_permissions),
        "extra_permission_codes": sorted(set(direct_permissions) - set(role_permissions)),
        "denied_permission_codes": sorted(denied_permissions),
        "effective_denied_permission_codes": sorted(expand_denied_permissions(denied_permissions)),
        "denied_permissions": [{
            "permission_code": code,
            "permission_name": permission.permission_name,
            "permission_group": permission.permission_group,
            "source": "denied",
        } for code, permission in sorted(denied_permissions.items())],
        "effective_permissions": permission_items,
    }


def audit_personal_action(db: Session, user: SystemUser, action: str, description: str) -> None:
    db.add(AuditLog(
        actor_username=user.username,
        actor_name=user.full_name,
        action=action,
        entity_type="personal_profile",
        entity_id=str(user.id),
        description=description,
    ))


def is_admin_account(user: SystemUser) -> bool:
    return bool(user.is_superuser or (user.role and user.role.role_code == "ADMIN"))


def request_session_id(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    _, _, token = authorization.partition(" ")
    if not token:
        return None
    try:
        return str(decode_access_token(token).get("sid") or "") or None
    except ValueError:
        return None


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    username = payload.username.strip()
    username_lower = username.lower()
    user = (
        db.query(SystemUser)
        .filter(
            or_(
                SystemUser.username == username_lower,
                SystemUser.employee_code == username,
                SystemUser.ipcas_username == username.upper(),
            )
        )
        .with_for_update()
        .first()
    )
    now = utc_now()
    if not user:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại trên hệ thống")
    admin_account = is_admin_account(user)
    if admin_account and user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
    if user.locked_until and user.locked_until > now:
        remaining_minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(
            status_code=423,
            detail=f"Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau {remaining_minutes} phút",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=423,
            detail="Tài khoản đã bị khóa bởi quản trị viên. Vui lòng liên hệ quản trị viên để được mở khóa",
        )
    if not verify_password(payload.password, user.password_hash):
        if admin_account:
            db.add(AuditLog(
                actor_username=user.username,
                actor_name=user.full_name,
                action="login_failed",
                entity_type="security",
                entity_id=str(user.id),
                description=f"Đăng nhập quản trị không thành công từ IP {request_ip(request) or 'không xác định'}",
            ))
            db.commit()
            raise HTTPException(status_code=401, detail="Mật khẩu không chính xác")
        user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
        attempts_left = max(0, 5 - user.failed_login_attempts)
        if user.failed_login_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
            user.failed_login_attempts = 0
            db.commit()
            raise HTTPException(
                status_code=423,
                detail="Tài khoản đã tạm khóa 15 phút do nhập sai mật khẩu 5 lần liên tiếp",
            )
        db.commit()
        raise HTTPException(
            status_code=401,
            detail=f"Mật khẩu không chính xác. Bạn còn {attempts_left} lần thử trước khi tài khoản bị tạm khóa",
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    session_id = str(uuid4())
    if not admin_account:
        revoke_user_sessions(db, user.id, "new_login", user.username)
    login_session = UserSession(
        id=session_id,
        user_id=user.id,
        device_id=str(payload.device_id or "").strip() or None,
        ip_address=request_ip(request, settings.TRUSTED_PROXY_HOSTNAME),
        user_agent=str(request.headers.get("user-agent") or "")[:500] or None,
        logged_in_at=now,
        last_activity_at=now,
    )
    db.add(login_session)
    db.add(AuditLog(
        actor_username=user.username,
        actor_name=user.full_name,
        action="login",
        entity_type="security",
        entity_id=session_id,
        description=f"Đăng nhập thành công từ IP {login_session.ip_address or 'không xác định'}",
    ))
    db.commit()
    db.refresh(user)
    return {
        "user": serialize_user(user),
        "access_token": create_access_token(user.id, user.auth_version, session_id),
        "token_type": "bearer",
        "password_policy": PASSWORD_POLICY,
        "session_policy": {
            "idle_minutes": settings.SESSION_IDLE_MINUTES,
            "warning_seconds": 120,
            "heartbeat_seconds": 30,
            "single_session": not admin_account,
        },
    }


@router.post("/session/heartbeat")
def session_heartbeat(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_id = request_session_id(request)
    item = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == int(current_user.id),
        UserSession.revoked_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không còn hiệu lực")
    now = utc_now()
    item.last_activity_at = now
    db.commit()
    return {
        "status": "active",
        "server_time": now.isoformat(),
        "idle_minutes": settings.SESSION_IDLE_MINUTES,
    }


@router.post("/logout")
def logout(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_id = request_session_id(request)
    item = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == int(current_user.id),
    ).first()
    if item:
        revoke_session(item, "logout", current_user.username)
        db.add(AuditLog(
            actor_username=current_user.username,
            actor_name=current_user.display_name,
            action="logout",
            entity_type="security",
            entity_id=session_id,
            description="Người dùng chủ động đăng xuất",
        ))
        db.commit()
    return {"status": "logged_out"}


@router.get("/password-policy")
def get_password_policy():
    return PASSWORD_POLICY


def get_profile_user(db: Session, current_user: CurrentUser) -> SystemUser:
    user = db.query(SystemUser).filter(SystemUser.id == int(current_user.id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản đang đăng nhập")
    return user


@router.get("/me")
def auth_me(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_user(get_profile_user(db, current_user))


@router.get("/profile")
def personal_profile(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_personal_profile(get_profile_user(db, current_user))


@router.put("/profile")
def update_personal_profile(
    payload: PersonalProfilePayload,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = get_profile_user(db, current_user)
    full_name = payload.full_name.strip()
    email = str(payload.email or "").strip().lower() or None
    phone = str(payload.phone or "").strip() or None
    if not full_name:
        raise HTTPException(status_code=400, detail="Họ tên không được để trống")
    if email and ("@" not in email or email.startswith("@") or email.endswith("@")):
        raise HTTPException(status_code=400, detail="Email không hợp lệ")
    if phone and (len(phone) > 30 or not all(char.isdigit() or char in "+-. ()" for char in phone)):
        raise HTTPException(status_code=400, detail="Số điện thoại không hợp lệ")
    user.full_name = full_name
    user.email = email
    user.phone = phone
    audit_personal_action(db, user, "update", "Người dùng tự cập nhật hồ sơ cá nhân")
    db.commit()
    db.refresh(user)
    return {"user": serialize_user(user), "profile": serialize_personal_profile(user)}


@router.post("/change-password")
def change_personal_password(
    payload: ChangePasswordPayload,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = get_profile_user(db, current_user)
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Xác nhận mật khẩu mới không khớp")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải khác mật khẩu hiện tại")
    policy_errors = password_policy_errors(
        payload.new_password,
        username=user.username,
        full_name=user.full_name,
    )
    if policy_errors:
        raise HTTPException(status_code=400, detail="Mật khẩu chưa đủ an toàn: " + "; ".join(policy_errors))
    user.password_hash = hash_password(payload.new_password)
    user.auth_version = int(user.auth_version or 1) + 1
    user.must_change_password = False
    user.password_changed_at = datetime.now(timezone.utc)
    user.failed_login_attempts = 0
    user.locked_until = None
    session_id = request_session_id(request)
    revoke_user_sessions(db, user.id, "password_changed", user.username, except_session_id=session_id)
    audit_personal_action(db, user, "change_password", "Người dùng tự thay đổi mật khẩu")
    db.commit()
    return {
        "status": "password_changed",
        "message": "Đã thay đổi mật khẩu thành công",
        "access_token": create_access_token(user.id, user.auth_version, session_id),
        "user": serialize_user(user),
    }
