import type { editor } from "monaco-editor";
import { HTMLHint } from "htmlhint/dist/core/core";
import type { Hint, Ruleset } from "htmlhint/dist/core/types";

const MAX_VALIDATION_BYTES = 4 * 1024 * 1024;
export const DEFAULT_VALIDATION_DEBOUNCE_MS = 400;

const ERROR_SEVERITY: editor.IMarkerData["severity"] = 8;

const HTML_VALIDATION_RULES: Ruleset = {
  "alt-require": true,
  "attr-no-duplication": true,
  "attr-unsafe-chars": true,
  "id-unique": true,
  "spec-char-escape": true,
  "src-not-empty": true,
  "tag-pair": true,
  "tagname-specialchars": true
};

export function isHtmlFile(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return base.endsWith(".html") || base.endsWith(".htm");
}

function toMarker(hint: Hint): editor.IMarkerData {
  const rawLength = Math.max(hint.raw.split(/\r?\n/, 1)[0].length, 1);
  return {
    startLineNumber: hint.line,
    startColumn: hint.col,
    endLineNumber: hint.line,
    endColumn: hint.col + rawLength,
    message: hint.message,
    severity: ERROR_SEVERITY,
    source: "htmlhint",
    code: hint.rule.id
  };
}

export function validateHtmlContent(content: string): editor.IMarkerData[] {
  if (content.length === 0 || content.length > MAX_VALIDATION_BYTES) return [];
  return HTMLHint.verify(content, HTML_VALIDATION_RULES).map(toMarker);
}

export interface DiagnosticsScheduler {
  schedule(content: string): void;
  cancel(): void;
}

export function createDiagnosticsScheduler(
  validate: (content: string) => editor.IMarkerData[],
  publish: (markers: editor.IMarkerData[]) => void,
  debounceMs = DEFAULT_VALIDATION_DEBOUNCE_MS
): DiagnosticsScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(content: string): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        publish(validate(content));
      }, debounceMs);
    },
    cancel(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}
