# OpenShell

A VS Code–style desktop GUI for the [opencode2](https://opencode.ai/v2) agent,
built with Electron + React + Monaco. The idea is simple: point it at a repo,
tell the agent what to do, and watch it work — the agent's text streams on the
right while every file it touches shows up in the middle with a live
red/green diff.

## Features

- **File explorer (left)** — lazy-loaded tree of the repo via the opencode
  filesystem API. Hides the usual noise (`node_modules`, `.git`, `dist`, …).
- **Editor (center)** — Monaco, fully editable like VS Code, with autosave
  (debounced) and ⌘S/Ctrl+S. Every tab has an **Edit / Diff** toggle: the diff
  view compares workspace changes observed during the active session against
  their first known content, updating in real time as files change. CSS files
  lint inline like they do in VS Code, Emmet expands abbreviations (type `!`
  in an HTML file and press Tab or Enter for the HTML5 skeleton), and a
  **Validate** button in the bottom-left status bar runs the W3C HTML/CSS
  checkers on demand.
- **Agent panel (right)** — OpenCode's web timeline presentation: flat
  streaming markdown and collapsible reasoning, grouped Exploring/Explored
  context activity, navigable subagent task cards, semantic shell/skill/
  compaction entries, borderless tool triggers, docked permission prompts,
  and the integrated prompt input. Stop interrupts the session.
- **Concurrent model panels** — model mode's `+` action adds a sibling agent
  panel with the same resize/collapse/tray behavior. Workspace selection from
  the titlebar or Sessions rail replaces the current view with one fresh model;
  per-workspace state remains available when a session is intentionally reopened.
- **Sessions rail** — running panels, recent sessions, and saved workspaces
  (`project.list`) in one dropdown; click a running panel to focus it, or open
  a non-running session/workspace as the replacement view.
- **Changes list** — workspace file changes observed during the active session,
  regardless of author; known baselines open as diffs and unknown baselines are
  labeled explicitly.
- **Real-time updates** — the main process watches the repo with `fs.watch`
  and streams per-file updates to the UI.
- **Durable recovery** — interrupted saves and file renames retain original and
  proposed artifacts with persistent Open/Acknowledge actions. Acknowledgment
  never deletes bytes.
- **Session history** — recent sessions show up on the Welcome screen and
  the Sessions rail; reopening one replays the transcript and resumes the
  same context (clicking an already-running session just focuses its panel).
  The last-used model is remembered for new sessions.

## How it talks to opencode2

All API traffic happens in the Electron **main process** using
[`@opencode-ai/client`](https://opencode.ai/v2/docs/build/client):

- Service discovery/auth: `Service.discover()` / `Service.ensure()` from
  `@opencode-ai/client/service` (falls back to spawning `opencode2 serve --service`).
- Sessions: `client.session.create({ location: { directory } })`,
  `client.session.prompt`, `client.session.interrupt`.
- Streaming: `client.event.subscribe()` (SSE) — events forwarded to the renderer
  over IPC, batched at OpenCode's 16ms cadence, and folded into per-session
  timelines. The renderer retains parent and child streams and handles admitted
  input, agent/model switches, synthetic/skill/shell/compaction messages, the
  full text/reasoning/tool/step/retry/execution lifecycle, legacy `message.*`
  projections, and permission events.
- Permissions: `client.permission.reply({ sessionID, requestID, reply })`
  (once / always / reject).
- Files: `client.file.list/read`; writes go through Node `fs` in the main
  process (the API has no write endpoint — the server picks up the change).
- Observed-change baselines: structured tool paths are snapshotted before
  execution. First-observed shell or external changes use Git `HEAD` when
  available; non-git pre-change content remains explicitly unknown.

## Requirements

- Node 22.23.2 and npm (the supported range is Node 22 from 22.23.2 onward)
- `opencode2` on your PATH (or an already-running opencode service)

OpenShell is macOS-first and supports development/runtime launch on macOS,
Linux, and Windows. macOS uses the branded development app bundle; Linux and
Windows launch Electron directly. Platform CI exercises launcher selection and
real PTY input/output/exit under Electron on all three systems. macOS also runs
a hidden BrowserWindow trust smoke for the packaged renderer/preload,
navigation denial, popup policy, and trusted/untrusted IPC; Linux and Windows
do not claim automated GUI coverage.

## Development

```sh
npm install
npm run dev        # electron-vite dev with HMR
npm test           # unit/component tests in Vitest + jsdom
npm run check      # typecheck, tests, docs check, and compile-only build
```

## Build & run

```sh
npm run build      # compile then launch the app (one command) — or:
npm run build:compile  # compile only -> out/ (no launch)
npm start          # run the existing production build without rebuilding
npm run pack       # build + package a real macOS app -> release/mac/OpenShell.app
```

Or click **Install app** on the Welcome screen (macOS): it packages the app
and drops `OpenShell.app` into `/Applications` so OpenShell behaves like a
normal app — Finder, Dock, and all.

## Documentation

- `AGENTS.md` — the project brain: what this is, how it's organized, and the
  conventions any agent must follow.
- `docs/architecture.md` — system overview: process model, IPC, data flow,
  diff/baseline mechanics.
- `docs/walkthrough.md` — guided tour of the connections: boot, session,
  streaming, diffs, and every flow traced across the three processes.
- `docs/events.md` — the opencode2 event protocol: what the app handles, what
  it ignores, and how tool cards are assembled.
- `docs/main.md`, `docs/preload.md`, `docs/renderer.md`, `docs/shared.md` —
  per-module references, each self-contained.
- `landing.html` — the animated one-file product landing page; open it
  directly in a browser (fully self-contained, no network needed).

## Notes / roadmap

Open requests from real usage live in `TODO.md` — pick them up in a fresh
session. Delivered so far (see `git log`):

- **Concurrent multi-session** — model mode's `+` action adds sibling agent
  panels with independent streams; workspace selection replaces the current
  view, while per-workspace state survives intentional reopening. The Sessions
  rail lists running panels plus recents and saved workspaces.
- **OpenCode web chat streaming** — OpenCode's per-session V2 reducer behavior,
  child-session task navigation, persistent collapsible reasoning, semantic
  session messages, timeline row construction,
  message-part DOM structure, turn-wide context grouping, specialized task and
  todo surfaces, dark V2 tokens, markdown typography, paced text,
  TextShimmer animation, context-tool grouping, and flat BasicTool triggers are
  ported to React on top of the ordered 16ms event reducer and session replay.
- **Session history / reopen** — recent sessions appear on the Welcome screen;
  reopening resumes the same session context (transcript replayed from
  `message.list`).
- **Model choice persists** across sessions (last-used model is stored and
  passed to `session.create`), and the picker labels show the provider.
- **Installable macOS app** — electron-builder packaging (`npm run pack` or
  the Welcome screen's Install app button) produces a real `OpenShell.app`
  and installs it to `/Applications` for Dock-and-Finder treatment like any
  normal application.

The long-term goal is to feel like Codex/Antigravity: a calm, informative
streaming agent panel that always shows what the agent is doing.

Known constraints:

- The exactly pinned `@opencode-ai/client` API and event shapes are prerelease
  and may shift; the typed calls are isolated in `src/main/opencode.ts` and its
  update procedure is documented in `docs/operations.md`.
- Operational/debugging know-how lives in `docs/operations.md`.
