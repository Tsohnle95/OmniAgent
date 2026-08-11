# OpenShell

A VS Code–style desktop GUI for the [opencode2](https://opencode.ai/v2) agent,
built on Electron + React + Monaco. Mimics the Antigravity IDE flow: open a
repository, tell the agent to work, watch its text stream on the right while
every file it touches appears with a live red/green diff in the center.

## Features

- **File explorer (left)** — lazy-loaded tree of the repo via the opencode
  filesystem API; hidden/build dirs (`node_modules`, `.git`, `dist`, …) filtered.
- **Editor (center)** — Monaco, fully editable like VS Code, with autosave
  (debounced) and ⌘S/Ctrl+S. Every tab has an **Edit / Diff** toggle; the diff
  view is a Monaco diff editor showing exactly what the agent changed this
  session (red = removed, green = added), updating in real time as files change.
- **Agent panel (right)** — streaming assistant text (`session.text.delta`),
  collapsible thinking, tool call cards with output, permission allow/deny
  prompts, status, and a prompt input. Stop button interrupts the session.
- **Changes list** — files the agent has touched, listed at the top of the
  sidebar; click any file to jump straight into its diff.
- **Real-time updates** — the main process watches the repo with `fs.watch`
  and streams per-file `{baseline, content}` updates to the UI.

## How it integrates with opencode2

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
  files). The diff is therefore "changes the agent made in this session".

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

## Notes / roadmap

- One session per app run; session history/reopen is not wired up yet.
- The `@opencode-ai/client` API and event shapes are beta and may shift; the
  typed calls are isolated in `src/main/opencode.ts`.
