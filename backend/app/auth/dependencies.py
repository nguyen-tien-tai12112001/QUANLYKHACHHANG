from fastapi import Depends, Query, Request

from app.auth.branch_scope import BranchScope, resolve_branch_scope
from app.auth.provider import resolve_current_user
from app.auth.schemas import CurrentUser


async def get_current_user(request: Request) -> CurrentUser:
    return await resolve_current_user(request)


async def get_branch_scope(
    request: Request,
    ma_cn: str | None = Query(default=None),
    ma_pgd: str | None = Query(default=None),
    branch_code: str | None = Query(default=None),
    pgd_code: str | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
) -> BranchScope:
    # API cũ dùng ma_cn/ma_pgd, API C360 dùng branch_code/pgd_code. Chuẩn hóa tại
    # một điểm để không endpoint nào vô tình bỏ qua phạm vi người dùng đã chọn.
    return resolve_branch_scope(user, ma_cn or branch_code, ma_pgd or pgd_code)
