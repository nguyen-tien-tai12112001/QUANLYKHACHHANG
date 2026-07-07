"""Contract phân quyền — module quản trị thay thế provider, không sửa API nghiệp vụ."""

from app.auth.permissions import PERMISSIONS
from app.auth.schemas import CurrentUser
from app.auth.provider import register_auth_resolver, resolve_current_user

__all__ = [
    "PERMISSIONS",
    "CurrentUser",
    "register_auth_resolver",
    "resolve_current_user",
]
