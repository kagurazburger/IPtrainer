# Live Memory Trainer - AI Agent Instructions

## Architecture Overview
- **Frontend**: React/TypeScript app (Vite) on port 5173, manages UI state for decks, flashcards, and user sessions
- **Backend**: FastAPI Python service on port 8000, handles AI processing (ASR, LLM, TTS, OCR) and deck I/O
- **Services**: `geminiService.ts` for Google Gemini API calls; `localService.ts` for backend HTTP requests
- **Data Flow**: Decks loaded from `decks/` JSON files → processed via AI services → flashcards rendered in components

## Key Components
- `App.tsx`: Main state manager with modes (LIBRARY, flashcard views)
- `components/`: Flashcard.tsx, MultipleChoice.tsx, OverviewMode.tsx for different study modes
- `backend/main.py`: FastAPI app with endpoints like `/api/evaluate`, `/api/transcribe`, `/api/generate-cards`
- `types.ts`: Core interfaces (FlashcardData, Deck, User)

## Developer Workflows
- **Start Development**: Run `start.bat` (Windows) or `start.sh` (Linux/Mac) - sets up Python venv, installs deps, starts backend (uvicorn) and frontend (Vite)
- **Backend Config**: Edit `backend/config.json` for model paths (Whisper, Llama, Janus) and API keys (Volc ASR/LLM)
- **Frontend Build**: `npm run dev` for development, `npm run build` for production
- **Testing**: Run `python backend/test_apis.py` to verify backend endpoints; no formal test suite for frontend

## Project Conventions
- **Deck Format**: JSON with `{"cards": [{"front": "...", "back": "..."}]}` structure (see `decks/0130-Gintama.json`)
- **Error Handling**: Services use try/catch with specific error types (quota exceeded, network failures)
- **AI Integration**: Prefer local backend for speech/LLM; use Gemini for card generation/visuals
- **State Management**: React hooks in App.tsx; localStorage for user sessions
- **Async Patterns**: All API calls are async/await; backend uses asyncio for WebSocket ASR

## Integration Points
- **Gemini API**: Card generation from prompts (`generateCardsFromPrompt` in geminiService.ts)
- **Volc Services**: ASR transcription, LLM evaluation, TTS synthesis (configured in backend/config.json)
- **Local Models**: Whisper for offline ASR, Llama CLI for local LLM, Janus for image generation
- **Tunnel Access**: Use `start_with_tunnel.bat` with ngrok for mobile testing (updates .env.local automatically)

## Common Patterns
- **Adding Features**: Update types.ts first, then services, then components
- **Deck Processing**: Text input → `process-text` endpoint → AI-generated cards → save to `output/` folder
- **Speech Features**: ASR via WebSocket in backend, TTS via `/api/tts` endpoint, language configurable in user settings
- **File Handling**: Decks loaded from filesystem; use `saveDeckToFile` for persistence</content>
<parameter name="filePath">e:\AppDev\live-memory-trainer-v8.0\.github\copilot-instructions.md