import React from "react";
import { Bug, HeartPulse, CheckCircle2, Play, Plus, X, HelpCircle, FileCode } from "lucide-react";

interface BreakpointsPanelProps {
  isDebuggerMode: boolean;
  setIsDebuggerMode: (active: boolean) => void;
  activeBreakpointLine: number | null;
  handleResumeScript: () => void;
  jumpToLine: (line: number) => void;
  breakpoints: Record<string, number[]>;
  activeFileName: string;
  setBreakpoints: React.Dispatch<React.SetStateAction<Record<string, number[]>>>;
  toggleBreakpoint: (line: number, file?: string) => void;
  handleSwitchFileAndJump: (fileName: string, line: number) => void;
  cursorPos: { line: number; column: number };
  breakpointsMuted: boolean;
  setBreakpointsMuted: (muted: boolean) => void;
  addTerminalLine: (message: string, type: "info" | "success" | "warning" | "error" | "log") => void;
}

export default function BreakpointsPanel({
  isDebuggerMode,
  setIsDebuggerMode,
  activeBreakpointLine,
  handleResumeScript,
  jumpToLine,
  breakpoints,
  activeFileName,
  setBreakpoints,
  toggleBreakpoint,
  handleSwitchFileAndJump,
  cursorPos,
  breakpointsMuted,
  setBreakpointsMuted,
  addTerminalLine,
}: BreakpointsPanelProps) {
  // Count total breakpoints across all files
  const totalBreakpoints = Object.values(breakpoints).reduce((sum, lines) => sum + lines.length, 0);

  // Get active file's breakpoints
  const activeFileBreakpoints = breakpoints[activeFileName] || [];

  // Flatten and sort breakpoints for display list
  const allBreakpointsList = Object.entries(breakpoints)
    .flatMap(([fileName, lines]) => lines.map((line) => ({ fileName, line })))
    .sort((a, b) => {
      if (a.fileName !== b.fileName) {
        return a.fileName.localeCompare(b.fileName);
      }
      return a.line - b.line;
    });

  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3.5 bg-[#0d1117] font-sans">
      {/* Panel Header */}
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 text-red-400">
          <Bug className="h-3.5 w-3.5" />
          <span className="tracking-widest">Breakpoint Manager</span>
        </div>
        <span className="text-[8.5px] bg-[#161b22] border border-[#30363d] px-2 py-0.5 rounded font-mono text-zinc-400">
          {totalBreakpoints} Active
        </span>
      </div>

      <div className="flex-grow flex flex-col min-h-0 space-y-4 justify-between text-left">
        <div className="space-y-4 flex-grow overflow-y-auto pr-1 select-none scrollbar-thin">
          {/* Debugger Mode Check/Alert */}
          {!isDebuggerMode ? (
            <div className="p-3 border border-amber-900/40 bg-amber-955/10 rounded-lg text-xs leading-relaxed text-amber-300">
              <div className="font-bold flex items-center gap-2 mb-1.5 text-amber-400">
                <HeartPulse className="h-4 w-4 animate-pulse shrink-0" />
                <span>Debugger Mode Inactive</span>
              </div>
              <p className="mb-2.5 text-zinc-400 text-[11px]">
                Breakpoints will be ignored unless you enable **Debugger Mode** in the top control bar.
              </p>
              <button
                onClick={() => {
                  setIsDebuggerMode(true);
                  localStorage.setItem("playwright_debugger_mode", "true");
                  addTerminalLine("Execution: Debugger mode enabled via Breakpoint Manager.", "info");
                }}
                className="px-2.5 py-1 bg-amber-600/35 border border-amber-500/30 text-amber-300 rounded hover:bg-amber-600/50 hover:text-white transition-all text-[10px] font-bold cursor-pointer"
              >
                Enable Debugger Mode
              </button>
            </div>
          ) : (
            <div className="p-3 border border-emerald-900/40 bg-[#1f2937]/35 rounded-lg text-xs text-emerald-400">
              <div className="font-bold flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Debugger Mode Active</span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-tight">
                The runner will run in slow-motion and automatically pause execution at your breakpoints.
              </p>
            </div>
          )}

          {/* Active Pause Alert */}
          {activeBreakpointLine !== null && (
            <div className="p-3 border border-blue-900/50 bg-[#1e3a8a]/20 rounded-lg text-xs leading-relaxed text-blue-300 animate-pulse text-left shadow-lg">
              <div className="font-bold flex items-center gap-2 mb-1.5 text-blue-400">
                <Play className="h-4 w-4 rotate-90 shrink-0 text-blue-500 fill-blue-500/20" />
                <span>Execution Suspended</span>
              </div>
              <p className="mb-2.5 text-zinc-300 text-[11px]">
                Halted at **Line {activeBreakpointLine}** in <code>{activeFileName}</code>. Review variables and state.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleResumeScript}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-[10.5px] cursor-pointer flex items-center gap-1 shadow-md shadow-blue-900/20"
                >
                  <Play className="h-3 w-3 fill-white" /> Resume Run
                </button>
                <button
                  onClick={() => jumpToLine(activeBreakpointLine)}
                  className="px-3 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-zinc-300 hover:text-white font-semibold rounded text-[10.5px] cursor-pointer"
                >
                  Show Line
                </button>
              </div>
            </div>
          )}

          {/* Quick Add Breakpoint Form */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3.5 space-y-2.5 shadow-md">
            <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider block select-none">
              Add Breakpoint to <code className="text-zinc-200 lowercase font-mono">{activeFileName}</code>
            </span>
            
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                id="new-breakpoint-line-input"
                placeholder="Line number..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = parseInt((e.target as HTMLInputElement).value, 10);
                    if (val > 0) {
                      if (!activeFileBreakpoints.includes(val)) {
                        toggleBreakpoint(val, activeFileName);
                      }
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
                className="flex-1 min-w-0 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-red-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-semibold font-mono"
              />
              <button
                onClick={() => {
                  const input = document.getElementById("new-breakpoint-line-input") as HTMLInputElement;
                  const val = parseInt(input?.value || "", 10);
                  if (val > 0) {
                    if (!activeFileBreakpoints.includes(val)) {
                      toggleBreakpoint(val, activeFileName);
                    }
                    input.value = "";
                  }
                }}
                className="px-3.5 py-1.5 bg-red-650 hover:bg-red-550 text-white rounded text-xs font-semibold cursor-pointer shrink-0 transition-colors"
              >
                Add
              </button>
            </div>

            <button
              onClick={() => {
                if (cursorPos.line > 0 && !activeFileBreakpoints.includes(cursorPos.line)) {
                  toggleBreakpoint(cursorPos.line, activeFileName);
                } else if (cursorPos.line > 0 && activeFileBreakpoints.includes(cursorPos.line)) {
                  addTerminalLine(`Debugger: Breakpoint at line ${cursorPos.line} already exists in ${activeFileName}`, "info");
                }
              }}
              className="w-full py-1.5 border border-[#30363d] hover:border-red-500/30 hover:bg-red-950/10 text-zinc-400 hover:text-red-400 text-[10px] font-semibold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3 w-3" /> Breakpoint at Cursor (Line {cursorPos.line})
            </button>
          </div>

          {/* Mute Breakpoints Control */}
          <div className="flex items-center justify-between p-3 bg-[#161b22] border border-[#30363d] rounded-xl shadow-md">
            <div className="flex flex-col select-none">
              <span className="text-[10.5px] font-bold text-zinc-300">Mute Breakpoints</span>
              <span className="text-[9px] text-zinc-500">Temporarily ignore all stops</span>
            </div>
            <button
              onClick={() => {
                const newVal = !breakpointsMuted;
                setBreakpointsMuted(newVal);
                localStorage.setItem("playwright_breakpoints_muted", newVal.toString());
                addTerminalLine(`Debugger: Breakpoints are now ${newVal ? "MUTED" : "UNMUTED"}`, "info");
              }}
              className={`h-6.5 px-3 border rounded text-[10px] font-bold transition-all cursor-pointer ${
                breakpointsMuted
                  ? "bg-amber-955/40 border-amber-500/50 text-amber-400 font-bold"
                  : "bg-[#21262d] border-[#30363d] text-[#8b949e] hover:bg-[#30363d] hover:text-white"
              }`}
            >
              {breakpointsMuted ? "MUTED" : "MUTE"}
            </button>
          </div>

          {/* List of Breakpoints */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 select-none">
              <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider">Breakpoints List ({totalBreakpoints})</span>
              {totalBreakpoints > 0 && (
                <button
                  onClick={() => {
                    setBreakpoints({});
                    localStorage.setItem("playwright_breakpoints_map", "{}");
                    addTerminalLine("Debugger: Cleared all breakpoints", "info");
                  }}
                  className="text-[9.5px] text-zinc-500 hover:text-red-400 font-semibold cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {totalBreakpoints === 0 ? (
              <div className="text-center py-8 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/5 select-none my-auto">
                <Bug className="h-8 w-8 mx-auto opacity-30 mb-2 text-zinc-500" />
                <p className="text-[11px] font-bold text-zinc-400 mb-0.5">No Active Breakpoints</p>
                <p className="text-[10px] text-zinc-500 max-w-[190px] mx-auto leading-relaxed text-center">
                  Click to the left of the line numbers in the editor, or use the quick form above to set breakpoints.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] md:max-h-none overflow-y-auto scrollbar-thin pr-0.5">
                {allBreakpointsList.map(({ fileName, line }, idx) => {
                  const isActiveFile = fileName === activeFileName;
                  const isCurrentPausedLine = activeBreakpointLine === line && isActiveFile;

                  return (
                    <div
                      key={`breakpoint-${fileName}-${line}-${idx}`}
                      className={`p-2.5 bg-[#161b22] border rounded-lg flex items-center justify-between gap-2.5 hover:border-[#444c56] transition-colors group ${
                        isActiveFile ? "border-[#30363d]/90" : "border-[#30363d]/40 opacity-70 hover:opacity-100"
                      } ${isCurrentPausedLine ? "border-blue-500 bg-blue-950/10 animate-pulse" : ""}`}
                    >
                      <button
                        onClick={() => handleSwitchFileAndJump(fileName, line)}
                        className="flex-1 min-w-0 text-left cursor-pointer flex flex-col gap-0.5 group-hover:text-white font-sans font-medium"
                        title={`Switch to ${fileName} & jump to line ${line}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            breakpointsMuted ? "bg-amber-400/70" : "bg-red-500"
                          }`} />
                          <span className="text-[11px] font-mono text-zinc-200 font-semibold">Line {line}</span>
                          {isCurrentPausedLine && (
                            <span className="text-[8px] bg-blue-950 border border-blue-500/50 text-blue-400 px-1.5 py-0.2 rounded font-bold font-sans tracking-wider uppercase">Active Pause</span>
                          )}
                        </div>
                        <div className="text-[9px] text-[#8b949e] font-mono flex items-center gap-1">
                          <FileCode className="h-3 w-3 shrink-0 text-zinc-500" />
                          <span className="truncate">{fileName}</span>
                        </div>
                      </button>

                      <button
                        onClick={() => toggleBreakpoint(line, fileName)}
                        className="p-1 rounded text-zinc-550 hover:text-rose-400 hover:bg-[#30363d] cursor-pointer transition-colors"
                        title="Remove Breakpoint"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Tip */}
        <div className="pt-2 border-t border-[#30363d]/50 shrink-0 text-zinc-550 text-[10px] leading-relaxed flex items-start gap-1.5 select-none font-sans">
          <HelpCircle className="text-red-400 h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Tip: Placing <code>await page.pause()</code> directly in your code also triggers a full visual interactive pause!</span>
        </div>
      </div>
    </div>
  );
}
