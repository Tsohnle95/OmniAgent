import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

function toolPresentation(tool: ToolCallView): { title: string; subtitle: string; args: string[]; path?: string } {
  const name = tool.title.toLowerCase();
  const input = parseInput(tool.input);
  let title = titleCase(tool.title);
  let subtitle = tool.detail.replace(/^\$\s*/, "");
  let path: string | undefined;
  if (name === "read") {
    title = "Read";
    path = typeof input.filePath === "string" ? input.filePath : tool.paths?.[0];
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
    path = typeof input.filePath === "string" ? input.filePath : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "write") {
    title = "Write";
    path = typeof input.filePath === "string" ? input.filePath : tool.paths?.[0];
    subtitle = fileName(path);
  } else if (name === "patch" || name === "apply_patch") {
    title = "Patch";
  } else if (name === "question") {
    title = "Questions";
  }
  const skipped = new Set(["description", "query", "url", "filePath", "path", "pattern", "name", "command"]);
  const args = Object.entries(input)
    .filter(([key, child]) => !skipped.has(key) && ["string", "number", "boolean"].includes(typeof child))
    .map(([key, child]) => `${key}=${String(child)}`)
    .slice(0, 3);
  return { title, subtitle, args, path };
}

function ToolPart({ tool }: { tool: ToolCallView }): ReactNode {
  const { openFile } = useStore();
  const [open, setOpen] = useState(tool.status === "failed");
  const presentation = toolPresentation(tool);
  const output = tool.output ?? "";
  const expandable = tool.status !== "running" && output.length > 0;
  const truncated = output.length > OUTPUT_LIMIT;
  const activateSubtitle = (): void => {
    if (presentation.path) void openFile(presentation.path);
  };

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
            <pre data-component="tool-output" data-error={tool.status === "failed" ? "true" : undefined}>
              {truncated ? `${output.slice(0, OUTPUT_LIMIT)}\n… (truncated)` : output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function contextKind(tool: ToolCallView): "read" | "search" | "list" {
  const name = tool.title.toLowerCase();
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

function reasoningHeading(text: string): string {
  const markdown = text.replace(/\r\n?/g, "\n");
  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]?.replace(/<[^>]+>/g, " ");
  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)?.[1];
  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)?.[1];
  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)?.[1];
  return (html ?? atx ?? setext ?? strong ?? "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim();
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

function AssistantMessage({ item, streaming }: { item: AssistantItem; streaming: boolean }): ReactNode {
  const rows: ReactNode[] = [];
  const parts = item.parts.filter((part) => part.kind !== "reasoning");
  let previous = false;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.kind === "tool" && CONTEXT_TOOLS.has(part.tool.title.toLowerCase())) {
      const tools = [part.tool];
      while (index + 1 < parts.length) {
        const next = parts[index + 1];
        if (next.kind !== "tool" || !CONTEXT_TOOLS.has(next.tool.title.toLowerCase())) break;
        tools.push(next.tool);
        index += 1;
      }
      rows.push(
        <TimelineRow tag="AssistantPart" previous={previous} key={`context:${tools[0].id}`}>
          <div data-slot="session-turn-assistant-content">
            <ContextToolGroup tools={tools} busy={streaming} />
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
    if (!part.text) continue;
    rows.push(
      <TimelineRow tag="AssistantPart" previous={previous} key={part.id}>
        <div data-slot="session-turn-assistant-content">
          <TextPart part={part} streaming={streaming} />
        </div>
      </TimelineRow>
    );
    previous = true;
  }

  if (streaming) {
    const heading = item.parts
      .filter((part): part is Extract<AssistantPart, { kind: "reasoning" }> => part.kind === "reasoning")
      .map((part) => reasoningHeading(part.text))
      .find(Boolean);
    rows.push(
      <TimelineRow tag="Thinking" previous={previous} key={`${item.id}:thinking`}>
        <div data-slot="session-turn-thinking">
          <TextShimmer text="Thinking" />
          {heading && <span className="session-turn-thinking-heading">{heading}</span>}
        </div>
      </TimelineRow>
    );
  }
  if (item.retry) {
    rows.push(
      <TimelineRow tag="Retry" previous key={`${item.id}:retry`}>
        <div data-slot="session-turn-retry" className="error-card">
          <span className="spinner" />
          <div>
            <div data-slot="session-turn-retry-message">{item.retry.message.slice(0, 80)}</div>
            <div data-slot="session-turn-retry-info">Retrying · attempt {item.retry.attempt}</div>
          </div>
        </div>
      </TimelineRow>
    );
  }
  if (item.error) {
    rows.push(
      <TimelineRow tag="Error" previous key={`${item.id}:error`}>
        <div className="error-card">{item.error.replace(/^Error:\s*/, "")}</div>
      </TimelineRow>
    );
  }
  return <>{rows}</>;
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
    () => transcript.filter((item) => item.kind !== "permission"),
    [transcript]
  );
  const pendingPermission = [...transcript]
    .reverse()
    .find((item): item is Extract<TranscriptItem, { kind: "permission" }> => item.kind === "permission" && item.pending);

  return (
    <>
      <div data-slot="session-turn-list" className="opencode-timeline">
        {timeline.map((item, index) => (
          <Fragment key={item.id}>
            {item.kind === "user" && index > 0 && <div data-timeline-row="TurnGap" aria-hidden="true" />}
            {item.kind === "user" && <UserMessage item={item} />}
            {item.kind === "assistant" && (
              <AssistantMessage item={item} streaming={busy && item.id === lastAssistantId} />
            )}
            {item.kind === "status" && (
              <TimelineRow tag="Error">
                <div className={`error-card ${item.tone}`}>{item.text}</div>
              </TimelineRow>
            )}
            {item.kind === "divider" && (
              <TimelineRow tag="TurnDivider">
                <div data-component="compaction-part">
                  <span data-slot="compaction-part-line" />
                  <span data-slot="compaction-part-label">Session compacted</span>
                  <span data-slot="compaction-part-line" />
                </div>
              </TimelineRow>
            )}
          </Fragment>
        ))}
      </div>
      {pendingPermission && <PermissionPrompt item={pendingPermission} />}
    </>
  );
}
