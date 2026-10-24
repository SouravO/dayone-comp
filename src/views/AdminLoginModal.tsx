import React, { useState } from 'react';
import { adminLogin } from '../services/api.ts';
import { Lock, X } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await adminLogin(password);
      if (res.success) {
        localStorage.setItem('dayone_admin_token', res.token);
        onLoginSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Try password: dayone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#101014] border border-neutral-800 rounded-3xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center mx-auto mb-2">
            <Lock size={22} />
          </div>
          <h3 className="text-lg font-bold font-display text-white">Day One Admin Login</h3>
          <p className="text-xs text-neutral-400 mt-1">
            Access competition creator & live controls
          </p>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/40 border border-red-900 rounded-xl text-xs text-red-300 mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Admin Password
            </label>
            <input
              type="password"
              required
              autoFocus
              placeholder="Enter admin password (dayone)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md shadow-red-700/30 transition-all active:scale-95"
          >
            {loading ? 'Authenticating...' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
    </div>
  );
};
