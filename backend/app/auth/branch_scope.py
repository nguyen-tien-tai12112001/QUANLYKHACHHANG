from dataclasses import dataclass

from fastapi import HTTPException

from app.auth.permissions import SCOPES
from app.auth.schemas import CurrentUser


@dataclass
class BranchScope:
    ma_cn: str | None
    ma_pgd: str | None


def resolve_branch_scope(
    user: CurrentUser,
    requested_ma_cn: str | None = None,
    requested_ma_pgd: str | None = None,
) -> BranchScope:
    if user.can_view_all_branches():
        return BranchScope(ma_cn=requested_ma_cn, ma_pgd=requested_ma_pgd)

    home_cn = user.ma_cn
    home_pgd = user.ma_pgd
    allowed_branches = user.allowed_branches or ([home_cn] if home_cn else [])
    allowed_pgds = user.allowed_pgds or ([home_pgd] if home_pgd else [])

    if user.scope == SCOPES["PGD"]:
        if requested_ma_cn and requested_ma_cn != home_cn:
            raise HTTPException(status_code=403, detail="Không có quyền xem chi nhánh này")
        if requested_ma_pgd and requested_ma_pgd != home_pgd:
            raise HTTPException(status_code=403, detail="Không có quyền xem PGD này")
        return BranchScope(ma_cn=home_cn, ma_pgd=home_pgd)

    if requested_ma_cn and allowed_branches and requested_ma_cn not in allowed_branches:
        raise HTTPException(status_code=403, detail="Không có quyền xem chi nhánh này")

    ma_cn = requested_ma_cn or home_cn
    ma_pgd = requested_ma_pgd
    if ma_pgd and allowed_pgds and ma_pgd not in allowed_pgds:
        ma_pgd = None

    return BranchScope(ma_cn=ma_cn, ma_pgd=ma_pgd)
