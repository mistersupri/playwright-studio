import React from "react";
import { HeartPulse, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Check, Sliders, Plus, Package } from "lucide-react";
import { getRequiredPackages } from "../utils/packageParser";

interface PackagesPanelProps {
  diagnosticResult: any;
  checkingDiagnostics: boolean;
  fetchDiagnostics: () => void;
  installingSysDeps: boolean;
  handleInstallSysDeps: () => void;
  newPkgName: string;
  setNewPkgName: (name: string) => void;
  installingPkg: string | null;
  handleInstallPackage: () => void;
  currentCode: string;
  installedDeps: Record<string, string>;
  performInstallPackageByName: (name: string) => void;
}

export default function PackagesPanel({
  diagnosticResult,
  checkingDiagnostics,
  fetchDiagnostics,
  installingSysDeps,
  handleInstallSysDeps,
  newPkgName,
  setNewPkgName,
  installingPkg,
  handleInstallPackage,
  currentCode,
  installedDeps,
  performInstallPackageByName,
}: PackagesPanelProps) {
  const currentScriptPackages = getRequiredPackages(currentCode);

  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3.5 bg-[#0d1117] font-sans">
      {/* Playwright & System Check Panel */}
      <div className="mb-4 bg-[#161b22] px-3.5 py-3 rounded-xl border border-[#30363d] shrink-0 text-xs shadow-lg text-left">
        <div className="flex items-center justify-between mb-2.5 font-bold text-[#8b949e] uppercase tracking-wider text-[9px] select-none">
          <div className="flex items-center gap-1.5 text-rose-500">
            <HeartPulse className="h-3.5 w-3.5 animate-pulse" />
            <span className="tracking-widest">System Diagnostics</span>
          </div>
          <button
            onClick={fetchDiagnostics}
            disabled={checkingDiagnostics}
            className="p-1 hover:bg-[#30363d] rounded text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Refresh system diagnostics"
          >
            <RefreshCw className={`h-3 w-3 ${checkingDiagnostics ? "animate-spin" : ""}`} />
          </button>
        </div>

        {diagnosticResult ? (
          <div className="space-y-2.5">
            {/* Browser Status */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">Headless Chromium:</span>
              {diagnosticResult.browserInstalled ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Ready</span>
                </span>
              ) : (
                <span className="text-rose-400 font-bold flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Missing</span>
                </span>
              )}
            </div>

            {/* Shared Libraries Status */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">Shared OS Libs:</span>
              {diagnosticResult.isCompatible ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Compatible</span>
                </span>
              ) : (
                <span className="text-rose-400 font-bold flex items-center gap-1 animate-pulse">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Incomplete</span>
                </span>
              )}
            </div>

            {/* Show missing libraries count if any */}
            {diagnosticResult.missingLibraries && diagnosticResult.missingLibraries.length > 0 && (
              <div className="bg-rose-950/20 border border-rose-900/30 rounded p-2 mt-1.5 font-mono text-[9px] text-rose-300 space-y-1.5 shadow-inner">
                <div className="font-bold flex items-center gap-1 select-none">
                  <AlertTriangle className="h-3 w-3 text-rose-400" />
                  <span>Missing Shared Libs:</span>
                </div>
                <div className="max-h-16 overflow-y-auto pl-1 scrollbar-thin text-left leading-relaxed">
                  {diagnosticResult.missingLibraries.map((lib: string, idx: number) => (
                    <div key={`missing-lib-${lib}-${idx}`} className="truncate">
                      • {lib}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleInstallSysDeps}
                  disabled={installingSysDeps}
                  className="w-full text-center py-1 mt-1 bg-rose-600 hover:bg-rose-500 hover:text-white disabled:bg-rose-900 disabled:text-rose-300 text-white font-sans font-bold text-[9px] rounded transition-all cursor-pointer border border-rose-500/30 shadow-sm"
                >
                  {installingSysDeps ? "Deps Installation Started..." : "Trigger APT Dependencies Auto-Repair"}
                </button>
              </div>
            )}
            
            {/* Otherwise show nice success banner if everything is perfect */}
            {diagnosticResult.isCompatible && diagnosticResult.browserInstalled && (
              <div className="bg-emerald-950/15 border border-emerald-900/30 rounded-lg p-2.5 mt-1.5 text-[10px] text-emerald-400 flex items-start gap-1.5 font-sans leading-relaxed">
                <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                <span className="text-left">All prerequisite libraries (GLib, NSS, Pango, Cairo, DRM, ATK) are verified and present! Headless Chrome is fully healthy.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-2 text-[#8b949e] italic text-[10px] flex items-center justify-center gap-1 select-none">
            <span>Scanning runner environment...</span>
          </div>
        )}
      </div>

      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center gap-2 select-none">
        <Sliders className="h-3.5 w-3.5 text-emerald-500" />
        <span>NPM Package Installer</span>
      </div>

      {/* Install Form */}
      <div className="space-y-2.5 mb-4 bg-[#161b22] p-3 rounded-xl border border-[#30363d] shrink-0 text-left shadow-lg">
        <p className="text-[10px] leading-relaxed text-[#8b949e]">
          Install any npm library to import dynamically in your scripts (e.g. <code>axios</code>, <code>cheerio</code>, or <code>lodash</code>).
        </p>
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newPkgName}
            onChange={(e) => setNewPkgName(e.target.value)}
            placeholder="Library name (e.g., axios)"
            disabled={!!installingPkg}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInstallPackage();
            }}
            className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500/50 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none placeholder-zinc-600 min-w-0 font-medium"
          />
          <button
            onClick={handleInstallPackage}
            disabled={!!installingPkg || !newPkgName.trim()}
            className="px-3 py-1.5 bg-emerald-650 hover:bg-emerald-550 disabled:bg-[#30363d] disabled:text-zinc-500 cursor-pointer text-xs font-bold rounded-md text-white transition-all shadow-md shadow-emerald-950/20"
          >
            {installingPkg ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Install"
            )}
          </button>
        </div>
      </div>

      {/* Installed / Required Packages list split */}
      <div className="flex-grow overflow-y-auto space-y-4 pr-1 select-none scrollbar-thin">
        
        {/* Group 1: Packages parsed from the active script imports */}
        <div className="space-y-2 text-left">
          <div className="px-1 text-[9px] font-bold text-blue-400 uppercase tracking-widest flex items-center justify-between shrink-0">
            <span>Used in Current Script</span>
            <span className="text-[8.5px] bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded font-mono font-bold">
              {currentScriptPackages.length} Detected
            </span>
          </div>
          
          {currentScriptPackages.length === 0 ? (
            <p className="text-[10.5px] text-zinc-500 pl-1.5 italic">No external libraries imported in this script.</p>
          ) : (
            currentScriptPackages.map((pkg, idx) => {
              const isInstalled = !!installedDeps[pkg];
              const version = installedDeps[pkg];
              const isInstallingThis = installingPkg === pkg;
              
              return (
                <div 
                  key={`req-pkg-${pkg}-${idx}`} 
                  className={`p-2.5 rounded-lg border flex flex-col gap-2 transition-all shadow-sm ${
                    isInstalled 
                      ? "bg-emerald-950/15 border-emerald-900/40 text-emerald-200" 
                      : "bg-amber-955/10 border-amber-900/40 text-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5 min-w-0">
                    <span className="truncate font-mono text-[11.5px] font-semibold text-zinc-200" title={pkg}>
                      {pkg}
                    </span>
                    
                    {isInstalled ? (
                      <span className="text-[8.5px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-900/40 flex items-center gap-1 shrink-0 font-bold">
                        <span>Installed</span>
                        <span className="opacity-75 font-mono text-[8px]">v{String(version).replace(/[^0-9.]/g, "")}</span>
                      </span>
                    ) : (
                      <span className="text-[8.5px] text-amber-400 bg-amber-955/40 px-2 py-0.5 rounded-md border border-amber-900/40 shrink-0 font-bold animate-pulse">
                        Not Installed
                      </span>
                    )}
                  </div>
                  
                  {/* If the required dependency is missing under current environment, show "Install" trigger */}
                  {!isInstalled && (
                    <div className="flex justify-end pt-0.5 select-none">
                      <button
                        onClick={() => performInstallPackageByName(pkg)}
                        disabled={!!installingPkg}
                        className="w-full text-center py-1.5 bg-amber-600/40 border border-amber-500/30 hover:bg-amber-600/60 disabled:opacity-50 text-white font-bold text-[10.5px] rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                      >
                        {isInstallingThis ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            <span>Install "{pkg}"</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Group 2: Other packages installed in the local environment */}
        <div className="space-y-2 pt-2 text-left">
          <div className="px-1 text-[9px] font-bold text-[#8b949e] uppercase tracking-widest flex items-center gap-1.5">
            <Package className="h-3 w-3 text-zinc-500" />
            <span>Project Dependencies</span>
          </div>
          
          {Object.keys(installedDeps).filter(dep => !currentScriptPackages.includes(dep)).length === 0 ? (
            <div className="text-center py-6 bg-[#161b22]/30 border border-dashed border-[#30363d] rounded-xl p-3 text-zinc-500 text-[10px]">
              No other packages installed in project.
            </div>
          ) : (
            <div className="space-y-1 max-h-[220px] scrollbar-thin pr-0.5">
              {Object.entries(installedDeps)
                .filter(([dep]) => !currentScriptPackages.includes(dep))
                .map(([dep, version], idx) => (
                  <div
                    key={`other-dep-${dep}-${idx}`}
                    className="px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-[11px] flex items-center justify-between gap-2.5 transition-all hover:border-[#444c56] shadow-sm"
                  >
                    <span className="truncate font-mono font-medium text-zinc-300" title={dep}>
                      {dep}
                    </span>
                    <span className="font-mono text-[9px] text-[#8b949e] bg-zinc-950/40 px-1.5 py-0.5 rounded shrink-0">
                      v{String(version).replace(/[^0-9.]/g, "")}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
