import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first.path.length ? `${first.path.join(".")}: ` : "";
    throw new BadRequestException(`${where}${first.message}`);
  }
  return result.data;
}
