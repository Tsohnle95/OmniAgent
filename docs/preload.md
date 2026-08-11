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
| `platform()` | `string` — `process.platform` (not an invoke; the renderer uses it for the darwin titlebar inset) |
| `onMessage(cb)` | `(msg: BackendMessage) => void`, returns unsubscribe |
| `selectFolder()` | `Promise<SessionInfo \| null>` |
| `openSession(dir)` | `Promise<SessionInfo>` |
| `sessions()` | `Promise<SessionSummary[]>` |
| `openSessionById(sessionID)` | `Promise<ReopenedSession>` (session + replayed transcript) |
| `prompt(text, files?)` | `Promise<void>`; files are absolute paths selected through `selectFiles()` |
| `selectFiles()` | `Promise<string[]>` |
| `interrupt()` | `Promise<void>` |
| `listDir(rel)` | `Promise<TreeEntry[]>` |
| `readFile(rel)` | `Promise<string \| null>` |
| `writeFile(rel, content)` | `Promise<void>` |
| `projects()` | `Promise<ProjectInfo[]>` |
| `models()` | `Promise<ModelOption[]>` |
| `modelDefault()` | `Promise<ModelOption \| null>` |
| `switchModel(id, providerID, variant?)` | `Promise<void>` |
| `agents()` | `Promise<AgentOption[]>` |
| `switchAgent(id)` | `Promise<void>` |
| `terminalStart(directory \| null)` | `Promise<{ id }>` |
| `terminalInput(id, data)` | `Promise<void>` |
| `terminalResize(id, cols, rows)` | `Promise<void>` |
| `terminalStop(id)` | `Promise<void>` |
| `permissionReply(requestID, reply)` | `Promise<void>` |
| `state()` | `Promise<SessionInfo \| null>` |
| `sessionSelection()` | `Promise<SessionSelection \| null>` |
| `health()` | `Promise<boolean>` |

All are `ipcRenderer.invoke` wrappers over the `shell:*` channels
documented in `docs/main.md`. `onMessage` subscribes to
`ipcRenderer.on("shell:message")` and removes the listener on
unsubscribe.

Security posture: `contextIsolation: true`, `nodeIntegration: false`.
The renderer has no direct Node or Electron access — anything it needs
must be added to this bridge.
