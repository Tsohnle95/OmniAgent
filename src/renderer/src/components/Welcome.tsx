import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { IconCloudDownload, IconFile, IconFolder } from "./icons";
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

export function Welcome(): ReactNode {
  const { selectFolder, selectFile, openFileWorkspace, openSession, reopenSession, connected, runtimes, selectedRuntimeID } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WelcomeTab>("sessions");
  const [sectionOpen, setSectionOpen] = useState(true);
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

  const runtimeSessions = sessions.filter((session) => (session.runtimeID ?? "opencode") === selectedRuntimeID);
  const selectedRuntimeName = runtimes.find((runtime) => runtime.id === selectedRuntimeID)?.name ?? selectedRuntimeID;
  const isSessions = tab === "sessions";
  const sectionLabel = isSessions ? "Recent" : "Workspaces";
  const sectionCount = isSessions ? runtimeSessions.length : projects.length;

  const projectsByRoot = new Map<string, ProjectInfo[]>();
  for (const project of projects) {
    const list = projectsByRoot.get(project.directory) ?? [];
    list.push(project);
    projectsByRoot.set(project.directory, list);
  }

  const toggleGroup = (key: string): void =>
    setOpenGroups((current) => ({ ...current, [key]: !(current[key] ?? true) }));

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
    <>
      <div className="welcome" data-drag-region {...dropHandlers}>
        <div className="mock sk-tglass">
          <div className="twin">
            <div className="hero-col">
              <MarkSvg />
              <h1 className="title">Orbit</h1>
              <p className="sub">One calm surface for coding agents.</p>
              <p className="kicker">Every agent. One surface.</p>
              <p className="lede">
                Open a repository, connect the agent you trust, and watch every file change stream in live — diffs,
                turns, and terminals on one calm surface.
              </p>
              <div className="cta-row">
                <button className="btn btn-primary" type="button" onClick={() => void selectFolder()}>
                  <IconFolder />Open a folder
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void selectFile()}>
                  <IconFile />Open a file…
                </button>
                {canInstall && (
                  <button className="btn btn-ghost" type="button" onClick={() => void installApp()} disabled={installing}>
                    <IconCloudDownload />{installing ? "Installing…" : "Install app"}
                  </button>
                )}
              </div>
              <ul className="traits">
                <li>Live per-file diffs</li>
                <li>Streaming agent turns</li>
                <li>Parallel session panels</li>
              </ul>
              <p className="drophint">…or drop a folder anywhere in this window.</p>
              {selectedRuntimeID === "opencode" && !connected && (
                <p className="warn">OpenCode service not reachable. It will be started automatically.</p>
              )}
            </div>

            <aside className="spanel" style={{ width: 248 }}>
              <div className="tabs">
                <button
                  type="button"
                  className={`tab ${isSessions ? "is-active" : ""}`}
                  onClick={() => setTab("sessions")}
                >
                  Recent<span className="sd-cnt">{runtimeSessions.length}</span>
                </button>
                <button
                  type="button"
                  className={`tab ${isSessions ? "" : "is-active"}`}
                  onClick={() => setTab("projects")}
                >
                  Workspaces<span className="sd-cnt">{projects.length}</span>
                </button>
              </div>

              <div className={`sd-sec ${sectionOpen ? "" : "is-closed"}`}>
                <button
                  className="sd-sh style-dotcap"
                  type="button"
                  aria-expanded={sectionOpen}
                  onClick={() => setSectionOpen((open) => !open)}
                >
                  <span className="sd-sh-label">{sectionLabel}</span>
                  <span className="sd-cnt">{sectionCount}</span>
                  <Chev />
                </button>
                <div className="sd-body">
                  {loading && <p className="empty">Loading…</p>}
                  {!loading && isSessions && runtimeSessions.length === 0 && (
                    <p className="empty">No recent sessions yet.</p>
                  )}
                  {!loading && !isSessions && projects.length === 0 && (
                    <p className="empty">No recent projects found.</p>
                  )}

                  {isSessions && !loading && (
                    <ul className="num-list">
                      {runtimeSessions.map((session, index) => (
                        <li key={session.id}>
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

                  {!isSessions && !loading && [...projectsByRoot.entries()].map(([root, rootProjects]) => {
                    const open = openGroups[root] ?? true;
                    return (
                      <div className={`sd-grp ${open ? "is-open" : ""}`} key={root}>
                        <button className="sd-wgh" type="button" onClick={() => toggleGroup(root)} title={root}>
                          <Chev />
                          <FolderGlyph />
                          <span className="sd-wgname">{root.split("/").filter(Boolean).pop() || root}</span>
                          <span className="sd-wgcnt">{rootProjects.length}</span>
                        </button>
                        <div className="sd-kids-wrap">
                          <ul className="rows sd-kids">
                            {rootProjects.map((project) => (
                              <li key={project.directory}>
                                <button
                                  className="rowlink"
                                  type="button"
                                  onClick={() => void openSession(project.directory)}
                                  title={project.directory}
                                >
                                  <span className="row-dot" />
                                  <span className="row-name">{project.name}</span>
                                  <span className="row-meta" />
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

              <div className="statusfoot">
                <span className="live-dot" />
                <span>{runtimeSessions.length} recent · {projects.length} workspaces</span>
                <span className="modeltag">{selectedRuntimeName}</span>
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
