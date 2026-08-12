# Dispatch — orchestrating agent work

How to split the backlog (`TODO.md`) into agent units, run them, and close
the loop. One orchestrator schedules; worker agents implement; one reviewer
judges; the orchestrator sweeps.

## Steps

1. **Inventory** — keep every requested task in one ordered list. Each item
   is one commit-worthy unit: small enough for one agent to finish, verify,
   and commit in a single run.
2. **Map file surface** — for each item, list the files it will touch. Items
   that share files conflict if run simultaneously.
3. **Batch** — group items into waves: parallel where file surfaces are
   disjoint, sequential slots where they overlap, and any cross-cutting item
   that restructures shared state (for example the session store) last.
4. **Brief each worker** — give the item, the exact files, the repo
   conventions (`AGENTS.md`), the verification gate (`npm run check`), and
   commit ownership (the worker commits its own unit). No scope ambiguity.
5. **Implement** — the worker writes tests for any new logic, runs
   `npm run check`, then self-critiques its own diff: "what would a reviewer
   flag here?" It fixes the obvious misses itself, then commits. Self-review
   catches breakage and roughly half of what a reviewer would find; it is
   never the final authority.
6. **Accept each unit** — a unit is done only when its commit landed and the
   gate is green. A failing gate or dirty tree after a unit blocks the next
   wave.
7. **Review once** — one fresh, unbiased reviewer agent over the entire
   combined diff. Never chain reviewers: two reviewers duplicate most
   findings; the orchestrator reviewing its own orchestration is the biased
   step.
8. **Close mechanically** — the orchestrator runs checklist-only checks:
   gate green, tree clean, commit hygiene, docs synced. If the reviewer
   flags issues, dispatch fixes and have the same reviewer re-check only the
   fix diffs.
9. **Report** — summarize what shipped, what was flagged, and what remains
   open.

## Rules of thumb

- Workers crank out, verify, self-critique, commit. The reviewer is the
  judge for judgment, not a substitute for the gate.
- One reviewer, one re-check loop. The orchestrator schedules and sweeps;
  it never self-reviews its own orchestration.
