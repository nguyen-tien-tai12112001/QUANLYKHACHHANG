# QUANLYKHACHHANG

Tài liệu chuẩn hiện tại:

- [Danh mục bộ hồ sơ](docs/BO_HO_SO_TAI_LIEU_C360.md)
- [Hướng dẫn sử dụng chi tiết](docs/HUONG_DAN_SU_DUNG_CHI_TIET_HE_THONG_C360.md)
- [Quy trình vận hành](docs/QUY_TRINH_VAN_HANH_HE_THONG_C360.md)
- [Quy trình sao lưu và khôi phục](docs/QUY_TRINH_SAO_LUU_KHOI_PHUC_C360.md)
- [Đặc tả nguồn dữ liệu](docs/DAC_TA_NGUON_DU_LIEU_C360.md)
- [Truy vết chỉ tiêu hiển thị trên giao diện](docs/TRUY_VET_CHI_TIEU_GIAO_DIEN_C360.md)
- [Ma trận phân quyền và bảo mật](docs/MA_TRAN_PHAN_QUYEN_VA_BAO_MAT_C360.md)
- [Kiến trúc hệ thống và ERD](docs/KIEN_TRUC_HE_THONG_VA_ERD_C360.md)

Bộ Word lưu hồ sơ (bìa, trang kiểm soát, mục lục, số trang và ô ký xác nhận):

- [Danh mục bộ hồ sơ](docs/word/00_DANH_MUC_BO_HO_SO_C360.docx)
- Các bản Word được tạo từ bộ Markdown chuẩn bằng `python tools/build_word_manuals.py`.

Hệ thống quản lý, import, xử lý và báo cáo dữ liệu khách hàng.

Hướng dẫn triển khai máy chủ LAN offline:
[docs/TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md](docs/TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md)

Hướng dẫn CI/CD lên máy chủ Windows 11 bằng GitHub Actions và GHCR:
[docs/TRIEN_KHAI_CICD_WINDOWS.md](docs/TRIEN_KHAI_CICD_WINDOWS.md)

## Công nghệ

- Frontend: React 19, Vite, Ant Design, Axios
- Backend: Python 3.12, FastAPI, SQLAlchemy, Polars
- Database: PostgreSQL 16
- Migration: Alembic
- Production local: Docker Compose, Nginx

## Chạy toàn bộ bằng Docker

Yêu cầu: Docker Desktop và Docker Compose.

Trên Windows PowerShell, tại thư mục gốc dự án:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

Truy cập:

- Frontend: http://localhost
- Swagger: http://localhost/api/docs
- OpenAPI: http://localhost/api/openapi.json
- Health check: http://localhost/api/health
- Backend trực tiếp để debug: http://localhost:8000
- PostgreSQL: localhost:5432

Frontend production gọi backend bằng đường dẫn tương đối `/api`. Nginx giữ
nguyên prefix này và proxy request sang service `backend:8000`.

## Xem log

```powershell
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

## Dừng và chạy lại

```powershell
docker compose down
docker compose up -d
```

`docker compose down` không xóa dữ liệu PostgreSQL. Không chạy lệnh sau nếu
không chủ động muốn xóa database và các volume dữ liệu:

```powershell
docker compose down -v
```

## Kết nối DBeaver

Đọc các giá trị từ file `.env`:

- Host: `localhost`
- Port: `5432`
- Database: `POSTGRES_DB`
- Username: `POSTGRES_USER`
- Password: `POSTGRES_PASSWORD`

## Alembic

Kiểm tra revision và lịch sử:

```powershell
docker compose exec backend alembic current
docker compose exec backend alembic history
docker compose exec backend alembic upgrade head
```

Revision đầu tiên là baseline idempotent. Database trống được tạo từ toàn bộ
SQLAlchemy metadata; database cũ không bị drop hoặc tạo lại bảng. Backend vẫn
giữ `init_db()` trong giai đoạn chuyển tiếp để áp dụng các nâng cấp schema cũ
đang được khai báo an toàn bằng `IF NOT EXISTS`.

Không chạy `alembic revision --autogenerate` rồi áp dụng ngay lên dữ liệu thật
khi chưa đọc và kiểm tra nội dung migration sinh ra.

## Backup và restore

Backup:

```powershell
.\backup-db.bat
```

Restore một file SQL:

```powershell
.\restore-db.bat database\backups\ten_file.sql
```

File backup nằm trong `database/backups` và không được commit lên Git.

## Chạy chế độ phát triển

Script dưới đây chỉ khởi động PostgreSQL bằng Docker, sau đó chạy FastAPI và
Vite trực tiếp trên Windows với hot reload:

```powershell
.\start-dev.bat
```

Địa chỉ chế độ phát triển:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/api/docs

`backend/.env.example` và `frontend/.env.example` được giữ để hỗ trợ chế độ
phát triển ngoài Docker.

## Dữ liệu bền vững

Docker Compose giữ dữ liệu tại:

- `quanlykhachhang_postgres_data`: PostgreSQL
- `backend/uploads`: file import đang chờ/đang xử lý
- `backend/exports`: file xuất và backup do backend sinh ra

Thư mục `documents` của máy host được mount chỉ đọc để seed dữ liệu tổ chức.
