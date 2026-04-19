import os
import sys
import shutil
import vlc
import pysrt
from PyQt5.QtCore import Qt, QTimer, QProcess, QSettings, pyqtSlot, QMetaObject, Q_ARG
from PyQt5.QtWidgets import (
    QApplication,
    QWidget,
    QPushButton,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QSlider,
    QStyle,
    QFrame,
    QSplitter,
    QListWidgetItem,
    QTextEdit,
    QLineEdit,
    QSizePolicy,
    QMessageBox,
    QComboBox,
    QCheckBox,
    QGridLayout,
    QProgressBar,
    QDialog,
    QDialogButtonBox,
)
from PyQt5.QtGui import QFont, QIcon, QPalette, QColor, QTextCursor
import threading
from get_video_and_srt import run_transcription
import sounddevice as sd
from scipy.io.wavfile import write, read as read_wav
import numpy as np
import tempfile
import subprocess
import librosa
from scipy.spatial.distance import cosine
import whisper
import re
from difflib import SequenceMatcher


class ClickableSlider(QSlider):
    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            x = event.pos().x()
            ratio = x / self.width()
            new_val = self.minimum() + ratio * (self.maximum() - self.minimum())
            self.setValue(int(new_val))
            self.sliderMoved.emit(int(new_val))
            self.sliderReleased.emit()
        super().mousePressEvent(event)


class AudioSettingsDialog(QDialog):
    """Audio settings dialog for microphone and speaker selection"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.parent_app = parent
        self.setWindowTitle("音频设置")
        self.setMinimumWidth(500)
        self.setMinimumHeight(300)
        
        # Apply dark theme
        self.apply_theme()
        
        layout = QVBoxLayout()
        layout.setSpacing(20)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Microphone section
        mic_group = self.create_audio_group("麦克风", is_input=True)
        layout.addLayout(mic_group)
        
        # Speaker section
        speaker_group = self.create_audio_group("扬声器", is_input=False)
        layout.addLayout(speaker_group)
        
        # Buttons
        button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        button_box.button(QDialogButtonBox.Ok).setText("确认")
        button_box.button(QDialogButtonBox.Cancel).setText("取消")
        button_box.button(QDialogButtonBox.Ok).setStyleSheet("font-size: 14px; font-weight: bold; padding: 8px 20px;")
        button_box.button(QDialogButtonBox.Cancel).setStyleSheet("font-size: 14px; padding: 8px 20px;")
        layout.addWidget(button_box)
        
        self.setLayout(layout)
        
        # Load current settings
        self.load_settings()
    
    def apply_theme(self):
        """Apply dark theme to dialog"""
        self.setStyleSheet("""
            QDialog {
                background-color: #2b2b2b;
                color: white;
            }
            QLabel {
                color: white;
                font-size: 14px;
            }
            QComboBox {
                background-color: #3d3d3d;
                color: white;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 6px;
                font-size: 13px;
            }
            QComboBox:hover {
                border: 1px solid #777;
            }
            QComboBox::drop-down {
                border: none;
                width: 20px;
            }
            QComboBox QAbstractItemView {
                background-color: #3d3d3d;
                color: white;
                selection-background-color: #4682B4;
                border: 1px solid #555;
            }
            QSlider::groove:horizontal {
                background: #555;
                height: 8px;
                border-radius: 4px;
            }
            QSlider::handle:horizontal {
                background: white;
                width: 18px;
                height: 18px;
                border-radius: 9px;
                margin: -5px 0;
            }
            QSlider::sub-page:horizontal {
                background: #4682B4;
                border-radius: 4px;
            }
        """)
    
    def create_audio_group(self, label_text, is_input=True):
        """Create audio device selection and volume control group"""
        group_layout = QVBoxLayout()
        group_layout.setSpacing(10)
        
        # Title
        title_layout = QHBoxLayout()
        title_label = QLabel(label_text)
        title_label.setStyleSheet("font-size: 16px; font-weight: bold;")
        title_layout.addWidget(title_label)
        title_layout.addStretch()
        group_layout.addLayout(title_layout)
        
        # Device selection
        device_layout = QHBoxLayout()
        device_label = QLabel("设备:")
        device_label.setFixedWidth(60)
        device_label.setStyleSheet("font-size: 13px;")
        device_layout.addWidget(device_label)
        
        device_combo = QComboBox()
        device_combo.setMinimumHeight(35)
        device_combo.setStyleSheet("font-size: 13px;")
        
        # Populate devices
        try:
            devices = sd.query_devices()
            if is_input:
                # Input devices
                for i, device in enumerate(devices):
                    if device['max_input_channels'] > 0:
                        device_combo.addItem(device['name'], i)
            else:
                # Output devices
                for i, device in enumerate(devices):
                    if device['max_output_channels'] > 0:
                        device_combo.addItem(device['name'], i)
        except Exception as e:
            device_combo.addItem(f"Error: {str(e)}")
        
        device_layout.addWidget(device_combo)
        device_layout.addStretch()
        group_layout.addLayout(device_layout)
        
        # Volume control
        volume_layout = QHBoxLayout()
        volume_icon = QLabel("🔊")
        volume_icon.setFixedWidth(30)
        volume_icon.setStyleSheet("font-size: 18px;")
        volume_layout.addWidget(volume_icon)
        
        volume_slider = QSlider(Qt.Horizontal)
        volume_slider.setMinimum(0)
        volume_slider.setMaximum(100)
        volume_slider.setValue(100)
        volume_slider.setStyleSheet("""
            QSlider::groove:horizontal {
                background: #555;
                height: 8px;
                border-radius: 4px;
            }
            QSlider::handle:horizontal {
                background: white;
                width: 18px;
                height: 18px;
                border-radius: 9px;
                margin: -5px 0;
            }
            QSlider::sub-page:horizontal {
                background: #4682B4;
                border-radius: 4px;
            }
        """)
        
        volume_label = QLabel("100%")
        volume_label.setFixedWidth(50)
        volume_label.setStyleSheet("font-size: 13px;")
        volume_label.setAlignment(Qt.AlignCenter)
        
        volume_slider.valueChanged.connect(lambda v: volume_label.setText(f"{v}%"))
        
        volume_layout.addWidget(volume_slider)
        volume_layout.addWidget(volume_label)
        group_layout.addLayout(volume_layout)
        
        # Store references
        if is_input:
            self.mic_device_combo = device_combo
            self.mic_volume_slider = volume_slider
            self.mic_volume_label = volume_label
        else:
            self.speaker_device_combo = device_combo
            self.speaker_volume_slider = volume_slider
            self.speaker_volume_label = volume_label
        
        return group_layout
    
    def load_settings(self):
        """Load current audio settings"""
        settings = QSettings("ShadowingApp", "AudioSettings")
        
        # Load microphone device
        mic_device_name = settings.value("mic_device", "")
        if mic_device_name and hasattr(self, 'mic_device_combo'):
            for i in range(self.mic_device_combo.count()):
                if self.mic_device_combo.itemText(i) == mic_device_name:
                    self.mic_device_combo.setCurrentIndex(i)
                    break
        
        # Load microphone volume
        mic_volume = settings.value("mic_volume", 100, type=int)
        if hasattr(self, 'mic_volume_slider'):
            self.mic_volume_slider.setValue(mic_volume)
        
        # Load speaker device
        speaker_device_name = settings.value("speaker_device", "")
        if speaker_device_name and hasattr(self, 'speaker_device_combo'):
            for i in range(self.speaker_device_combo.count()):
                if self.speaker_device_combo.itemText(i) == speaker_device_name:
                    self.speaker_device_combo.setCurrentIndex(i)
                    break
        
        # Load speaker volume
        speaker_volume = settings.value("speaker_volume", 100, type=int)
        if hasattr(self, 'speaker_volume_slider'):
            self.speaker_volume_slider.setValue(speaker_volume)
    
    def save_settings(self):
        """Save audio settings"""
        settings = QSettings("ShadowingApp", "AudioSettings")
        
        # Save microphone device
        if hasattr(self, 'mic_device_combo'):
            mic_device_name = self.mic_device_combo.currentText()
            mic_device_index = self.mic_device_combo.currentData()
            settings.setValue("mic_device", mic_device_name)
            settings.setValue("mic_device_index", mic_device_index)
        
        # Save microphone volume
        if hasattr(self, 'mic_volume_slider'):
            settings.setValue("mic_volume", self.mic_volume_slider.value())
        
        # Save speaker device
        if hasattr(self, 'speaker_device_combo'):
            speaker_device_name = self.speaker_device_combo.currentText()
            speaker_device_index = self.speaker_device_combo.currentData()
            settings.setValue("speaker_device", speaker_device_name)
            settings.setValue("speaker_device_index", speaker_device_index)
        
        # Save speaker volume
        if hasattr(self, 'speaker_volume_slider'):
            settings.setValue("speaker_volume", self.speaker_volume_slider.value())
    
    def accept(self):
        """Handle OK button click"""
        self.save_settings()
        
        # Update parent app's microphone device
        if self.parent_app and hasattr(self, 'mic_device_combo'):
            mic_device_index = self.mic_device_combo.currentData()
            if mic_device_index is not None:
                self.parent_app.mic_device_index = mic_device_index
                # Update device selector if exists
                if hasattr(self.parent_app, 'mic_device_selector'):
                    for i in range(self.parent_app.mic_device_selector.count()):
                        if self.parent_app.mic_device_selector.itemData(i) == mic_device_index:
                            self.parent_app.mic_device_selector.setCurrentIndex(i)
                            break
                # Restart monitoring
                self.parent_app.stop_mic_monitoring()
                QTimer.singleShot(100, self.parent_app.start_mic_monitoring)
        
        super().accept()


class ShadowingApp(QWidget):
    def eventFilter(self, obj, event):
        if event.type() == event.KeyPress:
            if event.key() == Qt.Key_Space:
                self.toggle_play_pause()
                return True
            elif event.key() == Qt.Key_Left:
                self.seek_relative(-5000)
                return True
            elif event.key() == Qt.Key_Right:
                self.seek_relative(5000)
                return True
            elif event.key() == Qt.Key_A:
                self.prev_subtitle()
                return True
            elif event.key() == Qt.Key_S:
                self.repeat_subtitle()
                return True
            elif event.key() == Qt.Key_D:
                self.next_subtitle()
                return True
            elif event.key() == Qt.Key_L:
                self.loop_toggle.setChecked(not self.loop_toggle.isChecked())
                self.toggle_loop()
                return True
            elif event.key() == Qt.Key_R:
                self.record_toggle.setChecked(not self.record_toggle.isChecked())
                self.toggle_record()
                return True
            elif event.key() == Qt.Key_H:
                self.shadow_toggle.setChecked(not self.shadow_toggle.isChecked())
                self.toggle_shadow()
                return True
            elif event.key() == Qt.Key_P:
                self.auto_play_toggle.setChecked(not self.auto_play_toggle.isChecked())
                self.toggle_auto_play()
                return True
            elif event.key() == Qt.Key_Q:
                # Decrease speed by one step (10%)
                current = self.speed_slider.value()
                if current > self.speed_slider.minimum():
                    self.speed_slider.setValue(current - 1)
                return True
            elif event.key() == Qt.Key_E:
                # Increase speed by one step (10%)
                current = self.speed_slider.value()
                if current < self.speed_slider.maximum():
                    self.speed_slider.setValue(current + 1)
                return True

        return super().eventFilter(obj, event)

    def __init__(self):
        super().__init__()
        self.setWindowTitle("English Shadowing Tool with YouTube Videos")

        # Detect correct base path for both PyInstaller and dev mode
        if getattr(sys, "frozen", False):
            base_path = sys._MEIPASS  # PyInstaller temp folder (onefile)
        else:
            base_path = os.path.dirname(__file__)

        # Try both possible icon locations (tools/ for dev, dist/ for onedir)
        icon_path = os.path.join(base_path, "tools", "icon.ico")
        if not os.path.exists(icon_path):
            # Fallback: icon.ico next to the exe (onedir build)
            icon_path = os.path.join(os.path.dirname(sys.executable), "icon.ico")

        self.setWindowIcon(QIcon(icon_path))

        self.settings = QSettings("ShadowingApp", "WindowState")
        geometry = self.settings.value("geometry")
        if geometry:
            self.restoreGeometry(geometry)
        else:
            self.setGeometry(200, 200, 1200, 700)

        self.manual_jump = False

        self.instance = vlc.Instance()
        self.player = self.instance.media_player_new()

        self.subtitle_index = 0
        self.subtitles = []
        self.project_folder = ""
        self.is_playing = False
        self.total_duration = 0
        self.target_jump_ms = None

        # Set to track recorded subtitles by index.
        self.recorded_subtitles = set()

        self.poll_timer = QTimer(self)
        self.poll_timer.setInterval(300)
        self.poll_timer.timeout.connect(self.sync_with_video)

        # --- Study timer state ---
        self.study_timer = QTimer(self)
        self.study_timer.setInterval(1000)  # 1 second tick
        self.study_timer.timeout.connect(self.update_study_time)

        self.study_elapsed_seconds = 0
        self.study_timer_running = False

        self.status_output = QTextEdit()
        self.status_output.setReadOnly(True)
        self.status_output.append(
            "👋 Welcome to English Shadowing Tool with YouTube Videos!"
        )
        self.status_output.textChanged.connect(self._auto_scroll_status_output)

        self.process = QProcess(self)
        self.process.setProgram(sys.executable)
        self.process.readyReadStandardOutput.connect(self.update_status_output)
        self.process.readyReadStandardError.connect(self.update_status_output)
        self.process.finished.connect(self.on_process_finished)

        self.project_list = QListWidget()
        self.video_frame = QFrame()
        self.video_frame.setStyleSheet("background-color: black;")
        self.video_frame.setMinimumHeight(400)

        # Theme: apply dark mode
        self.apply_theme()

        self.auto_play_toggle = QPushButton("🎵 Auto Play ON")
        self.auto_play_toggle.setMinimumSize(200, 60)
        self.auto_play_toggle.setStyleSheet(
            "font-size: 20px; font-weight: bold; padding: 12px 15px; background-color: #4682B4; color: white; border-radius: 6px;"
        )
        self.auto_play_toggle.setCheckable(True)
        self.auto_play_toggle.setChecked(True)  # Default enabled
        self.auto_play_toggle.clicked.connect(self.toggle_auto_play)

        self.loop_toggle = QPushButton("🔁 Loop OFF")
        self.loop_toggle.setMinimumSize(200, 60)
        self.loop_toggle.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        self.loop_toggle.setCheckable(True)
        self.loop_toggle.clicked.connect(self.toggle_loop)

        self.subtitle_display = QLabel("--")
        self.subtitle_display.setWordWrap(True)
        self.subtitle_display.setFixedHeight(50)
        self.subtitle_display.setFont(QFont("Arial", 16))
        self.subtitle_display.setAlignment(Qt.AlignCenter)
        # Let the subtitle display expand horizontally.
        self.subtitle_display.setSizePolicy(
            QSizePolicy.Expanding, QSizePolicy.Preferred
        )
        # Enable rich text for highlighting
        self.subtitle_display.setTextFormat(Qt.RichText)
        
        # Assessment result display
        self.assessment_display = QTextEdit()
        self.assessment_display.setReadOnly(True)
        self.assessment_display.setMinimumHeight(200)
        self.assessment_display.setFont(QFont("Arial", 12))

        # Status indicator for recording/playback.
        self.record_status_label = QLabel("")
        self.record_status_label.setMinimumWidth(200)
        self.record_status_label.setFont(QFont("Arial", 16))
        self.record_status_label.setStyleSheet("padding-left: 10px; font-weight: bold; font-size: 16px;")

        self.subtitle_list = QListWidget()
        self.subtitle_list.setWordWrap(True)
        self.subtitle_list.itemClicked.connect(self.jump_to_selected_subtitle)

        self.play_pause_btn = QPushButton(
            self.style().standardIcon(QStyle.SP_MediaPlay), ""
        )
        self.skip_back_btn = QPushButton("⏪ 5s")
        self.skip_forward_btn = QPushButton("⏩ 5s")
        self.prev_sub_btn = QPushButton("⏮️ Subtitle")
        self.repeat_sub_btn = QPushButton("🔁 Subtitle")
        self.next_sub_btn = QPushButton("⏭️ Subtitle")
        for btn in [
            self.skip_back_btn,
            self.play_pause_btn,
            self.skip_forward_btn,
            self.prev_sub_btn,
            self.repeat_sub_btn,
            self.next_sub_btn,
        ]:
            btn.setMinimumSize(450, 65)
            btn.setStyleSheet("font-size: 20px; font-weight: bold; padding: 15px; border-radius: 6px;")

        self.slider = ClickableSlider(Qt.Horizontal)
        self.slider.setTracking(True)
        self.slider.sliderMoved.connect(self.slider_moved)
        self.slider.sliderPressed.connect(self.slider_pressed)
        self.slider.sliderReleased.connect(self.slider_released)
        self.slider_label = QLabel("00:00 / 00:00")
        self.slider_label.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        self.slider_label.setFont(QFont("Arial", 16))
        self.slider_label.setStyleSheet("font-weight: bold; padding: 8px; font-size: 16px;")

        self.speed_slider = QSlider(Qt.Horizontal)
        self.speed_slider.setMinimum(5)
        self.speed_slider.setMaximum(15)
        self.speed_slider.setValue(10)
        self.speed_slider.setTickInterval(1)
        self.speed_slider.setTickPosition(QSlider.TicksBelow)
        self.speed_slider.valueChanged.connect(self.change_speed)
        self.speed_slider.setFixedHeight(30)
        self.speed_label = QLabel("Speed: 100%")
        self.speed_label.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        self.speed_label.setFont(QFont("Arial", 16))
        self.speed_label.setStyleSheet("font-weight: bold; padding: 8px; font-size: 16px;")

        self.slider_was_pressed = False
        self.loop_current = False
        self.auto_play_enabled = True
        self.auto_play_paused_for_subtitle = False  # Reset pause flag for new project

        self.record_toggle = QPushButton("🎙️ Record OFF")
        self.record_toggle.setMinimumSize(200, 60)
        self.record_toggle.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        self.record_toggle.setCheckable(True)
        self.record_toggle.clicked.connect(self.toggle_record)

        self.shadow_toggle = QPushButton("🎯 Shadow OFF")
        self.shadow_toggle.setMinimumSize(200, 60)
        self.shadow_toggle.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        self.shadow_toggle.setCheckable(True)
        self.shadow_toggle.clicked.connect(self.toggle_shadow)

        self.recording = False
        self.playing_recorded = False
        self.just_finished_recording = False  # flag to prevent immediate re-trigger
        self.shadow_mode = False
        self.shadow_waiting_for_recording = False
        self.whisper_model = None  # Lazy load Whisper model for pronunciation assessment
        
        # Microphone monitoring
        self.mic_stream = None
        self.mic_monitoring_active = False
        self.current_volume = 0.0
        self.mic_device_index = None  # Store selected device index
        self.available_devices = []  # Store device list

        self.init_ui()
        self.load_projects()
        
        # Start microphone monitoring (will use selected device)
        # Delay to ensure UI is ready
        QTimer.singleShot(500, self.start_mic_monitoring)

    def init_ui(self):
        control_layout = QHBoxLayout()
        control_layout.setContentsMargins(5, 5, 5, 5)
        control_layout.setSpacing(10)
        control_layout.addWidget(self.skip_back_btn)
        control_layout.addWidget(self.play_pause_btn)
        control_layout.addWidget(self.skip_forward_btn)
        control_hint = QLabel("←/→: Seek    Space: Play/Pause")
        control_hint.setStyleSheet("color: gray; padding-left: 15px; font-size: 17px;")
        control_layout.addWidget(control_hint)

        shadow_layout = QHBoxLayout()
        shadow_layout.setContentsMargins(5, 5, 5, 5)
        shadow_layout.setSpacing(10)
        shadow_hint = QLabel("A: ◀ Prev    S: 🔁 Repeat    D: ▶ Next")
        shadow_hint.setStyleSheet("color: gray; padding-left: 15px; font-size: 17px;")
        shadow_layout.addWidget(self.prev_sub_btn)
        shadow_layout.addWidget(self.repeat_sub_btn)
        shadow_layout.addWidget(self.next_sub_btn)
        shadow_layout.addWidget(shadow_hint)

        slider_layout = QHBoxLayout()
        slider_layout.setContentsMargins(5, 5, 5, 5)
        slider_layout.setSpacing(10)
        slider_layout.addWidget(self.slider_label)
        self.slider.setFixedHeight(30)
        slider_layout.addWidget(self.slider)

        speed_layout = QHBoxLayout()
        speed_layout.setContentsMargins(5, 5, 5, 5)
        speed_layout.setSpacing(10)
        speed_layout.addWidget(self.speed_label)
        speed_layout.addWidget(self.speed_slider)
        speed_hint = QLabel("Q: 10% Slower    E: 10% Faster")
        speed_hint.setStyleSheet("color: gray; padding-left: 15px; font-size: 17px;")
        speed_layout.addWidget(speed_hint)
        speed_layout.addStretch()  # Ensures items align left
        self.speed_slider.setMinimumWidth(200)

        # === Left status panel ===
        status_widget = QWidget()
        status_layout = QVBoxLayout()

        # --- Whisper Model row ---
        self.model_selector = QComboBox()
        self.model_selector.addItems(
            ["tiny", "base", "small", "medium", "large", "turbo"]
        )
        self.model_selector.setCurrentText("base")
        self.model_selector.setToolTip("Choose Whisper model to use")
        self.model_selector.setStyleSheet("font-size: 16px; padding: 8px;")
        model_row = QHBoxLayout()
        model_label = QLabel("🧠 Whisper Model:")
        model_label.setMinimumWidth(180)
        model_label.setStyleSheet("font-size: 17px; font-weight: bold;")
        model_row.addWidget(model_label)
        model_row.addWidget(self.model_selector)
        status_layout.addLayout(model_row)

        # --- YouTube URL row ---
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("Paste YouTube URL and press Enter")
        self.url_input.setStyleSheet("font-size: 16px; padding: 8px;")
        self.url_input.returnPressed.connect(self.process_youtube_url)
        url_row = QHBoxLayout()
        url_label = QLabel("🔗 YouTube URL:")
        url_label.setMinimumWidth(180)
        url_label.setStyleSheet("font-size: 17px; font-weight: bold;")
        url_row.addWidget(url_label)
        url_row.addWidget(self.url_input)
        status_layout.addLayout(url_row)

        # --- Max Words per Subtitle row ---
        self.max_words_selector = QComboBox()
        self.max_words_selector.addItems([str(i) for i in range(10, 31)])  # 10 → 30
        self.max_words_selector.setCurrentText("15")  # Default value
        self.max_words_selector.setToolTip(
            "Maximum number of words before a subtitle may split"
        )
        self.max_words_selector.setStyleSheet("font-size: 16px; padding: 8px;")
        max_row = QHBoxLayout()
        max_label = QLabel("🧾 Max Words per Subtitle:")
        max_label.setMinimumWidth(180)
        max_label.setStyleSheet("font-size: 17px; font-weight: bold;")
        max_row.addWidget(max_label)
        max_row.addWidget(self.max_words_selector)
        status_layout.addLayout(max_row)

        # --- Status output area ---
        status_header_row = QHBoxLayout()
        status_label = QLabel("📄 Status:")
        status_label.setStyleSheet("font-size: 17px; font-weight: bold;")
        status_header_row.addWidget(status_label)
        status_header_row.addStretch()

        self.auto_scroll_checkbox = QCheckBox("Auto scroll")
        self.auto_scroll_checkbox.setChecked(True)  # default ON
        self.auto_scroll_checkbox.setToolTip(
            "Scroll to the newest message automatically"
        )
        self.auto_scroll_checkbox.setStyleSheet("font-size: 16px; padding: 5px;")
        status_header_row.addWidget(self.auto_scroll_checkbox)

        status_layout.addLayout(status_header_row)
        status_layout.addWidget(self.status_output)

        status_widget.setLayout(status_layout)

        projects_header_layout = QHBoxLayout()
        projects_header_layout.setSpacing(15)
        projects_label = QLabel("📺 YouTube Videos:")
        projects_label.setStyleSheet("font-size: 18px; font-weight: bold;")
        refresh_button = QPushButton("🔄 Refresh")
        refresh_button.setMinimumSize(160, 60)
        refresh_button.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        refresh_button.setToolTip("Refresh YouTube Video List")
        refresh_button.clicked.connect(self.load_projects)
        delete_button = QPushButton("🗑️ Delete")
        delete_button.setMinimumSize(160, 60)
        delete_button.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        delete_button.setToolTip("Delete Selected YouTube Video")
        delete_button.clicked.connect(self.delete_selected_project)
        audio_settings_button = QPushButton("🔊 音频设置")
        audio_settings_button.setMinimumSize(180, 60)
        audio_settings_button.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        audio_settings_button.setToolTip("Audio Settings")
        audio_settings_button.clicked.connect(self.show_audio_settings)
        projects_header_layout.addWidget(projects_label)
        projects_header_layout.addStretch()
        projects_header_layout.addWidget(audio_settings_button)
        projects_header_layout.addWidget(refresh_button)
        projects_header_layout.addWidget(delete_button)
        project_widget = QWidget()
        project_layout = QVBoxLayout()
        project_layout.addLayout(projects_header_layout)
        project_layout.addWidget(self.project_list)
        project_widget.setLayout(project_layout)

        top_row_splitter = QSplitter(Qt.Horizontal)
        top_row_splitter.setStyleSheet(
            "QSplitter::handle { background-color: lightgray; }"
        )
        top_row_splitter.addWidget(status_widget)
        top_row_splitter.addWidget(project_widget)
        top_row_splitter.setSizes([600, 600])

        video_display_layout = QVBoxLayout()
        video_display_layout.addWidget(self.video_frame)
        video_display_layout.addLayout(slider_layout)

        # --- Bottom controls layout ---
        # Make the left cluster a horizontal row: [toggles grid] | [gain+font column]
        left_controls_layout = QHBoxLayout()
        left_controls_layout.setContentsMargins(10, 10, 10, 10)
        left_controls_layout.setSpacing(15)
        left_controls_layout.setAlignment(Qt.AlignTop)

        # Toggles in vertical layout with more spacing
        toggles_layout = QVBoxLayout()
        toggles_layout.setContentsMargins(10, 10, 10, 10)
        toggles_layout.setSpacing(12)

        # Auto Play row
        auto_play_row = QHBoxLayout()
        auto_play_row.setSpacing(15)
        auto_play_hint = QLabel("P: Toggle Auto Play")
        auto_play_hint.setStyleSheet("font-size: 16px; color: gray;")
        auto_play_row.addWidget(self.auto_play_toggle)
        auto_play_row.addWidget(auto_play_hint)
        auto_play_row.addStretch()
        toggles_layout.addLayout(auto_play_row)

        # Loop row
        loop_row = QHBoxLayout()
        loop_row.setSpacing(15)
        loop_hint = QLabel("L: Toggle Loop")
        loop_hint.setStyleSheet("font-size: 16px; color: gray;")
        loop_row.addWidget(self.loop_toggle)
        loop_row.addWidget(loop_hint)
        loop_row.addStretch()
        toggles_layout.addLayout(loop_row)

        # Record row
        record_row = QHBoxLayout()
        record_row.setSpacing(15)
        record_hint = QLabel("R: Toggle Record")
        record_hint.setStyleSheet("font-size: 16px; color: gray;")
        record_row.addWidget(self.record_toggle)
        record_row.addWidget(record_hint)
        record_row.addStretch()
        toggles_layout.addLayout(record_row)

        # Shadow row
        shadow_row = QHBoxLayout()
        shadow_row.setSpacing(15)
        shadow_hint = QLabel("H: Toggle Shadow")
        shadow_hint.setStyleSheet("font-size: 16px; color: gray;")
        shadow_row.addWidget(self.shadow_toggle)
        shadow_row.addWidget(shadow_hint)
        shadow_row.addStretch()
        toggles_layout.addLayout(shadow_row)
        
        toggles_widget = QWidget()
        toggles_widget.setLayout(toggles_layout)

        left_controls_layout.addWidget(toggles_widget)

        # Add a slim vertical separator between toggles and the right column
        sep = QFrame()
        sep.setObjectName("sepRight")
        sep.setFrameShape(QFrame.NoFrame)  # draw our own line
        sep.setFixedWidth(4)  # Thicker separator
        sep.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Expanding)
        sep.setStyleSheet("#sepRight { background-color: #444444; }")  # lighter gray for visibility
        left_controls_layout.addWidget(sep)

        # === Record Gain + Subtitle Font stacked vertically ===
        gain_font_widget = QWidget()
        gain_font_layout = QVBoxLayout(gain_font_widget)
        gain_font_layout.setContentsMargins(10, 10, 10, 10)
        gain_font_layout.setSpacing(15)

        # Record Gain row
        gain_row = QHBoxLayout()
        gain_row.setSpacing(15)
        gain_label = QLabel("Record Gain:")
        gain_label.setMinimumWidth(140)
        gain_label.setStyleSheet("padding-left: 10px; font-size: 17px; font-weight: bold;")
        gain_row.addWidget(gain_label)

        self.gain_selector = QComboBox()
        gain_options = ["0.1", "0.25", "0.5"] + [str(i) for i in range(1, 21)]
        self.gain_selector.addItems(gain_options)
        self.gain_selector.setCurrentText("10")
        self.gain_selector.setMinimumWidth(100)
        self.gain_selector.setStyleSheet("font-size: 16px; padding: 8px;")
        gain_row.addWidget(self.gain_selector)
        gain_row.addStretch()
        gain_font_layout.addLayout(gain_row)

        # Subtitle Font row
        font_row = QHBoxLayout()
        font_row.setSpacing(15)
        font_label = QLabel("Subtitle Font:")
        font_label.setMinimumWidth(140)
        font_label.setStyleSheet("padding-left: 10px; font-size: 17px; font-weight: bold;")
        font_row.addWidget(font_label)

        self.subtitle_font_size_selector = QComboBox()
        font_sizes = [str(i) for i in range(10, 25)]  # 10–24 pt
        self.subtitle_font_size_selector.addItems(font_sizes)
        self.subtitle_font_size_selector.setCurrentText("16")
        self.subtitle_font_size_selector.setMinimumWidth(100)
        self.subtitle_font_size_selector.setStyleSheet("font-size: 16px; padding: 8px;")
        self.subtitle_font_size_selector.currentTextChanged.connect(
            self.change_subtitle_font_size
        )
        font_row.addWidget(self.subtitle_font_size_selector)
        font_row.addStretch()
        gain_font_layout.addLayout(font_row)

        # Microphone device selection
        mic_device_row = QHBoxLayout()
        mic_device_row.setSpacing(15)
        mic_device_label = QLabel("🎤 Mic Device:")
        mic_device_label.setMinimumWidth(140)
        mic_device_label.setStyleSheet("padding-left: 10px; font-size: 17px; font-weight: bold;")
        mic_device_row.addWidget(mic_device_label)
        
        self.mic_device_selector = QComboBox()
        self.mic_device_selector.setMinimumWidth(300)
        self.mic_device_selector.setStyleSheet("font-size: 16px; padding: 8px;")
        self.mic_device_selector.currentIndexChanged.connect(self.on_mic_device_changed)
        self.populate_mic_devices()
        mic_device_row.addWidget(self.mic_device_selector)
        mic_device_row.addStretch()
        gain_font_layout.addLayout(mic_device_row)
        
        # Microphone volume meter
        mic_volume_row = QHBoxLayout()
        mic_volume_row.setSpacing(15)
        mic_volume_label = QLabel("🎤 Mic Volume:")
        mic_volume_label.setMinimumWidth(140)
        mic_volume_label.setStyleSheet("padding-left: 10px; font-size: 17px; font-weight: bold;")
        mic_volume_row.addWidget(mic_volume_label)
        
        self.mic_volume_bar = QProgressBar()
        self.mic_volume_bar.setMinimum(0)
        self.mic_volume_bar.setMaximum(100)
        self.mic_volume_bar.setValue(0)
        self.mic_volume_bar.setStyleSheet("""
            QProgressBar {
                border: 2px solid #555;
                border-radius: 5px;
                text-align: center;
                font-size: 15px;
                font-weight: bold;
                height: 30px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #4CAF50, stop:0.7 #FFC107, stop:1 #F44336);
                border-radius: 3px;
            }
        """)
        self.mic_volume_bar.setTextVisible(True)
        self.mic_volume_bar.setFormat("%p%")
        mic_volume_row.addWidget(self.mic_volume_bar)
        mic_volume_row.addStretch()
        gain_font_layout.addLayout(mic_volume_row)
        
        # Put the recording indicator beneath the gain/font controls (right column)
        self.record_status_label.setMinimumWidth(200)
        self.record_status_label.setFont(QFont("Arial", 16))
        self.record_status_label.setStyleSheet("padding-left: 10px; font-weight: bold; font-size: 16px;")
        gain_font_layout.addWidget(self.record_status_label)

        # Add the combined widget to the left controls area
        left_controls_layout.addWidget(gain_font_widget)

        # Separator on the RIGHT of the gain/font column
        sep_right = QFrame()
        sep_right.setObjectName("sepRight")
        sep_right.setFrameShape(QFrame.NoFrame)  # draw our own line
        sep_right.setFixedWidth(4)  # Thicker separator
        sep_right.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Expanding)
        sep_right.setStyleSheet("#sepRight { background-color: #444444; }")  # lighter gray for visibility
        left_controls_layout.addWidget(sep_right)

        # Wrap the left controls in a fixed-size widget.
        left_controls_widget = QWidget()
        left_controls_widget.setLayout(left_controls_layout)
        left_controls_widget.setMinimumHeight(0)
        left_controls_widget.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Minimum)

        # Part 1: ONLY the running subtitle
        subtitle_only_layout = QHBoxLayout()
        subtitle_only_layout.addWidget(self.subtitle_display, 1)
        video_display_layout.addLayout(subtitle_only_layout)
        
        # Assessment display (only visible in shadow mode) - make it resizable with splitter
        assessment_widget = QWidget()
        assessment_layout = QVBoxLayout(assessment_widget)
        assessment_layout.setContentsMargins(0, 0, 0, 0)
        assessment_layout.addWidget(self.assessment_display)
        self.assessment_display.setVisible(False)
        assessment_widget.setVisible(False)
        self.assessment_widget = assessment_widget  # Store reference for visibility control
        
        # Create a splitter for subtitle and assessment areas to allow resizing
        subtitle_assessment_splitter = QSplitter(Qt.Vertical)
        subtitle_assessment_splitter.setStyleSheet(
            "QSplitter::handle { background-color: lightgray; }"
        )
        subtitle_widget = QWidget()
        subtitle_widget.setLayout(subtitle_only_layout)
        subtitle_assessment_splitter.addWidget(subtitle_widget)
        subtitle_assessment_splitter.addWidget(assessment_widget)
        subtitle_assessment_splitter.setCollapsible(0, False)  # Don't collapse subtitle
        subtitle_assessment_splitter.setCollapsible(1, True)   # Can collapse assessment
        subtitle_assessment_splitter.setStretchFactor(0, 1)
        subtitle_assessment_splitter.setStretchFactor(1, 2)  # Give more space to assessment
        # Set initial sizes: subtitle area smaller, assessment area larger
        subtitle_assessment_splitter.setSizes([100, 200])
        
        video_display_layout.addWidget(subtitle_assessment_splitter)

        video_display_widget = QWidget()
        video_display_widget.setLayout(video_display_layout)
        video_display_widget.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        # Part 2: LEFT = toggles/gain/font/indicator; RIGHT = playback controls
        controls_right_layout = QVBoxLayout()
        controls_right_layout.addLayout(control_layout)  # ⏪ Play ⏩ row
        controls_right_layout.addLayout(shadow_layout)  # ◀ Repeat ▶ row
        controls_right_layout.addLayout(speed_layout)  # Speed slider row

        controls_row = QHBoxLayout()
        controls_row.setContentsMargins(10, 10, 10, 10)
        controls_row.setSpacing(15)
        controls_row.addWidget(left_controls_widget)  # moved from the old subtitle row
        controls_row.addLayout(controls_right_layout, 1)

        controls_widget = QWidget()
        controls_widget.setLayout(controls_row)
        controls_widget.setMinimumHeight(0)
        controls_widget.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)

        video_splitter = QSplitter(Qt.Vertical)
        video_splitter.setStyleSheet(
            "QSplitter::handle { background-color: lightgray; }"
        )
        video_splitter.addWidget(video_display_widget)
        video_splitter.addWidget(controls_widget)

        # Bottom (controls) visible but as small as possible by default
        video_splitter.setCollapsible(0, False)  # keep video area from collapsing
        video_splitter.setCollapsible(1, True)  # controls can collapse if dragged
        video_splitter.setStretchFactor(0, 1)  # give stretch to video
        video_splitter.setStretchFactor(1, 0)

        # Start with a tiny controls height (but not zero). e.g., 48 pixels.
        video_splitter.setSizes([10**6, 48])

        video_widget = video_splitter

        top_video_splitter = QSplitter(Qt.Vertical)
        top_video_splitter.setStyleSheet(
            "QSplitter::handle { background-color: lightgray; }"
        )
        top_video_splitter.addWidget(top_row_splitter)
        top_video_splitter.addWidget(video_widget)
        top_video_splitter.setSizes([100, 1000])

        right_layout = QVBoxLayout()
        # --- Study Timer row (top-right, above the list) ---
        timer_row = QHBoxLayout()
        timer_row.setContentsMargins(0, 0, 0, 0)
        timer_row.setSpacing(8)
        timer_row.setAlignment(Qt.AlignLeft)  # ensure left alignment

        # Text label on the left
        self.study_timer_text = QLabel("⏱ Study time:")
        self.study_timer_text.setToolTip("Total active study time")
        timer_row.addWidget(self.study_timer_text)

        # Timer value
        self.study_timer_label = QLabel("00:00:00")
        self.study_timer_label.setStyleSheet("font-weight: bold;")
        timer_row.addWidget(self.study_timer_label)

        # Start/Pause button
        self.study_timer_btn = QPushButton("▶ Start")
        self.study_timer_btn.setMinimumSize(140, 55)
        self.study_timer_btn.setStyleSheet("font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;")
        self.study_timer_btn.setToolTip("Start/Pause study timer")
        self.study_timer_btn.clicked.connect(self.toggle_study_timer)
        timer_row.addWidget(self.study_timer_btn)

        # Optional: keep content left while filling the rest of the row
        timer_row.addStretch()

        right_layout.addLayout(timer_row)

        # The list stays where it was
        right_layout.addWidget(QLabel("🧾 Subtitle List:"))
        right_layout.addWidget(self.subtitle_list)
        right_widget = QWidget()
        right_widget.setLayout(right_layout)

        main_splitter = QSplitter(Qt.Horizontal)
        main_splitter.setStyleSheet(
            "QSplitter::handle { background-color: lightgray; }"
        )
        main_splitter.addWidget(top_video_splitter)
        main_splitter.addWidget(right_widget)
        main_splitter.setSizes([900, 300])

        main_layout = QVBoxLayout()
        main_layout.addWidget(main_splitter)
        self.setLayout(main_layout)

        self.project_list.itemClicked.connect(self.load_project)
        self.play_pause_btn.clicked.connect(self.toggle_play_pause)
        self.skip_back_btn.clicked.connect(lambda: self.seek_relative(-5000))
        self.skip_forward_btn.clicked.connect(lambda: self.seek_relative(5000))
        self.prev_sub_btn.clicked.connect(self.prev_subtitle)
        self.repeat_sub_btn.clicked.connect(self.repeat_subtitle)
        self.next_sub_btn.clicked.connect(self.next_subtitle)

    def toggle_auto_play(self):
        self.auto_play_enabled = self.auto_play_toggle.isChecked()
        self.auto_play_toggle.setText(
            "🎵 Auto Play ON" if self.auto_play_enabled else "🎵 Auto Play OFF"
        )
        self.auto_play_toggle.setStyleSheet(
            "font-size: 20px; font-weight: bold; padding: 12px 15px; background-color: #4682B4; color: white; border-radius: 6px;"
            if self.auto_play_enabled
            else "font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;"
        )
        # Force sync update so the bottom subtitle remains in sync.
        self.sync_with_video()

    def toggle_record(self):
        self.record_toggle.setText(
            "🎙️ Record ON" if self.record_toggle.isChecked() else "🎙️ Record OFF"
        )
        self.record_toggle.setStyleSheet(
            "font-size: 20px; font-weight: bold; padding: 12px 15px; background-color: #FF8C00; color: white; border-radius: 6px;"
            if self.record_toggle.isChecked()
            else "font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;"
        )
        # Force sync update so the bottom subtitle remains in sync.
        self.sync_with_video()

    def toggle_shadow(self):
        self.shadow_mode = self.shadow_toggle.isChecked()
        self.shadow_toggle.setText(
            "🎯 Shadow ON" if self.shadow_mode else "🎯 Shadow OFF"
        )
        self.shadow_toggle.setStyleSheet(
            "font-size: 20px; font-weight: bold; padding: 12px 15px; background-color: #9370DB; color: white; border-radius: 6px;"
            if self.shadow_mode
            else "font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;"
        )
        # When shadow mode is enabled, also enable record mode
        if self.shadow_mode and not self.record_toggle.isChecked():
            self.record_toggle.setChecked(True)
            self.toggle_record()
        # Reset shadow waiting flag when disabling shadow mode
        if not self.shadow_mode:
            self.shadow_waiting_for_recording = False
            if self.record_status_label.text() == "🎤 Ready to record...":
                self.record_status_label.setText("")
            # Hide assessment display when shadow mode is off
            if hasattr(self, 'assessment_widget'):
                self.assessment_widget.setVisible(False)
            # Reset subtitle display to plain text
            if 0 <= self.subtitle_index < len(self.subtitles):
                self.subtitle_display.setText(self.subtitles[self.subtitle_index].text.strip())
        else:
            # Show assessment display when shadow mode is on
            if hasattr(self, 'assessment_widget'):
                self.assessment_widget.setVisible(True)
        # Force sync update
        self.sync_with_video()

    def extract_audio_segment(self, video_path, start_ms, end_ms):
        """Extract audio segment from video using ffmpeg"""
        try:
            # Detect ffmpeg path
            if getattr(sys, "frozen", False):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(__file__)
            ffmpeg_path = os.path.join(base_path, "tools", "ffmpeg.exe")
            if not os.path.exists(ffmpeg_path):
                # Try alternative path for onedir build
                exe_dir = os.path.dirname(sys.executable)
                ffmpeg_path = os.path.join(exe_dir, "tools", "ffmpeg.exe")
                if not os.path.exists(ffmpeg_path):
                    ffmpeg_path = "ffmpeg"  # Fallback to system ffmpeg
            
            start_sec = start_ms / 1000.0
            duration = (end_ms - start_ms) / 1000.0
            
            temp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_audio.close()
            
            cmd = [
                ffmpeg_path,
                "-i", video_path,
                "-ss", str(start_sec),
                "-t", str(duration),
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "1",
                "-y",
                temp_audio.name
            ]
            
            result = subprocess.run(
                cmd, 
                stdout=subprocess.DEVNULL, 
                stderr=subprocess.PIPE, 
                check=True
            )
            return temp_audio.name
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
            self.status_output.append(f"❌ Audio extraction error: {error_msg}")
            return None
        except Exception as e:
            self.status_output.append(f"❌ Audio extraction error: {str(e)}")
            return None

    def load_whisper_model_for_assessment(self):
        """Lazy load Whisper model for pronunciation assessment"""
        if self.whisper_model is None:
            try:
                # Use base model for faster assessment
                self.status_output.append("🧠 Loading Whisper model for pronunciation assessment...")
                self.whisper_model = whisper.load_model("base", device='cuda')
                self.status_output.append("✅ Whisper model loaded")
            except Exception as e:
                self.status_output.append(f"❌ Failed to load Whisper model: {str(e)}")
                return None
        return self.whisper_model

    def normalize_text(self, text):
        """Normalize text for comparison (remove punctuation, lowercase)"""
        # Remove punctuation but keep spaces
        text = re.sub(r'[^\w\s]', '', text.lower())
        # Normalize whitespace
        text = ' '.join(text.split())
        return text

    def word_alignment(self, expected_words, recognized_words):
        """Align expected words with recognized words using sequence matching"""
        # Use SequenceMatcher for word-level alignment
        matcher = SequenceMatcher(None, expected_words, recognized_words, autojunk=False)
        alignment = []
        problem_words = []
        
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                # Words match
                for k in range(i1, i2):
                    alignment.append({
                        'word': expected_words[k],
                        'status': 'correct',
                        'recognized': recognized_words[j1 + (k - i1)] if j1 + (k - i1) < j2 else ''
                    })
            elif tag == 'replace':
                # Words don't match - calculate similarity to prioritize
                for k in range(i1, i2):
                    recognized = recognized_words[j1 + (k - i1)] if j1 + (k - i1) < j2 else ''
                    expected = expected_words[k]
                    
                    # Calculate similarity
                    similarity = SequenceMatcher(None, expected.lower(), recognized.lower()).ratio() if recognized else 0
                    
                    alignment.append({
                        'word': expected,
                        'status': 'incorrect',
                        'recognized': recognized,
                        'similarity': similarity
                    })
                    problem_words.append({
                        'expected': expected,
                        'recognized': recognized,
                        'type': 'mispronunciation',
                        'similarity': similarity,
                        'priority': 1 - similarity  # Higher priority for lower similarity
                    })
            elif tag == 'delete':
                # Expected word not recognized
                for k in range(i1, i2):
                    alignment.append({
                        'word': expected_words[k],
                        'status': 'missing',
                        'recognized': ''
                    })
                    problem_words.append({
                        'expected': expected_words[k],
                        'recognized': '',
                        'type': 'missing',
                        'priority': 1.0  # High priority
                    })
            elif tag == 'insert':
                # Extra words recognized
                for k in range(j1, j2):
                    problem_words.append({
                        'expected': '',
                        'recognized': recognized_words[k],
                        'type': 'extra',
                        'priority': 0.5  # Medium priority
                    })
        
        # Sort problem words by priority (most critical first)
        problem_words.sort(key=lambda x: x.get('priority', 0), reverse=True)
        
        return alignment, problem_words

    def analyze_pronunciation_issues(self, expected_word, recognized_word):
        """Analyze specific pronunciation issues and provide concise suggestions"""
        if not recognized_word:
            return ["未识别"], ["说清楚"]
        
        expected_lower = expected_word.lower().strip()
        recognized_lower = recognized_word.lower().strip()
        
        if expected_lower == recognized_lower:
            return [], []
        
        issues = []
        suggestions = []
        
        # 1. Character-level similarity analysis
        similarity = SequenceMatcher(None, expected_lower, recognized_lower).ratio()
        
        # 2. Common consonant errors (most critical)
        consonant_errors = {
            'th': {'errors': ['t', 'd', 's', 'z'], 'tip': 'th音：舌尖抵牙齿'},
            'r': {'errors': ['l', 'w'], 'tip': 'r音：卷舌'},
            'l': {'errors': ['r', 'w'], 'tip': 'l音：舌尖抵上颚'},
            'v': {'errors': ['w', 'b', 'f'], 'tip': 'v音：上齿轻触下唇'},
            'w': {'errors': ['v', 'b'], 'tip': 'w音：圆唇'},
            'f': {'errors': ['p', 'h'], 'tip': 'f音：上齿轻触下唇'},
            'z': {'errors': ['s', 'd'], 'tip': 'z音：声带振动'},
            's': {'errors': ['z', 'sh'], 'tip': 's音：不振动'},
        }
        
        for sound, info in consonant_errors.items():
            if sound in expected_lower:
                for err in info['errors']:
                    if err in recognized_lower or (sound not in recognized_lower and err in recognized_lower):
                        issues.append(f"辅音: {sound}→{err}")
                        suggestions.append(info['tip'])
                        break
        
        # 3. Vowel errors
        vowel_map = {
            'a': ['e', 'i', 'o', 'u'],
            'e': ['a', 'i', 'o'],
            'i': ['e', 'a', 'o'],
            'o': ['a', 'u', 'e'],
            'u': ['o', 'a', 'i']
        }
        
        # Check if vowels are swapped
        expected_vowels = [c for c in expected_lower if c in 'aeiou']
        recognized_vowels = [c for c in recognized_lower if c in 'aeiou']
        if expected_vowels and recognized_vowels and expected_vowels != recognized_vowels:
            if len(expected_vowels) == len(recognized_vowels):
                issues.append("元音错误")
                suggestions.append("注意元音口型")
        
        # 4. Missing/extra sounds
        if len(expected_lower) > len(recognized_lower) + 2:
            issues.append("漏音")
            suggestions.append("说完整")
        elif len(recognized_lower) > len(expected_lower) + 2:
            issues.append("多音")
            suggestions.append("不要加音")
        
        # 5. Ending sounds
        endings = ['ed', 's', 't', 'd', 'ing', 'ly', 'er', 'est']
        for ending in endings:
            if expected_lower.endswith(ending) and not recognized_lower.endswith(ending):
                issues.append("词尾缺失")
                suggestions.append("发完词尾")
                break
        
        # 6. Beginning sounds
        if expected_lower and recognized_lower:
            if expected_lower[0] != recognized_lower[0]:
                issues.append("首音错误")
                suggestions.append("注意开头")
        
        # 7. Similarity-based general feedback
        if similarity < 0.5:
            if not issues:
                issues.append("差异较大")
                suggestions.append("多听原音")
        elif similarity < 0.7:
            if not issues:
                issues.append("需改进")
                suggestions.append("注意细节")
        
        # Return first issue and suggestion (keep it concise)
        return issues[:1] if issues else ["需改进"], suggestions[:1] if suggestions else ["多练习"]

    def compare_pronunciation(self, reference_audio_path, user_audio_path, expected_text=""):
        """Compare user pronunciation with reference using word-level alignment and analysis"""
        # Try Whisper-based assessment first
        model = self.load_whisper_model_for_assessment()
        if model is not None and expected_text:
            try:
                # Transcribe both audios with word timestamps for better accuracy
                ref_result = model.transcribe(reference_audio_path, language="en", word_timestamps=True)
                user_result = model.transcribe(user_audio_path, language="en", word_timestamps=True)
                
                # Extract word lists
                ref_words = []
                for segment in ref_result.get("segments", []):
                    for word_info in segment.get("words", []):
                        word_text = word_info.get("word", "").strip().lower()
                        # Remove punctuation from word
                        word_text = re.sub(r'[^\w]', '', word_text)
                        if word_text:
                            ref_words.append(word_text)
                
                user_words = []
                for segment in user_result.get("segments", []):
                    for word_info in segment.get("words", []):
                        word_text = word_info.get("word", "").strip().lower()
                        word_text = re.sub(r'[^\w]', '', word_text)
                        if word_text:
                            user_words.append(word_text)
                
                # Normalize expected text
                expected_normalized = self.normalize_text(expected_text)
                expected_words = expected_normalized.split()
                
                # Word-level alignment
                alignment, problem_words = self.word_alignment(expected_words, user_words)
                
                # Calculate scores
                total_words = len(expected_words)
                correct_words = sum(1 for item in alignment if item['status'] == 'correct')
                word_accuracy = (correct_words / total_words * 100) if total_words > 0 else 0
                
                # Also calculate MFCC similarity as acoustic reference
                mfcc_score = self._compare_mfcc(reference_audio_path, user_audio_path)
                
                # Combined score: 70% word accuracy + 30% MFCC (acoustic)
                if mfcc_score is not None:
                    final_score = word_accuracy * 0.7 + mfcc_score * 0.3
                else:
                    final_score = word_accuracy
                
                # Generate highlighted text and assessment
                highlighted_text = self._generate_highlighted_text(expected_text, alignment)
                assessment_text = self._generate_assessment_text(
                    expected_text, user_words, problem_words, word_accuracy, final_score
                )
                
                # Update displays
                QMetaObject.invokeMethod(
                    self,
                    "update_assessment_display",
                    Qt.QueuedConnection,
                    Q_ARG(str, highlighted_text),
                    Q_ARG(str, assessment_text)
                )
                
                # Log details
                self.status_output.append(f"📝 Expected: {expected_text}")
                self.status_output.append(f"🎤 Recognized: {' '.join(user_words)}")
                self.status_output.append(f"📊 Word accuracy: {word_accuracy:.1f}%")
                
                return {
                    'score': max(0, min(100, final_score)),
                    'word_accuracy': word_accuracy,
                    'alignment': alignment,
                    'problem_words': problem_words
                }
            except Exception as e:
                self.status_output.append(f"⚠️ Whisper assessment failed: {str(e)}, using MFCC fallback")
        
        # Fallback to MFCC-based comparison
        mfcc_score = self._compare_mfcc(reference_audio_path, user_audio_path)
        return {
            'score': mfcc_score if mfcc_score is not None else 0,
            'word_accuracy': None,
            'alignment': None,
            'problem_words': []
        }

    def _generate_highlighted_text(self, original_text, alignment):
        """Generate HTML text with highlighted problem words"""
        words = original_text.split()
        highlighted_parts = []
        alignment_idx = 0
        
        for word in words:
            # Remove punctuation for matching
            word_clean = re.sub(r'[^\w]', '', word.lower())
            
            if alignment_idx < len(alignment):
                item = alignment[alignment_idx]
                if item['word'].lower() == word_clean:
                    if item['status'] == 'correct':
                        highlighted_parts.append(word)
                    elif item['status'] == 'incorrect':
                        highlighted_parts.append(f'<span style="background-color: #ff6b6b; color: white; padding: 2px 4px; border-radius: 3px;">{word}</span>')
                    elif item['status'] == 'missing':
                        highlighted_parts.append(f'<span style="background-color: #ffa500; color: white; padding: 2px 4px; border-radius: 3px;">{word}</span>')
                    alignment_idx += 1
                else:
                    highlighted_parts.append(word)
            else:
                highlighted_parts.append(word)
        
        return ' '.join(highlighted_parts)

    def _generate_assessment_text(self, expected_text, user_words, problem_words, word_accuracy, final_score):
        """Generate concise but detailed assessment text"""
        lines = []
        
        # Score header
        score_color = '#4caf50' if final_score >= 80 else '#ff9800' if final_score >= 60 else '#f44336'
        score_emoji = '✅' if final_score >= 80 else '⚠️' if final_score >= 60 else '❌'
        lines.append(f"<h3 style='color: {score_color}; margin: 5px 0;'>{score_emoji} 分数: <span style='font-size: 24px;'>{final_score:.0f}%</span></h3>")
        lines.append(f"<p style='margin: 2px 0; color: #aaa; font-size: 12px;'>单词准确率: {word_accuracy:.0f}%</p>")
        
        # Detailed issues (concise format)
        if problem_words:
            lines.append(f"<div style='margin-top: 10px;'>")
            lines.append(f"<h4 style='color: #e74c3c; margin: 8px 0 4px 0; font-size: 14px;'>⚠️ 问题词:</h4>")
            
            # Show top 3-4 most critical issues
            for problem in problem_words[:4]:
                if problem['type'] == 'missing':
                    lines.append(f"<div style='margin: 4px 0; padding: 4px; background: #3a3a3a; border-radius: 3px;'>")
                    lines.append(f"<b style='color: #ffa500;'>{problem['expected']}</b> <span style='color: #999; font-size: 11px;'>→ 未识别</span>")
                    lines.append(f"<div style='color: #bbb; font-size: 11px; margin-top: 2px;'>💡 说清楚</div>")
                    lines.append(f"</div>")
                elif problem['type'] == 'mispronunciation':
                    issues, suggestions = self.analyze_pronunciation_issues(
                        problem['expected'], problem['recognized']
                    )
                    issue_text = issues[0] if issues else "发音错误"
                    tip_text = suggestions[0] if suggestions else "多练习"
                    lines.append(f"<div style='margin: 4px 0; padding: 4px; background: #3a3a3a; border-radius: 3px;'>")
                    lines.append(f"<b style='color: #ff6b6b;'>{problem['expected']}</b> <span style='color: #999; font-size: 11px;'>→ {problem['recognized']}</span>")
                    lines.append(f"<div style='color: #bbb; font-size: 11px; margin-top: 2px;'>💡 {issue_text}: {tip_text}</div>")
                    lines.append(f"</div>")
                elif problem['type'] == 'extra':
                    lines.append(f"<div style='margin: 4px 0; padding: 4px; background: #3a3a3a; border-radius: 3px;'>")
                    lines.append(f"<span style='color: #999; font-size: 11px;'>多余: </span><b style='color: #ffa500;'>{problem['recognized']}</b>")
                    lines.append(f"<div style='color: #bbb; font-size: 11px; margin-top: 2px;'>💡 不要加词</div>")
                    lines.append(f"</div>")
            
            lines.append(f"</div>")
        else:
            lines.append(f"<p style='color: #4caf50; margin-top: 10px;'>✅ 所有词识别正确！</p>")
        
        # Quick tips (only if score is low)
        if final_score < 80:
            lines.append(f"<div style='margin-top: 10px; padding-top: 8px; border-top: 1px solid #444;'>")
            tips = []
            if word_accuracy < 70:
                tips.append("• 每个词说清楚")
            if final_score < 60:
                tips.append("• 仔细听原音")
                tips.append("• 注意重音节奏")
            if not tips:
                tips.append("• 多听多练")
            lines.append(f"<div style='color: #bbb; font-size: 11px;'>{'<br>'.join(tips)}</div>")
            lines.append(f"</div>")
        
        return ''.join(lines)

    @pyqtSlot(str, str)
    def update_assessment_display(self, highlighted_text, assessment_text):
        """Update the assessment display with highlighted text and analysis"""
        # Update subtitle display with highlighted text
        self.subtitle_display.setText(highlighted_text)
        
        # Show and update assessment display
        if hasattr(self, 'assessment_widget'):
            self.assessment_widget.setVisible(True)
        self.assessment_display.setHtml(assessment_text)

    def _compare_mfcc(self, reference_audio_path, user_audio_path):
        """Compare audio using MFCC features (acoustic similarity)"""
        try:
            # Load audio files
            ref_audio, ref_sr = librosa.load(reference_audio_path, sr=22050)
            user_audio, user_sr = librosa.load(user_audio_path, sr=22050)
            
            # Extract MFCC features
            ref_mfcc = librosa.feature.mfcc(y=ref_audio, sr=ref_sr, n_mfcc=13)
            user_mfcc = librosa.feature.mfcc(y=user_audio, sr=user_sr, n_mfcc=13)
            
            # Normalize features
            ref_mfcc = (ref_mfcc - ref_mfcc.mean()) / (ref_mfcc.std() + 1e-8)
            user_mfcc = (user_mfcc - user_mfcc.mean()) / (user_mfcc.std() + 1e-8)
            
            # Calculate similarity using cosine distance
            # Flatten and average over time
            ref_flat = ref_mfcc.mean(axis=1)
            user_flat = user_mfcc.mean(axis=1)
            
            # Cosine similarity (1 - cosine distance)
            similarity = 1 - cosine(ref_flat, user_flat)
            
            # Convert to percentage (0-100)
            score = max(0, min(100, similarity * 100))
            
            return score
        except Exception as e:
            self.status_output.append(f"❌ MFCC comparison error: {str(e)}")
            return None

    def record_after_subtitle(self, subtitle):
        self.recording = True
        self.record_status_label.setText("🔴 Recording...")
        # Pause video before recording.
        if self.is_playing:
            self.player.pause()
            self.is_playing = False
            self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPlay))
        duration = (
            (subtitle.end.ordinal - subtitle.start.ordinal) * 1.1 / 1000.0
        ) + 2.0  # seconds
        samplerate = 44100
        self.temp_wav_file = tempfile.NamedTemporaryFile(
            suffix=".wav", delete=False
        ).name

        def record_and_play():
            try:
                # Use selected microphone device for recording
                device = self.mic_device_index if self.mic_device_index is not None else None
                audio = sd.rec(
                    int(duration * samplerate),
                    samplerate=samplerate,
                    channels=1,
                    dtype="int16",
                    device=device,
                )
                sd.wait()  # Wait until recording is finished.
                write(self.temp_wav_file, samplerate, audio)
                self.recording = False
                
                # If shadow mode is enabled, compare with reference audio
                if self.shadow_mode:
                    self.playing_recorded = True
                    # Store subtitle index for comparison
                    subtitle_idx = self.subtitle_index
                    QMetaObject.invokeMethod(
                        self,
                        "compare_pronunciation_wrapper",
                        Qt.QueuedConnection,
                        Q_ARG(int, subtitle_idx),
                        Q_ARG(str, self.temp_wav_file),
                    )
                else:
                    self.playing_recorded = True
                    QMetaObject.invokeMethod(
                        self,
                        "play_recorded_audio_wrapper",
                        Qt.QueuedConnection,
                        Q_ARG(str, self.temp_wav_file),
                    )
            except Exception as e:
                self.recording = False
                self.record_status_label.setText("⚠️ Rec Failed")
                self.status_output.append(f"❌ Recording error: {str(e)}")

        threading.Thread(target=record_and_play).start()

    @pyqtSlot(str)
    def play_recorded_audio_wrapper(self, filepath):
        self.record_status_label.setText("🔊 Playing...")
        self.play_recorded_audio(filepath)

    @pyqtSlot(int, str)
    def compare_pronunciation_wrapper(self, subtitle_idx, user_audio_path):
        """Wrapper to compare pronunciation in shadow mode"""
        self.record_status_label.setText("🔍 Analyzing...")
        
        def compare_in_thread():
            try:
                # Get subtitle from index
                if not (0 <= subtitle_idx < len(self.subtitles)):
                    self.status_output.append("❌ Invalid subtitle index")
                    QMetaObject.invokeMethod(
                        self,
                        "play_recorded_audio_wrapper",
                        Qt.QueuedConnection,
                        Q_ARG(str, user_audio_path),
                    )
                    return
                
                subtitle = self.subtitles[subtitle_idx]
                
                # Get video path
                video_file = next(
                    (f for f in os.listdir(self.project_folder) if f.startswith("video")), None
                )
                if not video_file:
                    self.status_output.append("❌ Video file not found for comparison")
                    QMetaObject.invokeMethod(
                        self,
                        "play_recorded_audio_wrapper",
                        Qt.QueuedConnection,
                        Q_ARG(str, user_audio_path),
                    )
                    return
                
                video_path = os.path.join(self.project_folder, video_file)
                
                # Extract reference audio segment
                start_ms = subtitle.start.ordinal
                end_ms = subtitle.end.ordinal
                ref_audio_path = self.extract_audio_segment(video_path, start_ms, end_ms)
                
                if ref_audio_path:
                    # Get expected text from subtitle
                    expected_text = subtitle.text.strip() if subtitle else ""
                    # Compare pronunciation
                    result = self.compare_pronunciation(ref_audio_path, user_audio_path, expected_text)
                    
                    if result and isinstance(result, dict):
                        score = result.get('score', 0)
                    elif isinstance(result, (int, float)):
                        score = result
                    else:
                        score = 0
                    
                    if score is not None and score > 0:
                        # Display result (detailed assessment already shown in assessment_display)
                        result_msg = f"🎯 Pronunciation Score: {score:.1f}%"
                        if score >= 80:
                            result_msg += " ✅ Excellent!"
                        elif score >= 60:
                            result_msg += " 👍 Good"
                        elif score >= 40:
                            result_msg += " ⚠️ Needs improvement"
                        else:
                            result_msg += " ❌ Poor, try again"
                        
                        self.status_output.append(result_msg)
                        self.record_status_label.setText(f"Score: {score:.0f}%")
                        
                        # Clean up reference audio
                        try:
                            os.remove(ref_audio_path)
                        except:
                            pass
                    else:
                        self.status_output.append("⚠️ Could not compare pronunciation")
                
                # Play user's recording
                QMetaObject.invokeMethod(
                    self,
                    "play_recorded_audio_wrapper",
                    Qt.QueuedConnection,
                    Q_ARG(str, user_audio_path),
                )
            except Exception as e:
                self.status_output.append(f"❌ Comparison error: {str(e)}")
                # Still play the recording even if comparison fails
                QMetaObject.invokeMethod(
                    self,
                    "play_recorded_audio_wrapper",
                    Qt.QueuedConnection,
                    Q_ARG(str, user_audio_path),
                )
        
        threading.Thread(target=compare_in_thread).start()

    def play_recorded_audio(self, filepath):
        try:
            samplerate, data = read_wav(filepath)
            # Get the gain factor from the dropdown. Defaults to 10 if conversion fails.
            try:
                gain = float(self.gain_selector.currentText())
            except Exception:
                gain = 10.0
            # Increase volume by applying the selected gain factor.
            data = np.clip(data * gain, -32768, 32767).astype(np.int16)
            playback_duration = int((data.shape[0] / samplerate) * 1000)
            sd.play(data, samplerate)
            QTimer.singleShot(playback_duration, self.finish_playback)
        except Exception as e:
            self.status_output.append(f"❌ Playback error: {str(e)}")
            self.finish_playback()

    def finish_playback(self):
        self.playing_recorded = False
        self.just_finished_recording = True
        self.shadow_waiting_for_recording = False
        QTimer.singleShot(1000, lambda: setattr(self, "just_finished_recording", False))
        self.record_status_label.setText("")
        # Mark the current subtitle as recorded.
        self.recorded_subtitles.add(self.subtitle_index)
        # Update subtitle display and list without advancing if loop is on.
        if 0 <= self.subtitle_index < len(self.subtitles):
            self.subtitle_display.setText(
                self.subtitles[self.subtitle_index].text.strip()
            )
            self.subtitle_list.setCurrentRow(self.subtitle_index)
            # Only set player time here if loop is on; for other cases we handle below
            if self.loop_current:
                self.player.set_time(self.subtitles[self.subtitle_index].start.ordinal)

        # In shadow mode, advance to next subtitle and continue
        if self.shadow_mode:
            if self.subtitle_index < len(self.subtitles) - 1:
                self.subtitle_index += 1
                self.subtitle_display.setText(
                    self.subtitles[self.subtitle_index].text.strip()
                )
                self.subtitle_list.setCurrentRow(self.subtitle_index)
                self.player.set_time(
                    self.subtitles[self.subtitle_index].start.ordinal
                )
                # Auto play next subtitle
                if not self.is_playing:
                    self.player.play()
                    self.is_playing = True
                    self.play_pause_btn.setIcon(
                        self.style().standardIcon(QStyle.SP_MediaPause)
                    )
            return

        # Apply auto play logic after recording
        if not self.auto_play_enabled:
            if self.loop_current:
                # Jump back to start of current subtitle and pause
                if 0 <= self.subtitle_index < len(self.subtitles):
                    self.player.set_time(
                        self.subtitles[self.subtitle_index].start.ordinal
                    )
            else:
                # Loop is off: jump to start of next subtitle (if exists)
                next_idx = self.subtitle_index + 1
                if next_idx < len(self.subtitles):
                    self.subtitle_index = next_idx
                    self.subtitle_display.setText(
                        self.subtitles[self.subtitle_index].text.strip()
                    )
                    self.subtitle_list.setCurrentRow(self.subtitle_index)
                    self.player.set_time(
                        self.subtitles[self.subtitle_index].start.ordinal
                    )
            # Pause the video
            if self.is_playing:
                self.player.pause()
                self.is_playing = False
                self.play_pause_btn.setIcon(
                    self.style().standardIcon(QStyle.SP_MediaPlay)
                )
            # Mark that we've paused for this subtitle
            self.auto_play_paused_for_subtitle = True
        else:
            # If record is on and loop is off, then advance to next subtitle.
            if self.record_toggle.isChecked() and not self.loop_current:
                if self.subtitle_index < len(self.subtitles) - 1:
                    self.subtitle_index += 1
                    self.subtitle_display.setText(
                        self.subtitles[self.subtitle_index].text.strip()
                    )
                    self.subtitle_list.setCurrentRow(self.subtitle_index)
                    self.player.set_time(
                        self.subtitles[self.subtitle_index].start.ordinal
                    )
            if not self.is_playing:
                self.player.play()
                self.is_playing = True
                self.play_pause_btn.setIcon(
                    self.style().standardIcon(QStyle.SP_MediaPause)
                )

    def show_audio_settings(self):
        """Show audio settings dialog"""
        dialog = AudioSettingsDialog(self)
        dialog.exec_()

    def show_audio_settings(self):
        """Show audio settings dialog"""
        dialog = AudioSettingsDialog(self)
        dialog.exec_()

    def delete_selected_project(self):
        selected_item = self.project_list.currentItem()
        if not selected_item:
            QMessageBox.warning(
                self, "No Selection", "Please select a YouTube video to delete."
            )
            return
        project_name = selected_item.text()
        project_path = os.path.join("youtube_videos", project_name)
        if self.project_folder == project_path:
            # Stop and clear current playback and subtitles
            self.player.stop()
            self.player.set_media(None)
            self.subtitle_list.clear()
            self.subtitle_display.setText("--")
            self.project_folder = ""
            self.subtitles = []
            self.subtitle_index = 0
        confirm = QMessageBox.question(
            self,
            "Delete YouTube Video",
            f"Are you sure you want to permanently delete:\n\n{project_name}?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if confirm == QMessageBox.Yes:
            try:
                shutil.rmtree(project_path)
                row = self.project_list.row(selected_item)
                self.project_list.takeItem(row)
                self.status_output.append(f"🗑️ Deleted YouTube Video: {project_name}")
            except Exception as e:
                QMessageBox.critical(
                    self, "Error", f"Failed to delete YouTube video:\n{str(e)}"
                )

    def process_youtube_url(self):
        url = self.url_input.text().strip()
        if url:
            self.url_input.clear()
            model_size = self.model_selector.currentText()
            self.status_output.append(f"🔄 Processing: {url}")
            self.status_output.append(f"🧠 Using Whisper model: {model_size}")

            def background_task():
                try:
                    max_words = int(self.max_words_selector.currentText())
                    run_transcription(
                        url,
                        model_size,
                        "youtube_videos",
                        log_callback=self.status_output.append,
                        max_words=max_words,
                    )
                    self.status_output.append("✅ Done. Refreshing list...")
                    self.load_projects()
                except Exception as e:
                    self.status_output.append(f"❌ Error: {str(e)}")

            threading.Thread(target=background_task).start()

    def on_process_finished(self):
        self.load_projects()

    def update_status_output(self):
        data = (
            self.process.readAllStandardOutput() + self.process.readAllStandardError()
        )
        text = str(data, encoding="utf-8")
        self.status_output.append(text)

    def toggle_play_pause(self):
        if self.is_playing:
            self.player.pause()
            self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPlay))
        else:
            self.player.play()
            self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPause))
            # Reset pause flag when manually starting playback
            if not self.auto_play_enabled:
                self.auto_play_paused_for_subtitle = False
        self.is_playing = not self.is_playing

    def load_projects(self):
        existing_projects = {
            self.project_list.item(i).text() for i in range(self.project_list.count())
        }
        updated_projects = set()
        if not os.path.exists("youtube_videos"):
            os.makedirs("youtube_videos")
        for name in os.listdir("youtube_videos"):
            folder = os.path.join("youtube_videos", name)
            subtitle_path = os.path.join(folder, "subtitle.srt")
            video_exists = any(f.startswith("video") for f in os.listdir(folder))
            if os.path.isdir(folder) and video_exists and os.path.exists(subtitle_path):
                updated_projects.add(name)
                if name not in existing_projects:
                    self.project_list.addItem(name)
        for i in reversed(range(self.project_list.count())):
            if self.project_list.item(i).text() not in updated_projects:
                self.project_list.takeItem(i)

    def load_project(self, item):
        project_title = item.text()
        self.project_folder = os.path.join("youtube_videos", project_title)
        
        # Check for video.mp4 first, then audio files
        video_file = None
        video_path_test = os.path.join(self.project_folder, "video.mp4")
        if os.path.exists(video_path_test):
            video_file = "video.mp4"
        else:
            # Check for audio files
            audio_extensions = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.aac']
            for ext in audio_extensions:
                audio_file = f"audio{ext}"
                audio_path_test = os.path.join(self.project_folder, audio_file)
                if os.path.exists(audio_path_test):
                    video_file = audio_file
                    break
            # Also check if folder has any file with audio extension
            if not video_file:
                for f in os.listdir(self.project_folder):
                    f_lower = f.lower()
                    if any(f_lower.endswith(ext) for ext in audio_extensions):
                        video_file = f
                        break
            # Fallback to any file starting with "video"
            if not video_file:
                video_file = next(
                    (f for f in os.listdir(self.project_folder) if f.startswith("video")), None
                )
        
        subtitle_path = os.path.join(self.project_folder, "subtitle.srt")
        if not video_file:
            self.subtitle_display.setText("⚠️ No video/audio found")
            return
        video_path = os.path.join(self.project_folder, video_file)
        media = self.instance.media_new(video_path)
        self.player.set_media(media)
        if sys.platform.startswith("linux"):
            self.player.set_xwindow(self.video_frame.winId())
        elif sys.platform == "win32":
            self.player.set_hwnd(self.video_frame.winId())
        elif sys.platform == "darwin":
            self.player.set_nsobject(int(self.video_frame.winId()))
        self.subtitles = pysrt.open(subtitle_path)
        # Reset recorded subtitles when loading a new project.
        self.recorded_subtitles = set()
        self.auto_play_paused_for_subtitle = False  # Reset pause flag for new project
        self.shadow_waiting_for_recording = False  # Reset shadow waiting flag
        self.subtitle_list.clear()
        for sub in self.subtitles:
            item = QListWidgetItem(sub.text.strip())
            item.setTextAlignment(Qt.AlignLeft | Qt.AlignTop)
            self.subtitle_list.addItem(item)
        self.subtitle_index = 0
        self.player.play()
        self.is_playing = True
        self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPause))
        self.poll_timer.start()
        QTimer.singleShot(1000, self.set_total_duration)

    def set_total_duration(self):
        self.total_duration = self.player.get_length()
        self.slider.setMaximum(self.total_duration)

    def format_time(self, ms):
        seconds = ms // 1000
        mins = seconds // 60
        secs = seconds % 60
        return f"{mins:02}:{secs:02}"

    def format_hms(self, total_seconds):
        h = total_seconds // 3600
        m = (total_seconds % 3600) // 60
        s = total_seconds % 60
        return f"{h:02}:{m:02}:{s:02}"

    def toggle_study_timer(self):
        self.study_timer_running = not self.study_timer_running
        if self.study_timer_running:
            self.study_timer.start()
            self.study_timer_btn.setText("⏸ Pause")
        else:
            self.study_timer.stop()
            self.study_timer_btn.setText("▶ Start")

    def update_study_time(self):
        self.study_elapsed_seconds += 1
        self.study_timer_label.setText(
            f"⏱ {self.format_hms(self.study_elapsed_seconds)}"
        )

    def sync_with_video(self):
        current_ms = self.player.get_time()
        if not self.slider_was_pressed:
            self.slider.setValue(current_ms)
            self.slider_label.setText(
                f"{self.format_time(current_ms)} / {self.format_time(self.total_duration)}"
            )

        if self.manual_jump:
            return

        # ---- Auto Play Pause (check previous subtitle end) ----
        if (
            not self.auto_play_enabled
            and not self.record_toggle.isChecked()
            and 0 <= self.subtitle_index < len(self.subtitles)
            and not self.auto_play_paused_for_subtitle
        ):
            prev_sub = self.subtitles[self.subtitle_index]
            if current_ms >= prev_sub.end.ordinal:
                # Pause
                if self.is_playing:
                    self.player.pause()
                    self.is_playing = False
                    self.play_pause_btn.setIcon(
                        self.style().standardIcon(QStyle.SP_MediaPlay)
                    )
                # Jump logic
                if self.loop_current:
                    # Loop: jump back to start of same subtitle
                    self.player.set_time(prev_sub.start.ordinal)
                else:
                    # Not looping: jump to next subtitle start if exists
                    next_idx = self.subtitle_index + 1
                    if next_idx < len(self.subtitles):
                        self.player.set_time(self.subtitles[next_idx].start.ordinal)
                        self.subtitle_index = next_idx
                        self.subtitle_list.setCurrentRow(next_idx)
                        self.subtitle_display.setText(
                            self.subtitles[next_idx].text.strip()
                        )
                self.auto_play_paused_for_subtitle = True
                return

        # ---- 1. Handle Loop ----
        loop_jumped = False
        if self.loop_current and not self.record_toggle.isChecked():
            # If we have a valid subtitle
            if 0 <= self.subtitle_index < len(self.subtitles):
                sub = self.subtitles[self.subtitle_index]
                # If we've passed the end of the current subtitle, rewind to its start
                if current_ms >= sub.end.ordinal:
                    self.player.set_time(sub.start.ordinal)
                    # If auto play is disabled, pause after jumping back
                    if (
                        not self.auto_play_enabled
                        and not self.auto_play_paused_for_subtitle
                    ):
                        QTimer.singleShot(100, self.pause_after_loop_jump)
                        self.auto_play_paused_for_subtitle = True
                    return  # Avoid falling through to subtitle advancement

        # ---- 2. Handle Shadow Mode ----
        if (
            self.shadow_mode
            and not self.recording
            and not self.playing_recorded
            and not self.just_finished_recording
            and not self.shadow_waiting_for_recording
        ):
            if 0 <= self.subtitle_index < len(self.subtitles):
                sub = self.subtitles[self.subtitle_index]
                if current_ms >= sub.end.ordinal:
                    # Pause video and wait for recording
                    if self.is_playing:
                        self.player.pause()
                        self.is_playing = False
                        self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPlay))
                    self.player.set_time(sub.end.ordinal)
                    self.shadow_waiting_for_recording = True
                    self.record_status_label.setText("🎤 Ready to record...")
                    # Automatically start recording after a short delay
                    QTimer.singleShot(500, lambda: self.record_after_subtitle(sub))
                    return

        # ---- 3. Handle Recording (non-shadow mode) ----
        if (
            self.record_toggle.isChecked()
            and not self.shadow_mode
            and not self.recording
            and not self.playing_recorded
            and not self.just_finished_recording
        ):
            if 0 <= self.subtitle_index < len(self.subtitles):
                sub = self.subtitles[self.subtitle_index]
                if current_ms >= sub.end.ordinal:
                    self.player.set_time(sub.end.ordinal)
                    self.record_after_subtitle(sub)
                    return

        # ---- 3. Advance subtitle_index and handle auto play logic ----
        if not self.record_toggle.isChecked():
            subtitle_changed = False
            for i, sub in enumerate(self.subtitles):
                if sub.start.ordinal <= current_ms < sub.end.ordinal:
                    # Check if we moved to a new subtitle
                    if self.subtitle_index != i:
                        self.auto_play_paused_for_subtitle = False
                    self.subtitle_index = i
                    self.subtitle_list.setCurrentRow(i)
                    self.subtitle_display.setText(sub.text.strip())
                    break
            else:
                # We're not in any subtitle range - no additional auto play logic needed here
                pass

    def slider_pressed(self):
        self.slider_was_pressed = True

    def slider_released(self):
        self.slider_was_pressed = False
        self.player.set_time(self.slider.value())

    def slider_moved(self, value):
        self.slider_label.setText(
            f"{self.format_time(value)} / {self.format_time(self.total_duration)}"
        )
        self.player.set_time(value)

    def change_speed(self, value):
        rate = value / 10.0
        self.player.set_rate(rate)
        self.speed_label.setText(f"Speed: {int(rate * 100)}%")

    def change_subtitle_font_size(self, size_str):
        try:
            size = int(size_str)
            current_font = self.subtitle_display.font()
            current_font.setPointSize(size)
            self.subtitle_display.setFont(current_font)
        except ValueError:
            pass

    def wait_for_seek(self, target_ms, retries=10):
        def check_seek():
            cur = self.player.get_time()
            if abs(cur - target_ms) < 500 or retries <= 0:  # allow 0.5s slack
                self.manual_jump = False
                self.target_jump_ms = None
            else:
                QTimer.singleShot(
                    50, lambda: self.wait_for_seek(target_ms, retries - 1)
                )

        QTimer.singleShot(50, check_seek)

    def jump_to_selected_subtitle(self, item):
        # Cancel previous jump
        self.manual_jump = False
        self.target_jump_ms = None

        index = self.subtitle_list.currentRow()
        if 0 <= index < len(self.subtitles):
            sub = self.subtitles[index]
            self.manual_jump = True
            self.target_jump_ms = sub.start.ordinal
            self.auto_play_paused_for_subtitle = False  # Reset pause flag when jumping

            state = self.player.get_state()
            if state in [vlc.State.Ended, vlc.State.Stopped]:
                self.player.stop()
                self.player.play()
                QTimer.singleShot(
                    200, lambda: self._seek_and_update_subtitle(index, sub)
                )
            else:
                self._seek_and_update_subtitle(index, sub)
            self.wait_for_seek(sub.start.ordinal)

    def _seek_and_update_subtitle(self, index, sub):
        self.player.set_time(sub.start.ordinal)
        self.subtitle_index = index
        self.subtitle_display.setText(sub.text.strip())
        self.subtitle_list.setCurrentRow(index)

    def seek_relative(self, offset_ms):
        current = self.player.get_time()
        self.player.set_time(max(0, current + offset_ms))

    def repeat_subtitle(self):
        if 0 <= self.subtitle_index < len(self.subtitles):
            self.auto_play_paused_for_subtitle = False  # Reset pause flag
            self.player.set_time(self.subtitles[self.subtitle_index].start.ordinal)
            self.subtitle_display.setText(
                self.subtitles[self.subtitle_index].text.strip()
            )

    def prev_subtitle(self):
        if self.subtitle_index > 0:
            self.subtitle_index -= 1
            self.auto_play_paused_for_subtitle = False  # Reset pause flag
            self.player.set_time(self.subtitles[self.subtitle_index].start.ordinal)
            self.subtitle_display.setText(
                self.subtitles[self.subtitle_index].text.strip()
            )
            self.subtitle_list.setCurrentRow(self.subtitle_index)

    def next_subtitle(self):
        if self.subtitle_index < len(self.subtitles) - 1:
            self.subtitle_index += 1
            self.auto_play_paused_for_subtitle = False  # Reset pause flag
            self.player.set_time(self.subtitles[self.subtitle_index].start.ordinal)
            self.subtitle_display.setText(
                self.subtitles[self.subtitle_index].text.strip()
            )
            self.subtitle_list.setCurrentRow(self.subtitle_index)

    def toggle_loop(self):
        self.loop_current = not self.loop_current
        self.loop_toggle.setText("🔁 Loop ON" if self.loop_current else "🔁 Loop OFF")
        self.loop_toggle.setStyleSheet(
            "font-size: 20px; font-weight: bold; padding: 12px 15px; background-color: #3CB371; color: white; border-radius: 6px;"
            if self.loop_current
            else "font-size: 20px; font-weight: bold; padding: 12px 15px; border-radius: 6px;"
        )

    def pause_after_loop_jump(self):
        """Pause the video after loop logic has jumped back to start of subtitle"""
        if self.is_playing:
            self.player.pause()
            self.is_playing = False
            self.play_pause_btn.setIcon(self.style().standardIcon(QStyle.SP_MediaPlay))

    def populate_mic_devices(self):
        """Populate microphone device selector with available input devices"""
        try:
            devices = sd.query_devices()
            self.available_devices = []
            bluetooth_devices = []
            other_devices = []
            
            for i, device in enumerate(devices):
                if device['max_input_channels'] > 0:
                    device_name = device['name']
                    device_info = {
                        'index': i,
                        'name': device_name,
                        'hostapi': device.get('hostapi', 0)
                    }
                    # Prioritize Bluetooth devices
                    if 'bluetooth' in device_name.lower() or 'bt' in device_name.lower():
                        bluetooth_devices.append(device_info)
                    else:
                        other_devices.append(device_info)
            
            # Add Bluetooth devices first, then others
            all_devices = bluetooth_devices + other_devices
            
            self.mic_device_selector.clear()
            for device_info in all_devices:
                self.mic_device_selector.addItem(device_info['name'], device_info['index'])
                self.available_devices.append(device_info)
            
            # Try to select Bluetooth device or default device
            if bluetooth_devices:
                # Select first Bluetooth device
                for i, device_info in enumerate(all_devices):
                    if device_info in bluetooth_devices:
                        self.mic_device_selector.setCurrentIndex(i)
                        self.mic_device_index = device_info['index']
                        break
            elif self.available_devices:
                # Select first available device
                self.mic_device_selector.setCurrentIndex(0)
                self.mic_device_index = self.available_devices[0]['index']
            
            if not self.available_devices:
                self.mic_device_selector.addItem("No input devices found")
                self.status_output.append("⚠️ No input devices found")
        except Exception as e:
            self.status_output.append(f"⚠️ Error listing devices: {str(e)}")
            self.mic_device_selector.addItem("Error loading devices")

    def on_mic_device_changed(self, index):
        """Handle microphone device selection change"""
        if index >= 0 and index < len(self.available_devices):
            self.mic_device_index = self.available_devices[index]['index']
            # Restart monitoring with new device
            self.stop_mic_monitoring()
            QTimer.singleShot(100, self.start_mic_monitoring)

    def start_mic_monitoring(self):
        """Start monitoring microphone input volume"""
        def audio_callback(indata, frames, time, status):
            if status:
                if status.input_overflow:
                    print("Input overflow")
                if status.input_underflow:
                    print("Input underflow")
            try:
                # Calculate RMS (Root Mean Square) volume
                # indata is a 2D array (frames, channels), take absolute value first
                volume = np.sqrt(np.mean(indata**2))
                # Convert to dB for better visualization
                # For float32, max is 1.0, so we scale appropriately
                if volume > 0:
                    # Convert to percentage with better scaling
                    # Normalize: typical speaking volume is around 0.01-0.1 in float32
                    volume_percent = min(100, int(volume * 2000))  # Increased scale factor
                else:
                    volume_percent = 0
                
                self.current_volume = volume_percent
                # Update UI in main thread
                QMetaObject.invokeMethod(
                    self,
                    "update_volume_bar",
                    Qt.QueuedConnection,
                    Q_ARG(int, volume_percent)
                )
            except Exception as e:
                print(f"Error in audio callback: {e}")
        
        try:
            # Refresh device list to ensure indices are current
            devices = sd.query_devices()
            
            # Use selected device or fallback to default
            if self.mic_device_index is None:
                # Try to get default input device
                input_device = sd.default.device[0] if sd.default.device[0] is not None else None
                
                if input_device is None:
                    # Try to find any input device
                    for i, device in enumerate(devices):
                        if device['max_input_channels'] > 0:
                            input_device = i
                            break
                
                if input_device is None:
                    self.status_output.append("⚠️ No input device found")
                    self.mic_monitoring_active = False
                    return
                
                self.mic_device_index = input_device
            
            # Validate device index
            if self.mic_device_index >= len(devices) or self.mic_device_index < 0:
                self.status_output.append(f"⚠️ Invalid device index: {self.mic_device_index}")
                # Try to find device by name from selector
                if hasattr(self, 'mic_device_selector') and self.mic_device_selector.currentIndex() >= 0:
                    current_text = self.mic_device_selector.currentText()
                    for i, device in enumerate(devices):
                        if device['name'] == current_text and device['max_input_channels'] > 0:
                            self.mic_device_index = i
                            break
                    else:
                        self.status_output.append("⚠️ Selected device not found, trying default")
                        self.mic_device_index = sd.default.device[0] if sd.default.device[0] is not None else None
            
            if self.mic_device_index is None or self.mic_device_index >= len(devices):
                self.status_output.append("⚠️ No valid input device found")
                self.mic_monitoring_active = False
                return
            
            device_info = devices[self.mic_device_index]
            device_name = device_info['name']
            
            # Check if device supports input
            if device_info['max_input_channels'] < 1:
                self.status_output.append(f"⚠️ Device '{device_name}' does not support input")
                self.mic_monitoring_active = False
                return
            
            # Use device's default samplerate or fallback to 44100
            samplerate = device_info.get('default_samplerate', 44100)
            if samplerate is None or samplerate <= 0:
                samplerate = 44100
            
            # Stop existing stream if any
            if self.mic_stream is not None:
                try:
                    self.mic_stream.stop()
                    self.mic_stream.close()
                except:
                    pass
                self.mic_stream = None
            
            # Try to open input stream with device's native settings
            try:
                self.mic_stream = sd.InputStream(
                    device=self.mic_device_index,
                    samplerate=samplerate,
                    channels=1,
                    dtype='float32',
                    blocksize=1024,
                    callback=audio_callback,
                    latency='high'  # Use 'high' for better compatibility
                )
                self.mic_stream.start()
                self.mic_monitoring_active = True
                self.status_output.append(f"✅ Microphone monitoring started (device: {device_name}, {int(samplerate)}Hz)")
            except Exception as stream_error:
                # If opening with device's samplerate fails, try with 44100
                if samplerate != 44100:
                    try:
                        self.status_output.append(f"⚠️ Trying with 44100Hz instead of {int(samplerate)}Hz...")
                        self.mic_stream = sd.InputStream(
                            device=self.mic_device_index,
                            samplerate=44100,
                            channels=1,
                            dtype='float32',
                            blocksize=1024,
                            callback=audio_callback,
                            latency='high'
                        )
                        self.mic_stream.start()
                        self.mic_monitoring_active = True
                        self.status_output.append(f"✅ Microphone monitoring started (device: {device_name}, 44100Hz)")
                    except Exception as e2:
                        raise stream_error  # Raise original error
                else:
                    raise stream_error
                    
        except Exception as e:
            error_msg = f"⚠️ Microphone monitoring error: {str(e)}"
            self.status_output.append(error_msg)
            print(error_msg)
            import traceback
            traceback.print_exc()
            self.mic_monitoring_active = False
            
            # Try to fallback to default device if selected device failed
            if self.mic_device_index is not None:
                try:
                    default_device = sd.default.device[0]
                    if default_device is not None and default_device != self.mic_device_index:
                        self.status_output.append(f"⚠️ Trying default device instead...")
                        self.mic_device_index = default_device
                        QTimer.singleShot(500, self.start_mic_monitoring)
                except:
                    pass

    def stop_mic_monitoring(self):
        """Stop monitoring microphone input"""
        if self.mic_stream is not None:
            try:
                self.mic_stream.stop()
                self.mic_stream.close()
            except:
                pass
            self.mic_stream = None
        self.mic_monitoring_active = False
        self.current_volume = 0
        if hasattr(self, 'mic_volume_bar'):
            self.mic_volume_bar.setValue(0)

    @pyqtSlot(int)
    def update_volume_bar(self, volume_percent):
        """Update the microphone volume bar (called from audio callback)"""
        if hasattr(self, 'mic_volume_bar'):
            self.mic_volume_bar.setValue(volume_percent)
            # Update color based on volume level
            if volume_percent < 30:
                # Low volume - green
                color = "#4CAF50"
            elif volume_percent < 70:
                # Medium volume - yellow
                color = "#FFC107"
            else:
                # High volume - red
                color = "#F44336"
            
            # Update style with dynamic color
            self.mic_volume_bar.setStyleSheet(f"""
                QProgressBar {{
                    border: 2px solid #555;
                    border-radius: 5px;
                    text-align: center;
                    font-size: 11px;
                    font-weight: bold;
                    height: 20px;
                }}
                QProgressBar::chunk {{
                    background: {color};
                    border-radius: 3px;
                }}
            """)

    def closeEvent(self, event):
        self.stop_mic_monitoring()
        self.settings.setValue("geometry", self.saveGeometry())

    # -------------------
    # THEME: Dark (always on)
    # -------------------
    def apply_theme(self):
        """Apply dark mode palette globally (no toggle)."""
        app = QApplication.instance()
        app.setStyle("Fusion")
        palette = QPalette()
        palette.setColor(QPalette.Window, QColor(30, 30, 30))
        palette.setColor(QPalette.WindowText, Qt.white)
        palette.setColor(QPalette.Base, QColor(25, 25, 25))
        palette.setColor(QPalette.AlternateBase, QColor(45, 45, 45))
        palette.setColor(QPalette.ToolTipBase, Qt.white)
        palette.setColor(QPalette.ToolTipText, Qt.white)
        palette.setColor(QPalette.Text, Qt.white)
        palette.setColor(QPalette.Button, QColor(53, 53, 53))
        palette.setColor(QPalette.ButtonText, Qt.white)
        palette.setColor(QPalette.BrightText, Qt.red)
        palette.setColor(QPalette.Highlight, QColor(42, 130, 218))
        palette.setColor(QPalette.HighlightedText, Qt.white)
        app.setPalette(palette)
        self.video_frame.setStyleSheet("background-color: black;")

    def _auto_scroll_status_output(self):
        # Only scroll when enabled
        if (
            hasattr(self, "auto_scroll_checkbox")
            and self.auto_scroll_checkbox.isChecked()
        ):
            # Smooth + reliable: use the scrollbar
            sb = self.status_output.verticalScrollBar()
            if sb is not None:
                sb.setValue(sb.maximum())
            else:
                # Fallback: move cursor to the end
                cursor = self.status_output.textCursor()
                cursor.movePosition(QTextCursor.End)
                self.status_output.setTextCursor(cursor)
                self.status_output.ensureCursorVisible()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = ShadowingApp()
    win.show()
    app.installEventFilter(win)
    sys.exit(app.exec_())
