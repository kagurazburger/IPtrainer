
export enum Section {
  IDENTITY = 'IDENTITY',
  APPEARANCE = 'APPEARANCE',
  PERSONALITY = 'PERSONALITY',
  NARRATIVE = 'NARRATIVE',
  SYMBOLISM = 'SYMBOLISM',
  ORIGIN = 'ORIGIN',
  TABOO = 'TABOO',
  SENSORY = 'SENSORY',
  VIBE = 'VIBE',
  GIFTING = 'GIFTING',
  VALUE = 'VALUE',
  URGENCY = 'URGENCY',
}

/** Style triplet for section badges (Tailwind classes). */
export interface SectionStyle {
  color: string;
  bg: string;
  border: string;
}

export interface FlashcardData {
  id: string;
  ip: string;
  section: string;
  question: string;
  hint: string;
  text: string;
  image: string;
  outline?: string; // Optional outline summary for the document
}

export interface Deck {
  id: string;
  title: string;
  cards: FlashcardData[];
  createdAt: number;
}

export interface VolcanoCredentials {
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface AIPreferences {
  taskA_Engine: 'gemini-3-pro-preview' | 'gemini-3-flash-preview';
  taskB_Engine: 'GEMINI_SEARCH' | 'VOLCANO_SEARCH';
}

export interface OCRConfig {
  provider: 'local' | 'cloud';
  apiKey?: string;
  endpoint?: string;
  enabled: boolean;
}

export interface LLMConfig {
  provider: 'openai' | 'gemini' | 'volcano';
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  volcanoApiKey?: string;
  volcanoModel?: string;
  enabled: boolean;
}

export interface WhisperConfig {
  provider: 'local' | 'openai' | 'cloud';
  apiKey?: string;
  openaiApiKey?: string;
  endpoint?: string;
  model?: string;
  language?: string;
  enabled: boolean;
}

export interface APIConfig {
  ocr: OCRConfig;
  llm: LLMConfig;
  whisper: WhisperConfig;
}

export interface User {
  id: string;
  username?: string;
  password?: string;
  syncKey: string;
  lastSynced: number;
  volcano?: VolcanoCredentials;
  preferences?: AIPreferences;
  apiConfig?: APIConfig;
  transcriptionLanguage?: string; // e.g., "en-US", "zh-CN", or empty for auto-detect
}

export interface BreadObject {
  title: string;
  originalText: string;
  flashcards: Array<{ q: string; a: string }>;
  chatHistory: Array<{ role: string; content: string }>; // Assuming chat history structure
  masteryScore: number;
}

export interface CloudPayload {
  decks: Deck[];
  userConfig: {
    volcano?: VolcanoCredentials;
    preferences?: AIPreferences;
    transcriptionLanguage?: string;
  };
  updatedAt: number;
}

export type AppMode = 'LIBRARY' | 'STUDY_MCQ' | 'REVIEW_FLASHCARDS' | 'AI_ARCHITECT' | 'OVERVIEW_MODE' | 'TEXT_PROCESSOR';

export const SECTION_CONFIG: Record<Section, SectionStyle> = {
  [Section.IDENTITY]: { color: 'text-blue-400', bg: 'bg-blue-900/20', border: 'border-blue-500/50' },
  [Section.APPEARANCE]: { color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-500/50' },
  [Section.PERSONALITY]: { color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-500/50' },
  [Section.NARRATIVE]: { color: 'text-purple-400', bg: 'bg-purple-900/20', border: 'border-purple-500/50' },
  [Section.SYMBOLISM]: { color: 'text-indigo-400', bg: 'bg-indigo-900/20', border: 'border-indigo-500/50' },
  [Section.ORIGIN]: { color: 'text-slate-400', bg: 'bg-slate-900/20', border: 'border-slate-500/50' },
  [Section.TABOO]: { color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-500' },
  [Section.SENSORY]: { color: 'text-cyan-400', bg: 'bg-cyan-900/20', border: 'border-cyan-500/50' },
  [Section.VIBE]: { color: 'text-pink-400', bg: 'bg-pink-900/20', border: 'border-pink-500/50' },
  [Section.GIFTING]: { color: 'text-rose-400', bg: 'bg-rose-900/20', border: 'border-rose-500/50' },
  [Section.VALUE]: { color: 'text-lime-400', bg: 'bg-lime-900/20', border: 'border-lime-500/50' },
  [Section.URGENCY]: { color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-500/50' },
};

/** Fallback palette for unknown section names (hash → consistent color). */
const FALLBACK_PALETTE: SectionStyle[] = [
  { color: 'text-gray-400', bg: 'bg-gray-900/20', border: 'border-gray-500/50' },
  { color: 'text-teal-400', bg: 'bg-teal-900/20', border: 'border-teal-500/50' },
  { color: 'text-fuchsia-400', bg: 'bg-fuchsia-900/20', border: 'border-fuchsia-500/50' },
  { color: 'text-sky-400', bg: 'bg-sky-900/20', border: 'border-sky-500/50' },
  { color: 'text-violet-400', bg: 'bg-violet-900/20', border: 'border-violet-500/50' },
  { color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-500/50' },
];

function hashSection(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Returns style for any section string. Known sections use SECTION_CONFIG;
 * unknown sections get a consistent color from the section name hash.
 */
export function getSectionStyle(section: string): SectionStyle {
  const known = (SECTION_CONFIG as Record<string, SectionStyle | undefined>)[section];
  if (known) return known;
  return FALLBACK_PALETTE[hashSection(section) % FALLBACK_PALETTE.length];
}
