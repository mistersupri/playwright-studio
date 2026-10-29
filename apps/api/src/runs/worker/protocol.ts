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
  appRoot: string;
  interactive: boolean;
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
  | { type: "wheel"; x: number; y: number; deltaX: number; deltaY: number };

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
  | { type: "done"; status: "success" | "failed" | "stopped"; error?: string };
