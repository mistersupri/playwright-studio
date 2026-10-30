import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { NotificationsService } from "./notifications.service.js";

const httpsUrl = z.string().trim().url("Enter a full URL.").max(1000);
const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webhook"), name: z.string().trim().min(1).max(60), config: z.object({ url: httpsUrl }) }),
  z.object({
    type: z.literal("slack"),
    name: z.string().trim().min(1).max(60),
    config: z.object({ url: httpsUrl.refine((u) => u.startsWith("https://hooks.slack.com/"), "Slack webhook URLs start with https://hooks.slack.com/") }),
  }),
  z.object({
    type: z.literal("telegram"),
    name: z.string().trim().min(1).max(60),
    config: z.object({
      botToken: z.string().trim().regex(/^\d+:[\w-]+$/, "A bot token looks like 123456:ABC-xyz."),
      chatId: z.string().trim().regex(/^-?\d+$|^@\w+$/, "A chat id is a number, or @channelname."),
    }),
  }),
  z.object({ type: z.literal("email"), name: z.string().trim().min(1).max(60), config: z.object({ to: z.string().trim().email() }) }),
]);

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("channels")
  async list(@CurrentUser() user: SessionUser) {
    return { channels: await this.notifications.list(user.id), emailAvailable: this.notifications.emailAvailable() };
  }

  @Post("channels")
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return { channels: await this.notifications.create(user.id, parse(createSchema, body)), emailAvailable: this.notifications.emailAvailable() };
  }

  @Delete("channels/:id")
  async remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return { channels: await this.notifications.remove(user.id, id), emailAvailable: this.notifications.emailAvailable() };
  }

  @Post("channels/:id/test")
  test(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.notifications.test(user.id, id);
  }
}
