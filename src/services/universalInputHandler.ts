import { BreadObject } from '../types';
import { WhisperConfig } from '../types';

export interface InputResult {
  success: boolean;
  bread?: BreadObject;
  error?: string;
}

export class UniversalInputHandler {
  private static async extractTextFromPDF(file: File): Promise<string> {
    const { default: pdfParse } = await import('pdf-parse');
    const arrayBuffer = await file.arrayBuffer();
    const data = await pdfParse(new Uint8Array(arrayBuffer));
    return data.text;
  }

  private static async extractTextFromDOCX(file: File): Promise<string> {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  private static async parseJSONFlashcards(file: File): Promise<Array<{ q: string; a: string }>> {
    const text = await file.text();
    const data = JSON.parse(text);

    // 支持多种JSON格式
    if (Array.isArray(data)) {
      return data.map(item => ({
        q: item.question || item.q || item.front || '',
        a: item.answer || item.a || item.back || ''
      }));
    }

    if (data.cards && Array.isArray(data.cards)) {
      return data.cards.map((card: any) => ({
        q: card.question || card.q || card.front || '',
        a: card.answer || card.a || card.back || ''
      }));
    }

    if (data.flashcards && Array.isArray(data.flashcards)) {
      return data.flashcards;
    }

    throw new Error('Unsupported JSON format for flashcards');
  }

  private static async transcribeAudioVideo(file: File, config?: WhisperConfig): Promise<string> {
    const provider = config?.provider || 'local';

    if (provider === 'local') {
      // 使用本地后端API
      const formData = new FormData();
      formData.append('file', file);

      const API_BASE = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.text || '';
    }

    if (provider === 'openai') {
      // 使用OpenAI Whisper API
      if (!config?.openaiApiKey) {
        throw new Error('OpenAI API key not configured for Whisper');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-1');
      if (config.language && config.language !== 'auto') {
        formData.append('language', config.language);
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`OpenAI Whisper API failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.text || '';
    }

    if (provider === 'cloud') {
      // 使用自定义云端API
      if (!config?.apiKey || !config?.endpoint) {
        throw new Error('Cloud API key and endpoint not configured');
      }

      const formData = new FormData();
      formData.append('file', file);
      if (config.language) {
        formData.append('language', config.language);
      }

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Cloud transcription API failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.text || result.transcription || '';
    }

    throw new Error(`Unsupported Whisper provider: ${provider}`);
  }

  static async processInput(
    input: string | File,
    currentBread: BreadObject | null,
    title?: string,
    whisperConfig?: WhisperConfig
  ): Promise<InputResult> {
    try {
      let newBread: BreadObject;

      if (currentBread) {
        newBread = { ...currentBread };
      } else {
        newBread = {
          title: title || '新记忆面包',
          originalText: '',
          flashcards: [],
          chatHistory: [],
          masteryScore: 0
        };
      }

      if (typeof input === 'string') {
        // 文本路径
        newBread.originalText = input;
        return { success: true, bread: newBread };
      }

      if (!(input instanceof File)) {
        return { success: false, error: 'Invalid input type' };
      }

      const fileName = input.name.toLowerCase();
      const fileExtension = fileName.split('.').pop() || '';

      if (fileExtension === 'json') {
        // JSON路径 - 直接赋值给flashcards
        try {
          newBread.flashcards = await this.parseJSONFlashcards(input);
          return { success: true, bread: newBread };
        } catch (error) {
          return { success: false, error: `JSON parsing failed: ${(error as Error).message}` };
        }
      }

      if (fileExtension === 'pdf') {
        // 文档路径 - PDF
        try {
          const text = await this.extractTextFromPDF(input);
          newBread.originalText = text;
          return { success: true, bread: newBread };
        } catch (error) {
          return { success: false, error: `PDF processing failed: ${(error as Error).message}` };
        }
      }

      if (fileExtension === 'docx') {
        // 文档路径 - DOCX
        try {
          const text = await this.extractTextFromDOCX(input);
          newBread.originalText = text;
          return { success: true, bread: newBread };
        } catch (error) {
          return { success: false, error: `DOCX processing failed: ${(error as Error).message}` };
        }
      }

      // 检查是否是音视频文件
      const audioVideoExtensions = ['mp3', 'wav', 'mp4', 'avi', 'mov', 'm4a', 'webm'];
      if (audioVideoExtensions.includes(fileExtension)) {
        // 音视频路径 - 使用Whisper转录
        try {
          const transcribedText = await this.transcribeAudioVideo(input, whisperConfig);
          newBread.originalText = transcribedText;
          return { success: true, bread: newBread };
        } catch (error) {
          return { success: false, error: `Transcription failed: ${(error as Error).message}` };
        }
      }

      // 支持其他文本文件
      const textExtensions = ['txt', 'md', 'markdown', 'srt', 'text'];
      if (textExtensions.includes(fileExtension)) {
        try {
          const text = await input.text();
          newBread.originalText = text;
          return { success: true, bread: newBread };
        } catch (error) {
          return { success: false, error: `Text file reading failed: ${(error as Error).message}` };
        }
      }

      return { success: false, error: `Unsupported file type: ${fileExtension}` };

    } catch (error) {
      return { success: false, error: `Processing failed: ${(error as Error).message}` };
    }
  }
}