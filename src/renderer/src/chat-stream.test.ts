import { describe, expect, it } from "vitest";
import type { TranscriptItem } from "@shared/types";
import {
  coalesceChatStream,
  mergeChatHistory,
  reduceChatStream,
  type ChatStreamEvent
} from "./chat-stream";
import { MAX_RETAINED_OUTPUT_CHARS } from "@shared/retention";

function event(id: string, type: string, data: Record<string, unknown>): ChatStreamEvent {
  return { id, type, created: 100, data };
}

describe("chat stream replay", () => {
  it("preserves a longer live response when history arrives during streaming", () => {
    const events = coalesceChatStream([
      event("start", "session.text.started", { assistantMessageID: "assistant-1", ordinal: 0 }),
      event("delta-1", "session.text.delta", {
        sessionID: "session-1",
        assistantMessageID: "assistant-1",
        ordinal: 0,
        delta: "Hello"
      }),
      event("delta-2", "session.text.delta", {
        sessionID: "session-1",
        assistantMessageID: "assistant-1",
        ordinal: 0,
        delta: " world"
      })
    ]);
    const live = events.reduce(reduceChatStream, [] as TranscriptItem[]);
    const history: TranscriptItem[] = [{
      kind: "assistant",
      id: "assistant-1",
      messageID: "assistant-1",
      parts: [{
        kind: "text",
        id: "assistant-1:text:0",
        text: "Hello",
        complete: false
      }],
      completed: false
    }];

    const merged = mergeChatHistory(history, live);

    expect(events).toHaveLength(2);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      kind: "assistant",
      messageID: "assistant-1",
      parts: [{ text: "Hello world", complete: false }]
    });
  });

  it("bounds completed live shell output", () => {
    const output = "x".repeat(MAX_RETAINED_OUTPUT_CHARS * 2);
    const transcript = reduceChatStream([], event("shell-end", "session.shell.ended", {
      shell: { id: "shell-1", command: "build", status: "exited", exit: 0 },
      output: { output }
    }));

    expect(transcript[0]).toMatchObject({ kind: "shell", output: expect.stringContaining("characters omitted") });
    expect(transcript[0].kind === "shell" ? transcript[0].output?.length : 0).toBe(MAX_RETAINED_OUTPUT_CHARS);
  });

  it("preserves live semantic chronology around replayed assistants", () => {
    const assistant = (id: string): TranscriptItem => ({
      kind: "assistant", id, messageID: id, parts: [], completed: true
    });
    const history = [assistant("a1"), assistant("a2")];
    const live: TranscriptItem[] = [
      { kind: "shell", id: "shell", shellID: "shell", command: "pwd", status: "exited" },
      assistant("a1"),
      { kind: "skill", id: "skill", skill: "review", name: "Review", text: "" },
      assistant("a2"),
      { kind: "compaction", id: "compact", status: "completed", reason: "auto", summary: "done" }
    ];

    expect(mergeChatHistory(history, live).map((item) => item.id)).toEqual([
      "shell", "a1", "skill", "a2", "compact"
    ]);
  });
});
