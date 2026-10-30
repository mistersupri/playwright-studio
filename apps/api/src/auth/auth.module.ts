import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { config } from "../config.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

@Global()
@Module({
  imports: [JwtModule.register({ secret: config.authSecret })],
  controllers: [AuthController],
  providers: [AuthService, SessionService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SessionService],
})
export class AuthModule {}
