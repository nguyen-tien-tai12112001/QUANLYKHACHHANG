# Triển khai CI/CD lên máy chủ Windows 11

Tài liệu này hướng dẫn tuần tự từ một máy Windows 11 mới đến khi dự án
`QUANLYKHACHHANG` tự động được triển khai bằng GitHub Actions và GHCR.

## 1. Kiến trúc triển khai

```text
Lập trình viên push nhánh main
                |
                v
GitHub-hosted runner build song song
        |                       |
        v                       v
Backend image             Frontend image
        |                       |
        +----------+------------+
                   v
          GitHub Container Registry
                   |
                   v
GitHub self-hosted runner trên Windows 11
                   |
                   +-- Pull image theo commit SHA
                   +-- Khởi động PostgreSQL
                   +-- Backup database
                   +-- Chạy Alembic migration
                   +-- Restart backend, chờ healthy
                   +-- Restart frontend
                   `-- Kiểm tra /api/health
```

Các image:

```text
ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-backend
ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-frontend
```

Mỗi image được gắn hai tag:

- `latest`: phiên bản mới nhất.
- Git commit SHA: phiên bản bất biến dùng để deploy và rollback.

Các file liên quan trong repository:

- `.github/workflows/deploy-production.yml`
- `docker-compose.prod.yml`
- `.env.example`

## 2. Yêu cầu máy chủ

Khuyến nghị:

- Windows 11 64-bit.
- CPU tối thiểu 4 nhân.
- RAM tối thiểu 8 GB, nên có 16 GB.
- SSD còn tối thiểu 50–100 GB.
- Tài khoản Windows có quyền Administrator.
- Internet ổn định để kết nối GitHub và GHCR.
- IP LAN cố định hoặc được router cấp DHCP reservation.

Nếu chuyển dữ liệu hiện tại, cần thêm dung lượng cho:

- PostgreSQL database.
- File backup database có thể lớn vài GB.
- File import/upload hiện có.
- Docker images và build cache.

## 3. Không cho Windows sleep

Vào:

```text
Settings -> System -> Power & battery -> Screen and sleep
```

Đặt sleep khi cắm nguồn thành `Never`.

Hoặc mở PowerShell Administrator:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

Máy bị sleep thì GitHub runner chuyển thành `Offline` và không nhận job deploy.

## 4. Cài Git for Windows

Tải từ:

```text
https://git-scm.com/download/win
```

Cài theo cấu hình mặc định. Mở PowerShell mới và kiểm tra:

```powershell
git --version
```

## 5. Cài Docker Desktop

Tải Docker Desktop:

```text
https://www.docker.com/products/docker-desktop/
```

Trong quá trình cài, chọn WSL 2 backend. Khởi động lại Windows nếu được yêu
cầu.

Mở Docker Desktop, vào `Settings -> General` và bật:

- Start Docker Desktop when you sign in.
- Use the WSL 2 based engine.

Nhấn `Apply & restart`.

Mở PowerShell bằng tài khoản sẽ chạy GitHub runner:

```powershell
docker --version
docker compose version
docker info
docker run --rm hello-world
```

Không tiếp tục nếu `docker info` chưa thành công.

## 6. Tạo thư mục production cố định

Chạy bằng đúng tài khoản Windows sẽ chạy runner:

```powershell
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\uploads
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\exports
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\documents
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\data\backups
New-Item -ItemType Directory -Force D:\ActionsRunner
```

Cấu trúc:

```text
D:\Apps\QUANLYKHACHHANG\
|-- .env
|-- docker-compose.prod.yml
`-- data\
    |-- uploads\
    |-- exports\
    |-- documents\
    `-- backups\

D:\ActionsRunner\
`-- GitHub self-hosted runner
```

Không đặt `.env`, database, uploads hoặc documents vào `D:\ActionsRunner\_work`.
GitHub Actions có thể dọn workspace giữa các job.

## 7. Tạo production `.env`

Chạy:

```powershell
notepad D:\Apps\QUANLYKHACHHANG\.env
```

Nhập:

```env
POSTGRES_DB=qlkh_db
POSTGRES_USER=qlkh_user
POSTGRES_PASSWORD=THAY_BANG_MAT_KHAU_DATABASE_MANH

DATABASE_URL=postgresql+psycopg://qlkh_user:THAY_BANG_MAT_KHAU_DATABASE_MANH@postgres:5432/qlkh_db

APP_NAME=QUANLYKHACHHANG
CORS_ORIGINS=http://localhost

IMPORT_WORKER_COUNT=1
IMPORT_CHUNK_SIZE=20000
DELETE_UPLOAD_AFTER_SUCCESS=true
PROCESSING_WORK_MEM=256MB

APP_DATA_DIR=D:/Apps/QUANLYKHACHHANG/data
IMAGE_TAG=latest
```

Thay cả hai vị trí `THAY_BANG_MAT_KHAU_DATABASE_MANH` bằng cùng một mật khẩu.
Để cấu hình URL đơn giản, nên dùng mật khẩu dài gồm chữ, số, dấu gạch dưới và
gạch ngang. Nếu dùng `@`, `:`, `/`, `#` hoặc `%`, phần mật khẩu trong
`DATABASE_URL` phải được URL-encode.

Lưu ý:

- Host database trong `DATABASE_URL` luôn là `postgres`, không phải localhost.
- `APP_DATA_DIR` dùng dấu `/` dù máy chủ là Windows.
- Không commit hoặc gửi file `.env` qua GitHub.
- PostgreSQL chỉ dùng các biến khởi tạo khi volume được tạo lần đầu. Đổi mật
  khẩu trong `.env` sau khi DB đã có không tự đổi password trong PostgreSQL.

Kiểm tra file:

```powershell
Get-Content D:\Apps\QUANLYKHACHHANG\.env
```

## 8. Kiểm tra cổng 80

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object LocalPort -eq 80
```

Nếu không có kết quả thì cổng 80 đang trống.

Nếu IIS đang chiếm cổng và máy không phục vụ website IIS khác:

```powershell
Get-Service W3SVC -ErrorAction SilentlyContinue
Stop-Service W3SVC
Set-Service W3SVC -StartupType Disabled
```

Không dừng IIS nếu máy đang chạy ứng dụng khác cần IIS.

## 9. Mở Windows Firewall cổng 80

Mở PowerShell Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "QUANLYKHACHHANG HTTP" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 80 `
  -Action Allow
```

Kiểm tra:

```powershell
Get-NetFirewallRule -DisplayName "QUANLYKHACHHANG HTTP"
```

Không mở cổng PostgreSQL `5432` hoặc backend `8000` ra Internet. Production
Compose chỉ public cổng 80.

## 10. Tạo GitHub self-hosted runner

Mở repository trên GitHub:

```text
nguyen-tien-tai12112001/QUANLYKHACHHANG
```

Vào:

```text
Settings -> Actions -> Runners -> New self-hosted runner
```

Chọn:

```text
Runner image: Windows
Architecture: x64
```

GitHub hiển thị lệnh tải đúng phiên bản runner và một registration token tạm
thời. Không dùng URL hoặc token từ tài liệu cũ.

Mở PowerShell Administrator:

```powershell
cd D:\ActionsRunner
```

Chạy chính xác các lệnh download và giải nén GitHub đang hiển thị.

## 11. Đăng ký runner với label production

Chạy lệnh cấu hình, thay token bằng token GitHub vừa cấp:

```powershell
cd D:\ActionsRunner

.\config.cmd `
  --url https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG `
  --token TOKEN_GITHUB_VUA_CAP `
  --name qlkh-production-windows `
  --labels production
```

Khi được hỏi work folder, nhập:

```text
_work
```

Trong lần thử đầu, có thể chưa cài service để dễ nhìn log trực tiếp.

## 12. Thử runner tương tác

Xác nhận Docker Desktop đang chạy:

```powershell
docker info
```

Sau đó:

```powershell
cd D:\ActionsRunner
.\run.cmd
```

Màn hình phải có nội dung tương tự:

```text
Connected to GitHub
Listening for Jobs
```

Trên GitHub vào `Settings -> Actions -> Runners`. Runner phải có:

```text
Name: qlkh-production-windows
Status: Idle
Labels: self-hosted, Windows, X64, production
```

Giữ cửa sổ `run.cmd` mở trong deployment thử nghiệm đầu tiên.

## 13. Kiểm tra quyền GitHub Actions

Vào:

```text
Settings -> Actions -> General
```

Đảm bảo repository cho phép sử dụng:

- `actions/checkout`
- `docker/setup-buildx-action`
- `docker/login-action`
- `docker/build-push-action`

Workflow đã khai báo `packages: write` cho job build và `packages: read` cho
job deploy.

## 14. Tạo GitHub Environment production

Vào:

```text
Settings -> Environments -> New environment
```

Tên environment:

```text
production
```

Khuyến nghị:

- Chỉ cho nhánh `main` deploy.
- Bật required reviewer nếu gói GitHub hỗ trợ.
- Không cho pull request không tin cậy chạy job production.

Workflow dùng concurrency group nên hai deployment không chạy migration cùng
lúc.

## 15. Chốt an toàn ENABLE_PRODUCTION_DEPLOY

Workflow luôn build/push image khi có push vào `main`, nhưng job deploy chỉ chạy
khi repository variable sau bằng `true`:

```text
ENABLE_PRODUCTION_DEPLOY=true
```

Chưa bật variable cho đến khi Docker, runner và `.env` đã sẵn sàng.

Khi sẵn sàng, vào:

```text
Settings -> Secrets and variables -> Actions
-> Variables -> New repository variable
```

Nhập:

```text
Name: ENABLE_PRODUCTION_DEPLOY
Value: true
```

Muốn tạm dừng deploy tự động, đổi thành `false`. Build image vẫn diễn ra.

## 16. Chuẩn bị file seed tùy chọn

Nếu muốn seed danh sách tổ chức trên database mới, chép riêng hai file vào:

```text
D:\Apps\QUANLYKHACHHANG\data\documents\Danh sach chi nhanh.xlsx
D:\Apps\QUANLYKHACHHANG\data\documents\Danh sách chi tiết cán bộ.xlsx
```

Không đưa các file nghiệp vụ này lên Git. Nếu không có chúng, hệ thống vẫn
khởi động và seed role/permission/tài khoản quản trị, nhưng không có đầy đủ dữ
liệu tổ chức từ Excel.

## 17. Chạy workflow lần đầu

Đảm bảo:

- Docker Desktop đang chạy.
- `docker info` thành công bằng user chạy runner.
- Runner trên GitHub là `Idle`.
- Cửa sổ `run.cmd` đang chạy nếu chưa dùng service.
- `.env` tồn tại tại `D:\Apps\QUANLYKHACHHANG\.env`.
- Cổng 80 trống.
- `ENABLE_PRODUCTION_DEPLOY=true`.

Trên GitHub vào:

```text
Actions -> Build and deploy production -> Run workflow
```

Chọn branch `main`, sau đó bấm `Run workflow`.

Workflow có hai job build chạy song song:

- Build backend image.
- Build frontend image.

Sau khi cả hai thành công, job `Deploy to Windows production server` được gửi
tới runner có label `production`.

## 18. Các bước workflow thực hiện trên server

Job deploy tự động:

1. Kiểm tra Docker Desktop.
2. Đăng nhập GHCR bằng `GITHUB_TOKEN`.
3. Copy `docker-compose.prod.yml` vào thư mục production.
4. Xác nhận `.env` đã tồn tại.
5. Pull backend/frontend image theo commit SHA.
6. Khởi động PostgreSQL.
7. Chờ PostgreSQL healthy.
8. Tạo backup custom-format trước migration.
9. Chạy `alembic upgrade head` bằng backend image mới.
10. Restart backend.
11. Chờ backend healthy.
12. Restart frontend.
13. Gọi `http://127.0.0.1/api/health`.

Backup được ghi từ bên trong PostgreSQL container vào `/backups`, tương ứng với:

```text
D:\Apps\QUANLYKHACHHANG\data\backups
```

Cách này tránh truyền file dump nhị phân lớn qua PowerShell pipe.

## 19. Kiểm tra container sau deployment

Mở PowerShell mới:

```powershell
cd D:\Apps\QUANLYKHACHHANG

docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  ps
```

Kết quả cần có:

```text
qlkh_postgres   healthy
qlkh_backend    healthy
qlkh_frontend   healthy
```

Kiểm tra API:

```powershell
Invoke-RestMethod http://localhost/api/health
```

Kết quả:

```text
status   : ok
app      : QUANLYKHACHHANG
database : connected
```

Kiểm tra Swagger và React Router:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost/api/docs
Invoke-WebRequest -UseBasicParsing http://localhost/dashboard
```

Cả hai phải trả HTTP 200.

## 20. Truy cập từ máy khác trong LAN

Trên server:

```powershell
ipconfig
```

Tìm IPv4, ví dụ `192.168.1.50`. Trên máy cùng mạng mở:

```text
http://192.168.1.50
```

Nếu frontend gọi API bị CORS, sửa `.env`:

```env
CORS_ORIGINS=http://localhost,http://192.168.1.50
```

Sau đó recreate backend:

```powershell
cd D:\Apps\QUANLYKHACHHANG

docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  up -d --force-recreate backend
```

Nên cấu hình router cấp IP cố định cho server để địa chỉ không thay đổi.

## 21. Trường hợp tạo database mới

Nếu không chuyển dữ liệu cũ, deployment đầu tiên tự:

- Tạo PostgreSQL volume.
- Chạy Alembic baseline.
- Chạy phần startup schema tương thích cũ.
- Seed dữ liệu ban đầu.

Không cần restore. Sau khi ba container healthy, bắt đầu sử dụng ứng dụng.

## 22. Chuyển database và file từ máy cũ

Trên máy cũ:

```powershell
cd D:\Code\QUANLYKHACHHANG
.\backup-db.bat
```

File SQL nằm trong:

```text
database\backups
```

Chép file qua kênh nội bộ/bảo mật tới:

```text
D:\Apps\QUANLYKHACHHANG\data\backups
```

Chép các thư mục nếu cần:

```text
Máy cũ backend\uploads
-> Server D:\Apps\QUANLYKHACHHANG\data\uploads

Máy cũ backend\exports
-> Server D:\Apps\QUANLYKHACHHANG\data\exports

Máy cũ documents
-> Server D:\Apps\QUANLYKHACHHANG\data\documents
```

Không chuyển database, backup, uploads hoặc tài liệu khách hàng qua GitHub.

## 23. Restore file SQL trên server

Sau deployment đầu tiên, dừng ứng dụng nhưng giữ PostgreSQL:

```powershell
cd D:\Apps\QUANLYKHACHHANG

docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  stop frontend backend
```

Đọc username/database từ container:

```powershell
$dbUser = (
  docker compose `
    --env-file .env `
    -f docker-compose.prod.yml `
    exec -T postgres printenv POSTGRES_USER
).Trim()

$dbName = (
  docker compose `
    --env-file .env `
    -f docker-compose.prod.yml `
    exec -T postgres printenv POSTGRES_DB
).Trim()

$dbUser
$dbName
```

Giả sử file là `qlkh_db_20260722_102040.sql`, chạy:

```powershell
docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  exec -T postgres `
  psql `
  -U $dbUser `
  -d $dbName `
  -f /backups/qlkh_db_20260722_102040.sql
```

File lớn có thể chạy nhiều phút. Không đóng PowerShell hoặc tắt máy.

## 24. Chạy Alembic sau restore

```powershell
cd D:\Apps\QUANLYKHACHHANG
$env:IMAGE_TAG = 'latest'

docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  run --rm --no-deps backend `
  alembic upgrade head
```

Kiểm tra revision:

```powershell
docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  run --rm --no-deps backend `
  alembic current
```

Kết quả hiện tại:

```text
20260722_0001 (head)
```

Khởi động lại:

```powershell
docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  up -d backend frontend
```

Chờ rồi kiểm tra `ps` và `/api/health`.

## 25. Chạy runner nền trên Windows 11

Docker Desktop thường chạy theo phiên đăng nhập user. Có hai lựa chọn.

### Lựa chọn A: Windows Service

Runner service phải chạy bằng chính tài khoản Windows có quyền dùng Docker
Desktop và ghi vào `D:\Apps\QUANLYKHACHHANG`.

Kiểm tra:

```powershell
Get-Service 'actions.runner.*'
```

Khởi động:

```powershell
Get-Service 'actions.runner.*' | Start-Service
```

Nếu runner ban đầu không được cấu hình service, làm theo hướng dẫn Remove runner
trên GitHub rồi đăng ký lại với token mới và chọn chạy như service. Không tái sử
dụng registration token cũ.

Sau khi service chạy, đóng `run.cmd` và xác nhận runner vẫn `Idle`.

### Lựa chọn B: Task Scheduler

Nếu service không gọi được Docker Desktop, Task Scheduler thường phù hợp hơn.

Mở `Task Scheduler -> Create Task`:

- Name: `GitHub Actions Runner QUANLYKHACHHANG`.
- Run only when user is logged on.
- Run with highest privileges.
- Trigger: At log on.
- Delay task: 30–60 giây để Docker Desktop khởi động.
- Program: `D:\ActionsRunner\run.cmd`.
- Start in: `D:\ActionsRunner`.

Task chạy trong cùng phiên đăng nhập với Docker Desktop.

## 26. Quy trình cập nhật hàng ngày

Trên máy code:

```powershell
git add .
git commit -m "mo ta thay doi"
git push origin main
```

GitHub tự build và deploy. Không cần pull source hoặc build source thủ công trên
server. Server chỉ lưu Compose production, `.env` và data.

## 27. Xem trạng thái và log

```powershell
cd D:\Apps\QUANLYKHACHHANG

docker compose --env-file .env -f docker-compose.prod.yml ps
docker logs --tail 200 qlkh_backend
docker logs --tail 200 qlkh_frontend
docker logs --tail 200 qlkh_postgres
```

Theo dõi realtime:

```powershell
docker logs -f qlkh_backend
```

Restart ứng dụng:

```powershell
docker compose `
  --env-file .env `
  -f docker-compose.prod.yml `
  restart backend frontend
```

## 28. Rollback image

Lấy commit SHA cũ từ GitHub Actions hoặc GHCR:

```powershell
cd D:\Apps\QUANLYKHACHHANG
$env:IMAGE_TAG = 'COMMIT_SHA_CU'

docker compose --env-file .env -f docker-compose.prod.yml pull backend frontend
docker compose --env-file .env -f docker-compose.prod.yml up -d backend frontend
```

Không tự động chạy `alembic downgrade`. Nếu migration không tương thích ngược,
phải có kế hoạch restore backup database trước deployment đó.

## 29. Xử lý lỗi thường gặp

### Runner Offline

```powershell
Get-Service 'actions.runner.*'
docker info
```

Kiểm tra máy không sleep, Docker Desktop đang chạy và runner dùng đúng account.

### Runner chạy Docker lỗi nhưng user chạy được

Runner service nhiều khả năng đang dùng tài khoản khác. Chuyển service sang đúng
user hoặc dùng Task Scheduler `Run only when user is logged on`.

### Cổng 80 bị chiếm

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object LocalPort -eq 80
```

Dừng IIS/ứng dụng không cần thiết hoặc đổi mapping cổng production.

### GHCR báo denied

Kiểm tra:

- Package đã liên kết với repository `QUANLYKHACHHANG`.
- Build job có `packages: write`.
- Deploy job có `packages: read`.
- Bước `docker/login-action` thành công.

### Backend hoặc migration lỗi

```powershell
docker logs --tail 200 qlkh_backend
docker logs --tail 200 qlkh_postgres
```

Không restart frontend nếu migration hoặc backend healthcheck thất bại.

### Frontend trả 502 tại /api

```powershell
docker inspect --format '{{.State.Health.Status}}' qlkh_backend
docker logs --tail 200 qlkh_backend
```

### Database không kết nối

Kiểm tra `DATABASE_URL` dùng host `postgres`, mật khẩu đúng với database đã được
khởi tạo và PostgreSQL container healthy.

## 30. Bảo mật và backup

- Chỉ dùng production runner cho repository/workflow tin cậy.
- Không cho workflow pull request chạy runner `production`.
- Không public cổng PostgreSQL ra Internet.
- Không commit `.env`, backup hoặc dữ liệu khách hàng.
- Sao chép backup sang ổ đĩa hoặc máy lưu trữ khác theo lịch.
- Kiểm tra dung lượng `data\backups`; workflow tạo một backup trước mỗi migration.
- Dùng UPS nếu đây là máy vật lý chạy 24/7.
- Windows 11 phù hợp hệ thống nội bộ, nhưng phải duy trì đăng nhập user để Docker
  Desktop hoạt động ổn định.

## 31. Checklist bàn giao

- [ ] Windows đã tắt sleep.
- [ ] Docker Desktop tự khởi động khi đăng nhập.
- [ ] `docker info` chạy thành công bằng user runner.
- [ ] Đã tạo `D:\Apps\QUANLYKHACHHANG\.env`.
- [ ] Đã tạo đủ thư mục `data`.
- [ ] Cổng 80 không bị chiếm.
- [ ] Firewall cho phép TCP 80.
- [ ] Runner có label `production` và trạng thái `Idle`.
- [ ] Đã tạo GitHub Environment `production`.
- [ ] `ENABLE_PRODUCTION_DEPLOY=true` khi server đã sẵn sàng.
- [ ] Hai image xuất hiện trên GHCR.
- [ ] Job deploy chạy trên Windows runner.
- [ ] Ba container đều healthy.
- [ ] `/api/health` trả database connected.
- [ ] Máy khác trong LAN truy cập được bằng IP server.
- [ ] Backup xuất hiện trong `data\backups`.
- [ ] Đã kiểm tra quy trình restore nếu dữ liệu quan trọng.
