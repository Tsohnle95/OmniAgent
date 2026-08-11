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
| `models` | `ModelOption[]` | for the agent-header picker |
| `currentModel` | `ModelOption \| null` | seeded from `modelDefault()`, live-updated by `session.model.selected` |

Actions: `openSession`, `selectFolder`, `sendPrompt`, `stop`, `loadModels`,
`switchModel`, `openFile(path, {mode})`, `closeTab`, `setActive`,
`setTabMode`, `editContent`, `saveTab`, `toggleDir`, `replyPermission`.

Key mechanisms:

- **Event dispatch** — the `onMessage` effect handles `session` /
  `file-update` / `event` messages. The event switch is documented in
  `docs/events.md`. Events are filtered by `data.sessionID`.
- **Tool tracking refs** — `toolNamesRef`, `toolInputsRef`, `toolStartRef`
  back the upsert-based tool cards (order-independent; see events doc).
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
| `App` | `App.tsx` | Grid layout, `useDragResize` (flip=true for the right panel), titlebar with busy/idle status, toasts |
| `Welcome` | `Welcome.tsx` | Folder pick + recent projects (`projects()`) |
| `FileSidebar` | `FileSidebar.tsx` | CHANGES list (agent-touched files, click → diff) + EXPLORER tree; dirs auto-expand root on session open |
| `EditorPane` | `EditorPane.tsx` | Tab bar (dirty dot, ⇄ diff badge), Monaco `Editor`/`DiffEditor`, Edit/Diff toolbar, ⌘S save, 4 MiB/binary guards |
| `AgentPanel` | `AgentPanel.tsx` | Transcript (user bubbles, assistant markdown + collapsible thinking, tool cards with live input/elapsed time, permission cards, status lines), model picker, stop button, input box, "working… Ns" line |

Tool cards (`ToolCard`): show status spinner/check/cross, real tool name
(from `session.tool.input.started`), `detail` (file path or `$ command`),
live streamed args, elapsed/duration timer, collapsible output (up to
6000 chars) — failed tools auto-expand.

## Monaco (`monaco.ts`)

- Workers wired for editor/json/css/html/ts (`?worker` imports).
- `openshell-dark` theme (diff insert/remove colors included).
- `languageForPath()` — extension → Monaco language map (fallback
  `plaintext`).

## Entry

`main.tsx` mounts `<App/>` inside `StoreProvider`; `index.html` is the
Vite entry. `global.d.ts` types `window.openshell` from the preload API.
