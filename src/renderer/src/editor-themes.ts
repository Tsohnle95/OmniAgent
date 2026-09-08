import draculaThemeJson from "./editor-themes/Dracula.json";
import githubLightThemeJson from "./editor-themes/GitHub Light.json";
import monokaiThemeJson from "./editor-themes/Monokai.json";
import nightOwlThemeJson from "./editor-themes/Night Owl.json";
import nordThemeJson from "./editor-themes/Nord.json";
import solarizedLightThemeJson from "./editor-themes/Solarized-light.json";

// Pure editor-theme catalog: ids, display metadata, and swatch derivation.
// This module never touches the Monaco API so it stays importable from
// tests and settings UI without loading monaco-editor. Registration with
// `monaco.editor.defineTheme` lives in `monaco.ts`.

export const EDITOR_THEME_AUTO = "auto";

export const APP_THEME_MONACO: Record<string, string> = {
  original: "orbit-original",
  paper: "orbit-paper",
  kitty: "orbit-kitty"
};

export interface EditorThemeOption {
  id: string;
  name: string;
  dark: boolean;
  blurb: string;
  swatches: string[];
}

function asCssHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return `#${v}`;
  return null;
}

export const normalizeHexColor = asCssHex;

export function editorThemeSwatches(data: {
  colors?: Record<string, string | undefined>;
  rules?: Array<{ foreground?: string }>;
}): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    const hex = asCssHex(value);
    if (hex && !out.includes(hex)) out.push(hex);
  };
  push(data.colors?.["editor.background"]);
  push(data.colors?.["editor.foreground"]);
  for (const rule of data.rules ?? []) {
    push(rule.foreground);
    if (out.length >= 5) break;
  }
  return out;
}

export const BUILTIN_EDITOR_THEME_OPTIONS: EditorThemeOption[] = [
  {
    id: "orbit-original",
    name: "Original",
    dark: true,
    blurb: "Orbit's warm charcoal editor.",
    swatches: ["#262220", "#e8e3dd", "#e8875f", "#a8c69a", "#8fbcd9"]
  },
  {
    id: "orbit-paper",
    name: "Paper Editorial",
    dark: false,
    blurb: "Warm paper surfaces with ink text.",
    swatches: ["#fbf7ec", "#2b2119", "#c25f3c", "#587657", "#49708f"]
  },
  {
    id: "orbit-kitty",
    name: "Kitty Glass",
    dark: true,
    blurb: "Translucent dark glass editor.",
    swatches: ["#020204", "#e7e7ee", "#ff8b85", "#5bd69a", "#6fc3df"]
  }
];

interface CuratedThemeSource {
  id: string;
  name: string;
  dark: boolean;
  blurb: string;
  json: unknown;
}

const CURATED_THEME_SOURCES: CuratedThemeSource[] = [
  { id: "curated-dracula", name: "Dracula", dark: true, blurb: "Dark editor with purple accents.", json: draculaThemeJson },
  { id: "curated-monokai", name: "Monokai", dark: true, blurb: "Classic dark editor, warm highlights.", json: monokaiThemeJson },
  { id: "curated-night-owl", name: "Night Owl", dark: true, blurb: "Deep blue dark editor, soft tokens.", json: nightOwlThemeJson },
  { id: "curated-nord", name: "Nord", dark: true, blurb: "Dark slate editor, muted blue accents.", json: nordThemeJson },
  { id: "curated-github-light", name: "GitHub Light", dark: false, blurb: "Light editor in the GitHub style.", json: githubLightThemeJson },
  { id: "curated-solarized-light", name: "Solarized Light", dark: false, blurb: "Warm light editor, Solarized palette.", json: solarizedLightThemeJson }
];

export const CURATED_THEME_REGISTRATIONS: Array<{ id: string; json: unknown }> =
  CURATED_THEME_SOURCES.map((source) => ({ id: source.id, json: source.json }));

export const CURATED_EDITOR_THEME_OPTIONS: EditorThemeOption[] = CURATED_THEME_SOURCES.map((source) => ({
  id: source.id,
  name: source.name,
  dark: source.dark,
  blurb: source.blurb,
  swatches: editorThemeSwatches(source.json as {
    colors?: Record<string, string | undefined>;
    rules?: Array<{ foreground?: string }>;
  })
}));

export interface CustomEditorThemeData {
  base: string;
  inherit: boolean;
  rules: Array<{ token?: string; foreground?: string; background?: string; fontStyle?: string }>;
  colors: Record<string, string>;
}

export interface CustomEditorTheme {
  id: string;
  name: string;
  source: string;
  dark: boolean;
  data: CustomEditorThemeData;
}

export const MAX_CUSTOM_EDITOR_THEMES = 24;
const CUSTOM_EDITOR_THEMES_KEY = "orbit.editorCustomThemes";

function isCustomEditorTheme(value: unknown): value is CustomEditorTheme {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 64) return false;
  if (typeof candidate.name !== "string" || candidate.name.length === 0 || candidate.name.length > 128) return false;
  if (typeof candidate.source !== "string" || candidate.source.length > 256) return false;
  if (typeof candidate.dark !== "boolean") return false;
  if (typeof candidate.data !== "object" || candidate.data === null) return false;
  const data = candidate.data as Record<string, unknown>;
  return Array.isArray(data.rules) && typeof data.colors === "object" && data.colors !== null;
}

export function readStoredCustomEditorThemes(): CustomEditorTheme[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_EDITOR_THEMES_KEY);
    if (!raw || raw.length > 2_000_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomEditorTheme).slice(0, MAX_CUSTOM_EDITOR_THEMES);
  } catch {
    return [];
  }
}

export function writeStoredCustomEditorThemes(themes: CustomEditorTheme[]): void {
  window.localStorage.setItem(CUSTOM_EDITOR_THEMES_KEY, JSON.stringify(themes.slice(0, MAX_CUSTOM_EDITOR_THEMES)));
}
