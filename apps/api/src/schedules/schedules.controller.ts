import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { runOptionsShape } from "../runs/runs.controller.js";
import { SchedulesService } from "./schedules.service.js";

const createSchema = z
  .object({
    projectId: z.string().min(1),
    entryFile: z.string().min(1).default("main.js"),
    workspaceId: z.string().nullish(),
    type: z.enum(["once", "repeat", "cron"]),
    runAt: z.string().datetime({ offset: true }).optional(),
    interval: z.enum(["5m", "15m", "30m", "1h", "12h", "daily"]).optional(),
    cron: z.string().trim().max(120).optional(),
    timezone: z.string().trim().max(60).optional(),
    notifyOn: z.enum(["never", "failure", "always"]).default("never"),
    channelIds: z.array(z.string().max(40)).max(10).default([]),
    viewportWidth: z.number().int().min(240).max(3840).default(1280),
    viewportHeight: z.number().int().min(240).max(2160).default(720),
    runOptions: z
      .object({
        ...runOptionsShape,
        stealth: z.boolean().optional(),
        binarizeCaptcha: z.boolean().optional(),
        useGeminiCaptcha: z.boolean().optional(),
        recordVideo: z.boolean().optional(),
        timeoutSeconds: z.number().int().min(5).max(3600).optional(),
      })
      .optional()
      .transform((v) => v ?? {}),
  })
  .refine((v) => v.type !== "once" || (v.runAt && new Date(v.runAt).getTime() > Date.now()), {
    message: "Pick a time in the future.",
    path: ["runAt"],
  })
  .refine((v) => v.type !== "cron" || Boolean(v.cron), { message: "Enter a cron expression.", path: ["cron"] });

@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.schedules.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.schedules.create(user.id, parse(createSchema, body));
  }

  @Post("preview")
  preview(@Body() body: unknown) {
    const { cron, timezone } = parse(z.object({ cron: z.string().trim().min(1).max(120), timezone: z.string().max(60).optional() }), body);
    return this.schedules.preview(cron, timezone);
  }

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        status: z.enum(["active", "paused"]).optional(),
        notifyOn: z.enum(["never", "failure", "always"]).optional(),
        channelIds: z.array(z.string().max(40)).max(10).optional(),
      }),
      body,
    );
    return this.schedules.update(user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.schedules.remove(user.id, id);
  }
}
