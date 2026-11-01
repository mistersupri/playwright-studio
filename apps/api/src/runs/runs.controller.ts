import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { RunsService } from "./runs.service.js";

/** Shared with schedules, which store these and replay them. */
export const runOptionsShape = {
  browser: z.enum(["chromium", "firefox", "webkit"]).optional(),
  device: z.string().max(80).nullish().transform((v) => v || undefined),
  locale: z.string().max(20).nullish().transform((v) => v || undefined),
  timezoneId: z.string().max(60).nullish().transform((v) => v || undefined),
  geolocation: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).nullish().transform((v) => v ?? undefined),
  proxy: z.string().max(500).nullish().transform((v) => v || undefined),
  trace: z.boolean().optional(),
  dataArtifactId: z.string().max(40).nullish(),
  stopOnError: z.boolean().optional(),
};

const startSchema = z.object({
  projectId: z.string().nullish(),
  projectName: z.string().trim().min(1).max(80).default("Untitled"),
  files: z.array(z.object({ name: z.string().min(1).max(120), code: z.string().max(500_000) })).min(1).max(50),
  entryFile: z.string().min(1).default("main.js"),
  workspaceId: z.string().nullish(),
  timeoutSeconds: z.number().int().min(5).max(3600).default(120),
  viewport: z.object({ width: z.number().int().min(240).max(3840), height: z.number().int().min(240).max(2160) }).optional(),
  stealth: z.boolean().optional(),
  binarizeCaptcha: z.boolean().optional(),
  useGeminiCaptcha: z.boolean().optional(),
  recordVideo: z.boolean().optional(),
  debug: z.boolean().optional(),
  breakpoints: z.array(z.number().int().positive()).max(500).optional(),
  record: z.object({ url: z.string().trim().max(2000) }).optional(),
  ...runOptionsShape,
});

@Controller("runs")
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  start(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.runs.start({ ...parse(startSchema, body), userId: user.id, trigger: "manual" });
  }

  @Get()
  history(@CurrentUser() user: SessionUser, @Query("projectId") projectId?: string) {
    return this.runs.history(user.id, projectId || undefined);
  }

  @Get(":id")
  detail(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.runs.detail(id, user.id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.runs.remove(id, user.id);
  }

  /** Server-sent events: replays what happened so far, then streams live. */
  @Get(":id/events")
  events(@CurrentUser() user: SessionUser, @Param("id") id: string, @Req() req: Request, @Res() res: Response) {
    // Fail with a status before the stream starts, so a reconnecting client learns the run is gone.
    this.runs.assertVisible(id, user.id);
    let unsubscribe: () => void = () => {};
    const write = (event: { type: string; data: unknown }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      if (event.type === "done") {
        unsubscribe();
        res.end();
      }
    };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    unsubscribe = this.runs.subscribe(id, user.id, write);
  }

  @Post(":id/stop")
  @HttpCode(204)
  stop(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.runs.stop(id, user.id);
  }

  @Post(":id/pause")
  @HttpCode(204)
  pause(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    this.runs.control(id, user.id, { type: "pause" });
  }

  @Post(":id/resume")
  @HttpCode(204)
  resume(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    this.runs.control(id, user.id, { type: "resume" });
  }

  @Post(":id/choice")
  @HttpCode(204)
  choice(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const { indexes } = parse(z.object({ indexes: z.array(z.number().int().min(0)) }), body);
    this.runs.control(id, user.id, { type: "choice", indexes });
  }

  @Post(":id/record")
  @HttpCode(204)
  record(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const { on } = parse(z.object({ on: z.boolean() }), body);
    this.runs.control(id, user.id, { type: "record", on });
  }

  @Post(":id/input")
  @HttpCode(204)
  input(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const msg = parse(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("click"), x: z.number().min(0).max(4000), y: z.number().min(0).max(4000) }),
        z.object({ type: z.literal("type"), text: z.string().min(1).max(2000) }),
        z.object({ type: z.literal("key"), key: z.string().min(1).max(40) }),
        z.object({
          type: z.literal("wheel"),
          x: z.number().min(0).max(4000),
          y: z.number().min(0).max(4000),
          deltaX: z.number().min(-5000).max(5000),
          deltaY: z.number().min(-5000).max(5000),
        }),
        z.object({ type: z.literal("navigate"), url: z.string().trim().min(1).max(2000) }),
        z.object({ type: z.literal("inspect"), x: z.number().min(0).max(4000), y: z.number().min(0).max(4000) }),
      ]),
      body,
    );
    this.runs.control(id, user.id, msg);
  }
}
