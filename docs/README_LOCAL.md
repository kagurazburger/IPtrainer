# Live Memory Trainer - 本地运行版

这是一个基于本地模型的记忆训练 Web 应用，支持语音评估功能。

## 功能特性

- ✅ **本地运行**：无需 Google AI Studio API，完全本地化
- ✅ **语音识别**：使用 Whisper 进行实时语音转文字
- ✅ **智能评估**：使用 Llama 模型严谨比对用户回答与标准答案
- ✅ **语音反馈**：使用浏览器 TTS 进行语音播报
- ✅ **金牌助教**：AI 会具体指出遗漏的关键点，一针见血

## 系统要求

- **Python 3.8+**
- **Node.js 16+**
- **Whisper 脚本**：`E:\whisper\whisper_run.py`
- **Llama CLI**：`C:\Users\Yachen\Documents\QkidsAutomation\QkidsApp2\tools\llama-b7406-bin-win-cuda-12.4-x64\llama-cli.exe`
- **Llama 模型**：`Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`

## 快速开始

### Windows 用户

1. **一键启动**（推荐）：
   ```bash
   start.bat
   ```

2. **手动启动**：
   ```bash
   # 启动后端
   cd backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   python main.py
   
   # 新开一个终端，启动前端
   npm install
   npm run dev
   ```

### Linux/Mac 用户

1. **一键启动**：
   ```bash
   chmod +x start.sh
   ./start.sh
   ```

2. **手动启动**：
   ```bash
   # 启动后端
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python main.py
   
   # 新开一个终端，启动前端
   npm install
   npm run dev
   ```

## 配置

### 后端配置

编辑 `backend/config.json` 文件，设置你的本地模型路径：

```json
{
  "whisper_script": "E:\\whisper\\whisper_run.py",
  "llama_cli_path": "C:\\Users\\Yachen\\Documents\\...\\llama-cli.exe",
  "llama_gguf_path": "C:\\Users\\Yachen\\Documents\\...\\Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
  "janus_model_dir": "C:\\Users\\Yachen\\Documents\\...\\Janus-Pro-1B"
}
```

### 前端配置

创建 `.env` 文件（可选，默认使用 `http://localhost:8000`）：

```env
VITE_API_URL=http://localhost:8000
```

## 使用说明

1. **启动服务**：运行 `start.bat`（Windows）或 `./start.sh`（Linux/Mac）
2. **打开浏览器**：访问 `http://localhost:5173`
3. **选择卡片集**：在 Library 中选择一个卡片集
4. **进入 Recall 模式**：点击 "Recall" 按钮
5. **开始语音评估**：点击 "语音评估" 按钮，开始说话
6. **获得反馈**：AI 会实时转录你的回答，并在你停顿后给出严谨的评估反馈

## 语音评估功能

- **实时转录**：每 3 秒自动转录一次你的语音
- **智能评估**：当你停顿 2 秒后，AI 会自动评估你的回答
- **严谨比对**：AI 会具体指出遗漏的关键点，不吹不捧不废话
- **语音反馈**：评估结果会通过语音播报

## 技术架构

- **前端**：React + TypeScript + Vite
- **后端**：Python FastAPI
- **语音识别**：Whisper
- **AI 评估**：Llama 3.1 8B
- **语音合成**：浏览器 Web Speech API

## 故障排除

### 后端无法启动

1. 检查 Python 版本：`python --version`（需要 3.8+）
2. 检查依赖安装：`pip install -r backend/requirements.txt`
3. 检查配置文件路径是否正确

### 前端无法连接后端

1. 确认后端已启动：访问 `http://localhost:8000`
2. 检查 `.env` 文件中的 `VITE_API_URL` 配置
3. 检查浏览器控制台是否有 CORS 错误

### 语音识别不工作

1. 检查麦克风权限是否已授予
2. 检查 Whisper 脚本路径是否正确
3. 查看后端日志中的错误信息

### AI 评估不工作

1. 检查 Llama CLI 路径是否正确
2. 检查模型文件是否存在
3. 检查是否有足够的系统资源（内存、GPU）

## 开发

### 修改后端配置

编辑 `backend/main.py` 中的 `CONFIG` 或使用 `backend/config.json`

### 修改前端 API 地址

编辑 `.env` 文件或 `services/localService.ts` 中的 `API_BASE_URL`

## 许可证

MIT
