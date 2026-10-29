import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

test("sign up, sign out, and a wrong password is refused", async ({ page }) => {
  const email = uniqueEmail("signup");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 30_000 });
});

test("forgot password without email explains who to ask", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByText("Ask an administrator")).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your workbench" })).toBeVisible();
});
