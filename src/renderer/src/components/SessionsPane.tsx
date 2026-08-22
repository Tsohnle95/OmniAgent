import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { CommandOption, SessionSummary } from "@shared/types";
import { ChevronIcon, PlusIcon } from "./FileIcons";
import { IconCheck, IconClose, IconHistory, IconStarFilled, IconSearch } from "./icons";

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

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(q));
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
        <span className="sessions-row-meta">
          {formatWhen(summary.updatedAt)} · {summary.directory}
        </span>
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
      {running && !busy && <span className="sessions-row-badge">open</span>}
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
    sessions,
    loadSessions,
    runCommand
  } = useStore();
  const [query, setQuery] = useState("");
  const [pinnedIDs, setPinnedIDs] = useState<string[]>(readPinned);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [plugins, setPlugins] = useState<CommandOption[] | null>(null);
  const pluginsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadSessions();
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
  const pinned = useMemo(
    () => pinnedIDs.map((id) => byID.get(id)).filter((s): s is SessionSummary => Boolean(s)),
    [pinnedIDs, byID]
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
    if (session) void openSession(session.directory);
    else void selectFolder();
  };

  const filteredOpenSessions = panelSummaries.filter((s) => matches(query, s.title, s.directory));
  const filteredRecents = recents.filter((s) => matches(query, s.title, s.directory));
  const filteredPinned = pinned.filter((s) => matches(query, s.title, s.directory));

  return (
    <div className="sessions-pane">
      <div className="sessions-actions" ref={pluginsRef}>
        <button className="sessions-new" onClick={newSession} title="Start a new session in this workspace">
          <PlusIcon />
          New Session
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

      <div className="sessions-search">
        <IconSearch className="sessions-search-icon" />
        <input
          className="sessions-search-input"
          placeholder="Search sessions…"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <section className="sessions-section">
        <div className="section-trigger">
          <button
            className={`section-toggle ${pinnedOpen ? "open" : ""}`}
            aria-expanded={pinnedOpen}
            onClick={() => setPinnedOpen((o) => !o)}
          >
            <span>Pinned</span>
            <span className="sidebar-count push">{filteredPinned.length}</span>
            <span className="section-chevron">
              <ChevronIcon open={pinnedOpen} />
            </span>
          </button>
        </div>
        {pinnedOpen && (
          <div className="sessions-section-list">
          {filteredPinned.length === 0 ? (
            <div className="sessions-empty">No pinned sessions yet.</div>
          ) : (
            filteredPinned.map((s) => {
              const panel = runningPanels.get(s.id);
              return (
                <SessionRow
                  key={s.id}
                  summary={s}
                  running={Boolean(panel)}
                  focused={s.id === activeSessionID}
                  pinned
                  busy={Boolean(panel && panelViews[panel.workspace.id]?.busy)}
                  onOpen={() => openRow(s.id)}
                  onClose={() => closePanel(s.id)}
                  onTogglePin={() => togglePin(s.id)}
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
            className={`section-toggle ${sessionsOpen ? "open" : ""}`}
            aria-expanded={sessionsOpen}
            onClick={() => setSessionsOpen((o) => !o)}
          >
            <span>Sessions</span>
            <span className="sidebar-count push">{filteredOpenSessions.length}</span>
            <span className="section-chevron">
              <ChevronIcon open={sessionsOpen} />
            </span>
          </button>
        </div>
        {sessionsOpen && (
          <div className="sessions-section-list">
          {filteredOpenSessions.length === 0 ? (
            <div className="sessions-empty">No open sessions.</div>
          ) : (
            filteredOpenSessions.map((s) => {
              const panel = runningPanels.get(s.id);
              return (
                <SessionRow
                  key={s.id}
                  summary={s}
                  running
                  focused={s.id === activeSessionID}
                  pinned={pinnedIDs.includes(s.id)}
                  busy={Boolean(panel && panelViews[panel.workspace.id]?.busy)}
                  onOpen={() => openRow(s.id)}
                  onClose={() => closePanel(s.id)}
                  onTogglePin={() => togglePin(s.id)}
                />
              );
            })
          )}
          </div>
        )}
      </section>

      <section className="sessions-section grow">
        <div className="section-trigger">
          <button
            className={`section-toggle ${recentOpen ? "open" : ""}`}
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen((o) => !o)}
          >
            <span>Recents</span>
            <span className="sidebar-count push">{filteredRecents.length}</span>
            <span className="section-chevron">
              <ChevronIcon open={recentOpen} />
            </span>
          </button>
        </div>
        {recentOpen && (
          <div className="sessions-section-list">
          {filteredRecents.length === 0 ? (
            <div className="sessions-empty">No recent sessions yet.</div>
          ) : (
            filteredRecents.map((s) => {
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
            })
          )}
          </div>
        )}
      </section>
    </div>
  );
}
