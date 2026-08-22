import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenShellApi } from "../../preload";
import type { BackendMessage, SessionInfo, SessionTranscript, TranscriptItem } from "@shared/types";
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

const staleTail: TranscriptItem[] = [
  { kind: "user", id: "user-1", text: "hello" },
  { kind: "assistant", id: "asst-1", messageID: "msg_1", parts: [], completed: false }
];

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
      transcript: staleTail,
      todos: []
    }),
    closeSession: async () => {},
    readFile: async () => "content",
    listDir: async () => [],
    listPermissions: async () => [],
    runtimes: async () => [],
    projects: async () => [],
    providerUsage: async () => null,
    ...overrides
  } as OpenShellApi;
}

describe("store stream settle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    messageHandler = null;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.openshell = api();
    await act(async () => root.render(<StoreProvider><Probe /></StoreProvider>));
    await act(async () => store.addModelPanel("/one"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks a reopened stale turn busy and settles it after the quiet window", async () => {
    expect(store.busy).toBe(true);

    await act(async () => { vi.advanceTimersByTime(61_500); });

    expect(store.busy).toBe(false);
    expect(store.transcript.some((item) => item.kind === "assistant" && item.completed)).toBe(true);
  });

  it("restores busy when stream content arrives on a settled session", async () => {
    await act(async () => { vi.advanceTimersByTime(61_500); });
    expect(store.busy).toBe(false);

    const sessionID = store.activeSessionID!;
    const message: BackendMessage = {
      kind: "event",
      type: "message.updated",
      data: {
        id: "evt-1",
        created: Date.now(),
        data: { sessionID, info: { id: "msg_2", sessionID, role: "assistant", time: { created: Date.now() } } }
      }
    };
    await act(async () => { messageHandler!(message); });

    expect(store.busy).toBe(true);

    await act(async () => { vi.advanceTimersByTime(61_500); });

    expect(store.busy).toBe(false);
  });

  it("does not restore busy when a completed message follows the idle event", async () => {
    const sessionID = store.activeSessionID!;
    const idle: BackendMessage = {
      kind: "event",
      type: "session.idle",
      data: {
        id: "idle-1",
        created: Date.now(),
        data: { sessionID }
      }
    };
    await act(async () => { messageHandler!(idle); });
    expect(store.busy).toBe(false);

    const completed: BackendMessage = {
      kind: "event",
      type: "message.updated",
      data: {
        id: "completed-1",
        created: Date.now(),
        data: {
          sessionID,
          info: {
            id: "msg_2",
            sessionID,
            role: "assistant",
            time: { created: Date.now(), completed: Date.now() },
            finish: "stop"
          }
        }
      }
    };
    await act(async () => { messageHandler!(completed); });

    expect(store.busy).toBe(false);
  });

  it("enters busy immediately on prompt submission and returns idle on its completed response", async () => {
    await act(async () => { vi.advanceTimersByTime(61_500); });
    expect(store.busy).toBe(false);

    let finishPrompt: ((value: SessionTranscript) => void) | undefined;
    window.openshell.prompt = vi.fn(() => new Promise<SessionTranscript>((resolve) => {
      finishPrompt = resolve;
    }));

    let submitted: Promise<void> | undefined;
    await act(async () => {
      submitted = store.sendPrompt("next task");
      await Promise.resolve();
    });
    expect(store.busy).toBe(true);

    await act(async () => {
      finishPrompt!({
        transcript: [
          { kind: "user", id: "remote-user", text: "next task" },
          {
            kind: "assistant",
            id: "remote-assistant",
            messageID: "remote-assistant",
            completed: true,
            parts: [{ kind: "text", id: "remote-text", text: "done", complete: true }]
          }
        ],
        todos: []
      });
      await submitted;
    });

    expect(store.busy).toBe(false);
  });
});
