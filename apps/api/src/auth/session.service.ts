import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { users } from "../database/schema.js";
import type { SessionUser } from "./auth.decorators.js";

export const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 14;

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Database,
  ) {}

  issue(res: Response, userId: string) {
    const token = this.jwt.sign({ sub: userId }, { expiresIn: `${SESSION_DAYS}d` });
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
    try {
      const { sub } = this.jwt.verify<{ sub: string }>(token);
      const [user] = await this.db.select().from(users).where(eq(users.id, sub)).limit(1);
      if (!user) return null;
      return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
    } catch {
      return null;
    }
  }
}
