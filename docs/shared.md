# Module: shared types

`src/shared/types.ts` — the contract between main, preload, and renderer.
Imported everywhere as `@shared/types` (alias in both tsconfigs and
`electron.vite.config.ts`).

## Domain types

| Type | Shape | Used for |
|---|---|---|
| `SessionInfo` | `{ id, directory, parentID?, title?, agent? }` | The active opencode2 session and its parent/child navigation metadata |
| `SessionSummary` | `{ id, title, directory, updatedAt, parentID?, agent? }` | Recent-session graph used by Welcome and task/subagent links |
| `TreeEntry` | `{ path, type: "file" \| "directory" }` | Explorer tree nodes; `path` is `/`-relative, no trailing slash |
| `FileUpdate` | `{ path, baseline: string \| null, content: string \| null, deleted }` | Watcher payload; `baseline` is what the agent started from |
| `ProjectInfo` | `{ directory, name }` | Recent-projects list on Welcome |
| `ModelOption` | `{ id, providerID, name, variants?, variant? }` | Model picker options + current model/strength selection |
| `AgentOption` | `{ id, name }` | Agent picker options + current selection |
| `SessionSelection` | `{ model?: ModelOption, agent?: AgentOption }` | Restores the active session's model/agent picks after a renderer reload |
| `ApprovalMode` | `"ask" \| "approve"` | Composer permission behavior; approve mode replies `once` automatically |
| `UserAttachment` | `{ name }` | Attachment chip rendered on a submitted user prompt |
| `TerminalStartResult` | `{ id }` | PTY id returned by `terminalStart` |
| `TerminalData` | `{ id, data }` | PTY output chunk (`terminal-data` message) |
| `TerminalExit` | `{ id, exitCode }` | PTY exit (`terminal-exit` message) |
| `PermissionReply` | `"once" \| "always" \| "reject"` | Permission card buttons |

## TranscriptItem (agent panel feed)

Union discriminated on `kind`:

- `user` — `{ id, text }` prompt bubble
- `assistant` — `{ id, messageID, parts, completed, retry?, error? }`;
  `parts` is the ordered OpenCode content stream (`AssistantPartView[]`)
- `permission` — `{ id, requestID, action, resources, pending }`
- `selection` — a visible agent/model switch
- `synthetic` / `system` / `skill` — non-assistant protocol messages with their supplied text
- `shell` — a session shell command plus running/terminal state, output, and exit code
- `compaction` — running/completed/failed compaction with its streamed summary
- `status` — `{ id, text, tone: "info" \| "success" \| "error" }`
- `divider` — `{ id }` visual separator per execution

`AssistantPartView` is discriminated on `kind`: `text` and `reasoning`
parts carry `{ id, text, complete }`; `tool` parts carry
`{ id, tool: ToolCallView }`. Keeping these parts in event order lets the
panel render reasoning, tools, and responses exactly where OpenCode emitted
them instead of flattening each category into a separate block.

`ToolCallView`: `{ id, title, detail, status, input?, inputValue?, output?,
content?, progress?, startedAt?, duration?, paths?, metadata?, executed?,
providerState?, providerResultState? }` — `input` is the live argument buffer,
`inputValue` preserves parsed protocol input, `content` preserves text/file
blocks, and provider metadata is retained instead of flattened away.

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
