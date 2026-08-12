import { performance } from "node:perf_hooks";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { largeSessionEvents, reduceLargeSession, retainedOutputChars, timelineDomSizeProxy } from "./large-session-fixture";
import { OpenCodeTimeline } from "./components/OpenCodeTimeline";

vi.mock("./store", () => ({
  useStore: () => ({
    agents: [], sessions: [], session: null, reopenSession: vi.fn(), openFile: vi.fn(), replyPermission: vi.fn()
  })
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

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

  it("constructs the representative timeline React tree and jsdom rows within a generous budget", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const transcript = reduceLargeSession();
    const renderStart = performance.now();

    act(() => root.render(
      <OpenCodeTimeline transcript={transcript} busy={false} lastAssistantId={null} />
    ));
    const reactRenderAndDomMs = performance.now() - renderStart;
    const actualDomRows = container.querySelectorAll("[data-timeline-row]").length;

    console.info(JSON.stringify({
      scope: "React reconciliation and jsdom DOM construction; excludes Chromium layout and paint",
      reactRenderAndDomMs: Number(reactRenderAndDomMs.toFixed(2)),
      actualDomRows
    }));
    expect(actualDomRows).toBe(800);
    expect(reactRenderAndDomMs).toBeLessThan(5_000);
    act(() => root.unmount());
  }, 10_000);
});
