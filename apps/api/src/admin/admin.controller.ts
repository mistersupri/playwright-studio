import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { AdminOnly, CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { hashPassword } from "../auth/password.js";
import { parse } from "../common/validation.js";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { artifacts, projects, users } from "../database/schema.js";

@Controller()
export class AdminController {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Storage the signed-in user is using, against the server quota. */
  @Get("account/usage")
  async usage(@CurrentUser() user: SessionUser) {
    const [row] = await this.db
      .select({ used: sql<number>`coalesce(sum(${artifacts.size}), 0)::bigint` })
      .from(artifacts)
      .where(eq(artifacts.userId, user.id));
    return { usedBytes: Number(row?.used ?? 0), quotaBytes: config.storageQuota, retentionDays: config.retentionDays, emailAvailable: Boolean(config.smtp) };
  }

  @AdminOnly()
  @Get("admin/users")
  async list() {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        usedBytes: sql<number>`(select coalesce(sum(${artifacts.size}), 0)::bigint from ${artifacts} where ${artifacts.userId} = ${users.id})`,
        projectCount: sql<number>`(select count(*)::int from ${projects} where ${projects.ownerId} = ${users.id})`,
      })
      .from(users)
      .orderBy(users.createdAt);
    return { users: rows.map((r) => ({ ...r, usedBytes: Number(r.usedBytes) })), quotaBytes: config.storageQuota };
  }

  private async otherActiveAdmins(exceptId: string) {
    const [row] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt), ne(users.id, exceptId)));
    return row?.n ?? 0;
  }

  @AdminOnly()
  @Patch("admin/users/:id")
  async update(@CurrentUser() me: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parse(z.object({ role: z.enum(["admin", "member"]).optional(), disabled: z.boolean().optional() }), body);
    const [target] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new NotFoundException("User not found.");
    const losesAdmin = target.role === "admin" && (input.role === "member" || input.disabled === true);
    if (id === me.id && losesAdmin) throw new BadRequestException("You cannot remove your own admin access.");
    if (losesAdmin && (await this.otherActiveAdmins(id)) === 0) throw new BadRequestException("There must be at least one active admin.");
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.role) patch.role = input.role;
    if (input.disabled !== undefined) {
      patch.disabledAt = input.disabled ? new Date() : null;
      // Disabling ends every session at once.
      if (input.disabled) patch.sessionVersion = target.sessionVersion + 1;
    }
    await this.db.update(users).set(patch).where(eq(users.id, id));
    return this.list();
  }

  /** Sets a one-off password the admin passes on; it signs the user out everywhere. */
  @AdminOnly()
  @Post("admin/users/:id/password")
  async tempPassword(@Param("id") id: string) {
    const [target] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new NotFoundException("User not found.");
    const password = randomBytes(9).toString("base64url");
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), sessionVersion: target.sessionVersion + 1 })
      .where(eq(users.id, id));
    return { password };
  }
}
