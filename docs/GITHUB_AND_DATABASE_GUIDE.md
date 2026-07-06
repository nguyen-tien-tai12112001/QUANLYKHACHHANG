# Huong Dan Dua Du An Len GitHub Va Khoi Phuc Database

## 1. Nguyen tac quan trong

Khong dua truc tiep PostgreSQL Docker volume len GitHub. GitHub nen luu:

- Source code frontend/backend.
- `docker-compose.yml`.
- File schema/init database trong `database/init.sql`.
- Tai lieu thiet ke trong `docs/`.
- Neu can chia se du lieu co san, tao file backup `.sql` bang `backup-db.bat` va gui rieng hoac dua vao release/private storage.

Thu muc runtime khong nen commit:

- `node_modules/`
- `frontend/node_modules/`
- `backend/.venv/`
- `backend/.env`
- `frontend/.env`
- `backend/uploads/`
- `backend/exports/`
- `backend/logs/`
- `database/backups/*.sql`

## 2. Backup database hien tai

Chay:

```bat
backup-db.bat
```

File backup se nam trong:

```text
database/backups/
```

Theo mac dinh `.gitignore`, cac file `.sql` trong thu muc nay khong duoc commit de tranh lo du lieu that.

## 3. Restore database tu backup

Nguoi dung khac lay file backup `.sql`, dat vao may, roi chay:

```bat
docker compose up -d
restore-db.bat database\backups\ten_file_backup.sql
```

## 4. Tao repository GitHub lan dau

```bat
git init
git add .
git commit -m "Initial fullstack customer management project"
git branch -M main
git remote add origin https://github.com/USERNAME/QUANLYKHACHHANG.git
git push -u origin main
```

## 5. Nguoi dung khac lay du an ve

```bat
git clone https://github.com/USERNAME/QUANLYKHACHHANG.git
cd QUANLYKHACHHANG
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
docker compose up -d
```

Chay backend:

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Chay frontend:

```bat
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Hoac chay nhanh:

```bat
start-dev.bat
```

