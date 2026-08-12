import { describe, expect, it } from "vitest";
import {
  MAX_RETAINED_OUTPUT_CHARS,
  retainOutput,
  retainMatchingSessionRecords,
  retainSessionRecord,
  retainToolContent
} from "@shared/retention";

describe("transcript retention", () => {
  it("keeps short output unchanged and summarizes the middle of large output", () => {
    expect(retainOutput("short")).toBe("short");
    const retained = retainOutput("a".repeat(10_000) + "z".repeat(10_000));
    expect(retained).toHaveLength(MAX_RETAINED_OUTPUT_CHARS);
    expect(retained).toMatch(/^a+/);
    const omitted = Number(retained.match(/(\d+) characters omitted/)?.[1]);
    expect(omitted).toBe(20_000 - retained.replace(/\n\.\.\. \d+ characters omitted \.\.\.\n/, "").length);
    expect(retained).toMatch(/z+$/);
  });

  it("evicts busy state for sessions evicted from transcript retention", () => {
    const busy = { active: true, retained: false, evicted: true };
    expect(retainMatchingSessionRecords(busy, { active: [], retained: [] }, "active"))
      .toEqual({ active: true, retained: false });
  });

  it("drops duplicate text content but retains file results", () => {
    expect(retainToolContent([
      { type: "text", text: "already retained as output" },
      { type: "file", uri: "file:///result", mime: "text/plain", name: "result.txt" }
    ])).toEqual([{ type: "file", uri: "file:///result", mime: "text/plain", name: "result.txt" }]);
    expect(retainToolContent([{ type: "text", text: "duplicate" }])).toBeUndefined();
  });

  it("keeps the active record and four most recently updated inactive records", () => {
    let records: Record<string, number> = { active: 0 };
    for (let index = 1; index <= 6; index += 1) {
      records = retainSessionRecord(records, `inactive-${index}`, index, "active");
    }
    expect(records).toEqual({
      active: 0,
      "inactive-3": 3,
      "inactive-4": 4,
      "inactive-5": 5,
      "inactive-6": 6
    });
    records = retainSessionRecord(records, "inactive-3", 30, "active");
    records = retainSessionRecord(records, "inactive-7", 7, "active");
    expect(Object.keys(records)).toEqual(["active", "inactive-5", "inactive-6", "inactive-3", "inactive-7"]);
  });
});
