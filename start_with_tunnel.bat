@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Live Memory Trainer - With Tunnel
color 0B

echo.
echo ============================================================
echo   Live Memory Trainer - Start with Tunnel
echo ============================================================
echo.

REM Check if localtunnel is installed
where lt >nul 2>&1
if errorlevel 1 (
    echo [Info] localtunnel not detected, installing...
    call npm install -g localtunnel
    if errorlevel 1 (
        color 0C
        echo [X] Installation failed, please run manually: npm install -g localtunnel
        echo Or run: setup_tunnel.bat
        pause
        exit /b 1
    )
)

echo [1/3] Starting app...
start "App Starter" /min cmd /k "%~dp0start.bat"
timeout /t 10 /nobreak >nul

echo [2/3] Starting tunnel...
echo.
echo Starting frontend and backend tunnels...
echo Please wait...
echo.

REM Start frontend tunnel
start "Frontend Tunnel" cmd /k "lt --port 5173 --print-requests"
timeout /t 3 /nobreak >nul

REM Start backend tunnel  
start "Backend Tunnel" cmd /k "lt --port 8000 --print-requests"
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo   Started!
echo ============================================================
echo.
echo Please check the two "Tunnel" windows above:
echo   - Frontend Tunnel: shows frontend public URL
echo   - Backend Tunnel: shows backend public URL
echo.
echo Next steps:
echo   1. Copy backend URL (e.g.: https://xxxxx.loca.lt)
echo   2. Create .env.local file, add:
echo      VITE_API_URL=your_backend_url
echo   3. Restart frontend (Press Ctrl+C in App Starter window, then run npm run dev)
echo   4. Access frontend URL in phone browser
echo.
echo Tip: If phone and computer are on same WiFi, use local IP:
echo   1. Run ipconfig to check IP address
echo   2. Access http://your_ip:5173 on phone
echo   3. Configure VITE_API_URL=http://your_ip:8000
echo.
pause
