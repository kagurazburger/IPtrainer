@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Configure Tunnel URL
color 0B

echo.
echo ============================================================
echo   Configure Tunnel URL
echo ============================================================
echo.

if "%1"=="" (
    echo Usage:
    echo   configure_tunnel.bat ^<backend URL^>
    echo.
    echo Examples:
    echo   configure_tunnel.bat https://random-name-456.loca.lt
    echo   configure_tunnel.bat http://192.168.1.100:8000
    echo.
    echo Or run this script and enter URL when prompted:
    echo.
    set /p BACKEND_URL="Enter backend URL: "
) else (
    set "BACKEND_URL=%1"
)

if "%BACKEND_URL%"=="" (
    color 0C
    echo [X] No URL provided
    pause
    exit /b 1
)

echo.
echo Configuring frontend to use backend URL: %BACKEND_URL%
echo.

REM Create or update .env.local
echo VITE_API_URL=%BACKEND_URL% > .env.local

if exist .env.local (
    echo [OK] Configuration saved to .env.local
    echo.
    echo Content:
    type .env.local
    echo.
    echo Please restart frontend service for changes to take effect:
    echo   1. Stop current frontend (Ctrl+C)
    echo   2. Run again: npm run dev
    echo.
) else (
    color 0C
    echo [X] Failed to create config file
    pause
    exit /b 1
)

pause
