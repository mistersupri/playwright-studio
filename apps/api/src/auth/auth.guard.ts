import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type AuthedRequest, IS_PUBLIC } from "./auth.decorators.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.sessions.resolve(this.sessions.tokenFrom(req));
    if (user) req.user = user;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic || user) return true;
    throw new UnauthorizedException("Sign in to continue.");
  }
}
