import React from "react";
import { Calendar, Plus, Play, Pause, Trash2, RefreshCw, Clock, Monitor, FileCode } from "lucide-react";
import { SavedScript } from "../types";
import { User } from "../firebase";

interface SchedulesPanelProps {
  user: User | null;
  activeScriptId: string | null;
  activeScriptName: string;
  workspaceFiles: { name: string; code: string }[];
  scheduleTargetFile: string;
  setScheduleTargetFile: (file: string) => void;
  scheduleType: "once" | "repeat";
  setScheduleType: (type: "once" | "repeat") => void;
  scheduleDatetime: string;
  setScheduleDatetime: (datetime: string) => void;
  scheduleInterval: string;
  setScheduleInterval: (interval: string) => void;
  scheduleViewportWidth: number;
  setScheduleViewportWidth: (w: number) => void;
  scheduleViewportHeight: number;
  setScheduleViewportHeight: (h: number) => void;
  handleCreateSchedule: () => void;
  schedules: any[];
  loadingSchedules: boolean;
  handleToggleSchedule: (item: any) => void;
  handleDeleteSchedule: (id: string) => void;
}

export default function SchedulesPanel({
  user,
  activeScriptId,
  activeScriptName,
  workspaceFiles,
  scheduleTargetFile,
  setScheduleTargetFile,
  scheduleType,
  setScheduleType,
  scheduleDatetime,
  setScheduleDatetime,
  scheduleInterval,
  setScheduleInterval,
  scheduleViewportWidth,
  setScheduleViewportWidth,
  scheduleViewportHeight,
  setScheduleViewportHeight,
  handleCreateSchedule,
  schedules,
  loadingSchedules,
  handleToggleSchedule,
  handleDeleteSchedule,
}: SchedulesPanelProps) {
  // Filter workspace files to scripts only (js/ts) for user choice
  const scriptFiles = workspaceFiles.filter(f => f.name.endsWith(".js") || f.name.endsWith(".ts"));

  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3.5 bg-[#0d1117] font-sans">
      {/* Panel Header */}
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 text-blue-400">
          <Calendar className="h-3.5 w-3.5" />
          <span className="tracking-widest">Automation Scheduler</span>
        </div>
        <span className="text-[8.5px] bg-[#161b22] border border-[#30363d] px-2 py-0.5 rounded font-mono text-zinc-400">
          {schedules.length} Triggers
        </span>
      </div>

      {!user ? (
        <div className="text-center py-10 px-4 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/20 select-none my-auto max-w-sm mx-auto">
          <Calendar className="h-10 w-10 mx-auto text-blue-500/40 mb-3" />
          <h4 className="text-xs font-semibold text-zinc-300 mb-1">Durable Cron Automation</h4>
          <p className="text-[10px] text-zinc-550 leading-relaxed">
            Sign in with Google to configure automated headless execution schedules for your saved scripts, running reliably on Node container sandboxes.
          </p>
        </div>
      ) : !activeScriptId ? (
        <div className="text-center py-10 px-4 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/20 select-none my-auto max-w-sm mx-auto">
          <Calendar className="h-10 w-10 mx-auto text-amber-500/40 mb-3" />
          <h4 className="text-xs font-semibold text-zinc-300 mb-1">Save Project First</h4>
          <p className="text-[10px] text-zinc-550 leading-relaxed">
            Please load a saved Project or save your current workspace Project first to configure automated scheduled runs for its files.
          </p>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0 space-y-4 justify-between">
          {/* Create Schedule Card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3.5 space-y-3 shrink-0 text-left shadow-lg">
            <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider block select-none">Create Automation Trigger</span>

            {/* Locked Active Project Context */}
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider block">Target Project</label>
              <div className="w-full bg-[#0d1117]/80 border border-[#30363d] rounded-md p-2 text-xs text-white font-semibold flex items-center gap-2 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <span className="truncate">{activeScriptName}</span>
              </div>
            </div>

            {/* Target Script File Selection */}
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider flex items-center gap-1">
                <FileCode className="h-3 w-3 text-zinc-400" />
                <span>Select Target Script File</span>
              </label>
              <select
                value={scheduleTargetFile}
                onChange={(e) => setScheduleTargetFile(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 cursor-pointer font-medium font-mono"
              >
                {scriptFiles.length === 0 ? (
                  <option value="main.js">main.js (Default)</option>
                ) : (
                  scriptFiles.map((f, idx) => (
                    <option key={`target-file-opt-${f.name}-${idx}`} value={f.name}>
                      {f.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Schedule Type Selection (Once vs. Repeat) */}
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider">Trigger Frequency</label>
              <div className="grid grid-cols-2 gap-1.5 bg-[#0d1117] p-1 border border-[#30363d] rounded-md">
                {(["once", "repeat"] as const).map((t) => (
                  <button
                    key={`sched-type-${t}`}
                    type="button"
                    onClick={() => setScheduleType(t)}
                    className={`py-1 text-center text-[10.5px] font-semibold rounded cursor-pointer transition-all ${
                      scheduleType === t
                        ? "bg-blue-600/25 border border-blue-500/40 text-blue-400 font-bold"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {t === "once" ? "Run Once" : "Repeat Run"}
                  </button>
                ))}
              </div>
            </div>

            {/* DateTime or Repeat Interval Selectors */}
            {scheduleType === "once" ? (
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider">Execution Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleDatetime}
                  onChange={(e) => setScheduleDatetime(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 cursor-pointer font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider">Repeat Interval</label>
                <select
                  value={scheduleInterval}
                  onChange={(e) => setScheduleInterval(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 cursor-pointer font-medium"
                >
                  <option value="5m">Every 5 minutes</option>
                  <option value="15m">Every 15 minutes</option>
                  <option value="30m">Every 30 minutes</option>
                  <option value="1h">Every hour</option>
                  <option value="12h">Every 12 hours</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            )}

            {/* Viewport Width & Height Configurations */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider flex items-center gap-1">
                  <Monitor className="h-3 w-3 text-zinc-600" />
                  <span>Width</span>
                </label>
                <input
                  type="number"
                  value={scheduleViewportWidth}
                  onChange={(e) => setScheduleViewportWidth(Number(e.target.value))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 font-mono"
                />
              </div>
              <div>
                <label className="text-[9.5px] font-bold text-[#8b949e] uppercase tracking-wider flex items-center gap-1">
                  <Monitor className="h-3 w-3 text-zinc-600" />
                  <span>Height</span>
                </label>
                <input
                  type="number"
                  value={scheduleViewportHeight}
                  onChange={(e) => setScheduleViewportHeight(Number(e.target.value))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 font-mono"
                />
              </div>
            </div>

            {/* Submit Trigger Action */}
            <button
              onClick={handleCreateSchedule}
              disabled={scheduleType === "once" && !scheduleDatetime}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#30363d] disabled:text-zinc-500 text-white font-semibold rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-md shadow-blue-950/20"
            >
              <Plus className="h-4 w-4" /> 
              <span>Register Automated Schedule</span>
            </button>
          </div>

          {/* Registered Schedules List */}
          <div className="flex-grow flex flex-col min-h-0 space-y-2 text-left">
            <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider px-1 block select-none">Active Automation Triggers ({schedules.length})</span>
            
            {loadingSchedules ? (
              <div className="flex flex-col items-center justify-center py-8 text-xs text-[#8b949e] gap-2 flex-grow">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                <span className="font-mono text-[9px] tracking-wider uppercase">Loading Cron triggers...</span>
              </div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-10 px-4 text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/10 select-none flex-grow flex flex-col justify-center my-auto">
                <Clock className="h-8 w-8 mx-auto opacity-30 mb-2 text-zinc-500" />
                <p className="text-[10px] leading-relaxed">No automation schedules registered yet.</p>
              </div>
            ) : (
              <div className="flex-grow overflow-y-auto space-y-2.5 pr-1 max-h-[220px] md:max-h-none scrollbar-thin select-none">
                {schedules.map((item, idx) => {
                  const isActive = item.status === "active";
                  const nextRunDate = item.nextRun ? new Date(item.nextRun) : null;

                  return (
                    <div
                      key={`schedule-item-${item.id || "no-id"}-${idx}`}
                      className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg flex items-start justify-between gap-3 font-sans hover:border-[#444c56] transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-[11px] font-bold text-zinc-200 truncate flex flex-wrap items-center gap-1" title={item.scriptName}>
                          <span className="text-blue-400">{item.scriptName}</span>
                          {item.targetFile && (
                            <>
                              <span className="text-zinc-600">→</span>
                              <span className="text-zinc-300 font-mono text-[10px] bg-[#0d1117] px-1 py-0.5 rounded border border-[#30363d]">{item.targetFile}</span>
                            </>
                          )}
                        </p>
                        <p className="text-[9px] text-[#8b949e] font-mono flex items-center gap-1 select-text">
                          ⏱️ {item.type === "once" ? `Once: ${new Date(item.datetime).toLocaleString()}` : `Repeat: ${item.repeatInterval}`}
                        </p>
                        {nextRunDate && (
                          <p className="text-[8.5px] text-zinc-500 font-mono select-text flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 shrink-0" />
                            <span>Next: {nextRunDate.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</span>
                          </p>
                        )}
                        <span className={`inline-block mt-1 text-[8px] px-2 py-0.5 rounded font-bold border ${
                          isActive
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                            : "bg-zinc-850 text-zinc-400 border-zinc-750/40"
                        }`}>
                          {item.status === "active" ? "RUNNING" : "PAUSED"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleSchedule(item)}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors border border-[#30363d]/50 bg-[#0d1117] ${
                            isActive
                              ? "text-zinc-400 hover:text-amber-400 hover:border-amber-500/20 hover:bg-[#30363d]"
                              : "text-zinc-550 hover:text-emerald-400 hover:border-emerald-500/20 hover:bg-[#30363d]"
                          }`}
                          title={isActive ? "Pause Trigger" : "Resume Trigger"}
                        >
                          {isActive ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(item.id)}
                          className="p-1.5 rounded-md text-zinc-550 hover:text-rose-400 hover:border-rose-500/20 hover:bg-[#30363d] cursor-pointer transition-colors border border-[#30363d]/50 bg-[#0d1117]"
                          title="Delete Trigger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
