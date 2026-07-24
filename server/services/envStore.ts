import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./encryption";

const DATA_DIR = path.join(process.cwd(), "server-data");
const ENV_FILE = path.join(DATA_DIR, "env_workspaces.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ENV_FILE)) {
    fs.writeFileSync(ENV_FILE, JSON.stringify({}), "utf8");
  }
}

// Map of userId -> array of workspaces
export interface ServerEnvWorkspace {
  id: string;
  name: string;
  vars: {
    id: string;
    key: string;
    value: string; // This will hold the encrypted ciphertext when saved!
    isSecret: boolean;
    isSaved?: boolean;
  }[];
}

// Read all workspaces from env_workspaces.json
function readAll(): Record<string, ServerEnvWorkspace[]> {
  try {
    ensureFile();
    const content = fs.readFileSync(ENV_FILE, "utf8");
    return JSON.parse(content) || {};
  } catch (error) {
    console.error("Error reading env_workspaces.json:", error);
    return {};
  }
}

// Write all workspaces to env_workspaces.json
function writeAll(data: Record<string, ServerEnvWorkspace[]>) {
  try {
    ensureFile();
    fs.writeFileSync(ENV_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing env_workspaces.json:", error);
  }
}

/**
 * Gets workspaces for a given user.
 * Sensitive values are masked for safety (never disclosed to client).
 */
export function getUserWorkspaces(userId: string): ServerEnvWorkspace[] {
  const all = readAll();
  const workspaces = all[userId] || [];
  
  // Return a cloned version with masked values
  return workspaces.map(ws => ({
    ...ws,
    vars: ws.vars.map(v => ({
      ...v,
      // Mask value if it's saved/secured so it's not exposed to client
      value: v.isSaved ? "••••••••••••" : v.value
    }))
  }));
}

/**
 * Saves and encrypts user workspaces, keeping previously encrypted values if updated with masked placeholder
 */
export function saveUserWorkspaces(userId: string, incomingWorkspaces: ServerEnvWorkspace[]) {
  const all = readAll();
  const existingWorkspaces = all[userId] || [];

  const processedWorkspaces = incomingWorkspaces.map(ws => {
    const existingWs = existingWorkspaces.find(e => e.id === ws.id);
    
    return {
      id: ws.id,
      name: ws.name,
      vars: ws.vars.map(v => {
        const existingVar = existingWs?.vars.find(ev => ev.id === v.id || (ev.key && ev.key === v.key));
        
        let finalValue = v.value;
        if (v.isSaved) {
          if (v.value === "••••••••••••") {
            // Keep the previous encrypted value
            finalValue = existingVar ? existingVar.value : "";
          } else {
            // Encrypt the new value
            finalValue = encrypt(v.value);
          }
        }

        return {
          id: v.id,
          key: v.key,
          value: finalValue,
          isSecret: v.isSecret,
          isSaved: v.isSaved
        };
      })
    };
  });

  // Preserve any previously saved workspaces for this user that were NOT in incomingWorkspaces
  const incomingIds = new Set(incomingWorkspaces.map(w => w.id));
  const preservedWorkspaces = existingWorkspaces.filter(e => !incomingIds.has(e.id));

  all[userId] = [...processedWorkspaces, ...preservedWorkspaces];
  writeAll(all);
}

/**
 * Gets fully decrypted clean key-value environment dictionary for execution on backend.
 */
export function getDecryptedEnvDict(userId: string, activeWorkspaceId: string, clientDrafts: Record<string, string> = {}): Record<string, string> {
  const all = readAll();
  const workspaces = all[userId] || [];
  
  const dict: Record<string, string> = {};

  // First load default-ws variables as fallback base
  const defaultWs = workspaces.find(ws => ws.id === "default-ws");
  if (defaultWs) {
    defaultWs.vars.forEach(v => {
      if (v.key.trim()) {
        dict[v.key.trim()] = v.isSaved ? decrypt(v.value) : v.value;
      }
    });
  }

  // Next overlay active workspace variables (overriding default if same key exists)
  const activeWs = workspaces.find(ws => ws.id === activeWorkspaceId);
  if (activeWs && activeWs.id !== "default-ws") {
    activeWs.vars.forEach(v => {
      if (v.key.trim()) {
        dict[v.key.trim()] = v.isSaved ? decrypt(v.value) : v.value;
      }
    });
  }

  // Merge any draft values sent directly from the client (for dry run / temporary adjustments)
  Object.entries(clientDrafts).forEach(([k, val]) => {
    if (val !== "••••••••••••") {
      dict[k] = val;
    }
  });

  return dict;
}

const SHARED_ENV_FILE = path.join(DATA_DIR, "shared_env_workspaces.json");

export function saveSharedWorkspace(workspaceData: any): string {
  ensureFile();
  if (!fs.existsSync(SHARED_ENV_FILE)) {
    fs.writeFileSync(SHARED_ENV_FILE, JSON.stringify({}), "utf8");
  }
  const shareId = "env-share-" + Math.random().toString(36).substring(2, 10);
  const content = fs.readFileSync(SHARED_ENV_FILE, "utf8");
  const allShared = JSON.parse(content) || {};
  allShared[shareId] = {
    id: workspaceData.id || Math.random().toString(36).substring(2, 9),
    name: workspaceData.name,
    vars: workspaceData.vars,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(SHARED_ENV_FILE, JSON.stringify(allShared, null, 2), "utf8");
  return shareId;
}

export function getSharedWorkspace(shareId: string): any {
  ensureFile();
  if (!fs.existsSync(SHARED_ENV_FILE)) {
    return null;
  }
  const content = fs.readFileSync(SHARED_ENV_FILE, "utf8");
  const allShared = JSON.parse(content) || {};
  return allShared[shareId] || null;
}

