# Fix session UX batch (window, busy, usage, scroll)

Status: ACTIVE

## Goal

Fix four reported session-UX regressions without closing the user's running app: window placement, working indicator, context usage, agent scroll restore.

## Acceptance criteria

- [ ] Landing → session open resizes to saved session size centered on screen (no bottom-right teleport/grow)
- [ ] Composer stop/send button reliably reflects working state for slow/local models (no premature send flip mid-turn)
- [ ] Context-window display reflects live usage and compaction (not stuck at 100%)
- [ ] Agent-panel scroll position survives settings open/close (+ theme change), no jump to bottom
- [ ] `npm run check` passes; no running user app disturbed (no launch/kill during validation)

## Relevant context

Canonical docs:
- `docs/main.md` (window sizing, IPC `shell:window-view`)
- `docs/renderer.md` (streaming lifecycle, session-activity, usage, components)
- `docs/events.md` (event protocol, usage/compaction/busy events)
- `docs/agent-execution.md` (BATCH orchestration)

Implementation / tests:
- Window: `src/main/index.ts` (`createWindow`, `applyWindowView`), `src/main/window-sizing.ts`, `src/main/window-sizing.test.ts`
- Busy: `src/renderer/src/store.tsx` (watchdog `STREAM_SETTLE_*`, `lastStreamActivityRef`, `setSessionBusy`), `src/renderer/src/session-activity.ts`, `src/renderer/src/streaming.ts`, `src/renderer/src/components/AgentPanel.tsx` (composer button), `src/renderer/src/store.stream-settle.test.tsx`
- Usage: `src/renderer/src/components/AgentPanel.tsx` (contextPercent), `src/renderer/src/store.tsx` (`refreshSessionUsage`, `session.usage.*`, `session.compaction.ended`, `compactionBaseline`), `src/main/opencode.ts` (`sessionUsage`), `src/renderer/src/components/AgentPanel.usage.test.tsx`
- Scroll: `src/renderer/src/App.tsx` (settingsOpen unmounts workspace-area), `src/renderer/src/components/AgentPanel.tsx` (scroll refs, followSignature), `src/renderer/src/components/AgentPanel.workspace.test.tsx`

## Invariants / constraints

- Main remains the only OpenCode/DeepSeek traffic owner; renderer changes stay in projection/store.
- Do not close/restart the user's running Orbit app; validate via typecheck/unit/build, not `npm start`.
- Preserve `shell:window-view` contract (landing fixed size, session persisted size).
- Busy indicator must not latch stuck-busy nor mask permission-waiting idle.
- Usage must handle missing `limit.context` (hide/0%, never fake 100%) and DeepSeek/null usage (retain stale safely).
- Scroll fix must not break streaming follow-to-bottom while at floor.

## Affected surfaces

- `src/main/index.ts` window placement; `docs/main.md` sizing note
- Renderer streaming/busy reconciliation + tests
- Renderer usage projection/refresh + tests
- Renderer layout/scroll persistence + tests

## Phases

| Phase | Scope | Mode | Status | Validation | Commit |
|---|---|---|---|---|---|
| 1 | Window centered on view change | PATCH | complete | window-sizing test + typecheck pass (node 22.23.2) | — |
| 2 | Agent scroll survives settings | PATCH | complete | AgentPanel.workspace.test (11 pass) + typecheck (node 22.23.2) | — |
| 3 | Busy indicator reliability (local/slow models) | FEATURE | pending | stream-settle tests + typecheck | — |
| 4 | Context usage accuracy + compaction refresh | FEATURE | pending | usage tests + typecheck | — |
| 5 | Final gate + docs sync | — | pending | `npm run check` | — |

## Validation plan

- Targeted checks: `npx vitest run <file>`, `npm run typecheck`, `npm run build:compile` (never `npm start` per user constraint).
- Integration/platform/manual checks: none automated for window centering/scroll in headless env; state gap explicitly if unverifiable live.
- Final gate: `npm run check` (requires matching `.node-version` engines).

## Decisions

- 2026-09-08 — BATCH with per-item commits; window+scroll as PATCH, busy+usage as FEATURE slices. Reason: isolates blast radius, keeps recovery checkpoints.
- 2026-09-08 — Tandem discovery via subagents for busy/usage/scroll evidence before editing. Reason: shared renderer subsystem coupling.

## Open risks / blockers

- Window centering unverifiable headless (no display/Electron launch allowed while user works in app).
- Local-model event cadence unknown; busy fix must rely on existing tests + code reasoning, not live repro.
- True post-compaction `session.get` semantics (cumulative vs reset) inferred from code, not live server.

## Completion

Before deleting this task file:

- [ ] All acceptance criteria satisfied
- [ ] Final integration validation passed
- [ ] Durable truths updated in canonical docs
- [ ] Follow-up work moved to issues/backlog
- [ ] Final Git state reviewed
