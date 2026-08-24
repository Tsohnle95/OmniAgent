import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export type ThemeId = "original" | "paper";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const THEME_KEY = "orbit.theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedTheme(): ThemeId {
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "original" || value === "paper" ? value : "paper";
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
