import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendMessage, SessionInfo } from "@shared/types";
import { TerminalTray } from "./TerminalTray";

const writes = vi.hoisted(() => vi.fn());
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    onData() {}
    write(data: string) { writes(data); }
    focus() {}
    dispose() {}
  }
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const session: SessionInfo = {
  id: "session",
  directory: "/workspace",
  workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 }
};
vi.mock("../store", () => ({ useStore: () => ({ session }) }));

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("TerminalTray integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let listener: (message: BackendMessage) => void;
  let terminalId = "";
  const onClose = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid).padStart(12, "0")}` });
    writes.mockClear();
    onClose.mockClear();
    window.openshell = {
      onMessage: (callback: (message: BackendMessage) => void) => { listener = callback; return () => {}; },
      terminalStart: vi.fn(async (_workspace, id) => {
        terminalId = id;
        listener({ kind: "terminal-data", terminal: { id, data: "startup" } });
      }),
      terminalStop: vi.fn(async () => {}),
      terminalResize: vi.fn(async () => {}),
      terminalInput: vi.fn(async () => {}),
      viteStart: vi.fn(async () => ({ url: "http://127.0.0.1:5199/", port: 5199 }))
    } as unknown as typeof window.openshell;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("flushes data emitted during start and wires natural exit", async () => {
    await act(async () => root.render(<TerminalTray height={240} snapped={false} onClose={onClose} onExpand={() => {}} />));

    expect(writes).toHaveBeenCalledWith("startup");
    expect(container.textContent).toContain("Terminal 1");
    await act(async () => listener({ kind: "terminal-exit", terminal: { id: terminalId, exitCode: 0 } }));
    expect(container.textContent).toContain("No terminal open");
  });

  it("commits the empty view and closes the tray after the final close", async () => {
    await act(async () => root.render(<TerminalTray height={240} snapped={false} onClose={onClose} onExpand={() => {}} />));
    const close = container.querySelector<HTMLButtonElement>(".terminal-tab-close")!;
    await act(async () => close.click());

    expect(container.textContent).toContain("No terminal open");
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.openshell.terminalStop).toHaveBeenCalledWith(session.workspace, terminalId);
  });

  it("opens a requested terminal in the selected workspace folder", async () => {
    await act(async () => root.render(
      <TerminalTray
        height={240}
        snapped={false}
        request={{ id: 1, directory: "packages/web" }}
        onClose={onClose}
        onExpand={() => {}}
      />
    ));

    expect(window.openshell.terminalStart).toHaveBeenCalledWith(
      session.workspace,
      "term-aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
      "packages/web"
    );
    expect(container.textContent).toContain("web");
  });

  it("shows a server button in the terminal header", async () => {
    await act(async () => root.render(<TerminalTray height={240} snapped={false} onClose={onClose} onExpand={() => {}} />));

    const button = container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!;
    expect(button.closest(".terminal-header")).not.toBeNull();
    expect(button.title).toBe("Serve this workspace with Vite and open it in a browser");
  });

  it("serves the panel workspace when the server button is clicked", async () => {
    await act(async () => root.render(<TerminalTray height={240} snapped={false} onClose={onClose} onExpand={() => {}} />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!.click();
      await flush();
    });

    expect(window.openshell.viteStart).toHaveBeenCalledWith(session.workspace);
    const button = container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!;
    expect(button.title).toBe("http://127.0.0.1:5199/");
    expect(button.classList.contains("running")).toBe(true);
  });

  it("disables the server button while the server starts", async () => {
    let resolveStart!: (preview: { url: string; port: number }) => void;
    const pending = new Promise<{ url: string; port: number }>((resolve) => { resolveStart = resolve; });
    window.openshell = {
      ...window.openshell,
      viteStart: vi.fn(() => pending)
    } as unknown as typeof window.openshell;

    await act(async () => root.render(<TerminalTray height={240} snapped={false} onClose={onClose} onExpand={() => {}} />));
    const button = container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')!;
    act(() => { button.click(); });
    expect(button.disabled).toBe(true);

    await act(async () => {
      resolveStart({ url: "http://127.0.0.1:5199/", port: 5199 });
      await pending;
      await flush();
    });
    expect(container.querySelector<HTMLButtonElement>('[data-testid="vite-btn"]')?.disabled).toBe(false);
  });
});
