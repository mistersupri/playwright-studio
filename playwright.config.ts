import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests against the production build: one server serves the web app and
 * the API, with a throwaway data folder. Run `npm run build` first.
 * Uses embedded PGlite unless E2E_DATABASE_URL points at an empty Postgres.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "node e2e/start-server.mjs",
    url: `http://127.0.0.1:${PORT}/api/system/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT) },
    stdout: "pipe",
  },
});
