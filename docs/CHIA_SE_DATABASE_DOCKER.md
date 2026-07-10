# Hướng dẫn chia sẻ PostgreSQL Docker cho nhóm

Tài liệu này dùng cho dự án C360 / QUANLYKHACHHANG khi PostgreSQL đang chạy bằng Docker Compose, chưa có máy chủ PostgreSQL riêng.

## 1. Hiện trạng dự án

Dự án đang dùng PostgreSQL trong Docker container:

```text
Container: quanlykhachhang_postgres
Database: qlkh_db
User: qlkh_user
Password: qlkh_password
Port: 5432
```

Backend kết nối qua file:

```text
backend/.env
```

Ví dụ kết nối local:

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@localhost:5432/qlkh_db
```

## 2. Có nên đưa database lên GitHub không?

Không nên đưa database thật lên GitHub.

Không commit các file sau nếu chứa dữ liệu thật:

```text
qlkh_db.dump
*.dump
*.backup
postgres_data/
backend/.env
```

Lý do:

- Dữ liệu khách hàng là dữ liệu nhạy cảm.
- File dump DB thường rất lớn.
- GitHub không phù hợp để lưu dữ liệu vận hành thật.
- Dễ lộ user, password, thông tin khách hàng.

GitHub chỉ nên dùng để chia sẻ:

- Code Frontend.
- Code Backend.
- File schema/migration.
- File `.env.example`.
- Tài liệu hướng dẫn.

## 3. Cách 1: Một máy chạy Docker PostgreSQL chung cho cả nhóm

Cách này phù hợp khi cả nhóm muốn dùng chung một database realtime.

Ví dụ máy của bạn làm máy DB chung.

### 3.1. Trên máy chạy DB chung

Mở terminal tại thư mục dự án:

```powershell
cd D:\Code\QUANLYKHACHHANG
docker compose up -d
```

Kiểm tra container:

```powershell
docker ps
```

Phải thấy container:

```text
quanlykhachhang_postgres
```

### 3.2. Kiểm tra port Docker

Trong `docker-compose.yml` cần có:

```yaml
ports:
  - "5432:5432"
```

Nghĩa là PostgreSQL trong Docker được mở ra máy host qua port `5432`.

### 3.3. Lấy IP máy đang chạy DB

Trên máy chạy DB chung:

```powershell
ipconfig
```

Tìm dòng IPv4, ví dụ:

```text
IPv4 Address . . . . . . . . . . . : 192.168.1.20
```

IP này sẽ được người khác dùng để kết nối DB.

### 3.4. Mở Windows Firewall port 5432

Nếu máy khác không kết nối được, cần mở firewall cho PostgreSQL.

Mở PowerShell bằng quyền Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "PostgreSQL Docker 5432" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5432 `
  -Action Allow
```

### 3.5. Người khác cấu hình backend để dùng DB chung

Trên máy người khác, sửa file:

```text
backend/.env
```

Ví dụ máy DB chung có IP `192.168.1.20`:

```env
APP_NAME=QUANLYKHACHHANG
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@192.168.1.20:5432/qlkh_db
CORS_ORIGINS=http://localhost:3000
```

Sau đó restart backend:

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3.6. Người khác kết nối bằng DBeaver

Thông tin kết nối:

```text
Host: 192.168.1.20
Port: 5432
Database: qlkh_db
Username: qlkh_user
Password: qlkh_password
```

### 3.7. Ưu điểm

- Cả nhóm dùng chung dữ liệu.
- Một người import dữ liệu, người khác xem báo cáo được ngay.
- Phù hợp khi cùng phát triển trang báo cáo, xử lý dữ liệu, phân quyền.

### 3.8. Nhược điểm

- Máy chạy DB chung phải bật Docker.
- Nếu mất mạng LAN/VPN thì người khác không dùng được DB.
- Nếu ai xóa/import sai dữ liệu thì ảnh hưởng cả nhóm.
- Cần backup thường xuyên.

## 4. Cách 2: Mỗi người chạy Docker PostgreSQL riêng và restore từ file dump

Cách này phù hợp khi mỗi người muốn có DB riêng để test, không ảnh hưởng dữ liệu của nhau.

### 4.1. Export DB từ Docker ra file dump

Trên máy đang có DB đầy đủ dữ liệu, mở terminal tại thư mục muốn lưu file dump.

Ví dụ đang đứng ở:

```powershell
D:\Code\QUANLYKHACHHANG
```

Chạy:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > qlkh_db.dump
```

File dump sẽ nằm tại thư mục hiện tại của terminal:

```text
D:\Code\QUANLYKHACHHANG\qlkh_db.dump
```

Kiểm tra file:

```powershell
dir qlkh_db.dump
```

### 4.2. Chỉ định rõ nơi lưu file dump

Nếu muốn lưu vào thư mục backup:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > D:\Backup\qlkh_db.dump
```

Khi dùng dấu `>` trong PowerShell hoặc CMD, file được tạo trên máy Windows của bạn, không nằm trong Docker container.

### 4.3. Gửi file dump cho người khác

Có thể gửi qua:

- Google Drive.
- OneDrive.
- Share folder nội bộ.
- USB.
- NAS.
- GitHub Release riêng tư nếu dữ liệu đã được làm sạch.

Không commit file dump dữ liệu thật vào Git.

### 4.4. Người khác restore dump vào Docker DB local

Người nhận clone code về:

```powershell
git clone https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG.git
cd QUANLYKHACHHANG
```

Chạy PostgreSQL Docker:

```powershell
docker compose up -d
```

Copy file dump vào container:

```powershell
docker cp qlkh_db.dump quanlykhachhang_postgres:/qlkh_db.dump
```

Restore:

```powershell
docker exec -it quanlykhachhang_postgres pg_restore -U qlkh_user -d qlkh_db --clean --if-exists /qlkh_db.dump
```

Sau đó backend local giữ nguyên:

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@localhost:5432/qlkh_db
```

### 4.5. Nếu restore lỗi database đang có kết nối

Nếu backend hoặc DBeaver đang kết nối, restore có thể lỗi vì DB đang được dùng.

Tắt backend trước.

Nếu vẫn lỗi, có thể restart container:

```powershell
docker restart quanlykhachhang_postgres
```

Sau đó restore lại.

### 4.6. Ưu điểm

- Mỗi người có DB riêng.
- Test import/xóa/sửa không ảnh hưởng người khác.
- Dễ chia sẻ một snapshot dữ liệu tại một thời điểm.

### 4.7. Nhược điểm

- Không realtime.
- Dữ liệu giữa các máy có thể lệch nhau.
- Mỗi khi muốn cập nhật dữ liệu phải export/restore lại.

## 5. Nên dùng cách nào?

Khuyến nghị hiện tại:

```text
Làm chung realtime: dùng Cách 1.
Test riêng, tránh phá dữ liệu nhau: dùng Cách 2.
```

Với dự án này, nên dùng kết hợp:

1. Một máy chạy Docker PostgreSQL chung cho nhóm.
2. Định kỳ export file `qlkh_db.dump` để backup.
3. Khi ai cần test mạnh, người đó restore dump về DB local riêng.
4. Không đưa dữ liệu khách hàng thật lên GitHub.

## 6. Lệnh backup nhanh

Chạy tại thư mục muốn lưu backup:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > qlkh_db.dump
```

Ví dụ đặt tên theo ngày:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > qlkh_db_20260708.dump
```

## 7. Lệnh restore nhanh

```powershell
docker cp qlkh_db.dump quanlykhachhang_postgres:/qlkh_db.dump
docker exec -it quanlykhachhang_postgres pg_restore -U qlkh_user -d qlkh_db --clean --if-exists /qlkh_db.dump
```

## 8. Kiểm tra dữ liệu sau restore

Mở DBeaver hoặc chạy:

```powershell
docker exec -it quanlykhachhang_postgres psql -U qlkh_user -d qlkh_db
```

Trong psql:

```sql
\dt
SELECT COUNT(*) FROM customer_period_profiles;
```

Thoát psql:

```sql
\q
```

## 9. File `.env` mẫu cho từng trường hợp

### Dùng Docker DB local

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@localhost:5432/qlkh_db
```

### Dùng Docker DB trên máy khác trong LAN

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@192.168.1.20:5432/qlkh_db
```

### Dùng PostgreSQL server riêng sau này

```env
DATABASE_URL=postgresql+psycopg://postgres:your_password@your_server_ip:5432/your_database
```

Sau khi sửa `backend/.env`, luôn restart backend.

## 10. Checklist cho người trong nhóm

Khi nhận dự án:

1. Clone code từ GitHub.
2. Copy `backend/.env.example` thành `backend/.env`.
3. Chọn dùng DB chung hoặc DB local.
4. Nếu dùng DB chung, sửa `DATABASE_URL` sang IP máy chạy Docker DB chung.
5. Nếu dùng DB local, chạy `docker compose up -d` và restore `qlkh_db.dump`.
6. Chạy backend.
7. Chạy frontend.
8. Mở DBeaver kiểm tra kết nối.

## 11. Lưu ý bảo mật

- Không gửi file dump dữ liệu thật vào nhóm công khai.
- Không commit `backend/.env`.
- Không commit mật khẩu DB thật.
- Nếu chia sẻ qua Drive, nên giới hạn quyền truy cập.
- Nếu dùng máy cá nhân làm DB chung, chỉ mở port trong mạng nội bộ tin cậy.

## 12. Export DB từ Docker để import vào máy chủ PostgreSQL cài trực tiếp

Phần này dùng khi bạn đang có dữ liệu trong Docker container:

```text
Container: quanlykhachhang_postgres
Database: qlkh_db
User Docker: qlkh_user
```

Và muốn đưa dữ liệu sang một máy chủ đã cài PostgreSQL trực tiếp, ví dụ:

```text
Host server: 192.168.1.10
Port: 5432
Database đích: quanlykhachhang
User server: postgres
```

### 12.1. Cách khuyến nghị: export dạng custom dump `.dump`

Trên máy đang chạy Docker DB, mở PowerShell tại thư mục dự án:

```powershell
cd D:\Code\QUANLYKHACHHANG
```

Chạy export:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db -Fc > qlkh_db_server.dump
```

File được tạo ở máy Windows hiện tại:

```text
D:\Code\QUANLYKHACHHANG\qlkh_db_server.dump
```

Kiểm tra file:

```powershell
dir qlkh_db_server.dump
```

### 12.2. Chuyển file dump sang máy chủ PostgreSQL

Có thể chuyển bằng:

- USB.
- Remote Desktop copy file.
- Share folder nội bộ.
- OneDrive/Google Drive nội bộ.
- `scp` nếu server là Linux.

Ví dụ nếu server Linux có SSH:

```powershell
scp .\qlkh_db_server.dump postgres@192.168.1.10:/tmp/qlkh_db_server.dump
```

### 12.3. Chuẩn bị database đích trên máy chủ PostgreSQL

Trên máy chủ PostgreSQL, tạo database đích nếu chưa có.

Nếu server là Windows, mở SQL Shell hoặc PowerShell chạy:

```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE quanlykhachhang;"
```

Nếu database đã tồn tại và muốn restore đè dữ liệu, có thể giữ nguyên database rồi dùng `pg_restore --clean --if-exists` ở bước sau.

Nếu muốn xóa sạch database cũ và tạo lại:

```powershell
psql -U postgres -h localhost -p 5432 -c "DROP DATABASE IF EXISTS quanlykhachhang;"
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE quanlykhachhang;"
```

Lưu ý: trước khi drop database, cần tắt backend/DBeaver hoặc các kết nối đang dùng DB đó.

### 12.4. Restore `.dump` vào PostgreSQL server

Trên máy chủ PostgreSQL, chạy:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists qlkh_db_server.dump
```

Nếu file dump nằm ở thư mục khác, ghi rõ đường dẫn:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists D:\Backup\qlkh_db_server.dump
```

Nếu server là Linux:

```bash
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists /tmp/qlkh_db_server.dump
```

### 12.5. Nếu user đích không phải `postgres`

Ví dụ bạn muốn dùng user riêng:

```text
Database: quanlykhachhang
User: qlkh_user
Password: qlkh_password
```

Tạo user và database:

```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE USER qlkh_user WITH PASSWORD 'qlkh_password';"
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE quanlykhachhang OWNER qlkh_user;"
```

Restore bằng user `postgres` vẫn được:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists qlkh_db_server.dump
```

Sau restore, cấp quyền lại cho user ứng dụng:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -c "GRANT ALL PRIVILEGES ON DATABASE quanlykhachhang TO qlkh_user;"
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO qlkh_user;"
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO qlkh_user;"
```

### 12.6. Cập nhật backend để dùng PostgreSQL server

Trên máy chạy backend, sửa file:

```text
backend/.env
```

Ví dụ server PostgreSQL là `192.168.1.10`:

```env
DATABASE_URL=postgresql+psycopg://postgres:123456@192.168.1.10:5432/quanlykhachhang
```

Hoặc nếu dùng user riêng:

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@192.168.1.10:5432/quanlykhachhang
```

Sau đó restart backend:

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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

### 12.7. Kiểm tra dữ liệu sau restore

Trên máy chủ PostgreSQL:

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

### 12.8. Cách khác: export dạng SQL text `.sql`

Nếu muốn file dễ đọc bằng text editor, có thể export `.sql`:

```powershell
docker exec -t quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db --clean --if-exists > qlkh_db_server.sql
```

Restore `.sql` vào server:

```powershell
psql -U postgres -h localhost -p 5432 -d quanlykhachhang -f qlkh_db_server.sql
```

Khuyến nghị:

- Dùng `.dump` với `pg_restore` cho dữ liệu lớn.
- Dùng `.sql` khi cần đọc/sửa script thủ công.

### 12.9. Lỗi thường gặp

#### Lỗi: database đang có kết nối

Tắt backend, DBeaver, hoặc các app đang kết nối DB.

Có thể ngắt kết nối bằng SQL:

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'quanlykhachhang'
  AND pid <> pg_backend_pid();
```

#### Lỗi: permission denied

Chạy restore bằng user `postgres`, sau đó cấp quyền lại cho user ứng dụng.

#### Lỗi: role `qlkh_user` does not exist

Tạo user trước:

```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE USER qlkh_user WITH PASSWORD 'qlkh_password';"
```

Hoặc restore bằng tùy chọn không giữ owner:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d quanlykhachhang --clean --if-exists --no-owner --no-privileges qlkh_db_server.dump
```

#### Lỗi: version mismatch

Nên dùng `pg_restore` cùng phiên bản hoặc mới hơn phiên bản `pg_dump`.

Docker đang dùng:

```text
postgres:16
```

Vì vậy PostgreSQL server đích nên dùng PostgreSQL 16 hoặc mới hơn để an toàn nhất.
