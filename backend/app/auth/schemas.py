from pydantic import BaseModel, Field


class CurrentUser(BaseModel):
    """Shape user mà module quản trị phải trả về."""

    id: str
    username: str
    display_name: str | None = None
    employee_code: str | None = None
    scope: str = "province"
    ma_cn: str | None = None
    ma_pgd: str | None = None
    allowed_branches: list[str] = Field(default_factory=list)
    allowed_pgds: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    must_change_password: bool = False

    @classmethod
    def dev_superuser(cls) -> "CurrentUser":
        from app.auth.permissions import PERMISSIONS

        return cls(
            id="dev",
            username="dev",
            display_name="Dev (toàn quyền)",
            scope="province",
            permissions=list(PERMISSIONS.values()),
        )

    def can_view_all_branches(self) -> bool:
        from app.auth.permissions import PERMISSIONS

        return (
            PERMISSIONS["ADMIN"] in self.permissions
            or PERMISSIONS["BRANCH_VIEW_ALL"] in self.permissions
            or self.scope == "province"
        )
