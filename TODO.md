# TODO / working backlog

Add points here anytime — `- [ ]` for open items, `- [x]` when done.
A fresh session can start working from this file. Bigger ideas belong in
the README roadmap; this file is the actionable queue.

## Agent panel UX (Codex-style polish)

- [x] Tool cards still feel "dry" — user wants Codex/Antigravity richness.
      Done: per-tool icons, status-colored borders (running/success/failed),
      clickable file-path chips (open the file), inline one-line output
      preview for successes, auto-expanded error output, permission cards
      with action icon + resolved state naming the reply.


## Sessions

- [x] Session history / reopen — done. `session.list` + `message.list`
      replay; recent sessions shown on the Welcome screen; reopening
      restores the transcript and resumes the same session context.
- [x] Persist model choice across sessions — done. Last-used model is
      saved to `settings.json` (userData) and passed to `session.create`
      for every new session; manual switches update it too.

## Model picker

- [x] Dropdown is session-gated — decided: keep it in the agent header
      only. Model catalogs are directory-scoped, and the Welcome screen
      has no agent panel; a picker there would be premature.
- [x] Show provider alongside model name in the dropdown labels.

## Reliability / correctness

- [x] Confirm `session.model.selected` always fires on session create, or
      rely fully on the `modelDefault()` seed (currently both exist).
      Both paths kept: the model is passed to `session.create` so
      `session.model.selected` fires reliably; `modelDefault()` remains
      the fallback seed for sessions created without an explicit model.
- [x] Verify tool-card behavior when events arrive out of order or when
      a session is opened mid-run (upsert logic assumes order-independence).
      Fixed: `upsertTool` never lets a terminal status regress to
      "running", so a late `session.tool.called` can't reset a finished
      card; replayed tool cards carry their final status directly.
      Mid-run reopen: transcript is replayed and live events continue
      updating `busy` (execution.failed/interrupted/idle cover the tail).


## My todo as i think of them:

- [x] Word-wrap: Wrap toolbar button + ⌥Z (VS Code shortcut); ⌘W no longer
      closes the window (main intercepts it and closes the active tab
      instead — your session survives).
- [x] Right-hand panel restyled to opencode-desktop-ish message layout:
      compact tool cards with `$ command` lines and clickable file chips
      instead of giant JSON/read-path rectangles, cleaner thinking block,
      statuses inline.
- [x] Smart auto-scroll: the transcript only auto-scrolls while you're at
      the bottom; scrolling up pauses it so you can read freely.
- [x] Left file panel revamped: CHANGES is now a drag-resizable bottom
      section with its own scroll, rows show the folder context
      (`file · src/foo`), deleted/modified styled, explorer unchanged.
- [x] Models grouped by provider (`<optgroup>`) in the picker.
- [x] Window is explicitly movable/resizable; grid uses `minmax(0,1fr)`
      so no panel gets pushed off-screen; closing the tray no longer
      hides anything (tray is a real layout row).
- [x] Terminal in the bottom tray (xterm.js + node-pty PTY), toggled
      from the titlebar (⌥O), drag-resizable, restarts with the session
      directory as cwd.
- [x] Titlebar shifted right on macOS so it never overlaps the traffic
      lights.
- [x] Agent picker next to the model picker (agent.list / switchAgent,
      persisted). Model strength (high/low) is not exposed by the
      opencode2 API, so it can't be wired up yet.
- [x] Code cards redesigned (see "Right-hand panel restyled" above).
- [x] ⌘S saves; dirty tab dot + "unsaved" / "changed on disk" labels
      show save state.


      

## Docs / brain

- [ ] Keep `npm run docs:check` green on every change (see AGENTS.md).
