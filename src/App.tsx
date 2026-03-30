
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FlashcardData, AppMode, Deck, User, VolcanoCredentials, AIPreferences, CloudPayload, BreadObject, APIConfig } from './types';
import { DEFAULT_CARDS, Icons } from './constants';
import Flashcard from './components/Flashcard';
import MultipleChoice from './components/MultipleChoice';
import AuthModal from './components/AuthModal';
import UserAuthModal from './components/UserAuthModal';
import DeckChatModal from './components/DeckChatModal';
import IpCatalogueModal from './components/IpCatalogueModal';
import SettingsModal from './components/SettingsModal';
import { generateCardsFromContent, generateVisualForCard } from './services/geminiService';
import { loadDefaultDecks, saveDeckToFileWithOptions, ocrImage, generateCardsFromPrompt, uploadCardImage, uploadIpImage } from './services/localService';
import { UniversalInputHandler, InputResult } from './services/universalInputHandler';
import { generateFlashcards } from './services/openaiService';
import { getCurrentUser, updateUserApiConfig, logoutUser } from './services/userService';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const CLOUD_STORAGE_PROXY_URL = `${API_BASE_URL}/cloud/`;
const CLOUD_STORAGE_URL = "https://kvdb.io/A8vjB6vN5n9z2z2z2z2z2z/";

const cloudFetch = async (key: string, init?: RequestInit): Promise<Response> => {
  const normalizedKey = key.trim();
  const encodedKey = encodeURIComponent(normalizedKey);

  try {
    const proxyResponse = await fetch(`${CLOUD_STORAGE_PROXY_URL}${encodedKey}`, init);
    if (!proxyResponse.ok) {
      return await fetch(`${CLOUD_STORAGE_URL}${normalizedKey}`, init);
    }
    return proxyResponse;
  } catch {
    return await fetch(`${CLOUD_STORAGE_URL}${normalizedKey}`, init);
  }
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [mode, setMode] = useState<AppMode>('LIBRARY');
  const [sessionCards, setSessionCards] = useState<FlashcardData[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [visualizingIds, setVisualizingIds] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<{ message: string; isQuota: boolean } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [currentBread, setCurrentBread] = useState<BreadObject | null>(null);
  const [textInput, setTextInput] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<APIConfig | undefined>(undefined);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserAuthModalOpen, setIsUserAuthModalOpen] = useState(false);
  const [isDeckChatOpen, setIsDeckChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIpCatalogueOpen, setIsIpCatalogueOpen] = useState(false);
  const [ipCatalogueDeckId, setIpCatalogueDeckId] = useState<string | null>(null);

  // For robust deletion without browser confirm blocks
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  const isInitialMount = useRef(true);
  const jsonImportInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const normalizeCards = (rawCards: any[]): FlashcardData[] => {
    const stamp = Date.now();
    return rawCards.map((c, i) => ({
      id: c.id || `card-${stamp}-${i}`,
      ip: c.ip ?? '',
      section: typeof c.section === 'string' ? c.section : String(c.section ?? ''),
      question: c.question ?? '',
      hint: c.hint ?? '',
      text: c.text ?? '',
      image: c.image ?? '',
      ipImage: c.ipImage ?? c.ip_image ?? ''
    }));
  };

  useEffect(() => {
    // 首先检查当前登录用户
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      console.log('User logged in:', currentUser.username);

      // 如果用户有API配置，加载它
      if (currentUser.apiConfig) {
        console.log('Loading user API config:', currentUser.apiConfig);
        setApiConfig(currentUser.apiConfig);
      }

      // 加载云端数据
      pullFromCloud(currentUser.syncKey);
    } else {
      // 没有用户登录，检查是否有独立的API配置
      const savedAPIConfig = localStorage.getItem('api_config');
      if (savedAPIConfig) {
        try {
          const apiConfig = JSON.parse(savedAPIConfig);
          console.log('Loaded standalone API config from localStorage:', apiConfig);
          setApiConfig(apiConfig);
        } catch (error) {
          console.error('Failed to load standalone API config:', error);
        }
      }
    }

    // 加载卡组数据（与用户状态无关）
    loadDefaultDecks()
      .then((data) => {
        const loadedDecks: Deck[] = data.decks.map((deck, idx) => ({
          id: `deck-${Date.now()}-${idx}`,
          title: deck.title,
          cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
          createdAt: Date.now(),
          sourcePath: deck.source_path
        }));
        if (loadedDecks.length > 0) {
          setDecks(loadedDecks);
        } else {
          // Only use default cards if no JSON files found
          setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
        }
      })
      .catch((err) => {
        // Local folder not accessible (e.g., on mobile), use default cards
        console.log("Local folder not accessible, using default cards:", err);
        setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
      });
  }, []);

  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    localStorage.setItem('live_memory_trainer_v8', JSON.stringify(decks));
    if (user) {
      localStorage.setItem('trainer_user_session', JSON.stringify(user));
      // Auto-sync to cloud when decks change (if user is logged in)
      if (user.syncKey && decks.length > 0) {
        pushToCloud(user.syncKey, decks, user.volcano, user.preferences, user.transcriptionLanguage);
      }
    }
  }, [decks, user]);

  useEffect(() => {
    if (!isIpCatalogueOpen) return;
    if (!ipCatalogueDeckId && decks.length > 0) {
      setIpCatalogueDeckId(decks[0].id);
    }
  }, [isIpCatalogueOpen, ipCatalogueDeckId, decks]);

  const handleKeySelect = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setGlobalError(null);
    }
  };

  const handleGenerateKey = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) key += '-';
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const newUser: User = { 
      id: `u-${Date.now()}`, 
      username: '',
      password: '',
      syncKey: key, 
      lastSynced: Date.now(), 
      preferences: { taskA_Engine: 'gemini-3-pro-preview', taskB_Engine: 'GEMINI_SEARCH' }
    };
    
    // Optimistic Update
    setUser(newUser);
    
    try {
      await pushToCloud(key, decks, newUser.volcano, newUser.preferences, newUser.transcriptionLanguage);
    } catch (e) {
      console.error("Cloud Profile Creation failed, but local profile active.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateConfig = (volcano: VolcanoCredentials, preferences: AIPreferences, transcriptionLanguage?: string) => {
    if (!user) return;
    const updatedUser = { ...user, volcano, preferences, transcriptionLanguage, lastSynced: Date.now() };
    setUser(updatedUser);
    pushToCloud(user.syncKey, decks, volcano, preferences, transcriptionLanguage);
  };

  const handleSaveAPIConfig = (newApiConfig: APIConfig) => {
    console.log('Saving API config:', newApiConfig);
    setApiConfig(newApiConfig);

    // 如果用户已登录，更新用户配置
    if (user) {
      console.log('Updating user API config');
      updateUserApiConfig(user.id, newApiConfig);
      const updatedUser = { ...user, apiConfig: newApiConfig };
      setUser(updatedUser);
    } else {
      // 没有用户登录，保存到独立的本地存储
      console.log('Saving standalone API config');
      localStorage.setItem('api_config', JSON.stringify(newApiConfig));
    }

    // 如果用户已登录，也更新用户配置
    if (user) {
      const updatedUser = { ...user, apiConfig: newApiConfig, lastSynced: Date.now() };
      setUser(updatedUser);
      localStorage.setItem('trainer_user_session', JSON.stringify(updatedUser));

      // 如果有云端同步，也可以推送到云端
      if (user.syncKey) {
        pushToCloud(user.syncKey, decks, user.volcano, user.preferences, user.transcriptionLanguage);
      }
    }
  };

  const handleUserLogin = (loggedInUser: User) => {
    console.log('User logged in:', loggedInUser.username);
    setUser(loggedInUser);

    // 加载用户的API配置
    if (loggedInUser.apiConfig) {
      console.log('Loading user API config');
      setApiConfig(loggedInUser.apiConfig);
    } else {
      // 用户没有API配置，清除当前配置
      setApiConfig(undefined);
      localStorage.removeItem('api_config');
    }

    // 加载云端数据
    pullFromCloud(loggedInUser.syncKey);
  };

  const handleUserLogout = () => {
    console.log('User logged out');
    logoutUser();
    setUser(null);

    // 清除用户相关的配置，恢复到独立模式
    setApiConfig(undefined);
    localStorage.removeItem('api_config');

    // 重新加载默认卡组
    loadDefaultDecks()
      .then((data) => {
        const loadedDecks: Deck[] = data.decks.map((deck, idx) => ({
          id: `deck-${Date.now()}-${idx}`,
          title: deck.title,
          cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
          createdAt: Date.now(),
          sourcePath: deck.source_path
        }));
        setDecks(loadedDecks.length > 0 ? loadedDecks : [{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
      })
      .catch(() => {
        setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
      });
  };

  // Bread management functions
  const createNewBread = (title: string, originalText: string = '') => {
    const newBread: BreadObject = {
      title,
      originalText,
      flashcards: [],
      chatHistory: [],
      masteryScore: 0
    };
    setCurrentBread(newBread);
  };

  const processUniversalInput = async (input: string | File, title?: string) => {
    setIsLoading(true);
    if (input instanceof File) {
      setProcessingFile(`正在处理 ${input.name}...`);
    } else {
      setProcessingFile('正在处理文本...');
    }
    try {
      const result: InputResult = await UniversalInputHandler.processInput(input, currentBread, title, apiConfig?.whisper);
      if (result.success && result.bread) {
        setCurrentBread(result.bread);
        setGlobalError(null);
        setSuccessMessage(`${input instanceof File ? input.name : '文本'} 处理成功！`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setGlobalError({ message: result.error || 'Input processing failed', isQuota: false });
      }
    } catch (error) {
      setGlobalError({ message: `Processing error: ${(error as Error).message}`, isQuota: false });
    } finally {
      setIsLoading(false);
      setProcessingFile(null);
    }
  };

  const updateBreadText = (text: string) => {
    if (currentBread) {
      setCurrentBread({ ...currentBread, originalText: text });
    }
  };

  const addFlashcard = (q: string, a: string) => {
    if (currentBread) {
      const newFlashcard = { q, a };
      setCurrentBread({
        ...currentBread,
        flashcards: [...currentBread.flashcards, newFlashcard]
      });
    }
  };

  const addChatMessage = (role: string, content: string) => {
    if (currentBread) {
      const newMessage = { role, content };
      setCurrentBread({
        ...currentBread,
        chatHistory: [...currentBread.chatHistory, newMessage]
      });
    }
  };

  const updateMasteryScore = (score: number) => {
    if (currentBread) {
      setCurrentBread({ ...currentBread, masteryScore: score });
    }
  };

  const generateFlashcardsFromContent = async () => {
    if (!currentBread || !currentBread.originalText.trim()) {
      setGlobalError({ message: '请先添加文本内容', isQuota: false });
      return;
    }

    setIsLoading(true);
    setProcessingFile('正在生成闪卡...');

    try {
      console.log('Generating flashcards with apiConfig:', apiConfig);
      console.log('apiConfig?.llm:', apiConfig?.llm);
      console.log('apiConfig?.llm?.provider:', apiConfig?.llm?.provider);

      if (!apiConfig?.llm) {
        throw new Error('API配置未设置。请在设置中配置LLM API。');
      }

      const flashcards = await generateFlashcards(currentBread.originalText, apiConfig.llm);
      setCurrentBread({
        ...currentBread,
        flashcards: [...currentBread.flashcards, ...flashcards]
      });
      setSuccessMessage(`闪卡已出炉！生成了 ${flashcards.length} 张闪卡`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setGlobalError(null);
    } catch (error) {
      console.error('Flashcard generation error:', error);
      setGlobalError({ message: `生成闪卡失败: ${(error as Error).message}`, isQuota: false });
    } finally {
      setIsLoading(false);
      setProcessingFile(null);
    }
  };

  const convertBreadToDeck = async () => {
    if (!currentBread || currentBread.flashcards.length === 0) {
      setGlobalError({ message: '没有闪卡可以转换为卡组', isQuota: false });
      return;
    }

    // 将flashcards转换为FlashcardData格式
    const cards: FlashcardData[] = currentBread.flashcards.map((flashcard, index) => ({
      id: `bread-${Date.now()}-${index}`,
      ip: 'generated',
      section: 'GENERATED',
      question: flashcard.q,
      hint: '',
      text: flashcard.a,
      image: '',
      ipImage: ''
    }));

    // 创建新的卡组
    const newDeck: Deck = {
      id: `deck-${Date.now()}`,
      title: currentBread.title || `从"${currentBread.title || '记忆面包'}"生成的卡组`,
      cards: cards,
      createdAt: Date.now()
    };

    // 添加到卡组列表
    const updatedDecks = [...decks, newDeck];
    setDecks(updatedDecks);

    // 保存到本地存储
    localStorage.setItem('live_memory_trainer_v8', JSON.stringify(updatedDecks));

    // 保存到文件
    try {
      const response = await saveDeckToFileWithOptions(
        newDeck.title,
        serializeCardsForSave(newDeck.cards)
      );
      if (response?.path) {
        setDecks(prev => prev.map(d => d.id === newDeck.id ? { ...d, sourcePath: response.path } : d));
      }
    } catch (err) {
      console.error('Save deck:', err);
    }

    // 如果用户已登录，同步到云端
    if (user?.syncKey) {
      pushToCloud(user.syncKey, [...decks, newDeck], user.volcano, user.preferences, user.transcriptionLanguage);
    }

    setSuccessMessage(`卡组"${newDeck.title}"已创建！包含 ${cards.length} 张闪卡`);
    setTimeout(() => setSuccessMessage(null), 3000);

    // 清空面包中的闪卡（可选）
    // setCurrentBread({ ...currentBread, flashcards: [] });
  };

  const handleManualSync = async () => {
    if (!user?.syncKey) {
      setGlobalError({ message: "Please create or login to a cloud profile first.", isQuota: false });
      return;
    }
    
    try {
      // First, try to merge local folder decks with current decks (if accessible)
      let mergedDecks = [...decks];
      
      try {
        const localData = await loadDefaultDecks();
        const localDecks: Deck[] = localData.decks.map((deck, idx) => ({
          id: `local-${Date.now()}-${idx}`,
          title: deck.title,
          cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
          createdAt: Date.now(),
          sourcePath: deck.source_path
        }));
        
        // Merge current decks with local folder decks
        localDecks.forEach(localDeck => {
          const exists = mergedDecks.some(d => d.title === localDeck.title);
          if (!exists) {
            mergedDecks.push(localDeck);
          }
        });
      } catch (localErr) {
        // Local folder not accessible (e.g., on mobile), just use current decks
        console.log("Local folder not accessible, syncing current decks only:", localErr);
      }
      
      // Sync to cloud
      await pushToCloud(user.syncKey, mergedDecks, user.volcano, user.preferences, user.transcriptionLanguage);
      
      // Also pull from cloud to get any updates
      await pullFromCloud(user.syncKey);
    } catch (err) {
      console.error("Manual sync failed:", err);
      setGlobalError({ message: "Sync failed. Please check your connection.", isQuota: false });
    }
  };

  const pushToCloud = async (key: string, data: Deck[], volcano?: VolcanoCredentials, preferences?: AIPreferences, transcriptionLanguage?: string) => {
    if (!key) return;
    setIsSyncing(true);
    setSyncError(null);
    const payload: CloudPayload = { decks: data, userConfig: { volcano, preferences, transcriptionLanguage }, updatedAt: Date.now() };
    try {
      const response = await cloudFetch(key, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      if (!response.ok) {
        throw new Error(`Cloud sync failed: ${response.statusText}`);
      }
      console.log('Cloud sync successful');
    } catch (e) { 
      console.error("Cloud push failed:", e);
      setSyncError('云端同步失败（网络或跨域），可用「导出全部」先备份到本地');
    } finally { 
      setIsSyncing(false); 
    }
  };

  const pullFromCloud = async (key: string) => {
    if (!key) return;
    setIsSyncing(true);
    try {
      const response = await cloudFetch(key);
      if (response.ok) {
        const cloudData: CloudPayload = await response.json();
        if (cloudData.decks && cloudData.decks.length > 0) {
          // Use cloud data directly first
          setDecks(cloudData.decks);
          
          // Try to merge with local folder decks (only if accessible, e.g., on desktop)
          loadDefaultDecks()
            .then((localData) => {
              const localDecks: Deck[] = localData.decks.map((deck, idx) => ({
                id: `local-${Date.now()}-${idx}`,
                title: deck.title,
                cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
                createdAt: Date.now(),
                sourcePath: deck.source_path
              }));
              
              // Merge: combine cloud and local decks, avoiding duplicates by title
              const mergedDecks: Deck[] = [...cloudData.decks];
              localDecks.forEach(localDeck => {
                const exists = mergedDecks.some(d => d.title === localDeck.title);
                if (!exists) {
                  mergedDecks.push(localDeck);
                }
              });
              
              setDecks(mergedDecks);
              // Sync merged decks back to cloud
              if (user) {
                pushToCloud(key, mergedDecks, user.volcano, user.preferences, user.transcriptionLanguage);
              }
            })
            .catch((err) => {
              // If local load fails (e.g., on mobile), just use cloud data
              console.log("Local folder not accessible, using cloud data only:", err);
              // Cloud data already set above, no need to set again
            });
        } else {
          // No cloud data, try to load from local folder
          loadDefaultDecks()
            .then((localData) => {
              const localDecks: Deck[] = localData.decks.map((deck, idx) => ({
                id: `local-${Date.now()}-${idx}`,
                title: deck.title,
                cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
                createdAt: Date.now(),
                sourcePath: deck.source_path
              }));
              if (localDecks.length > 0) {
                setDecks(localDecks);
                // Sync local decks to cloud
                if (user) {
                  pushToCloud(key, localDecks, user.volcano, user.preferences, user.transcriptionLanguage);
                }
              } else {
                setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
              }
            })
            .catch((err) => {
              console.log("Local folder not accessible:", err);
              // If no cloud data and can't access local folder, use default
              setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
            });
        }
        
        setUser(prev => ({
          id: prev?.id || `u-${Date.now()}`,
          username: prev?.username || '',
          password: prev?.password || '',
          syncKey: key,
          lastSynced: cloudData.updatedAt || Date.now(),
          volcano: cloudData.userConfig?.volcano,
          preferences: cloudData.userConfig?.preferences || { taskA_Engine: 'gemini-3-pro-preview', taskB_Engine: 'GEMINI_SEARCH' },
          transcriptionLanguage: cloudData.userConfig?.transcriptionLanguage
        }));
      } else {
        // Cloud fetch failed (404 or other error), try local folder
        loadDefaultDecks()
          .then((localData) => {
            const localDecks: Deck[] = localData.decks.map((deck, idx) => ({
              id: `local-${Date.now()}-${idx}`,
              title: deck.title,
              cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
              createdAt: Date.now()
            }));
            if (localDecks.length > 0) {
              setDecks(localDecks);
            } else {
              setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
            }
          })
          .catch((err) => {
            console.log("Local folder not accessible:", err);
            setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
          });
      }
    } catch (e) { 
      console.error("Cloud pull failed:", e);
      // Fallback to local folder
      loadDefaultDecks()
        .then((localData) => {
          const localDecks: Deck[] = localData.decks.map((deck, idx) => ({
            id: `local-${Date.now()}-${idx}`,
            title: deck.title,
            cards: Array.isArray(deck.cards) ? normalizeCards(deck.cards) : [],
            createdAt: Date.now()
          }));
          if (localDecks.length > 0) {
            setDecks(localDecks);
          } else {
            setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
          }
        })
        .catch((err) => {
          console.log("Local folder not accessible:", err);
          setDecks([{ id: 'default-deck', title: 'Starter Pack', cards: DEFAULT_CARDS, createdAt: Date.now() }]);
        });
    } finally { 
      setIsSyncing(false); 
    }
  };

  const generateVisualsForCards = async (newCards: FlashcardData[], deckId: string) => {
    const currentIds = new Set(visualizingIds);
    newCards.forEach(c => currentIds.add(c.id));
    setVisualizingIds(currentIds);

    for (const card of newCards) {
      if (card.image) {
        setVisualizingIds(prev => { const n = new Set(prev); n.delete(card.id); return n; });
        continue;
      }
      try {
        const url = await generateVisualForCard(card, user?.volcano, user?.preferences);
        if (url) {
          setDecks(prev => prev.map(d => d.id === deckId ? { ...d, cards: d.cards.map(c => c.id === card.id ? { ...c, image: url } : c) } : d));
        }
      } catch (err: any) { 
        const errStr = JSON.stringify(err);
        if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
          setGlobalError({ 
            message: "Neural visual assets extraction limited. Select a Personal Key to continue.", 
            isQuota: true 
          });
          break;
        }
      } finally {
        setVisualizingIds(prev => { const n = new Set(prev); n.delete(card.id); return n; });
      }
    }
  };

  const serializeCardsForSave = (cards: FlashcardData[]) => (
    cards.map(c => ({
      ip: c.ip,
      section: c.section,
      question: c.question,
      hint: c.hint,
      text: c.text,
      image: c.image || '',
      ip_image: c.ipImage || ''
    }))
  );

  const persistDeckToFile = async (deck: Deck, cards: FlashcardData[]) => {
    try {
      const response = await saveDeckToFileWithOptions(
        deck.title,
        serializeCardsForSave(cards),
        { sourcePath: deck.sourcePath, overwrite: true }
      );
      if (response?.path && response.path !== deck.sourcePath) {
        setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, sourcePath: response.path } : d));
      }
    } catch (err) {
      console.error('Save deck:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setGlobalError({ message: `保存卡组失败：${msg}`, isQuota: false });
    }
  };

  const handleUploadCardImage = async (file: File, card: FlashcardData) => {
    if (!activeDeckId) {
      setGlobalError({ message: '未找到当前卡组，无法保存图片。', isQuota: false });
      return;
    }
    const deck = decks.find(d => d.id === activeDeckId);
    if (!deck) {
      setGlobalError({ message: '未找到当前卡组，无法保存图片。', isQuota: false });
      return;
    }

    const { imagePath, imageUrl } = await uploadCardImage(file, deck.title, card.id);
    const storedImage = imagePath || imageUrl;
    if (!storedImage) {
      throw new Error('Image upload returned empty path');
    }

    const updatedDeck: Deck = {
      ...deck,
      cards: deck.cards.map(c => c.id === card.id ? { ...c, image: storedImage } : c)
    };

    setDecks(prev => prev.map(d => d.id === deck.id ? updatedDeck : d));
    setSessionCards(prev => prev.map(c => c.id === card.id ? { ...c, image: storedImage } : c));

    await persistDeckToFile(updatedDeck, updatedDeck.cards);
  };

  const handleUploadIpImage = async (file: File, deckId: string, ip: string) => {
    const trimmedIp = ip.trim();
    if (!trimmedIp) {
      setGlobalError({ message: 'IP 不能为空，无法保存图片。', isQuota: false });
      return;
    }
    const deck = decks.find(d => d.id === deckId);
    if (!deck) {
      setGlobalError({ message: '未找到当前卡组，无法保存 IP 图片。', isQuota: false });
      return;
    }

    const { imagePath, imageUrl } = await uploadIpImage(file, deck.title, trimmedIp);
    const storedImage = imagePath || imageUrl;
    if (!storedImage) {
      throw new Error('IP image upload returned empty path');
    }

    const updatedCards = deck.cards.map(c => c.ip === trimmedIp ? { ...c, ipImage: storedImage } : c);
    const updatedDeck: Deck = { ...deck, cards: updatedCards };

    setDecks(prev => prev.map(d => d.id === deck.id ? updatedDeck : d));
    if (activeDeckId === deck.id) {
      setSessionCards(prev => prev.map(c => c.ip === trimmedIp ? { ...c, ipImage: storedImage } : c));
    }

    await persistDeckToFile(updatedDeck, updatedDeck.cards);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.name.toLowerCase().endsWith('.json')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = typeof ev.target?.result === 'string' ? ev.target.result : '';
        const content = JSON.parse(raw);
        let cards: FlashcardData[] = Array.isArray(content) ? content : (content.cards ?? content.CARDS ?? content.cardList ?? []);
        if (cards.length === 0 && typeof content === 'object' && content !== null && !Array.isArray(content)) {
          const first = Object.values(content).find(v => Array.isArray(v));
          if (Array.isArray(first)) cards = first as FlashcardData[];
        }
        if (cards.length === 0) {
          setGlobalError({ message: 'JSON 中未找到卡牌数据（需 cards/CARDS 数组或根数组）。', isQuota: false });
          return;
        }
        const title = (content.title ?? content.deck_title ?? content.TITLE ?? file.name.replace(/\.json$/i, '')) || 'Imported Deck';
        const newDeckId = `deck-${Date.now()}`;
        const newDeck: Deck = {
          id: newDeckId,
          title,
          cards: cards.map((c, i) => ({
            id: c.id || `import-${Date.now()}-${i}`,
            ip: c.ip ?? '',
            section: typeof c.section === 'string' ? c.section : String(c.section ?? ''),
            question: c.question ?? '',
            hint: c.hint ?? '',
            text: c.text ?? '',
            image: c.image ?? '',
            ipImage: c.ipImage ?? c.ip_image ?? ''
          })),
          createdAt: Date.now(),
        };
        setDecks(prev => {
          const next = [...prev, newDeck];
          if (user?.syncKey) setTimeout(() => pushToCloud(user.syncKey, next, user.volcano, user.preferences, user.transcriptionLanguage), 0);
          return next;
        });
        setGlobalError(null);
        saveDeckToFileWithOptions(
          newDeck.title,
          serializeCardsForSave(newDeck.cards)
        )
          .then((response) => {
            if (response?.path) {
              setDecks(prev => prev.map(d => d.id === newDeckId ? { ...d, sourcePath: response.path } : d));
            }
          })
          .catch(err => console.error('Save deck:', err));
      } catch (err) {
        console.error('Import JSON error:', err);
        setGlobalError({ message: `JSON 解析失败：${err instanceof Error ? err.message : String(err)}`, isQuota: false });
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  /** 导出全部卡组为一份 JSON 备份（不依赖云端，可传到手机后「从备份恢复」） */
  const handleExportAll = () => {
    const payload = { decks, updatedAt: Date.now() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setGlobalError(null);
  };

  /** 从备份 JSON 恢复全部卡组（支持导出的格式或仅 { decks: [...] }） */
  const handleRestoreFromBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = typeof ev.target?.result === 'string' ? ev.target.result : '';
        const data = JSON.parse(raw);
        const list: Deck[] = Array.isArray(data.decks) ? data.decks : (Array.isArray(data) ? data : []);
        if (list.length === 0) {
          setGlobalError({ message: '备份文件中没有卡组数据（需要 decks 数组）。', isQuota: false });
          return;
        }
        const normalized: Deck[] = list.map((d, i) => ({
          id: d.id || `deck-${Date.now()}-${i}`,
          title: d.title || `Deck ${i + 1}`,
          cards: Array.isArray(d.cards) ? d.cards.map((c, j) => ({
            id: c.id || `c-${Date.now()}-${j}`,
            ip: c.ip ?? '',
            section: typeof c.section === 'string' ? c.section : String(c.section ?? ''),
            question: c.question ?? '',
            hint: c.hint ?? '',
            text: c.text ?? '',
            image: c.image ?? '',
            ipImage: c.ipImage ?? c.ip_image ?? ''
          })) : [],
          createdAt: d.createdAt ?? Date.now(),
        }));
        setDecks(normalized);
        setGlobalError(null);
        if (user?.syncKey) setTimeout(() => pushToCloud(user.syncKey, normalized, user.volcano, user.preferences, user.transcriptionLanguage), 0);
      } catch (err) {
        setGlobalError({ message: `备份解析失败：${err instanceof Error ? err.message : String(err)}`, isQuota: false });
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // ROBUST DELETION WITHOUT BROWSER POPUPS
  const handleResetVisuals = (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    
    if (confirmResetId !== deckId) {
      setConfirmResetId(deckId);
      setConfirmDeleteId(null);
      setTimeout(() => setConfirmResetId(null), 3000);
      return;
    }

    setConfirmResetId(null);
    setDecks(prev => prev.map(d => d.id === deckId ? { ...d, cards: d.cards.map(c => ({ ...c, image: '' })) } : d));
    const deck = decks.find(d => d.id === deckId);
    if (deck) generateVisualsForCards(deck.cards, deckId);
  };

  const handleDeleteDeck = (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();

    if (confirmDeleteId !== deckId) {
      setConfirmDeleteId(deckId);
      setConfirmResetId(null);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    setConfirmDeleteId(null);
    const updatedDecks = decks.filter(d => d.id !== deckId);
    setDecks(updatedDecks);
    if (user?.syncKey) {
      pushToCloud(user.syncKey, updatedDecks, user.volcano, user.preferences, user.transcriptionLanguage);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0a0a0a] text-gray-100 overflow-x-hidden">
      <header className="sticky top-0 z-[100] bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
         <div className="flex items-center space-x-3 cursor-pointer" onClick={() => { setMode('LIBRARY'); setActiveDeckId(null); }}>
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center"><span className="text-black font-black text-sm">LM</span></div>
            <h1 className="text-sm font-bold tracking-tighter uppercase">Memory Trainer</h1>
         </div>
         <div className="flex items-center gap-2">
           {user && syncError && (
             <span className="text-[9px] text-amber-400/90 max-w-[140px] truncate" title={syncError}>{syncError}</span>
           )}
           {user && (
             <button 
               onClick={() => syncError ? pushToCloud(user.syncKey, decks, user.volcano, user.preferences, user.transcriptionLanguage) : handleManualSync} 
               disabled={isSyncing}
               className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
               title={syncError ? '重试同步' : 'Sync with cloud'}
             >
               {isSyncing ? <Icons.Refresh className="w-4 h-4 animate-spin text-indigo-400" /> : <Icons.Cloud className="w-4 h-4" />}
             </button>
           )}
           <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
             {isSyncing ? <Icons.Refresh className="w-4 h-4 animate-spin text-indigo-400" /> : <Icons.User />}
           </button>
           {user ? (
             <button
               onClick={handleUserLogout}
               className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all text-red-400"
               title={`登出 ${user.username}`}
             >
               <Icons.Logout className="w-4 h-4" />
             </button>
           ) : (
             <button
               onClick={() => setIsUserAuthModalOpen(true)}
               className="px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-all text-green-400"
               title="登录账户"
             >
               <Icons.Login className="w-4 h-4" />
             </button>
           )}
           <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all" title="API 设置">
             <Icons.Cog className="w-4 h-4" />
           </button>
         </div>
      </header>

      {globalError && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-6 py-4 flex items-center justify-between z-[105] animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-200">{globalError.message}</p>
          </div>
          <div className="flex gap-4">
            {globalError.isQuota && (
              <button onClick={handleKeySelect} className="text-[9px] font-black uppercase tracking-widest bg-red-500 px-3 py-1.5 rounded text-white shadow-lg">Select My Key</button>
            )}
            <button onClick={() => setGlobalError(null)} className="text-white/20 hover:text-white">✕</button>
          </div>
        </div>
      )}
      
      <main className="flex-1 flex flex-col items-center pt-8 pb-24 px-4 max-w-6xl mx-auto w-full relative">
        {mode === 'LIBRARY' && (
          <div className="w-full">
            <div className="flex justify-between items-end mb-12 px-2">
              <div>
                <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Collections</h2>
                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-1">Authorized Neural Assets</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => {
                    if (!currentBread) {
                      createNewBread('新记忆面包', '');
                    }
                  }}
                  className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${
                    currentBread
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {currentBread ? '当前面包' : '记忆面包'}
                </button>
                <button onClick={() => setIsDeckChatOpen(true)} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-white/20" title="根据卡组内容向 LLM 提问，如总结话术">卡牌助手</button>
                <button
                  onClick={() => {
                    if (decks.length > 0) {
                      setIpCatalogueDeckId(decks[0].id);
                    }
                    setIsIpCatalogueOpen(true);
                  }}
                  disabled={decks.length === 0}
                  className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  IP Catalogue
                </button>
                <button onClick={() => jsonImportInputRef.current?.click()} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-white/20">从 JSON 导入</button>
                <input ref={jsonImportInputRef} type="file" accept=".json" hidden onChange={handleImportJson} />
                <button onClick={handleExportAll} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-white/20" title="下载全部卡组为一份 JSON，可传到手机后「从备份恢复」">导出全部</button>
                <button onClick={() => backupInputRef.current?.click()} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-white/20" title="从导出的备份 JSON 恢复全部卡组">从备份恢复</button>
                <input ref={backupInputRef} type="file" accept=".json" hidden onChange={handleRestoreFromBackup} />
              </div>
            </div>

            {currentBread && (
              <div className="mb-8 p-6 bg-green-900/20 border border-green-500/30 rounded-2xl">
                <h3 className="text-xl font-black text-green-400 uppercase tracking-tighter mb-4">当前记忆面包</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-white/60">标题:</span>
                    <p className="text-white font-bold">{currentBread.title}</p>
                  </div>
                  <div>
                    <span className="text-white/60">文本长度:</span>
                    <p className="text-white font-bold">{currentBread.originalText.length} 字符</p>
                  </div>
                  <div>
                    <span className="text-white/60">闪卡数量:</span>
                    <p className="text-white font-bold">{currentBread.flashcards.length}</p>
                  </div>
                  <div>
                    <span className="text-white/60">掌握分数:</span>
                    <p className="text-white font-bold">{currentBread.masteryScore}</p>
                  </div>
                </div>

                {/* 多模态输入区域 */}
                <div className="border-t border-green-500/20 pt-4">
                  <h4 className="text-lg font-bold text-green-300 mb-3">多模态输入</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 文本输入 */}
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">直接输入文本</label>
                      <textarea
                        value={textInput}
                        placeholder="粘贴或输入文本内容..."
                        className="w-full bg-black/50 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm min-h-[80px]"
                        onChange={(e) => setTextInput(e.target.value)}
                      />
                    </div>

                    {/* 文件上传 */}
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">上传文件</label>
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,.srt,.text,.pdf,.docx,.json,.mp3,.wav,.mp4,.avi,.mov,.m4a,.webm"
                        className="w-full bg-black/50 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-green-600 file:text-white hover:file:bg-green-700"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // 清空文件输入，以便可以重复选择同一文件
                            e.target.value = '';
                            processUniversalInput(file, file.name);
                          }
                        }}
                        disabled={isLoading}
                      />
                      <p className="text-xs text-white/50 mt-1">
                        支持: 文本(.txt,.md,.srt), PDF(.pdf), Word(.docx), JSON(.json), 音视频(.mp3,.wav,.mp4等)
                      </p>
                    </div>
                  </div>

                  {isLoading && (
                    <div className="mt-4 flex items-center gap-2 text-green-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                      <span className="text-sm">{processingFile || '处理中...'}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      if (textInput.trim() && currentBread) {
                        updateBreadText(currentBread.originalText + (currentBread.originalText ? '\n\n' : '') + textInput.trim());
                        setTextInput('');
                        setSuccessMessage('文本已成功添加！');
                        setTimeout(() => setSuccessMessage(null), 3000);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors"
                    disabled={!textInput.trim()}
                  >
                    添加文本
                  </button>
                  <button
                    onClick={generateFlashcardsFromContent}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={isLoading || !currentBread?.originalText?.trim()}
                  >
                    {isLoading ? '生成中...' : '添加闪卡'}
                  </button>
                  <button onClick={() => addChatMessage('user', '新消息')} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold">添加对话</button>
                  <button
                    onClick={convertBreadToDeck}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
                    disabled={!currentBread?.flashcards?.length}
                  >
                    转换为卡组
                  </button>
                </div>

                {successMessage && (
                  <div className="mt-4 p-3 bg-green-600/20 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-sm font-medium">{successMessage}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {decks.map(deck => {
                const missing = deck.cards.filter(c => !c.image).length;
                const isSyncingCards = deck.cards.some(c => visualizingIds.has(c.id));
                const isDeleting = confirmDeleteId === deck.id;
                const isResetting = confirmResetId === deck.id;

                return (
                  <div key={deck.id} className="bg-[#0f0f0f] border border-white/5 rounded-[2.5rem] p-8 hover:border-white/20 transition-all group relative">
                    {missing > 0 && (
                      <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-black shadow-2xl z-[70] ${isSyncingCards ? 'bg-indigo-500 text-white animate-pulse' : 'bg-indigo-900/60 text-indigo-100'}`}>
                        {missing}
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-8 relative z-[60]">
                       <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <Icons.Doc className="w-6 h-6 text-white/40" />
                       </div>
                       <div className="flex gap-2">
                          <button 
                            onClick={(e) => handleResetVisuals(e, deck.id)} 
                            className={`p-3 rounded-xl border border-white/5 transition-all flex items-center justify-center ${isResetting ? 'bg-indigo-500 text-white border-indigo-500 px-4' : 'bg-white/5 text-white/20 hover:text-indigo-400 hover:bg-white/10'}`} 
                          >
                            {isResetting ? <span className="text-[8px] font-black uppercase tracking-tighter">Confirm Sync</span> : <Icons.Refresh className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={(e) => handleDeleteDeck(e, deck.id)} 
                            className={`p-3 rounded-xl border border-white/5 transition-all flex items-center justify-center ${isDeleting ? 'bg-red-500 text-white border-red-500 px-4' : 'bg-white/5 text-white/20 hover:text-red-500 hover:bg-white/10'}`}
                          >
                            {isDeleting ? <span className="text-[8px] font-black uppercase tracking-tighter">Confirm Delete</span> : <Icons.Trash className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>
                    <h3 className="text-2xl font-black mb-2 tracking-tight">{deck.title}</h3>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-10">{deck.cards.length} Integrated Assets</p>
                    <div className="grid grid-cols-2 gap-3 relative z-[50]">
                      <button onClick={() => { setSessionCards(deck.cards); setCurrentIndex(0); setMode('STUDY_MCQ'); setActiveDeckId(deck.id); }} className="py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">Evaluate</button>
                      <button onClick={() => { setSessionCards(deck.cards); setCurrentIndex(0); setMode('REVIEW_FLASHCARDS'); setActiveDeckId(deck.id); }} className="py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Recall</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(mode === 'STUDY_MCQ' || mode === 'REVIEW_FLASHCARDS') && sessionCards.length > 0 && (
          <div className="w-full flex flex-col items-center animate-in slide-in-from-bottom-8 duration-700">
            <div className="w-full max-w-2xl flex justify-between items-center mb-10 px-4">
              <button onClick={() => { setMode('LIBRARY'); setActiveDeckId(null); }} className="text-white/30 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><Icons.ArrowLeft className="w-3 h-3" /> Back</button>
              <div className="text-[10px] font-mono font-black tracking-[0.4em] text-white/20 uppercase">{currentIndex + 1} / {sessionCards.length}</div>
            </div>
            {mode === 'STUDY_MCQ' ? (
              <MultipleChoice
                card={sessionCards[currentIndex]}
                allCards={sessionCards}
                onNext={() => setCurrentIndex(prev => (prev + 1) % sessionCards.length)}
                isVisualizing={visualizingIds.has(sessionCards[currentIndex].id)}
                onUploadImage={handleUploadCardImage}
                ipImage={sessionCards[currentIndex].ipImage}
              />
            ) : (
              <Flashcard
                card={sessionCards[currentIndex]}
                isFlipped={isFlipped}
                onFlip={() => setIsFlipped(!isFlipped)}
                isVisualizing={visualizingIds.has(sessionCards[currentIndex].id)}
                onRescan={() => {}}
                user={user}
                onUploadImage={handleUploadCardImage}
                ipImage={sessionCards[currentIndex].ipImage}
              />
            )}
            <div className="mt-12 flex gap-8">
              <button onClick={() => { setCurrentIndex(prev => (prev - 1 + sessionCards.length) % sessionCards.length); setIsFlipped(false); }} className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center hover:bg-white/10 transition-all"><Icons.ArrowLeft /></button>
              <button onClick={() => { setCurrentIndex(prev => (prev + 1) % sessionCards.length); setIsFlipped(false); }} className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center hover:bg-white/10 transition-all"><Icons.ArrowRight /></button>
            </div>
          </div>
        )}
      </main>

      {isAuthModalOpen && (
        <AuthModal 
          user={user} isSyncing={isSyncing} onLogin={pullFromCloud} onGenerateKey={handleGenerateKey}
          onLogout={() => { setUser(null); setSyncError(null); localStorage.removeItem('trainer_user_session'); }} 
          onKeySelect={handleKeySelect} onUpdateConfig={handleUpdateConfig} onClose={() => setIsAuthModalOpen(false)} 
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiConfig={apiConfig}
        onSave={handleSaveAPIConfig}
      />

      <UserAuthModal
        isOpen={isUserAuthModalOpen}
        onClose={() => setIsUserAuthModalOpen(false)}
        onLogin={handleUserLogin}
      />

      <IpCatalogueModal
        open={isIpCatalogueOpen}
        decks={decks}
        selectedDeckId={ipCatalogueDeckId}
        onSelectDeckId={(deckId) => setIpCatalogueDeckId(deckId)}
        onClose={() => setIsIpCatalogueOpen(false)}
        onUploadIpImage={handleUploadIpImage}
      />

      <DeckChatModal open={isDeckChatOpen} onClose={() => setIsDeckChatOpen(false)} decks={decks} />
    </div>
  );
};

export default App;
