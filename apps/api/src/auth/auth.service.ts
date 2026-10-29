import { ConflictException, ForbiddenException, Injectable, Logger, type OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { config } from "../config.js";
import { newId } from "../common/ids.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { type User, users } from "../database/schema.js";
import type { SessionUser } from "./auth.decorators.js";
import { hashPassword, verifyPassword } from "./password.js";

export function toSessionUser(u: User): SessionUser {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(@InjectDb() private readonly db: Database) {}

  async onModuleInit() {
    if (!config.admin) return;
    const email = config.admin.email.toLowerCase();
    const [existing] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) return;
    await this.db.insert(users).values({
      id: newId(16),
      email,
      name: email.split("@")[0],
      passwordHash: await hashPassword(config.admin.password),
    });
    this.logger.log(`Created admin account ${email} from ADMIN_EMAIL`);
  }

  async userCount(): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row?.n ?? 0;
  }

  async register(input: { email: string; password: string; name?: string }): Promise<User> {
    // The very first account can always be created, so a fresh install is never locked out.
    if (!config.allowRegistration && (await this.userCount()) > 0) {
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
    return user;
  }

  async upsertGoogleUser(profile: { sub: string; email: string; name?: string; picture?: string }): Promise<User> {
    const email = profile.email.toLowerCase();
    const [bySub] = await this.db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);
    if (bySub) return bySub;
    const [byEmail] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
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
      })
      .returning();
    return created;
  }
}
