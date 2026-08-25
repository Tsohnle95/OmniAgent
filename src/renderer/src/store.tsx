import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  memo,
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
  OpenFileWorkspaceResult,
  PendingPermissionRequest,
  PermissionReply,
  PromptDelivery,
  PromptFile,
  ProviderUsageResult,
  RecoveryRecord,
  RuntimeID,
  RuntimeManifest,
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
import { mergeChatHistory, reconcilePromptHistory, reduceChatStream, type ChatStreamEvent } from "./chat-stream";
import {
  applyChatEvent,
  attachRetryToLatestAssistant,
  completeLatestIncomplete,
  hydrateChatState,
  insertUserMessage,
  projectAssistantItems,
  snapshotChatState,
  buildRateLimitNotice,
  findTurnStartedAt,
  type ChatDirectoryState,
  type ChatStateSnapshot,
  type RateLimitAction
} from "./chat-store";
import {
  emptyStreamingStore,
  touchStreamingSession,
  updateChangedStreamingSessions,
  updateStreamingState,
  type MessageStreamState,
  type StreamingStore
} from "./streaming";
import { IDLE_ACTIVITY, resolveSessionActivity, type SessionActivityResult } from "./session-activity";
import {
  getActiveAssistantContext,
  resolveAssistantStatus,
  type ActiveAssistantModel,
  type FormingSummary,
  type SessionAbortFlag,
  type WorkingSummary
} from "./assistant-status";
import {
  addToQueue,
  clearSending,
  createMessageQueueTarget,
  getMessageQueueKey,
  getQueueForTarget,
  getSendableQueue,
  loadMessageQueueState,
  markSending,
  persistMessageQueueState,
  removeFromQueue,
  reorderQueue,
  popToInput,
  type FollowUpBehavior,
  type MessageQueueState,
  type MessageQueueTarget,
  type QueuedMessage
} from "./message-queue";
import {
  buildQueuedAutoSendPayload,
  createQueuedAutoSendRetryScheduler,
  getAbortHoldUntil,
  getQueuedAutoSendRetryDelayMs,
  isQueuedAutoSendBackedOff,
  resolveQueuedSessionStatusType,
  resolveSessionSendConfig,
  sendQueuedAutoSendPayload,
  shouldDispatchQueuedAutoSend,
  type QueuedAutoSendFailure,
  type QueueStatusType
} from "./queued-auto-send";
import { EditorPersistence, type SaveSnapshot } from "./editor-persistence";
import { requestReveal } from "./reveal";
import { sameWorkspace } from "@shared/generation";
import { retainSessionRecord } from "@shared/retention";
import { createChatStreamPipeline } from "./chat-stream-pipeline";

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

export interface CtxMenuApi {
  ctxMenu: CtxMenuState | null;
  openCtxMenu: (x: number, y: number, target: TreeEntry | null) => void;
  closeCtxMenu: () => void;
}

const CtxMenuContext = createContext<CtxMenuApi | null>(null);

export function useCtxMenu(): CtxMenuApi {
  const ctx = useContext(CtxMenuContext);
  if (!ctx) throw new Error("useCtxMenu must be used within StoreProvider");
  return ctx;
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
  activity: SessionActivityResult;
  assistantStatus: WorkingSummary | null;
  forming: FormingSummary | null;
  activeModel: ActiveAssistantModel | null;
  streaming: MessageStreamState | null;
  turnStartedAt: number | null;
  queuedCount: number;
  queuedMessages: QueuedMessage[];
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
  runtimes: RuntimeManifest[];
  selectedRuntimeID: RuntimeID;
  setSelectedRuntimeID: (runtimeID: RuntimeID) => void;
  busy: boolean;
  todos: TodoItem[];
  transcript: TranscriptItem[];
  sessionUsage: SessionUsage | null;
  providerUsage: ProviderUsageResult[];
  providerUsageLoading: boolean;
  tabs: Tab[];
  activePath: string | null;
  singleFile: string | null;
  agentFiles: Map<string, AgentFileState>;
  tree: Record<string, TreeEntry[]>;
  expanded: Set<string>;
  hiddenPaths: Set<string>;
  toasts: Toast[];
  recoveryRecords: RecoveryRecord[];
  models: ModelOption[];
  currentModel: ModelOption | null;
  agents: AgentOption[];
  currentAgent: AgentOption | null;
  approvalMode: ApprovalMode;
  wordWrap: boolean;
  followUpBehavior: FollowUpBehavior;
  setFollowUpBehavior: (behavior: FollowUpBehavior) => void;
  sessions: SessionSummary[];
  panels: SessionInfo[];
  workspaceOnlyPanelIDs: Set<string>;
  panelViews: Record<string, PanelView>;
  activeSessionID: string | null;
  focusSession: (sessionID: string) => void;
  closePanel: (sessionID: string) => void;
  openSession: (dir: string) => Promise<SessionInfo | null>;
  addModelPanel: (dir: string) => Promise<void>;
  openWorkspacePanel: (dir: string) => Promise<void>;
  selectAddPanel: () => Promise<void>;
  selectFolder: () => Promise<void>;
  selectFile: () => Promise<void>;
  openFileWorkspace: (file: string) => Promise<SessionInfo | null>;
  openExternalPath: (absolutePath: string, workspace?: WorkspaceIdentity) => Promise<string | null>;
  importPaths: (destDir: string, sources: string[]) => Promise<void>;
  dropIntoExplorer: (paths: string[]) => Promise<void>;
  selectPanelDirectory: (workspace: WorkspaceIdentity) => Promise<void>;
  changePanelDirectory: (workspace: WorkspaceIdentity, dir: string) => Promise<void>;
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
  removeQueuedMessage: (workspace: WorkspaceIdentity, messageID: string) => void;
  popQueuedMessage: (workspace: WorkspaceIdentity, messageID: string) => QueuedMessage | null;
  sendQueuedNow: (workspace: WorkspaceIdentity, messageID: string) => Promise<void>;
  reorderQueuedMessage: (workspace: WorkspaceIdentity, fromID: string, toID: string) => void;
  pendingCreate: PendingCreate | null;
  pendingRename: { path: string } | null;
  startCreate: (parent: string, kind: "file" | "dir") => void;
  startRename: (path: string) => void;
  cancelPending: () => void;
  commitName: (name: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  removeFromWorkspace: (path: string) => void;
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

function dropKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function filterEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter((e) => {
    const name = e.path.split("/").pop() ?? e.path;
    if (e.type === "directory") return !HIDDEN_DIRS.has(name);
    return name !== ".DS_Store";
  });
}

const AUX_CHAT_STREAM_TYPES = new Set([
  "session.inbox.enqueued",
  "session.inbox.delivered",
  "session.inbox.cancelled",
  "session.agent.selected",
  "session.model.selected",
  "session.synthetic",
  "session.skill.activated",
  "session.shell.started",
  "session.shell.ended",
  "session.compaction.started",
  "session.compaction.delta",
  "session.compaction.ended",
  "session.compaction.failed"
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

const ACTIVE_CHAT_STREAM_TYPES = new Set([
  "session.step.started",
  "session.text.started",
  "session.text.delta",
  "session.reasoning.started",
  "session.reasoning.delta",
  "session.tool.input.started",
  "session.tool.input.delta",
  "session.tool.called",
  "session.tool.progress",
  "session.retry.scheduled",
  "message.part.delta"
]);

function streamEventShowsActiveWork(event: ChatStreamEvent): boolean {
  if (ACTIVE_CHAT_STREAM_TYPES.has(event.type)) return true;
  if (event.type === "message.updated") {
    const info = (event.data.info ?? event.data) as Record<string, any>;
    const role = String(info.role ?? info.type ?? "assistant");
    return role === "assistant" && !info.time?.completed && !info.finish && !info.error;
  }
  if (event.type === "message.part.updated") {
    const part = (event.data.part ?? event.data) as Record<string, any>;
    const state = part.state as Record<string, any> | undefined;
    const status = String(state?.status ?? "");
    return !part.time?.completed && !["completed", "error", "failed", "success"].includes(status);
  }
  return false;
}

let toastId = 0;

const EMPTY_TABS: Tab[] = [];
const EMPTY_AGENT_FILES: Map<string, AgentFileState> = new Map();
const EMPTY_TREE: Record<string, TreeEntry[]> = {};
const EMPTY_EXPANDED: Set<string> = new Set();
const STREAM_SETTLE_MS = 60_000;
const STREAM_SETTLE_POLL_MS = 1_000;
const ABORT_RESTORE_SUPPRESS_MS = 10_000;
export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const openCtxMenu = useCallback((x: number, y: number, target: TreeEntry | null) => {
    setCtxMenu({ x, y, target });
  }, []);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const ctxMenuApi = useMemo<CtxMenuApi>(
    () => ({ ctxMenu, openCtxMenu, closeCtxMenu }),
    [ctxMenu, openCtxMenu, closeCtxMenu]
  );
  const body = useMemo(() => <StoreBody closeCtxMenu={closeCtxMenu}>{children}</StoreBody>, [children, closeCtxMenu]);
  return (
    <CtxMenuContext.Provider value={ctxMenuApi}>
      {body}
    </CtxMenuContext.Provider>
  );
}

const StoreBody = memo(function StoreBody({ children, closeCtxMenu }: { children: ReactNode; closeCtxMenu: () => void }): ReactNode {
  const [panels, setPanels] = useState<SessionInfo[]>([]);
  const [workspaceOnlyPanelIDs, setWorkspaceOnlyPanelIDs] = useState<Set<string>>(() => new Set());
  const [activeSessionID, setActiveSessionID] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [runtimes, setRuntimes] = useState<RuntimeManifest[]>([]);
  const [selectedRuntimeID, setSelectedRuntimeIDState] = useState<RuntimeID>(() =>
    window.localStorage.getItem("runtimeID") === "deepseek" ? "deepseek" : "opencode"
  );
  const [busyBySession, setBusyBySession] = useState<Record<string, boolean>>({});
  const [todosByWorkspace, setTodosByWorkspace] = useState<Record<string, TodoItem[]>>({});
  const [transcriptsBySession, setTranscriptsBySession] = useState<Record<string, TranscriptItem[]>>({});
  const [tabsByWorkspace, setTabsByWorkspace] = useState<Record<string, Tab[]>>({});
  const [activePathByWorkspace, setActivePathByWorkspace] = useState<Record<string, string | null>>({});
  const [singleFileByWorkspace, setSingleFileByWorkspace] = useState<Record<string, string>>({});
  const [agentFilesByWorkspace, setAgentFilesByWorkspace] = useState<Record<string, Map<string, AgentFileState>>>({});
  const [treeByWorkspace, setTreeByWorkspace] = useState<Record<string, Record<string, TreeEntry[]>>>({});
  const [expandedByWorkspace, setExpandedByWorkspace] = useState<Record<string, Set<string>>>({});
  const [hiddenPathsByWorkspace, setHiddenPathsByWorkspace] = useState<Record<string, Set<string>>>({});
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
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [pendingRename, setPendingRename] = useState<{ path: string } | null>(null);
  const [streamingStore, setStreamingStore] = useState<StreamingStore>(() => emptyStreamingStore());
  const [messageQueue, setMessageQueue] = useState<MessageQueueState>(() => loadMessageQueueState());
  const [autoSendTick, setAutoSendTick] = useState(0);
  const [sessionAbortFlags, setSessionAbortFlags] = useState<Record<string, SessionAbortFlag>>({});

  const activeWorkspaceID = activeSessionID
    ? (panels.find((panel) => panel.id === activeSessionID)?.workspace.id ?? null)
    : null;
  const session = activeWorkspaceID
    ? (panels.find((panel) => panel.workspace.id === activeWorkspaceID) ?? null)
    : null;

  useEffect(() => {
    if (!session) return;
    setHiddenPathsByWorkspace((current) => ({ ...current, [session.workspace.id]: new Set() }));
  }, [session?.directory, session?.workspace.id]);
  const busy = session ? Boolean(busyBySession[session.id]) : false;
  const todos = session ? (todosByWorkspace[session.workspace.id] ?? []) : [];
  const transcript = session ? transcriptsBySession[session.id] ?? [] : [];
  const sessionUsage = session ? usageBySession[session.id] ?? null : null;
  const tabs = session ? tabsByWorkspace[session.workspace.id] ?? EMPTY_TABS : EMPTY_TABS;
  const activePath = session ? activePathByWorkspace[session.workspace.id] ?? null : null;
  const singleFile = session ? singleFileByWorkspace[session.workspace.id] ?? null : null;
  const agentFiles = session ? agentFilesByWorkspace[session.workspace.id] ?? EMPTY_AGENT_FILES : EMPTY_AGENT_FILES;
  const tree = session ? treeByWorkspace[session.workspace.id] ?? EMPTY_TREE : EMPTY_TREE;
  const expanded = session ? expandedByWorkspace[session.workspace.id] ?? EMPTY_EXPANDED : EMPTY_EXPANDED;
  const hiddenPaths = session ? hiddenPathsByWorkspace[session.workspace.id] ?? EMPTY_EXPANDED : EMPTY_EXPANDED;
  const recoveryRecords = session ? recoveryByWorkspace[session.workspace.id] ?? [] : [];
  const models = session ? modelsByWorkspace[session.workspace.id] ?? [] : [];
  const currentModel = session ? currentModelByWorkspace[session.workspace.id] ?? null : null;
  const agents = session ? agentsByWorkspace[session.workspace.id] ?? [] : [];
  const currentAgent = session ? currentAgentByWorkspace[session.workspace.id] ?? null : null;

  const setSelectedRuntimeID = useCallback((runtimeID: RuntimeID): void => {
    setSelectedRuntimeIDState(runtimeID);
    window.localStorage.setItem("runtimeID", runtimeID);
  }, []);

  useEffect(() => {
    const load = window.openshell.runtimes;
    if (typeof load !== "function") return;
    void load().then((items) => {
      setRuntimes(items);
      if (!items.some((item) => item.id === selectedRuntimeID && item.available)) {
        setSelectedRuntimeID("opencode");
      }
    }).catch(() => setRuntimes([]));
  }, [selectedRuntimeID, setSelectedRuntimeID]);

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
  const busyBySessionRef = useRef(busyBySession);
  busyBySessionRef.current = busyBySession;
  const sessionAbortFlagsRef = useRef(sessionAbortFlags);
  sessionAbortFlagsRef.current = sessionAbortFlags;
  const lastStreamActivityRef = useRef<Record<string, number>>({});
  const streamingRef = useRef<StreamingStore>(streamingStore);
  const messageQueueRef = useRef<MessageQueueState>(messageQueue);
  const autoSendInFlightRef = useRef(new Set<string>());
  const autoSendFailuresRef = useRef(new Map<string, QueuedAutoSendFailure>());
  const previousQueueStatusRef = useRef(new Map<string, QueueStatusType>());
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
    persistenceRef.current = new EditorPersistence((snapshot, write) => {
      if (snapshot.standalone) {
        return window.openshell.writeStandalone(snapshot.path, snapshot.content, write.expectedContent, write.overwrite ?? false);
      }
      return window.openshell.writeFile(snapshot.workspace, snapshot.path, snapshot.content, write);
    });
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
  const activationSeqRef = useRef(0);
  const userActivatedRef = useRef(false);
  const focusSeqRef = useRef(0);
  const treeRefreshTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

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

  const setSingleFileFor = useCallback((workspaceID: string, path: string | null) => {
    setSingleFileByWorkspace((current) =>
      current[workspaceID] === path ? current
        : path === null
          ? dropKey(current, workspaceID)
          : { ...current, [workspaceID]: path });
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

  const reconcilePermissions = useCallback(async (): Promise<void> => {
    const panels = panelsRef.current;
    if (panels.length === 0) return;
    const workspaces = new Map<string, WorkspaceIdentity>();
    for (const panel of panels) workspaces.set(panel.workspace.id, panel.workspace);
    const fetched = new Map<string, PendingPermissionRequest[]>();
    await Promise.all([...workspaces.values()].map(async (workspace) => {
      const requests = await window.openshell.listPermissions(workspace).catch(() => []);
      for (const request of requests) {
        const list = fetched.get(request.sessionID) ?? [];
        list.push(request);
        fetched.set(request.sessionID, list);
      }
    }));
    for (const panel of panels) {
      const requests = fetched.get(panel.id) ?? [];
      const liveIDs = new Set(requests.map((request) => request.id));
      updateSessionTranscript(panel.id, (prev) => {
        let changed = false;
        let next = prev;
        for (const request of requests) {
          if (next.some((item) => item.kind === "permission" && item.requestID === request.id)) continue;
          changed = true;
          next = [
            ...next,
            {
              kind: "permission",
              id: request.id,
              requestID: request.id,
              action: request.action,
              resources: request.resources,
              pending: true
            }
          ];
        }
        if (next.some((item) => item.kind === "permission" && item.pending && !liveIDs.has(item.requestID))) {
          changed = true;
          next = next.map((item) =>
            item.kind === "permission" && item.pending && !liveIDs.has(item.requestID)
              ? { ...item, pending: false }
              : item
          );
        }
        return changed ? next : prev;
      });
    }
  }, [updateSessionTranscript]);

  const chatStatesRef = useRef(new Map<string, ChatDirectoryState>());
  const materializingRef = useRef(new Set<string>());
  const swapPendingRef = useRef(false);
  const replacingSessionIDsRef = useRef(new Map<string, number>());

  const chatStateFor = useCallback((sessionID: string): ChatDirectoryState => {
    let state = chatStatesRef.current.get(sessionID);
    if (!state) {
      state = { message: {}, part: {}, session_status: {} };
      chatStatesRef.current.set(sessionID, state);
    }
    return state;
  }, []);

  const applyProjection = useCallback((sessionID: string) => {
    const state = chatStatesRef.current.get(sessionID);
    if (!state) return;
    const projected = projectAssistantItems(state, sessionID);
    updateSessionTranscript(sessionID, (prev) => {
      const pending = new Map(projected.map((item) => [item.id, item] as const));
      const result: TranscriptItem[] = [];
      for (const item of prev) {
        if (item.kind === "assistant") {
          const next = pending.get(item.id);
          if (next) {
            result.push(next);
            pending.delete(item.id);
          }
          continue;
        }
        result.push(item);
      }
      for (const item of projected) {
        if (pending.has(item.id)) result.push(item);
      }
      return result;
    });
  }, [updateSessionTranscript]);

  const commitStreaming = useCallback((next: StreamingStore) => {
    streamingRef.current = next;
    setStreamingStore(next);
  }, []);

  const commitQueue = useCallback((next: MessageQueueState) => {
    messageQueueRef.current = next;
    setMessageQueue(next);
    persistMessageQueueState(next);
  }, []);

  const syncStreaming = useCallback((sessionID: string, previous: ChatStateSnapshot) => {
    const next = updateChangedStreamingSessions(chatStateFor(sessionID), previous, streamingRef.current);
    if (next) commitStreaming(next);
  }, [chatStateFor, commitStreaming]);

  const reconcileStreaming = useCallback((sessionID: string) => {
    const next = updateStreamingState(chatStateFor(sessionID), streamingRef.current);
    if (next) commitStreaming(next);
  }, [chatStateFor, commitStreaming]);

  useEffect(() => {
    const finalizeTrailingAssistant = (sessionID: string): void => {
      completeLatestIncomplete(chatStateFor(sessionID), sessionID);
      applyProjection(sessionID);
      reconcileStreaming(sessionID);
      setSessionBusy(sessionID, false);
    };
    const timer = setInterval(() => {
      const now = Date.now();
      for (const panel of panelsRef.current) {
        const transcript = transcriptsBySessionRef.current[panel.id] ?? [];
        const trailing = [...transcript].reverse().find((item) => item.kind === "assistant");
        if (trailing?.kind !== "assistant" || trailing.completed) continue;
        if (busyBySessionRef.current[panel.id]) {
          if (trailing.retry) continue;
          const lastActivity = lastStreamActivityRef.current[panel.id];
          if (lastActivity === undefined) lastStreamActivityRef.current[panel.id] = now;
          else if (now - lastActivity < STREAM_SETTLE_MS) continue;
        }
        finalizeTrailingAssistant(panel.id);
      }
    }, STREAM_SETTLE_POLL_MS);
    return () => clearInterval(timer);
  }, [chatStateFor, applyProjection, reconcileStreaming, setSessionBusy]);

  const setFollowUpBehavior = useCallback((behavior: FollowUpBehavior) => {
    commitQueue({ ...messageQueueRef.current, followUpBehavior: behavior });
  }, [commitQueue]);

  const queueTargetFor = useCallback((workspace: WorkspaceIdentity): MessageQueueTarget | null => {
    const panel = panelFor(workspace);
    return panel ? createMessageQueueTarget(panel.id, panel.workspace.id) : null;
  }, [panelFor]);

  const removeQueuedMessage = useCallback((workspace: WorkspaceIdentity, messageID: string) => {
    const target = queueTargetFor(workspace);
    if (!target) return;
    commitQueue(removeFromQueue(messageQueueRef.current, target, messageID));
  }, [queueTargetFor, commitQueue]);

  const popQueuedMessage = useCallback((workspace: WorkspaceIdentity, messageID: string): QueuedMessage | null => {
    const target = queueTargetFor(workspace);
    if (!target) return null;
    const popped = popToInput(messageQueueRef.current, target, messageID);
    commitQueue(popped.state);
    return popped.message;
  }, [queueTargetFor, commitQueue]);

  const reorderQueuedMessage = useCallback((workspace: WorkspaceIdentity, fromID: string, toID: string) => {
    const target = queueTargetFor(workspace);
    if (!target) return;
    commitQueue(reorderQueue(messageQueueRef.current, target, fromID, toID));
  }, [queueTargetFor, commitQueue]);

  const materializeSession = useCallback(async (sessionID: string): Promise<void> => {
    const panel = panelForSession(sessionID);
    if (!panel || materializingRef.current.has(sessionID)) return;
    materializingRef.current.add(sessionID);
    try {
      const snapshot = await window.openshell.sessionTranscript(sessionID);
      if (!panelForSession(sessionID)) return;
      hydrateChatState(chatStateFor(sessionID), sessionID, snapshot.transcript);
      applyProjection(sessionID);
      reconcileStreaming(sessionID);
      setTodosFor(panel.workspace.id, snapshot.todos);
    } catch {
    } finally {
      materializingRef.current.delete(sessionID);
    }
  }, [panelForSession, chatStateFor, applyProjection, reconcileStreaming, setTodosFor]);

  const toast = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const sendQueuedNow = useCallback(async (workspace: WorkspaceIdentity, messageID: string): Promise<void> => {
    const panel = panelFor(workspace);
    if (!panel) return;
    const popped = popQueuedMessage(workspace, messageID);
    if (!popped) return;
    const promptText = popped.content || "Review the attached files.";
    const attachments: UserAttachment[] = (popped.attachments ?? []).map((file) => ({
      name: file.path.split(/[\\/]/).pop() ?? file.path
    }));
    updateSessionTranscript(panel.id, (prev) => [
      ...prev,
      {
        kind: "user",
        id: `user-${Date.now()}`,
        text: promptText,
        ...(attachments.length > 0 ? { attachments } : {})
      }
    ]);
    try {
      await window.openshell.prompt(workspace, promptText, popped.attachments ?? []);
    } catch (err) {
      if (panelFor(workspace)) toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [panelFor, popQueuedMessage, updateSessionTranscript, toast]);

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
        const merged = mergeChatHistory(reopened.transcript, transcriptsBySessionRef.current[sessionID] ?? []);
        chatStatesRef.current.delete(sessionID);
        hydrateChatState(chatStateFor(sessionID), sessionID, merged);
        reconcileStreaming(sessionID);
        setTranscriptsBySession((current) => retainSessionRecord(
          current,
          sessionID,
          merged,
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
    [toast, panelForSession, chatStateFor, reconcileStreaming, setTodosFor, protectedSessionIDs]
  );

  const focusSession = useCallback((sessionID: string): void => {
    const panel = panelsRef.current.find((candidate) => candidate.id === sessionID);
    if (!panel) return;
    userActivatedRef.current = true;
    focusSeqRef.current += 1;
    sessionRef.current = panel;
    setActiveSessionID(sessionID);
    closeCtxMenu();
    setPendingCreate(null);
    setPendingRename(null);
    if (!transcriptsBySessionRef.current[sessionID]) void hydrateTranscript(sessionID);
  }, [hydrateTranscript, closeCtxMenu]);

  const closePanel = useCallback((sessionID: string): void => {
    const closing = panelsRef.current.find((panel) => panel.id === sessionID);
    panelsRef.current = panelsRef.current.filter((panel) => panel.id !== sessionID);
    setPanels(panelsRef.current);
    if (closing) {
      const childDirectory = closing.directory.replaceAll("\\", "/").replace(/\/+$/, "");
      setHiddenPathsByWorkspace((current) => {
        let changed = false;
        const next = { ...current };
        for (const panel of panelsRef.current) {
          const parentDirectory = panel.directory.replaceAll("\\", "/").replace(/\/+$/, "");
          if (!childDirectory.startsWith(`${parentDirectory}/`)) continue;
          const relative = childDirectory.slice(parentDirectory.length + 1);
          const paths = current[panel.workspace.id];
          if (!paths?.has(relative)) continue;
          const restored = new Set(paths);
          restored.delete(relative);
          next[panel.workspace.id] = restored;
          changed = true;
        }
        return changed ? next : current;
      });
    }
    setWorkspaceOnlyPanelIDs((current) => {
      if (!current.has(sessionID)) return current;
      const next = new Set(current);
      next.delete(sessionID);
      return next;
    });
    chatStatesRef.current.delete(sessionID);
    materializingRef.current.delete(sessionID);
    if (closing) {
      void window.openshell.closeSession(closing.workspace).catch(() => {});
    }
    if (sessionRef.current?.id === sessionID) {
      const neighbor = panelsRef.current[panelsRef.current.length - 1] ?? null;
      sessionRef.current = neighbor;
      setActiveSessionID(neighbor?.id ?? null);
    }
  }, []);

  const replacePanels = useCallback((next: SessionInfo): void => {
    for (const panel of panelsRef.current) {
      if (panel.id !== next.id) closePanel(panel.id);
    }
    attachPanel(next);
  }, [attachPanel, closePanel]);

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
        if (JSON.stringify(current) === JSON.stringify(list)) {
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
      const panel = panelFor(target);
      const id = selection?.agent?.id ?? panel?.agent ?? "build";
      if (!selection?.agent && list.some((agent) => agent.id === id) && panel?.agent !== id) {
        await window.openshell.switchAgent(target, id);
      }
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

  const swapPanelTo = useCallback((workspace: WorkspaceIdentity, info: SessionInfo): void => {
    const index = panelsRef.current.findIndex((panel) => sameWorkspace(panel.workspace, workspace));
    if (index === -1) {
      void window.openshell.closeSession(info.workspace).catch(() => {});
      return;
    }
    const old = panelsRef.current[index];
    void window.openshell.closeSession(old.workspace).catch(() => {});
    const oldWorkspaceID = old.workspace.id;
    chatStatesRef.current.delete(old.id);
    materializingRef.current.delete(old.id);
    delete todoKeysRef.current[oldWorkspaceID];
    setBusyBySession((current) => dropKey(current, old.id));
    setUsageBySession((current) => dropKey(current, old.id));
    setTranscriptsBySession((current) => dropKey(current, old.id));
    setSessionAbortFlags((current) => dropKey(current, old.id));
    setTodosByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setTabsByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setActivePathByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setSingleFileByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setAgentFilesByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setTreeByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setExpandedByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setRecoveryByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setModelsByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setCurrentModelByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setAgentsByWorkspace((current) => dropKey(current, oldWorkspaceID));
    setCurrentAgentByWorkspace((current) => dropKey(current, oldWorkspaceID));
    panelsRef.current = [
      ...panelsRef.current.slice(0, index),
      info,
      ...panelsRef.current.slice(index + 1).filter((panel) => !sameWorkspace(panel.workspace, info.workspace))
    ];
    setPanels(panelsRef.current);
    userActivatedRef.current = true;
    focusSeqRef.current += 1;
    sessionRef.current = info;
    setActiveSessionID(info.id);
    void hydrateTranscript(info.id);
    void loadRecovery(info.workspace);
    void loadModels(info.workspace);
    void loadAgents(info.workspace);
    void loadSessions();
  }, [setPanels, loadRecovery, loadModels, loadAgents, loadSessions, hydrateTranscript]);

  const openSession = useCallback(
    async (dir: string): Promise<SessionInfo | null> => {
      const request = ++requestSeqRef.current;
      const activation = ++activationSeqRef.current;
      try {
        const info = selectedRuntimeID === "opencode"
          ? await window.openshell.openSession(dir, request)
          : await window.openshell.openSession(dir, request, selectedRuntimeID);
        if (activation !== activationSeqRef.current) {
          await window.openshell.closeSession(info.workspace).catch(() => {});
          return null;
        }
        userActivatedRef.current = true;
        replacePanels(info);
        focusSeqRef.current += 1;
        sessionRef.current = info;
        setActiveSessionID(info.id);
        void hydrateTranscript(info.id);
        void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels(info.workspace);
        void loadAgents(info.workspace);
        void loadSessions();
        return info;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return null;
      }
    },
    [replacePanels, toast, loadModels, loadAgents, loadRecovery, loadSessions, hydrateTranscript, selectedRuntimeID]
  );

  const addModelPanel = useCallback(
    async (dir: string) => {
      const request = ++requestSeqRef.current;
      const activation = activationSeqRef.current;
      try {
        const info = selectedRuntimeID === "opencode"
          ? await window.openshell.openSession(dir, request)
          : await window.openshell.openSession(dir, request, selectedRuntimeID);
        if (activation !== activationSeqRef.current) {
          await window.openshell.closeSession(info.workspace).catch(() => {});
          return;
        }
        const source = dir.replaceAll("\\", "/").replace(/\/+$/, "");
        for (const panel of panelsRef.current) {
          const parent = panel.directory.replaceAll("\\", "/").replace(/\/+$/, "");
          if (!source.startsWith(`${parent}/`)) continue;
          const relative = source.slice(parent.length + 1);
          setHiddenPathsByWorkspace((current) => {
            const next = new Set(current[panel.workspace.id] ?? []);
            next.add(relative);
            return { ...current, [panel.workspace.id]: next };
          });
        }
        attachPanel(info);
        userActivatedRef.current = true;
        focusSeqRef.current += 1;
        sessionRef.current = info;
        setActiveSessionID(info.id);
        void hydrateTranscript(info.id);
        void loadRecovery(info.workspace);
        void loadModels(info.workspace);
        void loadAgents(info.workspace);
        void loadSessions();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [attachPanel, toast, loadModels, loadAgents, loadRecovery, loadSessions, hydrateTranscript, selectedRuntimeID]
  );

  const openWorkspacePanel = useCallback(async (dir: string): Promise<void> => {
    await addModelPanel(dir);
    const opened = sessionRef.current;
    if (!opened) return;
    setWorkspaceOnlyPanelIDs((current) => {
      const next = new Set(current);
      next.add(opened.id);
      return next;
    });
  }, [addModelPanel]);

  const selectAddPanel = useCallback(async () => {
    const request = ++requestSeqRef.current;
    const activation = activationSeqRef.current;
    try {
      const info = selectedRuntimeID === "opencode"
        ? await window.openshell.selectFolder(request)
        : await window.openshell.selectFolder(request, selectedRuntimeID);
      if (!info) return;
      if (activation !== activationSeqRef.current) {
        await window.openshell.closeSession(info.workspace).catch(() => {});
        return;
      }
      attachPanel(info);
      userActivatedRef.current = true;
      focusSeqRef.current += 1;
      sessionRef.current = info;
      setActiveSessionID(info.id);
      void hydrateTranscript(info.id);
      void loadRecovery(info.workspace);
      void loadModels(info.workspace);
      void loadAgents(info.workspace);
      void loadSessions();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [attachPanel, toast, loadModels, loadAgents, loadRecovery, loadSessions, hydrateTranscript, selectedRuntimeID]);

  const swapPanelWorkspace = useCallback(
    async (workspace: WorkspaceIdentity, pick: (request: number) => Promise<SessionInfo | null>) => {
      const request = ++requestSeqRef.current;
      const activation = activationSeqRef.current;
      swapPendingRef.current = true;
      try {
        const info = await pick(request);
        if (!info) return;
        if (activation !== activationSeqRef.current) {
          await window.openshell.closeSession(info.workspace).catch(() => {});
          return;
        }
        swapPanelTo(workspace, info);
      } catch (err) {
        if (panelFor(workspace)) toast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        swapPendingRef.current = false;
      }
    },
    [swapPanelTo, toast, panelFor]
  );

  const selectPanelDirectory = useCallback(
    (workspace: WorkspaceIdentity) =>
      swapPanelWorkspace(workspace, (request) => selectedRuntimeID === "opencode"
        ? window.openshell.selectFolder(request)
        : window.openshell.selectFolder(request, selectedRuntimeID)),
    [swapPanelWorkspace, selectedRuntimeID]
  );

  const changePanelDirectory = useCallback(
    (workspace: WorkspaceIdentity, dir: string) =>
      swapPanelWorkspace(workspace, (request) => selectedRuntimeID === "opencode"
        ? window.openshell.openSession(dir, request)
        : window.openshell.openSession(dir, request, selectedRuntimeID)),
    [swapPanelWorkspace, selectedRuntimeID]
  );

  const selectFolder = useCallback(async () => {
    const request = ++requestSeqRef.current;
    const activation = ++activationSeqRef.current;
    try {
      const info = selectedRuntimeID === "opencode"
        ? await window.openshell.selectFolder(request)
        : await window.openshell.selectFolder(request, selectedRuntimeID);
      if (info) {
        if (activation !== activationSeqRef.current) {
          await window.openshell.closeSession(info.workspace).catch(() => {});
          return;
        }
        userActivatedRef.current = true;
        replacePanels(info);
        focusSeqRef.current += 1;
        sessionRef.current = info;
        setActiveSessionID(info.id);
        void hydrateTranscript(info.id);
        void loadRecovery(info.workspace);
        toast(`Opened ${info.directory}`);
        void loadModels(info.workspace);
        void loadAgents(info.workspace);
        void loadSessions();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [replacePanels, toast, loadModels, loadAgents, loadRecovery, loadSessions, hydrateTranscript, selectedRuntimeID]);

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
      const activation = silent ? 0 : ++activationSeqRef.current;
      if (!silent) {
        replacingSessionIDsRef.current.set(sessionID, (replacingSessionIDsRef.current.get(sessionID) ?? 0) + 1);
      }
      try {
        const reopened = await window.openshell.openSessionById(sessionID, request);
        if (!silent && activation !== activationSeqRef.current) {
          await window.openshell.closeSession(reopened.session.workspace).catch(() => {});
          return;
        }
        if (silent) {
          attachPanel(reopened.session);
        } else {
          replacePanels(reopened.session);
          userActivatedRef.current = true;
          focusSeqRef.current += 1;
          sessionRef.current = reopened.session;
          setActiveSessionID(reopened.session.id);
        }
        void loadRecovery(reopened.session.workspace);
        const merged = mergeChatHistory(
          reopened.transcript,
          transcriptsBySessionRef.current[reopened.session.id] ?? []
        );
        chatStatesRef.current.delete(reopened.session.id);
        hydrateChatState(chatStateFor(reopened.session.id), reopened.session.id, merged);
        reconcileStreaming(reopened.session.id);
        setTranscriptsBySession((current) => retainSessionRecord(
          current,
          reopened.session.id,
          merged,
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
      } finally {
        if (!silent) {
          const pending = replacingSessionIDsRef.current.get(sessionID) ?? 0;
          if (pending <= 1) replacingSessionIDsRef.current.delete(sessionID);
          else replacingSessionIDsRef.current.set(sessionID, pending - 1);
        }
      }
    },
    [attachPanel, replacePanels, focusSession, panelForSession, chatStateFor, reconcileStreaming, setTodosFor, toast, loadModels, loadAgents, loadSessions, loadRecovery, hydrateTranscript, protectedSessionIDs]
  );

  const sendPrompt = useCallback(
    async (text: string, files: PromptFile[] = [], workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      const panel = target ? panelFor(target) : null;
      if (!panel || !target) return;
      const t = text.trim();
      if (!t && files.length === 0) return;
      const promptText = t || "Review the attached files.";
      const transcript = transcriptsBySessionRef.current[panel.id] ?? [];
      const trailingAssistant = [...transcript].reverse().find((item) => item.kind === "assistant");
      const trailingAssistantIncomplete = trailingAssistant?.kind === "assistant" && !trailingAssistant.completed;
      const activity = resolveSessionActivity({
        sessionId: panel.id,
        statusType: trailingAssistantIncomplete && streamingRef.current.streamingMessageIds.get(panel.id)
          ? (trailingAssistant?.kind === "assistant" && trailingAssistant.retry ? "retry" : "busy")
          : undefined,
        trailingAssistantIncomplete,
        pendingPermissions: transcript.filter((item) => item.kind === "permission" && item.pending).length
      });
      const delivery: PromptDelivery | undefined = activity.isWorking
        ? messageQueueRef.current.followUpBehavior
        : undefined;
      if (delivery === "queue") toast(`Queued: ${promptText}`);
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
      insertUserMessage(chatStateFor(panel.id), panel.id, userItem.id, promptText);
      setTodosFor(panel.workspace.id, []);
      setSessionBusy(panel.id, true);
      const applyCanonicalTranscript = (refreshed: Awaited<ReturnType<typeof window.openshell.prompt>>): void => {
        const current = transcriptsBySessionRef.current[panel.id] ?? [];
        const merged = reconcilePromptHistory(refreshed.transcript, current, userItem);
        updateSessionTranscript(panel.id, () => merged);
        lastStreamActivityRef.current[panel.id] = Date.now();
        hydrateChatState(chatStateFor(panel.id), panel.id, merged);
        reconcileStreaming(panel.id);
      };
      try {
        const refreshed = await window.openshell.prompt(target, promptText, files, delivery);
        if (panelFor(target)) applyCanonicalTranscript(refreshed);
      } catch (err) {
        if (panelFor(target)) {
          if (delivery === "queue") {
            const queueTarget = createMessageQueueTarget(panel.id, panel.workspace.id);
            if (queueTarget) {
              commitQueue(addToQueue(messageQueueRef.current, queueTarget, { content: promptText, attachments: files }));
              toast(`Queued locally: ${promptText}`);
              return;
            }
          }
          setSessionBusy(panel.id, false);
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [toast, panelFor, setTodosFor, updateSessionTranscript, setSessionBusy, commitQueue, chatStateFor, reconcileStreaming]
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
    setSessionAbortFlags((current) => ({
      ...current,
      [panel.id]: { timestamp: Date.now(), acknowledged: false }
    }));
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

  const removeFromWorkspace = useCallback((path: string) => {
    const target = sessionRef.current?.workspace;
    if (!target) return;
    const confirmed = window.confirm(`Remove "${path}" from Orbit? The item will remain on disk.`);
    if (!confirmed) return;
    closeCtxMenu();
    setHiddenPathsByWorkspace((current) => {
      const next = new Set(current[target.id] ?? []);
      next.add(path);
      return { ...current, [target.id]: next };
    });
    void window.openshell.detachPath(target, path).then(() => {
      setHiddenPathsByWorkspace((current) => {
        const next = new Set(current[target.id] ?? []);
        next.delete(path);
        return { ...current, [target.id]: next };
      });
      void refreshTree(ancestorDirs(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""));
    }).catch((error) => toast(error instanceof Error ? error.message : String(error), "error"));
  }, [closeCtxMenu, refreshTree, toast]);

  const startCreate = useCallback((parent: string, kind: "file" | "dir") => {
    closeCtxMenu();
    setPendingRename(null);
    setPendingCreate({ parent, kind });
    const target = sessionRef.current?.workspace;
    if (!target) return;
    const current = expandedByWorkspaceRef.current[target.id] ?? new Set<string>();
    if (current.has(parent)) return;
    const next = new Set(current);
    next.add(parent);
    setExpandedFor(target.id, next);
  }, [setExpandedFor, closeCtxMenu]);

  const startRename = useCallback((path: string) => {
    closeCtxMenu();
    setPendingCreate(null);
    setPendingRename({ path });
  }, [closeCtxMenu]);

  const unhidePath = useCallback((path: string): void => {
    const target = sessionRef.current;
    if (!target || !hiddenPathsByWorkspace[target.workspace.id]?.has(path)) return;
    setHiddenPathsByWorkspace((current) => {
      const next = new Set(current[target.workspace.id] ?? []);
      next.delete(path);
      return { ...current, [target.workspace.id]: next };
    });
  }, [hiddenPathsByWorkspace]);

  const cancelPending = useCallback(() => {
    setPendingCreate(null);
    setPendingRename(null);
  }, []);

  const deleteEntry = useCallback(
    async (path: string) => {
      closeCtxMenu();
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
    [toast, refreshTree, persistence, panelFor, setTabsFor, setActivePathFor, activePathByWorkspace, closeCtxMenu]
  );

  const openFile = useCallback(
    async (path: string, opts?: { mode?: "edit" | "diff" }, workspace?: WorkspaceIdentity) => {
      const target = workspace ?? sessionRef.current?.workspace;
      if (!target) return;
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
        let content = await window.openshell.readFile(target, path);
        if (!panelFor(target)) return;
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
        setTabsFor(target.id, (prev) => [...prev, tab]);
        setActivePathFor(target.id, path);
      } catch (err) {
        if (target && panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor, setTabsFor, setActivePathFor]
  );
  const openExternalPath = useCallback(
    async (absolutePath: string, workspace?: WorkspaceIdentity): Promise<string | null> => {
      const target = workspace ?? sessionRef.current?.workspace;
      if (!target) return null;
      try {
        const result = await window.openshell.openExternal(target, absolutePath);
        if (result.kind === "relative") {
          await openFile(result.rel, {}, target);
          return result.rel;
        }
        const path = result.path;
        if ((tabsByWorkspaceRef.current[target.id] ?? []).some((t) => t.path === path)) {
          setActivePathFor(target.id, path);
          return path;
        }
        if (result.content === null) {
          toast(`Could not read ${path}`, "error");
          return null;
        }
        if (result.content.length > MAX_EDITABLE_BYTES) {
          toast(`${path} is too large to open in the editor`, "error");
          return null;
        }
        if (result.content.includes("\u0000")) {
          toast(`${path} is a binary file`, "error");
          return null;
        }
        const name = path.split(/[\\/]/).pop() ?? path;
        const tab: Tab = {
          path,
          name,
          content: result.content,
          saved: result.content,
          baseline: null,
          deleted: false,
          dirty: false,
          stale: false,
          revision: 0,
          conflict: null,
          mode: "edit",
          binary: false,
          standalone: true
        };
        setTabsFor(target.id, (prev) => [...prev, tab]);
        setActivePathFor(target.id, path);
        return path;
      } catch (err) {
        if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
        return null;
      }
    },
    [openFile, toast, panelFor, setTabsFor, setActivePathFor]
  );
  const importPaths = useCallback(
    async (destDir: string, sources: string[]): Promise<void> => {
      const target = sessionRef.current?.workspace;
      if (!target || sources.length === 0) return;
      try {
        const results = await window.openshell.importExternal(target, destDir, sources);
        if (!panelFor(target)) return;
        for (const result of results) {
          if (result.imported) toast(`Imported ${result.rel}`);
          else if (hiddenPathsByWorkspace[target.id]?.has(result.rel)) {
            unhidePath(result.rel);
            continue;
          }
          else if (result.reason === "already exists" || result.reason === "already in the workspace") continue;
          else toast(`Could not import ${result.name}: ${result.reason ?? "unknown"}`, "error");
        }
        void refreshTree([...ancestorDirs(destDir)]);
      } catch (err) {
        if (panelFor(target)) toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast, panelFor, refreshTree, hiddenPathsByWorkspace, unhidePath]
  );
  const dropIntoExplorer = useCallback(
    async (paths: string[]): Promise<void> => {
      if (paths.length === 0) return;
      await importPaths("", paths);
    },
    [importPaths]
  );
  const attachFileWorkspace = useCallback(
    async (result: OpenFileWorkspaceResult, activation: number): Promise<SessionInfo | null> => {
      if (activation !== activationSeqRef.current) {
        await window.openshell.closeSession(result.session.workspace).catch(() => {});
        return null;
      }
      userActivatedRef.current = true;
      replacePanels(result.session);
      focusSeqRef.current += 1;
      sessionRef.current = result.session;
      setActiveSessionID(result.session.id);
      setSingleFileFor(result.session.workspace.id, result.path);
      void hydrateTranscript(result.session.id);
      void loadRecovery(result.session.workspace);
      void loadModels(result.session.workspace);
      void loadAgents(result.session.workspace);
      void loadSessions();
      await openFile(result.path, { mode: "edit" }, result.session.workspace);
      return result.session;
    },
    [replacePanels, setSingleFileFor, hydrateTranscript, loadRecovery, loadModels, loadAgents, loadSessions, openFile]
  );
  const selectFile = useCallback(
    async (): Promise<void> => {
      const request = ++requestSeqRef.current;
      const activation = ++activationSeqRef.current;
      try {
        const result = selectedRuntimeID === "opencode"
          ? await window.openshell.selectFile(request)
          : await window.openshell.selectFile(request, selectedRuntimeID);
        if (!result) return;
        const info = await attachFileWorkspace(result, activation);
        if (info) toast(`Opened ${result.path}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [attachFileWorkspace, toast, selectedRuntimeID]
  );
  const openFileWorkspace = useCallback(
    async (file: string): Promise<SessionInfo | null> => {
      const request = ++requestSeqRef.current;
      const activation = ++activationSeqRef.current;
      try {
        const result = selectedRuntimeID === "opencode"
          ? await window.openshell.openFileWorkspace(file, request)
          : await window.openshell.openFileWorkspace(file, request, selectedRuntimeID);
        const info = await attachFileWorkspace(result, activation);
        if (info) toast(`Opened ${result.path}`);
        return info;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return null;
      }
    },
    [attachFileWorkspace, toast, selectedRuntimeID]
  );
  const openSourceTarget = useCallback(
    async (path: string, line: number): Promise<void> => {
      if (!path.startsWith("/")) return;
      const active = sessionRef.current?.workspace ?? null;
      if (active) {
        const openedPath = await openExternalPath(path, active);
        if (openedPath) requestReveal(openedPath, line);
        return;
      }
      const dir = path.slice(0, path.lastIndexOf("/"));
      if (!dir || dir === path) return;
      const opened = await openSession(dir);
      if (!opened) return;
      const rel = path.slice(dir.length + 1) || path;
      await openFile(rel, { mode: "edit" }, opened.workspace);
      requestReveal(rel, line);
    },
    [openSession, openFile, openExternalPath]
  );

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
          setTreeFor(target.id, (prev) => {
            const current = prev[create.parent] ?? [];
            if (current.some((e) => e.path === targetPath)) return prev;
            const entry: TreeEntry = { path: targetPath, type: create.kind === "file" ? "file" : "directory" };
            return { ...prev, [create.parent]: sortEntries(filterEntries([...current, entry])) };
          });
          if (create.kind === "file") {
            if (!(tabsByWorkspaceRef.current[target.id] ?? []).some((t) => t.path === targetPath)) {
              const name = targetPath.split("/").pop() ?? targetPath;
              const tab: Tab = {
                path: targetPath,
                name,
                content: "",
                saved: "",
                baseline: null,
                deleted: false,
                dirty: false,
                stale: false,
                revision: 0,
                conflict: null,
                mode: "edit",
                binary: false
              };
              setTabsFor(target.id, (prev) => [...prev, tab]);
              setActivePathFor(target.id, targetPath);
            }
          }
          void refreshTree(ancestorDirs(create.parent));
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
    [toast, refreshTree, cancelPending, persistence, panelFor, setTabsFor, setActivePathFor, setAgentFilesFor, setTreeFor, activePathByWorkspace]
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
                  baseline: t.standalone ? t.baseline : (t.baseline ?? { kind: "known", content: snapshot.expectedContent }),
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
        revision: tab.revision,
        standalone: tab.standalone
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
        revision: tab.revision + 1,
        standalone: tab.standalone
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
      overwrite: true,
      standalone: tab.standalone
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
        if (msg.session && !swapPendingRef.current && !replacingSessionIDsRef.current.has(msg.session.id)) {
          attachPanel(msg.session);
        }
        return;
      }
      if (msg.kind === "ui-command") {
        if (msg.command === "toggle-word-wrap") {
          toggleWordWrap();
        } else if (msg.command === "open-source" && typeof msg.path === "string" && typeof msg.line === "number") {
          void openSourceTarget(msg.path, msg.line);
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
          const clean = f.baseline.kind === "known" && (
            (!f.deleted && f.content === f.baseline.content) ||
            (f.deleted && f.baseline.exists === false)
          );
          if (clean) next.delete(f.path);
          else next.set(f.path, { baseline: f.baseline, content: f.content, deleted: f.deleted });
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
          const key = `${expected.id}:${parent}`;
          const existing = treeRefreshTimersRef.current.get(key);
          if (existing) clearTimeout(existing);
          treeRefreshTimersRef.current.set(key, setTimeout(() => {
            treeRefreshTimersRef.current.delete(key);
            void window.openshell
              .listDir(expected, parent)
              .then((entries) =>
                panelFor(expected) &&
                setTreeFor(expected.id, (prev) => ({ ...prev, [parent]: sortEntries(filterEntries(entries)) }))
              )
              .catch(() => {});
          }, 50));
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
      if (type === "session.inbox.delivered" && targetSessionID && typeof data.inboxID === "string") {
        const buffered = (transcriptsBySessionRef.current[targetSessionID] ?? []).find(
          (item) => item.kind === "pending-input" && item.id === data.inboxID
        );
        if (buffered?.kind === "pending-input" && buffered.inputType === "user") {
          insertUserMessage(
            chatStateFor(targetSessionID),
            targetSessionID,
            data.inboxID,
            buffered.text
          );
        }
      }

      if (targetSessionID && AUX_CHAT_STREAM_TYPES.has(type)) {
        updateSessionTranscript(targetSessionID, (prev) => reduceChatStream(prev, streamEvent));
      }

      switch (type) {
        case "session.step.started":
        case "session.step.ended":
        case "session.step.failed":
        case "session.text.started":
        case "session.text.delta":
        case "session.text.ended":
        case "session.reasoning.started":
        case "session.reasoning.delta":
        case "session.reasoning.ended":
        case "session.tool.input.started":
        case "session.tool.input.delta":
        case "session.tool.input.ended":
        case "session.tool.called":
        case "session.tool.progress":
        case "session.tool.success":
        case "session.tool.failed":
        case "session.retry.scheduled":
        case "message.updated":
        case "message.removed":
        case "message.part.updated":
        case "message.part.delta":
        case "message.part.removed": {
          if (!targetSessionID) break;
          const draft = chatStateFor(targetSessionID);
          const previous = snapshotChatState(draft);
          const result = applyChatEvent(draft, targetSessionID, streamEvent);
          if (result === true || (typeof result !== "boolean" && result.changed)) {
            lastStreamActivityRef.current[targetSessionID] = Date.now();
            applyProjection(targetSessionID);
            const abortFlag = sessionAbortFlagsRef.current[targetSessionID];
            const abortPending = Boolean(abortFlag && !abortFlag.acknowledged && Date.now() - abortFlag.timestamp < ABORT_RESTORE_SUPPRESS_MS);
            const sessionStatus = draft.session_status[targetSessionID];
            if (sessionStatus?.type === "idle" || sessionStatus?.type === "error") {
              setSessionBusy(targetSessionID, false);
            } else if (!abortPending && !busyBySessionRef.current[targetSessionID] && streamEventShowsActiveWork(streamEvent)) {
              setSessionBusy(targetSessionID, true);
            }
          }
          const materialization = typeof result === "boolean" ? undefined : result.materialization;
          if (materialization) void materializeSession(materialization.sessionID ?? targetSessionID);
          syncStreaming(targetSessionID, previous);
          if (type === "message.part.delta" || type === "session.text.delta" || type === "session.reasoning.delta" || type === "session.tool.input.delta") {
            const touched = touchStreamingSession(streamingRef.current, targetSessionID);
            if (touched) commitStreaming(touched);
          }
          break;
        }
        case "server.connected":
        case "global.disposed": {
          for (const panel of panelsRef.current) void materializeSession(panel.id);
          void reconcilePermissions();
          break;
        }
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
          if (targetSessionID) {
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            applyChatEvent(draft, targetSessionID, streamEvent);
            syncStreaming(targetSessionID, previous);
            setSessionBusy(targetSessionID, true);
          }
          break;
        }
        case "session.execution.succeeded":
        case "session.execution.failed":
        case "session.execution.interrupted": {
          if (targetSessionID) {
            setSessionBusy(targetSessionID, false);
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            const result = applyChatEvent(draft, targetSessionID, streamEvent);
            if (result === true || (typeof result !== "boolean" && result.changed)) applyProjection(targetSessionID);
            syncStreaming(targetSessionID, previous);
            setSessionAbortFlags((current) => current[targetSessionID]
              ? { ...current, [targetSessionID]: { ...current[targetSessionID], acknowledged: true } }
              : current);
          }
          if (active && targetWorkspace) setTodosFor(targetWorkspace.id, []);
          const ok = type === "session.execution.succeeded";
          if (!ok && targetSessionID) {
            updateSessionTranscript(targetSessionID, (prev) => [
              ...prev,
              {
                kind: "status",
                id: `${streamEvent.id}-end`,
                text: type === "session.execution.interrupted" ? "Interrupted" : "Failed",
                tone: type === "session.execution.interrupted" ? "info" : "error"
              }
            ]);
          }
          break;
        }
        case "session.idle": {
          if (targetSessionID) {
            setSessionBusy(targetSessionID, false);
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            const result = applyChatEvent(draft, targetSessionID, streamEvent);
            if (result === true || (typeof result !== "boolean" && result.changed)) applyProjection(targetSessionID);
            syncStreaming(targetSessionID, previous);
            setSessionAbortFlags((current) => current[targetSessionID]
              ? { ...current, [targetSessionID]: { ...current[targetSessionID], acknowledged: true } }
              : current);
          }
          if (active && targetWorkspace) setTodosFor(targetWorkspace.id, []);
          break;
        }
        case "session.error": {
          if (targetSessionID) {
            setSessionBusy(targetSessionID, false);
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            const result = applyChatEvent(draft, targetSessionID, streamEvent);
            if (result === true || (typeof result !== "boolean" && result.changed)) applyProjection(targetSessionID);
            syncStreaming(targetSessionID, previous);
          }
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
          const status = data.status as { type?: string; attempt?: number; message?: string; next?: number; action?: RateLimitAction } | undefined;
          if (targetSessionID) {
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            applyChatEvent(draft, targetSessionID, streamEvent);
            syncStreaming(targetSessionID, previous);
          }
          if ((status?.type === "busy" || status?.type === "retry") && targetSessionID) {
            lastStreamActivityRef.current[targetSessionID] = Date.now();
          }
          if (status?.type === "busy" && targetSessionID) setSessionBusy(targetSessionID, true);
          if ((status?.type === "idle" || status?.type === "error") && targetSessionID) setSessionBusy(targetSessionID, false);
          if (status?.type === "retry" && targetSessionID) {
            setSessionBusy(targetSessionID, true);
            if (attachRetryToLatestAssistant(chatStateFor(targetSessionID), targetSessionID, {
              attempt: Number(status.attempt ?? 1),
              message: String(status.message ?? "Retrying"),
              next: status.next
            })) {
              applyProjection(targetSessionID);
            }
            if (status.action && Number(status.attempt ?? 1) === 1) {
              const notice = buildRateLimitNotice(status.action, targetSessionID);
              if (notice) {
                updateSessionTranscript(targetSessionID, (prev) => {
                  if (prev.some((item) => item.kind === "status" && item.id === notice.id)) return prev;
                  return [...prev, notice];
                });
              }
            }
          }
          if (targetSessionID) {
            const draft = chatStateFor(targetSessionID);
            const previous = snapshotChatState(draft);
            const result = applyChatEvent(draft, targetSessionID, streamEvent);
            if (result === true || (typeof result !== "boolean" && result.changed)) applyProjection(targetSessionID);
            syncStreaming(targetSessionID, previous);
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
          void reconcilePermissions();
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

    const off = window.openshell.onMessage((msg: BackendMessage) => {
      processMessage(msg);
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
    const permissionTimer = setInterval(() => void reconcilePermissions(), 3000);
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
      clearInterval(permissionTimer);
      if (healthTimer !== null) clearTimeout(healthTimer);
      off();
      persistence.cancelAll();
    };
  }, [
    attachPanel,
    focusSession,
    openSourceTarget,
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
    chatStateFor,
    applyProjection,
    materializeSession,
    reconcilePermissions,
    persistence
  ]);

  useEffect(() => {
    if (!connected || !sessionRef.current) return;
    void loadModels();
    void loadAgents();
  }, [connected, loadModels, loadAgents]);

  const autoSendRetrySchedulerRef = useRef<ReturnType<typeof createQueuedAutoSendRetryScheduler> | null>(null);
  if (!autoSendRetrySchedulerRef.current) {
    autoSendRetrySchedulerRef.current = createQueuedAutoSendRetryScheduler(() => setAutoSendTick((tick) => tick + 1));
  }

  useEffect(() => () => autoSendRetrySchedulerRef.current?.dispose(), []);

  useEffect(() => {
    const dispatchSessionQueue = async (panel: SessionInfo): Promise<void> => {
      const target = createMessageQueueTarget(panel.id, panel.workspace.id);
      if (!target) return;
      const key = getMessageQueueKey(target);
      const queue = messageQueueRef.current.queuedMessages[key] ?? [];
      if (queue.length === 0) return;
      if (autoSendInFlightRef.current.has(key)) return;

      const abortHoldUntil = getAbortHoldUntil(sessionAbortFlags[panel.id]);
      if (abortHoldUntil !== null) {
        autoSendRetrySchedulerRef.current?.schedule(abortHoldUntil);
        return;
      }

      const transcript = transcriptsBySessionRef.current[panel.id] ?? [];
      const trailingAssistant = [...transcript].reverse().find((item) => item.kind === "assistant");
      const currentStatus = resolveQueuedSessionStatusType({
        statusType: streamingStore.streamingMessageIds.get(panel.id)
          ? (trailingAssistant?.kind === "assistant" && trailingAssistant.retry ? "retry" : "busy")
          : undefined,
        trailingAssistantIncomplete: trailingAssistant?.kind === "assistant" && !trailingAssistant.completed
      });
      const previousStatus = previousQueueStatusRef.current.get(key);
      previousQueueStatusRef.current.set(key, currentStatus);
      if (!shouldDispatchQueuedAutoSend(previousStatus, currentStatus, true)) return;

      const sendable = getSendableQueue(messageQueueRef.current, target);
      const payload = buildQueuedAutoSendPayload(sendable, agentsByWorkspaceRef.current[panel.workspace.id] ?? []);
      if (!payload) return;

      const failure = autoSendFailuresRef.current.get(key);
      if (failure && failure.messageId !== payload.queuedMessageId) {
        autoSendFailuresRef.current.delete(key);
      } else if (failure && isQueuedAutoSendBackedOff(failure, payload.queuedMessageId, Date.now())) {
        autoSendRetrySchedulerRef.current?.schedule(failure.nextAttemptAt);
        return;
      }

      const resolved = resolveSessionSendConfig(
        payload.sendConfig?.providerID && payload.sendConfig?.modelID
          ? payload.sendConfig
          : {
              agent: currentAgentByWorkspace[panel.workspace.id]?.name,
              providerID: currentModelByWorkspace[panel.workspace.id]?.providerID,
              modelID: currentModelByWorkspace[panel.workspace.id]?.id,
              variant: currentModelByWorkspace[panel.workspace.id]?.variant
            }
      );
      if (!resolved.providerID || !resolved.modelID) {
        autoSendRetrySchedulerRef.current?.schedule(Date.now() + getQueuedAutoSendRetryDelayMs(1));
        return;
      }

      autoSendInFlightRef.current.add(key);
      commitQueue(markSending(messageQueueRef.current, target, payload.queuedMessageId));
      try {
        await sendQueuedAutoSendPayload(panel.workspace, payload);
        commitQueue(removeFromQueue(messageQueueRef.current, target, payload.queuedMessageId));
        commitQueue(clearSending(messageQueueRef.current, target, payload.queuedMessageId));
      } catch {
        commitQueue(clearSending(messageQueueRef.current, target, payload.queuedMessageId));
        const failures = (failure?.failures ?? 0) + 1;
        const nextAttemptAt = Date.now() + getQueuedAutoSendRetryDelayMs(failures);
        autoSendFailuresRef.current.set(key, { messageId: payload.queuedMessageId, failures, nextAttemptAt });
        autoSendRetrySchedulerRef.current?.schedule(nextAttemptAt);
      } finally {
        autoSendInFlightRef.current.delete(key);
      }
    };
    for (const panel of panelsRef.current) void dispatchSessionQueue(panel);
  }, [streamingStore, messageQueue, transcriptsBySession, busyBySession, autoSendTick, commitQueue, panels, sessionAbortFlags, currentModelByWorkspace, currentAgentByWorkspace]);

  const panelViews = useMemo<Record<string, PanelView>>(() => {
    const views: Record<string, PanelView> = {};
    for (const panel of panels) {
      const transcript = transcriptsBySession[panel.id] ?? [];
      const trailingAssistant = [...transcript].reverse().find((item) => item.kind === "assistant");
      const trailingAssistantIncomplete = trailingAssistant?.kind === "assistant" && !trailingAssistant.completed;
      const pendingPermissions = transcript.filter((item) => item.kind === "permission" && item.pending).length;
      const activity = resolveSessionActivity({
        sessionId: panel.id,
        statusType: panel.id in busyBySession
          ? (busyBySession[panel.id]
              ? (trailingAssistant?.kind === "assistant" && trailingAssistant.retry ? "retry" : "busy")
              : "idle")
          : undefined,
        trailingAssistantIncomplete,
        pendingPermissions
      });
       const streamingID = trailingAssistantIncomplete ? streamingStore.streamingMessageIds.get(panel.id) : null;
      const streaming = streamingID ? streamingStore.messageStreamStates.get(streamingID) ?? null : null;
      const chatState = chatStatesRef.current.get(panel.id);
      const rawMessages = chatState?.message[panel.id] ?? [];
      const rawParts = trailingAssistant?.kind === "assistant"
        ? chatState?.part[trailingAssistant.id] ?? []
        : [];
      const turnStartedAt = activity.isWorking
        ? findTurnStartedAt(
            rawMessages,
            trailingAssistant?.kind === "assistant" ? trailingAssistant.messageID : undefined
          )
        : null;
      const activeContext = getActiveAssistantContext(rawMessages);
      const statusSnapshot = resolveAssistantStatus({
        assistantId: activeContext.assistantId,
        model: activeContext.model,
        activity,
        parts: rawParts,
        pendingPermissions,
        abortFlag: sessionAbortFlags[panel.id] ?? null,
        retryInfo: trailingAssistant?.kind === "assistant" && trailingAssistant.retry
          ? { attempt: trailingAssistant.retry.attempt, next: trailingAssistant.retry.next }
          : null
      });
      const queueTarget = createMessageQueueTarget(panel.id, panel.workspace.id);
      const queuedMessages = queueTarget ? getQueueForTarget(messageQueue, queueTarget) : [];
      views[panel.workspace.id] = {
        session: panel,
        busy: activity.isWorking,
        transcript,
        todos: todosByWorkspace[panel.workspace.id] ?? [],
        sessionUsage: usageBySession[panel.id] ?? null,
        models: modelsByWorkspace[panel.workspace.id] ?? [],
        currentModel: currentModelByWorkspace[panel.workspace.id] ?? null,
        agents: agentsByWorkspace[panel.workspace.id] ?? [],
        currentAgent: currentAgentByWorkspace[panel.workspace.id] ?? null,
        activity,
        assistantStatus: statusSnapshot?.working ?? null,
        forming: statusSnapshot?.forming ?? null,
        activeModel: statusSnapshot?.activeModel ?? null,
        streaming,
        turnStartedAt,
        queuedCount: queuedMessages.length,
        queuedMessages
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
    currentAgentByWorkspace,
    streamingStore,
    messageQueue,
    sessionAbortFlags
  ]);

  const value = useMemo<Store>(
    () => ({
      session,
      connected,
      runtimes,
      selectedRuntimeID,
      setSelectedRuntimeID,
      busy,
      todos,
      transcript,
      sessionUsage,
      providerUsage,
      providerUsageLoading,
      tabs,
      activePath,
      singleFile,
      agentFiles,
      tree,
      expanded,
      hiddenPaths,
      toasts,
      recoveryRecords,
      models,
      currentModel,
      agents,
      currentAgent,
      approvalMode,
      wordWrap,
      followUpBehavior: messageQueue.followUpBehavior,
      setFollowUpBehavior,
      sessions,
      panels,
      workspaceOnlyPanelIDs,
      panelViews,
      activeSessionID,
      focusSession,
      closePanel,
      openSession,
      addModelPanel,
      openWorkspacePanel,
      selectAddPanel,
      selectFolder,
      selectFile,
      openFileWorkspace,
      openExternalPath,
      importPaths,
      dropIntoExplorer,
      selectPanelDirectory,
      changePanelDirectory,
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
      removeQueuedMessage,
      popQueuedMessage,
      sendQueuedNow,
      reorderQueuedMessage,
      pendingCreate,
      pendingRename,
      startCreate,
      startRename,
      cancelPending,
      commitName,
      deleteEntry,
      removeFromWorkspace,
      moveEntry,
      openRecovery,
      acknowledgeRecovery
    }),
    [
      session, connected, runtimes, selectedRuntimeID, setSelectedRuntimeID, busy, todos, transcript, sessionUsage, providerUsage, providerUsageLoading, tabs, activePath, singleFile, agentFiles, tree, expanded, hiddenPaths, toasts, recoveryRecords,
      models, currentModel, agents, currentAgent, approvalMode, wordWrap, messageQueue.followUpBehavior, setFollowUpBehavior, sessions, panels, workspaceOnlyPanelIDs, panelViews, activeSessionID,
      focusSession, closePanel, openSession, addModelPanel, openWorkspacePanel, selectAddPanel, selectFolder, selectFile, openFileWorkspace, openExternalPath, importPaths, dropIntoExplorer, selectPanelDirectory, changePanelDirectory, reopenSession, loadSessions, sendPrompt, runCommand, stop, refreshProviderUsage, loadModels, switchModel,
      loadAgents, switchAgent, toggleApprovalMode, toggleWordWrap,
      openFile, closeTab, setActive, setTabMode,
      editContent, saveTab, reloadTab, overwriteTab, mergeTab, toggleDir, ensureRootOpen, replyPermission,
      startCreate, startRename, cancelPending, commitName, deleteEntry, removeFromWorkspace, moveEntry, openRecovery, acknowledgeRecovery,
      removeQueuedMessage, popQueuedMessage, sendQueuedNow, reorderQueuedMessage,
      pendingCreate, pendingRename
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
});

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
  currentAgent: null,
  activity: IDLE_ACTIVITY,
  assistantStatus: null,
  forming: null,
  activeModel: null,
  streaming: null,
  turnStartedAt: null,
  queuedCount: 0,
  queuedMessages: []
};

export function usePanel(workspace: WorkspaceIdentity | null | undefined): PanelView {
  const store = useContext(Ctx);
  if (!store) throw new Error("usePanel must be used within StoreProvider");
  if (!workspace) return EMPTY_VIEW;
  return store.panelViews[workspace.id] ?? EMPTY_VIEW;
}
