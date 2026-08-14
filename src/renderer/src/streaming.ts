import type { ChatDirectoryState, ChatMessageRecord } from "./chat-store";

export type StreamPhase = "streaming" | "cooldown" | "completed";

export interface MessageStreamState {
  phase: StreamPhase;
  startedAt: number;
  lastUpdateAt: number;
  completedAt?: number;
}

export interface StreamingStore {
  streamingMessageIds: Map<string, string | null>;
  messageStreamStates: Map<string, MessageStreamState>;
}

export const STREAMING_HEARTBEAT_MS = 1000;

export function emptyStreamingStore(): StreamingStore {
  return {
    streamingMessageIds: new Map(),
    messageStreamStates: new Map()
  };
}

export function findTrailingAssistantMessage(messages: ChatMessageRecord[] | undefined): ChatMessageRecord | null {
  if (!messages) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return null;
    if (messages[index].role === "assistant") return messages[index];
  }

  return null;
}

export function updateStreamingState(state: ChatDirectoryState, current: StreamingStore, now = Date.now()): StreamingStore | null {
  const nextStreamingIds = new Map<string, string | null>();
  const nextStreamStates = new Map(current.messageStreamStates);
  let changed = false;

  const busySessionIds = new Set<string>();
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    if (status.type === "busy" || status.type === "retry") {
      busySessionIds.add(sessionID);
    }
  }

  const completeStreamingMessage = (sessionID: string, msgId: string) => {
    nextStreamingIds.set(sessionID, null);
    const existing = nextStreamStates.get(msgId);
    if (existing && existing.phase === "streaming") {
      nextStreamStates.set(msgId, {
        ...existing,
        phase: "completed",
        completedAt: now
      });
    }
    changed = true;
  };

  for (const sessionID of busySessionIds) {
    const messages = state.message[sessionID];
    if (!messages || messages.length === 0) continue;

    const streamingMsg = findTrailingAssistantMessage(messages);

    if (!streamingMsg) {
      const prevId = current.streamingMessageIds.get(sessionID);
      if (prevId) {
        completeStreamingMessage(sessionID, prevId);
      }
      continue;
    }

    const prevId = current.streamingMessageIds.get(sessionID);
    if (prevId && prevId !== streamingMsg.id) {
      const previous = nextStreamStates.get(prevId);
      if (previous && previous.phase === "streaming") {
        nextStreamStates.set(prevId, {
          ...previous,
          phase: "completed",
          completedAt: now
        });
        changed = true;
      }
    }
    if (prevId !== streamingMsg.id) changed = true;
    nextStreamingIds.set(sessionID, streamingMsg.id);

    const existing = nextStreamStates.get(streamingMsg.id);
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMsg.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now
      });
      changed = true;
    } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
      nextStreamStates.set(streamingMsg.id, {
        ...existing,
        lastUpdateAt: now
      });
      changed = true;
    }
  }

  for (const [sessionID, msgId] of current.streamingMessageIds) {
    if (!msgId) continue;
    const isStillBusy = busySessionIds.has(sessionID);
    if (isStillBusy) continue;

    completeStreamingMessage(sessionID, msgId);
  }

  if (!changed) return null;
  return {
    streamingMessageIds: nextStreamingIds,
    messageStreamStates: nextStreamStates
  };
}

export function touchStreamingSession(current: StreamingStore, sessionID: string, now = Date.now()): StreamingStore | null {
  const messageID = current.streamingMessageIds.get(sessionID);
  if (!messageID) return null;
  const existing = current.messageStreamStates.get(messageID);
  if (!existing || existing.phase !== "streaming" || now - existing.lastUpdateAt < STREAMING_HEARTBEAT_MS) return null;

  const messageStreamStates = new Map(current.messageStreamStates);
  messageStreamStates.set(messageID, { ...existing, lastUpdateAt: now });
  return { ...current, messageStreamStates };
}
