import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptItem } from "@shared/types";
import { OpenCodeTimeline } from "./OpenCodeTimeline";

vi.mock("../store", () => ({
  useStore: () => ({
    agents: [],
    sessions: [],
    session: null,
    reopenSession: vi.fn(),
    openFile: vi.fn(),
    replyPermission: vi.fn()
  })
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assistant = (id: string): TranscriptItem => ({
  kind: "assistant",
  id,
  messageID: id,
  completed: true,
  parts: [{ kind: "text", id: `${id}:text`, text: id, complete: true }]
});

const events: Array<[string, TranscriptItem, string]> = [
  ["shell", { kind: "shell", id: "event", shellID: "shell", command: "pwd", status: "exited", exit: 0 }, "ShellMessage"],
  ["compaction", { kind: "compaction", id: "event", status: "completed", reason: "auto", summary: "summary" }, "Compaction"],
  ["synthetic", { kind: "synthetic", id: "event", text: "visible synthetic" }, "SessionEvent"],
  ["skill", { kind: "skill", id: "event", skill: "review", name: "Review", text: "loaded" }, "SessionEvent"],
  ["status", { kind: "status", id: "event", text: "working", tone: "info" }, "Error"],
  ["divider", { kind: "divider", id: "event" }, "TurnDivider"]
];

describe("OpenCodeTimeline chronology", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(events)("keeps an interleaved %s event between assistant runs", (_name, event, row) => {
    act(() => root.render(
      <OpenCodeTimeline transcript={[assistant("before"), event, assistant("after")]} busy={false} lastAssistantId={null} />
    ));

    expect([...container.querySelectorAll("[data-timeline-row]")].map((node) => node.getAttribute("data-timeline-row")))
      .toEqual(["AssistantPart", row, "AssistantPart"]);
  });

  it("groups only contiguous assistant messages", () => {
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[assistant("one"), assistant("two"), events[4][1], assistant("three"), assistant("four")]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    expect([...container.querySelectorAll("[data-timeline-row]")].map((node) => node.textContent))
      .toEqual(["one", "two", "working", "three", "four"]);
  });
});
