import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("a viewer can open a private project but not change it", async ({ browser }) => {
  const owner = await newUser(browser, "owner");
  const viewer = await newUser(browser, "viewer");

  // Private by default: the viewer cannot open it yet.
  expect((await viewer.page.request.get(`/api/projects/${owner.projectId}`)).status()).toBe(403);

  const name = await owner.page.request.get(`/api/projects/${owner.projectId}`).then((r) => r.json()).then((p) => p.name);
  await owner.page.locator("header").getByRole("button", { name }).first().click();
  await owner.page.getByRole("menuitem", { name: "Share" }).click();
  await owner.page.getByLabel("Email of the person to add").fill(viewer.email);
  await owner.page.getByRole("combobox", { name: "Access" }).click();
  await owner.page.getByRole("option", { name: "Can view and run" }).click();
  await owner.page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(owner.page.getByText(viewer.email)).toBeVisible();

  await viewer.page.goto(`/?project=${owner.projectId}`);
  await expect(viewer.page.getByRole("button", { name: "Copy to edit" })).toBeVisible({ timeout: 30_000 });
  const save = await viewer.page.request.put(`/api/projects/${owner.projectId}`, { data: { name, files: [{ name: "main.js", code: "1" }] } });
  expect(save.status()).toBe(403);

  await owner.context.close();
  await viewer.context.close();
});
