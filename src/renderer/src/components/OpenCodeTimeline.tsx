import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { ToolCallView, TranscriptItem } from "@shared/types";

const OUTPUT_LIMIT = 6000;
const CONTEXT_TOOLS = new Set(["read", "glob", "grep", "list"]);
const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_IMMEDIATE = 512;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;

type AssistantItem = Extract<TranscriptItem, { kind: "assistant" }>;
type AssistantPart = AssistantItem["parts"][number];
type VisibleTimelineItem = Exclude<TranscriptItem, { kind: "permission" | "pending-input" | "selection" | "system" }>;

const AGENT_TONES: Record<string, string> = {
  build: "#c3d4fd",
  explore: "#f7e5b5",
  plan: "#f799c6",
  review: "#b8e9c1",
  writer: "#9e99f7"
};

const AGENT_PALETTE = [
  "#2090f5", "#9dbefe", "#fbb73c", "#edb2f1", "#93e9f6", "#35c02d",
  "#f5b238", "#ff9ae2", "#93e9f6", "#9bcd97", "#fc533a", "#fbb73c"
];

function agentTone(name: string, configured?: string): string {
  const aliases: Record<string, string> = {
    primary: "#a2bcff",
    secondary: "#aeaeae",
    accent: "#a2bcff",
    success: "#78d38b",
    warning: "#f3da9b",
    error: "#f17471",
    info: "#93e9f6"
  };
  if (configured) return aliases[configured] ?? configured;
  const key = name.toLowerCase();
  if (AGENT_TONES[key]) return AGENT_TONES[key];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AGENT_PALETTE[hash % AGENT_PALETTE.length];
}

function TextShimmer({ text, active = true }: { text: string; active?: boolean }): ReactNode {
  const [run, setRun] = useState(active);
  useEffect(() => {
    if (active) {
      setRun(true);
      return;
    }
    const timer = setTimeout(() => setRun(false), 220);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <span data-component="text-shimmer" data-active={active ? "true" : "false"} aria-label={text}>
      <span data-slot="text-shimmer-char">
        <span data-slot="text-shimmer-char-base" aria-hidden="true">{text}</span>
        <span data-slot="text-shimmer-char-shimmer" data-run={run ? "true" : "false"} aria-hidden="true">
          {text}
        </span>
      </span>
    </span>
  );
}

function paceStep(size: number): number {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(256, Math.ceil(size / 4));
}

function paceEnd(text: string, start: number): number {
  const end = Math.min(text.length, start + paceStep(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let index = end; index < max; index += 1) {
    if (TEXT_RENDER_SNAP.test(text[index] ?? "")) return index + 1;
  }
  return end;
}

function usePacedText(text: string, live: boolean): string {
  const [value, setValue] = useState(text);
  const sourceRef = useRef(text);
  const shownRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  sourceRef.current = text;

  useEffect(() => {
    const clear = (): void => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const sync = (next: string): void => {
      shownRef.current = next;
      setValue(next);
    };
    const run = (): void => {
      timerRef.current = null;
      const next = sourceRef.current;
      if (!live || !next.startsWith(shownRef.current) || next.length <= shownRef.current.length) {
        sync(next);
        return;
      }
      if (next.length - shownRef.current.length <= TEXT_RENDER_IMMEDIATE) {
        sync(next);
        return;
      }
      const end = paceEnd(next, shownRef.current.length);
      sync(next.slice(0, end));
      if (end < next.length) timerRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
    };

    if (!live || !text.startsWith(shownRef.current) || text.length < shownRef.current.length) {
      clear();
      sync(text);
      return clear;
    }
    if (text.length - shownRef.current.length <= TEXT_RENDER_IMMEDIATE) {
      clear();
      sync(text);
      return clear;
    }
    if (text.length !== shownRef.current.length && timerRef.current === null) {
      timerRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
    }
    return clear;
  }, [text, live]);

  return value;
}

function Markdown({ text, streaming }: { text: string; streaming: boolean }): ReactNode {
  const value = usePacedText(text, streaming);
  if (!value) return null;
  return (
    <div data-component="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
    </div>
  );
}

function CopyResponse({ text }: { text: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    if (!text) return;
    const ok = await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      data-slot="text-part-copy-button"
      className="icon-btn"
      aria-label={copied ? "Copied" : "Copy response"}
      title={copied ? "Copied" : "Copy response"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void copy()}
    >
      <span className={`codicon codicon-${copied ? "check" : "copy"}`} />
    </button>
  );
}

function TextPart({ part, streaming }: { part: Extract<AssistantPart, { kind: "text" }>; streaming: boolean }): ReactNode {
  if (!part.text) return null;
  return (
    <div data-component="text-part" data-timeline-part-id={part.id}>
      <div data-slot="text-part-body">
        <Markdown text={part.text} streaming={streaming && !part.complete} />
      </div>
      {!streaming && (
        <div data-slot="text-part-copy-wrapper">
          <CopyResponse text={part.text} />
        </div>
      )}
    </div>
  );
}

function ReasoningPart({
  part,
  streaming
}: {
  part: Extract<AssistantPart, { kind: "reasoning" }>;
  streaming: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!part.text) return null;
  const active = streaming && !part.complete;
  const contentID = `reasoning-${part.id}`;
  return (
    <div
      data-component="reasoning-part"
      data-expanded={open ? "true" : "false"}
      data-timeline-part-id={part.id}
    >
      <button
        data-slot="reasoning-part-trigger"
        aria-controls={contentID}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span data-slot="reasoning-part-title"><TextShimmer text="Thinking" active={active} /></span>
        <span className={`codicon codicon-chevron-${open ? "down" : "right"}`} aria-hidden="true" />
      </button>
      {open && (
        <div data-slot="reasoning-part-content" id={contentID}>
          <Markdown text={part.text} streaming={active} />
        </div>
      )}
    </div>
  );
}

function parseInput(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function fileName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split(/[\\/]/).pop() ?? value;
}

function titleCase(value: string): string {
  if (!value) return "Tool";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toolKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function toolPresentation(tool: ToolCallView): { title: string; subtitle: string; args: string[]; path?: string } {
  const name = toolKey(tool.title);
  const input = parseInput(tool.input);
  let title = titleCase(tool.title);
  let subtitle = tool.detail.replace(/^\$\s*/, "");
  let path: string | undefined;
  if (name === "read") {
    title = "Read";
    path = typeof input.filePath === "string" ? input.filePath : typeof input.file_path === "string" ? input.file_path : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "list") {
    title = "List";
    path = typeof input.path === "string" ? input.path : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "glob") {
    title = "Glob";
    subtitle = typeof input.pattern === "string" ? input.pattern : subtitle;
  } else if (name === "grep") {
    title = "Grep";
    subtitle = typeof input.pattern === "string" ? input.pattern : subtitle;
  } else if (name === "webfetch") {
    title = "Webfetch";
    subtitle = typeof input.url === "string" ? input.url : subtitle;
  } else if (name === "websearch") {
    title = "Web Search";
    subtitle = typeof input.query === "string" ? input.query : subtitle;
  } else if (name === "task") {
    title = "Task";
    subtitle = typeof input.description === "string" ? input.description : subtitle;
  } else if (name === "bash" || name === "shell") {
    title = "Shell";
    subtitle = typeof input.command === "string" ? input.command : subtitle;
  } else if (name === "edit") {
    title = "Edit";
    path = typeof input.filePath === "string" ? input.filePath : typeof input.file_path === "string" ? input.file_path : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "write") {
    title = "Write";
    path = typeof input.filePath === "string" ? input.filePath : typeof input.file_path === "string" ? input.file_path : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "patch" || name === "apply_patch") {
    title = "Patch";
  } else if (name === "question") {
    title = "Questions";
  }
  const skipped = new Set(["description", "query", "url", "filePath", "file_path", "path", "pattern", "name", "command"]);
  const args = Object.entries(input)
    .filter(([key, child]) => !skipped.has(key) && ["string", "number", "boolean"].includes(typeof child))
    .map(([key, child]) => `${key}=${String(child)}`)
    .slice(0, 3);
  return { title, subtitle, args, path };
}

function SessionProgressIndicator(): ReactNode {
  const dots = Array.from({ length: 25 }, (_, index) => ({
    index,
    x: 1.5 + (index % 5) * 3,
    y: 1.5 + Math.floor(index / 5) * 3
  }));
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" data-component="session-progress-indicator-v2" aria-hidden="true">
      {dots.map((dot) => <rect data-dot={dot.index} x={dot.x} y={dot.y} width="2" height="2" key={dot.index} />)}
    </svg>
  );
}

function SubagentIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 5C4.5 4.72386 4.72386 4.5 5 4.5H11C11.2761 4.5 11.5 4.72386 11.5 5V11C11.5 11.2761 11.2761 11.5 11 11.5H5C4.72386 11.5 4.5 11.2761 4.5 11V5Z" fill="currentColor" />
      <path d="M13.5 2C13.7761 2 14 2.22386 14 2.5V13.5C14 13.7761 13.7761 14 13.5 14H2.5C2.22386 14 2 13.7761 2 13.5V2.5C2 2.22386 2.22386 2 2.5 2H13.5ZM3 13H13V3H3V13Z" fill="currentColor" />
    </svg>
  );
}

function TaskTool({ tool }: { tool: ToolCallView }): ReactNode {
  const { agents, sessions, session, reopenSession } = useStore();
  const input = parseInput(tool.input);
  const requested = typeof input.subagent_type === "string" ? input.subagent_type : "";
  const configured = agents.find((agent) =>
    agent.id.toLowerCase() === requested.toLowerCase() || agent.name.toLowerCase() === requested.toLowerCase()
  );
  const title = configured?.name ?? titleCase(requested || "Task");
  const metadataSession = typeof tool.metadata?.sessionId === "string"
    ? tool.metadata.sessionId
    : typeof tool.metadata?.sessionID === "string"
      ? tool.metadata.sessionID
      : "";
  const fallbackSession = sessions
    .filter((candidate) => candidate.parentID === session?.id)
    .filter((candidate) => typeof input.description === "string"
      ? candidate.title.startsWith(input.description)
      : true)
    .filter((candidate) => requested
      ? candidate.agent?.toLowerCase() === requested.toLowerCase() || candidate.title.includes(`@${requested}`)
      : true)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  const childSession = metadataSession || fallbackSession || "";
  const detail = typeof input.description === "string" && input.description ? input.description : childSession;
  const subtitle = tool.metadata?.background === true && detail ? `${detail} (background)` : detail;
  const running = tool.status === "running";
  const style = { "--task-agent-color": agentTone(requested, configured?.color) } as CSSProperties;
  return (
    <div data-component="task-tool-card" style={style} data-timeline-part-id={tool.id}>
      <button
        data-component="task-tool-surface"
        disabled={!childSession}
        title={childSession ? `Open ${title} session` : undefined}
        onClick={() => childSession && void reopenSession(childSession)}
      >
        <div data-slot="basic-tool-tool-info-structured">
          <div data-slot="basic-tool-tool-info-main">
            {running ? (
              <span data-component="task-tool-spinner"><SessionProgressIndicator /></span>
            ) : (
              <span data-component="task-tool-icon"><SubagentIcon /></span>
            )}
            <span data-component="task-tool-title">{title}</span>
            {subtitle && <span data-slot="basic-tool-tool-subtitle">{subtitle}</span>}
          </div>
        </div>
        {childSession && <span className="codicon codicon-chevron-right" data-slot="task-tool-open" />}
      </button>
    </div>
  );
}

function ToolPart({ tool }: { tool: ToolCallView }): ReactNode {
  const { openFile } = useStore();
  const [open, setOpen] = useState(tool.status === "failed");
  const presentation = toolPresentation(tool);
  const output = tool.output ?? "";
  const files = tool.content?.filter((item) => item.type === "file") ?? [];
  const expandable = tool.status !== "running" && (output.length > 0 || files.length > 0);
  const truncated = output.length > OUTPUT_LIMIT;
  const activateSubtitle = (): void => {
    if (presentation.path) void openFile(presentation.path);
  };

  if (toolKey(tool.title) === "todowrite") return null;
  if (toolKey(tool.title) === "task") return <TaskTool tool={tool} />;

  return (
    <div data-component="tool-part-wrapper" data-timeline-part-id={tool.id}>
      <div className="tool-collapsible" data-expanded={open ? "true" : undefined}>
        <button
          data-slot="collapsible-trigger"
          disabled={!expandable}
          onClick={() => expandable && setOpen((value) => !value)}
        >
          <div data-component="tool-trigger" data-clickable={expandable ? "true" : undefined}>
            <div data-slot="basic-tool-tool-trigger-content">
              <div data-slot="basic-tool-tool-info">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span data-slot="basic-tool-tool-title">
                      <TextShimmer text={presentation.title} active={tool.status === "running"} />
                    </span>
                    {presentation.subtitle && (
                      <span
                        data-slot="basic-tool-tool-subtitle"
                        className={presentation.path ? "clickable" : undefined}
                        onClick={(event) => {
                          if (!presentation.path) return;
                          event.stopPropagation();
                          activateSubtitle();
                        }}
                      >
                        {presentation.subtitle}
                      </span>
                    )}
                    {presentation.args.map((arg) => (
                      <span data-slot="basic-tool-tool-arg" key={arg}>{arg}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {expandable && <span data-slot="collapsible-arrow" className="codicon codicon-chevron-down" />}
          </div>
        </button>
        {tool.progress && tool.status === "running" && (
          <div data-slot="tool-progress">{tool.progress}</div>
        )}
        {expandable && open && (
          <div data-slot="collapsible-content">
            {output && (
              <pre data-component="tool-output" data-error={tool.status === "failed" ? "true" : undefined}>
                {truncated ? `${output.slice(0, OUTPUT_LIMIT)}\n… (truncated)` : output}
              </pre>
            )}
            {files.length > 0 && (
              <div data-component="tool-files">
                {files.map((file) => (
                  <a href={file.uri} target="_blank" rel="noreferrer" key={`${file.uri}:${file.name ?? ""}`}>
                    <span className="codicon codicon-file" />
                    <span>{file.name ?? file.uri}</span>
                    <span data-slot="tool-file-mime">{file.mime}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function contextKind(tool: ToolCallView): "read" | "search" | "list" {
  const name = toolKey(tool.title);
  if (name === "list") return "list";
  if (name === "glob" || name === "grep") return "search";
  return "read";
}

function countLabel(count: number, kind: "read" | "search" | "list"): string {
  if (kind === "read") return `${count} ${count === 1 ? "read" : "reads"}`;
  if (kind === "search") return `${count} ${count === 1 ? "search" : "searches"}`;
  return `${count} ${count === 1 ? "list" : "lists"}`;
}

function ContextToolGroup({ tools, busy }: { tools: ToolCallView[]; busy: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  const pending = busy || tools.some((tool) => tool.status === "running");
  const counts = tools.reduce<Record<"read" | "search" | "list", number>>(
    (result, tool) => ({ ...result, [contextKind(tool)]: result[contextKind(tool)] + 1 }),
    { read: 0, search: 0, list: 0 }
  );
  const summary = (["read", "search", "list"] as const)
    .filter((kind) => counts[kind] > 0)
    .map((kind) => countLabel(counts[kind], kind))
    .join(", ");

  return (
    <div className="tool-collapsible" data-expanded={open ? "true" : undefined}>
      <button data-slot="collapsible-trigger" onClick={() => setOpen((value) => !value)}>
        <div data-component="context-tool-group-trigger">
          <span data-slot="context-tool-group-title">
            <span data-slot="context-tool-group-label">
              <TextShimmer text={pending ? "Exploring" : "Explored"} active={pending} />
            </span>
            <span data-slot="context-tool-group-summary">{summary}</span>
          </span>
          <span data-slot="collapsible-arrow" className="codicon codicon-chevron-down" />
        </div>
      </button>
      {open && (
        <div data-slot="collapsible-content">
          <div data-component="context-tool-group-list">
            {tools.map((tool) => {
              const presentation = toolPresentation(tool);
              return (
                <div data-slot="context-tool-group-item" key={tool.id}>
                  <div data-component="tool-trigger">
                    <div data-slot="basic-tool-tool-trigger-content">
                      <div data-slot="basic-tool-tool-info">
                        <div data-slot="basic-tool-tool-info-structured">
                          <div data-slot="basic-tool-tool-info-main">
                            <span data-slot="basic-tool-tool-title">
                              <TextShimmer text={presentation.title} active={tool.status === "running"} />
                            </span>
                            {presentation.subtitle && (
                              <span data-slot="basic-tool-tool-subtitle">{presentation.subtitle}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ tag, children, previous }: { tag: string; children: ReactNode; previous?: boolean }): ReactNode {
  return (
    <div data-timeline-row={tag} className={previous ? "opencode-row previous-assistant-part" : "opencode-row"}>
      <div data-component="session-turn">
        <div data-slot="session-turn-message-container">{children}</div>
      </div>
    </div>
  );
}

function UserMessage({ item }: { item: Extract<TranscriptItem, { kind: "user" }> }): ReactNode {
  return (
    <TimelineRow tag="UserMessage">
      <div data-slot="session-turn-message-content" aria-live="off">
        <div data-component="user-message">
          {item.attachments && item.attachments.length > 0 && (
            <div data-slot="user-message-attachments">
              {item.attachments.map((attachment) => (
                <div data-slot="user-message-attachment" data-type="file" key={attachment.name}>
                  <div data-slot="user-message-attachment-file">
                    <span className="codicon codicon-file" />
                    <span data-slot="user-message-attachment-name">{attachment.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div data-slot="user-message-body">
            <div data-slot="user-message-text">{item.text}</div>
          </div>
        </div>
      </div>
    </TimelineRow>
  );
}

type TurnPart = { item: AssistantItem; part: AssistantPart };

function AssistantTurn({ items, streaming }: { items: AssistantItem[]; streaming: boolean }): ReactNode {
  const rows: ReactNode[] = [];
  const parts: TurnPart[] = items.flatMap((item) => item.parts
    .filter((part) => part.kind === "tool" || Boolean(part.text.trim()))
    .filter((part) => part.kind !== "tool" || toolKey(part.tool.title) !== "todowrite")
    .map((part) => ({ item, part })));
  const contextStarts = parts
    .map(({ part }, index) => part.kind === "tool" && CONTEXT_TOOLS.has(toolKey(part.tool.title)) ? index : -1)
    .filter((index) => index >= 0);
  const finalContextIndex = contextStarts.at(-1);
  let previous = false;
  for (let index = 0; index < parts.length; index += 1) {
    const { item, part } = parts[index];
    if (part.kind === "tool" && CONTEXT_TOOLS.has(toolKey(part.tool.title))) {
      const tools = [part.tool];
      while (index + 1 < parts.length) {
        const next = parts[index + 1].part;
        if (next.kind !== "tool" || !CONTEXT_TOOLS.has(toolKey(next.tool.title))) break;
        tools.push(next.tool);
        index += 1;
      }
      rows.push(
        <TimelineRow tag="AssistantPart" previous={previous} key={`context:${tools[0].id}`}>
          <div data-slot="session-turn-assistant-content">
            <ContextToolGroup tools={tools} busy={streaming && index >= (finalContextIndex ?? -1) && index === parts.length - 1} />
          </div>
        </TimelineRow>
      );
      previous = true;
      continue;
    }
    if (part.kind === "tool") {
      rows.push(
        <TimelineRow tag="AssistantPart" previous={previous} key={part.id}>
          <div data-slot="session-turn-assistant-content"><ToolPart tool={part.tool} /></div>
        </TimelineRow>
      );
      previous = true;
      continue;
    }
    if (part.kind === "reasoning") {
      rows.push(
        <TimelineRow tag="AssistantPart" previous={previous} key={part.id}>
          <div data-slot="session-turn-assistant-content">
            <ReasoningPart part={part} streaming={streaming && item.id === items.at(-1)?.id} />
          </div>
        </TimelineRow>
      );
      previous = true;
      continue;
    }
    if (part.kind !== "text" || !part.text) continue;
    rows.push(
      <TimelineRow tag="AssistantPart" previous={previous} key={part.id}>
        <div data-slot="session-turn-assistant-content">
          <TextPart part={part} streaming={streaming && item.id === items.at(-1)?.id} />
        </div>
      </TimelineRow>
    );
    previous = true;
  }

  const latest = items.at(-1);
  if (streaming && parts.length === 0 && !latest?.retry && !latest?.error) {
    rows.push(
      <TimelineRow tag="Thinking" previous={previous} key={`${items.at(-1)?.id ?? "assistant"}:thinking`}>
        <div data-slot="session-turn-thinking">
          <TextShimmer text="Thinking" />
        </div>
      </TimelineRow>
    );
  }
  if (latest?.retry) {
    rows.push(
      <TimelineRow tag="Retry" previous key={`${latest.id}:retry`}>
        <div data-slot="session-turn-retry" className="error-card">
          <span className="spinner" />
          <div>
            <div data-slot="session-turn-retry-message">{latest.retry.message.slice(0, 80)}</div>
            <div data-slot="session-turn-retry-info">Retrying · attempt {latest.retry.attempt}</div>
          </div>
        </div>
      </TimelineRow>
    );
  }
  if (latest?.error) {
    rows.push(
      <TimelineRow tag="Error" previous key={`${latest.id}:error`}>
        <div className="error-card">{latest.error.replace(/^Error:\s*/, "")}</div>
      </TimelineRow>
    );
  }
  return <>{rows}</>;
}

type TimelineTurn = {
  id: string;
  user?: Extract<TranscriptItem, { kind: "user" }>;
  body: Exclude<VisibleTimelineItem, { kind: "user" }>[];
};

function buildTurns(timeline: VisibleTimelineItem[]): TimelineTurn[] {
  const turns: TimelineTurn[] = [];
  let current: TimelineTurn | undefined;
  for (const item of timeline) {
    if (item.kind === "user") {
      current = { id: item.id, user: item, body: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { id: item.id, body: [] };
      turns.push(current);
    }
    current.body.push(item);
  }
  return turns;
}

function TimelineEvent({
  item
}: {
  item: Exclude<VisibleTimelineItem, { kind: "user" | "assistant" }>;
}): ReactNode {
  if (item.kind === "status") {
    return (
      <TimelineRow tag="Error">
        <div className={`error-card ${item.tone}`}>{item.text}</div>
      </TimelineRow>
    );
  }
  if (item.kind === "divider") {
    return (
      <TimelineRow tag="TurnDivider">
        <div data-component="compaction-part">
          <span data-slot="compaction-part-line" />
          <span data-slot="compaction-part-label">Session compacted</span>
          <span data-slot="compaction-part-line" />
        </div>
      </TimelineRow>
    );
  }
  if (item.kind === "shell") {
    return (
      <TimelineRow tag="ShellMessage">
        <div data-slot="session-turn-assistant-content">
          <ToolPart tool={{
            id: item.shellID,
            title: "shell",
            detail: item.command ? `$ ${item.command}` : "",
            status: item.status === "running" ? "running" : item.status === "exited" && (!item.exit || item.exit === 0)
              ? "success"
              : "failed",
            input: JSON.stringify({ command: item.command }),
            inputValue: { command: item.command },
            output: item.output
          }} />
        </div>
      </TimelineRow>
    );
  }
  if (item.kind === "compaction") {
    const label = item.status === "running"
      ? "Compacting session"
      : item.status === "failed"
        ? "Compaction failed"
        : "Session compacted";
    return (
      <TimelineRow tag="Compaction">
        <div data-component="compaction-message" data-status={item.status}>
          <div data-component="compaction-part">
            <span data-slot="compaction-part-line" />
            <span data-slot="compaction-part-label">
              {item.status === "running" ? <TextShimmer text={label} /> : label}
            </span>
            <span data-slot="compaction-part-line" />
          </div>
          {item.summary && <Markdown text={item.summary} streaming={item.status === "running"} />}
          {item.error && <div className="error-card">{item.error}</div>}
        </div>
      </TimelineRow>
    );
  }
  const label = item.kind === "skill"
    ? `Skill activated · ${item.name}`
    : item.kind === "synthetic"
      ? item.description || "System message"
      : "System message";
  const text = item.text;
  return (
    <TimelineRow tag="SessionEvent">
      <div data-component="session-message" data-kind={item.kind}>
        <div data-slot="session-message-label">{label}</div>
        {item.kind === "skill" && item.skill && (
          <div data-slot="session-message-detail">{item.skill}</div>
        )}
        {text && <Markdown text={text} streaming={false} />}
      </div>
    </TimelineRow>
  );
}

function PermissionPrompt({ item }: { item: Extract<TranscriptItem, { kind: "permission" }> }): ReactNode {
  const { replyPermission } = useStore();
  if (!item.pending) return null;
  return (
    <div data-component="dock-prompt" data-kind="permission">
      <div data-slot="permission-header">Permission required</div>
      <div data-slot="permission-action">{item.action}</div>
      {item.resources.map((resource) => <code key={resource}>{resource}</code>)}
      <div data-slot="permission-actions">
        <button className="btn btn-primary" onClick={() => void replyPermission(item.requestID, "once")}>Allow once</button>
        <button className="btn" onClick={() => void replyPermission(item.requestID, "always")}>Always</button>
        <button className="btn btn-danger" onClick={() => void replyPermission(item.requestID, "reject")}>Deny</button>
      </div>
    </div>
  );
}

export function OpenCodeTimeline({
  transcript,
  busy,
  lastAssistantId
}: {
  transcript: TranscriptItem[];
  busy: boolean;
  lastAssistantId: string | null;
}): ReactNode {
  const timeline = useMemo(
    () => transcript.filter((item): item is VisibleTimelineItem =>
      item.kind !== "permission" && item.kind !== "pending-input" && item.kind !== "selection" && item.kind !== "system"
    ),
    [transcript]
  );
  const turns = useMemo(() => buildTurns(timeline), [timeline]);
  const pendingPermission = [...transcript]
    .reverse()
    .find((item): item is Extract<TranscriptItem, { kind: "permission" }> => item.kind === "permission" && item.pending);

  return (
    <>
      <div data-slot="session-turn-list" className="opencode-timeline">
        {turns.map((turn, index) => {
          const assistants = turn.body.filter((item): item is AssistantItem => item.kind === "assistant");
          const live = busy && assistants.some((item) => item.id === lastAssistantId);
          return (
            <div data-component="session-turn-group" key={turn.id}>
              {turn.user && index > 0 && <div data-timeline-row="TurnGap" aria-hidden="true" />}
              {turn.user && <UserMessage item={turn.user} />}
              {assistants.length > 0 && <AssistantTurn items={assistants} streaming={live} />}
              {turn.body
                .filter((item): item is Exclude<VisibleTimelineItem, { kind: "user" | "assistant" }> =>
                  item.kind !== "assistant")
                .map((item) => <TimelineEvent item={item} key={item.id} />)}
            </div>
          );
        })}
      </div>
      {pendingPermission && <PermissionPrompt item={pendingPermission} />}
    </>
  );
}
