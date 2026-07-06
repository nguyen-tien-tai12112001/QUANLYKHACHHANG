from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import check_database_connection


router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health_check():
    database_connected, error_message = check_database_connection()

    if database_connected:
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "database": "connected",
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

