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

import { entryToFunctionBody, esmToCommonJs, exportsToCommonJs } from "../src/runs/worker/transform.js";

/** Loads CommonJS source as a module and returns its exports. */
function load(code: string, modules: Record<string, unknown> = {}) {
  const module = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", "require", "__filename", "__dirname", code)(
    module, module.exports, (id: string) => modules[id] ?? require(id), "/tmp/helper.js", "/tmp",
  );
  return module.exports;
}

describe("exportsToCommonJs", () => {
  it("exports declarations, lists and defaults", () => {
    const exports = load(
      esmToCommonJs(
        [
          `export const login = async (page) => page + "!";`,
          `export function add(a, b) { return a + b; }`,
          `export class Box {}`,
          `const secret = 42, other = 1;`,
          `export { secret as answer, other };`,
          `export let { x, y: why } = { x: 1, y: 2 };`,
          `export default "hello";`,
        ].join("\n"),
      ),
    );
    expect(Object.keys(exports).sort()).toEqual(["Box", "add", "answer", "default", "login", "other", "why", "x"].sort());
    expect((exports.add as (a: number, b: number) => number)(2, 3)).toBe(5);
    expect(exports.answer).toBe(42);
    expect(exports.why).toBe(2);
    expect(exports.default).toBe("hello");
  });

  it("re-exports from other modules", () => {
    const exports = load(esmToCommonJs(`export * from "a";\nexport { b as bee } from "b";`), { a: { one: 1 }, b: { b: 2 } });
    expect(exports).toEqual({ one: 1, bee: 2 });
  });

  it("maps import.meta to CommonJS", () => {
    const exports = load(esmToCommonJs(`export const dir = import.meta.dirname;\nexport const url = import.meta.url;`));
    expect(exports.dir).toBe("/tmp");
    expect(exports.url).toBe("file:///tmp/helper.js");
  });

  it("only strips the keywords in the entry file", () => {
    expect(exportsToCommonJs(`export const a = 1;\nexport default a;`, { strip: true })).toBe(`const a = 1;\na;`);
  });
});

describe("entryToFunctionBody", () => {
  it("awaits a top-level async IIFE so the run lasts as long as the script", async () => {
    const body = entryToFunctionBody(`import { setTimeout as wait } from "node:timers/promises";\nlet done = false;\n(async () => {\n  await wait(20);\n  done = true;\n})();\nreturn () => done;`);
    expect(body).toContain("await (async () => {");
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const isDone = await new AsyncFunction("require", body)(require);
    expect(isDone()).toBe(true);
  });

  it("leaves nested IIFEs alone", () => {
    expect(entryToFunctionBody(`if (x) {\n  (async () => {})();\n}`)).not.toContain("await");
  });
});
