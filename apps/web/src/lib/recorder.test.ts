import { describe, expect, it } from "vitest";
import { stepsToCode, tidySteps } from "./recorder";
import type { RecordedStep } from "./types";

const email = `page.getByLabel("Email")`;

describe("tidySteps", () => {
  it("drops the focusing click and keeps the last value typed into a field", () => {
    const steps: RecordedStep[] = [
      { action: "click", locator: email },
      { action: "fill", locator: email, value: "a", secret: false },
      { action: "fill", locator: email, value: "ana@example.com", secret: false },
    ];
    expect(tidySteps(steps)).toEqual([{ action: "fill", locator: email, value: "ana@example.com", secret: false }]);
  });

  it("keeps only the last of back-to-back navigations", () => {
    const steps: RecordedStep[] = [
      { action: "goto", url: "https://a.test/" },
      { action: "goto", url: "https://a.test/login" },
    ];
    expect(tidySteps(steps)).toEqual([{ action: "goto", url: "https://a.test/login" }]);
  });

  it("keeps separate clicks", () => {
    const steps: RecordedStep[] = [
      { action: "click", locator: "page.getByText(\"A\")" },
      { action: "click", locator: "page.getByText(\"A\")" },
    ];
    expect(tidySteps(steps)).toHaveLength(2);
  });
});

describe("stepsToCode", () => {
  it("writes runnable Playwright code and keeps passwords out of it", () => {
    const code = stepsToCode([
      { action: "goto", url: "https://a.test/login" },
      { action: "fill", locator: email, value: "ana@example.com", secret: false },
      { action: "fill", locator: `page.getByLabel("Password")`, value: "hunter2", secret: true },
      { action: "press", key: "Enter", locator: `page.getByLabel("Password")` },
      { action: "check", locator: `page.getByLabel("Remember me")`, checked: false },
      { action: "select", locator: `page.getByLabel("Plan")`, value: "pro" },
      { action: "press", key: "Control+a" },
    ]);
    expect(code.split("\n")).toEqual([
      `await page.goto("https://a.test/login");`,
      `await page.getByLabel("Email").fill("ana@example.com");`,
      `await page.getByLabel("Password").fill(process.env.PASSWORD); // add PASSWORD in Variables`,
      `await page.getByLabel("Password").press("Enter");`,
      `await page.getByLabel("Remember me").uncheck();`,
      `await page.getByLabel("Plan").selectOption("pro");`,
      `await page.keyboard.press("Control+a");`,
    ]);
    expect(code).not.toContain("hunter2");
  });
});
