@echo off
cd /d "%~dp0\backend"
echo ============================================================
echo   Checking paths in config.json
echo ============================================================
echo.

if not exist "config.json" (
    echo [X] config.json not found!
    pause
    exit /b 1
)

python -c "import json, os; c=json.load(open('config.json', 'r', encoding='utf-8')); paths=[('Whisper Script', c.get('whisper_script')), ('Llama CLI', c.get('llama_cli_path')), ('Llama Model', c.get('llama_gguf_path'))]; print('Results:\n'); [print(f'[OK] {k}: {v}') if os.path.exists(v) else print(f'[X] {k}: {v}') for k,v in paths]"

echo.
echo ============================================================
echo   If you see [X], edit backend\config.json to fix paths
echo ============================================================
pause
