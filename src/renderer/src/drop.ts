import type { DragEvent } from "react";

export function droppedFilePaths(e: DragEvent): string[] {
  const files = Array.from(e.dataTransfer?.files ?? []);
  const paths: string[] = [];
  for (const file of files) {
    const viaBridge = window.openshell?.getPathForFile?.(file);
    const path = viaBridge || (file as File & { path?: string }).path;
    if (path) paths.push(path);
  }
  return paths;
}
