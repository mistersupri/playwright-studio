import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { apiTokens, type User, users } from "../database/schema.js";
import type { SessionUser } from "./auth.decorators.js";

export const SESSION_COOKIE = "sb_session";

export function toSessionUser(u: User): SessionUser {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, role: u.role };
}
export const API_TOKEN_PREFIX = "sbt_";

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
const SESSION_DAYS = 14;

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Database,
  ) {}

  issue(res: Response, user: Pick<User, "id" | "sessionVersion">) {
    const token = this.jwt.sign({ sub: user.id, v: user.sessionVersion }, { expiresIn: `${SESSION_DAYS}d` });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProd && (config.appUrl?.startsWith("https://") ?? false),
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  clear(res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  tokenFrom(req: Pick<Request, "headers"> & { cookies?: Record<string, string> }): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7).trim();
    if (req.cookies?.[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
    // WebSocket upgrades are not run through cookie-parser.
    const raw = req.headers.cookie;
    const match = raw?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  async resolve(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    if (token.startsWith(API_TOKEN_PREFIX)) return this.resolveApiToken(token);
    try {
      const { sub, v } = this.jwt.verify<{ sub: string; v?: number }>(token);
      const [user] = await this.db.select().from(users).where(eq(users.id, sub)).limit(1);
      // A disabled account, or a password change since this session began, ends the session.
      if (!user || user.disabledAt || (v ?? 0) !== user.sessionVersion) return null;
      return toSessionUser(user);
    } catch {
      return null;
    }
  }

  /** Tokens look like sbt_<id>_<secret>; only a hash of the secret is stored. */
  private async resolveApiToken(token: string): Promise<SessionUser | null> {
    const [, id, secret] = token.match(/^sbt_([a-z0-9]+)_([A-Za-z0-9_-]+)$/) ?? [];
    if (!id || !secret) return null;
    const [row] = await this.db
      .select({ token: apiTokens, user: users })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(eq(apiTokens.id, id))
      .limit(1);
    if (!row) return null;
    const expected = Buffer.from(row.token.secretHash, "hex");
    const actual = Buffer.from(hashSecret(secret), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    // Avoid a write on every request; minute precision is enough for "last used".
    if (!row.token.lastUsedAt || Date.now() - row.token.lastUsedAt.getTime() > 60_000) {
      await this.db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
    }
    if (row.user.disabledAt) return null;
    return toSessionUser(row.user);
  }
}
