# Module: shared types

`src/shared/types.ts` — the contract between main, preload, and renderer.
Imported everywhere as `@shared/types` (alias in both tsconfigs and
`electron.vite.config.ts`).

## Domain types

| Type | Shape | Used for |
|---|---|---|
| `SessionInfo` | `{ id, directory }` | The active opencode2 session |
| `TreeEntry` | `{ path, type: "file" \| "directory" }` | Explorer tree nodes; `path` is `/`-relative, no trailing slash |
| `FileUpdate` | `{ path, baseline: string \| null, content: string \| null, deleted }` | Watcher payload; `baseline` is what the agent started from |
| `ProjectInfo` | `{ directory, name }` | Recent-projects list on Welcome |
| `ModelOption` | `{ id, providerID, name }` | Model picker options + current selection |
| `AgentOption` | `{ id, name }` | Agent picker options + current selection |
| `TerminalStartResult` | `{ id }` | PTY id returned by `terminalStart` |
| `TerminalData` | `{ id, data }` | PTY output chunk (`terminal-data` message) |
| `TerminalExit` | `{ id, exitCode }` | PTY exit (`terminal-exit` message) |
| `PermissionReply` | `"once" \| "always" \| "reject"` | Permission card buttons |

## TranscriptItem (agent panel feed)

Union discriminated on `kind`:

- `user` — `{ id, text }` prompt bubble
- `assistant` — `{ id, messageID, text, reasoning, reasoningOpen }`
  streamed text + collapsible thinking; `messageID` de-dupes starts
- `tool` — `{ tool: ToolCallView }` (below)
- `permission` — `{ id, requestID, action, resources, pending }`
- `status` — `{ id, text, tone: "info" \| "success" \| "error" }`
- `divider` — `{ id }` visual separator per execution

`ToolCallView`: `{ id, title, detail, status: "running" \| "success" \|
"failed", input?, output?, startedAt?, duration? }` — `input` is the
live-streamed arguments, `startedAt`/`duration` feed the elapsed timer.

## UI state

- `Tab` — `{ path, name, content, saved, baseline, deleted, dirty, stale,
  mode: "edit" \| "diff", binary }`; `saved` = last persisted content,
  `baseline` = session start (diff original), `dirty` = unsaved edits,
  `stale` = changed on disk under the editor.
- `AgentFileState` — `{ baseline, content, deleted }`, per agent-touched
  file.

## IPC envelope

`BackendMessage` is a discriminated union on `kind`:

- `"event"` / `"file-update"` / `"session"` — shared base
  (`BackendMessageBase`): `{ kind, type?, data?, file?, session? }` plus
  `{ kind: "ui-command", command }` (main→renderer requests, e.g.
  `toggle-word-wrap` when ⌘W is pressed).
- `{ kind: "terminal-data", terminal: TerminalData }`
- `{ kind: "terminal-exit", terminal: TerminalExit }`

This is the wire format for `shell:message` from main → renderer.

## Rules

- Keep IPC-shaped types here so main and renderer compile against one
  contract. Change a type here and both sides of the bridge update.
- Never import renderer or main code from this file — it must stay
  dependency-free (types only).
