import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentOption,
  BackendMessage,
  CommandOption,
  FileWriteIdentity,
  ModelOption,
  PermissionReply,
  ProjectInfo,
  PromptFile,
  ProviderUsageResult,
  ReferenceOption,
  ReopenedSession,
  SessionInfo,
  SessionSelection,
  SessionSummary,
  TerminalStartResult,
  WorkspaceIdentity
} from "@shared/types";

const api = {
  platform: process.platform,
  onMessage: (cb: (msg: BackendMessage) => void): (() => void) => {
    const listener = (_e: unknown, msg: BackendMessage): void => cb(msg);
    ipcRenderer.on("shell:message", listener);
    return () => ipcRenderer.removeListener("shell:message", listener);
  },
  selectFolder: (generation: number): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:select-folder", generation),
  openSession: (dir: string, generation: number): Promise<SessionInfo> => ipcRenderer.invoke("shell:open-session", dir, generation),
  sessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke("shell:sessions"),
  openSessionById: (sessionID: string, generation: number): Promise<ReopenedSession> =>
    ipcRenderer.invoke("shell:open-session-id", sessionID, generation),
  prompt: (workspace: WorkspaceIdentity, text: string, files: PromptFile[] = []): Promise<void> =>
    ipcRenderer.invoke("shell:prompt", workspace, text, files),
  commands: (): Promise<CommandOption[]> => ipcRenderer.invoke("shell:commands"),
  runCommand: (workspace: WorkspaceIdentity, name: string, args: string = ""): Promise<void> =>
    ipcRenderer.invoke("shell:run-command", workspace, name, args),
  references: (query: string): Promise<ReferenceOption[]> =>
    ipcRenderer.invoke("shell:find-files", query),
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke("shell:select-files"),
  interrupt: (workspace: WorkspaceIdentity): Promise<void> => ipcRenderer.invoke("shell:interrupt", workspace),
  listDir: (workspace: WorkspaceIdentity, rel: string): Promise<{ path: string; type: "file" | "directory" }[]> =>
    ipcRenderer.invoke("shell:fs-list", workspace, rel),
  readFile: (workspace: WorkspaceIdentity, rel: string): Promise<string | null> =>
    ipcRenderer.invoke("shell:fs-read", workspace, rel),
  readSourceFile: (absolutePath: string): Promise<string | null> =>
    ipcRenderer.invoke("shell:source-read", absolutePath),
  writeFile: (
    workspace: WorkspaceIdentity,
    rel: string,
    content: string,
    write: FileWriteIdentity
  ): Promise<void> => ipcRenderer.invoke("shell:fs-write", workspace, rel, content, write),
  createFile: (workspace: WorkspaceIdentity, rel: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-create-file", workspace, rel),
  createDir: (workspace: WorkspaceIdentity, rel: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-create-dir", workspace, rel),
  deletePath: (workspace: WorkspaceIdentity, rel: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-delete", workspace, rel),
  renamePath: (workspace: WorkspaceIdentity, rel: string, newName: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-rename", workspace, rel, newName),
  projects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke("shell:projects"),
  models: (): Promise<ModelOption[]> => ipcRenderer.invoke("shell:models"),
  modelDefault: (): Promise<ModelOption | null> => ipcRenderer.invoke("shell:model-default"),
  switchModel: (workspace: WorkspaceIdentity, id: string, providerID: string, variant?: string): Promise<void> =>
    ipcRenderer.invoke("shell:switch-model", workspace, id, providerID, variant),
  agents: (): Promise<AgentOption[]> => ipcRenderer.invoke("shell:agents"),
  switchAgent: (workspace: WorkspaceIdentity, id: string): Promise<void> => ipcRenderer.invoke("shell:switch-agent", workspace, id),
  terminalStart: (workspace: WorkspaceIdentity): Promise<TerminalStartResult> =>
    ipcRenderer.invoke("shell:terminal-start", workspace),
  terminalInput: (workspace: WorkspaceIdentity, id: string, data: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-input", workspace, id, data),
  terminalResize: (workspace: WorkspaceIdentity, id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-resize", workspace, id, cols, rows),
  terminalStop: (workspace: WorkspaceIdentity, id: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-stop", workspace, id),
  permissionReply: (workspace: WorkspaceIdentity, requestID: string, reply: PermissionReply, sessionID: string): Promise<void> =>
    ipcRenderer.invoke("shell:permission-reply", workspace, requestID, reply, sessionID),
  state: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:state"),
  sessionSelection: (): Promise<SessionSelection | null> =>
    ipcRenderer.invoke("shell:session-selection"),
  providerUsage: (): Promise<ProviderUsageResult[]> => ipcRenderer.invoke("shell:provider-usage"),
  health: (): Promise<boolean> => ipcRenderer.invoke("shell:health")
};

export type OpenShellApi = typeof api;

contextBridge.exposeInMainWorld("openshell", api);
