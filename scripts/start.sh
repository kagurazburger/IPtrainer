#!/bin/bash

echo "========================================"
echo "  Live Memory Trainer - 本地启动脚本"
echo "========================================"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未检测到 Python3，请先安装 Python 3.8+"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "[1/4] 检查后端依赖..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建 Python 虚拟环境..."
    python3 -m venv venv
fi
source venv/bin/activate
if ! python -c "import fastapi" &> /dev/null; then
    echo "安装后端依赖..."
    pip install -r requirements.txt
fi
cd ..

echo "[2/4] 检查前端依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

echo "[3/4] 启动后端服务..."
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

echo "[4/4] 启动前端服务..."
echo ""
echo "========================================"
echo "  服务启动中..."
echo "  后端: http://localhost:8000"
echo "  前端: http://localhost:5173"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 捕获退出信号，清理进程
trap "kill $BACKEND_PID 2>/dev/null; exit" INT TERM

npm run dev

# 清理
kill $BACKEND_PID 2>/dev/null
