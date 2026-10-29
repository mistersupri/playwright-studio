import { Module, type OnApplicationBootstrap } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { VariablesModule } from "../variables/variables.module.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

@Module({
  imports: [ProjectsModule, ArtifactsModule, VariablesModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule implements OnApplicationBootstrap {
  constructor(private readonly runs: RunsService) {}

  async onApplicationBootstrap() {
    await this.runs.markOrphans();
  }
}
