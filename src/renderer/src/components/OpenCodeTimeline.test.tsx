import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, SessionSummary, TranscriptItem } from "@shared/types";
import { OpenCodeTimeline } from "./OpenCodeTimeline";

const storeState = vi.hoisted(() => ({
  agents: [] as { id: string; name: string }[],
  sessions: [] as SessionSummary[],
  session: null as SessionInfo | null,
  reopenSession: vi.fn(),
  openFile: vi.fn(),
  replyPermission: vi.fn()
}));

vi.mock("../store", () => ({
  useStore: () => storeState
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assistant = (id: string): TranscriptItem => ({
  kind: "assistant",
  id,
  messageID: id,
  completed: true,
  parts: [{ kind: "text", id: `${id}:text`, text: id, complete: true }]
});

const toolAssistant = (id: string, title: string, input: Record<string, unknown>, metadata?: Record<string, unknown>): TranscriptItem => ({
  kind: "assistant",
  id,
  messageID: id,
  completed: true,
  parts: [{
    kind: "tool",
    id: `${id}:tool`,
    tool: {
      id: `${id}:tool`,
      title,
      detail: "",
      status: "success",
      input: JSON.stringify(input),
      inputValue: input,
      ...(metadata ? { metadata } : {})
    }
  }]
});

const summary = (id: string, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id,
  title: "Untitled",
  directory: "/repo",
  updatedAt: 100,
  ...overrides
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
    storeState.agents = [];
    storeState.sessions = [];
    storeState.session = null;
    storeState.reopenSession.mockReset();
    storeState.openFile.mockReset();
    storeState.replyPermission.mockReset();
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

describe("subagent dispatch links", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storeState.agents = [{ id: "build", name: "Build" }];
    storeState.sessions = [];
    storeState.session = { id: "session-parent", directory: "/repo", workspace: { id: "workspace-1", generation: 1 } };
    storeState.reopenSession.mockReset();
    storeState.openFile.mockReset();
    storeState.replyPermission.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a task tool card that opens the resolved child session", () => {
    storeState.sessions = [summary("session-child", {
      title: "Run the tests",
      agent: "build",
      parentID: "session-parent",
      updatedAt: 200
    })];
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[toolAssistant("assistant-1", "subagent", { agent: "build", description: "Run the tests", prompt: "run them" })]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    const card = container.querySelector("[data-component='task-tool-card']");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Run the tests");
    expect(card?.textContent).toContain("@build");

    const surface = card?.querySelector("[data-component='task-tool-surface']") as HTMLButtonElement | null;
    expect(surface?.disabled).toBe(false);
    act(() => surface?.click());
    expect(storeState.reopenSession).toHaveBeenCalledWith("session-child");
  });

  it("resolves the task tool fallback by description and agent when metadata is absent", () => {
    storeState.sessions = [
      summary("session-other", { title: "Review docs", agent: "plan", parentID: "session-parent", updatedAt: 300 }),
      summary("session-child", { title: "Run the tests", agent: "build", parentID: "session-parent", updatedAt: 200 })
    ];
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[toolAssistant("assistant-1", "task", { subagent_type: "build", description: "Run the tests" })]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    const surface = container.querySelector("[data-component='task-tool-surface']") as HTMLButtonElement | null;
    expect(surface?.disabled).toBe(false);
    act(() => surface?.click());
    expect(storeState.reopenSession).toHaveBeenCalledWith("session-child");
  });

  it("disables the task tool card when no child session resolves", () => {
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[toolAssistant("assistant-1", "subagent", { agent: "build", description: "Run the tests" })]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    const surface = container.querySelector("[data-component='task-tool-surface']") as HTMLButtonElement | null;
    expect(surface?.disabled).toBe(true);
  });

  it("turns a subagent synthetic tag into a clickable link to the child session", () => {
    storeState.sessions = [summary("session-child", {
      title: "Run the tests",
      agent: "build",
      parentID: "session-parent",
      updatedAt: 200
    })];
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[{
          kind: "synthetic",
          id: "synthetic-1",
          text: '<subagent id="session-child" state="completed" description="Run the tests">\n</subagent>',
          description: "Run the tests"
        }]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    expect(container.textContent).not.toContain("<subagent");
    const card = container.querySelector("[data-component='subagent-link-card']");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-state")).toBe("completed");
    expect(card?.textContent).toContain("Run the tests");
    expect(card?.textContent).toContain("@build");

    const surface = card?.querySelector("[data-component='subagent-link-surface']") as HTMLButtonElement | null;
    expect(surface?.disabled).toBe(false);
    act(() => surface?.click());
    expect(storeState.reopenSession).toHaveBeenCalledWith("session-child");
  });

  it("opens the child by id from a subagent synthetic tag even when the sessions list is stale", () => {
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[{
          kind: "synthetic",
          id: "synthetic-1",
          text: '<subagent id="session-child" state="running" description="Run the tests">\n</subagent>',
          description: "Run the tests"
        }]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    const surface = container.querySelector("[data-component='subagent-link-surface']") as HTMLButtonElement | null;
    expect(surface?.disabled).toBe(false);
    act(() => surface?.click());
    expect(storeState.reopenSession).toHaveBeenCalledWith("session-child");
  });

  it("collapses tool and synthetic records for one child into one descriptive card", () => {
    storeState.sessions = [summary("session-child", {
      title: "Inspect the renderer",
      agent: "build",
      parentID: "session-parent"
    })];
    const synthetic: TranscriptItem = {
      kind: "synthetic",
      id: "dispatch-child",
      text: '<subagent id="session-child" agent="build" description="Inspect the renderer" state="running" />'
    };
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[
          toolAssistant(
            "assistant-1",
            "subagent",
            { agent: "build", description: "Inspect the renderer" },
            { sessionID: "session-child" }
          ),
          synthetic
        ]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    expect(container.querySelectorAll("[data-component='task-tool-card'], [data-component='subagent-link-card']")).toHaveLength(1);
    expect(container.querySelector("[data-component='task-tool-kind']")?.textContent).toBe("Delegated agent");
    expect(container.querySelector("[data-slot='delegated-agent-content']")).not.toBeNull();
    expect(container.querySelector("[data-slot='delegated-agent-tail']")).not.toBeNull();
    expect(container.querySelector("[data-slot='task-tool-status-label']")?.textContent).toBe("Complete");
    expect(container.querySelector("[data-slot='basic-tool-tool-subtitle']")).toBeNull();
    expect(container.querySelector("[data-component='task-tool-surface']")?.getAttribute("aria-label"))
      .toBe("Open delegated agent session: Inspect the renderer");
  });

  it("keeps cards for distinct child sessions separate", () => {
    storeState.sessions = [
      summary("session-child-a", { title: "First task", parentID: "session-parent" }),
      summary("session-child-b", { title: "Second task", parentID: "session-parent" })
    ];
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[
          toolAssistant("assistant-1", "subagent", { description: "First task" }, { sessionID: "session-child-a" }),
          { kind: "synthetic", id: "dispatch-b", text: '<subagent id="session-child-b" description="Second task" state="running" />' }
        ]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    expect(container.querySelectorAll("[data-component='task-tool-card'], [data-component='subagent-link-card']")).toHaveLength(2);
  });

  it("resolves legacy agent=/prompt= synthetic input to the matching child session", () => {
    storeState.sessions = [summary("session-child", {
      title: "Run the tests",
      agent: "build",
      parentID: "session-parent",
      updatedAt: 200
    })];
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[{
          kind: "synthetic",
          id: "synthetic-1",
          text: "agent=build\nprompt=Run the test suite and report failures"
        }]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    const card = container.querySelector("[data-component='subagent-link-card']");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Run the tests");
    const surface = card?.querySelector("[data-component='subagent-link-surface']") as HTMLButtonElement | null;
    act(() => surface?.click());
    expect(storeState.reopenSession).toHaveBeenCalledWith("session-child");
  });

  it("leaves synthetic text alone when it is not a subagent dispatch", () => {
    act(() => root.render(
      <OpenCodeTimeline
        transcript={[{ kind: "synthetic", id: "synthetic-1", text: "plain system note", description: "Note" }]}
        busy={false}
        lastAssistantId={null}
      />
    ));

    expect(container.querySelector("[data-component='subagent-link-card']")).toBeNull();
    expect(container.querySelector("[data-component='session-message']")).not.toBeNull();
  });
});
