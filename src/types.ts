export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

export interface ScriptVersion {
  versionId: string;
  name: string;
  code: string;
  files?: { name: string; code: string }[];
  updatedAt: string;
}

export interface SavedScript {
  id?: string;
  name: string;
  code: string;
  files?: { name: string; code: string }[];
  isPrivate?: boolean;
  ownerId?: string;
  ownerEmail?: string;
  updatedAt: string;
  createdAt?: string;
  versions?: ScriptVersion[];
}

export interface RunHistoryItem {
  id: string;
  scriptId: string;
  scriptName: string;
  userId: string;
  status: "success" | "failed" | "running" | "stopped";
  terminalLogs: string[];
  artifacts: { type: "screenshot" | "pdf" | "excel" | "upload" | "video"; name: string; url: string }[];
  createdAt: string;
}

export interface Artifact {
  type: "screenshot" | "pdf" | "excel" | "upload" | "video";
  name: string;
  url: string;
  timestamp?: string;
  size?: number;
}

export interface TerminalLine {
  id: string;
  message: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "log";
  source?: "script" | "browser";
}

export interface EnvWorkspace {
  id: string;
  name: string;
  vars: { id: string; key: string; value: string; isSecret: boolean; isSaved?: boolean; wasSaved?: boolean; backupKey?: string; backupValue?: string }[];
}
