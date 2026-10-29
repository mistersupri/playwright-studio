import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query, Req, Res } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { parse } from "../common/validation.js";
import { CurrentUser, Public, type SessionUser } from "./auth.decorators.js";
import { AuthService, toSessionUser } from "./auth.service.js";
import { RateLimiter } from "./rate-limit.js";
import { SessionService } from "./session.service.js";

const credentials = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().max(80).optional(),
});

const STATE_COOKIE = "sb_oauth_state";

// 10 failed sign-ins per 15 minutes per address and email; 20 sign-ups per hour per address.
const loginLimit = new RateLimiter(10, 15 * 60_000);
const registerLimit = new RateLimiter(20, 60 * 60_000);
const resetLimit = new RateLimiter(5, 60 * 60_000);

function tooMany(seconds: number): never {
  throw new HttpException(`Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`, HttpStatus.TOO_MANY_REQUESTS);
}

function baseUrl(req: Request) {
  return config.appUrl ?? `${req.protocol}://${req.get("host")}`;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Get("providers")
  async providers() {
    const firstUser = (await this.auth.userCount()) === 0;
    return { google: Boolean(config.google), registration: config.allowRegistration || firstUser, passwordReset: Boolean(config.smtp) };
  }

  @Public()
  @Get("me")
  me(@CurrentUser() user?: SessionUser) {
    return { user: user ?? null };
  }

  @Public()
  @Post("register")
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const wait = registerLimit.retryAfter(req.ip ?? "");
    if (wait) tooMany(wait);
    registerLimit.hit(req.ip ?? "");
    const input = parse(credentials, body);
    const user = await this.auth.register(input);
    this.sessions.issue(res, user);
    return { user: toSessionUser(user) };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(credentials.pick({ email: true, password: true }), body);
    const key = `${req.ip}|${input.email.trim().toLowerCase()}`;
    const wait = loginLimit.retryAfter(key);
    if (wait) tooMany(wait);
    let user;
    try {
      user = await this.auth.login(input.email, input.password);
    } catch (err) {
      loginLimit.hit(key);
      throw err;
    }
    loginLimit.reset(key);
    this.sessions.issue(res, user);
    return { user: toSessionUser(user) };
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    this.sessions.clear(res);
  }

  @Post("password")
  @HttpCode(200)
  async changePassword(@CurrentUser() me: SessionUser, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(z.object({ current: z.string().optional(), next: credentials.shape.password }), body);
    const user = await this.auth.changePassword(me.id, input.current, input.next);
    // Keep this browser signed in; every other session ends.
    this.sessions.issue(res, user);
    return { ok: true };
  }

  @Public()
  @Post("forgot")
  @HttpCode(200)
  async forgot(@Body() body: unknown, @Req() req: Request) {
    const { email } = parse(credentials.pick({ email: true }), body);
    const wait = resetLimit.retryAfter(req.ip ?? "");
    if (wait) tooMany(wait);
    resetLimit.hit(req.ip ?? "");
    await this.auth.requestReset(email, baseUrl(req)).catch(() => {});
    return { ok: true };
  }

  @Public()
  @Post("reset")
  @HttpCode(200)
  async reset(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(z.object({ token: z.string().min(10).max(200), password: credentials.shape.password }), body);
    const user = await this.auth.resetPassword(input.token, input.password);
    this.sessions.issue(res, user);
    return { user: toSessionUser(user) };
  }

  @Public()
  @Get("google")
  google(@Req() req: Request, @Res() res: Response) {
    if (!config.google) return res.redirect("/login?error=google_disabled");
    const state = randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" });
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  @Public()
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fail = (reason: string) => res.redirect(`/login?error=${encodeURIComponent(reason)}`);
    if (!config.google) return fail("google_disabled");
    if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail("google_state");
    res.clearCookie(STATE_COOKIE, { path: "/" });

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) return fail("google_token");
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!profileRes.ok) return fail("google_profile");
      const profile = (await profileRes.json()) as { sub: string; email?: string; name?: string; picture?: string };
      if (!profile.email) return fail("google_email");
      const user = await this.auth.upsertGoogleUser({ ...profile, email: profile.email });
      this.sessions.issue(res, user);
      res.redirect("/");
    } catch {
      fail("google_failed");
    }
  }
}
