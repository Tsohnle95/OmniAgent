import { spawn, type IDisposable, type IPty } from "node-pty";
import type { WorkspaceIdentity } from "@shared/types";

export interface PtyHandle {
  id: string;
  pty: IPty;
}

export function defaultShell(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  if (platform === "darwin") return env.SHELL ?? "/bin/zsh";
  if (platform === "win32") return env.COMSPEC ?? "powershell.exe";
  return env.SHELL ?? "/bin/bash";
}

export class TerminalManager {
  private terminals = new Map<string, {
    pty: IPty;
    workspaceId: string;
    dataSubscription: IDisposable;
    exitSubscription: IDisposable;
  }>();
  private listeners = new Set<(msg: unknown) => void>();

  constructor(private readonly spawnPty: typeof spawn = spawn) {}

  onMessage(cb: (msg: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: unknown): void {
    for (const cb of this.listeners) cb(msg);
  }

  async start(id: string, directory: string, workspace: WorkspaceIdentity): Promise<void> {
    if (this.terminals.has(id)) throw new Error("terminal already exists");
    const pty = this.spawnPty(defaultShell(process.platform, process.env), [], {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd: directory,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
    });
    const terminal = {
      pty,
      workspaceId: workspace.id,
      dataSubscription: pty.onData((data) => {
      this.emit({ kind: "terminal-data", terminal: { id, data } });
      }),
      exitSubscription: pty.onExit(({ exitCode }) => {
      this.terminals.delete(id);
      this.emit({ kind: "terminal-exit", terminal: { id, exitCode } });
      })
    };
    this.terminals.set(id, terminal);
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
    this.terminals.delete(id);
    terminal.dataSubscription.dispose();
    terminal.exitSubscription.dispose();
    try {
      terminal.pty.kill();
    } catch {
      return;
    }
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.terminals.keys()]) this.stop(id);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
