import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { decryptJson, encryptJson } from "../common/crypto.js";
import { config } from "../config.js";
import { newId } from "../common/ids.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { artifacts, browserSessions, type Project, projects, projectVersions, users } from "../database/schema.js";

export interface ProjectFile {
  name: string;
  code: string;
}

const MAX_VERSIONS = 20;

export const STARTER_FILES: ProjectFile[] = [
  {
    name: "main.js",
    code: `// page, context and browser are ready to use.
await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
console.log("Title:", await page.title());
await page.screenshot({ path: "example.png" });
`,
  },
];

@Injectable()
export class ProjectsService {
  constructor(@InjectDb() private readonly db: Database) {}

  private summary(p: Project, ownerName?: string) {
    return {
      id: p.id,
      name: p.name,
      isPrivate: p.isPrivate,
      keepSession: p.keepSession,
      ownerId: p.ownerId,
      ownerName: ownerName ?? null,
      fileCount: decryptJson<ProjectFile[]>(p.filesEnc).length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private detail(p: Project, ownerName?: string) {
    return { ...this.summary(p, ownerName), files: decryptJson<ProjectFile[]>(p.filesEnc) };
  }

  async list(userId: string) {
    const mine = await this.db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt));
    const shared = await this.db
      .select({ project: projects, ownerName: users.name })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(and(eq(projects.isPrivate, false), ne(projects.ownerId, userId)))
      .orderBy(desc(projects.updatedAt))
      .limit(100);
    return {
      mine: mine.map((p) => this.summary(p)),
      shared: shared.map((r) => this.summary(r.project, r.ownerName)),
    };
  }

  async findRaw(id: string): Promise<Project> {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!p) throw new NotFoundException("Project not found.");
    return p;
  }

  /** Readable by its owner, or by anyone signed in when it is public. */
  async readable(id: string, userId: string): Promise<Project> {
    const p = await this.findRaw(id);
    if (p.ownerId !== userId && p.isPrivate) throw new ForbiddenException("This project is private.");
    return p;
  }

  async owned(id: string, userId: string): Promise<Project> {
    const p = await this.findRaw(id);
    if (p.ownerId !== userId) throw new ForbiddenException("Only the owner can change this project.");
    return p;
  }

  files(p: Project): ProjectFile[] {
    return decryptJson<ProjectFile[]>(p.filesEnc);
  }

  async get(id: string, userId: string) {
    const p = await this.readable(id, userId);
    const [owner] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, p.ownerId));
    return this.detail(p, owner?.name);
  }

  async create(userId: string, input: { name: string; files?: ProjectFile[]; isPrivate?: boolean }) {
    const [p] = await this.db
      .insert(projects)
      .values({
        id: newId(),
        ownerId: userId,
        name: input.name.trim(),
        filesEnc: encryptJson(input.files?.length ? input.files : STARTER_FILES),
        isPrivate: input.isPrivate ?? true,
      })
      .returning();
    await this.snapshot(p);
    return this.detail(p);
  }

  async save(id: string, userId: string, input: { name: string; files: ProjectFile[] }) {
    const current = await this.owned(id, userId);
    const unchanged =
      current.name === input.name.trim() && JSON.stringify(this.files(current)) === JSON.stringify(input.files);
    if (unchanged) return this.detail(current);
    const [p] = await this.db
      .update(projects)
      .set({ name: input.name.trim(), filesEnc: encryptJson(input.files), updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    await this.snapshot(p);
    return this.detail(p);
  }

  async update(id: string, userId: string, input: { name?: string; isPrivate?: boolean; keepSession?: boolean }) {
    await this.owned(id, userId);
    const [p] = await this.db
      .update(projects)
      .set({
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
        ...(input.keepSession !== undefined ? { keepSession: input.keepSession } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    return this.detail(p);
  }

  async remove(id: string, userId: string) {
    await this.owned(id, userId);
    // Artifact rows cascade with the project; their files on disk have to go too.
    const files = await this.db.select({ path: artifacts.storagePath }).from(artifacts).where(eq(artifacts.projectId, id));
    await this.db.delete(projects).where(eq(projects.id, id));
    for (const f of files) fs.rmSync(path.join(config.dataDir, f.path), { force: true });
    fs.rmSync(path.join(config.paths.uploads, id), { recursive: true, force: true });
  }

  async duplicate(id: string, userId: string) {
    const source = await this.readable(id, userId);
    return this.create(userId, { name: `${source.name} copy`, files: this.files(source) });
  }

  async versions(id: string, userId: string) {
    await this.readable(id, userId);
    const rows = await this.db
      .select()
      .from(projectVersions)
      .where(eq(projectVersions.projectId, id))
      .orderBy(desc(projectVersions.createdAt));
    return rows.map((v) => ({ id: v.id, name: v.name, createdAt: v.createdAt, files: decryptJson<ProjectFile[]>(v.filesEnc) }));
  }

  async sessionInfo(id: string, userId: string) {
    const p = await this.readable(id, userId);
    const [row] = await this.db
      .select({ updatedAt: browserSessions.updatedAt })
      .from(browserSessions)
      .where(and(eq(browserSessions.projectId, id), eq(browserSessions.userId, userId)));
    return { keepSession: p.keepSession, savedAt: row?.updatedAt ?? null };
  }

  async clearSession(id: string, userId: string) {
    await this.readable(id, userId);
    await this.db.delete(browserSessions).where(and(eq(browserSessions.projectId, id), eq(browserSessions.userId, userId)));
  }

  async loadSession(projectId: string, userId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select()
      .from(browserSessions)
      .where(and(eq(browserSessions.projectId, projectId), eq(browserSessions.userId, userId)));
    return row ? decryptJson(row.stateEnc) : undefined;
  }

  async saveSession(projectId: string, userId: string, state: unknown) {
    const stateEnc = encryptJson(state);
    await this.db
      .insert(browserSessions)
      .values({ projectId, userId, stateEnc })
      .onConflictDoUpdate({ target: [browserSessions.projectId, browserSessions.userId], set: { stateEnc, updatedAt: new Date() } });
  }

  private async snapshot(p: Project) {
    await this.db.insert(projectVersions).values({ id: newId(), projectId: p.id, name: p.name, filesEnc: p.filesEnc });
    const rows = await this.db
      .select({ id: projectVersions.id })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, p.id))
      .orderBy(desc(projectVersions.createdAt));
    const stale = rows.slice(MAX_VERSIONS).map((r) => r.id);
    if (stale.length) await this.db.delete(projectVersions).where(inArray(projectVersions.id, stale));
  }
}
