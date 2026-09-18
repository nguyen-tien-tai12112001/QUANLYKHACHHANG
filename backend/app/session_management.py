from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserSession


SESSION_REASON_MESSAGES = {
    "idle_timeout": "Phiên đăng nhập đã kết thúc do không hoạt động trong 30 phút",
    "new_login": "Phiên đăng nhập đã kết thúc vì tài khoản được sử dụng trên thiết bị khác",
    "authorization_changed": "Phiên đăng nhập đã kết thúc vì quyền hoặc phạm vi dữ liệu vừa được cập nhật",
    "password_reset": "Phiên đăng nhập đã kết thúc vì mật khẩu vừa được quản trị viên đặt lại",
    "password_changed": "Phiên đăng nhập đã kết thúc vì mật khẩu tài khoản vừa được thay đổi",
    "account_locked": "Phiên đăng nhập đã kết thúc vì tài khoản đã bị quản trị viên khóa",
    "admin_revoked": "Phiên đăng nhập đã bị quản trị viên kết thúc",
    "logout": "Bạn đã đăng xuất khỏi hệ thống",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def session_is_idle(item: UserSession, now: datetime | None = None) -> bool:
    last_activity = ensure_aware(item.last_activity_at)
    if last_activity is None:
        return True
    return (now or utc_now()) - last_activity >= timedelta(minutes=settings.SESSION_IDLE_MINUTES)


def revoke_session(item: UserSession, reason: str, actor: str | None = None, now: datetime | None = None) -> None:
    if item.revoked_at is None:
        item.revoked_at = now or utc_now()
    item.revoke_reason = reason
    item.revoked_by = actor


def revoke_user_sessions(
    db: Session,
    user_id: int,
    reason: str,
    actor: str | None = None,
    *,
    except_session_id: str | None = None,
) -> int:
    query = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    )
    if except_session_id:
        query = query.filter(UserSession.id != except_session_id)
    items = query.all()
    now = utc_now()
    for item in items:
        revoke_session(item, reason, actor, now)
    return len(items)


def reason_message(reason: str | None) -> str:
    return SESSION_REASON_MESSAGES.get(str(reason or ""), "Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại")
