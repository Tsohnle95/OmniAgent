// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
  shell: { trashItem: vi.fn() }
}));
vi.mock("@opencode-ai/client", () => ({ OpenCode: { make: vi.fn() } }));
vi.mock("@opencode-ai/client/service", () => ({ Service: {} }));

import { OpenShellBackend, type SessionContext } from "./opencode";
import type { WorkspaceIdentity } from "@shared/types";
import { LatestGeneration } from "@shared/generation";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function install(
  backend: OpenShellBackend,
  workspace: WorkspaceIdentity,
  directory: string,
  client?: unknown
): void {
  const state = backend as unknown as {
    client: unknown;
    contexts: Map<string, SessionContext>;
    primary: string | null;
  };
  if (client) state.client = client;
  const watchContext = {
    root: directory,
    sessionID: `session-${workspace.generation}`,
    workspace,
    snapshots: new Map(),
    lastKnown: new Map(),
    hasGit: null as boolean | null,
    timers: new Map()
  };
  state.contexts = new Map([[workspace.id, {
    workspace,
    sessionID: `session-${workspace.generation}`,
    directory,
    sessionInfo: { id: `session-${workspace.generation}`, directory, workspace },
    watchContext,
    watcher: null,
    activations: new LatestGeneration()
  }]]);
  state.primary = workspace.id;
}

describe("workspace-scoped backend queries", () => {
  it("rejects command results after activation instead of combining old calls with new state", async () => {
    const commands = deferred<unknown[]>();
    const skills = deferred<unknown[]>();
    const client = {
      command: { list: vi.fn(() => commands.promise) },
      skill: { list: vi.fn(() => skills.promise) }
    };
    const backend = new OpenShellBackend();
    const first = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
    install(backend, first, "/workspace-one", client);
    const pending = backend.listCommands(first);
    install(backend, { id: "22222222-2222-4222-8222-222222222222", generation: 2 }, "/workspace-two");
    commands.resolve([{ name: "old-command" }]);
    skills.resolve([{ name: "old-skill" }]);

    await expect(pending).rejects.toThrow("stale workspace");
    expect(client.command.list).toHaveBeenCalledWith({ location: { directory: "/workspace-one" } });
    expect(client.skill.list).toHaveBeenCalledWith({ location: { directory: "/workspace-one" } });
  });

  it("builds file references from the captured root and rejects them after activation", async () => {
    const files = deferred<unknown[]>();
    const client = { file: { find: vi.fn(() => files.promise) } };
    const backend = new OpenShellBackend();
    const first = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
    install(backend, first, "/workspace-one", client);
    const pending = backend.searchFiles(first, "old");
    install(backend, { id: "22222222-2222-4222-8222-222222222222", generation: 2 }, "/workspace-two");
    files.resolve([{ path: "src/old.ts" }]);

    await expect(pending).rejects.toThrow("stale workspace");
    expect(client.file.find).toHaveBeenCalledWith({
      location: { directory: "/workspace-one" },
      query: "old",
      type: "file"
    });
  });

  it("excludes recovery artifacts from file references", async () => {
    const client = { file: { find: vi.fn(async () => [
      { path: "src/visible.ts" },
      { path: ".openshell-recovery/transaction/original" }
    ]) } };
    const backend = new OpenShellBackend();
    install(backend, { id: "11111111-1111-4111-8111-111111111111", generation: 1 }, "/workspace", client);

    expect(await backend.searchFiles({ id: "11111111-1111-4111-8111-111111111111", generation: 1 }, "visible")).toEqual([{
      name: "visible.ts",
      path: "/workspace/src/visible.ts",
      rel: "src/visible.ts"
    }]);
  });
});

describe("built-in commands and prompt files", () => {
  it("lists the built-in compact command alongside project commands and skills", async () => {
    const client = {
      command: { list: vi.fn(async () => [{ name: "project-cmd", description: "Runs a thing" }]) },
      skill: { list: vi.fn(async () => [{ name: "project-skill" }]) }
    };
    const backend = new OpenShellBackend();
    install(backend, { id: "11111111-1111-4111-8111-111111111111", generation: 1 }, "/workspace", client);

    expect(await backend.listCommands({ id: "11111111-1111-4111-8111-111111111111", generation: 1 })).toEqual([
      { name: "compact", description: "Summarize the session to free up context", kind: "command" },
      { name: "project-cmd", description: "Runs a thing", kind: "command" },
      { name: "project-skill", kind: "skill" }
    ]);
  });

  it("routes the compact built-in to session.compact without a command or skill call", async () => {
    const client = {
      session: {
        compact: vi.fn(async () => ({ data: {} })),
        command: vi.fn(),
        skill: vi.fn()
      },
      skill: { list: vi.fn(async () => []) }
    };
    const backend = new OpenShellBackend();
    const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
    install(backend, workspace, "/workspace", client);

    await backend.runCommand(workspace, "compact");

    expect(client.session.compact).toHaveBeenCalledWith({ sessionID: "session-1" });
    expect(client.session.command).not.toHaveBeenCalled();
    expect(client.session.skill).not.toHaveBeenCalled();
  });

  it("rejects a built-in compaction after workspace activation", async () => {
    const compact = deferred<unknown>();
    const client = { session: { compact: vi.fn(() => compact.promise) } };
    const backend = new OpenShellBackend();
    const first = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
    install(backend, first, "/workspace-one", client);
    const pending = backend.runCommand(first, "compact");
    install(backend, { id: "22222222-2222-4222-8222-222222222222", generation: 2 }, "/workspace-two");
    compact.resolve({ data: {} });

    await expect(pending).rejects.toThrow("stale workspace");
    expect(client.session.compact).toHaveBeenCalledWith({ sessionID: "session-1" });
  });

  it("forwards prompt files with uri and mention span to the session prompt call", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "openshell-prompt-"));
    const file = path.join(directory, "src", "foo.ts");
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(file, "export const foo = 1;\n");
    const client = { session: { prompt: vi.fn(async () => ({ data: {} })) } };
    const backend = new OpenShellBackend();
    const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
    install(backend, workspace, directory, client);

    await backend.prompt(workspace, "explain @src/foo.ts", [
      { path: file, mention: { start: 8, end: 19, text: "@src/foo.ts" } }
    ]);

    expect(client.session.prompt).toHaveBeenCalledWith({
      sessionID: "session-1",
      text: "explain @src/foo.ts",
      files: [{
        uri: pathToFileURL(file).toString(),
        name: "foo.ts",
        mention: { start: 8, end: 19, text: "@src/foo.ts" }
      }]
    });
  });
});
