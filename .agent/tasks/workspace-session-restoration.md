# Durable workspace session restoration

Status: COMPLETE

## Goal

Restore the renderer's previously open session panels and active panel after a
full Orbit process restart, while treating persisted data and every individual
session restore as untrusted and best-effort.

## Acceptance criteria

- [x] Panel order and the active session are restored across a renderer/process restart when sessions and runtimes remain valid.
- [x] Persisted state contains only session identity, optional runtime identity, order, and active-session identity; transient or privileged state is not recreated.
- [x] Corrupt, partially valid, legacy, stale, moved, or runtime-unavailable entries are skipped without preventing normal launch or valid entries from restoring.
- [x] Existing live-backend reload recovery, runtime identity routing, workspace identity boundaries, and explicit user actions remain intact.
- [x] Automated coverage exercises normal restoration and important corruption/stale/unavailable/legacy paths.
- [x] Canonical durable documentation and the evaluation record describe the implemented behavior.

## Relevant context

Canonical docs:
- `docs/agent-execution.md`
- `docs/architecture.md`
- `docs/main.md`
- `docs/preload.md`
- `docs/renderer.md`
- `docs/shared.md`

Implementation / tests:
- `src/renderer/src/store.tsx`
- `src/renderer/src/store.workspace.test.tsx`
- `src/main/opencode.ts` (existing session/runtime reopen boundary)

## Invariants / constraints

- Main remains the only owner of runtime traffic, session lookup, canonical workspace paths, and new `WorkspaceIdentity` capabilities.
- Renderer layout persistence must not duplicate the main runtime session index or the existing live `activeSessions()` recovery path.
- Persisted IDs/runtime IDs are hints only; no persisted workspace capability, path mutation, terminal, permission, queue, prompt, or in-flight operation may be recreated.
- Restoration must be additive and silent, must not steal focus after user activation, and must not fail the StoreProvider mount when one item fails.
- Future/invalid persisted formats must be ignored or partially migrated safely; successful restoration must compact the saved layout to valid panels.

## Affected surfaces

- `src/renderer/src/store.tsx` — versioned layout serialization, startup reconciliation, runtime-aware silent reopen, and persistence readiness gate.
- `src/renderer/src/store.workspace.test.tsx` — restart, ordering/focus, migration, corruption, and per-entry failure coverage.
- `docs/renderer.md` — renderer ownership and startup restoration truth.
- `docs/architecture.md` — cross-process durable restoration invariant.
- `.agent/evals/project-run-01.md` — factual execution record required by the task.

## Phases

| Phase | Scope | Status | Validation | Commit |
|---|---|---|---|---|
| 1 | Plan review and renderer-owned persistence/restore implementation with focused tests | complete | targeted Vitest tests; `npm run check` under Node 22.23.2 | `a4e0ec8`, `4d8a6f4` |
| 2 | Cumulative review, evaluation record, cleanup | complete | final `npm run check` under Node 22.23.2: 92 files / 683 tests, docs check, compile | pending completion commit |

## Validation plan

- Targeted checks: `npx vitest run src/renderer/src/store.workspace.test.tsx`; targeted typecheck if available.
- Integration/platform/manual checks: inspect persisted record shape and test full provider remount with localStorage; no destructive or privileged startup action is expected.
- Final gate: `npm run check` under Node 22.23.2, plus Git/CI status review.

## Decisions

- 2026-09-05 — Keep durable panel layout in renderer `localStorage`, because panel order/focus are renderer-owned and the existing main `activeSessions()` recovery is process-lifetime only. Reason: a new IPC/main store would duplicate ownership without adding restoration authority.
- 2026-09-05 — Persist session IDs plus optional runtime IDs, not directories or workspace identities. Reason: main's existing session reopen path owns canonicalization/relocation and mints fresh capabilities; directories are redundant and identities are transient.
- 2026-09-05 — Restore entries sequentially in persisted order, using the stored runtime only as an explicit routing hint and omitting it when absent. Reason: preserves panel order and avoids silently remapping a session to the globally selected runtime.
- 2026-09-05 — Treat malformed/future records and individual reopen failures as non-fatal, and compact only after startup reconciliation completes. Reason: launch availability and valid-panel recovery take precedence over preserving unusable hints.
- 2026-09-05 — Await the existing health/connect attempt before reading live sessions or reopening cold IDs, but continue when health fails. Reason: main creates the renderer before its backend connection and unavailable runtimes must remain non-fatal.

## Plan review

- 2026-09-05 — Reviewed the plan against the live startup effect, `reopenSession` routing, and existing workspace tests before coding. Revised the implementation to merge persisted hints with `activeSessions()` results, deduplicate by session ID, restore sequentially in saved order, omit absent runtime hints, and gate writes until reconciliation completes. These changes address renderer reloads, old layouts, runtime-selection drift, and initial-state overwrite risk without changing main ownership.

## Open risks / blockers

- None yet.

## Completion

Before deleting this task file:

- [x] All acceptance criteria satisfied
- [x] Final integration validation passed
- [x] Durable truths updated in canonical docs
- [x] Follow-up work moved to issues/backlog
- [x] Final Git state reviewed
