import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, TranscriptItem } from "@shared/types";

let currentSession: SessionInfo;
let panelTranscript: TranscriptItem[];
let resizeCallback: ResizeObserverCallback | undefined;
const selectPanelDirectoryMock = vi.fn(async () => {});
const reopenSessionMock = vi.fn(async () => {});

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = { theme: {}, fontFamily: "" };
    loadAddon() {}
    open() {}
    onData() { return { dispose() {} }; }
    write() {}
    dispose() {}
  }
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.mock("../store", () => ({
  useStore: () => ({
    session: currentSession,
    approvalMode: "ask",
    toggleApprovalMode: vi.fn(),
    models: [],
    currentModel: null,
    switchModel: vi.fn(),
    agents: [],
    currentAgent: null,
    switchAgent: vi.fn(),
    loadAgents: vi.fn(),
    loadModels: vi.fn(),
    sendPrompt: vi.fn(),
    runCommand: vi.fn(),
    stop: vi.fn(),
    busy: false,
    sessions: currentSession.parentID ? [{ id: currentSession.parentID, title: "Main agent", directory: currentSession.directory, updatedAt: 1 }] : [],
    reopenSession: reopenSessionMock,
    providerUsage: [],
    providerUsageLoading: false,
    refreshProviderUsage: vi.fn(),
    selectPanelDirectory: selectPanelDirectoryMock
  }),
  usePanel: () => ({
    session: currentSession,
    busy: currentSession.id === "working",
    transcript: panelTranscript,
    todos: [],
    sessionUsage: null,
    models: [],
    currentModel: null,
    agents: [],
    currentAgent: null,
    assistantStatus: currentSession.id === "working" ? { isWorking: true, statusText: "running command" } : null
  })
}));

import { AgentPanel, Composer } from "./AgentPanel";

function session(id: string, generation: number): SessionInfo {
  return {
    id,
    directory: `/workspace-${generation}`,
    workspace: { id: `${generation}1111111-1111-4111-8111-111111111111`, generation }
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("composer workspace continuations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    currentSession = session("one", 1);
    panelTranscript = [];
    resizeCallback = undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    });
    selectPanelDirectoryMock.mockClear();
    reopenSessionMock.mockClear();
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

  it("switches the composer control from stop to send when the panel becomes idle", async () => {
    currentSession = session("working", 1);
    await act(async () => root.render(<Composer session={currentSession} />));
    const running = container.querySelector<HTMLButtonElement>(".composer-send");
    expect(running?.classList.contains("stop")).toBe(true);
    expect(running?.title).toBe("running command");

    currentSession = session("idle", 1);
    await act(async () => root.render(<Composer session={currentSession} />));
    const idle = container.querySelector<HTMLButtonElement>(".composer-send");
    expect(idle?.classList.contains("stop")).toBe(false);
    expect(idle?.title).toBe("Type a prompt first");
  });

  it("changes the panel's workspace from the header folder control", async () => {
    await act(async () => root.render(<AgentPanel />));
    const folder = container.querySelector<HTMLButtonElement>('button[aria-label="Change workspace"]')!;
    expect(folder).not.toBeNull();
    await act(async () => folder.click());

    expect(selectPanelDirectoryMock).toHaveBeenCalledWith(currentSession.workspace);
  });

  it("shows active status beside the workspace name", async () => {
    currentSession = { ...session("working", 1), id: "working" };
    await act(async () => root.render(<AgentPanel />));

    expect(container.querySelector(".agent-status-dot.working")).not.toBeNull();
    expect(container.querySelector(".agent-status-text")?.textContent).toBe("running command");
  });

  it("switches the agent panel into the runtime TUI from its mode menu", async () => {
    const agentTuiStart = vi.fn(async () => {});
    window.openshell = {
      onMessage: vi.fn(() => () => {}),
      agentTuiStart,
      agentTuiInput: vi.fn(async () => {}),
      agentTuiResize: vi.fn(async () => {}),
      agentTuiStop: vi.fn(async () => {})
    } as unknown as Window["openshell"];
    await act(async () => root.render(<AgentPanel />));

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Choose GUI or TUI"]')!.click());
    const tuiItem = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
      .find((item) => item.textContent?.startsWith("TUI"));
    expect(tuiItem).not.toBeUndefined();
    await act(async () => tuiItem!.click());

    expect(container.querySelector(".agent-tui")).not.toBeNull();
    expect(agentTuiStart).toHaveBeenCalledWith(currentSession.workspace, expect.stringMatching(/^term-/));
  });

  it("follows resized stream content only until the reader scrolls away", async () => {
    await act(async () => root.render(<AgentPanel />));
    const scroll = container.querySelector<HTMLDivElement>(".agent-scroll")!;
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500, writable: true },
      scrollTop: { configurable: true, value: 0, writable: true }
    });

    panelTranscript = [{ kind: "user", id: "user-1", text: "Inspect" }];
    await act(async () => root.render(<AgentPanel />));
    expect(scroll.scrollTop).toBe(500);

    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 700, writable: true });
    await act(async () => resizeCallback?.([], {} as ResizeObserver));
    expect(scroll.scrollTop).toBe(700);

    scroll.scrollTop = 300;
    await act(async () => scroll.dispatchEvent(new Event("scroll")));
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 900, writable: true });
    await act(async () => resizeCallback?.([], {} as ResizeObserver));
    expect(scroll.scrollTop).toBe(300);
  });

  it("returns from a child agent session to its parent", async () => {
    currentSession = { ...session("child", 1), id: "child", parentID: "parent", title: "Review changes", agent: "review" };
    await act(async () => root.render(<AgentPanel />));

    await act(async () => container.querySelector<HTMLButtonElement>(".agent-session-back")!.click());
    expect(reopenSessionMock).toHaveBeenCalledWith("parent");
  });

  it("discards slash completions returned after a workspace switch", async () => {
    const commands = deferred<{ name: string; description?: string }[]>();
    window.openshell = {
      commands: vi.fn(() => commands.promise)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const input = container.querySelector("textarea")!;
    await act(async () => {
      input.value = "/";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    currentSession = session("two", 2);
    await act(async () => root.render(<Composer />));
    await act(async () => commands.resolve([{ name: "old-command" }]));

    expect(container.querySelector(".composer-completions")).toBeNull();
  });

  it("does not append picker files selected for an old workspace", async () => {
    const files = deferred<string[]>();
    window.openshell = {
      selectFiles: vi.fn(() => files.promise)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const plus = container.querySelector<HTMLButtonElement>('button[title="Add attachments"]')!;
    await act(async () => plus.click());
    const attach = container.querySelector<HTMLButtonElement>('button[title="Attach files"]')!;
    await act(async () => attach.click());

    currentSession = session("two", 2);
    await act(async () => root.render(<Composer />));
    await act(async () => files.resolve(["/workspace-1/old.txt"]));

    expect(container.querySelector(".composer-attachment")).toBeNull();
  });

  it("adds image picker selections from the plus menu", async () => {
    window.openshell = {
      selectImages: vi.fn(async () => ["/tmp/shot.png"]),
      readImagePreview: vi.fn(async () => null)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const plus = container.querySelector<HTMLButtonElement>('button[title="Add attachments"]')!;
    await act(async () => plus.click());
    const upload = container.querySelector<HTMLButtonElement>('button[title="Upload images"]')!;
    expect(upload).not.toBeNull();
    await act(async () => upload.click());

    expect(window.openshell.selectImages).toHaveBeenCalled();
    expect(container.querySelector(".composer-attachment")).not.toBeNull();
  });

  it("attaches dropped images and shows a thumbnail preview", async () => {
    window.openshell = {
      getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? ""),
      readImagePreview: vi.fn(async () => "data:image/png;base64,AAA")
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const composer = container.querySelector(".composer")!;
    const drop = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, "dataTransfer", {
      value: { types: ["Files"], items: [], files: [{ path: "/tmp/pic.png" }] }
    });
    await act(async () => composer.dispatchEvent(drop));

    expect(container.querySelector(".composer-attachment")).not.toBeNull();
    const thumb = container.querySelector<HTMLImageElement>(".composer-attachment-thumb");
    expect(thumb).not.toBeNull();
    expect(thumb!.src).toBe("data:image/png;base64,AAA");
  });
});
