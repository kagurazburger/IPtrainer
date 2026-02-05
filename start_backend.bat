@echo off
cd /d E:\AppDev\live-memory-trainer-v8.0\backend
start "Backend" powershell -NoExit -Command "python -m uvicorn main:app --reload --port 8000"
