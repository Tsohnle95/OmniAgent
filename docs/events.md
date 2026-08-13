# opencode2 Event Protocol

The main process subscribes to the opencode2 SSE stream
(`client.event.subscribe()`) and forwards **every** event to the renderer
as `{ kind: "event", type, data }` (`BackendMessage`). The renderer
dispatch lives in `src/renderer/src/store.tsx` (the `onMessage` effect).

Session events are routed by `data.sessionID` into a per-session transcript
and busy-state store, so every open panel streams independently: child and
subagent streams keep flowing while the user works in another panel, and
model/agent selections land on the panel that owns the session.

Incoming events use the same scheduling strategy as OpenCode: they queue for
a 16ms frame, adjacent deltas for the same part are concatenated, and adjacent
authoritative `message.part.updated` snapshots for the same part collapse to
the newest snapshot. The queue uses a timer so it still drains when the window
is backgrounded.

## Events the renderer handles

| Event type | What the store does |
|---|---|
| `session.created` | Adds or reconciles the session graph entry, including `parentID`, agent, title, and directory so task calls can resolve child sessions |
| `session.renamed` | Updates the matching session title and timestamp |
| `session.deleted` | Removes the session from the graph |
| `session.input.admitted` | Buffers user/synthetic input as an internal `pending-input`; it does not create a visible chat row |
| `session.input.promoted` | Materializes the buffered input as the canonical user/synthetic timeline entry and reconciles an optimistic local user message by text |
| `session.input.cancelled` | Discards the buffered input by `inputID` without removing a promoted chat message |
| `session.execution.started` | Sets `busy = true`; activity is shown by the agent header rather than a transcript status bubble |
| `session.execution.succeeded` | Sets `busy = false`, completes the active assistant, and clears retry state without adding transcript noise |
| `session.execution.failed` | Sets `busy = false`, completes the active assistant, clears retry state, and adds an error status line |
| `session.execution.interrupted` | Sets `busy = false`, completes the active assistant, clears retry state, and adds an error status line |
| `session.idle` | Sets `busy = false` and completes the active assistant |
| `session.status` | Mirrors OpenCode `busy` / `idle` / `retry`; retry details attach to the latest assistant |
| `session.step.started` | Creates or reopens the addressed assistant message, clears its retry/error state, and completes a different unfinished assistant |
| `session.step.ended` | Completes the addressed assistant message |
| `session.step.failed` | Completes the assistant and records the structured failure |
| `session.text.started` | Adds one ordered text part for the message/ordinal |
| `session.text.delta` | Appends streamed text to that part |
| `session.text.ended` | Replaces the part with the authoritative final text and marks it complete |
| `session.reasoning.started` | Adds one ordered reasoning part behind a collapsed Thinking disclosure in event order |
| `session.reasoning.delta` | Appends streamed reasoning to that part |
| `session.reasoning.ended` | Replaces the part with authoritative final reasoning and keeps it available through the disclosure after completion |
| `session.tool.input.started` | Adds an inline tool part with its real name and begins the argument buffer |
| `session.tool.input.delta` | Appends to the live tool argument buffer |
| `session.tool.input.ended` | Replaces the argument buffer with authoritative input text |
| `session.tool.called` | Applies parsed input, detail, clickable paths, and start time without regressing a terminal card |
| `session.tool.progress` | Displays current tool progress metadata |
| `session.tool.success` | Marks a running tool successful, reads V2 content blocks or legacy output, and records duration |
| `session.tool.failed` | Marks a running tool failed, preserves content/error output, records duration, and auto-expands the card |
| `session.retry.scheduled` | Attaches attempt, structured error, and next-attempt time to the assistant |
| `session.synthetic` | Retains the synthetic/system message; internal `<system-reminder>` content is filtered from the visible timeline |
| `session.skill.activated` | Adds the activated skill name, id, and supplied text to the timeline |
| `session.shell.started` | Adds a running shell message with its command |
| `session.shell.ended` | Reconciles the shell by id with status, exit code, and captured output |
| `session.compaction.started` | Adds a live compaction entry and its reason/recent context |
| `session.compaction.delta` | Streams the compaction summary into the active compaction entry |
| `session.compaction.ended` | Finalizes the authoritative compaction summary |
| `session.compaction.failed` | Finalizes compaction with its structured error |
| `message.updated` | Creates/reconciles a legacy assistant projection and its completion/error state |
| `message.removed` | Removes the projected assistant message |
| `message.part.updated` | Authoritatively reconciles an ordered legacy text, reasoning, or tool part |
| `message.part.delta` | Appends a legacy text/reasoning field delta |
| `message.part.removed` | Removes the projected part |
| `session.model.selected` | Retains internal model-switch metadata and updates `currentModel` for the addressed session's panel; it does not create a chat row |
| `session.agent.selected` | Retains internal agent-switch metadata and updates `currentAgent` for the addressed session's panel; it does not create a chat row |
| `agent.updated` | Refetches the agent catalog for the addressed session so the composer agent picker recovers from a lazy or empty first load |
| `catalog.updated` | Refetches the model catalog for the addressed session so the composer model picker stays current |
| `models-dev.refreshed` | Legacy model-catalog change event; handled identically to `catalog.updated` |
| `session.usage.updated` | Records cumulative session token usage (`tokens`) and cost (`cost`) for the addressed session; drives the token-usage popup in the agent header (context-window utilization is computed renderer-side from `tokens.input` vs the active model's `limit.context` delivered by `shell:models`) |
| `session.usage.recorded` | Same usage snapshot as `session.usage.updated` on the durable legacy stream; handled identically |
| `todo.updated` | Replaces the addressed session's todo list rendered in the dock above its composer; `todowrite` tool-part input/metadata is also consumed as a beta-protocol fallback |
| `permission.asked` | Appends a permission card (`action`, `resources`, pending=true) |
| `permission.replied` | Marks `data.requestID` resolved, recording `resolvedWith` from `data.reply` |

## Events forwarded but NOT handled

The store has no case for these; they arrive on the wire and are dropped
by the switch statement. Revisit when adding features:

- `session.moved`, `session.forked`
- `session.input.steered`, `session.input.queued`
- `session.compaction.admitted`, `session.revert.*`
- `filesystem.changed`, `reference.updated` (the main process handles the
  filesystem event separately; see below)
- `project.*`, `plugin.*`, `command.*`, `skill.*`, `mcp.*`, `vcs.*`,
  `websearch.*`, `pty.*`, `question.*`, `form.*`, `tui.*`, `config.*`

The main process accepts both `type` and the legacy SSE `event` field when it
forwards an event. The renderer accepts current `data` and legacy `properties`
envelopes, plus `id` and `callID` tool identifiers. `permission.v2.*` names are
adapted to `permission.*`. This lets the same reducer work with the installed
OpenCode client, the latest upstream protocol, and older opencode2 services.

## Main-process event handling

`handleServerEvent` in `src/main/opencode.ts` additionally intercepts
two types after forwarding:

- `session.tool.called` → `snapshotInputs(context, input)` snapshots structured
  file paths for the session context addressed by the event's `sessionID`
  before execution when possible. Shell command strings are not parsed
  as paths.
- `filesystem.changed` → `onFsChanged(file)` for every open session context
  whose directory matches the event's top-level `location.directory`; a shared
  directory fans the event out to each of its contexts. Global events from
  directories without an open session are ignored.

## Tool-card data flow (trace)

```
input.started {id/callID, name} ─► ordered tool part + empty input
input.delta   {id/callID, delta}─► tool.input += delta
input.ended   {id/callID, text} ─► authoritative tool.input
called        {id/callID, input}─► detail + paths + parsed input
progress      {id/callID, data} ─► live progress metadata
success/failed{id/callID, ...}  ─► terminal status + output + duration
```

Every update addresses the assistant message plus the tool call. A missing
part is created so a late subscription can recover, while a success/failed
part is terminal and cannot regress when an older running event arrives.

Tool parts retain the protocol's parsed input, content blocks, metadata,
`executed` flag, provider state, and provider-result state. Text content drives
the expandable output and file content becomes an attachment link.

## Parent and child sessions

The global SSE subscription includes every child session. The renderer stores
those streams separately rather than mixing them into the parent transcript.
Task cards resolve a child from `metadata.sessionId`/`sessionID`, then fall back
to the newest session whose `parentID`, title/description, and agent match the
task input. Opening the card replays and activates that child; its header links
back to the parent. Permission replies carry the owning session id so a child
request is never sent to the parent session.
