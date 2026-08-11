# Module: preload bridge

`src/preload/index.ts` — a thin `contextBridge` layer that exposes the
renderer's only gateway to the main process: `window.openshell`.

The API object is typed as `OpenShellApi` (`typeof api`) and is the type
source for `src/renderer/src/global.d.ts`. If you add an IPC channel in
the main process, add the wrapper here and it flows to the renderer
automatically.

## Contract

| Member | Type |
|---|---|
| `onMessage(cb)` | `(msg: BackendMessage) => void`, returns unsubscribe |
| `selectFolder()` | `Promise<SessionInfo \| null>` |
| `openSession(dir)` | `Promise<SessionInfo>` |
| `prompt(text)` | `Promise<void>` |
| `interrupt()` | `Promise<void>` |
| `listDir(rel)` | `Promise<TreeEntry[]>` |
| `readFile(rel)` | `Promise<string \| null>` |
| `writeFile(rel, content)` | `Promise<void>` |
| `projects()` | `Promise<ProjectInfo[]>` |
| `models()` | `Promise<ModelOption[]>` |
| `modelDefault()` | `Promise<ModelOption \| null>` |
| `switchModel(id, providerID)` | `Promise<void>` |
| `permissionReply(requestID, reply)` | `Promise<void>` |
| `state()` | `Promise<SessionInfo \| null>` |
| `health()` | `Promise<boolean>` |

All are `ipcRenderer.invoke` wrappers over the `shell:*` channels
documented in `docs/main.md`. `onMessage` subscribes to
`ipcRenderer.on("shell:message")` and removes the listener on
unsubscribe.

Security posture: `contextIsolation: true`, `nodeIntegration: false`.
The renderer has no direct Node or Electron access — anything it needs
must be added to this bridge.
