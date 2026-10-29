import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, ProjectFile } from "@/lib/types";

export type SidePanel = "files" | "search" | "variables" | "history" | "schedules" | "packages" | "ai" | "recorder";

export interface RunSettings {
  timeoutSeconds: number;
  viewport: { width: number; height: number };
  stealth: boolean;
  binarizeCaptcha: boolean;
  useGeminiCaptcha: boolean;
  recordVideo: boolean;
  debug: boolean;
  workspaceId: string | null;
  autoSave: boolean;
}

interface WorkbenchState {
  project: Project | null;
  name: string;
  files: ProjectFile[];
  activeFile: string;
  /** Breakpoint lines keyed by `${projectId}/${fileName}`. */
  breakpoints: Record<string, number[]>;
  settings: RunSettings;
  panel: SidePanel;
  /** Set by collab when a remote edit arrives, so the editor does not echo it back. */
  remoteRevision: number;
  /** Bumped when another panel wants the editor to reveal a position. */
  reveal: { file: string; line: number; column: number; length: number; nonce: number } | null;
  /** Code waiting to be inserted at the editor cursor (recorder output). */
  insertion: { file: string; code: string; nonce: number } | null;

  loadProject: (p: Project) => void;
  markSaved: (p: Project) => void;
  setName: (name: string) => void;
  setCode: (file: string, code: string, remote?: boolean) => void;
  replaceFiles: (files: ProjectFile[], remote?: boolean) => void;
  setActiveFile: (file: string) => void;
  addFile: (name: string, code?: string) => void;
  renameFile: (from: string, to: string) => void;
  deleteFile: (name: string) => void;
  toggleBreakpoint: (file: string, line: number) => void;
  clearBreakpoints: () => void;
  updateSettings: (patch: Partial<RunSettings>) => void;
  setPanel: (panel: SidePanel) => void;
  revealAt: (file: string, line: number, column?: number, length?: number) => void;
  insertAtCursor: (code: string) => void;
}

export const DEFAULT_SETTINGS: RunSettings = {
  timeoutSeconds: 120,
  viewport: { width: 1280, height: 720 },
  stealth: false,
  binarizeCaptcha: false,
  useGeminiCaptcha: false,
  recordVideo: false,
  debug: false,
  workspaceId: null,
  autoSave: false,
};

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      project: null,
      name: "",
      files: [],
      activeFile: "main.js",
      breakpoints: {},
      settings: DEFAULT_SETTINGS,
      panel: "files",
      remoteRevision: 0,
      reveal: null,
      insertion: null,

      loadProject: (p) =>
        set({
          project: p,
          name: p.name,
          files: p.files,
          activeFile: p.files.some((f) => f.name === get().activeFile) ? get().activeFile : p.files[0]?.name ?? "main.js",
        }),
      markSaved: (p) => set({ project: p }),
      setName: (name) => set({ name }),
      setCode: (file, code, remote) =>
        set((s) => ({
          files: s.files.map((f) => (f.name === file ? { ...f, code } : f)),
          remoteRevision: remote ? s.remoteRevision + 1 : s.remoteRevision,
        })),
      replaceFiles: (files, remote) =>
        set((s) => ({
          files,
          activeFile: files.some((f) => f.name === s.activeFile) ? s.activeFile : files[0]?.name ?? "main.js",
          remoteRevision: remote ? s.remoteRevision + 1 : s.remoteRevision,
        })),
      setActiveFile: (activeFile) => set({ activeFile }),
      addFile: (name, code = "") => set((s) => ({ files: [...s.files, { name, code }], activeFile: name })),
      renameFile: (from, to) =>
        set((s) => {
          const pid = s.project?.id ?? "";
          const bps = { ...s.breakpoints };
          if (bps[`${pid}/${from}`]) {
            bps[`${pid}/${to}`] = bps[`${pid}/${from}`];
            delete bps[`${pid}/${from}`];
          }
          return {
            files: s.files.map((f) => (f.name === from ? { ...f, name: to } : f)),
            activeFile: s.activeFile === from ? to : s.activeFile,
            breakpoints: bps,
          };
        }),
      deleteFile: (name) =>
        set((s) => {
          const files = s.files.filter((f) => f.name !== name);
          return { files, activeFile: s.activeFile === name ? (files[0]?.name ?? "") : s.activeFile };
        }),
      toggleBreakpoint: (file, line) =>
        set((s) => {
          const key = `${s.project?.id ?? ""}/${file}`;
          const current = s.breakpoints[key] ?? [];
          const next = current.includes(line) ? current.filter((l) => l !== line) : [...current, line].sort((a, b) => a - b);
          return { breakpoints: { ...s.breakpoints, [key]: next } };
        }),
      clearBreakpoints: () =>
        set((s) => {
          const prefix = `${s.project?.id ?? ""}/`;
          return { breakpoints: Object.fromEntries(Object.entries(s.breakpoints).filter(([k]) => !k.startsWith(prefix))) };
        }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setPanel: (panel) => set({ panel }),
      revealAt: (file, line, column = 1, length = 0) =>
        set({ activeFile: file, reveal: { file, line, column, length, nonce: Date.now() } }),
      insertAtCursor: (code) => set((s) => ({ insertion: { file: s.activeFile, code, nonce: Date.now() } })),
    }),
    {
      name: "sb-workbench",
      partialize: (s) => ({ breakpoints: s.breakpoints, settings: s.settings, panel: s.panel, activeFile: s.activeFile }),
      merge: (persisted, current) => {
        const p = persisted as Partial<WorkbenchState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

export function useIsDirty() {
  return useWorkbench((s) => {
    if (!s.project) return false;
    if (s.name !== s.project.name) return true;
    if (s.files.length !== s.project.files.length) return true;
    return s.files.some((f, i) => f.name !== s.project!.files[i]?.name || f.code !== s.project!.files[i]?.code);
  });
}

export function useBreakpoints(file: string) {
  return useWorkbench((s) => s.breakpoints[`${s.project?.id ?? ""}/${file}`]) ?? EMPTY;
}
const EMPTY: number[] = [];
