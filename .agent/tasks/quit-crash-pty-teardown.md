# Quit crash — node-pty teardown race (SIGABRT on quit)

Status: COMPLETE

## Goal

Quitting Orbit never shows "Orbit quit unexpectedly" (SIGABRT during Node teardown).

## Acceptance criteria

- [ ] `before-quit` teardown drains all pty exits before `app.quit()` proceeds
- [ ] Shutdown cannot hang forever (bounded wait, forced quit fallback)
- [ ] `npm run check` green under Node 22.23.2; terminal unit tests cover drain + timeout
- [ ] Packaged quit-crash verification noted as manual (cannot exercise in this env)

## Relevant context

Canonical docs:
- `docs/main.md` (PTY paragraph ~368, startup/shutdown ~443)
- `docs/operations.md` (node-pty platform section)

Implementation / tests:
- `src/main/terminal.ts` (`stop`, `stopAll`)
- `src/main/index.ts` (`before-quit` handler ~1074)
- `src/main/terminal.test.ts`
- `src/main/vite-server.ts` (`stopAll` pattern)

## Invariants / constraints

- Main remains the only node-pty owner; renderer contract unchanged.
- `stop(id)` stays sync (IPC handlers depend on it); only `stopAll` gains waiting.
- Shutdown must always terminate: every wait bounded, errors swallowed, `app.quit()` in `finally`-equivalent path.
- No node-pty version bump (native rebuild blast radius); fix in our teardown ordering.

## Affected surfaces

- `TerminalManager.stopAll` — kill + drain exits with timeout, then dispose
- `before-quit` — bounded total shutdown with forced-quit fallback
- `terminal.test.ts` — drain + timeout tests
- `docs/main.md` — one-line teardown ordering note (if durable truth changes)

## Phases

| Phase | Scope | Status | Validation | Commit |
|---|---|---|---|---|
| 1 | Drain pty exits in `stopAll` + harden `before-quit` | complete | terminal tests (7) + typecheck | — |
| 2 | Docs note + full gate | complete | `npm run check` green (92 files, 695 tests) under Node 22.23.2 | — |

## Validation plan

- Targeted: `npx vitest run src/main/terminal.test.ts`, `npm run typecheck`
- Final gate: `npm run check` under Node 22.23.2
- Manual (unverifiable here): quit packaged Orbit with terminals open, confirm no crash popup

## Decisions

- 2026-09-10 — Root cause from crash trace frames 9–17: node-pty's `ThreadSafeFunction::CallJS` throws a JS exception while Node runs `FreeEnvironment`/`CleanupHandles` — a pty exit callback fired after teardown began. Fix by reaping all ptys (kill + await exits, bounded) before `app.quit()`. Reason: queued TSFN calls are what kill us; draining them before teardown removes the throw.
- 2026-09-10 — Keep `stop(id)` synchronous; only quit-path `stopAll` waits. Reason: runtime single-stop is safe (env alive); avoid IPC signature churn.

## Open risks / blockers

- node-pty may have an upstream teardown bug not fully fixed by draining; manual packaged verification required.
- A pty that ignores SIGTERM could delay quit up to the timeout (bounded, acceptable).
