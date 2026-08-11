import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { OpenShellBackend } from "./opencode";
import { TerminalManager } from "./terminal";
import type { PermissionReply } from "@shared/types";

const backend = new OpenShellBackend();
const terminals = new TerminalManager();
let win: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  win = new BrowserWindow({
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
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("before-input-event", (event, input) => {
    const mod = process.platform === "darwin" ? input.meta : input.control;
    if (input.type === "keyDown" && mod && !input.alt && !input.shift && input.key.toLowerCase() === "w") {
      event.preventDefault();
      win?.webContents.send("shell:message", { kind: "ui-command", command: "close-tab" });
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
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

  ipcMain.handle("shell:prompt", async (_e, text: string) => backend.prompt(text));

  ipcMain.handle("shell:interrupt", async () => backend.interrupt());

  ipcMain.handle("shell:fs-list", async (_e, rel: string) => backend.listDir(rel));

  ipcMain.handle("shell:fs-read", async (_e, rel: string) => backend.readFile(rel));

  ipcMain.handle("shell:fs-write", async (_e, rel: string, content: string) =>
    backend.writeFile(rel, content)
  );

  ipcMain.handle("shell:projects", async () => backend.listProjects());

  ipcMain.handle("shell:models", async () => backend.listModels());

  ipcMain.handle("shell:model-default", async () => backend.modelDefault());

  ipcMain.handle("shell:switch-model", async (_e, id: string, providerID: string) =>
    backend.switchModel(id, providerID)
  );

  ipcMain.handle("shell:permission-reply", async (_e, requestID: string, reply: PermissionReply) =>
    backend.replyPermission(requestID, reply)
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

  ipcMain.handle("shell:health", async () => backend.connect().catch(() => false));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
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
      win?.webContents.send("shell:message", msg);
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
