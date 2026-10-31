/** Turn ES `import` statements into `require` so user code runs inside an async function body. */
export function importsToRequires(source: string): string {
  let counter = 0;
  return source
    .replace(
      /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]\s*;?/g,
      (_m, def: string | undefined, named: string | undefined, star: string | undefined, mod: string) => {
        const tmp = `__mod${counter++}`;
        const out = [`const ${tmp} = require(${JSON.stringify(mod)});`];
        if (star) out.push(`const ${star} = ${tmp};`);
        if (def) out.push(`const ${def} = ${tmp} && ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};`);
        if (named) {
          const parts = named
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => s.replace(/\s+as\s+/, ": "));
          out.push(`const { ${parts.join(", ")} } = ${tmp};`);
        }
        return out.join(" ");
      },
    )
    .replace(/import\s+['"]([^'"]+)['"]\s*;?/g, (_m, mod: string) => `require(${JSON.stringify(mod)});`);
}

/** `import.meta.*` has no meaning in CommonJS; map it to the CommonJS equivalents. */
function importMeta(source: string): string {
  return source
    .replace(/\bimport\.meta\.url\b/g, `require("node:url").pathToFileURL(__filename).href`)
    .replace(/\bimport\.meta\.dirname\b/g, "__dirname")
    .replace(/\bimport\.meta\.filename\b/g, "__filename");
}

/**
 * Turn ES `export` statements into CommonJS. Exported bindings are assigned at the
 * end of the file, so they are copies rather than live bindings, which is what
 * helper modules (functions and constants) need.
 *
 * With `strip`, the `export` keywords are removed and nothing is assigned: the entry
 * file runs as a function body, where exports have nowhere to go.
 */
export function exportsToCommonJs(source: string, { strip = false } = {}): string {
  const names: [exported: string, local: string][] = [];
  let reexports = 0;
  let out = source
    // export * from "mod"
    .replace(/export\s+\*\s+from\s*['"]([^'"]+)['"]\s*;?/g, (_m, mod: string) =>
      strip ? "" : `Object.assign(module.exports, require(${JSON.stringify(mod)}));`,
    )
    // export { a, b as c } from "mod"
    .replace(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g, (_m, list: string, mod: string) => {
      if (strip) return "";
      const tmp = `__reexport${reexports++}`;
      const assigns = specifiers(list).map(([local, exported]) => `module.exports.${exported} = ${tmp}.${local};`);
      return `const ${tmp} = require(${JSON.stringify(mod)}); ${assigns.join(" ")}`;
    })
    // export { a, b as c }
    .replace(/export\s*\{([^}]*)\}\s*;?/g, (_m, list: string) => {
      for (const [local, exported] of specifiers(list)) names.push([exported, local]);
      return "";
    })
    // export default ...
    .replace(/export\s+default\s+/g, strip ? "" : "module.exports.default = ")
    // export async function f / export function* f / export class C
    .replace(/export\s+((?:async\s+)?function\s*\*?\s*([\w$]+)|class\s+([\w$]+))/g, (_m, decl: string, fn?: string, cls?: string) => {
      const name = (fn ?? cls)!;
      names.push([name, name]);
      return decl;
    })
    // export const a = 1 / export let { x, y: z } = obj
    .replace(/export\s+(const|let|var)\s+/g, (match: string, kind: string, offset: number, all: string) => {
      for (const name of declaredNames(all.slice(offset + match.length))) names.push([name, name]);
      return `${kind} `;
    });
  out = importMeta(out);
  if (strip || names.length === 0) return out;
  const assigns = names.map(([exported, local]) => `module.exports.${exported} = ${local};`).join(" ");
  return `${out}\n${assigns}\n`;
}

/** An ES module helper file, as CommonJS that the run's `require` can load. */
export function esmToCommonJs(source: string): string {
  return exportsToCommonJs(importsToRequires(source));
}

/** The entry file, as the body of the async function the worker runs. */
export function entryToFunctionBody(source: string): string {
  return awaitTopLevelIife(exportsToCommonJs(importsToRequires(source), { strip: true }));
}

/**
 * Local scripts often wrap everything in `(async () => { ... })();` without awaiting it.
 * Inside the runner that would end the run while the script is still going, so an async
 * IIFE that starts a line at column 0 is awaited.
 */
export function awaitTopLevelIife(source: string): string {
  return source.replace(/^(?=\(\s*async\s*(?:\(\s*\)\s*=>|function\b))/gm, "await ");
}

function specifiers(list: string): [local: string, exported: string][] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [local, exported] = s.split(/\s+as\s+/).map((p) => p.trim());
      return [local, exported ?? local];
    });
}

/** Names bound by the declaration that starts at `rest`: one identifier or one destructuring pattern. */
function declaredNames(rest: string): string[] {
  const name = /^\s*([\w$]+)/.exec(rest);
  if (name) return [name[1]];
  const pattern = /^\s*([{[])/.exec(rest);
  if (!pattern) return [];
  const open = pattern[0].length - 1;
  return patternNames(rest.slice(open + 1, matchingBracket(rest, open)));
}

function matchingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if ("([{".includes(text[i])) depth++;
    else if (")]}".includes(text[i]) && --depth === 0) return i;
  }
  return text.length;
}

function patternNames(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of inner) {
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += c;
  }
  parts.push(current);
  return parts
    .map((p) => p.split("=")[0].trim())
    .map((p) => (p.includes(":") ? p.split(":")[1].trim() : p.replace(/^\.\.\./, "")))
    .filter((p) => /^[\w$]+$/.test(p));
}
