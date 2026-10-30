import { type Browser, expect, type Page } from "@playwright/test";

let counter = 0;

export function uniqueEmail(prefix = "user") {
  return `${prefix}-${Date.now()}-${counter++}@example.com`;
}

/** Signs a new account up through the API in a fresh context and opens the workbench. */
export async function newUser(browser: Browser, prefix?: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(prefix);
  const res = await page.request.post("/api/auth/register", { data: { email, password: "password123" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/project=/);
  const projectId = new URL(page.url()).searchParams.get("project")!;
  return { context, page, email, projectId };
}

/** Saves code to the project's main.js and reloads, as if it had been typed and saved. */
export async function setCode(page: Page, projectId: string, code: string) {
  const res = await page.request.put(`/api/projects/${projectId}`, { data: { name: "E2E", files: [{ name: "main.js", code }] } });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(page.locator(".view-lines")).toContainText(code.split("\n")[0].slice(0, 20));
}
