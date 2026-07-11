import React from "react";
import { Lock, Plus, Edit, Trash2, SlidersHorizontal, RefreshCw, Check, Eye, EyeOff, Share2, Copy } from "lucide-react";
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
  const [showValues, setShowValues] = React.useState<Record<string, boolean>>({});
  
  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [includeValues, setIncludeValues] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [shareLink, setShareLink] = React.useState("");
  const [copiedShare, setCopiedShare] = React.useState(false);

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

      {/* Interactive Environment Workspace Switcher & Manager */}
      <div className="p-3 mb-2.5 bg-[#161b22]/70 border border-[#30363d] rounded-lg shrink-0 space-y-2 text-left">
        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3 text-blue-400" />
            <span>Select Env Workspace</span>
          </span>
          <button
            onClick={() => {
              setWorkspaceModalName("");
              setWorkspaceModalMode("create");
            }}
            className="text-[9px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
            title="Create new workspace"
          >
            <Plus className="h-2.5 w-2.5" /> Create
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-grow">
            <select
              value={activeWorkspaceId}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] rounded px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none transition cursor-pointer appearance-none pr-8 font-sans"
            >
              {envWorkspaces.map(ws => (
                <option key={`opt-ws-${ws.id}`} value={ws.id} className="bg-[#161b22] text-white">
                  {ws.name} ({ws.vars.length} vars)
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-zinc-400">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Rename */}
            <button
              onClick={() => {
                const currentWS = envWorkspaces.find(ws => ws.id === activeWorkspaceId);
                if (currentWS) {
                  setWorkspaceModalName(currentWS.name);
                  setWorkspaceModalMode("rename");
                }
              }}
              title="Rename this workspace"
              className="p-1.5 bg-[#21262d] hover:bg-zinc-800 border border-[#30363d] text-zinc-300 hover:text-white rounded transition cursor-pointer"
            >
              <Edit className="h-3.5 w-3.5" />
            </button>

            {/* Share */}
            <button
              onClick={() => {
                setIsShareModalOpen(true);
              }}
              title="Share this workspace"
              className="p-1.5 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-900/30 text-blue-400 hover:text-blue-300 rounded transition cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>

            {/* Delete */}
            <button
              disabled={envWorkspaces.length <= 1}
              onClick={() => {
                const currentWS = envWorkspaces.find(ws => ws.id === activeWorkspaceId);
                if (currentWS) {
                  setWorkspaceToDelete({ id: currentWS.id, name: currentWS.name });
                }
              }}
              title={envWorkspaces.length <= 1 ? "Cannot delete the only workspace" : "Delete this workspace"}
              className={`p-1.5 border rounded transition cursor-pointer ${
                envWorkspaces.length <= 1 
                  ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50" 
                  : "bg-rose-950/20 hover:bg-rose-950/40 border-rose-950 text-rose-400 hover:text-rose-300"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Share Workspace Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-5 text-left space-y-4 font-sans text-sm text-zinc-300">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-2.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-blue-400" />
                <span>Share Environment Workspace</span>
              </h3>
              <button
                onClick={() => {
                  setIsShareModalOpen(false);
                  setShareLink("");
                  setCopiedShare(false);
                }}
                className="text-zinc-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!shareLink ? (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Generate a share link for <span className="text-white font-semibold">"{envWorkspaces.find(ws => ws.id === activeWorkspaceId)?.name}"</span> so others can import it instantly.
                </p>

                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#30363d] space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeValues}
                      onChange={(e) => setIncludeValues(e.target.checked)}
                      className="mt-0.5 accent-blue-500 rounded border-[#30363d] focus:ring-0 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="text-white font-medium block">Include plaintext draft values</span>
                      <span className="text-zinc-400 text-[10px] leading-relaxed block mt-0.5">
                        If checked, any variables you have typed but not yet "Saved/Secured" will be included in the share. Secured/Saved keys will always be shared with empty values for security.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsShareModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-zinc-800 hover:text-white transition cursor-pointer font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setIsGenerating(true);
                      try {
                        const currentWS = envWorkspaces.find(ws => ws.id === activeWorkspaceId);
                        if (!currentWS) return;

                        // Filter workspace data based on preference
                        const sharedVars = currentWS.vars.map(v => {
                          const isDraftAndAllowed = !v.isSaved && includeValues;
                          return {
                            id: v.id,
                            key: v.key,
                            value: isDraftAndAllowed ? v.value : "",
                            isSecret: v.isSecret,
                            isSaved: false // recipients start with it as draft
                          };
                        });

                        const payload = {
                          workspace: {
                            id: currentWS.id,
                            name: currentWS.name,
                            vars: sharedVars
                          }
                        };

                        const res = await fetch("/api/env/share", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload)
                        });

                        if (res.ok) {
                          const data = await res.json();
                          setShareLink(`${window.location.origin}/?env_share=${data.shareId}`);
                        } else {
                          addTerminalLine("Failed to generate share link", "error");
                        }
                      } catch (err: any) {
                        addTerminalLine(`Error sharing workspace: ${err.message}`, "error");
                      } finally {
                        setIsGenerating(false);
                      }
                    }}
                    disabled={isGenerating}
                    className="px-3.5 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {isGenerating ? "Generating..." : "Generate Link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="p-2.5 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Share link generated successfully!</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Shareable Link</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={shareLink}
                      className="flex-grow bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2000);
                        addTerminalLine("Copied environment workspace share link to clipboard", "success");
                      }}
                      className="p-2 bg-[#21262d] border border-[#30363d] text-zinc-300 hover:text-white rounded transition cursor-pointer shrink-0"
                      title="Copy link"
                    >
                      {copiedShare ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-500 leading-relaxed italic text-center">
                  Anyone with this link can import these workspace variable keys into their own runner.
                </p>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      setIsShareModalOpen(false);
                      setShareLink("");
                      setCopiedShare(false);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-[#21262d] text-white border border-[#30363d] hover:bg-zinc-800 transition cursor-pointer font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
            const isVisible = showValues[env.id] || false;

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

                    <div className="relative flex items-center">
                      <input
                        type={isVisible ? "text" : "password"}
                        value={env.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEnvVars(prev => prev.map(v => v.id === env.id ? { ...v, value: val } : v));
                        }}
                        placeholder="Secret value..."
                        className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded pl-2.5 pr-10 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none placeholder-zinc-700 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowValues(prev => ({ ...prev, [env.id]: !isVisible }))}
                        className="absolute right-2 text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 transition cursor-pointer"
                        title={isVisible ? "Hide secret value" : "Show secret value"}
                      >
                        {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
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
