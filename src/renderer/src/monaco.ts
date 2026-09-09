import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { emmetCSS, emmetHTML } from "emmet-monaco-es";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import {
  APP_THEME_MONACO,
  CURATED_THEME_REGISTRATIONS,
  derivePinnedThemeData,
  ORBIT_MONACO_THEME_DATA,
  readStoredCustomEditorThemes,
  resolveEffectiveThemeId,
  type CustomEditorTheme,
  type CustomEditorThemeData
} from "./editor-themes";

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

for (const { id, json } of CURATED_THEME_REGISTRATIONS) {
  monaco.editor.defineTheme(id, json as unknown as monaco.editor.IStandaloneThemeData);
}

export function registerEditorTheme(id: string, data: CustomEditorThemeData): void {
  monaco.editor.defineTheme(id, data as unknown as monaco.editor.IStandaloneThemeData);
}

export function ensureEffectiveEditorTheme(options: {
  appTheme: string;
  editorTheme: string;
  customs: CustomEditorTheme[];
}): string {
  const { appTheme, editorTheme, customs } = options;
  const id = resolveEffectiveThemeId(appTheme, editorTheme);
  if (id === editorTheme) return id;
  // Text-only mode: keep the Orbit panel background, take the theme's token
  // colors. Every explicit choice is derived — including orbit-* picks that
  // differ from the app profile.
  const curated = CURATED_THEME_REGISTRATIONS.find((entry) => entry.id === editorTheme);
  const custom = customs.find((entry) => entry.id === editorTheme);
  const source = ORBIT_MONACO_THEME_DATA[editorTheme] ?? curated?.json ?? custom?.data;
  if (!source) return fallbackTheme(appTheme);
  try {
    registerEditorTheme(id, derivePinnedThemeData(source as CustomEditorThemeData, appTheme));
  } catch {
    // A theme must never crash the editor (e.g. Monaco rejects illegal
    // names with a throw); fall back to the profile theme instead.
    return fallbackTheme(appTheme);
  }
  return id;
}

function fallbackTheme(appTheme: string): string {
  return APP_THEME_MONACO[appTheme] ?? "orbit-original";
}

for (const custom of readStoredCustomEditorThemes()) {
  try {
    registerEditorTheme(custom.id, custom.data);
  } catch {
    // A corrupt stored theme stays listed so it can be removed in settings.
  }
}

for (const [id, data] of Object.entries(ORBIT_MONACO_THEME_DATA)) {
  monaco.editor.defineTheme(id, data as unknown as monaco.editor.IStandaloneThemeData);
}

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
  sass: "sass",
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
