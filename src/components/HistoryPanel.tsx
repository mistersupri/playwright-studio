import React from "react";
import { RefreshCw, Terminal, Clock, FileCode, CheckCircle2, AlertCircle, Database, Calendar } from "lucide-react";
import { RunHistoryItem } from "../types";
import { User } from "../firebase";

interface HistoryPanelProps {
  user: User | null;
  loadingHistory: boolean;
  runHistory: RunHistoryItem[];
  setTerminalLines: (lines: any) => void;
  setArtifacts: (artifacts: any) => void;
  addTerminalLine: (message: string, type: "info" | "success" | "warning" | "error" | "log") => void;
}

export default function HistoryPanel({
  user,
  loadingHistory,
  runHistory,
  setTerminalLines,
  setArtifacts,
  addTerminalLine,
}: HistoryPanelProps) {
  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3.5 bg-[#0d1117] font-sans">
      {/* Panel Header */}
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 text-blue-400">
          <Database className="h-3.5 w-3.5" />
          <span className="tracking-widest">Execution History</span>
        </div>
        <span className="text-[8.5px] bg-[#161b22] border border-[#30363d] px-2 py-0.5 rounded font-mono text-zinc-400">
          {runHistory.length} Runs
        </span>
      </div>
      
      {!user ? (
        <div className="text-center py-10 px-4 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/20 select-none my-auto max-w-sm mx-auto">
          <Database className="h-10 w-10 mx-auto text-blue-500/40 mb-3" />
          <h4 className="text-xs font-semibold text-zinc-300 mb-1">Durable Execution Records</h4>
          <p className="text-[10px] text-zinc-550 leading-relaxed">
            Sign in with Google to securely store, search, and recall your historic encrypted run logs and visual outputs.
          </p>
        </div>
      ) : loadingHistory ? (
        <div className="flex flex-col items-center justify-center py-12 text-xs text-[#8b949e] gap-2.5 my-auto">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="font-mono text-[10px] tracking-wider uppercase text-zinc-400">Loading historical runs...</span>
        </div>
      ) : runHistory.length === 0 ? (
        <div className="text-center py-10 px-4 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/20 select-none my-auto max-w-sm mx-auto">
          <Terminal className="h-10 w-10 mx-auto text-zinc-600/40 mb-3" />
          <h4 className="text-xs font-semibold text-zinc-400 mb-1">No Runs Recorded Yet</h4>
          <p className="text-[10px] text-zinc-550 leading-relaxed">
            Run a Playwright script inside the editor to generate logs and outputs that populate this history panel automatically.
          </p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-2.5 pr-1 scrollbar-thin select-none">
          {runHistory.map((run, idx) => {
            const isSuccess = run.status === "success";
            const runDate = new Date(run.createdAt);
            const timeString = runDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const dateString = runDate.toLocaleDateString([], { month: "short", day: "numeric" });

            return (
              <div
                key={`run-history-${run.id || "no-id"}-${idx}`}
                onClick={() => {
                  // Restore state from this decrypted historical record
                  setTerminalLines(run.terminalLogs.map((log, idx) => ({
                    id: `hist-${idx}`,
                    message: log,
                    timestamp: new Date(run.createdAt).toLocaleTimeString(),
                    type: log.startsWith("ERROR:") || log.startsWith("Error:") ? "error" : log.startsWith("Execution:") ? "info" : "log"
                  })));
                  setArtifacts(run.artifacts.map((art) => ({
                    ...art,
                    timestamp: new Date(run.createdAt).toLocaleTimeString()
                  })));
                  addTerminalLine(`Restored execution state of custom run: "${run.scriptName}" executed at ${new Date(run.createdAt).toLocaleString()}`, "info");
                }}
                className="group p-3 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#8b949e] hover:bg-[#1f242c] transition-all cursor-pointer space-y-2 block text-left"
              >
                {/* Script Title & Status Badge */}
                <div className="flex items-center justify-between gap-2.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <FileCode className="h-3.5 w-3.5 text-zinc-400 shrink-0 group-hover:text-blue-400 transition-colors" />
                    <span className="font-semibold text-zinc-200 truncate text-[11.5px]" title={run.scriptName}>
                      {run.scriptName}
                    </span>
                  </div>
                  
                  <span className={`text-[8.5px] px-2 py-0.5 rounded font-bold border shrink-0 flex items-center gap-1 ${
                    isSuccess 
                      ? "bg-emerald-950/40 border-emerald-900/40 text-emerald-400" 
                      : "bg-rose-955/40 border-rose-900/40 text-rose-400"
                  }`}>
                    {isSuccess ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-2.5 w-2.5 text-rose-400" />
                    )}
                    <span>{run.status.toUpperCase()}</span>
                  </span>
                </div>

                {/* Info Metadata Bar */}
                <div className="text-[10px] text-zinc-500 font-mono flex items-center justify-between select-none pt-1 border-t border-[#30363d]/30 group-hover:border-zinc-700/40 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-2.5 w-2.5 text-zinc-600" />
                    <span>{run.artifacts.length} outputs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5 text-zinc-600" />
                      <span>{dateString}</span>
                    </span>
                    <span>•</span>
                    <span>{timeString}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

