export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface ProjectFile {
  name: string;
  code: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  isPrivate: boolean;
  keepSession: boolean;
  ownerId: string;
  ownerName: string | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  files: ProjectFile[];
}

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: string;
  files: ProjectFile[];
}

export type ArtifactKind = "screenshot" | "pdf" | "excel" | "video" | "upload" | "file";

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  name: string;
  mimeType: string;
  size: number;
  projectId: string | null;
  runId: string | null;
  createdAt: string;
  url: string;
}

export type RunStatus = "running" | "success" | "failed" | "stopped";
export type LogSource = "script" | "browser" | "system";
export type LogLevel = "log" | "info" | "success" | "warning" | "error";

export interface LogLine {
  source: LogSource;
  level: LogLevel;
  message: string;
  at: string;
}

export interface NetworkEvent {
  id: string;
  phase: "request" | "response" | "failed";
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  duration?: number;
  headers?: Record<string, string>;
  body?: string;
  at: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface ChoiceOption {
  index: number;
  text: string;
  tagName: string;
  id: string;
  classList: string;
  html: string;
}

export interface RunSummary {
  id: string;
  projectId: string | null;
  projectName: string;
  entryFile: string;
  trigger: "manual" | "schedule";
  status: RunStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface RunDetail extends RunSummary {
  logs: LogLine[];
  artifacts: Artifact[];
}

export interface EnvVar {
  id?: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EnvWorkspace {
  id: string;
  name: string;
  isDefault: boolean;
  vars: EnvVar[];
}

export interface Schedule {
  id: string;
  projectId: string;
  projectName: string;
  entryFile: string;
  workspaceId: string | null;
  type: "once" | "repeat";
  runAt: string | null;
  interval: "5m" | "15m" | "30m" | "1h" | "12h" | "daily" | null;
  status: "active" | "paused" | "completed";
  viewportWidth: number;
  viewportHeight: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface AiSettings {
  hasKey: boolean;
  serverKey: boolean;
  apiKey: string;
  model: string;
  captchaCount: number;
}

export interface PackageInfo {
  name: string;
  version: string;
  source: "bundled" | "installed";
}

export type RecordedStep =
  | { action: "goto"; url: string }
  | { action: "click"; locator: string }
  | { action: "fill"; locator: string; value: string; secret: boolean }
  | { action: "press"; key: string; locator?: string }
  | { action: "check"; locator: string; checked: boolean }
  | { action: "select"; locator: string; value: string };

export interface Inspected {
  x: number;
  y: number;
  box: { x: number; y: number; width: number; height: number } | null;
  locator: string | null;
  tag: string | null;
}
