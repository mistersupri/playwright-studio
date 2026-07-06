import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "server-data");
const SCRIPTS_FILE = path.join(DATA_DIR, "scripts.json");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");

function ensureDirectoryAndFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCRIPTS_FILE)) {
      fs.writeFileSync(SCRIPTS_FILE, JSON.stringify([]), "utf8");
    }
    if (!fs.existsSync(RUNS_FILE)) {
      fs.writeFileSync(RUNS_FILE, JSON.stringify([]), "utf8");
    }
  } catch (error) {
    console.error("Failed to initialize local storage directory or files:", error);
  }
}

// Ensure storage is initialized
ensureDirectoryAndFiles();

function readScripts(): any[] {
  try {
    ensureDirectoryAndFiles();
    const content = fs.readFileSync(SCRIPTS_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading scripts JSON:", err);
    return [];
  }
}

function writeScripts(scripts: any[]) {
  try {
    ensureDirectoryAndFiles();
    fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing scripts JSON:", err);
  }
}

function readRuns(): any[] {
  try {
    ensureDirectoryAndFiles();
    const content = fs.readFileSync(RUNS_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading runs JSON:", err);
    return [];
  }
}

function writeRuns(runs: any[]) {
  try {
    ensureDirectoryAndFiles();
    fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing runs JSON:", err);
  }
}

/**
 * Local store wrapper for listing documents in scripts collection.
 */
export async function getScriptsRest(authHeader: string | undefined): Promise<any[]> {
  return readScripts();
}

/**
 * Local store wrapper for getting a single script.
 */
export async function getScriptRest(authHeader: string | undefined, scriptId: string): Promise<any | null> {
  const scripts = readScripts();
  const script = scripts.find(s => s.id === scriptId);
  return script || null;
}

/**
 * Local store wrapper for saving (upserting) a script.
 */
export async function saveScriptRest(authHeader: string | undefined, scriptId: string, data: any): Promise<void> {
  const scripts = readScripts();
  const index = scripts.findIndex(s => s.id === scriptId);
  const record = { id: scriptId, ...data };
  if (index >= 0) {
    scripts[index] = record;
  } else {
    scripts.push(record);
  }
  writeScripts(scripts);
}

/**
 * Local store wrapper for deleting a script.
 */
export async function deleteScriptRest(authHeader: string | undefined, scriptId: string): Promise<void> {
  let scripts = readScripts();
  scripts = scripts.filter(s => s.id !== scriptId);
  writeScripts(scripts);
}

/**
 * Local store wrapper for listing execution runs.
 */
export async function getRunsRest(authHeader: string | undefined, userId: string): Promise<any[]> {
  const runs = readRuns();
  return runs.filter((run: any) => run.userId === userId);
}

/**
 * Local store wrapper for saving (upserting) an execution run.
 */
export async function saveRunRest(authHeader: string | undefined, runId: string, data: any): Promise<void> {
  const runs = readRuns();
  const index = runs.findIndex(r => r.id === runId);
  const record = { id: runId, ...data };
  if (index >= 0) {
    runs[index] = record;
  } else {
    runs.push(record);
  }
  writeRuns(runs);
}
