// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
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

async function backendFixture(
  mutationPhase?: ConstructorParameters<typeof OpenShellBackend>[0]
): Promise<{
  backend: OpenShellBackend;
  root: string;
  messages: BackendMessage[];
}> {
  const root = await mkdtemp(path.join(tmpdir(), "openshell-mutation-"));
  roots.push(root);
  const backend = new OpenShellBackend(mutationPhase);
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

const writeIdentity = (expectedContent: string) => ({
  id: "save-1",
  workspaceID: workspace.id,
  revision: 1,
  expectedContent,
  overwrite: false
});

async function recoveryContents(root: string): Promise<string[]> {
  const names = (await readdir(root)).filter((name) => name.includes(".openshell-"));
  return Promise.all(names.map((name) => readFile(path.join(root, name), "utf8")));
}

describe("direct mutation observed changes", () => {
  it("rejects a change before the source is held and restores the changed source", async () => {
    const { backend, root } = await backendFixture(async (phase, source) => {
      if (phase === "save:temporary-ready") await writeFile(source, "external-before-hold");
    });
    await writeFile(path.join(root, "save.txt"), "expected");

    await expect(backend.writeFile(workspace, "save.txt", "editor", writeIdentity("expected")))
      .rejects.toThrow("file changed on disk");

    expect(await readFile(path.join(root, "save.txt"), "utf8")).toBe("external-before-hold");
    expect(await recoveryContents(root)).toEqual([]);
  });

  it("preserves held, proposed, and concurrently recreated files after the hold", async () => {
    const { backend, root } = await backendFixture(async (phase, _holding, target) => {
      if (phase === "save:source-held") await writeFile(target, "external-after-hold", { flag: "wx" });
    });
    await writeFile(path.join(root, "save.txt"), "expected");

    await expect(backend.writeFile(workspace, "save.txt", "editor", writeIdentity("expected")))
      .rejects.toThrow("recovery files preserved");

    expect(await readFile(path.join(root, "save.txt"), "utf8")).toBe("external-after-hold");
    expect((await recoveryContents(root)).sort()).toEqual(["editor", "expected"]);
  });

  it("preserves held, proposed, and concurrently recreated files after validation", async () => {
    const { backend, root } = await backendFixture(async (phase, _holding, target) => {
      if (phase === "save:held-validated") await writeFile(target, "external-after-validation", { flag: "wx" });
    });
    await writeFile(path.join(root, "save.txt"), "expected");

    await expect(backend.writeFile(workspace, "save.txt", "editor", writeIdentity("expected")))
      .rejects.toThrow("recovery files preserved");

    expect(await readFile(path.join(root, "save.txt"), "utf8")).toBe("external-after-validation");
    expect((await recoveryContents(root)).sort()).toEqual(["editor", "expected"]);
  });

  it("does not overwrite a target recreated after installation", async () => {
    const { backend, root } = await backendFixture(async (phase, _temporary, target) => {
      if (phase === "save:target-installed") {
        await unlink(target);
        await writeFile(target, "external-after-install", { flag: "wx" });
      }
    });
    await writeFile(path.join(root, "save.txt"), "expected");

    await expect(backend.writeFile(workspace, "save.txt", "editor", writeIdentity("expected")))
      .rejects.toThrow("recovery files preserved");

    expect(await readFile(path.join(root, "save.txt"), "utf8")).toBe("external-after-install");
    expect((await recoveryContents(root)).sort()).toEqual(["editor", "expected"]);
  });

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

  it("rejects an occupied file destination and preserves both files", async () => {
    const { backend, root, messages } = await backendFixture();
    await writeFile(path.join(root, "source.txt"), "source");
    await writeFile(path.join(root, "target.txt"), "target");

    await expect(backend.renamePath(workspace, "source.txt", "target.txt"))
      .rejects.toThrow("destination already exists: target.txt");

    expect(await readFile(path.join(root, "source.txt"), "utf8")).toBe("source");
    expect(await readFile(path.join(root, "target.txt"), "utf8")).toBe("target");
    expect(messages).toEqual([]);
  });

  it("rejects an occupied directory destination and preserves both trees", async () => {
    const { backend, root, messages } = await backendFixture();
    await mkdir(path.join(root, "source"));
    await mkdir(path.join(root, "target"));
    await writeFile(path.join(root, "source", "value.txt"), "source");
    await writeFile(path.join(root, "target", "value.txt"), "target");

    await expect(backend.renamePath(workspace, "source", "target"))
      .rejects.toThrow("destination already exists: target");

    expect(await readFile(path.join(root, "source", "value.txt"), "utf8")).toBe("source");
    expect(await readFile(path.join(root, "target", "value.txt"), "utf8")).toBe("target");
    expect(messages).toEqual([]);
  });

  it("rejects directory rename after a late source mutation and preserves the tree", async () => {
    const { backend, root, messages } = await backendFixture(async (phase, source) => {
      if (phase === "rename:source-inspected") {
        await writeFile(path.join(source, "late.txt"), "late mutation");
      }
    });
    await mkdir(path.join(root, "source"));
    await writeFile(path.join(root, "source", "value.txt"), "source");

    await expect(backend.renamePath(workspace, "source", "target"))
      .rejects.toThrow("safe no-replace directory rename is unavailable");

    expect(await readFile(path.join(root, "source", "value.txt"), "utf8")).toBe("source");
    expect(await readFile(path.join(root, "source", "late.txt"), "utf8")).toBe("late mutation");
    await expect(readFile(path.join(root, "target", "value.txt"), "utf8")).rejects.toThrow();
    expect(messages).toEqual([]);
  });

  it("preserves data concurrently created in the directory destination reservation", async () => {
    const { backend, root, messages } = await backendFixture(async (phase, _source, target) => {
      if (phase === "rename:target-created") {
        await writeFile(path.join(target, "concurrent.txt"), "concurrent target");
      }
    });
    await mkdir(path.join(root, "source"));
    await writeFile(path.join(root, "source", "value.txt"), "source");

    await expect(backend.renamePath(workspace, "source", "target")).rejects.toThrow();

    expect(await readFile(path.join(root, "source", "value.txt"), "utf8")).toBe("source");
    expect(await readFile(path.join(root, "target", "concurrent.txt"), "utf8")).toBe("concurrent target");
    expect(messages).toEqual([]);
  });

  it("routes global filesystem events only to their matching active workspace", async () => {
    const { backend, root, messages } = await backendFixture();
    const other = await mkdtemp(path.join(tmpdir(), "openshell-other-"));
    roots.push(other);
    await writeFile(path.join(root, "active.txt"), "active");
    await writeFile(path.join(other, "foreign.txt"), "foreign");
    const handle = (backend as unknown as {
      handleServerEvent: (
        type: string,
        data: unknown,
        location?: { directory?: string }
      ) => Promise<void>;
    }).handleServerEvent.bind(backend);

    await handle("filesystem.changed", { file: "foreign.txt", event: "change" }, { directory: other });
    await handle("filesystem.changed", { file: "active.txt", event: "change" }, { directory: root });
    await handle("filesystem.changed", { file: "active.txt", event: "change" });

    expect(messages.map((message) => message.kind === "file-update" ? message.file?.path : null))
      .toEqual(["active.txt"]);
  });
});
