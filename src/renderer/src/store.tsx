import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  AgentFileState,
  AgentOption,
  ApprovalMode,
  BackendMessage,
  ModelOption,
  PermissionReply,
  PromptFile,
  ProviderUsageResult,
  RecoveryRecord,
  SessionInfo,
  SessionSummary,
  SessionUsage,
  Tab,
  TodoItem,
  TranscriptItem,
  TreeEntry,
  UserAttachment,
  WorkspaceIdentity
} from "@shared/types";
import { coalesceChatStream, mergeChatHistory, reduceChatStream, type ChatStreamEvent } from "./chat-stream";
import { EditorPersistence, type SaveSnapshot } from "./editor-persistence";
import { requestReveal } from "./reveal";
import { LatestGeneration, sameWorkspace } from "@shared/generation";
import { retainMatchingSessionRecords, retainSessionRecord } from "@shared/retention";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

export interface CtxMenuState {
  x: number;
  y: number;
  target: TreeEntry | null;
}

export interface PendingCreate {
  parent: string;
  kind: "file" | "dir";
}

function ancestorDirs(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = parts.length; i > 0; i--) out.push(parts.slice(0, i).join("/"));
  return out;
}

interface Store {
  session: SessionInfo | null;
  connected: boolean;
  busy: boolean;
  todos: TodoItem[];
  transcript: TranscriptItem[];
  sessionUsage: SessionUsage | null;
  providerUsage: ProviderUsageResult[];
  providerUsageLoading: boolean;
  tabs: Tab[];
  activePath: string | null;
  agentFiles: Map<string, AgentFileState>;
  tree: Record<string, TreeEntry[]>;
  expanded: Set<string>;
  toasts: Toast[];
  recoveryRecords: RecoveryRecord[];
  models: ModelOption[];
  currentModel: ModelOption | null;
  agents: AgentOption[];
  currentAgent: AgentOption | null;
  approvalMode: ApprovalMode;
  wordWrap: boolean;
  sessions: SessionSummary[];
  openSession: (dir: string) => Promise<void>;
  selectFolder: () => Promise<void>;
  reopenSession: (sessionID: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  sendPrompt: (text: string, files?: PromptFile[]) => Promise<void>;
  runCommand: (name: string, args?: string) => Promise<void>;
  stop: () => Promise<void>;
  refreshProviderUsage: () => Promise<void>;
  loadModels: () => Promise<void>;
  switchModel: (id: string, providerID: string, variant?: string) => Promise<void>;
  loadAgents: () => Promise<void>;
  switchAgent: (id: string) => Promise<void>;
  toggleApprovalMode: () => void;
  toggleWordWrap: () => void;
  openFile: (path: string, opts?: { mode?: "edit" | "diff" }) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  setTabMode: (path: string, mode: "edit" | "diff") => void;
  editContent: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  reloadTab: (path: string) => void;
  overwriteTab: (path: string) => Promise<void>;
  mergeTab: (path: string) => void;
  toggleDir: (path: string) => Promise<void>;
  replyPermission: (requestID: string, reply: PermissionReply) => Promise<void>;
  ctxMenu: CtxMenuState | null;
  pendingCreate: PendingCreate | null;
  pendingRename: { path: string } | null;
  openCtxMenu: (x: number, y: number, target: TreeEntry | null) => void;
  closeCtxMenu: () => void;
  startCreate: (parent: string, kind: "file" | "dir") => void;
  startRename: (path: string) => void;
  cancelPending: () => void;
  commitName: (name: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  openRecovery: (id: string) => Promise<void>;
  acknowledgeRecovery: (id: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const HIDDEN_DIRS = new Set([
  ".git", "node_modules", ".next", ".venv", "__pycache__", ".cache", ".turbo", ".svn", ".hg", ".nx", ".openshell-recovery"
]);

const MAX_EDITABLE_BYTES = 4 * 1024 * 1024;

function normalizeTodos(value: unknown): TodoItem[] {
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

function todoToolName(value: string): boolean {
  return value.toLowerCase().replace(/[^a-z]/g, "") === "todowrite";
}

function normalizeSessionUsage(value: unknown): SessionUsage | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const tokens = data.tokens as Record<string, unknown> | undefined;
  if (!tokens || typeof tokens !== "object") return null;
  const cache = tokens.cache as Record<string, unknown> | undefined;
  const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  return {
    cost: num(data.cost),
    tokens: {
      input: num(tokens.input),
      output: num(tokens.output),
      reasoning: num(tokens.reasoning),
      cache: {
        read: num(cache?.read),
        write: num(cache?.write)
      }
    }
  };
}

function todoSnapshotFromTranscript(items: TranscriptItem[]): { key: string; todos: TodoItem[] } | null {
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = items[itemIndex];
    if (item.kind !== "assistant") continue;
    for (let partIndex = item.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = item.parts[partIndex];
      if (part.kind !== "tool" || !todoToolName(part.tool.title)) continue;
      const metadataTodos = part.tool.metadata?.todos;
      if (Array.isArray(metadataTodos)) {
        return { key: `${part.id}:${JSON.stringify(metadataTodos)}`, todos: normalizeTodos(metadataTodos) };
      }
      try {
        const input = JSON.parse(part.tool.input ?? "{}") as { todos?: unknown };
        return { key: `${part.id}:${part.tool.input ?? ""}`, todos: normalizeTodos(input.todos) };
      } catch {
        return { key: `${part.id}:${part.tool.input ?? ""}`, todos: [] };
      }
    }
  }
  return null;
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

function filterEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter((e) => {
    const name = e.path.split("/").pop() ?? e.path;
    if (e.type === "directory") return !HIDDEN_DIRS.has(name);
    return name !== ".DS_Store";
  });
}

const CHAT_STREAM_TYPES = new Set([
  "session.input.admitted",
  "session.input.promoted",
  "session.input.cancelled",
  "session.agent.selected",
  "session.model.selected",
  "session.synthetic",
  "session.skill.activated",
  "session.shell.started",
  "session.shell.ended",
  "session.compaction.started",
  "session.compaction.delta",
  "session.compaction.ended",
  "session.compaction.failed",
  "session.step.started",
  "session.step.ended",
  "session.step.failed",
  "session.text.started",
  "session.text.delta",
  "session.text.ended",
  "session.reasoning.started",
  "session.reasoning.delta",
  "session.reasoning.ended",
  "session.tool.input.started",
  "session.tool.input.delta",
  "session.tool.input.ended",
  "session.tool.called",
  "session.tool.progress",
  "session.tool.success",
  "session.tool.failed",
  "session.retry.scheduled",
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.idle"
]);

function normalizeStreamEvent(msg: BackendMessage): ChatStreamEvent | null {
  if (msg.kind !== "event") return null;
  const event = msg.data as Record<string, any> | undefined;
  const data = (event?.data ?? event?.properties ?? event) as Record<string, any> | undefined;
  const rawType = msg.type ?? event?.type ?? event?.event ?? "";
  const type = rawType === "permission.v2.asked"
    ? "permission.asked"
    : rawType === "permission.v2.replied"
      ? "permission.replied"
      : rawType;
  if (!data || !type) return null;
  return {
    id: String(event?.id ?? `${type}-${Date.now()}`),
    type,
    created: Number(event?.created ?? Date.now()),
    data
  };
}

let toastId = 0;

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyBySession, setBusyBySession] = useState<Record<string, boolean>>({});
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [transcriptsBySession, setTranscriptsBySession] = useState<Record<string, TranscriptItem[]>>({});
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [agentFiles, setAgentFiles] = useState<Map<string, AgentFileState>>(new Map());
  const [tree, setTree] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recoveryRecords, setRecoveryRecords] = useState<RecoveryRecord[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelOption | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentOption | null>(null);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    () => (window.localStorage.getItem("approvalMode") === "approve" ? "approve" : "ask")
  );
  const [wordWrap, setWordWrap] = useState<boolean>(
    () => window.localStorage.getItem("wordWrap") === "on"
  );
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [usageBySession, setUsageBySession] = useState<Record<string, SessionUsage>>({});
  const [providerUsage, setProviderUsage] = useState<ProviderUsageResult[]>([]);
  const [providerUsageLoading, setProviderUsageLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [pendingRename, setPendingRename] = useState<{ path: string } | null>(null);
  const busy = session ? Boolean(busyBySession[session.id]) : false;
  const transcript = session ? transcriptsBySession[session.id] ?? [] : [];
  const sessionUsage = session ? usageBySession[session.id] ?? null : null;

  useEffect(() => {
    setBusyBySession((current) => retainMatchingSessionRecords(current, transcriptsBySession, session?.id));
  }, [session?.id, transcriptsBySession]);

  const agentFilesRef = useRef(agentFiles);
  agentFilesRef.current = agentFiles;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const pendingCreateRef = useRef(pendingCreate);
  pendingCreateRef.current = pendingCreate;
  const pendingRenameRef = useRef(pendingRename);
  pendingRenameRef.current = pendingRename;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const persistenceRef = useRef<EditorPersistence | null>(null);
  if (!persistenceRef.current) {
    persistenceRef.current = new EditorPersistence((snapshot, write) =>
      window.openshell.writeFile(snapshot.workspace, snapshot.path, snapshot.content, write)
    );
  }
  const persistence = persistenceRef.current;
  const modelsRef = useRef<ModelOption[]>([]);
  modelsRef.current = models;
  const agentsRef = useRef<AgentOption[]>([]);
  agentsRef.current = agents;
  const todoToolRef = useRef("");
  const approvalModeRef = useRef<ApprovalMode>(approvalMode);
  approvalModeRef.current = approvalMode;
  const sessionRef = useRef<SessionInfo | null>(session);
  sessionRef.current = session;
  const activationsRef = useRef<LatestGeneration | null>(null);
  if (!activationsRef.current) activationsRef.current = new LatestGeneration();
  const activations = activationsRef.current;
  const pendingActivationRef = useRef<number | null>(null);

  const updateSessionTranscript = useCallback(
    (sessionID: string, update: (items: TranscriptItem[]) => TranscriptItem[]) => {
      setTranscriptsBySession((current) => {
        const items = current[sessionID] ?? [];
        const next = update(items);
        return next === items
          ? current
          : retainSessionRecord(current, sessionID, next, sessionRef.current?.id);
      });
    },
    []
  );

  const updateActiveTranscript = useCallback(
    (update: (items: TranscriptItem[]) => TranscriptItem[]) => {
      const sessionID = sessionRef.current?.id;
      if (sessionID) updateSessionTranscript(sessionID, update);
    },
    [updateSessionTranscript]
  );

  const setSessionBusy = useCallback((sessionID: string, value: boolean) => {
    setBusyBySession((current) => current[sessionID] === value
      ? current
      : { ...current, [sessionID]: value });
  }, []);

  const toast = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const resetAll = useCallback((preserveSessionStreams = false) => {
    persistence.cancelAll();
    if (!preserveSessionStreams) setBusyBySession({});
    setTodos([]);
    if (!preserveSessionStreams) setTranscriptsBySession({});
    setTabs([]);
    setActivePath(null);
    setAgentFiles(new Map());
    setRecoveryRecords([]);
    setTree({});
    setExpanded(new Set());
    setCtxMenu(null);
    setPendingCreate(null);
    setPendingRename(null);
    agentFilesRef.current = new Map();
    tabsRef.current = [];
    todoToolRef.current = "";
  }, [persistence]);

  const loadRecovery = useCallback(async (workspace: WorkspaceIdentity) => {
    try {
      const records = await window.openshell.recoveryRecords(workspace);
      if (sameWorkspace(workspace, sessionRef.current?.workspace)) setRecoveryRecords(records);
    } catch (error) {
      if (sameWorkspace(workspace, sessionRef.current?.workspace)) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    }
  }, [toast]);

  const loadModels = useCallback(async () => {
    const workspace = sessionRef.current?.workspace;
    try {
      const [list, def, selection] = await Promise.all([
        window.openshell.models(),
        window.openshell.modelDefault(),
        window.openshell.sessionSelection()
      ]);
      if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
      setModels((prev) => {
        if (
          prev.length === list.length &&
          prev.every(
            (m, i) => m.id === list[i].id && m.providerID === list[i].providerID && m.name === list[i].name
          )
        ) {
          return prev;
        }
        return list;
      });
      setCurrentModel((cur) => {
        const target = selection?.model ?? cur ?? def;
        if (!target) return null;
        const match = list.find((m) => m.id === target.id && m.providerID === target.providerID);
        return match ? { ...match, ...(target.variant ? { variant: target.variant } : {}) } : target;
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast]);

  const switchModel = useCallback(
    async (id: string, providerID: string, variant?: string) => {
      const workspace = sessionRef.current?.workspace;
      try {
        if (!workspace) return;
        await window.openshell.switchModel(workspace, id, providerID, variant);
        if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
        const base = modelsRef.current.find((m) => m.id === id && m.providerID === providerID);
        if (base) setCurrentModel({ ...base, ...(variant ? { variant } : {}) });
      } catch (err) {
        if (sameWorkspace(workspace, sessionRef.current?.workspace)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast]
  );

  const loadAgents = useCallback(async () => {
    const workspace = sessionRef.current?.workspace;
    try {
      const [list, selection] = await Promise.all([
        window.openshell.agents(),
        window.openshell.sessionSelection()
      ]);
      if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
      setAgents((prev) => {
        if (
          prev.length === list.length &&
          prev.every((a, i) => a.id === list[i].id && a.name === list[i].name && a.color === list[i].color)
        ) {
          return prev;
        }
        return list;
      });
      setCurrentAgent((cur) => {
        const id = selection?.agent?.id ?? cur?.id;
        if (!id) return null;
        return list.find((agent) => agent.id === id) ?? selection?.agent ?? cur ?? null;
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast]);

  const switchAgent = useCallback(
    async (id: string) => {
      const workspace = sessionRef.current?.workspace;
      try {
        if (!workspace) return;
        await window.openshell.switchAgent(workspace, id);
        if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
      } catch (err) {
        if (sameWorkspace(workspace, sessionRef.current?.workspace)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast]
  );

  const toggleWordWrap = useCallback(() => {
    setWordWrap((prev) => {
      const next = !prev;
      window.localStorage.setItem("wordWrap", next ? "on" : "off");
      return next;
    });
  }, []);

  const openSession = useCallback(
    async (dir: string) => {
      const request = activations.accept();
      pendingActivationRef.current = request;
      try {
        persistence.cancelAll();
        const info = await window.openshell.openSession(dir, request);
        if (!activations.current(request)) return;
        pendingActivationRef.current = null;
        resetAll();
        sessionRef.current = info;
        setSession(info);
        void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels();
        void loadAgents();
      } catch (err) {
        if (pendingActivationRef.current === request) pendingActivationRef.current = null;
        if (activations.current(request)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [resetAll, toast, loadModels, loadAgents, loadRecovery, persistence, activations]
  );

  const selectFolder = useCallback(async () => {
    const request = activations.accept();
    pendingActivationRef.current = request;
    try {
      persistence.cancelAll();
      const info = await window.openshell.selectFolder(request);
      if (!activations.current(request)) return;
      pendingActivationRef.current = null;
        if (info) {
          resetAll();
          sessionRef.current = info;
          setSession(info);
          void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels();
        void loadAgents();
      }
    } catch (err) {
      if (pendingActivationRef.current === request) pendingActivationRef.current = null;
      if (activations.current(request)) toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [resetAll, toast, loadModels, loadAgents, loadRecovery, persistence, activations]);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await window.openshell.sessions());
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast]);

  const reopenSession = useCallback(
    async (sessionID: string, silent = false) => {
      const request = activations.accept();
      pendingActivationRef.current = request;
      try {
        persistence.cancelAll();
        const reopened = await window.openshell.openSessionById(sessionID, request);
        if (!activations.current(request)) return;
        pendingActivationRef.current = null;
        resetAll(true);
        sessionRef.current = reopened.session;
        setSession(reopened.session);
        void loadRecovery(reopened.session.workspace);
        setTranscriptsBySession((current) => retainSessionRecord(
          current,
          reopened.session.id,
          mergeChatHistory(
            reopened.transcript,
            current[reopened.session.id] ?? []
          ),
          reopened.session.id
        ));
        const running = [...reopened.transcript].reverse().find((item) => item.kind === "assistant");
        setBusyBySession((current) => reopened.session.id in current
          ? current
          : {
              ...current,
              [reopened.session.id]: Boolean(running?.kind === "assistant" && !running.completed)
            });
        setTodos(reopened.todos);
        if (reopened.usage) {
          setUsageBySession((current) => retainSessionRecord(
            current,
            reopened.session.id,
            reopened.usage!,
            reopened.session.id
          ));
        }
        if (!silent) toast(`Reopened session in ${reopened.session.directory}`);
        void loadModels();
        void loadAgents();
        void loadSessions();
      } catch (err) {
        if (pendingActivationRef.current === request) pendingActivationRef.current = null;
        if (activations.current(request)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [resetAll, toast, loadModels, loadAgents, loadSessions, loadRecovery, persistence, activations]
  );

  const sendPrompt = useCallback(
    async (text: string, files: PromptFile[] = []) => {
      const t = text.trim();
      if ((!t && files.length === 0) || !session) return;
      const promptText = t || "Review the attached files.";
      const attachments: UserAttachment[] = files.map((file) => ({
        name: file.path.split(/[\\/]/).pop() ?? file.path
      }));
      const userItem: TranscriptItem = {
        kind: "user",
        id: `user-${Date.now()}`,
        text: promptText,
        ...(attachments.length > 0 ? { attachments } : {})
      };
      updateActiveTranscript((prev) => [...prev, userItem]);
      setTodos([]);
      const workspace = session.workspace;
      try {
        await window.openshell.prompt(workspace, promptText, files);
      } catch (err) {
        if (sameWorkspace(workspace, sessionRef.current?.workspace)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [session, toast, updateActiveTranscript]
  );

  const runCommand = useCallback(async (name: string, args = "") => {
    const workspace = sessionRef.current?.workspace;
    if (!workspace) return;
    try {
      await window.openshell.runCommand(workspace, name, args);
    } catch (error) {
      if (sameWorkspace(workspace, sessionRef.current?.workspace)) throw error;
    }
  }, []);

  const stop = useCallback(async () => {
    const current = sessionRef.current;
    if (current) setSessionBusy(current.id, false);
    if (current) await window.openshell.interrupt(current.workspace).catch(() => {});
  }, [setSessionBusy]);

  const refreshProviderUsage = useCallback(async () => {
    setProviderUsageLoading(true);
    try {
      setProviderUsage(await window.openshell.providerUsage());
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setProviderUsageLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!busy) return;
    const snapshot = todoSnapshotFromTranscript(transcript);
    if (!snapshot || snapshot.key === todoToolRef.current) return;
    todoToolRef.current = snapshot.key;
    setTodos(snapshot.todos);
  }, [busy, transcript]);

  const replyPermission = useCallback(
    async (requestID: string, reply: PermissionReply) => {
      try {
        const current = sessionRef.current;
        if (!current) return;
        await window.openshell.permissionReply(current.workspace, requestID, reply, current.id);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return;
      }
      updateActiveTranscript((prev) =>
        prev.map((item) =>
          item.kind === "permission" && item.requestID === requestID
            ? { ...item, pending: false, resolvedWith: reply }
            : item
        )
      );
    },
    [toast, updateActiveTranscript]
  );

  const toggleApprovalMode = useCallback(() => {
    setApprovalMode((current) => {
      const next = current === "approve" ? "ask" : "approve";
      approvalModeRef.current = next;
      window.localStorage.setItem("approvalMode", next);
      return next;
    });
  }, []);

  const toggleDir = useCallback(
    async (path: string) => {
      const isOpen = expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(path);
        else next.add(path);
        return next;
      });
      if (isOpen) return;
      if (!tree[path]) {
        const workspace = sessionRef.current?.workspace;
        if (!workspace) return;
        try {
          const entries = await window.openshell.listDir(workspace, path);
          if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
          setTree((prev) => ({ ...prev, [path]: sortEntries(filterEntries(entries)) }));
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [expanded, tree, toast]
  );

  const refreshTree = useCallback(async (dirs: string[]): Promise<void> => {
    const unique = [...new Set(dirs)];
    if (expandedRef.current.has("") && !unique.includes("")) unique.push("");
    await Promise.all(
      unique.map(async (dir) => {
        const workspace = sessionRef.current?.workspace;
        if (!workspace) return;
        try {
          const entries = await window.openshell.listDir(workspace, dir);
          if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
          setTree((prev) => ({ ...prev, [dir]: sortEntries(filterEntries(entries)) }));
        } catch {
          /* keep previous listing */
        }
      })
    );
  }, []);

  const openCtxMenu = useCallback((x: number, y: number, target: TreeEntry | null) => {
    setCtxMenu({ x, y, target });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const startCreate = useCallback((parent: string, kind: "file" | "dir") => {
    setCtxMenu(null);
    setPendingRename(null);
    setPendingCreate({ parent, kind });
    setExpanded((prev) => {
      if (prev.has(parent)) return prev;
      const next = new Set(prev);
      next.add(parent);
      return next;
    });
  }, []);

  const startRename = useCallback((path: string) => {
    setCtxMenu(null);
    setPendingCreate(null);
    setPendingRename({ path });
  }, []);

  const cancelPending = useCallback(() => {
    setPendingCreate(null);
    setPendingRename(null);
  }, []);

  const deleteEntry = useCallback(
    async (path: string) => {
      setCtxMenu(null);
      const workspace = sessionRef.current?.workspace;
      if (!workspace) return;
      persistence.cancelPrefix(workspace, path);
      try {
        await window.openshell.deletePath(workspace, path);
      } catch (err) {
        if (sameWorkspace(workspace, sessionRef.current?.workspace)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }
      if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
      const prefix = `${path}/`;
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path && !t.path.startsWith(prefix));
        if (next.length !== prev.length) {
          setActivePath((active) => {
            if (!active || (active !== path && !active.startsWith(prefix))) return active;
            const idx = prev.findIndex((t) => t.path === active);
            const neighbor = next[idx] ?? next[next.length - 1];
            return neighbor ? neighbor.path : null;
          });
        }
        return next;
      });
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      void refreshTree(ancestorDirs(parent));
    },
    [toast, refreshTree, persistence]
  );

  const openFile = useCallback(
    async (path: string, opts?: { mode?: "edit" | "diff"; source?: boolean }) => {
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActivePath(path);
        if (opts?.mode && existing.mode !== opts.mode) {
          setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, mode: opts.mode! } : t)));
        }
        return;
      }
      const activation = activations.snapshot();
      try {
        const workspace = sessionRef.current?.workspace;
        const agentFile = agentFilesRef.current.get(path);
        let content = opts?.source
          ? await window.openshell.readSourceFile(path)
          : workspace
            ? await window.openshell.readFile(workspace, path)
            : null;
        if (!activations.current(activation)) return;
        if (!opts?.source && !sameWorkspace(workspace, sessionRef.current?.workspace)) return;
        if (content === null && agentFile?.deleted) content = "";
        if (content === null) {
          toast(`Could not read ${path}`, "error");
          return;
        }
        if (content.length > MAX_EDITABLE_BYTES) {
          toast(`${path} is too large to open in the editor`, "error");
          return;
        }
        if (content.includes("\u0000")) {
          toast(`${path} is a binary file`, "error");
          return;
        }
        const name = path.split("/").pop() ?? path;
        const tab: Tab = {
          path,
          name,
          content,
          saved: content,
          baseline: agentFile?.baseline ?? null,
          deleted: agentFile?.deleted ?? false,
          dirty: false,
          stale: false,
          revision: 0,
          conflict: null,
          mode: opts?.mode ?? "edit",
          binary: false
        };
        setTabs((prev) => [...prev, tab]);
        setActivePath(path);
      } catch (err) {
        if (activations.current(activation)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [tabs, toast, activations]
  );
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;

  const commitName = useCallback(
    async (name: string) => {
      const create = pendingCreateRef.current;
      const rename = pendingRenameRef.current;
      if (!create && !rename) return;
      const trimmed = name.trim();
      if (!trimmed) {
        cancelPending();
        return;
      }
      if (trimmed.includes("/") || trimmed === "." || trimmed === "..") {
        toast("Invalid name", "error");
        return;
      }
      const workspace = sessionRef.current?.workspace;
      if (!workspace) return;
      try {
        if (create) {
          const target = create.parent ? `${create.parent}/${trimmed}` : trimmed;
          await (create.kind === "file"
            ? window.openshell.createFile(workspace, target)
            : window.openshell.createDir(workspace, target));
          if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
          void refreshTree(ancestorDirs(create.parent));
          if (create.kind === "file") void openFile(target);
        } else if (rename) {
          const parent = rename.path.includes("/")
            ? rename.path.slice(0, rename.path.lastIndexOf("/"))
            : "";
          const newPath = parent ? `${parent}/${trimmed}` : trimmed;
          persistence.cancelPrefix(workspace, rename.path);
          await window.openshell.renamePath(workspace, rename.path, trimmed);
          if (!sameWorkspace(workspace, sessionRef.current?.workspace)) return;
          setTabs((prev) =>
            prev.map((t) =>
              t.path === rename.path || t.path.startsWith(`${rename.path}/`)
                ? {
                    ...t,
                    path: t.path.replace(rename.path, newPath),
                    name: t.path === rename.path ? trimmed : t.name
                  }
                : t
            )
          );
          setActivePath((active) =>
            active && (active === rename.path || active.startsWith(`${rename.path}/`))
              ? active.replace(rename.path, newPath)
              : active
          );
          setAgentFiles((prev) => {
            const next = new Map<string, AgentFileState>();
            for (const [p, state] of prev) {
              if (p === rename.path || p.startsWith(`${rename.path}/`)) {
                next.set(`${newPath}${p.slice(rename.path.length)}`, state);
              } else {
                next.set(p, state);
              }
            }
            agentFilesRef.current = next;
            return next;
          });
          void refreshTree(ancestorDirs(parent));
        }
        cancelPending();
      } catch (err) {
        if (sameWorkspace(workspace, sessionRef.current?.workspace)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [toast, openFile, refreshTree, cancelPending, persistence]
  );

  const closeTab = useCallback((path: string) => {
    const workspace = sessionRef.current?.workspace;
    if (workspace) persistence.cancelPath(workspace, path);
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      setActivePath((active) => {
        if (active !== path) return active;
        const idx = prev.findIndex((t) => t.path === path);
        const neighbor = next[idx] ?? next[next.length - 1];
        return neighbor ? neighbor.path : null;
      });
      return next;
    });
  }, [persistence]);

  const setActive = useCallback((path: string) => setActivePath(path), []);

  const setTabMode = useCallback((path: string, mode: "edit" | "diff") => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, mode } : t)));
  }, []);

  const doSave = useCallback(
    async (snapshot: SaveSnapshot, allowConflict = false) => {
      const current = tabsRef.current.find((tab) => tab.path === snapshot.path);
      if (!current || (!allowConflict && current.conflict)) return;
      try {
        const result = await persistence.save(snapshot);
        if (result !== "saved") return;
        setTabs((prev) =>
          prev.map((t) =>
            t.path === snapshot.path && t.revision === snapshot.revision
              ? {
                  ...t,
                  saved: snapshot.content,
                  dirty: false,
                  stale: false,
                  conflict: null,
                  baseline: t.baseline ?? { kind: "known", content: snapshot.expectedContent },
                  deleted: false
                }
              : t
          )
        );
      } catch (err) {
        toast(`Failed to save ${snapshot.path}: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
    [persistence, toast]
  );

  const saveTab = useCallback(
    async (path: string) => {
      const workspace = sessionRef.current?.workspace;
      const tab = tabsRef.current.find((candidate) => candidate.path === path);
      if (!workspace || !tab || tab.conflict) return;
      persistence.cancelTimer(workspace, path);
      await doSave({
        workspace,
        path,
        content: tab.content,
        expectedContent: tab.saved,
        revision: tab.revision
      });
    },
    [doSave, persistence]
  );

  const editContent = useCallback(
    (path: string, content: string) => {
      const workspace = sessionRef.current?.workspace;
      const tab = tabsRef.current.find((candidate) => candidate.path === path);
      if (!workspace || !tab || tab.content === content) return;
      const snapshot = {
        workspace,
        path,
        content,
        expectedContent: tab.saved,
        revision: tab.revision + 1
      };
      setTabs((prev) => prev.map((candidate) => candidate.path === path
        ? { ...candidate, content, revision: snapshot.revision, dirty: true }
        : candidate));
      if (!tab.conflict) persistence.schedule(snapshot, (next) => void doSave(next));
    },
    [doSave, persistence]
  );

  const reloadTab = useCallback((path: string) => {
    const workspace = sessionRef.current?.workspace;
    if (!workspace) return;
    persistence.cancelPath(workspace, path);
    setTabs((prev) => prev.map((tab) => {
      if (tab.path !== path || !tab.conflict) return tab;
      const content = tab.conflict.content ?? "";
      return {
        ...tab,
        content,
        saved: content,
        dirty: false,
        stale: false,
        deleted: tab.conflict.deleted,
        revision: tab.revision + 1,
        conflict: null
      };
    }));
  }, [persistence]);

  const overwriteTab = useCallback(async (path: string) => {
    const workspace = sessionRef.current?.workspace;
    const tab = tabsRef.current.find((candidate) => candidate.path === path);
    if (!workspace || !tab?.conflict) return;
    persistence.cancelTimer(workspace, path);
    await doSave({
      workspace,
      path,
      content: tab.content,
      expectedContent: tab.saved,
      revision: tab.revision,
      overwrite: true
    }, true);
  }, [doSave, persistence]);

  const mergeTab = useCallback((path: string) => {
    setTabs((prev) => prev.map((tab) => tab.path === path && tab.conflict
      ? { ...tab, conflict: { ...tab.conflict, resolution: "merge" } }
      : tab));
  }, []);

  const openRecovery = useCallback(async (id: string) => {
    const workspace = sessionRef.current?.workspace;
    if (!workspace) return;
    try {
      await window.openshell.openRecovery(workspace, id);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }, [toast]);

  const acknowledgeRecovery = useCallback(async (id: string) => {
    const workspace = sessionRef.current?.workspace;
    if (!workspace) return;
    try {
      await window.openshell.acknowledgeRecovery(workspace, id);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }, [toast]);

  useEffect(() => {
    const processMessage = (msg: BackendMessage): void => {
      if (msg.kind === "session") {
        if (pendingActivationRef.current !== null) return;
        if (
          msg.session &&
          sessionRef.current &&
          msg.session.workspace.generation < sessionRef.current.workspace.generation
        ) return;
        const previousWorkspace = sessionRef.current?.workspace;
        if (previousWorkspace && previousWorkspace.id !== msg.session?.workspace.id) {
          persistence.cancelWorkspace(previousWorkspace);
        }
        sessionRef.current = msg.session ?? null;
        setSession(sessionRef.current);
        if (msg.session) {
          void loadRecovery(msg.session.workspace);
          void loadModels();
          void loadAgents();
          void loadSessions();
        }
        return;
      }
      if (msg.kind === "ui-command") {
        if (msg.command === "toggle-word-wrap") {
          toggleWordWrap();
        } else if (msg.command === "open-source" && typeof msg.path === "string" && typeof msg.line === "number") {
          const path = msg.path;
          const line = msg.line;
          void openFileRef.current(path, { mode: "edit", source: path.startsWith("/") }).then(() => requestReveal(path, line));
        }
        return;
      }
      if (msg.kind === "recovery") {
        if (msg.recovery && sameWorkspace(msg.recovery.workspace, sessionRef.current?.workspace)) {
          setRecoveryRecords(msg.recovery.records);
        }
        return;
      }
      if (msg.kind === "file-update") {
        const f = msg.file!;
        const workspace = sessionRef.current?.workspace;
        if (!workspace || f.sessionID !== sessionRef.current?.id || !sameWorkspace(f.workspace, workspace)) return;
        const origin = persistence.classify(workspace, f);
        setAgentFiles((prev) => {
          const next = new Map(prev);
          next.set(f.path, { baseline: f.baseline, content: f.content, deleted: f.deleted });
          agentFilesRef.current = next;
          return next;
        });
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.path !== f.path) return tab;
            if (origin === "echo") return tab;
            if (tab.dirty) {
              persistence.cancelTimer(workspace, f.path);
              return {
                ...tab,
                baseline: f.baseline,
                stale: true,
                deleted: f.deleted,
                conflict: { content: f.content, deleted: f.deleted, resolution: "pending" }
              };
            }
            const content = f.content ?? tab.content;
            return {
              ...tab,
              content,
              saved: content,
              baseline: f.baseline,
              deleted: f.deleted,
              stale: false,
              conflict: null
            };
          })
        );
        const parent = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        if (parent !== f.path && expandedRef.current.has(parent)) {
          const expected = workspace;
          void window.openshell
            .listDir(expected, parent)
            .then((entries) =>
              sameWorkspace(expected, sessionRef.current?.workspace) &&
                setTree((prev) => ({ ...prev, [parent]: sortEntries(filterEntries(entries)) }))
            )
            .catch(() => {});
        }
        return;
      }
      if (msg.kind !== "event") return;
      const streamEvent = normalizeStreamEvent(msg);
      if (!streamEvent) return;
      const { data, type } = streamEvent;
      const targetSessionID = typeof data.sessionID === "string"
        ? data.sessionID
        : sessionRef.current?.id;
      const active = Boolean(targetSessionID && targetSessionID === sessionRef.current?.id);
      if (targetSessionID && CHAT_STREAM_TYPES.has(type)) {
        updateSessionTranscript(targetSessionID, (prev) => reduceChatStream(prev, streamEvent));
      }

      switch (type) {
        case "session.created": {
          const location = data.location as { directory?: string } | undefined;
          const directory = location?.directory ?? streamEvent.data.location?.directory;
          if (!targetSessionID || typeof directory !== "string") break;
          const summary: SessionSummary = {
            id: targetSessionID,
            title: typeof data.title === "string" && data.title.trim()
              ? data.title
              : directory.split(/[\\/]/).pop() ?? directory,
            directory,
            updatedAt: streamEvent.created,
            ...(typeof data.parentID === "string" ? { parentID: data.parentID } : {}),
            ...(typeof data.agent === "string" ? { agent: data.agent } : {})
          };
          setSessions((current) => {
            const index = current.findIndex((item) => item.id === summary.id);
            if (index === -1) return [summary, ...current];
            return current.map((item, itemIndex) => itemIndex === index ? summary : item);
          });
          break;
        }
        case "session.renamed": {
          if (!targetSessionID || typeof data.title !== "string") break;
          setSessions((current) => current.map((item) =>
            item.id === targetSessionID
              ? { ...item, title: data.title, updatedAt: streamEvent.created }
              : item
          ));
          break;
        }
        case "session.deleted": {
          if (targetSessionID) setSessions((current) => current.filter((item) => item.id !== targetSessionID));
          break;
        }
        case "session.usage.updated":
        case "session.usage.recorded": {
          const usage = normalizeSessionUsage(data);
          if (!targetSessionID || !usage) break;
          setUsageBySession((current) => retainSessionRecord(
            current,
            targetSessionID,
            usage,
            sessionRef.current?.id
          ));
          break;
        }
        case "session.execution.started": {
          if (targetSessionID) setSessionBusy(targetSessionID, true);
          break;
        }
        case "session.execution.succeeded":
        case "session.execution.failed":
        case "session.execution.interrupted": {
          if (targetSessionID) setSessionBusy(targetSessionID, false);
          if (active) setTodos([]);
          const ok = type === "session.execution.succeeded";
          if (!ok && targetSessionID) {
            updateSessionTranscript(targetSessionID, (prev) => [
              ...prev,
              {
                kind: "status",
                id: `${streamEvent.id}-end`,
                text: type === "session.execution.interrupted" ? "Interrupted" : "Failed",
                tone: "error"
              }
            ]);
          }
          break;
        }
        case "session.idle": {
          if (targetSessionID) setSessionBusy(targetSessionID, false);
          if (active) setTodos([]);
          break;
        }
        case "todo.updated": {
          if (active) setTodos(normalizeTodos(data.todos));
          break;
        }
        case "session.model.selected": {
          if (!active) break;
          const model = data.model as { id?: string; providerID?: string; variant?: string } | undefined;
          if (model?.id && model.providerID) {
            const match = modelsRef.current.find(
              (m) => m.id === model.id && m.providerID === model.providerID
            );
            setCurrentModel({
              ...(match ?? { id: model.id, providerID: model.providerID, name: model.id }),
              ...(model.variant ? { variant: model.variant } : {})
            });
          }
          break;
        }
        case "session.agent.selected": {
          if (!active) break;
          const agent = data.agent as string | undefined;
          if (agent) {
            setCurrentAgent(
              agentsRef.current.find((a) => a.id === agent) ?? { id: agent, name: agent }
            );
          }
          break;
        }
        case "session.status": {
          const status = data.status as { type?: string; attempt?: number; message?: string; next?: number } | undefined;
          if (status?.type === "busy" && targetSessionID) setSessionBusy(targetSessionID, true);
          if (status?.type === "idle" && targetSessionID) setSessionBusy(targetSessionID, false);
          if (status?.type === "retry" && targetSessionID) {
            setSessionBusy(targetSessionID, true);
            updateSessionTranscript(targetSessionID, (prev) => {
              const assistant = [...prev].reverse().find((item) => item.kind === "assistant");
              if (!assistant || assistant.kind !== "assistant") return prev;
              return prev.map((item) =>
                item.kind === "assistant" && item.messageID === assistant.messageID
                  ? {
                      ...item,
                      retry: {
                        attempt: Number(status.attempt ?? 1),
                        message: String(status.message ?? "Retrying"),
                        next: status.next
                      }
                    }
                  : item
              );
            });
          }
          break;
        }
        case "permission.asked": {
          const requestID = String(data.id);
          const automatic = approvalModeRef.current === "approve";
          if (!targetSessionID) break;
          updateSessionTranscript(targetSessionID, (prev) => {
            if (prev.some((i) => i.kind === "permission" && i.requestID === requestID)) return prev;
            return [
              ...prev,
              {
                kind: "permission",
                id: requestID,
                requestID,
                action: String(data.action ?? data.permission ?? "unknown"),
                resources: Array.isArray(data.resources ?? data.patterns)
                  ? (data.resources ?? data.patterns).map(String)
                  : [],
                pending: true
              }
            ];
          });
          const current = sessionRef.current;
          if (automatic && current && targetSessionID === current.id) {
            void window.openshell.permissionReply(current.workspace, requestID, "once", targetSessionID);
          }
          break;
        }
        case "permission.replied": {
          const requestID = String(data.requestID ?? data.id);
          const reply = (data.reply as PermissionReply | undefined) ?? "reject";
          if (!targetSessionID) break;
          updateSessionTranscript(targetSessionID, (prev) =>
            prev.map((item) =>
              item.kind === "permission" && item.requestID === requestID
                ? { ...item, pending: false, resolvedWith: reply }
                : item
            )
          );
          break;
        }
      }
    };

    let queued: ChatStreamEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFlush = 0;
    const flushEvents = (): void => {
      timer = null;
      const events = coalesceChatStream(queued);
      queued = [];
      lastFlush = Date.now();
      for (const event of events) {
        processMessage({ kind: "event", type: event.type, data: event });
      }
    };
    const off = window.openshell.onMessage((msg: BackendMessage) => {
      const event = normalizeStreamEvent(msg);
      if (!event) {
        processMessage(msg);
        return;
      }
      queued.push(event);
      if (timer === null) {
        timer = setTimeout(flushEvents, Math.max(0, 16 - (Date.now() - lastFlush)));
      }
    });

    void window.openshell.health().then(setConnected);
    const startup = activations.accept();
    void window.openshell.state().then((s) => {
      if (s && activations.current(startup) && (!sessionRef.current || s.workspace.generation >= sessionRef.current.workspace.generation)) {
        void reopenSession(s.id, true);
      }
    });
    return () => {
      off();
      if (timer !== null) clearTimeout(timer);
      persistence.cancelAll();
    };
  }, [
    loadModels,
    toggleWordWrap,
    loadAgents,
    loadSessions,
    loadRecovery,
    reopenSession,
    setSessionBusy,
    updateSessionTranscript,
    persistence,
    activations
  ]);

  useEffect(() => {
    if (!connected || !sessionRef.current) return;
    void loadModels();
    void loadAgents();
  }, [connected, loadModels, loadAgents]);

  const value = useMemo<Store>(
    () => ({
      session,
      connected,
      busy,
      todos,
      transcript,
      sessionUsage,
      providerUsage,
      providerUsageLoading,
      tabs,
      activePath,
      agentFiles,
      tree,
      expanded,
      toasts,
      recoveryRecords,
      models,
      currentModel,
      agents,
      currentAgent,
      approvalMode,
      wordWrap,
      sessions,
      openSession,
      selectFolder,
      reopenSession,
      loadSessions,
      sendPrompt,
      runCommand,
      stop,
      refreshProviderUsage,
      loadModels,
      switchModel,
      loadAgents,
      switchAgent,
      toggleApprovalMode,
      toggleWordWrap,
      openFile,
      closeTab,
      setActive,
      setTabMode,
      editContent,
      saveTab,
      reloadTab,
      overwriteTab,
      mergeTab,
      toggleDir,
      replyPermission,
      ctxMenu,
      pendingCreate,
      pendingRename,
      openCtxMenu,
      closeCtxMenu,
      startCreate,
      startRename,
      cancelPending,
      commitName,
      deleteEntry,
      openRecovery,
      acknowledgeRecovery
    }),
    [
      session, connected, busy, todos, transcript, sessionUsage, providerUsage, providerUsageLoading, tabs, activePath, agentFiles, tree, expanded, toasts, recoveryRecords,
      models, currentModel, agents, currentAgent, approvalMode, wordWrap, sessions,
      ctxMenu, pendingCreate, pendingRename,
      openSession, selectFolder, reopenSession, loadSessions, sendPrompt, runCommand, stop, refreshProviderUsage, loadModels, switchModel,
      loadAgents, switchAgent, toggleApprovalMode, toggleWordWrap,
      openFile, closeTab, setActive, setTabMode,
      editContent, saveTab, reloadTab, overwriteTab, mergeTab, toggleDir, replyPermission,
      openCtxMenu, closeCtxMenu, startCreate, startRename, cancelPending, commitName, deleteEntry, openRecovery, acknowledgeRecovery
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
