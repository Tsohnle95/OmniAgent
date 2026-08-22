import { describe, expect, it } from "vitest";
import { deepSeekRuntimeEvent, deepSeekTranscript } from "./deepseek-events";

describe("deepSeekTranscript", () => {
  it("projects user, assistant, tool, and todo events", () => {
    const result = deepSeekTranscript([
      { event: { type: "user/message", seq: 1, data: { id: "u1", source: { kind: "user" }, content: [{ type: "text", text: "Fix it" }] } } },
      { event: { type: "assistant/message", seq: 2, time: 10, data: { message: { id: "a1", content: [{ type: "reasoning", text: "Inspect" }, { type: "tool-call", id: "c1", name: "bash", arguments: "{\"command\":\"npm test\"}" }] } } } },
      { event: { type: "tool/result", seq: 3, time: 20, data: { message: { source: { kind: "tool", callId: "c1" }, content: [{ type: "tool-result", content: [{ type: "text", text: "passed" }] }] } } } },
      { event: { type: "todo/write", seq: 4, data: { todos: [{ id: "t1", content: "Test", status: "in-progress" }] } } }
    ]);
    expect(result.transcript[0]).toMatchObject({ kind: "user", text: "Fix it" });
    expect(result.transcript[1]).toMatchObject({
      kind: "assistant",
      parts: [
        { kind: "reasoning", text: "Inspect" },
        { kind: "tool", tool: { id: "c1", status: "success", output: "passed", duration: 10 } }
      ]
    });
    expect(result.todos).toEqual([{ id: "t1", content: "Test", status: "in_progress" }]);
  });

  it("keeps plugin context distinct from user prompts", () => {
    const result = deepSeekTranscript([
      { event: { type: "user/message", seq: 1, data: { source: { kind: "plugin", summary: "Files changed" }, content: [{ type: "text", text: "context" }] } } }
    ]);
    expect(result.transcript).toEqual([{ kind: "synthetic", id: "deepseek-context-1", text: "context", description: "Files changed" }]);
  });

  it("normalizes only verified native lifecycle events", () => {
    expect(deepSeekRuntimeEvent({ type: "host/session-status", sessionId: "s", running: true })).toEqual({ type: "execution.started" });
    expect(deepSeekRuntimeEvent({ type: "session/event", sessionId: "s", event: { type: "assistant/message" } })).toEqual({ type: "transcript.changed" });
    expect(deepSeekRuntimeEvent({ type: "session/event", sessionId: "s", event: { type: "unknown" } })).toBeNull();
  });
});
