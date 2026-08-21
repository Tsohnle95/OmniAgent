import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";
import type { WorkspaceIdentity } from "@shared/types";
import { PendingTerminalOutput, removeTerminal, type TerminalTabs } from "../terminal-state";

const THEME = {
  background: "#121317",
  foreground: "#e8eaef",
  cursor: "#d97757",
  cursorAccent: "#0d0e11",
  selectionBackground: "#2e4d78",
  black: "#17181d",
  red: "#f16d6b",
  green: "#4cc38a",
  yellow: "#e0af68",
  blue: "#d97757",
  magenta: "#c99ff2",
  cyan: "#6fc3df",
  white: "#e8eaef",
  brightBlack: "#626b78",
  brightRed: "#ff8b85",
  brightGreen: "#6fd8a8",
  brightYellow: "#eec27f",
  brightBlue: "#e68a68",
  brightMagenta: "#dcb8ff",
  brightCyan: "#8fd8ef",
  brightWhite: "#ffffff"
};

interface TermInstanceProps {
  id: string;
  active: boolean;
  height: number;
  workspace: WorkspaceIdentity;
  onRegister: (id: string, writer: (data: string) => void) => void;
  onUnregister: (id: string) => void;
}

function TermInstance({ id, active, height, workspace, onRegister, onUnregister }: TermInstanceProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: "'SF Mono', Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* hidden */
    }

    term.onData((data) => {
      void window.openshell.terminalInput(workspace, id, data);
    });

    onRegister(id, (data) => term.write(data));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
      void window.openshell.terminalResize(workspace, id, term.cols, term.rows).catch(() => {});
    });
    ro.observe(host);

    void window.openshell.terminalResize(workspace, id, term.cols, term.rows).catch(() => {});

    return () => {
      onUnregister(id);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      void window.openshell.terminalStop(workspace, id).catch(() => {});
    };
  }, [id, workspace, onRegister, onUnregister]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
      void window.openshell.terminalResize(workspace, id, term.cols, term.rows).catch(() => {});
    });
    term.focus();
  }, [active, height, id, workspace]);

  return (
    <div className={`terminal-host ${active ? "" : "hidden"}`} ref={hostRef} />
  );
}

export function TerminalTray({
  height,
  snapped,
  onClose,
  onExpand
}: {
  height: number;
  snapped: boolean;
  onClose: () => void;
  onExpand: () => void;
}): ReactNode {
  const { session } = useStore();
  const workspace = session!.workspace;
  const [{ terms, activeId }, setTabs] = useState<TerminalTabs>({ terms: [], activeId: null });
  const [notice, setNotice] = useState("");
  const counterRef = useRef(0);
  const bootTokenRef = useRef(0);
  const writersRef = useRef<Map<string, (data: string) => void>>(new Map());
  const pendingOutputRef = useRef(new PendingTerminalOutput());

  const onRegister = useCallback((id: string, writer: (data: string) => void): void => {
    writersRef.current.set(id, writer);
    for (const data of pendingOutputRef.current.register(id)) writer(data);
  }, []);

  const onUnregister = useCallback((id: string): void => {
    writersRef.current.delete(id);
    pendingOutputRef.current.remove(id);
  }, []);

  useEffect(() => {
    const off = window.openshell.onMessage((msg) => {
      if (msg.kind === "terminal-data") {
        const terminal = msg.terminal;
        const writer = writersRef.current.get(terminal.id);
        if (writer) writer(terminal.data);
        else pendingOutputRef.current.write(terminal.id, terminal.data);
      } else if (msg.kind === "terminal-exit") {
        const id = msg.terminal.id;
        writersRef.current.delete(id);
        pendingOutputRef.current.remove(id);
        setTabs((current) => removeTerminal(current, id));
      }
    });
    return off;
  }, []);

  const createTerminal = useCallback(async (): Promise<void> => {
    setNotice("");
    const id = `term-${crypto.randomUUID()}`;
    pendingOutputRef.current.awaitRegistration(id);
    const name = `Terminal ${++counterRef.current}`;
    setTabs((current) => ({ terms: [...current.terms, { id, name }], activeId: id }));
    try {
      await window.openshell.terminalStart(workspace, id);
    } catch (err) {
      pendingOutputRef.current.remove(id);
      setTabs((current) => removeTerminal(current, id));
      setNotice(err instanceof Error ? err.message : "Could not start a terminal");
    }
  }, [workspace]);

  useEffect(() => {
    const token = ++bootTokenRef.current;
    setTabs({ terms: [], activeId: null });
    writersRef.current.clear();
    pendingOutputRef.current.clear();
    void (async () => {
      const id = `term-${crypto.randomUUID()}`;
      pendingOutputRef.current.awaitRegistration(id);
      const name = `Terminal ${++counterRef.current}`;
      setTabs({ terms: [{ id, name }], activeId: id });
      try {
        await window.openshell.terminalStart(workspace, id);
        if (token !== bootTokenRef.current) {
          void window.openshell.terminalStop(workspace, id).catch(() => {});
          return;
        }
      } catch (err) {
        if (token === bootTokenRef.current) {
          pendingOutputRef.current.remove(id);
          setTabs((current) => removeTerminal(current, id));
          setNotice(err instanceof Error ? err.message : "Could not start a terminal");
        }
      }
    })();
    return () => {
      bootTokenRef.current++;
    };
  }, [workspace]);

  const closeTerminal = (id: string): void => {
    void window.openshell.terminalStop(workspace, id).catch(() => {});
    const next = removeTerminal({ terms, activeId }, id);
    writersRef.current.delete(id);
    pendingOutputRef.current.remove(id);
    setTabs(next);
    if (next.terms.length === 0) onClose();
  };

  return (
    <div className="terminal-tray" style={{ "--terminal-height": `${height}px` } as CSSProperties}>
      <div
        className={`terminal-header ${snapped ? "snapped" : ""}`}
        title={snapped ? "Click to expand terminal" : undefined}
        onClick={snapped ? onExpand : undefined}
      >
        {snapped && (
          <span className="terminal-snap-hint" title="Drag up or click to expand">
            <span className="codicon codicon-chevron-up" />
          </span>
        )}
        {terms.map((term) => (
          <span
            key={term.id}
            className={`terminal-tab ${term.id === activeId ? "active" : ""}`}
            onClick={() => setTabs((current) => ({ ...current, activeId: term.id }))}
          >
            {term.name}
            <button
              className="terminal-tab-close"
              title={`Close ${term.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(term.id);
              }}
            >
              ×
            </button>
          </span>
        ))}
        <button className="terminal-add" title="New terminal" onClick={() => void createTerminal()}>
          <span className="codicon codicon-add" />
        </button>
        {notice && <span className="terminal-notice" title={notice}>{notice}</span>}
        <button className="terminal-close" title="Close the terminal panel (⌥O)" onClick={onClose}>
          <span className="codicon codicon-chevron-down" />
        </button>
      </div>
      <div className={`terminal-body ${snapped ? "hidden" : ""}`}>
        {terms.map((term) => (
          <TermInstance
            key={term.id}
            id={term.id}
            active={term.id === activeId}
            height={height}
            workspace={workspace}
            onRegister={onRegister}
            onUnregister={onUnregister}
          />
        ))}
        {terms.length === 0 && <div className="terminal-empty">No terminal open. Press + to start one.</div>}
      </div>
    </div>
  );
}
