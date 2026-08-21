import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { ShellMark } from "./ShellMark";
import { IconArrowRight, IconCloudDownload, IconFile, IconFolder, IconFolderOpen, IconHistory } from "./icons";
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

export function Welcome(): ReactNode {
  const { selectFolder, selectFile, openFileWorkspace, openSession, reopenSession, connected } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WelcomeTab>("sessions");
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
    if (tab === "sessions" && !loading && sessions.length === 0 && projects.length > 0) {
      setTab("projects");
    }
  }, [tab, loading, sessions.length, projects.length]);

  const isSessions = tab === "sessions";

  return (
    <>
      <div
        className="welcome"
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
        <div className="welcome-inner">
          <section className="welcome-hero">
            <div className="welcome-mark" aria-hidden>
              <ShellMark />
            </div>
            <h1 className="welcome-title">OpenShell</h1>
            <p className="welcome-eyebrow">A workbench for the opencode2 agent</p>
            <p className="welcome-sub">
              Open a repository, tell the agent what to build, and watch every file change
              stream in live — diffs, turns, and terminals on one calm surface.
            </p>
            <div className="welcome-actions">
              <button className="welcome-cta" onClick={() => void selectFolder()}>
                <IconFolderOpen />
                Open a folder
              </button>
              <button className="welcome-cta welcome-cta-secondary" onClick={() => void selectFile()}>
                <IconFile />
                Open a file…
              </button>
              {canInstall && (
                <button
                  className="welcome-cta welcome-cta-secondary"
                  onClick={() => void installApp()}
                  disabled={installing}
                >
                  <IconCloudDownload />
                  {installing ? "Installing…" : "Install app"}
                </button>
              )}
            </div>
            <ul className="welcome-traits">
              <li>Live per-file diffs</li>
              <li>Streaming agent turns</li>
              <li>Parallel session panels</li>
            </ul>
            <p className="welcome-drop-hint">…or drop a folder anywhere in this window.</p>
            {!connected && (
              <p className="welcome-warn">
                opencode service not reachable — it will be started automatically.
              </p>
            )}
          </section>

          <section className="welcome-frame">
            <div className="welcome-tabs" role="tablist" aria-label="Recent work">
              <button
                role="tab"
                aria-selected={isSessions}
                className={`welcome-tab ${isSessions ? "on" : ""}`}
                onClick={() => setTab("sessions")}
              >
                Sessions
                <span className="welcome-tab-count">{sessions.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={!isSessions}
                className={`welcome-tab ${isSessions ? "" : "on"}`}
                onClick={() => setTab("projects")}
              >
                Projects
                <span className="welcome-tab-count">{projects.length}</span>
              </button>
            </div>

            <div className="welcome-list" role="tabpanel">
              <div className={`welcome-pane ${isSessions ? "" : "hidden"}`} aria-hidden={!isSessions}>
                {loading && <p className="welcome-empty">Loading…</p>}
                {!loading && sessions.length === 0 && (
                  <p className="welcome-empty">No recent sessions yet — open a folder to start one.</p>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="welcome-row"
                    onClick={() => void reopenSession(s.id)}
                    title={s.directory}
                  >
                    <span className="welcome-row-tile"><IconHistory /></span>
                    <span className="welcome-row-main">
                      <span className="welcome-row-title">{s.title}</span>
                      <span className="welcome-row-meta">{s.directory}</span>
                    </span>
                    <span className="welcome-row-when">{formatWhen(s.updatedAt)}</span>
                    <IconArrowRight className="welcome-row-arrow" />
                  </button>
                ))}
              </div>
              <div className={`welcome-pane ${isSessions ? "hidden" : ""}`} aria-hidden={isSessions}>
                {loading && <p className="welcome-empty">Loading…</p>}
                {!loading && projects.length === 0 && (
                  <p className="welcome-empty">No recent projects found.</p>
                )}
                {projects.map((p) => (
                  <button
                    key={p.directory}
                    className="welcome-row"
                    onClick={() => void openSession(p.directory)}
                    title={p.directory}
                  >
                    <span className="welcome-row-tile"><IconFolder /></span>
                    <span className="welcome-row-main">
                      <span className="welcome-row-title">{p.name}</span>
                      <span className="welcome-row-meta">{p.directory}</span>
                    </span>
                    <span className="welcome-row-when" />
                    <IconArrowRight className="welcome-row-arrow" />
                  </button>
                ))}
              </div>
            </div>
          </section>
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
