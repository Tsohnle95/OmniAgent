# Module: main process

`src/main/index.ts` (window + IPC wiring) and
`src/main/opencode.ts` (the `OpenShellBackend` — all opencode2 traffic).

`src/main/opencode.ts` is the only file that imports `@opencode-ai/client`.
Provider usage is a separate main-process integration with provider APIs in
`src/main/provider-usage.ts`.

## OpenShellBackend (`src/main/opencode.ts`)

State:

- `client` — `OpenCode.make()` result, null until connected
- `contexts` — a `Map<workspaceID, SessionContext>` of concurrently open
  sessions. Each `SessionContext` holds the immutable `WorkspaceIdentity`
  (`{id, generation}`), the session id, the canonical `directory`, the
  emitted `sessionInfo`, a workspace-scoped `watchContext` (`snapshots`,
  `lastKnown`, `hasGit`, debounce `timers`), the context's own `FSWatcher`,
  and a context-local `activations` generation guard for in-flight
  watcher/recovery work
- `primary` — the workspace id of the most recently activated context
- `stopped` and `eventLoop` — `start()` is single-flight, while stop aborts and
  invalidates the generation-owned SSE lifecycle before a later restart subscribes
- `activations` — monotonic token mint used for `WorkspaceIdentity.generation`
  and invalidated by `stop()`; each context additionally guards its own
  in-flight work
- `mutations` — serializes write/create/delete/rename operations per workspace

Every renderer-supplied `WorkspaceIdentity` is resolved through `contextFor`,
which looks the id up in `contexts` and rejects stale or unknown identities;
routing is per context instead of against a single active session. A context
is created per activation, and re-activating the same session id on the same
directory reuses the existing context (idempotent), keeping the workspace
identity stable so renderer editor state and file-update routing survive a
reopen.

Public methods (all used by IPC):

| Method | Purpose |
|---|---|
| `connect()` | `Service.discover()` → `Service.ensure({command:["opencode2","serve","--service"]})` → `OpenCode.make` |
| `start()` | Start the SSE event loop if one is not already running |
| `stop()` | Abort and invalidate the active SSE loop lifecycle, then stop every context's fs watcher |
| `onMessage(cb)` | Subscribe to outbound messages; returns unsubscribe |
| `beginActivation(requestGeneration)` | Accept a renderer user action before native dialog/backend awaits and return a fresh backend generation token |
| `openSession(directory)` | Accepts a generation, calls `session.create`, and activates a new context (a new concurrent panel); starts the context watcher and emits `{kind:"session"}` |
| `openFileWorkspace(absolutePath, generation?)` | Validates the path is a regular file, opens a session on its parent directory (via `openSession`), and returns `{session, path}` so the renderer opens the file inside a true single-file workspace |
| `resolveExternalOpen(workspace, absolutePath)` | Resolves a dragged/dropped absolute path against the workspace root: inside-repo files come back as `{kind:"relative", rel, content}`, outside-repo files as a writable `{kind:"standalone", path, content}` (content size-capped, atomically readable) |
| `statExternal(absolutePath)` | Probes an absolute path (`file` / `directory` / `missing`) so a mixed file/folder drop can be routed: files open as standalone tabs, folders import into the workspace |
| `writeStandaloneFile(absolutePath, content, expectedContent, overwrite)` | Bounded atomic write (temp-file + rename in the file's own directory) for standalone tabs; rejects mismatched `expectedContent` unless `overwrite` |
| `importExternal(workspace, destDir, sources)` | Copies external files/folders into the workspace at `destDir` (per-workspace serialized, symbolically linked entries skipped, file/byte caps), seeding the watcher's known baselines so imported files never surface in Changes |
| `listSessions()` | `session.list` (paged, newest first) → `{id, title, directory, updatedAt, parentID?, agent?}`; hides sessions older than 30 days and sessions with no conversation (no title and zero token usage) |
| `activeSessions()` | The open contexts' `SessionInfo` in activation order, primary last (startup restore) |
| `closeSession(workspace)` | Tears down the addressed context (stops its watcher, removes it from the context map) when its panel closes; the opencode session itself stays alive so recents can reopen it |
| `openSessionById(sessionID)` | Loads `session.get` plus replay; reuses the context when the session is already open (no re-emit), otherwise activates a new one |
| `sessionTranscript(sessionID)` | Loads `message.list` replay as `{transcript, todos}` without activating a context; the renderer's stream materialization source |
| `workspaceDirectory(workspace)` | Resolves a workspace identity to its canonical session directory (terminal cwd, identity validation) |
| `prompt(workspace, text, files?)` | Captures and verifies the context around attachment awaits, then calls `session.prompt` |
| `listCommands(workspace)` | Built-ins (`/compact`) + `command.list({location})` + `skill.list({location})` → `CommandOption[]` (`kind: "command" | "skill"`) for the session directory |
| `runCommand(workspace, name, args?)` | Routes built-ins (`/compact` → `session.compact`), otherwise captures and verifies the context around skill lookup and command mutation |
| `searchFiles(workspace, query)` | `file.find({location, query, type: "file"})` → `ReferenceOption[]`; `rel` is the path relative to the session directory, `path` is absolute for prompt attachment |
| `interrupt(workspace)` | Interrupts the captured session and rejects stale completion |
| `replyPermission(workspace, requestID, reply, sessionID)` | Replies only when the supplied session is the captured context session |
| `listPermissions(workspace)` | `permission.request.list()` → `PendingPermissionRequest[]` (`id`, `sessionID`, `action`, `resources`) for every pending request on the service |
| `listDir(workspace, rel)` | Validates the context and confinement, then reads the directory directly from the filesystem (`fs.readdir`) with trailing slashes stripped |
| `readFile(workspace, rel)` | Confined workspace-relative API read; `null` if unreadable |
| `writeFile(workspace, rel, content, write)` | Confined bounded Node `fs` write; holds and validates the expected disk version, installs by no-replace link, preserves recovery files on concurrent recreation, and emits an identified `file-update` |
| `createFile(workspace, rel)` | Confined `mkdir -p` parents and empty exclusive write; emits `file-update` |
| `createDir(workspace, rel)` | Confined `mkdir` (fails if exists); renderer re-lists after the call |
| `deletePath(workspace, rel)` | Confined `shell.trashItem`; emits tracked deletion only after success and preserves Trash failures for the renderer |
| `detachPath(workspace, rel)` | Confined move to the user-level detached store; removes the entry from the workspace without deleting its contents |
| `renamePath(workspace, rel, newName)` | Confined same-folder no-replace file rename; rejects occupied destinations and directory renames where portable no-replace semantics are unavailable |
| `movePath(workspace, rel, newParent)` | Confined cross-folder move for files and directories via one atomic `fs.rename` (no recovery hold — see architecture); rejects self/descendant, missing, occupied, cross-filesystem, and `.openshell-recovery` source/destination paths; emits a tracked deletion at the source and, for files, an addition at the target |
| `listRecovery(workspace)` | Lists validated durable recovery artifacts under the addressed workspace's `.openshell-recovery` directory |
| `openRecovery(workspace, id)` | Opens the validated artifact selected by opaque recovery record id; never accepts a renderer path |
| `acknowledgeRecovery(workspace, id)` | Persists acknowledgment in the transaction manifest without deleting artifact bytes |
| `listProjects()` | `project.list`, maps to `{directory, name}` |
| `listModels(workspace)` | `model.list` (location = session dir), filters `enabled`, maps to `{id, providerID, name, variants, limit?}` (`limit.context` = the model's context-window size) |
| `modelDefault(workspace)` | `model.default`, maps the same |
| `switchModel(workspace, id, providerID, variant?)` | Switches only the captured context session, then persists the selection |
| `listAgents(workspace)` | `agent.list` (location = session dir), maps to `{id, name}` |
| `switchAgent(workspace, id)` | Switches only the captured context session, then persists the choice |
| `getState()` | The primary (most recently activated) session `{id, directory, workspace}` or null |
| `sessionSelection(workspace)` | `session.get` → `{model?, agent?}` so the UI can restore the addressed session's current picks |
| `providerUsage()` | Delegates to `src/main/provider-usage.ts` → `ProviderUsageResult[]` for every provider (OAuth or API-key) opencode has stored credentials for |

Provider usage (`providerUsage()`): the opencode service exposes no
provider plan/rate-limit API yet, so OpenShell reads the credentials
opencode persists — OAuth entries from `~/.local/share/opencode/auth.json`
(plus the desktop-app location) and JSON-encoded credentials from the
`account` / `credential` tables of `opencode.db` (V2 rows carry
`active = NULL`; OAuth and API-key values use typed JSON credentials) — and
calls each provider's usage endpoint directly — ChatGPT's
`/backend-api/wham/usage` (weekly/monthly windows, spend control, plan
type), Anthropic's `/api/oauth/usage` (5h + weekly utilization), GitHub
Copilot's `copilot_internal/user` (credits/quota), and OpenCode Go's
`https://opencode.ai/zen/go/v1/usage` (rolling, weekly, and monthly
utilization). Tokens never leave the main process; the renderer only receives
normalized provider snapshots.

Internals:

- `runEventLoop()` — one global reconnecting SSE loop driven by the
  `createStreamPipeline` transport in `src/main/stream-pipeline.ts`: 33ms
  per-directory batched flushing with delta coalescing and snapshot barriers,
  a 30s heartbeat that aborts silent streams, and exponential reconnect
  backoff (250ms base, ×2, 5s cap). Stream errors drop the client so the next
  attempt rediscovers the service, and reconnects emit a synthetic
  `server.connected` so the renderer re-materializes open sessions.
  `deliverEvents` forwards each event as `{kind:"event", type, data}` and
  runs `handleServerEvent` (see `docs/events.md`). Stop/restart serializes
  subscription lifetimes, and filesystem side handling requires a matching
  top-level event location.
- `activateSession(info)` — canonicalizes, mints a fresh
  `{id, generation}` workspace identity, and creates a per-session context
  with its own watcher maps and activation guard; re-activating the same
  session id on the same directory returns the existing context unchanged.
  Commits, starts the context watcher, and emits `{kind:"session"}` plus the
  context's recovery records.
- `replayTranscript(messages)` — converts `message.list` output to
  `TranscriptItem[]`: user, internal selection, synthetic/system/skill/shell,
  assistant, and compaction messages in persisted order. Internal selection
  and system prompt entries are retained for state reconstruction but filtered
  from the visible chat. Tool status comes
  from streaming/running/completed/error; parsed input, text/file content,
  metadata, provider state, duration, retry, error, and completion are restored.
- `loadSessionMessages(sessionID)` — `message.list` with one retry; a persistent
  failure throws so reopen surfaces an error instead of materializing an empty
  conversation (which would block later rehydration).
- Session retention (`scheduleRetentionPrune` / `pruneExpiredSessions`) — after
  every successful connect (throttled to once per 24h), pages through all
  sessions and permanently deletes those whose last activity is older than 30
  days (`SESSION_RETENTION_MS` in `@shared/retention`). Conversation-less
  sessions (no title and zero token usage — e.g. workspaces opened but never
  prompted) are deleted after only 24 hours (`EMPTY_SESSION_RETENTION_MS`) so
  auto-created empties never accumulate. Sessions currently open in OpenShell
  and sessions with unknown timestamps are never deleted; per-session removal
  failures are skipped. `listSessions` applies the same 30-day window and
  additionally hides never-prompted sessions, so they cannot crowd real history
  out of recents.
- `snapshotInputs(context, input)` — recursively walks the tool-call input for
  `filePath`/`file_path`/`path` keys and snapshots those files
  (skips http URLs, dedupes) into the addressed context.
- `gitShow(rel)` — `git show HEAD:<rel>` with a 10s timeout, 16 MiB
  buffer; null on any failure.
- `startWatcher(context)` / `scheduleWatch(context, abs)` /
  `onFsChanged(context, ...)` — one recursive `fs.watch` and 200ms debounced
  pipeline per open context. Every callback captures its
  root/session/generation/maps and checks `currentWatch` after awaits and
  before map mutation or emission.
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
| `shell:select-folder` | `(generation) → SessionInfo \| null` (generation accepted before native dialog); the returned session is mounted by the caller — replacing the displayed panels, added as a new panel, or swapped into an existing panel — depending on the store action that opened the dialog |
| `shell:open-session` | `(dir, generation) → SessionInfo` — creates a session for `dir`; used for the app-wide replacement view, model-mode additions, and per-panel workspace swaps |
| `shell:select-file` | `(generation) → OpenFileWorkspaceResult \| null` (generation accepted before native `openFile` dialog); opens the folder containing the chosen file as a single-file workspace |
| `shell:open-file` | `(file, generation) → OpenFileWorkspaceResult` — programmatic single-file workspace open for an absolute path (parent-folder session + the file to open) |
| `shell:open-external` | `(workspace, file) → ExternalOpenResult` — resolves a dropped absolute path: in-repo files become `{kind:"relative", rel, content}`, outside-repo files a writable `{kind:"standalone", path, content}` |
| `shell:stat-external` | `(file) → ExternalKind` — probes an absolute path as `file` / `directory` / `missing` to route mixed file/folder drops |
| `shell:fs-write-standalone` | `(file, content, expectedContent, overwrite) → void` — atomic standalone-file write for external tabs |
| `shell:fs-import` | `(workspace, destDir, sources) → ImportResult[]` — copies external files/folders into the workspace at `destDir` (empty `destDir` is the workspace root) |
| `shell:sessions` | `() → SessionSummary[]` |
| `shell:active-sessions` | `() → SessionInfo[]` — open backend sessions, most recently activated last |
| `shell:close-session` | `(workspace) → void` — tears down the backend context when a panel closes; the opencode session remains reopenable |
| `shell:open-session-id` | `(sessionID, generation) → ReopenedSession` |
| `shell:session-transcript` | `(sessionID) → { transcript, todos }` — stream materialization snapshot; does not activate a context |
| `shell:prompt` | `(workspace, text, files?) → void` |
| `shell:commands` | `(workspace) → CommandOption[]` (built-ins like `/compact` + opencode slash commands + skills for the session directory) |
| `shell:run-command` | `(workspace, name, args?) → void` |
| `shell:find-files` | `(workspace, query) → ReferenceOption[]` (`file.find` search for @-mentions; `rel` paths relative to the session directory) |
| `shell:select-files` | `() → string[]` (native multi-file dialog) |
| `shell:select-images` | `() → string[]` (native multi-file dialog filtered to image types) |
| `shell:read-image-preview` | `(absolutePath) → string \| null` — resized data-URL thumbnail for composer attachment chips; `null` when the file is not a decodable image |
| `shell:interrupt` | `(workspace) → void` |
| `shell:fs-list` | `(workspace, rel) → TreeEntry[]` |
| `shell:fs-read` | `(workspace, rel) → string \| null` |
| `shell:source-read` | `(absolutePath) → string \| null`; app-root-confined DevTools source view only |
| `shell:fs-write` | `(workspace, rel, content, write) → void` |
| `shell:fs-create-file` | `(workspace, rel) → void` |
| `shell:fs-create-dir` | `(workspace, rel) → void` |
| `shell:fs-delete` | `(workspace, rel) → void` |
| `shell:fs-detach` | `(workspace, rel) → void` |
| `shell:fs-rename` | `(workspace, rel, newName) → void` |
| `shell:fs-move` | `(workspace, rel, newParent) → void`; `newParent` empty means the workspace root |
| `shell:recovery-list` | `(workspace) → RecoveryRecord[]` |
| `shell:recovery-open` | `(workspace, recoveryID) → void` |
| `shell:recovery-acknowledge` | `(workspace, recoveryID) → void`; metadata only, never deletes bytes |
| `shell:projects` | `() → ProjectInfo[]` |
| `shell:models` | `(workspace) → ModelOption[]` |
| `shell:model-default` | `(workspace) → ModelOption \| null` |
| `shell:switch-model` | `(workspace, id, providerID, variant?) → void` |
| `shell:agents` | `(workspace) → AgentOption[]` |
| `shell:switch-agent` | `(workspace, id) → void` |
| `shell:terminal-start` | `(workspace, id) → void`; renderer allocates a validated UUID id before invoking, main supplies the addressed workspace's canonical cwd |
| `shell:terminal-input` | `(workspace, id, data) → void` |
| `shell:terminal-resize` | `(workspace, id, cols, rows) → void` |
| `shell:terminal-stop` | `(workspace, id) → void` |
| `shell:permission-reply` | `(workspace, requestID, reply, sessionID) → void` |
| `shell:list-permissions` | `(workspace) → PendingPermissionRequest[]`; pending permission requests across the service's sessions |
| `shell:state` | `() → SessionInfo \| null` |
| `shell:session-selection` | `(workspace) → SessionSelection \| null` |
| `shell:provider-usage` | `() → ProviderUsageResult[]` |
| `shell:health` | `() → boolean` |
| `shell:install-app` | `() → {ok, message}`; macOS only — spawns `scripts/install-app.mjs` to build and package the app, then replaces `/Applications/OpenShell.app` |
| `shell:validate-w3c` | `(path, content) → W3cDiagnostic[]`; calls the Nu Html Checker or W3C CSS Validator for HTML and plain CSS paths; preprocessor stylesheets (SCSS, LESS, Sass) return no diagnostics |

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
over the same `shell:message` channel. Every PTY is owned by the workspace
identity that created it, and each session panel's terminal tray boots and
stops its own terminals as the user switches focus — `stopAll()` only runs
at quit. `before-input-event` intercepts
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
own reveal, detects the clicked link by its source URL attributes
(including `title="<url>:<line>"`), and re-sends it as a `ui-command`
`open-source` with `{ path, line, root }` so the editor opens the file
at the clicked rule — DevTools edits are ephemeral, the editor's are not.
(The injected regexes are embedded in a template literal, so every
backslash is doubled to survive string-escape cooking.) Path resolution
strips the `:line` suffix and accepts `file://` and dev-server
`http(s)://` URLs (mapping the URL path onto the session directory or
using an absolute pathname verbatim, e.g. Vite's absolute served paths),
falling back to a basename search that skips `node_modules`, `out`,
`dist`, etc. — both the direct and the searched resolution skip known
build-output directories so a hashed bundle is never opened as if it
were source. If the file isn't in the session — DevTools always inspects
OpenShell's own renderer, so the inspected stylesheets are the app's —
resolution falls back to the app directory. The command then carries the
resolution root plus a workspace-relative path, so the renderer opens
the file inside an app-root session instead of a read-only absolute
source tab; in dev mode (where Vite serves the real `.scss` sources and
`css.devSourcemap` is on) the links in the Styles panel are the actual
source files with accurate line numbers, so clicking one opens the
editable stylesheet. In the compiled app the links point at the hashed
bundle and Vite's build emits no CSS maps (a Vite 6 limitation), so
bundle links are skipped and DevTools keeps its normal behavior.

Workspace paths are strict `/`-separated relative paths: absolute paths,
empty file paths, traversal, backslashes, NULs, duplicate separators, and
oversized values are rejected. Main canonicalizes the root and rejects any
existing symlink component, including intermediate symlink parents for new
targets. This stable-topology policy means Explorer capabilities do not follow
symlinks, but Node pathname APIs cannot eliminate an external symlink swap
between validation and use. File content and every `expectedContent` value are
capped at 8 MiB, including explicit overwrites. The separate `source-read` channel
accepts only absolute descendants of the canonical application root; it backs the
renderer's absolute-path fallback for `open-source` (main normally sends a
workspace-relative path plus its resolution root). Terminal ids use `term-N`, input
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
active while the window lives. Opening a new session no longer resets the
terminal tray: terminals belong to their workspace identity and each
session's tray manages its own PTYs.
