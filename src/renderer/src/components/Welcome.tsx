import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
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

export function Welcome(): ReactNode {
  const { selectFolder, openSession, reopenSession, connected } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WelcomeTab>("sessions");

  useEffect(() => {
    void window.openshell
      .projects()
      .then((p) => setProjects(p))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
    void window.openshell
      .sessions()
      .then((s) => setSessions(s.slice(0, 6)))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (tab === "sessions" && !loading && sessions.length === 0 && projects.length > 0) {
      setTab("projects");
    }
  }, [tab, loading, sessions.length, projects.length]);

  const isSessions = tab === "sessions";

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <section className="welcome-hero">
          <div className="welcome-mark" aria-hidden>
            ⊘
          </div>
          <h1 className="welcome-title">OpenShell</h1>
          <p className="welcome-sub">
            A workspace for the opencode2 agent — open a repository, tell it what to build,
            and watch the files change in real time.
          </p>
          <button className="welcome-cta" onClick={() => void selectFolder()}>
            <span className="codicon codicon-folder-opened" aria-hidden />
            Open a folder
          </button>
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
            {isSessions ? (
              <>
                {loading && <p className="welcome-empty">Loading…</p>}
                {!loading && sessions.length === 0 && (
                  <p className="welcome-empty">
                    No recent sessions yet — open a folder to start one.
                  </p>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="welcome-row"
                    onClick={() => void reopenSession(s.id)}
                    title={s.directory}
                  >
                    <span className="welcome-row-icon codicon codicon-history" aria-hidden />
                    <span className="welcome-row-main">
                      <span className="welcome-row-title">{s.title}</span>
                      <span className="welcome-row-meta">
                        {formatWhen(s.updatedAt)} · {s.directory}
                      </span>
                    </span>
                    <span className="welcome-row-arrow codicon codicon-arrow-right" aria-hidden />
                  </button>
                ))}
              </>
            ) : (
              <>
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
                    <span className="welcome-row-icon codicon codicon-folder" aria-hidden />
                    <span className="welcome-row-main">
                      <span className="welcome-row-title">{p.name}</span>
                      <span className="welcome-row-meta">{p.directory}</span>
                    </span>
                    <span className="welcome-row-arrow codicon codicon-arrow-right" aria-hidden />
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
