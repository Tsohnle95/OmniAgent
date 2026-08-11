# Module: renderer

`src/renderer/src/` — React 19 app. All state lives in one store
(`store.tsx`); components are presentational consumers of it. Monaco is
configured in `monaco.ts`.

## Store (`store.tsx`)

Exposed via `useStore()` (context). State:

| Slice | Shape | Notes |
|---|---|---|
| `session` | `SessionInfo \| null` | null → Welcome screen |
| `connected` | `boolean` | from `health()` on mount |
| `busy` | `boolean` | true while the agent executes |
| `transcript` | `TranscriptItem[]` | the agent panel feed |
| `tabs` | `Tab[]` | open editor tabs, one per path |
| `activePath` | `string \| null` | active tab path |
| `agentFiles` | `Map<path, AgentFileState>` | `{baseline, content, deleted}` — what the agent touched; drives the Changes list + diff baselines |
| `tree` | `Record<relPath, TreeEntry[]>` | lazy-loaded explorer cache |
| `expanded` | `Set<relPath>` | open tree directories |
| `toasts` | `Toast[]` | transient notifications |
| `models` | `ModelOption[]` | for the composer model/strength picker |
| `currentModel` | `ModelOption \| null` | seeded from `modelDefault()`, live-updated by `session.model.selected`; includes selected `variant` |
| `agents` | `AgentOption[]` | for the composer agent picker |
| `currentAgent` | `AgentOption \| null` | live-updated by `session.agent.selected` |
| `approvalMode` | `ApprovalMode` | `ask` shows permission cards; `approve` automatically replies `once` |
| `wordWrap` | `boolean` | Monaco `wordWrap` setting, persisted to `localStorage` ("wordWrap") |
| `sessions` | `SessionSummary[]` | recent sessions for the Welcome screen |

Actions: `openSession`, `selectFolder`, `reopenSession(id)`,
`loadSessions`, `sendPrompt`, `stop`, `loadModels`, `switchModel`,
`loadAgents`, `switchAgent`, `toggleApprovalMode`, `toggleWordWrap`, `openFile(path, {mode})`,
`closeTab`, `setActive`, `setTabMode`, `editContent`, `saveTab`,
`toggleDir`, `replyPermission`.

Key mechanisms:

- **Event dispatch** — the `onMessage` effect handles `session` /
  `file-update` / `event` messages. The event switch is documented in
  `docs/events.md`. Events are filtered by `data.sessionID`.
- **Tool tracking refs** — `toolNamesRef`, `toolInputsRef`, `toolStartRef`
  back the upsert-based tool cards (order-independent; see events doc).
  `upsertTool` never lets a terminal (`success`/`failed`) status regress
  to `running`, so a late-arriving `session.tool.called` can't reset a
  finished card.
- **Editor vs. watcher dedupe** — `expectedRef` holds the last content the
  editor wrote or the store applied; `editContent` and the file-update
  handler both consult it so the editor's own echoes don't mark tabs
  dirty/stale.
- **Autosave** — `saveTimers` debounce edits 900ms into `doSave`
  (⌘S bypasses the debounce via `saveTab`).
- **Diff wiring** — tabs carry `baseline` (from `agentFiles`) and the
  watcher's `file-update` keeps them fresh; `stale`/`deleted` flags
  surface external changes.
- **Tree normalization** — `filterEntries` hides `HIDDEN_DIRS`; entries
  arrive trailing-slash-free from `listDir` (main process normalizes).

## Components (`src/renderer/src/components/`)

| Component | File | Role |
|---|---|---|
| `App` | `App.tsx` | Layout: titlebar + 3-pane grid (`useDragResize`; `minmax(0,1fr)` center so panels never overflow) + optional bottom tray; left panel resizes to its original minimum and closes with its header arrow, right panel switches to a 44px model strip when dragged to that width; both closed trays can be dragged outward from their divider to reopen the original pane; titlebar shows a tray toggle and busy/idle status; word-wrap shortcuts (⌘W intercepted in main, ⌥Z via `e.code`); darwin class for the traffic-light inset |
| `Welcome` | `Welcome.tsx` | Folder pick + recent projects (`projects()`) |
| `FileSidebar` | `FileSidebar.tsx` | CHANGES panel (agent-touched files, click → diff) as a drag-resizable bottom section with folder context in rows, + EXPLORER tree with VS Code-style codicon file/folder icons and per-level indent guide lines (`.tree-children` wrappers); header arrow collapses it to an activity bar of Changes/Explorer icon buttons, whose divider can drag it open |
| `EditorPane` | `EditorPane.tsx` | Tab bar (dirty dot, ⇄ diff badge), Monaco `Editor`/`DiffEditor`, Edit/Diff + Wrap toolbar, ⌘S save, 4 MiB/binary guards |
| `AgentPanel` | `AgentPanel.tsx` | Transcript (user bubbles with attachment chips, assistant markdown + collapsible thinking, compact tool cards, permission cards, status lines) + integrated composer: neutral prompt placeholder, attachment picker, approval toggle, agent/model/variant menus, voice input, circular send button, and smart auto-scroll; header arrow collapses it at the same time as the resize gesture reaches the model strip width |
| `AgentTray` | `AgentTray.tsx` | Shown when the agent panel is collapsed: transparent 44px strip mirroring the left activity bar, with a busy dot and model icon button that expands the panel back |
| `TerminalTray` | `TerminalTray.tsx` | xterm.js terminal fed by `node-pty`; subscribes to `terminal-data`/`terminal-exit` messages, fits + resizes the PTY on layout change, restarts on session change |

Tool cards (`ToolCard`): show status spinner/check/cross, per-tool icon,
real tool name (from `session.tool.input.started`), a single-line
`$ command` for shell tools (no giant JSON input rectangles — read paths
appear as clickable file-path chips), elapsed/duration timer, and
collapsible output (up to 6000 chars) — failed tools auto-expand,
successful tools show a one-line preview with a "show output" toggle.
Permission cards show an action icon, resource list, and a resolved state
naming the reply (`Allowed · always` / `Denied`).

Terminal input flows: keystrokes → `terminalInput(id, data)`; output
streams back via `onMessage` (`terminal-data`). The xterm `fit` addon +
`ResizeObserver` keep the PTY dimensions in sync (`terminalResize`).
The tray is toggled from the titlebar (⌥O) and drag-resized via the
`tray-divider`. Dragging the divider down to the bottom of the window
shrinks the tray to a 26px minimum and closes it only when the mouse is
released at that collapsed position.

## Monaco (`monaco.ts`)

- Workers wired for editor/json/css/html/ts (`?worker` imports).
- `openshell-dark` theme (diff insert/remove colors included).
- `languageForPath()` — extension → Monaco language map (fallback
  `plaintext`).

## Entry

`main.tsx` mounts `<App/>` inside `StoreProvider`; `index.html` is the
Vite entry. `global.d.ts` types `window.openshell` from the preload API.
