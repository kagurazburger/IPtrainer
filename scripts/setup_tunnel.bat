@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Live Memory Trainer - Tunnel Setup
color 0B

echo.
echo ============================================================
echo   Tunnel Setup - Live Memory Trainer
echo ============================================================
echo.

echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [X] Node.js not found, please install: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js installed
echo.

echo Installing localtunnel (tunnel tool)...
call npm install -g localtunnel
if errorlevel 1 (
    color 0C
    echo [X] Installation failed, try running as administrator
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Tunnel Setup Complete!
echo ============================================================
echo.
echo Usage:
echo   1. Run start.bat to start the app
echo   2. Run tunnel.bat to start tunnel
echo   3. Share the displayed public URLs for phone access
echo.
pause
