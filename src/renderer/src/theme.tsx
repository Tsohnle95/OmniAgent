import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  normalizeEditorFont,
  normalizeEditorFontSize,
  type EditorFontId
} from "./editor-fonts";
import {
  APP_THEME_MONACO,
  EDITOR_THEME_AUTO,
  MAX_CUSTOM_EDITOR_THEMES,
  readStoredCustomEditorThemes,
  writeStoredCustomEditorThemes,
  type CustomEditorTheme
} from "./editor-themes";

export type ThemeId = "original" | "paper" | "kitty";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  editorTheme: string;
  setEditorTheme: (id: string) => void;
  editorFont: EditorFontId;
  setEditorFont: (id: EditorFontId) => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
  editorLigatures: boolean;
  setEditorLigatures: (on: boolean) => void;
  customEditorThemes: CustomEditorTheme[];
  installCustomEditorTheme: (theme: CustomEditorTheme) => void;
  removeCustomEditorTheme: (id: string) => void;
}

const THEME_KEY = "orbit.theme";
const EDITOR_THEME_KEY = "orbit.editorTheme";
const EDITOR_FONT_KEY = "orbit.editorFont";
const EDITOR_FONT_SIZE_KEY = "orbit.editorFontSize";
const EDITOR_LIGATURES_KEY = "orbit.editorLigatures";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedTheme(): ThemeId {
  const value = window.localStorage.getItem(THEME_KEY);
  if (value === "paper" || value === "kitty") return value;
  return "original";
}

function storedEditorTheme(): string {
  const value = window.localStorage.getItem(EDITOR_THEME_KEY);
  if (typeof value === "string" && value.length > 0 && value.length <= 128) return value;
  return EDITOR_THEME_AUTO;
}

function storedEditorFont(): EditorFontId {
  return normalizeEditorFont(window.localStorage.getItem(EDITOR_FONT_KEY));
}

function storedEditorFontSize(): number {
  return normalizeEditorFontSize(window.localStorage.getItem(EDITOR_FONT_SIZE_KEY));
}

function storedEditorLigatures(): boolean {
  return window.localStorage.getItem(EDITOR_LIGATURES_KEY) !== "0";
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  const [editorTheme, setEditorThemeState] = useState<string>(storedEditorTheme);
  const [editorFont, setEditorFontState] = useState<EditorFontId>(storedEditorFont);
  const [editorFontSize, setEditorFontSizeState] = useState<number>(storedEditorFontSize);
  const [editorLigatures, setEditorLigaturesState] = useState<boolean>(storedEditorLigatures);
  const [customEditorThemes, setCustomEditorThemes] = useState<CustomEditorTheme[]>(readStoredCustomEditorThemes);

  const setEditorTheme = (id: string): void => {
    const next = id.length > 0 && id.length <= 128 ? id : EDITOR_THEME_AUTO;
    setEditorThemeState(next);
    window.localStorage.setItem(EDITOR_THEME_KEY, next);
  };

  const setEditorFont = (id: EditorFontId): void => {
    const next = normalizeEditorFont(id);
    setEditorFontState(next);
    window.localStorage.setItem(EDITOR_FONT_KEY, next);
  };

  const setEditorFontSize = (size: number): void => {
    const next = normalizeEditorFontSize(size);
    setEditorFontSizeState(next);
    window.localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(next));
  };

  const setEditorLigatures = (on: boolean): void => {
    setEditorLigaturesState(on);
    window.localStorage.setItem(EDITOR_LIGATURES_KEY, on ? "1" : "0");
  };

  const installCustomEditorTheme = (theme: CustomEditorTheme): void => {
    setCustomEditorThemes((current) => {
      // Re-installs replace in place; beyond the cap the oldest drops off.
      const next = [theme, ...current.filter((entry) => entry.id !== theme.id)].slice(0, MAX_CUSTOM_EDITOR_THEMES);
      writeStoredCustomEditorThemes(next);
      return next;
    });
  };

  const removeCustomEditorTheme = (id: string): void => {
    // Removing the active theme falls back to following the app profile so
    // the editor never points at an unregistered theme.
    setEditorThemeState((current) => {
      if (current !== id) return current;
      window.localStorage.setItem(EDITOR_THEME_KEY, EDITOR_THEME_AUTO);
      return EDITOR_THEME_AUTO;
    });
    setCustomEditorThemes((current) => {
      const next = current.filter((entry) => entry.id !== id);
      writeStoredCustomEditorThemes(next);
      return next;
    });
  };

  useLayoutEffect(() => {
    if (theme === "original") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, editorTheme, setEditorTheme, editorFont, setEditorFont, editorFontSize, setEditorFontSize, editorLigatures, setEditorLigatures, customEditorThemes, installCustomEditorTheme, removeCustomEditorTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext);
}

export function useMonacoTheme(): string {
  const { theme, editorTheme } = useTheme();
  // An explicit id names an already-registered Monaco theme (built-in,
  // curated, or installed); "auto" tracks the app appearance profile.
  if (editorTheme !== EDITOR_THEME_AUTO) return editorTheme;
  return APP_THEME_MONACO[theme] ?? "orbit-original";
}
