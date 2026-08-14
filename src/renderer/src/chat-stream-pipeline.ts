import type { ChatStreamEvent } from "./chat-stream";

const FLUSH_FRAME_MS = 33;

export function createChatStreamPipeline(onEvents: (events: ChatStreamEvent[]) => void): {
  enqueue: (event: ChatStreamEvent) => void;
  cleanup: () => void;
} {
  let queue: ChatStreamEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    if (queue.length === 0) return;
    const events = queue;
    queue = [];
    onEvents(events);
  };

  const enqueue = (event: ChatStreamEvent): void => {
    queue.push(event);
    if (timer !== null) return;
    timer = setTimeout(flush, FLUSH_FRAME_MS);
  };

  return {
    enqueue,
    cleanup: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      flush();
    }
  };
}
