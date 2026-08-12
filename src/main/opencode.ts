import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { app, shell } from "electron";
import { OpenCode } from "@opencode-ai/client";
import { Service, type Endpoint } from "@opencode-ai/client/service";
import type {
  AssistantPartView,
  AgentOption,
  CommandOption,
  FileWriteIdentity,
  PermissionReply,
  ProjectInfo,
  PromptFile,
  ProviderUsageResult,
  ReferenceOption,
  ReopenedSession,
  SessionInfo,
  SessionSelection,
  SessionSummary,
  SessionUsage,
  TodoItem,
  ToolContentView,
  ToolCallView,
  TranscriptItem,
  TreeEntry,
  ModelOption
} from "@shared/types";
import type { WorkspaceIdentity } from "@shared/types";
import { LatestGeneration, sameWorkspace } from "@shared/generation";
import { fetchProviderUsage } from "./provider-usage";
import { WorkspaceOperationCoordinator } from "./operation-coordinator";
import { BackendEventLoop } from "./backend-event-loop";
import {
  assertPermissionSession,
  assertWorkspaceTarget,
  captureWorkspaceTarget,
  type ActiveWorkspaceTarget
} from "./workspace-target";
import {
  assertWorkspace,
  canonicalWorkspaceRoot,
  confinedPath,
  fileContent,
  fileName,
  relativePath
} from "./workspace-security";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".venv", "__pycache__", ".cache", ".turbo", ".nx",
  ".svn", ".hg", ".idea", ".vscode", "dist", "out", "build", "target", "coverage", ".pytest_cache"
]);

function modelID(model: { id?: string; modelID?: string }): string {
  return model.id ?? model.modelID ?? "";
}

function variantIDs(variants: unknown): string[] {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant) => typeof variant === "string" ? variant : (variant as { id?: string })?.id ?? "")
    .filter(Boolean);
}

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

function toolContentViews(content: unknown): ToolContentView[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const items = content.flatMap((raw): ToolContentView[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (item.type === "text") return [{ type: "text", text: String(item.text ?? "") }];
    if (item.type !== "file" || typeof item.uri !== "string" || typeof item.mime !== "string") return [];
    return [{
      type: "file",
      uri: item.uri,
      mime: item.mime,
      ...(typeof item.name === "string" ? { name: item.name } : {})
    }];
  });
  return items.length > 0 ? items : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function replayToolCard(part: Record<string, unknown>): ToolCallView {
  const state = (part.state ?? {}) as Record<string, unknown>;
  const input = state.input;
  const status = state.status === "error" ? "failed" : state.status === "completed" ? "success" : "running";
  const time = (part.time ?? state.time ?? {}) as Record<string, number | undefined>;
  const ran = time.ran ?? time.created ?? Date.now();
  const completed = time.completed;
  return {
    id: String(part.callID ?? part.id),
    title: toolTitleText(input, String(part.name ?? part.tool ?? "")),
    detail: toolDetailText(input),
    status,
    input: toolInputText(input),
    output:
      toolContentText(state.content as unknown[] | undefined) ||
      String(state.output ?? (state.error as { message?: string } | undefined)?.message ?? state.error ?? ""),
    startedAt: time.created ?? Date.now(),
    duration: completed ? Math.max(0, completed - ran) : undefined,
    paths: collectFilePaths(input),
    metadata: record(state.metadata),
    inputValue: input,
    content: toolContentViews(state.content),
    ...(typeof part.executed === "boolean" ? { executed: part.executed } : {}),
    providerState: record(part.providerState),
    providerResultState: record(part.providerResultState)
  };
}

function todoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const content = typeof item.content === "string" ? item.content : "";
    const rawStatus = typeof item.status === "string" ? item.status : "pending";
    const status = ["pending", "in_progress", "completed", "cancelled"].includes(rawStatus)
      ? rawStatus as TodoItem["status"]
      : "pending";
    if (!content) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `todo-${index}`,
      content,
      status,
      ...(typeof item.priority === "string" ? { priority: item.priority } : {})
    }];
  });
}

function replayTodos(messages: unknown[]): TodoItem[] {
  let result: TodoItem[] = [];
  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const info = (msg.info ?? msg) as Record<string, unknown>;
    const parts = Array.isArray(msg.parts)
      ? msg.parts as Record<string, unknown>[]
      : Array.isArray(info.content)
        ? info.content as Record<string, unknown>[]
        : [];
    for (const part of parts) {
      const name = String(part.tool ?? part.name).toLowerCase().replace(/[^a-z]/g, "");
      if (part.type !== "tool" || name !== "todowrite") continue;
      const state = part.state && typeof part.state === "object"
        ? part.state as Record<string, unknown>
        : {};
      const metadata = state.metadata && typeof state.metadata === "object"
        ? state.metadata as Record<string, unknown>
        : {};
      const input = state.input && typeof state.input === "object"
        ? state.input as Record<string, unknown>
        : {};
      const next = todoItems(metadata.todos ?? input.todos);
      if (next.length > 0) result = next;
    }
  }
  return result;
}

function replayTranscript(messages: unknown[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const info = (msg.info ?? msg) as Record<string, unknown>;
    const parts = Array.isArray(msg.parts) ? (msg.parts as Record<string, unknown>[]) : [];
    const type = info.type ?? info.role;
    if (type === "user") {
      const text = String(
        info.text ?? parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
      );
      const files = Array.isArray(info.files) ? info.files as Record<string, unknown>[] : [];
      const attachments = files.flatMap((file): { name: string }[] =>
        typeof file.name === "string" && file.name ? [{ name: file.name }] : []
      );
      if (text.trim()) {
        out.push({
          kind: "user",
          id: String(info.id),
          text,
          ...(attachments.length > 0 ? { attachments } : {})
        });
      }
      continue;
    }
    if (type === "agent-switched") {
      out.push({
        kind: "selection",
        id: String(info.id),
        selection: "agent",
        title: "Agent switched",
        detail: String(info.agent ?? "")
      });
      continue;
    }
    if (type === "model-switched") {
      const model = record(info.model);
      const id = String(model?.id ?? "");
      const provider = String(model?.providerID ?? "");
      out.push({
        kind: "selection",
        id: String(info.id),
        selection: "model",
        title: "Model switched",
        detail: [provider, id].filter(Boolean).join(" / ")
      });
      continue;
    }
    if (type === "synthetic") {
      out.push({
        kind: "synthetic",
        id: String(info.id),
        text: String(info.text ?? ""),
        ...(typeof info.description === "string" ? { description: info.description } : {})
      });
      continue;
    }
    if (type === "system") {
      out.push({ kind: "system", id: String(info.id), text: String(info.text ?? "") });
      continue;
    }
    if (type === "skill") {
      out.push({
        kind: "skill",
        id: String(info.id),
        skill: String(info.skill ?? ""),
        name: String(info.name ?? info.skill ?? "Skill"),
        text: String(info.text ?? "")
      });
      continue;
    }
    if (type === "shell") {
      const output = record(info.output);
      const status = ["running", "exited", "timeout", "killed"].includes(String(info.status))
        ? String(info.status) as "running" | "exited" | "timeout" | "killed"
        : "running";
      out.push({
        kind: "shell",
        id: String(info.id),
        shellID: String(info.shellID ?? info.id),
        command: String(info.command ?? ""),
        status,
        ...(typeof output?.output === "string" ? { output: output.output } : {}),
        ...(["number", "string"].includes(typeof info.exit) ? { exit: info.exit as number | string } : {})
      });
      continue;
    }
    if (type === "assistant") {
      const content = parts.length > 0
        ? parts
        : Array.isArray(info.content) ? (info.content as Record<string, unknown>[]) : [];
      const completed = Boolean((info.time as Record<string, unknown> | undefined)?.completed ?? info.finish);
      const assistantParts = content.flatMap((part, index): AssistantPartView[] => {
        const id = String(part.id ?? `${String(info.id)}:${String(part.type)}:${index}`);
        if (part.type === "text" || part.type === "reasoning") {
          const time = (part.time ?? {}) as Record<string, unknown>;
          return [{
            kind: part.type,
            id,
            text: String(part.text ?? ""),
            complete: Boolean(time.end ?? time.completed ?? completed)
          }];
        }
        if (part.type === "tool") return [{ kind: "tool", id, tool: replayToolCard(part) }];
        return [];
      });
      if (assistantParts.length > 0 || !completed || info.retry || info.error) {
        out.push({
          kind: "assistant",
          id: String(info.id),
          messageID: String(info.id),
          parts: assistantParts,
          completed,
          ...(info.retry && typeof info.retry === "object"
            ? {
                retry: {
                  attempt: Number((info.retry as Record<string, unknown>).attempt ?? 1),
                  message: String(
                    ((info.retry as Record<string, unknown>).error as { message?: unknown } | undefined)?.message ??
                    "Retrying"
                  ),
                  next: Number((info.retry as Record<string, unknown>).at ?? 0) || undefined
                }
              }
            : {}),
          ...(info.error ? { error: String((info.error as { message?: unknown }).message ?? info.error) } : {})
        });
      }
      continue;
    }
    if (type === "compaction") {
      const status = ["running", "completed", "failed"].includes(String(info.status))
        ? String(info.status) as "running" | "completed" | "failed"
        : "completed";
      out.push({
        kind: "compaction",
        id: String(info.id),
        status,
        reason: info.reason === "manual" ? "manual" : "auto",
        summary: String(info.summary ?? ""),
        ...(typeof info.recent === "string" ? { recent: info.recent } : {}),
        ...(info.error ? { error: String(record(info.error)?.message ?? info.error) } : {})
      });
    }
  }
  return out;
}

type Client = ReturnType<typeof OpenCode.make>;

interface WatchContext {
  root: string;
  sessionID: string;
  workspace: WorkspaceIdentity;
  snapshots: Map<string, string | null>;
  lastKnown: Map<string, string>;
  hasGit: boolean | null;
}

export class OpenShellBackend {
  private client: Client | null = null;
  private sessionID: string | null = null;
  private directory: string | null = null;
  private workspace: WorkspaceIdentity | null = null;
  private sessionInfo: SessionInfo | null = null;
  private watchContext: WatchContext | null = null;
  private watcher: FSWatcher | null = null;
  private watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(msg: unknown) => void>();
  private stopped = false;
  private readonly eventLoop = new BackendEventLoop();
  private readonly activations = new LatestGeneration();
  private readonly mutations = new WorkspaceOperationCoordinator();
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

  private workspaceRoot(expected: WorkspaceIdentity): string {
    assertWorkspace(expected, this.workspace);
    if (!this.directory) throw new Error("no active session");
    return this.directory;
  }

  private activeTarget(workspace: WorkspaceIdentity): ActiveWorkspaceTarget {
    return captureWorkspaceTarget(workspace, {
      workspace: this.workspace,
      sessionID: this.sessionID,
      directory: this.directory
    });
  }

  private assertTarget(target: ActiveWorkspaceTarget): void {
    assertWorkspaceTarget(target, {
      workspace: this.workspace,
      sessionID: this.sessionID,
      directory: this.directory
    });
  }

  beginActivation(requestGeneration: number): number {
    if (!Number.isSafeInteger(requestGeneration) || requestGeneration < 1) {
      throw new Error("invalid activation generation");
    }
    return this.activations.accept();
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
    this.stopped = false;
    this.eventLoop.start(() => this.runEventLoop());
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
          const typed = evt as { type?: string; event?: string; data?: unknown; properties?: unknown };
          const type = typed.type ?? typed.event ?? "unknown";
          this.emit({ kind: "event", type, data: evt });
          await this.handleServerEvent(type, typed.data ?? typed.properties).catch(() => {});
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
      const context = this.watchContext;
      if (context && typeof f?.file === "string") {
        await this.onFsChanged(context, this.abs(f.file, context.root), f.event);
      }
    }
  }

  // ---------- filesystem watching + agent baselines ----------

  private currentWatch(context: WatchContext): boolean {
    return this.watchContext === context && sameWorkspace(context.workspace, this.workspace);
  }

  private abs(rel: string, root = this.directory!): string {
    return path.isAbsolute(rel) ? rel : path.join(root, rel);
  }

  private relKey(abs: string, root = this.directory!): string {
    const rel = path.isAbsolute(abs) ? path.relative(root, abs) : abs;
    return rel.split(path.sep).join("/");
  }

  private shouldSkip(abs: string, root = this.directory!): boolean {
    const rel = path.relative(root, abs);
    const first = rel.split(path.sep)[0];
    return SKIP_DIRS.has(first);
  }

  private async snapshotInputs(input: unknown): Promise<void> {
    const context = this.watchContext;
    if (!context) return;
    for (const rel of collectFilePaths(input)) {
      const abs = this.abs(rel, context.root);
      if (context.snapshots.has(abs)) continue;
      try {
        const content = await this.readFile(context.workspace, this.relKey(abs, context.root));
        if (this.currentWatch(context) && content !== null) context.snapshots.set(abs, content);
      } catch {
        /* ignore */
      }
    }
  }

  private async gitShow(context: WatchContext, rel: string): Promise<string | null> {
    if (context.hasGit === false) return null;
    if (context.hasGit === null) {
      try {
        await fsp.access(path.join(context.root, ".git"));
        if (!this.currentWatch(context)) return null;
        context.hasGit = true;
      } catch {
        if (!this.currentWatch(context)) return null;
        context.hasGit = false;
        return null;
      }
    }
    return new Promise((resolve) => {
      execFile(
        "git",
        ["show", `HEAD:${rel}`],
        { cwd: context.root, maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
        (err, stdout) => {
          resolve(err ? null : stdout);
        }
      );
    });
  }

  private startWatcher(context: WatchContext): void {
    this.stopWatcher();
    try {
      this.watcher = watch(context.root, { recursive: true }, (_event, filename) => {
        if (!this.currentWatch(context)) return;
        if (!filename || typeof filename !== "string") return;
        const abs = this.abs(filename, context.root);
        if (this.shouldSkip(abs, context.root)) return;
        this.scheduleWatch(context, abs);
      });
      this.watcher.on("error", (err) => console.error("[openshell] watcher error:", err));
      console.log("[openshell] watching", context.root);
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

  private scheduleWatch(context: WatchContext, abs: string): void {
    const existing = this.watchTimers.get(abs);
    if (existing) clearTimeout(existing);
    this.watchTimers.set(
      abs,
      setTimeout(() => {
        this.watchTimers.delete(abs);
        if (this.currentWatch(context)) void this.onFsChanged(context, abs, "change");
      }, 200)
    );
  }

  private async onFsChanged(context: WatchContext, abs: string, event: string): Promise<void> {
    if (!this.currentWatch(context) || this.shouldSkip(abs, context.root)) return;
    let stat: Awaited<ReturnType<typeof fsp.stat>> | null = null;
    try {
      stat = await fsp.stat(abs);
    } catch {
      /* missing */
    }
    if (!this.currentWatch(context)) return;
    if (!stat || !stat.isFile()) {
      if (context.lastKnown.has(abs) || context.snapshots.has(abs)) {
        const baseline =
          context.snapshots.get(abs) ??
          context.lastKnown.get(abs) ??
          (await this.gitShow(context, this.relKey(abs, context.root))) ??
          "";
        if (!this.currentWatch(context)) return;
        context.snapshots.set(abs, baseline);
        context.lastKnown.delete(abs);
        this.emitFileUpdate(context, abs, null, baseline);
      }
      return;
    }
    let content: string;
    try {
      content = await fsp.readFile(abs, "utf8");
    } catch {
      return;
    }
    if (!this.currentWatch(context) || content === context.lastKnown.get(abs)) return;
    context.lastKnown.set(abs, content);
    if (!context.snapshots.has(abs)) {
      const git = await this.gitShow(context, this.relKey(abs, context.root));
      if (!this.currentWatch(context)) return;
      const baseline = context.hasGit === false ? content : (git ?? "");
      context.snapshots.set(abs, baseline);
    }
    this.emitFileUpdate(context, abs, content);
  }

  private emitFileUpdate(
    context: WatchContext,
    abs: string,
    content: string | null,
    baselineOverride?: string,
    write?: FileWriteIdentity
  ): void {
    const baseline =
      baselineOverride !== undefined
        ? baselineOverride
        : (context.snapshots.get(abs) ?? "");
    if (!this.currentWatch(context)) return;
    this.emit({
      kind: "file-update",
      file: {
        workspace: context.workspace,
        sessionID: context.sessionID,
        path: this.relKey(abs, context.root),
        baseline,
        content,
        deleted: content === null,
        ...(write ? { write } : {})
      }
    });
  }

  // ---------- session + API ----------

  private async savedModel(): Promise<{ id: string; providerID: string; variant?: string } | null> {
    try {
      const raw = await fsp.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as { model?: { id?: string; providerID?: string; variant?: string } };
      if (parsed.model?.id && parsed.model.providerID) {
        return {
          id: parsed.model.id,
          providerID: parsed.model.providerID,
          ...(parsed.model.variant ? { variant: parsed.model.variant } : {})
        };
      }
    } catch {
      /* no settings yet */
    }
    return null;
  }

  private async savedAgent(): Promise<string | null> {
    try {
      const raw = await fsp.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as { agent?: { id?: string } };
      if (parsed.agent?.id) return parsed.agent.id;
    } catch {
      /* no settings yet */
    }
    return null;
  }

  private async persistSettings(
    patch: { model?: { id: string; providerID: string; variant?: string }; agent?: string }
  ): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(this.settingsPath), { recursive: true });
      const existing = (await this.savedModel()) ?? null;
      const prev = existing ? { model: existing } : {};
      const agent = await this.savedAgent();
      const base = { ...prev, ...(agent ? { agent: { id: agent } } : {}) };
      await fsp.writeFile(this.settingsPath, JSON.stringify({ ...base, ...patch }, null, 2), "utf8");
    } catch (err) {
      console.error("[openshell] failed to persist settings:", err);
    }
  }

  private async activateSession(
    generation: number,
    info: Omit<SessionInfo, "workspace">
  ): Promise<SessionInfo> {
    const directory = await canonicalWorkspaceRoot(info.directory);
    if (!this.activations.current(generation)) throw new Error("activation superseded");
    const workspace = Object.freeze({ id: randomUUID(), generation });
    const activated = { ...info, directory, workspace };
    const context: WatchContext = {
      root: directory,
      sessionID: info.id,
      workspace,
      snapshots: new Map(),
      lastKnown: new Map(),
      hasGit: null
    };
    this.sessionID = info.id;
    this.directory = directory;
    this.workspace = workspace;
    this.sessionInfo = activated;
    this.watchContext = context;
    this.startWatcher(context);
    this.emit({ kind: "session", session: activated });
    return activated;
  }

  async openSession(directory: string, acceptedGeneration?: number): Promise<SessionInfo> {
    const generation = acceptedGeneration ?? this.activations.accept();
    if (!this.client) throw new Error("not connected to opencode service");
    const [saved, agent] = await Promise.all([this.savedModel(), this.savedAgent()]);
    const res = await this.client.session.create({
      location: { directory },
      ...(saved ? { model: saved } : {}),
      ...(agent ? { agent } : {})
    });
    const info = res as {
      id?: string;
      title?: string;
      parentID?: string;
      agent?: string;
      data?: { id?: string; title?: string; parentID?: string; agent?: string };
    };
    const id = info.id ?? info.data?.id;
    if (!id) throw new Error("session create returned no id");
    return this.activateSession(generation, {
      id,
      directory,
      ...(info.parentID ?? info.data?.parentID ? { parentID: info.parentID ?? info.data?.parentID } : {}),
      ...(info.title ?? info.data?.title ? { title: info.title ?? info.data?.title } : {}),
      ...(info.agent ?? info.data?.agent ? { agent: info.agent ?? info.data?.agent } : {})
    });
  }

  async listSessions(): Promise<SessionSummary[]> {
    if (!this.client) return [];
    const res = await this.client.session.list({ limit: 30, order: "desc" });
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as {
      id?: string;
      modelID?: string;
      title?: string;
      parentID?: string;
      agent?: string;
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
          updatedAt: updated,
          ...(s.parentID ? { parentID: s.parentID } : {}),
          ...(s.agent ? { agent: s.agent } : {})
        };
      })
      .filter((s): s is SessionSummary => s !== null);
  }

  async openSessionById(sessionID: string, acceptedGeneration?: number): Promise<ReopenedSession> {
    const generation = acceptedGeneration ?? this.activations.accept();
    if (!this.client) throw new Error("not connected to opencode service");
    const res = await this.client.session.get({ sessionID });
    const info = res as {
      id?: string;
      title?: string;
      parentID?: string;
      agent?: string;
      cost?: number;
      tokens?: {
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
      };
      location?: { directory?: string };
      data?: {
        id?: string;
        title?: string;
        parentID?: string;
        agent?: string;
        cost?: number;
        tokens?: {
          input?: number;
          output?: number;
          reasoning?: number;
          cache?: { read?: number; write?: number };
        };
        location?: { directory?: string };
      };
    };
    const id = info.id ?? info.data?.id;
    const directory = info.location?.directory ?? info.data?.location?.directory;
    if (!id || !directory) throw new Error("session not found");
    const usage: SessionUsage | null = (() => {
      const raw = info.data ?? info;
      const cost = raw.cost;
      const tokens = raw.tokens;
      if (typeof cost !== "number" || !tokens) return null;
      const num = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);
      return {
        cost,
        tokens: {
          input: num(tokens.input),
          output: num(tokens.output),
          reasoning: num(tokens.reasoning),
          cache: {
            read: num(tokens.cache?.read),
            write: num(tokens.cache?.write)
          }
        }
      };
    })();
    const messagesRes = await this.client.message.list({ sessionID: id }).catch(() => null);
    if (!this.activations.current(generation)) throw new Error("activation superseded");
    const session = await this.activateSession(generation, {
      id,
      directory,
      ...(info.parentID ?? info.data?.parentID ? { parentID: info.parentID ?? info.data?.parentID } : {}),
      ...(info.title ?? info.data?.title ? { title: info.title ?? info.data?.title } : {}),
      ...(info.agent ?? info.data?.agent ? { agent: info.agent ?? info.data?.agent } : {})
    });
    const messages = messagesRes
      ? (Array.isArray(messagesRes) ? messagesRes : (messagesRes as { data?: unknown }).data ?? [])
      : [];
    const history = messages as unknown[];
    return { session, transcript: replayTranscript(history), todos: replayTodos(history), usage };
  }

  async getState(): Promise<SessionInfo | null> {
    return this.sessionInfo;
  }

  async providerUsage(): Promise<ProviderUsageResult[]> {
    return fetchProviderUsage();
  }

  async sessionSelection(): Promise<SessionSelection | null> {
    if (!this.client || !this.sessionID) return null;
    const sessionID = this.sessionID;
    const workspace = this.workspace;
    const res = await this.client.session.get({ sessionID }).catch(() => null);
    if (!workspace || !sameWorkspace(workspace, this.workspace) || sessionID !== this.sessionID) return null;
    if (!res) return null;
     const s = res as { agent?: string; model?: { id?: string; modelID?: string; providerID?: string; variant?: string } };
    const out: SessionSelection = {};
    const m = s.model;
     const id = m ? modelID(m) : "";
     if (id && m?.providerID) {
       out.model = { id, providerID: m.providerID, name: id, ...(m.variant ? { variant: m.variant } : {}) };
    }
    if (s.agent) out.agent = { id: s.agent, name: s.agent };
    return out.model || out.agent ? out : null;
  }

  async prompt(workspace: WorkspaceIdentity, text: string, files: PromptFile[] = []): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    const fileSpecs = await Promise.all(
      files.map(async (file) => {
        const stat = await fsp.stat(file.path);
        if (!stat.isFile()) throw new Error(`${path.basename(file.path)} is not a file`);
        if (stat.size > 10 * 1024 * 1024) {
          throw new Error(`${path.basename(file.path)} is larger than 10 MB`);
        }
        return {
          uri: pathToFileURL(file.path).toString(),
          name: path.basename(file.path),
          ...(file.mention ? { mention: file.mention } : {})
        };
      })
    );
    this.assertTarget(target);
    await this.client.session.prompt({
      sessionID: target.sessionID,
      text,
      ...(fileSpecs.length > 0 ? { files: fileSpecs } : {})
    });
  }

  async listCommands(): Promise<CommandOption[]> {
    if (!this.client) return [];
    const location = this.directory ? { location: { directory: this.directory } } : undefined;
    const [commands, skills] = await Promise.all([
      this.client.command.list(location).catch(() => []),
      this.client.skill.list(location).catch(() => [])
    ]);
    const commandArr = Array.isArray(commands) ? commands : (commands as { data?: unknown }).data ?? [];
    const skillArr = Array.isArray(skills) ? skills : (skills as { data?: unknown }).data ?? [];
    const commandItems = (commandArr as { name?: string; description?: string }[])
      .map((c) => ({ name: c.name ?? "", ...(c.description ? { description: c.description } : {}), kind: "command" as const }))
      .filter((c) => c.name.length > 0);
    const skillItems = (skillArr as { id?: string; name?: string; description?: string }[])
      .map((s) => ({
        name: s.name ?? s.id ?? "",
        ...(s.description ? { description: s.description } : {}),
        kind: "skill" as const
      }))
      .filter((s) => s.name.length > 0);
    return [...commandItems, ...skillItems];
  }

  async runCommand(workspace: WorkspaceIdentity, name: string, args: string = ""): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    const skills = await this.client.skill
      .list({ location: { directory: target.directory } })
      .catch(() => []);
    this.assertTarget(target);
    const skillArr = Array.isArray(skills) ? skills : (skills as { data?: unknown }).data ?? [];
    const isSkill = (skillArr as { id?: string; name?: string }[]).some(
      (s) => s.name === name || s.id === name
    );
    if (isSkill) {
      await this.client.session.skill({ sessionID: target.sessionID, skill: name });
      this.assertTarget(target);
      return;
    }
    await this.client.session.command({
      sessionID: target.sessionID,
      command: name,
      ...(args ? { arguments: args } : {})
    });
    this.assertTarget(target);
  }

  async searchFiles(query: string): Promise<ReferenceOption[]> {
    if (!this.client || !this.directory) return [];
    const res = await this.client.file.find({
      location: { directory: this.directory },
      query,
      type: "file"
    });
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as { path?: string }[])
      .filter((r) => r.path)
      .map((r) => {
        const rel = r.path as string;
        return {
          name: path.basename(rel),
          path: path.join(this.directory as string, rel),
          rel
        };
      });
  }

  async interrupt(workspace: WorkspaceIdentity): Promise<void> {
    if (!this.client) return;
    const target = this.activeTarget(workspace);
    await this.client.session.interrupt({ sessionID: target.sessionID }).catch(() => {});
    this.assertTarget(target);
  }

  async listModels(): Promise<ModelOption[]> {
    if (!this.client) return [];
    const workspace = this.workspace;
    const directory = this.directory;
    const res = await this.client.model.list(
      directory ? { location: { directory } } : undefined
    );
    if (!sameWorkspace(workspace, this.workspace)) return [];
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as {
      id?: string;
      providerID?: string;
      name?: string;
      enabled?: boolean;
      variants?: { id?: string }[];
    }[])
      .filter((m) => m.enabled !== false)
       .map((m) => ({
         id: modelID(m),
         providerID: m.providerID ?? "",
         name: m.name ?? modelID(m) ?? "model",
         variants: variantIDs(m.variants)
      }))
      .filter((m) => m.id && m.providerID);
  }

  async switchModel(workspace: WorkspaceIdentity, id: string, providerID: string, variant?: string): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    await this.client.session.switchModel({
      sessionID: target.sessionID,
      model: { id, providerID, ...(variant ? { variant } : {}) }
    });
    this.assertTarget(target);
    void this.persistSettings({ model: { id, providerID, ...(variant ? { variant } : {}) } });
  }

  async listAgents(): Promise<AgentOption[]> {
    if (!this.client) return [];
    const workspace = this.workspace;
    const directory = this.directory;
    const res = await this.client.agent.list(
      directory ? { location: { directory } } : undefined
    );
    if (!sameWorkspace(workspace, this.workspace)) return [];
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as { id?: string; name?: string; color?: string }[])
      .map((a) => ({
        id: a.id ?? "",
        name: a.name ?? a.id ?? "agent",
        ...(a.color ? { color: a.color } : {})
      }))
      .filter((a) => a.id);
  }

  async switchAgent(workspace: WorkspaceIdentity, id: string): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    await this.client.session.switchAgent({ sessionID: target.sessionID, agent: id });
    this.assertTarget(target);
    void this.persistSettings({ agent: id });
  }

  async modelDefault(): Promise<ModelOption | null> {
    if (!this.client) return null;
    const workspace = this.workspace;
    const directory = this.directory;
    const res = await this.client.model.default(
      directory ? { location: { directory } } : undefined
    );
    if (!sameWorkspace(workspace, this.workspace)) return null;
    const data = res as {
      data?: { id?: string; providerID?: string; name?: string; variants?: { id?: string }[]; variant?: string };
    };
     const m = data?.data ?? (res as {
       id?: string;
       modelID?: string;
      providerID?: string;
      name?: string;
      variants?: { id?: string }[];
      variant?: string;
    });
     const id = m ? modelID(m) : "";
     if (!id || !m?.providerID) return null;
     return {
       id,
       providerID: m.providerID,
       name: m.name ?? id,
       variants: variantIDs(m.variants),
      ...(m.variant ? { variant: m.variant } : {})
    };
  }

  async replyPermission(workspace: WorkspaceIdentity, requestID: string, reply: PermissionReply, sessionID: string): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    assertPermissionSession(target, sessionID);
    await this.client.permission.reply({
      sessionID: target.sessionID,
      requestID,
      reply
    });
    this.assertTarget(target);
  }

  async listDir(workspace: WorkspaceIdentity, rel: string): Promise<TreeEntry[]> {
    if (!this.client) throw new Error("no active session");
    const root = this.workspaceRoot(workspace);
    const clean = relativePath(rel, true);
    await confinedPath(root, clean, true);
    assertWorkspace(workspace, this.workspace);
    const body = await this.client.file.list({
      location: { directory: root },
      path: clean
    });
    assertWorkspace(workspace, this.workspace);
    const arr = Array.isArray(body) ? body : (body as { data?: TreeEntry[] }).data ?? [];
    return arr.map((e) => ({
      ...e,
      path: e.path.replace(/\/+$/, "")
    }));
  }

  async readFile(workspace: WorkspaceIdentity, rel: string): Promise<string | null> {
    if (!this.client) throw new Error("no active session");
    const root = this.workspaceRoot(workspace);
    const clean = relativePath(rel);
    await confinedPath(root, clean);
    assertWorkspace(workspace, this.workspace);
    const res = await this.client.file.read({
      location: { directory: root },
      path: clean
    });
    assertWorkspace(workspace, this.workspace);
    return toText(res);
  }

  async writeFile(
    workspace: WorkspaceIdentity,
    rel: string,
    content: string,
    write: FileWriteIdentity
  ): Promise<void> {
    const cleanContent = fileContent(content);
    if (
      !write ||
      typeof write.id !== "string" ||
      write.id.length < 1 ||
      write.id.length > 128 ||
      write.workspaceID !== workspace.id ||
      !Number.isSafeInteger(write.revision) ||
      write.revision < 0 ||
      typeof write.expectedContent !== "string" ||
      typeof write.overwrite !== "boolean"
    ) throw new Error("invalid file write identity");
    const expectedContent = fileContent(write.expectedContent);
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.watchContext;
      if (!context || !this.currentWatch(context)) throw new Error("stale workspace");
      const cleanRel = relativePath(rel);
      const abs = await confinedPath(root, cleanRel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await confinedPath(root, cleanRel);
      assertWorkspace(workspace, this.workspace);
      if (!write.overwrite) {
      let current: string | null = null;
      try {
        current = await fsp.readFile(abs, "utf8");
      } catch {
        current = null;
      }
      if (current !== expectedContent) {
        this.emitFileUpdate(context, abs, current);
        throw new Error("file changed on disk");
      }
      }
      assertWorkspace(workspace, this.workspace);
      const temporary = path.join(path.dirname(abs), `.${path.basename(abs)}.openshell-${randomUUID()}.tmp`);
      try {
        await fsp.writeFile(temporary, cleanContent, { encoding: "utf8", flag: "wx" });
        const existing = await fsp.stat(abs).catch(() => null);
        if (existing) await fsp.chmod(temporary, existing.mode);
        await confinedPath(root, cleanRel);
        assertWorkspace(workspace, this.workspace);
        await fsp.rename(temporary, abs);
      } finally {
        await fsp.rm(temporary, { force: true }).catch(() => {});
      }
      assertWorkspace(workspace, this.workspace);
      context.snapshots.set(abs, cleanContent);
      context.lastKnown.set(abs, cleanContent);
      this.emitFileUpdate(context, abs, cleanContent, undefined, write);
    });
  }

  async createFile(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.watchContext;
      if (!context || !this.currentWatch(context)) throw new Error("stale workspace");
      const clean = relativePath(rel);
      const abs = await confinedPath(root, clean);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await confinedPath(root, clean);
      assertWorkspace(workspace, this.workspace);
      await fsp.writeFile(abs, "", { flag: "wx" });
      assertWorkspace(workspace, this.workspace);
      context.snapshots.set(abs, "");
      context.lastKnown.set(abs, "");
      this.emitFileUpdate(context, abs, "");
    });
  }

  async createDir(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const abs = await confinedPath(root, relativePath(rel));
      assertWorkspace(workspace, this.workspace);
      await fsp.mkdir(abs, { recursive: false });
    });
  }

  async deletePath(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.watchContext;
      if (!context || !this.currentWatch(context)) throw new Error("stale workspace");
      const abs = await confinedPath(root, relativePath(rel));
      assertWorkspace(workspace, this.workspace);
      try {
        await shell.trashItem(abs);
      } catch {
        await fsp.rm(abs, { recursive: true, force: true });
      }
      assertWorkspace(workspace, this.workspace);
      if (context.snapshots.has(abs) || context.lastKnown.has(abs)) {
        const baseline = context.snapshots.get(abs) ?? context.lastKnown.get(abs) ?? "";
        context.snapshots.delete(abs);
        context.lastKnown.delete(abs);
        this.emitFileUpdate(context, abs, null, baseline);
      }
    });
  }

  async renamePath(workspace: WorkspaceIdentity, rel: string, newName: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.watchContext;
      if (!context || !this.currentWatch(context)) throw new Error("stale workspace");
      const abs = await confinedPath(root, relativePath(rel));
      const parent = this.relKey(path.dirname(abs));
      const target = await confinedPath(root, parent ? `${parent}/${fileName(newName)}` : fileName(newName));
      assertWorkspace(workspace, this.workspace);
      const snapshot = context.snapshots.get(abs) ?? context.lastKnown.get(abs);
      await fsp.rename(abs, target);
      assertWorkspace(workspace, this.workspace);
      context.snapshots.delete(abs);
      context.lastKnown.delete(abs);
      if (snapshot !== undefined) {
        context.snapshots.set(target, snapshot);
        this.emitFileUpdate(context, abs, null, snapshot);
        let content: string | null = null;
        try {
          content = await fsp.readFile(target, "utf8");
        } catch {
          /* unreadable */
        }
        if (!this.currentWatch(context)) return;
        context.lastKnown.set(target, content ?? "");
        this.emitFileUpdate(context, target, content);
      }
    });
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
    this.activations.invalidate();
    this.watchContext = null;
    this.stopWatcher();
  }
}
