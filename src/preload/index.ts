import { contextBridge, ipcRenderer } from "electron";
import type { BackendMessage, PermissionReply, ProjectInfo, SessionInfo } from "@shared/types";

const api = {
  onMessage: (cb: (msg: BackendMessage) => void): (() => void) => {
    const listener = (_e: unknown, msg: BackendMessage): void => cb(msg);
    ipcRenderer.on("shell:message", listener);
    return () => ipcRenderer.removeListener("shell:message", listener);
  },
  selectFolder: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:select-folder"),
  openSession: (dir: string): Promise<SessionInfo> => ipcRenderer.invoke("shell:open-session", dir),
  prompt: (text: string): Promise<void> => ipcRenderer.invoke("shell:prompt", text),
  interrupt: (): Promise<void> => ipcRenderer.invoke("shell:interrupt"),
  listDir: (rel: string): Promise<{ path: string; type: "file" | "directory" }[]> =>
    ipcRenderer.invoke("shell:fs-list", rel),
  readFile: (rel: string): Promise<string | null> => ipcRenderer.invoke("shell:fs-read", rel),
  writeFile: (rel: string, content: string): Promise<void> =>
    ipcRenderer.invoke("shell:fs-write", rel, content),
  projects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke("shell:projects"),
  permissionReply: (requestID: string, reply: PermissionReply): Promise<void> =>
    ipcRenderer.invoke("shell:permission-reply", requestID, reply),
  state: (): Promise<SessionInfo | null> => ipcRenderer.invoke("shell:state"),
  health: (): Promise<boolean> => ipcRenderer.invoke("shell:health")
};

export type OpenShellApi = typeof api;

contextBridge.exposeInMainWorld("openshell", api);
