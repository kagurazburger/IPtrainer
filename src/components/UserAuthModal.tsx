import React, { useState } from 'react';
import { User } from '../types';
import { loginUser, registerUser, LoginCredentials, RegisterData } from '../services/userService';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: User) => void;
}

const UserAuthModal: React.FC<UserAuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const result = loginUser({ username, password });
        if (result.success && result.user) {
          onLogin(result.user);
          onClose();
          resetForm();
        } else {
          setError(result.error || '登录失败');
        }
      } else {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          setIsLoading(false);
          return;
        }

        const result = registerUser({ username, password });
        if (result.success && result.user) {
          onLogin(result.user);
          onClose();
          resetForm();
        } else {
          setError(result.error || '注册失败');
        }
      }
    } catch (err) {
      setError('操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-md shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-8 pb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">
              {mode === 'login' ? '登录账户' : '创建账户'}
            </h2>
            <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
          </div>

          <p className="text-white/30 text-sm">
            {mode === 'login'
              ? '登录后您的API配置将自动加载'
              : '创建账户来保存和管理您的API配置'
            }
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-indigo-500 transition-all"
                placeholder="输入用户名"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-indigo-500 transition-all"
                placeholder="输入密码"
                required
                disabled={isLoading}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-indigo-500 transition-all"
                  placeholder="再次输入密码"
                  required
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-white text-black rounded-xl font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            {isLoading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-white/40 hover:text-white text-sm transition-colors"
              disabled={isLoading}
            >
              {mode === 'login' ? '还没有账户？点击注册' : '已有账户？点击登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserAuthModal;