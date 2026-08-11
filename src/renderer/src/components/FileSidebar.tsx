import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  return <span className={`codicon ffile ${icon}`} style={{ "--file-color": color } as CSSProperties} />;
}

function RowActions({ entry }: { entry: TreeEntry }): ReactNode {
  const { startCreate, openCtxMenu } = useStore();
  const parent =
    entry.type === "directory"
      ? entry.path
      : entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/"))
        : "";
  const menu = (e: React.MouseEvent): void => {
    e.stopPropagation();
    openCtxMenu(e.clientX, e.clientY, entry);
  };
  return (
    <span className="tree-row-actions">
      <button
        className="tree-row-action"
        title="New File"
        onClick={(e) => {
          e.stopPropagation();
          startCreate(parent, "file");
        }}
      >
        <span className="codicon codicon-new-file" />
      </button>
      <button
        className="tree-row-action"
        title="New Folder"
        onClick={(e) => {
          e.stopPropagation();
          startCreate(parent, "dir");
        }}
      >
        <span className="codicon codicon-new-folder" />
      </button>
      <button className="tree-row-action" title="More actions…" onClick={menu}>
        <span className="codicon codicon-more" />
      </button>
    </span>
  );
}

function DirNode({ entry, depth }: { entry: TreeEntry; depth: number }): ReactNode {
  const {
    expanded,
    tree,
    toggleDir,
    agentFiles,
    openCtxMenu,
    pendingRename,
    pendingCreate,
    commitName,
    cancelPending
  } = useStore();
  const isOpen = expanded.has(entry.path);
  const hasChanges = entry.path.split("/").some((_, i) => {
    const prefix = entry.path.split("/").slice(0, i + 1).join("/");
    return agentFiles.has(prefix);
  });

  if (pendingRename?.path === entry.path) {
    return (
      <TreeNameInput
        initial={entry.path.split("/").pop() ?? ""}
        isDir
        onCommit={(v) => void commitName(v)}
        onCancel={cancelPending}
      />
    );
  }

  return (
    <div>
      <div
        className={`tree-row dir ${isOpen ? "open" : ""}`}
        onClick={() => void toggleDir(entry.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          openCtxMenu(e.clientX, e.clientY, entry);
        }}
      >
        <FileIcon name={entry.path.split("/").pop() ?? ""} isDir open={isOpen} />
        <span className="tree-name">{entry.path.split("/").pop()}</span>
        {hasChanges && <span className="tree-badge" />}
        <RowActions entry={entry} />
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
          {pendingCreate?.parent === entry.path && (
            <TreeNameInput
              initial={pendingCreate.kind === "file" ? "untitled.txt" : "untitled folder"}
              isDir={pendingCreate.kind === "dir"}
              onCommit={(v) => void commitName(v)}
              onCancel={cancelPending}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({ entry, depth }: { entry: TreeEntry; depth: number }): ReactNode {
  const { openFile, activePath, agentFiles, openCtxMenu, pendingRename, commitName, cancelPending } =
    useStore();
  const name = entry.path.split("/").pop() ?? entry.path;
  const changed = agentFiles.has(entry.path);
  const active = activePath === entry.path;

  if (pendingRename?.path === entry.path) {
    return (
      <TreeNameInput
        initial={name}
        isDir={false}
        onCommit={(v) => void commitName(v)}
        onCancel={cancelPending}
      />
    );
  }

  return (
    <div
      className={`tree-row file ${active ? "active" : ""}`}
      onClick={() => void openFile(entry.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        openCtxMenu(e.clientX, e.clientY, entry);
      }}
      title={entry.path}
    >
      <FileIcon name={name} isDir={false} />
      <span className="tree-name">{name}</span>
      {changed && <span className="tree-badge changed" />}
      <RowActions entry={entry} />
    </div>
  );
}

function TreeNameInput({
  initial,
  isDir,
  onCommit,
  onCancel
}: {
  initial: string;
  isDir: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}): ReactNode {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="tree-row tree-input-row">
      <FileIcon name={value || initial} isDir={isDir} />
      <input
        ref={inputRef}
        className="tree-input"
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(value);
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={() => onCommit(value)}
      />
    </div>
  );
}

function ExplorerMenu(): ReactNode {
  const { ctxMenu, closeCtxMenu, startCreate, startRename, deleteEntry } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeCtxMenu();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeCtxMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;
  const target = ctxMenu.target;
  const parent = target
    ? target.type === "directory"
      ? target.path
      : target.path.includes("/")
        ? target.path.slice(0, target.path.lastIndexOf("/"))
        : ""
    : "";
  const left = Math.min(ctxMenu.x, window.innerWidth - 190);
  const top = Math.min(ctxMenu.y, window.innerHeight - 150);

  return (
    <div className="ctx-menu" ref={menuRef} style={{ left, top }}>
      <button className="ctx-item" onClick={() => startCreate(parent, "file")}>
        <span className="codicon codicon-new-file" />
        New File…
      </button>
      <button className="ctx-item" onClick={() => startCreate(parent, "dir")}>
        <span className="codicon codicon-new-folder" />
        New Folder…
      </button>
      {target && (
        <>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => startRename(target.path)}>
            <span className="codicon codicon-edit" />
            Rename…
          </button>
          <button className="ctx-item danger" onClick={() => void deleteEntry(target.path)}>
            <span className="codicon codicon-trash" />
            Delete
          </button>
        </>
      )}
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

export function FileSidebar({
  collapsed,
  onCollapse,
  onDrag
}: {
  collapsed: boolean;
  onCollapse: (open: boolean) => void;
  onDrag: (e: React.MouseEvent) => void;
}): ReactNode {
  const {
    session,
    selectFolder,
    tree,
    toggleDir,
    agentFiles,
    openFile,
    expanded,
    openCtxMenu,
    pendingCreate,
    commitName,
    cancelPending
  } = useStore();
  const [changesOpen, setChangesOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
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

  if (collapsed) {
    return (
      <div className="sidebar collapsed" onMouseDown={onDrag}>
        <button
          className="activity-btn"
          title="Explorer"
          onClick={() => {
            setExplorerOpen(true);
            onCollapse(true);
          }}
        >
          <span className="codicon codicon-files" />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title" title={session?.directory}>
          {session?.directory.split("/").filter(Boolean).pop() ?? "workspace"}
        </span>
        <span className="sidebar-header-actions">
          <button className="icon-btn" title="Collapse sidebar" onClick={() => onCollapse(false)}>
            «
          </button>
          <button className="icon-btn" title="Switch folder" onClick={() => void selectFolder()}>
            ⧉
          </button>
        </span>
      </div>

      <div className="section-trigger">
        <button
          className={`section-toggle ${changesOpen ? "open" : ""}`}
          aria-expanded={changesOpen}
          onClick={() => setChangesOpen((o) => !o)}
        >
          <span>CHANGES</span>
          <span className="sidebar-count push">{changes.length}</span>
          <span className={`codicon ${changesOpen ? "codicon-chevron-up" : "codicon-chevron-down"}`} />
        </button>
      </div>
      {changesOpen && (
        <>
          <div
            className="sidebar-section changes"
            style={{ "--changes-height": `${changesH}px` } as CSSProperties}
          >
            <div className="changes-list">
              {changes.length === 0 && <div className="tree-empty">No changes yet</div>}
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

      <div className="section-trigger">
        <button
          className={`section-toggle ${explorerOpen ? "open" : ""}`}
          aria-expanded={explorerOpen}
          onClick={() => setExplorerOpen((o) => !o)}
        >
          <span>EXPLORER</span>
          <span className={`codicon push ${explorerOpen ? "codicon-chevron-up" : "codicon-chevron-down"}`} />
        </button>
      </div>
      {explorerOpen && (
        <div className="sidebar-section explorer">
          <div
            className="tree"
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest(".tree-row")) return;
              e.preventDefault();
              openCtxMenu(e.clientX, e.clientY, null);
            }}
          >
            {root.length === 0 && !expanded.has("") && <div className="tree-empty">Loading…</div>}
            {root.map((child) =>
              child.type === "directory" ? (
                <DirNode key={child.path} entry={child} depth={0} />
              ) : (
                <FileNode key={child.path} entry={child} depth={0} />
              )
            )}
            {pendingCreate?.parent === "" && (
              <TreeNameInput
                initial={pendingCreate.kind === "file" ? "untitled.txt" : "untitled folder"}
                isDir={pendingCreate.kind === "dir"}
                onCommit={(v) => void commitName(v)}
                onCancel={cancelPending}
              />
            )}
          </div>
        </div>
      )}
      <ExplorerMenu />
    </div>
  );
}
