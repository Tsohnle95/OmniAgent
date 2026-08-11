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
  BackendMessage,
  ModelOption,
  PermissionReply,
  SessionInfo,
  Tab,
  ToolCallView,
  TranscriptItem,
  TreeEntry
} from "@shared/types";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

interface Store {
  session: SessionInfo | null;
  connected: boolean;
  busy: boolean;
  transcript: TranscriptItem[];
  tabs: Tab[];
  activePath: string | null;
  agentFiles: Map<string, AgentFileState>;
  tree: Record<string, TreeEntry[]>;
  expanded: Set<string>;
  toasts: Toast[];
  models: ModelOption[];
  currentModel: ModelOption | null;
  openSession: (dir: string) => Promise<void>;
  selectFolder: () => Promise<void>;
  sendPrompt: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  loadModels: () => Promise<void>;
  switchModel: (id: string, providerID: string) => Promise<void>;
  openFile: (path: string, opts?: { mode?: "edit" | "diff" }) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  setTabMode: (path: string, mode: "edit" | "diff") => void;
  editContent: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  toggleDir: (path: string) => Promise<void>;
  replyPermission: (requestID: string, reply: PermissionReply) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const HIDDEN_DIRS = new Set([
  ".git", "node_modules", ".next", ".venv", "__pycache__", ".cache", ".turbo", ".svn", ".hg", ".nx"
]);

const MAX_EDITABLE_BYTES = 4 * 1024 * 1024;

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

function toolTitle(input: unknown): string {
  if (!input || typeof input !== "object") return "tool";
  const o = input as Record<string, unknown>;
  if (typeof o.tool === "string" && o.tool) return o.tool;
  if (typeof o.name === "string" && o.name) return o.name;
  if ("command" in o) return "bash";
  if ("filePath" in o || "file_path" in o) return "file";
  if ("query" in o) return "search";
  if ("url" in o) return "web";
  if ("prompt" in o) return "prompt";
  return "tool";
}

function toolDetail(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.filePath === "string") return o.filePath;
  if (typeof o.file_path === "string") return o.file_path;
  if (typeof o.command === "string") return `$ ${o.command}`;
  return "";
}

function outputSummary(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output;
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.content === "string") return o.content;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    if (typeof o.output === "string") return o.output;
    try {
      return JSON.stringify(o, null, 2);
    } catch {
      return String(output);
    }
  }
  return String(output);
}

let toastId = 0;

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [agentFiles, setAgentFiles] = useState<Map<string, AgentFileState>>(new Map());
  const [tree, setTree] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelOption | null>(null);

  const agentFilesRef = useRef(agentFiles);
  agentFilesRef.current = agentFiles;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const expectedRef = useRef<Map<string, string>>(new Map());
  const lastAssistantRef = useRef<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toolNamesRef = useRef<Map<string, string>>(new Map());
  const toolInputsRef = useRef<Map<string, string>>(new Map());
  const modelsRef = useRef<ModelOption[]>([]);
  modelsRef.current = models;

  const toast = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const resetAll = useCallback(() => {
    setBusy(false);
    setTranscript([]);
    setTabs([]);
    setActivePath(null);
    setAgentFiles(new Map());
    setTree({});
    setExpanded(new Set());
    agentFilesRef.current = new Map();
    lastAssistantRef.current = null;
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const list = await window.openshell.models();
      setModels(list);
      setCurrentModel((cur) => {
        if (!cur) return null;
        return (
          list.find((m) => m.id === cur.id && m.providerID === cur.providerID) ??
          cur
        );
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [toast]);

  const switchModel = useCallback(
    async (id: string, providerID: string) => {
      try {
        await window.openshell.switchModel(id, providerID);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [toast]
  );

  const upsertTool = useCallback((id: string, patch: Partial<ToolCallView>) => {
    setTranscript((prev) => {
      const idx = prev.findIndex((i) => i.kind === "tool" && i.tool.id === id);
      if (idx === -1) {
        return [
          ...prev,
          {
            kind: "tool",
            tool: { id, title: "tool", detail: "", status: "running", ...patch }
          }
        ];
      }
      return prev.map((item) =>
        item.kind === "tool" && item.tool.id === id
          ? { ...item, tool: { ...item.tool, ...patch } }
          : item
      );
    });
  }, []);

  const openSession = useCallback(
    async (dir: string) => {
      try {
        const info = await window.openshell.openSession(dir);
        resetAll();
        setSession(info);
        toast(`Opened ${info.directory}`);
        void loadModels();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [resetAll, toast, loadModels]
  );

  const selectFolder = useCallback(async () => {
    try {
      const info = await window.openshell.selectFolder();
      if (info) {
        resetAll();
        setSession(info);
        toast(`Opened ${info.directory}`);
        void loadModels();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [resetAll, toast, loadModels]);

  const sendPrompt = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || !session) return;
      const userItem: TranscriptItem = { kind: "user", id: `user-${Date.now()}`, text: t };
      setTranscript((prev) => [...prev, userItem]);
      try {
        await window.openshell.prompt(t);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [session, toast]
  );

  const stop = useCallback(async () => {
    setBusy(false);
    await window.openshell.interrupt().catch(() => {});
  }, []);

  const replyPermission = useCallback(
    async (requestID: string, reply: PermissionReply) => {
      try {
        await window.openshell.permissionReply(requestID, reply);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
      setTranscript((prev) =>
        prev.map((item) =>
          item.kind === "permission" && item.requestID === requestID
            ? { ...item, pending: false }
            : item
        )
      );
    },
    [toast]
  );

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
        try {
          const entries = await window.openshell.listDir(path);
          setTree((prev) => ({ ...prev, [path]: sortEntries(filterEntries(entries)) }));
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "error");
        }
      }
    },
    [expanded, tree, toast]
  );

  const openFile = useCallback(
    async (path: string, opts?: { mode?: "edit" | "diff" }) => {
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActivePath(path);
        if (opts?.mode && existing.mode !== opts.mode) {
          setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, mode: opts.mode! } : t)));
        }
        return;
      }
      try {
        const agentFile = agentFilesRef.current.get(path);
        let content = await window.openshell.readFile(path);
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
          mode: opts?.mode ?? "edit",
          binary: false
        };
        expectedRef.current.set(path, content);
        setTabs((prev) => [...prev, tab]);
        setActivePath(path);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [tabs, toast]
  );

  const closeTab = useCallback((path: string) => {
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
  }, []);

  const setActive = useCallback((path: string) => setActivePath(path), []);

  const setTabMode = useCallback((path: string, mode: "edit" | "diff") => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, mode } : t)));
  }, []);

  const doSave = useCallback(
    async (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return;
      try {
        await window.openshell.writeFile(path, tab.content);
        expectedRef.current.set(path, tab.content);
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? { ...t, saved: tab.content, dirty: false, stale: false, baseline: tab.content }
              : t
          )
        );
      } catch (err) {
        toast(`Failed to save ${path}: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
    [tabs, toast]
  );

  const saveTab = useCallback(
    async (path: string) => {
      const timer = saveTimers.current.get(path);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(path);
      await doSave(path);
    },
    [doSave]
  );

  const editContent = useCallback(
    (path: string, content: string) => {
      if (expectedRef.current.get(path) === content) return;
      expectedRef.current.set(path, content);
      setTabs((prev) =>
        prev.map((t) => (t.path === path && t.content !== content ? { ...t, content, dirty: true } : t))
      );
      const existing = saveTimers.current.get(path);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        path,
        setTimeout(() => {
          saveTimers.current.delete(path);
          void doSave(path);
        }, 900)
      );
    },
    [doSave]
  );

  useEffect(() => {
    const off = window.openshell.onMessage((msg: BackendMessage) => {
      if (msg.kind === "session") {
        setSession(msg.session ?? null);
        resetAll();
        if (msg.session) void loadModels();
        return;
      }
      if (msg.kind === "file-update") {
        const f = msg.file!;
        setAgentFiles((prev) => {
          const next = new Map(prev);
          next.set(f.path, { baseline: f.baseline, content: f.content, deleted: f.deleted });
          agentFilesRef.current = next;
          return next;
        });
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.path !== f.path) return tab;
            if (tab.dirty) {
              return { ...tab, baseline: f.baseline, stale: true, deleted: f.deleted };
            }
            const content = f.content ?? tab.content;
            expectedRef.current.set(f.path, content);
            return {
              ...tab,
              content,
              saved: content,
              baseline: f.baseline,
              deleted: f.deleted,
              stale: false
            };
          })
        );
        const parent = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        if (parent !== f.path && expandedRef.current.has(parent)) {
          void window.openshell
            .listDir(parent)
            .then((entries) =>
              setTree((prev) => ({ ...prev, [parent]: sortEntries(filterEntries(entries)) }))
            )
            .catch(() => {});
        }
        return;
      }
      if (msg.kind !== "event") return;
      const evt = msg.data as Record<string, any>;
      const data = evt?.data as Record<string, any> | undefined;
      if (!data) return;
      if (data.sessionID && session && data.sessionID !== session.id) return;
      const type = msg.type ?? "";

      switch (type) {
        case "session.execution.started": {
          setBusy(true);
          setTranscript((prev) => [
            ...prev,
            { kind: "divider", id: String(evt.id) },
            { kind: "status", id: `${evt.id}-start`, text: "Working…", tone: "info" }
          ]);
          break;
        }
        case "session.execution.succeeded":
        case "session.execution.failed":
        case "session.execution.interrupted": {
          setBusy(false);
          const ok = type === "session.execution.succeeded";
          setTranscript((prev) => [
            ...prev,
            {
              kind: "status",
              id: `${evt.id}-end`,
              text: ok ? "Completed" : type === "session.execution.interrupted" ? "Interrupted" : "Failed",
              tone: ok ? "success" : "error"
            }
          ]);
          break;
        }
        case "session.idle": {
          setBusy(false);
          break;
        }
        case "session.text.started": {
          const messageID = data.assistantMessageID as string;
          if (lastAssistantRef.current !== messageID) {
            lastAssistantRef.current = messageID;
            setTranscript((prev) => [
              ...prev,
              { kind: "assistant", id: messageID, messageID, text: "", reasoning: "", reasoningOpen: false }
            ]);
          }
          break;
        }
        case "session.text.delta": {
          const messageID = data.assistantMessageID as string;
          const delta = String(data.delta ?? "");
          setTranscript((prev) => {
            if (lastAssistantRef.current !== messageID) {
              lastAssistantRef.current = messageID;
              return [
                ...prev,
                {
                  kind: "assistant",
                  id: messageID,
                  messageID,
                  text: delta,
                  reasoning: "",
                  reasoningOpen: false
                }
              ];
            }
            return prev.map((item) =>
              item.kind === "assistant" && item.messageID === messageID
                ? { ...item, text: item.text + delta }
                : item
            );
          });
          break;
        }
        case "session.reasoning.started": {
          const messageID = data.assistantMessageID as string;
          if (lastAssistantRef.current !== messageID) {
            lastAssistantRef.current = messageID;
            setTranscript((prev) => [
              ...prev,
              { kind: "assistant", id: messageID, messageID, text: "", reasoning: "", reasoningOpen: false }
            ]);
          }
          break;
        }
        case "session.reasoning.delta": {
          const messageID = data.assistantMessageID as string;
          const delta = String(data.delta ?? "");
          setTranscript((prev) =>
            prev.map((item) =>
              item.kind === "assistant" && item.messageID === messageID
                ? { ...item, reasoning: item.reasoning + delta }
                : item
            )
          );
          break;
        }
        case "session.tool.input.started": {
          const id = String(data.id);
          const name = String(data.name ?? "");
          if (name) toolNamesRef.current.set(id, name);
          upsertTool(id, { title: name || "tool" });
          break;
        }
        case "session.tool.input.delta": {
          const id = String(data.id);
          const delta = String(data.delta ?? "");
          if (!delta) break;
          const acc = (toolInputsRef.current.get(id) ?? "") + delta;
          toolInputsRef.current.set(id, acc);
          upsertTool(id, { input: acc });
          break;
        }
        case "session.tool.called": {
          const input = data.input;
          const id = String(data.id);
          const name = toolNamesRef.current.get(id);
          const title = name ?? toolTitle(input);
          const detail = toolDetail(input);
          upsertTool(id, {
            title,
            status: "running",
            ...(detail ? { detail } : {})
          });
          break;
        }
        case "session.tool.success":
        case "session.tool.failed": {
          const id = String(data.id);
          const ok = type === "session.tool.success";
          const output = ok ? outputSummary(data.output) : outputSummary(data.error ?? "Tool failed");
          upsertTool(id, { status: ok ? "success" : "failed", output });
          break;
        }
        case "session.model.selected": {
          const model = data.model as { id?: string; providerID?: string; variant?: string } | undefined;
          if (model?.id && model.providerID) {
            setCurrentModel(
              modelsRef.current.find(
                (m) => m.id === model.id && m.providerID === model.providerID
              ) ?? { id: model.id, providerID: model.providerID, name: model.id }
            );
          }
          break;
        }
        case "session.status": {
          const status = data.status as { type?: string } | undefined;
          if (status?.type === "error") {
            setTranscript((prev) => [
              ...prev,
              { kind: "status", id: `${evt.id}-err`, text: "Session error", tone: "error" }
            ]);
          }
          break;
        }
        case "permission.asked": {
          const requestID = String(data.id);
          setTranscript((prev) =>
            prev.some((i) => i.kind === "permission" && i.requestID === requestID)
              ? prev
              : [
                  ...prev,
                  {
                    kind: "permission",
                    id: requestID,
                    requestID,
                    action: String(data.action ?? "unknown"),
                    resources: Array.isArray(data.resources) ? data.resources.map(String) : [],
                    pending: true
                  }
                ]
          );
          break;
        }
        case "permission.replied": {
          const requestID = String(data.id);
          setTranscript((prev) =>
            prev.map((item) =>
              item.kind === "permission" && item.requestID === requestID
                ? { ...item, pending: false }
                : item
            )
          );
          break;
        }
      }
    });

    void window.openshell.health().then(setConnected);
    void window.openshell.state().then((s) => {
      if (s) setSession(s);
    });
    return off;
  }, [session, resetAll, loadModels, upsertTool]);

  const value = useMemo<Store>(
    () => ({
      session,
      connected,
      busy,
      transcript,
      tabs,
      activePath,
      agentFiles,
      tree,
      expanded,
      toasts,
      models,
      currentModel,
      openSession,
      selectFolder,
      sendPrompt,
      stop,
      loadModels,
      switchModel,
      openFile,
      closeTab,
      setActive,
      setTabMode,
      editContent,
      saveTab,
      toggleDir,
      replyPermission
    }),
    [
      session, connected, busy, transcript, tabs, activePath, agentFiles, tree, expanded, toasts,
      models, currentModel,
      openSession, selectFolder, sendPrompt, stop, loadModels, switchModel,
      openFile, closeTab, setActive, setTabMode,
      editContent, saveTab, toggleDir, replyPermission
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
