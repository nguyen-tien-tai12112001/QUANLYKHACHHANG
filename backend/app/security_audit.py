"""Fail-safe helpers for security access auditing."""

from __future__ import annotations

from fastapi import Request

from app.auth.schemas import CurrentUser
from app.database import SessionLocal
from app.models import AuditLog


def request_ip(request: Request) -> str | None:
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",", 1)[0].strip()
    return forwarded or (request.client.host if request.client else None)


def record_security_event(
    request: Request,
    user: CurrentUser,
    action: str,
    entity_type: str,
    entity_id: str | int | None = None,
    description: str | None = None,
    metadata: dict | None = None,
) -> None:
    details = {
        "ip_address": request_ip(request),
        "method": request.method,
        "path": request.url.path,
        **(metadata or {}),
    }
    try:
        with SessionLocal() as db:
            db.add(AuditLog(
                actor_username=user.username,
                actor_name=user.display_name,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                description=description,
                after_data=details,
            ))
            db.commit()
    except Exception:
        # A temporary audit storage failure must not leak requested data or turn
        # a successful read into a misleading business error.
        return


def record_permission_denied(request: Request, user: CurrentUser, permission_codes) -> None:
    codes = sorted({str(code) for code in permission_codes or [] if str(code)})
    record_security_event(
        request,
        user,
        "access_denied",
        "permission",
        ",".join(codes)[:80],
        "Từ chối truy cập do thiếu quyền chức năng",
        {"required_permissions": codes},
    )
