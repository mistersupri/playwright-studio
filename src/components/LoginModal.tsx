import React from "react";
import { motion } from "motion/react";
import { Lock, X, Zap } from "lucide-react";

interface LoginModalProps {
  key?: React.Key;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  error: string | null;
  loading: boolean;
}

export function LoginModal({
  isOpen,
  onClose,
  onSubmit,
  email,
  setEmail,
  password,
  setPassword,
  error,
  loading
}: LoginModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-left space-y-4 font-sans select-none text-[#c9d1d9]"
      >
        <div className="flex items-center justify-between border-b border-[#30363d] pb-2.5">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-blue-500" />
            <span>Admin Manual Login</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#30363d] rounded text-[#8b949e] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="p-2.5 text-xs bg-red-950/45 border border-red-900/50 rounded-lg text-red-400 font-medium animate-pulse">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider block">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. admin@admin.com"
              className="w-full px-3 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] rounded-md text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider block">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] rounded-md text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
            />
          </div>

          <div className="p-2.5 px-3 rounded bg-blue-950/20 border border-blue-900/30 text-[10.5px] leading-relaxed text-[#8b949e]">
            💡 <span className="text-[#c9d1d9] font-medium">Demo Admin Credentials:</span>
            <div className="mt-1 font-mono grid grid-cols-[50px_1fr] gap-x-1">
              <span>Email:</span> <span className="text-blue-450 font-bold">admin@admin.com</span>
              <span>Pass:</span> <span className="text-blue-450 font-bold">admin123</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#30363d]/50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white transition-all font-semibold cursor-pointer flex items-center justify-center gap-1 shadow-sm"
            >
              {loading ? (
                <>
                  <Zap className="h-3 w-3 animate-spin shrink-0" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 shrink-0 text-blue-200" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default LoginModal;
