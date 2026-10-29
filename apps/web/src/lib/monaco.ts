import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

// Bundle Monaco instead of loading it from a CDN, so the editor works offline and under a strict CSP.
loader.config({ monaco });

/** Globals the run worker injects into every script, typed against Playwright's own definitions. */
const RUNTIME_TYPES = `
declare const page: import("playwright-core/types/types").Page & {
  /** Read the text in a CAPTCHA image element with OCR. */
  solveCaptcha(selector: string, options?: CaptchaOptions): Promise<{ text: string; confidence: number }>;
  /** Ask the person watching the run to pick which matches to keep. */
  chooseElements(selector: string): Promise<import("playwright-core/types/types").Locator[]>;
};
declare const context: import("playwright-core/types/types").BrowserContext;
declare const browser: import("playwright-core/types/types").Browser;
declare const chromium: import("playwright-core/types/types").BrowserType;
interface CaptchaOptions {
  /** Only these characters are allowed in the answer. */
  charWhitelist?: string;
  /** Strip spaces and punctuation from the answer. */
  cleanText?: boolean;
  /** High-contrast pass before OCR. */
  binarize?: boolean;
  /** Use Gemini instead of Tesseract (needs a key in Gemini settings). */
  useGemini?: boolean;
}
/** Pause the run until you press Resume in the browser panel. */
declare function pause(label?: string): Promise<void>;
/** Read the text in a CAPTCHA image element with OCR. */
declare function solveCaptcha(selector: string, options?: CaptchaOptions): Promise<{ text: string; confidence: number }>;
/** OCR a CAPTCHA from an image Buffer, file path or data URL. */
declare function solveCaptchaFromImage(source: unknown, options?: CaptchaOptions): Promise<{ text: string; confidence: number }>;
/** Ask the person watching the run to pick which matches to keep. Unattended runs keep all of them. */
declare function chooseElements(selector: string): Promise<import("playwright-core/types/types").Locator[]>;
/** Data runs: the current row, keyed by the header of the data file. */
declare const row: Record<string, string>;
/** Data runs: zero-based index of the current row. */
declare const rowIndex: number;
/** Data runs: every row of the data file. */
declare const data: Record<string, string>[];
declare const require: (id: string) => any;
declare const process: { env: Record<string, string | undefined>; cwd(): string; [key: string]: any };
declare const Buffer: any;
declare const __dirname: string;
declare const __filename: string;
`;

let typesLoaded = false;
/** Loads the ~2 MB of Playwright type definitions after the editor is on screen. */
export async function loadPlaywrightTypes() {
  if (typesLoaded) return;
  typesLoaded = true;
  const { types, protocol, structs } = await import("virtual:playwright-types");
  const base = "file:///node_modules/playwright-core/types";
  js.addExtraLib(types, `${base}/types.d.ts`);
  js.addExtraLib(protocol, `${base}/protocol.d.ts`);
  js.addExtraLib(structs, `${base}/structs.d.ts`);
}

const js = monaco.typescript.javascriptDefaults;
js.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  allowJs: true,
  checkJs: false,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
});
js.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
  // Scripts run inside an async function: top-level await and return are valid.
  diagnosticCodesToIgnore: [1375, 1378, 1108, 2304, 80001, 80005, 7016],
});
js.addExtraLib(RUNTIME_TYPES, "file:///scriptbench-runtime.d.ts");

/** Hex versions of the CSS tokens; Monaco themes cannot read CSS variables. */
monaco.editor.defineTheme("sb-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8f8a84", fontStyle: "italic" },
    { token: "string", foreground: "a8c98a" },
    { token: "keyword", foreground: "e9a073" },
    { token: "number", foreground: "d7b46a" },
  ],
  colors: {
    "editor.background": "#181513",
    "editor.foreground": "#eae7e3",
    "editorLineNumber.foreground": "#6f6a64",
    "editorLineNumber.activeForeground": "#d8d3cd",
    "editor.lineHighlightBackground": "#211e1b",
    "editor.selectionBackground": "#3b3631",
    "editorCursor.foreground": "#f06a2e",
    "editorGutter.background": "#181513",
    "editorWidget.background": "#221f1c",
    "editorWidget.border": "#33302d",
    "editorIndentGuide.background1": "#2a2724",
    "scrollbarSlider.background": "#ffffff14",
    "scrollbarSlider.hoverBackground": "#ffffff22",
  },
});

monaco.editor.defineTheme("sb-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7a736d", fontStyle: "italic" },
    { token: "string", foreground: "3f6b1f" },
    { token: "keyword", foreground: "a63a0a" },
    { token: "number", foreground: "8a5a00" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1e1a16",
    "editorLineNumber.foreground": "#a19a94",
    "editorLineNumber.activeForeground": "#3a3530",
    "editor.lineHighlightBackground": "#f7f5f2",
    "editorCursor.foreground": "#cb3a00",
    "editorGutter.background": "#ffffff",
  },
});

export { monaco };

export function languageFor(file: string) {
  if (/\.(m|c)?js$/.test(file)) return "javascript";
  if (/\.tsx?$/.test(file)) return "typescript";
  if (file.endsWith(".json")) return "json";
  if (file.endsWith(".md")) return "markdown";
  if (file.endsWith(".html")) return "html";
  if (file.endsWith(".css")) return "css";
  return "plaintext";
}
