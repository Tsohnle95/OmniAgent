# TODO / working backlog

Add points here anytime — `- [ ]` for open items, `- [x]` when done.
A fresh session can start working from this file. Bigger ideas belong in
the README roadmap; this file is the actionable queue.

## Agent panel UX (Codex-style polish)

- [ ] Tool cards still feel "dry" — user wants Codex/Antigravity richness.
      Current: name, file/command detail, live args, elapsed time,
      collapsible output (auto-open on failure). Ideas: file-path chips,
      per-tool status colors, inline output preview, nicer permission UX.

## Sessions

- [ ] Session history / reopen — one session per app run today. The
      client has `session.list`/`session.get` + message replay; would
      survive app restarts and crashes without losing agent context.
- [ ] Persist model choice across sessions (last-used or config default).

## Model picker

- [ ] Dropdown is session-gated (`session && models.length > 0`) — decide
      whether it should appear on the Welcome screen too.
- [ ] Show provider alongside model name in the dropdown labels.

## Reliability / correctness

- [ ] Confirm `session.model.selected` always fires on session create, or
      rely fully on the `modelDefault()` seed (currently both exist).
- [ ] Verify tool-card behavior when events arrive out of order or when
      a session is opened mid-run (upsert logic assumes order-independence).

## Docs / brain

- [ ] Keep `npm run docs:check` green on every change (see AGENTS.md).
