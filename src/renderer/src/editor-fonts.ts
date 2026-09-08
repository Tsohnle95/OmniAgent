// Pure code-font catalog for the editor. Font files are bundled offline via
// Fontsource packages (all OFL-licensed) imported in `main.tsx`; this module
// only maps preference ids to CSS stacks and validates stored values.

export type EditorFontId = "system" | "jetbrains-mono" | "fira-code" | "ibm-plex-mono" | "source-code-pro";

export interface EditorFontOption {
  id: EditorFontId;
  name: string;
  blurb: string;
  family: string;
}

const FALLBACK = "'SF Mono', Menlo, Consolas, monospace";

export const EDITOR_FONT_OPTIONS: EditorFontOption[] = [
  { id: "system", name: "System", blurb: "SF Mono, Menlo, Consolas.", family: FALLBACK },
  { id: "jetbrains-mono", name: "JetBrains Mono", blurb: "Distinct shapes, coding ligatures.", family: `'JetBrains Mono', ${FALLBACK}` },
  { id: "fira-code", name: "Fira Code", blurb: "Extensive programming ligatures.", family: `'Fira Code', ${FALLBACK}` },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", blurb: "Neutral grotesque, no-nonsense.", family: `'IBM Plex Mono', ${FALLBACK}` },
  { id: "source-code-pro", name: "Source Code Pro", blurb: "Adobe's readable coding face.", family: `'Source Code Pro', ${FALLBACK}` }
];

export const DEFAULT_EDITOR_FONT_SIZE = 13;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 24;

export function normalizeEditorFont(value: unknown): EditorFontId {
  return EDITOR_FONT_OPTIONS.some((option) => option.id === value) ? (value as EditorFontId) : "system";
}

export function normalizeEditorFontSize(value: unknown): number {
  const size = typeof value === "string" || typeof value === "number" ? Number.parseInt(String(value), 10) : NaN;
  if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, size));
}

export function editorFontFamily(id: EditorFontId): string {
  return EDITOR_FONT_OPTIONS.find((option) => option.id === id)?.family ?? FALLBACK;
}
