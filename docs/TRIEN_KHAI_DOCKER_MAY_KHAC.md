# Triển khai QUANLYKHACHHANG bằng Docker trên máy khác

Tài liệu này hướng dẫn đóng gói, đưa source lên Git và triển khai dự án
`QUANLYKHACHHANG` trên một máy Windows khác bằng Docker Compose.

## 1. Kiến trúc sau khi triển khai

```text
Trình duyệt
    |
    v
Nginx frontend :80
    |-- /       -> React/Vite build
    `-- /api/   -> FastAPI backend:8000
                           |
                           v
                    PostgreSQL:5432
```

Các địa chỉ mặc định:

- Giao diện: http://localhost
- Swagger: http://localhost/api/docs
- OpenAPI: http://localhost/api/openapi.json
- Health check: http://localhost/api/health
- Backend trực tiếp để debug: http://localhost:8000
- PostgreSQL cho DBeaver: `localhost:5432`

## 2. Thành phần cần cài trên máy mới

- Windows 10/11 64-bit.
- Git.
- Docker Desktop có Docker Compose v2.
- Tối thiểu khoảng 10 GB dung lượng trống cho image, database và file import.
- Nếu chuyển database hiện tại, cần thêm dung lượng đủ chứa cả file backup và
  database đã phục hồi. Backup hiện tại có thể lớn vài GB.

Kiểm tra công cụ trong PowerShell:

```powershell
git --version
docker --version
docker compose version
docker info
```

Docker Desktop phải đang chạy trước khi thực hiện các bước tiếp theo.

## 3. Những file phải có trên Git

Các file sau cần commit để máy khác chỉ cần pull/clone là có cấu hình chạy:

```text
.env.example
.gitignore
docker-compose.yml
README.md
KHOI DONG APP.txt
backup-db.bat
restore-db.bat
start-dev.bat

backend/Dockerfile
backend/.dockerignore
backend/requirements.txt
backend/alembic.ini
backend/alembic/**
backend/app/**

frontend/Dockerfile
frontend/.dockerignore
frontend/nginx.conf
frontend/package.json
frontend/package-lock.json
frontend/src/**

database/init.sql
documents/.gitkeep
```

## 4. Những dữ liệu tuyệt đối không đưa lên Git

Không commit các thành phần sau:

- `.env`, `backend/.env`, `frontend/.env`.
- Mật khẩu database hoặc thông tin xác thực thật.
- `backend/uploads` và `backend/exports`.
- File Excel nghiệp vụ trong `documents`.
- File dump trong `database/backups`.
- Volume hoặc thư mục dữ liệu PostgreSQL.
- `node_modules`, `.venv`, `dist`, cache và log.

Các file này có thể chứa dữ liệu khách hàng hoặc thông tin nội bộ. Nếu cần
chuyển sang máy khác, sử dụng ổ cứng nội bộ, thư mục mạng bảo mật hoặc kênh
truyền file được đơn vị cho phép; không dùng repository Git.

Kiểm tra trước khi commit:

```powershell
git status --short
git check-ignore .env backend/.env frontend/.env
git check-ignore database/backups/*.sql
git check-ignore backend/uploads/*
git check-ignore documents/*
```

## 5. Clone source trên máy mới

Mở PowerShell tại thư mục muốn lưu source:

```powershell
cd D:\Code
git clone https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG.git
cd QUANLYKHACHHANG
git switch main
git pull --ff-only origin main
```

Không cần cài Python hoặc Node.js trực tiếp nếu chỉ chạy bằng Docker.

## 6. Tạo cấu hình môi trường

Tạo `.env` từ file mẫu:

```powershell
Copy-Item .env.example .env
notepad .env
```

Nội dung định hướng:

```env
POSTGRES_DB=qlkh_db
POSTGRES_USER=qlkh_user
POSTGRES_PASSWORD=thay-bang-mat-khau-manh
DATABASE_URL=postgresql+psycopg://qlkh_user:thay-bang-mat-khau-manh@postgres:5432/qlkh_db

APP_NAME=QUANLYKHACHHANG
CORS_ORIGINS=http://localhost,http://localhost:3000
IMPORT_WORKER_COUNT=1
IMPORT_CHUNK_SIZE=20000
DELETE_UPLOAD_AFTER_SUCCESS=true
PROCESSING_WORK_MEM=256MB
```

`POSTGRES_PASSWORD` và mật khẩu trong `DATABASE_URL` phải giống nhau. Trong
Docker, hostname database phải là `postgres`, không dùng `localhost`.

Nếu mật khẩu chứa ký tự đặc biệt dành riêng cho URL như `@`, `:`, `/`, `#` hoặc
`%`, phải URL-encode phần mật khẩu trong `DATABASE_URL`. Để triển khai lần đầu
đơn giản hơn, có thể dùng mật khẩu dài gồm chữ, số, dấu gạch ngang và gạch dưới.

> PostgreSQL chỉ áp dụng `POSTGRES_USER`, `POSTGRES_PASSWORD` và `POSTGRES_DB`
> khi volume database được tạo lần đầu. Sửa các biến này sau khi database đã có
> không tự đổi tài khoản bên trong PostgreSQL.

## 7. Chuẩn bị tài liệu seed tùy chọn

Thư mục `documents` được tạo sẵn nhưng file nghiệp vụ không được lưu trên Git.
Nếu muốn seed danh sách chi nhánh và cán bộ khi tạo database mới, chép riêng:

```text
documents/Danh sach chi nhanh.xlsx
documents/Danh sách chi tiết cán bộ.xlsx
```

Nếu không có hai file này, hệ thống vẫn khởi động và seed tài khoản quản trị,
role, permission; danh sách tổ chức sẽ không được nhập từ Excel.

## 8. Trường hợp A: triển khai với database mới

Kiểm tra cấu hình và khởi động:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Đợi đến khi cả ba service có trạng thái `healthy`:

```text
qlkh_postgres   healthy
qlkh_backend    healthy
qlkh_frontend   healthy
```

Backend tự chạy:

```text
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Alembic baseline tạo các bảng SQLAlchemy trên database trống. Sau đó startup
của FastAPI chạy phần nâng cấp schema tương thích cũ và seed dữ liệu ban đầu.

## 9. Trường hợp B: chuyển toàn bộ database hiện tại

### 9.1. Tạo backup trên máy cũ

Tại thư mục dự án trên máy cũ:

```powershell
docker compose ps
.\backup-db.bat
```

File được tạo trong:

```text
database/backups/qlkh_db_YYYYMMDD_HHMMSS.sql
```

Kiểm tra file có dung lượng lớn hơn 0 và cuối file có dòng:

```text
PostgreSQL database dump complete
```

Chuyển file SQL sang máy mới bằng kênh an toàn. Không commit file này lên Git.

### 9.2. Khởi động PostgreSQL trên máy mới

Sau khi đã tạo `.env`:

```powershell
docker compose up -d postgres
docker compose ps
```

Chép file backup vào `database/backups`, sau đó restore:

```powershell
.\restore-db.bat database\backups\qlkh_db_YYYYMMDD_HHMMSS.sql
```

### 9.3. Chép file runtime nếu cần

Nếu cần giữ các file nguồn/import chưa xóa hoặc file export, chép riêng nội dung:

```text
backend/uploads
backend/exports
```

Giữ nguyên cấu trúc thư mục. Docker bind mount trực tiếp hai thư mục này vào
container backend.

### 9.4. Khởi động toàn bộ hệ thống

```powershell
docker compose up -d --build
docker compose ps
docker compose exec backend alembic current
```

Kết quả Alembic hiện tại phải là:

```text
20260722_0001 (head)
```

## 10. Kiểm tra sau khi triển khai

```powershell
docker compose ps
docker compose logs --tail=100 postgres
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

Kiểm tra HTTP:

```powershell
Invoke-RestMethod http://localhost/api/health
Invoke-WebRequest -UseBasicParsing http://localhost/api/docs
Invoke-WebRequest -UseBasicParsing http://localhost/dashboard
```

Health check thành công:

```json
{
  "status": "ok",
  "app": "QUANLYKHACHHANG",
  "database": "connected"
}
```

`/dashboard` phải trả về React app thay vì lỗi 404, chứng tỏ Nginx đã hỗ trợ
React Router.

## 11. Kết nối DBeaver

Sử dụng các giá trị trong `.env`:

- Host: `localhost`
- Port: `5432`
- Database: giá trị `POSTGRES_DB`
- Username: giá trị `POSTGRES_USER`
- Password: giá trị `POSTGRES_PASSWORD`

Nếu DBeaver không kết nối được, kiểm tra:

```powershell
docker compose ps postgres
Test-NetConnection localhost -Port 5432
```

## 12. Vận hành thường ngày

Khởi động:

```powershell
docker compose up -d
```

Build lại sau khi pull code:

```powershell
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
```

Xem log backend:

```powershell
docker compose logs -f backend
```

Dừng hệ thống nhưng giữ dữ liệu:

```powershell
docker compose down
```

Không chạy lệnh sau trừ khi chủ động muốn xóa database và toàn bộ volume:

```powershell
docker compose down -v
```

## 13. Alembic migration

Kiểm tra:

```powershell
docker compose exec backend alembic current
docker compose exec backend alembic history
docker compose exec backend alembic upgrade head
```

Khi cần tạo migration mới trong quá trình phát triển:

```powershell
docker compose exec backend alembic revision --autogenerate -m "mo ta thay doi"
```

Luôn đọc file migration vừa sinh trước khi chạy `upgrade head`. Không chấp nhận
migration có thao tác drop bảng/cột ngoài chủ ý. Backup database trước khi áp
dụng migration production.

Baseline `20260722_0001` không tự động drop schema khi downgrade. Đây là chủ ý
để bảo vệ database đã tồn tại trước khi dự án dùng Alembic.

## 14. Xử lý lỗi thường gặp

### Cổng 80, 8000 hoặc 5432 đang được sử dụng

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,8000,5432
```

Dừng ứng dụng đang chiếm cổng hoặc điều chỉnh phần `ports` trong
`docker-compose.yml`.

### Backend không kết nối PostgreSQL

- Kiểm tra `DATABASE_URL` dùng hostname `postgres`.
- Kiểm tra mật khẩu trong `DATABASE_URL` khớp `POSTGRES_PASSWORD` khi tạo DB.
- Xem `docker compose logs backend postgres`.

### Frontend trả 502 cho `/api`

```powershell
docker compose ps backend
docker compose logs --tail=100 backend
```

Nginx chỉ proxy được khi backend đã healthy.

### Muốn làm lại database thử nghiệm từ đầu

Chỉ thực hiện khi chắc chắn dữ liệu không cần giữ và đã có backup:

```powershell
docker compose down -v
docker compose up -d --build
```

Không dùng quy trình này trên database thật nếu chưa xác nhận backup phục hồi
được.

## 15. Checklist bàn giao máy mới

- [ ] Đã clone đúng nhánh `main`.
- [ ] Đã tạo `.env`, không commit `.env`.
- [ ] Đã đặt mật khẩu PostgreSQL riêng cho máy triển khai.
- [ ] Đã chép file `documents` cần thiết qua kênh an toàn.
- [ ] Đã restore database nếu chuyển dữ liệu cũ.
- [ ] Đã chép `backend/uploads`/`backend/exports` nếu cần.
- [ ] Ba container đều `healthy`.
- [ ] `/api/health`, `/api/docs` và giao diện hoạt động.
- [ ] Alembic ở revision `head`.
- [ ] DBeaver kết nối được.
- [ ] Đã thử tạo một bản backup trên máy mới.
