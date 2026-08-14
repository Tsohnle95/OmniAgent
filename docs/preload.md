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
| `selectFolder(generation)` | `Promise<SessionInfo \| null>` — native dialog; the returned session becomes a new panel |
| `openSession(dir, generation)` | `Promise<SessionInfo>` — creates an opencode session for `dir` as a new concurrent panel |
| `sessions()` | `Promise<SessionSummary[]>` — recent session list |
| `activeSessions()` | `Promise<SessionInfo[]>` — currently open backend sessions in activation order; the last element is the most recently activated (used for startup restore) |
| `closeSession(workspace)` | `Promise<void>` — tears down the backend context when a panel closes; the opencode session remains reopenable |
| `openSessionById(sessionID, generation)` | `Promise<ReopenedSession>` (session + replayed transcript + cumulative `usage`); idempotent for already-open sessions |
| `sessionTranscript(sessionID)` | `Promise<{transcript, todos}>` — authoritative message replay used to materialize incomplete stream snapshots |
| `prompt(workspace, text, files?)` | `Promise<void>`; files are `PromptFile[]` — paths from `selectFiles()` or @-mentions (with `mention` spans) |
| `commands(workspace)` | `Promise<CommandOption[]>` — slash commands + skills for the session directory (`kind` distinguishes them) |
| `runCommand(workspace, name, args?)` | `Promise<void>` — runs a slash command or skill in the addressed session |
| `references(workspace, query)` | `Promise<ReferenceOption[]>` — `file.find` search results for @-mentions, `rel` paths relative to the session directory |
| `selectFiles()` | `Promise<string[]>` |
| `interrupt(workspace)` | `Promise<void>` |
| `listDir(workspace, rel)` | `Promise<TreeEntry[]>` |
| `readFile(workspace, rel)` | `Promise<string \| null>` — workspace-relative only |
| `readSourceFile(absolutePath)` | `Promise<string \| null>` — privileged app-source read used only by DevTools source navigation |
| `writeFile(workspace, rel, content, write)` | `Promise<void>` |
| `createFile(workspace, rel)` | `Promise<void>` — creates an empty file, erroring if it exists |
| `createDir(workspace, rel)` | `Promise<void>` — creates a folder, erroring if it exists |
| `deletePath(workspace, rel)` | `Promise<void>` — moves to Trash and preserves failures without permanent deletion |
| `renamePath(workspace, rel, newName)` | `Promise<void>` — renames within the same folder |
| `movePath(workspace, rel, newParent)` | `Promise<void>` — moves a file or folder into another folder; empty `newParent` is the workspace root |
| `recoveryRecords(workspace)` | `Promise<RecoveryRecord[]>` — persistent durable artifacts for the addressed workspace |
| `openRecovery(workspace, id)` | `Promise<void>` — opens a validated artifact selected by record id |
| `acknowledgeRecovery(workspace, id)` | `Promise<void>` — persists acknowledgment without deleting bytes |
| `projects()` | `Promise<ProjectInfo[]>` |
| `models(workspace)` | `Promise<ModelOption[]>` |
| `modelDefault(workspace)` | `Promise<ModelOption \| null>` |
| `switchModel(workspace, id, providerID, variant?)` | `Promise<void>` |
| `agents(workspace)` | `Promise<AgentOption[]>` |
| `switchAgent(workspace, id)` | `Promise<void>` |
| `terminalStart(workspace, id)` | `Promise<void>`; `id` is a renderer-generated `term-<UUID>` registered before invoke; main supplies the workspace's cwd |
| `terminalInput(workspace, id, data)` | `Promise<void>` |
| `terminalResize(workspace, id, cols, rows)` | `Promise<void>` |
| `terminalStop(workspace, id)` | `Promise<void>` |
| `permissionReply(workspace, requestID, reply, sessionID)` | `Promise<void>` |
| `state()` | `Promise<SessionInfo \| null>` — the most recently activated session |
| `sessionSelection(workspace)` | `Promise<SessionSelection \| null>` |
| `providerUsage()` | `Promise<ProviderUsageResult[]>` |
| `health()` | `Promise<boolean>` |
| `installApp()` | `Promise<{ok: boolean, message: string}>` — macOS-only: builds the packaged app and installs it to `/Applications`; `ok` false with a message on failure |
| `validateW3c(path, content)` | `Promise<W3cDiagnostic[]>` — validates HTML/CSS source through the W3C services |

All are `ipcRenderer.invoke` wrappers over the `shell:*` channels
documented in `docs/main.md`. `onMessage` subscribes to
`ipcRenderer.on("shell:message")` and removes the listener on
unsubscribe.

Security posture: `contextIsolation: true`, `nodeIntegration: false`, and
`sandbox: true`. The renderer has no direct Node or Electron access. Main
accepts bridge invokes only from the active window's trusted main frame and
trusted application URL; a document that navigates elsewhere or an untrusted
subframe cannot use the exposed API. Workspace filesystem and terminal calls
also require a live `WorkspaceIdentity` matching an open backend session
context; stale or unknown identities are rejected in main. Main validates
bounded runtime schemas for activation and session IDs, prompts and
attachments, command/search payloads, model/agent selection, permission
replies, filesystem writes, and terminal arguments.
