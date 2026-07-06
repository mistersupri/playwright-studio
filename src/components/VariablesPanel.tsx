import React from "react";
import { Lock, Plus, Edit, Trash2, SlidersHorizontal, RefreshCw, Check } from "lucide-react";
import { EnvWorkspace } from "../types";

interface VariablesPanelProps {
  envVars: any[];
  setEnvVars: React.Dispatch<React.SetStateAction<any[]>>;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  envWorkspaces: EnvWorkspace[];
  setWorkspaceModalName: (name: string) => void;
  setWorkspaceModalMode: (mode: "create" | "rename" | null) => void;
  setWorkspaceToDelete: (ws: { id: string; name: string } | null) => void;
  addTerminalLine: (message: string, type: "info" | "success" | "warning" | "error" | "log") => void;
  handleSaveVariable: (id: string) => void;
  setEnvToRevoke: (env: { id: string; key: string } | null) => void;
}

export default function VariablesPanel({
  envVars,
  setEnvVars,
  activeWorkspaceId,
  setActiveWorkspaceId,
  envWorkspaces,
  setWorkspaceModalName,
  setWorkspaceModalMode,
  setWorkspaceToDelete,
  addTerminalLine,
  handleSaveVariable,
  setEnvToRevoke,
}: VariablesPanelProps) {
  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3 bg-[#0d1117] font-sans">
      {/* Header */}
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-blue-400">
          <Lock className="h-3 w-3" />
          <span>Env Variables</span>
        </div>
        <button
          onClick={() => {
            setEnvVars(prev => [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                key: "",
                value: "",
                isSecret: true,
                isSaved: false
              }
            ]);
          }}
          title="Add environment variable"
          className="p-1 px-1.5 text-zinc-400 hover:text-white bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded transition cursor-pointer flex items-center gap-1 text-[9px] font-semibold"
        >
          <Plus className="h-3 w-3 text-emerald-500 hover:scale-105" />
          <span>Add Var</span>
        </button>
      </div>

      {/* Active Project Environment Info */}
      <div className="p-2.5 mb-2 bg-[#161b22]/50 border border-[#30363d] rounded-md shrink-0 flex items-center gap-2 selection:bg-blue-600/30 font-sans text-xs">
        <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <span className="text-zinc-400 shrink-0">Environment for project:</span>
        <span className="text-white font-semibold truncate">
          {envWorkspaces.find(ws => ws.id === activeWorkspaceId)?.name || "Default Project"}
        </span>
      </div>

      {/* Informational description */}
      <div className="p-2 mb-3 rounded bg-zinc-950/40 border border-zinc-800 text-[9.5px] leading-relaxed text-zinc-400 shrink-0">
        Variables will be injected into <code>process.env</code> in the runner during script executions.
      </div>

      {/* Vars List */}
      <div className="flex-grow overflow-y-auto space-y-2.5 pr-1 pb-2 scrollbar-thin">
        {envVars.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e] border border-dashed border-[#30363d] rounded p-3 select-none">
            <SlidersHorizontal className="h-5 w-5 mx-auto opacity-30 mb-2 text-blue-400" />
            <p className="text-[10px] leading-relaxed mb-1.5 text-zinc-400">No variables configured yet.</p>
            <button
              onClick={() => {
                setEnvVars([
                  { id: "example1", key: "TARGET_API_KEY", value: "abc_sk_12345", isSecret: true, isSaved: false }
                ]);
              }}
              className="text-[9px] text-blue-400 font-semibold hover:underline cursor-pointer"
            >
              Load an example?
            </button>
          </div>
        ) : (
          envVars.map((env, idx) => {
            const isSaved = !!env.isSaved;

            return (
              <div 
                key={`env-${env.id || "no-id"}-${idx}`} 
                className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg space-y-2 relative group transition hover:border-[#484f58] text-left"
              >
                {/* KEY HEADER */}
                <div className="flex items-center justify-between gap-1.5 select-none">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">
                    {isSaved ? "Saved Secure Key" : "Variable Key"}
                  </span>
                  {isSaved && (
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 font-medium">Secured & Active</span>
                  )}
                </div>

                {/* KEY FIELD */}
                <input
                  type="text"
                  disabled={isSaved}
                  value={env.key}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""); // uppercase standard env naming
                    setEnvVars(prev => prev.map(v => v.id === env.id ? { ...v, key: val } : v));
                  }}
                  placeholder="KEY_NAME"
                  className={`w-full bg-[#0d1117] border rounded px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none transition-colors ${
                    isSaved 
                      ? "border-zinc-800 text-zinc-400 bg-zinc-950/30 cursor-not-allowed select-none" 
                      : "border-[#30363d] text-amber-400 focus:border-[#484f58] placeholder-zinc-700"
                  }`}
                />

                {/* VALUE HEADER & VALUE BODY */}
                {!isSaved && (
                  <>
                    <div className="flex items-center justify-between gap-1.5 pt-0.5 select-none text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                      <span>Value</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-900/30 font-medium">Draft (Plaintext)</span>
                    </div>

                    <input
                      type="password"
                      value={env.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEnvVars(prev => prev.map(v => v.id === env.id ? { ...v, value: val } : v));
                      }}
                      placeholder="Secret value..."
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded px-2.5 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none placeholder-zinc-700 transition-colors"
                    />
                  </>
                )}

                {/* ACTION BUTTON SYSTEM: SAVE, RENEW, REVOKE */}
                <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-[#30363d]/50">
                  {isSaved ? (
                    <>
                      <button
                        onClick={() => {
                          setEnvVars(prev => prev.map(v => v.id === env.id ? { ...v, backupKey: v.key, backupValue: v.value, value: "", isSaved: false, wasSaved: true } : v));
                          addTerminalLine(`Renewing variable "${env.key}": Enter new secret value to save.`, "warning");
                        }}
                        className="px-2 py-1 text-[9.5px] rounded bg-[#21262d] text-zinc-200 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition flex items-center gap-1 cursor-pointer font-medium"
                        title="Change or renew secret value"
                      >
                        <RefreshCw className="h-2.5 w-2.5 text-blue-400" />
                        <span>Renew</span>
                      </button>
                      <button
                        onClick={() => {
                          setEnvToRevoke({ id: env.id, key: env.key || "Untitled" });
                        }}
                        className="px-2 py-1 text-[9.5px] rounded bg-rose-950/30 text-rose-400 border border-rose-950 hover:bg-rose-900/60 hover:text-white transition flex items-center gap-1 cursor-pointer font-medium"
                        title="Delete variable"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        <span>Revoke</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSaveVariable(env.id)}
                        className="px-2.5 py-1 text-[9.5px] rounded bg-emerald-600 text-white hover:bg-emerald-500 transition flex items-center gap-1 cursor-pointer font-semibold shadow-sm"
                        title="Lock & save secure environment variable"
                      >
                        <Check className="h-3 w-3" />
                        <span>Save value</span>
                      </button>
                      <button
                        onClick={() => {
                          if (env.wasSaved) {
                            setEnvVars(prev => prev.map(v => v.id === env.id ? { ...v, key: env.backupKey || v.key, value: env.backupValue || "", isSaved: true, wasSaved: false, backupKey: undefined, backupValue: undefined } : v));
                            addTerminalLine(`Restored original saved state for variable "${env.key}"`, "info");
                          } else {
                            setEnvVars(prev => prev.filter(item => item.id !== env.id));
                          }
                        }}
                        className="px-2 py-1 text-[9.5px] rounded bg-[#21262d] text-zinc-400 border border-[#30363d] hover:bg-zinc-800 hover:text-white transition cursor-pointer font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
