# Batch 2026-09-09 — session UX + event isolation + usage filtering

Status: COMPLETE

## Goal

Fix 5 reported session/usage issues with minimal isolated changes and verified checkpoints.

## Acceptance criteria

- [x] External opencode2 terminal questions no longer appear in unrelated Orbit workspace; Orbit-owned forms/permissions still work
- [x] Open now section auto-opens when there are active items
- [x] No "Reopened session in ..." toast on open/swap
- [x] Sessions can be deleted from saved-workspace dropdown (backend destroy + UI + reload)
- [x] Provider usage panel hides inactive/unauthenticated providers without snapshot (no stale "could not be verified" for non-subs)

## Relevant context

Canonical docs:
- `docs/architecture.md` (runtime section, global SSE)
- `docs/main.md` (IPC inventory, providerUsage)
- `docs/events.md` (forwarded/handled, form.created)
- `docs/renderer.md` (Open now, sessions)
- `docs/preload.md`, `docs/shared.md`

Implementation / tests:
- `src/main/opencode.ts` (connect, deliverEvents, eventSessionID, listSessions, openSessionById, contextBySessionID)
- `src/main/stream-pipeline.ts`
- `src/renderer/src/store.tsx` (normalizeStreamEvent, form.created, reopenSession toast, loadSessions)
- `src/renderer/src/components/SessionsPane.tsx`
- `src/main/provider-usage.ts`, `src/main/provider-usage.test.ts`
- `src/renderer/src/components/AgentPanel.tsx` (ProviderUsageCard)
- `src/main/index.ts`, `src/preload/index.ts`, `src/shared/types.ts`

## Invariants / constraints

- Main remains only process talking to OpenCode/DeepSeek; renderer keeps authoritative chat projection.
- Global SSE stays; filtering only drops foreign session-scoped UI (forms/permissions/transcript), keeps global/server/session list events.
- IPC channels stay `shell:*`; shared types in `@shared/types`.
- No unrelated refactors; preserve existing session list filtering (expired, hasConversation).

## Affected surfaces

- Main event forwarding + session delete IPC + provider usage fetch
- Preload bridge + shared types
- Renderer store event routing + sessions pane + usage card
- Docs events/main/preload/shared inventories if contracts change

## Phases

| Phase | Scope | Mode | Status | Validation | Commit |
|---|---|---|---|---|---|
| 1 | Event isolation (form.created + foreign session filter) | PROJECT slice | complete | typecheck + provider/multi-context/renderer suites | — |
| 2 | Open now auto-open | PATCH | complete | App.layout (45) + FileSidebar.tabs pass | — |
| 3 | Remove reopened toast | PATCH | complete | grep + typecheck | — |
| 4 | Delete session from workspace dropdown | FEATURE | complete | multi-context delete tests + typecheck | — |
| 5 | Usage panel hide inactive subs | PATCH | complete | provider-usage tests + typecheck | — |
| 6 | Final gate + docs sync | — | complete | `npm run check` green (92 files, 693 tests) under Node 22.23.2 | — |

## Validation plan

- Targeted checks: `npm run typecheck`, relevant `vitest` files, `npm run docs:check`
- Integration: manual smoke where UI appearance required (state gap explicitly if unverified)
- Final gate: `npm run check` under Node 22.23.2 (current shell is v26.7.0 — must rerun via supported toolchain)

## Decisions

- 2026-09-09 — BATCH with per-item commits; item 1 treated as PROJECT slice (trust boundary) but implemented minimally via owned-session gating, not daemon per-workspace split. Reason: per-workspace daemon would be larger architectural change; filtering fixes leak with low blast radius.
- 2026-09-09 — Delete means `client.session.remove` + close panel + reload sessions. Reason: matches existing prune path; leaves fs untouched.
- 2026-09-09 — Event filter narrowed to prompts/inbox only (form/permission/inbox), not all transcript deltas. Reason: broad filter would break live child/subagent streams, which the renderer intentionally stores separately per docs/events.md parent/child section.
- 2026-09-09 — Usage filter keeps retryable network failures visible. Reason: transient outage must not silently hide an active sub; only auth failures without snapshot are omitted.
- 2026-09-09 — Delete UI is right-click context menu on session rows (Open now / Workspaces / History) with confirm. Reason: matches existing workspace remove-menu pattern; no new buttons cluttering rows.

## Open risks / blockers

- RawStreamEvent shape for form.created verified by code (nested form.sessionID) but live cross-process smoke not run — external terminal leak fix is unit/type/docs verified only.
- Delete for DeepSeek sessions rejected with explicit error (no delete RPC).
- Flaky isolated failure in FileSidebar.tabs pin test during one full run; green on rerun + final gate.

## Completion

- [x] All acceptance criteria satisfied
- [x] Final integration validation passed (`npm run check` green under Node 22.23.2)
- [x] Durable truths updated in canonical docs (events/main/preload)
- [x] Follow-up work moved to issues/backlog (none — all 5 items complete)
- [x] Final Git state reviewed
