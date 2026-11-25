import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { UserProfileSummary } from '../types';
import { apiFetch, setAuthToken } from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserProfileSummary) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const res = await apiFetch<{ user: UserProfileSummary; token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
        onClose();
      } else {
        const res = await apiFetch<{ user: UserProfileSummary; token: string }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ username, displayName, email, password }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfileSummary; token: string }>('/api/auth/demo', {
        method: 'POST',
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in unavailable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md bg-[#111115] border border-white/15 rounded-t-3xl sm:rounded-2xl p-6 pb-safe"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display font-bold text-xl text-white">
              {mode === 'login' ? 'Sign in to Velo' : 'Create your Velo account'}
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Like, comment, follow creators, and publish short videos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#1A1A21] rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'login' ? 'bg-[#282832] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
            }}
            className={`py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'signup' ? 'bg-[#282832] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'login' ? (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Username or email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="kael or kael@velo.app"
                className="w-full bg-[#191920] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="alex_film"
                    maxLength={24}
                    className="w-full bg-[#191920] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Display name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                    maxLength={40}
                    className="w-full bg-[#191920] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full bg-[#191920] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full bg-[#191920] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </div>

          {error && (
            <p className="text-xs text-[#FF2E54] bg-[#FF2E54]/10 border border-[#FF2E54]/25 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <span>{loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-zinc-500">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleDemoSignIn}
          disabled={loading}
          className="w-full h-11 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-white/10 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-[#00E5CC]" />
          <span>Continue as demo creator (@kael)</span>
        </button>
      </motion.div>
    </div>
  );
}
