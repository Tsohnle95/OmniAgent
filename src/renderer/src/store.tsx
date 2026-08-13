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
import { sameWorkspace } from "@shared/generation";
import { retainSessionRecord } from "@shared/retention";

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

export interface PanelView {
  session: SessionInfo | null;
  busy: boolean;
  transcript: TranscriptItem[];
  todos: TodoItem[];
  sessionUsage: SessionUsage | null;
  models: ModelOption[];
  currentModel: ModelOption | null;
  agents: AgentOption[];
  currentAgent: AgentOption | null;
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
  panels: SessionInfo[];
  panelViews: Record<string, PanelView>;
  activeSessionID: string | null;
  focusSession: (sessionID: string) => void;
  closePanel: (sessionID: string) => void;
  openSession: (dir: string) => Promise<void>;
  selectFolder: () => Promise<void>;
  reopenSession: (sessionID: string, silent?: boolean) => Promise<void>;
  loadSessions: () => Promise<void>;
  sendPrompt: (text: string, files?: PromptFile[], workspace?: WorkspaceIdentity) => Promise<void>;
  runCommand: (name: string, args?: string, workspace?: WorkspaceIdentity) => Promise<void>;
  stop: (workspace?: WorkspaceIdentity) => Promise<void>;
  refreshProviderUsage: () => Promise<void>;
  loadModels: (workspace?: WorkspaceIdentity) => Promise<void>;
  switchModel: (id: string, providerID: string, variant?: string, workspace?: WorkspaceIdentity) => Promise<void>;
  loadAgents: (workspace?: WorkspaceIdentity) => Promise<void>;
  switchAgent: (id: string, workspace?: WorkspaceIdentity) => Promise<void>;
  toggleApprovalMode: () => void;
  toggleWordWrap: () => void;
  openFile: (path: string, opts?: { mode?: "edit" | "diff"; source?: boolean }, workspace?: WorkspaceIdentity) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  setTabMode: (path: string, mode: "edit" | "diff") => void;
  editContent: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  reloadTab: (path: string) => void;
  overwriteTab: (path: string) => Promise<void>;
  mergeTab: (path: string) => void;
  toggleDir: (path: string) => Promise<void>;
  ensureRootOpen: () => Promise<void>;
  replyPermission: (requestID: string, reply: PermissionReply, sessionID?: string) => Promise<void>;
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
  moveEntry: (path: string, destDir: string) => Promise<void>;
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

const EMPTY_TABS: Tab[] = [];
const EMPTY_AGENT_FILES: Map<string, AgentFileState> = new Map();
const EMPTY_TREE: Record<string, TreeEntry[]> = {};
const EMPTY_EXPANDED: Set<string> = new Set();

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [panels, setPanels] = useState<SessionInfo[]>([]);
  const [activeSessionID, setActiveSessionID] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyBySession, setBusyBySession] = useState<Record<string, boolean>>({});
  const [todosByWorkspace, setTodosByWorkspace] = useState<Record<string, TodoItem[]>>({});
  const [transcriptsBySession, setTranscriptsBySession] = useState<Record<string, TranscriptItem[]>>({});
  const [tabsByWorkspace, setTabsByWorkspace] = useState<Record<string, Tab[]>>({});
  const [activePathByWorkspace, setActivePathByWorkspace] = useState<Record<string, string | null>>({});
  const [agentFilesByWorkspace, setAgentFilesByWorkspace] = useState<Record<string, Map<string, AgentFileState>>>({});
  const [treeByWorkspace, setTreeByWorkspace] = useState<Record<string, Record<string, TreeEntry[]>>>({});
  const [expandedByWorkspace, setExpandedByWorkspace] = useState<Record<string, Set<string>>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recoveryByWorkspace, setRecoveryByWorkspace] = useState<Record<string, RecoveryRecord[]>>({});
  const [modelsByWorkspace, setModelsByWorkspace] = useState<Record<string, ModelOption[]>>({});
  const [currentModelByWorkspace, setCurrentModelByWorkspace] = useState<Record<string, ModelOption | null>>({});
  const [agentsByWorkspace, setAgentsByWorkspace] = useState<Record<string, AgentOption[]>>({});
  const [currentAgentByWorkspace, setCurrentAgentByWorkspace] = useState<Record<string, AgentOption | null>>({});
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

  const activeWorkspaceID = activeSessionID
    ? (panels.find((panel) => panel.id === activeSessionID)?.workspace.id ?? null)
    : null;
  const session = activeWorkspaceID
    ? (panels.find((panel) => panel.workspace.id === activeWorkspaceID) ?? null)
    : null;
  const busy = session ? Boolean(busyBySession[session.id]) : false;
  const todos = session ? (todosByWorkspace[session.workspace.id] ?? []) : [];
  const transcript = session ? transcriptsBySession[session.id] ?? [] : [];
  const sessionUsage = session ? usageBySession[session.id] ?? null : null;
  const tabs = session ? tabsByWorkspace[session.workspace.id] ?? EMPTY_TABS : EMPTY_TABS;
  const activePath = session ? activePathByWorkspace[session.workspace.id] ?? null : null;
  const agentFiles = session ? agentFilesByWorkspace[session.workspace.id] ?? EMPTY_AGENT_FILES : EMPTY_AGENT_FILES;
  const tree = session ? treeByWorkspace[session.workspace.id] ?? EMPTY_TREE : EMPTY_TREE;
  const expanded = session ? expandedByWorkspace[session.workspace.id] ?? EMPTY_EXPANDED : EMPTY_EXPANDED;
  const recoveryRecords = session ? recoveryByWorkspace[session.workspace.id] ?? [] : [];
  const models = session ? modelsByWorkspace[session.workspace.id] ?? [] : [];
  const currentModel = session ? currentModelByWorkspace[session.workspace.id] ?? null : null;
  const agents = session ? agentsByWorkspace[session.workspace.id] ?? [] : [];
  const currentAgent = session ? currentAgentByWorkspace[session.workspace.id] ?? null : null;

  useEffect(() => {
    const open = new Set(panels.map((panel) => panel.id));
    setBusyBySession((current) => {
      const entries = Object.entries(current).filter(([id]) => open.has(id) || id in transcriptsBySession);
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [panels, transcriptsBySession]);

  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const transcriptsBySessionRef = useRef(transcriptsBySession);
  transcriptsBySessionRef.current = transcriptsBySession;
  const agentFilesByWorkspaceRef = useRef(agentFilesByWorkspace);
  agentFilesByWorkspaceRef.current = agentFilesByWorkspace;
  const expandedByWorkspaceRef = useRef(expandedByWorkspace);
  expandedByWorkspaceRef.current = expandedByWorkspace;
  const pendingCreateRef = useRef(pendingCreate);
  pendingCreateRef.current = pendingCreate;
  const pendingRenameRef = useRef(pendingRename);
  pendingRenameRef.current = pendingRename;
  const tabsByWorkspaceRef = useRef(tabsByWorkspace);
  tabsByWorkspaceRef.current = tabsByWorkspace;
  const persistenceRef = useRef<EditorPersistence | null>(null);
  if (!persistenceRef.current) {
    persistenceRef.current = new EditorPersistence((snapshot, write) =>
      window.openshell.writeFile(snapshot.workspace, snapshot.path, snapshot.content, write)
    );
  }
  const persistence = persistenceRef.current;
  const modelsByWorkspaceRef = useRef(modelsByWorkspace);
  modelsByWorkspaceRef.current = modelsByWorkspace;
  const agentsByWorkspaceRef = useRef(agentsByWorkspace);
  agentsByWorkspaceRef.current = agentsByWorkspace;
  const todoKeysRef = useRef<Record<string, string>>({});
  const approvalModeRef = useRef<ApprovalMode>(approvalMode);
  approvalModeRef.current = approvalMode;
  const sessionRef = useRef<SessionInfo | null>(session);
  sessionRef.current = session;
  const requestSeqRef = useRef(0);
  const userActivatedRef = useRef(false);
  const focusSeqRef = useRef(0);

  const panelFor = useCallback(
    (workspace: WorkspaceIdentity): SessionInfo | null =>
      panelsRef.current.find((panel) => sameWorkspace(panel.workspace, workspace)) ?? null,
    []
  );

  const panelForSession = useCallback(
    (sessionID: string): SessionInfo | null =>
      panelsRef.current.find((panel) => panel.id === sessionID) ?? null,
    []
  );

  const workspaceOfSession = useCallback(
    (sessionID: string): WorkspaceIdentity | null =>
      panelsRef.current.find((panel) => panel.id === sessionID)?.workspace ?? null,
    []
  );

  const protectedSessionIDs = useCallback(
    (): Set<string> => new Set(panelsRef.current.map((panel) => panel.id)),
    []
  );

  const setTabsFor = useCallback((workspaceID: string, update: (prev: Tab[]) => Tab[]) => {
    setTabsByWorkspace((current) => {
      const next = update(current[workspaceID] ?? []);
      return next === (current[workspaceID] ?? []) ? current : { ...current, [workspaceID]: next };
    });
  }, []);

  const setActivePathFor = useCallback((workspaceID: string, path: string | null) => {
    setActivePathByWorkspace((current) =>
      current[workspaceID] === path ? current : { ...current, [workspaceID]: path });
  }, []);

  const setAgentFilesFor = useCallback((workspaceID: string, next: Map<string, AgentFileState>) => {
    setAgentFilesByWorkspace((current) =>
      current[workspaceID] === next ? current : { ...current, [workspaceID]: next });
  }, []);

  const setTreeFor = useCallback((workspaceID: string, update: (prev: Record<string, TreeEntry[]>) => Record<string, TreeEntry[]>) => {
    setTreeByWorkspace((current) => {
      const next = update(current[workspaceID] ?? {});
      return next === (current[workspaceID] ?? {}) ? current : { ...current, [workspaceID]: next };
    });
  }, []);

  const setExpandedFor = useCallback((workspaceID: string, next: Set<string>) => {
    setExpandedByWorkspace((current) =>
      current[workspaceID] === next ? current : { ...current, [workspaceID]: next });
  }, []);

  const setRecoveryFor = useCallback((workspaceID: string, records: RecoveryRecord[]) => {
    setRecoveryByWorkspace((current) =>
      current[workspaceID] === records ? current : { ...current, [workspaceID]: records });
  }, []);

  const setTodosFor = useCallback((workspaceID: string, items: TodoItem[]) => {
    setTodosByWorkspace((current) =>
      current[workspaceID] === items ? current : { ...current, [workspaceID]: items });
  }, []);

  const updateSessionTranscript = useCallback(
    (sessionID: string, update: (items: TranscriptItem[]) => TranscriptItem[]) => {
      setTranscriptsBySession((current) => {
        const items = current[sessionID] ?? [];
        const next = update(items);
        return next === items
          ? current
          : retainSessionRecord(current, sessionID, next, protectedSessionIDs());
      });
    },
    [protectedSessionIDs]
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

  const attachPanel = useCallback((info: SessionInfo): void => {
    panelsRef.current = panelsRef.current.some((panel) => panel.workspace.id === info.workspace.id)
      ? panelsRef.current.map((panel) => (panel.workspace.id === info.workspace.id ? info : panel))
      : [...panelsRef.current, info];
    setPanels(panelsRef.current);
  }, []);

  const hydrateTranscript = useCallback(
    async (sessionID: string): Promise<void> => {
      const request = ++requestSeqRef.current;
      try {
        const reopened = await window.openshell.openSessionById(sessionID, request);
        if (!panelForSession(sessionID)) return;
        setTranscriptsBySession((current) => retainSessionRecord(
          current,
          sessionID,
          mergeChatHistory(reopened.transcript, current[sessionID] ?? []),
          protectedSessionIDs()
        ));
        const running = [...reopened.transcript].reverse().find((item) => item.kind === "assistant");
        setBusyBySession((current) => sessionID in current
          ? current
          : {
              ...current,
              [sessionID]: Boolean(running?.kind === "assistant" && !running.completed)
            });
        setTodosFor(reopened.session.workspace.id, reopened.todos);
        if (reopened.usage) {
          setUsageBySession((current) => retainSessionRecord(
            current,
            sessionID,
            reopened.usage!,
            protectedSessionIDs()
          ));
        }
      } catch (err) {
        if (panelForSession(sessionID)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [toast, panelForSession, setTodosFor, protectedSessionIDs]
  );

  const focusSession = useCallback((sessionID: string): void => {
    const panel = panelsRef.current.find((candidate) => candidate.id === sessionID);
    if (!panel) return;
    userActivatedRef.current = true;
    focusSeqRef.current += 1;
    sessionRef.current = panel;
    setActiveSessionID(sessionID);
    setCtxMenu(null);
    setPendingCreate(null);
    setPendingRename(null);
    if (!transcriptsBySessionRef.current[sessionID]) void hydrateTranscript(sessionID);
  }, [hydrateTranscript]);

  const closePanel = useCallback((sessionID: string): void => {
    const closing = panelsRef.current.find((panel) => panel.id === sessionID);
    panelsRef.current = panelsRef.current.filter((panel) => panel.id !== sessionID);
    setPanels(panelsRef.current);
    if (closing) {
      void window.openshell.closeSession(closing.workspace).catch(() => {});
    }
    if (sessionRef.current?.id === sessionID) {
      const neighbor = panelsRef.current[panelsRef.current.length - 1] ?? null;
      sessionRef.current = neighbor;
      setActiveSessionID(neighbor?.id ?? null);
    }
  }, []);

  const loadRecovery = useCallback(async (workspace: WorkspaceIdentity) => {
    try {
      const records = await window.openshell.recoveryRecords(workspace);
      if (panelFor(workspace)) setRecoveryFor(workspace.id, records);
    } catch (error) {
      if (panelFor(workspace)) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    }
  }, [toast, panelFor, setRecoveryFor]);

  const loadModels = useCallback(async (workspace?: WorkspaceIdentity) => {
    const target = workspace ?? sessionRef.current?.workspace;
    if (!target) return;
    try {
      const [list, def, selection] = await Promise.all([
        window.openshell.models(target),
        window.openshell.modelDefault(target),
        window.openshell.sessionSelection(target)
      ]);
      if (!panelFor(target)) return;
      setModelsByWorkspace((prev) => {
        const current = prev[target.id] ?? [];
        if (
          current.length === list.length &&
          current.every(
            (m, i) => m.id === list[i].id && m.providerID === list[i].providerID && m.name === list[i].name
          )
        ) {
          return prev;
        }
        return { ...prev, [target.id]: list };
      });
      setCurrentModelByWorkspace((prev) => {
        const current = prev[target.id] ?? null;
        const pick = selection?.model ?? current ?? def;
        if (!pick) return prev;
        const match = list.find((m) => m.id === pick.id && m.providerID === pick.providerID);
        const next = match ? { ...match, ...(pick.variant ? { variant: pick.variant } : {}) } : pick;
        return prev[target.id] === next ? prev : { ...prev, [target.id]: next };
      });
    } catch (err) {
      if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast, panelFor]);

  const switchModel = useCallback(
    async (id: string, providerID: string, variant?: string, workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      if (!target) return;
      try {
        await window.openshell.switchModel(target, id, providerID, variant);
        if (!panelFor(target)) return;
        const base = modelsByWorkspaceRef.current[target.id]?.find((m) => m.id === id && m.providerID === providerID);
        if (base) setCurrentModelByWorkspace((prev) => ({ ...prev, [target.id]: { ...base, ...(variant ? { variant } : {}) } }));
      } catch (err) {
        if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor]
  );

  const loadAgents = useCallback(async (workspace?: WorkspaceIdentity) => {
    const target = workspace ?? sessionRef.current?.workspace;
    if (!target) return;
    try {
      const [list, selection] = await Promise.all([
        window.openshell.agents(target),
        window.openshell.sessionSelection(target)
      ]);
      if (!panelFor(target)) return;
      setAgentsByWorkspace((prev) => {
        const current = prev[target.id] ?? [];
        if (
          current.length === list.length &&
          current.every((a, i) => a.id === list[i].id && a.name === list[i].name && a.color === list[i].color)
        ) {
          return prev;
        }
        return { ...prev, [target.id]: list };
      });
      setCurrentAgentByWorkspace((prev) => {
        const panel = panelFor(target);
        const id = selection?.agent?.id ?? panel?.agent ?? "build";
        const next = list.find((agent) => agent.id === id) ?? selection?.agent ?? { id, name: id };
        return prev[target.id] === next ? prev : { ...prev, [target.id]: next };
      });
    } catch (err) {
      if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast, panelFor]);

  const switchAgent = useCallback(
    async (id: string, workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      if (!target) return;
      try {
        await window.openshell.switchAgent(target, id);
        if (!panelFor(target)) return;
        const base = agentsByWorkspaceRef.current[target.id]?.find((agent) => agent.id === id);
        if (base) setCurrentAgentByWorkspace((prev) => ({ ...prev, [target.id]: base }));
      } catch (err) {
        if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor]
  );

  const toggleWordWrap = useCallback(() => {
    setWordWrap((prev) => {
      const next = !prev;
      window.localStorage.setItem("wordWrap", next ? "on" : "off");
      return next;
    });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await window.openshell.sessions());
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast]);

  const openSession = useCallback(
    async (dir: string) => {
      const request = ++requestSeqRef.current;
      const focusSeq = focusSeqRef.current;
      try {
        const info = await window.openshell.openSession(dir, request);
        userActivatedRef.current = true;
        attachPanel(info);
        if (focusSeqRef.current === focusSeq) {
          focusSeqRef.current += 1;
          sessionRef.current = info;
          setActiveSessionID(info.id);
        }
        void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels(info.workspace);
        void loadAgents(info.workspace);
        void loadSessions();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [attachPanel, toast, loadModels, loadAgents, loadRecovery, loadSessions]
  );

  const selectFolder = useCallback(async () => {
    const request = ++requestSeqRef.current;
    const focusSeq = focusSeqRef.current;
    try {
      const info = await window.openshell.selectFolder(request);
      if (info) {
        userActivatedRef.current = true;
        attachPanel(info);
        if (focusSeqRef.current === focusSeq) {
          focusSeqRef.current += 1;
          sessionRef.current = info;
          setActiveSessionID(info.id);
        }
        void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels(info.workspace);
        void loadAgents(info.workspace);
        void loadSessions();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [attachPanel, toast, loadModels, loadAgents, loadRecovery, loadSessions]);

  const reopenSession = useCallback(
    async (sessionID: string, silent = false) => {
      const existing = panelForSession(sessionID);
      if (existing) {
        if (!transcriptsBySessionRef.current[sessionID]) void hydrateTranscript(sessionID);
        if (!silent) {
          focusSession(sessionID);
          void loadSessions();
        }
        return;
      }
      const request = ++requestSeqRef.current;
      const focusSeq = focusSeqRef.current;
      try {
        const reopened = await window.openshell.openSessionById(sessionID, request);
        attachPanel(reopened.session);
        if (!silent && focusSeqRef.current === focusSeq) {
          userActivatedRef.current = true;
          focusSeqRef.current += 1;
          sessionRef.current = reopened.session;
          setActiveSessionID(reopened.session.id);
        }
        void loadRecovery(reopened.session.workspace);
        setTranscriptsBySession((current) => retainSessionRecord(
          current,
          reopened.session.id,
          mergeChatHistory(
            reopened.transcript,
            current[reopened.session.id] ?? []
          ),
          protectedSessionIDs()
        ));
        const running = [...reopened.transcript].reverse().find((item) => item.kind === "assistant");
        setBusyBySession((current) => reopened.session.id in current
          ? current
          : {
              ...current,
              [reopened.session.id]: Boolean(running?.kind === "assistant" && !running.completed)
            });
        setTodosFor(reopened.session.workspace.id, reopened.todos);
        if (reopened.usage) {
          setUsageBySession((current) => retainSessionRecord(
            current,
            reopened.session.id,
            reopened.usage!,
            protectedSessionIDs()
          ));
        }
        if (!silent) toast(`Reopened session in ${reopened.session.directory}`);
        void loadModels(reopened.session.workspace);
        void loadAgents(reopened.session.workspace);
        void loadSessions();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [attachPanel, focusSession, panelForSession, setTodosFor, toast, loadModels, loadAgents, loadSessions, loadRecovery, hydrateTranscript, protectedSessionIDs]
  );

  const sendPrompt = useCallback(
    async (text: string, files: PromptFile[] = [], workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      const panel = target ? panelFor(target) : null;
      if (!panel || !target) return;
      const t = text.trim();
      if (!t && files.length === 0) return;
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
      updateSessionTranscript(panel.id, (prev) => [...prev, userItem]);
      setTodosFor(panel.workspace.id, []);
      try {
        await window.openshell.prompt(target, promptText, files);
      } catch (err) {
        if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor, setTodosFor, updateSessionTranscript]
  );

  const runCommand = useCallback(async (name: string, args = "", workspace?: WorkspaceIdentity) => {
    const target = workspace ?? sessionRef.current?.workspace;
    if (!target) return;
    try {
      await window.openshell.runCommand(target, name, args);
    } catch (error) {
      if (panelFor(target)) throw error;
    }
  }, [panelFor]);

  const stop = useCallback(async (workspace?: WorkspaceIdentity) => {
    const target = workspace ?? sessionRef.current?.workspace;
    const panel = target ? panelFor(target) : null;
    if (!panel || !target) return;
    setSessionBusy(panel.id, false);
    await window.openshell.interrupt(target).catch(() => {});
  }, [setSessionBusy, panelFor]);

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
    for (const panel of panels) {
      if (!busyBySession[panel.id]) continue;
      const snapshot = todoSnapshotFromTranscript(transcriptsBySession[panel.id] ?? []);
      if (!snapshot || snapshot.key === todoKeysRef.current[panel.workspace.id]) continue;
      todoKeysRef.current[panel.workspace.id] = snapshot.key;
      setTodosFor(panel.workspace.id, snapshot.todos);
    }
  }, [panels, busyBySession, transcriptsBySession, setTodosFor]);

  const replyPermission = useCallback(
    async (requestID: string, reply: PermissionReply, sessionID?: string) => {
      const sid = sessionID ?? sessionRef.current?.id;
      const panel = sid ? panelForSession(sid) : null;
      if (!panel) return;
      try {
        await window.openshell.permissionReply(panel.workspace, requestID, reply, panel.id);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return;
      }
      updateSessionTranscript(panel.id, (prev) =>
        prev.map((item) =>
          item.kind === "permission" && item.requestID === requestID
            ? { ...item, pending: false, resolvedWith: reply }
            : item
        )
      );
    },
    [toast, panelForSession, updateSessionTranscript]
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
      const target = sessionRef.current?.workspace;
      if (!target) return;
      const current = expandedByWorkspaceRef.current[target.id] ?? new Set<string>();
      const isOpen = current.has(path);
      setExpandedFor(target.id, (() => {
        const next = new Set(current);
        if (isOpen) next.delete(path);
        else next.add(path);
        return next;
      })());
      if (isOpen) return;
      if (!treeByWorkspace[target.id]?.[path]) {
        try {
          const entries = await window.openshell.listDir(target, path);
          if (!panelFor(target)) return;
          setTreeFor(target.id, (prev) => ({ ...prev, [path]: sortEntries(filterEntries(entries)) }));
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [treeByWorkspace, toast, panelFor, setExpandedFor, setTreeFor]
  );

  const ensureRootOpen = useCallback(
    async (): Promise<void> => {
      const target = sessionRef.current?.workspace;
      if (!target) return;
      const current = expandedByWorkspaceRef.current[target.id] ?? new Set<string>();
      const wasOpen = current.has("");
      if (!wasOpen) {
        const next = new Set(current);
        next.add("");
        setExpandedFor(target.id, next);
      }
      if (wasOpen || !treeByWorkspace[target.id]?.[""]) {
        try {
          const entries = await window.openshell.listDir(target, "");
          if (!panelFor(target)) return;
          setTreeFor(target.id, (prev) => ({ ...prev, "": sortEntries(filterEntries(entries)) }));
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [treeByWorkspace, toast, panelFor, setExpandedFor, setTreeFor]
  );

  const refreshTree = useCallback(async (dirs: string[]): Promise<void> => {
    const unique = [...new Set(dirs)];
    const target = sessionRef.current?.workspace;
    if (!target) return;
    const current = expandedByWorkspaceRef.current[target.id] ?? new Set<string>();
    if (current.has("") && !unique.includes("")) unique.push("");
    await Promise.all(
      unique.map(async (dir) => {
        try {
          const entries = await window.openshell.listDir(target, dir);
          if (!panelFor(target)) return;
          setTreeFor(target.id, (prev) => ({ ...prev, [dir]: sortEntries(filterEntries(entries)) }));
        } catch {
          /* keep previous listing */
        }
      })
    );
  }, [panelFor, setTreeFor]);

  const openCtxMenu = useCallback((x: number, y: number, target: TreeEntry | null) => {
    setCtxMenu({ x, y, target });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const startCreate = useCallback((parent: string, kind: "file" | "dir") => {
    setCtxMenu(null);
    setPendingRename(null);
    setPendingCreate({ parent, kind });
    const target = sessionRef.current?.workspace;
    if (!target) return;
    const current = expandedByWorkspaceRef.current[target.id] ?? new Set<string>();
    if (current.has(parent)) return;
    const next = new Set(current);
    next.add(parent);
    setExpandedFor(target.id, next);
  }, [setExpandedFor]);

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
      const target = sessionRef.current?.workspace;
      if (!target) return;
      persistence.cancelPrefix(target, path);
      try {
        await window.openshell.deletePath(target, path);
      } catch (err) {
        if (panelFor(target)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }
      if (!panelFor(target)) return;
      const prefix = `${path}/`;
      setTabsFor(target.id, (prev) => {
        const next = prev.filter((t) => t.path !== path && !t.path.startsWith(prefix));
        if (next.length !== prev.length) {
          setActivePathFor(target.id, (() => {
            const active = activePathByWorkspace[target.id] ?? null;
            if (!active || (active !== path && !active.startsWith(prefix))) return active;
            const idx = prev.findIndex((t) => t.path === active);
            const neighbor = next[idx] ?? next[next.length - 1];
            return neighbor ? neighbor.path : null;
          })());
        }
        return next;
      });
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      void refreshTree(ancestorDirs(parent));
    },
    [toast, refreshTree, persistence, panelFor, setTabsFor, setActivePathFor, activePathByWorkspace]
  );

  const openFile = useCallback(
    async (path: string, opts?: { mode?: "edit" | "diff"; source?: boolean }, workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      if (!target && !opts?.source) return;
      const currentTabs = target ? (tabsByWorkspaceRef.current[target.id] ?? []) : [];
      const existing = currentTabs.find((t) => t.path === path);
      if (existing) {
        if (!target) return;
        setActivePathFor(target.id, path);
        if (opts?.mode && existing.mode !== opts.mode) {
          setTabsFor(target.id, (prev) => prev.map((t) => (t.path === path ? { ...t, mode: opts.mode! } : t)));
        }
        return;
      }
      try {
        const agentFile = target ? (agentFilesByWorkspaceRef.current[target.id] ?? new Map()).get(path) : undefined;
        let content = opts?.source
          ? await window.openshell.readSourceFile(path)
          : target
            ? await window.openshell.readFile(target, path)
            : null;
        if (!opts?.source && !panelFor(target!)) return;
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
        if (!target) return;
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
        setTabsFor(target.id, (prev) => [...prev, tab]);
        setActivePathFor(target.id, path);
      } catch (err) {
        if (target && panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor, setTabsFor, setActivePathFor]
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
      const target = sessionRef.current?.workspace;
      if (!target) return;
      try {
        if (create) {
          const targetPath = create.parent ? `${create.parent}/${trimmed}` : trimmed;
          await (create.kind === "file"
            ? window.openshell.createFile(target, targetPath)
            : window.openshell.createDir(target, targetPath));
          if (!panelFor(target)) return;
          void refreshTree(ancestorDirs(create.parent));
          if (create.kind === "file") void openFile(targetPath, undefined, target);
        } else if (rename) {
          const parent = rename.path.includes("/")
            ? rename.path.slice(0, rename.path.lastIndexOf("/"))
            : "";
          const newPath = parent ? `${parent}/${trimmed}` : trimmed;
          persistence.cancelPrefix(target, rename.path);
          await window.openshell.renamePath(target, rename.path, trimmed);
          if (!panelFor(target)) return;
          setTabsFor(target.id, (prev) =>
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
          setActivePathFor(target.id, (() => {
            const active = activePathByWorkspace[target.id] ?? null;
            return active && (active === rename.path || active.startsWith(`${rename.path}/`))
              ? active.replace(rename.path, newPath)
              : active;
          })());
          setAgentFilesFor(target.id, (() => {
            const current = agentFilesByWorkspaceRef.current[target.id] ?? new Map<string, AgentFileState>();
            const next = new Map<string, AgentFileState>();
            for (const [p, state] of current) {
              if (p === rename.path || p.startsWith(`${rename.path}/`)) {
                next.set(`${newPath}${p.slice(rename.path.length)}`, state);
              } else {
                next.set(p, state);
              }
            }
            return next;
          })());
          void refreshTree(ancestorDirs(parent));
        }
        cancelPending();
      } catch (err) {
        if (panelFor(target)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [toast, openFile, refreshTree, cancelPending, persistence, panelFor, setTabsFor, setActivePathFor, setAgentFilesFor, activePathByWorkspace]
  );

  const moveEntry = useCallback(
    async (path: string, destDir: string) => {
      const target = sessionRef.current?.workspace;
      if (!target) return;
      const name = path.split("/").pop() ?? path;
      const newPath = destDir ? `${destDir}/${name}` : name;
      persistence.cancelPrefix(target, path);
      try {
        await window.openshell.movePath(target, path, destDir);
      } catch (err) {
        if (panelFor(target)) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }
      if (!panelFor(target)) return;
      setTabsFor(target.id, (prev) =>
        prev.map((t) =>
          t.path === path || t.path.startsWith(`${path}/`)
            ? { ...t, path: `${newPath}${t.path.slice(path.length)}`, name: t.path === path ? name : t.name }
            : t
        )
      );
      setActivePathFor(target.id, (() => {
        const active = activePathByWorkspace[target.id] ?? null;
        return active && (active === path || active.startsWith(`${path}/`))
          ? `${newPath}${active.slice(path.length)}`
          : active;
      })());
      setAgentFilesFor(target.id, (() => {
        const current = agentFilesByWorkspaceRef.current[target.id] ?? new Map<string, AgentFileState>();
        const next = new Map<string, AgentFileState>();
        for (const [p, state] of current) {
          if (p === path || p.startsWith(`${path}/`)) {
            if (!state.deleted) next.set(`${newPath}${p.slice(path.length)}`, state);
          } else {
            next.set(p, state);
          }
        }
        return next;
      })());
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      void refreshTree([...ancestorDirs(parent), ...ancestorDirs(destDir)]);
    },
    [toast, refreshTree, persistence, panelFor, setTabsFor, setActivePathFor, setAgentFilesFor, activePathByWorkspace]
  );

  const closeTab = useCallback((path: string) => {
    const target = sessionRef.current?.workspace;
    if (target) persistence.cancelPath(target, path);
    if (!target) return;
    setTabsFor(target.id, (prev) => {
      const next = prev.filter((t) => t.path !== path);
      setActivePathFor(target.id, (() => {
        const active = activePathByWorkspace[target.id] ?? null;
        if (active !== path) return active;
        const idx = prev.findIndex((t) => t.path === path);
        const neighbor = next[idx] ?? next[next.length - 1];
        return neighbor ? neighbor.path : null;
      })());
      return next;
    });
  }, [persistence, setTabsFor, setActivePathFor, activePathByWorkspace]);

  const setActive = useCallback((path: string) => {
    const target = sessionRef.current?.workspace;
    if (target) setActivePathFor(target.id, path);
  }, [setActivePathFor]);

  const setTabMode = useCallback((path: string, mode: "edit" | "diff") => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    setTabsFor(target.id, (prev) => prev.map((t) => (t.path === path ? { ...t, mode } : t)));
  }, [setTabsFor]);

  const doSave = useCallback(
    async (snapshot: SaveSnapshot, allowConflict = false) => {
      const workspaceID = snapshot.workspace.id;
      const current = (tabsByWorkspaceRef.current[workspaceID] ?? []).find((tab) => tab.path === snapshot.path);
      if (!current || (!allowConflict && current.conflict)) return;
      try {
        const result = await persistence.save(snapshot);
        if (result !== "saved") return;
        setTabsFor(workspaceID, (prev) =>
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
    [persistence, toast, setTabsFor]
  );

  const saveTab = useCallback(
    async (path: string) => {
      const target = sessionRef.current?.workspace;
      const tab = target
        ? (tabsByWorkspaceRef.current[target.id] ?? []).find((candidate) => candidate.path === path)
        : undefined;
      if (!target || !tab || tab.conflict) return;
      persistence.cancelTimer(target, path);
      await doSave({
        workspace: target,
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
      const target = sessionRef.current?.workspace;
      const tab = target
        ? (tabsByWorkspaceRef.current[target.id] ?? []).find((candidate) => candidate.path === path)
        : undefined;
      if (!target || !tab || tab.content === content) return;
      const snapshot = {
        workspace: target,
        path,
        content,
        expectedContent: tab.saved,
        revision: tab.revision + 1
      };
      setTabsFor(target.id, (prev) => prev.map((candidate) => candidate.path === path
        ? { ...candidate, content, revision: snapshot.revision, dirty: true }
        : candidate));
      if (!tab.conflict) persistence.schedule(snapshot, (next) => void doSave(next));
    },
    [doSave, persistence, setTabsFor]
  );

  const reloadTab = useCallback((path: string) => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    persistence.cancelPath(target, path);
    setTabsFor(target.id, (prev) => prev.map((tab) => {
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
  }, [persistence, setTabsFor]);

  const overwriteTab = useCallback(async (path: string) => {
    const target = sessionRef.current?.workspace;
    const tab = target
      ? (tabsByWorkspaceRef.current[target.id] ?? []).find((candidate) => candidate.path === path)
      : undefined;
    if (!target || !tab?.conflict) return;
    persistence.cancelTimer(target, path);
    await doSave({
      workspace: target,
      path,
      content: tab.content,
      expectedContent: tab.saved,
      revision: tab.revision,
      overwrite: true
    }, true);
  }, [doSave, persistence]);

  const mergeTab = useCallback((path: string) => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    setTabsFor(target.id, (prev) => prev.map((tab) => tab.path === path && tab.conflict
      ? { ...tab, conflict: { ...tab.conflict, resolution: "merge" } }
      : tab));
  }, [setTabsFor]);

  const openRecovery = useCallback(async (id: string) => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    try {
      await window.openshell.openRecovery(target, id);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }, [toast]);

  const acknowledgeRecovery = useCallback(async (id: string) => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    try {
      await window.openshell.acknowledgeRecovery(target, id);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }, [toast]);

  useEffect(() => {
    const processMessage = (msg: BackendMessage): void => {
      if (msg.kind === "session") {
        if (msg.session) attachPanel(msg.session);
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
        if (msg.recovery && panelFor(msg.recovery.workspace)) {
          setRecoveryFor(msg.recovery.workspace.id, msg.recovery.records);
        }
        return;
      }
      if (msg.kind === "file-update") {
        const f = msg.file!;
        const panel = panelFor(f.workspace);
        if (!panel || f.sessionID !== panel.id) return;
        const origin = persistence.classify(f.workspace, f);
        setAgentFilesFor(f.workspace.id, (() => {
          const current = agentFilesByWorkspaceRef.current[f.workspace.id] ?? new Map<string, AgentFileState>();
          const next = new Map(current);
          next.set(f.path, { baseline: f.baseline, content: f.content, deleted: f.deleted });
          return next;
        })());
        setTabsFor(f.workspace.id, (prev) =>
          prev.map((tab) => {
            if (tab.path !== f.path) return tab;
            if (origin === "echo") return tab;
            if (tab.dirty) {
              persistence.cancelTimer(f.workspace, f.path);
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
        const workspaceExpanded = expandedByWorkspaceRef.current[f.workspace.id] ?? new Set<string>();
        if (parent !== f.path && workspaceExpanded.has(parent)) {
          const expected = f.workspace;
          void window.openshell
            .listDir(expected, parent)
            .then((entries) =>
              panelFor(expected) &&
                setTreeFor(expected.id, (prev) => ({ ...prev, [parent]: sortEntries(filterEntries(entries)) }))
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
      const targetWorkspace = targetSessionID ? workspaceOfSession(targetSessionID) : null;
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
            protectedSessionIDs()
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
          if (active && targetWorkspace) setTodosFor(targetWorkspace.id, []);
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
          if (active && targetWorkspace) setTodosFor(targetWorkspace.id, []);
          break;
        }
        case "todo.updated": {
          if (targetWorkspace) setTodosFor(targetWorkspace.id, normalizeTodos(data.todos));
          break;
        }
        case "session.model.selected": {
          if (!targetWorkspace) break;
          const model = data.model as { id?: string; providerID?: string; variant?: string } | undefined;
          if (model?.id && model.providerID) {
            const modelID = model.id;
            const providerID = model.providerID;
            const match = modelsByWorkspaceRef.current[targetWorkspace.id]?.find(
              (m) => m.id === modelID && m.providerID === providerID
            );
            setCurrentModelByWorkspace((prev) => ({
              ...prev,
              [targetWorkspace.id]: {
                ...(match ?? { id: modelID, providerID, name: modelID }),
                ...(model.variant ? { variant: model.variant } : {})
              }
            }));
          }
          break;
        }
        case "session.agent.selected": {
          if (!targetWorkspace) break;
          const agent = data.agent as string | undefined;
          if (agent) {
            setCurrentAgentByWorkspace((prev) => ({
              ...prev,
              [targetWorkspace.id]: agentsByWorkspaceRef.current[targetWorkspace.id]?.find((a) => a.id === agent) ?? { id: agent, name: agent }
            }));
          }
          break;
        }
        case "agent.updated": {
          if (targetWorkspace) void loadAgents(targetWorkspace);
          else void loadAgents();
          break;
        }
        case "catalog.updated":
        case "models-dev.refreshed": {
          if (targetWorkspace) void loadModels(targetWorkspace);
          else void loadModels();
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
          const panel = targetSessionID ? panelForSession(targetSessionID) : null;
          if (automatic && panel) {
            void window.openshell.permissionReply(panel.workspace, requestID, "once", panel.id);
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

    let healthTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const tryConnect = async (): Promise<void> => {
      if (cancelled) return;
      const ok = await window.openshell.health().catch(() => false);
      if (cancelled) return;
      if (ok) {
        setConnected(true);
        return;
      }
      healthTimer = setTimeout(() => void tryConnect(), 2000);
    };
    void tryConnect();
    void window.openshell.activeSessions().then((list) => {
      void Promise.all(list.map((session) => reopenSession(session.id, true))).then(() => {
        if (!userActivatedRef.current && list.length > 0) {
          const primary = list[list.length - 1];
          focusSession(primary.id);
        }
      });
    });
    return () => {
      cancelled = true;
      if (healthTimer !== null) clearTimeout(healthTimer);
      off();
      if (timer !== null) clearTimeout(timer);
      persistence.cancelAll();
    };
  }, [
    attachPanel,
    focusSession,
    loadModels,
    toggleWordWrap,
    loadAgents,
    loadRecovery,
    reopenSession,
    setSessionBusy,
    updateSessionTranscript,
    panelFor,
    panelForSession,
    workspaceOfSession,
    protectedSessionIDs,
    setTodosFor,
    setRecoveryFor,
    setAgentFilesFor,
    setTabsFor,
    setTreeFor,
    persistence
  ]);

  useEffect(() => {
    if (!connected || !sessionRef.current) return;
    void loadModels();
    void loadAgents();
  }, [connected, loadModels, loadAgents]);

  const panelViews = useMemo<Record<string, PanelView>>(() => {
    const views: Record<string, PanelView> = {};
    for (const panel of panels) {
      views[panel.workspace.id] = {
        session: panel,
        busy: Boolean(busyBySession[panel.id]),
        transcript: transcriptsBySession[panel.id] ?? [],
        todos: todosByWorkspace[panel.workspace.id] ?? [],
        sessionUsage: usageBySession[panel.id] ?? null,
        models: modelsByWorkspace[panel.workspace.id] ?? [],
        currentModel: currentModelByWorkspace[panel.workspace.id] ?? null,
        agents: agentsByWorkspace[panel.workspace.id] ?? [],
        currentAgent: currentAgentByWorkspace[panel.workspace.id] ?? null
      };
    }
    return views;
  }, [
    panels,
    busyBySession,
    transcriptsBySession,
    todosByWorkspace,
    usageBySession,
    modelsByWorkspace,
    currentModelByWorkspace,
    agentsByWorkspace,
    currentAgentByWorkspace
  ]);

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
      panels,
      panelViews,
      activeSessionID,
      focusSession,
      closePanel,
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
      ensureRootOpen,
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
      moveEntry,
      openRecovery,
      acknowledgeRecovery
    }),
    [
      session, connected, busy, todos, transcript, sessionUsage, providerUsage, providerUsageLoading, tabs, activePath, agentFiles, tree, expanded, toasts, recoveryRecords,
      models, currentModel, agents, currentAgent, approvalMode, wordWrap, sessions, panels, panelViews, activeSessionID,
      focusSession, closePanel, openSession, selectFolder, reopenSession, loadSessions, sendPrompt, runCommand, stop, refreshProviderUsage, loadModels, switchModel,
      loadAgents, switchAgent, toggleApprovalMode, toggleWordWrap,
      openFile, closeTab, setActive, setTabMode,
      editContent, saveTab, reloadTab, overwriteTab, mergeTab, toggleDir, ensureRootOpen, replyPermission,
      openCtxMenu, closeCtxMenu, startCreate, startRename, cancelPending, commitName, deleteEntry, moveEntry, openRecovery, acknowledgeRecovery
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

const EMPTY_VIEW: PanelView = {
  session: null,
  busy: false,
  transcript: [],
  todos: [],
  sessionUsage: null,
  models: [],
  currentModel: null,
  agents: [],
  currentAgent: null
};

export function usePanel(workspace: WorkspaceIdentity | null | undefined): PanelView {
  const store = useContext(Ctx);
  if (!store) throw new Error("usePanel must be used within StoreProvider");
  if (!workspace) return EMPTY_VIEW;
  return store.panelViews[workspace.id] ?? EMPTY_VIEW;
}
