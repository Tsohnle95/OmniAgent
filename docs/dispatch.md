# Dispatch — orchestrating agent work

How to split the backlog (`TODO.md`) into agent units, run them, and close
the loop. One orchestrator schedules; worker agents implement; one reviewer
judges; the orchestrator sweeps. Every gate here is run by the orchestrator
itself — no human in the loop.

## Steps

1. **Inventory** — keep every requested task in one ordered list. Each item
   is one commit-worthy unit: small enough for one agent to finish, verify,
   and commit in a single run. Vague items are scoped into units or flagged
   for the user before planning. Open items under the `## Docs` heading are
   standing maintenance and are never dispatched.
2. **Map file surface** — dispatch one cheap explore agent per item, in
   parallel. Each returns the files the item will touch, indirect effects
   (imports, shared types, IPC surface), and the tests to update. The
   orchestrator builds a conflict matrix from those lists. Never let the
   orchestrator guess file surfaces from its own context.
3. **Batch** — a wave is a parallelism stage: everything in one wave runs
   concurrently, so wave members must have disjoint file sets. Items sharing
   a file go in separate waves. Cross-cutting items that restructure shared
   state go last.
4. **Write the dispatch plan** — `dispatch-plan.json` at the repo root
   (gitignored): `items` in TODO order, each with `todo` (text contained in
   its TODO.md line), `files` (repo-relative paths), `wave` (positive
   integer, contiguous from 1), and optional `dependsOn` (indices that must
   be in earlier waves). Then run the gates:
   - `npm run dispatch:check` — mechanical: every open item covered, paths
     exist, no shared files inside a wave, dependency order, no empty file
     lists. For items creating brand-new files, create empty placeholders at
     those paths first so the checker can verify them.
   - one plan-review agent — judgment: scoping quality, missed files,
     wrong wave decisions. It flags; the orchestrator revises.
   **No dispatch before both gates pass.**
5. **Brief each worker** — give the item, the exact files, the repo
   conventions (`AGENTS.md`), the verification gate (`npm run check`), and
   commit ownership (the worker commits its own unit). No scope ambiguity.
6. **Implement** — the worker writes tests for any new logic, runs
   `npm run check`, then self-critiques its own diff: "what would a reviewer
   flag here?" It fixes the obvious misses itself, then commits. Self-review
   catches breakage and roughly half of what a reviewer would find; it is
   never the final authority.
7. **Accept each unit** — a unit is done only when its commit landed and the
   gate is green. A failing gate or dirty tree after a unit blocks the next
   wave. The orchestrator marks the accepted item done (`- [x]`) in TODO.md.
8. **Review once** — one fresh, unbiased reviewer agent over the entire
   combined diff. Never chain reviewers: two reviewers duplicate most
   findings; the orchestrator reviewing its own orchestration is the biased
   step.
9. **Close mechanically** — the orchestrator runs checklist-only checks:
   gate green, tree clean, commit hygiene, docs synced. If the reviewer
   flags issues, dispatch fixes and have the same reviewer re-check only the
   fix diffs.
10. **Report** — summarize what shipped, what was flagged, and what remains
    open.

## Reading an orchestrator's quality

Judge the artifact, not the agent. Signals, in order of severity:

- the dispatch plan passes `npm run dispatch:check` on the first or second
  attempt
- the plan-review agent finds no significant missed files or bad scoping
- zero merge conflicts during execution — conflicts are bad batching
- the end reviewer finds no orchestration-caused defects
- every unit committed with `npm run check` green and a clean tree

## Rules of thumb

- Workers crank out, verify, self-critique, commit. The reviewer is the
  judge for judgment, not a substitute for the gate.
- One reviewer, one re-check loop. The orchestrator schedules and sweeps;
  it never self-reviews its own orchestration.
