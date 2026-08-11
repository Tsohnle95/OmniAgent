import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";

const THEME = {
  background: "#131316",
  foreground: "#d4d4d8",
  cursor: "#4d9fff",
  cursorAccent: "#111114",
  selectionBackground: "#2b4a73",
  black: "#18181b",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#4d9fff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#d4d4d8",
  brightBlack: "#5c5c66",
  brightRed: "#ff7b72",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#76e3ea",
  brightWhite: "#ffffff"
};

interface TermInstanceProps {
  id: string;
  active: boolean;
  height: number;
}

function TermInstance({ id, active, height }: TermInstanceProps): ReactNode {
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
      void window.openshell.terminalInput(id, data);
    });

    const off = window.openshell.onMessage((msg) => {
      if (msg.kind === "terminal-data" && msg.terminal?.id === id) {
        term.write(msg.terminal.data);
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
      void window.openshell.terminalResize(id, term.cols, term.rows).catch(() => {});
    });
    ro.observe(host);

    void window.openshell.terminalResize(id, term.cols, term.rows).catch(() => {});

    return () => {
      off();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      void window.openshell.terminalStop(id);
    };
  }, [id]);

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
      void window.openshell.terminalResize(id, term.cols, term.rows).catch(() => {});
    });
    term.focus();
  }, [active, height, id]);

  return (
    <div className={`terminal-host ${active ? "" : "hidden"}`} ref={hostRef} />
  );
}

interface TermView {
  id: string;
  name: string;
}

export function TerminalTray({ height, onClose }: { height: number; onClose: () => void }): ReactNode {
  const { session } = useStore();
  const directory = session?.directory ?? null;
  const [terms, setTerms] = useState<TermView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const counterRef = useRef(0);

  const createTerminal = useCallback(async (): Promise<void> => {
    setNotice("");
    try {
      const { id } = await window.openshell.terminalStart(directory);
      const name = `Terminal ${++counterRef.current}`;
      setTerms((prev) => [...prev, { id, name }]);
      setActiveId(id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not start a terminal");
    }
  }, [directory]);

  useEffect(() => {
    setTerms([]);
    setActiveId(null);
    void createTerminal();
  }, [createTerminal]);

  const closeTerminal = (id: string): void => {
    void window.openshell.terminalStop(id);
    const idx = terms.findIndex((t) => t.id === id);
    const next = terms.filter((t) => t.id !== id);
    if (next.length === 0) {
      onClose();
      return;
    }
    setTerms(next);
    if (activeId === id) {
      setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null);
    }
  };

  return (
    <div className="terminal-tray" style={{ height }}>
      <div className="terminal-header">
        {terms.map((term) => (
          <span
            key={term.id}
            className={`terminal-tab ${term.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(term.id)}
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
      <div className="terminal-body">
        {terms.map((term) => (
          <TermInstance key={term.id} id={term.id} active={term.id === activeId} height={height} />
        ))}
        {terms.length === 0 && <div className="terminal-empty">No terminal open — press + to start one.</div>}
      </div>
    </div>
  );
}
