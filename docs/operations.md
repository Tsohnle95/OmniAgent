# Operations: running, verifying, and debugging

Practical know-how for running the app, smoke-testing it, and debugging
renderer/main behavior without guessing. Everything here has been used
and verified in real sessions.

## Prerequisites

- Node 22.23.2 and npm. `.node-version`, `package.json` engines, and CI select
  the supported Node 22 range starting at 22.23.2, which satisfies the full
  locked dependency graph.
- `opencode2` on PATH (checked with `which opencode2`). The app connects
  via `Service.discover()` and falls back to spawning
  `opencode2 serve --service` itself, so a service is not strictly
  required to be running beforehand.

## Running

```sh
npm run dev      # electron-vite dev with HMR (main/preload/renderer)
npm test         # Vitest unit/component tests in jsdom
npm run test:platform # launcher tests and real Electron-hosted PTY smoke
npm run build    # production build -> out/
npm run check    # typecheck, tests, docs check, and production build
npm start        # launch the existing production build with electron-vite preview
```

`npm start` does not build first; run `npm run build` after source changes. The
portable Node launcher prepares and selects the branded app bundle on macOS and
uses plain Electron on Linux and Windows, without shell-specific environment
syntax. After a manual build you can also launch with `npx electron .`.
`npm run test:platform` also runs the hidden-window renderer trust smoke on
macOS. Linux and Windows run the launcher and Electron PTY coverage but skip the
GUI smoke because a normal `BrowserWindow` requires a display there; macOS CI is
the targeted GUI lifecycle host. The trust smoke uses the built main process,
bundled preload, local packaged renderer, and a local `data:` document. It
checks trusted IPC, same-frame external navigation denial, popup denial, and
untrusted-document IPC rejection without external network access. `npm run typecheck`
runs `tsc --noEmit` for both node and web configs. `npm run check` is the
canonical local and CI verification gate.

OpenShell is macOS-first with supported development/runtime launch on macOS,
Linux, and Windows. CI runs launcher configuration tests and a real
Electron-hosted `node-pty` input/output/exit smoke on all three. This verifies
the native module and shell path but is not a GUI smoke test; window behavior
still requires the human checklist below. Terminals use the user's normal
interactive shell (`SHELL`, `COMSPEC`, or the platform default), not login mode.
This matches integrated-terminal expectations and avoids re-running login
session initialization for every tab. `node-pty` 1.1.0 uses Node-API, and the
Electron-hosted smoke verifies the locked binary directly, so no
`@electron/rebuild` lifecycle is required. The portable `postinstall` only
restores execute permission on node-pty's packaged Unix `spawn-helper`, which
the npm tarball does not preserve; it does not compile or rebuild the addon.

## Updating the OpenCode client

`@opencode-ai/client` is pinned to an exact prerelease and `package-lock.json`
is tracked. Update it only in an explicit dependency commit:

1. Run `npm install --save-exact @opencode-ai/client@<version>` on the supported
   Node version and review that the lockfile changes only the intended client,
   protocol, schema, and necessary transitive packages.
2. Review generated client method signatures used by `src/main/opencode.ts`
   and service discovery/authentication imports. Adapt that isolation boundary
   deliberately rather than bypassing types.
3. Review protocol event changes against `docs/events.md` and the replay/event
   fixtures in the main and renderer tests. Add or update captured protocol
   fixtures for every changed event shape, including handled and intentionally
   ignored events.
4. Run `npm run check` and `npm run test:platform`. Exercise the human GUI smoke
   checklist when service or streaming behavior changed.

## Large-session benchmark

Run the deterministic renderer fixture independently with:

```sh
npx vitest run src/renderer/src/large-session.performance.test.ts --reporter=verbose
```

The JSON lines report reducer/update latency, derived timeline latency, an
estimated timeline-row proxy, retained output characters, and actual React/jsdom
rendering for 2,400 fixed events. On 2026-08-12,
before retention changes, the fixture measured 11.79 ms, 0.64 ms, 800 rows, and
26,214,400 retained characters. With retention enabled it measured 11.42 ms,
0.45 ms, 800 rows, and 3,276,800 retained characters. The test performs one
warmup and gates the median of five measured runs, reducing scheduler and JIT
noise seen in the full suite. Its deliberately generous CI budgets are a
100 ms median reducer/update time and 10 ms median derivation time. The
structural proxy budgets are at most 1,000 estimated rows and 8 KiB per completed
tool/shell result. The representative 400-turn timeline produces 800 actual
`data-timeline-row` DOM nodes. Its deliberately generous 5,000 ms budget covers
React reconciliation and jsdom DOM construction and is intended to catch gross
regressions without becoming machine-speed flaky. It explicitly does not
measure Chromium layout, paint, compositor work, or browser memory.
Compare trends using the same Node version and machine rather than treating the
median or jsdom timing as a cross-machine browser benchmark.

## Smoke test checklist

1. `which opencode2` — binary present.
2. `npm run build && npm start` with output captured to a log:
   `nohup npm start > /tmp/openshell-smoke.log 2>&1 &`
3. After ~10s check the log for `[openshell]` console.error lines
   (`[openshell] event loop error:` means the SSE subscription failed).
4. Verify the backend spawned its service:
   `pgrep -fl "opencode2 serve"` and
   `lsof -nP -iTCP -sTCP:LISTEN | grep -i opencode`.
5. On macOS, verify the Electron window is alive:
   `pgrep -f "OpenShell.app/Contents/MacOS/Electron"`. Use Task Manager or the
   platform process monitor on Windows/Linux.
6. GUI pass (needs a human): open a folder, send a prompt, confirm the
   agent dot turns green / titlebar says "working", text streams, tool
   cards appear with names and elapsed timers, and a file the agent
   touches shows a diff.

## Manual recovery

OpenShell stores save and file-rename transactions in
`<workspace>/.openshell-recovery/`. Explorer and file watching intentionally
hide this directory. Each transaction contains `manifest.json` plus one or more
artifacts named `original`, `temporary`, `proposed`, or `source`. Existing
artifacts are never removed automatically.

1. Use the recovery notice's Open action to inspect each artifact.
2. Compare `originalPath`, the current canonical file, and the artifact before
   manually copying any bytes.
3. Use Acknowledge when review is complete. This updates `manifest.json` and
   hides the notice; it does not delete the artifact or directory.
4. If the UI cannot open the workspace, inspect the transaction directories
   directly. Do not remove them until applications that may retain old file
   descriptors have exited and the bytes have been reviewed.

Activation may hard-link a held original back to a missing canonical path only
for an interrupted `source-held` or `held-validated` transaction, where
OpenShell is known to have removed that path. It never overwrites an existing
path and never replays completed, failed, or acknowledged history. If both
canonical and recovery versions exist, manual comparison is required. Normal
successful transactions retain their bytes but are acknowledged automatically,
so they do not create persistent recovery notices.

## Driving the renderer headlessly (CDP)

The UI can be inspected and driven over the Chrome DevTools Protocol.
Launch with a debug port, then evaluate JavaScript in the page:

```sh
npx electron . --remote-debugging-port=9222
curl -s http://127.0.0.1:9222/json/list   # find the page target + ws url
```

Node script pattern (Node 22 has a global `WebSocket`):

```js
const page = (await (await fetch("http://127.0.0.1:9222/json/list")).json())
  .find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
// send { id, method: "Runtime.evaluate", params: { expression, awaitPromise, returnByValue } }
// then read the matching { id } response from ws.onmessage
```

Useful expressions:

- `document.querySelectorAll('.agent-model option').length` — model dropdown state
- `window.openshell.openSession("/path/to/repo").then(JSON.stringify)` — open a session
  without clicking (the store reacts to the emitted `session` message)
- `getComputedStyle(...)`, `document.querySelector('.tree-row').innerText`,
  `[...document.querySelectorAll('.toast')].map(t => t.textContent)` — UI state checks

Caveat: `npm start` (electron-vite preview) does NOT forward
`--remote-debugging-port`; use `npx electron .` on the built output, or
`npm run dev` and attach to its window.

## Probing the opencode2 service directly

The service speaks JSON HTTP on a localhost port. Useful when the client
call "should work" but something fails — probe the raw API.

- Port: `lsof -nP -iTCP -sTCP:LISTEN | grep opencode2` (the `opencode2
  serve --service` process).
- Registration file: `~/.config/opencode/service.json` holds `password`.
- Auth: HTTP Basic, username `opencode`:
  `Authorization: "Basic " + btoa("opencode:" + password)`.
- Endpoints: `GET /api/model`, `GET /api/model/default`,
  `GET /api/fs/list?<query>`.
- **Query-serialization gotcha**: nested params use bracket notation —
  `location[directory]=/Users/ty/openshell`. A JSON-stringified
  `location={"directory":...}` is rejected with
  `Expected object | undefined, got string at ["location"]`. The
  `@opencode-ai/client` does this correctly itself
  (`appendQuery` in its generated code) — this only bites hand-rolled
  requests.

The client package can't be imported directly in plain Node ESM (it
emits extensionless imports for a bundler); probe with `fetch` instead.

## Known quirks worth remembering

- `model.list` / `model.default` accept an optional `location`; the app
  passes the session directory. Both work with 63 models enabled on the
  stock setup.
- The model dropdown only renders while a session is open (it gates on
  `session && models.length > 0`); it seeds `currentModel` from
  `model.default()` and live-updates from `session.model.selected`.
- Directory entries from `GET /api/fs/list` come with trailing slashes
  (`"src/"`); the backend normalizes them in `listDir` — the renderer
  must never receive raw entries.
- The renderer shows the Welcome screen on app launch (no session until a
  folder is opened); most agent-panel UI is session-gated.
- `session.tool.called` events carry NO tool name — names come from
  `session.tool.input.started` (see `docs/events.md`).
