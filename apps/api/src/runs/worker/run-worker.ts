/**
 * Child process entry point for a single script run.
 *
 * The API forks one worker per run with its cwd set to the run's workspace folder, so
 * relative paths in user code (screenshots, exports, reading uploads/) land in that
 * folder. The parent watches the folder for outputs; this process only drives the browser.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { binarizeImage, type CaptchaSolveOptions, solveCaptcha, solveCaptchaFromBuffer } from "./captcha-solver.js";
import { importsToRequires } from "./transform.js";
import type { ChoiceOption, LogLevel, LogSource, NetworkEvent, ParentMessage, WorkerMessage, WorkerStart } from "./protocol.js";

const send = (msg: WorkerMessage) => process.send?.(msg);

let opts: WorkerStart;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let previewTimer: NodeJS.Timeout | null = null;
let finished = false;

let pauseGate: { promise: Promise<void>; release: () => void } | null = null;
let pendingChoice: ((indexes: number[]) => void) | null = null;

function redact(text: string): string {
  let out = text;
  for (const secret of opts?.redact ?? []) {
    if (secret.length >= 3) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function log(source: LogSource, level: LogLevel, message: string) {
  send({ type: "log", source, level, message: redact(message), at: new Date().toISOString() });
}
const system = (message: string, level: LogLevel = "info") => log("system", level, message);

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function pause(line?: number) {
  if (pauseGate) return;
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  pauseGate = { promise, release };
  send({ type: "paused", paused: true, line });
}

function resume() {
  if (!pauseGate) return;
  pauseGate.release();
  pauseGate = null;
  send({ type: "paused", paused: false });
}

async function waitWhilePaused() {
  while (pauseGate) await pauseGate.promise;
}

const BUILTINS = new Set(
  (createRequire(import.meta.url)("node:module") as typeof import("node:module")).builtinModules,
);
const installed = new Set<string>();

function packageName(specifier: string): string | null {
  if (!specifier || /^[./]/.test(specifier) || specifier.startsWith("node:") || BUILTINS.has(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? (parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

function buildRequire(): NodeJS.Require {
  const fromWorkspace = createRequire(path.join(process.cwd(), "index.js"));
  const fromPackages = createRequire(path.join(opts.packagesDir, "package.json"));
  const fromApp = createRequire(path.join(opts.appRoot, "package.json"));
  const chain = [fromWorkspace, fromPackages, fromApp];

  const tryAll = (id: string) => {
    let first: unknown;
    for (const r of chain) {
      try {
        return r(id);
      } catch (err) {
        first ??= err;
      }
    }
    throw first;
  };

  const req = ((id: string) => {
    try {
      return tryAll(id);
    } catch (err) {
      const pkg = packageName(id);
      if (!pkg || installed.has(pkg) || !/^[a-zA-Z0-9\-@/._]+$/.test(pkg)) throw err;
      system(`Package "${pkg}" is not installed yet, installing it now.`);
      installed.add(pkg);
      execFileSync("npm", ["install", "--no-audit", "--no-fund", "--prefix", opts.packagesDir, pkg], {
        stdio: "ignore",
        timeout: 180_000,
      });
      system(`Installed "${pkg}".`, "success");
      return createRequire(path.join(opts.packagesDir, "package.json"))(id);
    }
  }) as NodeJS.Require;
  req.resolve = ((id: string, o?: { paths?: string[] }) => {
    for (const r of chain) {
      try {
        return r.resolve(id, o);
      } catch {}
    }
    return fromWorkspace.resolve(id, o);
  }) as NodeJS.RequireResolve;
  req.cache = fromWorkspace.cache;
  return req;
}

function captchaOptions(extra?: CaptchaSolveOptions): CaptchaSolveOptions {
  return {
    binarize: opts.binarizeCaptcha,
    useGemini: opts.useGeminiCaptcha,
    ...extra,
    gemini: { ...opts.gemini, onUsed: () => send({ type: "gemini-used" }) },
  };
}

async function captchaFromSelector(target: Page, selector: string, extra?: CaptchaSolveOptions) {
  const o = captchaOptions(extra);
  system(`Reading CAPTCHA "${selector}" with ${o.useGemini ? "Gemini" : "Tesseract"}.`);
  const res = await solveCaptcha(target, selector, o);
  system(`CAPTCHA read as "${res.text}" (${Math.round(res.confidence)}% confidence).`, "success");
  return res;
}

async function captchaFromImage(source: Buffer | string, extra?: CaptchaSolveOptions) {
  const o = captchaOptions(extra);
  let input = source;
  if (o.binarize && Buffer.isBuffer(source)) {
    try {
      input = await binarizeImage(source);
      fs.writeFileSync("captcha_binarized.png", input);
    } catch {}
  }
  system(`Reading CAPTCHA image with ${o.useGemini ? "Gemini" : "Tesseract"}.`);
  const res = await solveCaptchaFromBuffer(input, o);
  system(`CAPTCHA read as "${res.text}" (${Math.round(res.confidence)}% confidence).`, "success");
  return res;
}

async function chooseElements(target: Page, selector: string) {
  const locators = await target.locator(selector).all();
  if (locators.length === 0) {
    system(`chooseElements: nothing matches "${selector}".`, "warning");
    return [];
  }
  const options: ChoiceOption[] = [];
  for (const [index, loc] of locators.entries()) {
    const info = await loc
      .evaluate((el) => ({
        text: (el as HTMLElement).innerText ?? "",
        tagName: el.tagName.toLowerCase(),
        id: el.id,
        classList: typeof el.className === "string" ? el.className : "",
        html: el.outerHTML.slice(0, 400),
      }))
      .catch(() => ({ text: "", tagName: "", id: "", classList: "", html: "" }));
    options.push({ index, ...info, text: info.text.trim().slice(0, 200) || `Element ${index + 1}` });
  }

  let indexes: number[];
  if (!opts.interactive) {
    system(`chooseElements: no one is watching this run, so all ${options.length} matches are used.`);
    indexes = options.map((o) => o.index);
  } else {
    system(`chooseElements: ${options.length} matches for "${selector}". Waiting for your pick.`);
    indexes = await new Promise<number[]>((resolve) => {
      pendingChoice = resolve;
      send({ type: "choice", selector, options });
    });
    system(`chooseElements: continuing with ${indexes.length} selected.`);
  }
  return indexes.map((i) => locators[i]).filter(Boolean);
}

/** Wrap page so a manual pause halts the script before its next page action. */
function pausablePage(target: Page): Page {
  const passthrough = new Set([
    "isClosed", "on", "once", "off", "addListener", "removeListener", "emit", "video", "url",
    "locator", "frameLocator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByTestId",
    "getByAltText", "getByTitle", "keyboard", "mouse", "touchscreen", "mainFrame", "request", "context",
  ]);
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === "solveCaptcha") return (sel: string, o?: CaptchaSolveOptions) => captchaFromSelector(obj, sel, o);
      if (prop === "solveCaptchaFromImage") return (src: Buffer | string, o?: CaptchaSolveOptions) => captchaFromImage(src, o);
      if (prop === "chooseElements") return (sel: string) => chooseElements(obj, sel);
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function" || passthrough.has(String(prop))) return value;
      return async (...args: unknown[]) => {
        await waitWhilePaused();
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
}

function instrument(code: string): string {
  const source = importsToRequires(code);
  if (!opts.debug || opts.breakpoints.length === 0) return source;
  system(`Debugger: ${opts.breakpoints.length} breakpoint(s) set.`);
  const marks = new Set(opts.breakpoints);
  return source
    .split("\n")
    .map((line, i) => (marks.has(i + 1) ? `await __breakpoint(${i + 1});\n${line}` : line))
    .join("\n");
}

function startPreview() {
  let busy = false;
  previewTimer = setInterval(async () => {
    if (busy || !page || page.isClosed()) return;
    busy = true;
    try {
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      send({ type: "preview", image: `data:image/jpeg;base64,${shot.toString("base64")}` });
    } catch {
    } finally {
      busy = false;
    }
  }, 700);
}

function watchPage(target: Page) {
  const requests = new Map<object, { id: string; started: number }>();
  let counter = 0;
  const base = (req: import("playwright").Request) => ({
    method: req.method(),
    url: req.url(),
    resourceType: req.resourceType(),
  });
  const emit = (event: Omit<NetworkEvent, "at">) => send({ type: "network", event: { ...event, at: new Date().toISOString() } });

  target.on("request", (req) => {
    const id = `${opts.runId}-${++counter}`;
    requests.set(req, { id, started: Date.now() });
    emit({ id, phase: "request", ...base(req) });
  });
  target.on("response", async (res) => {
    const req = res.request();
    const info = requests.get(req);
    if (!info) return;
    let body: string | undefined;
    const textual = ["document", "fetch", "xhr"].includes(req.resourceType());
    if (textual && res.status() >= 200 && res.status() < 300) {
      body = await res.text().then((t) => t.slice(0, 200_000)).catch(() => undefined);
    }
    emit({
      id: info.id,
      phase: "response",
      ...base(req),
      status: res.status(),
      statusText: res.statusText(),
      duration: Date.now() - info.started,
      headers: res.headers(),
      body,
    });
  });
  target.on("requestfailed", (req) => {
    const info = requests.get(req);
    if (!info) return;
    emit({ id: info.id, phase: "failed", ...base(req), status: 0, statusText: req.failure()?.errorText ?? "Failed", duration: Date.now() - info.started });
  });
  target.on("console", (msg) => {
    const type = msg.type();
    const level: LogLevel = type === "error" ? "error" : type === "warning" ? "warning" : type === "info" ? "info" : "log";
    log("browser", level, msg.text());
  });
  target.on("pageerror", (err) => log("browser", "error", err.message));
  target.on("framenavigated", (frame) => {
    if (frame !== target.mainFrame()) return;
    system(`Navigated to ${frame.url()}`);
    void sendCookies();
  });
}

async function sendCookies() {
  if (!context) return;
  try {
    send({ type: "cookies", cookies: await context.cookies() });
  } catch {}
}

async function teardown() {
  if (previewTimer) clearInterval(previewTimer);
  await sendCookies();
  const video = opts?.recordVideo ? page?.video() : null;
  try {
    if (page && !page.isClosed()) await page.close();
  } catch {}
  if (video) {
    try {
      await video.saveAs(path.join(process.cwd(), `session-${opts.runId}.webm`));
      system("Session recording saved.", "success");
    } catch (err) {
      system(`Could not save the session recording: ${(err as Error).message}`, "warning");
    }
  }
  try {
    await context?.close();
  } catch {}
  try {
    await browser?.close();
  } catch {}
}

async function finish(status: "success" | "failed" | "stopped", error?: string) {
  if (finished) return;
  finished = true;
  resume();
  pendingChoice?.([]);
  await teardown();
  send({ type: "done", status, error });
  setTimeout(() => process.exit(0), 50);
}

async function run(start: WorkerStart) {
  opts = start;
  const launchArgs = ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"];
  system("Launching Chromium.");
  browser = await chromium.launch({ headless: true, args: launchArgs, slowMo: opts.debug ? 600 : undefined });

  context = await browser.newContext({
    viewport: opts.viewport,
    deviceScaleFactor: 1,
    ...(opts.stealth
      ? {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          locale: "en-US",
          timezoneId: "America/New_York",
          extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
        }
      : {}),
    ...(opts.recordVideo ? { recordVideo: { dir: path.join(process.cwd(), ".video"), size: opts.viewport } } : {}),
  });

  if (opts.stealth) {
    system("Stealth mode: masking automation fingerprints.");
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      (window as unknown as { chrome: unknown }).chrome = { runtime: {} };
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (p: number) {
        if (p === 37445) return "Intel Inc.";
        if (p === 37446) return "Intel(R) Iris(TM) Plus Graphics 640";
        return getParameter.call(this, p);
      };
    });
  }

  page = await context.newPage();
  watchPage(page);
  startPreview();

  const safePage = pausablePage(page);
  const scriptConsole = {
    log: (...a: unknown[]) => log("script", "log", format(a)),
    info: (...a: unknown[]) => log("script", "info", format(a)),
    warn: (...a: unknown[]) => log("script", "warning", format(a)),
    error: (...a: unknown[]) => log("script", "error", format(a)),
    debug: (...a: unknown[]) => log("script", "log", format(a)),
    table: (...a: unknown[]) => log("script", "log", format(a)),
  };
  const userPause = async (label?: string) => {
    system(`Paused${label ? `: ${label}` : ""}. Resume when you are ready.`, "warning");
    pause();
    await waitWhilePaused();
  };
  const breakpoint = async (line: number) => {
    system(`Breakpoint hit on line ${line}.`, "warning");
    pause(line);
    await waitWhilePaused();
  };

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
  const fn = new AsyncFunction(
    "browser", "context", "page", "console", "require", "chromium", "pause", "__breakpoint",
    "solveCaptcha", "solveCaptchaFromImage", "chooseElements", "__filename", "__dirname",
    instrument(opts.entryCode),
  );

  system(`Running ${opts.entryFile}.`);
  await fn(
    browser, context, safePage, scriptConsole, buildRequire(), chromium, userPause, breakpoint,
    (sel: string, o?: CaptchaSolveOptions) => captchaFromSelector(page!, sel, o),
    (src: Buffer | string, o?: CaptchaSolveOptions) => captchaFromImage(src, o),
    (sel: string) => chooseElements(page!, sel),
    path.join(process.cwd(), opts.entryFile),
    process.cwd(),
  );
  system("Script finished.", "success");
}

process.on("message", async (raw: ParentMessage) => {
  switch (raw.type) {
    case "start":
      try {
        await run(raw.payload);
        await finish("success");
      } catch (err) {
        if (finished) return;
        const message = err instanceof Error ? err.message : String(err);
        log("system", "error", message);
        await finish("failed", redact(message));
      }
      break;
    case "stop":
      system("Stopped by user.", "warning");
      await finish("stopped");
      break;
    case "pause":
      system("Paused before the next page action.", "warning");
      pause();
      break;
    case "resume":
      system("Resumed.");
      resume();
      break;
    case "choice":
      pendingChoice?.(raw.indexes);
      pendingChoice = null;
      break;
    case "click":
      await page?.mouse.click(Math.round(raw.x), Math.round(raw.y)).catch(() => {});
      system(`Clicked at ${Math.round(raw.x)}, ${Math.round(raw.y)}.`);
      break;
    case "type":
      await page?.keyboard.type(raw.text).catch(() => {});
      system(`Typed ${raw.text.length} character(s).`);
      break;
    case "key":
      await page?.keyboard.press(raw.key).catch(() => {});
      system(`Pressed ${raw.key}.`);
      break;
  }
});

process.on("unhandledRejection", (reason) => {
  log("system", "error", `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
process.on("disconnect", () => {
  void finish("stopped").finally(() => process.exit(0));
});
