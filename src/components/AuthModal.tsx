
import React, { useState, useEffect } from 'react';
import { User, VolcanoCredentials, AIPreferences } from '../types';
import { Icons } from '../constants';

interface AuthModalProps {
  user: User | null;
  isSyncing: boolean;
  onLogin: (key: string) => void;
  onLogout: () => void;
  onGenerateKey: () => void;
  onKeySelect: () => void;
  onUpdateConfig: (volcano: VolcanoCredentials, prefs: AIPreferences, transcriptionLanguage?: string) => void;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ 
  user, 
  isSyncing,
  onLogin, 
  onLogout, 
  onGenerateKey,
  onKeySelect, 
  onUpdateConfig, 
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'SYNC' | 'AI'>('SYNC');
  const [inputKey, setInputKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS'>('IDLE');

  // Local State for AI Config
  const [taskAEngine, setTaskAEngine] = useState<AIPreferences['taskA_Engine']>(user?.preferences?.taskA_Engine || 'gemini-3-pro-preview');
  const [taskBEngine, setTaskBEngine] = useState<AIPreferences['taskB_Engine']>(user?.preferences?.taskB_Engine || 'GEMINI_SEARCH');
  const [volcanoKey, setVolcanoKey] = useState(user?.volcano?.apiKey || '');
  const [volcanoModel, setVolcanoModel] = useState(user?.volcano?.model || 'doubao-pro-search');
  const [volcanoEnabled, setVolcanoEnabled] = useState(user?.volcano?.enabled || false);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState(user?.transcriptionLanguage || '');

  useEffect(() => {
    if (user) {
      setTaskAEngine(user.preferences?.taskA_Engine || 'gemini-3-pro-preview');
      setTaskBEngine(user.preferences?.taskB_Engine || 'GEMINI_SEARCH');
      setVolcanoKey(user.volcano?.apiKey || '');
      setVolcanoModel(user.volcano?.model || 'doubao-pro-search');
      setVolcanoEnabled(user.volcano?.enabled || false);
      setTranscriptionLanguage(user.transcriptionLanguage || '');
    }
  }, [user]);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveConfig = () => {
    setSaveStatus('SAVING');
    onUpdateConfig(
      { apiKey: volcanoKey, model: volcanoModel, enabled: volcanoEnabled },
      { taskA_Engine: taskAEngine, taskB_Engine: taskBEngine },
      transcriptionLanguage
    );
    setTimeout(() => {
      setSaveStatus('SUCCESS');
      setTimeout(() => setSaveStatus('IDLE'), 2000);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col md:flex-row h-[740px] max-h-[95dvh]" onClick={e => e.stopPropagation()}>
        
        {/* Sidebar Nav */}
        <div className="w-full md:w-32 bg-black/40 border-r border-white/5 flex flex-row md:flex-col p-4 gap-2">
           <button onClick={() => setActiveTab('SYNC')} className={`flex-1 md:flex-none py-6 rounded-3xl flex flex-col items-center gap-3 transition-all ${activeTab === 'SYNC' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}>
              <Icons.Cloud className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sync</span>
           </button>
           <button onClick={() => setActiveTab('AI')} className={`flex-1 md:flex-none py-6 rounded-3xl flex flex-col items-center gap-3 transition-all ${activeTab === 'AI' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}>
              <Icons.Brain className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-widest">AI Hub</span>
           </button>
           <div className="flex-1"></div>
           <button onClick={onClose} className="p-4 text-white/20 hover:text-white">✕</button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col h-full bg-grid overflow-hidden">
          <div className="flex-1 p-10 overflow-y-auto">
            {activeTab === 'SYNC' ? (
              <div className="space-y-10 animate-in slide-in-from-right-4">
                 <div className="space-y-2">
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Cloud Profile</h2>
                    <p className="text-white/30 text-sm font-medium">Sync your cards and AI configuration across all devices.</p>
                 </div>
                 {user ? (
                  <div className="space-y-8">
                    <div className="p-10 bg-white/[0.02] border border-white/10 rounded-[2rem] text-center backdrop-blur-md relative">
                      <div className="absolute top-4 right-4">
                        {isSyncing ? <Icons.Refresh className="w-4 h-4 text-indigo-500 animate-spin" /> : <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>}
                      </div>
                      <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mb-6">Master Access Key</div>
                      <div className="text-3xl font-mono font-bold text-white mb-8 tracking-tighter">{user.syncKey}</div>
                      <button onClick={() => handleCopy(user.syncKey)} className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                        {copied ? 'Copied' : 'Copy Key'}
                      </button>
                    </div>
                    <div className="pt-4 flex flex-col items-center gap-4">
                       <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest text-center">Connected. Your AI settings are now part of your cloud profile.</p>
                       <button onClick={onLogout} className="text-red-500/40 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.2em] transition-colors">Disconnect Account</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="space-y-4">
                        <input type="text" placeholder="PASTE SYNC KEY" value={inputKey} onChange={(e) => setInputKey(e.target.value.toUpperCase())} className="w-full bg-black/40 border border-white/10 rounded-2xl px-8 py-6 text-white font-mono placeholder:text-white/10 outline-none focus:border-indigo-500 transition-all text-center text-xl tracking-[0.2em]" />
                        <button onClick={() => onLogin(inputKey)} disabled={inputKey.length < 8 || isSyncing} className="w-full py-6 bg-white text-black rounded-2xl font-black text-sm uppercase tracking-[0.3em] disabled:opacity-10 shadow-2xl transition-all">
                          {isSyncing && activeTab === 'SYNC' ? 'Syncing...' : 'Restore Profile'}
                        </button>
                     </div>
                     <button 
                        onClick={(e) => { e.preventDefault(); onGenerateKey(); }} 
                        disabled={isSyncing} 
                        className="w-full py-4 border border-white/10 rounded-2xl text-white/40 hover:text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2"
                      >
                       {isSyncing ? <Icons.Refresh className="w-3 h-3 animate-spin" /> : null}
                       {isSyncing ? 'Generating...' : 'Generate New Profile'}
                     </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-10 pb-10 animate-in slide-in-from-right-4">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-white tracking-tighter uppercase">AI Subsystems</h2>
                  <p className="text-white/30 text-sm font-medium">Fine-tune the intelligence driving your learning.</p>
                </div>

                {/* TASK A */}
                <div className="p-8 bg-black/40 border border-white/10 rounded-[2rem] space-y-6 relative overflow-hidden group">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400"><Icons.Doc className="w-5 h-5" /></div>
                      <div>
                         <h3 className="text-sm font-black text-white uppercase tracking-widest">Task A: Knowledge Architect</h3>
                         <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Content Synthesis</p>
                      </div>
                   </div>
                   
                   <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                      <button onClick={() => setTaskAEngine('gemini-3-pro-preview')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${taskAEngine === 'gemini-3-pro-preview' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>Gemini Pro</button>
                      <button onClick={() => setTaskAEngine('gemini-3-flash-preview')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${taskAEngine === 'gemini-3-flash-preview' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>Gemini Flash</button>
                   </div>
                   <p className="text-[10px] leading-relaxed text-white/40 uppercase font-medium italic">Pro is recommended for complex document parsing. Flash is faster for basic text prompts.</p>
                </div>

                {/* TASK B */}
                <div className="p-8 bg-black/40 border border-white/10 rounded-[2rem] space-y-6 relative overflow-hidden group">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400"><Icons.Sparkles className="w-5 h-5" /></div>
                      <div>
                         <h3 className="text-sm font-black text-white uppercase tracking-widest">Task B: Visual Search</h3>
                         <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Web Image Retrieval</p>
                      </div>
                   </div>

                   <p className="text-[10px] leading-relaxed text-white/40 uppercase font-medium">Yes, the AI browses the web! It uses integrated Search Tools to find real product images for your memory anchors.</p>

                   <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                      <button onClick={() => setTaskBEngine('GEMINI_SEARCH')} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${taskBEngine === 'GEMINI_SEARCH' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>Gemini Search</button>
                      <button onClick={() => setTaskBEngine('VOLCANO_SEARCH')} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${taskBEngine === 'VOLCANO_SEARCH' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>Volcano Engine</button>
                   </div>

                   {taskBEngine === 'VOLCANO_SEARCH' && (
                     <div className="space-y-4 animate-in slide-in-from-top-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Volcano API Key</label>
                          <input type="password" value={volcanoKey} onChange={e => setVolcanoKey(e.target.value)} placeholder="Enter Key" className="w-full bg-black border border-white/5 rounded-2xl px-6 py-5 text-sm text-white font-mono outline-none focus:border-indigo-500/40" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Model ID</label>
                          <input type="text" value={volcanoModel} onChange={e => setVolcanoModel(e.target.value)} placeholder="e.g. doubao-pro-search" className="w-full bg-black border border-white/5 rounded-2xl px-6 py-5 text-sm text-white font-mono outline-none focus:border-indigo-500/40" />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                           <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Auto-Fallback to Gemini</span>
                           <label className="relative inline-flex items-center cursor-pointer">
                             <input type="checkbox" checked={volcanoEnabled} onChange={e => setVolcanoEnabled(e.target.checked)} className="sr-only peer" />
                             <div className="w-10 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                           </label>
                        </div>
                     </div>
                   )}
                </div>

                {/* TRANSCRIPTION LANGUAGE */}
                <div className="p-8 bg-black/40 border border-white/10 rounded-[2rem] space-y-6 relative overflow-hidden group">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-400"><Icons.Mic className="w-5 h-5" /></div>
                      <div>
                         <h3 className="text-sm font-black text-white uppercase tracking-widest">Speech Recognition</h3>
                         <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Language Settings</p>
                      </div>
                   </div>

                   <p className="text-[10px] leading-relaxed text-white/40 uppercase font-medium">Specify language for better transcription accuracy. Leave empty for automatic detection.</p>

                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Language Code</label>
                     <input type="text" value={transcriptionLanguage} onChange={e => setTranscriptionLanguage(e.target.value)} placeholder="e.g. en-US, zh-CN, ja-JP (leave empty for auto-detect)" className="w-full bg-black border border-white/5 rounded-2xl px-6 py-5 text-sm text-white font-mono outline-none focus:border-cyan-500/40 placeholder:text-white/20" />
                   </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Action Footer */}
          <div className="p-8 bg-black/80 border-t border-white/5 flex items-center justify-between backdrop-blur-md">
             <div className="flex items-center gap-4">
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Billing</a>
                <span className="w-1 h-1 bg-white/10 rounded-full"></span>
                <button onClick={onKeySelect} className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Gemini Key</button>
             </div>
             
             {activeTab === 'AI' && (
               <button 
                 onClick={handleSaveConfig}
                 disabled={saveStatus === 'SAVING'}
                 className={`px-10 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center gap-3 ${
                   saveStatus === 'SUCCESS' ? 'bg-emerald-500 text-white' : 'bg-white text-black hover:scale-105 active:scale-95'
                 }`}
               >
                  {saveStatus === 'SAVING' && <Icons.Refresh className="w-3 h-3 animate-spin" />}
                  {saveStatus === 'SUCCESS' ? 'Saved & Synced!' : 'Deploy Configuration'}
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
