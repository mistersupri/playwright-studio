import { ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { and, desc, eq, lte } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { projects, type Schedule, schedules } from "../database/schema.js";
import { ProjectsService } from "../projects/projects.service.js";
import { RunsService } from "../runs/runs.service.js";

const INTERVAL_MS: Record<NonNullable<Schedule["interval"]>, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  daily: 24 * 60 * 60_000,
};

export interface ScheduleInput {
  projectId: string;
  entryFile: string;
  workspaceId?: string | null;
  type: "once" | "repeat";
  runAt?: string;
  interval?: Schedule["interval"];
  viewportWidth: number;
  viewportHeight: number;
}

@Injectable()
export class SchedulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulesService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly projects: ProjectsService,
    private readonly runs: RunsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 30_000);
    setTimeout(() => void this.tick(), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(userId: string) {
    return this.db
      .select({ schedule: schedules, projectName: projects.name })
      .from(schedules)
      .innerJoin(projects, eq(projects.id, schedules.projectId))
      .where(eq(schedules.userId, userId))
      .orderBy(desc(schedules.createdAt))
      .then((rows) => rows.map((r) => ({ ...r.schedule, projectName: r.projectName })));
  }

  async create(userId: string, input: ScheduleInput) {
    await this.projects.owned(input.projectId, userId);
    const nextRunAt =
      input.type === "once" ? new Date(input.runAt!) : new Date(Date.now() + INTERVAL_MS[input.interval ?? "daily"]);
    const [row] = await this.db
      .insert(schedules)
      .values({
        id: newId(),
        userId,
        projectId: input.projectId,
        entryFile: input.entryFile,
        workspaceId: input.workspaceId ?? null,
        type: input.type,
        runAt: input.type === "once" ? nextRunAt : null,
        interval: input.type === "repeat" ? (input.interval ?? "daily") : null,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        nextRunAt,
      })
      .returning();
    return row;
  }

  private async owned(userId: string, id: string) {
    const [row] = await this.db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    if (!row) throw new NotFoundException("Schedule not found.");
    if (row.userId !== userId) throw new ForbiddenException();
    return row;
  }

  async setStatus(userId: string, id: string, status: "active" | "paused") {
    const row = await this.owned(userId, id);
    const nextRunAt =
      status === "active" && row.type === "repeat" ? new Date(Date.now() + INTERVAL_MS[row.interval ?? "daily"]) : row.nextRunAt;
    const [updated] = await this.db.update(schedules).set({ status, nextRunAt }).where(eq(schedules.id, id)).returning();
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.delete(schedules).where(eq(schedules.id, id));
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.db
        .select()
        .from(schedules)
        .where(and(eq(schedules.status, "active"), lte(schedules.nextRunAt, new Date())));
      for (const s of due) await this.fire(s);
    } catch (err) {
      this.logger.error(`Schedule check failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async fire(s: Schedule) {
    const project = await this.projects.findRaw(s.projectId);
    const files = this.projects.files(project);
    try {
      await this.runs.start({
        userId: s.userId,
        projectId: project.id,
        projectName: project.name,
        files,
        entryFile: files.some((f) => f.name === s.entryFile) ? s.entryFile : files[0].name,
        workspaceId: s.workspaceId,
        viewport: { width: s.viewportWidth, height: s.viewportHeight },
        timeoutSeconds: 600,
        trigger: "schedule",
      });
    } catch (err) {
      // Most likely the concurrency limit; the next tick tries again.
      this.logger.warn(`Schedule ${s.id} could not start: ${(err as Error).message}`);
      return;
    }
    const now = new Date();
    await this.db
      .update(schedules)
      .set(
        s.type === "once"
          ? { lastRunAt: now, status: "completed", nextRunAt: null }
          : { lastRunAt: now, nextRunAt: new Date(now.getTime() + INTERVAL_MS[s.interval ?? "daily"]) },
      )
      .where(eq(schedules.id, s.id));
  }
}
