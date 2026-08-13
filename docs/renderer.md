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
| `sessionUsage` | `SessionUsage \| null` | active-session projection of cumulative token usage/cost; hydrated from `session.get` on reopen and kept fresh by `session.usage.updated` / `session.usage.recorded`; shown in the agent header popup |
| `providerUsage` | `ProviderUsageResult[]` | per-provider plan/rate-limit snapshots fetched via `refreshProviderUsage()`; rendered under the session usage popup |
| `providerUsageLoading` | `boolean` | true while `refreshProviderUsage()` is in flight (refetch happens each time the usage popup opens) |
| `tabs` | `Tab[]` | open editor tabs, one per path |
| `activePath` | `string \| null` | active tab path |
| `agentFiles` | `Map<path, AgentFileState>` | `{baseline, content, deleted}` for observed workspace changes; drives Changes and known/unknown diff state |
| `tree` | `Record<relPath, TreeEntry[]>` | lazy-loaded explorer cache |
| `expanded` | `Set<relPath>` | open tree directories |
| `toasts` | `Toast[]` | transient notifications |
| `recoveryRecords` | `RecoveryRecord[]` | durable workspace artifacts; unacknowledged records remain actionable across restart |
| `models` | `ModelOption[]` | for the composer model/strength picker |
| `currentModel` | `ModelOption \| null` | seeded per session from the active session selection (falling back to `modelDefault()`), cleared on session switches so a new session never displays the previous session's model; live-updated by `session.model.selected`; includes selected `variant` |
| `agents` | `AgentOption[]` | for the composer agent picker |
| `currentAgent` | `AgentOption \| null` | seeded per session from the session selection, falling back to the session's creation agent and then `build`; cleared on session switches so a new session never displays the previous session's agent; live-updated by `session.agent.selected` and optimistic `switchAgent` |
| `approvalMode` | `ApprovalMode` | `ask` shows permission cards; `approve` automatically replies `once` |
| `wordWrap` | `boolean` | Monaco `wordWrap` setting, persisted to `localStorage` ("wordWrap") |
| `sessions` | `SessionSummary[]` | recent sessions for the Welcome screen |
| `ctxMenu` | `{x, y, target} \| null` | explorer right-click menu position and target entry (`null` = empty area) |
| `pendingCreate` | `{parent, kind} \| null` | inline "new file/folder" name input target |
| `pendingRename` | `{path} \| null` | inline rename input target |

Actions: `openSession`, `selectFolder`, `reopenSession(id)`,
`loadSessions`, `sendPrompt`, `stop`, `refreshProviderUsage`, `loadModels`, `switchModel`,
`loadAgents`, `switchAgent`, `toggleApprovalMode`, `toggleWordWrap`, `openFile(path, {mode})`,
`closeTab`, `setActive`, `setTabMode`, `editContent`, `saveTab`,
`reloadTab`, `overwriteTab`, `mergeTab`,
`toggleDir`, `replyPermission`, `openCtxMenu`, `closeCtxMenu`,
`startCreate(parent, kind)`, `startRename(path)`, `cancelPending`,
`commitName(name)`, `deleteEntry(path)`, `openRecovery(id)`,
`acknowledgeRecovery(id)`. `commitName`/`deleteEntry`
call the `shell:fs-*` mutation channels, then re-list every expanded
ancestor dir of the touched path so the tree stays current (directories
emit no `file-update`), move/close matching tabs, and move `agentFiles`
entries on rename.

Filesystem and terminal calls carry `session.workspace`, the immutable
identity for that activation. Main rejects calls from stale renderer work after
a workspace switch. `open-source` uses the separate privileged source-view read
only for absolute app paths; normal editor reads are workspace-relative.

Session activation is latest-request-wins in both renderer and main. The store
assigns a request generation before folder selection/open/reopen awaits and
passes it through IPC so main accepts folder selection before the dialog, ignores
session messages while a newer activation is pending, and discards stale
responses. File, tree, model, agent, selection, and startup-restoration
responses capture workspace identity and mutate state only while it still
matches. Source reads capture activation generation too, while newly requested
app-source tabs remain independent of workspace-relative reads. Stale activation
failures are discarded without user toasts. `file-update` is accepted only when both its session ID and full
workspace identity match the active session.
Slash-command and mention completion responses, attachment-picker results, and
create/delete/rename continuations use the same captured identity rule, so an
old workspace cannot populate or mutate the new workspace UI.

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
- **Session retention** — completed tool and shell output retains at most 8 KiB,
  split between the beginning and end with the omitted character count in the
  middle. Text tool content is discarded after it is projected into `output`;
  file content blocks remain available. Live reduction and replay hydration use
  the same policy. The active stream plus the four most recently updated
  inactive streams are retained in memory; usage records follow the same LRU
  policy. Evicted sessions remain reopenable and are hydrated from OpenCode on
  demand.
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
- **Recovery notice** — unacknowledged records are shown persistently with
  Open and Acknowledge actions. Acknowledge updates manifest metadata and hides
  the record without deleting bytes. Directories never offer Rename because
  backend rename is file-only.

## Components (`src/renderer/src/components/`)

| Component | File | Role |
|---|---|---|
| `App` | `App.tsx` | Layout: titlebar + 3-pane grid (`useDragResize`; `minmax(0,1fr)` center, panels grow to meet each other on narrow windows) + optional bottom tray; left panel resizes to its original minimum and closes with its header arrow, right panel tracks the drag all the way down and switches to a 44px model strip only when dragged to that width; the agent's drag cap is the window minus the left panel's shown width (no fixed max), so it can be dragged to meet the sidebar on any window width — full chatbot view when the sidebar is collapsed; a panel sitting at its cap is anchored, so window resizes grow or shrink it in lockstep with the opposite panel, and only dragging the divider detaches it; one layout effect resolves both panels in a single pass so a window narrower than both panels never oscillates: an anchored agent takes the window remainder and the sidebar keeps its width, and when neither panel is anchored they split the available width proportionally; reopening the agent from its tray button restores the 280px default width and reopening the collapsed sidebar from its Explorer button uses the same 280px default; both closed trays can be dragged outward from their divider to reopen the original pane; titlebar shows an agent-mode toggle (collapse sidebar + slam the agent panel to the single chat view; clicking again restores the sidebar and reduces the agent panel to its 300px minimum width, and manually leaving the layout exits the mode), a tray toggle, and busy/idle status; composer shortcuts Shift+Tab cycles the agent, Shift+P cycles favorited models, Shift+S cycles response-strength variants; word-wrap shortcuts (⌘W intercepted in main, ⌥Z via `e.code`); darwin class for the traffic-light inset |
| `Welcome` | `Welcome.tsx` | Editorial two-column launcher: the shared `ShellMark` SVG (clay scallop-shell line art with a cream prompt chevron in its opening), serif wordmark (bundled Cormorant Garamond), folder pick (`selectFolder()`), and a hairline-bordered frame with Sessions/Projects tabs populated from `sessions()` / `projects()`; both tab lists stay mounted as stacked grid panes (`visibility: hidden` when inactive) so the frame height never changes on tab switch; session rows reopen via `openSessionById` |
| `FileSidebar` | `FileSidebar.tsx` | CHANGES panel for observed workspace file changes (known baselines open as diffs; unknown baselines are labeled observed), plus the EXPLORER tree and create/rename/delete actions |
| `EditorPane` | `EditorPane.tsx` | Tab bar (dirty dot, ⇄ diff badge), Monaco `Editor`/`DiffEditor`, Edit/Diff + Wrap toolbar, ⌘S save, 4 MiB/binary guards |
| `AgentPanel` | `AgentPanel.tsx` | Hosts the OpenCode timeline and V2 prompt dock: todo checklist, exact web placeholder, attachment picker, approval toggle, agent/model/variant menus, voice input, compact send/stop button, and smart auto-scroll; the composer resolves `/` into a slash-command picker (built-ins like `/compact` first, then `command.list` + `skill.list`; skills run via `session.skill`, `/compact` via `session.compact`) that runs via `runCommand` (Enter on a leading-`/` prompt runs it too) and `@` into a file-mention picker (`file.find` search, debounced per keystroke) that inserts `@rel` tokens attached to the prompt as `PromptFile`s with mention spans; header arrow collapses it at the same time as the resize gesture reaches the model strip width; a coin-token toggle in the header opens a usage popup (session tokens/cost from `sessionUsage`, per-provider plan limits from `providerUsage`) |
| `OpenCodeTimeline` | `OpenCodeTimeline.tsx` | React port of OpenCode's web timeline/message-part presentation; walks each turn body chronologically and groups only contiguous assistant runs, preserving interleaved shell, compaction, synthetic, skill, status, and divider rows |
| `OpenCodeTodoDock` | `OpenCodeTodoDock.tsx` | OpenCode prompt-dock todo progress and checklist surface driven by `todo.updated` plus `todowrite` tool-state fallback; `todowrite` calls never appear as transcript tools |
| `AgentTray` | `AgentTray.tsx` | Shown when the agent panel is collapsed: transparent 44px strip mirroring the left activity bar, with a busy dot and model icon button that expands the panel back |
| `TerminalTray` | `TerminalTray.tsx` | xterm.js terminal fed by `node-pty`; subscribes to `terminal-data`/`terminal-exit` messages, removes naturally exited tabs and selects a neighbor, bounds startup output awaiting xterm registration, fits + resizes the PTY on layout change, and restarts on session change |

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

`main.tsx` mounts `<App/>` inside `StoreProvider`; `index.html` is the
Vite entry. `global.d.ts` types `window.openshell` from the preload API.
