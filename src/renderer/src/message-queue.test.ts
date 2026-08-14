import { describe, expect, it } from "vitest";
import {
  addToQueue,
  clearAllQueues,
  clearQueue,
  clearSending,
  createMessageQueueTarget,
  emptyMessageQueueState,
  getMessageQueueKey,
  getQueueForTarget,
  getSendableQueue,
  loadMessageQueueState,
  markSending,
  migrateMessageQueueState,
  normalizeFollowUpBehavior,
  popToInput,
  removeFromQueue,
  reorderQueue,
  type MessageQueueState
} from "./message-queue";
import {
  getQueuedAutoSendRetryDelayMs,
  isQueuedAutoSendBackedOff,
  resolveQueuedSessionStatusType,
  shouldDispatchQueuedAutoSend
} from "./queued-auto-send";

const target = { workspaceID: "w1", sessionID: "s1" };

function withOne(state: MessageQueueState): MessageQueueState {
  return addToQueue(state, target, { content: "hello" });
}

describe("message queue", () => {
  it("normalizes follow-up behavior", () => {
    expect(normalizeFollowUpBehavior("queue")).toBe("queue");
    expect(normalizeFollowUpBehavior("steer")).toBe("steer");
    expect(normalizeFollowUpBehavior("immediate")).toBe("steer");
    expect(normalizeFollowUpBehavior(undefined)).toBe("queue");
    expect(normalizeFollowUpBehavior("bogus", false)).toBe("steer");
  });

  it("adds, lists, removes, and pops messages", () => {
    let state = withOne(emptyMessageQueueState());
    state = addToQueue(state, target, { content: "second" });

    expect(getQueueForTarget(state, target).map((message) => message.content)).toEqual(["hello", "second"]);

    const popped = popToInput(state, target, getQueueForTarget(state, target)[0].id);
    expect(popped.message?.content).toBe("hello");
    expect(getQueueForTarget(popped.state, target).map((message) => message.content)).toEqual(["second"]);

    const remaining = getQueueForTarget(popped.state, target);
    state = removeFromQueue(popped.state, target, remaining[0].id);
    expect(getQueueForTarget(state, target)).toEqual([]);
  });

  it("reorders the queue", () => {
    let state = withOne(emptyMessageQueueState());
    state = addToQueue(state, target, { content: "second" });
    const queue = getQueueForTarget(state, target);

    const reordered = reorderQueue(state, target, queue[1].id, queue[0].id);
    expect(getQueueForTarget(reordered, target).map((message) => message.content)).toEqual(["second", "hello"]);
  });

  it("caps queues at 20 entries and 50 targets", () => {
    let state = emptyMessageQueueState();
    for (let index = 0; index < 25; index += 1) {
      state = addToQueue(state, target, { content: `m${index}` });
    }
    expect(getQueueForTarget(state, target)).toHaveLength(20);
    expect(getQueueForTarget(state, target)[19].content).toBe("m24");

    for (let index = 0; index < 55; index += 1) {
      state = addToQueue(state, { workspaceID: `w${index}`, sessionID: "s" }, { content: "x" });
    }
    expect(Object.keys(state.queuedMessages).length).toBeLessThanOrEqual(50);
  });

  it("tracks in-flight sends and filters them from the sendable queue", () => {
    let state = withOne(emptyMessageQueueState());
    const message = getQueueForTarget(state, target)[0];

    state = markSending(state, target, message.id);
    expect(getSendableQueue(state, target)).toEqual([]);
    expect(getQueueForTarget(state, target)).toHaveLength(1);

    state = clearSending(state, target, message.id);
    expect(getSendableQueue(state, target)).toHaveLength(1);
  });

  it("clearQueue retains messages that are in flight", () => {
    let state = withOne(emptyMessageQueueState());
    const message = getQueueForTarget(state, target)[0];
    state = markSending(state, target, message.id);

    expect(getQueueForTarget(clearQueue(state, target), target)).toHaveLength(1);
    expect(getQueueForTarget(clearQueue(clearSending(state, target, message.id), target), target)).toEqual([]);
    expect(clearAllQueues(state).queuedMessages).toEqual({});
  });

  it("creates targets only with both ids and round-trips keys", () => {
    expect(createMessageQueueTarget("s1", null)).toBeNull();
    expect(getMessageQueueKey(target)).toBe("w1\ns1");
  });

  it("computes retry delays and backoff windows", () => {
    expect(getQueuedAutoSendRetryDelayMs(1)).toBe(2_000);
    expect(getQueuedAutoSendRetryDelayMs(3)).toBe(8_000);
    expect(getQueuedAutoSendRetryDelayMs(20)).toBe(60_000);
    expect(isQueuedAutoSendBackedOff({ messageId: "m", failures: 1, nextAttemptAt: 2_000 }, "m", 1_000)).toBe(true);
    expect(isQueuedAutoSendBackedOff({ messageId: "m", failures: 1, nextAttemptAt: 2_000 }, "other", 1_000)).toBe(false);
    expect(isQueuedAutoSendBackedOff(undefined, "m", 1_000)).toBe(false);
  });

  it("dispatches queued auto-sends when the session becomes idle", () => {
    expect(shouldDispatchQueuedAutoSend(undefined, "idle", true)).toBe(true);
    expect(shouldDispatchQueuedAutoSend("busy", "idle")).toBe(true);
    expect(shouldDispatchQueuedAutoSend("retry", "idle")).toBe(true);
    expect(shouldDispatchQueuedAutoSend("busy", "busy", true)).toBe(false);
    expect(shouldDispatchQueuedAutoSend(undefined, "busy")).toBe(false);
  });

  it("resolves queue status with the trailing assistant fallback", () => {
    expect(resolveQueuedSessionStatusType({ statusType: "busy", trailingAssistantIncomplete: false })).toBe("busy");
    expect(resolveQueuedSessionStatusType({ statusType: undefined, trailingAssistantIncomplete: true })).toBe("busy");
    expect(resolveQueuedSessionStatusType({ statusType: undefined, trailingAssistantIncomplete: false })).toBe("idle");
    expect(resolveQueuedSessionStatusType({ statusType: "retry", trailingAssistantIncomplete: false })).toBe("retry");
  });

  it("migrates legacy queues into quarantine", () => {
    const migrated = migrateMessageQueueState({
      queuedMessages: { "w1\ns1": [{ id: "m1", content: "legacy", createdAt: 1 }] },
      followUpBehavior: "steer"
    }, 1);

    expect(migrated.queuedMessages).toEqual({});
    expect(migrated.quarantinedLegacyMessages?.["w1\ns1"]).toHaveLength(1);
    expect(migrated.followUpBehavior).toBe("steer");
  });

  it("keeps current queues across a version-2 load", () => {
    window.localStorage.setItem("messageQueue", JSON.stringify({
      queuedMessages: { "w1\ns1": [{ id: "m1", content: "hello", createdAt: 1 }] },
      followUpBehavior: "queue"
    }));

    const state = loadMessageQueueState();

    expect(state.queuedMessages["w1\ns1"]).toHaveLength(1);
    expect(state.followUpBehavior).toBe("queue");
    expect(state.quarantinedLegacyMessages).toEqual({});
    expect(state.sendingIds).toEqual({});
    window.localStorage.clear();
  });
});
