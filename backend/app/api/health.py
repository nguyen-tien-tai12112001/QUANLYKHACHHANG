from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import check_database_connection
from app.analysis_cache import cache_status


router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health_check():
    database_connected, error_message = check_database_connection()
    redis_connected, redis_error = cache_status()

    if database_connected:
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "database": "connected",
            "redis": "connected" if redis_connected else "unavailable",
            "redis_optional": True,
            **({"redis_message": redis_error} if redis_error else {}),
        }

    return JSONResponse(
        status_code=503,
        content={
            "status": "error",
            "app": settings.APP_NAME,
            "database": "disconnected",
            "message": error_message,
        },
    )
