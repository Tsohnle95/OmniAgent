import { spawn, type IPty } from "node-pty";
import { execFile } from "node:child_process";
import type { WorkspaceIdentity } from "@shared/types";

export interface PtyHandle {
  id: string;
  pty: IPty;
}

export class TerminalManager {
  private terminals = new Map<string, { pty: IPty; workspaceId: string }>();
  private counter = 0;
  private listeners = new Set<(msg: unknown) => void>();

  onMessage(cb: (msg: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: unknown): void {
    for (const cb of this.listeners) cb(msg);
  }

  private static defaultShell(): string {
    if (process.platform === "darwin") return process.env.SHELL ?? "/bin/zsh";
    if (process.platform === "win32") return process.env.COMSPEC ?? "powershell.exe";
    return process.env.SHELL ?? "/bin/bash";
  }

  private static async loginShell(): Promise<string> {
    const shell = TerminalManager.defaultShell();
    if (process.platform === "win32" || !process.env.HOME) return shell;
    return new Promise((resolve) => {
      execFile(shell, ["-l", "-c", "echo $0"], { timeout: 5000 }, (err, stdout) => {
        resolve(err ? shell : String(stdout).trim() || shell);
      });
    });
  }

  async start(directory: string, workspace: WorkspaceIdentity): Promise<string> {
    const id = `term-${++this.counter}`;
    const shell = await TerminalManager.loginShell();
    const pty = spawn(shell, [], {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd: directory,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
    });
    pty.onData((data) => {
      this.emit({ kind: "terminal-data", terminal: { id, data } });
    });
    pty.onExit(({ exitCode }) => {
      this.terminals.delete(id);
      this.emit({ kind: "terminal-exit", terminal: { id, exitCode } });
    });
    this.terminals.set(id, { pty, workspaceId: workspace.id });
    return id;
  }

  private get(id: string, workspace: WorkspaceIdentity): IPty {
    const terminal = this.terminals.get(id);
    if (!terminal) throw new Error("unknown terminal");
    if (terminal.workspaceId !== workspace.id) throw new Error("stale terminal");
    return terminal.pty;
  }

  write(id: string, data: string, workspace: WorkspaceIdentity): void {
    this.get(id, workspace).write(data);
  }

  resize(id: string, cols: number, rows: number, workspace: WorkspaceIdentity): void {
    try {
      this.get(id, workspace).resize(cols, rows);
    } catch {
      throw new Error("unknown or unavailable terminal");
    }
  }

  stop(id: string, workspace?: WorkspaceIdentity): void {
    const terminal = this.terminals.get(id);
    if (!terminal) throw new Error("unknown terminal");
    if (workspace && terminal.workspaceId !== workspace.id) throw new Error("stale terminal");
    try {
      terminal.pty.kill();
    } catch {
      /* already dead */
    }
    this.terminals.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.terminals.keys()]) this.stop(id);
  }
}
