# TODO / working backlog

Add points here anytime — `- [ ]` for open items, `- [x]` when done.
A fresh session can start working from this file. Bigger ideas belong in
the README roadmap; this file is the actionable queue.

## Agent panel UX polish

- [x] Replace custom chat visuals with OpenCode's web timeline presentation.
      Done: the renderer uses source-derived timeline rows and message-part
      slots, flat markdown and collapsed reasoning disclosures, Thinking/TextShimmer,
      Exploring context groups, navigable subagent cards, semantic session
      messages, borderless BasicTool triggers, and OpenCode V2 dark tokens.
      The old bubbles, tool cards, typing dots, and cursor path were removed.


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

- [x] Replace the custom flattened chat stream with OpenCode's stream model.
      Done: events are batched/coalesced at 16ms and reduced by session id;
      child/subagent streams are retained, admitted input stays internal until
      promotion, selections remain non-chat UI state, and synthetic/skill/
      shell/assistant/compaction events become ordered timeline items, legacy
      projections use the same model, and replay restores that structure.
- [x] Confirm `session.model.selected` always fires on session create, or
      rely fully on the `modelDefault()` seed (currently both exist).
      Both paths kept: the model is passed to `session.create` so
      `session.model.selected` fires reliably; `modelDefault()` remains
      the fallback seed for sessions created without an explicit model.
- [x] Verify tool-card behavior when events arrive out of order or when
      a session is opened mid-run. Fixed: the ordered reducer never lets a
      terminal status regress to "running", authoritative snapshots replace
      deltas cleanly, and replayed tool cards carry their final status directly.
      Mid-run reopen restores persisted parts before live events continue.


## My todo as i think of them:

- [x] Word-wrap: Wrap toolbar button + ⌥Z + ⌘W (the muscle-memory
      shortcut — main intercepts ⌘W so it toggles wrap instead of closing
      the window; ⌥Z uses `e.code` so it works with Option+Z).
- [x] Agent panel composer redesigned as a neutral integrated prompt box:
      attachment picker, approval toggle, agent/model/variant menus,
      microphone, circular send control, and clear prompt placeholder.
- [x] Right-hand panel uses the OpenCode web timeline and message-part layout.
- [x] Smart auto-scroll: the transcript only auto-scrolls while you're at
      the bottom; scrolling up pauses it so you can read freely.
- [x] Left file panel revamped: CHANGES is a drag-resizable bottom
      section with its own scroll, rows show the folder context
      (`file · src/foo`), deleted/modified styled; EXPLORER now uses
      VS Code-style codicon icons (folder/folder-opened, per-type file
      icons) with per-level indent guide lines.
- [x] Models grouped by provider sections in the composer picker.
- [x] Window is explicitly movable/resizable; grid uses `minmax(0,1fr)`
      so no panel gets pushed off-screen; closing the tray no longer
      hides anything (tray is a real layout row).
- [x] Terminal in the bottom tray (xterm.js + node-pty PTY), toggled
      from the titlebar (⌥O), drag-resizable, restarts with the session
      directory as cwd.
- [x] Titlebar shifted right on macOS so it never overlaps the traffic
      lights.
- [x] Agent picker plus model response-strength variants (agent.list /
      switchAgent and Model.Ref.variant, persisted where selected).
- [x] Code cards redesigned (see "Right-hand panel restyled" above).
- [x] ⌘S saves; dirty tab dot + "unsaved" / "changed on disk" labels
      show save state.


      

## Docs / brain

- [ ] Keep `npm run docs:check` green on every change (see AGENTS.md).
