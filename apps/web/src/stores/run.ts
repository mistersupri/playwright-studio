import { create } from "zustand";
import type { Artifact, ChoiceOption, Cookie, Inspected, LogLine, NetworkEvent, RecordedStep, RunStatus } from "@/lib/types";

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
  /** Place in the server's run queue while waiting for a slot. */
  queuePosition: number | null;
  pausedLine: number | null;
  pausedFile: string | null;
  choice: { selector: string; options: ChoiceOption[] } | null;
  startedAt: number | null;
  url: string | null;
  steps: RecordedStep[];
  recording: boolean;
  /** True for runs started with Record rather than Run. */
  recordOnly: boolean;
  inspected: Inspected | null;
  /** The event stream dropped; the run keeps going on the server while the page reconnects. */
  reconnecting: boolean;
  /** Recorded steps from earlier runs, kept when a reconnect replays this run's steps. */
  stepsBase: number;

  begin: (file: string, recordOnly?: boolean) => void;
  clearSteps: () => void;
  setInspected: (i: Inspected | null) => void;
  attach: (runId: string) => void;
  fail: (message: string) => void;
  push: (type: string, data: unknown) => void;
  clearLogs: () => void;
  clearNetwork: () => void;
  clearCookies: () => void;
  setReconnecting: (on: boolean) => void;
  /** Drop what the server is about to replay, so a reconnect rebuilds the run without duplicates. */
  resync: () => void;
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
  queuePosition: null,
  pausedLine: null,
  pausedFile: null,
  choice: null,
  startedAt: null,
  url: null,
  steps: [],
  recording: false,
  recordOnly: false,
  inspected: null,
  reconnecting: false,
  stepsBase: 0,

  begin: (file, recordOnly = false) =>
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
      url: null,
      // Keep recorded steps across runs until they are inserted or cleared.
      recording: false,
      recordOnly,
      inspected: null,
      reconnecting: false,
      stepsBase: get().steps.length,
    }),
  clearSteps: () => set({ steps: [] }),
  setInspected: (inspected) => set({ inspected }),
  attach: (runId) => set((s) => ({ runId, phase: s.phase === "starting" ? "running" : s.phase })),
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
        const d = data as { status: RunStatus; paused: boolean; line?: number; position?: number };
        set({ phase: d.status, paused: d.paused, pausedLine: d.line ?? null, queuePosition: d.position ?? null });
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
      case "url":
        set({ url: (data as { url: string }).url });
        break;
      case "step":
        set({ steps: [...get().steps, data as RecordedStep] });
        break;
      case "recording":
        set({ recording: (data as { on: boolean }).on });
        break;
      case "inspected":
        set({ inspected: data as Inspected });
        break;
      case "choice":
        set({ choice: data as RunState["choice"] });
        break;
      case "done": {
        const d = data as { status: RunStatus; error?: string };
        set({ phase: d.status, error: d.error ?? null, paused: false, pausedLine: null, choice: null, recording: false, inspected: null });
        break;
      }
    }
  },
  clearLogs: () => set({ logs: [] }),
  clearNetwork: () => set({ network: [] }),
  clearCookies: () => set({ cookies: [] }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  resync: () =>
    set((s) => ({
      logs: [],
      network: [],
      artifacts: [],
      steps: s.steps.slice(0, s.stepsBase),
      choice: null,
      recording: false,
      inspected: null,
    })),
}));

export const isActive = (phase: RunPhase) => phase === "starting" || phase === "queued" || phase === "running";
