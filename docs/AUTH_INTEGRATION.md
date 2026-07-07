# Tích hợp phân quyền (Auth Integration)

Tài liệu cho **module quản trị / đăng nhập** gắn vào hệ thống QUANLYKHACHHANG.

## Tổng quan

| Lớp | Vị trí | Việc module quản trị cần làm |
|-----|--------|------------------------------|
| Frontend bridge | `frontend/src/auth/authBridge.js` | Gọi `registerAuthIntegration()` khi app khởi động |
| Frontend context | `frontend/src/auth/AuthProvider.jsx` | Đã bọc sẵn trong `App.jsx` |
| Backend resolver | `backend/app/auth/provider.py` | Gọi `register_auth_resolver()` khi FastAPI startup |
| API user | `GET /api/auth/me` | Trả `CurrentUser` hoặc thay resolver |
| Phạm vi CN/PGD | `branch_scope.py` + `dependencies.py` | Đã gắn vào API dashboard & summary |

**Hiện tại (chưa gắn module quản trị):** user dev toàn quyền, xem được toàn tỉnh.

---

## Contract `CurrentUser`

```json
{
  "id": "u123",
  "username": "nguyenvana",
  "display_name": "Nguyễn Văn A",
  "scope": "branch",
  "ma_cn": "CN01",
  "ma_pgd": null,
  "allowed_branches": ["CN01"],
  "allowed_pgds": [],
  "permissions": ["dashboard.view", "report.view", "branch.view_own"]
}
```

### `scope`

| Giá trị | Ý nghĩa |
|---------|---------|
| `province` | Xem toàn tỉnh |
| `branch` | Gắn một chi nhánh |
| `pgd` | Gắn một PGD |

### Permissions

- `dashboard.view`, `report.view`, `import.view`, `import.manage`
- `branch.view_all` — sếp toàn tỉnh
- `branch.view_own` — cán bộ CN mình
- `data.export`, `admin`

Định nghĩa: `frontend/src/auth/permissions.js`, `backend/app/auth/permissions.py`

---

## Frontend

```javascript
import { registerAuthIntegration } from './auth';

registerAuthIntegration({
  getAccessToken: () => keycloak.token,
  getCurrentUser: () => ({ id, username, scope, ma_cn, permissions }),
  onUnauthorized: () => keycloak.login(),
});
```

Hook: `useAuth`, `usePermissions`, `useBranchScope`, `useBranchFilters`

---

## Backend

```python
from app.auth import register_auth_resolver, CurrentUser

async def jwt_resolver(request: Request) -> CurrentUser:
    ...

@app.on_event("startup")
def setup_auth():
    register_auth_resolver(jwt_resolver)
```

API enforce scope: `/api/imports/summary`, `/api/dashboard/summary`, `/api/dashboard/trends`

---

## Ma trận hành vi

| User | permissions | Mặc định | Đổi CN? |
|------|-------------|----------|---------|
| Sếp tỉnh | `branch.view_all` | Toàn tỉnh | Có |
| Trưởng CN | `branch.view_own`, `ma_cn=CN01` | CN01 | Không |
| Cán bộ PGD | `scope=pgd` | PGD cố định | Không |
