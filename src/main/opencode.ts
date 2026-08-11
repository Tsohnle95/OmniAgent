import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { OpenCode } from "@opencode-ai/client";
import { Service } from "@opencode-ai/client/service";
import type { PermissionReply, ProjectInfo, SessionInfo, TreeEntry } from "@shared/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".venv", "__pycache__", ".cache", ".turbo", ".nx",
  ".svn", ".hg", ".idea", ".vscode", "dist", "out", "build", "target", "coverage", ".pytest_cache"
]);

function toText(res: unknown): string {
  const d = (res as { data?: unknown })?.data ?? res;
  if (typeof d === "string") return d;
  if (d instanceof Uint8Array) return new TextDecoder().decode(d);
  if (d instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(d));
  if (typeof (d as { text?: unknown })?.text === "function") {
    return String((d as { text: () => string }).text());
  }
  return String(d);
}

function collectFilePaths(obj: unknown): string[] {
  const out: string[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if ((k === "filePath" || k === "file_path" || k === "path") && typeof v === "string" && !v.startsWith("http")) {
        out.push(v);
      } else if (typeof v === "object") {
        walk(v);
      }
    }
  };
  walk(obj);
  return [...new Set(out)];
}

type Client = ReturnType<typeof OpenCode.make>;

export class OpenShellBackend {
  private client: Client | null = null;
  private sessionID: string | null = null;
  private directory: string | null = null;
  private snapshots = new Map<string, string | null>();
  private lastKnown = new Map<string, string>();
  private watcher: FSWatcher | null = null;
  private watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hasGit: boolean | null = null;
  private listeners = new Set<(msg: unknown) => void>();
  private stopped = false;

  onMessage(cb: (msg: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: unknown): void {
    for (const cb of this.listeners) cb(msg);
  }

  async connect(): Promise<boolean> {
    const discovered = await Service.discover().catch(() => null);
    const endpoint =
      discovered ??
      (await Service.ensure({
        command: ["opencode2", "serve", "--service"]
      }).catch(() => null));
    if (!endpoint) return false;
    this.client = OpenCode.make({
      baseUrl: endpoint.url,
      headers: Service.headers(endpoint)
    });
    return true;
  }

  start(): void {
    void this.runEventLoop();
  }

  private async runEventLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        if (!this.client && !(await this.connect())) {
          await sleep(2000);
          continue;
        }
        for await (const evt of this.client!.event.subscribe()) {
          if (this.stopped) return;
          const typed = evt as { type?: string; data?: unknown };
          const type = typed.type ?? "unknown";
          this.emit({ kind: "event", type, data: evt });
          await this.handleServerEvent(type, typed.data).catch(() => {});
        }
      } catch (err) {
        console.error("[openshell] event loop error:", err);
        this.client = null;
      }
      await sleep(1500);
    }
  }

  private async handleServerEvent(type: string, data: unknown): Promise<void> {
    if (!this.directory) return;
    const d = data as { sessionID?: string };
    if (d && "sessionID" in d && d.sessionID && d.sessionID !== this.sessionID) return;
    if (type === "session.tool.called") {
      const input = (data as { input?: unknown }).input;
      await this.snapshotInputs(input);
    } else if (type === "filesystem.changed") {
      const f = data as { file: string; event: "add" | "change" | "unlink" };
      if (typeof f?.file === "string") await this.onFsChanged(this.abs(f.file), f.event);
    }
  }

  // ---------- filesystem watching + agent baselines ----------

  private abs(rel: string): string {
    return path.isAbsolute(rel) ? rel : path.join(this.directory!, rel);
  }

  private relKey(abs: string): string {
    const rel = path.isAbsolute(abs) ? path.relative(this.directory!, abs) : abs;
    return rel.split(path.sep).join("/");
  }

  private shouldSkip(abs: string): boolean {
    const rel = path.relative(this.directory!, abs);
    const first = rel.split(path.sep)[0];
    return SKIP_DIRS.has(first);
  }

  private async snapshotInputs(input: unknown): Promise<void> {
    for (const rel of collectFilePaths(input)) {
      const abs = this.abs(rel);
      if (this.snapshots.has(abs)) continue;
      try {
        const content = await this.readFile(this.relKey(abs));
        if (content !== null) this.snapshots.set(abs, content);
      } catch {
        /* ignore */
      }
    }
  }

  private async gitShow(rel: string): Promise<string | null> {
    if (this.hasGit === false) return null;
    if (this.hasGit === null) {
      try {
        await fsp.access(path.join(this.directory!, ".git"));
        this.hasGit = true;
      } catch {
        this.hasGit = false;
        return null;
      }
    }
    return new Promise((resolve) => {
      execFile(
        "git",
        ["show", `HEAD:${rel}`],
        { cwd: this.directory!, maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
        (err, stdout) => {
          resolve(err ? null : stdout);
        }
      );
    });
  }

  private startWatcher(): void {
    this.stopWatcher();
    if (!this.directory) return;
    try {
      this.watcher = watch(this.directory, { recursive: true }, (_event, filename) => {
        if (!filename || typeof filename !== "string") return;
        const abs = this.abs(filename);
        if (this.shouldSkip(abs)) return;
        this.scheduleWatch(abs);
      });
      this.watcher.on("error", (err) => console.error("[openshell] watcher error:", err));
      console.log("[openshell] watching", this.directory);
    } catch (err) {
      console.error("[openshell] fs.watch unavailable, live updates disabled:", err);
    }
  }

  private stopWatcher(): void {
    for (const t of this.watchTimers.values()) clearTimeout(t);
    this.watchTimers.clear();
    this.watcher?.close();
    this.watcher = null;
  }

  private scheduleWatch(abs: string): void {
    const existing = this.watchTimers.get(abs);
    if (existing) clearTimeout(existing);
    this.watchTimers.set(
      abs,
      setTimeout(() => {
        this.watchTimers.delete(abs);
        void this.onFsChanged(abs, "change");
      }, 200)
    );
  }

  private async onFsChanged(abs: string, event: string): Promise<void> {
    if (this.shouldSkip(abs)) return;
    let stat: Awaited<ReturnType<typeof fsp.stat>> | null = null;
    try {
      stat = await fsp.stat(abs);
    } catch {
      /* missing */
    }
    if (!stat || !stat.isFile()) {
      if (this.lastKnown.has(abs) || this.snapshots.has(abs)) {
        const baseline =
          this.snapshots.get(abs) ??
          this.lastKnown.get(abs) ??
          (await this.gitShow(this.relKey(abs))) ??
          "";
        this.snapshots.set(abs, baseline);
        this.lastKnown.delete(abs);
        this.emitFileUpdate(abs, null, baseline);
      }
      return;
    }
    let content: string;
    try {
      content = await fsp.readFile(abs, "utf8");
    } catch {
      return;
    }
    if (content === this.lastKnown.get(abs)) return;
    this.lastKnown.set(abs, content);
    if (!this.snapshots.has(abs)) {
      const git = await this.gitShow(this.relKey(abs));
      const baseline = this.hasGit === false ? content : (git ?? "");
      this.snapshots.set(abs, baseline);
    }
    this.emitFileUpdate(abs, content);
  }

  private emitFileUpdate(abs: string, content: string | null, baselineOverride?: string): void {
    const baseline =
      baselineOverride !== undefined
        ? baselineOverride
        : (this.snapshots.get(abs) ?? "");
    this.emit({
      kind: "file-update",
      file: { path: this.relKey(abs), baseline, content, deleted: content === null }
    });
  }

  // ---------- session + API ----------

  async openSession(directory: string): Promise<SessionInfo> {
    if (!this.client) throw new Error("not connected to opencode service");
    const res = await this.client.session.create({ location: { directory } });
    const info = res as { id?: string; data?: { id?: string } };
    const id = info.id ?? info.data?.id;
    if (!id) throw new Error("session create returned no id");
    this.sessionID = id;
    this.directory = directory;
    this.snapshots.clear();
    this.lastKnown.clear();
    this.hasGit = null;
    this.startWatcher();
    const session: SessionInfo = { id, directory };
    this.emit({ kind: "session", session });
    return session;
  }

  getState(): SessionInfo | null {
    return this.sessionID && this.directory ? { id: this.sessionID, directory: this.directory } : null;
  }

  async prompt(text: string): Promise<void> {
    if (!this.client || !this.sessionID) throw new Error("no active session");
    await this.client.session.prompt({ sessionID: this.sessionID, text });
  }

  async interrupt(): Promise<void> {
    if (!this.client || !this.sessionID) return;
    await this.client.session.interrupt({ sessionID: this.sessionID }).catch(() => {});
  }

  async replyPermission(requestID: string, reply: PermissionReply): Promise<void> {
    if (!this.client || !this.sessionID) throw new Error("no active session");
    await this.client.permission.reply({
      sessionID: this.sessionID,
      requestID,
      reply
    });
  }

  async listDir(rel: string): Promise<TreeEntry[]> {
    if (!this.client || !this.directory) throw new Error("no active session");
    const body = await this.client.file.list({
      location: { directory: this.directory },
      path: rel
    });
    const arr = Array.isArray(body) ? body : (body as { data?: TreeEntry[] }).data ?? [];
    return arr;
  }

  async readFile(rel: string): Promise<string | null> {
    if (!this.client || !this.directory) throw new Error("no active session");
    const res = await this.client.file.read({
      location: { directory: this.directory },
      path: rel
    });
    return toText(res);
  }

  async writeFile(rel: string, content: string): Promise<void> {
    if (!this.directory) throw new Error("no active session");
    const abs = this.abs(rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, "utf8");
    this.snapshots.set(abs, content);
    this.lastKnown.set(abs, content);
    this.emitFileUpdate(abs, content);
  }

  async listProjects(): Promise<ProjectInfo[]> {
    if (!this.client) return [];
    const res = await this.client.project.list();
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as { canonical?: string; directory?: string; name?: string }[])
      .map((p) => {
        const directory = p.canonical ?? p.directory;
        if (!directory) return null;
        return { directory, name: p.name ?? path.basename(directory) };
      })
      .filter((p): p is ProjectInfo => p !== null);
  }

  stop(): void {
    this.stopped = true;
    this.stopWatcher();
  }
}
