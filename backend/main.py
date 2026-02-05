"""
Local backend service - speech recognition, evaluation, and TTS
"""
import os
import sys
import subprocess
import json
import base64
import tempfile
import asyncio
import gzip
import struct
import uuid
import httpx
import ssl
import time
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn
import websockets
from websockets.exceptions import InvalidStatus
from websockets.exceptions import ConnectionClosedOK
try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

def _clean_json_content(content: str) -> str:
    """
    改进的JSON内容清理函数，处理常见的AI响应问题
    """
    import re
    
    # 1. 移除多余的逗号（在数组或对象结束前）
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    
    # 2. 处理嵌套引号问题 - 将字符串值中的双引号替换为单引号
    # 只处理明显的嵌套引号模式，避免破坏JSON语法
    content = re.sub(r'([a-zA-Z\u4e00-\u9fff])"([a-zA-Z\u4e00-\u9fff\uff00-\uffef])', r"\1'\2", content)
    
    # 3. 处理未终止字符串 - 修复缺少逗号和引号的情况
    # 查找模式： "text": "string, "image":  ->  "text": "string", "image":
    content = re.sub(r'("text"\s*:\s*"[^"]*),(\s*"image")', r'\1",\2', content)
    
    return content

app = FastAPI(title="Live Memory Trainer Local Backend")
def _load_deck_from_path(path_str: str) -> Dict[str, Any]:
    """Load deck data from a JSON file path or directory."""
    if not path_str:
        raise RuntimeError("Empty deck path")

    path = Path(path_str)
    if path.is_dir():
        candidates = sorted(path.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise RuntimeError(f"No JSON files found in {path}")
        path = candidates[0]

    if not path.exists() or not path.is_file():
        raise RuntimeError(f"Deck file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        cards = data
    elif isinstance(data, dict) and isinstance(data.get("cards"), list):
        cards = data["cards"]
    else:
        raise RuntimeError("Invalid deck JSON format. Expected array or { cards: [...] }")

    return {"cards": cards, "source_path": str(path)}

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load config
def load_config():
    """Load config from config.json or environment variables"""
    config_path = Path(__file__).parent / "config.json"
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print("Loaded config from config.json")
                return config
        except Exception as e:
            print("Warning: Failed to load config.json")
    
    # Default config (env or hardcoded)
    default_config = {
        "volc_asr_endpoint": os.getenv("VOLC_ASR_ENDPOINT", "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"),
        "volc_asr_app_key": os.getenv("VOLC_ASR_APP_KEY", ""),
        "volc_asr_access_token": os.getenv("VOLC_ASR_ACCESS_TOKEN", ""),
        "volc_asr_resource_id": os.getenv("VOLC_ASR_RESOURCE_ID", "volc.bigasr.sauc.duration"),
        "volc_asr_fast_mode": True,
        "volc_llm_api_base": os.getenv("VOLC_LLM_API_BASE", "https://ark.cn-beijing.volces.com/api/v3"),
        "volc_llm_api_key": os.getenv("VOLC_LLM_API_KEY", ""),
        "volc_llm_model": os.getenv("VOLC_LLM_MODEL", "doubao-seed-1-8-251228"),
        "volc_llm_max_tokens": 40,
        "volc_llm_temperature": 0.1
    }
    print("Using default config")
    return default_config

class EvaluationRequest(BaseModel):
    user_answer: str
    correct_answer: str
    question: str
    ip: Optional[str] = None
    section: Optional[str] = None

class SpeechRequest(BaseModel):
    text: str

@app.get("/")
async def root():
    return {"status": "ok", "service": "Live Memory Trainer Local Backend"}

def _path_exists(p: str) -> bool:
    """Check if a path exists (Windows-friendly)"""
    if not p or not isinstance(p, str):
        return False
    path = Path(p.strip())
    try:
        return path.exists()
    except Exception:
        return False

def _ffmpeg_to_pcm16k_mono(input_path: str) -> bytes:
    """Convert any audio to 16k mono PCM (s16le) using ffmpeg."""
    cmd = [
        "ffmpeg", "-nostdin", "-threads", "0",
        "-i", input_path,
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000",
        "-"
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        err = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"ffmpeg failed: {err}")
    return result.stdout

def _build_header(msg_type: int, flags: int, serialization: int, compression: int) -> bytes:
    # version=1, header_size=1 (4 bytes)
    b0 = (1 << 4) | 1
    b1 = ((msg_type & 0x0F) << 4) | (flags & 0x0F)
    b2 = ((serialization & 0x0F) << 4) | (compression & 0x0F)
    b3 = 0
    return bytes([b0, b1, b2, b3])

async def _volc_asr_transcribe(tmp_file_path: str, cfg: Dict[str, Any], language: Optional[str] = None) -> str:
    """Transcribe audio via Volcengine ASR (WebSocket)."""
    endpoint = cfg.get("volc_asr_endpoint") or "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
    app_key = cfg.get("volc_asr_app_key")
    access_token = cfg.get("volc_asr_access_token")
    resource_id = cfg.get("volc_asr_resource_id") or "volc.seedasr.sauc.duration"
    # Some console pages show instance IDs like "Speech_Recognition_Seed_streaming..."
    # API expects resource IDs like "volc.seedasr.sauc.duration"
    if resource_id and not str(resource_id).startswith("volc."):
        resource_id = "volc.seedasr.sauc.duration"
    if not app_key or not access_token:
        raise RuntimeError("Volc ASR credentials missing in config.json")

    pcm = _ffmpeg_to_pcm16k_mono(tmp_file_path)
    # Full client request payload (JSON + gzip)
    audio_config = {
        "format": "pcm",
        "codec": "raw",
        "rate": 16000,
        "bits": 16,
        "channel": 1
    }
    if language:
        audio_config["language"] = language
    req_payload = {
        "user": {"uid": "local-user"},
        "audio": audio_config,
        "request": {
            "model_name": "bigmodel",
            "enable_itn": False,
            "enable_punc": False
        }
    }
    payload_json = json.dumps(req_payload).encode("utf-8")
    payload_gz = gzip.compress(payload_json)
    header = _build_header(msg_type=1, flags=0, serialization=1, compression=1)
    msg = header + struct.pack(">I", len(payload_gz)) + payload_gz

    open_timeout = int(cfg.get("volc_asr_open_timeout", 10))
    fast_mode = bool(cfg.get("volc_asr_fast_mode", True))
    recv_timeout = float(cfg.get("volc_asr_recv_timeout", 2.0))
    ssl_ctx = ssl.create_default_context()

    async def _try_with_resource(rid: str):
        headers = {
            "X-Api-App-Key": str(app_key),
            "X-Api-Access-Key": str(access_token),
            "X-Api-Resource-Id": str(rid),
            "X-Api-Connect-Id": str(uuid.uuid4())
        }
        # websockets API differs by version (extra_headers vs additional_headers)
        try:
            ws_ctx = websockets.connect(
                endpoint,
                additional_headers=headers,
                max_size=None,
                open_timeout=open_timeout,
                ssl=ssl_ctx
            )
        except TypeError:
            ws_ctx = websockets.connect(
                endpoint,
                extra_headers=headers,
                max_size=None,
                open_timeout=open_timeout,
                ssl=ssl_ctx
            )
        async with ws_ctx as ws:
            await ws.send(msg)

            # send audio chunks (200ms each: 3200 samples * 2 bytes = 6400)
            chunk_size = 6400
            for i in range(0, len(pcm), chunk_size):
                chunk = pcm[i:i + chunk_size]
                last = i + chunk_size >= len(pcm)
                flags = 2 if last else 0
                # audio-only request should be gzip-compressed per protocol
                chunk_gz = gzip.compress(chunk)
                header = _build_header(msg_type=2, flags=flags, serialization=0, compression=1)
                frame = header + struct.pack(">I", len(chunk_gz)) + chunk_gz
                await ws.send(frame)

            # collect responses (use last non-empty text)
            last_text = ""
            def _extract_text(resp_obj: Dict[str, Any]) -> str:
                result = resp_obj.get("result")
                if isinstance(result, dict):
                    text = result.get("text")
                    if text:
                        return str(text)
                if isinstance(result, list):
                    for item in result:
                        if isinstance(item, dict) and item.get("text"):
                            return str(item.get("text"))
                if resp_obj.get("text"):
                    return str(resp_obj.get("text"))
                return ""

            try:
                while True:
                    data = await asyncio.wait_for(ws.recv(), timeout=recv_timeout)
                    if isinstance(data, str):
                        continue
                    if len(data) < 8:
                        continue
                    header = data[:4]
                    msg_type = (header[1] >> 4) & 0x0F
                    flags = header[1] & 0x0F
                    compression = header[2] & 0x0F
                    idx = 4
                    if flags in (1, 3):
                        if len(data) < 12:
                            continue
                        idx += 4  # skip sequence
                    if len(data) < idx + 4:
                        continue
                    payload_size = struct.unpack(">I", data[idx:idx + 4])[0]
                    idx += 4
                    payload = data[idx:idx + payload_size]
                    if compression == 1 and payload:
                        payload = gzip.decompress(payload)
                    if msg_type == 0x0F:
                        err_text = payload.decode("utf-8", errors="replace")
                        raise RuntimeError(f"Volc ASR error frame: {err_text}")
                    try:
                        resp = json.loads(payload.decode("utf-8", errors="replace"))
                        text = _extract_text(resp)
                        if text:
                            last_text = text
                            # Do not break on first result: we sent the full file, so keep
                            # reading until timeout to get the final/cumulative transcription.
                    except Exception:
                        pass
            except asyncio.TimeoutError:
                pass
            except ConnectionClosedOK:
                # Normal close after last sequence
                pass
        return last_text.strip()

    # Try resource candidates in order (seed -> big)
    candidates = []
    cfg_candidates = cfg.get("volc_asr_resource_candidates")
    if isinstance(cfg_candidates, list) and cfg_candidates:
        candidates.extend([str(x) for x in cfg_candidates])
    candidates.extend([resource_id, "volc.seedasr.sauc.duration", "volc.bigasr.sauc.duration"])
    # de-dup preserve order
    seen = set()
    candidates = [c for c in candidates if c and not (c in seen or seen.add(c))]

    last_err = None
    for rid in candidates:
        try:
            return await _try_with_resource(rid)
        except Exception as e:
            last_err = e
            msg = repr(e)
            # If resource not granted, try next candidate
            if "requested resource not granted" in msg:
                continue
            # Any other error: surface immediately
            raise RuntimeError(
                f"Volc ASR connect/send failed: {msg}. "
                f"Check network access to {endpoint} or firewall/proxy settings."
            )

    raise RuntimeError(
        f"Volc ASR connect/send failed: {repr(last_err)}. "
        f"Tried resource_ids: {', '.join(candidates)}"
    )

async def _volc_asr_auth_check(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Check ASR resource authorization by opening websocket handshake."""
    endpoint = cfg.get("volc_asr_endpoint") or "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
    app_key = cfg.get("volc_asr_app_key")
    access_token = cfg.get("volc_asr_access_token")
    if not app_key or not access_token:
        return {"ok": False, "error": "Missing volc_asr_app_key or volc_asr_access_token"}

    resource_id = cfg.get("volc_asr_resource_id") or "volc.seedasr.sauc.duration"
    candidates = []
    cfg_candidates = cfg.get("volc_asr_resource_candidates")
    if isinstance(cfg_candidates, list) and cfg_candidates:
        candidates.extend([str(x) for x in cfg_candidates])
    candidates.extend([resource_id, "volc.seedasr.sauc.duration", "volc.bigasr.sauc.duration"])
    seen = set()
    candidates = [c for c in candidates if c and not (c in seen or seen.add(c))]

    open_timeout = int(cfg.get("volc_asr_open_timeout", 10))
    ssl_ctx = ssl.create_default_context()
    results = []

    async def _try_connect(rid: str) -> Dict[str, Any]:
        headers = {
            "X-Api-App-Key": str(app_key),
            "X-Api-Access-Key": str(access_token),
            "X-Api-Resource-Id": str(rid),
            "X-Api-Connect-Id": str(uuid.uuid4())
        }
        # websockets API differs by version (extra_headers vs additional_headers)
        try:
            ws_ctx = websockets.connect(
                endpoint,
                additional_headers=headers,
                max_size=None,
                open_timeout=open_timeout,
                ssl=ssl_ctx
            )
        except TypeError:
            ws_ctx = websockets.connect(
                endpoint,
                extra_headers=headers,
                max_size=None,
                open_timeout=open_timeout,
                ssl=ssl_ctx
            )
        async with ws_ctx as ws:
            await ws.close()
        return {"resource_id": rid, "ok": True}

    for rid in candidates:
        try:
            results.append(await _try_connect(rid))
        except InvalidStatus as e:
            err = str(e)
            body = None
            try:
                body = e.response.body.decode("utf-8", errors="replace") if e.response and e.response.body else None
            except Exception:
                body = None
            results.append({"resource_id": rid, "ok": False, "error": err, "body": body})
        except Exception as e:
            results.append({"resource_id": rid, "ok": False, "error": repr(e)})

    any_ok = any(r.get("ok") for r in results)
    return {"ok": any_ok, "endpoint": endpoint, "results": results}

def _volc_llm_evaluate(prompt: str, cfg: Dict[str, Any]) -> str:
    """Evaluate with Volcengine Ark (Doubao) OpenAI-compatible Chat Completions API.
    教练式评估：看是否表达核心概念，基于学生原话给具体反馈，不机械比对字句。
    """
    base = cfg.get("volc_llm_api_base") or cfg.get("doubao_ark_api_base") or "https://ark.cn-beijing.volces.com/api/v3"
    api_key = cfg.get("volc_llm_api_key") or cfg.get("doubao_ark_api_key")
    model = cfg.get("volc_llm_model") or "doubao-seed-1-8-251228"
    if not api_key:
        raise RuntimeError("Volc LLM API key missing in config.json")

    url = base.rstrip("/") + "/chat/completions"
    # 评估反馈需要足够长度，才能给出具体、不笼统的建议
    max_tokens = int(cfg.get("volc_llm_evaluate_max_tokens", 280))
    temperature = float(cfg.get("volc_llm_temperature", 0.2))
    system_content = (
        "You are a thoughtful training coach for recall practice. Your job is to judge whether the learner "
        "has expressed the **core ideas** in their own words—not whether they repeated the reference text. "
        "Do not compare sentence-by-sentence or demand exact wording. "
        "Give feedback that is (1) specific to what they actually said, (2) clear on what they got right or wrong conceptually, "
        "and (3) one concrete next step or refinement based on their answer—avoid generic praise or vague advice. "
        "Write in the same language as the learner's answer (e.g. Chinese if they answered in Chinese). Keep it concise but substantive."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise RuntimeError(f"Volc LLM error {resp.status_code}: {resp.text}")
    data = resp.json()
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    return text.strip()

@app.get("/api/health")
async def health_check():
    """Health check - reload config each request"""
    cfg = load_config()
    checks = {
        "volc_asr_app_key": bool(cfg.get("volc_asr_app_key")),
        "volc_asr_access_token": bool(cfg.get("volc_asr_access_token")),
        "volc_asr_resource_id": bool(cfg.get("volc_asr_resource_id")),
        "volc_llm_api_key": bool(cfg.get("volc_llm_api_key")),
        "volc_llm_model": bool(cfg.get("volc_llm_model")),
    }
    missing = [k for k, v in checks.items() if not v]
    status = "healthy" if len(missing) == 0 else "degraded"
    return {
        "status": status,
        "checks": checks,
        "missing": missing,
        "message": f"Missing: {', '.join(missing)}" if missing else "All settings OK",
        "config": {k: str(v) for k, v in cfg.items()}
    }

@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...), language: Optional[str] = Form(None)):
    """Speech-to-text (Volc ASR)"""
    tmp_file_path = None
    try:
        cfg = load_config()
        # Save to temp file, then use Volc ASR
        content_type = audio.content_type or "audio/webm"
        suffix = ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        print(f"[transcribe] volc_asr content_type={content_type}, bytes={len(content)}, tmp={tmp_file_path}, language={language}")
        text = await _volc_asr_transcribe(tmp_file_path, cfg, language)
        return {"transcript": text}
    
    except subprocess.TimeoutExpired:
        print("[transcribe] timeout expired")
        raise HTTPException(status_code=500, detail="Transcription timed out. Please retry.")
    except Exception as e:
        print(f"[transcribe] exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Ensure temp file cleanup
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except:
                pass

@app.post("/api/evaluate")
async def evaluate_answer(request: EvaluationRequest):
    """教练式评估：判断是否表达核心概念，基于用户原话给具体反馈，不机械比对原文。"""
    try:
        cfg = load_config()
        user_prompt = (
            "Question (what the learner was asked):\n"
            f"{request.question or '(no question)'}\n\n"
            "Reference (key concepts that a correct answer should convey—do not require exact wording):\n"
            f"{request.correct_answer}\n\n"
            "Learner's answer (evaluate whether they expressed the core ideas in their own words):\n"
            f"{request.user_answer}\n\n"
            "Instructions: (1) Decide if they captured the main idea(s). "
            "(2) Say specifically what in their answer was right or off—refer to their actual words. "
            "(3) Give one concrete suggestion (what to add, clarify, or rephrase) based on their answer. "
            "No generic phrases; feedback must be tailored to what they said."
        )
        cloud_text = _volc_llm_evaluate(prompt=user_prompt, cfg=cfg)
        feedback = cloud_text.strip() if cloud_text else "请再试一次，说清楚你的理解。"
        return {
            "feedback": feedback,
            "user_answer": request.user_answer,
            "correct_answer": request.correct_answer
        }
    except Exception as e:
        print(f"[evaluate] exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tts")
async def text_to_speech(request: SpeechRequest):
    """Text-to-speech (system TTS or Janus)"""
    try:
        # Option 1: Windows SAPI (simple and fast)
        # Option 2: Integrate Janus TTS if available
        
        # Use simple system TTS for now
        # Return text; frontend can use Web Speech API
        return {
            "text": request.text,
            "audio_url": None,  # Return URL if audio is generated
            "use_web_speech": True  # Tell frontend to use Web Speech API
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stream-evaluate")
async def stream_evaluate(request: EvaluationRequest):
    """Streaming evaluation (realtime feedback)"""
    # Use standard evaluation for now
    result = await evaluate_answer(request)
    return result

@app.get("/api/asr-auth-check")
async def asr_auth_check():
    """Check ASR resource authorization."""
    cfg = load_config()
    return await _volc_asr_auth_check(cfg)

@app.get("/api/default-decks")
async def default_decks():
    """Load all deck JSON files from default path(s) in config.json, return as separate decks."""
    cfg = load_config()
    paths = cfg.get("default_deck_paths") or cfg.get("default_deck_path")
    if isinstance(paths, str):
        paths = [paths]
    if not isinstance(paths, list) or not paths:
        raise HTTPException(status_code=400, detail="No default_deck_path(s) configured")

    all_decks = []
    for folder_path in paths:
        path = Path(folder_path)
        if not path.exists():
            continue
        if path.is_file():
            try:
                data = _load_deck_from_path(str(path))
                title = path.stem
                all_decks.append({"title": title, "cards": data["cards"], "source_path": data["source_path"]})
            except Exception:
                continue
        elif path.is_dir():
            for json_file in sorted(path.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    data = _load_deck_from_path(str(json_file))
                    title = json_file.stem
                    all_decks.append({"title": title, "cards": data["cards"], "source_path": data["source_path"]})
                except Exception:
                    continue

    if not all_decks:
        raise HTTPException(status_code=404, detail="No valid deck JSON files found in default paths")
    return {"decks": all_decks}

class SaveDeckRequest(BaseModel):
    title: str
    cards: list

class GenerateCardsRequest(BaseModel):
    prompt: str
    max_tokens: Optional[int] = 2000


class ChatDecksCard(BaseModel):
    ip: Optional[str] = ""
    section: Optional[str] = ""
    question: Optional[str] = ""
    hint: Optional[str] = ""
    text: Optional[str] = ""
    image: Optional[str] = ""


class ChatDecksDeck(BaseModel):
    title: str
    cards: list


class ChatDecksRequest(BaseModel):
    query: str
    decks: list  # list of { title, cards }


def _volc_llm_chat_decks(query: str, decks_text: str, cfg: Dict[str, Any]) -> str:
    """Call Volc LLM with deck context to answer user question."""
    base = cfg.get("volc_llm_api_base") or "https://ark.cn-beijing.volces.com/api/v3"
    api_key = cfg.get("volc_llm_api_key")
    model = cfg.get("volc_llm_model") or "doubao-seed-1-8-251228"
    if not api_key:
        raise RuntimeError("Volc LLM API key missing in config.json")
    url = base.rstrip("/") + "/chat/completions"
    max_tokens = int(cfg.get("volc_llm_chat_max_tokens", 1500))
    temperature = float(cfg.get("volc_llm_temperature", 0.3))
    system_content = (
        "你是一个基于卡牌/话术数据的智能助手。用户会提供若干组卡牌（每组有标题和若干条卡牌，每条含 section/question/text 等字段）。"
        "请仅根据用户提供的卡牌内容回答用户的问题，如总结、提炼话术、对比、归纳等。"
        "回答使用与用户问题相同的语言（如用户用中文则用中文）。保持条理清晰、有针对性。"
    )
    user_content = f"【卡牌数据】\n{decks_text}\n\n【用户问题】\n{query}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=90) as client:
        resp = client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise RuntimeError(f"Volc LLM error {resp.status_code}: {resp.text}")
    data = resp.json()
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    return text.strip()


@app.post("/api/chat-decks")
async def chat_decks(request: ChatDecksRequest):
    """Let LLM answer questions based on provided deck (card) data."""
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    if not request.decks or not isinstance(request.decks, list):
        raise HTTPException(status_code=400, detail="decks array is required")
    cfg = load_config()
    parts = []
    for d in request.decks:
        if not isinstance(d, dict):
            continue
        title = d.get("title") or "未命名卡组"
        cards = d.get("cards") or d.get("CARDS") or []
        if not isinstance(cards, list):
            continue
        block = [f"## 卡组：{title}"]
        for i, c in enumerate(cards):
            if not isinstance(c, dict):
                continue
            section = c.get("section") or c.get("SECTION") or ""
            question = c.get("question") or c.get("QUESTION") or ""
            text = c.get("text") or c.get("TEXT") or ""
            ip = c.get("ip") or c.get("IP") or ""
            block.append(f"- [{section}] Q: {question} | A: {text} | IP: {ip}")
        parts.append("\n".join(block))
    decks_text = "\n\n".join(parts) if parts else "(无卡牌数据)"
    try:
        reply = _volc_llm_chat_decks(request.query.strip(), decks_text, cfg)
        return {"reply": reply}
    except Exception as e:
        print(f"[chat-decks] Error: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-cards")
async def generate_cards(request: GenerateCardsRequest):
    """Generate flashcards from text prompt using Volc LLM."""
    print(f"[generate-cards] Received request with prompt length: {len(request.prompt)}")
    print(f"[generate-cards] Prompt preview: {request.prompt[:200]}...")
    
    cfg = load_config()
    base = cfg.get("volc_llm_api_base") or "https://ark.cn-beijing.volces.com/api/v3"
    api_key = cfg.get("volc_llm_api_key")
    model = cfg.get("volc_llm_model") or "doubao-seed-1-8-251228"
    if not api_key:
        print("[generate-cards] ERROR: API key missing")
        raise HTTPException(status_code=400, detail="Volc LLM API key missing in config.json")

    # Shorter prompt for faster processing
    master_prompt = """Extract facts into JSON array. Format: [{"ip":"name","section":"IDENTITY|APPEARANCE|PERSONALITY|NARRATIVE|SYMBOLISM|ORIGIN|TABOO","question":"recall question","hint":"1-3 words","text":"fact","image":""}]. One fact = one card. Output ONLY JSON, no markdown."""

    user_prompt = f"{request.prompt}\n\nExtract facts into JSON array."

    url = base.rstrip("/") + "/chat/completions"
    # Use a higher max_tokens for card generation (override config default)
    generation_max_tokens = request.max_tokens or 2000
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": master_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": generation_max_tokens
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    try:
        print(f"[generate-cards] Requesting LLM with prompt length: {len(request.prompt)}, max_tokens: {request.max_tokens}")
        # Increase timeout for longer texts (120 seconds)
        timeout_seconds = 120.0 if len(request.prompt) > 2000 else 90.0
        print(f"[generate-cards] Using timeout: {timeout_seconds}s")
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.post(url, headers=headers, json=payload)
        print(f"[generate-cards] LLM response status: {resp.status_code}")
        if resp.status_code != 200:
            error_text = resp.text[:500] if resp.text else "No error message"
            raise HTTPException(status_code=500, detail=f"Volc LLM error {resp.status_code}: {error_text}")
        data = resp.json()
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        
        if not text:
            raise HTTPException(status_code=500, detail="Empty response from LLM")
        
        print(f"[generate-cards] LLM response length: {len(text)}")
        
        # Extract JSON from response (might be wrapped in markdown code blocks)
        text = text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        cards = json.loads(text)
        if not isinstance(cards, list):
            cards = [cards]
        print(f"[generate-cards] Successfully parsed {len(cards)} cards")
        return {"cards": cards}
    except json.JSONDecodeError as e:
        print(f"[generate-cards] JSON decode error: {str(e)}")
        print(f"[generate-cards] Response text (first 500 chars): {text[:500] if 'text' in locals() else 'N/A'}")
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON from LLM response: {str(e)}")
    except httpx.TimeoutException:
        print(f"[generate-cards] Request timeout after {timeout_seconds if 'timeout_seconds' in locals() else 120} seconds")
        raise HTTPException(status_code=500, detail="LLM request timed out. The text might be too long. Try splitting it into smaller parts or check your network connection.")
    except Exception as e:
        print(f"[generate-cards] Exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.post("/api/save-deck")
async def save_deck(request: SaveDeckRequest):
    """Save deck as JSON file to default_deck_paths folder."""
    cfg = load_config()
    paths = cfg.get("default_deck_paths") or cfg.get("default_deck_path")
    if isinstance(paths, str):
        paths = [paths]
    if not isinstance(paths, list) or not paths:
        raise HTTPException(status_code=400, detail="No default_deck_path(s) configured")

    # Use first path as save location
    save_dir = Path(paths[0])
    if not save_dir.exists():
        save_dir.mkdir(parents=True, exist_ok=True)
    
    # Sanitize filename
    safe_title = "".join(c for c in request.title if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_title:
        safe_title = f"deck-{int(time.time())}"
    
    json_path = save_dir / f"{safe_title}.json"
    
    # Ensure unique filename
    counter = 1
    while json_path.exists():
        json_path = save_dir / f"{safe_title}-{counter}.json"
        counter += 1
    
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(request.cards, f, ensure_ascii=False, indent=2)
        return {"success": True, "path": str(json_path), "filename": json_path.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save deck: {str(e)}")

@app.post("/api/ocr")
async def ocr_image(image: UploadFile = File(...)):
    """Extract text from image using Baidu OCR (if configured) or fallback."""
    cfg = load_config()
    baidu_api_key = cfg.get("baidu_ocr_api_key")
    baidu_secret_key = cfg.get("baidu_ocr_secret_key")
    
    if not baidu_api_key or not baidu_secret_key:
        raise HTTPException(status_code=400, detail="Baidu OCR not configured. Add baidu_ocr_api_key and baidu_ocr_secret_key to config.json")
    
    tmp_file_path = None
    try:
        # Save uploaded image
        content = await image.read()
        suffix = Path(image.filename or "image.jpg").suffix or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        # Get Baidu access token
        token_url = "https://aip.baidubce.com/oauth/2.0/token"
        token_params = {
            "grant_type": "client_credentials",
            "client_id": baidu_api_key,
            "client_secret": baidu_secret_key
        }
        token_resp = httpx.post(token_url, params=token_params, timeout=10)
        if token_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get Baidu access token")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=500, detail="No access token in Baidu response")
        
        # Call Baidu OCR API
        ocr_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token={access_token}"
        with open(tmp_file_path, "rb") as f:
            files = {"image": f}
            ocr_resp = httpx.post(ocr_url, files=files, timeout=30)
        
        if ocr_resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Baidu OCR error: {ocr_resp.text}")
        
        ocr_data = ocr_resp.json()
        words_result = ocr_data.get("words_result", [])
        text = "\n".join([item.get("words", "") for item in words_result])
        
        return {"text": text, "words_count": len(words_result)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except:
                pass

@app.post("/api/process-text")
async def process_text_file(
    file: UploadFile = File(...),
    system_prompt: str = Form(...)
):
    """
    处理文本文件：使用 DeepSeek API 根据 system prompt 处理文本，并保存到 output 文件夹
    """
    try:
        print("Starting process-text endpoint...")
        # 检查文件类型
        allowed_extensions = ['.txt', '.srt', '.md', '.markdown', '.docx', '.text']
        file_ext = Path(file.filename).suffix.lower() if file.filename else ''
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型。支持的类型: {', '.join(allowed_extensions)}"
            )

        # 读取文件内容
        content = await file.read()
        
        # 处理不同文件格式
        if file_ext == '.docx':
            if not DOCX_AVAILABLE:
                raise HTTPException(
                    status_code=500,
                    detail="处理Word文档需要安装 python-docx 库。请运行: pip install python-docx"
                )
            # 保存到临时文件然后用docx库读取
            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp_file:
                tmp_file.write(content)
                tmp_file_path = tmp_file.name
            
            try:
                doc = Document(tmp_file_path)
                text_content = '\n'.join([paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip()])
            finally:
                # 清理临时文件
                if os.path.exists(tmp_file_path):
                    os.unlink(tmp_file_path)
        else:
            # 其他文本文件直接解码
            text_content = content.decode('utf-8', errors='ignore')

        print(f"Text content length: {len(text_content)}")
        print(f"Text content preview: {repr(text_content[:100])}")

        # 获取 DeepSeek API Key（环境变量优先，再读 config.json）
        api_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
        if not api_key:
            config = load_config()
            api_key = (config.get("deepseek_api_key") or "").strip()
        if not api_key:
            for try_path in [Path(__file__).parent / "config.json", Path(__file__).parent.parent / "backend" / "config.json"]:
                if try_path.exists():
                    try:
                        with open(try_path, "r", encoding="utf-8") as f:
                            cfg = json.load(f)
                            api_key = (cfg.get("deepseek_api_key") or "").strip()
                            if api_key:
                                break
                    except Exception:
                        pass
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="DeepSeek API Key 未配置。请设置 DEEPSEEK_API_KEY 环境变量或在 config.json 中配置 deepseek_api_key"
            )

        config = load_config()
        base_url = (config.get("deepseek_base_url") or "https://api.deepseek.com").rstrip("/")
        model_name = config.get("deepseek_model") or "deepseek-chat"

        print(f"Config loaded, base_url: {base_url}, model: {model_name}")
        print(f"System prompt: {repr(system_prompt[:100])}")

        # 固定输出格式：必须返回闪卡 JSON 数组
        format_instruction = (
            "\n\n【重要格式要求】\n"
            "你必须只输出一个有效的JSON数组，不要输出任何其他文字、解释或markdown格式。\n"
            "JSON格式必须完全正确：\n"
            "- 使用双引号，不要使用单引号\n"
            "- 正确转义字符串中的特殊字符\n"
            "- 确保所有括号、中括号都匹配\n"
            "- 不要在JSON中包含注释\n"
            "- 不要使用多行字符串\n"
            "- 数组中每个对象必须包含：ip, section, question, hint, text, image字段\n"
            "\n示例格式：\n"
            '[{"ip":"主题","section":"IDENTITY","question":"问题？","hint":"提示","text":"答案","image":""}]'
        )

        print(f"Format instruction length: {len(format_instruction)}")
        print(f"Format instruction preview: {repr(format_instruction[:100])}")

        system_with_format = (system_prompt.strip() + format_instruction).strip()

        print(f"System prompt length: {len(system_with_format)}")
        print(f"System prompt preview: {repr(system_with_format[:100])}")

        api_url = f"{base_url}/v1/chat/completions"
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_with_format},
                {"role": "user", "content": f"请将以下内容提取/整理为闪卡 JSON 数组：\n\n{text_content}"}
            ],
            "temperature": 0.3
        }

        print("Making API call to DeepSeek...")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                api_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=120.0
            )

            if response.status_code != 200:
                error_text = response.text[:200] if response.text else "No error details"
                # Clean error text to avoid encoding issues
                error_text = error_text.encode('utf-8', errors='replace').decode('utf-8')
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"DeepSeek API 调用失败: {error_text}"
                )

            result = response.json()
            choice = result.get("choices", [{}])[0]
            raw_content = (choice.get("message") or {}).get("content", "").strip()
            if not raw_content:
                raise HTTPException(status_code=500, detail="DeepSeek API 返回空结果")

        # 解析 JSON：去掉可能的 ```json ... ``` 包裹
        raw_content = raw_content.strip()
        original_length = len(raw_content)
        
        # 清理可能的markdown代码块
        if raw_content.startswith("```"):
            lines = raw_content.split("\n")
            if lines[0].lower().startswith("```json"):
                lines = lines[1:]
            elif lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_content = "\n".join(lines).strip()
        
        # 进一步清理：移除可能的额外文本
        # 有时候AI会在JSON前后添加解释文字
        json_start = raw_content.find('[')
        json_end = raw_content.rfind(']') + 1
        
        if json_start != -1 and json_end > json_start:
            raw_content = raw_content[json_start:json_end]
        
        # 增强的JSON清理：处理常见问题
        raw_content = _clean_json_content(raw_content)
        
        # 验证JSON格式
        try:
            cards_raw = json.loads(raw_content)
        except json.JSONDecodeError as e:
            # 提供更详细的错误信息
            error_msg = f"AI 返回的不是合法 JSON: {e}\n"
            error_msg += f"原始响应长度: {original_length} 字符\n"
            error_msg += f"清理后长度: {len(raw_content)} 字符\n"
            
            # Clean content preview to avoid encoding issues
            preview_start = raw_content[:500].encode('utf-8', errors='replace').decode('utf-8')
            preview_end = raw_content[-500:].encode('utf-8', errors='replace').decode('utf-8') if len(raw_content) > 500 else raw_content.encode('utf-8', errors='replace').decode('utf-8')
            
            error_msg += f"内容预览 (前500字符): {preview_start}...\n"
            error_msg += f"内容预览 (后500字符): ...{preview_end}"
            
            # 检查常见问题
            if '"' in raw_content and not raw_content.count('"') % 2 == 0:
                error_msg += "\n可能问题: 引号不匹配"
            if '{' in raw_content and '}' in raw_content:
                brace_count = raw_content.count('{') - raw_content.count('}')
                if brace_count != 0:
                    error_msg += f"\n可能问题: 大括号不匹配 (多{brace_count}个{{)"
            if '[' in raw_content and ']' in raw_content:
                bracket_count = raw_content.count('[') - raw_content.count(']')
                if bracket_count != 0:
                    error_msg += f"\n可能问题: 中括号不匹配 (多{bracket_count}个[)"
                    
            raise HTTPException(status_code=500, detail=error_msg)

        if not isinstance(cards_raw, list):
            cards_raw = [cards_raw] if isinstance(cards_raw, dict) else []
        section_ok = {"IDENTITY", "APPEARANCE", "PERSONALITY", "NARRATIVE", "SYMBOLISM", "ORIGIN", "TABOO", "SENSORY", "VIBE", "GIFTING", "VALUE", "URGENCY"}
        cards = []
        for i, c in enumerate(cards_raw):
            if not isinstance(c, dict):
                continue
            ip = str(c.get("ip") or c.get("IP") or "").strip() or "未分类"
            sec = str(c.get("section") or "").strip().upper()
            if sec not in section_ok:
                sec = "NARRATIVE"
            cards.append({
                "id": str(c.get("id") or f"text-{int(time.time())}-{i}"),
                "ip": ip,
                "section": sec,
                "question": str(c.get("question") or "").strip(),
                "hint": str(c.get("hint") or "").strip(),
                "text": str(c.get("text") or "").strip(),
                "image": str(c.get("image") or "").strip()
            })
        if not cards:
            raise HTTPException(status_code=500, detail="未能从 AI 返回中解析出有效闪卡")

        # 生成文档outline summary
        outline_content = ""
        try:
            outline_prompt = (
                "Create a comprehensive, hierarchical outline summary of the following document content. "
                "Organize the information into a structured outline with main topics and subtopics. "
                "Use markdown formatting with # for main topics and ## for subtopics. "
                "Be concise but complete, capturing all key information from the document."
            )
            
            outline_payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": outline_prompt},
                    {"role": "user", "content": f"Document content:\n\n{text_content}"}
                ],
                "temperature": 0.3,
                "max_tokens": 1500
            }
            
            async with httpx.AsyncClient() as client:
                outline_response = await client.post(
                    api_url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=outline_payload,
                    timeout=60.0
                )
                
                if outline_response.status_code == 200:
                    outline_result = outline_response.json()
                    outline_choice = outline_result.get("choices", [{}])[0]
                    outline_content = (outline_choice.get("message") or {}).get("content", "").strip()
                    
                    # Ensure outline_content is properly encoded
                    if isinstance(outline_content, str):
                        outline_content = outline_content.encode('utf-8').decode('utf-8')
                    
                    # 为每个卡牌添加outline
                    for card in cards:
                        card["outline"] = outline_content
                else:
                    print(f"Outline generation failed: {outline_response.status_code}")
                    # 如果outline生成失败，继续处理但不添加outline
                    pass
                    
        except Exception as e:
            print(f"Outline generation error: {str(e)}")
            # 如果outline生成失败，继续处理但不添加outline
            pass

        original_name = Path(file.filename).stem if file.filename else "processed"
        deck_title = original_name.replace("_", " ").strip() or (cards[0].get("ip") or "新闪卡组")

        output_dir = Path(__file__).parent.parent / "output"
        output_dir.mkdir(exist_ok=True)
        output_filename = f"{original_name}_processed.json"
        output_path = output_dir / output_filename
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=2, default=str)

        return {
            "message": f"已生成 JSON 闪卡并保存到: {output_path}",
            "output_path": str(output_path),
            "original_filename": file.filename,
            "processed_filename": output_filename,
            "deck_title": deck_title,
            "cards": cards
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        # Clean error message to avoid encoding issues
        error_msg = error_msg.encode('utf-8', errors='replace').decode('utf-8')
        raise HTTPException(
            status_code=500,
            detail=f"处理文件时出错: {error_msg}"
        )

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
