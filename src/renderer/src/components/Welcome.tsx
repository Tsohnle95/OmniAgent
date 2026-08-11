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

export function Welcome(): ReactNode {
  const { selectFolder, openSession, reopenSession, connected } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo">⊘</div>
        <h1>OpenShell</h1>
        <p className="welcome-sub">
          A workspace for the opencode2 agent — open a repository, tell the agent what to build,
          and watch the files change in real time.
        </p>

        <button className="btn btn-primary btn-lg" onClick={() => void selectFolder()}>
          Open a folder
        </button>

        {!connected && <p className="welcome-warn">opencode service not reachable — it will be started automatically.</p>}

        {sessions.length > 0 && (
          <div className="welcome-projects">
            <div className="welcome-projects-header">Recent sessions</div>
            {sessions.map((s) => (
              <button
                key={s.id}
                className="welcome-project"
                onClick={() => void reopenSession(s.id)}
                title={s.id}
              >
                <span className="welcome-project-icon">◷</span>
                <span className="welcome-project-name">{s.title}</span>
                <span className="welcome-project-dir">{formatWhen(s.updatedAt)} · {s.directory}</span>
              </button>
            ))}
          </div>
        )}

        <div className="welcome-projects">
          <div className="welcome-projects-header">Recent projects</div>
          {loading && <div className="welcome-empty">Loading…</div>}
          {!loading && projects.length === 0 && (
            <div className="welcome-empty">No recent projects found.</div>
          )}
          {projects.map((p) => (
            <button
              key={p.directory}
              className="welcome-project"
              onClick={() => void openSession(p.directory)}
              title={p.directory}
            >
              <span className="welcome-project-icon">▣</span>
              <span className="welcome-project-name">{p.name}</span>
              <span className="welcome-project-dir">{p.directory}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
