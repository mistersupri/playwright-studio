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
