# Module: shared types

`src/shared/types.ts` — the contract between main, preload, and renderer.
Imported everywhere as `@shared/types` (alias in both tsconfigs and
`electron.vite.config.ts`).

## Domain types

| Type | Shape | Used for |
|---|---|---|
| `WorkspaceIdentity` | `{ id }` | Opaque immutable UUID assigned to one workspace activation; capability calls must echo it |
| `SessionInfo` | `{ id, directory, workspace, parentID?, title?, agent? }` | The active opencode2 session, immutable workspace identity, and parent/child navigation metadata |
| `SessionSummary` | `{ id, title, directory, updatedAt, parentID?, agent? }` | Recent-session graph used by Welcome and task/subagent links |
| `TreeEntry` | `{ path, type: "file" \| "directory" }` | Explorer tree nodes; `path` is `/`-relative, no trailing slash |
| `FileUpdate` | `{ path, baseline: string \| null, content: string \| null, deleted }` | Watcher payload; `baseline` is what the agent started from |
| `ProjectInfo` | `{ directory, name }` | Recent-projects list on Welcome |
| `ModelOption` | `{ id, providerID, name, variants?, variant? }` | Model picker options + current model/strength selection |
| `AgentOption` | `{ id, name }` | Agent picker options + current selection |
| `CommandOption` | `{ name, description?, kind? }` | Slash commands and skills offered by `/` completion and run via `runCommand` (`kind: "command" \| "skill"`) |
| `ReferenceOption` | `{ name, path, rel, description? }` | `file.find` search results for `@` mentions; `path` is absolute, `rel` is relative to the session directory |
| `PromptFile` | `{ path, mention?: { start, end, text } }` | Files attached to a prompt; `mention` marks the `@rel` token span in the prompt text |
| `SessionSelection` | `{ model?: ModelOption, agent?: AgentOption }` | Restores the active session's model/agent picks after a renderer reload |
| `ApprovalMode` | `"ask" \| "approve"` | Composer permission behavior; approve mode replies `once` automatically |
| `UserAttachment` | `{ name }` | Attachment chip rendered on a submitted user prompt |
| `TerminalStartResult` | `{ id }` | PTY id returned by `terminalStart` |
| `TerminalData` | `{ id, data }` | PTY output chunk (`terminal-data` message) |
| `TerminalExit` | `{ id, exitCode }` | PTY exit (`terminal-exit` message) |
| `PermissionReply` | `"once" \| "always" \| "reject"` | Permission card buttons |
| `ProviderUsageResult` | `{ provider, displayName, status, snapshot, error? }` | Per-provider usage snapshot for the composer usage indicator (`fetchProviderUsage` in `src/main/provider-usage.ts`); `status` is `"ok" \| "stale" \| "unavailable" \| "unauthenticated" \| "unsupported"` |
| `ReopenedSession` | `{ session, transcript, todos, usage: SessionUsage \| null }` | `openSessionById` result; `usage` is the cumulative `{ cost, tokens }` from `session.get`, also streamed live via `session.usage.updated` |
| `SessionUsage` | `{ cost, tokens: { input, output, reasoning, cache: { read, write } } }` | Cumulative session token usage/cost shown in the agent header usage popup |
| `ProviderUsageSnapshot` | `{ windows: UsageWindow[], credits, planType, updatedAt }` | Usage windows (`{ id, label, usedPercent, windowMinutes, resetsAt }`) plus credits (`{ hasCredits, unlimited, balance, ... }`) or an `error: { code, message, retryable }` |

## TranscriptItem (agent panel feed)

Union discriminated on `kind`:

- `user` — `{ id, text }` prompt bubble
- `pending-input` — internal admitted user/synthetic input retained until
  promotion or cancellation; never rendered as a chat row
- `assistant` — `{ id, messageID, parts, completed, retry?, error? }`;
  `parts` is the ordered OpenCode content stream (`AssistantPartView[]`)
- `permission` — `{ id, requestID, action, resources, pending }`
- `selection` — retained agent/model switch metadata, filtered from the chat
  timeline
- `synthetic` / `system` / `skill` — non-assistant protocol messages with their supplied text;
  system prompt and `<system-reminder>` entries are retained but filtered from
  the visible timeline
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
  revision, conflict, mode: "edit" \| "diff", binary }`; `saved` is the last
  persisted content, `revision` increases on every edit, and `conflict`
  retains external content while normal saving is blocked.
- `FileWriteIdentity` — `{ id, workspaceID, revision, expectedContent,
  overwrite }`; binds a write and its `file-update` echo to the exact revision
  and provides the normal-save disk precondition.
- `AgentFileState` — `{ baseline, content, deleted }`, per agent-touched
  file.

## IPC envelope

`BackendMessage` is a discriminated union on `kind`:

- `"event"` / `"file-update"` / `"session"` — shared base
  (`BackendMessageBase`): `{ kind, type?, data?, file?, session? }` plus
  `{ kind: "ui-command", command }` (main→renderer requests, e.g.
  `toggle-word-wrap` when ⌘W is pressed, or `open-source` with
  `{ path, line }` when a DevTools CSS source link is clicked).
- `{ kind: "terminal-data", terminal: TerminalData }`
- `{ kind: "terminal-exit", terminal: TerminalExit }`

This is the wire format for `shell:message` from main → renderer.

## Rules

- Keep IPC-shaped types here so main and renderer compile against one
  contract. Change a type here and both sides of the bridge update.
- Treat `WorkspaceIdentity` as an opaque activation capability. It changes on
  every new/reopened activation, even when the directory and session id match.
- Never import renderer or main code from this file — it must stay
  dependency-free (types only).
