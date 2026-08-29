# Walkthrough: how the pieces connect

This is a guided tour of Orbit's wiring. It starts at boot and follows
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
│ opencode2 service       │                   │ interactive shell     │
│ (existing, or spawned   │                   │ cwd = session dir     │
│  opencode2 serve --service)                 └───────────────────────┘
└─────────────────────────┘
```

There are exactly five connection points to keep in your head:

| # | Connection | Lives in |
|---|---|---|
| 1 | renderer → main (calls) | `window.openshell.*` (preload) → `registerIpc()` / `handleTrusted()` in `src/main/index.ts` → `OpenShellBackend` / `TerminalManager` methods |
| 2 | main → renderer (events) | `backend.onMessage(fwd)` + `terminals.onMessage(fwd)` in `app.whenReady()` → `webContents.send("shell:message")` → preload `onMessage` → store |
| 3 | main → opencode2 (REST) | `OpenCode.make(...)` client inside `OpenShellBackend.connect()` |
| 4 | opencode2 → main (SSE) | `OpenShellBackend.runEventLoop()` → `client.event.subscribe()` |
| 5 | main ↔ disk | one `fs.watch` per open session context, `fs` read/write |

## Boot

`app.whenReady()` in `src/main/index.ts`:

1. `backend.start()` — launches `runEventLoop()` through an abortable,
   generation-owned single-flight guard; repeated calls cannot create parallel
   subscriptions, and stop/restart cannot revive an old iterator.
2. Registers `fwd`, which is handed to both `backend.onMessage()` and
   `terminals.onMessage()`. Every message either object emits lands in the
   same place: `win.webContents.send("shell:message", msg)`. This single
   channel is the entire main → renderer pipe, carrying `BackendMessage`s.
3. `registerIpc()` — all `shell:*` handlers.
4. `createWindow()` — `contextIsolation: true`, `nodeIntegration: false`,
   preload `src/preload/index.js`. The renderer is walled off; the preload
   bridge is its only door. The window is created hidden and shown on
   `ready-to-show` (5s fallback), so a still-loading renderer never appears
   as a black window. Renderer console messages are forwarded to the main
   process stdout; a renderer crash logs its reason and reloads once per
   10s; an unresponsive renderer logs a warning.
5. `backend.connect()` — service discovery: `Service.discover()` finds an
   already-registered service; `discoverEndpoint()` checks the OpenCode
   desktop app's `service.json` (macOS); `ensureBounded()` falls back to
   spawning `opencode2 serve --service` (10s cap, 30s cooldown). Success
   produces the typed client.

`runEventLoop` then streams forever: each SSE event is forwarded verbatim
as `{ kind: "event", type, data }` and passed to `handleServerEvent`,
which routes `session.tool.called` (baseline snapshotting) to the event's
session context and fans `filesystem.changed` out to every context whose
directory matches. On any failure the client is dropped and the loop retries after
1.5s; `connect()` itself retries every 2s until a client exists.

Meanwhile the renderer boots: the mount effect in `StoreProvider`
probes `health()` and calls `activeSessions()` — the open backend sessions
are reopened silently as panels (transcript/todos/usage replayed, editor
state re-keyed by the reused workspace identity), and the most recently
activated one is focused unless the user already acted.

## Opening a repository

1. The Welcome screen calls `selectFolder()` (native dialog) or
   `openSession(dir)`; both land on `OpenShellBackend.openSession`
   in `OpenShellBackend`.
2. `client.session.create({ location: { directory } })` creates the
   session without extra options; opencode's configured defaults pick the
   model and agent.
3. Main accepts the renderer generation before the await. `activateSession()`
   assigns a fresh immutable workspace identity, binds a new context with its
   own watcher maps, starts that context's `fs.watch`, and emits
   `{ kind: "session" }`.
4. The store replaces the displayed panels with the session and focuses it
   (the emitted session message upserts idempotently), loads its
   models/agents/usage, and `Root` switches from `Welcome` to the `Layout`.
   The model-mode `+` action is the explicit sibling-panel path; clicking a
   running panel focuses it, while a saved or non-running recent session
   replaces the current view.

Recent sessions (`shell:sessions` → `session.list`) populate the Welcome
screen; clicking one goes down `openSessionById` (see below).

## Sending a prompt and watching the agent work

1. `sendPrompt()` appends an optimistic user item to the transcript, then
   `window.openshell.prompt(text, files)` → `backend.prompt()`
   in `OpenShellBackend.prompt()`: attachments are stat'd (10 MB cap) and converted
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
   entries and update the pickers of the panel that owns the session,
   mirroring the local `switchModel`/`switchAgent` calls without creating chat.
5. Stop: `stop()` → `shell:interrupt` → `client.session.interrupt`.

## The diff pipeline

Changes shows workspace file changes observed during the focused session, not
authoritative agent-attributed changes. Sources feed each context's per-file
baseline map (`snapshots` in `OpenShellBackend`):

1. **Tool snapshot** — when `session.tool.called` arrives, `snapshotInputs`
   walks the tool input for `filePath`/`file_path`/`path` keys
   (`collectFilePaths`) and reads every file *before* the tool executes.
2. **git fallback** — files first seen via `fs.watch` (or the server's
   `filesystem.changed`) get `git show HEAD:<rel>` as baseline when the
   repo has a `.git`; Git-untracked paths use a known empty baseline with
   `exists: false`, while an empty Git HEAD result represents an existing file. Non-git
   first observations use an explicit unknown baseline.
3. **Editor writes and creates** — expected disk content or empty creation
   establishes a known baseline only when none exists; later saves preserve it.
4. **Delete and rename** — tracked baselines remain on deletion updates and
   move to renamed targets.

Changes flow: watcher (200ms debounce, `SKIP_DIRS` filter, with Git metadata
events handled separately) or the server
event → `OpenShellBackend.onFsChanged()` compares against `lastKnown`,
assigns a baseline if missing, and emits
`{ kind: "file-update", file: { path, baseline, content, deleted } }`.

The store's backend-message handler merges file updates into two places: the
`agentFiles` map (drives the sidebar CHANGES list) and the open tab. Updates
that equal a known baseline, or delete a path whose known baseline has
`exists: false`, remove the path from `agentFiles`; if the tab is **not** dirty the update replaces content and baseline; if the
user has unsaved edits it only updates the baseline and marks the tab
`stale`, never clobbering the editor. Files open with their baseline from
`agentFiles`, so the Edit/Diff toggle is instant.
Known baselines enable Diff; unknown baselines remain labeled in Changes with
Diff unavailable.

The watcher has no actor provenance. Shell commands provide no structured path
to snapshot, so Git `HEAD` is often the only comparison and does not prove who
made a change. Non-git first observation cannot reconstruct old bytes. Skipped
directories (`.git`, dependencies, caches, IDE metadata, and build outputs),
unreadable/binary paths, watcher coalescing, pre-activation changes, and missed
first notifications can prevent observation or baseline recovery.

## Editing and saving

Every `editContent` increments the tab revision and schedules an immutable
workspace/path/content/revision snapshot. `EditorPersistence` debounces 900ms,
serializes writes per workspace/file, and routes `doSave` → `shell:fs-write` →
Node `fs`. Echoes must match write ID, workspace, revision, and content; normal
writes also verify the disk still matches `saved`. External changes preserve
local edits and require explicit Reload, Overwrite, or Keep editing to merge
then Save merged content. ⌘S saves the current revision immediately.

Create/rename/delete/move (`shell:fs-create-*`, `shell:fs-rename`,
`shell:fs-delete`, `shell:fs-move`) are plain `fs` operations in the
backend; delete moves to Trash and re-emits a deleted `file-update` for
tracked paths; a Trash failure is returned unchanged and shown by the
renderer, with no permanent deletion fallback. Rename moves the baseline
snapshot along. Move is a cross-folder atomic rename (files and
directories) that rejects missing/occupied/self-descendant destinations
and emits a deletion at the source plus, for files, an addition at the
target. The renderer refreshes the tree at both the old parent and the
destination and rewrites tab/`agentFiles` paths to match. Dragging a row
onto a folder or the empty tree area triggers the move; self and
descendant drops and file-onto-file drops are ignored.

All filesystem calls include the addressed panel's workspace identity. Main
resolves each identity against its open context map and rejects unknown or
replaced identities, malformed/bounded relative paths, traversal, absolute paths,
and every existing symlink component, including intermediate parents of new
targets. DevTools source candidates are resolved only within the canonical
application root, then opened through the same writable external-file capability
used for a file dropped from outside the active workspace.

## Permissions

`permission.asked` (normalized from `permission.v2.asked`) appends a
pending permission card with `action` + `resources`. The card's reply —
`once` | `always` | `reject` — goes `replyPermission` →
`client.permission.reply({ sessionID, requestID, reply })`; the resulting
`permission.replied` marks the card resolved. The composer's approval
toggle is renderer-local state (localStorage): in "approve" mode the store
auto-replies `once` to every request without showing a card decision.

## Models and agents

The welcome runtime selector reads `RuntimeManifest[]` over `shell:runtimes`
and persists the selected id locally. Folder opens carry that id into main;
the resulting `SessionInfo.runtimeID` keeps every later operation on the same
adapter. OpenCode remains the default. DeepSeek Harness starts `dsh web` in the
chosen directory, while the durable runtime-session index records enough
identity to reopen that native session after an app restart. Controls whose
manifest capability is false are omitted rather than allowed to fail later.

The selected runtime is a global mode for the next launch: startup restoration
reopens every open session through `openSessionById(sessionID, generation,
selectedRuntimeID)`, and when a session's native runtime differs from the
selected one and no context is active yet, main remaps it — opening the same
directory under the requested runtime (a fresh native session) instead of the
session's original runtime. Sessions already open in the current process keep
their own runtime, so the mode applies on the next app open rather than
mid-session.

Both pickers follow the same pattern: `loadModels`/`loadAgents` fetch
catalogs (location = session directory) and the current pick via
`modelDefault()`, seeded live by `session.model.selected`. Switching calls
`session.switchModel` / `session.switchAgent` for the active session only;
choices are session-scoped, so a new session starts on opencode's configured
defaults rather than a saved Orbit preference.
Reopening a session restores the *session's* picks via
`sessionSelection()` → `session.get`.

The Providers settings page asks the active runtime adapter for its integration
catalog rather than embedding one agent harness's model list. It features 20
common services, searches every additional integration reported by the runtime,
and renders provider-specific setup fields. API keys cross the trusted IPC
bridge only for the connection call, are stored by the runtime, and are never
read back; the UI receives only opaque credential ids and labels. Adding or
removing a credential refetches both connection state and workspace models so
newly available models can be selected immediately. The current OpenCode
adapter implements this contract through `integration.list`,
`integration.connect.key`, and `credential.remove`. DeepSeek currently reports
provider credential editing as unsupported, so Settings directs users to the
runtime instead of rendering a nonfunctional form.

## Terminal tray

`TerminalTray` registers a renderer-generated terminal UUID, then mounts/restarts a PTY (`terminalStart(workspace, id)`): main resolves
the workspace identity and supplies that context's canonical directory as cwd.
The tray belongs to the focused panel — swapping focus stops the previous
panel's PTYs and boots a fresh terminal for the new workspace.
`TerminalManager` selects the user's normal interactive shell from `SHELL` on
macOS/Linux or `COMSPEC` on Windows, with platform defaults, then spawns it via
`node-pty` with cwd = session directory (or home),
and forwards PTY output as `terminal-data` over the same
`shell:message` channel (connection #2). Keystrokes go down
`terminalInput`; the xterm `fit` addon sends `terminalResize`. `stopAll`
kills every PTY at `before-quit`. Renderer startup buffers exist only for
terminal IDs awaiting xterm registration and are byte-, chunk-, and age-bound.
`terminal-exit` removes the matching tab and selects a remaining neighbor.
The last explicit tab close hides a committed empty tray; reopening stays
empty until the user presses `+`, while a natural final exit leaves the empty
tray visible.

## Session history and reopen

`shell:sessions` → `session.list({ limit: 30, order: "desc" })` →
summaries with parent ids for the Welcome screen, the sidebar's Sessions
pane, and
task/subagent links.
Reopening goes
`OpenShellBackend.openSessionById()`: `session.get` recovers the
directory, `activateSession` reuses the context when the session is already
open (no re-emit, stable workspace identity), then `message.list` is
replayed through `replayTranscript`/`replayToolCard` into the same semantic
`TranscriptItem` shape the live stream produces. Clicking a running session
in the Sessions pane just focuses its panel. Task cards navigate to the
resolved child session; a child header navigates back to its parent. Subagent
launches surface as task cards (`task`/`subagent` tool parts resolve their
child from tool metadata `sessionID` or the newest matching `parentID` +
description + agent), and background completion notices arrive as synthetic
`<subagent id state description>` messages that the timeline turns into the
same clickable card by parsing the child id out of the text, so every
dispatch — tool call or synthetic input — is navigable and the child header
links back to the parent session.

## Window lifecycle and shortcuts

- Single-instance lock; a second launch logs the conflict and exits, and
  the running instance refocuses (or re-creates) the window.
- `window-all-closed` quits on every platform, so closing the last window
  ends the process and a stale instance can never keep holding the
  single-instance lock invisibly. Dock-click `activate` still re-creates
  the window if it was destroyed programmatically.
- `before-quit` aborts the SSE subscription and tears down the backend watcher
  and all terminals; generation invalidation prevents an iterator that ignores
  or delays abort from reviving after restart without making shutdown hang.
- ⌘W/Ctrl+W is intercepted in main and re-sent as a `ui-command`
  (`toggle-word-wrap`) instead of closing the window; ⌥Z does the same in
  the renderer. F12 toggles a bottom-docked DevTools; ⌘⇧C toggles live
  element picking — CDP `Overlay.setInspectMode` for the Firefox-style
  hover highlight, with the click routed through `inspectElement` so the
  Elements panel selects the node. A picker activation accepts only its first
  node request and disables inspect mode before selection, preventing duplicate
  CDP events from bouncing the Elements panel between nodes. Clicking a rule's source link in the
  Styles panel (`styles.scss:12`) sends an `open-source` `ui-command` so
  the file opens in the editor at that exact line. Resolution never searches
  the user's active workspace: an app stylesheet outside that workspace becomes
  a writable standalone tab, leaving the current session and panels unchanged.
- ⌥O toggles the terminal tray; drag dividers resize the sidebar, each
  session panel, and the tray (dragging the tray to the bottom closes it on
  release).

## One rule behind it all

The renderer never touches Node. Every capability — reading files,
dialogs, the opencode2 API, PTYs — is a `shell:*` handler in main,
reachable only through `window.openshell`. New features are new IPC
channels plus new `BackendMessage` kinds, listed in the `docs/main.md` /
`docs/preload.md` tables that `npm run docs:check` enforces.
