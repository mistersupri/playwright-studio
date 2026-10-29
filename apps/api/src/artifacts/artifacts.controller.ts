import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ArtifactsService } from "./artifacts.service.js";

const MAX_UPLOAD = 50 * 1024 * 1024;

@Controller("artifacts")
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query("projectId") projectId?: string) {
    return this.artifacts.list(user.id, projectId || undefined);
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD } }))
  async upload(
    @CurrentUser() user: SessionUser,
    @Query("projectId") projectId: string | undefined,
    @UploadedFile() file?: { originalname: string; buffer: Buffer },
  ) {
    if (!projectId) throw new BadRequestException("Save the project before uploading files.");
    if (!file) throw new BadRequestException("Choose a file to upload.");
    await this.projects.editable(projectId, user.id);
    return this.artifacts.storeUpload(user.id, projectId, file.originalname, file.buffer);
  }

  @Get(":id/file")
  async file(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const { row, data } = await this.artifacts.read(user.id, id);
    const disposition = download ? "attachment" : "inline";
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(data);
  }

  @Get(":id/sheets")
  sheets(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.artifacts.sheets(user.id, id);
  }

  @Patch(":id")
  move(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    const { folder } = parse(
      z.object({
        folder: z
          .string()
          .trim()
          .max(60)
          .regex(/^[\w .-]*$/, "Folder names use letters, numbers, spaces, dots and dashes.")
          .nullable(),
      }),
      body,
    );
    return this.artifacts.setFolder(user.id, id, folder || null);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.artifacts.remove(user.id, id);
  }

  @Post("clear")
  clear(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = parse(
      z.object({
        projectId: z.string().optional(),
        scope: z.enum(["outputs", "uploads", "all", "screenshot", "pdf", "excel", "video", "trace", "upload", "file"]).default("outputs"),
      }),
      body,
    );
    return this.artifacts.clear(user.id, input.projectId, input.scope);
  }
}
