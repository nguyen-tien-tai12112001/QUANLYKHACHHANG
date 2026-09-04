from collections.abc import Callable, Awaitable

from fastapi import HTTPException, Request

from app.auth.user_mapper import system_user_to_current_user
from app.auth.schemas import CurrentUser
from app.database import SessionLocal
from app.models import SystemUser
from app.security import decode_access_token

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
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc đã bị khóa")
        if int(payload.get("ver") or 0) != int(user.auth_version or 1):
            raise HTTPException(status_code=401, detail="Quyền truy cập đã thay đổi, vui lòng đăng nhập lại")
        current_user = system_user_to_current_user(user)
        allowed_during_password_change = {
            ("GET", "/api/auth/me"),
            ("GET", "/api/auth/profile"),
            ("POST", "/api/auth/change-password"),
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
