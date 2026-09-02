import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceIdentity } from "@shared/types";

const workspace: WorkspaceIdentity = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };

describe("AgentTui", () => {
  let container: HTMLDivElement;
  let root: Root;
  const start = vi.fn(async () => {});
  const onError = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    start.mockClear();
    onError.mockClear();
    window.openshell = { agentTuiStart: start } as unknown as typeof window.openshell;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens Kitty for the addressed workspace", async () => {
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onError={onError} />));

    expect(start).toHaveBeenCalledWith(workspace);
    expect(container.textContent).toContain("Agent TUI opened in Kitty");
  });

  it("can relaunch Kitty from the panel", async () => {
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onError={onError} />));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());

    expect(start).toHaveBeenCalledTimes(2);
  });

  it("reports a failed Kitty launch", async () => {
    start.mockRejectedValueOnce(new Error("Kitty could not be opened"));
    const { AgentTui } = await import("./AgentTui");
    await act(async () => root.render(<AgentTui workspace={workspace} onError={onError} />));

    expect(onError).toHaveBeenCalledWith("Kitty could not be opened");
  });
});
