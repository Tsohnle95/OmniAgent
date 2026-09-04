import { describe, expect, it, vi } from "vitest";
import { collectLaunchPaths, PendingOpenPaths } from "./open-paths";

describe("PendingOpenPaths", () => {
  it("takes queued paths once and clears the queue", () => {
    const pending = new PendingOpenPaths();
    pending.push(["/repo/a", "/repo/b"]);
    expect(pending.size).toBe(2);
    expect(pending.take()).toEqual(["/repo/a", "/repo/b"]);
    expect(pending.size).toBe(0);
    expect(pending.take()).toEqual([]);
  });

  it("ignores blanks and duplicates and caps the queue", () => {
    const pending = new PendingOpenPaths();
    pending.push(["  ", "/repo/a", "/repo/a", "/repo/b"]);
    expect(pending.take()).toEqual(["/repo/a", "/repo/b"]);
    pending.push(Array.from({ length: 12 }, (_, index) => `/repo/${index}`));
    expect(pending.take()).toHaveLength(10);
  });
});

describe("collectLaunchPaths", () => {
  it("keeps existing paths and drops flags", () => {
    const exists = vi.fn((path: string) => path === "/repo/a" || path === "/file.txt");
    expect(collectLaunchPaths(["/repo/a", "--new-window", "-n", "+42", "--", "missing", "/file.txt"], exists)).toEqual([
      "/repo/a",
      "/file.txt"
    ]);
  });

  it("treats exists failures as missing", () => {
    const exists = vi.fn(() => {
      throw new Error("denied");
    });
    expect(collectLaunchPaths(["/repo/a"], exists)).toEqual([]);
  });

  it("ignores relative launch arguments", () => {
    const exists = vi.fn(() => true);
    expect(collectLaunchPaths([".", "/repo/a"], exists)).toEqual(["/repo/a"]);
  });

  it("ignores the app executable in secondary-instance arguments", () => {
    const exists = vi.fn(() => true);
    expect(collectLaunchPaths(["/Applications/Orbit.app/Contents/MacOS/Orbit", "/repo/a"], exists, "/Applications/Orbit.app/Contents/MacOS/Orbit"))
      .toEqual(["/repo/a"]);
  });

  it("keeps launch paths after the executable argument is removed", () => {
    const exists = vi.fn(() => true);
    const argv = ["/different/Orbit.app/Contents/MacOS/Electron", "/repo/a"];
    expect(collectLaunchPaths(argv.slice(1), exists, "/Applications/Orbit.app/Contents/MacOS/Orbit")).toEqual(["/repo/a"]);
  });
});
