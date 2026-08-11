# Module: main process

`src/main/index.ts` (window + IPC wiring) and
`src/main/opencode.ts` (the `OpenShellBackend` — all opencode2 traffic).

This is the only place that imports `@opencode-ai/client`. If the client
API changes shape, only these two files change.

## OpenShellBackend (`src/main/opencode.ts`)

State:

- `client` — `OpenCode.make()` result, null until connected
- `sessionID`, `directory` — the active session
- `snapshots: Map<absPath, baseline>` — per-file diff baselines
- `lastKnown: Map<absPath, content>` — last content seen by the watcher
- `watcher` — recursive `fs.watch` on the session directory
- `hasGit` — lazily probed (`.git` presence), cached tri-state
- `settingsPath` — `app.getPath("userData")/settings.json`, holds the
  last-used `{model:{id,providerID}}` and `{agent:{id}}` so new sessions
  start on the same model/agent
- `stopped` — set by `stop()`; the event loop exits (`start()` resets it
  so the backend can be restarted after the window is re-created)

Public methods (all used by IPC):

| Method | Purpose |
|---|---|
| `connect()` | `Service.discover()` → `Service.ensure({command:["opencode2","serve","--service"]})` → `OpenCode.make` |
| `start()` | Start the SSE event loop |
| `stop()` | Stop the event loop + fs watcher |
| `onMessage(cb)` | Subscribe to outbound messages; returns unsubscribe |
| `openSession(directory)` | `session.create({location:{directory}, model?: saved, agent?: saved})`, resets baselines, starts watcher, emits `{kind:"session"}` |
| `listSessions()` | `session.list({limit:30, order:"desc"})` → `{id, title, directory, updatedAt}` |
| `openSessionById(sessionID)` | `session.get` to recover the directory, activates it, then `message.list` → replay transcript |
| `prompt(text)` | `session.prompt({sessionID, text})` |
| `interrupt()` | `session.interrupt`, errors swallowed |
| `replyPermission(requestID, reply)` | `permission.reply`, reply is `"once"|"always"|"reject"` |
| `listDir(rel)` | `file.list`, strips trailing slashes from directory paths |
| `readFile(rel)` | Read a file via the API; `null` if unreadable |
| `writeFile(rel, content)` | Write via Node `fs` (no API write endpoint); updates snapshots and emits `file-update` |
| `listProjects()` | `project.list`, maps to `{directory, name}` |
| `listModels()` | `model.list` (location = session dir), filters `enabled`, maps to `{id, providerID, name}` |
| `modelDefault()` | `model.default`, maps the same |
| `switchModel(id, providerID)` | `session.switchModel`; persists the choice to `settings.json` |
| `listAgents()` | `agent.list` (location = session dir), maps to `{id, name}` |
| `switchAgent(id)` | `session.switchAgent`; persists the choice to `settings.json` |
| `getState()` | `{id, directory}` or null |

Internals:

- `runEventLoop()` — reconnecting SSE loop; forwards every event as
  `{kind:"event", type, data}` then runs `handleServerEvent` (see
  `docs/events.md`).
- `activateSession(id, directory)` — shared by `openSession` /
  `openSessionById`: sets the active session, resets baselines, restarts
  the watcher, emits `{kind:"session"}`.
- `replayTranscript(messages)` — converts `message.list` output to
  `TranscriptItem[]`: user text, assistant text/reasoning (joined per
  message), tool parts → `ToolCallView` (status from
  streaming/running/completed/error, output from text content +
  error message, duration from `time.ran`→`time.completed`), compaction
  running → a status line.
- `snapshotInputs(input)` — recursively walks the tool-call input for
  `filePath`/`file_path`/`path` keys and snapshots those files
  (skips http URLs, dedupes).
- `gitShow(rel)` — `git show HEAD:<rel>` with a 10s timeout, 16 MiB
  buffer; null on any failure.
- `startWatcher()` / `scheduleWatch(abs)` / `onFsChanged()` — 200ms
  debounced `fs.watch` pipeline; assigns baselines (snapshot → git →
  first-seen), compares against `lastKnown`, emits `file-update`.
- `emitFileUpdate(abs, content, baselineOverride?)` — the single writer
  of `{kind:"file-update"}` messages.
- `relKey(abs)` — absolute → `/`-separated path relative to the session
  dir; `abs(rel)` the inverse. `shouldSkip` filters `SKIP_DIRS` roots.

## IPC surface (`src/main/index.ts`)

| Channel | Args → Returns |
|---|---|
| `shell:select-folder` | `() → SessionInfo \| null` (native dialog) |
| `shell:open-session` | `(dir) → SessionInfo` |
| `shell:sessions` | `() → SessionSummary[]` |
| `shell:open-session-id` | `(sessionID) → ReopenedSession` |
| `shell:prompt` | `(text) → void` |
| `shell:interrupt` | `() → void` |
| `shell:fs-list` | `(rel) → TreeEntry[]` |
| `shell:fs-read` | `(rel) → string \| null` |
| `shell:fs-write` | `(rel, content) → void` |
| `shell:projects` | `() → ProjectInfo[]` |
| `shell:models` | `() → ModelOption[]` |
| `shell:model-default` | `() → ModelOption \| null` |
| `shell:switch-model` | `(id, providerID) → void` |
| `shell:agents` | `() → AgentOption[]` |
| `shell:switch-agent` | `(id) → void` |
| `shell:terminal-start` | `(directory \| null) → { id }` (spawns a PTY login shell) |
| `shell:terminal-input` | `(id, data) → void` |
| `shell:terminal-resize` | `(id, cols, rows) → void` |
| `shell:terminal-stop` | `(id) → void` |
| `shell:permission-reply` | `(requestID, reply) → void` |
| `shell:state` | `() → SessionInfo \| null` |
| `shell:health` | `() → boolean` |

Outbound: `webContents.send("shell:message", msg)` for every backend
message. External links open via `shell.openExternal`. The window is
`contextIsolation: true`, `nodeIntegration: false`, macOS
`titleBarStyle: "hiddenInset"`.

PTY messages come from a second emitter, `TerminalManager`
(`src/main/terminal.ts`): it forwards `{kind:"terminal-data",
terminal:{id,data}}` and `{kind:"terminal-exit", terminal:{id,exitCode}}`
over the same `shell:message` channel. `before-input-event` intercepts
⌘W / Ctrl+W (so it never closes the window) and forwards
`{kind:"ui-command", command:"toggle-word-wrap"}` to the renderer instead
(the user's muscle memory maps ⌘W to word wrap, and the window must never
die on it).

Startup (`app.whenReady`): connect → `start()` → register IPC →
`createWindow()`. On `window-all-closed` non-darwin quits; the backend is
stopped in `before-quit` (window close on macOS no longer tears the
session down). On macOS activate: re-creates the window and calls
`backend.start()` again (it is restartable).
