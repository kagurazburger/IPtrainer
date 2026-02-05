@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Auto Configure Local Network
color 0B

echo.
echo ============================================================
echo   Auto Configure Local Network Access
echo ============================================================
echo.

REM Get local IP address
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP_TEMP=%%a"
    set "IP_TEMP=!IP_TEMP: =!"
    if "!IP_TEMP!" neq "" (
        set "LOCAL_IP=!IP_TEMP!"
        goto :found
    )
)

:found
if "!LOCAL_IP!"=="" (
    color 0C
    echo [X] Cannot get IP address
    echo Please run ipconfig manually to check IP address
    pause
    exit /b 1
)

echo [OK] Detected IP address: !LOCAL_IP!
echo.

set "BACKEND_URL=http://!LOCAL_IP!:8000"
set "FRONTEND_URL=http://!LOCAL_IP!:5173"

echo Configuring...
echo   Backend URL: !BACKEND_URL!
echo   Frontend URL: !FRONTEND_URL!
echo.

REM Create .env.local
echo VITE_API_URL=!BACKEND_URL! > .env.local

if exist .env.local (
    echo [OK] Configuration saved to .env.local
    echo.
    echo ============================================================
    echo   Configuration Complete!
    echo ============================================================
    echo.
    echo Next steps:
    echo   1. Make sure app is running (run start.bat)
    echo   2. If frontend is running, restart it (Ctrl+C then npm run dev)
    echo   3. Access from phone browser:
    echo.
    echo      !FRONTEND_URL!
    echo.
    echo   4. Make sure phone and computer are on same WiFi network
    echo.
    echo If cannot access, check Windows firewall settings
    echo.
) else (
    color 0C
    echo [X] Failed to create config file
    pause
    exit /b 1
)

pause
