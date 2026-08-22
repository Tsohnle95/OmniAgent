# Updated Findings — Black Screen on Launch / App Exits Immediately

**Date:** 2026-08-12
**Scope:** Analysis of the launch pathology reported after the architectural
refactor. Baseline: commit `35fd176` (last known-good), HEAD: `24065f3`.

## Reported symptoms

1. Launching the app shows a black window.
2. The terminal shows the Vite dev server starting, then `start electron app...`,
   followed immediately by the shell exiting (`Process completed`) with no error
   output.
3. Notably, when the same HEAD was launched in a clean state during this
   investigation, the UI rendered correctly (the user confirmed this on screen).

## Verification of what works at HEAD

Before attributing the symptoms, the refactor's core surface was verified working:

| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm test` (30 files, 138 tests) | all pass |
| `npm run build` + `npm start` (preview) | builds; window renders Welcome UI |
| `OPENSHELL_TRUST_SMOKE=1` in real Electron | passes: `{"trustedIpc":true,"navigationDenied":true,"popupDenied":true,"untrustedIpcRejected":true}` |
| Clean `npm run dev` single instance | main process stays alive; window renders Welcome UI (verified via window screenshot pixel analysis — theme colors present, not solid black) |
| Main/preload IPC contract (`src/main/index.ts` ↔ `src/preload/index.ts`) | signatures consistent; typecheck + trust smoke cover it |

Conclusion: the refactor's IPC trust boundary, preload bridge, and renderer
store are **not** observably broken in a clean launch. The refactor is not the
direct source of the reported black screen in a single-instance, clean run.

## Root cause chain (reproduced at HEAD)

The reported experience is produced by a chain of three interacting behaviors.
All were reproduced exactly at HEAD during this investigation.

### 1. A second launch exits silently and instantly (reproduced)

`src/main/index.ts:668-670`:

```ts
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
```

When any OmniAgent instance already holds the single-instance lock (same
`userData` dir: `~/Library/Application Support/openshell`), every new launch
quits with **zero output** and exit code 0. Reproduced:

- Run instance A (`npm run dev`) → stays alive.
- Run instance B → Vite reports `Port 5173 is in use, trying another one...`,
  prints `start electron app...`, then the whole process completes silently.

This matches the user's terminal output byte-for-byte (including the port bump
to 5174 and the absence of any message between `start electron app...` and the
shell exit). The lock check happens at module load, before any logging exists,
so there is no diagnostic at all.

The same silent-quit design existed at `35fd176` (lines 505-507), so this is a
pre-existing UX flaw the refactor neither introduced nor fixed — but it is the
mechanism that turns every subsequent launch into an instant no-op.

### 2. The first instance survives as an invisible/black zombie (reproduced)

On macOS the app never quits when its window closes or when its renderer dies:

- `src/main/index.ts:728-730`: `window-all-closed` only calls `app.quit()` on
  non-darwin platforms.
- There is no `render-process-gone` or `unresponsive` handler on the real
  window (the only `did-fail-load` listener, `src/main/index.ts:448`, exists
  solely inside the `OPENSHELL_TRUST_SMOKE=1` test path);
  `src/main/index.ts:671-676` only logs `uncaughtException`/`unhandledRejection`
  and keeps running.
- The renderer has **no error boundary** — `src/renderer/src/main.tsx:7` mounts
  `<App />` directly. Any uncaught renderer exception unmounts the React tree,
  leaving a window showing only its background.
- The background is near-black by design: `backgroundColor: "#161410"`
  (`src/main/index.ts:281`) and `body { background: #111114 }`
  (`src/renderer/src/styles/_foundation.scss`) — so a failed/unmounted renderer
  is indistinguishable from a black screen.
- Renderer console output is not piped to the terminal in dev (no
  `ELECTRON_ENABLE_LOGGING`), so a renderer crash leaves no visible trace.

Reproduced end-to-end:

- Launched instance A, closed its window via the macOS close button.
  Main process **remained alive** (confirmed via `ps`).
- Launched instance B → exited silently (finding 1).
- The `second-instance` handler (`src/main/index.ts:678-685`) fired in the
  zombie and **recreated its window** (`if (!win) { createWindow(); }`),
  so the user sees the zombie's window — black if its renderer failed.

Result: a user who experiences one bad first run (renderer crash or blank
paint) is trapped in a loop: every launch "starts and closes immediately" in
the terminal while the (black) zombie window stays or reappears on screen.

### 3. First paint can legitimately look like a black screen (contributing)

The window is shown before the renderer paints:

- `src/main/index.ts:270-286`: `createWindow(show = true)` constructs the
  window with `show` and the dark `backgroundColor`, then loads the URL
  (`loadURL` at line 440) — the window is visible before the renderer paints.
- The production renderer bundle is ~8.7 MB (`out/renderer/assets/index-*.js`,
  largely Monaco). On a cold dev server, Vite must transform all of it before
  the first paint — seconds of a plain dark window on a healthy launch,
  minutes on a loaded machine.

This makes a fresh instance look dead/black even when nothing is wrong, and
invites the user to close the window — which, per finding 2, creates the
zombie that then poisons all subsequent launches via finding 1.

## What was ruled out

- The 12:48 PM `opencode2 serve --service` process seen during the incident is
  the user's own opencode2 CLI child process (`ps -o ppid` → their terminal
  process), not an OmniAgent spawn.
- The trust/IPC refactor: verified working by the Electron trust smoke and by
  a live window probe.
- Build/test/typecheck breakage: all pass at HEAD; the tree is clean.

## Recommended fixes (for the fix session)

Priority order:

1. **Make the lock-conflict launch visible and useful** (`src/main/index.ts`):
   log a clear line (e.g., "OmniAgent is already running — activating the
   existing window") before `app.quit()`; rely on the existing
   `second-instance` handler to foreground the running instance. Optionally
   show a native dialog. This alone turns "Process completed" from an
   inexplicable failure into a normal outcome.
2. **Quit or recover the zombie**:
   - Add a `render-process-gone` handler that logs and recreates/quits the
     window instead of silently holding a dead webContents.
   - Consider quitting on `window-all-closed` on macOS too (or explicitly
     managing the activate flow), since this app has no tray/menu-bar
     functionality that justifies living without a window.
3. **Surface renderer failures**:
   - Add a minimal React error boundary in `src/renderer/src/main.tsx` that
     paints a visible error state instead of a black window.
   - Pipe renderer console to the terminal in dev (set
     `ELECTRON_ENABLE_LOGGING=1` in `scripts/launch.mjs` dev path, or wire
     `webContents.on("console-message")`).
4. **Stop showing a black window before first paint**: use
   `show: false` + `ready-to-show` (with a small timeout fallback), or keep the
   current show but with a visible "loading" state — the `#161410` background
   makes "still loading" indistinguishable from "dead".
5. **Optional hardening**: on the lock path, write the event to the userData
   log so future support sessions can see it happened.

None of these changes the verified-correct IPC/trust architecture; they are
all additive diagnostics/lifecycle fixes in the window/startup path.
