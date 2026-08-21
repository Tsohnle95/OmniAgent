import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@shared/types";

let currentSession: SessionInfo;
const selectPanelDirectoryMock = vi.fn(async () => {});

vi.mock("../store", () => ({
  useStore: () => ({
    session: currentSession,
    approvalMode: "ask",
    toggleApprovalMode: vi.fn(),
    models: [],
    currentModel: null,
    switchModel: vi.fn(),
    agents: [],
    currentAgent: null,
    switchAgent: vi.fn(),
    loadAgents: vi.fn(),
    loadModels: vi.fn(),
    sendPrompt: vi.fn(),
    runCommand: vi.fn(),
    stop: vi.fn(),
    busy: false,
    sessions: [],
    reopenSession: vi.fn(),
    providerUsage: [],
    providerUsageLoading: false,
    refreshProviderUsage: vi.fn(),
    selectPanelDirectory: selectPanelDirectoryMock
  }),
  usePanel: () => ({
    session: currentSession,
    busy: false,
    transcript: [],
    todos: [],
    sessionUsage: null,
    models: [],
    currentModel: null,
    agents: [],
    currentAgent: null
  })
}));

import { AgentPanel, Composer } from "./AgentPanel";

function session(id: string, generation: number): SessionInfo {
  return {
    id,
    directory: `/workspace-${generation}`,
    workspace: { id: `${generation}1111111-1111-4111-8111-111111111111`, generation }
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("composer workspace continuations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    currentSession = session("one", 1);
    selectPanelDirectoryMock.mockClear();
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

  it("changes the panel's workspace from the header folder control", async () => {
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    const folder = container.querySelector<HTMLButtonElement>('button[aria-label="Change workspace"]')!;
    expect(folder).not.toBeNull();
    await act(async () => folder.click());

    expect(selectPanelDirectoryMock).toHaveBeenCalledWith(currentSession.workspace);
  });

  it("discards slash completions returned after a workspace switch", async () => {
    const commands = deferred<{ name: string; description?: string }[]>();
    window.openshell = {
      commands: vi.fn(() => commands.promise)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const input = container.querySelector("textarea")!;
    await act(async () => {
      input.value = "/";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    currentSession = session("two", 2);
    await act(async () => root.render(<Composer />));
    await act(async () => commands.resolve([{ name: "old-command" }]));

    expect(container.querySelector(".composer-completions")).toBeNull();
  });

  it("does not append picker files selected for an old workspace", async () => {
    const files = deferred<string[]>();
    window.openshell = {
      selectFiles: vi.fn(() => files.promise)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const plus = container.querySelector<HTMLButtonElement>('button[title="Add attachments"]')!;
    await act(async () => plus.click());
    const attach = container.querySelector<HTMLButtonElement>('button[title="Attach files"]')!;
    await act(async () => attach.click());

    currentSession = session("two", 2);
    await act(async () => root.render(<Composer />));
    await act(async () => files.resolve(["/workspace-1/old.txt"]));

    expect(container.querySelector(".composer-attachment")).toBeNull();
  });

  it("adds image picker selections from the plus menu", async () => {
    window.openshell = {
      selectImages: vi.fn(async () => ["/tmp/shot.png"]),
      readImagePreview: vi.fn(async () => null)
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const plus = container.querySelector<HTMLButtonElement>('button[title="Add attachments"]')!;
    await act(async () => plus.click());
    const upload = container.querySelector<HTMLButtonElement>('button[title="Upload images"]')!;
    expect(upload).not.toBeNull();
    await act(async () => upload.click());

    expect(window.openshell.selectImages).toHaveBeenCalled();
    expect(container.querySelector(".composer-attachment")).not.toBeNull();
  });

  it("attaches dropped images and shows a thumbnail preview", async () => {
    window.openshell = {
      getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? ""),
      readImagePreview: vi.fn(async () => "data:image/png;base64,AAA")
    } as unknown as Window["openshell"];
    await act(async () => root.render(<Composer />));
    const composer = container.querySelector(".composer")!;
    const drop = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, "dataTransfer", {
      value: { types: ["Files"], items: [], files: [{ path: "/tmp/pic.png" }] }
    });
    await act(async () => composer.dispatchEvent(drop));

    expect(container.querySelector(".composer-attachment")).not.toBeNull();
    const thumb = container.querySelector<HTMLImageElement>(".composer-attachment-thumb");
    expect(thumb).not.toBeNull();
    expect(thumb!.src).toBe("data:image/png;base64,AAA");
  });
});
