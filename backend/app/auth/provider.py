from collections.abc import Callable, Awaitable

from fastapi import HTTPException, Request

from app.auth.schemas import CurrentUser

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
    return CurrentUser.dev_superuser()
