from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def auth_me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Frontend gọi để lấy user + permissions. Module quản trị thay resolver là đủ."""

    return user
