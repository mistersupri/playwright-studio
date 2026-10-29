import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { decryptBuffer, encryptBuffer } from "../common/crypto.js";
import { newId } from "../common/ids.js";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { type ArtifactRow, artifacts } from "../database/schema.js";

export type ArtifactKind = ArtifactRow["kind"];

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".txt": "text/plain",
  ".html": "text/html",
  ".md": "text/markdown",
  ".xml": "application/xml",
};

export function mimeFor(name: string) {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

export function kindFor(name: string): Exclude<ArtifactKind, "upload"> {
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "screenshot";
  if (ext === ".pdf") return "pdf";
  if ([".xlsx", ".xls", ".csv"].includes(ext)) return "excel";
  if ([".webm", ".mp4"].includes(ext)) return "video";
  return "file";
}

export function safeFileName(name: string) {
  return path.basename(name).replace(/[^\w.\-() ]/g, "_").slice(0, 160) || "file";
}

const toDto = (a: ArtifactRow) => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  mimeType: a.mimeType,
  size: a.size,
  projectId: a.projectId,
  runId: a.runId,
  createdAt: a.createdAt,
  url: `/api/artifacts/${a.id}/file`,
});
export type ArtifactDto = ReturnType<typeof toDto>;

@Injectable()
export class ArtifactsService {
  constructor(@InjectDb() private readonly db: Database) {}

  uploadsDir(projectId: string) {
    return path.join(config.paths.uploads, projectId);
  }

  async list(userId: string, projectId?: string) {
    const where: SQL[] = [eq(artifacts.userId, userId)];
    if (projectId) where.push(eq(artifacts.projectId, projectId));
    const rows = await this.db.select().from(artifacts).where(and(...where)).orderBy(desc(artifacts.createdAt)).limit(500);
    return rows.map(toDto);
  }

  async forRun(runId: string) {
    const rows = await this.db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(desc(artifacts.createdAt));
    return rows.map(toDto);
  }

  /** Encrypt a file produced by a run and record it. The source file is consumed. */
  async storeOutput(input: { userId: string; projectId: string | null; runId: string; file: string; name: string }) {
    const id = newId(16);
    const rel = path.join("artifacts", input.userId, id);
    const dest = path.join(config.dataDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const raw = fs.readFileSync(input.file);
    fs.writeFileSync(dest, encryptBuffer(raw));
    fs.rmSync(input.file, { force: true });
    const [row] = await this.db
      .insert(artifacts)
      .values({
        id,
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        kind: kindFor(input.name),
        name: input.name,
        mimeType: mimeFor(input.name),
        size: raw.length,
        storagePath: rel,
      })
      .returning();
    return toDto(row);
  }

  async storeUpload(userId: string, projectId: string, originalName: string, data: Buffer) {
    const name = safeFileName(originalName);
    const rel = path.join("uploads", projectId, name);
    fs.mkdirSync(path.join(config.dataDir, "uploads", projectId), { recursive: true });
    fs.writeFileSync(path.join(config.dataDir, rel), data);
    await this.db
      .delete(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, "upload"), eq(artifacts.name, name)));
    const [row] = await this.db
      .insert(artifacts)
      .values({ id: newId(16), userId, projectId, kind: "upload", name, mimeType: mimeFor(name), size: data.length, storagePath: rel })
      .returning();
    return toDto(row);
  }

  private async owned(userId: string, id: string) {
    const [row] = await this.db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    if (!row) throw new NotFoundException("File not found.");
    if (row.userId !== userId) throw new ForbiddenException();
    return row;
  }

  async read(userId: string, id: string) {
    const row = await this.owned(userId, id);
    const abs = path.join(config.dataDir, row.storagePath);
    if (!fs.existsSync(abs)) throw new NotFoundException("The file is missing from storage.");
    const data = fs.readFileSync(abs);
    return { row, data: row.kind === "upload" ? data : decryptBuffer(data) };
  }

  async sheets(userId: string, id: string) {
    const { row, data } = await this.read(userId, id);
    const workbook = new ExcelJS.Workbook();
    if (row.name.toLowerCase().endsWith(".csv")) await workbook.csv.read(Readable.from(data));
    else await workbook.xlsx.load(data as unknown as ArrayBuffer);
    return workbook.worksheets.map((sheet) => {
      const rows: unknown[][] = [];
      sheet.eachRow({ includeEmpty: true }, (r, n) => {
        if (n > 200) return;
        const values = Array.isArray(r.values) ? r.values.slice(1) : [];
        rows.push(
          values.map((v) => {
            if (v && typeof v === "object") {
              if ("result" in v) return v.result;
              if ("text" in v) return v.text;
              if ("richText" in v) return (v.richText as { text: string }[]).map((t) => t.text).join("");
              if (v instanceof Date) return v.toISOString();
              return JSON.stringify(v);
            }
            return v ?? "";
          }),
        );
      });
      return { name: sheet.name, rows };
    });
  }

  private unlink(rows: ArtifactRow[]) {
    for (const r of rows) fs.rmSync(path.join(config.dataDir, r.storagePath), { force: true });
  }

  async remove(userId: string, id: string) {
    const row = await this.owned(userId, id);
    this.unlink([row]);
    await this.db.delete(artifacts).where(eq(artifacts.id, id));
  }

  async clear(userId: string, projectId: string | undefined, scope: "outputs" | "uploads" | "all" | ArtifactKind) {
    const where: SQL[] = [eq(artifacts.userId, userId)];
    if (projectId) where.push(eq(artifacts.projectId, projectId));
    if (scope === "outputs") where.push(ne(artifacts.kind, "upload"));
    else if (scope === "uploads") where.push(eq(artifacts.kind, "upload"));
    else if (scope !== "all") where.push(eq(artifacts.kind, scope));
    const rows = await this.db.select().from(artifacts).where(and(...where));
    this.unlink(rows);
    if (rows.length) await this.db.delete(artifacts).where(inArray(artifacts.id, rows.map((r) => r.id)));
    return { removed: rows.length };
  }
}
