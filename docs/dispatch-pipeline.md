# Dispatch pipeline — the chain

How the pieces of the dispatch system connect, what each gate checks, and
where to look when something breaks. The spine itself lives in
[`dispatch.md`](dispatch.md); this page maps the plumbing around it. Anything
written here for the orchestrator is for the orchestrator agent — no human is
ever required to run the pipeline.

## The chain

```
  repo                       portable                     global (~/.config/opencode)
  ────                       ────────                     ─────────────────────────────
  AGENTS.md ───────────────┐
  (work order, gate,       │ points at
  commit discipline)       ▼
                     docs/dispatch.md
                     (10-step spine)
                          │
                          │ encoded portably as
                          ▼
  TODO.md ──────────► .opencode/skills/dispatch/ ──symlink──► ~/.config/opencode/skills/dispatch
  (backlog,            SKILL.md (repo-agnostic spine)         (advertised to the
   one unit per item)  scripts/check-dispatch.mjs             model in every repo)
                          │ portable copy of the repo
                          │ checker, takes the plan path
                          ▼
  dispatch-plan.json ◄── orchestrator writes it, both gates judge it
  (gitignored,          mechanical: npm run dispatch:check (repo) or
   deleted at close)      node <skill>/scripts/check-dispatch.mjs <plan> (portable)
                          judgment: a fresh plan-review agent
                          │
                          ▼
                     waves of worker subagents (≤ 3 concurrent) ──► one fresh
                     reviewer subagent ──► orchestrator closes mechanically
  AGENTS.md (global): loads the dispatch skill when asked to work a backlog
  agents/reviewer.md (global): read-only reviewer subagent used for both
    plan review and end-of-run review
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
| The flow never starts (no plan appears) | `~/.config/opencode/skills/dispatch`, `~/.config/opencode/AGENTS.md` | "is the symlink live and did the session advertise the dispatch skill?" |
| Skill exists but the model never sees it | `.opencode/skills/dispatch/SKILL.md` frontmatter | "does the description parse as YAML — quote any value containing ': '?" |
| Reviewer agent can edit files | `~/.config/opencode/agents/reviewer.md` | "are edit and shell denied in the reviewer permissions?" |
| Tree dirty at close | `git status` | "did a worker leave uncommitted changes, or is the plan file still present?" |

## For the human vs for the orchestrator

For the human: write backlog items in `TODO.md`, one commit-worthy unit per
line; trust the pipeline; check the end-of-run report. Nothing else is asked
of a human.

For the orchestrator: follow the 10-step spine in [`dispatch.md`](dispatch.md)
or the portable copy in `.opencode/skills/dispatch/SKILL.md`; gate twice
before dispatching anything; keep waves disjoint; never self-review; close
mechanically. The global wiring under `~/.config/opencode` is the machine's
job, maintained by the same agents that own this repo.
