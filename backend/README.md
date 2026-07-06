# Backend QUANLYKHACHHANG

Backend FastAPI cho du an QUANLYKHACHHANG.

## Chay lan dau

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Cau hinh database

Tat ca thong tin PostgreSQL nam trong file `.env`, thong qua bien `DATABASE_URL`.

Vi du Docker:

```env
DATABASE_URL=postgresql+psycopg://qlkh_user:qlkh_password@localhost:5432/qlkh_db
```

Vi du PostgreSQL local/server:

```env
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/your_database
```

Health API: http://localhost:8000/api/health

