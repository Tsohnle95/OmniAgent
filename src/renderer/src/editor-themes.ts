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

// Built-in Orbit theme data, kept here (pure) so the pinning derivation can
// use it: every explicit choice resolves to a background-pinned derivation,
// including orbit-* picks that differ from the app profile.
export const ORBIT_MONACO_THEME_DATA: Record<string, CustomEditorThemeData> = {
  "orbit-original": {
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
      "editorCursor.foreground": "#9eb4a1",
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
  },
  "orbit-paper": {
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
      "editorCursor.foreground": "#617a68",
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
  },
  "orbit-kitty": {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7F8292", fontStyle: "italic" },
      { token: "keyword", foreground: "FF8B85" },
      { token: "string", foreground: "5BD69A" },
      { token: "number", foreground: "E0A85A" },
      { token: "type", foreground: "6FC3DF" },
      { token: "function", foreground: "E7E7EE" }
    ],
    colors: {
      "editor.background": "#02020400",
      "editor.foreground": "#e7e7ee",
      "editor.lineHighlightBackground": "#343a5526",
      "editorLineNumber.foreground": "#626b78",
      "editorCursor.foreground": "#00a2ce",
      "editor.selectionBackground": "#2e4d78",
      "editorGutter.background": "#02020400",
      "diffEditor.insertedTextBackground": "#5bd69a20",
      "diffEditor.removedTextBackground": "#ff4b6720",
      "diffEditor.insertedLineBackground": "#5bd69a14",
      "diffEditor.removedLineBackground": "#ff4b6714",
      "diffEditorOverview.insertedForeground": "#5bd69ab3",
      "diffEditorOverview.removedForeground": "#ff4b67b3",
      "diffEditor.diagonalFill": "#02020400",
      "scrollbarSlider.background": "#e7e7ee17",
      "scrollbarSlider.hoverBackground": "#e7e7ee2b",
      "minimap.background": "#02020400"
    }
  }
};

function asCssHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return `#${v}`;
  return null;
}

export const normalizeHexColor = asCssHex;

// Orbit panel backgrounds per app profile, used when a theme is applied
// text-only (see derivePinnedThemeData): the editor keeps the app surface
// while the theme supplies token colors and accents.
export const APP_EDITOR_BACKGROUND: Record<string, { background: string; gutter: string; minimap: string }> = {
  original: { background: "#262220", gutter: "#262220", minimap: "#262220" },
  paper: { background: "#fbf7ec", gutter: "#fbf7ec", minimap: "#fbf7ec" },
  kitty: { background: "#02020400", gutter: "#02020400", minimap: "#02020400" }
};

export function pinnedThemeId(themeId: string, appTheme: string): string {
  // Monaco theme names allow only [a-z0-9-] (it throws otherwise), so the
  // derivation suffix uses dashes, never underscores.
  return `${themeId}-on-${appTheme}`;
}

export function resolveEffectiveThemeId(appTheme: string, editorTheme: string): string {
  // Editor themes only ever recolor text: an explicit choice always resolves
  // to a background-pinned derivation (registered by
  // ensureEffectiveEditorTheme in monaco.ts), never to the raw theme — even
  // when the pick is a built-in from another profile.
  if (editorTheme === EDITOR_THEME_AUTO) return APP_THEME_MONACO[appTheme] ?? "orbit-original";
  return pinnedThemeId(editorTheme, appTheme);
}

export function derivePinnedThemeData(
  data: CustomEditorThemeData,
  appTheme: string
): CustomEditorThemeData {
  const background = APP_EDITOR_BACKGROUND[appTheme] ?? APP_EDITOR_BACKGROUND.original;
  return {
    ...data,
    colors: {
      ...data.colors,
      "editor.background": background.background,
      "editorGutter.background": background.gutter,
      "minimap.background": background.minimap
    }
  };
}

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
  if (typeof candidate.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(candidate.id)) return false;
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
