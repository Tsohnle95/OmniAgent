import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { languageForPath } from "../monaco";
import { wireEmmetKeys } from "../emmet-keys";
import { clearW3cMarkers } from "../w3c-validation";
import { useStore } from "../store";
import { registerEditor, unregisterEditor } from "../reveal";
import { droppedFilePaths, isExternalFileDrag } from "../drop";
import type { Tab } from "@shared/types";

const EDITOR_OPTIONS = {
  fontSize: 13,
  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
  minimap: { enabled: false },
  automaticLayout: true,
  tabSize: 2,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: "smooth" as const,
  padding: { top: 10, bottom: 10 },
  renderWhitespace: "none" as const,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
};

function TabBar(): ReactNode {
  const { tabs, activePath, setActive, closeTab, setTabMode } = useStore();

  return (
    <div className="tabbar">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const hasDiff =
          tab.baseline?.kind === "known" && !tab.deleted && tab.baseline.content !== tab.content;
        return (
          <div
            key={tab.path}
            className={`tab ${active ? "active" : ""}`}
            onClick={() => setActive(tab.path)}
            title={tab.path}
          >
            <span className="tab-name">
              {tab.dirty && <span className="tab-dirty" />}
              {tab.name}
            </span>
            <span className="tab-actions">
              {hasDiff && (
                <span
                  className="tab-diff-badge"
                  title="Toggle diff view"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTabMode(tab.path, active && tab.mode === "diff" ? "edit" : "diff");
                  }}
                >
                  ⇄
                </span>
              )}
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
              >
                ×
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EditorWithSave({ tab }: { tab: Tab }): ReactNode {
  const {
    editContent,
    setTabMode,
    saveTab,
    reloadTab,
    overwriteTab,
    mergeTab,
    wordWrap,
    toggleWordWrap
  } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveTab(tab.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveTab, tab.path]);

  const language = useMemo(() => languageForPath(tab.path), [tab.path]);
  const w3cFile = useMemo(() => /\.(?:html?|css)$/i.test(tab.path), [tab.path]);
  const diffAvailable = tab.baseline?.kind === "known";
  const diffUnknown = tab.baseline?.kind === "unknown";
  const mode = tab.mode === "diff" && !diffAvailable ? "edit" : tab.mode;
  const options = useMemo(
    () => ({ ...EDITOR_OPTIONS, wordWrap: (wordWrap ? "on" : "off") as "on" | "off" }),
    [wordWrap]
  );

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!w3cFile) return;
    clearW3cMarkers(tab.path);
    return () => clearW3cMarkers(tab.path);
  }, [tab.content, tab.path, w3cFile]);

  useEffect(() => () => unregisterEditor(tab.path), [tab.path]);

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        <div className="editor-toolbar-left">
          <span className="editor-path" title={tab.path}>
            {tab.path}
          </span>
          {tab.dirty && <span className="editor-dirty">unsaved</span>}
          {tab.stale && <span className="editor-stale">changed on disk</span>}
          {tab.deleted && <span className="editor-deleted">deleted on disk</span>}
        </div>
        <div className="editor-toolbar-right">
          <button
            className={`toolbar-btn ${wordWrap ? "on" : ""}`}
            title="Toggle word wrap (⌥Z)"
            onClick={toggleWordWrap}
          >
            Wrap
          </button>
          {diffAvailable && (
            <>
              <button
                className={`toolbar-btn ${mode === "edit" ? "on" : ""}`}
                onClick={() => setTabMode(tab.path, "edit")}
              >
                Edit
              </button>
              <button
                className={`toolbar-btn ${mode === "diff" ? "on" : ""}`}
                onClick={() => setTabMode(tab.path, "diff")}
              >
                Diff
              </button>
            </>
          )}
          {diffUnknown && (
            <button className="toolbar-btn" disabled title="Pre-change content was not observed">
              Diff unavailable
            </button>
          )}
        </div>
      </div>

      {tab.deleted && (
        <div className="deleted-banner">
          This file was deleted from disk while you were viewing it.
        </div>
      )}

      {tab.conflict && (
        <div className="conflict-banner">
          <span>
            {tab.conflict.deleted
              ? "This file was deleted outside OpenShell. Your edits are safe and saving is paused."
              : "This file changed outside OpenShell. Your edits are safe and saving is paused."}
          </span>
          <div className="conflict-actions">
            <button onClick={() => reloadTab(tab.path)}>Reload disk version</button>
            {tab.conflict.resolution === "pending" ? (
              <button onClick={() => mergeTab(tab.path)}>Keep editing to merge</button>
            ) : (
              <button onClick={() => void overwriteTab(tab.path)}>Save merged content</button>
            )}
            <button className="danger" onClick={() => void overwriteTab(tab.path)}>Overwrite disk</button>
          </div>
        </div>
      )}

      {mode === "diff" ? (
        <DiffEditor
          theme="openshell-dark"
          language={language}
          original={tab.baseline?.kind === "known" ? tab.baseline.content : ""}
          modified={tab.content}
          onMount={(ed) => registerEditor(tab.path, ed.getModifiedEditor())}
          options={{
            ...options,
            readOnly: true,
            renderSideBySide: false,
            ignoreTrimWhitespace: false,
            enableSplitViewResizing: false,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
          }}
        />
      ) : (
        <Editor
          theme="openshell-dark"
          language={language}
          path={tab.path}
          value={tab.content}
          onMount={(ed) => {
            editorRef.current = ed;
            registerEditor(tab.path, ed);
            wireEmmetKeys(ed);
          }}
          options={options}
          onChange={(value) => {
            if (value !== undefined) editContent(tab.path, value);
          }}
        />
      )}
    </div>
  );
}

export function EditorPane(): ReactNode {
  const { tabs, activePath, openExternalPath } = useStore();
  const activeTab = tabs.find((t) => t.path === activePath);
  const [externalDrag, setExternalDrag] = useState(false);

  const onDragOver = (e: React.DragEvent): void => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setExternalDrag(true);
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent): void => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setExternalDrag(false);
    for (const file of droppedFilePaths(e)) void openExternalPath(file);
  };
  const onDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExternalDrag(false);
  };

  return (
    <div
      className={`editor-pane ${externalDrag ? "external-drop-active" : ""}`}
      onDragOverCapture={onDragOver}
      onDropCapture={onDrop}
      onDragEnterCapture={onDragOver}
      onDragLeaveCapture={onDragLeave}
    >
      {tabs.length === 0 ? (
        <div className="editor-empty">
          <div className="editor-empty-icon">⌘</div>
          <p>Select a file from the explorer to view or edit it.</p>
          <p className="editor-empty-sub">
            Observed workspace file changes appear under <b>Changes</b>. A diff is shown when pre-change content is known.
          </p>
        </div>
      ) : (
        <>
          <TabBar />
          {activeTab ? <EditorWithSave key={activeTab.path} tab={activeTab} /> : null}
        </>
      )}
    </div>
  );
}
