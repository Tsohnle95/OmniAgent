# OpenShell Engineering Fix List

This document is the implementation-ready consolidation of the accurate findings from `findings.md` after verification in `findings2.md`. It excludes disproven claims, corrects overstated severity and rationale, and includes material defects missed by the original audit.

## Priority 0: Security and data integrity

### 1. Lock the renderer to trusted content

**Problem**

- Model-controlled Markdown renders ordinary same-frame links (`src/renderer/src/components/OpenCodeTimeline.tsx`).
- The BrowserWindow blocks new windows but does not block same-frame navigation or redirects (`src/main/index.ts`).
- The configured preload exposes `window.openshell` to each loaded document (`src/preload/index.ts`).
- IPC handlers do not validate the sender WebContents, frame, or URL (`src/main/index.ts`).
- A user click can navigate the privileged window to attacker-controlled content, which can then invoke filesystem, prompt, session, permission, and terminal capabilities.

**Fix**

- Deny every main-frame navigation and redirect except the exact packaged application URL or approved development origin.
- Render Markdown links through a controlled anchor component that prevents in-app navigation.
- Validate IPC sender ownership, main-frame identity, and trusted URL for every privileged handler.
- Set `sandbox: true` explicitly to document and preserve the existing Electron 37 default, but do not treat this as the primary fix.
- Add Electron integration tests covering same-frame links, redirects, popups, subframes, invalid origins, and IPC from untrusted frames.

### 2. Validate external URLs before `shell.openExternal`

**Problem**

- `setWindowOpenHandler` passes every renderer-controlled URL directly to `shell.openExternal` (`src/main/index.ts`).
- Attacker-selected custom schemes can invoke unsafe operating-system protocol handlers.

**Fix**

- Parse and allowlist external URLs before calling `shell.openExternal`.
- Permit only intentionally supported schemes, normally `https:`.
- Define separate, narrowly scoped behavior if local file links are required.
- Reject malformed URLs, credentials, unexpected schemes, and other unsupported targets.
- Test Markdown links and tool attachment links with safe and unsafe schemes.

### 3. Make editor saves workspace- and revision-safe

**Problem**

- `doSave` reads tab content from a stale React render closure (`src/renderer/src/store.tsx`).
- Autosave can write an older editor revision and then mark newer in-memory content clean.
- Save timers survive workspace reset, tab close, delete, and rename (`store.tsx`).
- Main resolves delayed relative writes against whichever workspace is active when the write executes (`src/main/opencode.ts`).
- A timer created in repository A can write A's content to the same relative path in repository B.
- In-flight older and newer saves are not ordered.

**Fix**

- Assign an immutable generation or workspace ID to every activation.
- Assign a monotonically increasing content revision to every tab edit.
- Send the exact content, workspace ID, path, and revision with every write.
- Reject writes in main when the expected workspace ID is no longer active.
- Serialize writes per workspace/file or otherwise prevent an older write from completing after a newer write.
- Clear `dirty` only when the completed workspace, path, and revision still match the current tab.
- Cancel pending timers on reset, workspace switch, tab close, delete, and unmount.
- Cancel or deliberately migrate timers and revision state on rename.
- Remove stale `expectedRef` entries during the same lifecycle operations.
- Test latest-keystroke persistence, reverse completion order, manual save versus autosave, close, rename, delete, and workspace switching.

### 4. Prevent saves from overwriting detected external changes

**Problem**

- A file update marks a dirty tab stale but does not cancel or block its pending save (`src/renderer/src/store.tsx`).
- `doSave` ignores stale state and writes unconditionally (`store.tsx`).
- Main does not compare expected disk state before writing (`src/main/opencode.ts`).
- The save can overwrite agent, user, formatter, or external-editor work and then clear the warning.

**Fix**

- Cancel saves that have not started when an unexpected update reaches a dirty tab.
- Block normal saves for a conflicted tab until the user chooses reload, overwrite, or merge.
- Ensure an already-started save cannot silently resolve a newly detected conflict.
- If versioned disk writes are introduced, reject stale versions rather than using a non-atomic read-then-write check.
- Test external updates before timer firing, during an in-flight write, and before save completion.

### 5. Confine filesystem capabilities to the active workspace

**Problem**

- Absolute file reads are unrestricted (`src/main/opencode.ts`).
- `writeFile` accepts absolute paths and parent traversal because it does not call `safeRel` (`opencode.ts`).
- `safeRel` is lexical and intermediate symlinked directories can escape the root for create, delete, or rename (`opencode.ts`).
- IPC argument types, sizes, and workspace identity are not validated at runtime (`src/main/index.ts`).

**Fix**

- Separate ordinary workspace-relative reads from the privileged source-view operation used for OpenShell/DevTools files.
- Reject absolute paths, empty paths, parent traversal, invalid separators, and oversized values on workspace APIs.
- Canonicalize the workspace root and validate existing targets or nearest existing parents immediately around each operation.
- Establish and enforce an explicit symlink policy, including intermediate symlinks.
- Bind every filesystem operation to the expected workspace generation.
- Validate content size and argument shape at the IPC boundary.
- Add traversal, absolute-path, symlinked-parent, stale-workspace, malformed-input, and oversized-payload tests.

### 6. Validate and bind terminal capabilities

**Problem**

- Terminal start accepts an arbitrary renderer-provided cwd (`src/main/index.ts`, `src/main/terminal.ts`).
- Terminal input, IDs, and dimensions are not runtime-validated (`src/main/index.ts`).
- These capabilities become especially dangerous if the renderer trust boundary is crossed.

**Fix**

- Validate sender and workspace identity for terminal operations.
- Use the active workspace directory in main rather than trusting an arbitrary renderer cwd, unless an explicit external-cwd feature is required.
- Validate terminal IDs, input size, and positive bounded rows/columns.
- Test stale workspace IDs, unknown PTYs, invalid dimensions, and oversized input.

## Priority 1: Session and watcher correctness

### 7. Serialize session activation and reject stale completions

**Problem**

- Main has one mutable active `sessionID` and `directory` (`src/main/opencode.ts`).
- `openSessionById` activates a session before message history finishes loading (`opencode.ts`).
- Overlapping activation requests can leave main on one session while renderer displays another (`src/renderer/src/store.tsx`).
- Startup restoration can complete after a user action (`store.tsx`).
- File, tree, model, agent, and selection requests can install stale responses.

**Fix**

- Assign activation generations when requests are accepted.
- Define request ordering explicitly, preferably latest-request-wins.
- Serialize or cancel backend activation work as appropriate.
- Have renderer and main discard stale activation completions.
- Carry expected session/workspace identity on all mutations and reject mismatches.
- Carry generation identity on session and file-update messages.
- Guard file, tree, model, agent, and selection responses before applying them.
- Test overlapping new-session, reopen, child-session, and startup-restoration requests with deferred promises.

### 8. Prevent watcher work from crossing workspace generations

**Problem**

- An already-running `onFsChanged` survives watcher shutdown (`src/main/opencode.ts`).
- It performs asynchronous work while helpers and maps consult mutable `this.directory` and shared active maps (`opencode.ts`).
- Work originating in repository A can mutate repository B's baseline maps and emit an A file using a path relative to B.
- Renderer accepts file updates without workspace/generation validation (`src/renderer/src/store.tsx`).

**Fix**

- Capture root, session ID, generation, and workspace-scoped maps when scheduling watcher work.
- Pass the captured root to all path and Git helpers.
- Check generation after every relevant await and before mutating maps or emitting.
- Include generation/session identity in file-update messages.
- Discard stale file updates in renderer.
- Test switching workspaces during stat, read, Git lookup, deletion handling, and emission.

### 9. Make backend event-loop startup idempotent

**Problem**

- Initial readiness calls `backend.start()` and launches `runEventLoop()` (`src/main/index.ts`, `src/main/opencode.ts`).
- Closing the last window on macOS does not stop that loop.
- Dock reactivation calls `backend.start()` again (`src/main/index.ts`).
- `start()` has no running-loop guard, so every reactivation can create another SSE subscription and duplicate events, side effects, reconnect attempts, and resource use.

**Fix**

- Track the running loop promise or cancellation controller.
- Make `start()` a no-op while a loop is active.
- Make `stop()` cancel and await loop termination when necessary.
- Ensure reconnection cannot create parallel subscriptions.
- Correct docs that describe the current implementation as safely restartable.
- Test repeated close/reactivate cycles and assert one subscription and one forwarded event.

### 10. Implement or remove the documented editor/watcher echo dedupe

**Problem**

- Docs say file updates consult `expectedRef` to recognize editor write echoes.
- Source does not compare file-update content to `expectedRef`; any update while dirty marks the tab stale (`src/renderer/src/store.tsx`).
- Save completion may quickly clear the warning, masking the mismatch.

**Fix**

- Integrate echo identity with the revisioned save protocol rather than relying only on content equality.
- Distinguish a confirmed echo of the current write from a genuine external update.
- Keep conflict handling active for updates that do not match the in-flight revision.
- Update documentation to describe the implemented mechanism exactly.

## Priority 2: Diff and timeline semantics

### 11. Define and implement one baseline/provenance policy

**Problem**

- Editor saves replace both backend and tab baselines (`src/main/opencode.ts`, `src/renderer/src/store.tsx`).
- This makes the visible accumulated diff disappear after save.
- Documentation disagrees: some files define baseline as session-start/agent-start content, while `docs/walkthrough.md` says editor writes intentionally reset it.
- Actual baselines can be pre-tool content, Git `HEAD`, first-observed non-git content, or empty content for a newly created file.
- One mutable baseline cannot both preserve all session changes and subtract arbitrary interleaved user edits.

**Fix**

- Choose and document one product definition:
- Option A: observed workspace changes during the active session. Preserve each file's first established baseline through editor saves.
- Option B: agent-attributed changes. Introduce explicit provenance/change tracking rather than attempting attribution with one mutable baseline.
- Represent unknown baseline explicitly rather than setting it equal to post-change content.
- Ensure save completion updates persisted/current content without accidentally changing the chosen baseline invariant.
- Add baseline lifecycle tests for open, tool edit, shell edit, editor save, create, delete, rename, Git, and non-git workspaces.

### 12. Correct non-git shell baselines and attribution claims

**Problem**

- Tool snapshotting recognizes structured `filePath`, `file_path`, or `path` values but does not infer paths from shell command strings (`src/main/opencode.ts`).
- In non-git workspaces, the first content observed after a shell modification becomes the baseline, yielding an empty diff (`opencode.ts`).
- The watcher has no actor provenance, so user, formatter, IDE, and other process changes enter the same Changes list (`src/renderer/src/store.tsx`).
- Git `HEAD` provides a useful comparison but does not prove who made a working-tree change.

**Fix**

- Stop claiming that Changes/Diff is “exactly what the agent changed” unless real provenance is implemented.
- If observed-change semantics are selected, document Git, non-git, skipped-path, and first-observation limitations.
- If strict attribution is selected, establish explicit execution/change correlation and pre-change capture; acknowledge that concurrent external edits still require conflict handling.
- Show an unknown-baseline state when pre-change content cannot be recovered.

### 13. Preserve chronological timeline order

**Problem**

- `buildTurns` preserves body order, but rendering groups every assistant item before every non-assistant event (`src/renderer/src/components/OpenCodeTimeline.tsx`).
- Interleaved shell, compaction, synthetic, skill, status, or divider events are displayed after later assistant content.

**Fix**

- Walk `turn.body` in order.
- Group only contiguous assistant runs where cross-message tool grouping is needed.
- Do not group across intervening semantic events.
- Add DOM-order tests for assistant/event/assistant combinations across every event type.

## Priority 3: Destructive operations and terminal lifecycle

### 14. Remove silent permanent-delete fallback

**Problem**

- Every `shell.trashItem` failure falls back to recursive forced deletion (`src/main/opencode.ts`).
- The UI cannot distinguish recoverable Trash from permanent deletion or request confirmation.

**Fix**

- Propagate Trash failures to the renderer.
- Do not automatically invoke recursive deletion.
- If permanent deletion is required, expose it as a separate confined API and require explicit confirmation showing the exact target.
- Preserve and display the original Trash error.
- Test successful Trash, failed Trash, files, directories, symlink policy, and permanent-delete confirmation.

### 15. Fix terminal tab and process lifecycle

**Problem**

- Closing the final terminal returns before committing the empty tab state (`src/renderer/src/components/TerminalTray.tsx`).
- Reopening the hidden but mounted tray shows a dead terminal.
- Natural `terminal-exit` messages are emitted by main but ignored by renderer (`src/main/terminal.ts`, `TerminalTray.tsx`).
- Output for unregistered or stale IDs is buffered without a size or age limit (`TerminalTray.tsx`).

**Fix**

- Commit `terms` and `activeId` before hiding the tray after the final close.
- Handle `terminal-exit` by removing the tab, writer, and buffer and selecting a neighboring tab.
- Buffer output only for IDs known to be awaiting registration.
- Cap buffered bytes/chunks and discard stale buffers.
- Define whether reopening an empty tray shows an empty state or automatically creates a terminal.
- Test final close, natural exit, startup output, stale IDs, session restart, and buffer limits.

## Priority 4: Automated verification and performance safeguards

### 16. Add automated tests for core state machines

**Problem**

- No test/spec files, framework configuration, or `test` script exist.
- CI covers only typecheck, docs checks, and build.
- Runtime ordering, trust boundaries, path safety, reducer behavior, watcher generations, terminal lifecycle, and save semantics are unprotected.

**Fix**

- Add a fast unit/integration test runner and `npm test` script.
- Prioritize reducer/replay fixtures and terminal-state monotonicity.
- Add fake-timer and deferred-promise tests for autosave and activation races.
- Add filesystem confinement and symlink tests.
- Add watcher generation and baseline lifecycle tests.
- Add timeline DOM-order and terminal component tests.
- Add Electron trust-boundary/navigation/IPC smoke tests.
- Run the appropriate test layers in CI.

### 17. Establish bounded state and measure long-session performance

**Problem**

- Tool and shell output is retained in full even when presentation truncates it.
- Transcript updates repeatedly scan/map arrays.
- The active timeline renders the full transcript without virtualization.
- Reopened/child session streams and session usage have incomplete retention policies.
- One broad context exposes high- and low-frequency state together.

**Fix**

- Create a repeatable large-session benchmark before broad refactoring.
- Measure update latency, render latency, DOM size, and retained memory.
- Define caps or summarization for retained tool/shell output.
- Define retention/eviction for inactive session streams and usage records.
- Index hot assistant/tool updates if measurements show reducer cost is material.
- Split high-frequency stream state from low-frequency workspace/UI state if measurements justify it.
- Virtualize older turns only if measured DOM/render cost warrants it.

## Priority 5: Development, dependency, and quality workflows

### 18. Make the canonical local check match CI and documentation

**Problem**

- README says `npm run build` includes typecheck, but the script only builds (`README.md`, `package.json`).
- `npm run check` omits build (`package.json`).
- CI currently does run all three existing definition-of-done gates: typecheck, docs check, and build (`.github/workflows/check.yml`).
- There are no test or lint/format gates.

**Fix**

- Define one canonical local command that runs typecheck, tests, docs checks, and build, plus lint/format if adopted.
- Make README and AGENTS point to that command.
- Keep CI aligned with the canonical command or its clearly equivalent steps.
- Do not state that current CI misses the existing AGENTS gates; extend those gates deliberately as tests and other checks are added.

### 19. Define supported platforms and make launch scripts match

**Problem**

- `dev` and `start` use POSIX environment syntax and a macOS-only executable path (`package.json`).
- The helper exits on non-macOS but the calling command still sets that macOS path (`scripts/make-dev-app.mjs`).
- Default Windows npm shells cannot parse the inline assignment.
- Documentation presents the commands without a platform limitation.

**Fix**

- Declare whether support is macOS-only, macOS-first, or cross-platform.
- If cross-platform, use a Node launcher that selects the custom bundle only on Darwin and plain Electron elsewhere.
- Avoid shell-specific inline environment syntax.
- Add launch smoke tests on every supported platform.
- Correct README and operations documentation.

### 20. Correct terminal shell and native-module documentation/workflow

**Problem**

- The PTY discovers a shell through a login invocation but spawns it without login arguments (`src/main/terminal.ts`).
- Documentation incorrectly calls the resulting PTY a login shell.
- Documentation says `node-pty` is rebuilt with `@electron/rebuild`, but no script invokes it.
- Current `node-pty` is Node-API based, so lack of rebuild is not proof of an ABI failure; runtime PTY compatibility is simply unverified.

**Fix**

- Decide whether the terminal should be a login shell.
- Pass platform-appropriate login arguments if required, or correct the docs to say interactive default shell.
- Remove the false rebuild claim or add an explicit, verified rebuild lifecycle if packaging/runtime requirements demand one.
- Add a real PTY launch/input/output/exit smoke test on supported platforms.

### 21. Stabilize the OpenCode client update policy

**Problem**

- `@opencode-ai/client` uses the mutable `next` tag in `package.json`.
- The tracked lock makes current `npm ci` installs reproducible, but lock regeneration or explicit updates can move the protocol dependency without a manifest diff.
- `.gitignore` unnecessarily lists the already tracked `package-lock.json`; this does not hide tracked changes but is confusing hygiene debt.
- There are no protocol contract fixtures guarding client updates.

**Fix**

- Pin the client to an exact prerelease in the manifest.
- Remove the lockfile ignore rule while keeping the lock tracked.
- Update the client through explicit commits with protocol/replay fixture tests and generated API-shape review.
- Document the dependency update procedure.

### 22. Enforce a supported Node version

**Problem**

- README and operations docs say Node 20+.
- Locked tooling has narrower/newer engine requirements, including electron-vite `^20.19.0 || >=22.12.0` and `@electron/rebuild >=22.12.0`.
- CI uses Node 22, but the repository has no root engine declaration or version file.

**Fix**

- Select a Node version/range compatible with the full locked dependency graph and supported platforms.
- Add `package.json` engines and an appropriate version-manager file.
- Use the same supported version in CI and documentation.
- Treat optional CDP examples separately from application runtime requirements.

## Priority 6: Documentation and maintainability

### 23. Correct known documentation drift

Update the project brain to reflect these verified facts:

- Changes/Diff does not prove “exactly what the agent changed.”
- Baseline policy must match the product decision in item 11.
- Main forwards SSE events before awaiting `handleServerEvent` (`src/main/opencode.ts`).
- The complete SSE event is nested inside outer `BackendMessage.data`; side handling receives inner `data` or `properties`.
- The current PTY is not spawned with login arguments.
- No `@electron/rebuild` script currently exists.
- `npm run build` does not typecheck.
- Development/start commands are currently macOS-specific and POSIX-shell-specific.
- Node 20+ is too broad for the locked toolchain.
- Startup order is start, register forwarders, register IPC, create window, then asynchronous connect (`src/main/index.ts`).
- The backend has one active session, not only one service session per app run.
- `TerminalTray` currently handles terminal data but not exit.
- Trash failure currently falls back to permanent deletion until item 14 is fixed.
- TODO currently has no actionable product item.
- Remove the duplicate `providerUsage()` method row in `docs/main.md`.
- Remove stale numeric source line references or replace them with stable symbol references.
- Keep the accurate boundary: `opencode.ts` owns opencode2/client traffic; provider usage calls separate provider APIs and is already documented as a separate module.

### 24. Make `docs:check` describe and enforce its real scope

**Problem**

- The checker validates selected inventory and regex-based surfaces, not semantic correctness.
- Its success output says the entire project brain is in sync.
- It does not check links inside every doc, duplicate table rows, package-command claims, source line references, or behavioral invariants.
- AGENTS already limits the promise to machine-checkable/public surfaces, but its all-doc-link wording is broader than implementation.

**Fix**

- Rename output and documentation to “documented surface presence check” or similarly precise language.
- State exactly which files and surfaces are checked.
- Check links in all documentation files.
- Reject duplicate inventory rows.
- Add package-command and supported-Node assertions where stable.
- Prefer AST/schema-based checks for IPC, preload, public methods, and shared wire shapes over fragile regexes.
- Keep behavioral truth in automated tests rather than attempting to prove it through prose checks.

### 25. Reduce implicit global ownership after correctness tests exist

**Problem**

- `src/main/opencode.ts`, `src/renderer/src/store.tsx`, and `AgentPanel.tsx` combine many responsibilities.
- The concrete session, save, and watcher races show that implicit active-workspace ownership is difficult to contain.
- File size alone is not a defect, so a broad split or rewrite is not justified.

**Fix**

- First establish tests and explicit workspace/session/revision invariants.
- Then extract focused boundaries around activation/generation, editor persistence, filesystem watching, and transcript state where doing so improves ownership or testability.
- Keep the preload contract stable unless a capability split is required for security.
- Measure context/render behavior before partitioning state solely for performance.

## Product decisions

- [x] Diff/Changes represents file changes observed during the active workspace session. It does not claim authoritative agent provenance.
- [x] Platform policy is macOS-first cross-platform: macOS remains the primary runtime target, while development and launch workflows must function on Linux and Windows and receive targeted CI coverage.

## Independent work units

The units below describe independently reviewable outcomes, not a requirement that later corrective recovery work preserve the historical commit boundary of each unit. A unit is complete only when its checklist is checked, its focused tests pass, and `npm run typecheck`, `npm run build`, and `npm run docs:check` pass. Later corrective work may strengthen multiple related units in one explicitly identified corrective commit but must not weaken their invariants.

### WU-01: Test foundation and canonical gate

Scope: item 16 and the local portion of item 18.

- [x] Add a TypeScript-compatible unit/component test runner and DOM test environment.
- [x] Add `npm test` with at least one reducer/replay regression test.
- [x] Add reusable fake-timer and deferred-promise test helpers where needed. No helper is needed by the current replay test.
- [x] Make `npm run check` run typecheck, tests, docs check, and build.
- [x] Align CI with the canonical gate without dropping any existing check.
- [x] Update README, AGENTS, and operations docs for the canonical command.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-02: Renderer trust boundary and external links

Scope: items 1 and 2 plus sender validation from item 5.

- [x] Deny unexpected main-frame navigation and redirects.
- [x] Validate IPC sender WebContents, main frame, and trusted application URL.
- [x] Prevent Markdown anchors from navigating the application document.
- [x] Allowlist safe external URL schemes before `shell.openExternal`.
- [x] Handle tool/file links through the same validated policy.
- [x] Set `sandbox: true` explicitly without relying on it as the primary control.
- [x] Add focused policy/component tests and an Electron-hosted lifecycle smoke for trusted/untrusted senders, same-frame navigation, popup denial, and URL policy. Redirect policy remains covered at the focused event-policy seam rather than through a network redirect.
- [x] Update security and IPC documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-03: Workspace identity and confined capabilities

Scope: items 5, 6, and the shared workspace contract required by items 3, 7, and 8.

- [x] Introduce an immutable workspace generation/identity in shared types.
- [x] Carry expected workspace identity on filesystem and terminal IPC.
- [x] Reject stale workspace operations in main.
- [x] Separate workspace-relative reads from privileged source-view reads.
- [x] Reject absolute paths, parent traversal, malformed values, and oversized payloads on workspace APIs.
- [x] Define and enforce a stable-topology no-symlink policy with the external symlink-swap residual documented.
- [x] Stop trusting renderer-provided terminal cwd for ordinary workspace terminals.
- [x] Validate terminal IDs, input size, rows, and columns.
- [x] Add direct path-policy, existing-symlink, stale-workspace helper, malformed-argument, and terminal-manager validation tests.
- [x] Update shared, preload, main, and security documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-04: Revision-safe saves and conflict handling

Scope: items 3, 4, and 10.

- [x] Give every tab edit a monotonically increasing revision.
- [x] Save exact content with workspace identity and revision rather than reading a stale render closure.
- [x] Serialize renderer saves per workspace/file and main filesystem mutations per workspace; use a held-version/no-replace install protocol that never overwrites a concurrently recreated target.
- [x] Clear dirty state only for the matching completed revision.
- [x] Cancel or migrate timers and expected-write state on reset, close, delete, rename, switch, and unmount.
- [x] Detect confirmed write echoes without treating genuine external updates as echoes.
- [x] Block conflicted saves until explicit reload, overwrite, or merge resolution.
- [x] Add fake-timer/deferred persistence tests for typing, manual save, ordering, in-flight conflict generation, and lifecycle invalidation labeled close/delete/rename/workspace switch.
- [x] Update editor/save/conflict documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-05: Session, watcher, and event-loop generations

Scope: items 7, 8, and 9.

- [x] Define latest-request-wins activation semantics.
- [x] Assign activation generations at request acceptance.
- [x] Use latest-request-wins acceptance in main and renderer and discard stale completions; remote activation work may finish but cannot commit.
- [x] Guard file, tree, model, agent, selection, command completion, file search, attachment picker, and create/delete/rename continuation responses by generation.
- [x] Capture watcher root/session/generation and workspace-scoped maps.
- [x] Check watcher generation after awaits and before mutation/emission.
- [x] Include identity on session and file-update messages and reject stale renderer updates.
- [x] Make backend event-loop startup idempotent and prevent parallel SSE subscriptions.
- [x] Await stopped subscription settlement before restart and bind global filesystem events to the active watch location/generation.
- [x] Add deterministic generation acceptance, watcher stat/read/Git/deletion phase, reopen/startup store, mutation-target capture, persistence conflict, workspace completion/picker, and backend event-loop duplicate-start/stop/completion/restart tests.
- [x] Update session, watcher, startup, and event-loop documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-06: Observed-change baselines and timeline chronology

Scope: items 11, 12, and 13 under the selected observed-session-changes policy.

- [x] Preserve each file's first established baseline through editor saves.
- [x] Represent unknown pre-change content explicitly.
- [x] Label Changes/Diff as observed workspace changes rather than authoritative agent attribution.
- [x] Document Git, non-git, shell, skipped-path, and first-observation limits.
- [x] Preserve timeline body order and group only contiguous assistant runs.
- [x] Preserve live-only shell, skill, and compaction interleaving when authoritative replay is merged during streaming.
- [x] Add baseline lifecycle tests for tool, shell, editor, create, delete, rename, Git, and non-git cases.
- [x] Add DOM-order tests for every interleaved semantic timeline event.
- [x] Update all baseline, Changes, and timeline documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-07: Safe deletion and terminal lifecycle

Scope: items 14 and 15.

- [x] Remove automatic permanent deletion after Trash failure.
- [x] Surface the original Trash failure to the user.
- [x] Omit permanent deletion rather than exposing a separate destructive action.
- [x] Commit empty terminal state before hiding the final tab.
- [x] Handle natural terminal exits and select a valid neighboring tab.
- [x] Buffer output only for terminals awaiting registration and enforce byte/chunk limits.
- [x] Define and implement empty-tray reopen behavior.
- [x] Add Trash success/failure, final-close, natural-exit, startup-output, stale-ID, stale-cleanup, reset, and buffer-limit tests; confirmation is not applicable because permanent deletion is omitted.
- [x] Update deletion and terminal documentation.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-08: Performance retention and benchmark

Scope: item 17.

- [x] Add a repeatable large-session benchmark or deterministic performance fixture.
- [x] Record stable warmup/median budgets for reducer/update latency and timeline derivation plus budgets for estimated row count, retained output, actual React/jsdom render time, and actual DOM row count.
- [x] Cap or summarize retained tool and shell output.
- [x] Define retention/eviction for inactive session streams and usage records.
- [x] Report retained-output omission counts exactly and evict per-session busy state with transcript records.
- [x] Measure actual React/jsdom reconciliation and DOM construction before deciding whether transcript indexing, context partitioning, or virtualization is justified. Chromium layout/paint and browser memory remain outside this stable headless scope; current measurements do not justify broad refactoring.
- [x] Add regression coverage for the selected retention behavior.
- [x] Document performance budgets and retention policy.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-09: Portable runtime and dependency policy

Scope: items 19, 20, 21, and 22 under the selected macOS-first cross-platform policy.

- [x] Replace shell-specific launch commands with a portable Node launcher.
- [x] Use the custom app bundle only on Darwin and plain Electron elsewhere.
- [x] Decide and implement or document interactive versus login-shell behavior per platform.
- [x] Remove the false native rebuild claim or add a verified rebuild lifecycle if required. The locked Node-API module is verified under Electron, so no rebuild is required.
- [x] Add targeted launch and PTY smoke coverage for supported environments. CI covers launcher selection and Electron-hosted PTY input/output/exit, not GUI behavior.
- [x] Pin `@opencode-ai/client` to an exact prerelease and remove the tracked lockfile ignore rule.
- [x] Add a documented client update and protocol-fixture review process.
- [x] Select and enforce a Node version compatible with the locked graph in package metadata, version files, CI, and docs.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

### WU-10: Documentation checker and final architecture cleanup

Scope: items 23, 24, and 25 after all behavioral units are complete.

- [x] Reconcile every known documentation-drift item against final source behavior.
- [x] Remove stale numeric line references and duplicate method rows.
- [x] Rename `docs:check` output and prose to state its exact surface-presence scope.
- [x] Check links in all maintained documentation files and reject duplicate inventory rows.
- [x] Add stable package-command and supported-Node assertions.
- [x] Prefer structured/AST checks where practical without replacing behavioral tests.
- [x] Extract activation, persistence, watcher, or transcript boundaries only where established tests show an ownership benefit. Existing focused tests already expose these boundaries; no extraction improved ownership or testability.
- [x] Do not split modules solely by line count or perform a broad rewrite.
- [x] Run a final audit against every item and work-unit checkbox in this document.
- [x] Pass `npm run check`.
- [x] Commit as one independently revertible unit.

## Final acceptance

- [x] Every WU-01 through WU-10 checklist is complete.
- [x] Every work unit has a reviewable commit checkpoint and focused regression tests; cross-unit corrective recovery work may be one corrective checkpoint.
- [x] At the recorded acceptance checkpoint, no implementation changes were left uncommitted; the intentionally excluded pre-existing `findings.md` and `findings2.md` remained untracked. This describes that checkpoint, not the live worktree forever.
- [x] `npm run check` passes after the acceptance harness changes.
- [x] A final review finds no unresolved Critical or High item from this document.

Residual acceptance notes:

- WU-02 now has a real macOS Electron hidden-window lifecycle smoke for the packaged renderer/preload, same-frame external navigation denial, unsafe popup denial, trusted IPC, and untrusted-document IPC rejection. Redirect behavior remains tested through Electron event-policy inputs without external network traffic; subframe identity remains covered by focused sender-policy tests.
- WU-05 now drives actual backend event routing and `onFsChanged` work across deferred stat, read, Git, deletion, mutation, and emission guards, plus StoreProvider startup and overlapping reopen completions.
- WU-08 now uses a warmup and median of five reducer/derivation samples, and measures React reconciliation plus actual jsdom DOM construction and row count under a separate generous budget. It does not measure Chromium layout/paint/compositing or browser memory.
- Linux and Windows intentionally skip the GUI trust smoke because normal BrowserWindow creation requires display infrastructure there; macOS CI is the documented targeted Electron GUI host. All platforms retain real Electron-hosted PTY coverage.
- This acceptance pass does not claim a new independent security audit beyond the automated lifecycle assertions.
- Final-review corrections lock packaged renderer selection to the bundled file, make PTY startup IDs known before output/exit, capture direct delete/rename baselines, broaden bounded IPC schemas, and reconcile stale writes after close/reopen. Focused tests and the macOS Electron lifecycle smoke cover the acceptance boundary.
- Corrective audit coverage enforces cross-platform no-replace file renames and safe rejection of directory renames, workspace-located global filesystem routing, serialized SSE stop/restart, replay/live semantic chronology, exact truncation accounting, and coupled busy-state eviction. Chromium layout/paint and browser-memory benchmarking remain explicitly uncovered and are not required by the selected React/jsdom acceptance scope.
- Final blocking save tests inject races before hold, after hold, after held-content validation, and after install. Recovery transactions preserve original and proposed bytes across success, failure, and restart; the held original inode remains linked so late writes through open descriptors stay recoverable. Startup restores only a missing canonical pathname and never overwrites a concurrent target. File rename holds the source first, installs by no-replace link, and never unlinks the hold during ambiguous rollback. Directory rename is disabled and rejected because portable Node APIs cannot guarantee no-replace native rename.
- Recovery activation confines every transaction, artifact, and canonical path under the workspace with the no-symlink policy. It reconciles only interrupted `source-held` and `held-validated` transactions, never completed, failed, or acknowledged history, and generation-checks before mutation. Successful transactions retain bytes as automatically acknowledged history; abnormal artifacts remain persistently actionable.
