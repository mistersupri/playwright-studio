import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Browser, chromium, type Page } from "playwright";
import { describe as describeElement } from "../src/runs/worker/locator.js";

const HTML = `
  <form>
    <label for="email">Email</label><input id="email" type="email">
    <input placeholder="Search docs">
    <input type="password" aria-label="Password">
    <button>Sign in</button>
    <button data-testid="save-btn">Save</button>
    <button>Delete</button><button>Delete</button>
    <a href="/pricing">Pricing</a>
  </form>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(HTML);
});
afterAll(() => browser?.close());

async function at(selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return describeElement(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

describe("locator suggestions", () => {
  it("prefers test ids, then role and name, then label and placeholder", async () => {
    expect((await at("[data-testid=save-btn]"))?.locator).toBe(`page.getByTestId("save-btn")`);
    expect((await at("text=Sign in"))?.locator).toBe(`page.getByRole("button", { name: "Sign in" })`);
    expect((await at("a"))?.locator).toBe(`page.getByRole("link", { name: "Pricing" })`);
    expect((await at("#email"))?.locator).toMatch(/getByRole\("textbox", \{ name: "Email" \}\)|getByLabel\("Email"\)/);
    expect((await at("[placeholder]"))?.locator).toMatch(/Search docs/);
  });

  it("flags password fields", async () => {
    expect((await at("[type=password]"))?.isPassword).toBe(true);
  });

  it("never returns a locator that matches more than one element", async () => {
    const info = await at("button:has-text('Delete')");
    expect(info).not.toBeNull();
    const code = info!.locator;
    const count = await (new Function("page", `return ${code}.count()`) as (p: Page) => Promise<number>)(page);
    expect(count).toBe(1);
  });
});
