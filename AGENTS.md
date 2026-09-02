# Orbit — Agent Guide

Orbit is a VS Code-style desktop GUI for coding agents: an Electron + React
+ Monaco app that opens a repository, routes prompts through capability-aware
runtime adapters, streams the agent's progress, and shows live per-file diffs
of workspace file changes observed during the active session. Built-in runtime
support currently covers OpenCode and DeepSeek Harness.

Read this file first. For depth, read the module docs — each one is
self-contained so you never need to crawl the whole repo.

## Quick start

```sh
npm install
npm run dev        # electron-vite dev with HMR
npm run typecheck  # tsc --noEmit for node + web configs
npm test           # Vitest unit/component tests in jsdom
npm run build      # compile then launch the production app (one command)
npm run build:compile  # compile only -> out/
npm run pack       # build + package installable Orbit.app (macOS) -> release/
npm run check      # canonical verification gate
npm start          # run the existing production build without rebuilding
```

`opencode2` must be on PATH (or an opencode service already running) for
OpenCode sessions. `dsh` must be on PATH for DeepSeek Harness sessions.

## Module map

| Area | Path | Role |
|---|---|---|
| Main process | `src/main/index.ts` | Window, IPC handlers, backend wiring |
| Backend | `src/main/opencode.ts` | Runtime routing, session state, fs watching, baselines, and OpenCode traffic |
| Runtime adapters | `src/main/runtimes/` | Versioned adapter contract, capability manifests, durable runtime identity, and DeepSeek HTTP/WebSocket integration |
| Stream transport | `src/main/stream-pipeline.ts` | SSE pipeline: per-directory delta coalescing, snapshot barriers, 33ms batched flush, heartbeat, reconnect backoff |
| Provider usage | `src/main/provider-usage.ts` | Reads opencode's stored OAuth credentials and fetches per-provider plan/rate-limit data (ChatGPT, Claude, Copilot) |
| Terminal | `src/main/terminal.ts` | `node-pty` PTY manager powering the bottom terminal tray |
| Kitty launcher | `src/main/kitty.ts` | Safe platform-aware launch of runtime TUIs in the user's Kitty window configuration |
| Packaging | `scripts/install-app.mjs` | electron-builder pack (`electron-builder.yml`) and `/Applications` install via `npm run install-app` |
| Preload bridge | `src/preload/index.ts` | `window.openshell` API exposed to the renderer |
| Renderer store | `src/renderer/src/store.tsx` | All UI state (concurrent sessions: panels + per-workspace slices); subscribes to backend events |
| Chat store | `src/renderer/src/chat-store.ts` | Authoritative per-session message/part maps (`binary.ts`); transcript projection + snapshot materialization |
| Streaming stack | `src/renderer/src/streaming.ts` + `session-activity.ts` + `assistant-status.ts` | Per-message stream lifecycle (streaming/cooldown/completed, 1Hz heartbeat), session phase, and working-summary derivation |
| Message queue | `src/renderer/src/message-queue.ts` + `messages/` | Native server-side inbox for queued follow-ups (delivery queue/steer), local failure fallback, agent mentions, synthetic-part guards |
| Renderer components | `src/renderer/src/components/` | Sidebar (Sessions/Files tabs), editor, agent panels, Kitty TUI launcher, welcome, terminal tray |
| Monaco setup | `src/renderer/src/monaco.ts` | Workers, theme, language mapping |
| Shared types | `src/shared/types.ts` | Types shared across main/preload/renderer |
| Mobile companion | `mobile/` | Self-contained bun workspace (Capacitor Android/iOS shell + web UI + server) rebranded from OpenChamber (MIT); see `mobile/README.md` |

See `docs/` for full docs: `architecture.md` (system overview),
`walkthrough.md` (guided tour of the connections), `events.md` (opencode2
event protocol), `operations.md` (run/verify/debug playbook), `main.md`,
`preload.md`, `renderer.md`, `shared.md`. Open product
requests and current priorities live in the README and repository issues.

## Architecture in one paragraph

The Electron **main process** owns runtime adapters and is the only process that
talks to OpenCode or DeepSeek Harness. OpenCode uses its discovered service and
coalesced SSE pipeline; DeepSeek launches a workspace-local `dsh web` process,
uses correlated loopback HTTP RPC plus independent WebSocket downlinks, and
maps verified native records to normalized runtime events. Every session keeps
its runtime id and capability manifest, while a durable index makes DeepSeek
sessions reopenable after restart. The **renderer** (React) keeps all UI state in one
store and renders a three-pane layout: file tree,
Monaco editor with an Edit/Diff toggle, and the streaming agent panel. Model
response events mutate an authoritative per-session message/part chat store
whose projection is the visible transcript; incomplete snapshots materialize
from the session's message history. The main
process also watches the repo with `fs.watch`; every change streams a
`{baseline, content}` update so Changes reflects files still differing from
their effective baseline. Git metadata changes refresh those baselines while
the session is active, and Diff remains available when the baseline is known.

## Conventions (follow these)

- **No code comments.** Code must be self-explanatory; put knowledge in
  `docs/` instead.
- TypeScript strict; shared shapes live in `src/shared/types.ts` and are
  imported as `@shared/types` (alias configured in the tsconfigs and
  `electron.vite.config.ts`).
- IPC channels are named `shell:*`; backend messages to the renderer are
  `{ kind: "event" | "file-update" | "session", ... }` (see
  `src/shared/types.ts`).
- OpenCode SDK calls remain isolated in `src/main/opencode.ts`; DeepSeek native
  traffic remains isolated under `src/main/runtimes/deepseek/`.
- Tree paths are relative to the session directory, always `/`-separated,
  no trailing slashes.
- Everything under `out/`, `node_modules/`, `*.tsbuildinfo` is gitignored.

## Definition of done

After any change, run `npm run check`. It runs typecheck, unit/component tests,
docs checks, and the production build. Commit buildable state; never commit a
broken build.

## Commits are the agent's job

The agent owns version control — the user should never see a dirty tree.

- Check `git status` at the start of a session and leave the tree exactly
  as you found it; if the session starts clean, it must end clean.
- Commit after each logically complete unit of work (a feature, a fix,
  its docs) rather than once at the end — but only after that unit
  passes `npm run check`.
- Include the doc/brain updates for a change in the same commit as the
  code that makes them necessary (see Docs maintenance).
- Write concise commit messages that match the repo's existing style.
- Do not commit unrelated or experimental files; never commit secrets.
- Only commit what you are confident is correct: a commit is the
  checkpoint a future session (or `git revert`) may rely on.

## Docs maintenance (the project brain)

The brain is `AGENTS.md` + `docs/`. It must never drift from the code.

- `npm run docs:check` runs the documented surface presence check in
  `scripts/check-docs.mjs`. It checks `AGENTS.md`, `README.md`,
  and every `docs/*.md` file for local Markdown link
  targets, numeric source references, and duplicate table inventory rows.
  Against source, it inventories IPC channels, `OpenShellBackend` public
  methods, the `window.openshell` contract, handled and intentionally unhandled
  event types, and shared backend message kinds.
  It also asserts the canonical package command and supported Node metadata.
  It does not prove prose or runtime behavior; tests own those invariants.
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
