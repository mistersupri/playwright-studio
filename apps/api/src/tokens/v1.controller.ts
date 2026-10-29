import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { ProjectsService } from "../projects/projects.service.js";
import { RunsService } from "../runs/runs.service.js";

const MAX_WAIT_MS = 10 * 60_000;

/**
 * Stable endpoints for other systems (CI, n8n, cron). Authenticate with
 * "Authorization: Bearer sbt_…". Runs use the project's last saved version.
 */
@Controller("v1")
export class V1Controller {
  constructor(
    private readonly projects: ProjectsService,
    private readonly runs: RunsService,
    private readonly artifacts: ArtifactsService,
  ) {}

  @Get("projects")
  async projectsList(@CurrentUser() user: SessionUser) {
    const { mine } = await this.projects.list(user.id);
    return mine.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  }

  @Post("projects/:id/runs")
  async trigger(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        entryFile: z.string().max(120).optional(),
        variableSetId: z.string().max(40).optional(),
        env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(10_000)).optional(),
        timeoutSeconds: z.number().int().min(5).max(3600).optional(),
        wait: z.boolean().default(false),
      }),
      body ?? {},
    );
    const project = await this.projects.readable(id, user.id);
    const files = this.projects.files(project);
    const entryFile = input.entryFile ?? files[0]?.name;
    if (!files.some((f) => f.name === entryFile)) throw new NotFoundException(`File ${entryFile} is not in the project.`);
    const { runId } = await this.runs.start({
      userId: user.id,
      projectId: project.id,
      projectName: project.name,
      files,
      entryFile: entryFile!,
      workspaceId: input.variableSetId,
      extraEnv: input.env,
      timeoutSeconds: input.timeoutSeconds ?? 300,
      trigger: "api",
    });
    if (!input.wait) return { runId, status: "running" };
    await this.runs.waitFor(runId, user.id, MAX_WAIT_MS);
    return this.run(user, runId);
  }

  @Get("runs/:id")
  async run(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const d = await this.runs.detail(id, user.id);
    return {
      runId: d.id,
      status: d.status,
      error: d.error,
      projectId: d.projectId,
      entryFile: d.entryFile,
      startedAt: d.createdAt,
      finishedAt: d.finishedAt,
      logs: d.logs,
      artifacts: d.artifacts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size, url: a.url })),
    };
  }

  @Get("runs/:id/artifacts")
  async runArtifacts(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    await this.runs.detail(id, user.id);
    const list = await this.artifacts.forRun(id);
    return list.map((a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size, url: a.url }));
  }
}
