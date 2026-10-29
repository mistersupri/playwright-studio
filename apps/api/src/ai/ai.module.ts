import { Global, Module } from "@nestjs/common";
import { AiController } from "./ai.controller.js";
import { SettingsService } from "./settings.service.js";

@Global()
@Module({
  controllers: [AiController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class AiModule {}
