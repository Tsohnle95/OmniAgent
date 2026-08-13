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
| `isPackaged()` | `boolean` — true when main added the `--openshell-packaged` flag; the renderer hides install affordances in packaged builds |
| `onMessage(cb)` | `(msg: BackendMessage) => void`, returns unsubscribe |
| `selectFolder()` | `Promise<SessionInfo \| null>` |
| `openSession(dir)` | `Promise<SessionInfo>` |
| `sessions()` | `Promise<SessionSummary[]>` |
| `openSessionById(sessionID)` | `Promise<ReopenedSession>` (session + replayed transcript + cumulative `usage`) |
| `prompt(text, files?)` | `Promise<void>`; files are `PromptFile[]` — paths from `selectFiles()` or @-mentions (with `mention` spans) |
| `commands()` | `Promise<CommandOption[]>` — slash commands + skills for the session directory (`kind` distinguishes them) |
| `runCommand(name, args?)` | `Promise<void>` — runs a slash command or skill in the active session |
| `references(query)` | `Promise<ReferenceOption[]>` — `file.find` search results for @-mentions, `rel` paths relative to the session directory |
| `selectFiles()` | `Promise<string[]>` |
| `interrupt()` | `Promise<void>` |
| `listDir(workspace, rel)` | `Promise<TreeEntry[]>` |
| `readFile(workspace, rel)` | `Promise<string \| null>` — workspace-relative only |
| `readSourceFile(absolutePath)` | `Promise<string \| null>` — privileged app-source read used only by DevTools source navigation |
| `writeFile(workspace, rel, content, write)` | `Promise<void>` |
| `createFile(workspace, rel)` | `Promise<void>` — creates an empty file, erroring if it exists |
| `createDir(workspace, rel)` | `Promise<void>` — creates a folder, erroring if it exists |
| `deletePath(workspace, rel)` | `Promise<void>` — moves to Trash and preserves failures without permanent deletion |
| `renamePath(workspace, rel, newName)` | `Promise<void>` — renames within the same folder |
| `recoveryRecords(workspace)` | `Promise<RecoveryRecord[]>` — persistent durable artifacts for the active workspace |
| `openRecovery(workspace, id)` | `Promise<void>` — opens a validated artifact selected by record id |
| `acknowledgeRecovery(workspace, id)` | `Promise<void>` — persists acknowledgment without deleting bytes |
| `projects()` | `Promise<ProjectInfo[]>` |
| `models()` | `Promise<ModelOption[]>` |
| `modelDefault()` | `Promise<ModelOption \| null>` |
| `switchModel(id, providerID, variant?)` | `Promise<void>` |
| `agents()` | `Promise<AgentOption[]>` |
| `switchAgent(id)` | `Promise<void>` |
| `terminalStart(workspace, id)` | `Promise<void>`; `id` is a renderer-generated `term-<UUID>` registered before invoke |
| `terminalInput(workspace, id, data)` | `Promise<void>` |
| `terminalResize(workspace, id, cols, rows)` | `Promise<void>` |
| `terminalStop(workspace, id)` | `Promise<void>` |
| `permissionReply(requestID, reply, sessionID?)` | `Promise<void>` |
| `state()` | `Promise<SessionInfo \| null>` |
| `sessionSelection()` | `Promise<SessionSelection \| null>` |
| `providerUsage()` | `Promise<ProviderUsageResult[]>` |
| `health()` | `Promise<boolean>` |
| `installApp()` | `Promise<{ok: boolean, message: string}>` — macOS-only: builds the packaged app and installs it to `/Applications`; `ok` false with a message on failure |

All are `ipcRenderer.invoke` wrappers over the `shell:*` channels
documented in `docs/main.md`. `onMessage` subscribes to
`ipcRenderer.on("shell:message")` and removes the listener on
unsubscribe.

Security posture: `contextIsolation: true`, `nodeIntegration: false`, and
`sandbox: true`. The renderer has no direct Node or Electron access. Main
accepts bridge invokes only from the active window's trusted main frame and
trusted application URL; a document that navigates elsewhere or an untrusted
subframe cannot use the exposed API. Workspace filesystem and terminal calls
also require the active immutable `WorkspaceIdentity`; stale activation tokens
are rejected in main. Main validates bounded runtime schemas for activation and
session IDs, prompts and attachments, command/search payloads, model/agent
selection, permission replies, filesystem writes, and terminal arguments.
