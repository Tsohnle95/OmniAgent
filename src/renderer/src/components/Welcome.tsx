import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { OrbitMark } from "./OrbitMark";
import { IconCloudDownload, IconFile, IconFolder, IconFolderOpen, IconHistory } from "./icons";
import { droppedFilePaths } from "../drop";
import type { ProjectInfo, SessionSummary } from "@shared/types";

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

type WelcomeTab = "sessions" | "projects";

type InstallToast = { id: number; text: string; tone: "info" | "error" };

let installToastId = 0;

function SectionHead({ label, count }: { label: string; count: number }): ReactNode {
  return (
    <span className="wd-sh">
      <span className="wd-cap" />
      <span className="wd-sh-label">{label}</span>
      <span className="wd-cnt">{count}</span>
      <svg className="wd-chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
        <path d="M2 3.6 5 6.6 8 3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Chevron(): ReactNode {
  return (
    <svg className="wd-chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M2 3.6 5 6.6 8 3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

export function Welcome(): ReactNode {
  const { selectFolder, selectFile, openFileWorkspace, openSession, reopenSession, connected, runtimes, selectedRuntimeID } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WelcomeTab>("sessions");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [installToasts, setInstallToasts] = useState<InstallToast[]>([]);

  const notifyInstall = (text: string, tone: "info" | "error" = "info"): void => {
    const id = ++installToastId;
    setInstallToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setInstallToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const installApp = async (): Promise<void> => {
    if (installing) return;
    setInstalling(true);
    try {
      const result = await window.openshell.installApp();
      notifyInstall(result.message, result.ok ? "info" : "error");
    } catch (error) {
      notifyInstall(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setInstalling(false);
    }
  };

  const canInstall = window.openshell.platform === "darwin" && !window.openshell.isPackaged;

  useEffect(() => {
    void window.openshell
      .projects()
      .then((p) => setProjects(p))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
    void window.openshell
      .sessions()
      .then((s) => setSessions(s))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (tab === "sessions" && !loading && sessions.every((session) => (session.runtimeID ?? "opencode") !== selectedRuntimeID) && projects.length > 0) {
      setTab("projects");
    }
  }, [tab, loading, sessions, projects.length, selectedRuntimeID]);

  const isSessions = tab === "sessions";
  const runtimeSessions = sessions.filter((session) => (session.runtimeID ?? "opencode") === selectedRuntimeID);
  const selectedRuntimeName = runtimes.find((runtime) => runtime.id === selectedRuntimeID)?.name ?? selectedRuntimeID;
  const projectsByRoot = new Map<string, ProjectInfo[]>();
  for (const project of projects) {
    const key = project.directory;
    const list = projectsByRoot.get(key) ?? [];
    list.push(project);
    projectsByRoot.set(key, list);
  }

  const toggleGroup = (key: string): void =>
    setOpenGroups((current) => ({ ...current, [key]: current[key] === undefined ? true : !current[key] }));

  return (
    <>
      <div
        className="welcome wd"
        data-drag-region
        onDragOver={(e) => {
          const types = e.dataTransfer?.types;
          if (!types || !Array.from(types as ArrayLike<string>).includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const files = droppedFilePaths(e);
          if (files.length > 0) void openFileWorkspace(files[0]);
        }}
      >
        <div className="wd-mock">
          <div className="wd-twin">
            <div className="wd-hero">
              <div className="welcome-mark" aria-hidden>
                <OrbitMark size={36} />
              </div>
              <h1 className="wd-title">Orbit</h1>
              <p className="wd-kicker">Every agent. One surface.</p>
              <p className="wd-sub">
                Open a repository, connect the agent you trust, and watch every file change stream in live — diffs,
                turns, and terminals on one calm surface.
              </p>
              <div className="wd-cta-row">
                <button className="wd-cta-primary" onClick={() => void selectFolder()}>
                  <IconFolderOpen />
                  Open a folder
                </button>
                <button className="wd-cta-ghost" onClick={() => void selectFile()}>
                  <IconFile />
                  Open a file…
                </button>
                {canInstall && (
                  <button className="wd-cta-ghost" onClick={() => void installApp()} disabled={installing}>
                    <IconCloudDownload />
                    {installing ? "Installing…" : "Install app"}
                  </button>
                )}
              </div>
              <ul className="wd-traits">
                <li>Live per-file diffs</li>
                <li>Streaming agent turns</li>
                <li>Parallel session panels</li>
              </ul>
              <p className="wd-drop-hint">…or drop a folder anywhere in this window.</p>
              {selectedRuntimeID === "opencode" && !connected && (
                <p className="welcome-warn">OpenCode service not reachable. It will be started automatically.</p>
              )}
            </div>

            <aside className="wd-panel">
              <div className="wd-tabs" role="tablist" aria-label="Recent work">
                <button
                  role="tab"
                  aria-selected={isSessions}
                  className={`wd-tab ${isSessions ? "on" : ""}`}
                  onClick={() => setTab("sessions")}
                >
                  <span className="wd-cap" />
                  Recent
                  <span className="wd-tab-count">{runtimeSessions.length}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={!isSessions}
                  className={`wd-tab ${isSessions ? "" : "on"}`}
                  onClick={() => setTab("projects")}
                >
                  <span className="wd-cap" />
                  Workspaces
                  <span className="wd-tab-count">{projects.length}</span>
                </button>
              </div>

              <div className="wd-body" role="tabpanel">
                {isSessions && (
                  <div className="wd-pane">
                    <div className="wd-sec-head"><SectionHead label="Recent sessions" count={runtimeSessions.length} /></div>
                    {loading && <p className="wd-empty">Loading…</p>}
                    {!loading && runtimeSessions.length === 0 && (
                      <p className="wd-empty">No recent {selectedRuntimeName} sessions yet — open a folder to start one.</p>
                    )}
                    <ul className="wd-num-list">
                      {runtimeSessions.map((session, index) => (
                        <li key={session.id}>
                          <button className="wd-row" onClick={() => void reopenSession(session.id)} title={session.directory}>
                            <span className="wd-num-i">{String(index + 1).padStart(2, "0")}</span>
                            <span className="wd-dot" />
                            <span className="wd-name">
                              <IconHistory className="wd-name-icon" />
                              {session.title}
                            </span>
                            <span className="wd-when">{formatWhen(session.updatedAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!isSessions && (
                  <div className="wd-pane">
                    <div className="wd-sec-head"><SectionHead label="Workspaces" count={projects.length} /></div>
                    {loading && <p className="wd-empty">Loading…</p>}
                    {!loading && projects.length === 0 && <p className="wd-empty">No recent projects found.</p>}
                    {[...projectsByRoot.entries()].map(([root, rootProjects]) => {
                      const open = openGroups[root] !== false;
                      return (
                        <div className={`wd-grp ${open ? "is-open" : ""}`} key={root}>
                          <button className="wd-wgh" onClick={() => toggleGroup(root)} title={root}>
                            <Chevron />
                            <FolderGlyph />
                            <span className="wd-wgname">{root.split("/").filter(Boolean).pop() || root}</span>
                            <span className="wd-wgcnt">{rootProjects.length}</span>
                          </button>
                          {open && (
                            <div className="wd-kids-wrap">
                              <ul className="wd-kids">
                                {rootProjects.map((project) => (
                                  <li key={project.directory}>
                                    <button className="wd-row" onClick={() => void openSession(project.directory)} title={project.directory}>
                                      <span className="wd-dot" />
                                      <span className="wd-name">{project.name}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="wd-statusfoot">
                <span className="wd-live-dot" />
                <span>{runtimeSessions.length} recent · {projects.length} workspaces</span>
                <span className="wd-modeltag">{selectedRuntimeName}</span>
              </div>
            </aside>
          </div>
        </div>
      </div>
      {installToasts.length > 0 && (
        <div className="toasts">
          {installToasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
