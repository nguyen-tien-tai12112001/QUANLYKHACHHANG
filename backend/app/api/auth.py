from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.database import get_db
from app.models import SystemRole, SystemUser
from app.security import verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


def serialize_user(user: SystemUser) -> dict:
    role = user.role.role_code if isinstance(user.role, SystemRole) else None
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "employee_code": user.employee_code,
        "ipcas_username": user.ipcas_username,
        "is_superuser": user.is_superuser,
        "role": role,
        "role_name": user.role.role_name if user.role else None,
        "branch": user.branch.branch_name if user.branch else None,
        "branch_code": user.branch.branch_code if user.branch else None,
        "department": user.department.department_name if user.department else None,
        "department_code": user.department.department_code if user.department else None,
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
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
        .first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {"user": serialize_user(user)}


@router.get("/me")
async def auth_me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
