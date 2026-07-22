# CI/CD lên máy chủ Windows 11 bằng GitHub Actions và GHCR

Tài liệu này áp dụng cho kiến trúc:

```text
Push main
   -> GitHub Actions build backend/frontend
   -> Push hai image lên GHCR
   -> Windows self-hosted runner nhận job deploy
   -> Pull image theo commit SHA
   -> Backup PostgreSQL
   -> Alembic upgrade head
   -> Restart backend, chờ healthy
   -> Restart frontend, kiểm tra /api/health
```

## 1. File CI/CD trong repository

- `.github/workflows/deploy-production.yml`: workflow build và deploy.
- `docker-compose.prod.yml`: production Compose chỉ pull image từ GHCR.
- `.env.example`: mẫu cấu hình, không chứa mật khẩu thật.

Hai image:

```text
ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-backend
ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-frontend
```

Mỗi lần build tạo tag `latest` và tag commit SHA. Deploy luôn dùng SHA để có
thể xác định chính xác phiên bản và rollback.

## 2. Chuẩn bị Windows 11

Cài Git, Docker Desktop và bật:

- Use the WSL 2 based engine.
- Start Docker Desktop when you sign in.

Tắt sleep của máy. Mở PowerShell bằng tài khoản sẽ chạy runner:

```powershell
docker version
docker compose version
docker info
```

Tạo thư mục cố định:

```powershell
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\uploads
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\exports
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\documents
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\backups
New-Item -ItemType Directory -Force D:\ActionsRunner
```

Dữ liệu không được đặt trong thư mục `_work` của runner vì checkout có thể dọn
workspace giữa các job.

## 3. Tạo production `.env`

Tạo `D:\Apps\QUANLYKHACHHANG\.env`:

```env
POSTGRES_DB=qlkh_db
POSTGRES_USER=qlkh_user
POSTGRES_PASSWORD=THAY_BANG_MAT_KHAU_MANH
DATABASE_URL=postgresql+psycopg://qlkh_user:THAY_BANG_MAT_KHAU_MANH@postgres:5432/qlkh_db

APP_NAME=QUANLYKHACHHANG
CORS_ORIGINS=http://localhost
IMPORT_WORKER_COUNT=1
IMPORT_CHUNK_SIZE=20000
DELETE_UPLOAD_AFTER_SUCCESS=true
PROCESSING_WORK_MEM=256MB

APP_DATA_DIR=D:/Apps/QUANLYKHACHHANG/data
IMAGE_TAG=latest
```

Nếu có tên miền, đổi `CORS_ORIGINS` thành origin thật. Mật khẩu trong
`DATABASE_URL` phải giống `POSTGRES_PASSWORD`; ký tự đặc biệt trong URL phải
được URL-encode.

Không đưa file này lên GitHub hoặc GitHub Actions secret. Workflow đọc trực
tiếp file đã được quản trị viên tạo trên máy chủ.

## 4. Đăng ký Windows self-hosted runner

Trên GitHub mở:

```text
Repository -> Settings -> Actions -> Runners
-> New self-hosted runner -> Windows -> x64
```

GitHub cung cấp lệnh tải runner và registration token mới. Chạy đúng các lệnh
đó trong `D:\ActionsRunner`, sau đó cấu hình với label `production`:

```powershell
cd D:\ActionsRunner
.\config.cmd `
  --url https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG `
  --token TOKEN_TAM_THOI_GITHUB_CAP `
  --name qlkh-production-windows `
  --labels production
```

Chọn `_work` làm work folder. Thử tương tác trước:

```powershell
.\run.cmd
```

Runner trên GitHub phải chuyển sang `Idle`. Sau khi xác nhận tài khoản này chạy
được `docker info`, cấu hình runner thành Windows Service theo lựa chọn của
`config.cmd`. Service phải chạy bằng chính tài khoản Windows có quyền dùng
Docker Desktop và ghi vào `D:\Apps\QUANLYKHACHHANG`.

Nếu đã cấu hình runner mà không chọn service, thực hiện remove theo lệnh GitHub
cung cấp rồi cấu hình lại; không tự sao chép registration token cũ.

## 5. Tạo GitHub Environment

Tạo environment:

```text
Repository -> Settings -> Environments -> New environment -> production
```

Khuyến nghị:

- Chỉ cho nhánh `main` deploy.
- Bật required reviewer nếu gói GitHub hỗ trợ.
- Không cho workflow từ pull request không tin cậy chạy self-hosted runner.

Workflow có concurrency group nên hai deployment không chạy Alembic cùng lúc.

Sau khi runner, Docker Desktop và `.env` production đã sẵn sàng, tạo repository
variable:

```text
Repository -> Settings -> Secrets and variables -> Actions
-> Variables -> New repository variable
```

```text
Name: ENABLE_PRODUCTION_DEPLOY
Value: true
```

Trước khi variable này bằng `true`, workflow vẫn build/push hai image nhưng bỏ
qua job deploy. Đây là chốt an toàn tránh deploy khi server chưa cấu hình xong.
Muốn tạm dừng deployment tự động, đổi variable thành `false`.

## 6. Kiểm tra GHCR

Workflow build dùng `GITHUB_TOKEN` với `packages: write`; job deploy dùng
`packages: read`. Sau lần build đầu, vào GitHub Packages của tài khoản, mở hai
package và kiểm tra chúng được liên kết với repository `QUANLYKHACHHANG`.

Repository/package private vẫn pull được trong workflow khi package cấp quyền
cho repository này.

## 7. Chuyển dữ liệu sang server lần đầu

Nếu tạo database mới, chỉ cần để thư mục data trống và chạy workflow.

Nếu chuyển dữ liệu hiện tại:

1. Tạo backup trên máy cũ bằng `backup-db.bat`.
2. Chép file qua kênh nội bộ vào `data\backups` trên server.
3. Chạy PostgreSQL production thủ công.
4. Restore trước lần deploy toàn bộ.
5. Chép nội dung `backend/uploads`, `backend/exports` và file Excel seed cần
   thiết qua kênh bảo mật, không qua Git.

Có thể chạy PostgreSQL production bằng source checkout tạm thời:

```powershell
$env:IMAGE_TAG = 'latest'
docker compose `
  --env-file D:\Apps\QUANLYKHACHHANG\.env `
  -f .\docker-compose.prod.yml up -d postgres
```

## 8. Chạy deployment đầu tiên

Đảm bảo:

- Docker Desktop đang chạy.
- Runner là `Idle`.
- `.env` tồn tại đúng vị trí.
- Cổng 80 chưa bị IIS hoặc ứng dụng khác chiếm.
- Repository variable `ENABLE_PRODUCTION_DEPLOY` bằng `true`.

Trên GitHub:

```text
Actions -> Build and deploy production -> Run workflow -> main
```

Theo dõi ba job logic:

1. Build backend image.
2. Build frontend image.
3. Deploy to Windows production server.

Job deploy sẽ:

- Copy production Compose vào `D:\Apps\QUANLYKHACHHANG`.
- Pull hai image theo `${{ github.sha }}`.
- Bật và chờ PostgreSQL healthy.
- Tạo custom-format backup trong `data\backups`.
- Chạy `alembic upgrade head` bằng backend image mới.
- Restart backend và đợi healthy.
- Restart frontend.
- Kiểm tra `/api/health`.

## 9. Kiểm tra trên server

```powershell
cd D:\Apps\QUANLYKHACHHANG

docker compose --env-file .env -f docker-compose.prod.yml ps
Invoke-RestMethod http://localhost/api/health
Invoke-WebRequest -UseBasicParsing http://localhost/api/docs
```

Ba container phải `healthy`. Health API phải trả `status=ok` và
`database=connected`.

## 10. Quy trình cập nhật bình thường

Sau khi cấu hình lần đầu, chỉ cần:

```powershell
git add .
git commit -m "mo ta thay doi"
git push origin main
```

Không cần pull source hoặc build source thủ công trên server. Runner chỉ nhận
production Compose; ứng dụng chạy từ image GHCR.

## 11. Rollback image

Lấy commit SHA cũ từ GitHub Actions hoặc GHCR. Trên server:

```powershell
cd D:\Apps\QUANLYKHACHHANG
$env:IMAGE_TAG = 'COMMIT_SHA_CU'

docker compose --env-file .env -f docker-compose.prod.yml pull backend frontend
docker compose --env-file .env -f docker-compose.prod.yml up -d backend frontend
```

Không tự động chạy `alembic downgrade`. Nếu migration không tương thích ngược,
phải lập kế hoạch restore file backup tương ứng.

## 12. Xử lý lỗi

Runner offline:

```powershell
Get-Service 'actions.runner.*'
docker info
```

Runner gọi Docker lỗi nhưng user gọi được: kiểm tra service có đang chạy bằng
đúng tài khoản Windows đã khởi động Docker Desktop hay không.

Cổng 80 bị chiếm:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 80
```

Backend hoặc migration lỗi:

```powershell
docker logs --tail 200 qlkh_backend
docker logs --tail 200 qlkh_postgres
```

GHCR báo denied: kiểm tra package liên kết repository, quyền `packages: read`
của deploy job và bước `docker/login-action`.

## 13. Bảo mật và vận hành

- Chỉ dùng runner cho repository private và workflow tin cậy.
- Không cho workflow pull request chạy job có label `production`.
- Không public PostgreSQL ra Internet.
- Không lưu `.env`, backup hoặc dữ liệu khách hàng trong Git.
- Sao chép backup sang ổ khác hoặc máy lưu trữ khác theo lịch.
- Tắt sleep và dùng UPS nếu máy chạy 24/7.
- Docker Desktop phải khởi động sau khi tài khoản Windows đăng nhập.
