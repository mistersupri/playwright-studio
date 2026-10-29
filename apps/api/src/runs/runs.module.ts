import { Module, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
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
export class RunsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private retention: NodeJS.Timeout | null = null;

  constructor(private readonly runs: RunsService) {}

  async onApplicationBootstrap() {
    await this.runs.markOrphans();
    const purge = () => void this.runs.purgeExpired().catch(() => {});
    setTimeout(purge, 60_000);
    this.retention = setInterval(purge, 6 * 60 * 60_000);
  }

  onModuleDestroy() {
    if (this.retention) clearInterval(this.retention);
  }
}
