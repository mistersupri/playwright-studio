import fs from "fs";
import path from "path";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

// Ensure the directory exists
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

export interface SavedScript {
  name: string;
  code: string;
  updatedAt: string;
}

export function getScripts(): SavedScript[] {
  try {
    if (!fs.existsSync(SCRIPTS_DIR)) return [];
    
    const files = fs.readdirSync(SCRIPTS_DIR);
    const scripts: SavedScript[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const filePath = path.join(SCRIPTS_DIR, file);
          const raw = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(raw);
          if (parsed && parsed.name && parsed.code) {
            scripts.push({
              name: parsed.name,
              code: parsed.code,
              updatedAt: parsed.updatedAt || new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`Error parsing script file ${file}:`, e);
        }
      }
    }
    
    // Sort by updated time desc
    return scripts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    console.error("Error reading scripts directory:", error);
    return [];
  }
}

export function saveScript(name: string, code: string): SavedScript {
  if (!name || !name.trim()) {
    throw new Error("Script name cannot be empty");
  }

  const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${safeName}.json`;
  const filePath = path.join(SCRIPTS_DIR, fileName);

  const scriptData: SavedScript = {
    name: name.trim(),
    code,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(scriptData, null, 2), "utf-8");
  return scriptData;
}

export function deleteScript(name: string): boolean {
  const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${safeName}.json`;
  const filePath = path.join(SCRIPTS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
