import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { CommandOption, ProjectInfo, SessionSummary } from "@shared/types";
import { ChevronIcon, PlusIcon } from "./FileIcons";
import { IconCheck, IconClose, IconFile, IconFolder, IconHistory, IconStarFilled } from "./icons";

const PINNED_KEY = "openshell.pinnedSessions";

function readPinned(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function SessionRow({
  summary,
  running,
  focused,
  pinned,
  busy,
  onOpen,
  onClose,
  onTogglePin
}: {
  summary: SessionSummary;
  running: boolean;
  focused: boolean;
  pinned: boolean;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onTogglePin: () => void;
}): ReactNode {
  return (
    <div
      className={`sessions-row ${focused ? "focused" : ""} ${running ? "running" : ""}`}
      onClick={onOpen}
      title={summary.directory}
    >
      {running ? (
        <span className={`agent-dot live ${busy ? "busy" : ""}`} />
      ) : (
        <IconHistory className="sessions-row-icon" />
      )}
      <span className="sessions-row-main">
        <span className="sessions-row-title">{summary.title}</span>
      </span>
      <button
        className={`sessions-row-pin ${pinned ? "pinned" : ""}`}
        title={pinned ? "Unpin session" : "Pin session"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
      >
        <IconStarFilled />
      </button>
      {running && (
        <button
          className="sessions-row-close"
          title={`Close the ${summary.title} panel`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <IconClose />
        </button>
      )}
    </div>
  );
}

export function SessionsPane(): ReactNode {
  const {
    session,
    panels,
    panelViews,
    activeSessionID,
    focusSession,
    closePanel,
    reopenSession,
    openSession,
    selectFolder,
    selectFile,
    sessions,
    loadSessions,
    runCommand
  } = useStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [pinnedIDs, setPinnedIDs] = useState<string[]>(readPinned);
  const [openNowOpen, setOpenNowOpen] = useState(true);
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [plugins, setPlugins] = useState<CommandOption[] | null>(null);
  const pluginsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadSessions();
    void window.openshell
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [loadSessions]);

  useEffect(() => {
    if (!pluginsOpen || !session) return;
    const workspace = session.workspace;
    void window.openshell
      .commands(workspace)
      .then(setPlugins)
      .catch(() => setPlugins([]));
    const onDown = (e: PointerEvent): void => {
      if (pluginsRef.current && !pluginsRef.current.contains(e.target as Node)) setPluginsOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setPluginsOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [pluginsOpen, session]);

  const runningPanels = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const byID = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const panelSummaries = useMemo(
    () =>
      panels.map((panel) => ({
        id: panel.id,
        title: panel.title ?? panel.directory.split(/[\\/]/).filter(Boolean).pop() ?? panel.directory,
        directory: panel.directory,
        updatedAt: byID.get(panel.id)?.updatedAt ?? 0
      })),
    [panels, byID]
  );
  const known = useMemo(() => {
    const seen = new Set(sessions.map((s) => s.id));
    return [...byID.values(), ...panelSummaries.filter((p) => !seen.has(p.id))];
  }, [sessions, panelSummaries, byID]);
  const recents = useMemo(() => [...known].sort((a, b) => b.updatedAt - a.updatedAt), [known]);
  const history = useMemo(
    () => recents.filter((summary) => !runningPanels.has(summary.id)),
    [recents, runningPanels]
  );

  const togglePin = (id: string): void => {
    setPinnedIDs((current) => {
      const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id];
      window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openRow = (id: string): void => {
    if (runningPanels.has(id)) focusSession(id);
    else void reopenSession(id);
  };

  const newSession = (): void => {
    void selectFolder();
  };

  const toggleProject = (directory: string): void => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(directory)) next.delete(directory);
      else next.add(directory);
      return next;
    });
  };

  return (
    <div className="sessions-pane">
      <div className="sessions-actions" ref={pluginsRef}>
        <button className="sessions-new" onClick={newSession} title="Choose a folder for a new session">
          <PlusIcon />
          New Session
        </button>
        <button className="sessions-file" onClick={() => void selectFile()} title="Open a file" aria-label="Open a file">
          <IconFile />
        </button>
        <button
          className={`sessions-plugins ${pluginsOpen ? "open" : ""}`}
          aria-expanded={pluginsOpen}
          title="Commands and skills"
          onClick={() => setPluginsOpen((o) => !o)}
        >
          Plugins
        </button>
        {pluginsOpen && (
          <div className="sessions-plugins-menu">
            {plugins === null ? (
              <div className="sessions-empty">Loading…</div>
            ) : plugins.length === 0 ? (
              <div className="sessions-empty">No commands or skills available.</div>
            ) : (
              plugins.map((cmd) => (
                <button
                  key={`${cmd.kind ?? "command"}:${cmd.name}`}
                  className="sessions-plugin-item"
                  title={cmd.description}
                  onClick={() => {
                    void runCommand(cmd.name, undefined);
                    setPluginsOpen(false);
                  }}
                >
                  <span className="sessions-plugin-kind">{cmd.kind === "skill" ? "skill" : "cmd"}</span>
                  <span className="sessions-plugin-name">{cmd.name}</span>
                  {cmd.kind === "skill" && <IconCheck className="sessions-plugin-check" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <section className="sessions-section">
        <div className="section-trigger">
          <button
            className={`section-toggle ${openNowOpen ? "open" : ""}`}
            aria-expanded={openNowOpen}
            onClick={() => setOpenNowOpen((open) => !open)}
          >
            <span>Open now</span>
            <span className="section-chevron">
              <ChevronIcon open={openNowOpen} />
            </span>
          </button>
        </div>
        {openNowOpen && (
          <div className="sessions-section-list">
          {panelSummaries.length === 0 ? (
            <div className="sessions-empty">No open sessions.</div>
          ) : (
            panelSummaries.map((summary) => {
              const panel = runningPanels.get(summary.id);
              return (
                <SessionRow
                  key={summary.id}
                  summary={summary}
                  running
                  focused={summary.id === activeSessionID}
                  pinned={pinnedIDs.includes(summary.id)}
                  busy={Boolean(panel && panelViews[panel.workspace.id]?.busy)}
                  onOpen={() => openRow(summary.id)}
                  onClose={() => closePanel(summary.id)}
                  onTogglePin={() => togglePin(summary.id)}
                />
              );
            })
          )}
          </div>
        )}
      </section>

      <section className="sessions-section">
        <div className="section-trigger">
          <button
            className={`section-toggle ${workspacesOpen ? "open" : ""}`}
            aria-expanded={workspacesOpen}
            onClick={() => setWorkspacesOpen((open) => !open)}
          >
            <span>Workspaces</span>
            <span className="section-chevron">
              <ChevronIcon open={workspacesOpen} />
            </span>
          </button>
        </div>
        {workspacesOpen && (
          <div className="sessions-section-list sessions-project-list">
          {projects.length === 0 ? (
            <div className="sessions-empty">No saved workspaces found.</div>
          ) : (
            projects.map((project) => {
              const projectSessions = recents.filter((summary) => summary.directory === project.directory);
              const expanded = expandedProjects.has(project.directory);
              const projectName = project.name.trim()
                || project.directory.split(/[\\/]/).filter(Boolean).pop()
                || "workspace";
              return (
                <div key={project.directory} className="sessions-project">
                  <div className={`sessions-project-head ${expanded ? "open" : ""}`}>
                    <button
                      className="sessions-project-toggle"
                      aria-expanded={expanded}
                      onClick={() => toggleProject(project.directory)}
                      title={project.directory}
                    >
                      <span className="section-chevron"><ChevronIcon open={expanded} /></span>
                      <IconFolder className="sessions-row-icon" />
                      <span className="sessions-row-title">{projectName}</span>
                      <span className="sessions-project-count">{projectSessions.length}</span>
                    </button>
                    <button
                      className="tree-row-action sessions-project-new"
                      title={`New session in ${projectName}`}
                      onClick={() => void openSession(project.directory)}
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  {expanded && (
                    <div className="sessions-project-sessions">
                      {projectSessions.length === 0 ? (
                        <div className="sessions-empty">No sessions yet.</div>
                      ) : projectSessions.map((s) => {
                        const panel = runningPanels.get(s.id);
                        return (
                          <SessionRow
                            key={s.id}
                            summary={s}
                            running={Boolean(panel)}
                            focused={s.id === activeSessionID}
                            pinned={pinnedIDs.includes(s.id)}
                            busy={Boolean(panel && panelViews[panel.workspace.id]?.busy)}
                            onOpen={() => openRow(s.id)}
                            onClose={() => closePanel(s.id)}
                            onTogglePin={() => togglePin(s.id)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        )}
      </section>

      <section className="sessions-section grow">
        <div className="section-trigger">
          <button
            className={`section-toggle ${historyOpen ? "open" : ""}`}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <span>History</span>
            <span className="section-chevron">
              <ChevronIcon open={historyOpen} />
            </span>
          </button>
        </div>
        {historyOpen && (
          <div className="sessions-section-list">
          {history.length === 0 ? (
            <div className="sessions-empty">No closed sessions yet.</div>
          ) : (
            history.map((summary) => {
              return (
                <SessionRow
                  key={summary.id}
                  summary={summary}
                  running={false}
                  focused={false}
                  pinned={pinnedIDs.includes(summary.id)}
                  busy={false}
                  onOpen={() => openRow(summary.id)}
                  onClose={() => closePanel(summary.id)}
                  onTogglePin={() => togglePin(summary.id)}
                />
              );
            })
          )}
          </div>
        )}
      </section>
    </div>
  );
}
