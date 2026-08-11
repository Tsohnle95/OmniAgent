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

`OpenShellBackend.connect()` (`src/main/opencode.ts:70`):

1. `Service.discover()` — finds an already-registered opencode service.
2. Falls back to `Service.ensure({ command: ["opencode2", "serve", "--service"] })`
   which spawns the service and waits for it to be ready.
3. Creates a typed client: `OpenCode.make({ baseUrl, headers })`.
4. The SSE loop (`runEventLoop`, line 89) re-connects automatically and
   retries every 1.5s; `connect()` is retried every 2s until a client exists.

## Message flow

All backend→renderer message kinds are defined in
`src/shared/types.ts` (`BackendMessage`):

- `{ kind: "event", type, data }` — every opencode2 SSE event forwarded
  verbatim. The renderer dispatches on `type`. See `docs/events.md` for
  the full protocol map.
- `{ kind: "file-update", file: { path, baseline, content, deleted } }` —
  emitted by the fs watcher (below).
- `{ kind: "session", session: { id, directory } }` — emitted when a
  session is opened.
- `{ kind: "terminal-data" | "terminal-exit", terminal }` — PTY output /
  exit from the terminal tray (`src/main/terminal.ts`).
- `{ kind: "ui-command", command }` — main-process requests to the
  renderer (currently `toggle-word-wrap` when ⌘W / Ctrl+W is pressed).

Renderer→main is synchronous invoke over `shell:*` channels; the full
table is in `docs/main.md`.

## Session lifecycle

1. User picks a folder (renderer → `shell:select-folder` / `shell:open-session`).
2. `openSession(directory)` creates the session via
   `client.session.create({ location: { directory }, model?, agent? })` —
   the last-used model and agent are read from `settings.json` (userData)
   and passed along; stores `sessionID`/`directory`, clears baseline
   state, starts the fs watcher.
3. Emits `{ kind: "session" }`; renderer resets all UI state.
4. Prompts go through `client.session.prompt({ sessionID, text })`;
   interrupt through `client.session.interrupt`.
5. Only ONE session exists per app run (history/reopen exists via
   `openSessionById`, see `docs/main.md`).
6. Closing the window on macOS keeps the backend alive (it is only torn
   down in `before-quit`); re-activating re-creates the window and
   restarts the event loop via `backend.start()`.

## Diffs and baselines (how the diff view works)

The center pane shows, for each file, a diff of "what the agent changed
this session". The main process maintains per-file baselines:

- **Tool snapshot**: when `session.tool.called` arrives, every file path
  found in the tool input (keys `filePath`/`file_path`/`path`) is read and
  stored as that file's baseline *before* the tool executes.
- **git fallback**: files first observed via `fs.watch` get their baseline
  from `git show HEAD:<rel>` when the repo has a `.git`; for non-git repos
  the baseline is the first content observed.
- **Live watching**: `fs.watch(directory, { recursive: true })` feeds every
  change through a 200ms debounce into `onFsChanged`, which compares
  against `lastKnown`, assigns a baseline if missing, and emits
  `file-update` with `{baseline, content}`.

The renderer merges these updates into tabs; a tab whose baseline differs
from its content can be toggled to the Diff view (Monaco `DiffEditor`).

## Editing and saves

The renderer is fully editable. Autosave is debounced (900ms) and also on
⌘S. Edits that originate from the editor are tracked in `expectedRef` so
the watcher's own `file-update` echo does not mark the tab as externally
changed (`dirty`/`stale` flags on `Tab`). Writes go through Node `fs` in
the main process (`shell:fs-write`); the opencode2 API has no write
endpoint — the server sees the change via its own file watching.

## Models and agents

The header of the agent panel has two pickers. Models come from
`client.model.list()` (filtered to `{ id, providerID, name }`) and are
grouped by provider in the dropdown. The current model is seeded from
`client.model.default()` and updated live by `session.model.selected`.
Switching calls `client.session.switchModel({ sessionID, model })`.
Agents come from `client.agent.list()`; the selection is updated live by
`session.agent.selected` and switched via
`client.session.switchAgent({ sessionID, agent })`. Both choices are
persisted to `settings.json` so new sessions start with them.

## Terminal tray

The bottom tray (`src/main/terminal.ts` + `TerminalTray.tsx`) runs a real
PTY via `node-pty` (rebuilt against Electron's ABI by `@electron/rebuild`;
see `scripts`). The main process spawns the login shell (`zsh -l` on
macOS, `$SHELL` elsewhere) in the session directory and forwards PTY
output to the renderer as `terminal-data` messages; keystrokes go back
via `shell:terminal-input`. Resizes are handled with the xterm `fit`
addon + `shell:terminal-resize`. The tray is toggled from the titlebar
(⌥O) and its height is drag-resizable.

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
