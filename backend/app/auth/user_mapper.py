from app.auth.permissions import expand_denied_permissions
from app.auth.schemas import CurrentUser
from app.models import SystemUser


def permission_code_sets(user: SystemUser) -> tuple[set[str], set[str], set[str], set[str]]:
    """Return role, direct allow, explicit deny and effective deny permissions."""

    role_codes = {
        item.permission.permission_code
        for item in (user.role.permissions if user.role else [])
        if item.permission
    }
    direct_allow_codes = {
        item.permission.permission_code
        for item in user.permission_grants
        if item.permission and str(getattr(item, "effect", "allow") or "allow").lower() != "deny"
    }
    explicit_deny_codes = {
        item.permission.permission_code
        for item in user.permission_grants
        if item.permission and str(getattr(item, "effect", "allow") or "allow").lower() == "deny"
    }
    effective_deny_codes = expand_denied_permissions(explicit_deny_codes)
    return role_codes, direct_allow_codes, explicit_deny_codes, effective_deny_codes


def effective_permission_codes(user: SystemUser) -> list[str]:
    role_codes, direct_allow_codes, _, denied_codes = permission_code_sets(user)
    permission_codes = (role_codes | direct_allow_codes) - denied_codes
    if user.is_superuser:
        permission_codes.add("admin")
    return sorted(permission_codes)


def system_user_to_current_user(user: SystemUser) -> CurrentUser:
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
    return CurrentUser(
        id=str(user.id),
        username=user.username,
        display_name=user.full_name,
        employee_code=user.employee_code,
        scope=scope,
        ma_cn=branch_code,
        ma_pgd=department_code if scope in {"pgd", "own"} else None,
        allowed_branches=[branch_code] if branch_code and scope != "province" else [],
        allowed_pgds=[department_code] if department_code and scope in {"pgd", "own"} else [],
        permissions=permission_codes,
        must_change_password=bool(user.must_change_password),
    )
