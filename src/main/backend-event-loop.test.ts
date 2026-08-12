// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BackendEventLoop } from "./backend-event-loop";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function turn(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("BackendEventLoop", () => {
  it("deduplicates starts until a completed run releases the lifecycle", async () => {
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
    await turn();
    expect(subscriptions).toBe(1);
    expect(loop.active()).toBe(true);
    subscription.resolve();
    await turn();
    expect(loop.active()).toBe(false);
  });

  it("aborts a pending run without hanging when work delays its lifecycle boundary", async () => {
    const loop = new BackendEventLoop();
    const exited = deferred();
    const release = deferred();
    loop.start(async (signal) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      await release.promise;
      exited.resolve();
    });
    await turn();
    await loop.stop();
    expect(loop.active()).toBe(false);
    release.resolve();
    await exited.promise;
  });

  it("invalidates streaming work before restart and never revives the old generation", async () => {
    const loop = new BackendEventLoop();
    const firstReady = deferred();
    const firstExit = deferred();
    const seen: string[] = [];
    let firstGeneration = 0;
    loop.start(async (signal, generation) => {
      firstGeneration = generation;
      firstReady.resolve();
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      if (loop.current(generation)) seen.push("stale");
      firstExit.resolve();
    });
    await firstReady.promise;
    await loop.stop();
    expect(loop.current(firstGeneration)).toBe(false);

    const restarted = deferred();
    loop.start(async (_signal, generation) => {
      expect(loop.current(generation)).toBe(true);
      seen.push("fresh");
      restarted.resolve();
    });
    await restarted.promise;
    await firstExit.promise;
    await turn();
    expect(seen).toEqual(["fresh"]);
    expect(loop.active()).toBe(false);
  });
});
