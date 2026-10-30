#!/usr/bin/env node
// Starts the API and the web app for local development.
//
// Database, in order of preference:
//   1. DATABASE_URL from your shell or .env
//   2. the Postgres container in docker-compose.dev.yml (started here, if Docker is running)
//   3. embedded PGlite in .data/pglite, so the app still runs without Docker
// Set SB_DB=pglite to skip Docker.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const DEV_DB = "postgres://scriptbench:scriptbench@127.0.0.1:54329/scriptbench";
const log = (msg) => console.log(`\x1b[2m[dev]\x1b[0m ${msg}`);

function dockerAvailable() {
  const r = spawnSync("docker", ["info"], { stdio: "ignore" });
  return r.status === 0;
}

if (process.env.DATABASE_URL) {
  log("Using DATABASE_URL from your environment.");
} else if (process.env.SB_DB !== "pglite" && dockerAvailable()) {
  log("Starting Postgres from docker-compose.dev.yml ...");
  const up = spawnSync("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d", "--wait", "postgres"], {
    cwd: root,
    stdio: "inherit",
  });
  if (up.status === 0) {
    process.env.DATABASE_URL = DEV_DB;
    log(`Postgres is ready at ${DEV_DB}`);
  } else {
    log("Postgres did not start; falling back to embedded PGlite.");
  }
} else {
  log("Docker is not available; using embedded PGlite in .data/pglite.");
}

const children = [
  spawn("npm", ["run", "dev", "-w", "@scriptbench/api"], { cwd: root, stdio: "inherit", env: process.env }),
  spawn("npm", ["run", "dev", "-w", "@scriptbench/web"], { cwd: root, stdio: "inherit", env: process.env }),
];
log("Web app: http://localhost:5173  (API on http://localhost:3000)");

let exiting = false;
const shutdown = (code = 0) => {
  if (exiting) return;
  exiting = true;
  for (const c of children) c.kill("SIGINT");
  setTimeout(() => process.exit(code), 500);
};
for (const c of children) c.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
