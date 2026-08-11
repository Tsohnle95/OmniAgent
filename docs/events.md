# opencode2 Event Protocol

The main process subscribes to the opencode2 SSE stream
(`client.event.subscribe()`) and forwards **every** event to the renderer
as `{ kind: "event", type, data }` (`BackendMessage`). The renderer
dispatch lives in `src/renderer/src/store.tsx` (the `onMessage` effect).

All events carry `data.sessionID`; the store ignores events whose
`sessionID` does not match the active session.

Incoming events use the same scheduling strategy as OpenCode: they queue for
a 16ms frame, adjacent deltas for the same part are concatenated, and adjacent
authoritative `message.part.updated` snapshots for the same part collapse to
the newest snapshot. The queue uses a timer so it still drains when the window
is backgrounded.

## Events the renderer handles

| Event type | What the store does |
|---|---|
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
| `session.reasoning.started` | Adds one ordered reasoning part; the UI opens it while active |
| `session.reasoning.delta` | Appends streamed reasoning to that part |
| `session.reasoning.ended` | Replaces the part with authoritative final reasoning, marks it complete, and lets the UI collapse it |
| `session.tool.input.started` | Adds an inline tool part with its real name and begins the argument buffer |
| `session.tool.input.delta` | Appends to the live tool argument buffer |
| `session.tool.input.ended` | Replaces the argument buffer with authoritative input text |
| `session.tool.called` | Applies parsed input, detail, clickable paths, and start time without regressing a terminal card |
| `session.tool.progress` | Displays current tool progress metadata |
| `session.tool.success` | Marks a running tool successful, reads V2 content blocks or legacy output, and records duration |
| `session.tool.failed` | Marks a running tool failed, preserves content/error output, records duration, and auto-expands the card |
| `session.retry.scheduled` | Attaches attempt, structured error, and next-attempt time to the assistant |
| `message.updated` | Creates/reconciles a legacy assistant projection and its completion/error state |
| `message.removed` | Removes the projected assistant message |
| `message.part.updated` | Authoritatively reconciles an ordered legacy text, reasoning, or tool part |
| `message.part.delta` | Appends a legacy text/reasoning field delta |
| `message.part.removed` | Removes the projected part |
| `session.model.selected` | `currentModel` updated from `data.model { id, providerID }` |
| `session.agent.selected` | `currentAgent` updated from `data.agent` (agent id) |
| `todo.updated` | Replaces the active session todo list rendered in the dock above the composer |
| `permission.asked` | Appends a permission card (`action`, `resources`, pending=true) |
| `permission.replied` | Marks `data.requestID` resolved, recording `resolvedWith` from `data.reply` |

## Events forwarded but NOT handled

The store has no case for these; they arrive on the wire and are dropped
by the switch statement. Revisit when adding features:

- `session.created`, `session.moved`,
  `session.renamed`, `session.deleted`, `session.forked`
- `session.input.*`, `session.shell.*`
- `session.usage.updated`, `session.compaction.*`, `session.revert.*`
- `filesystem.changed`, `reference.updated` (note: the MAIN process DOES
  handle `filesystem.changed` — see below)
- `project.*`, `plugin.*`, `command.*`, `skill.*`, `mcp.*`, `vcs.*`,
  `websearch.*`, `pty.*`, `question.*`, `form.*`, `tui.*`
- `models-dev.refreshed` (fired when the model catalog changes; the app
  only reloads models on session open)

The main process accepts both `type` and the legacy SSE `event` field when it
forwards an event. The renderer accepts current `data` and legacy `properties`
envelopes, plus `id` and `callID` tool identifiers. `permission.v2.*` names are
adapted to `permission.*`. This lets the same reducer work with the installed
OpenCode client, the latest upstream protocol, and older opencode2 services.

## Main-process event handling

`handleServerEvent` in `src/main/opencode.ts` additionally intercepts
two types before forwarding:

- `session.tool.called` → `snapshotInputs(input)` snapshots every file
  path mentioned in the tool input (the baseline mechanism).
- `filesystem.changed` → `onFsChanged(file)` for the changed path (the
  fs watcher uses the same path; this catches server-side edits).

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
