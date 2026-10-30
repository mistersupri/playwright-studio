/** Keys sent as key presses; everything else that produces text arrives through the input event. */
export const NAMED_KEYS = new Set([
  "Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", "Insert",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Map a browser keyboard event to a Playwright key string, or null when it should be typed as text. */
export function toPlaywrightKey(e: KeyLike): string | null {
  const mods = [
    // The remote browser runs on Linux, so Cmd shortcuts become Ctrl shortcuts there.
    (e.ctrlKey || e.metaKey) && "Control",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
  ].filter(Boolean) as string[];
  if (NAMED_KEYS.has(e.key)) return [...mods, e.key].join("+");
  const shortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
  // Let paste through: it lands in the hidden field and is typed like any other text.
  if (shortcut && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v")) return [...mods, e.key].join("+");
  return null;
}
