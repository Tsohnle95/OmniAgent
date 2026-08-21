import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { ProjectInfo, SessionSummary } from "@shared/types";
import { ChevronIcon } from "./FileIcons";
import { IconClose, IconFolder, IconHistory } from "./icons";

function formatWhen(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function dirName(directory: string): string {
  return directory.split(/[\\/]/).filter(Boolean).pop() ?? directory;
}

function groupByWorkspace(sessions: SessionSummary[]): [string, SessionSummary[]][] {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const group = groups.get(s.directory);
    if (group) group.push(s);
    else groups.set(s.directory, [s]);
  }
  return [...groups.entries()];
}

export function SessionsTab({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const {
    panels,
    panelViews,
    activeSessionID,
    focusSession,
    closePanel,
    reopenSession,
    openSession,
    sessions,
    loadSessions
  } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [recentOpen, setRecentOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    void loadSessions();
    void window.openshell
      .projects()
      .then((p) => setProjects(p))
      .catch(() => setProjects([]));
  }, [open, loadSessions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runningSessions = new Set(panels.map((panel) => panel.id));

  return (
    <aside className="sessions-rail" aria-label="Sessions">
      <div className="sessions-rail-head">
        <span className="sessions-rail-title">Sessions</span>
        <button className="icon-btn" title="Close sessions panel" onClick={onClose}>
          <IconClose />
        </button>
      </div>

      {panels.length > 0 && (
        <section className="sessions-section">
          <div className="sessions-section-title">Running</div>
          {panels.map((panel) => {
            const view = panelViews[panel.workspace.id];
            const focused = panel.id === activeSessionID;
            const title = panel.title ?? panel.directory.split(/[\\/]/).filter(Boolean).pop() ?? panel.directory;
            return (
              <div
                key={panel.workspace.id}
                className={`sessions-row ${focused ? "focused" : ""}`}
                onClick={() => {
                  focusSession(panel.id);
                  onClose();
                }}
              >
                <span className={`agent-dot live ${view?.busy ? "busy" : ""}`} />
                <span className="sessions-row-main">
                  <span className="sessions-row-title">{title}</span>
                  <span className="sessions-row-meta" title={panel.directory}>{panel.directory}</span>
                </span>
                <button
                  className="sessions-row-close"
                  title={`Close the ${title} panel`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePanel(panel.id);
                  }}
                >
                  <IconClose />
                </button>
              </div>
            );
          })}
        </section>
      )}

      <section className="sessions-section">
        <div className="section-trigger">
          <button
            className={`section-toggle ${recentOpen ? "open" : ""}`}
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen((o) => !o)}
          >
            <span>Recent sessions</span>
            <span className="sidebar-count push">{sessions.length}</span>
            <span className="section-chevron">
              <ChevronIcon open={recentOpen} />
            </span>
          </button>
        </div>
        {recentOpen && (
          sessions.length === 0 ? (
            <div className="sessions-empty">No recent sessions yet.</div>
          ) : (
            groupByWorkspace(sessions).map(([directory, group]) => (
              <div key={directory} className="sessions-group">
                <div className="sessions-group-title" title={directory}>{dirName(directory)}</div>
                {group.map((s) => (
                  <div
                    key={s.id}
                    className={`sessions-row ${runningSessions.has(s.id) ? "running" : ""}`}
                    onClick={() => {
                      if (runningSessions.has(s.id)) focusSession(s.id);
                      else void reopenSession(s.id);
                      onClose();
                    }}
                    title={s.directory}
                  >
                    <IconHistory className="sessions-row-icon" />
                    <span className="sessions-row-main">
                      <span className="sessions-row-title">{s.title}</span>
                      <span className="sessions-row-meta">{formatWhen(s.updatedAt)} · {s.directory}</span>
                    </span>
                    {runningSessions.has(s.id) && <span className="sessions-row-badge">open</span>}
                  </div>
                ))}
              </div>
            ))
          )
        )}
      </section>

      <section className="sessions-section">
        <div className="section-trigger">
          <button
            className={`section-toggle ${savedOpen ? "open" : ""}`}
            aria-expanded={savedOpen}
            onClick={() => setSavedOpen((o) => !o)}
          >
            <span>Saved workspaces</span>
            <span className="sidebar-count push">{projects.length}</span>
            <span className="section-chevron">
              <ChevronIcon open={savedOpen} />
            </span>
          </button>
        </div>
        {savedOpen && (
          projects.length === 0 ? (
            <div className="sessions-empty">No saved workspaces found.</div>
          ) : (
            projects.map((p) => (
              <div
                key={p.directory}
                className="sessions-row"
                onClick={() => {
                  void openSession(p.directory);
                  onClose();
                }}
                title={p.directory}
              >
                <IconFolder className="sessions-row-icon" />
                <span className="sessions-row-main">
                  <span className="sessions-row-title">{p.name}</span>
                  <span className="sessions-row-meta">{p.directory}</span>
                </span>
              </div>
            ))
          )
        )}
      </section>
    </aside>
  );
}
