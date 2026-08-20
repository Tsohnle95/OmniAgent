import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentOption,
  BackendMessage,
  CommandOption,
  ExternalKind,
  ExternalOpenResult,
  FileWriteIdentity,
  ImportResult,
  ModelOption,
  OpenFileWorkspaceResult,
  PermissionReply,
  ProjectInfo,
  PromptFile,
  ProviderUsageResult,
  RecoveryRecord,
  ReferenceOption,
  ReopenedSession,
  SessionInfo,
  SessionSelection,
  SessionSummary,
  SessionTranscript,
  W3cDiagnostic,
  WorkspaceIdentity
} from "@shared/types";

const api = {
  platform: process.platform,
  isPackaged: process.argv.includes("--openshell-packaged"),
  onMessage: (cb: (msg: BackendMessage) => void): (() => void) => {
    const listener = (_e: unknown, msg: BackendMessage): void => cb(msg);
    ipcRenderer.on("shell:message", listener);
    return () => ipcRenderer.removeListener("shell:message", listener);
  },
  selectFolder: (generation: number): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:select-folder", generation),
  selectFile: (generation: number): Promise<OpenFileWorkspaceResult | null> => ipcRenderer.invoke("shell:select-file", generation),
  openFileWorkspace: (file: string, generation: number): Promise<OpenFileWorkspaceResult> =>
    ipcRenderer.invoke("shell:open-file", file, generation),
  openExternal: (workspace: WorkspaceIdentity, file: string): Promise<ExternalOpenResult> =>
    ipcRenderer.invoke("shell:open-external", workspace, file),
  externalKind: (file: string): Promise<ExternalKind> =>
    ipcRenderer.invoke("shell:stat-external", file),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  writeStandalone: (file: string, content: string, expectedContent: string, overwrite: boolean): Promise<void> =>
    ipcRenderer.invoke("shell:fs-write-standalone", file, content, expectedContent, overwrite),
  importExternal: (workspace: WorkspaceIdentity, destDir: string, sources: string[]): Promise<ImportResult[]> =>
    ipcRenderer.invoke("shell:fs-import", workspace, destDir, sources),
  openSession: (dir: string, generation: number): Promise<SessionInfo> => ipcRenderer.invoke("shell:open-session", dir, generation),
  sessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke("shell:sessions"),
  activeSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke("shell:active-sessions"),
  closeSession: (workspace: WorkspaceIdentity): Promise<void> => ipcRenderer.invoke("shell:close-session", workspace),
  openSessionById: (sessionID: string, generation: number): Promise<ReopenedSession> =>
    ipcRenderer.invoke("shell:open-session-id", sessionID, generation),
  sessionTranscript: (sessionID: string): Promise<SessionTranscript> =>
    ipcRenderer.invoke("shell:session-transcript", sessionID),
  prompt: (workspace: WorkspaceIdentity, text: string, files: PromptFile[] = []): Promise<void> =>
    ipcRenderer.invoke("shell:prompt", workspace, text, files),
  commands: (workspace: WorkspaceIdentity): Promise<CommandOption[]> => ipcRenderer.invoke("shell:commands", workspace),
  runCommand: (workspace: WorkspaceIdentity, name: string, args: string = ""): Promise<void> =>
    ipcRenderer.invoke("shell:run-command", workspace, name, args),
  references: (workspace: WorkspaceIdentity, query: string): Promise<ReferenceOption[]> =>
    ipcRenderer.invoke("shell:find-files", workspace, query),
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
  movePath: (workspace: WorkspaceIdentity, rel: string, newParent: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-move", workspace, rel, newParent),
  recoveryRecords: (workspace: WorkspaceIdentity): Promise<RecoveryRecord[]> =>
    ipcRenderer.invoke("shell:recovery-list", workspace),
  openRecovery: (workspace: WorkspaceIdentity, id: string): Promise<void> =>
    ipcRenderer.invoke("shell:recovery-open", workspace, id),
  acknowledgeRecovery: (workspace: WorkspaceIdentity, id: string): Promise<void> =>
    ipcRenderer.invoke("shell:recovery-acknowledge", workspace, id),
  projects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke("shell:projects"),
  models: (workspace: WorkspaceIdentity): Promise<ModelOption[]> => ipcRenderer.invoke("shell:models", workspace),
  modelDefault: (workspace: WorkspaceIdentity): Promise<ModelOption | null> => ipcRenderer.invoke("shell:model-default", workspace),
  switchModel: (workspace: WorkspaceIdentity, id: string, providerID: string, variant?: string): Promise<void> =>
    ipcRenderer.invoke("shell:switch-model", workspace, id, providerID, variant),
  agents: (workspace: WorkspaceIdentity): Promise<AgentOption[]> => ipcRenderer.invoke("shell:agents", workspace),
  switchAgent: (workspace: WorkspaceIdentity, id: string): Promise<void> => ipcRenderer.invoke("shell:switch-agent", workspace, id),
  terminalStart: (workspace: WorkspaceIdentity, id: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-start", workspace, id),
  terminalInput: (workspace: WorkspaceIdentity, id: string, data: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-input", workspace, id, data),
  terminalResize: (workspace: WorkspaceIdentity, id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-resize", workspace, id, cols, rows),
  terminalStop: (workspace: WorkspaceIdentity, id: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-stop", workspace, id),
  permissionReply: (workspace: WorkspaceIdentity, requestID: string, reply: PermissionReply, sessionID: string): Promise<void> =>
    ipcRenderer.invoke("shell:permission-reply", workspace, requestID, reply, sessionID),
  state: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:state"),
  sessionSelection: (workspace: WorkspaceIdentity): Promise<SessionSelection | null> =>
    ipcRenderer.invoke("shell:session-selection", workspace),
  providerUsage: (): Promise<ProviderUsageResult[]> => ipcRenderer.invoke("shell:provider-usage"),
  health: (): Promise<boolean> => ipcRenderer.invoke("shell:health"),
  installApp: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("shell:install-app"),
  validateW3c: (path: string, content: string): Promise<W3cDiagnostic[]> =>
    ipcRenderer.invoke("shell:validate-w3c", path, content)
};

export type OpenShellApi = typeof api;

contextBridge.exposeInMainWorld("openshell", api);
