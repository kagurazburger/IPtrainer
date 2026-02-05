@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Live Memory Trainer
color 0A

echo.
echo ============================================================
echo   Live Memory Trainer
echo ============================================================
echo.

REM Step 1: Check environment
echo [1/5] Checking environment...
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [X] Python not found. Install: https://www.python.org/downloads/
    pause
    exit /b 1
)
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [X] Node.js not found. Install: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Python and Node.js OK
echo.

REM Step 2: Config
echo [2/5] Checking config...
if not exist "backend\config.json" (
    echo Creating default backend\config.json...
    (echo {"whisper_script":"E:\\whisper\\whisper_run.py","llama_cli_path":"C:\\Users\\Yachen\\Documents\\QkidsAutomation\\QkidsApp2\\tools\\llama-b7406-bin-win-cuda-12.4-x64\\llama-cli.exe","llama_gguf_path":"C:\\Users\\Yachen\\Documents\\QkidsAutomation\\QkidsApp2\\tools\\llama-b7406-bin-win-cuda-12.4-x64\\Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf","janus_model_dir":"C:\\Users\\Yachen\\Documents\\SD\\sd-webui-aki-v4.11.1-cu128\\models\\Stable-diffusion\\Janus-Pro\\Janus-Pro-1B"}) > backend\config.json
)
echo [OK] Config OK
echo.

REM Step 3: Backend
echo [3/5] Setting up backend...
cd backend
set VENV_DIR=venv
set PY_CMD=python
py -3.11 --version >nul 2>&1
if %errorlevel%==0 (
    set VENV_DIR=venv311
    set PY_CMD=py -3.11
) else (
    py -3.12 --version >nul 2>&1
    if %errorlevel%==0 (
        set VENV_DIR=venv312
        set PY_CMD=py -3.12
    )
)

if not exist "%VENV_DIR%" (
    echo Creating %VENV_DIR%...
    %PY_CMD% -m venv %VENV_DIR%
)
call %VENV_DIR%\Scripts\activate.bat
%VENV_DIR%\Scripts\python.exe -m pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo Installing backend deps...
    call install_deps.bat
    if errorlevel 1 (
        color 0C
        echo [X] Backend deps failed. Run: backend\install_deps.bat
        cd ..
        pause
        exit /b 1
    )
)
cd ..
echo [OK] Backend OK
echo.

REM Step 4: Frontend
echo [4/5] Setting up frontend...
if not exist "node_modules" (
    echo Installing frontend deps...
    call npm install
    if errorlevel 1 (
        color 0C
        echo [X] npm install failed
        pause
        exit /b 1
    )
)
echo [OK] Frontend OK
echo.

REM Step 5: Start
echo [5/5] Starting...
color 0B
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
start "Backend" /min cmd /k "cd /d %~dp0backend && %VENV_DIR%\Scripts\python.exe main.py"
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173" >nul 2>&1
call npm run dev

taskkill /FI "WINDOWTITLE eq Backend*" /T /F >nul 2>&1
color 0A
echo [OK] Stopped
pause
