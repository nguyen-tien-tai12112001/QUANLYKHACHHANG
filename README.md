# QUANLYKHACHHANG

QUANLYKHACHHANG là dự án fullstack dùng để quản lý khách hàng, import dữ liệu CSV và tổng hợp báo cáo. Giai đoạn hiện tại chỉ dựng khung dự án chuẩn, chạy được Frontend, Backend và kết nối PostgreSQL.

## Công nghệ sử dụng

- Frontend: ReactJS, Vite, Ant Design, Axios
- Backend: Python FastAPI
- Database: PostgreSQL 16 qua Docker Compose hoac PostgreSQL local/server
- Ket noi DB: SQLAlchemy voi psycopg
- Quản lý DB bên ngoài: DBeaver
- TODO: Bổ sung Polars để xử lý nhiều file CSV.
- TODO: Tạo bảng dữ liệu theo từng loại file import.
- TODO: Tổng hợp báo cáo.
- TODO: Xuất Excel.
- TODO: Đóng gói chạy offline.

## Cấu trúc thư mục

```text
QUANLYKHACHHANG/
├─ docs/
│  └─ THIET_KE_KHO_DU_LIEU_KHACH_HANG.md
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ config.py
│  │  ├─ database.py
│  │  └─ api/
│  │     └─ health.py
│  ├─ uploads/
│  ├─ exports/
│  ├─ logs/
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ README.md
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  │  └─ client.js
│  │  ├─ pages/
│  │  │  └─ Dashboard.jsx
│  │  ├─ components/
│  │  │  └─ MainLayout.jsx
│  │  ├─ App.jsx
│  │  └─ main.jsx
│  ├─ package.json
│  ├─ vite.config.js
│  └─ .env.example
├─ database/
│  └─ init.sql
├─ docker-compose.yml
├─ .env.example
├─ start-dev.bat
└─ README.md
```

## Chạy PostgreSQL bằng Docker

```bat
docker compose up -d
```

Kiểm tra container:

```bat
docker ps
```

## Kết nối DBeaver

- Host: localhost
- Port: 5432
- Database: qlkh_db
- Username: qlkh_user
- Password: qlkh_password

## Chạy backend

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Chạy frontend

```bat
cd frontend
npm install
copy .env.example .env
npm run dev -- --host 0.0.0.0 --port 3000
```

## Chạy nhanh trên Windows

```bat
start-dev.bat
```

Script này sẽ chạy Docker Compose PostgreSQL, tạo file `.env` nếu chưa có, mở backend và frontend trong các cửa sổ terminal riêng.

## Cấu hình Database

## Tài liệu thiết kế

Toàn bộ ý tưởng nghiệp vụ, logic import, chuẩn hóa `MA_KH_CHUAN`, thiết kế bảng dữ liệu và hướng triển khai code được ghi tại:

```text
docs/THIET_KE_KHO_DU_LIEU_KHACH_HANG.md
```

Dự án hỗ trợ 2 cách kết nối PostgreSQL:

1. PostgreSQL chạy bằng Docker.
2. PostgreSQL cài trực tiếp trên máy local/server.

Backend không hard-code host, port, user, password trong code. Toàn bộ cấu hình DB nằm trong file:

```text
backend/.env
```

Nếu dùng PostgreSQL Docker, giữ nguyên:

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@localhost:5432/qlkh_db
```

Nếu dùng PostgreSQL local:

```env
DATABASE_URL=postgresql+psycopg://postgres:123456@localhost:5432/quanlykhachhang
```

Nếu dùng PostgreSQL trên máy chủ khác:

```env
DATABASE_URL=postgresql+psycopg://postgres:123456@192.168.1.10:5432/quanlykhachhang
```

Sau khi sửa `backend/.env`, restart backend là được.

## Kiểm tra kết nối DB

Sau khi PostgreSQL và backend đã chạy:

```bat
curl http://localhost:8000/api/health
```

Kết quả thành công:

```json
{
  "status": "ok",
  "app": "QUANLYKHACHHANG",
  "database": "connected"
}
```

Nếu DB lỗi, API sẽ trả về `status: error`, `database: disconnected` và kèm thông tin lỗi trong `message`.

## Link truy cập

- Frontend: http://localhost:3000
- Backend docs: http://localhost:8000/docs
- Health API: http://localhost:8000/api/health
- Import files API: http://localhost:8000/api/imports/files
- Summary API: http://localhost:8000/api/imports/summary?period_key=yyyymmdd

## Gợi ý bước tiếp theo

- Tạo model và migration database.
- Xây API upload nhiều file CSV.
- Bổ sung Polars để đọc và chuẩn hóa dữ liệu CSV.
- Thiết kế bảng riêng cho từng loại file import.
- Xây dashboard báo cáo và chức năng xuất Excel.
