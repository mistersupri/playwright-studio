import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { parse } from "../common/validation.js";
import { CurrentUser, Public, type SessionUser } from "./auth.decorators.js";
import { AuthService, toSessionUser } from "./auth.service.js";
import { SessionService } from "./session.service.js";

const credentials = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().max(80).optional(),
});

const STATE_COOKIE = "sb_oauth_state";

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
    return { google: Boolean(config.google), registration: config.allowRegistration || firstUser };
  }

  @Public()
  @Get("me")
  me(@CurrentUser() user?: SessionUser) {
    return { user: user ?? null };
  }

  @Public()
  @Post("register")
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(credentials, body);
    const user = await this.auth.register(input);
    this.sessions.issue(res, user.id);
    return { user: toSessionUser(user) };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(credentials.pick({ email: true, password: true }), body);
    const user = await this.auth.login(input.email, input.password);
    this.sessions.issue(res, user.id);
    return { user: toSessionUser(user) };
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    this.sessions.clear(res);
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
      this.sessions.issue(res, user.id);
      res.redirect("/");
    } catch {
      fail("google_failed");
    }
  }
}
