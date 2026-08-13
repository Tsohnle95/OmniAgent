import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@shared/types";

let currentSession: SessionInfo;

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
    busy: false
  })
}));

import { Composer } from "./AgentPanel";

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
    const attach = container.querySelector<HTMLButtonElement>('button[title="Attach files"]')!;
    await act(async () => attach.click());

    currentSession = session("two", 2);
    await act(async () => root.render(<Composer />));
    await act(async () => files.resolve(["/workspace-1/old.txt"]));

    expect(container.querySelector(".composer-attachment")).toBeNull();
  });
});
