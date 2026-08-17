import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenShellApi } from "../../preload";
import type { BackendMessage, SessionInfo } from "@shared/types";
import { StoreProvider, useStore } from "./store";

type Store = ReturnType<typeof useStore>;

let store: Store;
let messageHandler: ((message: BackendMessage) => void) | null;

function Probe(): ReactNode {
  store = useStore();
  return null;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function info(directory: string, generation: number): SessionInfo {
  return {
    id: `session-${generation}`,
    directory,
    workspace: { id: `${generation}1111111-1111-4111-8111-111111111111`, generation }
  };
}

function api(overrides: Partial<OpenShellApi> = {}): OpenShellApi {
  return {
    platform: "darwin",
    onMessage: (handler) => {
      messageHandler = handler;
      return () => { messageHandler = null; };
    },
    health: async () => true,
    state: async () => null,
    activeSessions: async () => [],
    models: async () => [],
    modelDefault: async () => null,
    sessionSelection: async () => null,
    agents: async () => [],
    sessions: async () => [],
    openSession: async (directory, generation) => info(directory, generation),
    openSessionById: async (sessionID: string) => ({
      session: { ...info("/reopened", 0), id: sessionID },
      transcript: [],
      todos: [],
      usage: null
    }),
    closeSession: async () => {},
    readFile: async () => "content",
    listDir: async () => [],
    ...overrides
  } as OpenShellApi;
}

describe("per-panel workspace selection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    messageHandler = null;
    window.localStorage.clear();
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

  it("adds a panel from the folder picker without closing existing panels", async () => {
    const closeSession = vi.fn(async () => {});
    const picked = info("/picked", 7);
    const selectFolder = vi.fn(async () => picked);
    window.openshell = api({ closeSession, selectFolder });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));

    await act(async () => store.selectAddPanel());

    expect(closeSession).not.toHaveBeenCalled();
    expect(selectFolder).toHaveBeenCalledWith(expect.any(Number));
    expect(store.panels).toHaveLength(2);
    expect(store.panels[1].directory).toBe("/picked");
    expect(store.session?.directory).toBe("/picked");
  });

  it("swaps one panel to a picked folder and tears down only its own context", async () => {
    const closeSession = vi.fn(async () => {});
    const picked = info("/picked", 4);
    const selectFolder = vi.fn(async () => picked);
    window.openshell = api({ closeSession, selectFolder });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    await act(async () => store.addModelPanel("/two"));
    expect(store.panels).toHaveLength(2);
    const swappedWorkspace = store.panels[0].workspace;
    const untouchedWorkspace = store.panels[1].workspace;

    await act(async () => store.selectPanelDirectory(swappedWorkspace));

    expect(selectFolder).toHaveBeenCalledWith(expect.any(Number));
    expect(closeSession).toHaveBeenCalledWith(swappedWorkspace);
    expect(closeSession).not.toHaveBeenCalledWith(untouchedWorkspace);
    expect(store.panels).toHaveLength(2);
    expect(store.panels[0].directory).toBe("/picked");
    expect(store.panels[1].directory).toBe("/two");
    expect(store.session?.id).toBe(picked.id);
    expect(store.panelViews[swappedWorkspace.id]).toBeUndefined();
    expect(store.panelViews[untouchedWorkspace.id]).toBeDefined();
  });

  it("swap drops the swapped panel's per-workspace editor and tree state", async () => {
    const closeSession = vi.fn(async () => {});
    const picked = info("/picked", 4);
    window.openshell = api({
      closeSession,
      selectFolder: vi.fn(async () => picked),
      readFile: async (_workspace: unknown, path: string) => `content of ${path}`
    });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    await act(async () => store.openFile("keep.txt"));
    const first = store.panels[0];
    const oldWorkspace = first.workspace;

    await act(async () => store.selectPanelDirectory(oldWorkspace));

    expect(closeSession).toHaveBeenCalledWith(oldWorkspace);
    expect(store.panels).toHaveLength(1);
    expect(store.panels[0].directory).toBe("/picked");
    expect(store.tabs.map((tab) => tab.path)).toEqual([]);
  });

  it("changes a panel to a directory without a picker", async () => {
    const closeSession = vi.fn(async () => {});
    const openSession = vi.fn(async (directory: string, generation: number) => info(directory, generation));
    window.openshell = api({ closeSession, openSession });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    await act(async () => store.addModelPanel("/two"));
    const swappedWorkspace = store.panels[0].workspace;

    await act(async () => store.changePanelDirectory(swappedWorkspace, "/three"));

    expect(openSession).toHaveBeenCalledWith("/three", expect.any(Number));
    expect(closeSession).toHaveBeenCalledWith(swappedWorkspace);
    expect(store.panels).toHaveLength(2);
    expect(store.panels[0].directory).toBe("/three");
    expect(store.panels[1].directory).toBe("/two");
    expect(store.session?.directory).toBe("/three");
  });

  it("closes a stale swap result that completes after a full workspace replacement", async () => {
    const picked = deferred<SessionInfo>();
    const closeSession = vi.fn(async () => {});
    window.openshell = api({
      closeSession,
      selectFolder: vi.fn(() => picked.promise)
    });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    const first = store.panels[0];
    let pending!: Promise<void>;
    await act(async () => { pending = store.selectPanelDirectory(first.workspace); });
    await act(async () => store.openSession("/replacement"));
    await act(async () => picked.resolve(info("/picked", 9)));
    await act(async () => pending);

    expect(closeSession).toHaveBeenCalledWith(info("/picked", 9).workspace);
    expect(store.panels.map((panel) => panel.directory)).toEqual(["/replacement"]);
    expect(store.session?.directory).toBe("/replacement");
  });
});