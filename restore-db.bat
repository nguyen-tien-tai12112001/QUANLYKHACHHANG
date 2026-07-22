@echo off
setlocal

if "%~1"=="" (
  echo Usage: restore-db.bat database\backups\your_backup.sql
  exit /b 1
)

echo Restoring PostgreSQL database from %~1
docker compose up -d postgres

for /f "delims=" %%i in ('docker compose exec -T postgres printenv POSTGRES_USER') do set DB_USER=%%i
for /f "delims=" %%i in ('docker compose exec -T postgres printenv POSTGRES_DB') do set DB_NAME=%%i

if not defined DB_USER (
  echo Cannot read POSTGRES_USER from the postgres container.
  exit /b 1
)
if not defined DB_NAME (
  echo Cannot read POSTGRES_DB from the postgres container.
  exit /b 1
)

type "%~1" | docker compose exec -T postgres psql -U "%DB_USER%" -d "%DB_NAME%"

if errorlevel 1 (
  echo Restore failed.
  exit /b 1
)

echo Done.
endlocal
