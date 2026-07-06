import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./encryption";

const DATA_DIR = path.join(process.cwd(), "server-data");
const SETTINGS_FILE = path.join(DATA_DIR, "gemini_settings.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}), "utf8");
  }
}

export interface UserGeminiSettings {
  apiKey: string; // holds the encrypted ciphertext when saved!
  model: string;  // e.g., "gemini-2.5-flash" or "gemini-1.5-flash"
  captchaCount?: number;
}

// Read all user gemini settings from gemini_settings.json
function readAll(): Record<string, UserGeminiSettings> {
  try {
    ensureFile();
    const content = fs.readFileSync(SETTINGS_FILE, "utf8");
    return JSON.parse(content) || {};
  } catch (error) {
    console.error("Error reading gemini_settings.json:", error);
    return {};
  }
}

// Write all user settings to gemini_settings.json
function writeAll(data: Record<string, UserGeminiSettings>) {
  try {
    ensureFile();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing gemini_settings.json:", error);
  }
}

/**
 * Gets Gemini settings for a given user.
 * The apiKey is masked when requested, unless we are calling it internally on the backend.
 */
export function getUserGeminiSettings(userId: string, decryptKey = false): UserGeminiSettings {
  const all = readAll();
  const settings = all[userId];
  
  if (!settings) {
    return { apiKey: "", model: "gemini-2.5-flash", captchaCount: 0 };
  }

  let finalKey = settings.apiKey;
  if (finalKey) {
    if (decryptKey) {
      finalKey = decrypt(finalKey);
    } else {
      finalKey = "••••••••••••";
    }
  }

  return {
    apiKey: finalKey,
    model: settings.model || "gemini-2.5-flash",
    captchaCount: settings.captchaCount || 0
  };
}

/**
 * Saves and encrypts user Gemini settings
 */
export function saveUserGeminiSettings(userId: string, apiKey: string, model: string) {
  const all = readAll();
  const existing = all[userId];

  let finalKey = apiKey;
  if (apiKey === "••••••••••••") {
    // Keep existing encrypted key
    finalKey = existing ? existing.apiKey : "";
  } else if (apiKey) {
    // Encrypt the new key
    finalKey = encrypt(apiKey);
  } else {
    // Empty means remove key
    finalKey = "";
  }

  all[userId] = {
    apiKey: finalKey,
    model: model || "gemini-2.5-flash",
    captchaCount: existing ? (existing.captchaCount || 0) : 0
  };

  writeAll(all);
}

/**
 * Increments the user's captchaCount
 */
export function incrementUserCaptchaCount(userId: string) {
  const all = readAll();
  if (!all[userId]) {
    all[userId] = { apiKey: "", model: "gemini-2.5-flash", captchaCount: 0 };
  }
  all[userId].captchaCount = (all[userId].captchaCount || 0) + 1;
  writeAll(all);
}
