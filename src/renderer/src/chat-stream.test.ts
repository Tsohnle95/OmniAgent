import { describe, expect, it } from "vitest";
import type { TranscriptItem } from "@shared/types";
import {
  coalesceChatStream,
  mergeChatHistory,
  reduceChatStream,
  type ChatStreamEvent
} from "./chat-stream";

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
});
