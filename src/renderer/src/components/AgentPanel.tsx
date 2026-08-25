import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePanel, useStore } from "../store";
import { OpenCodeLiveActivity, OpenCodeTimeline, PermissionPrompt } from "./OpenCodeTimeline";
import { FormPrompt } from "./FormPrompt";
import { QueuedMessageChips } from "./QueuedMessageChips";
import { OpenCodeTodoDock } from "./OpenCodeTodoDock";
import type { ModelOption, PromptFile, ProviderUsageCredits, ProviderUsageResult, SessionInfo, TranscriptItem, WorkspaceIdentity } from "@shared/types";
import { sameWorkspace } from "@shared/generation";
import { droppedFilePaths, isExternalFileDrag } from "../drop";
import {
  IconAdd,
  IconArrowLeft,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCollapse,
  IconDashboard,
  IconEye,
  IconEyeClosed,
  IconFile,
  IconFolderOpen,
  IconGear,
  IconGitBranch,
  IconImage,
  IconMic,
  IconRefresh,
  IconShield,
  IconStarFilled,
  IconStop,
  IconTerminal
} from "./icons";

function useModelGroups(models: ModelOption[]): [string, ModelOption[]][] {
  return useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const m of models) {
      const arr = map.get(m.providerID) ?? [];
      arr.push(m);
      map.set(m.providerID, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([provider, list]) => [
        provider,
        list.sort((a, b) => a.name.localeCompare(b.name))
      ]) as [string, ModelOption[]][];
  }, [models]);
}
function modelKey(model: ModelOption): string {
  return `${model.providerID}::${model.id}`;
}

interface TriggerMatch {
  kind: "command" | "mention";
  start: number;
  query: string;
}

interface CompletionItem {
  label: string;
  detail?: string;
  insert: string;
  path?: string;
}

interface CompletionState {
  kind: "command" | "mention";
  start: number;
  query: string;
  items: CompletionItem[];
  selected: number;
}

function detectTrigger(value: string, caret: number, spans: { start: number; end: number }[]): TriggerMatch | null {
  const before = value.slice(0, caret);
  const command = /(^|\n)(\/)(\S*)$/.exec(before);
  if (command) return { kind: "command", start: command.index + command[1].length, query: command[3] };
  const mention = /(^|\s)(@)(\S*)$/.exec(before);
  if (!mention) return null;
  const start = mention.index + mention[1].length;
  if (spans.some((span) => start < span.end && caret > span.start)) return null;
  return { kind: "mention", start, query: mention[3] };
}

function mentionSpans(value: string, list: { rel: string }[]): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const mention of list) {
    const token = `@${mention.rel}`;
    const idx = value.indexOf(token);
    if (idx >= 0) spans.push({ start: idx, end: idx + token.length });
  }
  return spans;
}

function filterCompletionItems(items: CompletionItem[], query: string): CompletionItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().includes(q));
}

function buildPromptFiles(text: string, list: { rel: string; path: string }[]): PromptFile[] {
  const files: PromptFile[] = [];
  for (const mention of list) {
    const token = `@${mention.rel}`;
    const idx = text.indexOf(token);
    if (idx >= 0) files.push({ path: mention.path, mention: { start: idx, end: idx + token.length, text: token } });
  }
  return files;
}

function readModelKeys(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function writeModelKeys(storageKey: string, keys: Set<string>): void {
  window.localStorage.setItem(storageKey, JSON.stringify([...keys]));
}

type MenuKind = "model" | "agent" | "add" | null;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico", "tiff", "tif"]);

function isImagePath(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

interface VoiceResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface VoiceResultEvent {
  resultIndex: number;
  results: ArrayLike<VoiceResult>;
}

interface VoiceRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

type VoiceRecognitionConstructor = new () => VoiceRecognition;

type VoiceWindow = Window & {
  SpeechRecognition?: VoiceRecognitionConstructor;
  webkitSpeechRecognition?: VoiceRecognitionConstructor;
};

function formatVariant(variant: string | undefined): string {
  if (!variant) return "Auto";
  return variant
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}k`;
  return String(count);
}

function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost > 0) return `$${cost.toFixed(4)}`;
  return "$0.00";
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatPlan(plan: string): string {
  return plan
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Self Serve Business", "Self-serve Business");
}

function formatResets(resetsAt: number): string {
  const remainingMs = resetsAt * 1000 - Date.now();
  if (remainingMs <= 0) return "resets any moment";
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `resets in ${days}d ${remHours}h` : `resets in ${days}d`;
  }
  const rem = minutes % 60;
  return rem > 0 ? `resets in ${hours}h ${rem}m` : `resets in ${hours}h`;
}

function windowTone(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 60) return "warn";
  return "ok";
}

function contextTone(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 85) return "danger";
  if (percent >= 60) return "warn";
  return "ok";
}

function formatCredits(credits: ProviderUsageCredits): string {
  if (credits.unlimited) return "Unlimited";
  if (credits.used != null && credits.total != null) {
    return `${formatCount(credits.used)} / ${formatCount(credits.total)}`;
  }
  if (credits.remaining != null) return formatCount(credits.remaining);
  return credits.balance ?? "";
}

function formatTurnElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function TurnTimer({ startedAt }: { startedAt: number | null }): ReactNode {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return null;
  return (
    <span className="agent-turn-timer" title="Time since the current turn's prompt was sent">
      <span className="agent-turn-timer-dot" />
      {formatTurnElapsed(Date.now() - startedAt)}
    </span>
  );
}

function ProviderUsageCard({ result }: { result: ProviderUsageResult }): ReactNode {
  const snapshot = result.snapshot;
  return (
    <div className="usage-provider">
      <div className="usage-provider-head">
        <span className="usage-provider-name">{result.displayName}</span>
        {snapshot?.planType && <span className="usage-provider-plan">{formatPlan(snapshot.planType)}</span>}
        <span className={`usage-provider-dot ${result.status}`} title={result.error?.message ?? result.status} />
      </div>
      {!snapshot && result.error && <div className="usage-provider-error">{result.error.message}</div>}
      {snapshot?.windows.map((window) => (
        <div className="usage-window" key={window.id}>
          <div className="usage-window-row">
            <span className="usage-window-label">{window.label}</span>
            <span className="usage-window-value">{Math.round(window.usedPercent)}%</span>
          </div>
          <div className="usage-window-bar">
            <div
              className={`usage-window-fill ${windowTone(window.usedPercent)}`}
              style={{ width: `${Math.min(100, Math.max(0, window.usedPercent))}%` }}
            />
          </div>
          {window.resetsAt && <div className="usage-window-reset">{formatResets(window.resetsAt)}</div>}
        </div>
      ))}
      {snapshot?.credits && (snapshot.credits.hasCredits || snapshot.credits.unlimited || snapshot.credits.used != null || snapshot.credits.remaining != null) && (
        <div className="usage-credits">
          <span className="usage-credits-label">{snapshot.credits.label ?? "Credits"}</span>
          <span className="usage-credits-value">{formatCredits(snapshot.credits)}</span>
        </div>
      )}
      {!snapshot && !result.error && (
        <div className="usage-provider-error">No usage data reported for this provider.</div>
      )}
    </div>
  );
}

export function Composer({ session }: { session?: SessionInfo | null }): ReactNode {
  const store = useStore();
  const {
    approvalMode,
    toggleApprovalMode,
    switchModel,
    switchAgent,
    loadAgents,
    loadModels,
    sendPrompt,
    runCommand,
    stop
  } = store;
  const activeSession = session === undefined ? store.session : session;
  const runtime = (store.runtimes ?? []).find((item) => item.id === (activeSession?.runtimeID ?? "opencode"));
  const supportsAttachments = runtime?.capabilities.attachments ?? activeSession?.runtimeID !== "deepseek";
  const supportsCommands = runtime?.capabilities.commands ?? activeSession?.runtimeID !== "deepseek";
  const supportsAgents = runtime?.capabilities.agents ?? activeSession?.runtimeID !== "deepseek";
  const supportsPermissions = runtime?.capabilities.permissions ?? activeSession?.runtimeID !== "deepseek";
  const workspace = activeSession?.workspace ?? null;
  const view = usePanel(workspace);
  const { models, currentModel, agents, currentAgent, busy, assistantStatus } = view;
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => readModelKeys("favoriteModels"));
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(() => readModelKeys("hiddenModels"));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modelView, setModelView] = useState<"list" | "settings" | "strength">("list");
  const [mentions, setMentions] = useState<{ rel: string; path: string }[]>([]);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const candidatesRef = useRef<{ kind: "command" | "mention"; items: CompletionItem[] } | null>(null);
  const fetchSeqRef = useRef(0);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRef = useRef<WorkspaceIdentity | null>(workspace);
  workspaceRef.current = workspace;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<VoiceRecognition | null>(null);
  const groups = useModelGroups(models);
  const visibleModels = useMemo(
    () =>
      models.filter(
        (model) =>
          !hiddenModels.has(modelKey(model)) ||
          (currentModel?.id === model.id && currentModel?.providerID === model.providerID)
      ),
    [models, hiddenModels, currentModel]
  );
  const visibleGroups = useModelGroups(visibleModels);
  const favoriteList = useMemo(
    () =>
      models
        .filter((model) => favorites.has(modelKey(model)) && !hiddenModels.has(modelKey(model)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [models, favorites, hiddenModels]
  );
  const canSend = input.trim().length > 0 || files.length > 0;
  const variantLabel = currentModel?.variant
    ? formatVariant(currentModel.variant)
    : currentModel?.variants && currentModel.variants.length > 0
      ? "Auto"
      : "";

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent): void => {
      if (!composerRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => () => voiceRef.current?.stop(), []);
  useEffect(
    () => () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    },
    []
  );

  useEffect(() => {
    fetchSeqRef.current += 1;
    candidatesRef.current = null;
    setCompletion(null);
    setFiles([]);
    setPreviews({});
    setMentions([]);
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
  }, [activeSession?.workspace.id, activeSession?.workspace.generation]);

  const send = (): void => {
    if (!canSend) return;
    const text = input.trim();
    const command = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text);
    if (command && supportsCommands) {
      void runCommand(command[1], command[2] ?? "", workspace ?? undefined).catch((err) =>
        setNotice(err instanceof Error ? err.message : String(err))
      );
      setInput("");
      setFiles([]);
      setPreviews({});
      setMentions([]);
      setCompletion(null);
      const el = inputRef.current;
      if (el) {
        el.style.removeProperty("--composer-input-height");
        el.focus();
      }
      return;
    }
    const promptFiles: PromptFile[] = [
      ...buildPromptFiles(text, mentions),
      ...files.map((file) => ({ path: file.path }))
    ];
    void sendPrompt(text, promptFiles, workspace ?? undefined);
    setInput("");
    setFiles([]);
    setPreviews({});
    setMentions([]);
    setCompletion(null);
    const el = inputRef.current;
    if (el) {
      el.style.removeProperty("--composer-input-height");
      el.focus();
    }
  };

  const loadPreview = async (path: string): Promise<void> => {
    if (!isImagePath(path)) return;
    try {
      const dataUrl = await window.openshell.readImagePreview(path);
      if (!dataUrl) return;
      setPreviews((current) => ({ ...current, [path]: dataUrl }));
    } catch {
      return;
    }
  };

  const addAttachmentPaths = (paths: string[]): void => {
    if (!supportsAttachments) return;
    if (paths.length === 0) return;
    setFiles((current) => {
      const next = [...current];
      for (const filePath of paths) {
        if (!next.some((file) => file.path === filePath)) {
          next.push({ path: filePath, name: filePath.split(/[\\/]/).pop() ?? filePath });
        }
      }
      return next;
    });
    for (const filePath of paths) void loadPreview(filePath);
    inputRef.current?.focus();
  };

  const attachFiles = async (): Promise<void> => {
    setNotice("");
    const workspace = workspaceRef.current;
    if (!workspace) return;
    let paths: string[];
    try {
      paths = await window.openshell.selectFiles();
    } catch (err) {
      if (!sameWorkspace(workspace, workspaceRef.current)) return;
      setNotice(err instanceof Error ? err.message : "Files could not be attached.");
      return;
    }
    if (!sameWorkspace(workspace, workspaceRef.current)) return;
    addAttachmentPaths(paths);
  };

  const attachImages = async (): Promise<void> => {
    setNotice("");
    const workspace = workspaceRef.current;
    if (!workspace) return;
    let paths: string[];
    try {
      paths = await window.openshell.selectImages();
    } catch (err) {
      if (!sameWorkspace(workspace, workspaceRef.current)) return;
      setNotice(err instanceof Error ? err.message : "Images could not be attached.");
      return;
    }
    if (!sameWorkspace(workspace, workspaceRef.current)) return;
    addAttachmentPaths(paths);
  };

  const onComposerDragOver = (e: React.DragEvent): void => {
    if (!supportsAttachments || !isExternalFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const onComposerDragLeave = (e: React.DragEvent): void => {
    if (composerRef.current?.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const onComposerDrop = (e: React.DragEvent): void => {
    if (!supportsAttachments || !isExternalFileDrag(e)) return;
    e.preventDefault();
    setDragOver(false);
    addAttachmentPaths(droppedFilePaths(e));
  };

  const toggleVoice = (): void => {
    if (voiceRef.current) {
      voiceRef.current.stop();
      voiceRef.current = null;
      setVoiceActive(false);
      return;
    }
    const voiceWindow = window as VoiceWindow;
    const Constructor = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setNotice("Voice input is unavailable in this build.");
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language;
    recognition.onresult = (event) => {
      const words: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index]?.isFinal) words.push(event.results[index][0].transcript);
      }
      if (words.length > 0) {
        setInput((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${words.join(" ")}`);
      }
    };
    recognition.onerror = () => {
      setNotice("Voice input stopped.");
      setVoiceActive(false);
      voiceRef.current = null;
    };
    recognition.onend = () => {
      setVoiceActive(false);
      voiceRef.current = null;
    };
    try {
      recognition.start();
      voiceRef.current = recognition;
      setVoiceActive(true);
      setNotice("");
    } catch {
      setNotice("Voice input could not start.");
    }
  };

  const chooseModel = (model: ModelOption): void => {
    void switchModel(model.id, model.providerID, currentModel?.id === model.id ? currentModel.variant : undefined, workspace ?? undefined);
    setMenu(null);
  };

  const chooseVariant = (variant?: string): void => {
    if (!currentModel) return;
    void switchModel(currentModel.id, currentModel.providerID, variant, workspace ?? undefined);
    setMenu(null);
  };

  const cycleAgent = (): void => {
    if (agents.length === 0) return;
    const index = agents.findIndex((agent) => agent.id === currentAgent?.id);
    void switchAgent(agents[(index + 1) % agents.length].id, workspace ?? undefined);
  };

  const cycleFavorite = (): void => {
    if (favoriteList.length === 0) return;
    const index = favoriteList.findIndex(
      (model) => model.id === currentModel?.id && model.providerID === currentModel?.providerID
    );
    chooseModel(favoriteList[(index + 1) % favoriteList.length]);
  };

  const cycleStrength = (): void => {
    const variants = currentModel?.variants;
    if (!currentModel || !variants || variants.length === 0) return;
    const options: (string | undefined)[] = [undefined, ...variants];
    const index = options.findIndex((option) => option === currentModel.variant);
    void switchModel(currentModel.id, currentModel.providerID, options[(index + 1) % options.length], workspace ?? undefined);
  };

  const openCandidates = async (kind: "command" | "mention", query: string, start: number): Promise<void> => {
    const seq = ++fetchSeqRef.current;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    if (kind === "command") {
      try {
        const raw = await window.openshell.commands(workspace);
        if (fetchSeqRef.current !== seq || !sameWorkspace(workspace, workspaceRef.current)) return;
        const items: CompletionItem[] = raw.map((c) => ({
          label: c.name,
          detail: c.description,
          insert: c.name
        }));
        candidatesRef.current = { kind, items };
        setCompletion({ kind, start, query, items: filterCompletionItems(items, query), selected: 0 });
      } catch {
        if (!sameWorkspace(workspace, workspaceRef.current)) return;
        candidatesRef.current = null;
        setCompletion(null);
      }
      return;
    }
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const raw = await window.openshell.references(workspace, query);
          if (fetchSeqRef.current !== seq || !sameWorkspace(workspace, workspaceRef.current)) return;
          const items: CompletionItem[] = raw.map((r) => ({
            label: r.rel,
            detail: r.description ?? r.name,
            insert: r.rel,
            path: r.path
          }));
          setCompletion({ kind, start, query, items: filterCompletionItems(items, query), selected: 0 });
        } catch {
          if (!sameWorkspace(workspace, workspaceRef.current)) return;
          setCompletion(null);
        }
      })();
    }, query ? 200 : 0);
  };

  const applyCompletion = (index?: number): void => {
    const c = completion;
    if (!c || c.items.length === 0) return;
    const item = c.items[Math.min(index ?? c.selected, c.items.length - 1)];
    const spanEnd = c.start + 1 + c.query.length;
    const rest = input.slice(spanEnd);
    if (c.kind === "command") {
      setInput("");
      setCompletion(null);
      void runCommand(item.insert, rest.trim(), workspace ?? undefined).catch((err) =>
        setNotice(err instanceof Error ? err.message : String(err))
      );
      return;
    }
    if (!item.path) return;
    const filePath = item.path;
    const prefix = input.slice(0, c.start);
    const next = `${prefix}@${item.insert}${rest}`;
    setInput(next);
    setMentions((prev) => [
      ...prev.filter((mnt) => mnt.rel !== item.insert),
      { rel: item.insert, path: filePath }
    ]);
    setCompletion(null);
    const el = inputRef.current;
    if (el) {
      el.focus();
      const pos = prefix.length + 1 + item.insert.length;
      el.setSelectionRange(pos, pos);
    }
  };

  const toggleFavorite = (model: ModelOption): void => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = modelKey(model);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeModelKeys("favoriteModels", next);
      return next;
    });
  };

  const toggleModelVisible = (model: ModelOption): void => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      const key = modelKey(model);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeModelKeys("hiddenModels", next);
      return next;
    });
  };

  const toggleCollapsed = (provider: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  return (
    <div
      className="composer"
      ref={composerRef}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
    >
      {files.length > 0 && (
        <div className="composer-attachments">
          {files.map((file) => (
            <span className="composer-attachment" key={file.path}>
              {previews[file.path] ? (
                <img className="composer-attachment-thumb" src={previews[file.path]} alt="" />
              ) : (
                <IconFile />
              )}
              <span>{file.name}</span>
              <button
                className="composer-attachment-remove"
                title={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((item) => item.path !== file.path))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={`composer-body ${dragOver ? "drag-over" : ""}`}>
        {dragOver && (
          <div className="composer-drop-hint">
            <IconImage />
            Drop images to attach
          </div>
        )}
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={1}
          placeholder="Ask anything, / for commands, @ for context..."
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            e.target.style.setProperty("--composer-input-height", "0px");
            e.target.style.setProperty("--composer-input-height", `${e.target.scrollHeight}px`);
            const caret = e.target.selectionStart ?? value.length;
            const detected = detectTrigger(value, caret, mentionSpans(value, mentions));
            const trigger = detected && ((detected.kind === "command" && supportsCommands) || (detected.kind === "mention" && supportsAttachments))
              ? detected
              : null;
            if (!trigger) {
              setCompletion(null);
              return;
            }
            if (candidatesRef.current?.kind === trigger.kind) {
              setCompletion({
                kind: trigger.kind,
                start: trigger.start,
                query: trigger.query,
                items: filterCompletionItems(candidatesRef.current.items, trigger.query),
                selected: 0
              });
            } else {
              void openCandidates(trigger.kind, trigger.query, trigger.start);
            }
          }}
          onKeyDown={(e) => {
            if (completion && completion.items.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCompletion((c) => (c ? { ...c, selected: (c.selected + 1) % c.items.length } : c));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCompletion((c) => (c ? { ...c, selected: (c.selected - 1 + c.items.length) % c.items.length } : c));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                applyCompletion();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCompletion(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
              return;
            }
            if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            const key = e.key.toLowerCase();
            if (key === "tab") {
              e.preventDefault();
              e.stopPropagation();
              cycleAgent();
            } else if (key === "p") {
              e.preventDefault();
              e.stopPropagation();
              cycleFavorite();
            } else if (key === "s") {
              e.preventDefault();
              e.stopPropagation();
              cycleStrength();
            }
          }}
        />
        <div className="composer-actions">
          {supportsAttachments && <button
              className={`composer-icon-button ${menu === "add" ? "active" : ""}`}
              title="Add attachments"
              aria-expanded={menu === "add"}
              onClick={() => setMenu(menu === "add" ? null : "add")}
            >
              <IconAdd />
            </button>}
          {supportsPermissions && <button
              className={`composer-approval ${approvalMode === "approve" ? "active" : ""}`}
              aria-pressed={approvalMode === "approve"}
              title={approvalMode === "approve" ? "Automatically allow permission requests once" : "Ask before allowing permission requests"}
              onClick={toggleApprovalMode}
            >
              <IconShield />
            </button>}
          {supportsAgents && <button
            className={`composer-icon-button microphone ${voiceActive ? "active" : ""}`}
            title={voiceActive ? "Stop voice input" : "Use voice input"}
            aria-pressed={voiceActive}
            onClick={toggleVoice}
          >
            <IconMic />
          </button>}
          <button
            className={`composer-send ${busy ? "stop" : ""}`}
            title={busy ? (assistantStatus?.statusText ?? "Stop the agent") : canSend ? "Send (Enter)" : "Type a prompt first"}
            disabled={!busy && !canSend}
            onClick={busy ? () => void stop(workspace ?? undefined) : send}
          >
            {busy ? <IconStop /> : <IconArrowUp />}
          </button>
        </div>
        <div className="composer-chips">
          <button
            className={`composer-selector ${menu === "agent" ? "open" : ""}`}
            title="Change agent"
            onClick={() => {
              if (menu === "agent") {
                setMenu(null);
                return;
              }
              setMenu("agent");
              if (agents.length === 0) void loadAgents(workspace ?? undefined);
            }}
          >
            <IconGitBranch />
            <span>{currentAgent?.name ?? "Agent"}</span>
            <IconChevronDown />
          </button>
          <button
            className={`composer-selector model ${menu === "model" && modelView !== "strength" ? "open" : ""}`}
            title="Change model and response strength"
            onClick={() => {
              setMenu(menu === "model" ? null : "model");
              if (menu !== "model") setModelView("list");
              if (menu !== "model" && models.length === 0) void loadModels(workspace ?? undefined);
            }}
          >
            <span>{currentModel?.name ?? "Model"}{variantLabel ? ` ${variantLabel}` : ""}</span>
            <IconChevronDown />
          </button>
          {currentModel?.variants && currentModel.variants.length > 0 && (
            <button
              className={`composer-selector strength ${menu === "model" && modelView === "strength" ? "open" : ""}`}
              title="Change response strength"
              onClick={() => {
                if (menu === "model" && modelView === "strength") {
                  setMenu(null);
                  return;
                }
                setMenu("model");
                setModelView("strength");
              }}
            >
              <span>{variantLabel}</span>
              <IconChevronDown />
            </button>
          )}
        </div>
      </div>

      {notice && <div className="composer-notice">{notice}</div>}

      {workspace && (
        <QueuedMessageChips
          workspace={workspace}
          onEditMessage={(content, attachments) => {
            setInput(content);
            const restored = attachments.map((file) => ({ path: file.path, name: file.path.split(/[\\/]/).pop() ?? file.path }));
            setFiles(restored);
            for (const file of restored) void loadPreview(file.path);
          }}
        />
      )}

      {completion && completion.items.length > 0 && (
        <div className="composer-completions">
          <div className="composer-completions-head">
            {completion.kind === "command" ? "Commands" : "Mention files"}
          </div>
          {completion.items.map((item, index) => (
            <button
              key={`${completion.kind}:${item.label}`}
              className={`composer-menu-item ${index === completion.selected ? "selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applyCompletion(index);
              }}
            >
              {completion.kind === "command" ? <IconTerminal /> : <IconFile />}
              <span className="composer-completion-label">{item.label}</span>
              {item.detail && <span className="composer-completion-detail">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}

      {supportsAttachments && menu === "add" && (
        <div className="composer-menu add">
          <button
            className="composer-menu-item"
            title="Attach files"
            onClick={() => {
              setMenu(null);
              void attachFiles();
            }}
          >
            <IconFile />
            Attach files…
          </button>
          <button
            className="composer-menu-item"
            title="Upload images"
            onClick={() => {
              setMenu(null);
              void attachImages();
            }}
          >
            <IconImage />
            Upload images…
          </button>
        </div>
      )}

      {menu && menu !== "add" && (
        <div className="composer-menu">
          {menu === "agent" ? (
            agents.length > 0 ? (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`composer-menu-item ${currentAgent?.id === agent.id ? "selected" : ""}`}
                  onClick={() => {
                    void switchAgent(agent.id, workspace ?? undefined);
                    setMenu(null);
                  }}
                >
                  <span className="composer-menu-check">{currentAgent?.id === agent.id ? <IconCheck /> : ""}</span>
                  {agent.name}
                </button>
              ))
            ) : (
              <div className="composer-menu-empty">No agents available.</div>
            )
          ) : (
            <>
              <div className="composer-menu-header">
                <span className="composer-menu-title">
                  {modelView === "settings" ? "Model settings" : modelView === "strength" ? "Response strength" : "Model selection"}
                </span>
                {modelView === "settings" || modelView === "strength" ? (
                  <button
                    className="composer-menu-tool"
                    title="Back to model list"
                    onClick={() => setModelView("list")}
                  >
                    <IconArrowLeft />
                  </button>
                ) : (
                  <button
                    className="composer-menu-tool"
                    title="Choose which models appear here"
                    onClick={() => setModelView("settings")}
                  >
                    <IconGear />
                  </button>
                )}
              </div>
              {modelView === "settings" ? (
                <div className="composer-menu-settings">
                  {groups.map(([provider, list]) => (
                    <div key={provider} className="composer-menu-group">
                      <div className="composer-menu-head">{provider}</div>
                      {list.map((model) => {
                        const visible = !hiddenModels.has(modelKey(model));
                        return (
                          <button
                            key={`${model.id}::${model.providerID}`}
                            className={`composer-menu-item ${visible ? "" : "dimmed"}`}
                            onClick={() => toggleModelVisible(model)}
                          >
                            <span className="composer-menu-check">
                              {visible ? <IconEye /> : <IconEyeClosed />}
                            </span>
                            {model.name}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : modelView === "strength" ? (
                <div className="composer-menu-group variant-menu">
                  <button className="composer-menu-item" onClick={() => chooseVariant()}>
                    <span className="composer-menu-check">{!currentModel?.variant ? <IconCheck /> : ""}</span>
                    Auto
                  </button>
                  {currentModel?.variants?.map((variant) => (
                    <button
                      key={variant}
                      className={`composer-menu-item ${currentModel.variant === variant ? "selected" : ""}`}
                      onClick={() => chooseVariant(variant)}
                    >
                      <span className="composer-menu-check">{currentModel.variant === variant ? <IconCheck /> : ""}</span>
                      {formatVariant(variant)}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {favoriteList.length > 0 && (
                    <div className="composer-menu-group">
                      <div className="composer-menu-head">
                        <IconStarFilled />
                        Favorites
                      </div>
                      {favoriteList.map((model) => (
                        <button
                          key={`fav::${model.id}::${model.providerID}`}
                          className={`composer-menu-item ${currentModel?.id === model.id && currentModel?.providerID === model.providerID ? "selected" : ""}`}
                          onClick={() => chooseModel(model)}
                        >
                          <span className="composer-menu-check">
                            {currentModel?.id === model.id && currentModel?.providerID === model.providerID ? <IconCheck /> : ""}
                          </span>
                          {model.name}
                          <span
                            className="composer-menu-star on"
                            title="Remove from favorites"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(model);
                            }}
                          >
                            ★
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {visibleGroups.map(([provider, list]) => (
                    <div key={provider} className="composer-menu-group">
                      <button
                        className="composer-menu-head"
                        title={collapsed.has(provider) ? `Expand ${provider}` : `Collapse ${provider}`}
                        onClick={() => toggleCollapsed(provider)}
                      >
                        {collapsed.has(provider) ? <IconChevronRight /> : <IconChevronDown />}
                        {provider}
                      </button>
                      {!collapsed.has(provider) &&
                        list.map((model) => {
                          const isFavorite = favorites.has(modelKey(model));
                          return (
                            <button
                              key={`${model.id}::${model.providerID}`}
                              className={`composer-menu-item ${currentModel?.id === model.id && currentModel?.providerID === model.providerID ? "selected" : ""}`}
                              onClick={() => chooseModel(model)}
                            >
                              <span className="composer-menu-check">
                                {currentModel?.id === model.id && currentModel?.providerID === model.providerID ? <IconCheck /> : ""}
                              </span>
                              {model.name}
                              <span
                                className={`composer-menu-star ${isFavorite ? "on" : ""}`}
                                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(model);
                                }}
                              >
                                {isFavorite ? "★" : "☆"}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentPanel({
  session,
  isAnchor,
  onCollapse,
  onFocus,
  onClose,
  onResizeLeft,
  onResizeRight,
  onPanelDrag,
  onPanelDragEnd
}: {
  session?: SessionInfo | null;
  isAnchor?: boolean;
  onCollapse: () => void;
  onFocus?: () => void;
  onClose?: () => void;
  onResizeLeft?: (e: React.MouseEvent) => void;
  onResizeRight?: (e: React.MouseEvent) => void;
  onPanelDrag?: (delta: number) => void;
  onPanelDragEnd?: () => void;
}): ReactNode {
  const {
    session: storeSession,
    sessions,
    reopenSession,
    providerUsage,
    providerUsageLoading,
    refreshProviderUsage,
    selectPanelDirectory,
    commitStagedRevert,
    clearStagedRevert
  } = useStore();
  const activeSession = session === undefined ? storeSession : session;
  const view = usePanel(activeSession?.workspace);
  const { busy, todos, transcript, sessionUsage, currentModel, turnStartedAt, assistantStatus } = view;
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const observedTopRef = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelDragRef = useRef<number | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const startPanelDrag = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!onPanelDrag || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    panelDragRef.current = event.clientX;
    const move = (moveEvent: MouseEvent): void => {
      if (panelDragRef.current === null) return;
      const delta = moveEvent.clientX - panelDragRef.current;
      panelDragRef.current = moveEvent.clientX;
      onPanelDrag(delta);
    };
    const stop = (): void => {
      panelDragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      onPanelDragEnd?.();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };
  const parent = activeSession?.parentID ? sessions.find((item) => item.id === activeSession.parentID) : undefined;

  useEffect(() => {
    if (usageOpen) void refreshProviderUsage();
  }, [usageOpen, refreshProviderUsage]);

  useEffect(() => {
    if (!usageOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!headerRef.current?.contains(e.target as Node)) setUsageOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setUsageOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [usageOpen]);

  const usage = sessionUsage;
  const usageTotal = usage
    ? usage.tokens.input + usage.tokens.output + usage.tokens.reasoning + usage.tokens.cache.read + usage.tokens.cache.write
    : 0;
  const usageShare = (count: number): string =>
    usageTotal > 0 ? `${(count / usageTotal) * 100}%` : "0%";
  const contextLimit =
    typeof currentModel?.limit?.context === "number" && Number.isFinite(currentModel.limit.context) && currentModel.limit.context > 0
      ? currentModel.limit.context
      : null;
  const contextUsed = usage ? usage.tokens.input : 0;
  const contextFraction = contextLimit ? Math.min(1, Math.max(0, contextUsed / contextLimit)) : 0;
  const contextPercent = contextFraction * 100;
  const glyphTone = contextLimit ? contextTone(contextPercent) : null;

  const lastAssistantId = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const item = transcript[i];
      if (item.kind === "assistant") return item.id;
    }
    return null;
  }, [transcript]);

  const pendingPermission = useMemo(
    () => [...transcript]
      .reverse()
      .find((item): item is Extract<TranscriptItem, { kind: "permission" }> => item.kind === "permission" && item.pending),
    [transcript]
  );

  const scrollToBottom = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    observedTopRef.current = el.scrollTop;
    atBottomRef.current = true;
  };

  const transcriptTip = transcript.at(-1);
  const transcriptTipParts = transcriptTip?.kind === "assistant" ? transcriptTip.parts.length : 0;
  const followSignature = `${transcript.length}:${transcriptTip?.id ?? ""}:${transcriptTipParts}:${busy ? 1 : 0}`;

  useLayoutEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [followSignature]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.querySelector<HTMLElement>('[data-slot="session-turn-list"]');
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) scrollToBottom();
    });
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const floor = Math.max(0, el.scrollHeight - el.clientHeight);
    const movedByReader = Math.abs(el.scrollTop - Math.min(observedTopRef.current, floor)) > 0.5;
    const atBottom = movedByReader ? floor - el.scrollTop <= 25 : atBottomRef.current;
    if (!movedByReader && atBottom) {
      scrollToBottom();
      return;
    }
    atBottomRef.current = atBottom;
    observedTopRef.current = el.scrollTop;
  };

  return (
    <div className="agent-panel" onMouseDownCapture={onFocus}>
      {onResizeLeft && <div className="panel-resize-handle panel-resize-left" onMouseDown={onResizeLeft} />}
      {onResizeRight && <div className="panel-resize-handle panel-resize-right" onMouseDown={onResizeRight} />}
      <div className="agent-header" ref={headerRef} onMouseDown={startPanelDrag}>
        {activeSession?.parentID && (
          <button
            className="icon-btn agent-session-back"
            title={`Back to ${parent?.title ?? "parent session"}`}
            aria-label={`Back to ${parent?.title ?? "parent session"}`}
            onClick={() => void reopenSession(activeSession.parentID!)}
          >
            <IconArrowLeft />
          </button>
        )}
        {!isAnchor && (
          <button
            className={`agent-dot agent-close ${busy ? "busy" : ""}`}
            title="Close model panel"
            aria-label="Close model panel"
            onClick={() => onClose?.()}
          >
            <IconClose />
          </button>
        )}
        <div className="agent-identity">
          <div className="agent-identity-line">
            <span
              className={`agent-status-dot ${busy || assistantStatus?.isWorking ? "working" : "idle"}`}
              title={assistantStatus?.statusText ?? (busy ? "Working" : "Idle")}
              aria-label={assistantStatus?.statusText ?? (busy ? "Working" : "Idle")}
            />
            {activeSession?.parentID ? (
              <span className="agent-title">
                {activeSession.title ?? sessions.find((item) => item.id === activeSession.id)?.title ?? activeSession.agent ?? activeSession.directory?.split("/").filter(Boolean).pop() ?? (parent ? `${parent.title} subagent` : "Subagent session")}
                {activeSession.agent && activeSession.agent !== activeSession.title && (
                  <span className="agent-subagent">@{activeSession.agent}</span>
                )}
              </span>
            ) : activeSession?.directory ? (
              <button
                className="agent-workspace"
                title={`Change workspace — currently ${activeSession.directory}`}
                aria-label="Change workspace"
                onClick={() => void selectPanelDirectory(activeSession.workspace)}
              >
                <IconFolderOpen />
                <span>{activeSession.directory.split("/").filter(Boolean).pop()}</span>
              </button>
            ) : (
              <span className="agent-title">Agent</span>
            )}
          </div>
          {(busy || assistantStatus?.isWorking) && assistantStatus?.statusText && (
            <span className="agent-status-text">{assistantStatus.statusText}</span>
          )}
          {activeSession?.parentID && !(busy || assistantStatus?.isWorking) && (
            <span className="agent-status-text">
              Delegated agent{activeSession.agent ? ` · @${activeSession.agent}` : ""} · idle
            </span>
          )}
        </div>
        <TurnTimer startedAt={turnStartedAt} />
        <div className="agent-header-actions">
          <button
            className={`icon-btn agent-usage-toggle ${usageOpen ? "open" : ""} ${glyphTone ?? "neutral"}`}
            title="Session and provider usage"
            aria-label="Session and provider usage"
            aria-expanded={usageOpen}
            onClick={() => setUsageOpen((open) => !open)}
          >
            <IconDashboard />
          </button>
          <button className="icon-btn agent-collapse" title="Collapse agent panel" onClick={onCollapse}>
            <IconCollapse />
          </button>
        </div>
        {usageOpen && (
          <div className="agent-usage-popup">
            <div className="agent-usage-scroll">
            <div className="agent-usage-head">
              <IconDashboard />
              Session usage
            </div>
            {usage ? (
              <>
                <div className="agent-usage-cost">
                  <span className="agent-usage-cost-label">Total cost</span>
                  <span className="agent-usage-cost-value">{formatCost(usage.cost)}</span>
                </div>
                {contextLimit !== null && (
                  <div className="agent-usage-context">
                    <div className="agent-usage-context-head">
                      <span className="agent-usage-context-label">Context window</span>
                      <span className={`agent-usage-context-percent ${contextTone(contextPercent)}`}>
                        {Math.round(contextPercent)}%
                      </span>
                    </div>
                    <div className="agent-usage-context-bar">
                      <div
                        className={`agent-usage-context-fill ${contextTone(contextPercent)}`}
                        style={{ width: `${Math.min(100, Math.max(0, contextPercent))}%` }}
                      />
                    </div>
                    <div className="agent-usage-context-counts">
                      <span>{formatTokens(contextUsed)}</span>
                      <span>of {formatTokens(contextLimit)} tokens</span>
                    </div>
                  </div>
                )}
                {usageTotal > 0 && (
                  <div className="agent-usage-bar">
                    <span className="agent-usage-seg input" style={{ width: usageShare(usage.tokens.input) }} />
                    <span className="agent-usage-seg output" style={{ width: usageShare(usage.tokens.output) }} />
                    <span className="agent-usage-seg reasoning" style={{ width: usageShare(usage.tokens.reasoning) }} />
                    <span className="agent-usage-seg cache" style={{ width: usageShare(usage.tokens.cache.read) }} />
                  </div>
                )}
                <div className="agent-usage-rows">
                  <div className="agent-usage-row">
                    <span className="agent-usage-row-label">Input</span>
                    <span className="agent-usage-row-value">{formatTokens(usage.tokens.input)}</span>
                  </div>
                  <div className="agent-usage-row">
                    <span className="agent-usage-row-label">Output</span>
                    <span className="agent-usage-row-value">{formatTokens(usage.tokens.output)}</span>
                  </div>
                  <div className="agent-usage-row">
                    <span className="agent-usage-row-label">Reasoning</span>
                    <span className="agent-usage-row-value">{formatTokens(usage.tokens.reasoning)}</span>
                  </div>
                  <div className="agent-usage-row">
                    <span className="agent-usage-row-label">Cache read</span>
                    <span className="agent-usage-row-value">{formatTokens(usage.tokens.cache.read)}</span>
                  </div>
                  <div className="agent-usage-row">
                    <span className="agent-usage-row-label">Cache write</span>
                    <span className="agent-usage-row-value">{formatTokens(usage.tokens.cache.write)}</span>
                  </div>
                </div>
                <div className="agent-usage-total">
                  <span className="agent-usage-total-label">Total tokens</span>
                  <span className="agent-usage-total-value">{formatTokens(usageTotal)}</span>
                </div>
              </>
            ) : (
              <div className="agent-usage-empty">No usage recorded for this session yet.</div>
            )}
            <div className="usage-provider-section">
              <div className="usage-provider-head">
                <span className="usage-provider-title">
                  <svg className="agent-usage-glyph" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="8" cy="8" r="2.1" fill="currentColor" />
                  </svg>
                  Provider usage
                </span>
                <button
                  className="usage-provider-refresh"
                  title="Refresh provider usage"
                  aria-label="Refresh provider usage"
                  onClick={() => void refreshProviderUsage()}
                >
                  <IconRefresh className={providerUsageLoading ? "spinning" : ""} />
                </button>
              </div>
              {providerUsageLoading && providerUsage.length === 0 ? (
                <div className="usage-provider-loading">
                  <span className="spinner" />
                  Checking provider usage…
                </div>
              ) : providerUsage.length === 0 ? (
                <div className="usage-provider-empty">
                  No providers connected. Sign in with <code>opencode auth login</code> to see plan limits here.
                </div>
              ) : (
                providerUsage.map((result) => <ProviderUsageCard key={result.provider} result={result} />)
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      <div className="agent-scroll" ref={scrollRef} onScroll={onScroll}>
        {transcript.length === 0 && (
          <div className="agent-empty">
            <p>Tell the agent what to work on.</p>
            <p className="agent-empty-sub">
              It will stream its progress here, and every file it touches will show up under{" "}
              <b>Changes</b> with a red/green diff.
            </p>
          </div>
        )}
        <OpenCodeTimeline
          transcript={transcript}
          busy={busy}
          lastAssistantId={lastAssistantId}
          session={activeSession}
        />
      </div>

      <OpenCodeLiveActivity
        transcript={transcript}
        busy={busy}
        statusText={assistantStatus?.statusText}
      />

      <div data-component="session-prompt-dock">
        {pendingPermission && <PermissionPrompt item={pendingPermission} session={activeSession} />}
        {(view.pendingForms ?? []).map((form) => (
          <FormPrompt key={form.id} form={form} workspace={activeSession!.workspace} />
        ))}
        {view.stagedRevert && activeSession && (
          <div data-component="dock-prompt" data-kind="revert">
            <div data-slot="permission-header">Undo staged</div>
            <p className="provider-note">Messages and file changes after this point will be removed.</p>
            <div data-slot="permission-actions">
              <button className="btn btn-danger" onClick={() => void commitStagedRevert(activeSession.workspace)}>Commit undo</button>
              <button className="btn" onClick={() => void clearStagedRevert(activeSession.workspace)}>Discard</button>
            </div>
          </div>
        )}
        <OpenCodeTodoDock todos={todos} />
        <Composer session={activeSession} />
      </div>
    </div>
  );
}
