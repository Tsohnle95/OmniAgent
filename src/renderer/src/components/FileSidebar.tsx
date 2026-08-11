import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { TreeEntry } from "@shared/types";

const FILE_COLORS: Record<string, string> = {
  ts: "#3178c6", tsx: "#3178c6", js: "#e8c766", jsx: "#e8c766", mjs: "#e8c766",
  json: "#cbcb41", css: "#42a5f5", scss: "#cf649a", html: "#e44d26", md: "#7e9fd4",
  py: "#4b8bbe", go: "#00add8", rs: "#dea584", rb: "#cc342d", java: "#e76f00",
  c: "#5c6bc0", h: "#5c6bc0", cpp: "#5c6bc0", cs: "#68217a", php: "#787cb4",
  sh: "#89e051", yml: "#cb171e", yaml: "#cb171e", toml: "#9f9f9f", xml: "#e8a33d",
  sql: "#e38c00", dockerfile: "#2496ed", txt: "#9aa0a6", log: "#9aa0a6", gitignore: "#9aa0a6"
};

function fileColor(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return FILE_COLORS[ext] ?? FILE_COLORS[name.toLowerCase()] ?? "#9aa0a6";
}

function FileIcon({ name, isDir, open }: { name: string; isDir: boolean; open?: boolean }): ReactNode {
  if (isDir) {
    return <span className={`fdir ${open ? "open" : ""}`}>▸</span>;
  }
  return (
    <span className="fdot" style={{ backgroundColor: fileColor(name) }} />
  );
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
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => void toggleDir(entry.path)}
      >
        <FileIcon name={entry.path.split("/").pop() ?? ""} isDir open={isOpen} />
        <span className="tree-name">{entry.path.split("/").pop()}</span>
        {hasChanges && <span className="tree-badge" />}
      </div>
      {isOpen &&
        (tree[entry.path] ?? []).map((child) =>
          child.type === "directory" ? (
            <DirNode key={child.path} entry={child} depth={depth + 1} />
          ) : (
            <FileNode key={child.path} entry={child} depth={depth + 1} />
          )
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
      style={{ paddingLeft: 8 + depth * 14 }}
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
      const dy = startRef.current.y - ev.clientY;
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
  const [changesH, changesDrag] = useChangesDrag(200);
  const root = tree[""] ?? [];
  const rootLoaded = useRef(false);

  useEffect(() => {
    if (!rootLoaded.current && session) {
      rootLoaded.current = true;
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
          <div className="sidebar-section changes" style={{ height: changesH }}>
            <div className="sidebar-section-title">
              <span>CHANGES</span>
              <span className="sidebar-count">{changes.length}</span>
            </div>
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
