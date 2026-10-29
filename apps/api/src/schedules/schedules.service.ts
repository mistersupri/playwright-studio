import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Cron } from "croner";
import { and, desc, eq, lte } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { projects, type Schedule, schedules } from "../database/schema.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { type FinishedRun, RUN_OPTION_KEYS, RunsService, type StartRunInput } from "../runs/runs.service.js";

const INTERVAL_MS: Record<NonNullable<Schedule["interval"]>, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  daily: 24 * 60 * 60_000,
};

/** While a schedule keeps failing, repeat the failure notification at most this often. */
const FAILURE_REMINDER_MS = 60 * 60_000;

export interface ScheduleInput {
  projectId: string;
  entryFile: string;
  workspaceId?: string | null;
  type: "once" | "repeat" | "cron";
  runAt?: string;
  interval?: Schedule["interval"];
  cron?: string;
  timezone?: string;
  viewportWidth: number;
  viewportHeight: number;
  runOptions: Record<string, unknown>;
  notifyOn: "never" | "failure" | "always";
  channelIds: string[];
}

export function cronNext(expr: string, timezone: string | undefined, count = 1, from?: Date): Date[] {
  try {
    return new Cron(expr, { timezone: timezone || undefined, paused: true }).nextRuns(count, from);
  } catch (err) {
    throw new BadRequestException(`That cron expression is not valid: ${(err as Error).message}`);
  }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
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
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 30_000);
    setTimeout(() => void this.tick(), 5_000);
    this.runs.onFinished((r) => void this.afterRun(r));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private nextRun(s: Pick<Schedule, "type" | "interval" | "cron" | "timezone">, after = new Date()): Date | null {
    if (s.type === "repeat") return new Date(after.getTime() + INTERVAL_MS[s.interval ?? "daily"]);
    if (s.type === "cron" && s.cron) return cronNext(s.cron, s.timezone ?? undefined, 1, after)[0] ?? null;
    return null;
  }

  preview(cron: string, timezone?: string) {
    return { next: cronNext(cron, timezone, 3).map((d) => d.toISOString()) };
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
    const base = { type: input.type, interval: input.interval ?? "daily", cron: input.cron ?? null, timezone: input.timezone ?? null } as const;
    const nextRunAt = input.type === "once" ? new Date(input.runAt!) : this.nextRun(base);
    if (!nextRunAt) throw new BadRequestException("This schedule would never run.");
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
        cron: input.type === "cron" ? input.cron! : null,
        timezone: input.timezone ?? null,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        runOptions: input.runOptions,
        notifyOn: input.notifyOn,
        channelIds: input.channelIds,
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

  async update(userId: string, id: string, input: { status?: "active" | "paused"; notifyOn?: ScheduleInput["notifyOn"]; channelIds?: string[] }) {
    const row = await this.owned(userId, id);
    const patch: Partial<typeof schedules.$inferInsert> = {};
    if (input.status) {
      patch.status = input.status;
      if (input.status === "active" && row.type !== "once") patch.nextRunAt = this.nextRun(row);
    }
    if (input.notifyOn) patch.notifyOn = input.notifyOn;
    if (input.channelIds) patch.channelIds = input.channelIds;
    const [updated] = await this.db.update(schedules).set(patch).where(eq(schedules.id, id)).returning();
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
    const options = Object.fromEntries(
      Object.entries(s.runOptions ?? {}).filter(([k]) => (RUN_OPTION_KEYS as readonly string[]).includes(k)),
    ) as Partial<StartRunInput>;
    try {
      await this.runs.start({
        timeoutSeconds: 600,
        ...options,
        userId: s.userId,
        projectId: project.id,
        projectName: project.name,
        files,
        entryFile: files.some((f) => f.name === s.entryFile) ? s.entryFile : files[0].name,
        workspaceId: s.workspaceId,
        viewport: { width: s.viewportWidth, height: s.viewportHeight },
        trigger: "schedule",
        scheduleId: s.id,
      });
    } catch (err) {
      // Most likely the concurrency limit; the next tick tries again.
      this.logger.warn(`Schedule ${s.id} could not start: ${(err as Error).message}`);
      return;
    }
    const now = new Date();
    await this.db
      .update(schedules)
      .set(s.type === "once" ? { lastRunAt: now, status: "completed", nextRunAt: null } : { lastRunAt: now, nextRunAt: this.nextRun(s, now) })
      .where(eq(schedules.id, s.id));
  }

  /** Decide whether a finished scheduled run should notify, then send. */
  private async afterRun(r: FinishedRun) {
    if (!r.scheduleId) return;
    const [s] = await this.db.select().from(schedules).where(eq(schedules.id, r.scheduleId)).limit(1);
    if (!s) return;
    const failed = r.status !== "success";
    let send = false;
    if (s.notifyOn === "always") send = true;
    else if (s.notifyOn === "failure" && failed) {
      const wasFailing = s.lastStatus && s.lastStatus !== "success";
      const recentlyNotified = s.lastNotifiedAt && Date.now() - s.lastNotifiedAt.getTime() < FAILURE_REMINDER_MS;
      send = !wasFailing || !recentlyNotified;
    }
    await this.db
      .update(schedules)
      .set({ lastStatus: r.status, ...(send ? { lastNotifiedAt: new Date() } : {}) })
      .where(eq(schedules.id, s.id));
    if (!send || s.channelIds.length === 0) return;

    const failures = await this.notifications.sendToChannels(s.userId, s.channelIds, {
      title: `${failed ? "Failed" : "Passed"}: ${r.projectName}`,
      status: r.status,
      projectName: r.projectName,
      entryFile: r.entryFile,
      duration: formatDuration(r.finishedAt.getTime() - r.startedAt.getTime()),
      error: r.error ?? (failed ? r.firstErrorLine : undefined),
      artifactCount: r.artifactCount,
      link: config.appUrl && r.projectId ? `${config.appUrl}/?project=${r.projectId}` : undefined,
      payload: {
        event: "run.finished",
        run: { id: r.runId, status: r.status, error: r.error ?? null, startedAt: r.startedAt, finishedAt: r.finishedAt, artifacts: r.artifactCount },
        project: { id: r.projectId, name: r.projectName, entryFile: r.entryFile },
        schedule: { id: s.id },
      },
    });
    for (const f of failures) await this.runs.appendStoredLog(r.runId, { source: "system", level: "warning", message: `Notification failed: ${f}`, at: new Date().toISOString() });
  }
}
