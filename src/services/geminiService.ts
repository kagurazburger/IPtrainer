
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { FlashcardData, Section, VolcanoCredentials, AIPreferences } from "../types";

const getAI = () => {
  const apiKey = import.meta.env.VITE_API_KEY || (window as any).aistudio?.apiKey;
  if (!apiKey) {
    throw new Error("API_KEY not configured. Please set VITE_API_KEY in .env or use AI Studio key selector.");
  }
  return new GoogleGenAI({ apiKey });
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Universal retry wrapper with exponential backoff
 */
const callWithRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errorStr = JSON.stringify(err);
      if ((errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED")) && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1500; 
        console.warn(`[AI Engine] Quota limit hit. Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

/**
 * Task C: Neural Voice Synthesis (TTS)
 */
export const generateSpeechData = async (text: string): Promise<string | undefined> => {
  return callWithRetry(async () => {
    const ai = getAI();
    // Use the latest TTS model as per guidelines
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this clearly: ${text}` }] }],
      config: {
        // Correct modality as per instructions
        responseModalities: ["AUDIO" as any], 
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  });
};

/**
 * Task B: Visual Retrieval via Third-Party Search (e.g., Volcano/Doubao)
 */
const searchWithVolcano = async (card: FlashcardData, config: VolcanoCredentials): Promise<string | null> => {
  if (!config.apiKey || !config.model) return null;
  
  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'You are a visual research assistant. Return ONLY the JSON: {"imageUrl": "..."}' },
          { role: 'user', content: `Find a clear product image of the designer toy: ${card.ip} (${card.section}: ${card.question})` }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    try {
        const result = JSON.parse(data.choices[0].message.content);
        return result.imageUrl || null;
    } catch {
        return null;
    }
  } catch (err) {
    console.error("[Task B] Volcano search failed:", err);
    return null;
  }
};

/**
 * Task A: Structured Knowledge Architect
 */
export const generateCardsFromContent = async (
  textPrompt: string,
  model: string = "gemini-3-pro-preview",
  files: { mimeType: string; data: string }[] = []
): Promise<FlashcardData[]> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const parts: any[] = [];
    
    files.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    });

    const systemInstruction = `Role: You are the Data Architect for the "Live Memory Trainer" app. Your goal is to extract structured knowledge from user-uploaded images or text about Designer Toys/IPs (e.g., Pop Mart).

Objective: Convert raw information into a strict JSON format compatible with the app's retrieval practice system.

1. The Data Schema (Strict JSON)
Output a JSON Array containing objects with these specific fields:
{
"ip": "Name of the Character/Series (e.g., LABUBU)",
"section": "Category (See below)",
"question": "A specific question to trigger recall (Cued Recall)",
"hint": "A subtle clue, 1-3 words (No spoilers)",
"text": "The official fact/answer. Keep it concise but accurate.",
"image": ""
}
Note: Leave the "image" field empty (or put a placeholder URL), the user will fill it locally.

2. Section Categories (Classify strictly)
IDENTITY: What is it? (Race, Job, Role, Species)
APPEARANCE: Visual features (Colors, Accessories, Iconic traits)
PERSONALITY: Inner character (Shy, Brave, Naughty)
NARRATIVE: Backstory, Relationships, World-building
SYMBOLISM: Deeper meaning, Philosophy, Slogan
ORIGIN: Artist background, Inspiration source
TABOO: What NOT to say, Gender rules, Sensitive topics (IMPORTANT)

3. Rules for Extraction
Granularity: Do not paste a wall of text. Split information into atomic facts. One fact = One Card.
Accuracy: Only use information present in the source. Do not hallucinate.
Taboos: If the text says "Notice" or "Avoid", mark it as TABOO section immediately.
Language: English only.
Format: Output ONLY the JSON code block.`;

    parts.push({ text: `Input Context/Prompt: ${textPrompt}` });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ip: { type: Type.STRING },
              section: { type: Type.STRING },
              question: { type: Type.STRING },
              hint: { type: Type.STRING },
              text: { type: Type.STRING },
            },
            required: ["ip", "section", "question", "hint", "text"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  });
};

/**
 * Task B: Visual Anchor Retrieval (Web Image Search)
 */
export const generateVisualForCard = async (
  card: FlashcardData, 
  volcanoConfig?: VolcanoCredentials,
  prefs?: AIPreferences
): Promise<string | null> => {
  
  const selectedEngine = prefs?.taskB_Engine || 'GEMINI_SEARCH';

  if (selectedEngine === 'VOLCANO_SEARCH' && volcanoConfig?.enabled) {
     const url = await searchWithVolcano(card, volcanoConfig);
     if (url) return url;
  }

  return callWithRetry(async () => {
    const ai = getAI();
    
    const prompt = `Find a high-quality product image URL for the designer toy "${card.ip}" related to "${card.question}". 
    Use the googleSearch tool to find a direct URL. 
    Return ONLY JSON: {"imageUrl": "string"}`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview', // Required for googleSearch
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    try {
        const result = JSON.parse(response.text || '{}');
        return (result.imageUrl?.startsWith('http')) ? result.imageUrl : null;
    } catch {
        return null;
    }
  }, 2);
};
