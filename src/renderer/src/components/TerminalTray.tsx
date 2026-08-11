import { useEffect, useRef, type ReactNode } from "react";
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

export function TerminalTray({ height }: { height: number }): ReactNode {
  const { session } = useStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);

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
    term.focus();

    term.onData((data) => {
      if (termIdRef.current) void window.openshell.terminalInput(termIdRef.current, data);
    });

    void window.openshell.terminalStart(session?.directory ?? null).then(({ id }) => {
      termIdRef.current = id;
      void window.openshell.terminalResize(id, term.cols, term.rows);
    });

    const off = window.openshell.onMessage((msg) => {
      if (msg.kind === "terminal-data" && msg.terminal?.id === termIdRef.current) {
        term.write(msg.terminal.data);
      }
    });
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
      if (termIdRef.current) {
        void window.openshell.terminalResize(termIdRef.current, term.cols, term.rows);
      }
    });
    ro.observe(host);

    return () => {
      off();
      ro.disconnect();
      if (termIdRef.current) void window.openshell.terminalStop(termIdRef.current);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      termIdRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
      if (termIdRef.current) {
        void window.openshell.terminalResize(termIdRef.current, term.cols, term.rows);
      }
    });
  }, [height]);

  return (
    <div className="terminal-tray" style={{ height }}>
      <div className="terminal-header">
        <span className="terminal-tab">TERMINAL</span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
