@echo off
cd /d E:\AppDev\trainer2_deploy_clean\backend
start "Clean Backend" powershell -NoExit -Command "python -m uvicorn main:app --reload --port 8000"
cd /d E:\AppDev\trainer2_deploy_clean
start "Clean Frontend" powershell -NoExit -Command "npx http-server dist -p 8080"
