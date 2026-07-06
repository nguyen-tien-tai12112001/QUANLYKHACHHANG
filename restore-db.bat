@echo off
setlocal

if "%~1"=="" (
  echo Usage: restore-db.bat database\backups\your_backup.sql
  exit /b 1
)

echo Restoring PostgreSQL database from %~1
docker compose up -d
type "%~1" | docker exec -i quanlykhachhang_postgres psql -U qlkh_user -d qlkh_db

echo Done.
endlocal

