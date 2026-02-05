/**
 * Local backend client
 * Replaces Google AI Studio calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

  /** Check backend availability */
export async function checkBackend(): Promise<{ ok: boolean; message?: string; details?: any }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, message: `Backend returned ${res.status}` };
    const data = await res.json();
    if (data.status === 'healthy') return { ok: true };
    
    const missing: string[] = data.missing || [];
    const checks = data.checks || {};
    const missingFromChecks = Object.keys(checks).filter((k) => !checks[k]);
    const listKeys = missing.length ? missing : missingFromChecks;
    
    const names: Record<string, string> = {
      volc_asr_app_key: 'Volc ASR App Key',
      volc_asr_access_token: 'Volc ASR Access Token',
      volc_asr_resource_id: 'Volc ASR Resource ID',
      volc_llm_api_key: 'Volc LLM API Key',
      volc_llm_model: 'Volc LLM Model'
    };
    const list = listKeys.length
      ? listKeys.map((k: string) => names[k] || k).join(', ')
      : (data.message || 'Whisper/Llama paths');
    
    return { 
      ok: false, 
      message: `Missing: ${list}. Update backend/config.json and restart start.bat.`,
      details: data
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: 'Cannot connect to backend. If running locally, ensure the backend service is available.' };
  }
}

export interface TranscriptionResponse {
  transcript: string;
}

export interface EvaluationResponse {
  feedback: string;
  user_answer: string;
  correct_answer: string;
}

export interface TTSResponse {
  text: string;
  audio_url: string | null;
  use_web_speech: boolean;
}

export interface DefaultDeckResponse {
  cards: any[];
  source_path: string;
}

export interface DefaultDecksResponse {
  decks: Array<{
    title: string;
    cards: any[];
    source_path: string;
  }>;
}

/**
 * Speech-to-text (backend)
 */
export async function transcribeAudio(audioBlob: Blob, language?: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    if (language) {
      formData.append('language', language);
    }

    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = await response.json();
        detail = data?.detail || JSON.stringify(data);
      } catch {
        try {
          detail = await response.text();
        } catch {
          // ignore
        }
      }
      throw new Error(`Transcription failed: ${detail}`);
    }

    const data: TranscriptionResponse = await response.json();
    return data.transcript;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

/**
 * Evaluate answer
 */
export async function evaluateAnswer(
  userAnswer: string,
  correctAnswer: string,
  question: string,
  ip?: string,
  section?: string
): Promise<EvaluationResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_answer: userAnswer,
        correct_answer: correctAnswer,
        question: question,
        ip: ip,
        section: section,
      }),
    });

    if (!response.ok) {
      throw new Error(`Evaluation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Evaluation error:', error);
    throw error;
  }
}

/**
 * Text-to-speech (Web Speech API or backend)
 */
export async function textToSpeech(text: string): Promise<void> {
  try {
    // Prefer Web Speech API (browser-native)
    if ('speechSynthesis' in window) {
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => resolve();
        utterance.onerror = (error) => reject(error);

        window.speechSynthesis.speak(utterance);
      });
    }

    // Fallback to backend TTS if Web Speech API is unavailable
    const response = await fetch(`${API_BASE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`TTS failed: ${response.statusText}`);
    }

    const data: TTSResponse = await response.json();
    if (data.audio_url) {
      // If there is an audio URL, play it
      const audio = new Audio(data.audio_url);
      await audio.play();
    }
  } catch (error) {
    console.error('TTS error:', error);
    throw error;
  }
}

/**
 * Stop speech playback
 */
export function stopSpeech(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function loadDefaultDecks(): Promise<DefaultDecksResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/default-decks`, { 
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = await response.json();
        detail = data?.detail || JSON.stringify(data);
      } catch {
        detail = await response.text();
      }
      throw new Error(`Default decks load failed: ${detail}`);
    }
    return await response.json();
  } catch (error) {
    // Log error for debugging
    console.error('Failed to load default decks from backend:', error);
    console.error('API_BASE_URL:', API_BASE_URL);
    throw error;
  }
}

export async function saveDeckToFile(title: string, cards: any[]): Promise<{ success: boolean; path: string; filename: string }> {
  const response = await fetch(`${API_BASE_URL}/api/save-deck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, cards }),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data?.detail || JSON.stringify(data);
    } catch {
      detail = await response.text();
    }
    throw new Error(`Save deck failed: ${detail}`);
  }

  return await response.json();
}

export async function ocrImage(imageBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'image.jpg');

  const response = await fetch(`${API_BASE_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data?.detail || JSON.stringify(data);
    } catch {
      detail = await response.text();
    }
    throw new Error(`OCR failed: ${detail}`);
  }

  const data = await response.json();
  return data.text || '';
}

export async function generateCardsFromPrompt(prompt: string, maxTokens: number = 2000): Promise<any[]> {
  console.log(`[generateCardsFromPrompt] Starting with prompt length: ${prompt.length}, maxTokens: ${maxTokens}`);
  const controller = new AbortController();
  // Increase timeout for longer texts (120 seconds)
  const timeoutMs = prompt.length > 2000 ? 120000 : 90000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.log(`[generateCardsFromPrompt] Sending request to ${API_BASE_URL}/api/generate-cards`);
    const response = await fetch(`${API_BASE_URL}/api/generate-cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, max_tokens: maxTokens }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log(`[generateCardsFromPrompt] Response status: ${response.status}`);

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = await response.json();
        detail = data?.detail || JSON.stringify(data);
        console.error(`[generateCardsFromPrompt] Error response:`, data);
      } catch {
        detail = await response.text();
        console.error(`[generateCardsFromPrompt] Error text:`, detail);
      }
      throw new Error(`Card generation failed: ${detail}`);
    }

    const data = await response.json();
    console.log(`[generateCardsFromPrompt] Success, received ${data.cards?.length || 0} cards`);
    return data.cards || [];
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[generateCardsFromPrompt] Exception:`, error);
    if (error.name === 'AbortError') {
      throw new Error(`Card generation timed out after ${timeoutMs / 1000} seconds. The text might be too long. Try splitting it into smaller parts or check your network connection.`);
    }
    throw error;
  }
}

export interface ChatDecksDeckPayload {
  title: string;
  cards: Array<{ ip?: string; section?: string; question?: string; hint?: string; text?: string; image?: string }>;
}

export async function chatWithDecks(
  query: string,
  decks: ChatDecksDeckPayload[]
): Promise<{ reply: string }> {
  const response = await fetch(`${API_BASE_URL}/api/chat-decks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, decks }),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data?.detail || JSON.stringify(data);
    } catch {
      detail = await response.text();
    }
    throw new Error(`卡牌助手请求失败：${detail}`);
  }
  return response.json();
}
