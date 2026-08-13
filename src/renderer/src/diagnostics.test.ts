import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticsScheduler,
  isHtmlFile,
  validateHtmlContent
} from "./diagnostics";

const VALID_DOCUMENT =
  "<!DOCTYPE html>\n<html>\n<head><title>t</title></head>\n<body><p>ok</p></body>\n</html>";

describe("isHtmlFile", () => {
  it("accepts html and htm extensions only", () => {
    expect(isHtmlFile("index.html")).toBe(true);
    expect(isHtmlFile("src/Page.HTML")).toBe(true);
    expect(isHtmlFile("legacy.htm")).toBe(true);
    expect(isHtmlFile("styles.css")).toBe(false);
    expect(isHtmlFile("App.vue")).toBe(false);
    expect(isHtmlFile("App.svelte")).toBe(false);
    expect(isHtmlFile("readme.md")).toBe(false);
    expect(isHtmlFile("no-extension")).toBe(false);
  });
});

describe("validateHtmlContent", () => {
  it("returns no markers for valid markup", () => {
    expect(validateHtmlContent(VALID_DOCUMENT)).toEqual([]);
  });

  it("returns no markers for empty content", () => {
    expect(validateHtmlContent("")).toEqual([]);
  });

  it("returns no markers for content beyond the size limit", () => {
    const huge = "<div>".padEnd(4 * 1024 * 1024 + 1, "x");
    expect(validateHtmlContent(huge)).toEqual([]);
  });

  it("flags mismatched tags with 1-based monaco positions", () => {
    const markers = validateHtmlContent("<div>\n  <span>\n</div>");
    expect(markers.length).toBe(1);
    const [marker] = markers;
    expect(marker.message).toContain("Tag must be paired");
    expect(marker.startLineNumber).toBe(2);
    expect(marker.startColumn).toBe(3);
    expect(marker.endLineNumber).toBe(2);
    expect(marker.endColumn).toBeGreaterThan(marker.startColumn);
    expect(marker.severity).toBe(8);
    expect(marker.source).toBe("htmlhint");
    expect(marker.code).toBe("tag-pair");
  });

  it("flags validity problems such as duplicate attributes and empty src", () => {
    const markers = validateHtmlContent('<img src="" src="x">');
    const rules = markers.map((m) => m.code).sort();
    expect(rules).toContain("src-not-empty");
    expect(rules).toContain("attr-no-duplication");
    expect(markers.every((m) => m.severity === 8)).toBe(true);
  });
});

describe("createDiagnosticsScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid schedules into one publish with the latest content", () => {
    const validate = vi.fn(() => []);
    const publish = vi.fn();
    const scheduler = createDiagnosticsScheduler(validate, publish, 400);

    scheduler.schedule("first");
    vi.advanceTimersByTime(200);
    scheduler.schedule("second");
    vi.advanceTimersByTime(200);
    scheduler.schedule("third");
    vi.advanceTimersByTime(400);

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith("third");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith([]);
  });

  it("publishes once after the debounce window", () => {
    const publish = vi.fn();
    const scheduler = createDiagnosticsScheduler(() => [], publish, 400);

    scheduler.schedule("content");
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("drops the pending run when cancelled", () => {
    const publish = vi.fn();
    const scheduler = createDiagnosticsScheduler(() => [], publish, 400);

    scheduler.schedule("content");
    scheduler.cancel();
    vi.advanceTimersByTime(1000);
    expect(publish).not.toHaveBeenCalled();
  });
});
