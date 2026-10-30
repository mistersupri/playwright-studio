import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { RunsModule } from "../runs/runs.module.js";
import { TokensController } from "./tokens.controller.js";
import { V1Controller } from "./v1.controller.js";

@Module({
  imports: [ProjectsModule, RunsModule, ArtifactsModule],
  controllers: [TokensController, V1Controller],
})
export class TokensModule {}
