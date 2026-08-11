# opencode2 Event Protocol

The main process subscribes to the opencode2 SSE stream
(`client.event.subscribe()`) and forwards **every** event to the renderer
as `{ kind: "event", type, data }` (`BackendMessage`). The renderer
dispatch lives in `src/renderer/src/store.tsx` (the `onMessage` effect).

All events carry `data.sessionID`; the store ignores events whose
`sessionID` does not match the active session.

## Events the renderer handles

| Event type | What the store does |
|---|---|
| `session.execution.started` | `busy = true`; appends a divider + "Working…" status line |
| `session.execution.succeeded` | `busy = false`; "Completed" status line |
| `session.execution.failed` | `busy = false`; "Failed" status line |
| `session.execution.interrupted` | `busy = false`; "Interrupted" status line |
| `session.idle` | `busy = false` |
| `session.text.started` | Starts a new assistant block (guarded by `lastAssistantRef` so repeated started events don't duplicate) |
| `session.text.delta` | Appends `data.delta` to the assistant text |
| `session.reasoning.started` | Starts an assistant block with reasoning |
| `session.reasoning.delta` | Appends `data.delta` to the collapsible "thinking" `<details>` |
| `session.tool.input.started` | Records `data.id → data.name` (the tool name — the `.called` event does NOT include it) and upserts a running tool card |
| `session.tool.input.delta` | Appends `data.delta` to the card's live input stream (what the model is writing as args) |
| `session.tool.called` | Upserts the card: title from the recorded name, else inferred from input shape; detail from `filePath`/`file_path`/`command`; `paths` collected from the input for clickable chips |
| `session.tool.success` | Card → `success`, sets `output`, records `duration` (startedAt from card creation) |
| `session.tool.failed` | Card → `failed`, sets `output` from error, auto-expands output in the UI |
| `session.model.selected` | `currentModel` updated from `data.model { id, providerID }` |
| `session.agent.selected` | `currentAgent` updated from `data.agent` (agent id) |
| `session.status` | Only `status.type === "error"` handled → "Session error" status line |
| `permission.asked` | Appends a permission card (`action`, `resources`, pending=true) |
| `permission.replied` | Marks the matching card resolved, recording `resolvedWith` from `data.reply` |

## Events forwarded but NOT handled

The store has no case for these; they arrive on the wire and are dropped
by the switch statement. Revisit when adding features:

- `session.created`, `session.moved`,
  `session.renamed`, `session.deleted`, `session.forked`
- `session.input.*`, `session.step.*`, `session.shell.*`
- `session.tool.input.ended`, `session.tool.progress`
- `session.text.ended`, `session.reasoning.ended`
- `session.usage.updated`, `session.compaction.*`, `session.revert.*`
- `filesystem.changed`, `reference.updated` (note: the MAIN process DOES
  handle `filesystem.changed` — see below)
- `project.*`, `plugin.*`, `command.*`, `skill.*`, `mcp.*`, `vcs.*`,
  `websearch.*`, `pty.*`, `question.*`, `form.*`, `tui.*`
- `models-dev.refreshed` (fired when the model catalog changes; the app
  only reloads models on session open)

## Main-process event handling

`handleServerEvent` in `src/main/opencode.ts` additionally intercepts
two types before forwarding:

- `session.tool.called` → `snapshotInputs(input)` snapshots every file
  path mentioned in the tool input (the baseline mechanism).
- `filesystem.changed` → `onFsChanged(file)` for the changed path (the
  fs watcher uses the same path; this catches server-side edits).

## Tool-card data flow (trace)

```
input.started {id, name}  ──► toolNamesRef[id] = name
input.delta   {id, delta} ──► toolInputsRef[id] += delta  ──► card.input
called        {id, input} ──► card.title = name ?? infer(input)
                              card.detail / card.paths (file chips)
success/failed{id, output}─► card.status / card.output / card.duration
```

`upsertTool(id, patch)` creates the card on first sight (with
`startedAt = Date.now()`) or patches it, so event order does not matter;
a patch that sets `status: "running"` is ignored once the card has
already finished.
