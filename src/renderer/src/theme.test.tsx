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
}

let capture: Captured | null = null;

function Probe(): ReactNode {
  const { theme, setTheme, editorTheme, setEditorTheme } = useTheme();
  const monacoTheme = useMonacoTheme();
  capture = { theme, editorTheme, monacoTheme, setTheme, setEditorTheme };
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
});
