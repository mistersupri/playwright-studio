import { create } from "zustand";
import type { Artifact, ChoiceOption, Cookie, LogLine, NetworkEvent, RunStatus } from "@/lib/types";

export type RunPhase = "idle" | "starting" | RunStatus;

interface RunState {
  runId: string | null;
  phase: RunPhase;
  error: string | null;
  logs: LogLine[];
  network: NetworkEvent[];
  cookies: Cookie[];
  preview: string | null;
  artifacts: Artifact[];
  paused: boolean;
  pausedLine: number | null;
  pausedFile: string | null;
  choice: { selector: string; options: ChoiceOption[] } | null;
  startedAt: number | null;

  begin: (file: string) => void;
  attach: (runId: string) => void;
  fail: (message: string) => void;
  push: (type: string, data: unknown) => void;
  clearLogs: () => void;
  clearNetwork: () => void;
  clearCookies: () => void;
}

const MAX_LOGS = 4000;

export const useRun = create<RunState>()((set, get) => ({
  runId: null,
  phase: "idle",
  error: null,
  logs: [],
  network: [],
  cookies: [],
  preview: null,
  artifacts: [],
  paused: false,
  pausedLine: null,
  pausedFile: null,
  choice: null,
  startedAt: null,

  begin: (file) =>
    set({
      runId: null,
      phase: "starting",
      error: null,
      logs: [],
      network: [],
      cookies: [],
      artifacts: [],
      paused: false,
      pausedLine: null,
      pausedFile: file,
      choice: null,
      startedAt: Date.now(),
    }),
  attach: (runId) => set({ runId, phase: "running" }),
  fail: (message) =>
    set((s) => ({
      phase: "failed",
      error: message,
      logs: [...s.logs, { source: "system", level: "error", message, at: new Date().toISOString() }],
    })),
  push: (type, data) => {
    switch (type) {
      case "log": {
        const logs = get().logs;
        const next = logs.length >= MAX_LOGS ? logs.slice(logs.length - MAX_LOGS + 1) : logs.slice();
        next.push(data as LogLine);
        set({ logs: next });
        break;
      }
      case "status": {
        const d = data as { status: RunStatus; paused: boolean; line?: number };
        set({ phase: d.status, paused: d.paused, pausedLine: d.line ?? null });
        break;
      }
      case "preview":
        set({ preview: (data as { image: string }).image });
        break;
      case "network": {
        const event = data as NetworkEvent;
        const list = get().network;
        const idx = list.findIndex((n) => n.id === event.id);
        if (idx >= 0) {
          const next = list.slice();
          next[idx] = { ...next[idx], ...event };
          set({ network: next });
        } else {
          set({ network: [...list, event].slice(-1000) });
        }
        break;
      }
      case "cookies":
        set({ cookies: data as Cookie[] });
        break;
      case "artifact":
        set({ artifacts: [...get().artifacts, data as Artifact] });
        break;
      case "choice":
        set({ choice: data as RunState["choice"] });
        break;
      case "done": {
        const d = data as { status: RunStatus; error?: string };
        set({ phase: d.status, error: d.error ?? null, paused: false, pausedLine: null, choice: null });
        break;
      }
    }
  },
  clearLogs: () => set({ logs: [] }),
  clearNetwork: () => set({ network: [] }),
  clearCookies: () => set({ cookies: [] }),
}));

export const isActive = (phase: RunPhase) => phase === "starting" || phase === "running";
