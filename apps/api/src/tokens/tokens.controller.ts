import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { API_TOKEN_PREFIX, hashSecret } from "../auth/session.service.js";
import { newId } from "../common/ids.js";
import { parse } from "../common/validation.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { apiTokens } from "../database/schema.js";

@Controller("tokens")
export class TokensController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get()
  async list(@CurrentUser() user: SessionUser) {
    const rows = await this.db
      .select({ id: apiTokens.id, name: apiTokens.name, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt));
    return rows.map((r) => ({ ...r, prefix: `${API_TOKEN_PREFIX}${r.id}_` }));
  }

  /** The full token is returned once, here, and never again. */
  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const { name } = parse(z.object({ name: z.string().trim().min(1, "Name the token after where you will use it.").max(60) }), body);
    const existing = await this.db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.userId, user.id));
    if (existing.length >= 20) throw new ForbiddenException("You can have up to 20 tokens. Revoke one you no longer use.");
    const id = newId(10);
    const secret = randomBytes(24).toString("base64url");
    await this.db.insert(apiTokens).values({ id, userId: user.id, name, secretHash: hashSecret(secret) });
    return { id, name, token: `${API_TOKEN_PREFIX}${id}_${secret}` };
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const deleted = await this.db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id))).returning();
    if (!deleted.length) throw new NotFoundException("Token not found.");
  }
}
