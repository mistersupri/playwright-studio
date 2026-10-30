import { create } from "zustand";

export type SettingsTab = "account" | "gemini" | "notifications" | "tokens" | "admin";

export const useSettingsDialog = create<{ open: boolean; tab: SettingsTab; show: (tab?: SettingsTab) => void; close: () => void; setTab: (t: SettingsTab) => void }>(
  (set) => ({
    open: false,
    tab: "account",
    show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
    close: () => set({ open: false }),
    setTab: (tab) => set({ tab }),
  }),
);
