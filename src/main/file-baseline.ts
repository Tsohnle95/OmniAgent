import type { FileBaseline } from "@shared/types";

export const unknownBaseline: FileBaseline = { kind: "unknown" };

export function knownBaseline(content: string): FileBaseline {
  return { kind: "known", content };
}

export function preserveBaseline(
  current: FileBaseline | undefined,
  candidate: FileBaseline
): FileBaseline {
  return current ?? candidate;
}

export function observedBaseline(hasGit: boolean, gitContent: string | null): FileBaseline {
  return hasGit ? knownBaseline(gitContent ?? "") : unknownBaseline;
}
