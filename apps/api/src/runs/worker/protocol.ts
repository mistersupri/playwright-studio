/** Messages exchanged over IPC between the API process and a run worker. */

export interface WorkerStart {
  runId: string;
  entryFile: string;
  entryCode: string;
  viewport: { width: number; height: number };
  debug: boolean;
  breakpoints: number[];
  stealth: boolean;
  binarizeCaptcha: boolean;
  useGeminiCaptcha: boolean;
  recordVideo: boolean;
  gemini: { apiKey?: string; model?: string };
  /** Values that must never appear in logs (secret variables). */
  redact: string[];
  packagesDir: string;
  /** Proxy and certificate settings for `npm install`, kept out of the script's environment. */
  npmEnv: Record<string, string>;
  appRoot: string;
  interactive: boolean;
  /** "record" opens startUrl and waits for the person to drive the page. */
  mode: "script" | "record";
  startUrl?: string;
  /** Playwright storageState to start from, and whether to report it back at the end. */
  storageState?: unknown;
  saveSession: boolean;
  browser: "chromium" | "firefox" | "webkit";
  /** A name from Playwright's device list, e.g. "iPhone 15". */
  device?: string;
  locale?: string;
  timezoneId?: string;
  geolocation?: { latitude: number; longitude: number };
  /** e.g. http://user:pass@host:8080 */
  proxy?: string;
  trace: boolean;
  /** Data runs: the entry file runs once per row. */
  dataRows?: Record<string, string>[];
  stopOnError: boolean;
}

export type ParentMessage =
  | { type: "start"; payload: WorkerStart }
  | { type: "stop" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "choice"; indexes: number[] }
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "wheel"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "navigate"; url: string }
  | { type: "inspect"; x: number; y: number }
  | { type: "record"; on: boolean };

/** One recorded action. Rendered to code in the browser so steps can be merged and edited. */
export type RecordedStep =
  | { action: "goto"; url: string }
  | { action: "click"; locator: string }
  | { action: "fill"; locator: string; value: string; secret: boolean }
  | { action: "press"; key: string; locator?: string }
  | { action: "check"; locator: string; checked: boolean }
  | { action: "select"; locator: string; value: string };

export type LogSource = "script" | "browser" | "system";
export type LogLevel = "log" | "info" | "success" | "warning" | "error";

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

export interface ChoiceOption {
  index: number;
  text: string;
  tagName: string;
  id: string;
  classList: string;
  html: string;
}

export type WorkerMessage =
  | { type: "log"; source: LogSource; level: LogLevel; message: string; at: string }
  | { type: "preview"; image: string }
  | { type: "network"; event: NetworkEvent }
  | { type: "cookies"; cookies: unknown[] }
  | { type: "choice"; selector: string; options: ChoiceOption[] }
  | { type: "paused"; paused: boolean; line?: number }
  | { type: "gemini-used" }
  | { type: "url"; url: string }
  | { type: "step"; step: RecordedStep }
  | { type: "recording"; on: boolean }
  | { type: "inspected"; x: number; y: number; box: { x: number; y: number; width: number; height: number } | null; locator: string | null; tag: string | null }
  | { type: "session"; state: unknown }
  | { type: "done"; status: "success" | "failed" | "stopped"; error?: string };
