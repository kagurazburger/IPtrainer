"""
Flask Web Application for YouTube Shadowing Tool
"""
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import pysrt
import subprocess
import re
import time
import sys

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

def normalize_text(text):
    """Normalize text for comparison"""
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)

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
        
        return 0
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