import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { emmetCSS, emmetHTML } from "emmet-monaco-es";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (moduleId: string, label: string) => Worker;
    };
  }
}

window.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  }
};

loader.config({ monaco });

emmetHTML(monaco, ["html"]);
emmetCSS(monaco, ["css", "scss", "less"]);

monaco.editor.defineTheme("omniagent-original", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "78716C", fontStyle: "italic" },
    { token: "keyword", foreground: "E8875F" },
    { token: "string", foreground: "A8C69A" },
    { token: "number", foreground: "E5B567" },
    { token: "type", foreground: "8FBCD9" },
    { token: "function", foreground: "EAD9C8" }
  ],
  colors: {
    "editor.background": "#262220",
    "editor.lineHighlightBackground": "#2d2926",
    "editorLineNumber.foreground": "#57534e",
    "editorCursor.foreground": "#e8875f",
    "editor.selectionBackground": "#4a352c",
    "editorGutter.background": "#262220",
    "diffEditor.insertedTextBackground": "#9dc2a11f",
    "diffEditor.removedTextBackground": "#e2988a1f",
    "diffEditor.insertedLineBackground": "#9dc2a117",
    "diffEditor.removedLineBackground": "#e2988a17",
    "diffEditorOverview.insertedForeground": "#9dc2a1b3",
    "diffEditorOverview.removedForeground": "#e2988ab3",
    "diffEditor.diagonalFill": "#262220",
    "scrollbarSlider.background": "#ffffff17",
    "scrollbarSlider.hoverBackground": "#ffffff26",
    "minimap.background": "#262220"
  }
});

monaco.editor.defineTheme("omniagent-paper", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "948571", fontStyle: "italic" },
    { token: "keyword", foreground: "C25F3C" },
    { token: "string", foreground: "587657" },
    { token: "number", foreground: "9C742F" },
    { token: "type", foreground: "49708F" },
    { token: "function", foreground: "5B4030" }
  ],
  colors: {
    "editor.background": "#fbf7ec",
    "editor.foreground": "#2b2119",
    "editor.lineHighlightBackground": "#eee5d4",
    "editorLineNumber.foreground": "#a69883",
    "editorCursor.foreground": "#c25f3c",
    "editor.selectionBackground": "#dfc8b7",
    "editorGutter.background": "#fbf7ec",
    "diffEditor.insertedTextBackground": "#58765720",
    "diffEditor.removedTextBackground": "#aa624f20",
    "diffEditor.insertedLineBackground": "#58765714",
    "diffEditor.removedLineBackground": "#aa624f14",
    "diffEditorOverview.insertedForeground": "#587657b3",
    "diffEditorOverview.removedForeground": "#aa624fb3",
    "diffEditor.diagonalFill": "#eee5d4",
    "scrollbarSlider.background": "#2b21191a",
    "scrollbarSlider.hoverBackground": "#2b21192b",
    "minimap.background": "#fbf7ec"
  }
});

export { monaco };

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  sql: "sql",
  dockerfile: "dockerfile",
  graphql: "graphql",
  vue: "html",
  svelte: "html",
  txt: "plaintext",
  log: "plaintext",
  diff: "diff"
};

export function languageForPath(p: string): string {
  const base = p.split("/").pop() ?? "";
  const lower = base.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}
