---
name: Dispatch
description: "Orchestrate a multi-unit backlog in any repo: split TODO.md items into agent units, map file surfaces, batch them into parallel waves, double-gate the dispatch plan, run worker agents, then review once and close mechanically."
---

# Dispatch pipeline

Orchestrating multi-unit agent work in any repository. One orchestrator
schedules; worker agents implement; one reviewer judges; the orchestrator
sweeps. Every gate below is run by the orchestrator itself — no human in the
loop. Run this flow whenever the user asks to work through a backlog, a TODO
list, or multiple units of work in one session ("take care of the items").

## The spine

1. **Scope** — keep every requested task in one ordered list (`TODO.md` with
   `- [ ]` items; create it at the repo root if missing). Each item is one
   commit-worthy unit: small enough for one agent to finish, verify, and
   commit in a single run. Vague items are scoped into units or flagged for
   the user before planning. Standing-maintenance items (for example under a
   `## Docs` heading) are never dispatched.
2. **Map file surface** — dispatch one cheap explore agent per item, in
   parallel. Each returns the files the item will touch, indirect effects
   (imports, shared types, public surface), and the tests to update. Build a
   conflict matrix from those lists. Never guess file surfaces from the
   orchestrator's own context.
3. **Batch** — a wave is a parallelism stage: everything in one wave runs
   concurrently, so wave members must have disjoint file sets. Items sharing
   a file go in separate waves. Cross-cutting items that restructure shared
   state go last. Run at most 3 background workers at once.
4. **Write the dispatch plan, then gate it twice** — `dispatch-plan.json` at
   the repo root: `items` in TODO order, each with `todo` (text contained in
   its TODO.md line), `files` (repo-relative paths), `wave` (positive
   integer, contiguous from 1), and optional `dependsOn` (indices in earlier
   waves). Then run both gates:
   - mechanical: if the repo has `npm run dispatch:check`, use it; otherwise
     run the checker directly:
     `node <directory containing this SKILL.md>/scripts/check-dispatch.mjs <path to the dispatch-plan.json>`.
     Never wire the checker into the target repo's package.json or any other
     repo file — the checker always runs from this skill's directory. If an
     item creates brand-new files, create empty placeholder files at those
     paths first so the checker can verify them; the workers replace them.
   - one plan-review agent over the plan: judgment on scoping quality,
     missed files, wrong wave decisions. It flags; the orchestrator revises.
   **No dispatch before both gates pass.**
5. **Brief each worker** — give the item, the exact files, the repo
   conventions (the project's `AGENTS.md`), the verification gate, and
   commit ownership (the worker commits its own unit). No scope ambiguity.
   Each worker is a leaf: instruct it to complete its unit directly and not
   spawn other agents.
6. **Implement** — the worker writes tests for any new logic, runs the
   project gate, then self-critiques its own diff ("what would a reviewer
   flag here?"). It fixes the obvious misses itself, then commits.
   Self-review catches breakage and roughly half of what a reviewer would
   find; it is never the final authority.
7. **Accept each unit** — a unit is done only when its commit landed and the
   gate is green. A failing gate or dirty tree after a unit blocks the next
   wave. The orchestrator marks the accepted item done (`- [x]`) in TODO.md.
8. **Review once** — one fresh, unbiased reviewer agent over the entire
   combined diff. Never chain reviewers: two reviewers duplicate most
   findings; the orchestrator reviewing its own orchestration is the biased
   step. Use a read-only reviewer subagent (a `reviewer` agent where one is
   configured); do not self-review.
9. **Close mechanically** — the orchestrator runs checklist-only checks:
   gate green, tree clean, commit hygiene, docs synced. If the reviewer
   flagged issues, dispatch fixes and have the same reviewer re-check only
   the fix diffs. Delete `dispatch-plan.json` from the repo root when done.
10. **Report** — summarize what shipped, what was flagged, and what remains
    open.

## Finding the project's verification gate

Find the gate in the repo's `AGENTS.md` or `package.json` (examples:
`npm run check`, `npm test`, `cargo test`, `make check`). If none exists,
define a minimal one that runs the project's tests or type checks and
document it in the repo's `AGENTS.md`; ask the user when the repo has no
natural gate. The gate must be green before any commit and at mechanical
close. Do not modify the target repo's package.json to support the dispatch
flow itself.

## Reading an orchestrator's quality

Judge the artifact, not the agent. Signals, in order of severity:

- the dispatch plan passes the mechanical checker on the first or second
  attempt
- the plan-review agent finds no significant missed files or bad scoping
- zero merge conflicts during execution — conflicts are bad batching
- the end reviewer finds no orchestration-caused defects
- every unit committed with the gate green and a clean tree

## Rules of thumb

- Workers crank out, verify, self-critique, commit. The reviewer is the
  judge for judgment, not a substitute for the gate.
- One reviewer, one re-check loop. The orchestrator schedules and sweeps; it
  never self-reviews its own orchestration.
