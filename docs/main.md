# Module: main process

`src/main/index.ts` (window + IPC wiring) and
`src/main/opencode.ts` (the `OpenShellBackend` — all opencode2 traffic).

`src/main/opencode.ts` is the only file that imports `@opencode-ai/client`.
Provider usage is a separate main-process integration with provider APIs in
`src/main/provider-usage.ts`.

## OpenShellBackend (`src/main/opencode.ts`)

State:

- `client` — `OpenCode.make()` result, null until connected
- `sessionID`, canonical `directory`, `workspace`, `sessionInfo` — the active session and immutable activation identity plus optional parent/title/agent metadata
- `watchContext` — immutable activation root/session/workspace plus workspace-scoped `snapshots`, `lastKnown`, and `hasGit`
- `watcher` — recursive `fs.watch` on the session directory
- `stopped` and `eventLoop` — `start()` is single-flight, while stop aborts and
  invalidates the generation-owned SSE lifecycle before a later restart subscribes
- `activations` — monotonic latest-request-wins generation assigned before the
  first activation await
- `mutations` — serializes write/create/delete/rename operations per workspace

Public methods (all used by IPC):

| Method | Purpose |
|---|---|
| `connect()` | `Service.discover()` → `Service.ensure({command:["opencode2","serve","--service"]})` → `OpenCode.make` |
| `start()` | Start the SSE event loop if one is not already running |
| `stop()` | Abort and invalidate the active SSE loop lifecycle, then stop the fs watcher |
| `onMessage(cb)` | Subscribe to outbound messages; returns unsubscribe |
| `beginActivation(requestGeneration)` | Accept a renderer user action before native dialog/backend awaits and return the backend generation |
| `openSession(directory)` | Accepts a generation, calls `session.create`, and commits only if still latest; starts the generation-bound watcher and emits `{kind:"session"}` |
| `listSessions()` | `session.list({limit:30, order:"desc"})` → `{id, title, directory, updatedAt, parentID?, agent?}` |
| `openSessionById(sessionID)` | Accepts a generation, loads `session.get` plus replay, then commits only if still latest |
| `prompt(workspace, text, files?)` | Captures and verifies the workspace/session around attachment awaits, then calls `session.prompt` |
| `listCommands()` | `command.list({location})` + `skill.list({location})` → `CommandOption[]` (`kind: "command" | "skill"`) for the session directory |
| `runCommand(workspace, name, args?)` | Captures and verifies the workspace/session around skill lookup and command mutation |
| `searchFiles(query)` | `file.find({location, query, type: "file"})` → `ReferenceOption[]`; `rel` is the path relative to the session directory, `path` is absolute for prompt attachment |
| `interrupt(workspace)` | Interrupts the captured active session and rejects stale completion |
| `replyPermission(workspace, requestID, reply, sessionID)` | Replies only when the supplied session is the captured active workspace session |
| `listDir(workspace, rel)` | Validates active identity and confinement, then `file.list`; strips trailing slashes |
| `readFile(workspace, rel)` | Confined workspace-relative API read; `null` if unreadable |
| `writeFile(workspace, rel, content, write)` | Confined bounded Node `fs` write; holds and validates the expected disk version, installs by no-replace link, preserves recovery files on concurrent recreation, and emits an identified `file-update` |
| `createFile(workspace, rel)` | Confined `mkdir -p` parents and empty exclusive write; emits `file-update` |
| `createDir(workspace, rel)` | Confined `mkdir` (fails if exists); renderer re-lists after the call |
| `deletePath(workspace, rel)` | Confined `shell.trashItem`; emits tracked deletion only after success and preserves Trash failures for the renderer |
| `renamePath(workspace, rel, newName)` | Confined same-folder no-replace file rename; rejects occupied destinations and directory renames where portable no-replace semantics are unavailable |
| `listRecovery(workspace)` | Lists validated durable recovery artifacts under the active workspace's `.openshell-recovery` directory |
| `openRecovery(workspace, id)` | Opens the validated artifact selected by opaque recovery record id; never accepts a renderer path |
| `acknowledgeRecovery(workspace, id)` | Persists acknowledgment in the transaction manifest without deleting artifact bytes |
| `listProjects()` | `project.list`, maps to `{directory, name}` |
| `listModels()` | `model.list` (location = session dir), filters `enabled`, maps to `{id, providerID, name, variants}` |
| `modelDefault()` | `model.default`, maps the same |
| `switchModel(workspace, id, providerID, variant?)` | Switches only the captured active session, then persists the selection |
| `listAgents()` | `agent.list` (location = session dir), maps to `{id, name}` |
| `switchAgent(workspace, id)` | Switches only the captured active session, then persists the choice |
| `getState()` | `{id, directory}` or null |
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
  `docs/events.md`). Stop/restart serializes subscription lifetimes, and
  filesystem side handling requires a matching top-level event location.
- `activateSession(generation, info)` — canonicalizes, checks latest-request-wins,
  creates `{id, generation}` identity and workspace-scoped watcher maps, then
  commits and emits `{kind:"session"}`.
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
- `startWatcher(context)` / `scheduleWatch(context, abs)` /
  `onFsChanged(context, ...)` — 200ms debounced pipeline. Every callback
  captures root/session/generation/maps and checks it after awaits and before
  map mutation or emission.
- `emitFileUpdate(context, ...)` — emits identity-bound `{kind:"file-update"}`.
- `relKey(abs)` — absolute → `/`-separated path relative to the session
  dir; `abs(rel)` the inverse. `shouldSkip` filters `SKIP_DIRS` roots.
- Recovery transactions live under `.openshell-recovery/<timestamp>-<uuid>`.
  Atomically replaced, fsynced manifests record save/rename phase and
  acknowledgment state. Activation reconciles only `source-held` and
  `held-validated` interrupted transactions, where OpenShell is known to have
  removed the canonical pathname, and hard-links the held original only when
  that pathname remains missing. Completed, failed, and acknowledged history
  never replays. After reconciliation, a best-effort retention purge removes
  settled transactions (`complete`, `failed`, acknowledged) older than 24h and
  interrupted ones (`source-held`, `held-validated`) older than 7 days; fresh
  transactions are never purged. The recovery root, transaction paths,
  canonical parents, and artifacts reject symlinks and malformed
  ids/manifests; artifact Open actions resolve validated ids rather than
  renderer paths.

## IPC surface (`src/main/index.ts`)

| Channel | Args → Returns |
|---|---|
| `shell:select-folder` | `(generation) → SessionInfo \| null` (generation accepted before native dialog) |
| `shell:open-session` | `(dir, generation) → SessionInfo` |
| `shell:sessions` | `() → SessionSummary[]` |
| `shell:open-session-id` | `(sessionID, generation) → ReopenedSession` |
| `shell:prompt` | `(workspace, text, files?) → void` |
| `shell:commands` | `() → CommandOption[]` (opencode slash commands + skills for the session directory) |
| `shell:run-command` | `(workspace, name, args?) → void` |
| `shell:find-files` | `(query) → ReferenceOption[]` (`file.find` search for @-mentions; `rel` paths relative to the session directory) |
| `shell:select-files` | `() → string[]` (native multi-file dialog) |
| `shell:interrupt` | `(workspace) → void` |
| `shell:fs-list` | `(workspace, rel) → TreeEntry[]` |
| `shell:fs-read` | `(workspace, rel) → string \| null` |
| `shell:source-read` | `(absolutePath) → string \| null`; app-root-confined DevTools source view only |
| `shell:fs-write` | `(workspace, rel, content, write) → void` |
| `shell:fs-create-file` | `(workspace, rel) → void` |
| `shell:fs-create-dir` | `(workspace, rel) → void` |
| `shell:fs-delete` | `(workspace, rel) → void` |
| `shell:fs-rename` | `(workspace, rel, newName) → void` |
| `shell:recovery-list` | `(workspace) → RecoveryRecord[]` |
| `shell:recovery-open` | `(workspace, recoveryID) → void` |
| `shell:recovery-acknowledge` | `(workspace, recoveryID) → void`; metadata only, never deletes bytes |
| `shell:projects` | `() → ProjectInfo[]` |
| `shell:models` | `() → ModelOption[]` |
| `shell:model-default` | `() → ModelOption \| null` |
| `shell:switch-model` | `(workspace, id, providerID, variant?) → void` |
| `shell:agents` | `() → AgentOption[]` |
| `shell:switch-agent` | `(workspace, id) → void` |
| `shell:terminal-start` | `(workspace, id) → void`; renderer allocates a validated UUID id before invoking, main supplies the canonical active workspace cwd |
| `shell:terminal-input` | `(workspace, id, data) → void` |
| `shell:terminal-resize` | `(workspace, id, cols, rows) → void` |
| `shell:terminal-stop` | `(workspace, id) → void` |
| `shell:permission-reply` | `(workspace, requestID, reply, sessionID) → void` |
| `shell:state` | `() → SessionInfo \| null` |
| `shell:session-selection` | `() → SessionSelection \| null` |
| `shell:provider-usage` | `() → ProviderUsageResult[]` |
| `shell:health` | `() → boolean` |
| `shell:install-app` | `() → {ok, message}`; macOS only — spawns `scripts/install-app.mjs` to build and package the app, then replaces `/Applications/OpenShell.app` |

Outbound: `webContents.send("shell:message", msg)` for every backend
message. Every `shell:*` invoke is accepted only from the active window's
owned main frame while that frame is at the trusted application location;
other WebContents, subframes, null frames, and unexpected URLs are rejected
before the handler runs. External links from Markdown, tool attachments, and
popup attempts share one policy: only absolute, credential-free `https:` URLs
reach `shell.openExternal`; malformed URLs, `http:`, `file:`, custom schemes,
and URLs containing credentials are inert. The popup itself is always denied.
The packaged app always loads the exact bundled `file:` document and ignores
`ELECTRON_RENDERER_URL`. An unpackaged app may use only a credential-free
loopback `http:` development URL and then trusts that exact origin. Other main-frame navigations and
redirects are canceled. The window is `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, macOS
`titleBarStyle: "hiddenInset"`. The app icon (`resources/icon.svg` →
rasterized `resources/icon.png` + `resources/icon.icns`, the clay
shell-tile brand mark) is set as the BrowserWindow `icon` on
Windows/Linux and via `app.dock.setIcon` on macOS; the window flash
background is the warm `#161410`. On macOS, `npm run dev` and `npm start`
use `scripts/launch.mjs` to run
`scripts/make-dev-app.mjs`, which copies
`node_modules/electron/dist/Electron.app` to `dev/OpenShell.app`
(gitignored), patches its Info.plist (name "OpenShell", icon.icns,
`dev.openshell.app` id) and ad-hoc re-signs it. The launcher then
points electron-vite at that bundle via `ELECTRON_EXEC_PATH` so the dock
shows the real name and icon instead of Electron's defaults. Linux and Windows
skip bundle preparation and use plain Electron. Production packaging uses the
same brand: `npm run pack` (or the Welcome screen's Install app button on
macOS, only when the app is unpackaged) runs `scripts/install-app.mjs`, which
builds `out/`, packages `release/mac/OpenShell.app` with electron-builder
(`electron-builder.yml`; `asar: false` keeps the unpacked `app/` layout so
the trusted packaged document stays exactly
`file://…/OpenShell.app/Contents/Resources/app/out/renderer/index.html`),
ad-hoc re-signs the bundle, and — for the install flow — replaces
`/Applications/OpenShell.app` with `cp -R`, preserving the signature.
`shell:install-app` runs the script as a child of the Electron binary under
`ELECTRON_RUN_AS_NODE=1` and parses the JSON result line it prints. The
renderer gates the button on `window.openshell.isPackaged`: main passes
`--openshell-packaged` as an `additionalArguments` flag when
`app.isPackaged`, and the preload exposes it from `process.argv`.

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

Workspace paths are strict `/`-separated relative paths: absolute paths,
empty file paths, traversal, backslashes, NULs, duplicate separators, and
oversized values are rejected. Main canonicalizes the root and rejects any
existing symlink component, including intermediate symlink parents for new
targets. This stable-topology policy means Explorer capabilities do not follow
symlinks, but Node pathname APIs cannot eliminate an external symlink swap
between validation and use. File content and every `expectedContent` value are
capped at 8 MiB, including explicit overwrites. The separate `source-read` channel
accepts only absolute descendants of the canonical application root and exists
solely to preserve DevTools source navigation. Terminal ids use `term-N`, input
is capped at 1 MiB per invoke, dimensions are positive integers bounded to
1000 columns by 500 rows, unknown PTYs fail, and every PTY is owned by the
workspace identity that created it.
Picks are deduped (Chromium fires `inspectNodeRequested` twice per
click, once from pointer events, once from mouse events) and the
picker lifecycle is token-guarded so stale async arm calls can never
re-arm or wedge the state. Gotcha: `highlightConfig` is a required
parameter even for `mode: "none"`; omitting it makes Chromium reject
the command and leaves the overlay stuck in search mode, flashing
highlights forever.

Startup (`app.whenReady`): `start()` → register backend and terminal forwarders
→ register IPC → `createWindow()` → begin asynchronous `connect()`. On
`window-all-closed` the app quits on every platform and the backend is
stopped in `before-quit`; the window is created hidden and shown on
`ready-to-show` (5s fallback), renderer console output is forwarded to
main stdout, and a renderer crash logs and reloads (once per 10s) instead
of leaving a dead black window. On macOS activate: re-creates only the
window if it was destroyed; the backend's single-flight event loop remains
active while the window lives.
