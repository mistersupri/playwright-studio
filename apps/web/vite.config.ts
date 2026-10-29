import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { defineConfig, type Plugin } from "vite";

const api = process.env.API_URL ?? "http://localhost:3000";
// Playwright's own .d.ts files feed editor autocomplete; the package does not export them.
const playwrightTypes = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "types");

/** `virtual:playwright-types` exports Playwright's .d.ts files as strings for Monaco. */
function playwrightTypesModule(): Plugin {
  const id = "virtual:playwright-types";
  return {
    name: "playwright-types",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return;
      const read = (f: string) => JSON.stringify(fs.readFileSync(path.join(playwrightTypes, f), "utf8"));
      return `export const types = ${read("types.d.ts")};\nexport const protocol = ${read("protocol.d.ts")};\nexport const structs = ${read("structs.d.ts")};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), playwrightTypesModule()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: api, changeOrigin: false },
      "/ws": { target: api.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
});
