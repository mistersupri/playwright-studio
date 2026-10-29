import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** apps/api, whether running from src (dev) or dist (build). */
export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(API_ROOT, "..", "..");

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  DATA_DIR: z.string().optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  APP_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ALLOW_REGISTRATION: bool.default(true),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(3),
  MAX_RUN_SECONDS: z.coerce.number().int().positive().default(600),
  WEB_DIST: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

function emptyToUndefined(env: NodeJS.ProcessEnv) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  // Older deployments used CLIENT_ID / CLIENT_SECRET for Google OAuth.
  out.GOOGLE_CLIENT_ID ??= out.CLIENT_ID;
  out.GOOGLE_CLIENT_SECRET ??= out.CLIENT_SECRET;
  return out;
}

function loadConfig() {
  // Local runs pick up a repo-level .env; containers get their settings from the environment.
  const envFile = path.join(REPO_ROOT, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const parsed = schema.safeParse(emptyToUndefined(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";
  const dataDir = path.resolve(env.DATA_DIR ?? (isProd ? "/data" : path.join(REPO_ROOT, ".data")));
  fs.mkdirSync(dataDir, { recursive: true });

  if (isProd) {
    const missing = (["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY"] as const).filter((k) => !env[k]);
    if (missing.length) {
      throw new Error(
        `Missing required production settings: ${missing.join(", ")}. ` +
          `Generate secrets with: openssl rand -hex 32`,
      );
    }
  }

  // In development, secrets are generated once and kept in the data dir so sessions
  // and encrypted rows survive restarts without anyone filling in an .env file.
  let authSecret = env.AUTH_SECRET;
  let encryptionKey = env.ENCRYPTION_KEY;
  if (!authSecret || !encryptionKey) {
    const file = path.join(dataDir, "dev-secrets.json");
    let saved: { authSecret?: string; encryptionKey?: string } = {};
    if (fs.existsSync(file)) saved = JSON.parse(fs.readFileSync(file, "utf8"));
    saved.authSecret ??= randomBytes(32).toString("hex");
    saved.encryptionKey ??= randomBytes(32).toString("hex");
    fs.writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
    authSecret ??= saved.authSecret;
    encryptionKey ??= saved.encryptionKey;
  }

  return {
    isProd,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    dataDir,
    authSecret,
    encryptionKey,
    appUrl: env.APP_URL?.replace(/\/$/, ""),
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    geminiApiKey: env.GEMINI_API_KEY,
    allowRegistration: env.ALLOW_REGISTRATION,
    admin: env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } : null,
    maxConcurrentRuns: env.MAX_CONCURRENT_RUNS,
    maxRunSeconds: env.MAX_RUN_SECONDS,
    smtp: env.SMTP_URL ? { url: env.SMTP_URL, from: env.SMTP_FROM ?? "ScriptBench <no-reply@localhost>" } : null,
    webDist: path.resolve(env.WEB_DIST ?? path.join(REPO_ROOT, "apps", "web", "dist")),
    paths: {
      artifacts: path.join(dataDir, "artifacts"),
      uploads: path.join(dataDir, "uploads"),
      runs: path.join(dataDir, "runs"),
      packages: path.join(dataDir, "packages"),
      pglite: path.join(dataDir, "pglite"),
    },
  };
}

export const config = loadConfig();
export type AppConfig = typeof config;

for (const dir of Object.values(config.paths)) fs.mkdirSync(dir, { recursive: true });
