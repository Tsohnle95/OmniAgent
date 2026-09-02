import { useEffect, useRef, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { WorkspaceIdentity } from "@shared/types";
import { useOptionalTheme } from "../theme";

const ORIGINAL_THEME: ITheme = {
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

const KITTY_THEME: ITheme = {
  background: "rgba(2, 2, 4, 0)",
  foreground: "#e7e7ee",
  cursor: "#00a2ce",
  cursorAccent: "#020204",
  selectionBackground: "#2e4d78",
  black: "#020204",
  red: "#ff4b67",
  green: "#5bd69a",
  yellow: "#e0a85a",
  blue: "#00a2ce",
  magenta: "#c99ff2",
  cyan: "#6fc3df",
  white: "#e7e7ee",
  brightBlack: "#626b78",
  brightRed: "#ff8b85",
  brightGreen: "#82e8b4",
  brightYellow: "#f0c780",
  brightBlue: "#25b8dd",
  brightMagenta: "#dcb8ff",
  brightCyan: "#8fd8ef",
  brightWhite: "#ffffff"
};

type AnsiSanitizerState = { pending: string };

export function tuiMetricsForWidth(width: number): { fontSize: number; lineHeight: number } {
  if (width > 0 && width <= 520) return { fontSize: 10, lineHeight: 1.15 };
  if (width > 0 && width <= 720) return { fontSize: 11, lineHeight: 1.2 };
  return { fontSize: 12, lineHeight: 1.25 };
}

function stripSgrBackgrounds(sequence: string): string {
  const match = /^\u001b\[([0-9:;]*)([ -\/]*?)m$/.exec(sequence);
  if (!match) return sequence;
  const parts = match[1].split(";");
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.includes(":")) {
      const fields = part.split(":");
      if (fields[0] === "48") continue;
      kept.push(part);
      continue;
    }
    if (part === "48") {
      if (parts[index + 1] === "5") index += 2;
      else if (parts[index + 1] === "2") index += 4;
      continue;
    }
    const code = Number(part);
    if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) continue;
    kept.push(part);
  }
  return kept.length > 0 ? `\u001b[${kept.join(";")}m` : "";
}

export function stripKittyTuiBackgrounds(data: string, state: AnsiSanitizerState): string {
  const value = state.pending + data;
  state.pending = "";
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("\u001b[", cursor);
    if (start < 0) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, start);
    let final = start + 2;
    while (final < value.length && (value.charCodeAt(final) < 0x40 || value.charCodeAt(final) > 0x7e)) final += 1;
    if (final >= value.length) {
      state.pending = value.slice(start);
      break;
    }
    const sequence = value.slice(start, final + 1);
    output += sequence.endsWith("m") ? stripSgrBackgrounds(sequence) : sequence;
    cursor = final + 1;
  }
  return output;
}

export function AgentTui({
  workspace,
  onExit,
  onError
}: {
  workspace: WorkspaceIdentity;
  onExit: (exitCode: number | null) => void;
  onError: (message: string) => void;
}): ReactNode {
  const theme = useOptionalTheme()?.theme ?? "original";
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);
  const themeRef = useRef(theme);
  const ansiStateRef = useRef<AnsiSanitizerState>({ pending: "" });
  onExitRef.current = onExit;
  onErrorRef.current = onError;
  themeRef.current = theme;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const id = `term-${crypto.randomUUID()}`;
    const metrics = tuiMetricsForWidth(host.clientWidth);
    const terminal = new Terminal({
      fontFamily: theme === "kitty" ? "'FiraCode Nerd Font', 'SF Mono', Menlo, Consolas, monospace" : "'SF Mono', Menlo, Consolas, monospace",
      fontSize: metrics.fontSize,
      lineHeight: metrics.lineHeight,
      cursorBlink: true,
      scrollback: 5000,
      theme: theme === "kitty" ? KITTY_THEME : ORIGINAL_THEME
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    ansiStateRef.current.pending = "";

    const resize = (): void => {
      try {
        const nextMetrics = tuiMetricsForWidth(host.clientWidth);
        terminal.options.fontSize = nextMetrics.fontSize;
        terminal.options.lineHeight = nextMetrics.lineHeight;
        fit.fit();
      } catch {
        return;
      }
      void window.openshell.agentTuiResize(workspace, id, terminal.cols, terminal.rows).catch(() => {});
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    terminal.onData((data) => {
      void window.openshell.agentTuiInput(workspace, id, data).catch(() => {});
    });
    const off = window.openshell.onMessage((message) => {
      if (message.kind === "terminal-data" && message.terminal.id === id) {
        const data = themeRef.current === "kitty"
          ? stripKittyTuiBackgrounds(message.terminal.data, ansiStateRef.current)
          : message.terminal.data;
        terminal.write(data);
      }
      if (message.kind === "terminal-exit" && message.terminal.id === id) onExitRef.current(message.terminal.exitCode);
    });
    resize();
    void window.openshell.agentTuiStart(workspace, id).catch((error: unknown) => {
      onErrorRef.current(error instanceof Error ? error.message : "Could not start the agent TUI");
    });

    return () => {
      off();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      void window.openshell.agentTuiStop(workspace, id).catch(() => {});
    };
  }, [workspace.id, workspace.generation]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (theme !== "kitty") ansiStateRef.current.pending = "";
    terminal.options.theme = theme === "kitty" ? KITTY_THEME : ORIGINAL_THEME;
    terminal.options.fontFamily = theme === "kitty" ? "'FiraCode Nerd Font', 'SF Mono', Menlo, Consolas, monospace" : "'SF Mono', Menlo, Consolas, monospace";
  }, [theme]);

  return <div className="agent-tui"><div className="agent-tui-host" ref={hostRef} /></div>;
}
