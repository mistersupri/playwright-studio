import React from "react";
import { Sparkles, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { User } from "../firebase";

interface AIPanelProps {
  user: User | null;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  generatingScript: boolean;
  aiError: string | null;
  aiSuccessMessage: string | null;
  aiGenerationMode: "replace" | "append" | "prepend";
  setAiGenerationMode: (mode: "replace" | "append" | "prepend") => void;
  aiGeneratedExplanation: string | null;
  handleGenerateAIScript: () => void;
}

export default function AIPanel({
  user,
  aiPrompt,
  setAiPrompt,
  generatingScript,
  aiError,
  aiSuccessMessage,
  aiGenerationMode,
  setAiGenerationMode,
  aiGeneratedExplanation,
  handleGenerateAIScript,
}: AIPanelProps) {
  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3 bg-[#0d1117] font-sans text-left">
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-amber-400 font-sans">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span>AI Script Generator</span>
        </div>
        <span className="text-[8px] bg-amber-955 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded border border-amber-900/40 flex items-center gap-1 select-none font-sans">
          Gemini Active
        </span>
      </div>

      {!user ? (
        <div className="text-center py-8 text-[#8b949e] border border-dashed border-[#30363d] rounded p-4 select-none my-auto">
          <Sparkles className="h-8 w-8 mx-auto text-amber-500 opacity-40 mb-3 animate-pulse" />
          <p className="text-[11px] leading-relaxed font-semibold text-zinc-300 mb-1">Google Search & AI Integration</p>
          <p className="text-[10px] text-zinc-500">Sign in with Google to enable instant prompt-to-script code synthesis powered by Gemini.</p>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0 space-y-3 justify-between">
          
          {/* Preset Suggestions */}
          <div className="shrink-0 space-y-1.5 select-none">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider select-none px-1">Quick prompts:</span>
            <div className="grid grid-cols-2 gap-1.5 pr-1">
              <button
                onClick={() => setAiPrompt("Extract page details, find all title headings and count them, then print them out on console.")}
                className="p-1 px-1.5 text-left rounded bg-[#161b22] border border-[#30363d] hover:border-amber-400/40 text-[#8b949e] hover:text-white text-[10px] transition cursor-pointer flex items-center gap-1 truncate"
              >
                🚀 <span className="truncate">Extract Headings</span>
              </button>
              <button
                onClick={() => setAiPrompt("Goto Wikipedia, find the entry for Playwright, extract the lead summary text, and save the page as a PDF.")}
                className="p-1 px-1.5 text-left rounded bg-[#161b22] border border-[#30363d] hover:border-amber-400/40 text-[#8b949e] hover:text-white text-[10px] transition cursor-pointer flex items-center gap-1 truncate"
              >
                📄 <span className="truncate">Save PDF summary</span>
              </button>
              <button
                onClick={() => setAiPrompt("Goto news.ycombinator.com, capture a complete full-page screenshot of the homepage, and return the titles.")}
                className="p-1 px-1.5 text-left rounded bg-[#161b22] border border-[#30363d] hover:border-amber-400/40 text-[#8b949e] hover:text-white text-[10px] transition cursor-pointer flex items-center gap-1 truncate"
              >
                📸 <span className="truncate">YCombinator Capture</span>
              </button>
              <button
                onClick={() => setAiPrompt("Create a spreadsheet workbook tracking weather metrics, populate with columns City, Temperature and Weather, and write the file weather.xlsx to root.")}
                className="p-1 px-1.5 text-left rounded bg-[#161b22] border border-[#30363d] hover:border-amber-400/40 text-[#8b949e] hover:text-white text-[10px] transition cursor-pointer flex items-center gap-1 truncate"
              >
                📊 <span className="truncate">Excel Generation</span>
              </button>
            </div>
          </div>

          {/* Input form */}
          <div className="flex-grow flex flex-col min-h-0 space-y-2">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider select-none px-1">Script instructions:</span>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe what browser automation you would like Playwright to perform... (e.g., 'Go to Github trending, extract the top 10 repos and print their descriptions, then screenshot')"
              disabled={generatingScript}
              className="flex-grow min-h-[100px] w-full bg-[#0d1117] border border-[#30363d] focus:border-amber-500/50 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none placeholder-zinc-700 resize-none leading-relaxed transition-all scrollbar-thin select-text"
            />

            {/* Mode integration select */}
            <div className="bg-[#161b22] p-2 rounded-lg border border-[#30363d] space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-wider px-0.5 select-none">
                <span>Integration Mode</span>
              </div>
              <div className="grid grid-cols-3 gap-1 select-none">
                {(["replace", "append", "prepend"] as const).map((m) => (
                  <button
                    key={`ai-mode-${m}`}
                    onClick={() => setAiGenerationMode(m)}
                    disabled={generatingScript}
                    className={`p-1 py-1.5 text-center text-[10px] font-semibold border rounded-md transition-all cursor-pointer capitalize ${
                      aiGenerationMode === m
                        ? "bg-amber-955/20 border-amber-500 text-amber-400 focus:outline-none font-bold"
                        : "bg-black/30 border-[#30363d] text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Errors and Feedback panel */}
          {aiError && (
            <div className="p-2 border border-rose-900 bg-rose-955/15 text-rose-300 rounded-lg text-[10.5px] leading-relaxed flex items-start gap-1.5 select-none shrink-0 text-left">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {aiSuccessMessage && (
            <div className="p-2 border border-emerald-900 bg-emerald-950/15 text-emerald-300 rounded-lg text-[10.5px] leading-relaxed flex items-start gap-1.5 select-none shrink-0 text-left">
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="truncate">{aiSuccessMessage}</span>
            </div>
          )}

          {/* Explanation drawer when we have code generated */}
          {aiGeneratedExplanation && (
            <div className="p-1 px-2 border border-[#30363d] bg-black/40 text-zinc-305 rounded-lg text-[10px] leading-relaxed max-h-24 overflow-y-auto scrollbar-thin text-left shrink-0 select-text">
              <div className="font-sans font-bold text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5 select-none">AI Explanation:</div>
              {aiGeneratedExplanation}
            </div>
          )}

          {/* Execute Generation Button */}
          <div className="shrink-0 pt-1 select-none">
            <button
              onClick={handleGenerateAIScript}
              disabled={generatingScript || !aiPrompt.trim()}
              className="w-full h-8 cursor-pointer rounded-lg font-semibold bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-zinc-800 via-zinc-800 disabled:to-zinc-850 text-white disabled:text-zinc-600 transition duration-300 flex items-center justify-center gap-2 text-xs shadow-md"
            >
              {generatingScript ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Synthesizing script with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-yellow-305" />
                  <span>Generate Script</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
