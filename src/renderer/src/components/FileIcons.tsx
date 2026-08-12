import type { ReactNode } from "react";

const STROKE = { stroke: "currentColor", fill: "none", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const DOC = "M3.5 3.5 a1 1 0 0 1 1 -1 h4.2 l3.3 3.3 v6.7 a1 1 0 0 1 -1 1 h-6.5 a1 1 0 0 1 -1 -1 z";
const FOLD = "M8.7 2.5 v3.3 h3.3";

export type FileGlyph = "generic" | "code" | "json" | "markdown" | "shell" | "text" | "config" | "media" | "binary";

const FILE_GLYPHS: Record<string, FileGlyph> = {
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  css: "code",
  scss: "code",
  less: "code",
  html: "code",
  xml: "code",
  py: "code",
  go: "code",
  rs: "code",
  rb: "code",
  java: "code",
  kt: "code",
  c: "code",
  h: "code",
  cpp: "code",
  cs: "code",
  php: "code",
  sql: "code",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  zsh: "shell",
  bash: "shell",
  command: "shell",
  yml: "config",
  yaml: "config",
  toml: "config",
  ini: "config",
  env: "text",
  conf: "text",
  txt: "text",
  log: "text",
  csv: "text",
  gitignore: "text",
  svg: "media",
  png: "media",
  jpg: "media",
  jpeg: "media",
  gif: "media",
  webp: "media",
  ico: "media",
  pdf: "media",
  bin: "binary",
  exe: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary"
};

function glyphFor(name: string): FileGlyph {
  if (name.includes(".")) {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const hit = FILE_GLYPHS[ext];
    if (hit) return hit;
  }
  return FILE_GLYPHS[name.toLowerCase()] ?? "generic";
}

function Glyph({ d, x = 5.2, y = 6.4 }: { d: string; x?: number; y?: number }): ReactNode {
  return (
    <path
      d={d}
      transform={`translate(${x - 8} ${y - 8})`}
      {...STROKE}
    />
  );
}

export function FolderIcon({ open }: { open?: boolean }): ReactNode {
  return (
    <svg className="si-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {open ? (
        <>
          <path d="M2.5 5.8 a1 1 0 0 1 1 -1 h3.2 l1.6 2 h5.2 a1 1 0 0 1 1 1 v3.7 a1 1 0 0 1 -1 1 h-10 a1 1 0 0 1 -1 -1 z" {...STROKE} />
          <path d="M3.4 4.8 h2.8 l1.7 1.9 h4.6 l2 -2.9" {...STROKE} />
        </>
      ) : (
        <path d="M2.5 4.5 c0 -.6 .4 -1 1 -1 h3.1 l1.6 2 h5.3 c.6 0 1 .4 1 1 v4.5 c0 .6 -.4 1 -1 1 h-10 c-.6 0 -1 -.4 -1 -1 z" {...STROKE} />
      )}
    </svg>
  );
}

export function FileIcon({ name, isDir, open }: { name: string; isDir: boolean; open?: boolean }): ReactNode {
  if (isDir) return <FolderIcon open={open} />;
  const glyph = glyphFor(name);
  const inner: ReactNode = {
    generic: null,
    code: <Glyph d="M6.2 7.6 l-1.3 1.4 1.3 1.4 M9.8 7.6 l1.3 1.4 -1.3 1.4 M7.6 6.9 l.9 3.5" />,
    json: (
      <>
        <Glyph d="M6.7 6.9 h-1.1 c-.5 0 -.9 .4 -.9 .9 v1 c0 .6 -.4 1.1 -1 1.1 c.6 0 1 .5 1 1.1 v1 c0 .5 .4 .9 .9 .9 h1.1" />
        <Glyph d="M9.3 6.9 h1.1 c.5 0 .9 .4 .9 .9 v1 c0 .6 .4 1.1 1 1.1 c-.6 0 -1 .5 -1 1.1 v1 c0 .5 -.4 .9 -.9 .9 h-1.1" />
      </>
    ),
    markdown: <Glyph d="M6.2 10.2 v-2.8 l1.8 2.2 1.8 -2.2 v2.8" />,
    shell: <Glyph d="M6 7.9 l1.7 1.7 -1.7 1.7 M6.3 11.3 h3.1" />,
    text: <Glyph d="M5.8 7.9 h4.4 M5.8 9.1 h3.2 M5.8 10.3 h4.4" />,
    config: <Glyph d="M6.7 7.5 l.9 4.2 M8.4 7.5 l.9 4.2 M6.2 8.7 h4.4 M6.6 10.6 h4.4" />,
    media: <Glyph d="M7.6 6.3 a.9 .9 0 1 1 0 1.8 a.9 .9 0 1 1 0 -1.8 M5.9 10.9 l1.7 -2.2 1.6 2.2 1.4 -1.6 1.4 1.6" />,
    binary: <Glyph d="M6.7 7.9 h.9 v.9 h-.9 z M9.1 7.9 h.9 v.9 h-.9 z M6.7 10.1 h.9 v.9 h-.9 z M9.1 10.1 h.9 v.9 h-.9 z" />
  }[glyph];
  return (
    <svg className="si-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={DOC} {...STROKE} />
      <path d={FOLD} {...STROKE} />
      {inner}
    </svg>
  );
}

export function ChevronIcon({ open }: { open?: boolean }): ReactNode {
  return (
    <svg
      className={`si-chevron ${open ? "open" : ""}`}
      viewBox="0 0 10 10"
      width="10"
      height="10"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.4 3.6 l2.6 2.6 -2.6 2.6" {...STROKE} strokeWidth={1.5} />
    </svg>
  );
}

export function PlusIcon(): ReactNode {
  return (
    <svg className="si-mini" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M8 3.8 v8.4 M3.8 8 h8.4" {...STROKE} />
    </svg>
  );
}

export function FolderPlusIcon(): ReactNode {
  return (
    <svg className="si-mini" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M2.5 4.5 c0 -.6 .4 -1 1 -1 h3.1 l1.6 2 h5.3 c.6 0 1 .4 1 1 v4.5 c0 .6 -.4 1 -1 1 h-10 c-.6 0 -1 -.4 -1 -1 z" {...STROKE} />
      <path d="M5.6 8.5 h4.8 M8 6.3 v4.4" {...STROKE} />
    </svg>
  );
}

export function EllipsisIcon(): ReactNode {
  return (
    <svg className="si-mini" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4.1 8 a.8 .8 0 1 1 1.6 0 a.8 .8 0 1 1 -1.6 0 M7.2 8 a.8 .8 0 1 1 1.6 0 a.8 .8 0 1 1 -1.6 0 M10.3 8 a.8 .8 0 1 1 1.6 0 a.8 .8 0 1 1 -1.6 0" {...STROKE} />
    </svg>
  );
}

export function PencilIcon(): ReactNode {
  return (
    <svg className="si-mini" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4.9 11.3 l.5 -2 4.4 -4.4 a.9 .9 0 0 1 1.3 0 l.9 .9 a.9 .9 0 0 1 0 1.3 l-4.4 4.4 -2 .5 z" {...STROKE} />
    </svg>
  );
}

export function TrashIcon(): ReactNode {
  return (
    <svg className="si-mini" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M5.3 4.9 h5.4 M5.8 4.9 l.4 -1.1 h3.6 l.4 1.1 M5.6 6 l.5 5.6 a1 1 0 0 0 1 .9 h1.8 a1 1 0 0 0 1 -.9 l.5 -5.6" {...STROKE} />
      <path d="M7.1 7.4 v2.5 M8.9 7.4 v2.5" {...STROKE} />
    </svg>
  );
}
