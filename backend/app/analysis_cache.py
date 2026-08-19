"""Redis cache for read-only C360 analysis sessions.

Redis is an optional acceleration layer. Any connection/read/write failure falls
back to PostgreSQL without changing the API response or business data.
"""

from __future__ import annotations

import hashlib
import json
import logging
from urllib.parse import urlencode

from redis import Redis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings


logger = logging.getLogger(__name__)

CACHEABLE_PATHS = (
    "/api/dashboard/summary",
    "/api/dashboard/trends",
    "/api/dashboard/insights",
    "/api/dashboard/business-analytics",
    "/api/dashboard/business-trends",
    "/api/customer-processing/profiles",
    "/api/customer-processing/profile-summary",
    "/api/customer-processing/profile-groups",
    "/api/customer-processing/profile-quality",
    "/api/customer-processing/profile-filter-options",
    "/api/customer-processing/profile-field-coverage",
    "/api/customer-processing/period-comparison",
)


def _redis() -> Redis:
    return Redis.from_url(
        settings.REDIS_URL,
        socket_connect_timeout=0.35,
        socket_timeout=0.75,
        decode_responses=False,
    )


def cache_status() -> tuple[bool, str | None]:
    try:
        return bool(_redis().ping()), None
    except Exception as exc:  # Redis is deliberately non-critical.
        return False, str(exc)


def get_shared_analysis_cache(namespace: str, key_parts) -> dict | None:
    """Read a permission-resolved aggregate cached by endpoint scope."""
    digest = hashlib.sha256(repr(key_parts).encode()).hexdigest()
    try:
        raw = _redis().get(f"c360:shared:{namespace}:{digest}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_shared_analysis_cache(namespace: str, key_parts, payload: dict) -> None:
    digest = hashlib.sha256(repr(key_parts).encode()).hexdigest()
    try:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        if len(raw) <= settings.ANALYSIS_CACHE_MAX_BYTES:
            _redis().setex(f"c360:shared:{namespace}:{digest}", settings.ANALYSIS_CACHE_TTL, raw)
    except Exception as exc:
        logger.debug("Shared analysis cache write skipped: %s", exc)


class AnalysisSessionCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        session_id = request.headers.get("X-Analysis-Session", "").strip()
        is_cacheable = (
            request.method == "GET"
            and bool(session_id)
            and request.url.path.startswith(CACHEABLE_PATHS)
        )
        if not is_cacheable:
            return await call_next(request)

        username = request.headers.get("X-C360-User", "anonymous")
        authorization = request.headers.get("Authorization", "")
        identity = hashlib.sha256(f"{username}|{authorization}".encode()).hexdigest()[:20]
        # Axios/object construction can emit the same filters in a different
        # query-string order. Canonicalize them so those requests share a hit.
        canonical_query = urlencode(sorted(request.query_params.multi_items()))
        request_signature = f"{request.url.path}?{canonical_query}"
        digest = hashlib.sha256(request_signature.encode()).hexdigest()
        key = f"c360:analysis:{identity}:{session_id}:{digest}"
        redis_client = _redis()

        try:
            cached = redis_client.get(key)
        except Exception:
            cached = None
        if cached is not None:
            return Response(
                content=cached,
                status_code=200,
                media_type="application/json",
                headers={"X-Analysis-Cache": "HIT"},
            )

        response = await call_next(request)
        content_type = response.headers.get("content-type", "")
        if response.status_code != 200 or "application/json" not in content_type:
            response.headers["X-Analysis-Cache"] = "BYPASS"
            return response

        body = b"".join([chunk async for chunk in response.body_iterator])
        headers = dict(response.headers)
        headers["X-Analysis-Cache"] = "MISS"
        if len(body) <= settings.ANALYSIS_CACHE_MAX_BYTES:
            try:
                redis_client.setex(key, settings.ANALYSIS_CACHE_TTL, body)
            except Exception as exc:
                logger.debug("Analysis cache write skipped: %s", exc)
                headers["X-Analysis-Cache"] = "UNAVAILABLE"
        else:
            headers["X-Analysis-Cache"] = "TOO-LARGE"
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type=None,
            background=response.background,
        )
