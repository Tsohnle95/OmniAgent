import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { ProjectInfo } from "@shared/types";

export function Welcome(): ReactNode {
  const { selectFolder, openSession, connected } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.openshell
      .projects()
      .then((p) => setProjects(p))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
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
