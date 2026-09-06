## Run record

- Instructions and docs consulted: `AGENTS.md`; `docs/agent-execution.md`,
  `docs/architecture.md`, `docs/main.md`, `docs/preload.md`,
  `docs/renderer.md`, `docs/shared.md`, `docs/operations.md`, and the startup
  routing portions of `docs/walkthrough.md`.
- Task classification: PROJECT (durable persistence, restart recovery,
  compatibility, and lifecycle/security boundaries).
- Planning mechanism: created `.agent/tasks/workspace-session-restoration.md`
  from `.agent/tasks/_TEMPLATE.md`; no delegation or subagents were used.
- Implementation and tests inspected: `src/renderer/src/store.tsx`,
  `src/renderer/src/store.workspace.test.tsx`,
  `src/renderer/src/store.agent-refresh.test.tsx`, `src/main/index.ts`,
  `src/main/opencode.ts`, `src/preload/index.ts`, existing
  `src/main/multi-context.test.ts`, and `src/main/runtime-routing.test.ts`.
- Plan review and revisions before implementation: reviewed the live startup
  effect, session reopen routing, and existing workspace tests; resolved to
  merge/deduplicate `activeSessions()` with persisted hints, restore in saved
  order, omit absent runtime hints, and gate writes until reconciliation. A
  later cumulative review added the backend health/connect readiness wait after
  identifying the renderer-before-backend cold-start race.
- Implementation phases and checkpoint commits: phase 1 implemented the
  renderer-owned versioned layout persistence, migration, restore flow, tests,
  and canonical docs in `a4e0ec8`; the cold-start readiness correction and
  regression test were checkpointed in `4d8a6f4`; the ledger was updated in
  `0166220`. Phase 2 performed cumulative review, final validation, this record,
  and temporary-task cleanup.
- Files changed: `src/renderer/src/store.tsx`,
  `src/renderer/src/store.workspace.test.tsx`,
  `src/renderer/src/store.agent-refresh.test.tsx`, `docs/renderer.md`,
  `docs/architecture.md`, and this evaluation file. The temporary
  `.agent/tasks/workspace-session-restoration.md` was created, updated, and
  deleted on completion.
- Targeted validation: focused workspace tests initially passed (28 tests);
  after the readiness correction, focused workspace plus agent-refresh tests
  passed (32 tests). Typecheck and `git diff --check` passed. The first full
  test run exposed cross-test `localStorage` leakage in the existing
  `store.agent-refresh.test.tsx`; its `beforeEach` was isolated with
  `localStorage.clear()`, and the file then passed in isolation.
- Cumulative/final validation: pinned `npm run check` passed before the final
  record update, including typecheck, 92 test files / 683 tests, `docs:check`,
  and `build:compile`. The final record-only change does not affect source
  validation; the final pinned gate was rerun after this file was written.
  Existing non-fatal test diagnostics included jsdom canvas warnings, watcher
  `EMFILE` warnings, and one existing React `act` warning.
- Active runtime/toolchain: initial exploratory commands used Node `v26.7.0`
  and were treated as provisional. Canonical validation used Node `v22.23.2`
  from `/Users/ty/.nvm/versions/node/v22.23.2/bin`, exactly matching
  `.node-version` and satisfying `package.json` engines `>=22.23.2 <23`.
- Git and CI results: initial Git status was `main...origin/main` with only
  the pre-existing untracked `.agent/evals/node-pty-ci-run-01.md`; that file
  was preserved. Local checkpoints are on `main`, with `git diff --check`
  passing. No GitHub Actions or other remote CI run was triggered or observed.
- Escalation, replanning, and approach changes: after review, the startup
  health wait was added and checkpointed. One commit retry was denied because
  the sandbox could not create `.git/index.lock`; read-only checks found no
  stale lock or Git process, and an approved repository-scoped escalation
  allowed the commit. No architectural scope expansion was made.
- Delegation/subagents: none.
- Context and scope: several initial parallel document/source reads overlapped
  and were truncated, so a few relevant sections were reread by line range.
  This did not add unrelated implementation scope; all later investigation
  stayed within renderer persistence/startup, existing main reopen boundaries,
  adjacent tests, canonical docs, and validation.
- Guidance ambiguity/insufficiency: the requested existing
  `.agent/evals/project-run-01.md` was absent from the checkout; only
  `feature-run-01.md` and the unrelated `node-pty-ci-run-01.md` were present.
  The exact requested evaluation path was therefore created. Other repository
  routing, planning, identity, security, documentation, and validation
  guidance was sufficient.
- Task-file lifecycle and cleanup: the temporary task file was created from
  the template, revised after plan review, updated with checkpoint IDs and
  phase status, then removed in the completion commit. No follow-up work was
  identified for the backlog.
- Final task status: complete; renderer-owned session layout hints now restore
  valid session panels and active focus across full process restarts while
  leaving runtime/session lookup, canonicalization, fresh workspace identity,
  and transient/privileged state under existing main-process boundaries.
