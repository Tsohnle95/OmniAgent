import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@shared/types";
import type { AgentOption } from "@shared/types";

let currentSession: SessionInfo;
let currentAgents: AgentOption[];
const loadAgentsMock = vi.fn();
const loadModelsMock = vi.fn();

vi.mock("../store", () => ({
  useStore: () => ({
    session: currentSession,
    approvalMode: "ask",
    toggleApprovalMode: vi.fn(),
    models: [],
    currentModel: null,
    switchModel: vi.fn(),
    agents: currentAgents,
    currentAgent: null,
    switchAgent: vi.fn(),
    loadAgents: loadAgentsMock,
    loadModels: loadModelsMock,
    sendPrompt: vi.fn(),
    runCommand: vi.fn(),
    stop: vi.fn(),
    busy: false
  }),
  usePanel: () => ({
    session: currentSession,
    busy: false,
    transcript: [],
    todos: [],
    sessionUsage: null,
    models: [],
    currentModel: null,
    agents: currentAgents,
    currentAgent: null
  })
}));

import { Composer } from "./AgentPanel";

describe("composer agent menu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    loadAgentsMock.mockClear();
    loadModelsMock.mockClear();
    currentAgents = [];
    currentSession = {
      id: "one",
      directory: "/workspace",
      workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 }
    };
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

  it("reloads agents and shows a hint when the list is empty", async () => {
    await act(async () => root.render(<Composer />));
    const button = container.querySelector<HTMLButtonElement>('button[title="Change agent"]')!;
    await act(async () => button.click());

    expect(loadAgentsMock).toHaveBeenCalledTimes(1);
    const menu = container.querySelector(".composer-menu");
    expect(menu?.textContent).toContain("No agents available");
    expect(menu?.querySelector(".composer-menu-item")).toBeNull();
  });

  it("lists agents without reloading when they are already loaded", async () => {
    currentAgents = [
      { id: "build", name: "Build" },
      { id: "plan", name: "Plan" }
    ];
    await act(async () => root.render(<Composer />));
    const button = container.querySelector<HTMLButtonElement>('button[title="Change agent"]')!;
    await act(async () => button.click());

    expect(loadAgentsMock).not.toHaveBeenCalled();
    const items = container.querySelectorAll(".composer-menu-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Build");
    expect(items[1].textContent).toContain("Plan");
  });
});
