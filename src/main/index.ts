import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import path from "node:path";
import fsp from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { OpenShellBackend } from "./opencode";
import { TerminalManager } from "./terminal";
import {
  applicationUrl,
  isAllowedMainFrameNavigation,
  isTrustedIpcSender,
  trustedApplicationLocation,
  type TrustedApplicationLocation
} from "./security";
import { safeExternalUrl } from "@shared/url-policy";
import { validateWithW3c } from "./w3c-validation";
import type {
  FileWriteIdentity,
  PermissionReply,
  PromptFile,
  WorkspaceIdentity
} from "@shared/types";
import {
  confinedAbsolutePath,
  fileContent,
  terminalDimensions,
  terminalId,
  terminalInput,
  workspaceId
} from "./workspace-security";
import {
  activationGeneration,
  commandPayload,
  directoryPath,
  fileWriteIdentity,
  movePayload,
  optionalSelectionId,
  permissionPayload,
  promptPayload,
  queryText,
  selectionId,
  sessionId,
  workspacePath
} from "./ipc-schema";

const backend = new OpenShellBackend();
const terminals = new TerminalManager();
let win: BrowserWindow | null = null;
let trustedLocation: TrustedApplicationLocation | null = null;

const appIconPath = (() => {
  const fromApp = path.join(app.getAppPath(), "resources", "icon.png");
  const fromOut = path.join(__dirname, "../../resources/icon.png");
  return existsSync(fromApp) ? fromApp : fromOut;
})();
let inspectPickerActive = false;
let inspectPickerToken = 0;
let overlayEnabled = false;
let lastPickedNode = 0;
let lastPickedAt = 0;
let devToolsKeyPolling = false;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "out",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".opencode",
  ".claude",
  ".cursor",
  ".aider",
  ".windsurf",
  ".codeium",
  ".roo",
  ".gemini",
  ".kilocode",
  ".continue"
]);

const DEVTOOLS_WATCHER = `
(() => {
  if (window.__openshellWatchInstalled) return;
  window.__openshellWatchInstalled = true;
  window.__openshellKey = null;
  window.__openshellOpenSource = null;
  window.addEventListener("keydown", (event) => {
    if (event.key === "F12" || event.key === "Escape") {
      window.__openshellKey = event.key;
    }
  }, true);
  const STRICT = /^(.*\\.(?:css|scss|sass|less|styl|stylus|pcss)):(\\d+)\\s*$/i;
  const LOOSE = /([^\\s]*\\.(?:css|scss|sass|less|styl|stylus|pcss)):(\\d+)/i;
  function attr(el, name) {
    return el && el.getAttribute ? el.getAttribute(name) : null;
  }
  function candidate(el) {
    if (!el || el.nodeType !== 1) return null;
    const sources = [attr(el, "title"), attr(el, "href"), attr(el, "data-url"), attr(el, "data-source-url")];
    for (const value of sources) {
      if (!value) continue;
      const clean = value.replace(/[?#].*$/, "");
      let m = STRICT.exec(clean.trim());
      if (m) return { file: m[1], line: parseInt(m[2], 10), title: value };
      m = LOOSE.exec(clean);
      if (m) return { file: m[1], line: parseInt(m[2], 10), title: value };
    }
    const text = el.textContent ? el.textContent.trim() : "";
    if (text) {
      let m = STRICT.exec(text);
      if (m) return { file: m[1], line: parseInt(m[2], 10), title: "" };
      m = LOOSE.exec(text);
      if (m) return { file: m[1], line: parseInt(m[2], 10), title: "" };
    }
    return null;
  }
  window.addEventListener("click", (event) => {
    const path = event.composedPath ? event.composedPath() : [];
    let found = null;
    for (const el of path) {
      const c = candidate(el);
      if (c) { found = c; break; }
    }
    if (!found) return;
    event.preventDefault();
    event.stopPropagation();
    window.__openshellOpenSource = JSON.stringify({ file: found.file, line: found.line, title: found.title });
  }, true);
})();
`;

const INSPECT_HIGHLIGHT = {
  showInfo: true,
  showStyles: true,
  contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
  paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
  borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
  marginColor: { r: 246, g: 178, b: 107, a: 0.66 }
} as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ensureDevToolsOpen(wc: WebContents): Promise<void> {
  if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: "bottom" });
  for (let i = 0; i < 50 && !wc.devToolsWebContents; i++) await sleep(100);
  const dtc = wc.devToolsWebContents;
  if (dtc && dtc.isLoading()) {
    await new Promise<void>((resolve) => dtc.once("dom-ready", () => resolve()));
  }
}

async function startInspectPicker(wc: WebContents): Promise<void> {
  const token = ++inspectPickerToken;
  inspectPickerActive = true;
  await ensureDevToolsOpen(wc);
  if (token !== inspectPickerToken) return;
  wc.focus();
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    await wc.debugger.sendCommand("DOM.enable");
    await wc.debugger.sendCommand("Overlay.enable");
    overlayEnabled = true;
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
  inspectPickerToken++;
  inspectPickerActive = false;
  if (!overlayEnabled || !wc.debugger.isAttached()) return;
  void wc.debugger
    .sendCommand("Overlay.setInspectMode", { mode: "none", highlightConfig: INSPECT_HIGHLIGHT })
    .catch((err) => console.error("stopInspectPicker:", err));
}

async function findFileByBasename(root: string, basename: string, maxDepth = 7): Promise<string | null> {
  const matches: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth || matches.length >= 5) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= 5) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && entry.name === basename) {
        matches.push(path.join(dir, entry.name));
      }
    }
  };
  await walk(root, 0);
  matches.sort((a, b) => a.length - b.length);
  return matches[0] ?? null;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fsp.stat(p)).isFile();
  } catch {
    return false;
  }
}

function stripFragment(target: string): string {
  return target.replace(/[?#].*$/, "");
}

function sourceTarget(title: string): string | null {
  const t = title.trim();
  return t ? t.replace(/:(\d+)\s*$/, "") : null;
}

function toAbsolute(root: string, target: string): string | null {
  if (target.startsWith("file://")) {
    let p = target.slice("file://".length);
    try {
      p = decodeURIComponent(p);
    } catch {
      /* keep raw */
    }
    if (!path.isAbsolute(p)) p = path.join(root, p);
    return p;
  }
  if (/^https?:\/\//i.test(target)) {
    try {
      const u = new URL(target);
      const decoded = decodeURIComponent(u.pathname);
      if (path.isAbsolute(decoded)) return decoded;
      return path.join(root, decoded.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(target)) return target;
  return path.join(root, target.replace(/^\/+/, ""));
}

async function resolveInRoot(root: string, file: string, title: string): Promise<string | null> {
  const candidates: string[] = [];
  if (file) candidates.push(stripFragment(file));
  const titleTarget = sourceTarget(title);
  if (titleTarget) candidates.push(stripFragment(titleTarget));
  for (const candidate of candidates) {
    const abs = toAbsolute(root, candidate);
    if (abs && !isUnderSkippedDir(root, abs) && (await isFile(abs))) return abs;
  }
  for (const candidate of candidates) {
    if (!/^https?:\/\//i.test(candidate)) continue;
    const mapped = stripFragment(candidate.replace(/^[a-z]+:\/\/[^/]+/i, ""));
    if (mapped) {
      const abs = path.join(root, mapped.replace(/^\/+/, ""));
      if (!isUnderSkippedDir(root, abs) && (await isFile(abs))) return abs;
    }
  }
  const bases = new Set<string>();
  for (const source of [file, titleTarget].filter((value): value is string => Boolean(value))) {
    const last = stripFragment(source).split(/[\\/]/).pop();
    if (last) bases.add(last);
  }
  for (const base of bases) {
    const found = await findFileByBasename(root, base);
    if (found) return found;
  }
  return null;
}

function isUnderSkippedDir(root: string, abs: string): boolean {
  const rel = path.relative(root, abs);
  return rel.split(path.sep).some((segment) => SKIP_DIRS.has(segment));
}

async function resolveOpenSource(file: string, title: string): Promise<{ root: string; rel: string } | null> {
  const session = await backend.getState();
  if (session?.directory) {
    const resolved = await resolveInRoot(session.directory, file, title);
    if (resolved) return { root: session.directory, rel: path.relative(session.directory, resolved) };
  }
  const appRoot = app.getAppPath();
  const resolved = await resolveInRoot(appRoot, file, title);
  if (resolved) return { root: appRoot, rel: path.relative(appRoot, resolved) };
  return null;
}

function createWindow(show = true): BrowserWindow {
  const packagedUrl = pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
  const rendererUrl = applicationUrl(app.isPackaged, process.env["ELECTRON_RENDERER_URL"], packagedUrl);
  const location = trustedApplicationLocation(rendererUrl);
  const newWin = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 200,
    minHeight: 640,
    title: "OpenShell",
    icon: appIconPath,
    backgroundColor: "#161410",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    movable: true,
    resizable: true,
    fullscreenable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      additionalArguments: app.isPackaged ? ["--openshell-packaged"] : []
    }
  });
  win = newWin;
  trustedLocation = location;
  inspectPickerActive = false;
  inspectPickerToken++;
  const wc = newWin.webContents;

  wc.on("console-message", (event) => {
    console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  newWin.on("unresponsive", () => console.warn("[openshell] renderer is unresponsive"));
  let lastRendererReload = 0;
  wc.on("render-process-gone", (_event, details) => {
    console.error("[openshell] renderer process gone:", details.reason, details.exitCode);
    if (newWin.isDestroyed() || Date.now() - lastRendererReload < 10_000) return;
    lastRendererReload = Date.now();
    wc.reload();
  });

  newWin.on("closed", () => {
    if (win === newWin) {
      win = null;
      trustedLocation = null;
    }
  });

  newWin.webContents.setWindowOpenHandler(({ url }) => {
    const external = safeExternalUrl(url);
    if (external) void shell.openExternal(external);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (!isAllowedMainFrameNavigation(url, true, location)) event.preventDefault();
  });
  wc.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
    if (!isAllowedMainFrameNavigation(url, isMainFrame, location)) event.preventDefault();
  });

  wc.debugger.on("message", (_e, method, params) => {
    if (method === "Overlay.inspectNodeRequested") {
      const backendNodeId = (params as { backendNodeId?: number }).backendNodeId;
      const now = Date.now();
      if (
        typeof backendNodeId === "number" &&
        (backendNodeId !== lastPickedNode || now - lastPickedAt > 500)
      ) {
        lastPickedNode = backendNodeId;
        lastPickedAt = now;
        stopInspectPicker(wc);
        void selectPickedNode(wc, backendNodeId);
      }
    } else if (method === "Overlay.inspectModeCanceled") {
      stopInspectPicker(wc);
    }
  });
  wc.debugger.on("detach", () => {
    inspectPickerActive = false;
    overlayEnabled = false;
  });
  wc.on("devtools-closed", () => {
    devToolsKeyPolling = false;
    stopInspectPicker(wc);
  });

  const installDevToolsWatcher = (attempt = 0): void => {
    const dtc = wc.devToolsWebContents;
    if (!dtc || dtc.isDestroyed()) return;
    const run = (): void => {
      void dtc.executeJavaScript(DEVTOOLS_WATCHER).catch(() => {
        if (attempt < 5) setTimeout(() => installDevToolsWatcher(attempt + 1), 250);
      });
    };
    if (dtc.isLoading()) dtc.once("dom-ready", run);
    else run();
  };

  const pollDevTools = async (): Promise<void> => {
    while (devToolsKeyPolling) {
      await sleep(120);
      const dtc = wc.devToolsWebContents;
      if (!wc.isDevToolsOpened() || wc.isDestroyed() || !dtc || dtc.isDestroyed()) break;
      void dtc.executeJavaScript(DEVTOOLS_WATCHER).catch(() => {});
      const payload = await dtc
        .executeJavaScript(`(() => {
          const k = window.__openshellKey;
          window.__openshellKey = null;
          const s = window.__openshellOpenSource;
          window.__openshellOpenSource = null;
          return JSON.stringify({ key: k, source: s });
        })()`)
        .catch(() => null);
      if (typeof payload !== "string") continue;
      let parsed: { key?: string | null; source?: string | null };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.key === "F12") {
        wc.closeDevTools();
      } else if (parsed.key === "Escape" && inspectPickerActive) {
        stopInspectPicker(wc);
      }
      if (typeof parsed.source === "string") {
        try {
          const src = JSON.parse(parsed.source) as { file?: string; line?: number; title?: string };
          if (typeof src.file === "string" && typeof src.line === "number") {
            const resolved = await resolveOpenSource(src.file, src.title ?? "");
            if (resolved) {
              wc.send("shell:message", {
                kind: "ui-command",
                command: "open-source",
                path: resolved.rel,
                line: src.line,
                root: resolved.root
              });
            } else {
              console.warn("open-source: no local file for", src.file, src.title ?? "");
            }
          }
        } catch (err) {
          console.error("open-source:", err);
        }
      }
    }
    devToolsKeyPolling = false;
  };

  wc.on("devtools-opened", () => {
    installDevToolsWatcher();
    if (!devToolsKeyPolling) {
      devToolsKeyPolling = true;
      void pollDevTools();
    }
  });

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
    if (input.type === "keyDown" && !mod && !input.alt && !input.shift && input.key === "Escape" && inspectPickerActive) {
      event.preventDefault();
      stopInspectPicker(wc);
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

  if (show) {
    let revealed = false;
    const reveal = (): void => {
      if (revealed || newWin.isDestroyed()) return;
      revealed = true;
      newWin.show();
    };
    newWin.once("ready-to-show", reveal);
    setTimeout(reveal, 5000);
  }
  void newWin.loadURL(rendererUrl);
  return newWin;
}

async function runTrustBoundarySmoke(): Promise<void> {
  const trustedWindow = createWindow(false);
  await new Promise<void>((resolve, reject) => {
    trustedWindow.webContents.once("did-finish-load", () => resolve());
    trustedWindow.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  const trustedUrl = trustedWindow.webContents.getURL();
  const trustedIpc = await trustedWindow.webContents.executeJavaScript("window.openshell.state().then(() => true)");
  await trustedWindow.webContents.executeJavaScript("location.href = 'data:text/html,untrusted'");
  await sleep(100);
  const navigationDenied = trustedWindow.webContents.getURL() === trustedUrl;
  const windowsBeforePopup = BrowserWindow.getAllWindows().length;
  await trustedWindow.webContents.executeJavaScript("window.open('custom-protocol://unsafe')");
  await sleep(100);
  const popupDenied = BrowserWindow.getAllWindows().length === windowsBeforePopup;

  const untrustedWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await untrustedWindow.loadURL("data:text/html,<title>untrusted</title>");
  const untrustedIpcRejected = await untrustedWindow.webContents
    .executeJavaScript("window.openshell.state().then(() => false, () => true)");
  untrustedWindow.destroy();
  trustedWindow.destroy();
  const result = { trustedIpc, navigationDenied, popupDenied, untrustedIpcRejected };
  console.log(`[openshell-trust-smoke] ${JSON.stringify(result)}`);
  if (!Object.values(result).every(Boolean)) throw new Error(`trust smoke failed: ${JSON.stringify(result)}`);
}

async function installApplication(): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "darwin") return { ok: false, message: "Install app is macOS-only" };
  if (app.isPackaged) return { ok: false, message: "OpenShell is already running as a packaged app" };
  const script = path.join(app.getAppPath(), "scripts", "install-app.mjs");
  const run = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  for (const line of run.stdout.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { ok?: unknown; message?: unknown };
      if (typeof parsed.ok === "boolean" && typeof parsed.message === "string") {
        return { ok: parsed.ok, message: parsed.message };
      }
    } catch {
      continue;
    }
  }
  return { ok: false, message: run.stderr.trim() || `Install app failed (exit code ${run.code ?? "unknown"})` };
}

function handleTrusted<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedLocation || !isTrustedIpcSender(event, win?.webContents ?? null, trustedLocation)) {
      throw new Error("Rejected IPC from an untrusted sender");
    }
    return listener(event, ...args as Args);
  });
}

function registerIpc(): void {
  handleTrusted("shell:select-folder", async (e, requestGeneration: number) => {
    const generation = backend.beginActivation(activationGeneration(requestGeneration));
    const parent = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(parent ?? win!, {
      title: "Open a repository folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return backend.openSession(result.filePaths[0], generation);
  });

  handleTrusted("shell:open-session", async (_e, dir: string, requestGeneration: number) =>
    backend.openSession(directoryPath(dir), backend.beginActivation(activationGeneration(requestGeneration))));

  handleTrusted("shell:sessions", async () => backend.listSessions());

  handleTrusted("shell:active-sessions", async () => backend.activeSessions());

  handleTrusted("shell:close-session", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.closeSession(workspace);
  });

  handleTrusted("shell:open-session-id", async (_e, sessionID: string, requestGeneration: number) =>
    backend.openSessionById(sessionId(sessionID), backend.beginActivation(activationGeneration(requestGeneration)))
  );

  handleTrusted("shell:session-transcript", async (_e, sessionID: string) =>
    backend.sessionTranscript(sessionId(sessionID))
  );

  handleTrusted("shell:prompt", async (_e, workspace: WorkspaceIdentity, text: string, files: PromptFile[] = []) => {
    const payload = promptPayload(workspace, text, files);
    return backend.prompt(payload.workspace, payload.text, payload.files);
  });

  handleTrusted("shell:commands", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.listCommands(workspace);
  });

  handleTrusted("shell:run-command", async (_e, workspace: WorkspaceIdentity, name: string, args: string = "") => {
    await backend.workspaceDirectory(workspace);
    const command = commandPayload(name, args);
    return backend.runCommand(workspace, command.name, command.args);
  });

  handleTrusted("shell:find-files", async (_e, workspace: WorkspaceIdentity, query: string) => {
    workspaceId(workspace);
    return backend.searchFiles(workspace, queryText(query));
  });

  handleTrusted("shell:select-files", async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(parent ?? win!, {
      title: "Attach files",
      properties: ["openFile", "multiSelections"]
    });
    return result.canceled ? [] : result.filePaths;
  });

  handleTrusted("shell:interrupt", async (_e, workspace: WorkspaceIdentity) => backend.interrupt(workspace));

  handleTrusted("shell:fs-list", async (_e, workspace: WorkspaceIdentity, rel: string) => {
    const target = workspacePath(workspace, rel, true);
    return backend.listDir(target.workspace, target.rel);
  });

  handleTrusted("shell:fs-read", async (_e, workspace: WorkspaceIdentity, rel: string) => {
    const target = workspacePath(workspace, rel);
    return backend.readFile(target.workspace, target.rel);
  });

  handleTrusted("shell:source-read", async (_e, absolutePath: string) => {
    const source = await confinedAbsolutePath(await fsp.realpath(app.getAppPath()), absolutePath);
    try {
      return await fsp.readFile(source, "utf8");
    } catch {
      return null;
    }
  });

  handleTrusted("shell:fs-write", async (
    _e,
    workspace: WorkspaceIdentity,
    rel: string,
    content: string,
    write: FileWriteIdentity
  ) => {
    const target = workspacePath(workspace, rel);
    return backend.writeFile(target.workspace, target.rel, fileContent(content), fileWriteIdentity(write, target.workspace));
  });

  handleTrusted("shell:fs-create-file", async (_e, workspace: WorkspaceIdentity, rel: string) =>
    backend.createFile(workspace, rel)
  );

  handleTrusted("shell:fs-create-dir", async (_e, workspace: WorkspaceIdentity, rel: string) =>
    backend.createDir(workspace, rel)
  );

  handleTrusted("shell:fs-delete", async (_e, workspace: WorkspaceIdentity, rel: string) =>
    backend.deletePath(workspace, rel)
  );

  handleTrusted("shell:fs-rename", async (_e, workspace: WorkspaceIdentity, rel: string, newName: string) =>
    backend.renamePath(workspace, rel, newName)
  );

  handleTrusted("shell:fs-move", async (_e, workspace: WorkspaceIdentity, rel: string, newParent: string) => {
    const target = movePayload(workspace, rel, newParent);
    return backend.movePath(target.workspace, target.rel, target.newParent);
  });

  handleTrusted("shell:recovery-list", async (_e, workspace: WorkspaceIdentity) =>
    backend.listRecovery(workspace)
  );

  handleTrusted("shell:recovery-open", async (_e, workspace: WorkspaceIdentity, id: string) =>
    backend.openRecovery(workspace, selectionId(id, "recovery id"))
  );

  handleTrusted("shell:recovery-acknowledge", async (_e, workspace: WorkspaceIdentity, id: string) =>
    backend.acknowledgeRecovery(workspace, selectionId(id, "recovery id"))
  );

  handleTrusted("shell:projects", async () => backend.listProjects());

  handleTrusted("shell:models", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.listModels(workspace);
  });

  handleTrusted("shell:model-default", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.modelDefault(workspace);
  });

  handleTrusted("shell:switch-model", async (_e, workspace: WorkspaceIdentity, id: string, providerID: string, variant?: string) =>
    backend.switchModel(
      workspace,
      selectionId(id, "model id"),
      selectionId(providerID, "provider id"),
      optionalSelectionId(variant, "model variant")
    )
  );

  handleTrusted("shell:permission-reply", async (
    _e,
    workspace: WorkspaceIdentity,
    requestID: string,
    reply: PermissionReply,
    sessionID: string
  ) => {
    const permission = permissionPayload(requestID, reply, sessionID);
    return backend.replyPermission(workspace, permission.requestID, permission.reply, permission.sessionID);
  });

  handleTrusted("shell:agents", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.listAgents(workspace);
  });

  handleTrusted("shell:switch-agent", async (_e, workspace: WorkspaceIdentity, id: string) =>
    backend.switchAgent(workspace, selectionId(id, "agent id")));

  handleTrusted("shell:terminal-start", async (_e, workspace: WorkspaceIdentity, requestedId: string) => {
    const directory = await backend.workspaceDirectory(workspace);
    const id = terminalId(requestedId);
    await terminals.start(id, directory, workspace);
    try {
      await backend.workspaceDirectory(workspace);
    } catch (error) {
      terminals.stop(id, workspace);
      throw error;
    }
  });

  handleTrusted("shell:terminal-input", async (_e, workspace: WorkspaceIdentity, id: string, data: string) => {
    await backend.workspaceDirectory(workspace);
    terminals.write(terminalId(id), terminalInput(data), workspace);
  });

  handleTrusted("shell:terminal-resize", async (_e, workspace: WorkspaceIdentity, id: string, cols: number, rows: number) => {
    await backend.workspaceDirectory(workspace);
    const dimensions = terminalDimensions(cols, rows);
    terminals.resize(terminalId(id), dimensions.cols, dimensions.rows, workspace);
  });

  handleTrusted("shell:terminal-stop", async (_e, workspace: WorkspaceIdentity, id: string) => {
    await backend.workspaceDirectory(workspace);
    terminals.stop(terminalId(id), workspace);
  });

  handleTrusted("shell:state", async () => backend.getState());

  handleTrusted("shell:session-selection", async (_e, workspace: WorkspaceIdentity) => {
    workspaceId(workspace);
    return backend.sessionSelection(workspace);
  });

  handleTrusted("shell:provider-usage", async () => backend.providerUsage());

  handleTrusted("shell:health", async () => backend.connect().catch(() => false));

  handleTrusted("shell:install-app", async () => installApplication());

  handleTrusted("shell:validate-w3c", async (_e, filePath: string, content: string) => {
    const path = directoryPath(filePath);
    const source = fileContent(content);
    return validateWithW3c(path, source);
  });
}

if (!app.requestSingleInstanceLock()) {
  console.log("[openshell] another instance is already running — exiting; the running instance will open or focus its window");
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
    if (process.platform === "darwin") {
      try {
        app.dock?.setIcon(appIconPath);
      } catch {
        // icon is cosmetic
      }
    }
    const trustSmoke = process.env["OPENSHELL_TRUST_SMOKE"] === "1";
    if (!trustSmoke) backend.start();
    const fwd = (msg: unknown): void => {
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
      win.webContents.send("shell:message", msg);
    };
    backend.onMessage(fwd);
    terminals.onMessage(fwd);
    registerIpc();
    if (trustSmoke) {
      void runTrustBoundarySmoke().then(
        () => app.quit(),
        (error) => {
          console.error("[openshell-trust-smoke]", error);
          process.exitCode = 1;
          app.quit();
        }
      );
      return;
    }
    createWindow();
    void backend.connect().catch(() => {});

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

let quitting = false;

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void (async () => {
    await backend.stop();
    await terminals.stopAll();
    app.quit();
  })();
});
