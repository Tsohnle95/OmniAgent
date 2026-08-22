import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptItem } from "@shared/types";
import { OpenCodeTodoDock } from "./OpenCodeTodoDock";

describe("OpenCodeTodoDock", () => {
  const containers: HTMLDivElement[] = [];

  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));

  afterEach(() => {
    for (const container of containers) container.remove();
    containers.length = 0;
    vi.unstubAllGlobals();
  });

  it("shows structured tool activity as steps when the agent has no todo plan", () => {
    const container = document.createElement("div");
    containers.push(container);
    document.body.append(container);
    const root = createRoot(container);
    const transcript: TranscriptItem[] = [
      { kind: "user", id: "user", text: "Fix the issue" },
      {
        kind: "assistant",
        id: "assistant",
        messageID: "message",
        completed: false,
        parts: [
          { kind: "tool", id: "read", tool: { id: "read", title: "Inspect files", detail: "src", status: "success" } },
          { kind: "tool", id: "edit", tool: { id: "edit", title: "Apply changes", detail: "", status: "running" } }
        ]
      }
    ];

    act(() => root.render(<OpenCodeTodoDock todos={[]} transcript={transcript} />));

    expect(container.querySelector("[data-slot='session-todo-progress']")?.textContent).toBe("1 of 2 steps completed");
    expect([...container.querySelectorAll("[data-slot='todo-content']")].map((item) => item.textContent)).toEqual([
      "Inspect files · src",
      "Apply changes"
    ]);
    act(() => root.unmount());
  });
});
