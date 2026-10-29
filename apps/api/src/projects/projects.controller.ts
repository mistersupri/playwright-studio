import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { ProjectsService } from "./projects.service.js";

const fileName = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.\-/ ]+$/, "File names may use letters, numbers, spaces, dots, dashes and slashes.")
  .refine((n) => !n.split("/").includes("..") && !n.startsWith("/"), "File names must stay inside the project.");

const files = z
  .array(z.object({ name: fileName, code: z.string().max(500_000) }))
  .min(1, "A project needs at least one file.")
  .max(50)
  .refine((list) => new Set(list.map((f) => f.name)).size === list.length, "File names must be unique.");

const name = z.string().trim().min(1, "Give the project a name.").max(80);

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.projects.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = parse(z.object({ name, files: files.optional(), isPrivate: z.boolean().optional() }), body);
    return this.projects.create(user.id, input);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.projects.get(id, user.id);
  }

  @Put(":id")
  save(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    return this.projects.save(id, user.id, parse(z.object({ name, files }), body));
  }

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    return this.projects.update(id, user.id, parse(z.object({ name: name.optional(), isPrivate: z.boolean().optional() }), body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.projects.remove(id, user.id);
  }

  @Post(":id/duplicate")
  duplicate(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.projects.duplicate(id, user.id);
  }

  @Get(":id/versions")
  versions(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.projects.versions(id, user.id);
  }
}
