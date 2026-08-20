import type { DragEvent } from "react";

export function droppedFilePaths(e: DragEvent): string[] {
  const files = Array.from(e.dataTransfer?.files ?? []);
  return files
    .map((f) => (f as File & { path?: string }).path)
    .filter((p): p is string => Boolean(p));
}
