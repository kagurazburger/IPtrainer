@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Live Memory Trainer - Tunnel
color 0B

echo.
echo ============================================================
echo   Tunnel - Live Memory Trainer
echo ============================================================
echo.
echo Starting tunnel service...
echo Frontend port: 5173
echo Backend port: 8000
echo.
echo Please wait, getting public URLs...
echo.

REM Start frontend tunnel
start "Frontend Tunnel" /min cmd /k "lt --port 5173 --print-requests"
timeout /t 3 /nobreak >nul

REM Start backend tunnel
start "Backend Tunnel" /min cmd /k "lt --port 8000 --print-requests"
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo   Tunnel Started!
echo ============================================================
echo.
echo Please check the two windows above for URLs like:
echo.
echo   Frontend: https://xxxxx.loca.lt
echo   Backend: https://yyyyy.loca.lt
echo.
echo Important:
echo   1. Frontend URL is for accessing app on phone
echo   2. Need to configure frontend to use backend URL
echo   3. Or use the auto-config script below
echo.
echo Press any key to view detailed instructions...
pause >nul

if exist "内网穿透使用说明.md" start "" "内网穿透使用说明.md"
