import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { VariablesService } from "./variables.service.js";

const name = z.string().trim().min(1, "Name the variable set.").max(60);
const vars = z.object({
  vars: z
    .array(
      z.object({
        id: z.string().optional(),
        key: z.string().trim().min(1, "Every variable needs a name.").max(120).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Variable names use letters, digits and underscores, and cannot start with a digit."),
        value: z.string().max(10_000),
        isSecret: z.boolean(),
      }),
    )
    .max(200)
    .refine((list) => new Set(list.map((v) => v.key.trim())).size === list.length, "Variable names must be unique in a set."),
});

@Controller("variables")
export class VariablesController {
  constructor(private readonly variables: VariablesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.variables.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.variables.create(user.id, parse(z.object({ name }), body).name);
  }

  @Patch(":id")
  rename(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    return this.variables.rename(user.id, id, parse(z.object({ name }), body).name);
  }

  @Delete(":id")
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.variables.remove(user.id, id);
  }

  @Put(":id/vars")
  replace(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() body: unknown) {
    return this.variables.replaceVars(user.id, id, parse(vars, body).vars);
  }
}
