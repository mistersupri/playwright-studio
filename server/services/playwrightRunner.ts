import { chromium, Browser, BrowserContext, Page } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { encryptBuffer } from "./encryption";
import { execSync } from "child_process";
import { solveCaptcha, solveCaptchaFromBuffer, binarizeImage } from "./captchaSolver";

const BUILTIN_MODULES = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "fs/promises", "http", "http2", "https", "inspector",
  "module", "net", "os", "path", "path/posix", "path/win32", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl", "stream",
  "stream/promises", "stream/consumers", "stream/web", "string_decoder",
  "sys", "timers", "timers/promises", "tls", "trace_events", "tty",
  "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib"
]);

const autoInstalledPackages = new Set<string>();

function getCleanPackageName(specifier: string): string | null {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return null;
  }
  if (BUILTIN_MODULES.has(specifier)) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }
  return specifier.split("/")[0];
}

function transformImportsToRequires(sourceCode: string): string {
  if (!sourceCode) return sourceCode;
  
  let transformed = sourceCode;

  // Match import statements like: import { x } from 'pkg'; import x, { y } from 'pkg'; import * as x from 'pkg';
  transformed = transformed.replace(
    /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (match, defaultImport, namedImports, starImport, modulePath) => {
      let statements: string[] = [];
      const tempVar = `_pkg_${Math.random().toString(36).substring(2, 8)}`;
      statements.push(`const ${tempVar} = require('${modulePath}');`);

      if (starImport) {
        statements.push(`const ${starImport} = ${tempVar};`);
      }
      if (defaultImport) {
        statements.push(`const ${defaultImport} = (${tempVar} && ${tempVar}.default !== undefined) ? ${tempVar}.default : ${tempVar};`);
      }
      if (namedImports) {
        const transformedNamed = namedImports
          .split(",")
          .map((item: string) => {
            const parts = item.trim().split(/\s+as\s+/);
            if (parts.length === 2 && parts[0] && parts[1]) {
              return `${parts[0].trim()}: ${parts[1].trim()}`;
            }
            return parts[0].trim();
          })
          .filter(Boolean)
          .join(", ");
        if (transformedNamed) {
          statements.push(`const { ${transformedNamed} } = ${tempVar};`);
        }
      }
      return statements.join(" ");
    }
  );

  // Side-effect imports: import 'pkg';
  transformed = transformed.replace(
    /import\s+['"]([^'"]+)['"]\s*;?/g,
    `require('$1');`
  );

  return transformed;
}

// Active runs registry to enable stopping them
export interface ActiveRun {
  runId: string;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  logs: string[];
  artifacts: { type: "screenshot" | "pdf" | "excel" | "video"; name: string; url: string }[];
  isCompleted: boolean;
  onLog: (msg: string) => void;
  onPreview: (base64: string) => void;
  onArtifact: (artifact: { type: "screenshot" | "pdf" | "excel" | "video"; name: string; url: string }) => void;
  stop: () => Promise<void>;
}

export const activeRuns = new Map<string, ActiveRun>();

export class PlaywrightPauseManager {
  private static pauseResolvers = new Map<string, () => void>();
  private static pausePromises = new Map<string, Promise<void>>();

  static async checkPause(runId: string, onLog?: (msg: string) => void) {
    const promise = this.pausePromises.get(runId);
    if (promise) {
      if (onLog) onLog("Debugger / Captcha Pause: Execution paused. Click 'Resume Script' to continue.");
      await promise;
      if (onLog) onLog("Debugger / Captcha Pause: Execution resumed!");
    }
  }

  static pause(runId: string) {
    if (this.pausePromises.has(runId)) return; // already paused
    let resolver: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    this.pausePromises.set(runId, promise);
    this.pauseResolvers.set(runId, resolver);
  }

  static resume(runId: string) {
    const resolver = this.pauseResolvers.get(runId);
    if (resolver) {
      resolver();
      this.pauseResolvers.delete(runId);
      this.pausePromises.delete(runId);
    }
  }

  static isPaused(runId: string): boolean {
    return this.pausePromises.has(runId);
  }
}

export interface InteractiveChoice {
  options: { index: number; text: string; selector: string; html: string }[];
  resolve: (selectedIndexes: number[]) => void;
}

export class PlaywrightInteractionManager {
  private static pendingChoices = new Map<string, InteractiveChoice>();

  static async promptChoice(
    runId: string,
    options: { index: number; text: string; selector: string; html: string }[],
    onLog: (msg: string) => void,
    onChoicePrompt?: (event: { options: any[] }) => void
  ): Promise<number[]> {
    return new Promise<number[]>((resolve) => {
      // If there is no callback or it's unattended, auto-select all to avoid hanging
      if (!onChoicePrompt) {
        onLog(`Interactive Choice: No active UI connected. Auto-selecting all ${options.length} elements.`);
        resolve(options.map(o => o.index));
        return;
      }

      this.pendingChoices.set(runId, { options, resolve });
      onLog(`Interactive Choice Required: Found ${options.length} elements. Awaiting user selection in the UI...`);
      onChoicePrompt({ options });
    });
  }

  static submitChoice(runId: string, selectedIndexes: number[]) {
    const pending = this.pendingChoices.get(runId);
    if (pending) {
      pending.resolve(selectedIndexes);
      this.pendingChoices.delete(runId);
    }
  }

  static getPendingChoice(runId: string) {
    return this.pendingChoices.get(runId);
  }

  static isAwaitingChoice(runId: string): boolean {
    return this.pendingChoices.has(runId);
  }
}

// Ensure necessary directories exist
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");
const PDF_DIR = path.join(process.cwd(), "pdf");
const EXCEL_DIR = path.join(process.cwd(), "excel");
const VIDEOS_DIR = path.join(process.cwd(), "videos");
const TEMP_VIDEOS_DIR = path.join(os.tmpdir(), "playwright-video-recordings");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
if (!fs.existsSync(EXCEL_DIR)) {
  fs.mkdirSync(EXCEL_DIR, { recursive: true });
}
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_VIDEOS_DIR)) {
  fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });
}

/**
 * Helper to encrypt a file on disk in place.
 */
function encryptFileInPlace(filePath: string) {
  try {
    const content = fs.readFileSync(filePath);
    // If already encrypted, skip writing to prevent updating mtime and repetitive processing
    const BUFFER_MAGIC = Buffer.from("PLAYENC1");
    if (content.length >= 8 && content.subarray(0, 8).equals(BUFFER_MAGIC)) {
      return;
    }
    const encrypted = encryptBuffer(content);
    fs.writeFileSync(filePath, encrypted);
  } catch (err) {
    console.error(`Failed to encrypt file in place: ${filePath}`, err);
  }
}

/**
 * Scan workspace root for newly created screenshots, PDFs, Excel sheets, or Videos and move them to targeted directories.
 */
function scanAndMoveArtifacts(startTime: number, scriptId?: string): { type: "screenshot" | "pdf" | "excel" | "video"; name: string; displayName?: string; scriptId?: string; url: string; size?: number; timestamp?: string }[] {
  const rootFiles = fs.readdirSync(process.cwd());
  const found: { type: "screenshot" | "pdf" | "excel" | "video"; name: string; displayName?: string; scriptId?: string; url: string; size?: number; timestamp?: string }[] = [];
  const safeScriptId = scriptId || "default";

  for (const file of rootFiles) {
    const filePath = path.join(process.cwd(), file);
    try {
      const stats = fs.statSync(filePath);
      // Check if file is newly created or modified since script started and is a file (not directory)
      if (stats.isFile() && stats.mtimeMs >= startTime) {
        const ext = path.extname(file).toLowerCase();
        const finalFileName = file.startsWith(`${safeScriptId}__`) ? file : `${safeScriptId}__${file}`;
        const cleanDisplayName = file.startsWith(`${safeScriptId}__`) ? file.substring(safeScriptId.length + 2) : file;
        
        if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
          const destPath = path.join(SCREENSHOTS_DIR, finalFileName);
          fs.renameSync(filePath, destPath);
          encryptFileInPlace(destPath);
          const finalStats = fs.statSync(destPath);
          found.push({
            type: "screenshot",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: safeScriptId,
            url: `/screenshots/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        } else if (ext === ".pdf") {
          const destPath = path.join(PDF_DIR, finalFileName);
          fs.renameSync(filePath, destPath);
          encryptFileInPlace(destPath);
          const finalStats = fs.statSync(destPath);
          found.push({
            type: "pdf",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: safeScriptId,
            url: `/pdf/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        } else if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
          const destPath = path.join(EXCEL_DIR, finalFileName);
          fs.renameSync(filePath, destPath);
          encryptFileInPlace(destPath);
          const finalStats = fs.statSync(destPath);
          found.push({
            type: "excel",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: safeScriptId,
            url: `/excel/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        } else if (ext === ".webm" || ext === ".mp4") {
          const destPath = path.join(VIDEOS_DIR, finalFileName);
          fs.renameSync(filePath, destPath);
          encryptFileInPlace(destPath);
          const finalStats = fs.statSync(destPath);
          found.push({
            type: "video",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: safeScriptId,
            url: `/videos/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Error scanning file ${file}:`, err);
    }
  }

  // Also scan directories screenshots/, pdf/, excel/ and videos/ for newly added files
  try {
    const screenshotFiles = fs.readdirSync(SCREENSHOTS_DIR);
    for (const file of screenshotFiles) {
      const filePath = path.join(SCREENSHOTS_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && stats.mtimeMs >= startTime) {
        let finalFileName = file;
        let cleanDisplayName = file;
        let fileScriptId = safeScriptId;
        if (file.includes("__")) {
          const idx = file.indexOf("__");
          fileScriptId = file.substring(0, idx);
          cleanDisplayName = file.substring(idx + 2);
        } else if (scriptId) {
          finalFileName = `${scriptId}__${file}`;
          const newPath = path.join(SCREENSHOTS_DIR, finalFileName);
          try { fs.renameSync(filePath, newPath); } catch (e) {}
          cleanDisplayName = file;
          fileScriptId = scriptId;
        }

        const targetPath = path.join(SCREENSHOTS_DIR, finalFileName);
        if (fs.existsSync(targetPath)) {
          encryptFileInPlace(targetPath);
          const finalStats = fs.statSync(targetPath);
          found.push({
            type: "screenshot",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: fileScriptId,
            url: `/screenshots/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error("Error scanning screenshots dir:", err);
  }

  try {
    const pdfFiles = fs.readdirSync(PDF_DIR);
    for (const file of pdfFiles) {
      const filePath = path.join(PDF_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && stats.mtimeMs >= startTime) {
        let finalFileName = file;
        let cleanDisplayName = file;
        let fileScriptId = safeScriptId;
        if (file.includes("__")) {
          const idx = file.indexOf("__");
          fileScriptId = file.substring(0, idx);
          cleanDisplayName = file.substring(idx + 2);
        } else if (scriptId) {
          finalFileName = `${scriptId}__${file}`;
          const newPath = path.join(PDF_DIR, finalFileName);
          try { fs.renameSync(filePath, newPath); } catch (e) {}
          cleanDisplayName = file;
          fileScriptId = scriptId;
        }

        const targetPath = path.join(PDF_DIR, finalFileName);
        if (fs.existsSync(targetPath)) {
          encryptFileInPlace(targetPath);
          const finalStats = fs.statSync(targetPath);
          found.push({
            type: "pdf",
            name: finalFileName,
            displayName: cleanDisplayName,
            scriptId: fileScriptId,
            url: `/pdf/${encodeURIComponent(finalFileName)}`,
            size: finalStats.size,
            timestamp: finalStats.mtime.toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error("Error scanning pdf dir:", err);
  }

  try {
    if (fs.existsSync(EXCEL_DIR)) {
      const excelFiles = fs.readdirSync(EXCEL_DIR);
      for (const file of excelFiles) {
        const filePath = path.join(EXCEL_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile() && stats.mtimeMs >= startTime) {
          let finalFileName = file;
          let cleanDisplayName = file;
          let fileScriptId = safeScriptId;
          if (file.includes("__")) {
            const idx = file.indexOf("__");
            fileScriptId = file.substring(0, idx);
            cleanDisplayName = file.substring(idx + 2);
          } else if (scriptId) {
            finalFileName = `${scriptId}__${file}`;
            const newPath = path.join(EXCEL_DIR, finalFileName);
            try { fs.renameSync(filePath, newPath); } catch (e) {}
            cleanDisplayName = file;
            fileScriptId = scriptId;
          }

          const targetPath = path.join(EXCEL_DIR, finalFileName);
          if (fs.existsSync(targetPath)) {
            encryptFileInPlace(targetPath);
            const finalStats = fs.statSync(targetPath);
            found.push({
              type: "excel",
              name: finalFileName,
              displayName: cleanDisplayName,
              scriptId: fileScriptId,
              url: `/excel/${encodeURIComponent(finalFileName)}`,
              size: finalStats.size,
              timestamp: finalStats.mtime.toISOString()
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error scanning excel dir:", err);
  }

  try {
    if (fs.existsSync(VIDEOS_DIR)) {
      const videoFiles = fs.readdirSync(VIDEOS_DIR);
      for (const file of videoFiles) {
        const filePath = path.join(VIDEOS_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile() && stats.mtimeMs >= startTime) {
          let finalFileName = file;
          let cleanDisplayName = file;
          let fileScriptId = safeScriptId;
          if (file.includes("__")) {
            const idx = file.indexOf("__");
            fileScriptId = file.substring(0, idx);
            cleanDisplayName = file.substring(idx + 2);
          } else if (scriptId) {
            finalFileName = `${scriptId}__${file}`;
            const newPath = path.join(VIDEOS_DIR, finalFileName);
            try { fs.renameSync(filePath, newPath); } catch (e) {}
            cleanDisplayName = file;
            fileScriptId = scriptId;
          }

          const targetPath = path.join(VIDEOS_DIR, finalFileName);
          if (fs.existsSync(targetPath)) {
            encryptFileInPlace(targetPath);
            const finalStats = fs.statSync(targetPath);
            found.push({
              type: "video",
              name: finalFileName,
              displayName: cleanDisplayName,
              scriptId: fileScriptId,
              url: `/videos/${encodeURIComponent(finalFileName)}`,
              size: finalStats.size,
              timestamp: finalStats.mtime.toISOString()
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error scanning videos dir:", err);
  }

  // De-duplicate items by url
  const uniqueFound: typeof found = [];
  const urls = new Set<string>();
  for (const item of found) {
    if (!urls.has(item.url)) {
      urls.add(item.url);
      uniqueFound.push(item);
    }
  }

  return uniqueFound;
}

export interface DiagnosticResult {
  browserInstalled: boolean;
  executablePath: string;
  missingLibraries: string[];
  allCheckedLibraries: { name: string; found: boolean }[];
  isCompatible: boolean;
  error?: string;
}

export function checkBrowserDependencies(): DiagnosticResult {
  let executablePath = "";
  try {
    executablePath = chromium.executablePath();
  } catch (err: any) {
    return {
      browserInstalled: false,
      executablePath: "",
      missingLibraries: [],
      allCheckedLibraries: [],
      isCompatible: false,
      error: `Could not determine Playwright browser executable path: ${err.message}`
    };
  }

  if (!fs.existsSync(executablePath)) {
    return {
      browserInstalled: false,
      executablePath,
      missingLibraries: [],
      allCheckedLibraries: [],
      isCompatible: false,
      error: `Browser executable does not exist at: ${executablePath}`
    };
  }

  if (process.platform !== "linux") {
    return {
      browserInstalled: true,
      executablePath,
      missingLibraries: [],
      allCheckedLibraries: [],
      isCompatible: true,
      error: `Platform "${process.platform}" doesn't require GLib/ELF shared library verification.`
    };
  }

  try {
    const lddOutput = execSync(`ldd "${executablePath}"`, { encoding: "utf8" });
    const lines = lddOutput.split("\n");
    const missing: string[] = [];
    const checked: { name: string; found: boolean }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split("=>");
      if (parts.length === 2) {
        const libName = parts[0].trim();
        const value = parts[1].trim();
        const isMissing = value.includes("not found");
        
        checked.push({ name: libName, found: !isMissing });
        if (isMissing) {
          missing.push(libName);
        }
      } else if (trimmed.includes("not found")) {
        const libName = trimmed.split(/\s+/)[0];
        checked.push({ name: libName, found: false });
        missing.push(libName);
      }
    }

    return {
      browserInstalled: true,
      executablePath,
      missingLibraries: missing,
      allCheckedLibraries: checked,
      isCompatible: missing.length === 0
    };
  } catch (err: any) {
    return {
      browserInstalled: true,
      executablePath,
      missingLibraries: [],
      allCheckedLibraries: [],
      isCompatible: false,
      error: `Failed to run ldd diagnostic utility: ${err.message}`
    };
  }
}

function getSystemSecrets(): string[] {
  const secrets: string[] = [];
  const sensitivePatterns = [
    "key", "secret", "password", "passwd", "pass", "auth", "token", "cred",
    "admin", "sign", "hash", "session", "jwt", "tls", "cert", "private", "secure"
  ];
  
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitivePatterns.some(pat => lowerKey.includes(pat));
    if (isSensitive && value.length >= 4) {
      if (!secrets.includes(value)) {
        secrets.push(value);
      }
    }
  }
  return secrets;
}

function sanitizeText(text: string, secrets: string[]): string {
  if (!text || secrets.length === 0) return text;
  let sanitized = text;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    const escaped = secret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    sanitized = sanitized.replace(regex, "[REDACTED_SECRET]");
  }
  return sanitized;
}

export async function runScript(
  runId: string,
  code: string,
  onLog: (msg: string) => void,
  onPreview: (base64: string) => void,
  onArtifact: (artifact: { type: "screenshot" | "pdf" | "excel" | "video"; name: string; url: string }) => void,
  onNetwork?: (event: any) => void,
  env?: Record<string, string>,
  timeout?: number,
  skipCaptcha?: boolean,
  recordSession?: boolean,
  isDebuggerMode?: boolean,
  viewportWidth?: number,
  viewportHeight?: number,
  breakpoints?: number[],
  binarizeCaptcha?: boolean,
  useGeminiCaptcha?: boolean,
  onChoicePrompt?: (event: { options: any[] }) => void,
  files?: { name: string; code: string }[],
  onCookies?: (cookies: any[]) => void,
  scriptId?: string
): Promise<any> {
  let instrumentedCode = transformImportsToRequires(code);
  if (isDebuggerMode && breakpoints && breakpoints.length > 0) {
    onLog(`Debugger: Instrumenting code with ${breakpoints.length} active breakpoints...`);
    const lines = instrumentedCode.split("\n");
    const instrumentedLines = lines.map((lineText, index) => {
      const lineNum = index + 1;
      if (breakpoints.includes(lineNum)) {
        return `await pause("Line ${lineNum}");\n${lineText}`;
      }
      return lineText;
    });
    instrumentedCode = instrumentedLines.join("\n");
  }

  const systemSecrets = getSystemSecrets();
  // Collect all injected workspace environment variable values to prevent accidental leaks in logs
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value && value.length >= 3) {
        if (!systemSecrets.includes(value)) {
          systemSecrets.push(value);
        }
      }
    }
  }
  const rawOnLog = onLog;
  onLog = (msg: string) => {
    rawOnLog(sanitizeText(msg, systemSecrets));
  };

  const startTime = Date.now();
  
  const workspaceDir = path.join(process.cwd(), "temp_workspaces", `playwright-workspace-${runId}`);

  // Setup temporary files workspace
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
    // Write package.json inside workspace directory to enforce CommonJS require compatibility
    fs.writeFileSync(
      path.join(workspaceDir, "package.json"),
      JSON.stringify({ name: `playwright-workspace-${runId}`, version: "1.0.0", type: "commonjs" }, null, 2)
    );
    // Write entrypoint file main.js
    fs.writeFileSync(path.join(workspaceDir, "main.js"), transformImportsToRequires(code));
    // Write other files
    if (files && files.length > 0) {
      files.forEach((f) => {
        // Skip main.js since we just wrote it
        if (f.name === "main.js") return;
        
        const filePath = path.join(workspaceDir, f.name);
        // Ensure parent directories exist
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        fs.writeFileSync(filePath, transformImportsToRequires(f.code));
      });
    }
  } catch (err: any) {
    onLog(`Workspace Error: Failed to initialize temporary files space: ${err.message}`);
  }

  // Environment pre-flight check
  try {
    const check = checkBrowserDependencies();
    if (!check.browserInstalled) {
      onLog("ALERT [Prerequisite Warning]: Playwright Chromium browser is not fully installed or path is missing. Click 'Initialize Browser' in dependencies side tab, or run the installer.");
    } else if (check.missingLibraries && check.missingLibraries.length > 0) {
      onLog(`ALERT [System Warning]: Essential shared libraries are missing in the runner environment! The browser may fail to boot.`);
      onLog(`ALERT: Missing libraries detected: ${check.missingLibraries.join(", ")}`);
      onLog(`ALERT: Please update dependencies, or contact your sysadmin to install GLib, NSS, and GTK packages.`);
    } else {
      onLog("Launch: System diagnostic environment check passed! Prerequisite libraries (GLib, NSS, Cairo, Pango, and ATK) are resolved.");
    }
  } catch (err: any) {
    onLog(`Launch: Skipping system diagnostic pre-flight checks (${err.message || err})`);
  }

  onLog("Launch: Starting browser launch...");
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let previewInterval: NodeJS.Timeout | null = null;
  let active = true;
  let videoObj: any = null;

  // Event handler references for cleanup
  let requestHandler: ((req: any) => void) | null = null;
  let responseHandler: ((res: any) => Promise<void> | void) | null = null;
  let requestfailedHandler: ((req: any) => void) | null = null;
  let consoleHandler: ((msg: any) => void) | null = null;
  let pageerrorHandler: ((err: any) => void) | null = null;
  let framenavigatedHandler: ((frame: any) => void) | null = null;

  // Track original env keys so we can restore them cleanly
  const originalEnv: Record<string, string | undefined> = {};
  if (env) {
    onLog("Execution: Injecting custom environment variables...");
    for (const [key, value] of Object.entries(env)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
  }

  const runner: ActiveRun = {
    runId,
    browser: null,
    context: null,
    page: null,
    logs: [],
    artifacts: [],
    isCompleted: false,
    onLog,
    onPreview,
    onArtifact,
    stop: async () => {
      active = false;
      onLog("Stop: Execution manually stopped by user.");
      await cleanUp();
    }
  };

  activeRuns.set(runId, runner);

  const cleanUp = async () => {
    if (context && onCookies) {
      try {
        const cookiesList = await context.cookies();
        onCookies(cookiesList);
      } catch (e) {}
    }

    active = false;
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }

    // Remove event listeners before closing the page/browser to prevent guid unbound exception errors
    try {
      if (page) {
        if (requestHandler) page.off("request", requestHandler);
        if (responseHandler) page.off("response", responseHandler);
        if (requestfailedHandler) page.off("requestfailed", requestfailedHandler);
        if (consoleHandler) page.off("console", consoleHandler);
        if (pageerrorHandler) page.off("pageerror", pageerrorHandler);
        if (framenavigatedHandler) page.off("framenavigated", framenavigatedHandler);
      }
    } catch (e) {}
    
    // Restore original environmental settings
    if (env) {
      for (const key of Object.keys(env)) {
        if (originalEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      }
    }

    // Scan one last time for newly produced files before closing
    try {
      const finalArtifacts = scanAndMoveArtifacts(startTime, scriptId);
      for (const item of finalArtifacts) {
        // Prevent repeating
        if (!runner.artifacts.some(a => a.url === item.url)) {
          runner.artifacts.push(item);
          onArtifact(item);
        }
      }
    } catch (e) {
      // ignore scan issues during cleanup
    }

    let tempVideoPath: string | null = null;
    if (recordSession && videoObj) {
      try {
        tempVideoPath = await videoObj.path();
      } catch (err: any) {
        onLog(`Recording Warning: Could not retrieve video temporary path: ${err.message}`);
      }
    }

    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {}

    try {
      if (context) {
        await context.close();
      }
    } catch (e) {}

    try {
      if (browser) {
        await browser.close();
      }
    } catch (e) {}

    if (recordSession && tempVideoPath) {
      try {
        // Wait a small moment to ensure the file is completely flushed and finalized by Playwright
        await new Promise((resolve) => setTimeout(resolve, 250));

        if (fs.existsSync(tempVideoPath)) {
          const stats = fs.statSync(tempVideoPath);
          if (stats.size > 0) {
            const baseName = `session-${runId}.webm`;
            const finalPath = path.join(VIDEOS_DIR, baseName);
            fs.copyFileSync(tempVideoPath, finalPath);
            try {
              fs.unlinkSync(tempVideoPath);
            } catch (_) {}
            encryptFileInPlace(finalPath);
            const finalStats = fs.statSync(finalPath);
            
            const videoArtifact = {
              type: "video" as const,
              name: baseName,
              url: `/videos/${encodeURIComponent(baseName)}`,
              size: finalStats.size,
              timestamp: finalStats.mtime.toISOString()
            };
            if (!runner.artifacts.some(a => a.url === videoArtifact.url)) {
              runner.artifacts.push(videoArtifact);
              onArtifact(videoArtifact);
            }
            onLog(`Recording: Script execution session saved successfully (${finalStats.size} bytes): ${baseName}`);
          } else {
            onLog(`Recording Warning: Session video file has 0 bytes size.`);
          }
        } else {
          onLog(`Recording Warning: Session video file does not exist on disk.`);
        }
      } catch (err: any) {
        onLog(`Recording Error: Did not compile session video file: ${err.message}`);
      }
    }

    runner.isCompleted = true;
    activeRuns.delete(runId);

    // Clean up temporary files workspace directory
    if (fs.existsSync(workspaceDir)) {
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };

  try {
    // Launch playwright headless chromium
    // Production environment is configured to run without sandbox for secure, containerized, non-interactive execution
    const chromiumArgs = ["--disable-dev-shm-usage"];
    if (process.env.NODE_ENV === "production") {
      chromiumArgs.push("--no-sandbox", "--disable-setuid-sandbox");
    } else {
      // For compatible execution in different runtimes, keep or customize sandbox flags
      chromiumArgs.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    const launchOptions: any = {
      headless: true,
      args: chromiumArgs
    };
    if (isDebuggerMode) {
      launchOptions.slowMo = 1200;
      onLog("Debugger: Slow-motion execution enabled (1.2s delay per statement). Ready for breakpoints and active intervention.");
    }

    browser = await chromium.launch(launchOptions);
    runner.browser = browser;

    const contextOptions: any = {
      viewport: { 
        width: viewportWidth && viewportWidth > 0 ? viewportWidth : 1280, 
        height: viewportHeight && viewportHeight > 0 ? viewportHeight : 720 
      },
      deviceScaleFactor: 1,
    };

    if (skipCaptcha) {
      onLog("Stealth: Applying user-agent and locale emulation to skip CAPTCHAs...");
      contextOptions.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      contextOptions.locale = "en-US";
      contextOptions.timezoneId = "America/New_York";
      contextOptions.extraHTTPHeaders = {
        "Accept-Language": "en-US,en;q=0.9",
      };
    }

    if (recordSession) {
      onLog("Recording: Enabling session video recording...");
      contextOptions.recordVideo = {
        dir: TEMP_VIDEOS_DIR,
        size: { 
          width: viewportWidth && viewportWidth > 0 ? viewportWidth : 1280, 
          height: viewportHeight && viewportHeight > 0 ? viewportHeight : 720 
        }
      };
    }

    context = await browser.newContext(contextOptions);
    runner.context = context;

    if (skipCaptcha) {
      onLog("Stealth: Injecting window.navigator and WebGL anti-bot bypass scripts...");
      await context.addInitScript(() => {
        // Overwrite the webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });

        // Mock WebGL vendor & renderer
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
            return 'Intel Inc.';
          }
          if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
            return 'Intel(R) Iris(TM) Plus Graphics 640';
          }
          return getParameter.apply(this, arguments);
        };

        // Mock chrome status
        (window as any).chrome = {
          runtime: {}
        };

        // Mock plugins array
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });

        // Mock permissions query status
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });
    }

    page = await context.newPage();
    runner.page = page;
    if (page && recordSession) {
      videoObj = page.video();
    }

    onLog("Launch: Page successfully opened.");

    // Network logging interceptors
    const requestMap = new Map<any, { id: string; startTime: number; method: string; url: string; resourceType: string }>();
    let requestCounter = 0;

    const onNetworkEvent = (event: any) => {
      if (onNetwork) {
        try {
          onNetwork(event);
        } catch (err) {}
      }
    };

    requestHandler = (req) => {
      try {
        if (!active || !page || page.isClosed()) return;
        const requestId = `${runId}-req-${++requestCounter}`;
        const method = req.method();
        const url = req.url();
        const resourceType = req.resourceType();
        
        requestMap.set(req, {
          id: requestId,
          startTime: Date.now(),
          method,
          url,
          resourceType
        });

        onNetworkEvent({
          id: requestId,
          type: "request",
          method,
          url,
          resourceType,
          timestamp: new Date().toLocaleTimeString()
        });

        // Log key network requests to the main terminal console
        // (Logging to script console removed per user request)
      } catch (err) {}
    };

    responseHandler = async (res) => {
      try {
        if (!active || !page || page.isClosed()) return;
        const req = res.request();
        const reqInfo = requestMap.get(req);
        if (reqInfo) {
          const duration = Date.now() - reqInfo.startTime;
          const status = res.status();
          const statusText = res.statusText();
          
          let responseHeaders: Record<string, string> = {};
          try {
            responseHeaders = res.headers();
          } catch (e) {}

          let responseBody: string | undefined;
          const isTextOrJson = ["document", "fetch", "xhr"].includes(reqInfo.resourceType);
          if (isTextOrJson && status >= 200 && status < 300) {
            try {
              responseBody = await res.text();
            } catch (e) {
              // Body could be binary or failed to fetch
            }
          }

          onNetworkEvent({
            id: reqInfo.id,
            type: "response",
            method: reqInfo.method,
            url: reqInfo.url,
            resourceType: reqInfo.resourceType,
            status,
            statusText,
            duration,
            timestamp: new Date().toLocaleTimeString(),
            headers: responseHeaders,
            body: responseBody
          });

          // Logging to script console removed per user request
        }
      } catch (err) {}
    };

    requestfailedHandler = (req) => {
      try {
        if (!active || !page || page.isClosed()) return;
        const reqInfo = requestMap.get(req);
        if (reqInfo) {
          const duration = Date.now() - reqInfo.startTime;
          const failure = req.failure();
          const errorText = failure ? failure.errorText : "Failed";

          onNetworkEvent({
            id: reqInfo.id,
            type: "response",
            method: reqInfo.method,
            url: reqInfo.url,
            resourceType: reqInfo.resourceType,
            status: 0,
            statusText: errorText,
            duration,
            timestamp: new Date().toLocaleTimeString()
          });

          // Logging to script console removed per user request
        }
      } catch (err) {}
    };

    consoleHandler = (msg) => {
      try {
        if (!active || !page || page.isClosed()) return;
        onLog(`Page Console [${msg.type()}]: ${msg.text()}`);
      } catch (err) {}
    };

    pageerrorHandler = (err) => {
      try {
        if (!active || !page || page.isClosed()) return;
        onLog(`Page Error: ${err.message}`);
      } catch (err) {}
    };

    framenavigatedHandler = (frame) => {
      try {
        if (!active || !page || page.isClosed()) return;
        if (frame === page?.mainFrame()) {
          onLog(`Navigation: Main frame navigated to: ${frame.url()}`);
          if (context && onCookies) {
            context.cookies().then(cookiesList => {
              onCookies(cookiesList);
            }).catch(() => {});
          }
        }
      } catch (err) {}
    };

    page.on("request", requestHandler);
    page.on("response", responseHandler);
    page.on("requestfailed", requestfailedHandler);
    page.on("console", consoleHandler);
    page.on("pageerror", pageerrorHandler);
    page.on("framenavigated", framenavigatedHandler);

    // Start Live screenshot stream loop
    previewInterval = setInterval(async () => {
      if (!active || !page || page.isClosed()) return;
      try {
        const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 60 });
        const base64 = screenshotBuffer.toString("base64");
        onPreview(`data:image/jpeg;base64,${base64}`);
        
        // Scan for updated files concurrently while running code
        const newlyFound = scanAndMoveArtifacts(startTime, scriptId);
        for (const item of newlyFound) {
          if (!runner.artifacts.some(a => a.url === item.url)) {
            runner.artifacts.push(item);
            onArtifact(item);
          }
        }
      } catch (err) {
        // ignore errors during quick preview updates
      }
    }, 700);

    // Timeout guard (configurable limit; defaults to 60s)
    const runTimeoutMs = timeout && timeout > 0 ? timeout : 60000;
    const timeoutId = setTimeout(async () => {
      if (active) {
        onLog(`Timeout: Script exceeded ${runTimeoutMs / 1000}s execution limit. Process terminated.`);
        await cleanUp();
      }
    }, runTimeoutMs);

    // Build playground environment
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    
    // Custom Console inside user's run environment
    const customConsole = {
      log: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" ");
        onLog(`Log: ${msg}`);
      },
      error: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" ");
        onLog(`ERROR: ${msg}`);
      },
      warn: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" ");
        onLog(`Warning: ${msg}`);
      },
      info: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" ");
        onLog(`Info: ${msg}`);
      }
    };

    onLog("Execution: Running Playwright script...");

    // Create safe process, global and globalThis proxies to sandbox user-supplied code completely
    const userEnv = env || {};
    const safeProcess = new Proxy(process, {
      get(target, prop, receiver) {
        if (prop === "env") {
          return userEnv;
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    const safeGlobal: any = new Proxy(global, {
      get(target, prop, receiver) {
        if (prop === "process") {
          return safeProcess;
        }
        if (prop === "global") {
          return safeGlobal;
        }
        if (prop === "globalThis") {
          return safeGlobalThis;
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    const safeGlobalThis: any = new Proxy(globalThis, {
      get(target, prop, receiver) {
        if (prop === "process") {
          return safeProcess;
        }
        if (prop === "global") {
          return safeGlobal;
        }
        if (prop === "globalThis") {
          return safeGlobalThis;
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    
    // Proxy-wrap page to pause before any non-trivial interaction
    const wrapPageOfPlaywright = (origPage: any) => {
      if (!origPage) return origPage;
      return new Proxy(origPage, {
        get(target, prop, receiver) {
          if (prop === "solveCaptcha") {
            return async function(selector: string, options?: any) {
              const mergedOptions = { binarize: binarizeCaptcha, useGemini: useGeminiCaptcha, ...options };
              const engineName = mergedOptions.useGemini ? "Gemini" : "Tesseract";
              onLog(`Stealth: Running ${engineName} OCR on selector "${selector}"...`);
              try {
                const res = await solveCaptcha(origPage, selector, mergedOptions);
                onLog(`Stealth: CAPTCHA OCR recognized text: "${res.text}" with ${res.confidence}% confidence.`);
                return res;
              } catch (err: any) {
                onLog(`Stealth: CAPTCHA OCR failed: ${err.message || err}`);
                throw err;
              }
            };
          }
          if (prop === "solveCaptchaFromImage") {
            return async function(source: any, options?: any) {
              const mergedOptions = { binarize: binarizeCaptcha, useGemini: useGeminiCaptcha, ...options };
              const engineName = mergedOptions.useGemini ? "Gemini" : "Tesseract";
              onLog(`Stealth: Running ${engineName} OCR on custom image source...`);
              try {
                let finalSource = source;
                if (mergedOptions.binarize && Buffer.isBuffer(source)) {
                  try {
                    finalSource = await binarizeImage(source);
                    // Also save to cwd so it gets picked up as artifact
                    fs.writeFileSync(path.join(process.cwd(), "captcha_binarized.png"), finalSource);
                  } catch (e) {
                    // silently fail
                  }
                }
                const res = await solveCaptchaFromBuffer(finalSource, mergedOptions);
                onLog(`Stealth: Custom CAPTCHA OCR recognized text: "${res.text}" with ${res.confidence}% confidence.`);
                return res;
              } catch (err: any) {
                onLog(`Stealth: Custom CAPTCHA OCR failed: ${err.message || err}`);
                throw err;
              }
            };
          }
          if (prop === "chooseElements") {
            return async function(selector: string) {
              onLog(`Interactive Choice: Querying selector "${selector}"...`);
              const locators = await origPage.locator(selector).all();
              if (locators.length === 0) {
                onLog(`Interactive Choice: No elements found matching "${selector}".`);
                return [];
              }

              const options = [];
              for (let i = 0; i < locators.length; i++) {
                const loc = locators[i];
                let text = "";
                let html = "";
                let tagName = "";
                let classList = "";
                let id = "";
                try { text = await loc.innerText(); } catch(e){}
                try { html = await loc.evaluate(el => el.outerHTML); } catch(e){}
                try { tagName = await loc.evaluate(el => el.tagName.toLowerCase()); } catch(e){}
                try { classList = await loc.evaluate(el => el.className); } catch(e){}
                try { id = await loc.evaluate(el => el.id); } catch(e){}
                
                options.push({
                  index: i,
                  text: text.trim() || `Element ${i + 1}`,
                  selector: selector,
                  html: html,
                  tagName,
                  classList,
                  id
                });
              }

              const selectedIndexes = await PlaywrightInteractionManager.promptChoice(
                runId,
                options,
                onLog,
                onChoicePrompt
              );

              return selectedIndexes.map(idx => locators[idx]).filter(Boolean);
            };
          }
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === "function") {
            const propName = String(prop);
            // Methods we explicitly don't wait on (to avoid nested hangs on basic getters/event listeners)
            const skippedProps = [
              "isClosed", "on", "video", "addListener", "removeListener", "off", "emit", "url", "waitForEvent",
              "locator", "frameLocator", "keyboard", "mouse", "touchscreen", "mainFrame", "request"
            ];
            if (!skippedProps.includes(propName)) {
              return async function(...args: any[]) {
                await PlaywrightPauseManager.checkPause(runId, onLog);
                return await val.apply(target, args);
              };
            }
          }
          return val;
        }
      });
    };

    const safePage = wrapPageOfPlaywright(page);

    // Custom breakpoint pause function for user scripts
    const customPause = async (msg?: string) => {
      onLog(`Break: Execution paused by user breakpoint${msg ? `: "${msg}"` : ""}. Please solve manual tasks, then click resume.`);
      PlaywrightPauseManager.pause(runId);
      await PlaywrightPauseManager.checkPause(runId, onLog);
    };

    // Evaluate Javascript with provided context
    const fn = new AsyncFunction(
      "browser",
      "context",
      "page",
      "console",
      "require",
      "chromium",
      "process",
      "global",
      "globalThis",
      "pause",
      "solveCaptcha",
      "solveCaptchaFromImage",
      "chooseElements",
      `
      try {
        ${instrumentedCode}
      } catch (err) {
        throw err;
      }
      `
    );

    // Execute script
    let wsRequire: any;
    let rootRequire: any;
    try {
      wsRequire = createRequire(path.join(workspaceDir, "main.js"));
    } catch {
      wsRequire = createRequire(import.meta.url);
    }
    try {
      rootRequire = createRequire(path.join(process.cwd(), "package.json"));
    } catch {
      rootRequire = wsRequire;
    }

    const customRequire: any = (moduleName: string) => {
      try {
        return wsRequire(moduleName);
      } catch (wsErr: any) {
        try {
          return rootRequire(moduleName);
        } catch (rootErr: any) {
          const pkgToInstall = getCleanPackageName(moduleName);
          if (pkgToInstall && !autoInstalledPackages.has(pkgToInstall) && /^[a-zA-Z0-9\-@\/._]+$/.test(pkgToInstall)) {
            try {
              onLog(`NPM: Module "${moduleName}" is not yet installed. Auto-installing "${pkgToInstall}"...`);
              execSync(`npm install ${pkgToInstall}`, { cwd: process.cwd(), stdio: "ignore", timeout: 120000 });
              autoInstalledPackages.add(pkgToInstall);
              onLog(`NPM: Package "${pkgToInstall}" installed successfully!`);
              const freshRootRequire = createRequire(path.join(process.cwd(), "package.json"));
              return freshRootRequire(moduleName);
            } catch (installErr: any) {
              onLog(`NPM Error: Auto-install failed for "${pkgToInstall}": ${installErr.message || installErr}`);
            }
          }
          throw wsErr;
        }
      }
    };
    if (wsRequire) {
      Object.assign(customRequire, wsRequire);
      customRequire.resolve = (specifier: string, options?: any) => {
        try {
          return wsRequire.resolve(specifier, options);
        } catch (e) {
          return rootRequire.resolve(specifier, options);
        }
      };
    }

    const result = await fn(
      browser,
      context,
      safePage,
      customConsole,
      customRequire,
      chromium,
      safeProcess,
      safeGlobal,
      safeGlobalThis,
      customPause,
      async (selector: string, options?: any) => {
        const mergedOptions = { binarize: binarizeCaptcha, useGemini: useGeminiCaptcha, ...options };
        const engineName = mergedOptions.useGemini ? "Gemini" : "Tesseract";
        onLog(`Stealth: Running global ${engineName} OCR on selector "${selector}"...`);
        try {
          const res = await solveCaptcha(page, selector, mergedOptions);
          onLog(`Stealth: CAPTCHA OCR recognized text: "${res.text}" with ${res.confidence}% confidence.`);
          return res;
        } catch (err: any) {
          onLog(`Stealth: CAPTCHA OCR failed: ${err.message || err}`);
          throw err;
        }
      },
      async (source: any, options?: any) => {
        const mergedOptions = { binarize: binarizeCaptcha, useGemini: useGeminiCaptcha, ...options };
        const engineName = mergedOptions.useGemini ? "Gemini" : "Tesseract";
        onLog(`Stealth: Running global ${engineName} OCR on custom image source...`);
        try {
          let finalSource = source;
          if (mergedOptions.binarize && Buffer.isBuffer(source)) {
            try {
              finalSource = await binarizeImage(source);
              // Also save to cwd so it gets picked up as artifact
              fs.writeFileSync(path.join(process.cwd(), "captcha_binarized.png"), finalSource);
            } catch (e) {
              // silently fail
            }
          }
          const res = await solveCaptchaFromBuffer(finalSource, mergedOptions);
          onLog(`Stealth: Custom CAPTCHA OCR recognized text: "${res.text}" with ${res.confidence}% confidence.`);
          return res;
        } catch (err: any) {
          onLog(`Stealth: Custom CAPTCHA OCR failed: ${err.message || err}`);
          throw err;
        }
      },
      async (selector: string) => {
        return await safePage.chooseElements(selector);
      }
    );
    
    clearTimeout(timeoutId);
    onLog("Execution: Script completed successfully!");
    
    // Return standard returned value
    await cleanUp();
    return result;

  } catch (error: any) {
    onLog(`Execution Error: ${error.message || error}`);
    await cleanUp();
    throw error;
  }
}
