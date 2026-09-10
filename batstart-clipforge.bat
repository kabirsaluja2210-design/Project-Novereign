@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ================================================================
echo   Starting ClipForge AI
echo   (first run can take several minutes)
echo ================================================================
echo.

rem --- Make sure the project (docker-compose.yml) is actually here. ---
rem If this .bat was downloaded on its own, without the rest of the
rem repo, clone it now instead of failing with a cryptic Compose error.
if not exist "docker-compose.yml" (
    if exist "Project-Novereign\docker-compose.yml" (
        cd Project-Novereign
    ) else (
        echo Project files not found next to this script.
        where git >nul 2>nul
        if errorlevel 1 (
            echo.
            echo Git is not installed, so this script can't fetch the project
            echo automatically. Please either:
            echo   1^) Install Git from https://git-scm.com/download/win and run
            echo      this script again, or
            echo   2^) Download the full project as a ZIP from
            echo      https://github.com/kabirsaluja2210-design/Project-Novereign
            echo      extract it, and run batstart-clipforge.bat from inside
            echo      the extracted folder.
            pause
            exit /b 1
        )
        echo Cloning the ClipForge AI project into ".\Project-Novereign" ...
        git clone https://github.com/kabirsaluja2210-design/Project-Novereign.git Project-Novereign
        if errorlevel 1 (
            echo.
            echo Something went wrong during the build - scroll up to see the
            echo red error text and send it back to Claude.
            pause
            exit /b 1
        )
        cd Project-Novereign
    )
)

rem --- Pull the latest code before building, so a folder left over from an
rem     earlier run doesn't silently keep rebuilding stale/broken code. ---
if exist ".git" (
    where git >nul 2>nul
    if not errorlevel 1 (
        echo Checking for updates ...
        git pull --ff-only
        if errorlevel 1 (
            echo.
            echo Could not update automatically ^(local changes or a network
            echo issue^). Continuing with the code already on disk.
            echo.
        )
    )
)

rem --- Make sure Docker Desktop is installed and running. ---
where docker >nul 2>nul
if errorlevel 1 (
    echo.
    echo Docker was not found on this machine.
    echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/
    echo make sure it is running, then run this script again.
    pause
    exit /b 1
)

rem --- Create a local .env on first run. ---
if not exist ".env" (
    echo Creating .env from .env.example ...
    copy /y ".env.example" ".env" >nul
    echo.
    echo NOTE: edit .env and set SESSION_SECRET to a random value before
    echo using this for anything beyond local testing.
    echo.
)

docker compose up -d --build
if errorlevel 1 (
    echo.
    echo Something went wrong during the build - scroll up to see the
    echo red error text and send it back to Claude.
    pause
    exit /b 1
)

echo.
echo Running database migrations ...
docker compose run --rm web npx prisma migrate deploy
if errorlevel 1 (
    echo.
    echo Something went wrong running database migrations - scroll up
    echo to see the red error text and send it back to Claude.
    pause
    exit /b 1
)

echo.
echo ================================================================
echo   ClipForge AI is running at http://localhost:3000
echo ================================================================
pause
