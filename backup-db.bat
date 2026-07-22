@echo off
setlocal

if not exist database\backups (
  mkdir database\backups
)

set BACKUP_FILE=database\backups\qlkh_db_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%

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

echo Backing up PostgreSQL database to %BACKUP_FILE%
docker compose exec -T postgres pg_dump -U "%DB_USER%" -d "%DB_NAME%" --clean --if-exists > "%BACKUP_FILE%"

if errorlevel 1 (
  echo Backup failed.
  exit /b 1
)

echo Done.
endlocal
