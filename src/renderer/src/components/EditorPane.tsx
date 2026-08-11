import { useEffect, useMemo, type ReactNode } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { languageForPath } from "../monaco";
import { useStore } from "../store";
import type { Tab } from "@shared/types";

const EDITOR_OPTIONS = {
  fontSize: 13,
  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
  minimap: { enabled: false },
  automaticLayout: true,
  tabSize: 2,
  wordWrap: "off" as const,
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
          tab.baseline !== null && !tab.deleted && tab.baseline !== tab.content;
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
  const { editContent, setTabMode, saveTab } = useStore();

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
  const diffAvailable = tab.baseline !== null;
  const mode = tab.mode === "diff" && !diffAvailable ? "edit" : tab.mode;

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
        </div>
      </div>

      {tab.deleted && (
        <div className="deleted-banner">
          This file was deleted from disk while you were viewing it.
        </div>
      )}

      {mode === "diff" ? (
        <DiffEditor
          theme="openshell-dark"
          language={language}
          original={tab.baseline ?? ""}
          modified={tab.content}
          options={{
            ...EDITOR_OPTIONS,
            readOnly: true,
            renderSideBySide: true,
            ignoreTrimWhitespace: false,
            enableSplitViewResizing: true
          }}
        />
      ) : (
        <Editor
          theme="openshell-dark"
          language={language}
          path={tab.path}
          value={tab.content}
          options={EDITOR_OPTIONS}
          onChange={(value) => {
            if (value !== undefined) editContent(tab.path, value);
          }}
        />
      )}
    </div>
  );
}

export function EditorPane(): ReactNode {
  const { tabs, activePath } = useStore();
  const activeTab = tabs.find((t) => t.path === activePath);

  return (
    <div className="editor-pane">
      {tabs.length === 0 ? (
        <div className="editor-empty">
          <div className="editor-empty-icon">⌘</div>
          <p>Select a file from the explorer to view or edit it.</p>
          <p className="editor-empty-sub">
            Files the agent changes appear under <b>Changes</b> and open in the diff view.
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
