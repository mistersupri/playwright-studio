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
        const existingVar = existingWs?.vars.find(ev => ev.id === v.id);
        
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

  all[userId] = processedWorkspaces;
  writeAll(all);
}

/**
 * Gets fully decrypted clean key-value environment dictionary for execution on backend.
 */
export function getDecryptedEnvDict(userId: string, activeWorkspaceId: string, clientDrafts: Record<string, string> = {}): Record<string, string> {
  const all = readAll();
  const workspaces = all[userId] || [];
  const activeWs = workspaces.find(ws => ws.id === activeWorkspaceId);
  
  const dict: Record<string, string> = {};

  if (activeWs) {
    activeWs.vars.forEach(v => {
      if (v.key.trim()) {
        if (v.isSaved) {
          dict[v.key.trim()] = decrypt(v.value);
        } else {
          dict[v.key.trim()] = v.value;
        }
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
