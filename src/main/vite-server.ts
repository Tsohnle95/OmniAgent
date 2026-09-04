import { spawn as nodeSpawn } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";
import type { VitePreview } from "@shared/types";

export type { VitePreview };

export interface ViteChild {
  kill: () => void;
  once: (event: string, listener: () => void) => void;
}

export interface ViteManagerDeps {
  launch: (directory: string, port: number) => ViteChild;
  findPort: (firstPort: number) => Promise<number>;
  waitReady: (url: string) => Promise<void>;
}

export const VITE_FIRST_PORT = 5199;
const VITE_PORT_ATTEMPTS = 20;
const VITE_READY_TIMEOUT_MS = 15000;
const VITE_READY_POLL_MS = 150;

export function probeFreePort(firstPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, attemptsLeft: number): void => {
      if (attemptsLeft <= 0) {
        reject(new Error("no free port for the Vite preview server"));
        return;
      }
      const server = createServer();
      server.once("error", () => {
        server.close();
        tryPort(port + 1, attemptsLeft - 1);
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    tryPort(firstPort, VITE_PORT_ATTEMPTS);
  });
}

export function pollHttpReady(url: string, timeoutMs = VITE_READY_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = get(url, (res) => {
        res.resume();
        resolve();
      });
      req.once("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error("Vite preview server did not become ready"));
          return;
        }
        setTimeout(attempt, VITE_READY_POLL_MS);
      });
    };
    attempt();
  });
}

export function defaultViteDeps(command: string, prefixArgs: string[], spawnImpl: typeof nodeSpawn = nodeSpawn): ViteManagerDeps {
  return {
    launch: (directory, port) =>
      spawnImpl(
        command,
        [...prefixArgs, "serve", directory, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
        { cwd: directory, stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
      ) as unknown as ViteChild,
    findPort: (firstPort) => probeFreePort(firstPort),
    waitReady: (url) => pollHttpReady(url)
  };
}

interface RunningServer {
  child: ViteChild;
  preview: VitePreview;
  directory: string;
}

export class VitePreviewManager {
  private servers = new Map<string, RunningServer>();

  constructor(private readonly deps: ViteManagerDeps, private readonly firstPort = VITE_FIRST_PORT) {}

  running(key: string): VitePreview | null {
    const entry = this.servers.get(key);
    return entry ? entry.preview : null;
  }

  async start(key: string, directory: string): Promise<VitePreview> {
    const existing = this.servers.get(key);
    if (existing && existing.directory === directory) return existing.preview;
    if (existing) this.stop(key);
    const port = await this.deps.findPort(this.firstPort);
    const url = `http://127.0.0.1:${port}/`;
    const child = this.deps.launch(directory, port);
    let rejectExit: (error: Error) => void = () => undefined;
    const earlyExit = new Promise<never>((_, reject) => {
      rejectExit = reject;
    });
    const entry: RunningServer = { child, preview: { url, port }, directory };
    child.once("exit", () => {
      if (this.servers.get(key) === entry) this.servers.delete(key);
      rejectExit(new Error("Vite preview server exited before becoming ready"));
    });
    this.servers.set(key, entry);
    try {
      await Promise.race([this.deps.waitReady(url), earlyExit]);
    } catch (error) {
      this.stop(key);
      throw error;
    }
    return entry.preview;
  }

  stop(key: string): void {
    const entry = this.servers.get(key);
    if (!entry) return;
    this.servers.delete(key);
    try {
      entry.child.kill();
    } catch {
      return;
    }
  }

  async stopAll(): Promise<void> {
    for (const key of [...this.servers.keys()]) this.stop(key);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
