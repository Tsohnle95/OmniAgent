# Architecture

OpenShell is an Electron app built with **electron-vite** (three build
targets: `main`, `preload`, `renderer`). It is a GUI for the opencode2
agent: you open a repository, send a prompt, and watch the agent stream
its work while live diffs of changed files appear in the editor.

## Process model

```
┌─────────────────────────────────────────────────────────────┐
│ Electron MAIN (src/main/index.ts)                           │
│  • creates the BrowserWindow                                │
│  • owns OpenShellBackend (src/main/opencode.ts)             │
│  • registers shell:* IPC handlers                            │
│  • is the ONLY process that talks to opencode2              │
└──────────────┬───────────────────────────┬──────────────────┘
               │ ipcRenderer.invoke()      │ webContents.send()
               │ (renderer → main)         │ (main → renderer)
               ▼                           ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│ PRELOAD (src/preload)    │   │ RENDERER (React 19 + Monaco)│
│ contextBridge:           │   │  • store.tsx = all UI state │
│ window.openshell API     │   │  • components render it     │
└──────────────────────────┘   └─────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ opencode2 service (spawned via Service.ensure or existing)  │
│  • SSE event stream (client.event.subscribe)                │
│  • REST: session/file/model/project/permission endpoints    │
└─────────────────────────────────────────────────────────────┘
```

## Backend connection

`OpenShellBackend.connect()` in `src/main/opencode.ts`:

1. `Service.discover()` — finds an already-registered opencode service.
2. Falls back to `Service.ensure({ command: ["opencode2", "serve", "--service"] })`
   which spawns the service and waits for it to be ready.
3. Creates a typed client: `OpenCode.make({ baseUrl, headers })`.
4. The `runEventLoop()` SSE loop re-connects automatically and
   retries every 1.5s; `connect()` is retried every 2s until a client exists.

## Message flow

All backend→renderer message kinds are defined in
`src/shared/types.ts` (`BackendMessage`):

- `{ kind: "event", type, data }` — every opencode2 SSE event forwarded
  verbatim. The renderer dispatches on `type`. See `docs/events.md` for
  the full protocol map.
- `{ kind: "file-update", file: { workspace, sessionID, path, baseline, content, deleted } }` —
  emitted by the generation-bound fs watcher (below).
- `{ kind: "session", session: { id, directory, workspace } }` — emitted when a
  session is opened.
- `{ kind: "recovery", recovery: { workspace, records } }` — durable artifact
  inventory emitted on activation and transaction/acknowledgment changes.
- `{ kind: "terminal-data" | "terminal-exit", terminal }` — PTY output /
  exit from the terminal tray (`src/main/terminal.ts`).
- `{ kind: "ui-command", command }` — main-process requests to the
  renderer (`toggle-word-wrap` when ⌘W / Ctrl+W is pressed;
  `open-source` with `{ path, line }` when a CSS rule's source link is
  clicked in DevTools — the editor opens that file at that line).

Renderer→main is synchronous invoke over `shell:*` channels; the full
table is in `docs/main.md`.

## Renderer trust boundary

The application window is explicitly sandboxed with context isolation and no
Node integration. Its privileged preload bridge is protected in main: every
IPC invoke must come from the active window's main frame while it is at the
exact packaged application document or an approved loopback HTTP development
origin. Packaged startup ignores `ELECTRON_RENDERER_URL` and always loads the
bundled file.
Unexpected main-frame navigation and redirects are canceled, and all popup
creation is denied. Markdown and tool attachment anchors prevent same-frame
navigation and request an external popup instead. Main opens only absolute,
credential-free `https:` URLs through the operating system; local files,
custom schemes, malformed targets, and insecure HTTP targets are rejected.

## Session lifecycle

1. User picks a folder (renderer → `shell:select-folder` / `shell:open-session`).
   Main accepts the renderer generation before a native dialog opens, so a
   later user action wins even if an earlier dialog resolves later.
2. `openSession(directory)` creates the session via
   `client.session.create({ location: { directory } })` — opencode's own
   defaults pick the model and agent; stores `sessionID`/`directory`, clears
   baseline state, canonicalizes the workspace root, assigns a fresh
   immutable workspace UUID plus request generation, and starts the fs
   watcher. Activations are latest-request-wins and stale completions never
   commit.
3. Emits `{ kind: "session" }`; renderer resets all UI state.
4. Prompts go through `client.session.prompt({ sessionID, text, files? })`;
   interrupt through `client.session.interrupt`.
5. The backend owns one active session at a time. Creating or reopening a
   session replaces that active workspace, while OpenCode retains session
   history and child sessions.
6. Closing the window on macOS keeps the backend alive (it is only torn
   down in `before-quit`); re-activating re-creates the window while the
   single-flight event loop remains active. Shutdown aborts the active SDK SSE
   subscription and invalidates its generation before any later restart.

## Diffs and baselines (how the diff view works)

The Changes list represents workspace file changes observed during the active
session, regardless of whether they came from a tool, shell, editor, formatter,
user, or another process. Main preserves the first baseline per path:

- **Tool snapshot**: when `session.tool.called` arrives, every file path
  found in the tool input (keys `filePath`/`file_path`/`path`) is read and
  stored as that file's baseline *before* the tool executes.
- **git fallback**: files first observed via `fs.watch` use
  `git show HEAD:<rel>` in a Git workspace; untracked Git paths use known empty
  content.
- **unknown fallback**: first-observed non-git changes have an explicit unknown
  baseline because the watcher only has post-change bytes.
- **OpenShell mutations**: saves and creates establish a known baseline only
  when none exists. Delete and rename preserve the established baseline.
- **Live watching**: `fs.watch(directory, { recursive: true })` captures the
  activation root/session/generation and workspace-scoped maps, then feeds every
  change through a 200ms debounce into `onFsChanged`, which compares
  against `lastKnown`, assigns a baseline if missing, and emits
  identity-bound `file-update` with `{baseline, content}`. Await boundaries and
  emissions re-check that the captured activation is still current.

The renderer merges updates into tabs. A known baseline enables Monaco Diff;
an unknown baseline stays in Changes as `observed` with Diff unavailable.

This is observation, not attribution. Structured tool paths can be captured
before execution, but arbitrary shell command strings are not parsed for paths,
and Git `HEAD` does not identify an author. Skipped directories (`.git`,
dependencies, caches, IDE metadata, and build outputs), unreadable/binary files,
watcher coalescing, pre-activation changes, and missed first notifications can
prevent observation or recovery of pre-change content.

## Editing and saves

The renderer is fully editable. Each edit increments its tab revision and
autosave captures the exact workspace, path, content, expected disk content,
and revision after a 900ms debounce; ⌘S saves immediately. Saves serialize
per workspace/file in the renderer and all filesystem mutations serialize per
workspace in main; identified echoes clear only matching state.
Normal writes require the disk to still equal the last saved content. External
updates preserve local edits and pause saving until explicit reload, overwrite,
or keep-editing then save-merged resolution. Lifecycle changes invalidate
timers and stale completions; external updates advance a conflict generation so
an already-started completion cannot clear a newer conflict. Writes create a
transaction under workspace-local `.openshell-recovery`, copy proposed bytes
into a second durable artifact, move the current target inode into the
transaction, validate the held bytes, and install the temporary inode with a
no-replace hard link. The original pathname is briefly unavailable between the
hold and install. A concurrent recreation is never overwritten. Neither success
nor rollback unlinks the held original inode, so later writes through an
already-open descriptor remain visible in the recovery artifact. Proposed bytes
remain durable. Phase metadata is atomically replaced and fsynced; activation
restores the held original only for interrupted `source-held` or
`held-validated` transactions and only when the canonical path is missing,
never over an existing path. Completed, failed, and acknowledged history never
replays. Successful transactions are acknowledged automatically while their
bytes remain retained; abnormal transactions remain visible until acknowledged.
Acknowledge persists metadata only and never deletes bytes. Activation runs a
best-effort retention purge that removes settled transactions (`complete`,
`failed`, acknowledged) older than 24 hours and interrupted ones
(`source-held`, `held-validated`) older than 7 days; fresh transactions are
never purged. This protocol requires recovery and target names to share a
filesystem. Writes go through Node `fs` in the main process
(`shell:fs-write`); the opencode2 API has no write
endpoint — the server sees the change via its own file watching. The
explorer also supports create/file-rename/delete through `shell:fs-create-*`,
`shell:fs-rename`, `shell:fs-delete` (delete moves to Trash). File rename uses
same-filesystem no-replace hard-link/unlink semantics. Portable Node filesystem
APIs cannot guarantee no-replace directory rename, so directory rename is
rejected rather than recursively copying and deleting a potentially changing
source tree. File rename moves the source into a durable hold before linking the
no-replace destination. Rollback only links back into an absent source and never
unlinks the hold, preserving ambiguity when another process recreates the
source. These operations run through the same watcher so baselines and the tree
stay consistent.

Every workspace filesystem call carries the expected workspace UUID and main
rejects stale generations. Paths are bounded strict relative paths and no
existing symlink component may be traversed, including an intermediate parent
of a new target. This assumes stable topology during the operation; Node
pathname APIs cannot fully prevent an external symlink swap after validation.
Absolute reads are not part of the workspace API; the separate
app-root-confined source-view channel exists only for DevTools CSS navigation.

`.openshell-recovery` is excluded from watching, Explorer, and application file
references. The recovery root, transaction directories, artifacts, and
canonical recovery parents must contain no symlink component. Transaction ids
and manifests are validated, and Open resolves a known artifact id in main
rather than accepting a renderer path. Recovery reconciliation is activation-
generation guarded before filesystem mutation.

## Models, agents, and composer controls

The header of the agent panel has two pickers. Models come from
`client.model.list()` (filtered to `{ id, providerID, name, variants }`) and
are grouped by provider in the composer menu. The current model is seeded
from `client.model.default()` and updated live by `session.model.selected`.
Switching calls `client.session.switchModel({ sessionID, model })`, including
`model.variant` when a model exposes response-strength variants.
Agents come from `client.agent.list()`; the selection is updated live by
`session.agent.selected` and switched via
`client.session.switchAgent({ sessionID, agent })`. Both choices are
session-scoped only: a new session starts on opencode's configured defaults
(`default_agent` / default model), and OpenShell never writes preferences of
its own. The composer
also opens a native multi-file picker; the main process converts selected
files to `file://` URIs for the prompt API. Its approval toggle is local UI
state: approve mode automatically replies `once` to each permission request.
Voice input uses the Chromium Speech Recognition API when the Electron build
provides it.

## Terminal tray

The bottom tray (`src/main/terminal.ts` + `TerminalTray.tsx`) runs a real
PTY via `node-pty`. Main verifies the workspace identity and supplies the
canonical active workspace as cwd rather than accepting one from the renderer.
It spawns the selected shell in that directory and forwards PTY
output to the renderer as `terminal-data` messages; keystrokes go back
via `shell:terminal-input`. Resizes are handled with the xterm `fit`
addon + `shell:terminal-resize`. The tray is toggled from the titlebar
(⌥O), its height is drag-resizable, and dragging the divider to the
window bottom closes it on mouse release rather than mid-drag.
Terminal ids, ownership, input size, and bounded positive dimensions are
validated before operations reach `node-pty`.
The selected shell is the user's normal interactive shell, not a login shell.
The locked Node-API-based `node-pty` is exercised under Electron on macOS,
Linux, and Windows CI, so no native rebuild step is used.
Install restores execute permission on the packaged Unix `spawn-helper`; this
is a file-mode correction rather than a native compilation step.

## Permissions

When opencode2 needs approval it emits `permission.asked`. The renderer
shows a card with the action and resources and three buttons; the reply
(`once` | `always` | `reject`) goes through
`client.permission.reply({ sessionID, requestID, reply })`.

## Key constraints

- The renderer never touches Node APIs (contextIsolation + no
  nodeIntegration); everything goes through `window.openshell`.
- `SKIP_DIRS` (main) and `HIDDEN_DIRS` (renderer) filter tree noise
  (`node_modules`, `.git`, build dirs). Directory entries from the
  filesystem API arrive with trailing slashes and are normalized in
  `listDir`.
- `MAX_EDITABLE_BYTES` (4 MiB) and a NUL-byte check keep binary/huge
  files out of the editor.
