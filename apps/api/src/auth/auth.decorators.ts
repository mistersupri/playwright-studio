import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
}

export type AuthedRequest = Request & { user?: SessionUser };

export const IS_PUBLIC = "isPublic";
/** Route is reachable without a session (the user is still attached when present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const IS_ADMIN = "isAdmin";
/** Route needs the admin role. */
export const AdminOnly = () => SetMetadata(IS_ADMIN, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
