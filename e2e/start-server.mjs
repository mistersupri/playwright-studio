// Starts the built API with a fresh data folder, so every e2e run begins with an empty server.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "e2e", ".data");
fs.rmSync(dataDir, { recursive: true, force: true });

process.env.NODE_ENV = "test";
process.env.DATA_DIR = dataDir;
process.env.ALLOW_REGISTRATION = "true";
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
else delete process.env.DATABASE_URL;

await import(path.join(root, "apps", "api", "dist", "main.js"));
