import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { app } from "electron";
import { OpenCode } from "@opencode-ai/client";
import { Service, type Endpoint } from "@opencode-ai/client/service";
import type {
  PermissionReply,
  ProjectInfo,
  ReopenedSession,
  SessionInfo,
  SessionSummary,
  ToolCallView,
  TranscriptItem,
  TreeEntry,
  ModelOption
} from "@shared/types";

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

function toolDetailText(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.filePath === "string") return o.filePath;
  if (typeof o.file_path === "string") return o.file_path;
  if (typeof o.command === "string") return `$ ${o.command}`;
  return "";
}

function toolInputText(input: unknown): string {
  if (input == null) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function toolTitleText(input: unknown, name: string): string {
  if (name) return name;
  if (!input || typeof input !== "object") return "tool";
  const o = input as Record<string, unknown>;
  if (typeof o.tool === "string" && o.tool) return o.tool;
  if ("command" in o) return "bash";
  if ("filePath" in o || "file_path" in o) return "file";
  if ("query" in o) return "search";
  if ("url" in o) return "web";
  if ("prompt" in o) return "prompt";
  return "tool";
}

function toolContentText(content: unknown[] | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => (c as { type?: string })?.type === "text")
    .map((c) => String((c as { text?: unknown }).text ?? ""))
    .join("\n");
}

function replayToolCard(part: Record<string, unknown>): ToolCallView {
  const state = (part.state ?? {}) as Record<string, unknown>;
  const input = state.input;
  const status = state.status === "error" ? "failed" : state.status === "completed" ? "success" : "running";
  const time = (part.time ?? {}) as Record<string, number | undefined>;
  const ran = time.ran ?? time.created ?? Date.now();
  const completed = time.completed;
  return {
    id: String(part.id),
    title: toolTitleText(input, String(part.name ?? "")),
    detail: toolDetailText(input),
    status,
    input: toolInputText(input),
    output: toolContentText(state.content as unknown[] | undefined) || String((state.error as { message?: string } | undefined)?.message ?? ""),
    startedAt: time.created ?? Date.now(),
    duration: completed ? Math.max(0, completed - ran) : undefined,
    paths: collectFilePaths(input)
  };
}

function replayTranscript(messages: unknown[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const type = msg.type;
    if (type === "user") {
      const text = String(msg.text ?? "");
      if (text.trim()) out.push({ kind: "user", id: String(msg.id), text });
      continue;
    }
    if (type === "assistant") {
      const content = Array.isArray(msg.content) ? (msg.content as Record<string, unknown>[]) : [];
      const text = content
        .filter((c) => c.type === "text")
        .map((c) => String(c.text ?? ""))
        .join("");
      const reasoning = content
        .filter((c) => c.type === "reasoning")
        .map((c) => String(c.text ?? ""))
        .join("");
      if (text || reasoning) {
        out.push({
          kind: "assistant",
          id: String(msg.id),
          messageID: String(msg.id),
          text,
          reasoning,
          reasoningOpen: false
        });
      }
      for (const part of content.filter((c) => c.type === "tool")) {
        out.push({ kind: "tool", tool: replayToolCard(part) });
      }
      continue;
    }
    if (type === "compaction") {
      const status = (msg.status ?? "") as string;
      if (status === "running") {
        const summary = String(msg.summary ?? "").trim();
        out.push({
          kind: "status",
          id: String(msg.id),
          text: `Context compacted${summary ? `: ${summary}` : ""}`,
          tone: "info"
        });
      }
    }
  }
  return out;
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
  private lastEnsureAt = 0;
  private readonly ensureCooldownMs = 30_000;
  private readonly settingsPath = path.join(app.getPath("userData"), "settings.json");

  onMessage(cb: (msg: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: unknown): void {
    for (const cb of this.listeners) cb(msg);
  }

  private static discoverFiles(): string[] {
    if (process.platform !== "darwin") return [];
    const desktop = path.join(homedir(), "Library", "Application Support", "ai.opencode.desktop", "opencode", "service.json");
    return [desktop];
  }

  private async discoverEndpoint(): Promise<Endpoint | null> {
    const files = OpenShellBackend.discoverFiles();
    for (const file of files) {
      const endpoint = await Service.discover({ file }).catch(() => null);
      if (endpoint) return endpoint;
    }
    return null;
  }

  async connect(): Promise<boolean> {
    const endpoint =
      (await Service.discover().catch(() => null)) ??
      (await this.discoverEndpoint()) ??
      (await this.ensureBounded());
    if (!endpoint) return false;
    this.client = OpenCode.make({
      baseUrl: endpoint.url,
      headers: Service.headers(endpoint)
    });
    return true;
  }

  private async ensureBounded(): Promise<Endpoint | null> {
    if (Date.now() - this.lastEnsureAt < this.ensureCooldownMs) return null;
    this.lastEnsureAt = Date.now();
    const attempt = Service.ensure({
      command: ["opencode2", "serve", "--service"]
    }).catch(() => null);
    const timeout = sleep(10_000).then(() => null);
    return Promise.race([attempt, timeout]);
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

  private async savedModel(): Promise<{ id: string; providerID: string } | null> {
    try {
      const raw = await fsp.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as { model?: { id?: string; providerID?: string } };
      if (parsed.model?.id && parsed.model.providerID) {
        return { id: parsed.model.id, providerID: parsed.model.providerID };
      }
    } catch {
      /* no settings yet */
    }
    return null;
  }

  private async persistModel(id: string, providerID: string): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(this.settingsPath), { recursive: true });
      await fsp.writeFile(this.settingsPath, JSON.stringify({ model: { id, providerID } }, null, 2), "utf8");
    } catch (err) {
      console.error("[openshell] failed to persist model:", err);
    }
  }

  private async activateSession(id: string, directory: string): Promise<SessionInfo> {
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

  async openSession(directory: string): Promise<SessionInfo> {
    if (!this.client) throw new Error("not connected to opencode service");
    const saved = await this.savedModel();
    const res = await this.client.session.create({
      location: { directory },
      ...(saved ? { model: saved } : {})
    });
    const info = res as { id?: string; data?: { id?: string } };
    const id = info.id ?? info.data?.id;
    if (!id) throw new Error("session create returned no id");
    return this.activateSession(id, directory);
  }

  async listSessions(): Promise<SessionSummary[]> {
    if (!this.client) return [];
    const res = await this.client.session.list({ limit: 30, order: "desc" });
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as {
      id?: string;
      title?: string;
      location?: { directory?: string };
      time?: { updated?: number; created?: number };
    }[])
      .map((s) => {
        const directory = s.location?.directory;
        if (!s.id || !directory) return null;
        const updated = s.time?.updated ?? s.time?.created ?? 0;
        return {
          id: s.id,
          title: s.title?.trim() ? s.title : path.basename(directory),
          directory,
          updatedAt: updated
        };
      })
      .filter((s): s is SessionSummary => s !== null);
  }

  async openSessionById(sessionID: string): Promise<ReopenedSession> {
    if (!this.client) throw new Error("not connected to opencode service");
    const res = await this.client.session.get({ sessionID });
    const info = res as {
      id?: string;
      location?: { directory?: string };
      data?: { id?: string; location?: { directory?: string } };
    };
    const id = info.id ?? info.data?.id;
    const directory = info.location?.directory ?? info.data?.location?.directory;
    if (!id || !directory) throw new Error("session not found");
    const session = await this.activateSession(id, directory);
    const messagesRes = await this.client.message.list({ sessionID: id }).catch(() => null);
    const messages = messagesRes
      ? (Array.isArray(messagesRes) ? messagesRes : (messagesRes as { data?: unknown }).data ?? [])
      : [];
    return { session, transcript: replayTranscript(messages as unknown[]) };
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

  async listModels(): Promise<ModelOption[]> {
    if (!this.client) return [];
    const res = await this.client.model.list(
      this.directory ? { location: { directory: this.directory } } : undefined
    );
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as { id?: string; providerID?: string; name?: string; enabled?: boolean }[])
      .filter((m) => m.enabled !== false)
      .map((m) => ({
        id: m.id ?? "",
        providerID: m.providerID ?? "",
        name: m.name ?? m.id ?? "model"
      }))
      .filter((m) => m.id && m.providerID);
  }

  async switchModel(id: string, providerID: string): Promise<void> {
    if (!this.client || !this.sessionID) throw new Error("no active session");
    await this.client.session.switchModel({
      sessionID: this.sessionID,
      model: { id, providerID }
    });
    void this.persistModel(id, providerID);
  }

  async modelDefault(): Promise<ModelOption | null> {
    if (!this.client) return null;
    const res = await this.client.model.default(
      this.directory ? { location: { directory: this.directory } } : undefined
    );
    const data = res as { data?: { id?: string; providerID?: string; name?: string } };
    const m = data?.data ?? (res as { id?: string; providerID?: string; name?: string });
    if (!m?.id || !m.providerID) return null;
    return { id: m.id, providerID: m.providerID, name: m.name ?? m.id };
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
    return arr.map((e) => ({
      ...e,
      path: e.path.replace(/\/+$/, "")
    }));
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
