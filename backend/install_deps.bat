@echo off
chcp 65001 >nul 2>&1
title Installing Dependencies - Auto Fix
color 0B

echo.
echo ============================================================
echo   Auto Installing All Dependencies
echo ============================================================
echo.

cd /d "%~dp0"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [X] Python not found!
    pause
    exit /b 1
)

echo [Step 1/5] Creating/Checking virtual environment...
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
    echo [->] Creating %VENV_DIR%...
    %PY_CMD% -m venv %VENV_DIR%
    if errorlevel 1 (
        echo [X] Failed to create venv
        pause
        exit /b 1
    )
    echo [OK] Venv created
) else (
    echo [OK] Venv exists
)

echo.
echo [Step 2/5] Activating virtual environment...
call %VENV_DIR%\Scripts\activate.bat
if errorlevel 1 (
    echo [X] Failed to activate venv
    pause
    exit /b 1
)
echo [OK] Venv activated

echo.
echo [Step 3/5] Upgrading pip, setuptools, wheel...
%VENV_DIR%\Scripts\python.exe -m pip install --upgrade pip setuptools wheel --quiet
if errorlevel 1 (
    echo [W] Pip upgrade failed, continuing anyway...
) else (
    echo [OK] Pip upgraded
)

echo.
echo [Step 4/5] Installing dependencies...
echo This may take several minutes, please wait...
echo.

REM Method 1: Try with pre-built wheels (fastest, most compatible)
echo [Method 1] Trying pre-built wheels (recommended)...
%VENV_DIR%\Scripts\python.exe -m pip install --only-binary :all: --upgrade fastapi uvicorn python-multipart pydantic websockets httpx 2>nul
if not errorlevel 1 (
    echo [OK] Method 1 succeeded!
    goto :install_whisper
)

REM Method 2: Try with latest versions (no version pinning)
echo [Method 2] Trying latest versions...
%VENV_DIR%\Scripts\python.exe -m pip install --upgrade fastapi "uvicorn[standard]" python-multipart pydantic openai-whisper websockets httpx
if not errorlevel 1 (
    echo [OK] Method 2 succeeded!
    goto :verify
)

REM Method 3: Try installing without build isolation
echo [Method 3] Trying without build isolation...
%VENV_DIR%\Scripts\python.exe -m pip install --no-build-isolation --upgrade fastapi "uvicorn[standard]" python-multipart pydantic openai-whisper websockets httpx
if not errorlevel 1 (
    echo [OK] Method 3 succeeded!
    goto :verify
)

REM Method 4: Try installing one by one
echo [Method 4] Trying to install packages one by one...
%VENV_DIR%\Scripts\python.exe -m pip install --upgrade fastapi
if errorlevel 1 (
    echo [W] FastAPI installation failed
) else (
    echo [OK] FastAPI installed
)

%VENV_DIR%\Scripts\python.exe -m pip install --upgrade "uvicorn[standard]"
if errorlevel 1 (
    echo [W] Uvicorn installation failed
) else (
    echo [OK] Uvicorn installed
)

%VENV_DIR%\Scripts\python.exe -m pip install --upgrade python-multipart
if errorlevel 1 (
    echo [W] python-multipart installation failed
) else (
    echo [OK] python-multipart installed
)

%VENV_DIR%\Scripts\python.exe -m pip install --upgrade pydantic
%VENV_DIR%\Scripts\python.exe -m pip install --upgrade openai-whisper websockets httpx
if errorlevel 1 (
    echo [W] Pydantic installation failed
) else (
    echo [OK] Pydantic installed
)

:install_whisper
echo.
echo Installing openai-whisper...
%VENV_DIR%\Scripts\python.exe -m pip install --upgrade openai-whisper
goto :verify

:verify
echo.
echo [Step 5/5] Verifying installation...
echo.

%VENV_DIR%\Scripts\python.exe -m pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [X] FastAPI not installed
    set FAILED=1
) else (
    echo [OK] FastAPI installed
)

%VENV_DIR%\Scripts\python.exe -m pip show uvicorn >nul 2>&1
if errorlevel 1 (
    echo [X] Uvicorn not installed
    set FAILED=1
) else (
    echo [OK] Uvicorn installed
)

%VENV_DIR%\Scripts\python.exe -m pip show python-multipart >nul 2>&1
if errorlevel 1 (
    echo [X] python-multipart not installed
    set FAILED=1
) else (
    echo [OK] python-multipart installed
)

%VENV_DIR%\Scripts\python.exe -m pip show pydantic >nul 2>&1
if errorlevel 1 (
    echo [X] Pydantic not installed
    set FAILED=1
) else (
    echo [OK] Pydantic installed
)

%VENV_DIR%\Scripts\python.exe -m pip show openai-whisper >nul 2>&1
if errorlevel 1 (
    echo [X] openai-whisper not installed
    set FAILED=1
) else (
    echo [OK] openai-whisper installed
)

%VENV_DIR%\Scripts\python.exe -m pip show websockets >nul 2>&1
if errorlevel 1 (
    echo [X] websockets not installed
    set FAILED=1
) else (
    echo [OK] websockets installed
)

%VENV_DIR%\Scripts\python.exe -m pip show httpx >nul 2>&1
if errorlevel 1 (
    echo [X] httpx not installed
    set FAILED=1
) else (
    echo [OK] httpx installed
)

echo.

if defined FAILED (
    color 0C
    echo ============================================================
    echo   Installation incomplete!
    echo ============================================================
    echo.
    echo Some packages failed to install. Possible solutions:
    echo.
    echo 1. Install Microsoft Visual C++ Build Tools:
    echo    https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo    (Select "C++ build tools" workload)
    echo.
    echo 2. Use Python 3.11 or 3.12 instead of 3.14
    echo    (Python 3.14 may have compatibility issues)
    echo.
    echo 3. Try manual installation:
    echo    cd backend
    echo    %VENV_DIR%\Scripts\activate
    echo    pip install fastapi
    echo    pip install uvicorn
    echo    pip install python-multipart
    echo    pip install pydantic
    echo.
    pause
    exit /b 1
) else (
    echo.
    echo Testing imports...
    %VENV_DIR%\Scripts\python.exe test_imports.py
    if errorlevel 1 (
        color 0E
        echo.
        echo [W] Some packages may not work correctly
        echo Please check the error messages above
    ) else (
        color 0A
        echo.
        echo ============================================================
        echo   All dependencies installed and verified!
        echo ============================================================
        echo.
        echo You can now run the launcher:
        echo   ..\start.bat
        echo.
    )
    pause
)
