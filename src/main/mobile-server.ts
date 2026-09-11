import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Attaches the Orbit mobile server to the desktop app's lifecycle.
 *
 * While Orbit is open the mobile server (opencode2 backend + Orbit web server)
 * runs, so the Orbit mobile app connects over the tailnet. When Orbit quits —
 * or is force-killed — the server stops. This mirrors OpenChamber, where the
 * desktop process is the server.
 *
 * The mobile workspace location is `ORBIT_MOBILE_HOME` or `~/coding-projects/orbit-mobile`.
 * If the workspace or its service script is missing, this is a silent no-op.
 */

const DEFAULT_MOBILE_HOME = path.join(homedir(), "coding-projects", "orbit-mobile");
const SUPPORT = path.join(homedir(), "Library", "Application Support", "OrbitMobile");
const STATUS_FILE = path.join(SUPPORT, "run", "desktop-status.json");

export interface MobileStatus {
  running: boolean;
  url?: string;
  password?: string;
  port?: number;
}

const resolveNode = (): string | null => {
  const explicit = process.env["ORBIT_NODE_BIN"];
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    path.join(homedir(), ".local", "bin", "node"),
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node"
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  try {
    const which = spawnSync("which", ["node"], { encoding: "utf8" });
    const found = (which.stdout || "").trim();
    if (found && existsSync(found)) return found;
  } catch {
    // fall through
  }
  return null;
};

const resolveMobileHome = (): string | null => {
  const home = process.env["ORBIT_MOBILE_HOME"] || DEFAULT_MOBILE_HOME;
  const script = path.join(home, "scripts", "desktop-service.mjs");
  return existsSync(script) ? home : null;
};

export class MobileServer {
  private child: ChildProcess | null = null;
  private home: string | null = resolveMobileHome();
  private node: string | null = resolveNode();

  available(): boolean {
    return Boolean(this.home && this.node);
  }

  start(): void {
    if (!this.available() || this.child) return;
    const script = path.join(this.home as string, "scripts", "desktop-service.mjs");
    mkdirSync(path.join(SUPPORT, "logs"), { recursive: true });
    const out = openSync(path.join(SUPPORT, "logs", "desktop-service.out.log"), "a");
    const err = openSync(path.join(SUPPORT, "logs", "desktop-service.err.log"), "a");
    try {
      this.child = spawn(this.node as string, [script, "--parent-pid", String(process.pid)], {
        cwd: this.home as string,
        env: { ...process.env, HOME: homedir() },
        stdio: ["ignore", out, err]
      });
      this.child.on("exit", () => {
        this.child = null;
      });
    } catch (error) {
      console.error("[mobile-server] failed to start:", error);
    } finally {
      closeSync(out);
      closeSync(err);
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      child.once("exit", done);
      try {
        child.kill("SIGTERM");
      } catch {
        done();
        return;
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
        done();
      }, 4000);
    });
  }
}
