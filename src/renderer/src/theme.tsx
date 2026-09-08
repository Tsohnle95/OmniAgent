import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { APP_THEME_MONACO, EDITOR_THEME_AUTO } from "./editor-themes";

export type ThemeId = "original" | "paper" | "kitty";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  editorTheme: string;
  setEditorTheme: (id: string) => void;
}

const THEME_KEY = "orbit.theme";
const EDITOR_THEME_KEY = "orbit.editorTheme";
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

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  const [editorTheme, setEditorThemeState] = useState<string>(storedEditorTheme);

  const setEditorTheme = (id: string): void => {
    const next = id.length > 0 && id.length <= 128 ? id : EDITOR_THEME_AUTO;
    setEditorThemeState(next);
    window.localStorage.setItem(EDITOR_THEME_KEY, next);
  };

  useLayoutEffect(() => {
    if (theme === "original") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme, editorTheme, setEditorTheme }}>{children}</ThemeContext.Provider>;
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
