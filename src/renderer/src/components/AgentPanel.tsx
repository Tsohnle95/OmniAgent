import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { OpenCodeTimeline } from "./OpenCodeTimeline";
import { OpenCodeTodoDock } from "./OpenCodeTodoDock";
import type { ModelOption } from "@shared/types";

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
  const [modelView, setModelView] = useState<"list" | "settings" | "strength">("list");
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
    const el = inputRef.current;
    if (el) {
      el.style.removeProperty("--composer-input-height");
      el.focus();
    }
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
          rows={1}
          placeholder="Ask anything, / for commands, @ for context..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.setProperty("--composer-input-height", "0px");
            e.target.style.setProperty("--composer-input-height", `${e.target.scrollHeight}px`);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-actions">
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
          <button
            className={`composer-selector ${menu === "agent" ? "open" : ""}`}
            title="Change agent"
            onClick={() => setMenu(menu === "agent" ? null : "agent")}
          >
            <span className="codicon codicon-git-branch" />
            <span>{currentAgent?.name ?? "Agent"}</span>
            <span className="codicon codicon-chevron-down" />
          </button>
          <button
            className={`composer-selector model ${menu === "model" && modelView !== "strength" ? "open" : ""}`}
            title="Change model and response strength"
            onClick={() => {
              setMenu(menu === "model" ? null : "model");
              if (menu !== "model") setModelView("list");
            }}
          >
            <span>{currentModel?.name ?? "Model"}{variantLabel ? ` ${variantLabel}` : ""}</span>
            <span className="codicon codicon-chevron-down" />
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
          <button
            className={`composer-send ${busy ? "stop" : ""}`}
            title={busy ? "Stop the agent" : canSend ? "Send (Enter)" : "Type a prompt first"}
            disabled={!busy && !canSend}
            onClick={busy ? () => void stop() : send}
          >
            <span className={`codicon ${busy ? "codicon-stop" : "codicon-arrow-up"}`} />
          </button>
        </div>
      </div>

      {notice && <div className="composer-notice">{notice}</div>}

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
                  {modelView === "settings" ? "Model settings" : modelView === "strength" ? "Response strength" : "Model selection"}
                </span>
                {modelView === "settings" || modelView === "strength" ? (
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
              ) : modelView === "strength" ? (
                <div className="composer-menu-group variant-menu">
                  <button className="composer-menu-item" onClick={() => chooseVariant()}>
                    <span className="composer-menu-check">{!currentModel?.variant ? "✓" : ""}</span>
                    Auto
                  </button>
                  {currentModel?.variants?.map((variant) => (
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
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentPanel({ onCollapse }: { onCollapse: () => void }): ReactNode {
  const { busy, todos, transcript, session, sessions, reopenSession } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const parent = session?.parentID ? sessions.find((item) => item.id === session.parentID) : undefined;

  const lastAssistantId = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const item = transcript[i];
      if (item.kind === "assistant") return item.id;
    }
    return null;
  }, [transcript]);

  const scheduleScrollToBottom = (): void => {
    if (!stickRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const el = scrollRef.current;
      if (!el || !stickRef.current) return;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    });
  };

  useLayoutEffect(() => {
    scheduleScrollToBottom();
  }, [transcript, busy]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.querySelector<HTMLElement>('[data-slot="session-turn-list"]');
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleScrollToBottom());
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, []);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  return (
    <div className="agent-panel">
      <div className="agent-header">
        {session?.parentID && (
          <button
            className="icon-btn agent-session-back"
            title={`Back to ${parent?.title ?? "parent session"}`}
            aria-label={`Back to ${parent?.title ?? "parent session"}`}
            onClick={() => void reopenSession(session.parentID!)}
          >
            <span className="codicon codicon-arrow-left" />
          </button>
        )}
        <span className={`agent-dot ${busy ? "busy" : ""}`} />
        <span className="agent-title">
          {session?.parentID ? session.title ?? session.agent ?? "Subagent" : "Agent"}
          {!session?.parentID && session?.directory && (
            <span className="agent-workspace" title={session.directory}>
              {session.directory.split("/").filter(Boolean).pop()}
            </span>
          )}
        </span>
        <button className="icon-btn agent-collapse" title="Collapse agent panel" onClick={onCollapse}>
          »
        </button>
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
        <OpenCodeTimeline transcript={transcript} busy={busy} lastAssistantId={lastAssistantId} />
      </div>

      <div data-component="session-prompt-dock">
        <OpenCodeTodoDock todos={busy ? todos : []} />
        <Composer />
      </div>
    </div>
  );
}
