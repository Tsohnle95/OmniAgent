import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { ModelOption, TranscriptItem } from "@shared/types";

const OUTPUT_LIMIT = 6000;
const INPUT_LIMIT = 3000;

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

function TranscriptItemView({ item }: { item: TranscriptItem }): ReactNode {
  switch (item.kind) {
    case "user":
      return <div className="user-bubble">{item.text}</div>;
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
          ) : (
            <span className="assistant-cursor">▌</span>
          )}
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

function useElapsed(running: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) {
      setSecs(0);
      return;
    }
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return secs;
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

export function AgentPanel(): ReactNode {
  const {
    session,
    busy,
    transcript,
    models,
    currentModel,
    switchModel,
    agents,
    currentAgent,
    switchAgent,
    sendPrompt,
    stop
  } = useStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const secs = useElapsed(busy);
  const groups = useModelGroups(models);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [transcript, busy]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = (): void => {
    if (!input.trim()) return;
    void sendPrompt(input);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="agent-panel">
      <div className="agent-header">
        <div className="agent-header-row">
          <span className={`agent-dot ${busy ? "busy" : ""}`} />
          <span className="agent-title">Agent</span>
          {session && (
            <span className="agent-session" title={session.id}>
              {session.id}
            </span>
          )}
          {busy && (
            <button className="icon-btn stop" title="Stop the agent" onClick={() => void stop()}>
              ■
            </button>
          )}
        </div>
        {session && (
          <div className="agent-header-row picks">
            {agents.length > 0 && (
              <select
                className="agent-pick agent-agent"
                title="Agent"
                value={currentAgent?.id ?? ""}
                onChange={(e) => {
                  if (e.target.value) void switchAgent(e.target.value);
                }}
              >
                {!currentAgent && <option value="">Agent…</option>}
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            {models.length > 0 && (
              <select
                className="agent-pick agent-model"
                title="Model"
                value={currentModel ? `${currentModel.id}::${currentModel.providerID}` : ""}
                onChange={(e) => {
                  const [id, providerID] = e.target.value.split("::");
                  if (id && providerID) void switchModel(id, providerID);
                }}
              >
                {!currentModel && <option value="">Choose model…</option>}
                {groups.map(([provider, list]) => (
                  <optgroup key={provider} label={provider}>
                    {list.map((m) => (
                      <option key={`${m.id}::${m.providerID}`} value={`${m.id}::${m.providerID}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
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
        {transcript.map((item) => (
          <TranscriptItemView key={item.kind === "tool" ? item.tool.id : item.id} item={item} />
        ))}
      </div>

      <div className="agent-input-wrap">
        {busy && (
          <div className="agent-busy-line">
            <span className="spinner" /> working… {secs > 0 ? `${secs}s` : ""}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="agent-input"
          rows={3}
          placeholder="Tell the agent what to do… (Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="agent-input-actions">
          <span className="agent-hint">Enter to send · Shift+Enter for newline</span>
          <button className="btn btn-primary" disabled={!input.trim()} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
