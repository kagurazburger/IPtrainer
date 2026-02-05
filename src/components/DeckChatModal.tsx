import React, { useState, useRef, useEffect } from 'react';
import { Deck } from '../types';
import { chatWithDecks } from '../services/localService';
import { Icons } from '../constants';

interface DeckChatModalProps {
  open: boolean;
  onClose: () => void;
  decks: Deck[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const DeckChatModal: React.FC<DeckChatModalProps> = ({ open, onClose, decks }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (decks.length === 0) {
      setError('当前没有卡组，请先导入或创建卡组后再提问。');
      return;
    }
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    setError(null);
    try {
      const payload = decks.map((d) => ({
        title: d.title,
        cards: d.cards.map((c) => ({
          ip: c.ip,
          section: c.section,
          question: c.question,
          hint: c.hint,
          text: c.text,
          image: c.image || '',
        })),
      }));
      const { reply } = await chatWithDecks(q, payload);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败：${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Icons.Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">卡牌助手</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">
                根据当前卡组内容提问，LLM 将基于卡牌信息回答
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[200px]">
          {messages.length === 0 && (
            <div className="text-center py-8 text-white/40 text-sm">
              <p className="mb-2">例如：根据 HS-Universal、HS-Gintama 两组卡牌的信息帮我总结逼单话术</p>
              <p className="text-[10px]">当前共 {decks.length} 个卡组、{decks.reduce((n, d) => n + d.cards.length, 0)} 张卡牌可供参考</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-500/30 text-indigo-100 border border-indigo-500/30'
                    : 'bg-white/5 text-white/90 border border-white/10'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/10 flex items-center gap-2 text-white/60 text-sm">
                <div className="w-4 h-4 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                正在根据卡组内容生成回答…
              </div>
            </div>
          )}
          {error && !loading && (
            <p className="text-[10px] text-amber-400 text-center">{error}</p>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-white/5 shrink-0">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入问题，如：根据某几组卡牌总结话术…"
              className="flex-1 min-h-[44px] max-h-32 bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 resize-y outline-none focus:border-indigo-500"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeckChatModal;
