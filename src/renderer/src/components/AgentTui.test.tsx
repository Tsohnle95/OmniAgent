import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendMessage, WorkspaceIdentity } from "@shared/types";

const terminalWrites = vi.hoisted(() => vi.fn());
const terminalData = vi.hoisted(() => vi.fn());

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    onData(callback: (data: string) => void) {
      terminalData.mockImplementation(callback);
      return { dispose() {} };
    }
    write(data: string) { terminalWrites(data); }
    dispose() {}
  }
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const workspace: WorkspaceIdentity = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };

describe("AgentTui", () => {
  let container: HTMLDivElement;
  let root: Root;
  let listener: (message: BackendMessage) => void;
  const onExit = vi.fn();
  const onError = vi.fn();
  const start = vi.fn(async () => {});
  const input = vi.fn(async () => {});
  const resize = vi.fn(async () => {});
  const stop = vi.fn(async () => {});

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([], {} as ResizeObserver); }
      disconnect() {}
    });
    vi.stubGlobal("crypto", { randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    terminalWrites.mockClear();
    terminalData.mockReset();
    onExit.mockClear();
    onError.mockClear();
    start.mockClear();
    input.mockClear();
    resize.mockClear();
    stop.mockClear();
    window.openshell = {
      onMessage: (callback: (message: BackendMessage) => void) => {
        listener = callback;
        return () => {};
      },
      agentTuiStart: start,
      agentTuiInput: input,
      agentTuiResize: resize,
      agentTuiStop: stop
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

  it("starts the runtime TUI, forwards input, and renders output", async () => {
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onExit={onExit} onError={onError} />));

    expect(start).toHaveBeenCalledWith(workspace, "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(resize).toHaveBeenCalledWith(workspace, "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 80, 24);

    await act(async () => listener({ kind: "terminal-data", terminal: { id: "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data: "hello" } }));
    expect(terminalWrites).toHaveBeenCalledWith("hello");
    await act(async () => terminalData("\u0003"));
    expect(input).toHaveBeenCalledWith(workspace, "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "\u0003");
  });

  it("reports natural exit and stops the PTY on unmount", async () => {
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onExit={onExit} onError={onError} />));

    await act(async () => listener({ kind: "terminal-exit", terminal: { id: "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", exitCode: 0 } }));
    expect(onExit).toHaveBeenCalledWith(0);

    await act(async () => root.unmount());
    expect(stop).toHaveBeenCalledWith(workspace, "term-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("returns a failed TUI launch to the GUI with an error", async () => {
    start.mockRejectedValueOnce(new Error("opencode2 was not found"));
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onExit={onExit} onError={onError} />));

    expect(onError).toHaveBeenCalledWith("opencode2 was not found");
  });
});
