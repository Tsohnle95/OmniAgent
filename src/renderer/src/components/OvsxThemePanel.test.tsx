import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { OvsxThemePanel } from "./OvsxThemePanel";
import { installOvsxTheme, searchOvsxThemes } from "../ovsx-themes";

vi.mock("../ovsx-themes", () => ({
  searchOvsxThemes: vi.fn(),
  installOvsxTheme: vi.fn()
}));
vi.mock("../monaco", () => ({ registerEditorTheme: vi.fn() }));

const hit = {
  namespace: "Acme",
  name: "cool",
  displayName: "Cool Dark",
  description: "A cool theme.",
  downloadCount: 7,
  version: "1.0.0",
  downloadUrl: "https://example/cool.vsix"
};

const installed = [{
  id: "ovsx-acme-cool-0",
  name: "Cool Dark",
  source: "Acme/cool v1.0.0",
  dark: true,
  data: { base: "vs-dark", inherit: true, rules: [], colors: {} }
}];

describe("OvsxThemePanel", () => {
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

  function setInput(value: string): void {
    const input = container.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit(): Promise<void> {
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("searches, installs, selects, and removes a marketplace theme", async () => {
    vi.mocked(searchOvsxThemes).mockResolvedValue({ total: 1, hits: [hit] });
    vi.mocked(installOvsxTheme).mockResolvedValue(installed);
    act(() => root.render(<ThemeProvider><OvsxThemePanel /></ThemeProvider>));

    setInput("cool");
    await submit();
    expect(vi.mocked(searchOvsxThemes)).toHaveBeenCalledWith("cool");
    expect(container.textContent).toContain("Cool Dark");

    await act(async () => {
      container.querySelector(".ovsx-btn")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(vi.mocked(installOvsxTheme)).toHaveBeenCalledWith(hit.downloadUrl);
    expect(window.localStorage.getItem("orbit.editorTheme")).toBe("ovsx-acme-cool-0");
    expect(container.textContent).toContain("Installed marketplace themes");

    await act(async () => {
      [...container.querySelectorAll(".ovsx-btn")].find((button) => button.textContent === "Remove")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("Installed marketplace themes");
    expect(window.localStorage.getItem("orbit.editorTheme")).toBe("auto");
  });

  it("surfaces search and install failures", async () => {
    vi.mocked(searchOvsxThemes).mockRejectedValue(new Error("Marketplace search failed (HTTP 500)"));
    act(() => root.render(<ThemeProvider><OvsxThemePanel /></ThemeProvider>));
    await submit();
    expect(container.querySelector("[role='alert']")?.textContent).toContain("HTTP 500");

    vi.mocked(searchOvsxThemes).mockResolvedValue({ total: 1, hits: [hit] });
    vi.mocked(installOvsxTheme).mockRejectedValue(new Error("No installable themes found (bad)."));
    await submit();
    await act(async () => {
      container.querySelector(".ovsx-btn")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("[role='alert']")?.textContent).toContain("No installable themes");
  });
});
