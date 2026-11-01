export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
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
  /** How the signed-in user relates to this project. */
  myRole: "owner" | "editor" | "viewer" | "public";
}

export interface ProjectMember {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: string;
  files: ProjectFile[];
}

export type ArtifactKind = "screenshot" | "pdf" | "excel" | "video" | "trace" | "upload" | "file";

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  name: string;
  folder: string | null;
  mimeType: string;
  size: number;
  projectId: string | null;
  runId: string | null;
  createdAt: string;
  url: string;
}

export type RunStatus = "queued" | "running" | "success" | "failed" | "stopped";
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
  trigger: "manual" | "schedule" | "api";
  status: RunStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface RunDetail extends RunSummary {
  /** The run is still executing on the server and its event stream can be joined. */
  live: boolean;
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
  type: "once" | "repeat" | "cron";
  runAt: string | null;
  cron: string | null;
  timezone: string | null;
  notifyOn: "never" | "failure" | "always";
  channelIds: string[];
  lastStatus: string | null;
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

export interface NotificationChannel {
  id: string;
  name: string;
  type: "webhook" | "slack" | "telegram" | "email";
  target: string;
  createdAt: string;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}
