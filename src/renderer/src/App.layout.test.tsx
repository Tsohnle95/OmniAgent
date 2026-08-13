import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendMessage, SessionInfo } from "@shared/types";
import App from "./App";

vi.mock("./components/EditorPane", () => ({
  EditorPane: () => null
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    loadAddon() {}
    open() {}
    onData() {}
    write() {}
    focus() {}
    dispose() {}
  }
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

let messageHandlers: ((message: BackendMessage) => void)[] = [];

function dispatch(message: BackendMessage): void {
  for (const handler of messageHandlers) handler(message);
}

function info(directory: string, generation: number): SessionInfo {
  return {
    id: `session-${generation}`,
    directory,
    workspace: { id: `${generation}1111111-1111-4111-8111-111111111111`, generation }
  };
}

function api(): typeof window.openshell {
  return {
    platform: "darwin",
    onMessage: (handler: (msg: BackendMessage) => void) => {
      messageHandlers.push(handler);
      return () => { messageHandlers = messageHandlers.filter((h) => h !== handler); };
    },
    health: async () => true,
    state: async () => info("/repo", 1),
    activeSessions: async () => [info("/repo", 1)],
    projects: async () => [],
    models: async () => [],
    modelDefault: async () => null,
    sessionSelection: async () => null,
    agents: async () => [],
    sessions: async () => [],
    openSessionById: async () => ({ session: info("/repo", 1), transcript: [], todos: [], usage: null }),
    readFile: async () => "content",
    listDir: async () => [],
    providerUsage: async () => [],
    recoveryRecords: async () => []
  } as unknown as typeof window.openshell;
}

function setWidth(value: number): void {
  Object.defineProperty(window, "innerWidth", { value, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

describe("Layout panel sizing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    messageHandlers = [];
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1480, configurable: true });
    window.openshell = api();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("settles with both panels fitting when the window is narrower than their combined width", async () => {
    setWidth(500);
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelector(".app")).not.toBeNull();
    const dividerNodes = container.querySelectorAll(".main-row > .divider");
    const grid = container.querySelector<HTMLElement>(".main-row");
    expect(grid).not.toBeNull();
    const cols = (grid!.style.getPropertyValue("--pane-columns") ?? "").split(" ");
    const side = Number.parseFloat(cols[0] ?? "0");
    const agent = Number.parseFloat(cols[4] ?? "0");
    expect(side + agent).toBeLessThanOrEqual(498);
    expect(side).toBeGreaterThanOrEqual(44);
    expect(agent).toBeGreaterThanOrEqual(44);
  });

  it("converges without a crash when the window shrinks below the combined panel width", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    await act(async () => {
      setWidth(480);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelector(".app")).not.toBeNull();
    const grid = container.querySelector<HTMLElement>(".main-row");
    const cols = (grid!.style.getPropertyValue("--pane-columns") ?? "").split(" ");
    const side = Number.parseFloat(cols[0] ?? "0");
    const agent = Number.parseFloat(cols[4] ?? "0");
    expect(side + agent).toBeLessThanOrEqual(478);
  });

  it("keeps an anchored agent panel tracking its cap as the window shrinks", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    await act(async () => {
      const agentDivider = container.querySelectorAll<HTMLElement>(".main-row > .divider")[1];
      agentDivider.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1000 - (1228 - 280) }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    let cols = (container.querySelector<HTMLElement>(".main-row")!
      .style.getPropertyValue("--pane-columns") ?? "").split(" ");
    expect(Number.parseFloat(cols[4] ?? "0")).toBeCloseTo(1228, 0);

    await act(async () => {
      setWidth(900);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    cols = (container.querySelector<HTMLElement>(".main-row")!
      .style.getPropertyValue("--pane-columns") ?? "").split(" ");
    expect(Number.parseFloat(cols[0] ?? "0")).toBeCloseTo(250, 0);
    expect(Number.parseFloat(cols[4] ?? "0")).toBeCloseTo(900 - 250 - 2, 0);
  });

  it("lays out multiple session panels side by side with independent widths", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
    const addCol = container.querySelector<HTMLElement>(".panel-add-col");
    expect(addCol).not.toBeNull();

    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    const grid = container.querySelector<HTMLElement>(".main-row")!;
    const cols = (grid.style.getPropertyValue("--pane-columns") ?? "").split(" ");
    expect(cols).toHaveLength(8);
    expect(cols[2]).toBe("minmax(0,1fr)");
    const first = Number.parseFloat(cols[4] ?? "0");
    const second = Number.parseFloat(cols[6] ?? "0");
    expect(first).toBeGreaterThanOrEqual(44);
    expect(second).toBeGreaterThanOrEqual(44);
    expect(cols[7]).toBe("30px");

    const dividerNodes = container.querySelectorAll<HTMLElement>(".main-row > .divider");
    expect(dividerNodes).toHaveLength(3);
  });

  it("keeps both panels visible when the window is narrower than their combined width", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      setWidth(700);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    const grid = container.querySelector<HTMLElement>(".main-row")!;
    const cols = (grid.style.getPropertyValue("--pane-columns") ?? "").split(" ");
    const first = Number.parseFloat(cols[4] ?? "0");
    const second = Number.parseFloat(cols[6] ?? "0");
    expect(first + second + 250).toBeLessThanOrEqual(698);
    expect(first).toBeGreaterThanOrEqual(44);
    expect(second).toBeGreaterThanOrEqual(44);
  });
});
