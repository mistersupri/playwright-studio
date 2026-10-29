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
