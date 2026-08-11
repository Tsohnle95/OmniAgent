import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { ModelOption, TranscriptItem } from "@shared/types";

const OUTPUT_LIMIT = 6000;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function toolIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("bash") || t.includes("shell") || t.includes("terminal")) return "⌁";
  if (t.includes("read") || t.includes("file") || t.includes("write") || t.includes("edit")) return "📄";
  if (t.includes("search") || t.includes("grep")) return "🔍";
  if (t.includes("web") || t.includes("fetch") || t.includes("url")) return "🌐";
  if (t.includes("glob") || t.includes("list")) return "🗂";
  return "◆";
}

function isCommandTool(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("bash") || t.includes("shell") || t.includes("terminal");
}

function ToolCard({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }): ReactNode {
  const { openFile } = useStore();
  const [open, setOpen] = useState(item.tool.status === "failed");
  const { tool } = item;
  const output = tool.output ?? "";
  const showOutput = output.length > 0;
  const truncated = output.length > OUTPUT_LIMIT;
  const input = tool.input ?? "";
  const command = isCommandTool(tool.title) && input ? input.replace(/\s+/g, " ").slice(0, 240) : "";
  const preview = showOutput && tool.status === "success" ? output.replace(/\s+/g, " ").slice(0, 160) : "";
  const now = useNow(tool.status === "running");
  const elapsed =
    tool.status === "running" && tool.startedAt
      ? formatDuration(now - tool.startedAt)
      : tool.duration !== undefined
        ? formatDuration(tool.duration)
        : null;
  const paths = tool.paths ?? [];

  return (
    <div className={`tool-card ${tool.status}`}>
      <div className="tool-row">
        {tool.status === "running" ? (
          <span className="spinner" />
        ) : (
          <span className={`tool-status ${tool.status}`}>{tool.status === "success" ? "✓" : "✕"}</span>
        )}
        <span className="tool-icon" aria-hidden>
          {toolIcon(tool.title)}
        </span>
        <span className="tool-title">{tool.title}</span>
        {elapsed && <span className="tool-time">{elapsed}</span>}
      </div>
      {command && <div className="tool-command">$ {command}</div>}
      {paths.length > 0 && (
        <div className="tool-paths">
          {paths.map((p) => (
            <button key={p} className="tool-path-chip" onClick={() => void openFile(p)} title={p}>
              {p}
            </button>
          ))}
        </div>
      )}
      {showOutput && (
        <button className="tool-output-toggle" onClick={() => setOpen((o) => !o)}>
          {tool.status === "failed"
            ? open
              ? "hide error"
              : "show error"
            : open
              ? "hide output"
              : "show output"}
        </button>
      )}
      {showOutput && !open && preview && <div className="tool-output-preview">{preview}</div>}
      {showOutput && open && (
        <pre className={`tool-output ${tool.status === "failed" ? "failed" : ""}`}>
          {truncated ? `${output.slice(0, OUTPUT_LIMIT)}\n… (truncated)` : output}
        </pre>
      )}
    </div>
  );
}

function permissionIcon(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("bash") || a.includes("command")) return "⌁";
  if (a.includes("write") || a.includes("edit") || a.includes("create")) return "✎";
  if (a.includes("read") || a.includes("open")) return "👁";
  if (a.includes("delete") || a.includes("remove")) return "✕";
  return "?";
}

function PermissionCard({
  item
}: {
  item: Extract<TranscriptItem, { kind: "permission" }>;
}): ReactNode {
  const { replyPermission } = useStore();
  return (
    <div className="permission-card">
      <div className="permission-head">
        <span className="permission-icon" aria-hidden>
          {permissionIcon(item.action)}
        </span>
        <span className="permission-title">Permission required</span>
      </div>
      <div className="permission-action">{item.action}</div>
      {item.resources.length > 0 && (
        <div className="permission-resources">
          {item.resources.slice(0, 4).map((r) => (
            <code key={r}>{r}</code>
          ))}
          {item.resources.length > 4 && <code className="permission-more">+{item.resources.length - 4} more</code>}
        </div>
      )}
      {item.pending ? (
        <div className="permission-buttons">
          <button className="btn btn-primary" onClick={() => void replyPermission(item.requestID, "once")}>
            Allow once
          </button>
          <button className="btn" onClick={() => void replyPermission(item.requestID, "always")}>
            Always
          </button>
          <button className="btn btn-danger" onClick={() => void replyPermission(item.requestID, "reject")}>
            Deny
          </button>
        </div>
      ) : (
        <div className={`permission-resolved ${item.resolvedWith === "reject" ? "rejected" : ""}`}>
          {item.resolvedWith === "reject"
            ? "Denied"
            : item.resolvedWith === "always"
              ? "Allowed · always"
              : "Allowed"}
        </div>
      )}
    </div>
  );
}

function TranscriptItemView({ item, busy }: { item: TranscriptItem; busy: boolean }): ReactNode {
  switch (item.kind) {
    case "user":
      return (
        <div className="user-bubble">
          {item.attachments && item.attachments.length > 0 && (
            <div className="user-attachments">
              {item.attachments.map((attachment) => (
                <span className="user-attachment" key={attachment.name}>
                  <span className="codicon codicon-file" />
                  {attachment.name}
                </span>
              ))}
            </div>
          )}
          {item.text}
        </div>
      );
    case "assistant":
      return (
        <div className="assistant-block">
          {item.reasoning && (
            <details className="reasoning" open={item.reasoningOpen}>
              <summary>thinking</summary>
              <pre>{item.reasoning}</pre>
            </details>
          )}
          {item.text ? (
            <div className="assistant-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
            </div>
          ) : busy ? (
            <span className="assistant-cursor">▌</span>
          ) : null}
        </div>
      );
    case "tool":
      return <ToolCard item={item} />;
    case "permission":
      return <PermissionCard item={item} />;
    case "status":
      return <div className={`status-line ${item.tone}`}>{item.text}</div>;
    case "divider":
      return <div className="transcript-divider" />;
  }
}

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

type MenuKind = "model" | "agent" | null;

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

function Composer(): ReactNode {
  const {
    approvalMode,
    toggleApprovalMode,
    models,
    currentModel,
    switchModel,
    agents,
    currentAgent,
    switchAgent,
    sendPrompt,
    stop,
    busy
  } = useStore();
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => readModelKeys("favoriteModels"));
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(() => readModelKeys("hiddenModels"));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modelView, setModelView] = useState<"list" | "settings">("list");
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

  const send = (): void => {
    if (!canSend) return;
    void sendPrompt(input, files.map((file) => file.path));
    setInput("");
    setFiles([]);
    inputRef.current?.focus();
  };

  const attachFiles = async (): Promise<void> => {
    setNotice("");
    let paths: string[];
    try {
      paths = await window.openshell.selectFiles();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Files could not be attached.");
      return;
    }
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
    inputRef.current?.focus();
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
    void switchModel(model.id, model.providerID, currentModel?.id === model.id ? currentModel.variant : undefined);
    setMenu(null);
  };

  const chooseVariant = (variant?: string): void => {
    if (!currentModel) return;
    void switchModel(currentModel.id, currentModel.providerID, variant);
    setMenu(null);
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
    <div className="composer" ref={composerRef}>
      {files.length > 0 && (
        <div className="composer-attachments">
          {files.map((file) => (
            <span className="composer-attachment" key={file.path}>
              <span className="codicon codicon-file" />
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
      <div className="composer-body">
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={3}
          placeholder="Describe what you want to build"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
      <div className="composer-footer">
        <div className="composer-tools">
          <button className="composer-icon-button" title="Attach files" onClick={() => void attachFiles()}>
            <span className="codicon codicon-add" />
          </button>
          <button
            className={`composer-approval ${approvalMode === "approve" ? "active" : ""}`}
            aria-pressed={approvalMode === "approve"}
            title={approvalMode === "approve" ? "Automatically allow permission requests once" : "Ask before allowing permission requests"}
            onClick={toggleApprovalMode}
          >
            <span className="codicon codicon-shield" />
          </button>
          {notice && <span className="composer-notice">{notice}</span>}
        </div>
        <div className="composer-controls">
          {agents.length > 0 && (
            <button
              className={`composer-selector ${menu === "agent" ? "open" : ""}`}
              title="Change agent"
              onClick={() => setMenu(menu === "agent" ? null : "agent")}
            >
              <span className="codicon codicon-git-branch" />
              <span>{currentAgent?.name ?? "Agent"}</span>
              <span className="codicon codicon-chevron-down" />
            </button>
          )}
          {models.length > 0 && (
            <button
              className={`composer-selector model ${menu === "model" ? "open" : ""}`}
              title="Change model and response strength"
              onClick={() => {
                setMenu(menu === "model" ? null : "model");
                if (menu !== "model") setModelView("list");
              }}
            >
              <span>{currentModel?.name ?? "Model"}{variantLabel ? ` ${variantLabel}` : ""}</span>
              <span className="codicon codicon-chevron-down" />
            </button>
          )}
          <button
            className={`composer-icon-button microphone ${voiceActive ? "active" : ""}`}
            title={voiceActive ? "Stop voice input" : "Use voice input"}
            aria-pressed={voiceActive}
            onClick={toggleVoice}
          >
            <span className="codicon codicon-mic" />
          </button>
          {busy && (
            <button className="composer-icon-button stop" title="Stop the agent" onClick={() => void stop()}>
              <span className="codicon codicon-stop" />
            </button>
          )}
          <button className="composer-send" title={canSend ? "Send (Enter)" : "Type a prompt first"} disabled={!canSend} onClick={send}>
            <span className="codicon codicon-arrow-up" />
          </button>
        </div>
      </div>

      {menu && (
        <div className="composer-menu">
          {menu === "agent" ? (
            agents.map((agent) => (
              <button
                key={agent.id}
                className={`composer-menu-item ${currentAgent?.id === agent.id ? "selected" : ""}`}
                onClick={() => {
                  void switchAgent(agent.id);
                  setMenu(null);
                }}
              >
                <span className="composer-menu-check">{currentAgent?.id === agent.id ? "✓" : ""}</span>
                {agent.name}
              </button>
            ))
          ) : (
            <>
              <div className="composer-menu-header">
                <span className="composer-menu-title">
                  {modelView === "settings" ? "Model settings" : "Model selection"}
                </span>
                {modelView === "settings" ? (
                  <button
                    className="composer-menu-tool"
                    title="Back to model list"
                    onClick={() => setModelView("list")}
                  >
                    <span className="codicon codicon-arrow-left" />
                  </button>
                ) : (
                  <button
                    className="composer-menu-tool"
                    title="Choose which models appear here"
                    onClick={() => setModelView("settings")}
                  >
                    <span className="codicon codicon-gear" />
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
                              <span className={`codicon ${visible ? "codicon-eye" : "codicon-eye-closed"}`} />
                            </span>
                            {model.name}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {favoriteList.length > 0 && (
                    <div className="composer-menu-group">
                      <div className="composer-menu-head">
                        <span className="codicon codicon-star-full" />
                        Favorites
                      </div>
                      {favoriteList.map((model) => (
                        <button
                          key={`fav::${model.id}::${model.providerID}`}
                          className={`composer-menu-item ${currentModel?.id === model.id && currentModel?.providerID === model.providerID ? "selected" : ""}`}
                          onClick={() => chooseModel(model)}
                        >
                          <span className="composer-menu-check">
                            {currentModel?.id === model.id && currentModel?.providerID === model.providerID ? "✓" : ""}
                          </span>
                          {model.name}
                          <span
                            className="composer-menu-star"
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
                        <span className={`codicon ${collapsed.has(provider) ? "codicon-chevron-right" : "codicon-chevron-down"}`} />
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
                                {currentModel?.id === model.id && currentModel?.providerID === model.providerID ? "✓" : ""}
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
                  {currentModel && currentModel.variants && currentModel.variants.length > 0 && (
                    <div className="composer-menu-group variant-menu">
                      <div className="composer-menu-head">Response strength</div>
                      <button
                        className={`composer-menu-item ${!currentModel.variant ? "selected" : ""}`}
                        onClick={() => chooseVariant()}
                      >
                        <span className="composer-menu-check">{!currentModel.variant ? "✓" : ""}</span>
                        Auto
                      </button>
                      {currentModel.variants.map((variant) => (
                        <button
                          key={variant}
                          className={`composer-menu-item ${currentModel.variant === variant ? "selected" : ""}`}
                          onClick={() => chooseVariant(variant)}
                        >
                          <span className="composer-menu-check">{currentModel.variant === variant ? "✓" : ""}</span>
                          {formatVariant(variant)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentPanel(): ReactNode {
  const { session, busy, transcript } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [transcript, busy]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  return (
    <div className="agent-panel">
      <div className="agent-header">
        <span className={`agent-dot ${busy ? "busy" : ""}`} />
        <span className="agent-title">Agent</span>
        {session && (
          <span className="agent-session" title={session.id}>
            {session.id}
          </span>
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
        {transcript.map((item) => (
          <TranscriptItemView key={item.kind === "tool" ? item.tool.id : item.id} item={item} busy={busy} />
        ))}
      </div>

      <Composer />
    </div>
  );
}
