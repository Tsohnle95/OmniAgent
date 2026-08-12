# Module: main process

`src/main/index.ts` (window + IPC wiring) and
`src/main/opencode.ts` (the `OpenShellBackend` — all opencode2 traffic).

This is the only place that imports `@opencode-ai/client`. If the client
API changes shape, only these two files change.

## OpenShellBackend (`src/main/opencode.ts`)

State:

- `client` — `OpenCode.make()` result, null until connected
- `sessionID`, `directory`, `sessionInfo` — the active session plus optional parent/title/agent metadata
- `snapshots: Map<absPath, baseline>` — per-file diff baselines
- `lastKnown: Map<absPath, content>` — last content seen by the watcher
- `watcher` — recursive `fs.watch` on the session directory
- `hasGit` — lazily probed (`.git` presence), cached tri-state
- `settingsPath` — `app.getPath("userData")/settings.json`, holds the
  last-used `{model:{id,providerID,variant?}}` and `{agent:{id}}` so new sessions
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
| `listSessions()` | `session.list({limit:30, order:"desc"})` → `{id, title, directory, updatedAt, parentID?, agent?}` |
| `openSessionById(sessionID)` | `session.get` to recover the directory, activates it, then `message.list` → replay transcript |
| `prompt(text, files?)` | `session.prompt({sessionID, text, files?: selected file URIs})` |
| `interrupt()` | `session.interrupt`, errors swallowed |
| `replyPermission(requestID, reply, sessionID?)` | `permission.reply` against the supplied owning session (active session fallback); reply is `"once"|"always"|"reject"` |
| `listDir(rel)` | `file.list`, strips trailing slashes from directory paths |
| `readFile(rel)` | Read a file via the API; `null` if unreadable |
| `writeFile(rel, content)` | Write via Node `fs` (no API write endpoint); updates snapshots and emits `file-update` |
| `createFile(rel)` | `mkdir -p` parents, write empty (fails if exists); snapshots as baseline and emits `file-update` |
| `createDir(rel)` | `mkdir` (fails if exists); no `file-update` — the renderer re-lists after the call |
| `deletePath(rel)` | `shell.trashItem` with `rm -rf` fallback; emits `file-update` (deleted) only for paths the app had tracked |
| `renamePath(rel, newName)` | `rename` within the same folder; moves the snapshot baseline and emits `file-update` for the new path (tracked files only) |
| `listProjects()` | `project.list`, maps to `{directory, name}` |
| `listModels()` | `model.list` (location = session dir), filters `enabled`, maps to `{id, providerID, name, variants}` |
| `modelDefault()` | `model.default`, maps the same |
| `switchModel(id, providerID, variant?)` | `session.switchModel`; persists the model and variant to `settings.json` |
| `listAgents()` | `agent.list` (location = session dir), maps to `{id, name}` |
| `switchAgent(id)` | `session.switchAgent`; persists the choice to `settings.json` |
| `getState()` | `{id, directory}` or null |
| `providerUsage()` | `fetchProviderUsage()` → per-provider usage-window/credit snapshots (`ProviderUsageResult[]`) |
| `sessionSelection()` | `session.get` → `{model?, agent?}` so the UI can restore the session's current picks |
| `providerUsage()` | Delegates to `src/main/provider-usage.ts` → `ProviderUsageResult[]` for every OAuth provider opencode has stored credentials for |

Provider usage (`providerUsage()`): the opencode service exposes no
provider plan/rate-limit API yet, so OpenShell reads the OAuth
credentials opencode persists (`~/.local/share/opencode/auth.json`,
plus the desktop-app location) and calls each provider's usage endpoint
directly — ChatGPT's `/backend-api/wham/usage` (weekly/monthly windows,
spend control, plan type), Anthropic's `/api/oauth/usage` (5h + weekly
utilization), GitHub Copilot's `copilot_internal/user` (credits/quota).
Tokens never leave the main process; the renderer only receives
normalized snapshots shaped like opencode's upcoming `/usage` response,
so a future server endpoint can replace the fetchers without UI changes.

Internals:

- `runEventLoop()` — reconnecting SSE loop; forwards every event as
  `{kind:"event", type, data}` then runs `handleServerEvent` (see
  `docs/events.md`).
- `activateSession(info)` — shared by `openSession` / `openSessionById`: sets
  the active session including parent/title/agent metadata, resets baselines,
  restarts the watcher, and emits `{kind:"session"}`.
- `replayTranscript(messages)` — converts `message.list` output to
  `TranscriptItem[]`: user, internal selection, synthetic/system/skill/shell,
  assistant, and compaction messages in persisted order. Internal selection
  and system prompt entries are retained for state reconstruction but filtered
  from the visible chat. Tool status comes
  from streaming/running/completed/error; parsed input, text/file content,
  metadata, provider state, duration, retry, error, and completion are restored.
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
| `shell:prompt` | `(text, files?) → void`; files are user-selected absolute paths converted to file URIs |
| `shell:select-files` | `() → string[]` (native multi-file dialog) |
| `shell:interrupt` | `() → void` |
| `shell:fs-list` | `(rel) → TreeEntry[]` |
| `shell:fs-read` | `(rel) → string \| null` |
| `shell:fs-write` | `(rel, content) → void` |
| `shell:fs-create-file` | `(rel) → void` |
| `shell:fs-create-dir` | `(rel) → void` |
| `shell:fs-delete` | `(rel) → void` |
| `shell:fs-rename` | `(rel, newName) → void` |
| `shell:projects` | `() → ProjectInfo[]` |
| `shell:models` | `() → ModelOption[]` |
| `shell:model-default` | `() → ModelOption \| null` |
| `shell:switch-model` | `(id, providerID, variant?) → void` |
| `shell:agents` | `() → AgentOption[]` |
| `shell:switch-agent` | `(id) → void` |
| `shell:terminal-start` | `(directory \| null) → { id }` (spawns a PTY login shell) |
| `shell:terminal-input` | `(id, data) → void` |
| `shell:terminal-resize` | `(id, cols, rows) → void` |
| `shell:terminal-stop` | `(id) → void` |
| `shell:permission-reply` | `(requestID, reply, sessionID?) → void` |
| `shell:state` | `() → SessionInfo \| null` |
| `shell:session-selection` | `() → SessionSelection \| null` |
| `shell:provider-usage` | `() → ProviderUsageResult[]` |
| `shell:health` | `() → boolean` |

Outbound: `webContents.send("shell:message", msg)` for every backend
message. External links open via `shell.openExternal`. The window is
`contextIsolation: true`, `nodeIntegration: false`, macOS
`titleBarStyle: "hiddenInset"`. The app icon (`resources/icon.svg` →
rasterized `resources/icon.png` + `resources/icon.icns`, the clay
shell-tile brand mark) is set as the BrowserWindow `icon` on
Windows/Linux and via `app.dock.setIcon` on macOS; the window flash
background is the warm `#161410`. In development, `npm run dev` /
`npm start` first run `scripts/make-dev-app.mjs`, which copies
`node_modules/electron/dist/Electron.app` to `dev/OpenShell.app`
(gitignored), patches its Info.plist (name "OpenShell", icon.icns,
`dev.openshell.app` id) and ad-hoc re-signs it — the launch scripts then
point electron-vite at that bundle via `ELECTRON_EXEC_PATH` so the dock
shows the real name and icon instead of Electron's defaults.

PTY messages come from a second emitter, `TerminalManager`
(`src/main/terminal.ts`): it forwards `{kind:"terminal-data",
terminal:{id,data}}` and `{kind:"terminal-exit", terminal:{id,exitCode}}`
over the same `shell:message` channel. `before-input-event` intercepts
⌘W / Ctrl+W (so it never closes the window) and forwards
`{kind:"ui-command", command:"toggle-word-wrap"}` to the renderer instead
(the user's muscle memory maps ⌘W to word wrap, and the window must never
die on it). DevTools follow the browser conventions: F12 toggles a
bottom-docked inspector (never detached) and ⌘⇧C (Ctrl+Shift+C) toggles
element-picking mode. Hover highlighting runs over the Chrome DevTools
Protocol (`webContents.debugger`, `Overlay.setInspectMode` with
`mode: "searchForNode"`); the pick itself is routed through
`inspectElement` at the picked node's box-model center
(`DOM.getBoxModel`) — overlay events only reach our debugger session,
and the Elements panel only selects nodes on browser-side inspects.
Esc, picking an element, ⌘⇧C, or closing DevTools exits the mode.
Keyboard handling is split: the app webContents uses
`before-input-event` (F12 toggle, Esc, ⌘⇧C); the DevTools webContents
cannot use it (Electron's `InspectableWebContents` delegate never
implements `PreHandleKeyboardEvent`), so a keydown watcher is injected
into the frontend page with `executeJavaScript` and polled from main —
F12 closes DevTools, Esc stops the picker, whichever side has focus.
The same watcher intercepts clicks on CSS rule source links (the
`styles.css:12` links in the Styles panel): it prevents the frontend's
own reveal, detects the link by its `title="<url>:<line>"` attribute
(text matching is a fallback), and re-sends it as a `ui-command`
`open-source` with `{ path, line }` so the editor opens the file at
the clicked rule — DevTools edits are ephemeral, the editor's are not.
Path resolution strips the `:line` suffix and accepts `file://` and
dev-server `http(s)://` URLs (mapping the URL path onto the session
directory), falling back to a basename search that skips `node_modules`
etc. If the file isn't in the session — DevTools always inspects
OpenShell's own renderer, so the inspected stylesheets are the app's —
resolution falls back to the app directory and the file is opened by
absolute path.
Picks are deduped (Chromium fires `inspectNodeRequested` twice per
click, once from pointer events, once from mouse events) and the
picker lifecycle is token-guarded so stale async arm calls can never
re-arm or wedge the state. Gotcha: `highlightConfig` is a required
parameter even for `mode: "none"`; omitting it makes Chromium reject
the command and leaves the overlay stuck in search mode, flashing
highlights forever.

Startup (`app.whenReady`): connect → `start()` → register IPC →
`createWindow()`. On `window-all-closed` non-darwin quits; the backend is
stopped in `before-quit` (window close on macOS no longer tears the
session down). On macOS activate: re-creates the window and calls
`backend.start()` again (it is restartable).
