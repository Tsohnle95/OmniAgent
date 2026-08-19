import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import { constants, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { shell } from "electron";
import { OpenCode } from "@opencode-ai/client";
import { Service, type Endpoint } from "@opencode-ai/client/service";
import { LatestGeneration, sameWorkspace } from "@shared/generation";
import type {
  AssistantPartView,
  AgentOption,
  CommandOption,
  FileWriteIdentity,
  FileBaseline,
  PermissionReply,
  ProjectInfo,
  PromptFile,
  ProviderUsageResult,
  ReferenceOption,
  RecoveryRecord,
  ReopenedSession,
  SessionInfo,
  SessionSelection,
  SessionSummary,
  SessionTranscript,
  SessionUsage,
  TodoItem,
  ToolContentView,
  ToolCallView,
  TranscriptItem,
  TreeEntry,
  ModelOption
} from "@shared/types";
import { retainOutput, retainToolContent } from "@shared/retention";
import type { WorkspaceIdentity } from "@shared/types";
import { fetchProviderUsage } from "./provider-usage";
import { WorkspaceOperationCoordinator } from "./operation-coordinator";
import { BackendEventLoop } from "./backend-event-loop";
import { createStreamPipeline, type RawStreamEvent } from "./stream-pipeline";
import { knownBaseline, observedBaseline, preserveBaseline, unknownBaseline } from "./file-baseline";
import { movePathToTrash } from "./trash";
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

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) return resolve();
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
});

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".venv", "__pycache__", ".cache", ".turbo", ".nx",
  ".svn", ".hg", ".idea", ".vscode", ".openshell-recovery", "dist", "out", "build", "target", "coverage", ".pytest_cache",
  ".opencode", ".claude", ".cursor", ".aider", ".windsurf", ".codeium", ".roo", ".gemini", ".kilocode", ".continue"
]);

const MAX_WATCHED_FILE_BYTES = 2 * 1024 * 1024;

const RECOVERY_DIR = ".openshell-recovery";

const RECOVERY_SETTLED_RETENTION_MS = 24 * 60 * 60 * 1000;
const RECOVERY_INTERRUPTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const BUILTIN_COMMANDS: {
  name: string;
  description: string;
  run: (client: Client, sessionID: string) => Promise<unknown>;
}[] = [
  {
    name: "compact",
    description: "Summarize the session to free up context",
    run: (client, sessionID) => client.session.compact({ sessionID })
  }
];

interface RecoveryTransaction {
  version: 1;
  id: string;
  operation: "save" | "rename";
  originalPath: string;
  targetPath?: string;
  createdAt: number;
  phase: "initialized" | "temporary-ready" | "source-held" | "held-validated" | "target-installed" | "failed" | "complete";
  acknowledged: string[];
  reason?: RecoveryRecord["reason"];
}

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
    output: retainOutput(
      toolContentText(state.content as unknown[] | undefined) ||
      String(state.output ?? (state.error as { message?: string } | undefined)?.message ?? state.error ?? "")
    ),
    startedAt: time.created ?? Date.now(),
    duration: completed ? Math.max(0, completed - ran) : undefined,
    paths: collectFilePaths(input),
    metadata: record(state.metadata),
    inputValue: input,
    content: retainToolContent(toolContentViews(state.content)),
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

export function replayTranscript(messages: unknown[]): TranscriptItem[] {
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
        ...(typeof output?.output === "string" ? { output: retainOutput(output.output) } : {}),
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
  snapshots: Map<string, FileBaseline>;
  lastKnown: Map<string, string>;
  hasGit: boolean | null;
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

export interface SessionContext {
  workspace: WorkspaceIdentity;
  sessionID: string;
  directory: string;
  sessionInfo: SessionInfo;
  watchContext: WatchContext;
  watcher: FSWatcher | null;
  activations: LatestGeneration;
}

export type MutationPhase =
  | "save:temporary-ready"
  | "save:source-held"
  | "save:held-validated"
  | "save:target-installed"
  | "rename:source-inspected"
  | "rename:source-held"
  | "rename:target-installed";

type MutationPhaseHandler = (phase: MutationPhase, source: string, target: string) => void | Promise<void>;

export class OpenShellBackend {
  private client: Client | null = null;
  private readonly contexts = new Map<string, SessionContext>();
  private primary: string | null = null;
  private listeners = new Set<(msg: unknown) => void>();
  private stopped = false;
  private readonly eventLoop = new BackendEventLoop();
  private readonly activations = new LatestGeneration();
  private readonly mutations = new WorkspaceOperationCoordinator();
  private lastEnsureAt = 0;
  private readonly ensureCooldownMs = 30_000;
  private streamConnectedOnce = false;

  constructor(private readonly mutationPhase: MutationPhaseHandler = () => {}) {}

  onMessage(cb: (msg: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: unknown): void {
    for (const cb of this.listeners) cb(msg);
  }

  private contextFor(expected: WorkspaceIdentity): SessionContext {
    assertWorkspace(expected, this.contexts.get(expected.id)?.workspace ?? null);
    const context = this.contexts.get(expected.id);
    if (!context || !sameWorkspace(expected, context.workspace)) throw new Error("stale workspace");
    return context;
  }

  private currentContext(context: SessionContext): boolean {
    return this.contexts.get(context.workspace.id) === context;
  }

  private contextBySessionID(sessionID: string): SessionContext | null {
    for (const context of this.contexts.values()) {
      if (context.sessionID === sessionID) return context;
    }
    return null;
  }

  private primaryContext(): SessionContext | null {
    return this.primary ? (this.contexts.get(this.primary) ?? null) : null;
  }

  private workspaceRoot(expected: WorkspaceIdentity): string {
    return this.contextFor(expected).directory;
  }

  private activeTarget(workspace: WorkspaceIdentity): ActiveWorkspaceTarget {
    const context = this.contextFor(workspace);
    return captureWorkspaceTarget(workspace, {
      workspace: context.workspace,
      sessionID: context.sessionID,
      directory: context.directory
    });
  }

  private assertTarget(target: ActiveWorkspaceTarget): void {
    const context = this.contextFor(target.workspace);
    assertWorkspaceTarget(target, {
      workspace: context.workspace,
      sessionID: context.sessionID,
      directory: context.directory
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
    this.eventLoop.start((signal, generation) => this.runEventLoop(signal, generation));
  }

  private async runEventLoop(signal: AbortSignal, generation: number): Promise<void> {
    const pipeline = createStreamPipeline({
      subscribe: (attemptSignal) => this.subscribeEvents(attemptSignal, generation),
      onEvents: (directory, events) => this.deliverEvents(directory, events, generation),
      onStreamError: () => {
        this.client = null;
      },
      onReconnect: () => {
        if (!this.streamConnectedOnce) {
          this.streamConnectedOnce = true;
          return;
        }
        this.emit({ kind: "event", type: "server.connected", data: {} });
      }
    });
    await pipeline.run(signal);
  }

  private async subscribeEvents(
    signal: AbortSignal,
    generation: number
  ): Promise<AsyncIterable<RawStreamEvent>> {
    while (!this.stopped && this.eventLoop.current(generation)) {
      if (!this.client && !(await this.connect())) {
        if (!this.eventLoop.current(generation)) break;
        await sleep(2000, signal);
        continue;
      }
      if (!this.eventLoop.current(generation)) break;
      return this.client!.event.subscribe({ signal });
    }
    throw Object.assign(new Error("stream aborted"), { name: "AbortError" });
  }

  private async deliverEvents(
    _directory: string,
    events: RawStreamEvent[],
    generation: number
  ): Promise<void> {
    for (const evt of events) {
      if (this.stopped || !this.eventLoop.current(generation)) return;
      const typed = evt as {
        type?: string;
        event?: string;
        data?: unknown;
        properties?: unknown;
        location?: { directory?: string };
      };
      const type = typed.type ?? typed.event ?? "unknown";
      this.emit({ kind: "event", type, data: evt });
      await this.handleServerEvent(type, typed.data ?? typed.properties, typed.location).catch(() => {});
      if (!this.eventLoop.current(generation)) return;
    }
  }

  private async handleServerEvent(
    type: string,
    data: unknown,
    location?: { directory?: string }
  ): Promise<void> {
    if (type === "session.tool.called") {
      const input = (data as { input?: unknown }).input;
      const sessionID = (data as { sessionID?: string }).sessionID;
      const context = sessionID ? this.contextBySessionID(sessionID) : null;
      if (context) await this.snapshotInputs(context, input);
    } else if (type === "filesystem.changed") {
      const f = data as { file: string; event: "add" | "change" | "unlink" };
      if (typeof f?.file !== "string") return;
      const reportedRoot = typeof location?.directory === "string"
        ? await this.reportedRoot(location.directory)
        : null;
      if (!reportedRoot) return;
      for (const context of this.contexts.values()) {
        if (reportedRoot !== context.directory) continue;
        const abs = this.abs(f.file, context.directory);
        const rel = path.relative(context.directory, abs);
        if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
        await this.onFsChanged(context.watchContext, abs, f.event);
      }
    }
  }

  private readonly reportedRoots = new Map<string, string>();

  private async reportedRoot(directory: string): Promise<string> {
    const cached = this.reportedRoots.get(directory);
    if (cached !== undefined) return cached;
    const resolved = await fsp.realpath(directory).catch(() => path.resolve(directory));
    this.reportedRoots.set(directory, resolved);
    return resolved;
  }

  // ---------- filesystem watching + agent baselines ----------

  private currentWatch(context: WatchContext): boolean {
    return this.contexts.get(context.workspace.id)?.watchContext === context;
  }

  private abs(rel: string, root: string): string {
    return path.isAbsolute(rel) ? rel : path.join(root, rel);
  }

  private relKey(abs: string, root: string): string {
    const rel = path.isAbsolute(abs) ? path.relative(root, abs) : abs;
    return rel.split(path.sep).join("/");
  }

  private recoveryRoot(root: string): string {
    return path.join(root, RECOVERY_DIR);
  }

  private async checkedRecoveryRoot(root: string, create = false): Promise<string> {
    const recoveryRoot = await confinedPath(root, RECOVERY_DIR);
    const stat = await fsp.lstat(recoveryRoot).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (!stat && create) {
      await fsp.mkdir(recoveryRoot, { mode: 0o700 });
      return confinedPath(root, RECOVERY_DIR);
    }
    if (stat && !stat.isDirectory()) throw new Error("invalid recovery directory");
    return recoveryRoot;
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await fsp.open(directory, "r").catch((error) => {
      if (["EISDIR", "EINVAL", "EPERM", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
      throw error;
    });
    if (!handle) return;
    try {
      await handle.sync().catch((error) => {
        if (!["EINVAL", "EPERM", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      });
    } finally {
      await handle.close();
    }
  }

  private async writeRecoveryTransaction(directory: string, transaction: RecoveryTransaction): Promise<void> {
    const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
    const handle = await fsp.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(transaction, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(temporary, path.join(directory, "manifest.json"));
    await this.syncDirectory(directory);
  }

  private async createRecoveryTransaction(
    root: string,
    operation: RecoveryTransaction["operation"],
    originalPath: string,
    targetPath?: string
  ): Promise<{ directory: string; transaction: RecoveryTransaction }> {
    const id = `${Date.now()}-${randomUUID()}`;
    const recoveryRoot = await this.checkedRecoveryRoot(root, true);
    const directory = path.join(recoveryRoot, id);
    await fsp.mkdir(directory);
    const transaction: RecoveryTransaction = {
      version: 1,
      id,
      operation,
      originalPath,
      ...(targetPath ? { targetPath } : {}),
      createdAt: Date.now(),
      phase: "initialized",
      acknowledged: []
    };
    await this.writeRecoveryTransaction(directory, transaction);
    await this.syncDirectory(recoveryRoot);
    return { directory, transaction };
  }

  private validRecoveryTransaction(value: unknown, id: string): value is RecoveryTransaction {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const transaction = value as Partial<RecoveryTransaction>;
    const phases = ["initialized", "temporary-ready", "source-held", "held-validated", "target-installed", "failed", "complete"];
    const artifacts = transaction.operation === "save"
      ? ["temporary", "original", "proposed"]
      : ["rename-source"];
    try {
      relativePath(transaction.originalPath);
      if (transaction.operation === "rename") relativePath(transaction.targetPath);
    } catch {
      return false;
    }
    return transaction.version === 1 &&
      transaction.id === id &&
      /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) &&
      (transaction.operation === "save" || transaction.operation === "rename") &&
      typeof transaction.createdAt === "number" && Number.isSafeInteger(transaction.createdAt) && transaction.createdAt > 0 &&
      typeof transaction.phase === "string" && phases.includes(transaction.phase) &&
      Array.isArray(transaction.acknowledged) &&
      transaction.acknowledged.every((artifact) => typeof artifact === "string" && artifacts.includes(artifact));
  }

  private async readRecoveryTransactions(root: string): Promise<Array<{
    directory: string;
    transaction: RecoveryTransaction;
  }>> {
    const recoveryRoot = await this.checkedRecoveryRoot(root);
    const entries = await fsp.readdir(recoveryRoot, { withFileTypes: true }).catch(() => []);
    const transactions = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      if (!/^\d{13}-[0-9a-f-]{36}$/.test(entry.name)) return null;
      try {
        const directory = await confinedPath(root, `${RECOVERY_DIR}/${entry.name}`);
        const manifest = await confinedPath(root, `${RECOVERY_DIR}/${entry.name}/manifest.json`);
        if (!(await fsp.lstat(manifest)).isFile()) return null;
        const transaction = JSON.parse(await fsp.readFile(manifest, "utf8")) as unknown;
        if (!this.validRecoveryTransaction(transaction, entry.name)) return null;
        return { directory, transaction };
      } catch {
        return null;
      }
    }));
    return transactions.filter((value): value is NonNullable<typeof value> => value !== null);
  }

  private async recoveryRecords(root: string): Promise<RecoveryRecord[]> {
    const transactions = await this.readRecoveryTransactions(root);
    const records: RecoveryRecord[] = [];
    for (const { directory, transaction } of transactions) {
      const artifacts = transaction.operation === "save"
        ? [["temporary", "temporary"] as const, ["original", "original"] as const, ["proposed", "proposed"] as const]
        : [["rename-source", "source"] as const];
      for (const [artifact, name] of artifacts) {
        const file = await confinedPath(root, `${this.relKey(directory, root)}/${name}`);
        if (!(await fsp.lstat(file).catch(() => null))?.isFile()) continue;
        records.push({
          id: `${transaction.id}:${artifact}`,
          artifact,
          originalPath: transaction.originalPath,
          recoveryPath: this.relKey(file, root),
          createdAt: transaction.createdAt,
          acknowledged: transaction.acknowledged.includes(artifact),
          reason: transaction.reason ?? (transaction.phase === "complete" ? "saved" : "save-failed")
        });
      }
    }
    return records.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  private async reconcileRecovery(root: string, current: () => boolean = () => true): Promise<void> {
    const transactions = await this.readRecoveryTransactions(root);
    for (const item of transactions) {
      if (!current()) throw new Error("activation superseded");
      const { directory, transaction } = item;
      if (transaction.phase === "complete" || transaction.phase === "failed") continue;
      if (transaction.phase !== "source-held" && transaction.phase !== "held-validated") continue;
      const original = await confinedPath(root, `${this.relKey(directory, root)}/${transaction.operation === "rename" ? "source" : "original"}`);
      if (!(await fsp.lstat(original).catch(() => null))?.isFile()) continue;
      const canonical = await confinedPath(root, transaction.originalPath);
      if (transaction.operation === "rename" && transaction.targetPath) {
        const target = await confinedPath(root, transaction.targetPath);
        const [heldStat, targetStat] = await Promise.all([
          fsp.stat(original),
          fsp.stat(target).catch(() => null)
        ]);
        if (targetStat && heldStat.dev === targetStat.dev && heldStat.ino === targetStat.ino) {
          if (!current()) throw new Error("activation superseded");
          transaction.phase = "complete";
          transaction.reason = "renamed";
          transaction.acknowledged = ["rename-source"];
          await this.writeRecoveryTransaction(directory, transaction);
          continue;
        }
      }
      if (await fsp.lstat(canonical).catch(() => null)) continue;
      if (!current()) throw new Error("activation superseded");
      const parentRel = path.posix.dirname(transaction.originalPath);
      const parent = parentRel === "." ? root : await confinedPath(root, parentRel);
      await fsp.mkdir(parent, { recursive: true });
      await confinedPath(root, transaction.originalPath);
      if (!current()) throw new Error("activation superseded");
      try {
        await fsp.link(original, canonical);
        await this.syncDirectory(parent);
        transaction.phase = "complete";
        transaction.reason = "crash-recovered";
        await this.writeRecoveryTransaction(directory, transaction);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }

  private async emitRecoveryFor(context: SessionContext): Promise<void> {
    const records = await this.recoveryRecords(context.directory);
    if (!this.currentContext(context)) return;
    this.emit({ kind: "recovery", recovery: { workspace: context.workspace, records } });
  }

  private async purgeExpiredRecovery(root: string, current: () => boolean): Promise<void> {
    const transactions = await this.readRecoveryTransactions(root).catch(() => []);
    const now = Date.now();
    for (const { directory, transaction } of transactions) {
      if (!current()) return;
      const settled = transaction.phase === "complete" || transaction.phase === "failed" || transaction.acknowledged.length > 0;
      const interrupted = transaction.phase === "source-held" || transaction.phase === "held-validated";
      if (!settled && !interrupted) continue;
      const retention = settled ? RECOVERY_SETTLED_RETENTION_MS : RECOVERY_INTERRUPTED_RETENTION_MS;
      if (now - transaction.createdAt < retention) continue;
      await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
    await this.syncDirectory(path.join(root, RECOVERY_DIR)).catch(() => {});
  }

  async listRecovery(workspace: WorkspaceIdentity): Promise<RecoveryRecord[]> {
    return this.recoveryRecords(this.workspaceRoot(workspace));
  }

  async acknowledgeRecovery(workspace: WorkspaceIdentity, id: string): Promise<void> {
    const root = this.workspaceRoot(workspace);
    const match = /^(\d{13}-[0-9a-f-]{36}):(temporary|original|proposed|rename-source)$/.exec(id);
    if (!match) throw new Error("invalid recovery record");
    const item = (await this.readRecoveryTransactions(root)).find(({ transaction }) => transaction.id === match[1]);
    if (!item) throw new Error("recovery record not found");
    const { directory, transaction } = item;
    const artifact = match[2];
    if (!(await this.recoveryRecords(root)).some((record) => record.id === id)) throw new Error("recovery record not found");
    if (!transaction.acknowledged.includes(artifact)) transaction.acknowledged.push(artifact);
    await this.writeRecoveryTransaction(directory, transaction);
    await this.emitRecoveryFor(this.contextFor(workspace));
  }

  async openRecovery(workspace: WorkspaceIdentity, id: string): Promise<void> {
    const root = this.workspaceRoot(workspace);
    const record = (await this.recoveryRecords(root)).find((candidate) => candidate.id === id);
    if (!record) throw new Error("recovery record not found");
    const match = /^(\d{13}-[0-9a-f-]{36}):(temporary|original|proposed|rename-source)$/.exec(id);
    if (!match) throw new Error("invalid recovery record");
    const names: Record<RecoveryRecord["artifact"], string> = {
      temporary: "temporary",
      original: "original",
      proposed: "proposed",
      "rename-source": "source"
    };
    const artifact = await confinedPath(root, `${RECOVERY_DIR}/${match[1]}/${names[record.artifact]}`);
    if (!(await fsp.lstat(artifact)).isFile()) throw new Error("recovery record not found");
    const result = await shell.openPath(artifact);
    if (result) throw new Error(result);
  }

  private shouldSkip(abs: string, root: string): boolean {
    const rel = path.relative(root, abs);
    return rel.split(path.sep).some((segment) => SKIP_DIRS.has(segment));
  }

  private isGitMetadata(abs: string, root: string): boolean {
    const rel = path.relative(root, abs);
    return rel === ".git" || rel.startsWith(`.git${path.sep}`);
  }

  private async snapshotInputs(context: SessionContext, input: unknown): Promise<void> {
    const watchContext = context.watchContext;
    if (!this.currentContext(context)) return;
    for (const rel of collectFilePaths(input)) {
      const abs = this.abs(rel, watchContext.root);
      if (watchContext.snapshots.has(abs)) continue;
      try {
        const content = await this.readFile(context.workspace, this.relKey(abs, watchContext.root));
        if (this.currentWatch(watchContext)) {
          watchContext.snapshots.set(abs, knownBaseline(content ?? "", content !== null));
        }
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

  private startWatcher(context: SessionContext): void {
    try {
      context.watcher = watch(context.directory, { recursive: true }, (event, filename) => {
        if (!this.currentContext(context)) return;
        if (!filename || typeof filename !== "string") return;
        const abs = this.abs(filename, context.directory);
        if (this.isGitMetadata(abs, context.directory)) {
          this.scheduleGitRefresh(context.watchContext);
          return;
        }
        if (this.shouldSkip(abs, context.directory)) return;
        this.scheduleWatch(context.watchContext, abs, event);
      });
      context.watcher.on("error", (err) => console.error("[openshell] watcher error:", err));
      console.log("[openshell] watching", context.directory);
    } catch (err) {
      console.error("[openshell] fs.watch unavailable, live updates disabled:", err);
    }
  }

  private stopWatcher(context: SessionContext): void {
    for (const t of context.watchContext.timers.values()) clearTimeout(t);
    context.watchContext.timers.clear();
    context.watcher?.close();
    context.watcher = null;
  }

  private scheduleWatch(context: WatchContext, abs: string, event: string): void {
    const existing = context.timers.get(abs);
    if (existing) clearTimeout(existing);
    context.timers.set(
      abs,
      setTimeout(() => {
        context.timers.delete(abs);
        if (this.currentWatch(context)) void this.onFsChanged(context, abs, event);
      }, 200)
    );
  }

  private scheduleGitRefresh(context: WatchContext): void {
    const key = path.join(context.root, ".git");
    const existing = context.timers.get(key);
    if (existing) clearTimeout(existing);
    context.timers.set(key, setTimeout(() => {
      context.timers.delete(key);
      if (this.currentWatch(context)) void this.refreshGitBaselines(context);
    }, 200));
  }

  private async refreshGitBaselines(context: WatchContext): Promise<void> {
    for (const [abs] of context.snapshots) {
      if (!this.currentWatch(context)) return;
      const rel = this.relKey(abs, context.root);
      const git = await this.gitShow(context, rel);
      if (!this.currentWatch(context)) return;
      const baseline = observedBaseline(true, git);
      let content: string | null = null;
      try {
        content = await fsp.readFile(abs, "utf8");
      } catch {
      }
      context.snapshots.set(abs, baseline);
      if (content === null) context.lastKnown.delete(abs);
      else context.lastKnown.set(abs, content);
      this.emitFileUpdate(context, abs, content, baseline);
    }
  }

  private async onFsChanged(context: WatchContext, abs: string, event: string): Promise<void> {
    if (!this.currentWatch(context)) return;
    if (this.isGitMetadata(abs, context.root)) {
      await this.refreshGitBaselines(context);
      return;
    }
    if (this.shouldSkip(abs, context.root)) return;
    let stat: Awaited<ReturnType<typeof fsp.stat>> | null = null;
    try {
      stat = await fsp.stat(abs);
    } catch {
      /* missing */
    }
    if (!this.currentWatch(context)) return;
    if (!stat || !stat.isFile()) {
      if (event === "unlink" || context.lastKnown.has(abs) || context.snapshots.has(abs)) {
        let baseline = context.snapshots.get(abs);
        if (!baseline) {
          const lastKnown = context.lastKnown.get(abs);
          if (lastKnown !== undefined) {
            baseline = knownBaseline(lastKnown);
          } else {
            const git = await this.gitShow(context, this.relKey(abs, context.root));
            if (!this.currentWatch(context)) return;
            baseline = observedBaseline(context.hasGit === true, git);
          }
        }
        if (!this.currentWatch(context)) return;
        context.snapshots.set(abs, baseline);
        context.lastKnown.delete(abs);
        this.emitFileUpdate(context, abs, null, baseline);
      }
      return;
    }
    if (stat.size > MAX_WATCHED_FILE_BYTES) return;
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
      const baseline = observedBaseline(context.hasGit === true, git);
      context.snapshots.set(abs, baseline);
    }
    this.emitFileUpdate(context, abs, content);
  }

  private emitFileUpdate(
    context: WatchContext,
    abs: string,
    content: string | null,
    baselineOverride?: FileBaseline,
    write?: FileWriteIdentity
  ): void {
    const baseline =
      baselineOverride !== undefined
        ? baselineOverride
        : (context.snapshots.get(abs) ?? unknownBaseline);
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

  private async captureDirectMutation(context: WatchContext, abs: string): Promise<{
    baseline: FileBaseline;
    content: string | null;
  }> {
    const established = context.snapshots.get(abs);
    try {
      const content = await fsp.readFile(abs, "utf8");
      return { baseline: established ?? knownBaseline(content), content };
    } catch {
      return { baseline: established ?? unknownBaseline, content: null };
    }
  }

  // ---------- session + API ----------

  private async activateSession(info: Omit<SessionInfo, "workspace">): Promise<SessionInfo> {
    const directory = await canonicalWorkspaceRoot(info.directory);
    const existing = this.contextBySessionID(info.id);
    if (existing && existing.directory === directory) return existing.sessionInfo;
    const context: SessionContext = {
      workspace: Object.freeze({ id: randomUUID(), generation: this.activations.accept() }),
      sessionID: info.id,
      directory,
      sessionInfo: { ...info, directory } as SessionInfo,
      watchContext: {
        root: directory,
        sessionID: info.id,
        workspace: {} as WorkspaceIdentity,
        snapshots: new Map(),
        lastKnown: new Map(),
        hasGit: null,
        timers: new Map()
      },
      watcher: null,
      activations: new LatestGeneration()
    };
    context.sessionInfo = { ...info, directory, workspace: context.workspace };
    context.watchContext.workspace = context.workspace;
    const generation = context.activations.accept();
    if (existing) {
      existing.activations.invalidate();
      this.stopWatcher(existing);
      this.contexts.delete(existing.workspace.id);
    }
    this.contexts.set(context.workspace.id, context);
    this.primary = context.workspace.id;
    await this.reconcileRecovery(directory, () => context.activations.current(generation) && this.currentContext(context));
    if (!context.activations.current(generation) || !this.currentContext(context)) throw new Error("activation superseded");
    void this.purgeExpiredRecovery(directory, () => context.activations.current(generation) && this.currentContext(context));
    this.startWatcher(context);
    this.emit({ kind: "session", session: context.sessionInfo });
    await this.emitRecoveryFor(context);
    return context.sessionInfo;
  }

  async openSession(directory: string, acceptedGeneration?: number): Promise<SessionInfo> {
    if (acceptedGeneration !== undefined && !Number.isSafeInteger(acceptedGeneration)) {
      throw new Error("invalid activation generation");
    }
    if (!this.client) throw new Error("not connected to opencode service");
    const res = await this.client.session.create({
      location: { directory }
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
    return this.activateSession({
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
    if (acceptedGeneration !== undefined && !Number.isSafeInteger(acceptedGeneration)) {
      throw new Error("invalid activation generation");
    }
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
    const session = await this.activateSession({
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

  async sessionTranscript(sessionID: string): Promise<SessionTranscript> {
    if (!this.client) throw new Error("not connected to opencode service");
    const messagesRes = await this.client.message.list({ sessionID }).catch(() => null);
    const messages = messagesRes
      ? (Array.isArray(messagesRes) ? messagesRes : (messagesRes as { data?: unknown }).data ?? [])
      : [];
    const history = messages as unknown[];
    return { transcript: replayTranscript(history), todos: replayTodos(history) };
  }

  async getState(): Promise<SessionInfo | null> {
    return this.primaryContext()?.sessionInfo ?? null;
  }

  async activeSessions(): Promise<SessionInfo[]> {
    const sessions = [...this.contexts.values()].map((context) => context.sessionInfo);
    if (sessions.length > 1) {
      const primaryIndex = sessions.findIndex((session) => session.workspace.id === this.primary);
      if (primaryIndex >= 0 && primaryIndex !== sessions.length - 1) {
        sessions.push(sessions.splice(primaryIndex, 1)[0]);
      }
    }
    return sessions;
  }

  async closeSession(workspace: WorkspaceIdentity): Promise<void> {
    const context = this.contextFor(workspace);
    context.activations.invalidate();
    this.stopWatcher(context);
    this.contexts.delete(workspace.id);
    if (this.primary === workspace.id) {
      const keys = [...this.contexts.keys()];
      this.primary = keys.length > 0 ? keys[keys.length - 1] : null;
    }
  }

  async workspaceDirectory(workspace: WorkspaceIdentity): Promise<string> {
    return this.contextFor(workspace).directory;
  }

  async providerUsage(): Promise<ProviderUsageResult[]> {
    return fetchProviderUsage();
  }

  async sessionSelection(workspace: WorkspaceIdentity): Promise<SessionSelection | null> {
    if (!this.client) return null;
    const context = this.contextFor(workspace);
    const res = await this.client.session.get({ sessionID: context.sessionID }).catch(() => null);
    if (!this.currentContext(context)) return null;
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

  async listCommands(workspace: WorkspaceIdentity): Promise<CommandOption[]> {
    if (!this.client) return [];
    const target = this.activeTarget(workspace);
    const location = { location: { directory: target.directory } };
    const [commands, skills] = await Promise.all([
      this.client.command.list(location).catch(() => []),
      this.client.skill.list(location).catch(() => [])
    ]);
    this.assertTarget(target);
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
    const builtinItems = BUILTIN_COMMANDS.map((command) => ({
      name: command.name,
      description: command.description,
      kind: "command" as const
    }));
    return [...builtinItems, ...commandItems, ...skillItems];
  }

  async runCommand(workspace: WorkspaceIdentity, name: string, args: string = ""): Promise<void> {
    if (!this.client) throw new Error("no active session");
    const target = this.activeTarget(workspace);
    const builtin = BUILTIN_COMMANDS.find((command) => command.name === name);
    if (builtin) {
      await builtin.run(this.client, target.sessionID);
      this.assertTarget(target);
      return;
    }
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

  async searchFiles(workspace: WorkspaceIdentity, query: string): Promise<ReferenceOption[]> {
    if (!this.client) return [];
    const target = this.activeTarget(workspace);
    const res = await this.client.file.find({
      location: { directory: target.directory },
      query,
      type: "file"
    });
    this.assertTarget(target);
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as { path?: string }[])
      .filter((r) => r.path && r.path !== RECOVERY_DIR && !r.path.startsWith(`${RECOVERY_DIR}/`))
      .map((r) => {
        const rel = r.path as string;
        return {
          name: path.basename(rel),
          path: path.join(target.directory, rel),
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

  async listModels(workspace: WorkspaceIdentity): Promise<ModelOption[]> {
    if (!this.client) return [];
    const target = this.activeTarget(workspace);
    const res = await this.client.model.list(
      { location: { directory: target.directory } }
    );
    this.assertTarget(target);
    const arr = Array.isArray(res) ? res : (res as { data?: unknown }).data ?? [];
    return (arr as {
      id?: string;
      providerID?: string;
      name?: string;
      enabled?: boolean;
      variants?: { id?: string }[];
      limit?: { context?: number };
    }[])
      .filter((m) => m.enabled !== false)
       .map((m) => ({
         id: modelID(m),
         providerID: m.providerID ?? "",
         name: m.name ?? modelID(m) ?? "model",
         variants: variantIDs(m.variants),
         ...(typeof m.limit?.context === "number" && Number.isFinite(m.limit.context) && m.limit.context > 0
           ? { limit: { context: m.limit.context } }
           : {})
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
  }

  async listAgents(workspace: WorkspaceIdentity): Promise<AgentOption[]> {
    if (!this.client) return [];
    const target = this.activeTarget(workspace);
    const res = await this.client.agent.list(
      { location: { directory: target.directory } }
    );
    this.assertTarget(target);
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
  }

  async modelDefault(workspace: WorkspaceIdentity): Promise<ModelOption | null> {
    if (!this.client) return null;
    const target = this.activeTarget(workspace);
    const res = await this.client.model.default(
      { location: { directory: target.directory } }
    );
    this.assertTarget(target);
    const data = res as {
      data?: { id?: string; providerID?: string; name?: string; variants?: { id?: string }[]; variant?: string; limit?: { context?: number } };
    };
     const m = data?.data ?? (res as {
       id?: string;
       modelID?: string;
      providerID?: string;
      name?: string;
      variants?: { id?: string }[];
      variant?: string;
      limit?: { context?: number };
    });
     const id = m ? modelID(m) : "";
     if (!id || !m?.providerID) return null;
     return {
       id,
       providerID: m.providerID,
       name: m.name ?? id,
       variants: variantIDs(m.variants),
      ...(m.variant ? { variant: m.variant } : {}),
      ...(typeof m.limit?.context === "number" && Number.isFinite(m.limit.context) && m.limit.context > 0
        ? { limit: { context: m.limit.context } }
        : {})
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
    this.contextFor(workspace);
    const body = await this.client.file.list({
      location: { directory: root },
      path: clean
    });
    this.contextFor(workspace);
    const arr = Array.isArray(body) ? body : (body as { data?: TreeEntry[] }).data ?? [];
    return arr
      .map((e) => ({ ...e, path: e.path.replace(/\/+$/, "") }))
      .filter((e) => e.path !== RECOVERY_DIR && !e.path.startsWith(`${RECOVERY_DIR}/`));
  }

  async readFile(workspace: WorkspaceIdentity, rel: string): Promise<string | null> {
    if (!this.client) throw new Error("no active session");
    const root = this.workspaceRoot(workspace);
    const clean = relativePath(rel);
    await confinedPath(root, clean);
    this.contextFor(workspace);
    const res = await this.client.file.read({
      location: { directory: root },
      path: clean
    });
    this.contextFor(workspace);
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
      const context = this.contextFor(workspace);
      const watchContext = context.watchContext;
      if (!this.currentWatch(watchContext)) throw new Error("stale workspace");
      const cleanRel = relativePath(rel);
      const abs = await confinedPath(root, cleanRel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await confinedPath(root, cleanRel);
      this.contextFor(workspace);
      const recovery = await this.createRecoveryTransaction(root, "save", cleanRel);
      const temporary = path.join(recovery.directory, "temporary");
      const holding = path.join(recovery.directory, "original");
      const proposed = path.join(recovery.directory, "proposed");
      let sourceHeld = false;
      let targetInstalled = false;
      try {
        const temporaryHandle = await fsp.open(temporary, "wx", 0o600);
        try {
          await temporaryHandle.writeFile(cleanContent, "utf8");
          await temporaryHandle.sync();
        } finally {
          await temporaryHandle.close();
        }
        await fsp.copyFile(temporary, proposed, constants.COPYFILE_EXCL);
        const proposedHandle = await fsp.open(proposed, "r");
        try {
          await proposedHandle.sync();
        } finally {
          await proposedHandle.close();
        }
        const existing = await fsp.stat(abs).catch(() => null);
        if (existing) await fsp.chmod(temporary, existing.mode);
        recovery.transaction.phase = "temporary-ready";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.syncDirectory(recovery.directory);
        await this.mutationPhase("save:temporary-ready", abs, temporary);
        await confinedPath(root, cleanRel);
        this.contextFor(workspace);
        await fsp.rename(abs, holding);
        await this.syncDirectory(path.dirname(abs));
        await this.syncDirectory(recovery.directory);
        sourceHeld = true;
        recovery.transaction.phase = "source-held";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.mutationPhase("save:source-held", holding, abs);
        const heldContent = await fsp.readFile(holding, "utf8");
        if (!write.overwrite && heldContent !== expectedContent) {
          throw new Error("file changed on disk");
        }
        recovery.transaction.phase = "held-validated";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.mutationPhase("save:held-validated", holding, abs);
        await fsp.link(temporary, abs);
        await this.syncDirectory(path.dirname(abs));
        targetInstalled = true;
        recovery.transaction.phase = "target-installed";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.mutationPhase("save:target-installed", temporary, abs);
        if (await fsp.readFile(abs, "utf8") !== cleanContent) {
          throw new Error("file changed during save");
        }
        recovery.transaction.phase = "complete";
        recovery.transaction.reason = "saved";
        recovery.transaction.acknowledged = ["temporary", "original", "proposed"];
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
      } catch (error) {
        if (sourceHeld && !targetInstalled) {
          try {
            await fsp.link(holding, abs);
          } catch {}
        }
        recovery.transaction.phase = "failed";
        recovery.transaction.reason = "save-failed";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction).catch(() => {});
        const current = await fsp.readFile(abs, "utf8").catch(() => null);
        this.emitFileUpdate(watchContext, abs, current);
        await this.emitRecoveryFor(context);
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${detail}; recovery artifacts preserved in ${this.relKey(recovery.directory, root)}`);
      }
      this.contextFor(workspace);
      watchContext.snapshots.set(
        abs,
        preserveBaseline(watchContext.snapshots.get(abs), knownBaseline(expectedContent))
      );
      watchContext.lastKnown.set(abs, cleanContent);
      this.emitFileUpdate(watchContext, abs, cleanContent, undefined, write);
      await this.emitRecoveryFor(context);
    });
  }

  async createFile(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.contextFor(workspace);
      const watchContext = context.watchContext;
      if (!this.currentWatch(watchContext)) throw new Error("stale workspace");
      const clean = relativePath(rel);
      const abs = await confinedPath(root, clean);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await confinedPath(root, clean);
      this.contextFor(workspace);
      await fsp.writeFile(abs, "", { flag: "wx" });
      this.contextFor(workspace);
      watchContext.snapshots.set(abs, preserveBaseline(watchContext.snapshots.get(abs), knownBaseline("", false)));
      watchContext.lastKnown.set(abs, "");
      this.emitFileUpdate(watchContext, abs, "");
    });
  }

  async createDir(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const abs = await confinedPath(root, relativePath(rel));
      this.contextFor(workspace);
      await fsp.mkdir(abs, { recursive: false });
    });
  }

  async deletePath(workspace: WorkspaceIdentity, rel: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.contextFor(workspace);
      const watchContext = context.watchContext;
      if (!this.currentWatch(watchContext)) throw new Error("stale workspace");
      const abs = await confinedPath(root, relativePath(rel));
      const captured = await this.captureDirectMutation(watchContext, abs);
      this.contextFor(workspace);
      await movePathToTrash(abs, (target) => shell.trashItem(target));
      this.contextFor(workspace);
      watchContext.snapshots.set(abs, captured.baseline);
      watchContext.lastKnown.delete(abs);
      this.emitFileUpdate(watchContext, abs, null, captured.baseline);
    });
  }

  async renamePath(workspace: WorkspaceIdentity, rel: string, newName: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.contextFor(workspace);
      const watchContext = context.watchContext;
      if (!this.currentWatch(watchContext)) throw new Error("stale workspace");
      const abs = await confinedPath(root, relativePath(rel));
      const parent = this.relKey(path.dirname(abs), root);
      const target = await confinedPath(root, parent ? `${parent}/${fileName(newName)}` : fileName(newName));
      const captured = await this.captureDirectMutation(watchContext, abs);
      this.contextFor(workspace);
      const source = await fsp.lstat(abs);
      if (source.isDirectory()) throw new Error("directory rename is not supported; rename files only");
      await this.mutationPhase("rename:source-inspected", abs, target);
      const recovery = await this.createRecoveryTransaction(
        root,
        "rename",
        this.relKey(abs, root),
        this.relKey(target, root)
      );
      const holding = path.join(recovery.directory, "source");
      let installed = false;
      try {
        await fsp.rename(abs, holding);
        await this.syncDirectory(path.dirname(abs));
        await this.syncDirectory(recovery.directory);
        recovery.transaction.phase = "source-held";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.mutationPhase("rename:source-held", holding, abs);
        await fsp.link(holding, target);
        await this.syncDirectory(path.dirname(target));
        installed = true;
        recovery.transaction.phase = "target-installed";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
        await this.mutationPhase("rename:target-installed", holding, target);
        recovery.transaction.phase = "complete";
        recovery.transaction.reason = "renamed";
        recovery.transaction.acknowledged = ["rename-source"];
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction);
      } catch (error) {
        if (!installed) {
          try {
            await fsp.link(holding, abs);
            await this.syncDirectory(path.dirname(abs));
          } catch {}
        }
        recovery.transaction.phase = "failed";
        recovery.transaction.reason = "rename-failed";
        await this.writeRecoveryTransaction(recovery.directory, recovery.transaction).catch(() => {});
        await this.emitRecoveryFor(context);
        if ((error as NodeJS.ErrnoException).code?.includes("EEXIST")) {
          throw new Error(`destination already exists: ${path.basename(target)}`);
        }
        throw error;
      }
      this.contextFor(workspace);
      watchContext.snapshots.set(abs, captured.baseline);
      watchContext.lastKnown.delete(abs);
      watchContext.snapshots.set(target, captured.baseline);
      this.emitFileUpdate(watchContext, abs, null, captured.baseline);
      if (!this.currentWatch(watchContext)) return;
      if (captured.content !== null) watchContext.lastKnown.set(target, captured.content);
      else watchContext.lastKnown.delete(target);
      this.emitFileUpdate(watchContext, target, captured.content, captured.baseline);
    });
  }

  async movePath(workspace: WorkspaceIdentity, rel: string, newParent: string): Promise<void> {
    await this.mutations.run(workspace, async () => {
      const root = this.workspaceRoot(workspace);
      const context = this.contextFor(workspace);
      const watchContext = context.watchContext;
      if (!this.currentWatch(watchContext)) throw new Error("stale workspace");
      const clean = relativePath(rel);
      if (clean === RECOVERY_DIR || clean.startsWith(`${RECOVERY_DIR}/`)) {
        throw new Error("cannot move the recovery directory");
      }
      const parentRel = relativePath(newParent, true);
      if (parentRel === RECOVERY_DIR || parentRel.startsWith(`${RECOVERY_DIR}/`)) {
        throw new Error("cannot move into the recovery directory");
      }
      if (parentRel === clean || parentRel.startsWith(`${clean}/`)) {
        throw new Error("cannot move a folder into itself");
      }
      const abs = await confinedPath(root, clean);
      const parentDir = await confinedPath(root, parentRel, true);
      const parentStat = await fsp.lstat(parentDir).catch(() => null);
      if (!parentStat?.isDirectory()) throw new Error("destination folder does not exist");
      const name = path.basename(abs);
      const target = await confinedPath(root, parentRel ? `${parentRel}/${name}` : name);
      if (target === abs) throw new Error("entry is already in that folder");
      const occupied = await fsp.lstat(target).catch(() => null);
      if (occupied) throw new Error(`destination already exists: ${name}`);
      const captured = await this.captureDirectMutation(watchContext, abs);
      this.contextFor(workspace);
      try {
        await fsp.rename(abs, target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EXDEV") throw new Error("cannot move across filesystems");
        if (code?.includes("EEXIST")) throw new Error(`destination already exists: ${name}`);
        throw error;
      }
      this.contextFor(workspace);
      watchContext.snapshots.set(abs, captured.baseline);
      watchContext.lastKnown.delete(abs);
      this.emitFileUpdate(watchContext, abs, null, captured.baseline);
      if (!this.currentWatch(watchContext)) return;
      if (captured.content !== null) {
        watchContext.snapshots.set(target, captured.baseline);
        watchContext.lastKnown.set(target, captured.content);
        this.emitFileUpdate(watchContext, target, captured.content, captured.baseline);
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

  async stop(): Promise<void> {
    this.stopped = true;
    this.activations.invalidate();
    for (const context of this.contexts.values()) {
      context.activations.invalidate();
      this.stopWatcher(context);
    }
    this.contexts.clear();
    this.primary = null;
    await this.eventLoop.stop();
  }
}
