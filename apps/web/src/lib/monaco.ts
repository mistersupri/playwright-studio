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

/** Globals the run worker injects into every script. */
const RUNTIME_TYPES = `
declare const page: any;
declare const context: any;
declare const browser: any;
declare const chromium: any;
/** Pause the run until you press Resume. */
declare function pause(label?: string): Promise<void>;
/** Read the text in a CAPTCHA image element with OCR. */
declare function solveCaptcha(selector: string, options?: { charWhitelist?: string; cleanText?: boolean; binarize?: boolean; useGemini?: boolean }): Promise<{ text: string; confidence: number }>;
declare function solveCaptchaFromImage(source: any, options?: { charWhitelist?: string; cleanText?: boolean; binarize?: boolean; useGemini?: boolean }): Promise<{ text: string; confidence: number }>;
/** Ask the person watching the run to pick which matches to keep. */
declare function chooseElements(selector: string): Promise<any[]>;
`;

const js = monaco.typescript.javascriptDefaults;
js.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  allowJs: true,
  checkJs: false,
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
