import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { TreeEntry } from "@shared/types";

const FILE_ICONS: Record<string, [string, string]> = {
  ts: ["codicon-file-code", "#569cd6"],
  tsx: ["codicon-file-code", "#569cd6"],
  js: ["codicon-file-code", "#e8c766"],
  jsx: ["codicon-file-code", "#e8c766"],
  mjs: ["codicon-file-code", "#e8c766"],
  cjs: ["codicon-file-code", "#e8c766"],
  json: ["codicon-json", "#cbcb41"],
  jsonc: ["codicon-json", "#cbcb41"],
  md: ["codicon-markdown", "#519aba"],
  mdx: ["codicon-markdown", "#519aba"],
  css: ["codicon-symbol-color", "#42a5f5"],
  scss: ["codicon-symbol-color", "#cf649a"],
  less: ["codicon-symbol-color", "#42a5f5"],
  html: ["codicon-file-code", "#e44d26"],
  py: ["codicon-python", "#4b8bbe"],
  go: ["codicon-file-code", "#00add8"],
  rs: ["codicon-file-code", "#dea584"],
  rb: ["codicon-file-code", "#cc342d"],
  java: ["codicon-file-code", "#e76f00"],
  kt: ["codicon-file-code", "#7f52ff"],
  c: ["codicon-file-code", "#5c6bc0"],
  h: ["codicon-file-code", "#5c6bc0"],
  cpp: ["codicon-file-code", "#5c6bc0"],
  cs: ["codicon-file-code", "#68217a"],
  php: ["codicon-file-code", "#787cb4"],
  sh: ["codicon-terminal", "#89e051"],
  zsh: ["codicon-terminal", "#89e051"],
  bash: ["codicon-terminal", "#89e051"],
  sql: ["codicon-database", "#e38c00"],
  yml: ["codicon-file-code", "#cb171e"],
  yaml: ["codicon-file-code", "#cb171e"],
  toml: ["codicon-file-code", "#9f9f9f"],
  xml: ["codicon-file-code", "#e8a33d"],
  txt: ["codicon-file-text", "#9aa0a6"],
  log: ["codicon-file-text", "#9aa0a6"],
  csv: ["codicon-file-text", "#9aa0a6"],
  ini: ["codicon-file-text", "#9aa0a6"],
  conf: ["codicon-file-text", "#9aa0a6"],
  env: ["codicon-file-text", "#9aa0a6"],
  gitignore: ["codicon-file-text", "#9aa0a6"],
  png: ["codicon-file-media", "#9aa0a6"],
  jpg: ["codicon-file-media", "#9aa0a6"],
  jpeg: ["codicon-file-media", "#9aa0a6"],
  gif: ["codicon-file-media", "#9aa0a6"],
  svg: ["codicon-file-media", "#9aa0a6"],
  webp: ["codicon-file-media", "#9aa0a6"],
  ico: ["codicon-file-media", "#9aa0a6"],
  pdf: ["codicon-file-pdf", "#f85149"],
  zip: ["codicon-file-zip", "#9aa0a6"],
  tar: ["codicon-file-zip", "#9aa0a6"],
  gz: ["codicon-file-zip", "#9aa0a6"],
  tgz: ["codicon-file-zip", "#9aa0a6"],
  dmg: ["codicon-file-zip", "#9aa0a6"],
  pkg: ["codicon-file-zip", "#9aa0a6"],
  bin: ["codicon-file-binary", "#9aa0a6"],
  exe: ["codicon-file-binary", "#9aa0a6"],
  dll: ["codicon-file-binary", "#9aa0a6"],
  so: ["codicon-file-binary", "#9aa0a6"],
  dylib: ["codicon-file-binary", "#9aa0a6"]
};

function fileIcon(name: string): [string, string] {
  if (name.includes(".")) {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const hit = FILE_ICONS[ext];
    if (hit) return hit;
  }
  return FILE_ICONS[name.toLowerCase()] ?? ["codicon-file", "#8b8b94"];
}

function FileIcon({ name, isDir, open }: { name: string; isDir: boolean; open?: boolean }): ReactNode {
  if (isDir) {
    return (
      <span className={`fdir ${open ? "open" : ""}`}>
        <span className={`codicon ${open ? "codicon-folder-opened" : "codicon-folder"}`} />
      </span>
    );
  }
  const [icon, color] = fileIcon(name);
  return <span className={`codicon ffile ${icon}`} style={{ color }} />;
}

function DirNode({ entry, depth }: { entry: TreeEntry; depth: number }): ReactNode {
  const { expanded, tree, toggleDir, agentFiles } = useStore();
  const isOpen = expanded.has(entry.path);
  const hasChanges = entry.path.split("/").some((_, i) => {
    const prefix = entry.path.split("/").slice(0, i + 1).join("/");
    return agentFiles.has(prefix);
  });

  return (
    <div>
      <div
        className={`tree-row dir ${isOpen ? "open" : ""}`}
        style={{ paddingLeft: 8 }}
        onClick={() => void toggleDir(entry.path)}
      >
        <FileIcon name={entry.path.split("/").pop() ?? ""} isDir open={isOpen} />
        <span className="tree-name">{entry.path.split("/").pop()}</span>
        {hasChanges && <span className="tree-badge" />}
      </div>
      {isOpen && (
        <div className="tree-children">
          {(tree[entry.path] ?? []).map((child) =>
            child.type === "directory" ? (
              <DirNode key={child.path} entry={child} depth={depth + 1} />
            ) : (
              <FileNode key={child.path} entry={child} depth={depth + 1} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({ entry, depth }: { entry: TreeEntry; depth: number }): ReactNode {
  const { openFile, activePath, agentFiles } = useStore();
  const name = entry.path.split("/").pop() ?? entry.path;
  const changed = agentFiles.has(entry.path);
  const active = activePath === entry.path;

  return (
    <div
      className={`tree-row file ${active ? "active" : ""}`}
      style={{ paddingLeft: 8 }}
      onClick={() => void openFile(entry.path)}
      title={entry.path}
    >
      <FileIcon name={name} isDir={false} />
      <span className="tree-name">{name}</span>
      {changed && <span className="tree-badge changed" />}
    </div>
  );
}

function useChangesDrag(initial: number): [number, (e: React.MouseEvent) => void] {
  const [height, setHeight] = useState(initial);
  const startRef = useRef<{ y: number; height: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    startRef.current = { y: e.clientY, height };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dy = ev.clientY - startRef.current.y;
      setHeight(Math.min(520, Math.max(90, startRef.current.height + dy)));
    };
    const up = (): void => {
      startRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return [height, onMouseDown];
}

export function FileSidebar(): ReactNode {
  const { session, selectFolder, tree, toggleDir, agentFiles, openFile, expanded } = useStore();
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesH, changesDrag] = useChangesDrag(200);
  const root = tree[""] ?? [];
  const loadedSessionKey = useRef<string | null>(null);

  useEffect(() => {
    const key = session ? `${session.id}::${session.directory}` : null;
    if (key && loadedSessionKey.current !== key) {
      loadedSessionKey.current = key;
      void toggleDir("");
    }
  }, [session, toggleDir]);

  const changes = [...agentFiles.entries()];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title" title={session?.directory}>
          {session?.directory.split("/").filter(Boolean).pop() ?? "workspace"}
        </span>
        <button className="icon-btn" title="Switch folder" onClick={() => void selectFolder()}>
          ⧉
        </button>
      </div>

      {changes.length > 0 && (
        <>
          <div className="changes-trigger">
            <button
              className={`changes-toggle ${changesOpen ? "open" : ""}`}
              aria-expanded={changesOpen}
              onClick={() => setChangesOpen((o) => !o)}
            >
              <span>CHANGES</span>
              <span className="sidebar-count">{changes.length}</span>
              <span className={`codicon ${changesOpen ? "codicon-chevron-up" : "codicon-chevron-down"}`} />
            </button>
          </div>
          {changesOpen && (
            <>
              <div className="sidebar-section changes" style={{ height: changesH }}>
                <div className="changes-list">
                  {changes.map(([path, state]) => {
                    const name = path.split("/").pop() ?? path;
                    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
                    return (
                      <div
                        key={path}
                        className={`tree-row file ${state.deleted ? "deleted" : ""}`}
                        onClick={() => void openFile(path, { mode: "diff" })}
                        title={path}
                      >
                        <FileIcon name={name} isDir={false} />
                        <span className="tree-name">
                          {name}
                          {dir && <span className="tree-dir-suffix"> · {dir}</span>}
                        </span>
                        <span className={`tree-meta ${state.deleted ? "deleted" : ""}`}>
                          {state.deleted ? "deleted" : "modified"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="sidebar-vdivider" onMouseDown={changesDrag} title="Drag to resize changes panel" />
            </>
          )}
        </>
      )}

      <div className="sidebar-section explorer">
        <div className="sidebar-section-title">
          <span>EXPLORER</span>
        </div>
        <div className="tree">
          {root.length === 0 && !expanded.has("") && <div className="tree-empty">Loading…</div>}
          {root.map((child) =>
            child.type === "directory" ? (
              <DirNode key={child.path} entry={child} depth={0} />
            ) : (
              <FileNode key={child.path} entry={child} depth={0} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
