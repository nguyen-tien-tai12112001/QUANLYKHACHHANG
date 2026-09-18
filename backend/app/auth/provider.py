from collections.abc import Callable, Awaitable

from fastapi import HTTPException, Request

from app.auth.user_mapper import system_user_to_current_user
from app.auth.schemas import CurrentUser
from app.database import SessionLocal
from app.models import SystemUser, UserSession
from app.security import decode_access_token
from app.session_management import reason_message, revoke_session, session_is_idle

AuthResolver = Callable[[Request], CurrentUser | Awaitable[CurrentUser]]

_resolver: AuthResolver | None = None


def register_auth_resolver(resolver: AuthResolver) -> None:
    """Module quản trị gọi 1 lần khi startup để gắn JWT/session validator."""

    global _resolver
    _resolver = resolver


async def resolve_current_user(request: Request) -> CurrentUser:
    if _resolver is not None:
        user = _resolver(request)
        if hasattr(user, "__await__"):
            user = await user
        return user
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn") from exc

    with SessionLocal() as db:
        user = db.query(SystemUser).filter(SystemUser.id == int(payload["sub"])).first()
        if not user:
            raise HTTPException(status_code=401, detail={"code": "ACCOUNT_NOT_FOUND", "message": "Tài khoản không còn tồn tại trên hệ thống"})
        session_id = str(payload.get("sid") or "")
        login_session = db.query(UserSession).filter(
            UserSession.id == session_id,
            UserSession.user_id == user.id,
        ).first() if session_id else None
        if not login_session:
            raise HTTPException(status_code=401, detail={"code": "SESSION_INVALID", "message": "Phiên đăng nhập cũ không còn hiệu lực, vui lòng đăng nhập lại"})
        if login_session.revoked_at is not None:
            raise HTTPException(status_code=401, detail={"code": str(login_session.revoke_reason or "SESSION_REVOKED").upper(), "message": reason_message(login_session.revoke_reason)})
        if not user.is_active:
            revoke_session(login_session, "account_locked", "system")
            db.commit()
            raise HTTPException(status_code=401, detail={"code": "ACCOUNT_LOCKED", "message": "Tài khoản đã bị quản trị viên khóa"})
        if session_is_idle(login_session):
            revoke_session(login_session, "idle_timeout", "system")
            db.commit()
            raise HTTPException(status_code=401, detail={"code": "IDLE_TIMEOUT", "message": reason_message("idle_timeout")})
        if int(payload.get("ver") or 0) != int(user.auth_version or 1):
            revoke_session(login_session, "authorization_changed", "system")
            db.commit()
            raise HTTPException(status_code=401, detail={"code": "AUTHORIZATION_CHANGED", "message": reason_message("authorization_changed")})
        current_user = system_user_to_current_user(user)
        allowed_during_password_change = {
            ("GET", "/api/auth/me"),
            ("GET", "/api/auth/profile"),
            ("POST", "/api/auth/change-password"),
            ("POST", "/api/auth/session/heartbeat"),
            ("POST", "/api/auth/logout"),
        }
        if current_user.must_change_password and (request.method.upper(), request.url.path) not in allowed_during_password_change:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "PASSWORD_CHANGE_REQUIRED",
                    "message": "Bạn cần đổi mật khẩu tạm thời trước khi sử dụng hệ thống",
                },
            )
        return current_user
