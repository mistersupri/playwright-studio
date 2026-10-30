import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { CollabGateway } from "./collab.gateway.js";

@Module({ imports: [ProjectsModule], providers: [CollabGateway] })
export class CollabModule {}
