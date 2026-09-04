import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, Tab } from "@shared/types";
import { StatusBar } from "./StatusBar";
import { applyW3cMarkers } from "../w3c-validation";

const htmlTab: Tab = {
  path: "index.html",
  name: "index.html",
  content: "<p>hi",
  saved: "<p>hi",
  baseline: null,
  deleted: false,
  dirty: false,
  stale: false,
  revision: 0,
  conflict: null,
  mode: "edit",
  binary: false
};
const cssTab: Tab = { ...htmlTab, path: "styles.css", name: "styles.css", content: "body { color: red; }" };
const tsTab: Tab = { ...htmlTab, path: "app.ts", name: "app.ts", content: "const x = 1;" };

const store: { tabs: Tab[]; activePath: string | null; session: SessionInfo | null } = {
  tabs: [htmlTab],
  activePath: htmlTab.path,
  session: null
};

const sessionFixture: SessionInfo = {
  id: "session-1",
  directory: "/repo/a",
  workspace: { id: "ws-1", generation: 1 }
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock("../store", () => ({ useStore: () => store }));
vi.mock("../w3c-validation", () => ({
  applyW3cMarkers: vi.fn(),
  clearW3cMarkers: vi.fn()
}));

describe("StatusBar validation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    store.tabs = [htmlTab];
    store.activePath = htmlTab.path;
    store.session = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("only shows the validate button for HTML and CSS files", () => {
    store.tabs = [];
    store.activePath = null;
    act(() => root.render(<StatusBar />));
    expect(container.querySelector('[data-testid="validate-btn"]')).toBeNull();

    store.tabs = [tsTab];
    store.activePath = tsTab.path;
    act(() => root.render(<StatusBar />));
    expect(container.querySelector('[data-testid="validate-btn"]')).toBeNull();
  });

  it("runs the W3C validator for an open HTML file and shows the marker counts", async () => {
    const diagnostics = [
      { line: 1, column: 1, endLine: 1, endColumn: 2, message: "bad", severity: "error", source: "w3c-html" },
      { line: 2, column: 1, endLine: 2, endColumn: 2, message: "warn", severity: "warning", source: "w3c-html" },
      { line: 3, column: 1, endLine: 3, endColumn: 2, message: "also bad", severity: "error", source: "w3c-html" }
    ];
    window.openshell = { validateW3c: vi.fn(async () => diagnostics) } as unknown as typeof window.openshell;

    act(() => root.render(<StatusBar />));
    const button = container.querySelector<HTMLButtonElement>('[data-testid="validate-btn"]')!;
    expect(button.disabled).toBe(false);
    expect(button.closest(".statusbar-right")).not.toBeNull();

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(window.openshell.validateW3c).toHaveBeenCalledWith("index.html", "<p>hi");
    expect(applyW3cMarkers).toHaveBeenCalledWith("index.html", diagnostics);
    expect(container.querySelector('[data-testid="validate-result"]')?.textContent).toBe("2 errors, 1 warning");
  });

  it("reports a clean file and resets the result when the content changes", async () => {
    window.openshell = { validateW3c: vi.fn(async () => []) } as unknown as typeof window.openshell;

    act(() => root.render(<StatusBar />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="validate-btn"]')!.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="validate-result"]')?.textContent).toBe("No problems");

    store.tabs = [{ ...htmlTab, content: "<p>changed" }];
    act(() => root.render(<StatusBar />));
    expect(container.querySelector('[data-testid="validate-result"]')).toBeNull();
  });

  it("shows a failure state when the validator rejects", async () => {
    window.openshell = { validateW3c: vi.fn(async () => { throw new Error("network down"); }) } as unknown as typeof window.openshell;

    act(() => root.render(<StatusBar />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="validate-btn"]')!.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="validate-result"]')?.textContent).toBe("Validation failed");
  });

  it("hides the Vite button when no session is open", () => {
    store.session = null;
    act(() => root.render(<StatusBar />));
    expect(container.querySelector('[data-testid="vite-btn"]')).toBeNull();
  });

  it("starts the workspace server when the Vite button is clicked", async () => {
    store.session = sessionFixture;
    const viteStart = vi.fn(async () => ({ url: "http://127.0.0.1:5199/", port: 5199 }));
    window.openshell = { validateW3c: vi.fn(async () => []), viteStart } as unknown as typeof window.openshell;

    act(() => root.render(<StatusBar />));
    const button = container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!;
    expect(button.closest(".statusbar-right")).not.toBeNull();

    await act(async () => {
      button.click();
      await flush();
    });

    expect(viteStart).toHaveBeenCalledWith(sessionFixture.workspace);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')?.title).toBe("http://127.0.0.1:5199/");
  });

  it("shows a busy label while the Vite server starts", async () => {
    store.session = sessionFixture;
    let resolveStart!: (preview: { url: string; port: number }) => void;
    const pending = new Promise<{ url: string; port: number }>((resolve) => { resolveStart = resolve; });
    window.openshell = { validateW3c: vi.fn(async () => []), viteStart: vi.fn(() => pending) } as unknown as typeof window.openshell;

    act(() => root.render(<StatusBar />));
    const button = container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!;
    act(() => { button.click(); });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Starting Vite…");

    await act(async () => {
      resolveStart({ url: "http://127.0.0.1:5199/", port: 5199 });
      await pending;
      await flush();
    });
    expect(container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')?.textContent).toBe("Open in Vite");
  });
});
