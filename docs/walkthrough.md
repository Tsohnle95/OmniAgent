# Walkthrough: how the pieces connect

This is a guided tour of OpenShell's wiring. It starts at boot and follows
every user flow across the three processes — renderer, preload, main — and
out to the opencode2 service, pointing at the exact files where each
connection lives. `docs/architecture.md` is the static system overview;
this doc is the moving-picture version.

## The connection map

```
┌─ RENDERER ── React, zero Node access ────────────────────────────────┐
│ store.tsx (all UI state)  ·  components/                             │
│   window.openshell.*   ←─── ipcRenderer.invoke (renderer → main)     │
│   onMessage(msg)       ←─── ipcRenderer.on("shell:message") (main →) │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ contextBridge (contextIsolation)
┌─ PRELOAD ────────────────────────┴───────────────────────────────────┐
│ src/preload/index.ts — exposes window.openshell, the ONLY bridge     │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ ipcMain.handle("shell:*") / webContents.send
┌─ MAIN ───────────────────────────┴───────────────────────────────────┐
│ src/main/index.ts   — window + IPC wiring                            │
│ src/main/opencode.ts — OpenShellBackend (all opencode2 traffic)      │
│ src/main/terminal.ts — TerminalManager (node-pty)                    │
└─────────┬──────────────────────────────────────────────┬─────────────┘
          │ @opencode-ai/client (REST + SSE)             │ node-pty
┌─────────┴───────────────┐                   ┌──────────┴────────────┐
│ opencode2 service       │                   │ login shell (zsh -l)  │
│ (existing, or spawned   │                   │ cwd = session dir     │
│  opencode2 serve --service)                 └───────────────────────┘
└─────────────────────────┘
```

There are exactly five connection points to keep in your head:

| # | Connection | Lives in |
|---|---|---|
| 1 | renderer → main (calls) | `window.openshell.*` (preload) → `ipcMain.handle("shell:*")` (`src/main/index.ts:80`) → `OpenShellBackend` / `TerminalManager` methods |
| 2 | main → renderer (events) | `backend.onMessage(fwd)` + `terminals.onMessage(fwd)` (`src/main/index.ts:196`) → `webContents.send("shell:message")` → preload `onMessage` → store |
| 3 | main → opencode2 (REST) | `OpenCode.make(...)` client inside `OpenShellBackend` (`src/main/opencode.ts:255`) |
| 4 | opencode2 → main (SSE) | `runEventLoop` → `client.event.subscribe()` (`src/main/opencode.ts:277`) |
| 5 | main ↔ disk | `fs.watch` on the session dir, `fs` read/write, `settings.json` (userData) |

## Boot

`app.whenReady()` in `src/main/index.ts:193`:

1. `backend.start()` — resets the `stopped` flag and launches
   `runEventLoop()`.
2. Registers `fwd`, which is handed to both `backend.onMessage()` and
   `terminals.onMessage()`. Every message either object emits lands in the
   same place: `win.webContents.send("shell:message", msg)`. This single
   channel is the entire main → renderer pipe, carrying `BackendMessage`s.
3. `registerIpc()` — all `shell:*` handlers.
4. `createWindow()` — `contextIsolation: true`, `nodeIntegration: false`,
   preload `src/preload/index.js`. The renderer is walled off; the preload
   bridge is its only door.
5. `backend.connect()` — service discovery: `Service.discover()` finds an
   already-registered service; `discoverEndpoint()` checks the OpenCode
   desktop app's `service.json` (macOS); `ensureBounded()` falls back to
   spawning `opencode2 serve --service` (10s cap, 30s cooldown). Success
   produces the typed client.

`runEventLoop` then streams forever: each SSE event is forwarded verbatim
as `{ kind: "event", type, data }` and passed to `handleServerEvent`
(`src/main/opencode.ts:299`), which intercepts `session.tool.called`
(baseline snapshotting) and `filesystem.changed` before the renderer sees
them. On any failure the client is dropped and the loop retries after
1.5s; `connect()` itself retries every 2s until a client exists.

Meanwhile the renderer boots: the store's mount effect (`src/renderer/src/store.tsx:911`)
probes `health()` and calls `state()` — if the backend still holds a
session (macOS window closed and reopened), it restores it, reloads
models/agents, and re-reads the session's model/agent selection.

## Opening a repository

1. The Welcome screen calls `selectFolder()` (native dialog) or
   `openSession(dir)`; both land on `OpenShellBackend.openSession`
   (`src/main/opencode.ts:506`).
2. The last-used model and agent are read from
   `userData/settings.json` and passed to
   `client.session.create({ location: { directory }, model?, agent? })`.
3. `activateSession()` (`:494`) canonicalizes and stores the directory, assigns
   a fresh immutable workspace UUID, clears all baseline state, starts the
   `fs.watch` watcher, and emits
   `{ kind: "session" }`.
4. The opening action resets workspace state and the store reacts to the
   emitted session message with `setSession`, `loadModels()`, `loadAgents()`,
   and `loadSessions()`. The
   `Root` component switches from `Welcome` to the three-pane `Layout`.

Recent sessions (`shell:sessions` → `session.list`) populate the Welcome
screen; clicking one goes down `openSessionById` (see below).

## Sending a prompt and watching the agent work

1. `sendPrompt()` appends an optimistic user item to the transcript, then
   `window.openshell.prompt(text, files)` → `backend.prompt()`
   (`opencode.ts:583`): attachments are stat'd (10 MB cap) and converted
   to `file://` URIs → `client.session.prompt({ sessionID, text, files })`.
2. The reply never comes back over a request/response channel — it streams
   back over connection #4. Every `session.*` / `message.*` SSE event is
   forwarded and the store's `onMessage` effect queues them into a 16ms
   frame, coalescing adjacent deltas (`coalesceChatStream`), then runs
   `processMessage` → `reduceChatStream` (`chat-stream.ts`). Each event is
   reduced under its own `sessionID`, retaining child/subagent streams while
   admitted input remains invisible until promotion and the active projection
   renders semantic session messages and ordered text/reasoning/tool parts.
   `normalizeStreamEvent` also adapts `permission.v2.*` names and legacy
   envelopes so one reducer handles every service version.
3. The busy lifecycle is a per-session side channel:
   `session.execution.started` sets that session busy,
   `succeeded/failed/interrupted` and `session.idle` clear it;
   `session.status` mirrors `busy`/`idle`/`retry` (retry detail attaches to
   the latest assistant).
4. `session.model.selected` / `session.agent.selected` remain internal control
   entries and update the pickers when they belong to the active session,
   mirroring the local `switchModel`/`switchAgent` calls without creating chat.
5. Stop: `stop()` → `shell:interrupt` → `client.session.interrupt`.

## The diff pipeline

The center pane's Diff view shows "what the agent changed this session".
Three sources feed the per-file baseline map (`snapshots` in
`OpenShellBackend`):

1. **Tool snapshot** — when `session.tool.called` arrives, `snapshotInputs`
   walks the tool input for `filePath`/`file_path`/`path` keys
   (`collectFilePaths`) and reads every file *before* the tool executes.
2. **git fallback** — files first seen via `fs.watch` (or the server's
   `filesystem.changed`) get `git show HEAD:<rel>` as baseline when the
   repo has a `.git`; non-git repos use the first observed content.
3. **Editor writes** — `writeFile`/`createFile` set the baseline to the
   content just written, so the app's own edits never count as agent
   changes.

Changes flow: watcher (200ms debounce, `SKIP_DIRS` filter) or the server
event → `onFsChanged` (`opencode.ts:401`) compares against `lastKnown`,
assigns a baseline if missing, and emits
`{ kind: "file-update", file: { path, baseline, content, deleted } }`.

The store merges file-updates into two places (`store.tsx:730`): the
`agentFiles` map (drives the sidebar CHANGES list) and the open tab. If
the tab is **not** dirty the update replaces content and baseline; if the
user has unsaved edits it only updates the baseline and marks the tab
`stale`, never clobbering the editor. Files open with their baseline from
`agentFiles`, so the Edit/Diff toggle is instant.

## Editing and saving

Every `editContent` increments the tab revision and schedules an immutable
workspace/path/content/revision snapshot. `EditorPersistence` debounces 900ms,
serializes writes per workspace/file, and routes `doSave` → `shell:fs-write` →
Node `fs`. Echoes must match write ID, workspace, revision, and content; normal
writes also verify the disk still matches `saved`. External changes preserve
local edits and require explicit Reload, Overwrite, or Keep editing to merge
then Save merged content. ⌘S saves the current revision immediately.

Create/rename/delete (`shell:fs-create-*`, `shell:fs-rename`,
`shell:fs-delete`) are plain `fs` operations in the backend; delete moves
to Trash and re-emits a deleted `file-update` for tracked paths; rename
moves the baseline snapshot along. The renderer refreshes the tree and
rewrites tab/`agentFiles` paths to match.

All filesystem calls include the activation's workspace identity. Main rejects
stale identities, malformed/bounded relative paths, traversal, absolute paths,
and every existing symlink component, including intermediate parents of new
targets. DevTools app-source navigation uses a separate absolute read confined
to the canonical application root.

## Permissions

`permission.asked` (normalized from `permission.v2.asked`) appends a
pending permission card with `action` + `resources`. The card's reply —
`once` | `always` | `reject` — goes `replyPermission` →
`client.permission.reply({ sessionID, requestID, reply })`; the resulting
`permission.replied` marks the card resolved. The composer's approval
toggle is renderer-local state (localStorage): in "approve" mode the store
auto-replies `once` to every request without showing a card decision.

## Models and agents

Both pickers follow the same pattern: `loadModels`/`loadAgents` fetch
catalogs (location = session directory) and the current pick via
`modelDefault()`, seeded live by `session.model.selected`. Switching calls
`session.switchModel` / `session.switchAgent` **and** persists the choice
to `settings.json`, so the next session opens with the same model (plus
response-strength `variant`, when the model exposes one) and agent.
Reopening a session restores the *session's* picks via
`sessionSelection()` → `session.get`.

## Terminal tray

`TerminalTray` mounts/restarts a PTY (`terminalStart(workspace)`): main verifies
the activation identity and supplies the canonical active workspace cwd.
`TerminalManager` resolves the login shell (`zsh -l -c 'echo $0'` on
macOS), spawns it via `node-pty` with cwd = session directory (or home),
and forwards PTY output as `terminal-data` over the same
`shell:message` channel (connection #2). Keystrokes go down
`terminalInput`; the xterm `fit` addon sends `terminalResize`. `stopAll`
kills every PTY at `before-quit`.

## Session history and reopen

`shell:sessions` → `session.list({ limit: 30, order: "desc" })` →
summaries with parent ids for the Welcome screen and task/subagent links.
Reopening goes
`openSessionById` (`opencode.ts:545`): `session.get` recovers the
directory, `activateSession` restarts the watcher, then `message.list` is
replayed through `replayTranscript`/`replayToolCard` into the same semantic
`TranscriptItem` shape the live stream produces. Task cards navigate to the
resolved child session; a child header navigates back to its parent.

## Window lifecycle and shortcuts

- Single-instance lock; a second launch refocuses (or re-creates) the
  window.
- `window-all-closed` quits on non-macOS; on macOS the backend stays
  alive, and dock-click `activate` calls `backend.start()` +
  `createWindow()` to restart the event loop.
- `before-quit` tears down the backend (event loop + watcher) and all
  terminals.
- ⌘W/Ctrl+W is intercepted in main and re-sent as a `ui-command`
  (`toggle-word-wrap`) instead of closing the window; ⌥Z does the same in
  the renderer. F12 toggles a bottom-docked DevTools; ⌘⇧C toggles live
  element picking — CDP `Overlay.setInspectMode` for the Firefox-style
  hover highlight, with the click routed through `inspectElement` so the
  Elements panel selects the node. Clicking a rule's source link in the
  Styles panel (`styles.css:12`) sends an `open-source` `ui-command` so
  the file opens in the editor at that exact line.
- ⌥O toggles the terminal tray; drag dividers resize the sidebar, agent
  panel, and tray (dragging the tray to the bottom closes it on release).

## One rule behind it all

The renderer never touches Node. Every capability — reading files,
dialogs, the opencode2 API, PTYs — is a `shell:*` handler in main,
reachable only through `window.openshell`. New features are new IPC
channels plus new `BackendMessage` kinds, listed in the `docs/main.md` /
`docs/preload.md` tables that `npm run docs:check` enforces.
