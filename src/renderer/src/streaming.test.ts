import { describe, expect, it } from "vitest";
import {
  emptyStreamingStore,
  findTrailingAssistantMessage,
  touchStreamingSession,
  updateStreamingState
} from "./streaming";
import type { ChatDirectoryState, ChatMessageRecord } from "./chat-store";

function assistant(id: string, completedAt?: number): ChatMessageRecord {
  return {
    id,
    sessionID: "s",
    role: "assistant",
    time: completedAt !== undefined ? { created: 1, completed: completedAt } : { created: 1 }
  };
}

function user(id: string): ChatMessageRecord {
  return { id, sessionID: "s", role: "user", time: { created: 1 } };
}

function state(messages?: ChatMessageRecord[], statusType: "busy" | "idle" = "idle"): ChatDirectoryState {
  return {
    message: { s: messages ?? [] },
    part: {},
    session_status: { s: { type: statusType } }
  };
}

describe("streaming lifecycle", () => {
  it("finds only a trailing assistant message and stops at a trailing user", () => {
    expect(findTrailingAssistantMessage([assistant("a1", 2), assistant("a2")])?.id).toBe("a2");
    expect(findTrailingAssistantMessage([assistant("a1", 2), user("u1")])).toBeNull();
    expect(findTrailingAssistantMessage(undefined)).toBeNull();
  });

  it("marks a busy session's trailing assistant as streaming", () => {
    const draft = state([assistant("a1")], "busy");
    const next = updateStreamingState(draft, emptyStreamingStore(), 1_000);

    expect(next?.streamingMessageIds.get("s")).toBe("a1");
    expect(next?.messageStreamStates.get("a1")).toEqual({
      phase: "streaming",
      startedAt: 1_000,
      lastUpdateAt: 1_000
    });
  });

  it("completes the stream when the session goes idle", () => {
    const current = emptyStreamingStore();
    const streaming = updateStreamingState(state([assistant("a1")], "busy"), current, 1_000)!;
    const next = updateStreamingState(state([assistant("a1", 2_000)], "idle"), streaming, 2_000);

    expect(next?.streamingMessageIds.get("s")).toBeNull();
    expect(next?.messageStreamStates.get("a1")).toMatchObject({
      phase: "completed",
      completedAt: 2_000
    });
  });

  it("completes the previous message when a new trailing assistant takes over", () => {
    const current = emptyStreamingStore();
    const streaming = updateStreamingState(state([assistant("a1")], "busy"), current, 1_000)!;
    const next = updateStreamingState(state([assistant("a1", 2_000), assistant("a2")], "busy"), streaming, 2_000);

    expect(next?.messageStreamStates.get("a1")?.phase).toBe("completed");
    expect(next?.streamingMessageIds.get("s")).toBe("a2");
  });

  it("throttles lastUpdateAt writes to the streaming heartbeat window", () => {
    const current = emptyStreamingStore();
    const streaming = updateStreamingState(state([assistant("a1")], "busy"), current, 1_000)!;
    const unchanged = updateStreamingState(state([assistant("a1")], "busy"), streaming, 1_400);

    expect(unchanged).toBeNull();
    const advanced = updateStreamingState(state([assistant("a1")], "busy"), streaming, 2_001);
    expect(advanced?.messageStreamStates.get("a1")?.lastUpdateAt).toBe(2_001);
  });

  it("touchStreamingSession respects the same heartbeat throttle", () => {
    const current = emptyStreamingStore();
    const streaming = updateStreamingState(state([assistant("a1")], "busy"), current, 1_000)!;

    expect(touchStreamingSession(streaming, "s", 1_400)).toBeNull();
    expect(touchStreamingSession(streaming, "s", 2_001)?.messageStreamStates.get("a1")?.lastUpdateAt).toBe(2_001);
    expect(touchStreamingSession(streaming, "other")).toBeNull();
  });
});
