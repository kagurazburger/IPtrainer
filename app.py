"""
Flask Web Application for YouTube Shadowing Tool
"""
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import pysrt
import subprocess
import tempfile
import threading
import whisper
import librosa
import numpy as np
from scipy.spatial.distance import cosine
from scipy.io.wavfile import write as write_wav, read as read_wav
from difflib import SequenceMatcher
import re
import sounddevice as sd
from get_video_and_srt import run_transcription, split_subtitles
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
import hashlib

# Fix encoding issues on Windows
if sys.platform == 'win32':
    try:
        # Try to set UTF-8 encoding for stdout
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
try:
    import eng_to_ipa as ipa
    IPA_AVAILABLE = True
except ImportError:
    IPA_AVAILABLE = False
    print("Warning: eng-to-ipa not installed. Phonetic feature will be limited.")

app = Flask(__name__)
CORS(app)

# Configuration
# Get the directory where this script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, "youtube_videos")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Store current video directory (can be changed by user)
current_video_dir = VIDEOS_DIR

SUPPORTED_MEDIA_EXTENSIONS = {
    '.m4a', '.mp3', '.wav', '.ogg', '.flac', '.aac',
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv'
}

print(f"BASE_DIR: {BASE_DIR}")
print(f"VIDEOS_DIR: {VIDEOS_DIR}")
print(f"VIDEOS_DIR exists: {os.path.exists(VIDEOS_DIR)}")

# Global state
whisper_model = None
current_video_state = {
    "video_path": None,
    "subtitle_path": None,
    "subtitles": [],
    "current_index": 0,
    "is_playing": False,
    "current_time": 0,
    "duration": 0,
    "playback_rate": 1.0
}

# --- Helper Functions (Moved to top level to avoid indentation errors) ---

def safe_log(msg):
    """Safe logger that handles encoding errors on Windows"""
    try:
        print(msg)
    except (UnicodeEncodeError, UnicodeDecodeError) as e:
        try:
            safe_msg = msg.encode('ascii', 'replace').decode('ascii')
            if not safe_msg.strip():
                safe_msg = msg.encode('utf-8', 'replace').decode('utf-8', 'replace')
                safe_msg = ''.join(c if ord(c) < 128 else '?' for c in safe_msg)
            print(safe_msg)
        except Exception:
            print("[Log message (encoding error)]")

def format_timestamp(seconds):
    """Format timestamp for SRT"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def get_cache_key(text, start_time, end_time):
    """Generate cache key for reference audio transcription"""
    key_str = f"{text}_{start_time}_{end_time}"
    return hashlib.md5(key_str.encode()).hexdigest()

def load_whisper_model():
    """Lazy load Whisper model"""
    global whisper_model
    if whisper_model is None:
        whisper_model = whisper.load_model("base", device='cuda')
    return whisper_model

def preprocess_audio_for_whisper(audio_path, target_sr=16000):
    """Preprocess audio for Whisper: resample to 16kHz and convert to mono"""
    try:
        audio_data, orig_sr = librosa.load(audio_path, sr=target_sr, mono=True)
        import tempfile
        temp_wav = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        temp_wav_path = temp_wav.name
        temp_wav.close()
        write_wav(temp_wav_path, target_sr, (audio_data * 32767).astype(np.int16))
        return temp_wav_path
    except Exception as e:
        print(f"Error preprocessing audio: {e}")
        return audio_path

def normalize_text(text):
    """Normalize text for comparison"""
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    return text.strip()

def extract_key_terms(text):
    """Extract key terms that might be misrecognized"""
    key_terms = []
    text_lower = text.lower()
    important_terms = [
        'personalized', 'personalized power', 'organizational', 'organizational context',
        'power', 'personal power', 'organizational power',
    ]
    if 'personalized' in text_lower or 'personal eyes' in text_lower:
        key_terms.append('personalized')
        key_terms.append('personalized power')
    if 'organizational' in text_lower:
        key_terms.append('organizational')
        key_terms.append('organizational context')
    if 'power' in text_lower:
        key_terms.append('power')
    phrases = ['personalized power', 'organizational power', 'personal power', 'organizational context']
    for phrase in phrases:
        if phrase in text_lower:
            key_terms.append(phrase)
    return list(dict.fromkeys(key_terms))[:5]

def simple_word_alignment(expected_text, recognized_text):
    """Ultra-fast word alignment"""
    expected_words = normalize_text(expected_text).split()
    recognized_words = normalize_text(recognized_text).split()
    expected_set = set(word.lower() for word in expected_words)
    recognized_set = set(word.lower() for word in recognized_words)
    correct = [word for word in expected_words if word.lower() in recognized_set]
    missing = [word for word in expected_words if word.lower() not in recognized_set]
    extra = [word for word in recognized_words if word.lower() not in expected_set]
    return {"correct": correct, "incorrect": [], "missing": missing, "extra": extra}

def word_alignment(expected_text, recognized_text):
    """Align words between expected and recognized text"""
    expected_words = normalize_text(expected_text).split()
    recognized_words = normalize_text(recognized_text).split()
    matcher = SequenceMatcher(None, expected_words, recognized_words)
    matches = matcher.get_matching_blocks()
    correct = []
    incorrect = []
    missing = []
    extra = []
    expected_idx = 0
    recognized_idx = 0
    for match in matches:
        while expected_idx < match.a:
            missing.append(expected_words[expected_idx])
            expected_idx += 1
        while recognized_idx < match.b:
            extra.append(recognized_words[recognized_idx])
            recognized_idx += 1
        for i in range(match.size):
            correct.append(expected_words[match.a + i])
            expected_idx += 1
            recognized_idx += 1
    while expected_idx < len(expected_words):
        missing.append(expected_words[expected_idx])
        expected_idx += 1
    while recognized_idx < len(recognized_words):
        extra.append(recognized_words[recognized_idx])
        recognized_idx += 1
    return {"correct": correct, "incorrect": incorrect, "missing": missing, "extra": extra}

def analyze_pronunciation_issues(expected_words, recognized_words, alignment):
    """Analyze specific pronunciation issues"""
    issues = []
    missing_words = alignment.get("missing", [])
    if missing_words:
        issues.append(f"遗漏的单词: {', '.join(missing_words)}。建议：确保完整说出每个单词。")
    extra_words = alignment.get("extra", [])
    if extra_words:
        issues.append(f"多余的单词: {', '.join(extra_words)}。建议：只说出原文中的单词，不要添加额外内容。")
    incorrect_words = []
    expected_set = set(word.lower() for word in expected_words)
    recognized_set = set(word.lower() for word in recognized_words)
    correct_set = set(alignment.get("correct", []))
    for word in recognized_set:
        if word not in correct_set and word not in expected_set:
            incorrect_words.append(word)
    if incorrect_words:
        issues.append(f"识别错误的单词: {', '.join(incorrect_words)}。建议：注意这些单词的发音，可能需要更清晰地发音。")
    if not issues and len(correct_set) < len(expected_set) * 0.7:
        issues.append("整体发音需要改进。建议：放慢语速，确保每个单词都清晰发音，注意重音和语调。")
    return issues

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/test_path', methods=['GET'])
def test_path():
    result = {
        "BASE_DIR": BASE_DIR,
        "VIDEOS_DIR": VIDEOS_DIR,
        "current_video_dir": current_video_dir,
        "VIDEOS_DIR_exists": os.path.exists(VIDEOS_DIR),
        "current_video_dir_exists": os.path.exists(current_video_dir),
    }
    if os.path.exists(VIDEOS_DIR):
        try:
            items = os.listdir(VIDEOS_DIR)
            result["items_in_videos_dir"] = items
            result["item_count"] = len(items)
        except Exception as e:
            result["error"] = str(e)
    return jsonify(result)

@app.route('/api/videos', methods=['GET'])
def get_videos():
    global current_video_dir
    videos_dir = current_video_dir
    if request.args.get('dir'):
        videos_dir = request.args.get('dir')
        if not os.path.isabs(videos_dir):
            videos_dir = os.path.join(BASE_DIR, videos_dir)
        current_video_dir = videos_dir
    
    videos = []
    if not os.path.exists(videos_dir):
        return jsonify({"error": f"Videos directory does not exist: {videos_dir}"}), 404
    
    try:
        items = os.listdir(videos_dir)
        audio_extensions = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4', '.webm', '.mkv', '.avi']
        video_extensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv']
        
        for item in items:
            item_path = os.path.join(videos_dir, item)
            if os.path.isdir(item_path):
                video_path = os.path.join(item_path, "video.mp4")
                subtitle_path = os.path.join(item_path, "subtitle.srt")
                if not os.path.exists(video_path):
                    for ext in audio_extensions:
                        audio_path = os.path.join(item_path, f"audio{ext}")
                        if os.path.exists(audio_path):
                            video_path = audio_path
                            break
                    if not os.path.exists(video_path):
                        try:
                            for file in os.listdir(item_path):
                                file_lower = file.lower()
                                if any(file_lower.endswith(ext) for ext in audio_extensions + video_extensions):
                                    video_path = os.path.join(item_path, file)
                                    break
                        except Exception:
                            pass
                if os.path.exists(video_path):
                    videos.append({
                        "title": item,
                        "video_path": video_path,
                        "subtitle_path": subtitle_path if os.path.exists(subtitle_path) else None
                    })
            else:
                item_lower = item.lower()
                if any(item_lower.endswith(ext) for ext in audio_extensions + video_extensions):
                    base_name = os.path.splitext(item)[0]
                    subtitle_path = os.path.join(videos_dir, f"{base_name}.srt")
                    videos.append({
                        "title": base_name,
                        "video_path": item_path,
                        "subtitle_path": subtitle_path if os.path.exists(subtitle_path) else None
                    })
    except Exception as e:
        import traceback
        print(f"ERROR reading videos directory: {e}")
        return jsonify({"error": str(e)}), 500
    
    return jsonify(videos)

@app.route('/api/set_video_dir', methods=['POST'])
def set_video_dir():
    global current_video_dir
    data = request.json or {}
    input_path = (data.get('dir') or '').strip()

    if not input_path:
        return jsonify({"error": "Path is required"}), 400

    if not os.path.isabs(input_path):
        input_path = os.path.join(BASE_DIR, input_path)

    if not os.path.exists(input_path):
        return jsonify({"error": f"Path does not exist: {input_path}"}), 400

    if os.path.isdir(input_path):
        current_video_dir = input_path
        return jsonify({"status": "success", "dir": current_video_dir, "type": "directory"})

    if os.path.isfile(input_path):
        ext = os.path.splitext(input_path)[1].lower()
        if ext not in SUPPORTED_MEDIA_EXTENSIONS:
            return jsonify({"error": f"Unsupported media file: {input_path}"}), 400

        current_video_dir = os.path.dirname(input_path)
        video_title = os.path.splitext(os.path.basename(input_path))[0]
        return jsonify({
            "status": "success",
            "dir": current_video_dir,
            "type": "file",
            "video_title": video_title
        })

    return jsonify({"error": f"Invalid path: {input_path}"}), 400

@app.route('/api/upload_video', methods=['POST'])
def upload_video_file():
    global current_video_dir

    if 'video_file' not in request.files:
        return jsonify({"error": "Missing file field: video_file"}), 400

    uploaded_file = request.files['video_file']
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(uploaded_file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_MEDIA_EXTENSIONS:
        return jsonify({"error": f"Unsupported media extension: {ext}"}), 400

    base_name = os.path.splitext(filename)[0]
    unique_name = f"{base_name}_{int(time.time())}{ext}"
    save_path = os.path.join(UPLOAD_DIR, unique_name)
    uploaded_file.save(save_path)

    current_video_dir = UPLOAD_DIR
    video_title = os.path.splitext(unique_name)[0]

    return jsonify({
        "status": "success",
        "dir": current_video_dir,
        "video_title": video_title,
        "saved_file": unique_name
    })

@app.route('/api/video/<path:video_name>', methods=['GET'])
def load_video(video_name):
    global current_video_dir
    from urllib.parse import unquote
    video_name = unquote(video_name)
    if not os.path.isabs(current_video_dir):
        current_video_dir = os.path.join(BASE_DIR, current_video_dir)
    
    audio_extensions = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.aac']
    video_extensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv']
    
    direct_file_path = os.path.join(current_video_dir, video_name)
    if os.path.exists(direct_file_path) and os.path.isfile(direct_file_path):
        video_path = direct_file_path
        base_name = os.path.splitext(video_name)[0]
        subtitle_path = os.path.join(current_video_dir, f"{base_name}.srt")
        actual_filename = os.path.basename(video_name)
    else:
        found_file = None
        for ext in audio_extensions + video_extensions:
            test_path = os.path.join(current_video_dir, f"{video_name}{ext}")
            if os.path.exists(test_path) and os.path.isfile(test_path):
                found_file = test_path
                break
        if found_file:
            video_path = found_file
            subtitle_path = os.path.join(current_video_dir, f"{video_name}.srt")
            actual_filename = os.path.basename(found_file)
        else:
            video_folder = os.path.join(current_video_dir, video_name)
            if not os.path.exists(video_folder) or not os.path.isdir(video_folder):
                return jsonify({"error": f"Video folder not found: {video_folder}"}), 404
            
            video_path = os.path.join(video_folder, "video.mp4")
            if not os.path.exists(video_path):
                for ext in audio_extensions:
                    audio_path = os.path.join(video_folder, f"audio{ext}")
                    if os.path.exists(audio_path):
                        video_path = audio_path
                        break
                if not os.path.exists(video_path):
                    for file in os.listdir(video_folder):
                        file_lower = file.lower()
                        if any(file_lower.endswith(ext) for ext in audio_extensions + video_extensions):
                            video_path = os.path.join(video_folder, file)
                            break
            subtitle_path = os.path.join(video_folder, "subtitle.srt")
            actual_filename = os.path.basename(video_path)
    
    if not os.path.exists(video_path):
        return jsonify({"error": f"Video/Audio not found: {video_path}"}), 404
    
    subtitles = []
    if os.path.exists(subtitle_path):
        try:
            srt_file = pysrt.open(subtitle_path)
            for sub in srt_file:
                subtitles.append({
                    "index": sub.index,
                    "start": sub.start.ordinal / 1000.0,
                    "end": sub.end.ordinal / 1000.0,
                    "text": sub.text
                })
        except Exception as e:
            print(f"Error loading subtitles: {e}")
    
    current_video_state["video_path"] = video_path
    current_video_state["subtitle_path"] = subtitle_path
    current_video_state["subtitles"] = subtitles
    current_video_state["current_index"] = 0
    duration = get_video_duration(video_path)
    
    if os.path.dirname(video_path) == current_video_dir:
        video_url_path = f"/api/video_file_root/{actual_filename}"
    else:
        video_url_path = f"/api/video_file/{video_name}/{actual_filename}"
    
    return jsonify({
        "video_path": video_url_path,
        "subtitles": subtitles,
        "duration": duration,
        "video_name": video_name
    })

def get_video_duration(video_path):
    """Get video/audio duration using ffmpeg"""
    try:
        if not os.path.exists(video_path): return 0
        ffmpeg_path = "ffmpeg"
        if getattr(sys, "frozen", False):
            base_path = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
            tools_ffmpeg = os.path.join(base_path, "tools", "ffmpeg.exe")
            if os.path.exists(tools_ffmpeg): ffmpeg_path = tools_ffmpeg
        
        cmd = [ffmpeg_path, "-i", video_path, "-hide_banner"]
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=30
        )
        
        for line in result.stderr.split('\n'):
            if 'Duration:' in line:
                duration_str = line.split('Duration:')[1].split(',')[0].strip()
                parts = duration_str.split(':')
                if len(parts) == 3:
                    total_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
                    if total_seconds > 0: return total_seconds
        
        import librosa
        audio_data, sr = librosa.load(video_path, sr=None)
        return len(audio_data) / sr if sr > 0 else 0
    except Exception:
        return 0

@app.route('/api/video_file/<path:video_name>/<filename>')
def serve_video_file(video_name, filename):
    global current_video_dir
    from urllib.parse import unquote
    video_name = unquote(video_name)
    filename = unquote(filename)
    if not os.path.isabs(current_video_dir):
        current_video_dir = os.path.join(BASE_DIR, current_video_dir)
    video_folder = os.path.join(current_video_dir, video_name)
    return send_from_directory(video_folder, filename, mimetype=get_mime_type(filename), conditional=True)

@app.route('/api/video_file_root/<filename>')
def serve_video_file_root(filename):
    global current_video_dir
    from urllib.parse import unquote
    filename = unquote(filename)
    if not os.path.isabs(current_video_dir):
        current_video_dir = os.path.join(BASE_DIR, current_video_dir)
    return send_from_directory(current_video_dir, filename, mimetype=get_mime_type(filename), conditional=True)

def get_mime_type(filename):
    filename_lower = filename.lower()
    if filename_lower.endswith('.mp4'): return 'video/mp4'
    elif filename_lower.endswith(('.m4a', '.aac')): return 'audio/mp4'
    elif filename_lower.endswith('.mp3'): return 'audio/mpeg'
    elif filename_lower.endswith('.wav'): return 'audio/wav'
    elif filename_lower.endswith('.ogg'): return 'audio/ogg'
    elif filename_lower.endswith('.webm'): return 'video/webm'
    elif filename_lower.endswith('.mkv'): return 'video/x-matroska'
    elif filename_lower.endswith('.mov'): return 'video/quicktime'
    elif filename_lower.endswith('.flv'): return 'video/x-flv'
    elif filename_lower.endswith('.avi'): return 'video/x-msvideo'
    else: return 'application/octet-stream'

@app.route('/api/download', methods=['POST'])
def download_video():
    """Download YouTube video and generate subtitles"""
    data = request.json
    url = data.get('url')
    model = data.get('model', 'medium')
    max_words = int(data.get('max_words', 15))
    language = data.get('language')
    
    if not url: return jsonify({"error": "URL required"}), 400
    
    # We define a task function that captures the request params
    def download_task_wrapper(url_val, model_val, max_words_val, lang_val):
        try:
            try:
                run_transcription(url_val, model_val, VIDEOS_DIR, safe_log, max_words_val, language=lang_val)
            except TypeError:
                safe_log("Warning: run_transcription does not accept language parameter. Running without it.")
                run_transcription(url_val, model_val, VIDEOS_DIR, safe_log, max_words_val)
        except Exception as e:
            safe_log(f"Download error: {e}")
            import traceback
            safe_log(traceback.format_exc())

    thread = threading.Thread(target=download_task_wrapper, args=(url, model, max_words, language))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "message": "Download started"})

def generate_subtitle_for_audio(audio_path, model_size='base', max_words=15, log_callback=print, language=None):
    """Generate subtitles logic"""
    def log(msg):
        if log_callback: log_callback(msg)
    
    try:
        audio_dir = os.path.dirname(audio_path)
        base_name = os.path.splitext(os.path.basename(audio_path))[0]
        
        if not os.path.exists(audio_path): raise ValueError(f"File not found: {audio_path}")
        
        log(f"📁 Audio file: {os.path.basename(audio_path)}")
        
        # Duration
        duration = get_video_duration(audio_path)
        if duration <= 0:
            try:
                import librosa
                audio_data, sr = librosa.load(audio_path, sr=None)
                duration = len(audio_data) / sr
            except Exception: pass
        
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device != "cuda":
            log("⚠️ CUDA not available. Falling back to CPU for Whisper model loading.")
        log(f"🧠 Loading Whisper model ({model_size}) on {device}...")
        model = whisper.load_model(model_size, device=device)
        
        log(f"📄 Transcribing audio (Language: {language if language else 'Auto'})...")
        result = model.transcribe(
            audio_path,
            word_timestamps=True,
            language=language,
            temperature=0.0,
            condition_on_previous_text=True
        )
        
        word_dict = {}
        for segment in result["segments"]:
            if "words" in segment and segment["words"]:
                for word in segment["words"]:
                    key = (round(word["start"], 3), round(word["end"], 3))
                    if key not in word_dict: word_dict[key] = word["word"].strip()
            else:
                # Fallback if no word timestamps
                seg_text = segment.get("text", "").strip()
                if seg_text:
                    start = segment.get("start", 0)
                    end = segment.get("end", start + 1)
                    words = seg_text.split()
                    if words:
                        dur = (end - start) / len(words)
                        for i, w in enumerate(words):
                            word_dict[(round(start + i*dur, 3), round(start + (i+1)*dur, 3))] = w
        
        subtitles = split_subtitles(word_dict, max_words)
        if not subtitles:
            for s in result["segments"]:
                subtitles.append({"start": s["start"], "end": s["end"], "text": s["text"]})
        
        srt_path = os.path.join(audio_dir, f"{base_name}.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            for idx, sub in enumerate(subtitles, 1):
                f.write(f"{idx}\n{format_timestamp(sub['start'])} --> {format_timestamp(sub['end'])}\n{sub['text']}\n\n")
        
        log(f"✅ Subtitles saved to: {srt_path}")
        return srt_path
        
    except Exception as e:
        log(f"❌ Error: {e}")
        import traceback
        log(traceback.format_exc())
        raise

@app.route('/api/generate_subtitle', methods=['POST'])
def generate_subtitle():
    """Generate subtitles endpoint"""
    global current_video_dir
    data = request.json
    audio_path = data.get('audio_path')
    model = data.get('model', 'base')
    max_words = int(data.get('max_words', 15))
    language = data.get('language')
    
    if not audio_path: return jsonify({"error": "audio_path required"}), 400
    
    if not os.path.isabs(current_video_dir):
        current_video_dir = os.path.join(BASE_DIR, current_video_dir)
    
    # Path resolution logic
    if not os.path.isabs(audio_path):
        direct_path = os.path.join(current_video_dir, audio_path)
        if os.path.exists(direct_path) and os.path.isfile(direct_path):
            audio_path = direct_path
        else:
            folder_path = os.path.join(current_video_dir, audio_path)
            if os.path.isdir(folder_path):
                found = False
                for ext in ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4']:
                    if os.path.exists(os.path.join(folder_path, f"video{ext}")):
                        audio_path = os.path.join(folder_path, f"video{ext}")
                        found = True
                        break
                    if os.path.exists(os.path.join(folder_path, f"audio{ext}")):
                        audio_path = os.path.join(folder_path, f"audio{ext}")
                        found = True
                        break
                if not found:
                    for f in os.listdir(folder_path):
                        if any(f.lower().endswith(e) for e in ['.mp4','.mp3','.wav']):
                            audio_path = os.path.join(folder_path, f)
                            break
            else:
                audio_path = os.path.join(BASE_DIR, audio_path)
    
    if not os.path.exists(audio_path):
        return jsonify({"error": f"Audio file not found: {audio_path}"}), 404
    
    def generate_task_wrapper(path, mod, mw, lang):
        try:
            generate_subtitle_for_audio(path, mod, mw, safe_log, language=lang)
        except Exception as e:
            safe_log(f"Generate error: {e}")

    thread = threading.Thread(target=generate_task_wrapper, args=(audio_path, model, max_words, language))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "message": "Subtitle generation started"})

@app.route('/api/subtitles', methods=['GET'])
def get_subtitles():
    return jsonify({
        "subtitles": current_video_state["subtitles"],
        "current_index": current_video_state["current_index"]
    })

@app.route('/api/subtitle/<int:index>', methods=['GET'])
def get_subtitle(index):
    subtitles = current_video_state["subtitles"]
    if 0 <= index < len(subtitles): return jsonify(subtitles[index])
    return jsonify({"error": "Subtitle not found"}), 404

@app.route('/api/current_subtitle', methods=['GET'])
def get_current_subtitle():
    current_time = float(request.args.get('time', 0))
    subtitles = current_video_state["subtitles"]
    for i, sub in enumerate(subtitles):
        if sub["start"] <= current_time <= sub["end"]:
            current_video_state["current_index"] = i
            return jsonify({"subtitle": sub, "index": i})
    return jsonify({"subtitle": None, "index": -1})

@app.route('/api/record', methods=['POST'])
def record_audio():
    return jsonify({"status": "ok"})

@app.route('/api/compare_pronunciation', methods=['POST'])
def compare_pronunciation():
    if 'audio' not in request.files: return jsonify({"error": "No audio file"}), 400
    audio_file = request.files['audio']
    subtitle_index = int(request.form.get('subtitle_index', 0))
    target_language = request.form.get('language')
    
    subtitles = current_video_state["subtitles"]
    if subtitle_index < 0 or subtitle_index >= len(subtitles):
        return jsonify({"error": "Invalid subtitle index"}), 400
    
    expected_text = subtitles[subtitle_index]["text"]
    video_path = current_video_state["video_path"]
    subtitle = subtitles[subtitle_index]
    
    user_audio_path = os.path.join(UPLOAD_DIR, f"user_{int(time.time())}.wav")
    audio_file.save(user_audio_path)
    
    ref_audio_path = extract_audio_segment(video_path, subtitle["start"], subtitle["end"])
    if not ref_audio_path: return jsonify({"error": "Failed to extract reference audio"}), 500
    
    try:
        result = compare_audio_files(ref_audio_path, user_audio_path, expected_text, fast_mode=True, language=target_language)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(user_audio_path): os.remove(user_audio_path)
        if os.path.exists(ref_audio_path): os.remove(ref_audio_path)

def extract_audio_segment(video_path, start_time, end_time):
    output_path = os.path.join(UPLOAD_DIR, f"ref_{int(time.time())}.wav")
    try:
        cmd = [
            "ffmpeg", "-i", video_path, "-ss", str(start_time), "-t", str(end_time - start_time),
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y", output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path
    except Exception as e:
        print(f"Error extracting audio: {e}")
        return None

def compare_audio_files(ref_path, user_path, expected_text, fast_mode=True, language=None):
    model = load_whisper_model()
    expected_text_clean = expected_text[:200] if len(expected_text) > 200 else expected_text
    key_terms = extract_key_terms(expected_text)
    initial_prompt = f"Key terms: {', '.join(key_terms)}. {expected_text_clean}" if key_terms else expected_text_clean
    
    try:
        # Preprocess User Audio
        processed_path = preprocess_audio_for_whisper(user_path)
        
        # Transcribe
        transcribe_options = {
            "language": language,
            "initial_prompt": initial_prompt,
            "temperature": 0.0,
            "word_timestamps": False,
            "condition_on_previous_text": False,
            "fp16": False,
        }
        
        user_result = model.transcribe(processed_path, **transcribe_options)
        
        # Cleanup temp file
        if processed_path != user_path and os.path.exists(processed_path):
            try: os.remove(processed_path)
            except: pass
            
        user_text = user_result["text"].strip()
        
        # Alignment
        if fast_mode:
            alignment = simple_word_alignment(expected_text, user_text)
        else:
            alignment = word_alignment(expected_text, user_text)
            
        total_words = len(normalize_text(expected_text).split())
        correct_words = len(alignment["correct"])
        word_accuracy = (correct_words / total_words * 100) if total_words > 0 else 0
        
        return {
            "score": word_accuracy,
            "word_accuracy": word_accuracy,
            "expected_text": expected_text,
            "recognized_text": user_text,
            "alignment": alignment,
            "issues": [],
            "highlighted_text": generate_highlighted_text(expected_text, alignment)
        }
    except Exception as e:
        print(f"Comparison error: {e}")
        return {"score": 0, "error": str(e)}

def generate_highlighted_text(text, alignment):
    words = normalize_text(text).split()
    correct_words = set(alignment["correct"])
    missing_words = set(alignment["missing"])
    highlighted = []
    for word in words:
        if word in correct_words:
            highlighted.append(f'<span style="color: #4CAF50;">{word}</span>')
        elif word in missing_words:
            highlighted.append(f'<span style="color: #F44336; text-decoration: line-through;">{word}</span>')
        else:
            highlighted.append(f'<span style="color: #FF9800;">{word}</span>')
    return " ".join(highlighted)

@app.route('/api/get_phonetics', methods=['POST'])
def get_phonetics():
    data = request.json
    text = data.get('text', '')
    if not text: return jsonify({"error": "Text required"}), 400
    try:
        if IPA_AVAILABLE:
            phonetic_text = ipa.convert(text)
            return jsonify({"phonetic_text": phonetic_text, "original_text": text})
        return jsonify({"phonetic_text": text, "error": "IPA library not available"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

handler = app

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)