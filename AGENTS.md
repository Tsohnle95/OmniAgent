# OpenShell — Agent Guide

OpenShell is a VS Code-style desktop GUI for the opencode2 agent: an
Electron + React + Monaco app that opens a repository, sends prompts to
opencode2, streams the agent's progress, and shows live per-file diffs of
everything the agent changed.

Read this file first. For depth, read the module docs — each one is
self-contained so you never need to crawl the whole repo.

## Quick start

```sh
npm install
npm run dev        # electron-vite dev with HMR
npm run typecheck  # tsc --noEmit for node + web configs
npm run build      # electron-vite build -> out/
npm start          # run the production build
```

`opencode2` must be on PATH (or an opencode service already running).

## Module map

| Area | Path | Role |
|---|---|---|
| Main process | `src/main/index.ts` | Window, IPC handlers, backend wiring |
| Backend | `src/main/opencode.ts` | All opencode2 API traffic, session state, fs watching, baselines |
| Preload bridge | `src/preload/index.ts` | `window.openshell` API exposed to the renderer |
| Renderer store | `src/renderer/src/store.tsx` | All UI state; subscribes to backend events |
| Renderer components | `src/renderer/src/components/` | Sidebar, editor, agent panel, welcome |
| Monaco setup | `src/renderer/src/monaco.ts` | Workers, theme, language mapping |
| Shared types | `src/shared/types.ts` | Types shared across main/preload/renderer |

See `docs/` for full docs: `architecture.md` (system overview), `events.md`
(opencode2 event protocol), `operations.md` (run/verify/debug playbook),
`main.md`, `preload.md`, `renderer.md`, `shared.md`. Open product
requests live in the README's roadmap section; the actionable working
queue is `TODO.md` — start a session by reading both.

## Architecture in one paragraph

The Electron **main process** is the only thing that talks to opencode2
(`@opencode-ai/client`). It spawns/connects to the service, creates a
session for the opened directory, and runs an SSE event loop that forwards
every server event to the renderer over IPC. The **renderer** (React) keeps
all UI state in one store and renders a three-pane layout: file tree,
Monaco editor with an Edit/Diff toggle, and the streaming agent panel. The
main process also watches the repo with `fs.watch`; every change streams a
`{baseline, content}` update so the diff view is always exactly what the
agent changed this session.

## Conventions (follow these)

- **No code comments.** Code must be self-explanatory; put knowledge in
  `docs/` instead.
- TypeScript strict; shared shapes live in `src/shared/types.ts` and are
  imported as `@shared/types` (alias configured in the tsconfigs and
  `electron.vite.config.ts`).
- IPC channels are named `shell:*`; backend messages to the renderer are
  `{ kind: "event" | "file-update" | "session", ... }` (see
  `src/shared/types.ts`).
- All opencode2 API calls are isolated in `src/main/opencode.ts` — if the
  client API shape changes, only that file changes.
- Tree paths are relative to the session directory, always `/`-separated,
  no trailing slashes.
- Everything under `out/`, `node_modules/`, `*.tsbuildinfo` is gitignored.

## Definition of done

After any change: `npm run typecheck` clean, `npm run build` succeeds,
`npm run docs:check` passes. Commit buildable state; never commit a broken
build.

## Commits are the agent's job

The agent owns version control — the user should never see a dirty tree.

- Check `git status` at the start of a session and leave the tree exactly
  as you found it; if the session starts clean, it must end clean.
- Commit after each logically complete unit of work (a feature, a fix,
  its docs) rather than once at the end — but only after that unit
  passes typecheck/build/docs:check.
- Include the doc/brain updates for a change in the same commit as the
  code that makes them necessary (see Docs maintenance).
- Write concise commit messages that match the repo's existing style.
- Do not commit unrelated or experimental files; never commit secrets.
- Only commit what you are confident is correct: a commit is the
  checkpoint a future session (or `git revert`) may rely on.

## Docs maintenance (the project brain)

The brain is `AGENTS.md` + `docs/`. It must never drift from the code.

- `npm run docs:check` (see `scripts/check-docs.mjs`) verifies the
  machine-checkable parts against the source and fails on drift:
  IPC channels, `OpenShellBackend` public methods, the
  `window.openshell` contract, handled/not-handled event types, and that
  every file the docs link to exists.
- **When you change code, update the brain in the same commit**: add the
  new IPC channel / method / event to the relevant docs table. The check
  will tell you exactly what is missing.
- **When you add an event handler**, put it in the events.md handled
  table; when the app starts ignoring an event, move it to the
  not-handled list.
- **When a change is pure refactoring with no observable surface**
  (naming, internals, private helpers), no doc update is needed — the
  check only tracks the public, verifiable surface so it never demands
  noise.
