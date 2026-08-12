import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { largeSessionEvents, reduceLargeSession, retainedOutputChars, timelineDomSizeProxy } from "./large-session-fixture";

describe("large session performance fixture", () => {
  it("reports deterministic reducer, derivation, DOM proxy, and retention measurements", () => {
    const events = largeSessionEvents();
    const reduceStart = performance.now();
    const transcript = reduceLargeSession();
    const reduceMs = performance.now() - reduceStart;
    const deriveStart = performance.now();
    const domRows = timelineDomSizeProxy(transcript);
    const retainedChars = retainedOutputChars(transcript);
    const deriveMs = performance.now() - deriveStart;

    console.info(JSON.stringify({
      events: events.length,
      transcriptItems: transcript.length,
      reducerMs: Number(reduceMs.toFixed(2)),
      derivedTimelineMs: Number(deriveMs.toFixed(2)),
      domRows,
      retainedOutputChars: retainedChars
    }));

    expect(transcript).toHaveLength(400);
    expect(domRows).toBe(800);
    expect(reduceMs).toBeLessThan(50);
    expect(deriveMs).toBeLessThan(5);
    expect(domRows).toBeLessThanOrEqual(1_000);
    expect(retainedChars).toBeLessThanOrEqual(400 * 8 * 1024);
  });
});
