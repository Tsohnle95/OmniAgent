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

  function agentCols(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(".agent-col")];
  }

  function agentWidths(): number[] {
    return agentCols().map((col) => Number.parseFloat(col.style.width ?? "0"));
  }

  function agentLefts(): number[] {
    return agentCols().map((col) => Number.parseFloat(col.style.left ?? "0"));
  }

  function gridCols(): string[] {
    const grid = container.querySelector<HTMLElement>(".main-row")!;
    return (grid.style.getPropertyValue("--pane-columns") ?? "").split(" ");
  }

  it("settles with both panels fitting when the window is narrower than their combined width", async () => {
    setWidth(500);
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelector(".app")).not.toBeNull();
    const side = Number.parseFloat(gridCols()[0] ?? "0");
    const agent = agentWidths()[0] ?? 0;
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
    const side = Number.parseFloat(gridCols()[0] ?? "0");
    const agent = agentWidths()[0] ?? 0;
    expect(side + agent).toBeLessThanOrEqual(478);
  });

  it("keeps an anchored agent panel tracking its cap as the window shrinks", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(agentLefts()).toEqual([949]);

    await act(async () => {
      const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 52 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(1228, 0);
    expect(agentLefts()[0]).toBeCloseTo(1229 - 1228, 0);

    await act(async () => {
      setWidth(900);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(Number.parseFloat(gridCols()[0] ?? "0")).toBeCloseTo(250, 0);
    expect(agentWidths()[0]).toBeCloseTo(900 - 250 - 2, 0);
  });

  it("lays out multiple session panels stacked against the right side", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);

    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    const cols = gridCols();
    expect(cols).toHaveLength(3);
    expect(cols[2]).toBe("minmax(0,1fr)");
    const [first, second] = agentWidths();
    expect(first).toBeGreaterThanOrEqual(44);
    expect(second).toBeGreaterThanOrEqual(44);
    expect(agentLefts()).toEqual([669, 949]);
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
    const [first, second] = agentWidths();
    expect(first + second + 250).toBeLessThanOrEqual(698);
    expect(first).toBeGreaterThanOrEqual(44);
    expect(second).toBeGreaterThanOrEqual(44);
  });

  it("adds a third model panel without disturbing the layout", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      dispatch({ kind: "session", session: info("/three", 3) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(3);
    const cols = gridCols();
    expect(cols).toHaveLength(3);
    expect(agentWidths()).toEqual([280, 280, 280]);
    expect(agentLefts()).toEqual([389, 669, 949]);
  });

  it("resizes one model without moving its neighbors", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .panel-resize-right");
    expect(handles).toHaveLength(1);
    await act(async () => {
      handles[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 950 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([230, 280]);
    expect(agentLefts()).toEqual([669, 949]);
  });

  it("slides a model header away from the right-side stack", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const headers = container.querySelectorAll<HTMLElement>(".agent-header");
    expect(headers).toHaveLength(2);

    await act(async () => {
      headers[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 500 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 470 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 440 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentLefts()).toEqual([609, 949]);
    expect(agentWidths()).toEqual([280, 280]);
  });

  it("extends a model from its left edge without moving its right edge", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .panel-resize-left");
    expect(handles).toHaveLength(2);
    await act(async () => {
      handles[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 400 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([380, 280]);
    expect(agentLefts()).toEqual([569, 949]);
  });

  it("stops a panel at its neighbor's edge without touching it", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .panel-resize-right");
    await act(async () => {
      handles[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1100 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([669, 949]);
  });

  it("stops the anchored panel at its neighbor's edge", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .panel-resize-left");
    await act(async () => {
      handles[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 900 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([669, 949]);
  });

  it("keeps the original agent panel right-anchored and resizes from its left edge", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .panel-resize-left");
    await act(async () => {
      handles[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1050 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(230, 0);
    expect(agentLefts()[0]).toBeCloseTo(1229 - 230, 0);

    const headers = container.querySelectorAll<HTMLElement>(".agent-header");
    await act(async () => {
      headers[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 500 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 560 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(230, 0);
    expect(agentLefts()[0]).toBeCloseTo(1229 - 230, 0);
  });

  it("keeps the anchored panel close button while model panels keep theirs", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const cols = agentCols();
    expect(cols[0].querySelector(".agent-close")).not.toBeNull();
    expect(cols[1].querySelector(".agent-close")).toBeNull();
    expect(cols[1].querySelector<HTMLElement>(".agent-collapse")).not.toBeNull();
    expect(cols[0].querySelector<HTMLElement>(".agent-collapse")).not.toBeNull();
  });

  it("agent mode splits open agents evenly and exit restores the file tray with an even shrink", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const modeButton = (): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!;

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([716, 717]);
    expect(agentLefts()).toEqual([2, 718]);

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("250px");
    expect(agentWidths()).toEqual([613, 614]);
    expect(agentLefts()).toEqual([2, 615]);
  });

  it("agent mode splits three open agents evenly with the anchor rightmost", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      dispatch({ kind: "session", session: info("/three", 3) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([477, 477, 478]);
    expect(agentLefts()).toEqual([3, 480, 957]);
  });
});
