import { expect, test } from "@playwright/test";
import { newUser, setCode } from "./helpers";

test("an API token starts a saved project and waits for the result", async ({ browser, playwright, baseURL }) => {
  const { page, projectId, context } = await newUser(browser, "api");
  await setCode(page, projectId, `console.log("ORDER", process.env.ORDER_ID);`);

  const created = await page.request.post("/api/tokens", { data: { name: "CI" } }).then((r) => r.json());
  expect(created.token).toMatch(/^sbt_[a-z0-9]+_/);

  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${created.token}` } });
  const result = await api.post(`/api/v1/projects/${projectId}/runs`, { data: { wait: true, env: { ORDER_ID: "1042" } } }).then((r) => r.json());
  expect(result.status).toBe("success");
  expect(result.logs.map((l: { message: string }) => l.message)).toContain("ORDER 1042");

  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get(`/api/v1/runs/${result.runId}`)).status()).toBe(401);

  await api.dispose();
  await anonymous.dispose();
  await context.close();
});
