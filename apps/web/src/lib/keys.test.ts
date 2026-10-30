import { describe, expect, it } from "vitest";
import { toPlaywrightKey } from "./keys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  toPlaywrightKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("toPlaywrightKey", () => {
  it("leaves plain characters to the text input", () => {
    expect(key("a")).toBeNull();
    expect(key("A", { shiftKey: true })).toBeNull();
  });

  it("sends named keys with their modifiers", () => {
    expect(key("Enter")).toBe("Enter");
    expect(key("Tab", { shiftKey: true })).toBe("Shift+Tab");
    expect(key("ArrowLeft", { altKey: true, shiftKey: true })).toBe("Alt+Shift+ArrowLeft");
  });

  it("maps Cmd shortcuts to Ctrl for the Linux browser", () => {
    expect(key("a", { metaKey: true })).toBe("Control+a");
    expect(key("z", { ctrlKey: true, shiftKey: true })).toBe("Control+Shift+z");
  });

  it("lets paste through as text", () => {
    expect(key("v", { ctrlKey: true })).toBeNull();
    expect(key("V", { metaKey: true })).toBeNull();
  });
});
