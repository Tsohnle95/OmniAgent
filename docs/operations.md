# Operations: running, verifying, and debugging

Practical know-how for running the app, smoke-testing it, and debugging
renderer/main behavior without guessing. Everything here has been used
and verified in real sessions.

## Prerequisites

- Node 20+ and npm.
- `opencode2` on PATH (checked with `which opencode2`). The app connects
  via `Service.discover()` and falls back to spawning
  `opencode2 serve --service` itself, so a service is not strictly
  required to be running beforehand.

## Running

```sh
npm run dev      # electron-vite dev with HMR (main/preload/renderer)
npm run build    # production build -> out/
npm start        # electron-vite preview (rebuilds, then launches)
```

`npm start` rebuilds every time; after a manual `npm run build` you can
launch straight from the build with `npx electron .`. `npm run typecheck`
runs `tsc --noEmit` for both node and web configs.

## Smoke test checklist

1. `which opencode2` — binary present.
2. `npm run build && npm start` with output captured to a log:
   `nohup npm start > /tmp/openshell-smoke.log 2>&1 &`
3. After ~10s check the log for `[openshell]` console.error lines
   (`[openshell] event loop error:` means the SSE subscription failed).
4. Verify the backend spawned its service:
   `pgrep -fl "opencode2 serve"` and
   `lsof -nP -iTCP -sTCP:LISTEN | grep -i opencode`.
5. Verify the Electron window is alive: `pgrep -f "Electron.app/Contents/MacOS/Electron"`.
6. GUI pass (needs a human): open a folder, send a prompt, confirm the
   agent dot turns green / titlebar says "working", text streams, tool
   cards appear with names and elapsed timers, and a file the agent
   touches shows a diff.

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
