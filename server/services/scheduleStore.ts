import fs from "fs";
import path from "path";
import { runScript } from "./playwrightRunner";
import { getScriptRest, saveRunRest } from "./localStore";
import { encrypt } from "./encryption";
import { getDecryptedEnvDict } from "./envStore";

const DATA_DIR = path.join(process.cwd(), "server-data");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");

export interface ScriptSchedule {
  id: string;
  scriptId: string;
  scriptName: string;
  targetFile?: string; // Target script file within the project, e.g. "main.js"
  type: "once" | "repeat";
  datetime?: string; // For "once" e.g. "2026-06-25T12:00:00.000Z"
  repeatInterval?: "5m" | "15m" | "30m" | "1h" | "12h" | "daily"; // For "repeat"
  createdAt: string;
  lastRun?: string;
  nextRun?: string;
  status: "active" | "completed" | "paused";
  userId: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

function ensureSchedulesFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SCHEDULES_FILE)) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify([]), "utf8");
  }
}

export function getSchedules(): ScriptSchedule[] {
  try {
    ensureSchedulesFile();
    const raw = fs.readFileSync(SCHEDULES_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading schedules:", err);
    return [];
  }
}

export function saveSchedule(schedule: ScriptSchedule): void {
  try {
    ensureSchedulesFile();
    const list = getSchedules();
    const index = list.findIndex((s) => s.id === schedule.id);
    if (index >= 0) {
      list[index] = schedule;
    } else {
      list.push(schedule);
    }
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving schedule:", err);
  }
}

export function deleteSchedule(id: string): boolean {
  try {
    ensureSchedulesFile();
    const list = getSchedules();
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length !== list.length) {
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(filtered, null, 2), "utf8");
      return true;
    }
    return false;
  } catch (err) {
    console.error("Error deleting schedule:", err);
    return false;
  }
}

// Convert interval to milliseconds
function getIntervalMs(interval?: string): number {
  switch (interval) {
    case "5m":
      return 5 * 60 * 1000;
    case "15m":
      return 15 * 60 * 1000;
    case "30m":
      return 30 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "12h":
      return 12 * 60 * 60 * 1000;
    case "daily":
      return 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

// Global flag to prevent concurrent scheduler executions of the same script schedule
const runningSchedules = new Set<string>();

export async function checkAndRunSchedules() {
  const schedules = getSchedules();
  const now = Date.now();
  let updated = false;

  for (const schedule of schedules) {
    if (schedule.status !== "active") continue;
    if (runningSchedules.has(schedule.id)) continue;

    let shouldRun = false;

    if (schedule.type === "once") {
      if (schedule.datetime) {
        const schedTime = new Date(schedule.datetime).getTime();
        if (now >= schedTime) {
          shouldRun = true;
        }
      }
    } else if (schedule.type === "repeat") {
      const intervalMs = getIntervalMs(schedule.repeatInterval);
      if (!schedule.lastRun) {
        shouldRun = true;
      } else {
        const lastRunTime = new Date(schedule.lastRun).getTime();
        if (now - lastRunTime >= intervalMs) {
          shouldRun = true;
        }
      }
    }

    if (shouldRun) {
      runningSchedules.add(schedule.id);
      console.log(`[Scheduler] Triggering run for script schedule: ${schedule.id} (${schedule.scriptName})`);
      
      // Update schedule state immediately to avoid double runs on slow scripts
      schedule.lastRun = new Date().toISOString();
      if (schedule.type === "once") {
        schedule.status = "completed";
      } else if (schedule.type === "repeat") {
        const intervalMs = getIntervalMs(schedule.repeatInterval);
        schedule.nextRun = new Date(Date.now() + intervalMs).toISOString();
      }
      saveSchedule(schedule);
      updated = true;

      // Trigger script run asynchronously
      triggerScheduledScriptRun(schedule).finally(() => {
        runningSchedules.delete(schedule.id);
      });
    }
  }
}

async function triggerScheduledScriptRun(schedule: ScriptSchedule) {
  try {
    // 1. Fetch script code
    const script = await getScriptRest(undefined, schedule.scriptId);
    if (!script) {
      console.error(`[Scheduler] Script not found for schedule: ${schedule.id} (Script ID: ${schedule.scriptId})`);
      return;
    }

    const runId = `sched-${Math.random().toString(36).substring(2, 11)}`;
    const logs: string[] = [];
    const logFn = (msg: string) => {
      logs.push(msg);
      console.log(`[Scheduler Run ${runId}] ${msg}`);
    };

    const artifacts: any[] = [];
    const artifactFn = (art: any) => {
      artifacts.push(art);
    };

    // Use schedule's custom viewport size if specified
    const w = schedule.viewportWidth || 1280;
    const h = schedule.viewportHeight || 720;

    logFn(`Scheduler: Starting unattended background execution of script: "${script.name}"`);

    // Retrieve associated project environment variables
    const env = getDecryptedEnvDict(schedule.userId, schedule.scriptId);

    // Get specific script target file code if specified
    let codeToRun = script.code;
    if (schedule.targetFile && script.files) {
      const targetFileObj = script.files.find((f: any) => f.name === schedule.targetFile);
      if (targetFileObj) {
        codeToRun = targetFileObj.code;
        logFn(`Scheduler: Targeting specific script file "${schedule.targetFile}" inside project`);
      }
    }
    
    // Run the script with associated env and files
    await runScript(
      runId,
      codeToRun,
      logFn,
      () => {}, // discard image frames in headless scheduled runs
      artifactFn,
      undefined, // onNetwork
      env, // env
      undefined, // timeout
      false, // skipCaptcha
      false, // recordSession
      false, // isDebuggerMode
      w,
      h,
      undefined, // breakpoints
      false, // binarizeCaptcha
      false, // useGeminiCaptcha
      undefined, // onChoicePrompt
      script.files // files
    );

    // Save run result in history
    await saveRunRest(undefined, runId, {
      id: runId,
      scriptId: schedule.scriptId,
      scriptName: schedule.targetFile ? `${schedule.scriptName} -> ${schedule.targetFile} (Scheduled)` : `${schedule.scriptName} (Scheduled)`,
      userId: schedule.userId,
      status: "success",
      terminalLogs: encrypt(JSON.stringify(logs)),
      artifacts: encrypt(JSON.stringify(artifacts)),
      createdAt: new Date().toISOString()
    });

    console.log(`[Scheduler] Script schedule ${schedule.id} run completed successfully.`);
  } catch (err: any) {
    console.error(`[Scheduler] Script schedule ${schedule.id} failed with error:`, err);
  }
}

export function initScheduler() {
  console.log("[Scheduler] Initializing automation script scheduler daemon...");
  // Run checks immediately on start, and then every 30 seconds
  checkAndRunSchedules().catch((err) => console.error("Error running schedules check:", err));
  setInterval(() => {
    checkAndRunSchedules().catch((err) => console.error("Error running schedules check:", err));
  }, 30000);
}
