# Module: renderer

`src/renderer/src/` — React 19 app. All state lives in one store
(`store.tsx`); components are presentational consumers of it. Monaco is
configured in `monaco.ts`.

## Store (`store.tsx`)

Exposed via `useStore()` (context). State:

| Slice | Shape | Notes |
|---|---|---|
| `session` | `SessionInfo \| null` | the focused session (derived from `panels` + `activeSessionID`); null → Welcome screen |
| `panels` | `SessionInfo[]` | open sessions in panel order; each panel streams and renders its own session |
| `panelViews` | `Record<workspaceID, PanelView>` | per-panel scoped projection (`session`, `busy`, `transcript`, `todos`, `sessionUsage`, `models`, `currentModel`, `agents`, `currentAgent`) consumed through `usePanel(workspace)` |
| `activeSessionID` | `string \| null` | focused session id; the editor, sidebar, tree, and terminal tray bind to the focused panel while every panel keeps streaming |
| `connected` | `boolean` | from `health()` on mount |
| `busy` | `boolean` | active-session projection of the per-session busy map |
| `todos` | `TodoItem[]` | live OpenCode todo state shown in the prompt dock while the session executes |
| `transcript` | `TranscriptItem[]` | active-session projection of the per-session transcript map |
| `sessionUsage` | `SessionUsage \| null` | active-session projection of cumulative token usage/cost; hydrated from `session.get` on reopen and kept fresh by `session.usage.updated` / `session.usage.recorded`; shown in the agent header popup |
| `providerUsage` | `ProviderUsageResult[]` | per-provider plan/rate-limit snapshots fetched via `refreshProviderUsage()`; rendered under the session usage popup |
| `providerUsageLoading` | `boolean` | true while `refreshProviderUsage()` is in flight (refetch happens each time the usage popup opens) |
| `tabs` | `Tab[]` | open editor tabs for the focused workspace (per-workspace record; each session restores its own tabs on focus) |
| `activePath` | `string \| null` | active tab path for the focused workspace |
| `agentFiles` | `Map<path, AgentFileState>` | `{baseline, content, deleted}` for observed workspace changes; drives Changes and known/unknown diff state; per workspace |
| `tree` | `Record<relPath, TreeEntry[]>` | lazy-loaded explorer cache; per workspace |
| `expanded` | `Set<relPath>` | open tree directories; per workspace |
| `toasts` | `Toast[]` | transient notifications |
| `recoveryRecords` | `RecoveryRecord[]` | durable workspace artifacts for the focused workspace; unacknowledged records remain actionable across restart |
| `models` | `ModelOption[]` | for the composer model/strength picker |
| `currentModel` | `ModelOption \| null` | per workspace; seeded from the session selection (falling back to `modelDefault()`) when a panel activates so a new session never displays another session's model; live-updated by `session.model.selected` for the addressed session; includes selected `variant`; carries `limit.context` from the model catalog, which the usage popup uses to compute context-window fill |
| `agents` | `AgentOption[]` | for the composer agent picker |
| `currentAgent` | `AgentOption \| null` | per workspace; seeded from the session selection, falling back to the session's creation agent and then `build`; live-updated by `session.agent.selected` for the addressed session and optimistic `switchAgent` |
| `approvalMode` | `ApprovalMode` | `ask` shows permission cards; `approve` automatically replies `once` |
| `wordWrap` | `boolean` | Monaco `wordWrap` setting, persisted to `localStorage` ("wordWrap") |
| `sessions` | `SessionSummary[]` | recent sessions for the Welcome screen and the Sessions rail |
| `ctxMenu` | `{x, y, target} \| null` | explorer right-click menu position and target entry (`null` = empty area) |
| `pendingCreate` | `{parent, kind} \| null` | inline "new file/folder" name input target |
| `pendingRename` | `{path} \| null` | inline rename input target |

Actions: `openSession` / `selectFolder` (spawn a new panel), `reopenSession(id, silent)`
(focus the panel when the session is open, otherwise activate a new one), `focusSession(id)`,
`closePanel(id)`, `loadSessions`, `sendPrompt(text, files, workspace?)`, `stop(workspace?)`,
`refreshProviderUsage`, `loadModels(workspace?)`, `switchModel(id, providerID, variant?, workspace?)`,
`loadAgents(workspace?)`, `switchAgent(id, workspace?)`, `toggleApprovalMode`, `toggleWordWrap`,
`openFile(path, {mode}, workspace?)`, `closeTab`, `setActive`, `setTabMode`, `editContent`, `saveTab`,
`reloadTab`, `overwriteTab`, `mergeTab`, `toggleDir`, `ensureRootOpen`,
`replyPermission(requestID, reply, sessionID?)`,
`openCtxMenu`, `closeCtxMenu`, `startCreate(parent, kind)`, `startRename(path)`, `cancelPending`,
`commitName(name)`, `deleteEntry(path)`, `moveEntry(path, destDir)`,
`openRecovery(id)`, `acknowledgeRecovery(id)`. `closePanel` invokes
`shell:close-session` so main tears down the panel's backend context
(watcher, context map) while the opencode session stays reopenable. The optional workspace/session parameters let
a background panel's composer act on its own session while the focused session's editor keeps
its state; they default to the focused session. `commitName`/`deleteEntry`/
`moveEntry` call the `shell:fs-*` mutation channels, then re-list every expanded
ancestor dir of the touched path so the tree stays current (directories
emit no `file-update`), move/close matching tabs, and move `agentFiles`
entries on rename. `moveEntry` re-lists both the old parent and the
destination and drops `deleted` change entries instead of remapping them,
so a moved folder never reappears in Changes as deleted at its new path.

Filesystem and terminal calls carry the addressed panel's `session.workspace`,
the immutable identity for that activation. Main resolves each identity against
its open context map and rejects unknown or replaced identities. `open-source`
uses the separate privileged source-view read only for absolute app paths;
normal editor reads are workspace-relative.

Sessions activate concurrently: opening or reopening a session adds a panel
(or focuses the existing one) without disturbing the others, and every async
continuation captures its workspace identity and mutates only that workspace's
records, so a slow operation from panel A can never populate panel B's editor
or tree. Focus has a monotonic version: a late activation completion never
steals focus from a newer user action. Startup restoration reopens the
backend's active sessions silently (via `activeSessions()`) and focuses the
most recently activated one only if the user hasn't already acted.
`file-update` is accepted only when both its session ID and full workspace
identity match an open panel.

Key mechanisms:

- **Event dispatch** — the `onMessage` effect handles `session` /
  `file-update` / `event` messages. The event switch is documented in
  `docs/events.md`. Every session event is reduced under its own `sessionID`;
  side effects (model/agent selection, todos, permissions, busy) land on the
  panel that owns the addressed session, so background panels stream
  independently. `{kind:"session"}` messages upsert panels idempotently.
  Current V2 `data` and legacy `properties` envelopes are normalized before
  dispatch. OpenCode's V2 permission names are adapted to the common names.
- **OpenCode stream batching** — events queue for a 16ms frame and adjacent
  text, reasoning, and tool-input deltas are coalesced before React updates.
  Adjacent authoritative snapshots of the same legacy part collapse to the
  latest snapshot. A timer is used instead of animation frames so background
  windows continue draining the stream.
- **Session retention** — completed tool and shell output retains at most 8 KiB,
  split between the beginning and end with the omitted character count in the
  middle. Text tool content is discarded after it is projected into `output`;
  file content blocks remain available. Live reduction and replay hydration use
  the same policy. The active stream plus the four most recently updated
  inactive streams are retained in memory; usage records follow the same LRU
  policy. Open panels are exempt from eviction, so a background panel's
  transcript and usage can never be silently blanked by other sessions'
  streams. A panel whose record was evicted while closed (or is otherwise
  missing) is re-hydrated from OpenCode when it is focused or reopened, so
  closed sessions remain reopenable and are hydrated on demand.
- **Selection parity** — catalog refreshes reconcile against
  `sessionSelection()` before falling back to `modelDefault()`, so a newly
  created or reopened GPT/agent session cannot be mislabeled with the previous
  session's model in the composer.
- **Catalog self-heal** — the store re-checks backend health every 2s until
  the first successful connect; a `connected` effect then re-runs
  `loadModels()` / `loadAgents()` once the backend client is up, so a boot or
  reconnect that first hit a silent empty catalog (no client yet) is retried
  and the composer agent/model menus never stay empty. `agent.updated` and
  `catalog.updated` events additionally refetch the agent/model catalogs when
  the service resolves them lazily after a session opened, and opening a
  picker menu whose list is still empty refetches that catalog and shows a
  "No agents available" placeholder instead of a blank box.
- **V2 session reducer** — `chat-stream.ts` buffers admitted input until its
  promoted event, retains non-chat agent/model switches as internal state, and
  folds synthetic/skill/shell/compaction messages, assistant lifecycle, and
  legacy `message.*` projections into ordered `TranscriptItem`s. Tool
  state retains parsed input, content blocks, metadata, execution state, and
  provider state. Durable end/snapshot events are authoritative; terminal
  tool states cannot regress when events arrive late.
- **Revision-safe persistence** — `EditorPersistence` receives immutable
  workspace/path/content/revision snapshots, debounces 900ms, serializes each
  workspace/file, and strongly identifies echoes. Dirty clears only for the
  matching current revision; ⌘S cancels the timer and saves that revision.
- **Lifecycle and conflicts** — reset, close, delete, rename, switch, and
  unmount invalidate relevant timers, expected echoes, and completions.
  External updates advance a per-path conflict generation, so completion of a
  write already in flight cannot clear the newer conflict.
  External updates preserve edits and pause saving until explicit Reload,
  Overwrite, or Keep editing to merge followed by Save merged content.
- **Diff wiring** — tabs carry the first established known/unknown `baseline`
  from `agentFiles`; saves do not replace it. Known content enables Diff,
  unknown content stays labeled as observed with Diff unavailable, and
  `stale`/`deleted` flags surface external changes.

- **V2 transcript replay** — reopened sessions accept OpenCode's flat
  `SessionMessageInfo[]` plus legacy `info`/`parts` projections and reconstruct
  the same user, selection, synthetic/system/skill/shell, assistant, and
  compaction items used by the live reducer. Selection and system prompt items
  remain available for state reconstruction but are filtered from the chat
  timeline. Synthetic `<system-reminder>` entries are also retained for
  replay but filtered from the chat. Renderer
  startup reopens the backend's active session silently so a reload hydrates
  persisted messages before new live events continue. `mergeChatHistory`
  reconciles replay with any global SSE events received during the request,
  preserving the live timeline's semantic interleaving, terminal tool states,
  and the longest streamed text/reasoning values.

- **Parent/child navigation** — `session.created` plus `session.list` maintain
  parent ids. Task cards use upstream's metadata-first, parent/title/agent
  fallback to open a child transcript, and child headers return to the parent.
  Timeline tool cards carry their panel's session so opening a file from a
  background panel focuses that panel first, and permission replies address
  the owning session.

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
- **Large-session fixture** — `large-session.performance.test.ts` deterministically
  reduces 2,400 events into 400 assistant messages and measures timeline-row
  derivation and retained output. After one warmup, median-of-five proxy budgets
  are 100 ms reducer/update time, 10 ms derived timeline time, at most 1,000
  estimated rows, and 8 KiB retained output per completed tool or shell result.
  A separate generous 5,000 ms budget measures React reconciliation and 800
  actual rows constructed in jsdom. It does not cover Chromium layout, paint,
  compositor work, or browser memory and is not a browser render budget.
- **Tree normalization** — `filterEntries` hides `HIDDEN_DIRS`; entries
  arrive trailing-slash-free from `listDir` (main process normalizes).
  `.openshell-recovery` is hidden independently in main and renderer.
- **Drag-and-drop moves** — every explorer row is draggable; dropping onto
  a folder row moves the entry into it and dropping onto the empty tree
  area moves it to the workspace root. Self drops, drops into a folder's
  own descendant, drops onto the current parent, and file-onto-file drops
  are rejected by prefix containment checks in the sidebar (`canDrop`) and
  again in main. The hovered destination gets a drop indicator; a valid
  drop calls `moveEntry`, which performs the `shell:fs-move` invoke and
  remaps `tabs`, `activePath`, and `agentFiles` on success.
- **Recovery notice** — unacknowledged records are shown persistently with
  Open and Acknowledge actions. Acknowledge updates manifest metadata and hides
  the record without deleting bytes. Directories never offer Rename because
  backend rename is file-only.

## Components (`src/renderer/src/components/`)

| Component | File | Role |
|---|---|---|
| `App` | `App.tsx` | Layout: titlebar + fixed 3-track grid (sidebar, divider, workspace area) + optional bottom tray. The workspace area is a relative flex row whose editor fills the whole region; each open session is an absolutely positioned `agent-col` tray with its own `{left, width, open}` slot state, so no panel can move another. The original (first) panel is right-anchored: it starts at the area's right edge and stays there, resized from its left edge handle. Newly added panels stack 280px wide against the left of the right anchor. Every panel resizes from either edge — dragging the left edge moves it while the right edge stays put, dragging the right edge moves it while the left edge stays put — and only the header drag slides the whole tray (width unchanged) through the file-area space; slides and resizes are clamped by the nearest panels on either side (neighbors sorted by position). Collapsed panels become 44px trays (rightmost) or slivers. One clamp effect resolves overflow only on window/sidebar resizes — never during a drag — shrinking widths to fit and re-anchoring everything rightmost-first without overlap. The agent-mode titlebar toggle collapses the sidebar and slams the anchored panel to the full-area single chat view; toggling again restores the sidebar and its 300px minimum width. Clicking a panel focuses it (its editor/tree/terminal state swaps in); titlebar shows a sessions toggle (running panels, recents, saved workspaces — `SessionsTab`), open-another-workspace buttons, the agent-mode toggle, and the terminal toggle |
| `Welcome` | `Welcome.tsx` | Editorial two-column launcher: the shared `ShellMark` SVG (clay scallop-shell line art with a cream prompt chevron in its opening), serif wordmark (bundled Cormorant Garamond), folder pick (`selectFolder()`), and a hairline-bordered frame with Sessions/Projects tabs populated from `sessions()` / `projects()`; both tab lists stay mounted as stacked grid panes (`visibility: hidden` when inactive) so the frame height never changes on tab switch; session rows reopen via `openSessionById` |
| `FileSidebar` | `FileSidebar.tsx` | CHANGES panel for observed workspace file changes (known baselines open as diffs; unknown baselines are labeled observed), plus the EXPLORER tree, create/rename/delete actions, and drag-and-drop moves onto folders or the root; each newly focused session ensure-opens the explorer root (`ensureRootOpen` expands and refreshes it without ever collapsing a previously visited workspace) |
| `EditorPane` | `EditorPane.tsx` | Tab bar (dirty dot, ⇄ diff badge), Monaco `Editor`/`DiffEditor`, Edit/Diff + Wrap toolbar, ⌘S save, 4 MiB/binary guards |
| `SessionsTab` | `SessionsTab.tsx` | Sessions rail: running panels (focus/close), recent sessions (reopen; "open" badge when already running), saved workspaces (`projects()` → new session), and an "Open another workspace" spawn affordance |
| `AgentPanel` | `AgentPanel.tsx` | `session`-parameterized panel hosting the OpenCode timeline and V2 prompt dock: todo checklist, exact web placeholder, attachment picker, approval toggle, agent/model/variant menus, voice input, compact send/stop button, and smart auto-scroll; the composer resolves `/` into a slash-command picker (built-ins like `/compact` first, then `command.list` + `skill.list`; skills run via `session.skill`, `/compact` via `session.compact`) that runs via `runCommand` (Enter on a leading-`/` prompt runs it too) and `@` into a file-mention picker (`file.find` search, debounced per keystroke) that inserts `@rel` tokens attached to the prompt as `PromptFile`s with mention spans; header arrow collapses it at the same time as the resize gesture reaches the model strip width; a coin-token toggle in the header opens a usage popup (session tokens/cost from `sessionUsage`, per-provider plan limits from `providerUsage`); the toggle glyph is a ring whose arc and color (green < 60% → amber → red ≥ 85%) track context-window fill, and the popup shows a "Context window" fill bar with percent and `input of limit tokens` — input tokens vs the active model's `limit.context` — hidden when the model reports no context limit |
| `OpenCodeTimeline` | `OpenCodeTimeline.tsx` | React port of OpenCode's web timeline/message-part presentation; walks each turn body chronologically and groups only contiguous assistant runs, preserving interleaved shell, compaction, synthetic, skill, status, and divider rows |
| `OpenCodeTodoDock` | `OpenCodeTodoDock.tsx` | OpenCode prompt-dock todo progress and checklist surface driven by `todo.updated` plus `todowrite` tool-state fallback; `todowrite` calls never appear as transcript tools |
| `AgentTray` | `AgentTray.tsx` | Shown when the rightmost agent panel is collapsed: transparent 44px strip mirroring the left activity bar, with a busy dot and model icon button that expands the panel back (busy/label come from the addressed panel's view); collapsed inner panels render the equivalent `agent-sliver` |
| `TerminalTray` | `TerminalTray.tsx` | xterm.js terminal fed by `node-pty`; subscribes to `terminal-data`/`terminal-exit` messages, removes naturally exited tabs and selects a neighbor, bounds startup output awaiting xterm registration, fits + resizes the PTY on layout change, and restarts on session change |

## Styles (`src/renderer/src/styles/`)

`main.scss` is the single renderer stylesheet entry and uses ordered Sass
partials so the cascade stays explicit. OpenCode's source-derived chat tokens,
slots, typography, row geometry, and animations live in
`_opencode-chat.scss`; other component rules are owned by `_sidebar.scss`,
`_editor.scss`, `_agent.scss`, `_composer.scss`,
`_welcome.scss`, `_sessions.scss`, and `_terminal.scss`; app-wide rules are separated into
`_foundation.scss`, `_layout.scss`, `_buttons.scss`, `_toasts.scss`, and
`_scrollbars.scss`. Vite CSS source maps are enabled in development, so
DevTools links inspected rules back to the partial and source line rather
than a generated `<style>` block or bundled CSS location. Runtime layout
measurements are passed as inline CSS custom-property values; their actual
presentational declarations remain in the owning SCSS partial.

Terminal input flows: keystrokes → `terminalInput(id, data)`; output
streams back via `onMessage` (`terminal-data`). The xterm `fit` addon +
`ResizeObserver` keep the PTY dimensions in sync (`terminalResize`).
The renderer generates and registers each validated terminal UUID before
invoking `terminalStart`, so startup output or exit can be attributed even when
it arrives before the invoke resolves. Only those pending IDs can buffer startup output. Buffers retain at most 64 chunks / 256 KiB for ten
seconds and are cleared on exit, close, registration, or workspace reset.
Closing the final tab commits an empty tab state before hiding the tray;
reopening shows that empty state and requires the explicit `+` action to start
a new process. A natural final exit leaves the empty tray visible.
The tray is toggled from the titlebar (⌥O) and drag-resized via the
`tray-divider`. Dragging the divider down to the bottom of the window
shrinks the tray to a 26px minimum and closes it only when the mouse is
released at that collapsed position.

## Monaco (`monaco.ts`)

- Workers wired for editor/json/css/html/ts (`?worker` imports).
- `openshell-dark` theme (diff insert/remove colors included).
- `languageForPath()` — extension → Monaco language map (fallback
  `plaintext`).
- CSS/SCSS/LESS diagnostics come from the bundled CSS worker; validation is
  pinned on with `cssDefaults.setDiagnosticsOptions({ validate: true })`.
  HTML gets no validation from its bundled worker, so the renderer runs
  `htmlhint` on the main thread instead.

## Editor diagnostics (`diagnostics.ts`)

- `isHtmlFile()` — restricts validation to real `.html`/`.htm` files so
  `.vue`/`.svelte` tabs (which also map to the `html` language) are skipped.
- `validateHtmlContent()` — runs htmlhint with a validity-only ruleset
  (tag pairing, duplicate attributes, unique ids, empty `src`, missing
  `alt`, unsafe/special characters) and converts each hint to a monaco
  `IMarkerData` with 1-based positions and `Error` severity. Empty and
  >4 MiB inputs are skipped.
- `createDiagnosticsScheduler()` — debounced (400 ms) validation that
  publishes through a caller-supplied callback.
- `EditorPane` wires the scheduler per tab: `onMount` captures the editor
  and schedules an initial pass, content changes reschedule, and markers
  are published to the tab's model via
  `monaco.editor.setModelMarkers(model, "htmlhint", markers)`.

## Entry

`main.tsx` mounts `<App/>`; `App` renders its own `StoreProvider`. `index.html` is the
Vite entry. `global.d.ts` types `window.openshell` from the preload API.
