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
  onExitRef.current = onExit;
  onErrorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const id = `term-${crypto.randomUUID()}`;
    const terminal = new Terminal({
      fontFamily: theme === "kitty" ? "'FiraCode Nerd Font', 'SF Mono', Menlo, Consolas, monospace" : "'SF Mono', Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      theme: theme === "kitty" ? KITTY_THEME : ORIGINAL_THEME
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;

    const resize = (): void => {
      try {
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
      if (message.kind === "terminal-data" && message.terminal.id === id) terminal.write(message.terminal.data);
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
    terminal.options.theme = theme === "kitty" ? KITTY_THEME : ORIGINAL_THEME;
    terminal.options.fontFamily = theme === "kitty" ? "'FiraCode Nerd Font', 'SF Mono', Menlo, Consolas, monospace" : "'SF Mono', Menlo, Consolas, monospace";
  }, [theme]);

  return <div className="agent-tui"><div className="agent-tui-host" ref={hostRef} /></div>;
}
