import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelOption, SessionInfo, SessionUsage } from "@shared/types";

let currentSession: SessionInfo;
let currentUsage: SessionUsage | null;
let currentModel: ModelOption | null;

vi.mock("../store", () => ({
  useStore: () => ({
    busy: false,
    todos: [],
    transcript: [],
    session: currentSession,
    sessions: [],
    reopenSession: vi.fn(),
    sessionUsage: currentUsage,
    currentModel,
    models: [],
    switchModel: vi.fn(),
    agents: [],
    currentAgent: null,
    switchAgent: vi.fn(),
    loadAgents: vi.fn(),
    loadModels: vi.fn(),
    sendPrompt: vi.fn(),
    runCommand: vi.fn(),
    stop: vi.fn(),
    approvalMode: "ask",
    toggleApprovalMode: vi.fn(),
    providerUsage: [],
    providerUsageLoading: false,
    refreshProviderUsage: vi.fn()
  })
}));

import { AgentPanel } from "./AgentPanel";

function session(id: string, generation: number): SessionInfo {
  return {
    id,
    directory: `/workspace-${generation}`,
    workspace: { id: `${generation}1111111-1111-4111-8111-111111111111`, generation }
  };
}

function usage(input: number): SessionUsage {
  return {
    cost: 0,
    tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  };
}

function model(context: number): ModelOption {
  return { id: "m", providerID: "p", name: "Model", limit: { context } };
}

function toggle(container: HTMLDivElement): HTMLButtonElement {
  return container.querySelector(".agent-usage-toggle")!;
}

function fillArc(container: HTMLDivElement): SVGCircleElement | null {
  return container.querySelector(".agent-usage-toggle .agent-usage-glyph circle[stroke-dasharray]");
}

describe("agent panel usage tracker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    currentSession = session("one", 1);
    currentUsage = usage(0);
    currentModel = model(100_000);
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

  it("colors the toggle glyph green when context fill is low", async () => {
    currentUsage = usage(10_000);
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));

    expect(toggle(container).classList.contains("ok")).toBe(true);
    expect(toggle(container).classList.contains("warn")).toBe(false);
    expect(toggle(container).classList.contains("danger")).toBe(false);
    expect(fillArc(container)?.getAttribute("stroke-dasharray")).toMatch(/^4\.0/);
  });

  it("colors the toggle glyph amber at 60% and red at 85% fill", async () => {
    currentUsage = usage(60_000);
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    expect(toggle(container).classList.contains("warn")).toBe(true);
    expect(toggle(container).classList.contains("danger")).toBe(false);

    currentUsage = usage(85_000);
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    expect(toggle(container).classList.contains("danger")).toBe(true);
    expect(toggle(container).classList.contains("warn")).toBe(false);
  });

  it("shows context-window utilization with a fill bar, percent, and token counts", async () => {
    currentUsage = usage(25_000);
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    await act(async () => toggle(container).click());

    const context = container.querySelector(".agent-usage-context")!;
    expect(context.querySelector(".agent-usage-context-percent")!.textContent).toBe("25%");
    expect(context.querySelector(".agent-usage-context-fill")!.getAttribute("style")).toContain("width: 25%");
    expect(context.querySelector(".agent-usage-context-fill")!.classList.contains("ok")).toBe(true);
    expect(context.querySelector(".agent-usage-context-counts")!.textContent).toContain("25.0k");
    expect(context.querySelector(".agent-usage-context-counts")!.textContent).toContain("100k tokens");
    expect(container.querySelector(".agent-usage-rows")).not.toBeNull();
  });

  it("caps the fill at 100% when input tokens exceed the context limit", async () => {
    currentUsage = usage(150_000);
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    await act(async () => toggle(container).click());

    const context = container.querySelector(".agent-usage-context")!;
    expect(context.querySelector(".agent-usage-context-percent")!.textContent).toBe("100%");
    expect(context.querySelector(".agent-usage-context-fill")!.getAttribute("style")).toContain("width: 100%");
    expect(context.querySelector(".agent-usage-context-fill")!.classList.contains("danger")).toBe(true);
    expect(fillArc(container)?.getAttribute("stroke-dasharray")).toMatch(/^40\.2/);
  });

  it("hides the context row and stays neutral when the model has no context limit", async () => {
    currentUsage = usage(10_000);
    currentModel = { id: "m", providerID: "p", name: "Model" };
    await act(async () => root.render(<AgentPanel onCollapse={() => {}} />));
    await act(async () => toggle(container).click());

    expect(container.querySelector(".agent-usage-context")).toBeNull();
    expect(container.querySelector(".agent-usage-rows")).not.toBeNull();
    const classes = toggle(container).classList;
    expect(classes.contains("ok")).toBe(false);
    expect(classes.contains("warn")).toBe(false);
    expect(classes.contains("danger")).toBe(false);
    expect(classes.contains("neutral")).toBe(true);
    expect(fillArc(container)).toBeNull();
  });
});
