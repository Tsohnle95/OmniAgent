# Repository Findings — OpenShell

**Date:** 2026-08-12
**Method:** direct inspection of the tree at `HEAD` (`83b88d0`), package
manifests, docs, scripts, and git history. Worktree was clean.

## What this is

OpenShell is a VS Code–style desktop GUI for the `opencode2` agent: an
Electron (main) + React (renderer) + Monaco (editor) app. You point it at a
repo, prompt the agent, and watch the agent stream in the right panel while
its workspace file changes appear in the middle as live red/green diffs.

## Layout

| Path | Role |
|---|---|
| `src/main/` | Electron main process: all opencode2 API traffic (`opencode.ts`, 1706 lines), window + IPC wiring (`index.ts`, 758), provider usage/rate limits (`provider-usage.ts`), fs watching, baselines, terminal PTY, workspace security, operation coordinator, trash |
| `src/preload/` | Narrow `window.openshell` bridge (`index.ts`, 94) |
| `src/renderer/` | React UI: `store.tsx` (1494) is the single state hub; components include `AgentPanel.tsx` (1148), `OpenCodeTimeline.tsx` (903), `FileSidebar.tsx`, `EditorPane.tsx`, `TerminalTray.tsx`, `Welcome.tsx`, etc.; SCSS under `styles/` |
| `src/shared/` | Shared types (`types.ts`, 326), retention, generation, URL policy |
| `docs/` | The "project brain": `architecture.md`, `walkthrough.md`, `events.md`, `operations.md`, plus per-module `main/preload/renderer/shared.md`; a `docs:check` script verifies documented surface matches code |
| `scripts/` | `launch.mjs` (dev/preview launcher), `check-docs.mjs`, `configure-node-pty.mjs`, smoke scripts (PTY, electron-pty, electron-trust), `make-dev-app.mjs` |
| `dev/` | Gitignored macOS dev app bundle (Electron.app copy) |
| `out/` | Gitignored build output |
| `.github/workflows/check.yml` | CI: `npm run check` on push/PR plus a 3-OS platform-smoke matrix |

## Tech stack (package.json)

- Electron ^37, React 19, Monaco 0.53, Vite 6 + electron-vite 4, Vitest 3 (jsdom)
- `@opencode-ai/client` pinned to prerelease `0.0.0-next-17126` — API isolated to `src/main/opencode.ts` by convention
- `node-pty` + xterm.js for the bottom terminal tray
- Node engine: `>=22.23.2 <23` (`.node-version`)

## Commands

`npm run dev` (launcher + HMR), `npm run check` (typecheck + tests + docs:check + build), `npm test`, `npm run build` / `npm start`, `npm run docs:check`.

## Conventions / house rules (AGENTS.md)

- No code comments; knowledge lives in `docs/`
- TypeScript strict; shared shapes via `@shared/types`
- IPC channels `shell:*`; backend→renderer messages are `{kind: "event" | "file-update" | "session", ...}`
- The agent owns version control: commit after each unit of work that passes `npm run check`; `docs:check` keeps docs tables in sync with code
- `docs:check` inventories IPC channels, `OpenShellBackend` methods, the `window.openshell` contract, handled/ignored event types, and message kinds

## Notable architecture points

- Three-process flow: main ↔ opencode2 service (SSE via `client.event.subscribe`), forwarded over IPC to the renderer store, which renders the streamed timeline; events batched/coalesced at 16ms, reduced per session id.
- Diffs: main watches the repo (`fs.watch`); structured tool paths snapshotted as baselines before execution, Git `HEAD` used for first-observed shell/external changes, non-git unknown baselines labeled explicitly.
- Durable recovery: interrupted saves/renames keep original + proposed artifacts with Open/Acknowledge actions.
- Session history: recent sessions on Welcome, reopening replays transcript and resumes context; last-used model persisted.
- Renderer keeps a large custom reducer; includes a large-session performance test and acceptance budgets.

## Testing posture

Extensive Vitest suite co-located with source: unit (main-process state machines like operation coordinator, watcher phases, replay retention), component tests in jsdom (agent panel, sidebar rename, recovery notice, terminal tray), security tests, IPC schema tests, platform tests (`scripts/launch.test.ts`, terminal tests, PTY/electron smoke scripts). Tests are a documented verification gate; several earlier audit findings flagged missing tests for state machines.

## Git history (recent)

Single `main` branch, remote `origin/main`. Recent work: launch lifecycle repair (`83b88d0`), initial refactor (`24065f3`), recovery reconciliation, durable filesystem recovery, performance budget stabilization, mutation-race prevention, trust lifecycle smoke, watcher/activation coverage. Commits are frequent and follow the docs-sync convention.

## Existing root-level reports (note)

Three prior audit/investigation reports already sit in the root and overlap this file's scope:

- `findings.md` — full repo audit (18 numbered findings; critical: unguarded renderer navigation exposing the privileged preload API, unbound delayed editor writes; high: filesystem IPC confinement, save/external-update races, watcher cross-workspace work, baseline erasure, timeline chronology)
- `findings2.md` — review of `findings.md`; verdict "substantially accurate, not fully": 10/18 accurate, 7 partially accurate or overstated (Electron 37 sandboxing, severity inflation), 1 architectural concern
- `updated-findings.md` — investigation of a black-screen/immediate-exit launch pathology after the refactor (not reproduced in clean state)

All three were written 2026-08-12 against earlier commits (`35fd176`, `24065f3`); they predate the current `HEAD` `83b88d0`. Nothing else was out of place: gitignore covers `node_modules/`, `out/`, `dev/`, logs, and tsbuildinfo.
