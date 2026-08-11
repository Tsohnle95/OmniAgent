import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { OpenShellBackend } from "./opencode";
import type { PermissionReply } from "@shared/types";

const backend = new OpenShellBackend();
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

  ipcMain.handle("shell:state", async () => backend.getState());

  ipcMain.handle("shell:health", async () => backend.connect().catch(() => false));
}

app.whenReady().then(async () => {
  app.setName("OpenShell");
  await backend.connect().catch(() => {});
  backend.start();
  backend.onMessage((msg) => {
    win?.webContents.send("shell:message", msg);
  });
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  backend.stop();
  if (process.platform !== "darwin") app.quit();
});
