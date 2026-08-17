# Dispatch pipeline — the chain

How the pieces of the dispatch system connect, what each gate checks, and
where to look when something breaks. The spine itself lives in
[`dispatch.md`](dispatch.md); this page maps the plumbing around it. Anything
written here for the orchestrator is for the orchestrator agent — no human is
ever required to run the pipeline.

## The chain

```
  repo
  ────
  AGENTS.md (work order, gate, commit discipline)
      │ points at
      ▼
  docs/dispatch.md (10-step spine)
      │ orchestrator follows the spine
      ▼
  dispatch-plan.json ◄── TODO.md (backlog, one commit-worthy
  (gitignored,            unit per item) and
   deleted at close)      scripts/check-dispatch.mjs
                          (npm run dispatch:check — mechanical
                           gate: coverage, paths, waves, deps)
      │ judgment: a fresh plan-review agent
      ▼
  waves of worker subagents (≤ 3 concurrent)
      ▼
  one fresh reviewer subagent
      ▼
  orchestrator closes mechanically
```

For the human, the whole system is two decisions: keep `TODO.md` up to date,
and say "take care of the items". Everything else is the orchestrator's job.

## What each gate checks

| Gate | Run by | Checks |
|---|---|---|
| Mechanical (`npm run dispatch:check` in this repo, or the skill's checker in any repo) | orchestrator, before any worker starts | every open TODO item covered, `todo` text matches a TODO line, file paths exist, no shared files inside a wave, dependencies in earlier waves, waves contiguous from 1, no empty file lists |
| Plan review | a fresh reviewer agent, before any worker starts | scoping quality, missed files, wrong wave decisions, unrealistic units |
| Per-unit gate (`npm run check` here; the project gate elsewhere) | each worker, then the orchestrator on accept | the project's own verification: typecheck, tests, docs, build |
| End-of-run review | one fresh reviewer agent, after the last wave | correctness and regressions across the whole combined diff |
| Mechanical close | orchestrator only | gate green, tree clean, commit hygiene, docs synced, plan file removed |

**No dispatch before both plan gates pass. No next wave before the previous
one is committed, green, and the tree is clean.**

## Failure mode → file to open → diagnosis prompt

| Failure mode | Open | One-line diagnosis prompt |
|---|---|---|
| Plan rejected by the mechanical gate | `scripts/check-dispatch.mjs` output | "which check failed and what does it demand: coverage, paths, waves, or deps?" |
| Plan review flags weak scoping | `dispatch-plan.json` + the flagged TODO lines | "are these units one commit each, and are the file lists complete?" |
| Workers collide on shared files | `dispatch-plan.json` wave assignments | "which two items share a file in the same wave?" |
| Worker fails the project gate | the failing gate output | "is this a real regression in the unit, or an unrelated pre-existing failure?" |
| Reviewer finds defects after the run | the reviewer's findings | "which findings are orchestration-caused versus unit-caused?" |
| The flow never starts (no plan appears) | `docs/dispatch.md`, `TODO.md` | "is the orchestrator pointed at the spine and the backlog?" |
| Reviewer agent can edit files | `~/.config/opencode/agents/reviewer.md` | "are edit and shell denied in the reviewer permissions?" |
| Tree dirty at close | `git status` | "did a worker leave uncommitted changes, or is the plan file still present?" |

## For the human vs for the orchestrator

For the human: write backlog items in `TODO.md`, one commit-worthy unit per
line; trust the pipeline; check the end-of-run report. Nothing else is asked
of a human.

For the orchestrator: follow the 10-step spine in [`dispatch.md`](dispatch.md);
gate twice before dispatching anything; keep waves disjoint; never self-review;
close mechanically.
