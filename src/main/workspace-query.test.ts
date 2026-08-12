// @vitest-environment node
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
  shell: { trashItem: vi.fn() }
}));
vi.mock("@opencode-ai/client", () => ({ OpenCode: { make: vi.fn() } }));
vi.mock("@opencode-ai/client/service", () => ({ Service: {} }));

import { OpenShellBackend } from "./opencode";
import type { WorkspaceIdentity } from "@shared/types";

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
    workspace: WorkspaceIdentity;
    directory: string;
    sessionID: string;
  };
  if (client) state.client = client;
  state.workspace = workspace;
  state.directory = directory;
  state.sessionID = `session-${workspace.generation}`;
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
    const pending = backend.listCommands();
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
    const pending = backend.searchFiles("old");
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

    expect(await backend.searchFiles("visible")).toEqual([{
      name: "visible.ts",
      path: "/workspace/src/visible.ts",
      rel: "src/visible.ts"
    }]);
  });
});
