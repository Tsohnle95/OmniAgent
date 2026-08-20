import { afterEach, describe, expect, it, vi } from "vitest";
import { droppedFilePaths } from "./drop";

function dragEventWith(files: unknown[]): { dataTransfer: { files: unknown[] } } {
  return { dataTransfer: { files } };
}

describe("droppedFilePaths", () => {
  const original = window.openshell;

  afterEach(() => {
    (window as { openshell?: unknown }).openshell = original;
  });

  it("reads paths through the preload bridge when it is available", () => {
    (window as { openshell?: unknown }).openshell = {
      getPathForFile: (file: File) => `/bridged/${(file as { name?: string }).name}`
    } as never;
    const e = dragEventWith([{ name: "a.txt" } as unknown as File]);
    expect(droppedFilePaths(e as never)).toEqual(["/bridged/a.txt"]);
  });

  it("falls back to the legacy File.path property when no bridge exists", () => {
    (window as { openshell?: unknown }).openshell = undefined;
    const e = dragEventWith([{ path: "/legacy/a.txt" } as unknown as File]);
    expect(droppedFilePaths(e as never)).toEqual(["/legacy/a.txt"]);
  });

  it("skips files whose path cannot be resolved", () => {
    (window as { openshell?: unknown }).openshell = undefined;
    const e = dragEventWith([{ name: "no-path.txt" } as unknown as File]);
    expect(droppedFilePaths(e as never)).toEqual([]);
  });
});
