import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { ArtifactsController } from "./artifacts.controller.js";
import { ArtifactsService } from "./artifacts.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
