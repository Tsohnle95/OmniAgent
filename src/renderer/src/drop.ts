import type { DragEvent } from "react";

export function isExternalFileDrag(e: DragEvent): boolean {
  const transfer = e.dataTransfer;
  if (!transfer) return false;
  if (Array.from((transfer.types ?? []) as ArrayLike<string>).some((type) => type.toLowerCase() === "files")) return true;
  if (Array.from(transfer.items ?? []).some((item) => item.kind === "file")) return true;
  return Boolean(transfer.files && transfer.files.length > 0);
}

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
