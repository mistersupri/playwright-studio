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
    type: z.enum(["once", "repeat"]),
    runAt: z.string().datetime({ offset: true }).optional(),
    interval: z.enum(["5m", "15m", "30m", "1h", "12h", "daily"]).optional(),
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
  .refine((v) => v.type === "repeat" || (v.runAt && new Date(v.runAt).getTime() > Date.now()), {
    message: "Pick a time in the future.",
    path: ["runAt"],
  });

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

  @Patch(":id")
  status(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const { status } = parse(z.object({ status: z.enum(["active", "paused"]) }), body);
    return this.schedules.setStatus(user.id, id, status);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.schedules.remove(user.id, id);
  }
}
