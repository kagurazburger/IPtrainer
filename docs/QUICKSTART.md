# 快速开始指南

## 一键启动（Windows）

```bash
start.bat
```

脚本会自动：
1. 检查 Python 和 Node.js
2. 创建并激活 Python 虚拟环境
3. 安装后端依赖
4. 安装前端依赖
5. 启动后端服务（端口 8000）
6. 启动前端服务（端口 5173）

## 手动启动

### 步骤 1: 配置后端

编辑 `backend/config.json`，设置你的本地模型路径：

```json
{
  "whisper_script": "E:\\whisper\\whisper_run.py",
  "llama_cli_path": "C:\\Users\\Yachen\\Documents\\...\\llama-cli.exe",
  "llama_gguf_path": "C:\\Users\\Yachen\\Documents\\...\\Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
  "janus_model_dir": "C:\\Users\\Yachen\\Documents\\...\\Janus-Pro-1B"
}
```

### 步骤 2: 启动后端

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# 或 source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python main.py
```

后端将在 `http://localhost:8000` 启动

### 步骤 3: 启动前端

新开一个终端：

```bash
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动

## 使用语音评估功能

1. 打开应用：访问 `http://localhost:5173`
2. 选择卡片集：在 Library 中选择一个卡片集
3. 进入 Recall 模式：点击 "Recall" 按钮
4. 开始语音评估：
   - 点击 "语音评估" 按钮
   - 允许麦克风权限
   - 开始说话，回答卡片上的问题
5. 获得反馈：
   - 系统会实时转录你的语音
   - 当你停顿 2 秒后，AI 会自动评估
   - 评估结果会通过语音播报

## 功能说明

### 语音识别
- 使用 Whisper 进行实时语音转文字
- 每 3 秒自动转录一次

### AI 评估
- 使用 Llama 3.1 8B 模型
- 严谨比对用户回答与标准答案
- 具体指出遗漏的关键点
- 反馈一针见血，不吹不捧不废话

### 语音反馈
- 使用浏览器 Web Speech API
- 自动播报评估结果

## 故障排除

### 后端无法启动
- 检查 Python 版本（需要 3.8+）
- 检查配置文件路径是否正确
- 查看后端日志中的错误信息

### 前端无法连接后端
- 确认后端已启动（访问 http://localhost:8000）
- 检查浏览器控制台的错误信息
- 确认 CORS 配置正确

### 语音识别不工作
- 检查麦克风权限
- 检查 Whisper 脚本路径
- 查看后端日志

### AI 评估不工作
- 检查 Llama CLI 路径
- 检查模型文件是否存在
- 检查系统资源（内存、GPU）

## 健康检查

访问 `http://localhost:8000/api/health` 查看系统状态
