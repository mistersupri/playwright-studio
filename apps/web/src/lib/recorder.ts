import type { RecordedStep } from "./types";

/**
 * Collapse what the recorder saw into the steps a person would write by hand:
 * repeated fills of one field keep the last value, and a click that only focused
 * a field before filling it is dropped.
 */
export function tidySteps(steps: RecordedStep[]): RecordedStep[] {
  const out: RecordedStep[] = [];
  for (const step of steps) {
    const prev = out[out.length - 1];
    if (step.action === "fill" && prev?.action === "fill" && prev.locator === step.locator) {
      out[out.length - 1] = step;
      continue;
    }
    if (step.action === "fill" && prev?.action === "click" && prev.locator === step.locator) {
      out[out.length - 1] = step;
      continue;
    }
    if (step.action === "goto" && prev?.action === "goto") {
      out[out.length - 1] = step;
      continue;
    }
    out.push(step);
  }
  return out;
}

export function stepToCode(step: RecordedStep): string {
  switch (step.action) {
    case "goto":
      return `await page.goto(${JSON.stringify(step.url)});`;
    case "click":
      return `await ${step.locator}.click();`;
    case "fill":
      return step.secret
        ? `await ${step.locator}.fill(process.env.PASSWORD); // add PASSWORD in Variables`
        : `await ${step.locator}.fill(${JSON.stringify(step.value)});`;
    case "press":
      return step.locator ? `await ${step.locator}.press(${JSON.stringify(step.key)});` : `await page.keyboard.press(${JSON.stringify(step.key)});`;
    case "check":
      return `await ${step.locator}.${step.checked ? "check" : "uncheck"}();`;
    case "select":
      return `await ${step.locator}.selectOption(${JSON.stringify(step.value)});`;
  }
}

export function stepsToCode(steps: RecordedStep[]): string {
  return tidySteps(steps).map(stepToCode).join("\n");
}
