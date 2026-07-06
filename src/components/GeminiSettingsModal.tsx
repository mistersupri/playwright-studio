import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Settings, X, ShieldAlert, CheckCircle2, DollarSign, Calculator, HelpCircle } from "lucide-react";

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (val: string) => void;
  model: string;
  setModel: (val: string) => void;
  captchaCount: number;
  onSave: () => Promise<void>;
  saving: boolean;
  message: { text: string; type: "success" | "error" } | null;
  setMessage: (msg: { text: string; type: "success" | "error" } | null) => void;
}

export default function GeminiSettingsModal({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  model,
  setModel,
  captchaCount,
  onSave,
  saving,
  message,
  setMessage,
}: GeminiSettingsModalProps) {
  // Estimated pricing details
  const pricingData: Record<string, { name: string; inputRate: number; outputRate: number; avgCost: number }> = {
    "gemini-2.5-flash": {
      name: "Gemini 2.5 Flash (Recommended)",
      inputRate: 0.075, // $ per 1M tokens
      outputRate: 0.30, // $ per 1M tokens
      avgCost: 0.0002775, // Estimated average cost per CAPTCHA solving
    },
    "gemini-2.5-pro": {
      name: "Gemini 2.5 Pro (High Accuracy)",
      inputRate: 1.25,
      outputRate: 5.00,
      avgCost: 0.004625,
    },
    "gemini-1.5-flash": {
      name: "Gemini 1.5 Flash",
      inputRate: 0.075,
      outputRate: 0.30,
      avgCost: 0.0002775,
    },
    "gemini-1.5-pro": {
      name: "Gemini 1.5 Pro",
      inputRate: 1.25,
      outputRate: 5.00,
      avgCost: 0.004625,
    },
  };

  const selectedPricing = pricingData[model] || pricingData["gemini-2.5-flash"];
  const estimatedTotalCost = (captchaCount * selectedPricing.avgCost).toFixed(5);

  const handleSaveClick = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          {/* Backdrop Click */}
          <div className="absolute inset-0 cursor-default" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-lg w-full p-6 text-left font-sans space-y-5 select-none overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3.5">
              <div className="flex items-center gap-2 text-amber-400">
                <Settings className="h-4 w-4" />
                <h3 className="text-sm font-bold text-white">Gemini API Settings</h3>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-[#21262d] rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Notification message */}
            {message && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  message.type === "success"
                    ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-400"
                    : "bg-rose-950/30 border-rose-800/50 text-rose-400"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {message.type === "success" ? "Settings Saved" : "Configuration Error"}
                  </p>
                  <p className="text-[11px] mt-0.5 opacity-90">{message.text}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveClick} className="space-y-4">
              {/* Gemini API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                  Gemini API Key
                  <HelpCircle className="h-3 w-3 text-zinc-500 cursor-help" title="Input your personal Google AI Studio API key." />
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setMessage(null);
                    setApiKey(e.target.value);
                  }}
                  placeholder="Paste your GEMINI_API_KEY here..."
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-[10px] text-[#8b949e]">
                  Your key is encrypted on the backend database and never exposed to the browser during execution.
                </p>
              </div>

              {/* Gemini Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Default CAPTCHA Solver Model</label>
                <select
                  value={model}
                  onChange={(e) => {
                    setMessage(null);
                    setModel(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended - Ultrafast & Cheap)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Extremely Smart & Accurate)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy Fast)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy Complex)</option>
                </select>
              </div>

              {/* API Usage & Cost Section */}
              <div className="border border-[#30363d] rounded-lg bg-[#0d1117] p-4.5 space-y-3.5">
                <div className="flex items-center gap-2 text-zinc-200 border-b border-[#30363d]/50 pb-2">
                  <Calculator className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold">API Usage & Cost Estimation</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#161b22] border border-[#30363d]/70 rounded-lg p-3 text-center space-y-1">
                    <p className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">CAPTCHA Solved</p>
                    <p className="text-xl font-extrabold text-white">{captchaCount}</p>
                    <p className="text-[9.5px] text-[#8b949e]">using personal key</p>
                  </div>

                  <div className="bg-[#161b22] border border-[#30363d]/70 rounded-lg p-3 text-center space-y-1 relative overflow-hidden">
                    <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-0.5">
                      <DollarSign className="h-3 w-3 shrink-0" />
                      Estimated Cost
                    </p>
                    <p className="text-xl font-extrabold text-emerald-400">${estimatedTotalCost}</p>
                    <p className="text-[9.5px] text-[#8b949e]">at current rates</p>
                  </div>
                </div>

                {/* Rates breakdown info */}
                <div className="text-[10px] text-zinc-400 space-y-1 bg-[#161b22]/50 p-2.5 rounded border border-[#30363d]/30">
                  <p className="font-semibold text-zinc-300">Model Rates ({selectedPricing.name}):</p>
                  <div className="flex justify-between">
                    <span>Input rate per 1M tokens:</span>
                    <span className="font-mono text-zinc-200">${selectedPricing.inputRate.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Output rate per 1M tokens:</span>
                    <span className="font-mono text-zinc-200">${selectedPricing.outputRate.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#30363d]/40 pt-1 mt-1 text-zinc-300">
                    <span>Avg. CAPTCHA solve cost:</span>
                    <span className="font-mono font-semibold text-emerald-400">~${selectedPricing.avgCost.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs rounded-lg bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white transition-all font-semibold cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-900/10"
                >
                  {saving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
