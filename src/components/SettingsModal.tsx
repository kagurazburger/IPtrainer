import React, { useState, useEffect } from 'react';
import { APIConfig, OCRConfig, LLMConfig, WhisperConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfig: APIConfig | undefined;
  onSave: (config: APIConfig) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, apiConfig, onSave }) => {
  const [config, setConfig] = useState<APIConfig>({
    ocr: {
      provider: 'local',
      enabled: true
    },
    llm: {
      provider: 'custom',
      customBaseUrl: 'https://api.openai.com',
      customModel: 'gpt-3.5-turbo',
      enabled: true
    },
    whisper: {
      provider: 'local',
      language: 'zh-CN',
      enabled: true
    }
  });

  useEffect(() => {
    if (apiConfig) {
      setConfig(apiConfig);
    }
  }, [apiConfig]);

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const updateOCRConfig = (updates: Partial<OCRConfig>) => {
    setConfig(prev => ({
      ...prev,
      ocr: { ...prev.ocr, ...updates }
    }));
  };

  const updateLLMConfig = (updates: Partial<LLMConfig>) => {
    setConfig(prev => ({
      ...prev,
      llm: { ...prev.llm, ...updates }
    }));
  };

  const updateWhisperConfig = (updates: Partial<WhisperConfig>) => {
    setConfig(prev => ({
      ...prev,
      whisper: { ...prev.whisper, ...updates }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-10 border-b border-white/5 bg-black/40 flex justify-between items-center sticky top-0">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter">API 设置</h2>
            <p className="text-white/60 text-sm mt-2">配置 OCR、LLM 和语音识别服务的 API</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white">✕</button>
        </div>

        <div className="p-10 space-y-8">
          {/* 调试信息 */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">调试信息</h3>
            <div className="bg-black/50 p-4 rounded-lg text-sm font-mono">
              <div>当前LLM配置: {JSON.stringify(config.llm, null, 2)}</div>
            </div>
          </div>
          {/* OCR 配置 */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">OCR 配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">提供商</label>
                <select
                  value={config.ocr.provider}
                  onChange={(e) => updateOCRConfig({ provider: e.target.value as 'local' | 'cloud' })}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                >
                  <option value="local">本地处理</option>
                  <option value="cloud">云端 API</option>
                </select>
              </div>
              {config.ocr.provider === 'cloud' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">API Key</label>
                    <input
                      type="password"
                      value={config.ocr.apiKey || ''}
                      onChange={(e) => updateOCRConfig({ apiKey: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="输入 OCR API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Endpoint</label>
                    <input
                      type="text"
                      value={config.ocr.endpoint || ''}
                      onChange={(e) => updateOCRConfig({ endpoint: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="https://api.example.com/ocr"
                    />
                  </div>
                </>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="ocr-enabled"
                  checked={config.ocr.enabled}
                  onChange={(e) => updateOCRConfig({ enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="ocr-enabled" className="text-sm text-white/80">启用 OCR</label>
              </div>
            </div>
          </div>

          {/* LLM 配置 */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">LLM 配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">提供商</label>
                <select
                  value={config.llm.provider}
                  onChange={(e) => updateLLMConfig({ provider: e.target.value as 'gemini' | 'volcano' | 'custom' })}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                >
                  <option value="custom">自定义 API</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="volcano">Volcano</option>
                </select>
              </div>

              {config.llm.provider === 'gemini' && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Gemini API Key</label>
                  <input
                    type="password"
                    value={config.llm.geminiApiKey || ''}
                    onChange={(e) => updateLLMConfig({ geminiApiKey: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                    placeholder="输入 Gemini API Key"
                  />
                </div>
              )}

              {config.llm.provider === 'volcano' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Volcano API Key</label>
                    <input
                      type="password"
                      value={config.llm.volcanoApiKey || ''}
                      onChange={(e) => updateLLMConfig({ volcanoApiKey: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="输入 Volcano API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Base URL</label>
                    <input
                      type="text"
                      value={config.llm.volcanoBaseUrl || ''}
                      onChange={(e) => updateLLMConfig({ volcanoBaseUrl: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="https://ark.cn-beijing.volces.com/api/v3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">模型</label>
                    <input
                      type="text"
                      value={config.llm.volcanoModel || ''}
                      onChange={(e) => updateLLMConfig({ volcanoModel: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="doubao-seed-1-8-251228"
                    />
                    <p className="text-xs text-white/50 mt-1">推荐使用: doubao-seed-1-8-251228</p>
                  </div>
                </>
              )}

              {config.llm.provider === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Base URL</label>
                    <input
                      type="text"
                      value={config.llm.customBaseUrl || ''}
                      onChange={(e) => updateLLMConfig({ customBaseUrl: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="https://api.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">API Key</label>
                    <input
                      type="password"
                      value={config.llm.customApiKey || ''}
                      onChange={(e) => updateLLMConfig({ customApiKey: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="输入 API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">模型名称</label>
                    <input
                      type="text"
                      value={config.llm.customModel || ''}
                      onChange={(e) => updateLLMConfig({ customModel: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="gpt-3.5-turbo"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="llm-enabled"
                  checked={config.llm.enabled}
                  onChange={(e) => updateLLMConfig({ enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="llm-enabled" className="text-sm text-white/80">启用 LLM</label>
              </div>
            </div>
          </div>

          {/* Whisper 配置 */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">语音识别配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">提供商</label>
                <select
                  value={config.whisper.provider}
                  onChange={(e) => updateWhisperConfig({ provider: e.target.value as 'local' | 'openai' | 'cloud' })}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                >
                  <option value="local">本地 Whisper</option>
                  <option value="openai">OpenAI Whisper</option>
                  <option value="cloud">云端 API</option>
                </select>
              </div>

              {config.whisper.provider === 'openai' && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">OpenAI API Key</label>
                  <input
                    type="password"
                    value={config.whisper.openaiApiKey || ''}
                    onChange={(e) => updateWhisperConfig({ openaiApiKey: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                    placeholder="sk-..."
                  />
                </div>
              )}

              {config.whisper.provider === 'cloud' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">API Key</label>
                    <input
                      type="password"
                      value={config.whisper.apiKey || ''}
                      onChange={(e) => updateWhisperConfig({ apiKey: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="输入语音 API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Endpoint</label>
                    <input
                      type="text"
                      value={config.whisper.endpoint || ''}
                      onChange={(e) => updateWhisperConfig({ endpoint: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="https://api.example.com/whisper"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">语言</label>
                <select
                  value={config.whisper.language || 'zh-CN'}
                  onChange={(e) => updateWhisperConfig({ language: e.target.value })}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
                >
                  <option value="zh-CN">中文(普通话)</option>
                  <option value="en-US">英语(美国)</option>
                  <option value="ja-JP">日语</option>
                  <option value="ko-KR">韩语</option>
                  <option value="auto">自动检测</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="whisper-enabled"
                  checked={config.whisper.enabled}
                  onChange={(e) => updateWhisperConfig({ enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="whisper-enabled" className="text-sm text-white/80">启用语音识别</label>
              </div>
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;