import type { editor } from "monaco-editor";

type RevealTarget = { path: string; line: number };

const editors = new Map<string, editor.IStandaloneCodeEditor>();
let pending: RevealTarget | null = null;

function reveal(ed: editor.IStandaloneCodeEditor, line: number): void {
  ed.revealLineInCenter(line);
  ed.setPosition({ lineNumber: line, column: 1 });
  ed.focus();
}

export function registerEditor(path: string, ed: editor.IStandaloneCodeEditor): void {
  editors.set(path, ed);
  if (pending && pending.path === path) {
    const { line } = pending;
    pending = null;
    reveal(ed, line);
  }
}

export function unregisterEditor(path: string): void {
  editors.delete(path);
}

export function requestReveal(path: string, line: number): void {
  const ed = editors.get(path);
  if (ed) {
    reveal(ed, line);
  } else {
    pending = { path, line };
  }
}
