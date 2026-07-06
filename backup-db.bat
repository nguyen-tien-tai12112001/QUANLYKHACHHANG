@echo off
setlocal

if not exist database\backups (
  mkdir database\backups
)

set BACKUP_FILE=database\backups\qlkh_db_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%

echo Backing up PostgreSQL database to %BACKUP_FILE%
docker exec quanlykhachhang_postgres pg_dump -U qlkh_user -d qlkh_db --clean --if-exists > "%BACKUP_FILE%"

echo Done.
endlocal

