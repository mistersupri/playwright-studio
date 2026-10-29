import { Module } from "@nestjs/common";
import { AiModule } from "./ai/ai.module.js";
import { ArtifactsModule } from "./artifacts/artifacts.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CollabModule } from "./collab/collab.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { RunsModule } from "./runs/runs.module.js";
import { SchedulesModule } from "./schedules/schedules.module.js";
import { SystemModule } from "./system/system.module.js";
import { VariablesModule } from "./variables/variables.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AiModule,
    ProjectsModule,
    ArtifactsModule,
    VariablesModule,
    RunsModule,
    SchedulesModule,
    SystemModule,
    CollabModule,
  ],
})
export class AppModule {}
