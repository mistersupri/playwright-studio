import { BadGatewayException, BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, devices, firefox, webkit } from "playwright";
import { z } from "zod";
import { Public } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { API_ROOT, config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { sql } from "drizzle-orm";

const run = promisify(execFile);

/** Libraries from the API image that scripts can require without installing anything. */
const BUNDLED = ["playwright", "exceljs", "sharp", "tesseract.js", "@google/genai"];

function readDeps(file: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).dependencies ?? {};
  } catch {
    return {};
  }
}

@Controller("system")
export class SystemController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Public()
  @Get("health")
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }

  @Post("format")
  async format(@Body() body: unknown) {
    const { code } = parse(z.object({ code: z.string().max(500_000) }), body);
    const prettier = await import("prettier");
    try {
      const formatted = await prettier.format(code, { parser: "babel", semi: true, tabWidth: 2, trailingComma: "es5" });
      return { code: formatted };
    } catch (err) {
      throw new BadRequestException(`Could not format: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  @Get("diagnostics")
  diagnostics() {
    let executablePath = "";
    try {
      executablePath = chromium.executablePath();
    } catch {}
    const browserInstalled = Boolean(executablePath && fs.existsSync(executablePath));
    const installed = (t: typeof chromium) => {
      try {
        return fs.existsSync(t.executablePath());
      } catch {
        return false;
      }
    };
    return {
      browserInstalled,
      browsers: { chromium: installed(chromium), firefox: installed(firefox), webkit: installed(webkit) },
      executablePath,
      platform: process.platform,
      node: process.version,
      database: config.databaseUrl ? "postgres" : "pglite",
    };
  }

  /** Playwright's device presets, without the landscape duplicates. */
  @Get("devices")
  devices() {
    return Object.entries(devices)
      .filter(([name]) => !name.endsWith(" landscape"))
      .map(([name, d]) => ({ name, width: d.viewport.width, height: d.viewport.height, mobile: d.isMobile }));
  }

  @Get("packages")
  packages() {
    const appDeps = readDeps(path.join(API_ROOT, "package.json"));
    const bundled = BUNDLED.map((name) => ({ name, version: appDeps[name] ?? "", source: "bundled" as const }));
    const installed = Object.entries(readDeps(path.join(config.paths.packages, "package.json"))).map(([name, version]) => ({
      name,
      version,
      source: "installed" as const,
    }));
    return [...installed, ...bundled];
  }

  @Post("packages")
  async install(@Body() body: unknown) {
    const { name } = parse(
      z.object({
        name: z
          .string()
          .trim()
          .regex(/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=-]+)?$/i, "That does not look like an npm package name."),
      }),
      body,
    );
    const pkgJson = path.join(config.paths.packages, "package.json");
    if (!fs.existsSync(pkgJson)) fs.writeFileSync(pkgJson, JSON.stringify({ name: "script-packages", private: true }));
    try {
      await run("npm", ["install", "--no-audit", "--no-fund", "--prefix", config.paths.packages, name], {
        timeout: 180_000,
        env: { ...process.env, npm_config_cache: path.join(config.dataDir, ".npm") },
      });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? (err as Error).message;
      throw new BadGatewayException(`npm could not install ${name}: ${stderr.split("\n").find((l) => l.includes("ERR")) ?? stderr.slice(0, 200)}`);
    }
    return this.packages();
  }
}
