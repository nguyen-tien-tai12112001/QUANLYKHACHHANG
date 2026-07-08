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
