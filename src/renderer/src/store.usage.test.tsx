import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenShellApi } from "../../preload";
import type { BackendMessage, ProviderUsageResult, SessionInfo, SessionUsage } from "@shared/types";
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

function usageFor(id: string): SessionUsage {
  return {
    cost: 1.25,
    tokens: {
      input: id.length * 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 200, write: 0 }
    }
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
      transcript: [{
        kind: "user",
        id: `user-${sessionID}`,
        text: "hello"
      }],
      todos: [],
      usage: usageFor(sessionID)
    }),
    closeSession: async () => {},
    readFile: async () => "content",
    listDir: async () => [],
    ...overrides
  } as OpenShellApi;
}

describe("store panel usage hydration", () => {
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

  it("hydrates usage and history for a model panel added via the add control", async () => {
    window.openshell = api();
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.addModelPanel("/one"));
    expect(store.sessionUsage).toEqual(usageFor(store.activeSessionID!));
    expect(store.transcript).toHaveLength(1);
    expect(store.transcript[0].kind).toBe("user");
  });

  it("hydrates usage for the replacement session when a panel swaps workspaces", async () => {
    window.openshell = api();
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.addModelPanel("/one"));
    const first = store.session!;
    await act(async () => { void store.changePanelDirectory(first.workspace, "/two"); });
    await act(async () => {});
    expect(store.panels).toHaveLength(1);
    expect(store.sessionUsage).toEqual(usageFor(store.activeSessionID!));
    expect(store.transcript).toHaveLength(1);
  });

  it("hydrates usage for the folder-picker add path", async () => {
    window.openshell = api({ selectFolder: async () => info("/picked", 7) });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.selectAddPanel());
    expect(store.activeSessionID).toBe("session-7");
    expect(store.sessionUsage).toEqual(usageFor("session-7"));
  });

  it("keeps the newest provider usage refresh when requests finish out of order", async () => {
    let resolveFirst!: (value: ProviderUsageResult[]) => void;
    let resolveSecond!: (value: ProviderUsageResult[]) => void;
    const providerUsage = vi.fn()
      .mockImplementationOnce(() => new Promise<ProviderUsageResult[]>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<ProviderUsageResult[]>((resolve) => { resolveSecond = resolve; }));
    window.openshell = api({ providerUsage });
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = store.refreshProviderUsage();
      second = store.refreshProviderUsage();
    });
    const current = [{ provider: "openai", displayName: "OpenAI", status: "ok", snapshot: null }] satisfies ProviderUsageResult[];
    const stale = [{ provider: "anthropic", displayName: "Claude", status: "ok", snapshot: null }] satisfies ProviderUsageResult[];
    await act(async () => {
      resolveSecond(current);
      await second;
      resolveFirst(stale);
      await first;
    });

    expect(store.providerUsage).toEqual(current);
    expect(store.providerUsageLoading).toBe(false);
  });
});
