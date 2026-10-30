import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { decryptJson, encryptJson } from "../common/crypto.js";
import { newId } from "../common/ids.js";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { notificationChannels } from "../database/schema.js";

export type ChannelType = "webhook" | "slack" | "telegram" | "email";
export type ChannelConfig = { url?: string; botToken?: string; chatId?: string; to?: string };

export interface RunMessage {
  title: string;
  status: "success" | "failed" | "stopped";
  projectName: string;
  entryFile: string;
  duration: string;
  error?: string;
  artifactCount: number;
  link?: string;
  payload: Record<string, unknown>;
}

/** Masks config values before they go back to the browser. */
function describeConfig(type: ChannelType, c: ChannelConfig) {
  if (type === "telegram") return `chat ${c.chatId}`;
  if (type === "email") return c.to ?? "";
  try {
    const u = new URL(c.url ?? "");
    return `${u.host}${u.pathname.length > 1 ? "/…" : ""}`;
  } catch {
    return "";
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectDb() private readonly db: Database) {}

  emailAvailable() {
    return Boolean(config.smtp);
  }

  async list(userId: string) {
    const rows = await this.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, userId))
      .orderBy(desc(notificationChannels.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      target: describeConfig(r.type, decryptJson<ChannelConfig>(r.configEnc)),
      createdAt: r.createdAt,
    }));
  }

  async create(userId: string, input: { name: string; type: ChannelType; config: ChannelConfig }) {
    if (input.type === "email" && !config.smtp) throw new BadRequestException("Email is not set up on this server (SMTP_URL).");
    await this.db.insert(notificationChannels).values({
      id: newId(),
      userId,
      name: input.name.trim(),
      type: input.type,
      configEnc: encryptJson(input.config),
    });
    return this.list(userId);
  }

  private async owned(userId: string, id: string) {
    const [row] = await this.db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).limit(1);
    if (!row) throw new NotFoundException("Channel not found.");
    if (row.userId !== userId) throw new ForbiddenException();
    return row;
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.delete(notificationChannels).where(eq(notificationChannels.id, id));
    return this.list(userId);
  }

  async test(userId: string, id: string) {
    const row = await this.owned(userId, id);
    await this.deliver(row.type, decryptJson<ChannelConfig>(row.configEnc), {
      title: "ScriptBench test notification",
      status: "success",
      projectName: "Test",
      entryFile: "main.js",
      duration: "0 s",
      artifactCount: 0,
      payload: { event: "test" },
    });
    return { ok: true };
  }

  /** Sends to every listed channel the user owns. Never throws; returns failures for the run log. */
  async sendToChannels(userId: string, channelIds: string[], message: RunMessage) {
    if (!channelIds.length) return [];
    const rows = await this.db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.userId, userId), inArray(notificationChannels.id, channelIds)));
    const failures: string[] = [];
    for (const row of rows) {
      try {
        await this.deliver(row.type, decryptJson<ChannelConfig>(row.configEnc), message);
      } catch (err) {
        failures.push(`${row.name}: ${(err as Error).message}`);
        this.logger.warn(`Notification to ${row.name} failed: ${(err as Error).message}`);
      }
    }
    return failures;
  }

  private text(m: RunMessage) {
    const mark = m.status === "success" ? "Passed" : m.status === "failed" ? "Failed" : "Stopped";
    return [
      `${mark}: ${m.projectName} (${m.entryFile})`,
      `Duration ${m.duration}, ${m.artifactCount} file${m.artifactCount === 1 ? "" : "s"}`,
      m.error ? `Error: ${m.error.slice(0, 500)}` : null,
      m.link ?? null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ScriptBench" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  private async deliver(type: ChannelType, c: ChannelConfig, m: RunMessage) {
    switch (type) {
      case "webhook":
        return this.post(c.url!, { ...m.payload, text: this.text(m) });
      case "slack":
        return this.post(c.url!, { text: this.text(m) });
      case "telegram":
        return this.post(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
          chat_id: c.chatId,
          text: this.text(m),
          disable_web_page_preview: true,
        });
      case "email": {
        if (!config.smtp) throw new Error("Email is not set up on this server.");
        const { createTransport } = await import("nodemailer");
        await createTransport(config.smtp.url).sendMail({
          from: config.smtp.from,
          to: c.to,
          subject: m.title,
          text: this.text(m),
        });
      }
    }
  }
}
