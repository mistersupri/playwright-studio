import {
  ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnApplicationShutdown,
} from "@nestjs/common";
import { type ChildProcess, fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { type ArtifactDto, ArtifactsService } from "../artifacts/artifacts.service.js";
import { SettingsService } from "../ai/settings.service.js";
import { decryptJson, encryptJson } from "../common/crypto.js";
import { newId } from "../common/ids.js";
import { API_ROOT, config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { runs } from "../database/schema.js";
import { type ProjectFile, ProjectsService } from "../projects/projects.service.js";
import { VariablesService } from "../variables/variables.service.js";
import type {
  ChoiceOption, LogLevel, LogSource, NetworkEvent, ParentMessage, RecordedStep, WorkerMessage, WorkerStart,
} from "./worker/protocol.js";
import { importsToRequires } from "./worker/transform.js";

const WORKER = fileURLToPath(new URL("./worker/run-worker.js", import.meta.url));
const MAX_LOGS = 5000;
const MAX_NETWORK = 1000;

export interface LogLine {
  source: LogSource;
  level: LogLevel;
  message: string;
  at: string;
}

export interface StartRunInput {
  userId: string;
  projectId?: string | null;
  projectName: string;
  files: ProjectFile[];
  entryFile: string;
  workspaceId?: string | null;
  timeoutSeconds?: number;
  viewport?: { width: number; height: number };
  stealth?: boolean;
  binarizeCaptcha?: boolean;
  useGeminiCaptcha?: boolean;
  recordVideo?: boolean;
  debug?: boolean;
  breakpoints?: number[];
  trigger?: "manual" | "schedule";
  /** Open a page for recording instead of running the entry file. */
  record?: { url: string };
}

type RunEvent =
  | { type: "status"; data: { status: RunStatus; paused: boolean; line?: number } }
  | { type: "log"; data: LogLine }
  | { type: "preview"; data: { image: string } }
  | { type: "network"; data: NetworkEvent }
  | { type: "cookies"; data: unknown[] }
  | { type: "choice"; data: { selector: string; options: ChoiceOption[] } | null }
  | { type: "artifact"; data: ArtifactDto }
  | { type: "url"; data: { url: string } }
  | { type: "step"; data: RecordedStep }
  | { type: "recording"; data: { on: boolean } }
  | { type: "inspected"; data: Extract<WorkerMessage, { type: "inspected" }> }
  | { type: "done"; data: { status: RunStatus; error?: string } };

type RunStatus = "running" | "success" | "failed" | "stopped";

interface Session {
  id: string;
  userId: string;
  projectId: string | null;
  child: ChildProcess;
  workspace: string;
  sourceFiles: Set<string>;
  baseline: Map<string, number>;
  pendingSizes: Map<string, number>;
  status: RunStatus;
  error?: string;
  paused: boolean;
  pausedLine?: number;
  choice: { selector: string; options: ChoiceOption[] } | null;
  logs: LogLine[];
  network: NetworkEvent[];
  cookies: unknown[];
  preview: string | null;
  artifacts: ArtifactDto[];
  listeners: Set<(e: RunEvent) => void>;
  timers: NodeJS.Timeout[];
  scanning: Promise<void> | null;
  timedOut: boolean;
  url: string | null;
  steps: RecordedStep[];
  recording: boolean;
  saveSessionFor: string | null;
}

function walk(dir: string, root = dir, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".video") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, out);
    else if (entry.isFile()) out.push(path.relative(root, abs));
  }
  return out;
}

@Injectable()
export class RunsService implements OnApplicationShutdown {
  private readonly logger = new Logger(RunsService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly projects: ProjectsService,
    private readonly artifacts: ArtifactsService,
    private readonly variables: VariablesService,
    private readonly settings: SettingsService,
  ) {}

  private activeCount() {
    return [...this.sessions.values()].filter((s) => s.status === "running").length;
  }

  async start(input: StartRunInput) {
    if (this.activeCount() >= config.maxConcurrentRuns) {
      throw new HttpException(
        `The server is already running ${config.maxConcurrentRuns} scripts. Wait for one to finish.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let projectId: string | null = null;
    let storageState: unknown;
    let keepSession = false;
    if (input.projectId) {
      const project = await this.projects.readable(input.projectId, input.userId);
      projectId = project.id;
      keepSession = project.keepSession;
      if (keepSession) storageState = await this.projects.loadSession(project.id, input.userId);
    }
    const entry = input.record ? { name: input.entryFile, code: "" } : input.files.find((f) => f.name === input.entryFile);
    if (!entry) throw new NotFoundException(`File ${input.entryFile} is not in the project.`);

    const id = newId(14);
    const workspace = path.join(config.paths.runs, id);
    this.prepareWorkspace(workspace, input.files, input.entryFile, projectId);

    const { env, secrets } = await this.variables.resolve(input.userId, input.workspaceId);
    const gemini = await this.settings.gemini(input.userId);
    const childEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: process.env.LANG ?? "C.UTF-8",
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: "production",
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
      npm_config_cache: path.join(config.dataDir, ".npm"),
      ...env,
    };

    await this.db.insert(runs).values({
      id,
      userId: input.userId,
      projectId,
      projectName: input.projectName,
      entryFile: input.record ? "Recording" : input.entryFile,
      trigger: input.trigger ?? "manual",
      status: "running",
    });

    const child = fork(WORKER, [], { cwd: workspace, env: childEnv, execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const session: Session = {
      id,
      userId: input.userId,
      projectId,
      child,
      workspace,
      sourceFiles: new Set(input.files.map((f) => f.name)),
      baseline: new Map(walk(workspace).map((f) => [f, fs.statSync(path.join(workspace, f)).mtimeMs])),
      pendingSizes: new Map(),
      status: "running",
      paused: false,
      choice: null,
      logs: [],
      network: [],
      cookies: [],
      preview: null,
      artifacts: [],
      listeners: new Set(),
      timers: [],
      scanning: null,
      timedOut: false,
      url: null,
      steps: [],
      recording: false,
      saveSessionFor: keepSession && projectId ? projectId : null,
    };
    this.sessions.set(id, session);

    const pipeOutput = (level: LogLevel) => (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        this.pushLog(session, { source: "script", level, message: line, at: new Date().toISOString() });
      }
    };
    child.stdout?.on("data", pipeOutput("log"));
    child.stderr?.on("data", pipeOutput("error"));
    child.on("message", (msg: WorkerMessage) => this.onWorkerMessage(session, msg));
    child.on("exit", (code) => {
      if (session.status === "running") {
        void this.complete(session, "failed", `The run process exited unexpectedly (code ${code ?? "unknown"}).`);
      }
    });

    // Recording sessions last as long as the server allows; people stop them when done.
    const limit = input.record ? config.maxRunSeconds : Math.min(input.timeoutSeconds ?? 120, config.maxRunSeconds);
    session.timers.push(
      setTimeout(() => {
        if (session.status !== "running") return;
        this.pushLog(session, { source: "system", level: "error", message: `Time limit of ${limit}s reached.`, at: new Date().toISOString() });
        session.error = `Time limit of ${limit}s reached.`;
        session.timedOut = true;
        this.stop(id, input.userId).catch(() => {});
      }, limit * 1000),
      setInterval(() => void this.scan(session, false), 1500),
    );

    const start: WorkerStart = {
      runId: id,
      entryFile: input.entryFile,
      entryCode: entry.code,
      viewport: input.viewport ?? { width: 1280, height: 720 },
      debug: Boolean(input.debug),
      breakpoints: input.debug ? (input.breakpoints ?? []) : [],
      stealth: Boolean(input.stealth),
      binarizeCaptcha: Boolean(input.binarizeCaptcha),
      useGeminiCaptcha: Boolean(input.useGeminiCaptcha),
      recordVideo: Boolean(input.recordVideo),
      gemini,
      redact: secrets,
      packagesDir: config.paths.packages,
      appRoot: API_ROOT,
      interactive: (input.trigger ?? "manual") === "manual",
      mode: input.record ? "record" : "script",
      startUrl: input.record?.url,
      storageState,
      saveSession: keepSession,
    };
    this.send(session, { type: "start", payload: start });
    return { runId: id };
  }

  private prepareWorkspace(dir: string, files: ProjectFile[], entryFile: string, projectId: string | null) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "run", private: true, type: "commonjs" }));
    for (const f of files) {
      const target = path.resolve(dir, f.name);
      if (!target.startsWith(dir + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // The entry file is wrapped by the worker; helper modules are loaded with require().
      fs.writeFileSync(target, f.name === entryFile || !/\.[cm]?js$/.test(f.name) ? f.code : importsToRequires(f.code));
    }
    const uploads = projectId ? this.artifacts.uploadsDir(projectId) : null;
    fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
    if (uploads && fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dir, "uploads"), { recursive: true });
  }

  private send(session: Session, msg: ParentMessage) {
    if (session.child.connected) session.child.send(msg);
  }

  private emit(session: Session, event: RunEvent) {
    for (const listener of session.listeners) listener(event);
  }

  private pushLog(session: Session, line: LogLine) {
    session.logs.push(line);
    if (session.logs.length > MAX_LOGS) session.logs.splice(0, session.logs.length - MAX_LOGS);
    this.emit(session, { type: "log", data: line });
  }

  private statusEvent(session: Session): RunEvent {
    return { type: "status", data: { status: session.status, paused: session.paused, line: session.pausedLine } };
  }

  private onWorkerMessage(session: Session, msg: WorkerMessage) {
    switch (msg.type) {
      case "log":
        this.pushLog(session, { source: msg.source, level: msg.level, message: msg.message, at: msg.at });
        break;
      case "preview":
        session.preview = msg.image;
        this.emit(session, { type: "preview", data: { image: msg.image } });
        break;
      case "network":
        session.network.push(msg.event);
        if (session.network.length > MAX_NETWORK) session.network.shift();
        this.emit(session, { type: "network", data: msg.event });
        break;
      case "cookies":
        session.cookies = msg.cookies;
        this.emit(session, { type: "cookies", data: msg.cookies });
        break;
      case "choice":
        session.choice = { selector: msg.selector, options: msg.options };
        this.emit(session, { type: "choice", data: session.choice });
        break;
      case "paused":
        session.paused = msg.paused;
        session.pausedLine = msg.paused ? msg.line : undefined;
        this.emit(session, this.statusEvent(session));
        break;
      case "url":
        session.url = msg.url;
        this.emit(session, { type: "url", data: { url: msg.url } });
        break;
      case "step":
        session.steps.push(msg.step);
        this.emit(session, { type: "step", data: msg.step });
        break;
      case "recording":
        session.recording = msg.on;
        this.emit(session, { type: "recording", data: { on: msg.on } });
        break;
      case "inspected":
        this.emit(session, { type: "inspected", data: msg });
        break;
      case "session":
        if (session.saveSessionFor) {
          void this.projects
            .saveSession(session.saveSessionFor, session.userId, msg.state)
            .then(() => this.pushLog(session, { source: "system", level: "info", message: "Saved the browser session for the next run.", at: new Date().toISOString() }))
            .catch((err) => this.logger.warn(`Could not save session: ${err.message}`));
        }
        break;
      case "gemini-used":
        void this.settings.countCaptcha(session.userId).catch(() => {});
        break;
      case "done":
        void this.complete(session, msg.status, session.error ?? msg.error);
        break;
    }
  }

  /** Move new files from the workspace into artifact storage. */
  private scan(session: Session, final: boolean): Promise<void> {
    if (session.scanning) return final ? session.scanning.then(() => this.scan(session, true)) : session.scanning;
    const pass = async () => {
      try {
        if (!fs.existsSync(session.workspace)) return;
        for (const rel of walk(session.workspace)) {
          if (rel === "package.json" || session.sourceFiles.has(rel)) continue;
          const abs = path.join(session.workspace, rel);
          const stat = fs.statSync(abs);
          const before = session.baseline.get(rel);
          if (before !== undefined && before === stat.mtimeMs) continue;
          // Wait until a file stops growing so half-written exports are not captured.
          if (!final && session.pendingSizes.get(rel) !== stat.size) {
            session.pendingSizes.set(rel, stat.size);
            continue;
          }
          session.pendingSizes.delete(rel);
          const artifact = await this.artifacts.storeOutput({
            userId: session.userId,
            projectId: session.projectId,
            runId: session.id,
            file: abs,
            name: rel.split(path.sep).join("/"),
          });
          session.baseline.delete(rel);
          session.artifacts.push(artifact);
          this.emit(session, { type: "artifact", data: artifact });
        }
      } catch (err) {
        this.logger.warn(`Artifact scan failed for run ${session.id}: ${(err as Error).message}`);
      }
    };
    // .finally runs asynchronously, so the assignment below always happens first.
    session.scanning = pass().finally(() => {
      session.scanning = null;
    });
    return session.scanning;
  }

  private async complete(session: Session, status: RunStatus, error?: string) {
    if (session.status !== "running") return;
    session.status = session.timedOut ? "failed" : status;
    session.error = error;
    session.paused = false;
    session.choice = null;
    for (const t of session.timers) clearTimeout(t);
    await this.scan(session, true);
    await this.db
      .update(runs)
      .set({ status: session.status, error: error ?? null, logsEnc: encryptJson(session.logs), finishedAt: new Date() })
      .where(eq(runs.id, session.id))
      .catch((err) => this.logger.error(`Could not save run ${session.id}: ${err.message}`));
    this.emit(session, this.statusEvent(session));
    this.emit(session, { type: "done", data: { status: session.status, error } });
    fs.rmSync(session.workspace, { recursive: true, force: true });
    setTimeout(() => {
      if (session.child.exitCode === null) session.child.kill("SIGKILL");
    }, 5000);
    setTimeout(() => this.sessions.delete(session.id), 60_000);
  }

  private session(id: string, userId: string) {
    const s = this.sessions.get(id);
    if (!s) throw new NotFoundException("This run is no longer active.");
    if (s.userId !== userId) throw new ForbiddenException();
    return s;
  }

  subscribe(id: string, userId: string, listener: (e: RunEvent) => void) {
    const s = this.session(id, userId);
    listener(this.statusEvent(s));
    for (const line of s.logs) listener({ type: "log", data: line });
    for (const n of s.network) listener({ type: "network", data: n });
    if (s.cookies.length) listener({ type: "cookies", data: s.cookies });
    for (const a of s.artifacts) listener({ type: "artifact", data: a });
    if (s.preview) listener({ type: "preview", data: { image: s.preview } });
    if (s.url) listener({ type: "url", data: { url: s.url } });
    for (const step of s.steps) listener({ type: "step", data: step });
    if (s.recording) listener({ type: "recording", data: { on: true } });
    if (s.choice) listener({ type: "choice", data: s.choice });
    if (s.status !== "running") {
      listener({ type: "done", data: { status: s.status, error: s.error } });
      return () => {};
    }
    s.listeners.add(listener);
    return () => s.listeners.delete(listener);
  }

  async stop(id: string, userId: string) {
    const s = this.session(id, userId);
    if (s.status !== "running") return;
    this.send(s, { type: "stop" });
    s.timers.push(
      setTimeout(() => {
        if (s.status === "running") {
          s.child.kill("SIGKILL");
          void this.complete(s, "stopped", s.error);
        }
      }, 8000),
    );
  }

  control(id: string, userId: string, msg: Exclude<ParentMessage, { type: "start" | "stop" }>) {
    const s = this.session(id, userId);
    if (s.status !== "running") return;
    if (msg.type === "choice") {
      s.choice = null;
      this.emit(s, { type: "choice", data: null });
    }
    this.send(s, msg);
  }

  async history(userId: string, projectId?: string) {
    const where: SQL[] = [eq(runs.userId, userId)];
    if (projectId) where.push(eq(runs.projectId, projectId));
    const rows = await this.db
      .select({
        id: runs.id,
        projectId: runs.projectId,
        projectName: runs.projectName,
        entryFile: runs.entryFile,
        trigger: runs.trigger,
        status: runs.status,
        error: runs.error,
        createdAt: runs.createdAt,
        finishedAt: runs.finishedAt,
      })
      .from(runs)
      .where(and(...where))
      .orderBy(desc(runs.createdAt))
      .limit(100);
    return rows;
  }

  async detail(id: string, userId: string) {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!row) throw new NotFoundException("Run not found.");
    if (row.userId !== userId) throw new ForbiddenException();
    const live = this.sessions.get(id);
    const { logsEnc, ...rest } = row;
    return {
      ...rest,
      logs: live ? live.logs : logsEnc ? decryptJson<LogLine[]>(logsEnc) : [],
      artifacts: await this.artifacts.forRun(id),
    };
  }

  async remove(id: string, userId: string) {
    const [row] = await this.db.select({ userId: runs.userId }).from(runs).where(eq(runs.id, id)).limit(1);
    if (!row) throw new NotFoundException("Run not found.");
    if (row.userId !== userId) throw new ForbiddenException();
    if (this.sessions.get(id)?.status === "running") throw new ForbiddenException("Stop the run before deleting it.");
    await this.db.delete(runs).where(eq(runs.id, id));
  }

  async onApplicationShutdown() {
    for (const s of this.sessions.values()) {
      if (s.status === "running") s.child.kill("SIGKILL");
    }
  }

  /** Runs left as "running" by a crash or restart can never finish; mark them. */
  async markOrphans() {
    await this.db.update(runs).set({ status: "failed", error: "The server restarted during this run.", finishedAt: new Date() }).where(eq(runs.status, "running"));
    fs.rmSync(config.paths.runs, { recursive: true, force: true });
    fs.mkdirSync(config.paths.runs, { recursive: true });
  }
}
