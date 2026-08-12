import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenShellApi } from "../../preload";
import type { BackendMessage, RecoveryRecord, SessionInfo } from "@shared/types";
import { StoreProvider, useStore } from "./store";

type Store = ReturnType<typeof useStore>;

let store: Store;
let messageHandler: ((message: BackendMessage) => void) | null;

function Probe(): ReactNode {
  store = useStore();
  return null;
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value?: T) => void } {
  let resolve!: (value?: T) => void;
  const promise = new Promise<T>((done) => { resolve = done as (value?: T) => void; });
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
    models: async () => [],
    modelDefault: async () => null,
    sessionSelection: async () => null,
    agents: async () => [],
    sessions: async () => [],
    openSession: async (directory, generation) => info(directory, generation),
    readFile: async () => "content",
    listDir: async () => [],
    ...overrides
  } as OpenShellApi;
}

describe("store workspace continuations", () => {
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

  it("does not apply a completed delete to tabs opened in a newer workspace", async () => {
    const deletion = deferred();
    window.openshell = api({ deletePath: vi.fn(() => deletion.promise) });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    await act(async () => store.openFile("same.txt"));
    let pending!: Promise<void>;
    await act(async () => { pending = store.deleteEntry("same.txt"); });
    await act(async () => store.openSession("/two"));
    await act(async () => store.openFile("same.txt"));
    await act(async () => deletion.resolve());
    await act(async () => pending);

    expect(store.session?.directory).toBe("/two");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["same.txt"]);
  });

  it("does not open a file created by a completed old-workspace operation", async () => {
    const creation = deferred();
    window.openshell = api({ createFile: vi.fn(() => creation.promise) });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    act(() => store.startCreate("", "file"));
    let pending!: Promise<void>;
    await act(async () => { pending = store.commitName("old.txt"); });
    await act(async () => store.openSession("/two"));
    await act(async () => creation.resolve());
    await act(async () => pending);

    expect(store.session?.directory).toBe("/two");
    expect(store.tabs).toEqual([]);
  });

  it("does not apply a completed rename to tabs opened in a newer workspace", async () => {
    const rename = deferred();
    window.openshell = api({ renamePath: vi.fn(() => rename.promise) });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));
    await act(async () => store.openFile("same.txt"));
    act(() => store.startRename("same.txt"));
    let pending!: Promise<void>;
    await act(async () => { pending = store.commitName("renamed.txt"); });
    await act(async () => store.openSession("/two"));
    await act(async () => store.openFile("same.txt"));
    await act(async () => rename.resolve());
    await act(async () => pending);

    expect(store.session?.directory).toBe("/two");
    expect(store.tabs.map((tab) => tab.path)).toEqual(["same.txt"]);
  });

  it("does not let startup restoration reopen over a user activation", async () => {
    const startup = deferred<SessionInfo | null>();
    const openSessionById = vi.fn();
    window.openshell = api({ state: () => startup.promise, openSessionById });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/chosen"));
    await act(async () => startup.resolve(info("/restored", 1)));

    expect(openSessionById).not.toHaveBeenCalled();
    expect(store.session?.directory).toBe("/chosen");
  });

  it("does not apply an older reopen completion after a newer reopen", async () => {
    const older = deferred<Awaited<ReturnType<NonNullable<OpenShellApi["openSessionById"]>>>>();
    const newer = deferred<Awaited<ReturnType<NonNullable<OpenShellApi["openSessionById"]>>>>();
    const openSessionById = vi.fn((id: string) => id === "older" ? older.promise : newer.promise);
    window.openshell = api({ openSessionById });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    let olderPending!: Promise<void>;
    let newerPending!: Promise<void>;
    await act(async () => { olderPending = store.reopenSession("older"); });
    await act(async () => { newerPending = store.reopenSession("newer"); });
    await act(async () => newer.resolve({ session: info("/newer", 2), transcript: [], todos: [], usage: null }));
    await act(async () => newerPending);
    await act(async () => older.resolve({ session: info("/older", 1), transcript: [], todos: [], usage: null }));
    await act(async () => olderPending);

    expect(store.session?.directory).toBe("/newer");
  });

  it("loads, opens, acknowledges, and identity-gates recovery records", async () => {
    const record: RecoveryRecord = {
      id: "1786533818724-e85066e0-7d22-4d91-b476-ba097731f371:original",
      artifact: "original",
      originalPath: "save.txt",
      recoveryPath: ".openshell-recovery/id/original",
      createdAt: 1,
      acknowledged: false,
      reason: "saved"
    };
    const recoveryRecords = vi.fn(async () => [record]);
    const openRecovery = vi.fn(async () => {});
    const acknowledgeRecovery = vi.fn(async () => {});
    window.openshell = api({ recoveryRecords, openRecovery, acknowledgeRecovery });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.openSession("/one"));

    expect(store.recoveryRecords).toEqual([record]);
    await act(async () => store.openRecovery(record.id));
    await act(async () => store.acknowledgeRecovery(record.id));
    expect(openRecovery).toHaveBeenCalledWith(store.session!.workspace, record.id);
    expect(acknowledgeRecovery).toHaveBeenCalledWith(store.session!.workspace, record.id);
  });
});
