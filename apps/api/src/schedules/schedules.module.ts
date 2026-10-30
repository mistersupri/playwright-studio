import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { RunsModule } from "../runs/runs.module.js";
import { SchedulesController } from "./schedules.controller.js";
import { SchedulesService } from "./schedules.service.js";

@Module({
  imports: [ProjectsModule, RunsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
