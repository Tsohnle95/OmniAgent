import { coalesceChatStream, type ChatStreamEvent } from "./chat-stream";

const FLUSH_FRAME_MS = 33;

export function createChatStreamPipeline(onEvents: (events: ChatStreamEvent[]) => void): {
  enqueue: (event: ChatStreamEvent) => void;
  cleanup: () => void;
} {
  let queue: ChatStreamEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFlush = 0;

  const flush = (): void => {
    timer = null;
    if (queue.length === 0) return;
    const events = coalesceChatStream(queue);
    queue = [];
    lastFlush = Date.now();
    onEvents(events);
  };

  const enqueue = (event: ChatStreamEvent): void => {
    queue.push(event);
    if (timer !== null) return;
    timer = setTimeout(flush, Math.max(0, FLUSH_FRAME_MS - (Date.now() - lastFlush)));
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
