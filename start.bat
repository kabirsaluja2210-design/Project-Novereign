@echo off
REM One-click local launch for Project Novereign.
REM Double-click this file (or run it from cmd.exe) in the repo root.

setlocal

if not exist ".env" (
    echo Creating .env from .env.example ...
    copy .env.example .env >nul
    echo IMPORTANT: edit .env and set SESSION_SECRET before using this for anything real.
)

echo Restarting WSL to clear any stuck Docker state ...
wsl --shutdown
timeout /t 5 /nobreak >nul

echo Starting Docker Desktop ...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo Waiting for the Docker engine to come up ...
:waitloop
docker info >nul 2>&1
if errorlevel 1 (
    timeout /t 3 /nobreak >nul
    goto waitloop
)

echo Clearing stale build cache ...
docker builder prune -a -f >nul 2>&1

echo Building and starting containers (this can take a few minutes the first time) ...
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo Build failed. Copy the output above and send it back.
    pause
    exit /b 1
)

echo Applying database migrations ...
docker compose run --rm web npx prisma migrate deploy

echo.
echo Opening http://localhost:3000 ...
start "" "http://localhost:3000"

echo Done. Leave this window open or close it - containers keep running in the background.
pause
