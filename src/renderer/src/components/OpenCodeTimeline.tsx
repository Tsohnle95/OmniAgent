import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { ToolCallView, TranscriptItem, SessionSummary, SessionInfo } from "@shared/types";
import { ExternalLink } from "./ExternalLink";

const OUTPUT_LIMIT = 6000;
const CONTEXT_TOOLS = new Set(["read", "glob", "grep", "list"]);
const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_IMMEDIATE = 512;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;

type AssistantItem = Extract<TranscriptItem, { kind: "assistant" }>;
type AssistantPart = AssistantItem["parts"][number];
type VisibleTimelineItem = Exclude<TranscriptItem, { kind: "permission" | "pending-input" | "selection" | "system" }>;

function isInternalSystemReminder(item: Extract<TranscriptItem, { kind: "synthetic" }>): boolean {
  return /<system-reminder(?:\s[^>]*)?>[\s\S]*<\/system-reminder>/i.test(item.text);
}

const AGENT_TONES: Record<string, string> = {
  build: "#a9c3ff",
  explore: "#f0dfa8",
  plan: "#f5a8cf",
  review: "#a5e0b8",
  writer: "#a8a3f0"
};

const AGENT_PALETTE = [
  "#d97757", "#e68a68", "#e0af68", "#e49ac7", "#6fc3df", "#4cc38a",
  "#f0b14f", "#ff9ae2", "#7fd9e8", "#9bcd97", "#ff8b85", "#e0af68"
];

function agentTone(name: string, configured?: string): string {
  const aliases: Record<string, string> = {
    primary: "#e68a68",
    secondary: "#9aa1ad",
    accent: "#e68a68",
    success: "#4cc38a",
    warning: "#e0af68",
    error: "#f16d6b",
    info: "#6fc3df"
  };
  if (configured) return aliases[configured] ?? configured;
  const key = name.toLowerCase();
  if (AGENT_TONES[key]) return AGENT_TONES[key];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AGENT_PALETTE[hash % AGENT_PALETTE.length];
}

function TextShimmer({ text, active = true, tone = "default" }: { text: string; active?: boolean; tone?: "default" | "thinking" }): ReactNode {
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
    <span data-component="text-shimmer" data-tone={tone} data-active={active ? "true" : "false"} aria-label={text}>
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

const CODE_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\b(?:as|async|await|break|case|catch|class|const|continue|def|else|export|extends|for|from|function|if|import|in|interface|let|new|of|return|static|switch|throw|try|type|var|while|with|yield)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\())/g;
const CODE_KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "else", "export",
  "extends", "for", "from", "function", "if", "import", "in", "interface", "let", "new", "of", "return",
  "static", "switch", "throw", "try", "type", "var", "while", "with", "yield"
]);

function highlightCode(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CODE_TOKEN_PATTERN)) {
    const value = match[0];
    const index = match.index ?? cursor;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const kind = value.startsWith("//") || value.startsWith("/*") || value.startsWith("#")
      ? "comment"
      : value.startsWith("\"") || value.startsWith("'") || value.startsWith("`")
        ? "string"
        : /^\d/.test(value)
          ? "number"
          : CODE_KEYWORDS.has(value)
            ? "keyword"
            : "function";
    nodes.push(<span data-code-token={kind} key={`${index}:${kind}`}>{value}</span>);
    cursor = index + value.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ExternalLink,
  code({ children, className }) {
    const value = String(children ?? "");
    const block = Boolean(className) || value.includes("\n");
    const codeText = value.replace(/\n$/, "");
    return (
      block ? (
        <>
          <code className={className} data-code-language={className?.match(/language-([\w+-]+)/)?.[1] ?? "text"}>
            {highlightCode(codeText)}
          </code>
          <CopyResponse text={codeText} target="code" />
        </>
      ) : (
        <code className={className} data-code-language={className?.match(/language-([\w+-]+)/)?.[1] ?? "text"}>
          {children}
        </code>
      )
    );
  }
};

function Markdown({ text, streaming }: { text: string; streaming: boolean }): ReactNode {
  const value = usePacedText(text, streaming);
  if (!value) return null;
  return (
    <div data-component="markdown" data-streaming={streaming ? "true" : "false"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{value}</ReactMarkdown>
    </div>
  );
}

function CopyResponse({ text, target = "response" }: { text: string; target?: "response" | "code" }): ReactNode {
  const [copied, setCopied] = useState(false);
  const label = target === "code" ? "code" : "response";
  const copy = async (): Promise<void> => {
    if (!text) return;
    const ok = await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      data-slot={target === "code" ? "code-block-copy-button" : "text-part-copy-button"}
      className="icon-btn"
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
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
    <div data-component="text-part" data-copyable={!streaming ? "true" : undefined} data-timeline-part-id={part.id}>
      {!streaming && (
        <div data-slot="text-part-copy-wrapper">
          <CopyResponse text={part.text} />
        </div>
      )}
      <div data-slot="text-part-body">
        <Markdown text={part.text} streaming={streaming && !part.complete} />
      </div>
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
        <span data-slot="reasoning-part-title"><TextShimmer text="Thinking" active={active} tone="thinking" /></span>
      </button>
      {open && (
        <div data-slot="reasoning-part-content" id={contentID} onClick={() => setOpen(false)}>
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

interface SubagentRef {
  id: string;
  agent: string;
  description: string;
  state: string;
}

function parseSubagentTag(text: string): SubagentRef | null {
  const match = /<subagent\b([^>]*?)\/?>[\s\S]*?(?:<\/subagent>|$)/i.exec(text);
  if (!match) return null;
  const attrs = match[1] ?? "";
  const attr = (name: string): string => new RegExp(`${name}="([^"]*)"`, "i").exec(attrs)?.[1] ?? "";
  const id = attr("id");
  if (!id) return null;
  return { id, agent: attr("agent"), description: attr("description"), state: attr("state") };
}

function parseLegacyTaskText(text: string): SubagentRef | null {
  const agent = /(?:^|\n)\s*agent\s*=\s*([^\s]+)/i.exec(text)?.[1] ?? "";
  if (!agent) return null;
  const prompt = /(?:^|\n)\s*prompt\s*=\s*(.+)$/im.exec(text)?.[1]?.trim() ?? "";
  return { id: "", agent, description: prompt, state: "" };
}

function matchChildSession(
  sessions: SessionSummary[],
  parentID: string | undefined,
  criteria: { description?: string; agent?: string }
): string {
  if (!parentID) return "";
  let candidates = sessions.filter((candidate) => candidate.parentID === parentID);
  if (criteria.description) {
    const described = candidates.filter((candidate) => candidate.title.startsWith(criteria.description!));
    if (described.length > 0) candidates = described;
  }
  if (criteria.agent) {
    const key = criteria.agent.toLowerCase();
    const byAgent = candidates.filter((candidate) =>
      candidate.agent?.toLowerCase() === key || candidate.title.includes(`@${criteria.agent}`)
    );
    if (byAgent.length > 0) candidates = byAgent;
  }
  return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? "";
}

function subagentChildID(ref: SubagentRef, sessions: SessionSummary[], parentID: string | undefined): string {
  if (ref.id) return ref.id;
  return matchChildSession(sessions, parentID, {
    ...(ref.agent ? { agent: ref.agent } : {}),
    ...(ref.description ? { description: ref.description.slice(0, 60) } : {})
  });
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

interface EditFileEntry {
  file: string;
  patch?: string;
  status?: string;
  additions?: number;
  deletions?: number;
}

function editFileEntries(tool: ToolCallView): EditFileEntry[] {
  const files = tool.metadata?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((entry): EditFileEntry[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.file !== "string" || !record.file) return [];
    return [{
      file: record.file,
      ...(typeof record.patch === "string" && record.patch ? { patch: record.patch } : {}),
      ...(typeof record.status === "string" && record.status ? { status: record.status } : {}),
      ...(typeof record.additions === "number" ? { additions: record.additions } : {}),
      ...(typeof record.deletions === "number" ? { deletions: record.deletions } : {})
    }];
  });
}

const PATCH_HEADER_PATTERN = /^(Index: |={4,}|--- |\+\+\+ )/;

function patchBody(patch: string): string[] {
  const lines = patch.split("\n");
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  let hunkStarted = false;
  return lines.filter((line) => {
    if (line.startsWith("@@")) {
      hunkStarted = true;
      return true;
    }
    return hunkStarted || !PATCH_HEADER_PATTERN.test(line);
  });
}

function PatchDiff({ patch }: { patch: string }): ReactNode {
  return (
    <div data-component="patch-diff">
      {patchBody(patch).map((line, index) => (
        <div
          data-component="patch-diff-line"
          data-kind={line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "context"}
          key={index}
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}

function isEditCardTool(tool: ToolCallView): boolean {
  return ["edit", "patch", "apply_patch"].includes(toolKey(tool.title));
}

function EditToolCard({ tool, session }: { tool: ToolCallView; session: SessionInfo | null }): ReactNode {
  const { openFile, focusSession } = useStore();
  const [open, setOpen] = useState(false);
  const files = editFileEntries(tool);
  const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const path = files[0]?.file ?? tool.paths?.[0];
  const expandable = files.some((file) => file.patch);
  if (files.length === 0) return <ToolPart tool={tool} session={session} />;
  const activatePath = (): void => {
    if (!path) return;
    if (session) focusSession?.(session.id);
    void openFile(path);
  };
  return (
    <div data-component="edit-tool-card" data-timeline-part-id={tool.id}>
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
                      <TextShimmer text={titleCase(tool.title)} active={tool.status === "running"} />
                    </span>
                    {path && (
                      <span
                        data-slot="basic-tool-tool-subtitle"
                        className="clickable"
                        title={`${path} · open in editor`}
                        onClick={(event) => {
                          event.stopPropagation();
                          activatePath();
                        }}
                      >
                        {path}
                      </span>
                    )}
                    {files.length > 1 && (
                      <span data-slot="basic-tool-tool-arg">{files.length} files</span>
                    )}
                    {(additions > 0 || deletions > 0) && (
                      <span data-slot="edit-tool-stats">
                        {additions > 0 && <span data-slot="edit-stat-add">+{additions}</span>}
                        {deletions > 0 && <span data-slot="edit-stat-del">-{deletions}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {expandable && <span data-slot="collapsible-arrow" className="codicon codicon-chevron-down" />}
          </div>
        </button>
        {expandable && open && (
          <div data-slot="collapsible-content">
            {files.map((file) => (
              <div data-component="edit-tool-file" key={file.file}>
                {(files.length > 1 || file.status) && (
                  <div data-slot="edit-tool-file-head">
                    <span data-slot="edit-tool-file-path">{file.file}</span>
                    {file.status && <span data-slot="edit-tool-file-status">{file.status}</span>}
                    {(file.additions ?? 0) > 0 && <span data-slot="edit-stat-add">+{file.additions}</span>}
                    {(file.deletions ?? 0) > 0 && <span data-slot="edit-stat-del">-{file.deletions}</span>}
                  </div>
                )}
                {file.patch && <PatchDiff patch={file.patch} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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

function TaskTool({ tool, session }: { tool: ToolCallView; session: SessionInfo | null }): ReactNode {
  const { agents, sessions, reopenSession } = useStore();
  const input = parseInput(tool.input);
  const requested = typeof input.agent === "string"
    ? input.agent
    : typeof input.subagent_type === "string"
      ? input.subagent_type
      : "";
  const configured = agents.find((agent) =>
    agent.id.toLowerCase() === requested.toLowerCase() || agent.name.toLowerCase() === requested.toLowerCase()
  );
  const description = typeof input.description === "string" && input.description
    ? input.description
    : typeof input.prompt === "string"
      ? input.prompt.trim()
      : "";
  const metadataSession = typeof tool.metadata?.sessionId === "string"
    ? tool.metadata.sessionId
    : typeof tool.metadata?.sessionID === "string"
      ? tool.metadata.sessionID
      : "";
  const fallbackSession = matchChildSession(sessions, session?.id, {
    ...(description ? { description } : {}),
    ...(requested ? { agent: requested } : {})
  });
  const childSession = metadataSession || fallbackSession || "";
  const resolved = sessions.find((candidate) => candidate.id === childSession);
  const agentName = resolved?.agent ?? configured?.name ?? requested;
  const title = resolved?.title.trim()
    ? resolved.title
    : agentName
      ? titleCase(agentName)
      : "Subagent";
  const detail = description || childSession;
  const subtitle = tool.metadata?.background === true && detail ? `${detail} (background)` : detail;
  const running = tool.status === "running";
  const style = { "--task-agent-color": agentTone(agentName || requested, configured?.color) } as CSSProperties;
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
            {agentName && titleCase(agentName) !== title && (
              <span data-component="task-tool-agent">@{agentName}</span>
            )}
            {subtitle && <span data-slot="basic-tool-tool-subtitle">{subtitle}</span>}
          </div>
        </div>
        {childSession && <span className="codicon codicon-chevron-right" data-slot="task-tool-open" />}
      </button>
    </div>
  );
}

function SubagentLink({ item, session }: { item: Extract<TranscriptItem, { kind: "synthetic" }>; session: SessionInfo | null }): ReactNode {
  const { agents, sessions, reopenSession } = useStore();
  const ref = parseSubagentTag(item.text) ?? parseLegacyTaskText(item.text);
  const childID = ref ? subagentChildID(ref, sessions, session?.id) : "";
  const resolved = sessions.find((candidate) => candidate.id === childID);
  const configured = ref?.agent
    ? agents.find((agent) =>
        agent.id.toLowerCase() === ref.agent.toLowerCase() || agent.name.toLowerCase() === ref.agent.toLowerCase()
      )
    : undefined;
  const agentName = resolved?.agent ?? configured?.name ?? ref?.agent ?? "";
  const state = ref?.state ?? "";
  const failed = state === "error" || state === "cancelled";
  const running = !state || state === "running";
  const statusLabel = state ? titleCase(state) : "Running";
  const title = resolved?.title.trim()
    ? resolved.title
    : ref?.id
      ? ref.description || "Subagent"
      : agentName
        ? titleCase(agentName)
        : "Subagent";
  const detail = !ref?.id && ref?.description
    ? (ref.description.length > 100 ? `${ref.description.slice(0, 100)}…` : ref.description)
    : [agentName ? `@${agentName}` : "", statusLabel].filter(Boolean).join(" · ");
  const style = { "--task-agent-color": agentTone(agentName, configured?.color) } as CSSProperties;
  return (
    <div data-component="subagent-link-card" data-state={state || "running"} style={style} data-timeline-part-id={item.id}>
      <button
        data-component="subagent-link-surface"
        disabled={!childID}
        title={childID ? `Open ${title} session` : undefined}
        onClick={() => childID && void reopenSession(childID)}
      >
        <div data-slot="basic-tool-tool-info-structured">
          <div data-slot="basic-tool-tool-info-main">
            {running ? (
              <span data-component="task-tool-spinner"><SessionProgressIndicator /></span>
            ) : failed ? (
              <span data-component="subagent-link-state"><span className="codicon codicon-error" /></span>
            ) : (
              <span data-component="task-tool-icon"><SubagentIcon /></span>
            )}
            <span data-component="task-tool-title">{title}</span>
            {agentName && !resolved && <span data-component="task-tool-agent">@{agentName}</span>}
            {detail && <span data-slot="basic-tool-tool-subtitle">{detail}</span>}
          </div>
        </div>
        {childID && <span className="codicon codicon-chevron-right" data-slot="task-tool-open" />}
      </button>
    </div>
  );
}

function ToolPart({ tool, session }: { tool: ToolCallView; session: SessionInfo | null }): ReactNode {
  const { openFile, focusSession } = useStore();
  const [open, setOpen] = useState(tool.status === "failed");
  const presentation = toolPresentation(tool);
  const output = tool.output ?? "";
  const files = tool.content?.filter((item) => item.type === "file") ?? [];
  const expandable = tool.status !== "running" && (output.length > 0 || files.length > 0);
  const truncated = output.length > OUTPUT_LIMIT;
  const activateSubtitle = (): void => {
    if (!presentation.path) return;
    if (session) focusSession?.(session.id);
    void openFile(presentation.path);
  };

  if (toolKey(tool.title) === "todowrite") return null;
  if (toolKey(tool.title) === "task" || toolKey(tool.title) === "subagent") return <TaskTool tool={tool} session={session} />;

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
                  <ExternalLink href={file.uri} key={`${file.uri}:${file.name ?? ""}`}>
                    <span className="codicon codicon-file" />
                    <span>{file.name ?? file.uri}</span>
                    <span data-slot="tool-file-mime">{file.mime}</span>
                  </ExternalLink>
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

function AssistantTurn({ items, streaming, session }: { items: AssistantItem[]; streaming: boolean; session: SessionInfo | null }): ReactNode {
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
          <div data-slot="session-turn-assistant-content">
            {isEditCardTool(part.tool)
              ? <EditToolCard tool={part.tool} session={session} />
              : <ToolPart tool={part.tool} session={session} />}
          </div>
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

function contiguousBodyRuns(body: TimelineTurn["body"]): Array<AssistantItem[] | Exclude<VisibleTimelineItem, { kind: "user" | "assistant" }>> {
  const runs: Array<AssistantItem[] | Exclude<VisibleTimelineItem, { kind: "user" | "assistant" }>> = [];
  for (const item of body) {
    if (item.kind !== "assistant") {
      runs.push(item);
      continue;
    }
    const previous = runs.at(-1);
    if (Array.isArray(previous)) previous.push(item);
    else runs.push([item]);
  }
  return runs;
}

function TimelineEvent({
  item,
  session
}: {
  item: Exclude<VisibleTimelineItem, { kind: "user" | "assistant" }>;
  session: SessionInfo | null;
}): ReactNode {
  const { sessions } = useStore();
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
          <ToolPart session={session} tool={{
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
  if (item.kind === "synthetic") {
    const ref = parseSubagentTag(item.text) ?? parseLegacyTaskText(item.text);
    if (ref && subagentChildID(ref, sessions, session?.id)) {
      return (
        <TimelineRow tag="SubagentLink">
          <SubagentLink item={item} session={session} />
        </TimelineRow>
      );
    }
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

export function PermissionPrompt({ item, session }: { item: Extract<TranscriptItem, { kind: "permission" }>; session: SessionInfo | null }): ReactNode {
  const { replyPermission } = useStore();
  if (!item.pending) return null;
  return (
    <div data-component="dock-prompt" data-kind="permission">
      <div data-slot="permission-header">Permission required</div>
      <div data-slot="permission-action">{item.action}</div>
      {item.resources.map((resource) => <code key={resource}>{resource}</code>)}
      <div data-slot="permission-actions">
        <button className="btn btn-primary" onClick={() => void replyPermission(item.requestID, "once", session?.id)}>Allow once</button>
        <button className="btn" onClick={() => void replyPermission(item.requestID, "always", session?.id)}>Always</button>
        <button className="btn btn-danger" onClick={() => void replyPermission(item.requestID, "reject", session?.id)}>Deny</button>
      </div>
    </div>
  );
}

export function OpenCodeTimeline({
  transcript,
  busy,
  lastAssistantId,
  session
}: {
  transcript: TranscriptItem[];
  busy: boolean;
  lastAssistantId: string | null;
  session?: SessionInfo | null;
}): ReactNode {
  const activeSession = session === undefined ? useStore().session : session;
  const timeline = useMemo(
    () => transcript.filter((item): item is VisibleTimelineItem => {
      if (item.kind === "permission" || item.kind === "pending-input" || item.kind === "selection" || item.kind === "system") {
        return false;
      }
      return item.kind !== "synthetic" || !isInternalSystemReminder(item);
    }),
    [transcript]
  );
  const turns = useMemo(() => buildTurns(timeline), [timeline]);

  return (
    <div data-slot="session-turn-list" className="opencode-timeline">
      {turns.map((turn, index) => {
        return (
          <div data-component="session-turn-group" key={turn.id}>
            {turn.user && index > 0 && <div data-timeline-row="TurnGap" aria-hidden="true" />}
            {turn.user && <UserMessage item={turn.user} />}
            {contiguousBodyRuns(turn.body).map((run) => Array.isArray(run)
              ? <AssistantTurn
                  items={run}
                  streaming={busy && run.some((item) => item.id === lastAssistantId)}
                  session={activeSession}
                  key={`assistant:${run[0].id}`}
                />
              : <TimelineEvent item={run} session={activeSession} key={run.id} />)}
          </div>
        );
      })}
    </div>
  );
}
