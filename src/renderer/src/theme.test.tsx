import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useMonacoTheme, useTheme } from "./theme";

interface Captured {
  theme: string;
  editorTheme: string;
  monacoTheme: string;
  setTheme: (theme: "original" | "paper" | "kitty") => void;
  setEditorTheme: (id: string) => void;
  editorFont: string;
  setEditorFont: (id: "system" | "jetbrains-mono" | "fira-code" | "ibm-plex-mono" | "source-code-pro") => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
  editorLigatures: boolean;
  setEditorLigatures: (on: boolean) => void;
}

let capture: Captured | null = null;

function Probe(): ReactNode {
  const { theme, setTheme, editorTheme, setEditorTheme, editorFont, setEditorFont, editorFontSize, setEditorFontSize, editorLigatures, setEditorLigatures } = useTheme();
  const monacoTheme = useMonacoTheme();
  capture = { theme, editorTheme, monacoTheme, setTheme, setEditorTheme, editorFont, setEditorFont, editorFontSize, setEditorFontSize, editorLigatures, setEditorLigatures };
  return null;
}

describe("editor theme preference", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function render(): void {
    act(() => root.render(<ThemeProvider><Probe /></ThemeProvider>));
  }

  it("defaults to following the app theme", () => {
    render();
    expect(capture?.editorTheme).toBe("auto");
    expect(capture?.monacoTheme).toBe("orbit-original");
    expect(window.localStorage.getItem("orbit.editorTheme")).toBeNull();
  });

  it("tracks the app theme while on auto", () => {
    render();
    act(() => capture?.setTheme("paper"));
    expect(capture?.monacoTheme).toBe("orbit-paper");
    act(() => capture?.setTheme("kitty"));
    expect(capture?.monacoTheme).toBe("orbit-kitty");
  });

  it("persists an explicit choice and restores it", () => {
    render();
    act(() => capture?.setEditorTheme("curated-dracula"));
    expect(capture?.editorTheme).toBe("curated-dracula");
    expect(capture?.monacoTheme).toBe("curated-dracula");
    expect(window.localStorage.getItem("orbit.editorTheme")).toBe("curated-dracula");

    act(() => capture?.setTheme("paper"));
    expect(capture?.monacoTheme).toBe("curated-dracula");

    act(() => root.unmount());
    container.remove();
    document.body.append(container);
    root = createRoot(container);
    render();
    expect(capture?.editorTheme).toBe("curated-dracula");
    expect(capture?.monacoTheme).toBe("curated-dracula");
  });

  it("treats blank or missing stored values as auto", () => {
    window.localStorage.setItem("orbit.editorTheme", "");
    render();
    expect(capture?.editorTheme).toBe("auto");
    expect(capture?.monacoTheme).toBe("orbit-original");
  });

  it("defaults the code font, persists changes, and clamps sizes", () => {
    render();
    expect(capture?.editorFont).toBe("system");
    expect(capture?.editorFontSize).toBe(13);
    expect(capture?.editorLigatures).toBe(true);

    act(() => capture?.setEditorFont("fira-code"));
    act(() => capture?.setEditorFontSize(99));
    act(() => capture?.setEditorLigatures(false));
    expect(window.localStorage.getItem("orbit.editorFont")).toBe("fira-code");
    expect(window.localStorage.getItem("orbit.editorFontSize")).toBe("24");
    expect(window.localStorage.getItem("orbit.editorLigatures")).toBe("0");
    expect(capture?.editorFontSize).toBe(24);
    expect(capture?.editorLigatures).toBe(false);

    act(() => root.unmount());
    container.remove();
    document.body.append(container);
    root = createRoot(container);
    render();
    expect(capture?.editorFont).toBe("fira-code");
    expect(capture?.editorFontSize).toBe(24);
    expect(capture?.editorLigatures).toBe(false);
  });

  it("falls back to safe font values for corrupt storage", () => {
    window.localStorage.setItem("orbit.editorFont", "wingdings");
    window.localStorage.setItem("orbit.editorFontSize", "huge");
    render();
    expect(capture?.editorFont).toBe("system");
    expect(capture?.editorFontSize).toBe(13);
  });
});
