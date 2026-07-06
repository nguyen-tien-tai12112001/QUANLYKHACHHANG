@echo off
setlocal

echo Starting PostgreSQL with Docker Compose...
docker compose up -d

if not exist backend\.env (
  copy backend\.env.example backend\.env
)

if not exist frontend\.env (
  copy frontend\.env.example frontend\.env
)

echo Opening backend terminal...
start cmd /k "cd /d %~dp0backend && if not exist .venv python -m venv .venv && call .venv\Scripts\activate && pip install -r requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Opening frontend terminal...
start cmd /k "cd /d %~dp0frontend && npm install && npm run dev -- --host 0.0.0.0 --port 3000"

endlocal

