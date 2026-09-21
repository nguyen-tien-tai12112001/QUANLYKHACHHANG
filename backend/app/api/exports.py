from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.export_progress import get_export_progress


router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("/{task_id}")
def export_status(task_id: str, user: CurrentUser = Depends(get_current_user)):
    return get_export_progress(task_id, user)
