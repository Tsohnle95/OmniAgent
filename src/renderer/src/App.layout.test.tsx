import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendMessage, SessionInfo, TranscriptItem } from "@shared/types";
import App from "./App";

vi.mock("./components/EditorPane", () => ({
  EditorPane: () => null
}));

vi.mock("./monaco", () => ({
  languageForPath: () => "plaintext",
  monaco: { editor: { setModelMarkers: vi.fn() } }
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
  let openedGeneration = 3;
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
    openSession: async (directory: string) => info(directory, ++openedGeneration),
    selectFolder: async () => info("/repo", ++openedGeneration),
    sessions: async () => [],
    closeSession: async () => {},
    openSessionById: async () => ({ session: info("/repo", 1), transcript: [], todos: [], usage: null }),
    readFile: async () => "content",
    listDir: async () => [],
    providerUsage: async () => [],
    recoveryRecords: async () => [],
    windowView: async () => {}
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

  it("keeps session and workspace opening actions out of the titlebar", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelector('[title^="Sessions"]')).toBeNull();
    expect(container.querySelector('[title="Open another workspace"]')).toBeNull();
    expect(container.querySelector('[title="Open a single file"]')).toBeNull();
  });

  it("toggles the sidebar from the titlebar button without leaving a collapsed strip", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const toggle = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".sidebar.collapsed")).toBeNull();

    await act(async () => {
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(gridCols()).toEqual(["0px", "minmax(0,1fr)"]);
    expect(container.querySelector(".sidebar")).toBeNull();

    await act(async () => {
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(gridCols()[0]).toBe("280px");
    expect(container.querySelector(".sidebar")).not.toBeNull();
  });

  it("mirrors the panel glyph between the sidebar and agent panel toggles", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const sidebarToggle = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!;
    const panelToggle = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-agent-panel"]')!;
    expect(sidebarToggle.closest(".titlebar-leading-actions")).not.toBeNull();
    expect(panelToggle.closest(".titlebar-actions")).not.toBeNull();

    const left = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"] svg')!;
    const right = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-agent-panel"] svg')!;
    expect(left.getAttribute("class")).toContain("codicon-sidebar-left");
    expect(right.getAttribute("class")).toContain("codicon-sidebar-right");
    const leftHalf = left.querySelectorAll("rect")[1];
    const rightHalf = right.querySelectorAll("rect")[1];
    expect(leftHalf?.getAttribute("x")).toBe("1.5");
    expect(rightHalf?.getAttribute("x")).toBe("8");
    expect(right.querySelectorAll("rect").length).toBe(left.querySelectorAll("rect").length);
  });

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

    expect(agentLefts()).toEqual([919]);

    await act(async () => {
      const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 52 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(1199, 0);
    expect(agentLefts()[0]).toBeCloseTo(0, 0);

    await act(async () => {
      setWidth(900);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(Number.parseFloat(gridCols()[0] ?? "0")).toBeCloseTo(280, 0);
    expect(agentWidths()[0]).toBeCloseTo(900 - 280 - 1, 0);
  });

  it("keeps a left-expanded agent panel covering the editor when the window widens", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    await act(async () => {
      const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentLefts()[0]).toBe(0);
    expect(agentWidths()[0]).toBeCloseTo(1199, 0);

    await act(async () => {
      setWidth(1800);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentLefts()[0]).toBe(0);
    expect(agentWidths()[0]).toBeCloseTo(1519, 0);
    expect(container.querySelector<HTMLElement>(".workspace-area")!.style.getPropertyValue("--editor-right")).toBe("0px");
  });

  it("keeps a left-expanded panel against either explorer tray", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    await act(async () => {
      const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentLefts()[0]).toBe(0);
    expect(agentWidths()[0]).toBeCloseTo(1480, 0);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("280px");
    expect(agentLefts()[0]).toBe(0);
    expect(agentWidths()[0]).toBeCloseTo(1199, 0);
    expect(container.querySelector<HTMLElement>(".workspace-area")!.style.getPropertyValue("--editor-right")).toBe("0px");
  });

  it("reopens the sidebar from the titlebar toggle after closing it", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(gridCols()).toEqual(["0px", "minmax(0,1fr)"]);
    expect(container.querySelector(".sidebar")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(gridCols()[0]).toBe("280px");
    expect(container.querySelector(".sidebar")).not.toBeNull();
  });

  it("keeps the sidebar closed while dragging on the workspace after reopening it", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(gridCols()).toEqual(["0px", "minmax(0,1fr)"]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(gridCols()[0]).toBe("280px");

    const divider = container.querySelector<HTMLElement>(".divider")!;
    await act(async () => {
      divider.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 280 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(Number.parseFloat(gridCols()[0])).toBeGreaterThanOrEqual(280);
  });

  it("keeps the anchored agent against the compact explorer tray", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 52 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(1199, 0);
    expect(agentLefts()[0]).toBeCloseTo(0, 0);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-sidebar"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(1480, 0);
    expect(agentLefts()[0]).toBeCloseTo(0, 0);
  });

  it("insets the editor area to the free space left of the agent panels", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const editorRight = (): number =>
      Number.parseFloat(
        container.querySelector<HTMLElement>(".workspace-area")!.style.getPropertyValue("--editor-right") || "0"
      );

    expect(editorRight()).toBeCloseTo(280, 0);

    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(editorRight()).toBeCloseTo(560, 0);

    const model = container.querySelectorAll<HTMLElement>(".agent-col")[0]!;
    await act(async () => {
      const handle = model.querySelector<HTMLElement>(".panel-resize-left")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 671 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(editorRight()).toBeCloseTo(731, 0);
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
    expect(agentLefts()).toEqual([639, 919]);
  });

  it("clamps both panels to their minimum width when the window is narrower than their combined width", async () => {
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
    expect(first).toBeGreaterThanOrEqual(280);
    expect(second).toBeGreaterThanOrEqual(280);
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
    expect(agentLefts()).toEqual([359, 639, 919]);
  });

  it("keeps a model panel at the 280px minimum when dragged below it", async () => {
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

    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([639, 919]);
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

    expect(agentLefts()).toEqual([579, 919]);
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
    expect(agentLefts()).toEqual([539, 919]);
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
    expect(agentLefts()).toEqual([639, 919]);
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
    expect(agentLefts()).toEqual([639, 919]);
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

    expect(agentWidths()[0]).toBeCloseTo(280, 0);
    expect(agentLefts()[0]).toBeCloseTo(919, 0);

    const headers = container.querySelectorAll<HTMLElement>(".agent-header");
    await act(async () => {
      headers[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 500 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 560 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()[0]).toBeCloseTo(280, 0);
    expect(agentLefts()[0]).toBeCloseTo(919, 0);
  });

  it("keeps the anchored panel at 280px while the drag continues below the minimum", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const leftHandles = container.querySelectorAll<HTMLElement>(".agent-col .agent-panel .panel-resize-left");
    await act(async () => {
      leftHandles[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 949 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1150 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([639, 919]);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([639, 919]);
  });

  it("reopens a collapsed agent panel from the titlebar toggle", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      container.querySelectorAll<HTMLElement>(".agent-panel .agent-collapse")[1]!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
    expect(agentWidths()).toEqual([280]);

    const toggle = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-agent-panel"]')!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    expect(agentWidths()).toEqual([280, 280]);
    expect(agentLefts()).toEqual([639, 919]);
  });

  it("repeatedly toggles the single agent panel closed and open from the titlebar", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await act(async () => {
        container.querySelector<HTMLElement>(".agent-panel .agent-collapse")!.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(container.querySelectorAll(".agent-panel")).toHaveLength(0);
      expect(container.querySelectorAll(".agent-tray, .agent-sliver")).toHaveLength(0);

      const toggle = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-agent-panel"]')!;
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      await act(async () => {
        toggle.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
      expect(agentWidths()).toEqual([280]);
      expect(agentLefts()).toEqual([919]);
    }
  });

  it("closes a model panel without leaving a collapsed strip behind", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);

    const handles = container.querySelectorAll<HTMLElement>(".agent-col .agent-panel .panel-resize-right");
    expect(handles).toHaveLength(1);
    void handles;

    await act(async () => {
      container.querySelectorAll<HTMLElement>(".agent-panel .agent-collapse")[0]!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
    expect(container.querySelectorAll(".agent-sliver")).toHaveLength(0);
    expect(agentWidths()).toEqual([280]);
    expect(agentLefts()).toEqual([919]);
  });

  it("keeps the anchor collapse control and closes only non-anchor panels", async () => {
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

  it("agent mode collapses the file tray, splits agents evenly, and restores the tray on exit", async () => {
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

    expect(agentWidths()).toEqual([740, 740]);
    expect(agentLefts()).toEqual([0, 740]);

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("280px");
    expect(agentWidths()).toEqual([598, 599]);
    expect(agentLefts()).toEqual([2, 600]);
  });

  it("model mode places three panels into three quadrants", async () => {
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

    expect(agentWidths()).toEqual([740, 740, 740]);
    expect(agentLefts()).toEqual([0, 0, 740]);
    expect(agentCols().map((col) => col.style.top)).toEqual(["50%", "0%", "0%"]);
    expect(agentCols().map((col) => col.style.height)).toEqual(["50%", "50%", "50%"]);
    expect(container.querySelector<HTMLElement>(".workspace-area")!.style.getPropertyValue("--editor-right")).toBe("0px");
  });

  it("restores a single agent to its default right-anchored width after agent mode", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const modeButton = (): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!;

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("0px");
    expect(agentWidths()).toEqual([1480]);
    expect(agentLefts()).toEqual([0]);
    expect(agentLefts()[0] + agentWidths()[0]).toBe(1480);

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("280px");
    expect(agentWidths()).toEqual([280]);
    expect(agentLefts()).toEqual([919]);
  });

  it("exits agent mode without restoring when the user manually resizes a panel", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const mode = container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-model-mode"]')!;

    await act(async () => {
      mode.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mode.getAttribute("aria-pressed")).toBe("true");

    const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
    const widthBeforeDrag = agentWidths()[0];
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1000 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1300 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mode.getAttribute("aria-pressed")).toBe("true");
    expect(agentWidths()[0]).toBe(widthBeforeDrag);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mode.getAttribute("aria-pressed")).toBe("false");
    expect(gridCols()[0]).toBe("0px");
  });

  it("reopens a collapsed model panel when entering model mode", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    await act(async () => {
      container.querySelector<HTMLElement>(".agent-collapse")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(0);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
    expect(agentWidths()[0]).toBeGreaterThan(1000);
  });

  it("model mode duplicates panels from its add control and stops at four", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const modeButton = (): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!;

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const add = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>('button[aria-label="Add model panel"]')!;
    expect(add().getAttribute("aria-label")).toBe("Add model panel");
    const selectFolder = vi.spyOn(window.openshell, "selectFolder");

    await act(async () => {
      add().click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(selectFolder).toHaveBeenCalledWith(expect.any(Number));
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    expect(agentWidths()).toEqual([740, 740]);

    await act(async () => {
      add().click();
      add().click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(4);
    expect(agentCols().map((col) => col.style.height)).toEqual(["50%", "50%", "50%", "50%"]);
    expect(add().disabled).toBe(true);

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("280px");
    expect(agentWidths()).toEqual([298, 298, 298, 301]);
    expect(agentLefts()).toEqual([4, 302, 600, 898]);
  });

  it("only the plus control adds a model panel", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const openSession = vi.spyOn(window.openshell, "openSession");
    const modeButton = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>('[data-panel-action="toggle-model-mode"]')!;

    await act(async () => {
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      modeButton().click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(openSession).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".agent-panel")).toHaveLength(1);
    expect(container.querySelector('[data-panel-action="add-model-panel"]')).toBeNull();
  });

  it("changing a tray workspace in agent mode swaps in place instead of adding a third quadrant tray", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentWidths()).toEqual([740, 740]);
    expect(agentCols().map((col) => col.style.height)).toEqual(["100%", "100%"]);

    let resolvePick!: (value: SessionInfo) => void;
    const picked = new Promise<SessionInfo>((resolve) => { resolvePick = resolve; });
    window.openshell = { ...window.openshell, selectFolder: vi.fn(() => picked) };

    await act(async () => {
      container.querySelectorAll<HTMLElement>(".agent-workspace")[0]!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    dispatch({ kind: "session", session: info("/picked", 9) });

    await act(async () => {
      resolvePick(info("/picked", 9));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelectorAll(".agent-panel")).toHaveLength(2);
    expect(agentCols().map((col) => col.style.height)).toEqual(["100%", "100%"]);
    expect(agentWidths()).toEqual([740, 740]);
    expect(agentLefts()).toEqual([0, 740]);
  });

  it("preserves an enlarged tray through subagent navigation and back", async () => {
    const parent = { ...info("/repo", 1), title: "Main agent" };
    const child = { ...info("/repo", 8), id: "session-child", parentID: parent.id, title: "Inspect renderer", agent: "explore" };
    const parentTranscript: TranscriptItem[] = [{
      kind: "assistant",
      id: "assistant-dispatch",
      messageID: "assistant-dispatch",
      completed: true,
      parts: [{
        kind: "tool",
        id: "tool-dispatch",
        tool: {
          id: "tool-dispatch",
          title: "subagent",
          detail: "",
          status: "running",
          input: JSON.stringify({ agent: "explore", description: "Inspect renderer" }),
          inputValue: { agent: "explore", description: "Inspect renderer" },
          metadata: { sessionID: child.id }
        }
      }]
    }];
    let parentOpenCount = 0;
    window.openshell = {
      ...api(),
      state: async () => parent,
      activeSessions: async () => [parent],
      sessions: async () => [
        { id: parent.id, title: "Main agent", directory: "/repo", updatedAt: 2 },
        { id: child.id, title: child.title!, directory: "/repo", updatedAt: 3, parentID: parent.id, agent: child.agent }
      ],
      openSessionById: async (sessionID: string) => {
        const session = sessionID === child.id
          ? child
          : parentOpenCount++ === 0
            ? parent
            : { ...info("/repo", 10 + parentOpenCount), id: parent.id, title: "Main agent" };
        dispatch({ kind: "session", session });
        return {
          session,
          transcript: sessionID === child.id ? [] : parentTranscript,
          todos: [],
          usage: null
        };
      }
    };

    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));

    const handle = container.querySelector<HTMLElement>(".agent-col .panel-resize-left")!;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 900 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 780 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const enlarged = agentWidths()[0];
    expect(enlarged).toBeGreaterThan(280);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-component='task-tool-surface']")!.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(container.querySelector(".agent-session-back")).not.toBeNull();
    expect(agentWidths()).toEqual([enlarged]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".agent-session-back")!.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(container.querySelector(".agent-session-back")).toBeNull();
    expect(agentWidths()).toEqual([enlarged]);
  });

  it("closing a quadrant tray restores the default side-by-side trays", async () => {
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

    expect(agentCols()).toHaveLength(3);
    expect(agentCols().map((col) => col.style.height)).toEqual(["50%", "50%", "50%"]);

    await act(async () => {
      container.querySelector<HTMLElement>(".agent-close")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentCols()).toHaveLength(2);
    expect(agentCols().map((col) => col.style.height)).toEqual(["100%", "100%"]);
    expect(agentWidths()).toEqual([740, 740]);
  });

  it("places agent mode beside the collapsed sidebar", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(gridCols()[0]).toBe("0px");
    expect(container.querySelector(".sidebar.collapsed")).toBeNull();
    expect(agentWidths()).toEqual([740, 740]);
    expect(agentLefts()).toEqual([0, 740]);
  });

  it("keeps model quadrants spanning the workspace after a window resize", async () => {
    await act(async () => root.render(<App />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => {
      dispatch({ kind: "session", session: info("/two", 2) });
      dispatch({ kind: "session", session: info("/three", 3) });
      dispatch({ kind: "session", session: info("/four", 4) });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".codicon-robot")!.closest("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await act(async () => {
      setWidth(900);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(agentCols().map((col) => col.style.left)).toEqual(["0px", "0px", "450px", "450px"]);
    expect(agentCols().map((col) => col.style.height)).toEqual(["50%", "50%", "50%", "50%"]);
    expect(agentWidths()).toEqual([450, 450, 450, 450]);
  });
});
