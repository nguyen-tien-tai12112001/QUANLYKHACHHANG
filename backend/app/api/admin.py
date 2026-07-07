from datetime import datetime, time
from urllib.parse import unquote
from tempfile import NamedTemporaryFile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AuditLog,
    OrgBranch,
    OrgDepartment,
    SystemPermission,
    SystemRole,
    SystemRolePermission,
    SystemUser,
)
from app.security import hash_password
from app.seed_data import norm_code, norm_text, read_excel_rows


router = APIRouter(prefix="/api/admin", tags=["admin"])


class BranchPayload(BaseModel):
    branch_code: str
    branch_name: str
    status: str = "active"


class DepartmentPayload(BaseModel):
    branch_id: int
    department_code: str
    department_name: str
    department_type: str | None = None
    manager_user_id: int | None = None
    status: str = "active"


class UserPayload(BaseModel):
    username: str | None = None
    full_name: str
    password: str | None = None
    employee_code: str
    credit_officer_code: str | None = None
    ipcas_username: str | None = None
    branch_id: int | None = None
    department_id: int | None = None
    role_id: int | None = None
    data_scope: str = "own"
    is_active: bool = True
    is_superuser: bool = False


class RolePayload(BaseModel):
    role_code: str
    role_name: str
    description: str | None = None
    permission_codes: list[str] = []


def clean_code(value: str | None) -> str:
    return str(value or "").strip().upper()


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


def validate_user_payload(db: Session, payload: UserPayload, user_id: int | None = None) -> None:
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


def log_action(db: Session, request: Request, action: str, entity_type: str, entity_id=None, description: str | None = None) -> None:
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
        )
    )


def serialize_branch(branch: OrgBranch) -> dict:
    return {
        "id": branch.id,
        "branch_code": branch.branch_code,
        "branch_name": branch.branch_name,
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
        "manager_user_id": department.manager_user_id,
        "manager_name": department.manager.full_name if department.manager else None,
        "status": department.status,
        "user_count": len(department.users),
    }


def serialize_user(user: SystemUser) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "employee_code": user.employee_code,
        "credit_officer_code": user.credit_officer_code,
        "ipcas_username": user.ipcas_username,
        "full_name": user.full_name,
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
    }


def serialize_role(role: SystemRole) -> dict:
    permissions = [item.permission for item in role.permissions if item.permission]
    return {
        "id": role.id,
        "role_code": role.role_code,
        "role_name": role.role_name,
        "description": role.description,
        "is_system": role.is_system,
        "user_count": len(role.users),
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
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    return {
        "branch_count": db.query(OrgBranch).count(),
        "department_count": db.query(OrgDepartment).count(),
        "user_count": db.query(SystemUser).count(),
        "role_count": db.query(SystemRole).count(),
        "warning_count": db.query(SystemUser).filter(
            or_(SystemUser.role_id.is_(None), SystemUser.department_id.is_(None))
        ).count(),
    }


@router.get("/branches")
def list_branches(keyword: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(OrgBranch)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(or_(OrgBranch.branch_code.ilike(like), OrgBranch.branch_name.ilike(like)))
    if status:
        query = query.filter(OrgBranch.status == status)
    return [serialize_branch(item) for item in query.order_by(OrgBranch.branch_code).all()]


@router.post("/branches")
def create_branch(payload: BranchPayload, request: Request, db: Session = Depends(get_db)):
    branch = OrgBranch(
        branch_code=clean_code(payload.branch_code),
        branch_name=payload.branch_name.strip(),
        status=payload.status,
    )
    db.add(branch)
    try:
        log_action(db, request, "create", "branch", branch.id, f"Thêm chi nhánh {branch.branch_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã chi nhánh đã tồn tại") from exc
    db.refresh(branch)
    return serialize_branch(branch)


@router.put("/branches/{branch_id}")
def update_branch(branch_id: int, payload: BranchPayload, request: Request, db: Session = Depends(get_db)):
    branch = db.query(OrgBranch).filter(OrgBranch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Không tìm thấy chi nhánh")
    branch.branch_code = clean_code(payload.branch_code)
    branch.branch_name = payload.branch_name.strip()
    branch.status = payload.status
    try:
        log_action(db, request, "update", "branch", branch.id, f"Cập nhật chi nhánh {branch.branch_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã chi nhánh đã tồn tại") from exc
    db.refresh(branch)
    return serialize_branch(branch)


@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: int, request: Request, db: Session = Depends(get_db)):
    branch = db.query(OrgBranch).filter(OrgBranch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Không tìm thấy chi nhánh")
    if branch.departments or branch.users:
        raise HTTPException(status_code=400, detail="Chi nhánh còn phòng ban hoặc người dùng, không thể xóa")
    db.delete(branch)
    log_action(db, request, "delete", "branch", branch_id, f"Xóa chi nhánh {branch.branch_code}")
    db.commit()
    return {"status": "deleted", "id": branch_id}


@router.get("/departments")
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


@router.post("/departments")
def create_department(payload: DepartmentPayload, request: Request, db: Session = Depends(get_db)):
    validate_department_payload(db, payload)
    department = OrgDepartment(
        branch_id=payload.branch_id,
        department_code=clean_code(payload.department_code),
        department_name=payload.department_name.strip(),
        department_type=clean_code(payload.department_type) or None,
        manager_user_id=payload.manager_user_id,
        status=payload.status,
    )
    db.add(department)
    try:
        log_action(db, request, "create", "department", department.id, f"Thêm phòng ban {department.department_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã phòng ban đã tồn tại trong chi nhánh") from exc
    db.refresh(department)
    return serialize_department(department)


@router.put("/departments/{department_id}")
def update_department(department_id: int, payload: DepartmentPayload, request: Request, db: Session = Depends(get_db)):
    department = db.query(OrgDepartment).filter(OrgDepartment.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    validate_department_payload(db, payload)
    department.branch_id = payload.branch_id
    department.department_code = clean_code(payload.department_code)
    department.department_name = payload.department_name.strip()
    department.department_type = clean_code(payload.department_type) or None
    department.manager_user_id = payload.manager_user_id
    department.status = payload.status
    try:
        log_action(db, request, "update", "department", department.id, f"Cập nhật phòng ban {department.department_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã phòng ban đã tồn tại trong chi nhánh") from exc
    db.refresh(department)
    return serialize_department(department)


@router.delete("/departments/{department_id}")
def delete_department(department_id: int, request: Request, db: Session = Depends(get_db)):
    department = db.query(OrgDepartment).filter(OrgDepartment.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    if department.users:
        department.status = "inactive"
        log_action(db, request, "deactivate", "department", department_id, f"Ngừng hoạt động phòng ban {department.department_code}")
        db.commit()
        return {"status": "inactive", "id": department_id, "message": "Phòng ban còn người dùng nên đã chuyển sang ngừng hoạt động"}
    db.delete(department)
    log_action(db, request, "delete", "department", department_id, f"Xóa phòng ban {department.department_code}")
    db.commit()
    return {"status": "deleted", "id": department_id}


@router.get("/users")
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


@router.post("/users")
def create_user(payload: UserPayload, request: Request, db: Session = Depends(get_db)):
    validate_user_payload(db, payload)
    employee_code = clean_code(payload.employee_code)
    user = SystemUser(
        username=(payload.username or employee_code).strip().lower(),
        password_hash=hash_password(payload.password or "1"),
        employee_code=employee_code,
        credit_officer_code=clean_code(payload.credit_officer_code) or None,
        ipcas_username=clean_code(payload.ipcas_username).upper() or None,
        full_name=payload.full_name.strip(),
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        role_id=payload.role_id,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
        data_scope=payload.data_scope,
    )
    db.add(user)
    try:
        log_action(db, request, "create", "user", user.id, f"Thêm người dùng {user.username}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Tên đăng nhập hoặc mã nhân viên đã tồn tại") from exc
    db.refresh(user)
    return serialize_user(user)


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserPayload, request: Request, db: Session = Depends(get_db)):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    validate_user_payload(db, payload, user_id=user_id)
    employee_code = clean_code(payload.employee_code)
    user.username = (payload.username or employee_code).strip().lower()
    if payload.password:
        user.password_hash = hash_password(payload.password)
    user.employee_code = employee_code
    user.credit_officer_code = clean_code(payload.credit_officer_code) or None
    user.ipcas_username = clean_code(payload.ipcas_username).upper() or None
    user.full_name = payload.full_name.strip()
    user.branch_id = payload.branch_id
    user.department_id = payload.department_id
    user.role_id = payload.role_id
    user.is_active = payload.is_active
    user.is_superuser = payload.is_superuser
    user.data_scope = payload.data_scope
    try:
        log_action(db, request, "update", "user", user.id, f"Cập nhật người dùng {user.username}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Tên đăng nhập hoặc mã nhân viên đã tồn tại") from exc
    db.refresh(user)
    return serialize_user(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản quản trị mặc định")
    db.delete(user)
    log_action(db, request, "delete", "user", user_id, f"Xóa người dùng {user.username}")
    db.commit()
    return {"status": "deleted", "id": user_id}


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    user.password_hash = hash_password("1")
    log_action(db, request, "reset_password", "user", user.id, f"Reset mật khẩu người dùng {user.username}")
    db.commit()
    return {"id": user.id, "status": "password_reset", "default_password": "1"}


@router.post("/users/{user_id}/toggle-active")
def toggle_user_active(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(SystemUser).filter(SystemUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.username == "admin" and user.is_active:
        raise HTTPException(status_code=400, detail="Không thể khóa tài khoản quản trị mặc định")
    user.is_active = not user.is_active
    action = "unlock" if user.is_active else "lock"
    log_action(db, request, action, "user", user.id, f"{'Mở khóa' if user.is_active else 'Khóa'} người dùng {user.username}")
    db.commit()
    return serialize_user(user)


@router.get("/roles")
def list_roles(
    keyword: str | None = None,
    permission_group: str | None = None,
    permission_code: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(SystemRole)
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
    return [serialize_role(item) for item in roles]


def sync_role_permissions(db: Session, role: SystemRole, permission_codes: list[str]) -> None:
    db.query(SystemRolePermission).filter(SystemRolePermission.role_id == role.id).delete()
    permissions = db.query(SystemPermission).filter(SystemPermission.permission_code.in_(permission_codes)).all()
    for permission in permissions:
        db.add(SystemRolePermission(role_id=role.id, permission_id=permission.id))


@router.post("/roles")
def create_role(payload: RolePayload, request: Request, db: Session = Depends(get_db)):
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
        log_action(db, request, "create", "role", role.id, f"Thêm nhóm quyền {role.role_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã nhóm quyền đã tồn tại") from exc
    db.refresh(role)
    return serialize_role(role)


@router.put("/roles/{role_id}")
def update_role(role_id: int, payload: RolePayload, request: Request, db: Session = Depends(get_db)):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm quyền")
    role.role_code = payload.role_code.strip().upper()
    role.role_name = payload.role_name.strip()
    role.description = payload.description
    try:
        sync_role_permissions(db, role, payload.permission_codes)
        log_action(db, request, "update", "role", role.id, f"Cập nhật nhóm quyền {role.role_code}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Mã nhóm quyền đã tồn tại") from exc
    db.refresh(role)
    return serialize_role(role)


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, request: Request, db: Session = Depends(get_db)):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm quyền")
    if role.users:
        raise HTTPException(status_code=400, detail="Nhóm quyền còn người dùng, không thể xóa")
    db.query(SystemRolePermission).filter(SystemRolePermission.role_id == role.id).delete()
    db.delete(role)
    log_action(db, request, "delete", "role", role_id, f"Xóa nhóm quyền {role.role_code}")
    db.commit()
    return {"status": "deleted", "id": role_id}


@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db)):
    rows = db.query(SystemPermission).order_by(SystemPermission.permission_group, SystemPermission.permission_code).all()
    return [serialize_permission(item) for item in rows]


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


@router.get("/audit-logs")
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
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in rows
    ]


@router.get("/users/warnings")
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
    return {
        "missing_role": missing_role,
        "missing_department": missing_department,
        "duplicate_ipcas": [{"ipcas_username": item[0], "count": item[1]} for item in duplicate_ipcas_rows],
    }


@router.get("/users/warnings/details")
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
    else:
        raise HTTPException(status_code=400, detail="Loại cảnh báo không hợp lệ")

    return [serialize_user(item) for item in query.order_by(SystemUser.full_name).limit(500).all()]


def save_temp_upload(file: UploadFile) -> Path:
    suffix = ".xlsx"
    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        return Path(tmp.name)


@router.post("/import/branches")
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


@router.post("/import/users")
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
            db.add(SystemUser(password_hash=default_hash, **payload))
        else:
            for key, value in payload.items():
                setattr(user, key, value)
        count += 1
    log_action(db, request, "import", "user", None, f"Import {count} cán bộ từ Excel")
    db.commit()
    return {"status": "ok", "rows": count}


@router.get("/organization-tree")
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
