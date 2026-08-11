import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentOption,
  BackendMessage,
  ModelOption,
  PermissionReply,
  ProjectInfo,
  ReopenedSession,
  SessionInfo,
  SessionSummary,
  TerminalStartResult
} from "@shared/types";

const api = {
  platform: process.platform,
  onMessage: (cb: (msg: BackendMessage) => void): (() => void) => {
    const listener = (_e: unknown, msg: BackendMessage): void => cb(msg);
    ipcRenderer.on("shell:message", listener);
    return () => ipcRenderer.removeListener("shell:message", listener);
  },
  selectFolder: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:select-folder"),
  openSession: (dir: string): Promise<SessionInfo> => ipcRenderer.invoke("shell:open-session", dir),
  sessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke("shell:sessions"),
  openSessionById: (sessionID: string): Promise<ReopenedSession> =>
    ipcRenderer.invoke("shell:open-session-id", sessionID),
  prompt: (text: string, files: string[] = []): Promise<void> =>
    ipcRenderer.invoke("shell:prompt", text, files),
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke("shell:select-files"),
  interrupt: (): Promise<void> => ipcRenderer.invoke("shell:interrupt"),
  listDir: (rel: string): Promise<{ path: string; type: "file" | "directory" }[]> =>
    ipcRenderer.invoke("shell:fs-list", rel),
  readFile: (rel: string): Promise<string | null> => ipcRenderer.invoke("shell:fs-read", rel),
  writeFile: (rel: string, content: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-write", rel, content),
  projects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke("shell:projects"),
  models: (): Promise<ModelOption[]> => ipcRenderer.invoke("shell:models"),
  modelDefault: (): Promise<ModelOption | null> => ipcRenderer.invoke("shell:model-default"),
  switchModel: (id: string, providerID: string, variant?: string): Promise<void> =>
    ipcRenderer.invoke("shell:switch-model", id, providerID, variant),
  agents: (): Promise<AgentOption[]> => ipcRenderer.invoke("shell:agents"),
  switchAgent: (id: string): Promise<void> => ipcRenderer.invoke("shell:switch-agent", id),
  terminalStart: (directory: string | null): Promise<TerminalStartResult> =>
    ipcRenderer.invoke("shell:terminal-start", directory),
  terminalInput: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-input", id, data),
  terminalResize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("shell:terminal-resize", id, cols, rows),
  terminalStop: (id: string): Promise<void> => ipcRenderer.invoke("shell:terminal-stop", id),
  permissionReply: (requestID: string, reply: PermissionReply): Promise<void> =>
    ipcRenderer.invoke("shell:permission-reply", requestID, reply),
  state: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:state"),
  health: (): Promise<boolean> => ipcRenderer.invoke("shell:health")
};

export type OpenShellApi = typeof api;

contextBridge.exposeInMainWorld("openshell", api);
