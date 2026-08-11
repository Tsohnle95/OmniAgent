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
  view is a Monaco diff editor showing exactly what the agent changed this
  session, updating in real time as files change.
- **Agent panel (right)** — streaming assistant text, collapsible reasoning,
  tool call cards with output, permission allow/deny prompts, status, and a
  prompt input. Stop button interrupts the session.
- **Changes list** — files the agent has touched, listed at the top of the
  sidebar; click any file to jump straight into its diff.
- **Real-time updates** — the main process watches the repo with `fs.watch`
  and streams per-file updates to the UI.
- **Session history** — recent sessions show up on the Welcome screen;
  reopening one replays the transcript and resumes the same context. The
  last-used model is remembered for new sessions.

## How it talks to opencode2

All API traffic happens in the Electron **main process** using
[`@opencode-ai/client`](https://opencode.ai/v2/docs/build/client):

- Service discovery/auth: `Service.discover()` / `Service.ensure()` from
  `@opencode-ai/client/service` (falls back to spawning `opencode2 serve --service`).
- Sessions: `client.session.create({ location: { directory } })`,
  `client.session.prompt`, `client.session.interrupt`.
- Streaming: `client.event.subscribe()` (SSE) — events forwarded to the renderer
  over IPC. Handled event types: `session.text.delta`, `session.reasoning.delta`,
  `session.tool.called/success/failed`, `session.execution.*`, `session.idle`,
  `permission.asked/replied`, …
- Permissions: `client.permission.reply({ sessionID, requestID, reply })`
  (once / always / reject).
- Files: `client.file.list/read`; writes go through Node `fs` in the main
  process (the API has no write endpoint — the server picks up the change).
- Agent baselines: files are snapshotted **before** a tool executes
  (`session.tool.called` input paths); anything the agent changes via bash or
  other tools gets its baseline from `git show HEAD:<file>` (green for new
  files). So the diff always means "changes the agent made in this session".

## Requirements

- Node 20+ and npm
- `opencode2` on your PATH (or an already-running opencode service)

## Development

```sh
npm install
npm run dev        # electron-vite dev with HMR
```

## Build

```sh
npm run build      # typecheck + build
npm start          # run the production build
```

## Documentation

- `AGENTS.md` — the project brain: what this is, how it's organized, and the
  conventions any agent must follow.
- `docs/architecture.md` — system overview: process model, IPC, data flow,
  diff/baseline mechanics.
- `docs/events.md` — the opencode2 event protocol: what the app handles, what
  it ignores, and how tool cards are assembled.
- `docs/main.md`, `docs/preload.md`, `docs/renderer.md`, `docs/shared.md` —
  per-module references, each self-contained.

## Notes / roadmap

Open requests from real usage live in `TODO.md` — pick them up in a fresh
session. Delivered so far (see `git log`):

- **Tool cards** got a richer pass: per-tool icons, status-colored borders,
  clickable file-path chips, inline output previews, and a permission UX that
  shows the resolved reply.
- **Session history / reopen** — recent sessions appear on the Welcome screen;
  reopening resumes the same session context (transcript replayed from
  `message.list`).
- **Model choice persists** across sessions (last-used model is stored and
  passed to `session.create`), and the picker labels show the provider.

The long-term goal is to feel like Codex/Antigravity: a calm, informative
streaming agent panel that always shows what the agent is doing.

Known constraints:

- The `@opencode-ai/client` API and event shapes are beta and may shift; the
  typed calls are isolated in `src/main/opencode.ts`.
- Operational/debugging know-how lives in `docs/operations.md`.
