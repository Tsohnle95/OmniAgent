// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => tmpdir()
  },
  shell: {
    trashItem: async (target: string) => rm(target, { recursive: true })
  }
}));
vi.mock("@opencode-ai/client", () => ({
  OpenCode: { make: vi.fn() }
}));
vi.mock("@opencode-ai/client/service", () => ({
  Service: {}
}));

import { OpenShellBackend } from "./opencode";
import type { BackendMessage, FileBaseline, WorkspaceIdentity } from "@shared/types";

const roots: string[] = [];
const workspace: WorkspaceIdentity = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function backendFixture(): Promise<{
  backend: OpenShellBackend;
  root: string;
  messages: BackendMessage[];
}> {
  const root = await mkdtemp(path.join(tmpdir(), "openshell-mutation-"));
  roots.push(root);
  const backend = new OpenShellBackend();
  const context = {
    root,
    sessionID: "session",
    workspace,
    snapshots: new Map<string, FileBaseline>(),
    lastKnown: new Map<string, string>(),
    hasGit: false
  };
  const state = backend as unknown as {
    directory: string;
    sessionID: string;
    workspace: WorkspaceIdentity;
    watchContext: typeof context;
  };
  state.directory = root;
  state.sessionID = "session";
  state.workspace = workspace;
  state.watchContext = context;
  const messages: BackendMessage[] = [];
  backend.onMessage((message) => messages.push(message as BackendMessage));
  return { backend, root, messages };
}

describe("direct mutation observed changes", () => {
  it("captures and emits deletion of a file not previously tracked by the watcher", async () => {
    const { backend, root, messages } = await backendFixture();
    await writeFile(path.join(root, "delete.txt"), "before delete");

    await backend.deletePath(workspace, "delete.txt");

    expect(messages).toEqual([{
      kind: "file-update",
      file: {
        workspace,
        sessionID: "session",
        path: "delete.txt",
        baseline: { kind: "known", content: "before delete" },
        content: null,
        deleted: true
      }
    }]);
  });

  it("emits old and new paths when renaming a previously untracked file", async () => {
    const { backend, root, messages } = await backendFixture();
    await writeFile(path.join(root, "old.txt"), "before rename");

    await backend.renamePath(workspace, "old.txt", "new.txt");

    expect(await readFile(path.join(root, "new.txt"), "utf8")).toBe("before rename");
    expect(messages.map((message) => message.kind === "file-update" ? message.file : null)).toEqual([
      {
        workspace,
        sessionID: "session",
        path: "old.txt",
        baseline: { kind: "known", content: "before rename" },
        content: null,
        deleted: true
      },
      {
        workspace,
        sessionID: "session",
        path: "new.txt",
        baseline: { kind: "known", content: "before rename" },
        content: "before rename",
        deleted: false
      }
    ]);
  });
});
