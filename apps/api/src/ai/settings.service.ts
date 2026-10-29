import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { decryptText, encryptText, MASK } from "../common/crypto.js";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { userSettings } from "../database/schema.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

@Injectable()
export class SettingsService {
  constructor(@InjectDb() private readonly db: Database) {}

  private async row(userId: string) {
    const [row] = await this.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return row;
  }

  async publicView(userId: string) {
    const row = await this.row(userId);
    return {
      hasKey: Boolean(row?.geminiApiKeyEnc),
      serverKey: Boolean(config.geminiApiKey),
      apiKey: row?.geminiApiKeyEnc ? MASK : "",
      model: row?.geminiModel ?? DEFAULT_MODEL,
      captchaCount: row?.captchaCount ?? 0,
    };
  }

  /** The user's own key wins; the server-wide GEMINI_API_KEY is the fallback. */
  async gemini(userId: string) {
    const row = await this.row(userId);
    return {
      apiKey: row?.geminiApiKeyEnc ? decryptText(row.geminiApiKeyEnc) : config.geminiApiKey,
      model: row?.geminiModel ?? DEFAULT_MODEL,
    };
  }

  async save(userId: string, input: { apiKey: string; model: string }) {
    const current = await this.row(userId);
    const geminiApiKeyEnc =
      input.apiKey === MASK ? (current?.geminiApiKeyEnc ?? null) : input.apiKey ? encryptText(input.apiKey) : null;
    await this.db
      .insert(userSettings)
      .values({ userId, geminiApiKeyEnc, geminiModel: input.model })
      .onConflictDoUpdate({ target: userSettings.userId, set: { geminiApiKeyEnc, geminiModel: input.model } });
    return this.publicView(userId);
  }

  async countCaptcha(userId: string) {
    await this.db
      .insert(userSettings)
      .values({ userId, captchaCount: 1 })
      .onConflictDoUpdate({ target: userSettings.userId, set: { captchaCount: sql`${userSettings.captchaCount} + 1` } });
  }
}
