import { describe, expect, it } from "vitest";
import { applyChatEvent, findTurnStartedAt, hydrateChatState, projectAssistantItems, type ChatDirectoryState, type ChatMessageRecord } from "./chat-store";
import type { ChatStreamEvent } from "./chat-stream";
import type { TranscriptItem } from "@shared/types";

function event(id: string, type: string, data: Record<string, unknown>): ChatStreamEvent {
  return { id, type, created: 100, data };
}

function state(): ChatDirectoryState {
  return { message: {}, part: {}, session_status: {} };
}

function record(id: string, role: string, created?: number): ChatMessageRecord {
  return { id, sessionID: "s", role, time: created === undefined ? {} : { created } };
}

describe("findTurnStartedAt", () => {
  it("returns the newest user message timestamp", () => {
    const messages = [record("u1", "user", 1000), record("a1", "assistant", 1100), record("u2", "user", 2000)];
    expect(findTurnStartedAt(messages)).toBe(2000);
  });

  it("falls back to the given assistant message when no user message exists", () => {
    const messages = [record("a1", "assistant", 1500)];
    expect(findTurnStartedAt(messages, "a1")).toBe(1500);
  });

  it("returns null when timestamps are missing or messages are absent", () => {
    expect(findTurnStartedAt(undefined)).toBeNull();
    expect(findTurnStartedAt([])).toBeNull();
    expect(findTurnStartedAt([record("u1", "user")])).toBeNull();
    expect(findTurnStartedAt([record("a1", "assistant")], "missing")).toBeNull();
  });
});

describe("applyChatEvent", () => {
  it("reports orphan materialization when a delta arrives before parts", () => {
    const result = applyChatEvent(state(), "s", event("d", "message.part.delta", {
      sessionID: "s", messageID: "msg_1", partID: "prt_1", field: "text", delta: "hello"
    }));

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID: "s", messageID: "msg_1", partID: "prt_1" }
    });
  });

  it("reports missing-part materialization when the delta part is unknown", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("u", "message.part.updated", {
      sessionID: "s",
      part: { id: "prt_2", messageID: "msg_1", sessionID: "s", type: "text", text: "" }
    }));
    const result = applyChatEvent(draft, "s", event("d", "message.part.delta", {
      sessionID: "s", messageID: "msg_1", partID: "prt_1", field: "text", delta: "hello"
    }));

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", reason: "missing-delta-part", sessionID: "s", messageID: "msg_1", partID: "prt_1" }
    });
  });

  it("requests materialization when a part update has no owning message", () => {
    const draft = state();
    const result = applyChatEvent(draft, "s", event("u", "message.part.updated", {
      sessionID: "s",
      part: { id: "prt_1", messageID: "msg_1", sessionID: "s", type: "text", text: "hello" }
    }));

    expect(draft.part.msg_1.map((part) => part.id)).toEqual(["prt_1"]);
    expect(result).toEqual({
      changed: true,
      materialization: {
        type: "incomplete-session-snapshot",
        reason: "missing-owning-message",
        sessionID: "s",
        messageID: "msg_1",
        partID: "prt_1"
      }
    });
  });

  it("applies a part update without materialization when the owning message exists", () => {
    const draft = state();
    draft.message.s = [{ id: "msg_1", sessionID: "s", role: "assistant", time: { created: 1 } }];
    const result = applyChatEvent(draft, "s", event("u", "message.part.updated", {
      sessionID: "s",
      part: { id: "prt_1", messageID: "msg_1", sessionID: "s", type: "text", text: "hello" }
    }));

    expect(draft.part.msg_1.map((part) => part.id)).toEqual(["prt_1"]);
    expect(result).toBe(true);
  });

  it("skips duplicate session status events", () => {
    const draft = state();
    const busy = event("status", "session.status", { sessionID: "s", status: { type: "busy" } });

    expect(applyChatEvent(draft, "s", busy)).toBe(true);
    expect(applyChatEvent(draft, "s", busy)).toBe(false);
  });

  it("records an errored session status as not busy and stops treating the session as running", () => {
    const draft = state();
    expect(applyChatEvent(draft, "s", event("b", "session.status", { sessionID: "s", status: { type: "busy" } }))).toBe(true);
    expect(draft.session_status.s).toEqual({ type: "busy" });

    expect(applyChatEvent(draft, "s", event("e", "session.status", { sessionID: "s", status: { type: "error" } }))).toBe(true);
    expect(draft.session_status.s).toEqual({ type: "error" });

    const again = event("e2", "session.status", { sessionID: "s", status: { type: "error" } });
    expect(applyChatEvent(draft, "s", again)).toBe(false);
  });

  it("skips unchanged message updates", () => {
    const draft = state();
    draft.message.s = [{ id: "msg_1", sessionID: "s", role: "assistant", time: { created: 1, completed: 2 } }];
    const update = event("u", "message.updated", {
      info: { id: "msg_1", sessionID: "s", role: "assistant", time: { created: 1, completed: 2 } }
    });

    expect(applyChatEvent(draft, "s", update)).toBe(false);
  });

  it("streams session text deltas into an ordered part and dedupes the ended snapshot", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("start", "session.step.started", { sessionID: "s", assistantMessageID: "msg_1" }));
    applyChatEvent(draft, "s", event("t", "session.text.started", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0 }));
    applyChatEvent(draft, "s", event("d1", "session.text.delta", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, delta: "Hello" }));
    applyChatEvent(draft, "s", event("d2", "session.text.delta", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, delta: " world" }));
    applyChatEvent(draft, "s", event("end", "session.text.ended", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, text: "Hello world" }));
    applyChatEvent(draft, "s", event("d3", "session.text.delta", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, delta: " world" }));
    applyChatEvent(draft, "s", event("se", "session.step.ended", { sessionID: "s", assistantMessageID: "msg_1" }));

    const items = projectAssistantItems(draft, "s");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "assistant",
      messageID: "msg_1",
      completed: true,
      parts: [{ kind: "text", id: "msg_1:text:0", text: "Hello world", complete: true }]
    });
  });

  it("does not duplicate a delta already included in a message part snapshot", () => {
    const draft = state();
    draft.message.s = [{ id: "msg_1", sessionID: "s", role: "assistant", time: { created: 1 } }];
    applyChatEvent(draft, "s", event("u", "message.part.updated", {
      sessionID: "s",
      part: { id: "prt_1", messageID: "msg_1", sessionID: "s", type: "text", text: "Hello" }
    }));
    applyChatEvent(draft, "s", event("d", "message.part.delta", {
      sessionID: "s", messageID: "msg_1", partID: "prt_1", field: "text", delta: " world"
    }));
    applyChatEvent(draft, "s", event("u2", "message.part.updated", {
      sessionID: "s",
      part: { id: "prt_1", messageID: "msg_1", sessionID: "s", type: "text", text: "Hello world" }
    }));
    applyChatEvent(draft, "s", event("d2", "message.part.delta", {
      sessionID: "s", messageID: "msg_1", partID: "prt_1", field: "text", delta: " world"
    }));

    expect(draft.part.msg_1[0].text).toBe("Hello world");
  });

  it("streams tool input, applies the called snapshot, and finishes the card", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("start", "session.step.started", { sessionID: "s", assistantMessageID: "msg_1" }));
    applyChatEvent(draft, "s", event("t", "session.tool.input.started", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", name: "bash" }));
    applyChatEvent(draft, "s", event("d", "session.tool.input.delta", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", delta: "ls -la" }));
    applyChatEvent(draft, "s", event("c", "session.tool.called", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", input: { command: "ls -la" } }));
    applyChatEvent(draft, "s", event("ok", "session.tool.success", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", content: [{ type: "text", text: "done" }] }));

    const items = projectAssistantItems(draft, "s");

    expect(items[0]).toMatchObject({
      parts: [{
        kind: "tool",
        tool: { title: "bash", status: "success", output: "done", input: JSON.stringify({ command: "ls -la" }, null, 2) }
      }]
    });
  });

  it("preserves a finished tool against a stale running snapshot", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("start", "session.step.started", { sessionID: "s", assistantMessageID: "msg_1" }));
    applyChatEvent(draft, "s", event("t", "session.tool.input.started", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1" }));
    applyChatEvent(draft, "s", event("ok", "session.tool.success", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", content: [{ type: "text", text: "done" }] }));
    applyChatEvent(draft, "s", event("c", "session.tool.called", { sessionID: "s", assistantMessageID: "msg_1", callID: "call_1", input: { command: "ls" } }));

    const items = projectAssistantItems(draft, "s");

    expect(items[0]).toMatchObject({
      parts: [{ kind: "tool", tool: { status: "success", output: "done" } }]
    });
  });

  it("reports orphan materialization for legacy session text deltas", () => {
    const result = applyChatEvent(state(), "s", event("d", "session.text.delta", {
      sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, delta: "hi"
    }));

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID: "s", messageID: "msg_1", partID: "msg_1:text:0" }
    });
  });

  it("keeps parts sorted by id through binary insertion", () => {
    const draft = state();
    draft.message.s = [{ id: "msg_1", sessionID: "s", role: "assistant", time: { created: 1 } }];
    for (const partID of ["prt_3", "prt_1", "prt_2"]) {
      applyChatEvent(draft, "s", event(partID, "message.part.updated", {
        sessionID: "s",
        part: { id: partID, messageID: "msg_1", sessionID: "s", type: "text", text: partID }
      }));
    }

    expect(draft.part.msg_1.map((part) => part.id)).toEqual(["prt_1", "prt_2", "prt_3"]);
  });

  it("completes only the latest incomplete assistant on execution success", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("a", "session.step.started", { sessionID: "s", assistantMessageID: "msg_a" }));
    applyChatEvent(draft, "s", event("b", "session.step.started", { sessionID: "s", assistantMessageID: "msg_b" }));
    applyChatEvent(draft, "s", event("x", "session.execution.succeeded", { sessionID: "s" }));

    const items = projectAssistantItems(draft, "s");

    expect(items[0]).toMatchObject({ messageID: "msg_a", completed: true });
    expect(items[1]).toMatchObject({ messageID: "msg_b", completed: true });
  });

  it("hydrates history without regressing longer live text", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("start", "session.step.started", { sessionID: "s", assistantMessageID: "msg_1" }));
    applyChatEvent(draft, "s", event("t", "session.text.started", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0 }));
    applyChatEvent(draft, "s", event("d", "session.text.delta", { sessionID: "s", assistantMessageID: "msg_1", ordinal: 0, delta: "Hello world" }));

    const history: TranscriptItem[] = [{
      kind: "assistant",
      id: "msg_1",
      messageID: "msg_1",
      parts: [{ kind: "text", id: "msg_1:text:0", text: "Hello", complete: false }],
      completed: false
    }];
    hydrateChatState(draft, "s", history);

    expect(draft.part.msg_1[0].text).toBe("Hello world");
  });

  it("projects assistant retry and error state", () => {
    const draft = state();
    draft.message.s = [{
      id: "msg_1",
      sessionID: "s",
      role: "assistant",
      time: { created: 1 },
      retry: { attempt: 2, message: "boom", next: 30_000 },
      error: { message: "Step failed" }
    }];

    expect(projectAssistantItems(draft, "s")[0]).toMatchObject({
      kind: "assistant",
      completed: false,
      retry: { attempt: 2, message: "boom", next: 30_000 },
      error: "Step failed"
    });
  });
});

describe("tool part id aliasing", () => {
  const seedLiveToolRow = (draft: ChatDirectoryState): void => {
    applyChatEvent(draft, "s", event("t1", "session.tool.input.started", {
      sessionID: "s",
      assistantMessageID: "msg_1",
      id: "call_1",
      name: "bash"
    }));
    applyChatEvent(draft, "s", event("t2", "session.tool.called", {
      sessionID: "s",
      assistantMessageID: "msg_1",
      callID: "call_1",
      name: "bash",
      input: { command: "echo hi" }
    }));
  };

  it("merges a server tool snapshot onto the live synthetic-id row", () => {
    const draft = state();
    applyChatEvent(draft, "s", event("m1", "message.updated", {
      sessionID: "s",
      info: { id: "msg_1", sessionID: "s", role: "assistant", time: { created: 100 } }
    }));
    seedLiveToolRow(draft);

    applyChatEvent(draft, "s", event("u", "message.part.updated", {
      sessionID: "s",
      part: { id: "call_1", messageID: "msg_1", sessionID: "s", type: "tool", state: { status: "completed" } }
    }));

    const parts = draft.part.msg_1;
    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe("msg_1:tool:call_1");
    expect(String(parts[0].state?.status)).toBe("completed");
  });

  it("applies server deltas addressed by raw call id to the live row", () => {
    const draft = state();
    seedLiveToolRow(draft);

    const result = applyChatEvent(draft, "s", event("d", "message.part.delta", {
      sessionID: "s", messageID: "msg_1", partID: "call_1", field: "input", delta: "{\"command\":"
    }));

    expect(result).toBe(true);
    expect(draft.part.msg_1).toHaveLength(1);
  });

  it("hydrates history tool parts under canonical ids so live events merge", () => {
    const draft = state();
    const transcript: TranscriptItem[] = [{
      kind: "assistant",
      id: "msg_1",
      messageID: "msg_1",
      completed: true,
      parts: [{
        kind: "tool",
        id: "call_1",
        tool: { id: "call_1", title: "bash", detail: "", status: "success", input: "{}" }
      }]
    }];
    hydrateChatState(draft, "s", transcript);
    expect(draft.part.msg_1.map((part) => part.id)).toEqual(["msg_1:tool:call_1"]);

    applyChatEvent(draft, "s", event("t3", "session.tool.success", {
      sessionID: "s",
      assistantMessageID: "msg_1",
      callID: "call_1",
      output: "done"
    }));

    expect(draft.part.msg_1).toHaveLength(1);
    expect(String(draft.part.msg_1[0].state?.output)).toBe("done");
  });
});
