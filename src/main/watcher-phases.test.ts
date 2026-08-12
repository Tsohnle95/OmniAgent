import { promises as fsp } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { FileBaseline, WorkspaceIdentity } from "@shared/types";
import { OpenShellBackend } from "./opencode";

vi.mock("@opencode-ai/client", () => ({ OpenCode: { make: vi.fn() } }));
vi.mock("@opencode-ai/client/service", () => ({ Service: {} }));
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  shell: { trashItem: vi.fn() }
}));

interface WatchContext {
  root: string;
  sessionID: string;
  workspace: WorkspaceIdentity;
  snapshots: Map<string, FileBaseline>;
  lastKnown: Map<string, string>;
  hasGit: boolean | null;
}

type BackendHarness = {
  workspace: WorkspaceIdentity | null;
  watchContext: WatchContext | null;
  onFsChanged(context: WatchContext, abs: string, event: string): Promise<void>;
  handleServerEvent(type: string, data: unknown, location?: { directory?: string }): Promise<void>;
  gitShow(context: WatchContext, rel: string): Promise<string | null>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(): { backend: OpenShellBackend; internals: BackendHarness; context: WatchContext; next: WorkspaceIdentity } {
  const backend = new OpenShellBackend();
  const internals = backend as unknown as BackendHarness;
  const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
  const next = { id: "22222222-2222-4222-8222-222222222222", generation: 2 };
  const context = {
    root: "/workspace-one",
    sessionID: "session-one",
    workspace,
    snapshots: new Map<string, FileBaseline>(),
    lastKnown: new Map<string, string>(),
    hasGit: true
  };
  internals.workspace = workspace;
  internals.watchContext = context;
  return { backend, internals, context, next };
}

describe("backend watcher generation phases", () => {
  it("drops routed filesystem work when generation changes during stat", async () => {
    const { backend, internals, context, next } = harness();
    const stat = deferred<Awaited<ReturnType<typeof fsp.stat>>>();
    vi.spyOn(fsp, "stat").mockReturnValueOnce(stat.promise);
    const messages: unknown[] = [];
    backend.onMessage((message) => messages.push(message));

    const pending = internals.handleServerEvent("filesystem.changed", { file: "file.txt", event: "change" }, { directory: context.root });
    internals.workspace = next;
    stat.resolve({ isFile: () => true } as Awaited<ReturnType<typeof fsp.stat>>);
    await pending;

    expect(messages).toEqual([]);
    expect(context.lastKnown.size).toBe(0);
  });

  it("drops work when generation changes during read", async () => {
    const { backend, internals, context, next } = harness();
    vi.spyOn(fsp, "stat").mockResolvedValueOnce({ isFile: () => true } as Awaited<ReturnType<typeof fsp.stat>>);
    const read = deferred<string>();
    vi.spyOn(fsp, "readFile").mockReturnValueOnce(read.promise);
    const messages: unknown[] = [];
    backend.onMessage((message) => messages.push(message));

    const pending = internals.onFsChanged(context, `${context.root}/file.txt`, "change");
    await Promise.resolve();
    internals.workspace = next;
    read.resolve("new content");
    await pending;

    expect(messages).toEqual([]);
    expect(context.lastKnown.size).toBe(0);
  });

  it("drops mutation and emission when generation changes during Git baseline lookup", async () => {
    const { backend, internals, context, next } = harness();
    vi.spyOn(fsp, "stat").mockResolvedValueOnce({ isFile: () => true } as Awaited<ReturnType<typeof fsp.stat>>);
    vi.spyOn(fsp, "readFile").mockResolvedValueOnce("new content");
    const git = deferred<string | null>();
    vi.spyOn(internals, "gitShow").mockReturnValueOnce(git.promise);
    const messages: unknown[] = [];
    backend.onMessage((message) => messages.push(message));

    const pending = internals.onFsChanged(context, `${context.root}/file.txt`, "change");
    await Promise.resolve();
    await Promise.resolve();
    internals.workspace = next;
    git.resolve("old content");
    await pending;

    expect(messages).toEqual([]);
    expect(context.snapshots.size).toBe(0);
  });

  it("drops deletion handling when generation changes during Git lookup", async () => {
    const { backend, internals, context, next } = harness();
    vi.spyOn(fsp, "stat").mockRejectedValueOnce(new Error("missing"));
    const git = deferred<string | null>();
    vi.spyOn(internals, "gitShow").mockReturnValueOnce(git.promise);
    const messages: unknown[] = [];
    backend.onMessage((message) => messages.push(message));

    const pending = internals.onFsChanged(context, `${context.root}/deleted.txt`, "unlink");
    await Promise.resolve();
    internals.workspace = next;
    git.resolve("old content");
    await pending;

    expect(messages).toEqual([]);
    expect(context.snapshots.size).toBe(0);
  });
});
