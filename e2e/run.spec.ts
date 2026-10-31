import { expect, type Page, test } from "@playwright/test";
import { newUser, setCode } from "./helpers";

const lastRunStatus = (page: Page) => page.request.get("/api/runs?limit=1").then((r) => r.json()).then((runs) => runs[0]?.status);

test("runs a script, streams its output and keeps the files it writes", async ({ browser }) => {
  const { page, projectId, context } = await newUser(browser, "run");
  await setCode(
    page,
    projectId,
    [
      `await page.setContent("<h1>Hello from e2e</h1>");`,
      `console.log("heading:", await page.textContent("h1"));`,
      `await page.screenshot({ path: "e2e-shot.png" });`,
    ].join("\n"),
  );

  await page.getByRole("button", { name: "Run", exact: true }).click();
  const log = page.getByRole("log");
  await expect(log).toContainText("heading: Hello from e2e", { timeout: 30_000 });
  await expect(log).toContainText("Script finished.");

  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByText("e2e-shot.png").first()).toBeVisible();

  await expect.poll(() => lastRunStatus(page)).toBe("success");
  await context.close();
});

test("a script error fails the run and is shown in the log", async ({ browser }) => {
  const { page, projectId, context } = await newUser(browser, "fail");
  await setCode(page, projectId, `throw new Error("boom from e2e");`);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("boom from e2e", { timeout: 30_000 });
  await expect.poll(() => lastRunStatus(page)).toBe("failed");
  await context.close();
});

test("a script written for a local Playwright runs unchanged, helper modules included", async ({ browser }) => {
  const { page, projectId, context } = await newUser(browser, "local");
  const entry = [
    `import { chromium } from "playwright";`,
    `import { greet, TITLE } from "./helper.js";`,
    ``,
    `(async () => {`,
    `  const browser = await chromium.launch({ headless: false });`,
    `  const page = await browser.newPage();`,
    `  await page.setContent("<h1>" + TITLE + "</h1>");`,
    `  console.log(greet(await page.textContent("h1")));`,
    `  await browser.close();`,
    `})();`,
  ].join("\n");
  const helper = `export const TITLE = "Halo";\nexport function greet(name) {\n  return "greeting: " + name;\n}`;
  const saved = await page.request.put(`/api/projects/${projectId}`, {
    data: { name: "Local", files: [{ name: "main.js", code: entry }, { name: "helper.js", code: helper }] },
  });
  expect(saved.ok()).toBeTruthy();
  await page.reload();

  await page.getByRole("button", { name: "Run", exact: true }).click();
  const log = page.getByRole("log");
  await expect(log).toContainText("greeting: Halo", { timeout: 30_000 });
  await expect(log).toContainText("gets this run's chromium");
  await expect(log).toContainText("Script finished.");
  await expect.poll(() => lastRunStatus(page)).toBe("success");
  await context.close();
});
