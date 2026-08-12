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
| `busy` | `boolean` | active-session projection of the per-session busy map |
| `todos` | `TodoItem[]` | live OpenCode todo state shown in the prompt dock while the session executes |
| `transcript` | `TranscriptItem[]` | active-session projection of the per-session transcript map |
| `tabs` | `Tab[]` | open editor tabs, one per path |
| `activePath` | `string \| null` | active tab path |
| `agentFiles` | `Map<path, AgentFileState>` | `{baseline, content, deleted}` — what the agent touched; drives the Changes list + diff baselines |
| `tree` | `Record<relPath, TreeEntry[]>` | lazy-loaded explorer cache |
| `expanded` | `Set<relPath>` | open tree directories |
| `toasts` | `Toast[]` | transient notifications |
| `models` | `ModelOption[]` | for the composer model/strength picker |
| `currentModel` | `ModelOption \| null` | seeded from the active session selection (falling back to `modelDefault()`), live-updated by `session.model.selected`; includes selected `variant` |
| `agents` | `AgentOption[]` | for the composer agent picker |
| `currentAgent` | `AgentOption \| null` | live-updated by `session.agent.selected` |
| `approvalMode` | `ApprovalMode` | `ask` shows permission cards; `approve` automatically replies `once` |
| `wordWrap` | `boolean` | Monaco `wordWrap` setting, persisted to `localStorage` ("wordWrap") |
| `sessions` | `SessionSummary[]` | recent sessions for the Welcome screen |
| `ctxMenu` | `{x, y, target} \| null` | explorer right-click menu position and target entry (`null` = empty area) |
| `pendingCreate` | `{parent, kind} \| null` | inline "new file/folder" name input target |
| `pendingRename` | `{path} \| null` | inline rename input target |

Actions: `openSession`, `selectFolder`, `reopenSession(id)`,
`loadSessions`, `sendPrompt`, `stop`, `loadModels`, `switchModel`,
`loadAgents`, `switchAgent`, `toggleApprovalMode`, `toggleWordWrap`, `openFile(path, {mode})`,
`closeTab`, `setActive`, `setTabMode`, `editContent`, `saveTab`,
`toggleDir`, `replyPermission`, `openCtxMenu`, `closeCtxMenu`,
`startCreate(parent, kind)`, `startRename(path)`, `cancelPending`,
`commitName(name)`, `deleteEntry(path)`. `commitName`/`deleteEntry`
call the `shell:fs-*` mutation channels, then re-list every expanded
ancestor dir of the touched path so the tree stays current (directories
emit no `file-update`), move/close matching tabs, and move `agentFiles`
entries on rename.

Key mechanisms:

- **Event dispatch** — the `onMessage` effect handles `session` /
  `file-update` / `event` messages. The event switch is documented in
  `docs/events.md`. Every session event is reduced under its own `sessionID`;
  only selection-specific side effects such as the composer model and todo
  dock are gated to the active session. Current V2 `data` and legacy
  `properties` envelopes are normalized before dispatch. OpenCode's V2
  permission names are adapted to the common names.
- **OpenCode stream batching** — events queue for a 16ms frame and adjacent
  text, reasoning, and tool-input deltas are coalesced before React updates.
  Adjacent authoritative snapshots of the same legacy part collapse to the
  latest snapshot. A timer is used instead of animation frames so background
  windows continue draining the stream.
- **Selection parity** — catalog refreshes reconcile against
  `sessionSelection()` before falling back to `modelDefault()`, so a newly
  created or reopened GPT/agent session cannot be mislabeled with the previous
  session's model in the composer.
- **Catalog self-heal** — a `connected` effect re-runs `loadModels()` /
  `loadAgents()` once the backend client is up, so a boot or reconnect that
  first hit a silent empty catalog (no client yet) is retried and the
  composer agent/model menus never stay empty.
- **V2 session reducer** — `chat-stream.ts` buffers admitted input until its
  promoted event, retains non-chat agent/model switches as internal state, and
  folds synthetic/skill/shell/compaction messages, assistant lifecycle, and
  legacy `message.*` projections into ordered `TranscriptItem`s. Tool
  state retains parsed input, content blocks, metadata, execution state, and
  provider state. Durable end/snapshot events are authoritative; terminal
  tool states cannot regress when events arrive late.
- **Editor vs. watcher dedupe** — `expectedRef` holds the last content the
  editor wrote or the store applied; `editContent` and the file-update
  handler both consult it so the editor's own echoes don't mark tabs
  dirty/stale.
- **Autosave** — `saveTimers` debounce edits 900ms into `doSave`
  (⌘S bypasses the debounce via `saveTab`).
- **Diff wiring** — tabs carry `baseline` (from `agentFiles`) and the
  watcher's `file-update` keeps them fresh; `stale`/`deleted` flags
  surface external changes.

- **V2 transcript replay** — reopened sessions accept OpenCode's flat
  `SessionMessageInfo[]` plus legacy `info`/`parts` projections and reconstruct
  the same user, selection, synthetic/system/skill/shell, assistant, and
  compaction items used by the live reducer. Selection and system prompt items
  remain available for state reconstruction but are filtered from the chat
  timeline. Synthetic `<system-reminder>` entries are also retained for
  replay but filtered from the chat. Renderer
  startup reopens the backend's active session silently so a reload hydrates
  persisted messages before new live events continue. `mergeChatHistory` reconciles replay with
  any global SSE events received during the request, preserving terminal tool
  states and the longest streamed text/reasoning values.

- **Parent/child navigation** — `session.created` plus `session.list` maintain
  parent ids. Task cards use upstream's metadata-first, parent/title/agent
  fallback to open a child transcript, and child headers return to the parent.

- **OpenCode web transcript presentation** — `OpenCodeTimeline.tsx` ports the
  current OpenCode timeline rows and message-part slots to React. User messages
  use the subtle right-aligned layer bubble; assistant markdown is flat and
  paced while streamed reasoning stays ordered behind a collapsed Thinking
  disclosure and is rendered only when the user expands it; the generic
  TextShimmer Thinking row appears only before any renderable part; adjacent read/glob/grep/list
  parts group across assistant messages into Exploring/Explored; task calls use
  OpenCode's agent-colored delegation card and todo writes are hidden from the
  transcript in favor of the live prompt-dock checklist; remaining tools use
  flat BasicTool triggers.
  There is no assistant bubble, custom tool card, typing-dot placeholder, or
  stream cursor path.
- **Tree normalization** — `filterEntries` hides `HIDDEN_DIRS`; entries
  arrive trailing-slash-free from `listDir` (main process normalizes).

## Components (`src/renderer/src/components/`)

| Component | File | Role |
|---|---|---|
| `App` | `App.tsx` | Layout: titlebar + 3-pane grid (`useDragResize`; `minmax(0,1fr)` center, panels grow to meet each other on narrow windows) + optional bottom tray; left panel resizes to its original minimum and closes with its header arrow, right panel tracks the drag all the way down and switches to a 44px model strip only when dragged to that width; the agent's drag cap is the window minus the left panel's shown width (no fixed max), so it can be dragged to meet the sidebar on any window width — full chatbot view when the sidebar is collapsed; a panel sitting at its cap is anchored, so window resizes grow or shrink it in lockstep with the opposite panel, and only dragging the divider detaches it; both closed trays can be dragged outward from their divider to reopen the original pane; titlebar shows a tray toggle and busy/idle status; word-wrap shortcuts (⌘W intercepted in main, ⌥Z via `e.code`); darwin class for the traffic-light inset |
| `Welcome` | `Welcome.tsx` | Editorial two-column launcher: custom SVG mark (clay scallop-shell line art with a cream prompt chevron in its opening), serif wordmark (bundled Cormorant Garamond), folder pick (`selectFolder()`), and a hairline-bordered frame with Sessions/Projects tabs populated from `sessions()` / `projects()`; both tab lists stay mounted as stacked grid panes (`visibility: hidden` when inactive) so the frame height never changes on tab switch; session rows reopen via `openSessionById` |
| `FileSidebar` | `FileSidebar.tsx` | CHANGES panel (agent-touched files, click → diff, always present above the explorer section) as a drag-resizable bottom section with folder context in rows, + EXPLORER tree with VS Code-style codicon file/folder icons and per-level indent guide lines (`.tree-children` wrappers); rows show VS Code-style hover actions (New File / New Folder / ellipsis menu, via `RowActions`), right-click opens a context menu (New File / New Folder / Rename / Delete, trash on macOS) with inline name inputs (`.tree-input`), Enter commits / Esc cancels; header arrow collapses it to an activity bar with a single Explorer icon button, whose divider can drag it open |
| `EditorPane` | `EditorPane.tsx` | Tab bar (dirty dot, ⇄ diff badge), Monaco `Editor`/`DiffEditor`, Edit/Diff + Wrap toolbar, ⌘S save, 4 MiB/binary guards |
| `AgentPanel` | `AgentPanel.tsx` | Hosts the OpenCode timeline and V2 prompt dock: todo checklist, exact web placeholder, attachment picker, approval toggle, agent/model/variant menus, voice input, compact send/stop button, and smart auto-scroll; header arrow collapses it at the same time as the resize gesture reaches the model strip width |
| `OpenCodeTimeline` | `OpenCodeTimeline.tsx` | React port of OpenCode's web timeline/message-part presentation, including turn-wide grouping, paced markdown, TextShimmer, Thinking headings, context-tool aggregation, specialized task cards, BasicTool triggers, errors, compaction dividers, and docked permissions |
| `OpenCodeTodoDock` | `OpenCodeTodoDock.tsx` | OpenCode prompt-dock todo progress and checklist surface driven by `todo.updated` plus `todowrite` tool-state fallback; `todowrite` calls never appear as transcript tools |
| `AgentTray` | `AgentTray.tsx` | Shown when the agent panel is collapsed: transparent 44px strip mirroring the left activity bar, with a busy dot and model icon button that expands the panel back |
| `TerminalTray` | `TerminalTray.tsx` | xterm.js terminal fed by `node-pty`; subscribes to `terminal-data`/`terminal-exit` messages, fits + resizes the PTY on layout change, restarts on session change |

## Styles (`src/renderer/src/styles/`)

`main.scss` is the single renderer stylesheet entry and uses ordered Sass
partials so the cascade stays explicit. OpenCode's source-derived chat tokens,
slots, typography, row geometry, and animations live in
`_opencode-chat.scss`; other component rules are owned by `_sidebar.scss`,
`_editor.scss`, `_agent.scss`, `_composer.scss`,
`_welcome.scss`, and `_terminal.scss`; app-wide rules are separated into
`_foundation.scss`, `_layout.scss`, `_buttons.scss`, `_toasts.scss`, and
`_scrollbars.scss`. Vite CSS source maps are enabled in development, so
DevTools links inspected rules back to the partial and source line rather
than a generated `<style>` block or bundled CSS location. Runtime layout
measurements are passed as inline CSS custom-property values; their actual
presentational declarations remain in the owning SCSS partial.

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
