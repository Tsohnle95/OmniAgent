export interface SessionInfo {
  id: string;
  directory: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  updatedAt: number;
}

export interface ReopenedSession {
  session: SessionInfo;
  transcript: TranscriptItem[];
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
}

export interface AgentOption {
  id: string;
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
  startedAt?: number;
  duration?: number;
  paths?: string[];
}

export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; messageID: string; text: string; reasoning: string; reasoningOpen: boolean }
  | { kind: "tool"; tool: ToolCallView }
  | {
      kind: "permission";
      id: string;
      requestID: string;
      action: string;
      resources: string[];
      pending: boolean;
      resolvedWith?: PermissionReply;
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
}

export type BackendMessage =
  | BackendMessageBase
  | { kind: "terminal-data"; terminal: TerminalData }
  | { kind: "terminal-exit"; terminal: TerminalExit };
