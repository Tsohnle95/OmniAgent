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
    readSourceFile: async () => "source",
    listDir: async () => [],
    ...overrides
  } as OpenShellApi;
}

describe("store open-source ui-command", () => {
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

  it("opens the containing directory as a session when none is active", async () => {
    const openSession = vi.fn(async (directory: string, generation: number) => info(directory, generation));
    const readFile = vi.fn(async () => "content");
    window.openshell = api({ openSession, readFile });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    expect(store.session).toBeNull();

    await act(async () => messageHandler!({
      kind: "ui-command",
      command: "open-source",
      path: "/work/project/src/styles/main.css",
      line: 24
    }));

    expect(openSession).toHaveBeenCalledWith("/work/project/src/styles", expect.any(Number));
    expect(store.session?.directory).toBe("/work/project/src/styles");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["main.css"]);
    expect(store.activePath).toBe("main.css");
    expect(readFile).toHaveBeenCalledWith(store.session!.workspace, "main.css");
  });

  it("ignores a relative open-source path when no session is active", async () => {
    const openSession = vi.fn(async (directory: string, generation: number) => info(directory, generation));
    window.openshell = api({ openSession });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));

    await act(async () => messageHandler!({
      kind: "ui-command",
      command: "open-source",
      path: "src/styles/main.css",
      line: 24
    }));

    expect(openSession).not.toHaveBeenCalled();
    expect(store.session).toBeNull();
    expect(store.tabs).toEqual([]);
  });

  it("opens an absolute source path as a source tab when a session is active", async () => {
    const readSourceFile = vi.fn(async () => "source");
    window.openshell = api({ readSourceFile });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/work"));
    const workspace = store.session!.workspace;

    await act(async () => messageHandler!({
      kind: "ui-command",
      command: "open-source",
      path: "/outside/file.css",
      line: 3
    }));

    expect(readSourceFile).toHaveBeenCalledWith("/outside/file.css");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["/outside/file.css"]);
    expect(store.activePath).toBe("/outside/file.css");
    expect(store.session?.workspace).toBe(workspace);
  });

  it("opens a relative path as a workspace tab when a session is active", async () => {
    const readFile = vi.fn(async () => "content");
    window.openshell = api({ readFile });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/work"));

    await act(async () => messageHandler!({
      kind: "ui-command",
      command: "open-source",
      path: "src/styles/main.css",
      line: 8
    }));

    expect(readFile).toHaveBeenCalledWith(store.session!.workspace, "src/styles/main.css");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["src/styles/main.css"]);
    expect(store.tabs[0].content).toBe("content");
  });

  it("keeps the active session when opening an absolute source path", async () => {
    const openSession = vi.fn(async (directory: string, generation: number) => info(directory, generation));
    const readSourceFile = vi.fn(async () => "source");
    window.openshell = api({ openSession, readSourceFile });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/work"));
    openSession.mockClear();
    const id = store.session!.id;

    await act(async () => messageHandler!({
      kind: "ui-command",
      command: "open-source",
      path: "/work/src/main.css",
      line: 8
    }));

    expect(openSession).toHaveBeenCalledTimes(0);
    expect(store.session?.id).toBe(id);
    expect(readSourceFile).toHaveBeenCalledWith("/work/src/main.css");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["/work/src/main.css"]);
  });
});