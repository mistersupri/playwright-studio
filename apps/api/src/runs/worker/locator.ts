/**
 * Suggests a Playwright locator for an element, for the recorder and the inspector.
 *
 * The page side lists candidate locators in order of preference (test id, role and
 * accessible name, label, placeholder, text, id, CSS path). The Node side then asks
 * Playwright itself which candidate matches exactly one element, so the role and
 * text engines used for checking are the same ones the script will run with.
 */
import type { Page } from "playwright";

export interface LocatorCandidate {
  method: "getByTestId" | "getByRole" | "getByLabel" | "getByPlaceholder" | "getByText" | "getByAltText" | "locator";
  args: (string | Record<string, unknown>)[];
}

export interface ElementInfo {
  candidates: LocatorCandidate[];
  css: string;
  box: { x: number; y: number; width: number; height: number };
  tag: string;
  isPassword: boolean;
  isEditable: boolean;
  value: string | null;
}

export type Target = { x: number; y: number } | { active: true };

/** Runs inside the page. Must not reference anything outside its own body. */
function inspectInPage(target: Target): ElementInfo | null {
  const raw =
    "active" in target ? document.activeElement : document.elementFromPoint(target.x, target.y);
  if (!raw || raw === document.body || raw === document.documentElement) return null;

  const INTERACTIVE = "button,a[href],input,select,textarea,summary,label,[role],[contenteditable=''],[contenteditable=true],[data-testid]";
  const el = (raw.closest(INTERACTIVE) ?? raw) as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const type = (el.getAttribute("type") ?? "").toLowerCase();

  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const short = (s: string) => (s.length > 60 ? "" : s);

  const labelText = (): string => {
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const text = labelledby.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).join(" ");
      if (text) return text;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return clean(lab.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) return clean(wrap.textContent);
    return "";
  };

  const role = (): string | null => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.split(/\s+/)[0];
    if (tag === "button" || (tag === "input" && ["button", "submit", "reset", "image"].includes(type))) return "button";
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "select") return el.hasAttribute("multiple") ? "listbox" : "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "search") return "searchbox";
      if (["", "text", "email", "tel", "url"].includes(type)) return "textbox";
      return null;
    }
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "img" && el.getAttribute("alt")) return "img";
    return null;
  };

  const name = (): string => {
    const aria = clean(el.getAttribute("aria-label"));
    if (aria) return aria;
    const lab = labelText();
    if (lab) return lab;
    if (tag === "img") return clean(el.getAttribute("alt"));
    if (tag === "input" && ["button", "submit", "reset"].includes(type)) return clean(input.value);
    if (["button", "a", "summary", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) || el.getAttribute("role")) {
      return clean(el.textContent);
    }
    return clean(el.getAttribute("title"));
  };

  const candidates: LocatorCandidate[] = [];
  const testId = el.getAttribute("data-testid");
  if (testId) candidates.push({ method: "getByTestId", args: [testId] });
  const r = role();
  const n = short(name());
  if (r && n) candidates.push({ method: "getByRole", args: [r, { name: n }] });
  const lab = short(labelText());
  if (lab && ["input", "textarea", "select"].includes(tag)) candidates.push({ method: "getByLabel", args: [lab] });
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) candidates.push({ method: "getByPlaceholder", args: [placeholder] });
  if (tag === "img" && el.getAttribute("alt")) candidates.push({ method: "getByAltText", args: [el.getAttribute("alt")!] });
  const text = short(clean(el.textContent));
  if (text && !["input", "textarea", "select"].includes(tag) && el.children.length <= 2) {
    candidates.push({ method: "getByText", args: [text, { exact: true }] });
  }
  if (r && !n) candidates.push({ method: "getByRole", args: [r] });
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) candidates.push({ method: "locator", args: [`#${el.id}`] });
  const nameAttr = el.getAttribute("name");
  if (nameAttr && ["input", "select", "textarea", "button"].includes(tag)) {
    candidates.push({ method: "locator", args: [`${tag}[name="${nameAttr}"]`] });
  }

  // Last resort: a short structural path that is unique by construction.
  const path: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && path.length < 6) {
    const t: string = node.tagName.toLowerCase();
    const parentEl: Element | null = node.parentElement;
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      path.unshift(`#${node.id}`);
      break;
    }
    const same = parentEl ? Array.from(parentEl.children).filter((c) => c.tagName === node!.tagName) : [];
    path.unshift(same.length > 1 ? `${t}:nth-of-type(${same.indexOf(node) + 1})` : t);
    node = parentEl;
  }

  const rect = el.getBoundingClientRect();
  const editable = ["input", "textarea"].includes(tag) || el.isContentEditable;
  return {
    candidates,
    css: path.join(" > "),
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    tag,
    isPassword: tag === "input" && type === "password",
    isEditable: editable,
    value: editable ? (el.isContentEditable ? el.textContent : input.value) : null,
  };
}

export function locatorCode(c: LocatorCandidate): string {
  return `page.${c.method}(${c.args.map((a) => (typeof a === "string" ? JSON.stringify(a) : objectLiteral(a))).join(", ")})`;
}

function objectLiteral(o: Record<string, unknown>): string {
  return `{ ${Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`;
}

export async function describe(page: Page, target: Target) {
  const info = await page.evaluate(inspectInPage, target).catch(() => null);
  if (!info) return null;
  const all = [...info.candidates, { method: "locator", args: [info.css] } as LocatorCandidate];
  for (const c of all) {
    try {
      const loc = (page[c.method] as (...a: unknown[]) => import("playwright").Locator)(...c.args);
      if ((await loc.count()) === 1) return { ...info, locator: locatorCode(c) };
    } catch {}
  }
  return { ...info, locator: locatorCode({ method: "locator", args: [info.css] }) };
}
