import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { droppedFilePaths } from "../drop";
import type { SessionSummary } from "@shared/types";

function formatWhen(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const LIVE_WINDOW_MS = 60 * 60 * 1000;
const MAX_WORKSPACE_KIDS = 4;

function Chev(): ReactNode {
  return (
    <svg className="chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M2 3.6 5 6.6 8 3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarkSvg(): ReactNode {
  return (
    <svg className="mark-svg" viewBox="0 0 96 96" width="36" height="36" aria-hidden="true">
      <g fill="none" strokeLinecap="round">
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(24 48 48)" stroke="color-mix(in srgb, var(--accent) 55%, var(--bg-panel))" strokeWidth="4.5" />
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(-24 48 48)" stroke="var(--accent)" strokeWidth="5" />
        <circle cx="48" cy="48" r="9" fill="color-mix(in srgb, var(--accent) 72%, var(--text))" />
        <circle cx="62.1" cy="28.3" r="6" fill="var(--accent)" opacity="0.75" />
      </g>
    </svg>
  );
}

function FolderGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
      <path d="M1.5 3.5h4l1.2 1.5h5.8v5.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

type WorkspaceGroup = { directory: string; sessions: SessionSummary[] };

function workspaceGroups(sessions: SessionSummary[]): WorkspaceGroup[] {
  const byDirectory = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const list = byDirectory.get(session.directory) ?? [];
    list.push(session);
    byDirectory.set(session.directory, list);
  }
  return [...byDirectory.entries()]
    .map(([directory, list]) => ({
      directory,
      sessions: list.sort((left, right) => right.updatedAt - left.updatedAt)
    }))
    .sort((left, right) => right.sessions[0].updatedAt - left.sessions[0].updatedAt);
}

export function Welcome(): ReactNode {
  const { selectFolder, openFileWorkspace, reopenSession, selectedRuntimeID } = useStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [closedSecs, setClosedSecs] = useState<Record<string, boolean>>({ recent: true, workspaces: true });

  useEffect(() => {
    void window.openshell
      .sessions()
      .then((s) => setSessions(s))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const runtimeSessions = sessions
    .filter((session) => (session.runtimeID ?? "opencode") === selectedRuntimeID)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const recentSessions = runtimeSessions.slice(0, 3);
  const groups = workspaceGroups(runtimeSessions);

  const toggleGroup = (key: string): void =>
    setOpenGroups((current) => ({ ...current, [key]: !(current[key] ?? true) }));

  const toggleSec = (key: string): void =>
    setClosedSecs((current) => ({ ...current, [key]: !(current[key] ?? false) }));

  const isLive = (session: SessionSummary): boolean => Date.now() - session.updatedAt < LIVE_WINDOW_MS;

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types || !Array.from(types as ArrayLike<string>).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const files = droppedFilePaths(e);
      if (files.length > 0) void openFileWorkspace(files[0]);
    }
  };

  return (
    <div className="welcome" data-drag-region {...dropHandlers}>
      <div className="mock sk-tglass">
        <div className="twin">
          <div className="hero-col">
            <MarkSvg />
            <h1 className="title">Orbit</h1>
            <p className="sub">One calm surface for coding agents.</p>
            <div className="cta-row">
              <button className="btn btn-primary" type="button" onClick={() => void selectFolder()}>
                Open a folder
              </button>
            </div>
          </div>

          <aside className="spanel" style={{ width: 248 }}>
            <div className={`sd-sec${closedSecs.recent ? " is-closed" : ""}`}>
              <button className="sd-sh style-dotcap" type="button" onClick={() => toggleSec("recent")}>
                <span className="sd-sh-label">Recent</span>
                <span className="sd-cnt">{recentSessions.length}</span>
                <Chev />
              </button>
              <div className="sd-body">
                {!loading && (
                  <ul className="num-list">
                    {recentSessions.map((session, index) => (
                      <li key={session.id} className={isLive(session) ? "is-live" : undefined}>
                        <button
                          className="rowlink"
                          type="button"
                          onClick={() => void reopenSession(session.id)}
                          title={session.directory}
                        >
                          <span className="num-i">{String(index + 1).padStart(2, "0")}</span>
                          <span className="num-name">{session.title}</span>
                          <span className="num-when">{formatWhen(session.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className={`sd-sec${closedSecs.workspaces ? " is-closed" : ""}`}>
              <button className="sd-sh style-dotcap" type="button" onClick={() => toggleSec("workspaces")}>
                <span className="sd-sh-label">Workspaces</span>
                <span className="sd-cnt">{groups.length}</span>
                <Chev />
              </button>
              <div className="sd-body">
                {!loading &&
                  groups.map((group, groupIndex) => {
                    const open = openGroups[group.directory] ?? (groups.length === 1 || groupIndex === 1);
                    return (
                      <div className={`sd-grp${open ? " is-open" : ""}`} key={group.directory}>
                        <button className="sd-wgh" type="button" onClick={() => toggleGroup(group.directory)} title={group.directory}>
                          <Chev />
                          <FolderGlyph />
                          <span className="sd-wgname">{group.directory.split("/").filter(Boolean).pop() || group.directory}</span>
                          <span className="sd-wgcnt">{group.sessions.length}</span>
                        </button>
                        <div className="sd-kids-wrap">
                          <ul className="rows sd-kids">
                            {group.sessions.slice(0, MAX_WORKSPACE_KIDS).map((session) => (
                              <li key={session.id} className={`row${isLive(session) ? " is-live" : ""}`}>
                                <button
                                  className="rowlink"
                                  type="button"
                                  onClick={() => void reopenSession(session.id)}
                                  title={session.title}
                                >
                                  <span className="row-dot" />
                                  <span className="row-name">{session.title}</span>
                                  <span className="row-meta">{formatWhen(session.updatedAt)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
