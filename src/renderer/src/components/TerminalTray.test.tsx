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
    vi.stubGlobal("crypto", { randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
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
      terminalInput: vi.fn(async () => {})
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
});
