import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from "electron";
import path from "node:path";
import { OpenShellBackend } from "./opencode";
import { TerminalManager } from "./terminal";
import type { PermissionReply } from "@shared/types";

const backend = new OpenShellBackend();
const terminals = new TerminalManager();
let win: BrowserWindow | null = null;
let inspectPickerActive = false;

const INSPECT_HIGHLIGHT = {
  showInfo: true,
  showStyles: true,
  contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
  paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
  borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
  marginColor: { r: 246, g: 178, b: 107, a: 0.66 }
} as const;

async function startInspectPicker(wc: WebContents): Promise<void> {
  if (inspectPickerActive) return;
  inspectPickerActive = true;
  if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: "bottom" });
  const dtc = wc.devToolsWebContents;
  if (dtc && dtc.isLoading()) {
    await new Promise<void>((resolve) => dtc.once("dom-ready", () => resolve()));
  }
  wc.focus();
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    await wc.debugger.sendCommand("DOM.enable");
    await wc.debugger.sendCommand("Overlay.enable");
    await wc.debugger.sendCommand("Overlay.setInspectMode", {
      mode: "searchForNode",
      highlightConfig: INSPECT_HIGHLIGHT
    });
  } catch (err) {
    console.error("inspect picker failed:", err);
    inspectPickerActive = false;
  }
}

async function selectPickedNode(wc: WebContents, backendNodeId: number): Promise<void> {
  try {
    const { model } = await wc.debugger.sendCommand("DOM.getBoxModel", { backendNodeId });
    const q = model.content;
    const x = Math.round((Math.min(q[0], q[2], q[4], q[6]) + Math.max(q[0], q[2], q[4], q[6])) / 2);
    const y = Math.round((Math.min(q[1], q[3], q[5], q[7]) + Math.max(q[1], q[3], q[5], q[7])) / 2);
    wc.inspectElement(x, y);
  } catch (err) {
    console.error("selectPickedNode:", err);
  }
}

function stopInspectPicker(wc: WebContents): void {
  if (!inspectPickerActive) return;
  inspectPickerActive = false;
  if (!wc.debugger.isAttached()) return;
  void wc.debugger.sendCommand("Overlay.setInspectMode", { mode: "none" }).catch(() => {});
}

function createWindow(): BrowserWindow {
  const newWin = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: "OpenShell",
    backgroundColor: "#111114",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    movable: true,
    resizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win = newWin;
  inspectPickerActive = false;
  const wc = newWin.webContents;

  newWin.on("closed", () => {
    if (win === newWin) win = null;
  });

  newWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  wc.debugger.on("message", (_e, method, params) => {
    if (method === "Overlay.inspectNodeRequested") {
      const backendNodeId = (params as { backendNodeId?: number }).backendNodeId;
      stopInspectPicker(wc);
      if (typeof backendNodeId === "number") void selectPickedNode(wc, backendNodeId);
    } else if (method === "Overlay.inspectModeCanceled") {
      stopInspectPicker(wc);
    }
  });
  wc.on("devtools-closed", () => stopInspectPicker(wc));

  newWin.webContents.on("before-input-event", (event, input) => {
    const mod = process.platform === "darwin" ? input.meta : input.control;
    if (input.type === "keyDown" && mod && !input.alt && !input.shift && input.key.toLowerCase() === "w") {
      event.preventDefault();
      win?.webContents.send("shell:message", { kind: "ui-command", command: "toggle-word-wrap" });
      return;
    }
    if (input.type === "keyDown" && !mod && !input.alt && !input.shift && input.key === "F12") {
      event.preventDefault();
      if (newWin.webContents.isDevToolsOpened()) {
        newWin.webContents.closeDevTools();
      } else {
        newWin.webContents.openDevTools({ mode: "bottom" });
      }
      return;
    }
    if (input.type === "keyDown" && mod && input.shift && !input.alt && input.key.toLowerCase() === "c") {
      event.preventDefault();
      if (inspectPickerActive) {
        stopInspectPicker(newWin.webContents);
      } else {
        void startInspectPicker(newWin.webContents);
      }
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void newWin.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void newWin.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return newWin;
}

function registerIpc(): void {
  ipcMain.handle("shell:select-folder", async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(parent ?? win!, {
      title: "Open a repository folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return backend.openSession(result.filePaths[0]);
  });

  ipcMain.handle("shell:open-session", async (_e, dir: string) => backend.openSession(dir));

  ipcMain.handle("shell:sessions", async () => backend.listSessions());

  ipcMain.handle("shell:open-session-id", async (_e, sessionID: string) =>
    backend.openSessionById(sessionID)
  );

  ipcMain.handle("shell:prompt", async (_e, text: string, files: string[] = []) =>
    backend.prompt(text, files)
  );

  ipcMain.handle("shell:select-files", async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(parent ?? win!, {
      title: "Attach files",
      properties: ["openFile", "multiSelections"]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("shell:interrupt", async () => backend.interrupt());

  ipcMain.handle("shell:fs-list", async (_e, rel: string) => backend.listDir(rel));

  ipcMain.handle("shell:fs-read", async (_e, rel: string) => backend.readFile(rel));

  ipcMain.handle("shell:fs-write", async (_e, rel: string, content: string) =>
    backend.writeFile(rel, content)
  );

  ipcMain.handle("shell:fs-create-file", async (_e, rel: string) => backend.createFile(rel));

  ipcMain.handle("shell:fs-create-dir", async (_e, rel: string) => backend.createDir(rel));

  ipcMain.handle("shell:fs-delete", async (_e, rel: string) => backend.deletePath(rel));

  ipcMain.handle("shell:fs-rename", async (_e, rel: string, newName: string) =>
    backend.renamePath(rel, newName)
  );

  ipcMain.handle("shell:projects", async () => backend.listProjects());

  ipcMain.handle("shell:models", async () => backend.listModels());

  ipcMain.handle("shell:model-default", async () => backend.modelDefault());

  ipcMain.handle("shell:switch-model", async (_e, id: string, providerID: string, variant?: string) =>
    backend.switchModel(id, providerID, variant)
  );

  ipcMain.handle("shell:permission-reply", async (
    _e,
    requestID: string,
    reply: PermissionReply,
    sessionID?: string
  ) =>
    backend.replyPermission(requestID, reply, sessionID)
  );

  ipcMain.handle("shell:agents", async () => backend.listAgents());

  ipcMain.handle("shell:switch-agent", async (_e, id: string) => backend.switchAgent(id));

  ipcMain.handle("shell:terminal-start", async (_e, directory: string | null) => {
    const id = await terminals.start(directory);
    return { id };
  });

  ipcMain.handle("shell:terminal-input", async (_e, id: string, data: string) => {
    terminals.write(id, data);
  });

  ipcMain.handle("shell:terminal-resize", async (_e, id: string, cols: number, rows: number) => {
    terminals.resize(id, cols, rows);
  });

  ipcMain.handle("shell:terminal-stop", async (_e, id: string) => {
    terminals.stop(id);
  });

  ipcMain.handle("shell:state", async () => backend.getState());

  ipcMain.handle("shell:session-selection", async () => backend.sessionSelection());

  ipcMain.handle("shell:health", async () => backend.connect().catch(() => false));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection:", reason);
  });

  app.on("second-instance", () => {
    if (!win) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setName("OpenShell");
    backend.start();
    const fwd = (msg: unknown): void => {
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
      win.webContents.send("shell:message", msg);
    };
    backend.onMessage(fwd);
    terminals.onMessage(fwd);
    registerIpc();
    createWindow();
    void backend.connect().catch(() => {});

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        backend.start();
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend.stop();
  terminals.stopAll();
});
