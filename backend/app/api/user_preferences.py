from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.database import get_db
from app.models import UserPinnedCustomer


router = APIRouter(prefix="/api/user-preferences", tags=["user-preferences"])


class PinnedCustomerPayload(BaseModel):
    customer_code: str = Field(min_length=1, max_length=32)
    customer_name: str | None = Field(default=None, max_length=255)
    branch_code: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=500)


def _user_id(user: CurrentUser) -> int:
    try:
        return int(user.id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Tài khoản hiện tại không hỗ trợ lưu cấu hình cá nhân")


def _serialize(row: UserPinnedCustomer) -> dict:
    return {
        "id": row.id,
        "customer_code": row.customer_code,
        "customer_name": row.customer_name,
        "branch_code": row.branch_code,
        "note": row.note,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.get("/pinned-customers")
def list_pinned_customers(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(UserPinnedCustomer)
        .filter(UserPinnedCustomer.user_id == _user_id(user))
        .order_by(UserPinnedCustomer.updated_at.desc(), UserPinnedCustomer.id.desc())
        .all()
    )
    return {"total": len(rows), "items": [_serialize(row) for row in rows]}


@router.post("/pinned-customers")
def pin_customer(payload: PinnedCustomerPayload, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = _user_id(user)
    code = payload.customer_code.strip()
    row = db.query(UserPinnedCustomer).filter(
        UserPinnedCustomer.user_id == user_id,
        UserPinnedCustomer.customer_code == code,
    ).first()
    if row is None:
        row = UserPinnedCustomer(user_id=user_id, customer_code=code)
        db.add(row)
    if payload.customer_name and payload.customer_name.strip():
        row.customer_name = payload.customer_name.strip()
    if payload.branch_code and payload.branch_code.strip():
        row.branch_code = payload.branch_code.strip()
    row.note = payload.note.strip() if payload.note and payload.note.strip() else None
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/pinned-customers/{customer_code}")
def unpin_customer(customer_code: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    deleted = db.query(UserPinnedCustomer).filter(
        UserPinnedCustomer.user_id == _user_id(user),
        UserPinnedCustomer.customer_code == customer_code.strip(),
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "deleted": bool(deleted)}
