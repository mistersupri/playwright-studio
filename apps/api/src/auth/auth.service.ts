import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, type OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { config } from "../config.js";
import { newId } from "../common/ids.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { passwordResets, type User, users } from "../database/schema.js";
import { hashSecret } from "./session.service.js";
import type { SessionUser } from "./auth.decorators.js";
import { hashPassword, verifyPassword } from "./password.js";

export { toSessionUser } from "./session.service.js";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(@InjectDb() private readonly db: Database) {}

  async onModuleInit() {
    if (!config.admin) return;
    const email = config.admin.email.toLowerCase();
    const [existing] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      if (existing.role !== "admin") await this.db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id));
      return;
    }
    await this.db.insert(users).values({
      id: newId(16),
      email,
      name: email.split("@")[0],
      passwordHash: await hashPassword(config.admin.password),
      role: "admin",
    });
    this.logger.log(`Created admin account ${email} from ADMIN_EMAIL`);
  }

  async userCount(): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row?.n ?? 0;
  }

  async register(input: { email: string; password: string; name?: string }): Promise<User> {
    // The very first account can always be created, so a fresh install is never locked out.
    const first = (await this.userCount()) === 0;
    if (!config.allowRegistration && !first) {
      throw new ForbiddenException("Registration is closed on this server.");
    }
    const email = input.email.trim().toLowerCase();
    const [existing] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new ConflictException("An account with this email already exists.");
    const [user] = await this.db
      .insert(users)
      .values({
        id: newId(16),
        email,
        name: input.name?.trim() || email.split("@")[0],
        passwordHash: await hashPassword(input.password),
        role: first ? "admin" : "member",
      })
      .returning();
    return user;
  }

  async login(emailRaw: string, password: string): Promise<User> {
    const email = emailRaw.trim().toLowerCase();
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    if (user.disabledAt) throw new ForbiddenException("This account is disabled. Ask an administrator.");
    return user;
  }

  async upsertGoogleUser(profile: { sub: string; email: string; name?: string; picture?: string }): Promise<User> {
    const email = profile.email.toLowerCase();
    const [bySub] = await this.db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);
    if (bySub?.disabledAt) throw new ForbiddenException("This account is disabled.");
    if (bySub) return bySub;
    const [byEmail] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail?.disabledAt) throw new ForbiddenException("This account is disabled.");
    if (byEmail) {
      const [linked] = await this.db
        .update(users)
        .set({ googleSub: profile.sub, avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null })
        .where(eq(users.id, byEmail.id))
        .returning();
      return linked;
    }
    if (!config.allowRegistration && (await this.userCount()) > 0) {
      throw new ForbiddenException("Registration is closed on this server.");
    }
    const [created] = await this.db
      .insert(users)
      .values({
        id: newId(16),
        email,
        name: profile.name || email.split("@")[0],
        googleSub: profile.sub,
        avatarUrl: profile.picture ?? null,
        role: (await this.userCount()) === 0 ? "admin" : "member",
      })
      .returning();
    return created;
  }

  /** Changing the password signs out every other session (sessionVersion). */
  async changePassword(userId: string, current: string | undefined, next: string): Promise<User> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new UnauthorizedException();
    if (user.passwordHash && !(current && (await verifyPassword(current, user.passwordHash)))) {
      throw new BadRequestException("Your current password is not right.");
    }
    const [updated] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(next), sessionVersion: user.sessionVersion + 1 })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  /** Emails a reset link if SMTP is set up and the account exists. Says nothing either way. */
  async requestReset(emailRaw: string, origin: string) {
    if (!config.smtp) return;
    const [user] = await this.db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase())).limit(1);
    if (!user || user.disabledAt) return;
    const id = newId(12);
    const secret = randomBytes(24).toString("base64url");
    await this.db.insert(passwordResets).values({ id, userId: user.id, secretHash: hashSecret(secret), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    const link = `${origin}/reset?token=${id}.${secret}`;
    const { createTransport } = await import("nodemailer");
    await createTransport(config.smtp.url).sendMail({
      from: config.smtp.from,
      to: user.email,
      subject: "Reset your ScriptBench password",
      text: `Someone asked to reset the password for ${user.email}.\n\nOpen this link within an hour to choose a new one:\n${link}\n\nIf it was not you, ignore this email.`,
    });
  }

  async resetPassword(token: string, password: string): Promise<User> {
    const [id, secret] = token.split(".");
    const [row] = id ? await this.db.select().from(passwordResets).where(eq(passwordResets.id, id)).limit(1) : [];
    const valid =
      row && secret && !row.usedAt && row.expiresAt.getTime() > Date.now() &&
      timingSafeEqual(Buffer.from(row.secretHash, "hex"), Buffer.from(hashSecret(secret), "hex"));
    if (!valid) throw new BadRequestException("This reset link is invalid or has expired. Ask for a new one.");
    await this.db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    const [updated] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), sessionVersion: user.sessionVersion + 1 })
      .where(eq(users.id, user.id))
      .returning();
    return updated;
  }
}

const RESET_TTL_MS = 60 * 60_000;
