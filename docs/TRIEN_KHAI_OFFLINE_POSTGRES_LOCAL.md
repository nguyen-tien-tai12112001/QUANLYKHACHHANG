# Hướng dẫn tạo PostgreSQL local/server và triển khai C360 offline

Tài liệu này dùng khi muốn triển khai dự án **C360 / QUANLYKHACHHANG** trên máy chủ hoặc máy local **không có internet**, không dùng PostgreSQL Docker mà dùng PostgreSQL cài trực tiếp trên máy.

## 1. Mô hình triển khai

```text
Máy triển khai offline
├─ PostgreSQL cài trực tiếp trên máy
├─ Backend FastAPI
├─ Frontend React/Vite
└─ Database được restore từ file .sql hoặc .dump
```

Ví dụ thông tin DB:

```text
Host: localhost
Port: 5432
Database: quanlykhachhang
User: postgres
Password: 123456
```

Backend sẽ kết nối bằng:

```env
DATABASE_URL=postgresql+psycopg://postgres:123456@localhost:5432/quanlykhachhang
```

## 2. Chuẩn bị trên máy có internet

Trước khi đưa sang máy offline, nên chuẩn bị đủ các file sau trên một máy có internet.

### 2.1. Source code dự án

```powershell
git clone https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG.git
```

Hoặc tải source code dạng `.zip` từ GitHub.

### 2.2. Bộ cài cần mang sang máy offline

Cần chuẩn bị:

- PostgreSQL installer, khuyến nghị PostgreSQL 16.
- Python installer, khuyến nghị Python 3.11 hoặc 3.12.
- Node.js installer, khuyến nghị Node.js 22 LTS.
- Source code dự án.
- File database export: `qlkh_db.sql` hoặc `qlkh_db.dump`.
- Gói Python offline trong thư mục `wheelhouse`.
- Thư mục `node_modules` frontend hoặc frontend đã build sẵn.

## 3. Export DB từ Docker trên máy đang có dữ liệu

Nếu DB hiện đang chạy bằng Docker:

```text
Container: quanlykhachhang_postgres
Database: qlkh_db
User: qlkh_user
```

### 3.1. Export dạng `.sql`

Chạy tại máy đang có Docker DB:

```powershell
cd D:\Code\QUANLYKHACHHANG
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db --clean --if-exists > qlkh_db.sql
```

File tạo ra:

```text
D:\Code\QUANLYKHACHHANG\qlkh_db.sql
```

### 3.2. Export dạng `.dump`

Khuyến nghị với DB lớn:

```powershell
cd D:\Code\QUANLYKHACHHANG
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > qlkh_db.dump
```

File tạo ra:

```text
D:\Code\QUANLYKHACHHANG\qlkh_db.dump
```

Ghi chú:

- `.sql` dễ đọc, restore bằng `psql`.
- `.dump` tối ưu hơn cho DB lớn, restore bằng `pg_restore`.

## 4. Tạo PostgreSQL database trên máy local/server

Sau khi cài PostgreSQL trên máy offline/server, mở PowerShell hoặc CMD.

### 4.1. Kiểm tra PostgreSQL đã chạy

```powershell
psql --version
```

Nếu không nhận lệnh `psql`, cần thêm thư mục `bin` của PostgreSQL vào `PATH`.

Ví dụ:

```text
C:\Program Files\PostgreSQL\16\bin
```

### 4.2. Tạo database

Ví dụ dùng user `postgres`:

```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE quanlykhachhang;"
```

Nếu database đã tồn tại và muốn tạo lại:

```powershell
psql -U postgres -h localhost -p 5432 -c "DROP DATABASE IF EXISTS quanlykhachhang;"
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE quanlykhachhang;"
```

### 4.3. Tạo user riêng cho ứng dụng nếu cần

Nếu không muốn backend dùng user `postgres`, tạo user riêng:

```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE USER qlkh_user WITH PASSWORD 'qlkh_password';"
psql -U postgres -h localhost -p 5432 -c "ALTER DATABASE quanlykhachhang OWNER TO qlkh_user;"
```

Sau restore, có thể cấp quyền lại:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO qlkh_user;"
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO qlkh_user;"
```

## 5. Restore database vào PostgreSQL local/server

### 5.1. Restore từ file `.sql`

Copy `qlkh_db.sql` vào máy offline/server.

Chạy:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -f D:\Backup\qlkh_db.sql
```

Nếu file nằm cùng thư mục đang mở terminal:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -f qlkh_db.sql
```

### 5.2. Restore từ file `.dump`

Copy `qlkh_db.dump` vào máy offline/server.

Chạy:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists D:\Backup\qlkh_db.dump
```

Nếu không muốn giữ owner/quyền từ DB cũ:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists --no-owner --no-privileges D:\Backup\qlkh_db.dump
```

### 5.3. Kiểm tra dữ liệu sau restore

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang
```

Trong `psql`:

```sql
\dt
SELECT COUNT(*) FROM system_users;
SELECT COUNT(*) FROM import_files;
SELECT COUNT(*) FROM customer_period_profiles;
```

Thoát:

```sql
\q
```

## 6. Chuẩn bị backend chạy offline

Backend dùng Python FastAPI.

### 6.1. Tạo wheelhouse trên máy có internet

Trên máy có internet, tại thư mục dự án:

```powershell
cd D:\Code\QUANLYKHACHHANG\backend
python -m pip download -r requirements.txt -d wheelhouse
```

Sau lệnh này sẽ có thư mục:

```text
backend\wheelhouse
```

Copy toàn bộ thư mục `backend`, bao gồm `wheelhouse`, sang máy offline.

### 6.2. Tạo môi trường Python trên máy offline

Trên máy offline:

```powershell
cd D:\Code\QUANLYKHACHHANG\backend
python -m venv .venv
.venv\Scripts\activate
```

Cài thư viện từ `wheelhouse`, không cần internet:

```powershell
pip install --no-index --find-links=wheelhouse -r requirements.txt
```

### 6.3. Cấu hình backend `.env`

Tạo file:

```text
backend\.env
```

Ví dụ dùng PostgreSQL local:

```env
APP_NAME=QUANLYKHACHHANG
DATABASE_URL=postgresql+psycopg://postgres:123456@localhost:5432/quanlykhachhang
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
IMPORT_WORKER_COUNT=1
IMPORT_CHUNK_SIZE=20000
DELETE_UPLOAD_AFTER_SUCCESS=true
```

Nếu frontend truy cập bằng IP server, ví dụ `192.168.1.10`, thêm CORS:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.10:3000
```

### 6.4. Chạy backend

```powershell
cd D:\Code\QUANLYKHACHHANG\backend
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Kiểm tra:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Kết quả đúng:

```json
{
  "status": "ok",
  "app": "QUANLYKHACHHANG",
  "database": "connected"
}
```

## 7. Chuẩn bị frontend chạy offline

Frontend dùng React + Vite + Ant Design.

Có 2 cách triển khai offline.

## 8. Cách A: Chạy frontend bằng source code và `node_modules`

Cách này phù hợp nếu vẫn muốn chạy:

```powershell
npm run dev
```

### 8.1. Chuẩn bị trên máy có internet

Trên máy có internet:

```powershell
cd D:\Code\QUANLYKHACHHANG\frontend
npm install
```

Sau đó copy toàn bộ thư mục:

```text
frontend
```

Bao gồm:

```text
frontend\node_modules
frontend\package.json
frontend\package-lock.json
frontend\src
frontend\.env
```

sang máy offline.

### 8.2. Cấu hình frontend `.env`

Trên máy offline, sửa:

```text
frontend\.env
```

Nếu backend chạy cùng máy:

```env
VITE_API_URL=http://localhost:8000/api
```

Nếu backend chạy trên server IP `192.168.1.10`:

```env
VITE_API_URL=http://192.168.1.10:8000/api
```

### 8.3. Chạy frontend

```powershell
cd D:\Code\QUANLYKHACHHANG\frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

Truy cập:

```text
http://localhost:3000
```

Hoặc từ máy khác:

```text
http://192.168.1.10:3000
```

## 9. Cách B: Build frontend sẵn rồi copy thư mục `dist`

Cách này phù hợp khi máy chủ offline chỉ cần chạy bản frontend đã build.

### 9.1. Build trên máy có internet

Trên máy có internet, cấu hình trước:

```text
frontend\.env
```

Ví dụ backend server:

```env
VITE_API_URL=http://192.168.1.10:8000/api
```

Build:

```powershell
cd D:\Code\QUANLYKHACHHANG\frontend
npm install
npm run build
```

Sau khi build xong sẽ có:

```text
frontend\dist
```

Copy thư mục `dist` sang máy offline/server.

### 9.2. Chạy thử frontend build bằng Vite preview

Nếu đã copy cả `node_modules`:

```powershell
cd D:\Code\QUANLYKHACHHANG\frontend
npm run preview -- --host 0.0.0.0 --port 3000
```

### 9.3. Chạy frontend build bằng server tĩnh đơn giản

Nếu máy có Python:

```powershell
cd D:\Code\QUANLYKHACHHANG\frontend\dist
python -m http.server 3000
```

Truy cập:

```text
http://localhost:3000
```

Lưu ý:

- Cách `python -m http.server` chỉ phù hợp test nhanh.
- Nếu dùng React Router sau này, nên cấu hình server trả về `index.html` cho mọi route.

## 10. Mở firewall trên máy chủ

Nếu máy khác trong LAN cần truy cập:

### Backend port 8000

```powershell
New-NetFirewallRule `
  -DisplayName "C360 Backend 8000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8000 `
  -Action Allow
```

### Frontend port 3000

```powershell
New-NetFirewallRule `
  -DisplayName "C360 Frontend 3000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow
```

### PostgreSQL port 5432

Chỉ mở nếu máy khác cần kết nối trực tiếp DB bằng DBeaver hoặc backend nằm ở máy khác:

```powershell
New-NetFirewallRule `
  -DisplayName "PostgreSQL 5432" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5432 `
  -Action Allow
```

## 11. Cấu hình DBeaver kết nối PostgreSQL local/server

Thông tin kết nối ví dụ:

```text
Host: localhost
Port: 5432
Database: quanlykhachhang
Username: postgres
Password: 123456
```

Nếu kết nối từ máy khác:

```text
Host: 192.168.1.10
Port: 5432
Database: quanlykhachhang
Username: postgres
Password: 123456
```

## 12. Checklist triển khai offline

Trên máy có internet:

1. Export DB ra `qlkh_db.sql` hoặc `qlkh_db.dump`.
2. Tải/copy PostgreSQL installer.
3. Tải/copy Python installer.
4. Tải/copy Node.js installer.
5. Chuẩn bị `backend\wheelhouse`.
6. Chuẩn bị `frontend\node_modules` hoặc `frontend\dist`.
7. Copy toàn bộ sang máy offline.

Trên máy offline:

1. Cài PostgreSQL.
2. Tạo database `quanlykhachhang`.
3. Restore DB.
4. Cài Python.
5. Tạo `.venv` backend.
6. Cài Python package từ `wheelhouse`.
7. Sửa `backend\.env`.
8. Chạy backend.
9. Cài Node.js nếu cần chạy frontend source.
10. Sửa `frontend\.env`.
11. Chạy frontend.
12. Kiểm tra đăng nhập.

## 13. Lỗi thường gặp

### Backend báo database disconnected

Kiểm tra:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang
```

Kiểm tra lại `DATABASE_URL` trong:

```text
backend\.env
```

### Frontend không đăng nhập được

Kiểm tra:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Nếu frontend chạy bằng IP, kiểm tra `frontend\.env`:

```env
VITE_API_URL=http://192.168.1.10:8000/api
```

Và backend `.env` phải có CORS:

```env
CORS_ORIGINS=http://localhost:3000,http://192.168.1.10:3000
```

Sau khi sửa `.env`, phải restart frontend/backend tương ứng.

### Restore `.sql` lỗi do database đang có kết nối

Tắt backend và DBeaver rồi restore lại.

Hoặc ngắt kết nối:

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'quanlykhachhang'
  AND pid <> pg_backend_pid();
```

### Không chạy được `npm install` vì máy offline

Máy offline không tải được package từ internet.

Giải pháp:

- Copy cả `frontend\node_modules` từ máy đã `npm install`.
- Hoặc build sẵn `frontend\dist` trên máy có internet rồi copy sang.

### Không chạy được `pip install`

Máy offline không tải được package Python.

Giải pháp:

Trên máy có internet tạo `wheelhouse`:

```powershell
pip download -r requirements.txt -d wheelhouse
```

Trên máy offline cài:

```powershell
pip install --no-index --find-links=wheelhouse -r requirements.txt
```

