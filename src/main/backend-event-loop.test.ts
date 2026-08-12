// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BackendEventLoop } from "./backend-event-loop";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("BackendEventLoop", () => {
  it("keeps backend start calls on one subscription until the loop exits", async () => {
    const loop = new BackendEventLoop();
    const subscription = deferred();
    let subscriptions = 0;
    const start = (): void => loop.start(async () => {
      subscriptions += 1;
      await subscription.promise;
    });
    start();
    start();
    start();
    expect(subscriptions).toBe(1);
    expect(loop.active()).toBe(true);
    subscription.resolve();
    await subscription.promise;
  });
});
