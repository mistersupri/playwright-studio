import { describe, expect, it } from "vitest";
import { importsToRequires } from "../src/runs/worker/transform.js";

describe("importsToRequires", () => {
  it("turns a default import into a require with default interop", () => {
    const out = importsToRequires(`import ExcelJS from "exceljs";`);
    expect(out).toContain(`const __mod0 = require("exceljs");`);
    expect(out).toContain(`const ExcelJS = __mod0 && __mod0.default !== undefined ? __mod0.default : __mod0;`);
  });

  it("keeps renamed named imports", () => {
    const out = importsToRequires(`import { readFile as read, writeFile } from 'node:fs/promises'`);
    expect(out).toContain(`const { readFile: read, writeFile } = __mod0;`);
  });

  it("handles namespace and side-effect imports and leaves other code alone", () => {
    const out = importsToRequires(`import * as path from "node:path";\nimport "dotenv/config";\nconsole.log(path.sep);`);
    expect(out).toContain(`const path = __mod0;`);
    expect(out).toContain(`require("dotenv/config");`);
    expect(out).toContain(`console.log(path.sep);`);
  });

  it("produces code that runs", () => {
    const code = importsToRequires(`import { join } from "node:path";\nreturn join("a", "b");`);
    const fn = new Function("require", code) as (r: NodeJS.Require) => string;
    expect(fn(require)).toBe(`a/b`);
  });
});
