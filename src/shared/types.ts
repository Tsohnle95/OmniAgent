export interface SessionInfo {
  id: string;
  directory: string;
  parentID?: string;
  title?: string;
  agent?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  updatedAt: number;
  parentID?: string;
  agent?: string;
}

export interface ReopenedSession {
  session: SessionInfo;
  transcript: TranscriptItem[];
  todos: TodoItem[];
}

export interface SessionUsage {
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}

export type ProviderUsageStatus = "ok" | "stale" | "unavailable" | "unauthenticated" | "unsupported";

export interface UsageWindow {
  id: string;
  label: string;
  usedPercent: number;
  windowMinutes: number | null;
  resetsAt: number | null;
}

export interface ProviderUsageCredits {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
  label?: string;
  total?: number | null;
  used?: number | null;
  remaining?: number | null;
  overagePermitted?: boolean;
}

export interface ProviderUsageSnapshot {
  windows: UsageWindow[];
  credits: ProviderUsageCredits | null;
  planType: string | null;
  updatedAt: number;
}

export interface ProviderUsageError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ProviderUsageResult {
  provider: string;
  displayName: string;
  status: ProviderUsageStatus;
  snapshot: ProviderUsageSnapshot | null;
  error?: ProviderUsageError | null;
}

export interface TreeEntry {
  path: string;
  type: "file" | "directory";
}

export interface FileUpdate {
  path: string;
  baseline: string | null;
  content: string | null;
  deleted: boolean;
}

export interface ProjectInfo {
  directory: string;
  name: string;
}

export interface ModelOption {
  id: string;
  providerID: string;
  name: string;
  variants?: string[];
  variant?: string;
}

export interface AgentOption {
  id: string;
  name: string;
  color?: string;
}

export interface CommandOption {
  name: string;
  description?: string;
}

export interface ReferenceOption {
  name: string;
  path: string;
  rel: string;
  description?: string;
}

export interface PromptFile {
  path: string;
  mention?: { start: number; end: number; text: string };
}

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority?: string;
}

export interface SessionSelection {
  model?: ModelOption;
  agent?: AgentOption;
}

export type ApprovalMode = "ask" | "approve";

export interface UserAttachment {
  name: string;
}

export type PermissionReply = "once" | "always" | "reject";

export interface TerminalStartResult {
  id: string;
}

export interface TerminalData {
  id: string;
  data: string;
}

export interface TerminalExit {
  id: string;
  exitCode: number | null;
}

export interface ToolCallView {
  id: string;
  title: string;
  detail: string;
  status: "running" | "success" | "failed";
  input?: string;
  output?: string;
  progress?: string;
  startedAt?: number;
  duration?: number;
  paths?: string[];
  metadata?: Record<string, unknown>;
  inputValue?: unknown;
  content?: ToolContentView[];
  executed?: boolean;
  providerState?: Record<string, unknown>;
  providerResultState?: Record<string, unknown>;
}

export type ToolContentView =
  | { type: "text"; text: string }
  | { type: "file"; uri: string; mime: string; name?: string };

export type AssistantPartView =
  | { kind: "text"; id: string; text: string; complete: boolean }
  | { kind: "reasoning"; id: string; text: string; complete: boolean }
  | { kind: "tool"; id: string; tool: ToolCallView };

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; attachments?: UserAttachment[] }
  | {
      kind: "pending-input";
      id: string;
      inputType: "user" | "synthetic";
      text: string;
      attachments?: UserAttachment[];
      description?: string;
    }
  | {
      kind: "assistant";
      id: string;
      messageID: string;
      parts: AssistantPartView[];
      completed: boolean;
      retry?: { attempt: number; message: string; next?: number };
      error?: string;
    }
  | {
      kind: "permission";
      id: string;
      requestID: string;
      action: string;
      resources: string[];
      pending: boolean;
      resolvedWith?: PermissionReply;
    }
  | {
      kind: "selection";
      id: string;
      selection: "agent" | "model";
      title: string;
      detail?: string;
    }
  | { kind: "synthetic"; id: string; text: string; description?: string }
  | { kind: "system"; id: string; text: string }
  | { kind: "skill"; id: string; skill: string; name: string; text: string }
  | {
      kind: "shell";
      id: string;
      shellID: string;
      command: string;
      status: "running" | "exited" | "timeout" | "killed";
      output?: string;
      exit?: number | string;
    }
  | {
      kind: "compaction";
      id: string;
      status: "running" | "completed" | "failed";
      reason: "auto" | "manual";
      summary: string;
      recent?: string;
      error?: string;
    }
  | { kind: "status"; id: string; text: string; tone: "info" | "success" | "error" }
  | { kind: "divider"; id: string };

export interface Tab {
  path: string;
  name: string;
  content: string;
  saved: string;
  baseline: string | null;
  deleted: boolean;
  dirty: boolean;
  stale: boolean;
  mode: "edit" | "diff";
  binary: boolean;
}

export interface AgentFileState {
  baseline: string | null;
  content: string | null;
  deleted: boolean;
}

export interface BackendMessageBase {
  kind: "event" | "file-update" | "session" | "ui-command";
  type?: string;
  data?: unknown;
  file?: FileUpdate;
  session?: SessionInfo;
  command?: string;
  path?: string;
  line?: number;
}

export type BackendMessage =
  | BackendMessageBase
  | { kind: "terminal-data"; terminal: TerminalData }
  | { kind: "terminal-exit"; terminal: TerminalExit };
