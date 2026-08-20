import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCtxMenu, useStore } from "../store";
import { ChevronIcon, EllipsisIcon, FileIcon, FolderPlusIcon, PencilIcon, PlusIcon, TrashIcon } from "./FileIcons";
import { ShellMark } from "./ShellMark";
import { droppedFilePaths, isExternalFileDrag } from "../drop";
import type { TreeEntry } from "@shared/types";

const EMPTY_HIDDEN_PATHS = new Set<string>();

function canDrop(source: string, target: string): boolean {
  if (!source || source === target) return false;
  const parent = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : "";
  if (parent === target) return false;
  return !target.startsWith(`${source}/`);
}

interface DragHandlers {
  dragPath: string | null;
  dropDir: string | null;
  isExternalDrop: (e: React.DragEvent) => boolean;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDragEnd: () => void;
  onDirDragOver: (e: React.DragEvent, dir: string) => void;
  onDirDrop: (e: React.DragEvent, dir: string) => void;
}

function RowActions({ entry }: { entry: TreeEntry }): ReactNode {
  const { startCreate } = useStore();
  const { openCtxMenu } = useCtxMenu();
  const parent =
    entry.type === "directory"
      ? entry.path
      : entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/"))
        : "";
  const menu = (e: Pick<React.MouseEvent, "clientX" | "clientY" | "stopPropagation">): void => {
    e.stopPropagation();
    openCtxMenu(e.clientX, e.clientY, entry);
  };
  return (
    <span className="tree-row-actions">
      <button
        type="button"
        className="tree-row-action"
        title="New File"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          startCreate(parent, "file");
        }}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className="tree-row-action"
        title="New Folder"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          startCreate(parent, "dir");
        }}
      >
        <FolderPlusIcon />
      </button>
      <button
        type="button"
        className="tree-row-action"
        title="More actions…"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          menu(e);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <EllipsisIcon />
      </button>
    </span>
  );
}

function DirNode({
  entry,
  depth,
  drag,
  hiddenPaths
}: {
  entry: TreeEntry;
  depth: number;
  drag: DragHandlers;
  hiddenPaths: Set<string>;
}): ReactNode {
  const {
    expanded,
    tree,
    toggleDir,
    agentFiles,
    pendingRename,
    pendingCreate,
    commitName,
    cancelPending
  } = useStore();
  const { openCtxMenu } = useCtxMenu();
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
        className={`tree-row dir ${isOpen ? "open" : ""} ${drag.dropDir === entry.path ? "drop-target" : ""}`}
        draggable
        onClick={() => void toggleDir(entry.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          openCtxMenu(e.clientX, e.clientY, entry);
        }}
        onDragStart={(e) => drag.onDragStart(e, entry.path)}
        onDragEnd={drag.onDragEnd}
        onDragOver={(e) => drag.onDirDragOver(e, entry.path)}
        onDrop={(e) => drag.onDirDrop(e, entry.path)}
      >
        <FileIcon name={entry.path.split("/").pop() ?? ""} isDir open={isOpen} />
        <span className="tree-name">{entry.path.split("/").pop()}</span>
        {hasChanges && <span className="tree-badge" />}
        <RowActions entry={entry} />
      </div>
      {isOpen && (
        <div className="tree-children">
          {(tree[entry.path] ?? []).filter((child) => !hiddenPaths.has(child.path)).map((child) =>
            child.type === "directory" ? (
              <DirNode key={child.path} entry={child} depth={depth + 1} drag={drag} hiddenPaths={hiddenPaths} />
            ) : (
              <FileNode key={child.path} entry={child} depth={depth + 1} drag={drag} />
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

function FileNode({
  entry,
  depth,
  drag
}: {
  entry: TreeEntry;
  depth: number;
  drag: DragHandlers;
}): ReactNode {
  const { openFile, activePath, agentFiles, pendingRename, commitName, cancelPending } =
    useStore();
  const { openCtxMenu } = useCtxMenu();
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
      draggable
      onClick={() => void openFile(entry.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        openCtxMenu(e.clientX, e.clientY, entry);
      }}
      onDragStart={(e) => drag.onDragStart(e, entry.path)}
      onDragEnd={drag.onDragEnd}
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
  const { startCreate, startRename, deleteEntry, removeFromWorkspace } = useStore();
  const { ctxMenu, closeCtxMenu } = useCtxMenu();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeCtxMenu();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeCtxMenu();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
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
        <PlusIcon />
        New File…
      </button>
      <button className="ctx-item" onClick={() => startCreate(parent, "dir")}>
        <FolderPlusIcon />
        New Folder…
      </button>
      {target && (
        <>
          <div className="ctx-sep" />
          {target.type === "file" && (
            <button className="ctx-item" onClick={() => startRename(target.path)}>
              <PencilIcon />
              Rename…
            </button>
          )}
          <button className="ctx-item" onClick={() => removeFromWorkspace(target.path)}>
            Remove from Workspace
          </button>
          <button className="ctx-item danger" onClick={() => void deleteEntry(target.path)}>
            <TrashIcon />
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
    panels = [],
    focusSession,
    selectFolder,
    tree,
    toggleDir,
    ensureRootOpen,
    agentFiles,
    openFile,
    expanded,
    pendingCreate,
    commitName,
    cancelPending,
    moveEntry,
    startCreate,
    singleFile,
    importPaths,
    dropIntoExplorer,
    addModelPanel,
    hiddenPaths = EMPTY_HIDDEN_PATHS
  } = useStore();
  const { openCtxMenu } = useCtxMenu();
  const [changesOpen, setChangesOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [changesH, changesDrag] = useChangesDrag(200);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropDir, setDropDir] = useState<string | null>(null);
  const [externalDrop, setExternalDrop] = useState(false);
  const root = tree[""] ?? [];
  const loadedSessionKey = useRef<string | null>(null);

  useEffect(() => {
    const key = session ? `${session.id}::${session.directory}` : null;
    if (key && loadedSessionKey.current !== key) {
      loadedSessionKey.current = key;
      void ensureRootOpen();
    } else if (!key) {
      loadedSessionKey.current = null;
    }
  }, [session, ensureRootOpen]);

  const drag: DragHandlers = {
    dragPath,
    dropDir,
    isExternalDrop: isExternalFileDrag,
    onDragStart: (e, path) => {
      if ((e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", path);
      e.dataTransfer.effectAllowed = "move";
      setDragPath(path);
    },
    onDragEnd: () => {
      setDragPath(null);
      setDropDir(null);
    },
    onDirDragOver: (e, dir) => {
      if (drag.isExternalDrop(e)) {
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropDir(dir);
        setExternalDrop(true);
        return;
      }
      if (!dragPath) return;
      e.stopPropagation();
      if (!canDrop(dragPath, dir)) {
        setDropDir(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropDir(dir);
    },
    onDirDrop: (e, dir) => {
      e.preventDefault();
      const external = droppedFilePaths(e);
      setDragPath(null);
      setDropDir(null);
      setExternalDrop(false);
      if (external.length > 0) {
        void (dir === "" ? dropIntoExplorer(external) : importPaths(dir, external));
        return;
      }
      const source = dragPath;
      if (!source || !canDrop(source, dir)) return;
      void moveEntry(source, dir);
    }
  };

  const onTreeDragOver = (e: React.DragEvent): void => {
    if (!dragPath && !drag.isExternalDrop(e)) return;
    if (drag.isExternalDrop(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropDir(null);
      setExternalDrop(true);
      return;
    }
    if ((e.target as HTMLElement).closest(".tree-row")) {
      setDropDir(null);
      return;
    }
    if (!dragPath) return;
    if (!canDrop(dragPath, "")) {
      setDropDir(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropDir("");
  };

  const onTreeDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    const external = droppedFilePaths(e);
    if (external.length === 0 && (e.target as HTMLElement).closest(".tree-row")) return;
    setDragPath(null);
    setDropDir(null);
    setExternalDrop(false);
    if (external.length > 0) {
      if (!expanded.has("")) {
        void Promise.all(external.map((path) => addModelPanel(path)));
        return;
      }
      void dropIntoExplorer(external);
      return;
    }
    const source = dragPath;
    if (!source || !canDrop(source, "")) return;
    void moveEntry(source, "");
  };

  const onTreeDragEnter = (e: React.DragEvent): void => {
    if (drag.isExternalDrop(e)) setExternalDrop(true);
  };

  const onTreeDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setExternalDrop(false);
      setDropDir(null);
    }
  };

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
          <ShellMark size={20} />
        </button>
      </div>
    );
  }

  if (singleFile && session) {
    const name = singleFile.split("/").pop() ?? singleFile;
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title" title={`${session.directory}/${singleFile}`}>
            <span className="sidebar-title-dot" aria-hidden />
            <span className="sidebar-title-name">{name}</span>
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
          <span className="section-toggle open">FILE</span>
        </div>
        <div className="sidebar-section explorer">
          <div
             className={`tree ${externalDrop ? "external-drop-active" : ""}`}
             onDragEnter={onTreeDragEnter}
             onDragOver={onTreeDragOver}
             onDrop={onTreeDrop}
             onDragLeave={onTreeDragLeave}
            onContextMenu={(e) => {
              e.preventDefault();
              openCtxMenu(e.clientX, e.clientY, null);
            }}
          >
            <div
              className="tree-row file active"
              onClick={() => void openFile(singleFile)}
              title={singleFile}
            >
              <FileIcon name={name} isDir={false} />
              <span className="tree-name">{name}</span>
            </div>
          </div>
        </div>
        <ExplorerMenu />
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title" title={session?.directory}>
          <span className="sidebar-title-dot" aria-hidden />
          <span className="sidebar-title-name">
            {session?.directory.split("/").filter(Boolean).pop() ?? "workspace"}
          </span>
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
          <span className="section-chevron">
            <ChevronIcon open={changesOpen} />
          </span>
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
                    title={state.baseline.kind === "unknown" ? `${path} · pre-change content unavailable` : path}
                  >
                    <FileIcon name={name} isDir={false} />
                    <span className="tree-name">
                      {name}
                      {dir && <span className="tree-dir-suffix"> · {dir}</span>}
                    </span>
                    <span className={`tree-meta ${state.deleted ? "deleted" : ""}`}>
                      {state.deleted ? "deleted" : state.baseline.kind === "unknown" ? "observed" : "modified"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sidebar-vdivider" onMouseDown={changesDrag} title="Drag to resize changes panel" />
        </>
      )}

      <div className="section-trigger with-actions">
        <button
          className={`section-toggle ${explorerOpen ? "open" : ""}`}
          aria-expanded={explorerOpen}
          onClick={() => setExplorerOpen((o) => !o)}
        >
          <span>EXPLORER</span>
          <span className="section-chevron push">
            <ChevronIcon open={explorerOpen} />
          </span>
        </button>
        <span className="section-actions">
          <button
            className="tree-row-action"
            title="New File"
            onClick={() => startCreate("", "file")}
          >
            <PlusIcon />
          </button>
          <button
            className="tree-row-action"
            title="New Folder"
            onClick={() => startCreate("", "dir")}
          >
            <FolderPlusIcon />
          </button>
        </span>
      </div>
      {explorerOpen && (
        <div className="sidebar-section explorer">
          <div
             className={`tree ${dropDir === "" && !externalDrop ? "drop-root" : ""} ${externalDrop ? "external-drop-active" : ""}`}
             onDragEnter={onTreeDragEnter}
             onDragOver={onTreeDragOver}
             onDrop={onTreeDrop}
             onDragLeave={onTreeDragLeave}
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest(".tree-row")) return;
              e.preventDefault();
              openCtxMenu(e.clientX, e.clientY, null);
            }}
          >
            {root.length === 0 && !expanded.has("") && <div className="tree-empty">Loading…</div>}
            <div
              className={`tree-row dir workspace-root ${expanded.has("") ? "open" : ""} ${dropDir === "" ? "drop-target" : ""}`}
              onClick={() => void toggleDir("")}
              onDragOver={(e) => drag.onDirDragOver(e, "")}
              onDrop={(e) => drag.onDirDrop(e, "")}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openCtxMenu(e.clientX, e.clientY, null);
              }}
              onDragLeave={(e) => {
                if (drag.isExternalDrop(e)) setDropDir(null);
              }}
              title={session?.directory}
            >
              <FileIcon name={session?.directory ?? "workspace"} isDir open={expanded.has("")} />
              <span className="tree-name">{session?.directory.split("/").filter(Boolean).pop() ?? "workspace"}</span>
            </div>
            {expanded.has("") && root.filter((child) => !hiddenPaths.has(child.path)).map((child) =>
              child.type === "directory" ? (
                <DirNode key={child.path} entry={child} depth={0} drag={drag} hiddenPaths={hiddenPaths} />
              ) : (
                <FileNode key={child.path} entry={child} depth={0} drag={drag} />
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
            {panels.filter((panel) => panel.id !== session?.id).map((panel) => (
              <div
                key={panel.id}
                className="tree-row dir workspace-root"
                onClick={() => focusSession(panel.id)}
                title={panel.directory}
              >
                <FileIcon name={panel.directory} isDir />
                <span className="tree-name">{panel.directory.split("/").filter(Boolean).pop() ?? "workspace"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ExplorerMenu />
    </div>
  );
}
