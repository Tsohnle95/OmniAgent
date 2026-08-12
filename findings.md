# OpenShell Comprehensive Repository Audit

Audit date: 2026-08-12

Scope: all tracked first-party source, renderer styles and HTML, shared types, scripts, repository configuration, CI, package manifests, root instructions, and every document under `docs/`. Generated output, dependencies, the generated development app bundle, and binary resources were inventoried but not source-reviewed. The worktree was clean at the start of the audit. This report is the only file created.

## Executive assessment

OpenShell has a coherent three-process Electron design, strict TypeScript, a narrow preload bridge, unusually detailed protocol documentation, and clean typecheck/build/documentation checks. The event reducer and session replay model show substantial implementation care. Those are strong foundations.

The current baseline is not ready to scale safely. Two critical trust/data-integrity failures must be addressed first: an unguarded renderer navigation can transfer the privileged preload API to attacker-controlled content, and delayed editor writes are not bound to either a content revision or workspace identity. The latter can silently lose the latest edit or write one repository's content into another repository. Filesystem IPC also lacks consistent root confinement and sender validation.

Beyond those immediate issues, one mutable backend session and unversioned asynchronous renderer operations create cross-session races; watcher work can cross workspace boundaries; editor saves erase the advertised session baseline; timeline rendering changes event chronology; and there are no tests to protect any of these state machines. The single renderer context and unbounded transcript/session caches are plausible scaling bottlenecks for long sessions, though they are less urgent than correctness and security.

Scale-readiness judgment: **not ready for substantially more runtime complexity or contributors until the critical/high findings and foundational tests are complete**. The architecture can evolve rather than being replaced, but workspace identity, operation sequencing, and trust boundaries need to become explicit invariants.

## Validation results

| Gate | Result | Evidence |
|---|---|---|
| `npm run typecheck` | Pass | Node and web `tsc --noEmit` completed cleanly |
| `npm run build` | Pass | All three electron-vite targets built; renderer emitted an 8.69 MB main JS chunk and a 12.14 MB TypeScript worker |
| `npm run docs:check` | Pass | Printed `docs:check OK`, despite semantic drift documented below |
| `npm test` | Not available | npm reported missing `test` script |
| `npm run lint` | Not available | npm reported missing `lint` script |
| `npm audit --omit=dev` | Pass | Reported zero known production vulnerabilities for the installed lock state |
| CI inspection | Partial | Ubuntu runs install, typecheck, docs check, and build only (`.github/workflows/check.yml:8-20`) |

Passing typecheck/build proves static compatibility and bundling, not runtime ordering, path safety, Electron navigation safety, PTY ABI compatibility, or reducer behavior.

## Findings

### F-01: Privileged preload capabilities can be transferred to attacker-controlled web content

**Severity:** Critical  
**Confidence:** High  
**Area:** Security / Electron trust boundary

**Evidence:**

- `src/main/index.ts:247-252` installs a privileged preload with `contextIsolation: true` but no sandbox.
- `src/preload/index.ts:19-70` exposes repository mutation, session control, prompt, permission, and PTY capabilities.
- `src/main/index.ts:263-266` handles only new-window requests. There is no `will-navigate` or `will-redirect` policy.
- `src/renderer/src/components/OpenCodeTimeline.tsx:195-201` renders agent-controlled Markdown without overriding anchor behavior.
- `src/main/index.ts:396-503` accepts IPC from any sender without checking its frame URL or owning window.

**Failure mode / impact:** A model response can contain a normal Markdown link. `react-markdown` emits a same-frame anchor by default. Clicking it can navigate the existing BrowserWindow to a remote origin. Electron preloads run for navigations, so remote JavaScript can receive `window.openshell` and invoke terminal input, filesystem writes/deletes, prompts, and other main-process capabilities. This turns untrusted model/repository content into potential arbitrary local command execution and file access.

**Why checks miss it:** TypeScript and bundling consider all involved APIs valid. The CSP in `src/renderer/index.html:6-8` does not prohibit top-level navigation. There are no Electron navigation/security tests, and `docs:check` checks API presence rather than origin policy.

**Smallest correct remediation:** Deny main-frame navigation away from the expected packaged file or exact development origin; render Markdown anchors through a component that prevents in-app navigation and opens only validated `https:` URLs with `shell.openExternal`; reject IPC whose sender frame is not the current trusted renderer; enable `sandbox: true` after validating preload compatibility.

**Dependencies:** Do before or with F-02. Filesystem confinement in F-03 is defense in depth, not a substitute.

### F-02: Autosaves can lose the latest edit or write it into a different repository

**Severity:** Critical  
**Confidence:** High  
**Area:** Correctness / data integrity / concurrency

**Evidence:**

- `src/renderer/src/store.tsx:832-850` makes `doSave` read `tabs` from the callback's render closure.
- `src/renderer/src/store.tsx:863-880` updates state and schedules that pre-update `doSave` callback 900 ms later.
- `src/renderer/src/store.tsx:839-844` marks the current tab clean using the stale callback's content.
- `src/renderer/src/store.tsx:348-362` resets workspace state without clearing `saveTimers` or `expectedRef`.
- Close, delete, and rename paths do not cancel or migrate pending timers (`store.tsx:668-694,747-824`).
- Main resolves a relative write against the directory active at execution time (`src/main/opencode.ts:373-375,476-478,1023-1030`).

**Failure mode / impact:** The final keystroke commonly schedules a closure that still sees the penultimate tab value. It writes that older value and marks the newer in-memory value clean, allowing silent loss on close. If a user switches from repository A to B before a timer fires, the relative path is resolved under B and A's content can overwrite `B/<same path>`. Rename/delete/close can similarly recreate an old path. Concurrent manual and automatic saves are also unordered, so an older in-flight write can finish last.

**Why checks miss it:** React closure and promise ordering are runtime properties. There are no fake-timer, deferred-promise, editor, or cross-workspace tests. IPC carries no workspace or content revision.

**Smallest correct remediation:** Give each workspace activation an immutable generation/root ID and each tab content a revision. Pass the exact content, expected workspace ID, and revision to writes; reject stale workspace IDs in main; serialize writes per file or discard stale completions; clear `dirty` only when the completed revision still matches. Cancel or deliberately flush timers on close/delete/rename/reset/unmount.

**Dependencies:** Foundation for F-04, F-05, and F-06. Implement before adding more editor lifecycle features.

### F-03: Filesystem and terminal IPC do not consistently enforce the workspace or trusted sender

**Severity:** High  
**Confidence:** High  
**Area:** Security / path handling / privilege boundary

**Evidence:**

- `src/main/index.ts:396-503` does not validate IPC sender origin, argument shapes, sizes, or expected session identity.
- `src/main/opencode.ts:1007-1014` allows arbitrary absolute paths for reads.
- `src/main/opencode.ts:1023-1030` writes through `abs(rel)` without calling `safeRel`; `abs` accepts absolute paths and parent traversal (`opencode.ts:476-478`).
- `safeRel` is lexical only (`opencode.ts:1033-1043`); create/delete/rename can follow an in-repository symlink outside the root (`opencode.ts:1046-1099`).
- `src/main/index.ts:479-494` accepts an arbitrary terminal cwd, PTY ID, dimensions, and input from the renderer.

**Failure mode / impact:** `writeFile("../../outside", ...)` or an absolute path writes outside the repository. Even lexically safe operations can traverse a repository symlink to an external directory. Absolute reads are intentionally useful for DevTools source opening, but sharing that privilege with ordinary editor IPC broadens exposure. Combined with F-01, these become remotely reachable capabilities; without F-01, a renderer compromise still obtains them.

**Why checks miss it:** Shared TypeScript types disappear at the IPC boundary and do not validate runtime values. No traversal, symlink, oversized payload, invalid PTY, or sender-origin tests exist. Documentation describes context isolation but not capability validation.

**Smallest correct remediation:** Centralize IPC sender validation; separate workspace-relative read/write from a narrowly scoped trusted source-view method; canonicalize the root and nearest existing parent with `realpath`; reject absolute/parent paths and symlink escapes; validate string lengths, terminal dimensions, IDs, and workspace identity.

**Dependencies:** F-01 increases urgency. The workspace token introduced for F-02 should be reused here.

### F-04: External disk changes are detected and then overwritten by an already-pending autosave

**Severity:** High  
**Confidence:** High  
**Area:** Correctness / conflict handling

**Evidence:**

- A dirty tab receiving a file update is marked stale (`src/renderer/src/store.tsx:913-929`).
- The pending timer created at `store.tsx:870-878` is not cancelled on that update.
- `doSave` writes unconditionally and clears `stale` (`store.tsx:832-849`).
- Main does not compare the expected disk value before writing (`src/main/opencode.ts:1023-1030`).

**Failure mode / impact:** While the user edits, the agent or another tool updates the same file. The UI briefly marks the tab changed on disk, then autosave writes the editor's stale version over the external update and clears the warning. Agent work or user work in another editor is silently lost.

**Why checks miss it:** There is no compare-and-swap contract or concurrent editor/watcher integration test.

**Smallest correct remediation:** Cancel autosave on an unexpected update to a dirty tab and require conflict resolution, or include the last observed content/version in `fs-write` and reject stale writes atomically.

**Dependencies:** Build on the revisioned save protocol in F-02 and path/session validation in F-03.

### F-05: Concurrent session operations can leave renderer and backend on different sessions

**Severity:** High  
**Confidence:** High  
**Area:** Correctness / state ownership / races

**Evidence:**

- Main has one mutable active `sessionID` and `directory` (`src/main/opencode.ts:372-375`).
- `openSessionById` activates the session before awaiting history (`opencode.ts:723-788`).
- Renderer open/reopen operations have no request token and every completion resets current state (`src/renderer/src/store.tsx:450-521`).
- Startup restoration can complete after a user action (`store.tsx:1140-1143`).
- File/tree/model/agent reads are also unversioned (`store.tsx:364-429,602-637,696-743`).

**Failure mode / impact:** Reopen A, then B. If B's history returns first and A's later, main remains on B while the renderer displays A. Prompts, saves, interrupts, model switches, permissions, and terminal starts then target a different session than the UI indicates. Late startup, file, tree, model, or agent responses can similarly overwrite newer workspace state.

**Why checks miss it:** Each promise is individually type-correct. There are no deferred-promise race tests and mutation IPC generally relies on implicit global active state.

**Smallest correct remediation:** Serialize main session activation and attach a generation/request ID to each activation. Renderer should discard stale completions. Include the expected session/workspace ID on every mutation and reject mismatches in main.

**Dependencies:** Reuse the workspace identity from F-02/F-03. F-06 is the watcher equivalent.

### F-06: In-flight watcher work can leak across workspace activation

**Severity:** High  
**Confidence:** High  
**Area:** Correctness / filesystem race

**Evidence:**

- Activation mutates global directory and clears maps (`src/main/opencode.ts:656-665`).
- `onFsChanged` performs multiple awaits without capturing an activation generation (`opencode.ts:563-598`).
- Helpers consult mutable `this.directory` after awaits (`opencode.ts:480-488,504-524,600-608`).
- `stopWatcher` cancels timers but cannot cancel an `onFsChanged` already running (`opencode.ts:544-549`).

**Failure mode / impact:** A change from repository A enters `onFsChanged`; activation switches to B while I/O is pending. The continuation can compute a relative path against B, modify B's baseline maps, and emit an A file as a `../` path in B's Changes view.

**Why checks miss it:** Filesystem callback timing is nondeterministic and no generation assertion or rapid-switch watcher test exists.

**Smallest correct remediation:** Capture `{directory, sessionID, generation}` when scheduling watcher work, pass the captured root to all helpers, and discard after every await if the generation is no longer active.

**Dependencies:** Use the same workspace generation as F-02/F-05.

### F-07: Saving a tab destroys the original session diff baseline

**Severity:** High  
**Confidence:** High  
**Area:** Correctness / documented invariant

**Evidence:**

- Main replaces the snapshot with saved content (`src/main/opencode.ts:1027-1030`).
- Renderer replaces the tab baseline with saved content (`src/renderer/src/store.tsx:839-844`).
- The documented baseline is pre-agent/session content (`AGENTS.md:50-54`; `docs/architecture.md:84-101`; `docs/shared.md:67-70`).

**Failure mode / impact:** After an agent change is visible in Diff, a user edit or explicit save changes both baselines to the final saved value. The accumulated session diff disappears, so the UI no longer shows what changed during the session.

**Why checks miss it:** `docs:check` verifies names and table membership, not behavioral invariants. There are no baseline lifecycle tests.

**Smallest correct remediation:** Preserve the first baseline for the active session. A save should update only persisted/current content and `lastKnown`; only new workspace/session activation should reset baseline state.

**Dependencies:** Coordinate with F-02 so save completion updates the correct revision without mutating baseline.

### F-08: Timeline rendering changes the chronological order of session events

**Severity:** High  
**Confidence:** High  
**Area:** Correctness / user-visible protocol representation

**Evidence:**

- `buildTurns` preserves each turn's body order (`src/renderer/src/components/OpenCodeTimeline.tsx:724-739`).
- Rendering extracts all assistant items first (`OpenCodeTimeline.tsx:868-875`).
- It then renders all non-assistant shell/compaction/synthetic/skill/status/divider items (`OpenCodeTimeline.tsx:876-879`).
- Documentation claims ordered semantic timeline items (`docs/renderer.md:72-78`; `docs/shared.md:53-57`).

**Failure mode / impact:** `assistant A -> shell event -> assistant B` is shown as `assistant A -> assistant B -> shell event`. This can falsely imply that a command, compaction, or system event occurred after a response rather than between model steps.

**Why checks miss it:** Reducer ordering can be correct while DOM rendering reorders items. No timeline DOM-order tests exist.

**Smallest correct remediation:** Walk `turn.body` in order, grouping only contiguous assistant items where cross-message tool grouping is required.

**Dependencies:** Independent. Add a focused rendering test before changing grouping behavior.

### F-09: Core state machines have no automated tests

**Severity:** High  
**Confidence:** High  
**Area:** Reliability / tooling

**Evidence:**

- No test/spec files or test framework configuration exist in tracked files.
- `package.json:7-14` has no test script.
- `npm test` fails with “Missing script: test”.
- CI runs only typecheck, docs check, and build (`.github/workflows/check.yml:17-20`).
- Complex ordering claims are made in `docs/events.md:12-16,103-130` and `docs/renderer.md:59-99`.

**Failure mode / impact:** Autosave, activation, replay/live merge, reducer terminal-state monotonicity, watcher baselines, IPC validation, terminal lifecycle, and permission routing can regress while every current gate remains green. This materially raises contributor and feature-scaling risk.

**Why checks miss it:** This finding is the checks gap.

**Smallest correct remediation:** Introduce a fast unit/integration runner. Prioritize deterministic reducer/replay tests, fake-timer autosave tests, deferred activation tests, path/symlink validation tests, watcher generation tests, and one Electron navigation/IPC smoke test.

**Dependencies:** Tests should accompany each F-01 through F-08 remediation rather than arrive as one large later project.

### F-10: Session/transcript state and render work grow without bounds

**Severity:** Medium  
**Confidence:** High  
**Area:** Performance / architecture / scalability

**Evidence:**

- Per-session transcript, busy, and usage maps persist for the window lifetime (`src/renderer/src/store.tsx:267-295`).
- Every stream update clones the session dictionary and often scans/maps an entire transcript (`store.tsx:317-334,950-1073`; `src/renderer/src/chat-stream.ts:132-321`).
- A single context value exposes all UI state and changes whenever any slice changes (`store.tsx:1164-1231`).
- Timeline construction and rendering process the full transcript (`src/renderer/src/components/OpenCodeTimeline.tsx:623-715,851-883`) with no virtualization.
- Tool output is retained fully in state; presentation truncation does not release memory.

**Failure mode / scaling impact:** Long-running token streams, large tool output, or many visited child sessions progressively increase memory, reducer cost, and React reconciliation. Unrelated consumers of the global context are notified by every streamed update. This is a plausible UI responsiveness ceiling before feature count grows substantially.

**Why checks miss it:** Build output and static checks do not measure retained memory or update latency. No performance budget or long-session benchmark exists.

**Smallest correct remediation:** First add a repeatable large-session benchmark. Then cap inactive-session caches/tool output, index frequently updated assistant parts, split high-frequency stream state from low-frequency workspace/UI state, and virtualize older turns if measurements justify it.

**Dependencies:** Fix correctness races first. Avoid broad state refactoring without F-09 coverage.

### F-11: Terminal lifecycle leaves a dead final tab and buffers output without a bound

**Severity:** Medium  
**Confidence:** High  
**Area:** Correctness / resource management

**Evidence:**

- Closing the last PTY calls `onClose` without committing the empty `terms` state (`src/renderer/src/components/TerminalTray.tsx:208-219`).
- The tray remains mounted while hidden, so its startup effect does not rerun merely on reopen (`TerminalTray.tsx:183-206,222-273`; `src/renderer/src/App.tsx:296-303`).
- Unknown/unmounted terminal output is appended to an uncapped buffer (`TerminalTray.tsx:138-166`).
- The subscription ignores `terminal-exit` even though docs claim it subscribes to both kinds (`docs/renderer.md:132`).

**Failure mode / impact:** Closing the final terminal leaves its stopped tab in UI state; reopening shows a dead terminal until a new one is manually created. Output arriving before registration or for stale IDs can accumulate indefinitely.

**Why checks miss it:** No terminal component or PTY runtime tests exist. The build does not launch a PTY.

**Smallest correct remediation:** Always update `terms`/`activeId` before closing; handle exit by removing the matching tab and buffers; buffer only known pending IDs with a byte cap; create a terminal when reopening an empty tray if desired.

**Dependencies:** Add terminal lifecycle tests under F-09. Native ABI concerns are covered by F-15.

### F-12: Non-git shell changes can have no useful baseline, and “agent-only changes” cannot be guaranteed

**Severity:** Medium  
**Confidence:** High  
**Area:** Correctness / product semantics / documentation

**Evidence:**

- Tool snapshotting recognizes only values under `filePath`, `file_path`, or `path` (`src/main/opencode.ts:62-80,491-501`). Shell commands generally provide a command string, not target paths.
- For a non-git workspace, first-observed post-change content becomes the baseline (`opencode.ts:590-597`).
- Every watched disk change is emitted without provenance (`opencode.ts:527-608`) and added to `agentFiles` (`src/renderer/src/store.tsx:905-912`).
- README and brain repeatedly claim the diff is “exactly what the agent changed” (`README.md:13-16,49-52`; `AGENTS.md:50-54`; `docs/architecture.md:84-101`).

**Failure mode / impact:** In a non-git directory, an agent shell command such as `sed -i` may first be observed after modification; baseline equals changed content and the diff is empty. Conversely, another editor, formatter, or user change during the session is attributed to the agent Changes list. The implementation provides observed session changes, not authoritative agent provenance.

**Why checks miss it:** There are no non-git/shell attribution tests. `docs:check` does not validate semantics.

**Smallest correct remediation:** Either describe the feature as observed workspace changes with documented attribution limits, or establish a bounded workspace baseline before execution and record explicit tool/change provenance. Represent unknown baseline explicitly rather than as unchanged content.

**Dependencies:** F-07 governs baseline preservation after one exists.

### F-13: Trash failure silently becomes irreversible recursive deletion

**Severity:** Medium  
**Confidence:** High  
**Area:** Reliability / destructive operation behavior

**Evidence:**

- `src/main/opencode.ts:1061-1068` catches every `shell.trashItem` failure and immediately executes recursive forced removal.
- Docs describe delete as moving to Trash, with the fallback mentioned but no user-visible distinction (`docs/architecture.md:111-114`; `docs/preload.md:32`; `docs/main.md:47`).

**Failure mode / impact:** A transient Trash integration, permission, or volume failure permanently removes a directory the user expected to be recoverable. The broad catch loses the reason and the UI cannot ask for explicit permanent-delete confirmation.

**Why checks miss it:** No failure-path test or UX contract distinguishes recoverable and permanent deletion.

**Smallest correct remediation:** Propagate Trash failure. Offer permanent deletion only as a separate explicitly confirmed action showing the target.

**Dependencies:** Path/sender validation in F-03 must precede any destructive fallback API.

### F-14: Local and CI quality gates do not enforce the documented definition of done

**Severity:** Medium  
**Confidence:** High  
**Area:** Tooling / agent effectiveness

**Evidence:**

- README says `npm run build` performs “typecheck + build” (`README.md:66-70`), but it only invokes electron-vite (`package.json:9`).
- `npm run check` omits build and has no tests or lint (`package.json:11-14`).
- AGENTS requires three separate commands (`AGENTS.md:72-76`).
- No lint/format gate exists; `npm run lint` fails as missing.
- CI is Ubuntu-only and has no runtime, PTY, Electron, packaging, security, or platform matrix checks (`.github/workflows/check.yml:8-20`).

**Failure mode / scaling impact:** An agent can reasonably run `npm run check` or follow README's build description and believe the definition of done is satisfied when it is not. Platform-specific launch/native failures and all runtime defects remain green.

**Why checks miss it:** The canonical aggregate command is incomplete and CI only mirrors static/build gates.

**Smallest correct remediation:** Make one canonical `npm run check` execute typecheck, tests, lint/format as adopted, docs check, and build. Make AGENTS/README point to it. Add targeted runtime/platform jobs rather than duplicating every static job across every OS.

**Dependencies:** F-09 supplies tests. F-15 defines platform/native coverage.

### F-15: Development launch and native-terminal workflows are not portable or verified

**Severity:** Medium  
**Confidence:** High  
**Area:** Tooling / platform reliability / documentation

**Evidence:**

- `package.json:8-10` always sets `ELECTRON_EXEC_PATH=dev/OpenShell.app/Contents/MacOS/Electron` using POSIX environment syntax.
- `scripts/make-dev-app.mjs:8-10` exits without creating that bundle on non-macOS.
- Docs present Node/npm and these commands generically (`README.md:54-70`; `docs/operations.md:7-25`).
- Architecture claims `node-pty` is rebuilt using `@electron/rebuild` (`docs/architecture.md:134-139`), but no lifecycle or script invokes it (`package.json:7-14,29-38`).
- Terminal shell discovery invokes `-l -c` only to find a path, then spawns with no login argument (`src/main/terminal.ts:30-50`), contradicting login-shell claims.
- CI is Ubuntu build-only and never starts Electron or a PTY (`.github/workflows/check.yml:8-20`).

**Failure mode / impact:** `dev`/`start` point to a nonexistent macOS bundle on Linux and use syntax incompatible with the default Windows npm shell. Native `node-pty` ABI/runtime compatibility depends on installation circumstances rather than an enforced Electron rebuild. Shell startup files can differ from the documented login-shell behavior.

**Why checks miss it:** electron-vite can bundle external native dependencies without loading them. CI never executes package scripts that launch the app or PTY.

**Smallest correct remediation:** Declare supported platforms. Use a cross-platform Node launcher that selects the custom executable only on Darwin; add an explicit Electron rebuild lifecycle; pass intentional login-shell arguments or correct the docs; add a PTY smoke test on supported OSes.

**Dependencies:** F-14 should expose the smoke test through a canonical gate.

### F-16: Dependency update policy is not reproducible enough for a beta protocol dependency

**Severity:** Medium  
**Confidence:** High  
**Area:** Dependency reliability / agent workflow

**Evidence:**

- `@opencode-ai/client` is specified as the floating `next` tag (`package.json:18`).
- The tracked lock currently resolves `0.0.0-next-17126`; `npm outdated` reported wanted `0.0.0-next-17276` during this audit.
- `.gitignore:8` ignores `package-lock.json` even though it is currently tracked.
- README acknowledges the client/event API is beta (`README.md:107-110`).

**Failure mode / scaling impact:** A deliberate or regenerated install can move the most contract-sensitive dependency to another beta without an obvious manifest change. Ignoring a tracked lockfile confuses agents and can hide replacement/removal workflows. Protocol breakage is especially likely to pass because there are no reducer/API contract tests.

**Why checks miss it:** Current CI uses the tracked lock and therefore validates only the current snapshot. It does not enforce an exact manifest version or controlled update process.

**Smallest correct remediation:** Remove the lockfile ignore rule, pin the client to an exact prerelease, and update it through explicit commits with protocol/replay tests and generated API-shape review.

**Dependencies:** F-09 should add protocol fixtures before the next client update.

### F-17: Documentation validation reports semantic synchronization it does not establish

**Severity:** Medium  
**Confidence:** High  
**Area:** Documentation / agent effectiveness

**Evidence:**

- AGENTS says `docs:check` verifies IPC channels, public methods, preload, events, and every linked file (`AGENTS.md:94-108`).
- The script checks only selected links in AGENTS/README, regex table membership, literal methods, preload keys, and literal event cases (`scripts/check-docs.mjs:27-141`).
- It does not validate behavioral claims, shared shapes, startup ordering, line references, package commands, quality gates, platform support, or links inside all docs.
- Success says the entire “project brain is in sync with the code” (`scripts/check-docs.mjs:154`).
- The check passed while the drift matrix below contains confirmed contradictions.

**Failure mode / scaling impact:** Future agents over-trust a green check and stale semantic claims. Regex extraction also misses refactors and wildcard event inventories, while duplicate rows are accepted (`docs/main.md:56-58`).

**Why checks miss it:** The check's scope is the finding.

**Smallest correct remediation:** Rename its promise/output to “documented surface presence check” and document exact limits. Incrementally add AST/schema-based IPC/preload/type checks, all-doc link checking, duplicate detection, package-command assertions, and stable symbol references. Behavioral truth belongs in tests.

**Dependencies:** F-09 and F-14 automate behavior and workflow; do not try to encode all semantics in prose regexes.

### F-18: Large central modules and implicit global ownership will make races harder to contain

**Severity:** Low  
**Confidence:** High  
**Area:** Architecture / maintainability

**Evidence:**

- `src/main/opencode.ts:371-1119` owns service connection, mutable active session, replay, settings, API mapping, baselines, filesystem watching, and file mutation.
- `src/renderer/src/store.tsx:264-1238` owns workspace lifecycle, catalogs, editor persistence, tree state, chat streams, permissions, usage, and UI menus in one context.
- `src/renderer/src/components/AgentPanel.tsx:1-1126` combines composer state, async completions, mentions, voice, menus, provider usage, prompt submission, navigation, and scrolling.
- AGENTS explicitly presents these central modules as the ownership model (`AGENTS.md:27-35,44-54`).

**Failure mode / scaling impact:** New features tend to share mutable active-session state and broad dependencies, increasing accidental cross-workspace behavior and whole-app rerenders. Testing one responsibility requires constructing many unrelated concerns. The concrete races in F-02/F-05/F-06 are evidence of the pressure, not merely a preference about file size.

**Why checks miss it:** Typechecking does not enforce ownership or dependency direction, and no architectural tests/metrics exist.

**Smallest correct remediation:** After correctness tests exist, extract boundaries around workspace activation/generation, editor persistence, and transcript state. Keep the public preload surface stable; avoid a broad rewrite or splitting solely by line count.

**Dependencies:** Defer until F-02, F-05, F-06, and F-09 establish explicit invariants and tests.

## Documentation drift matrix

| Documented claim | Source | Actual implementation | Required correction |
|---|---|---|---|
| Diff is exactly what the agent changed | `README.md:13-16,49-52`; `AGENTS.md:50-54`; `docs/architecture.md:84-101` | Watcher has no provenance; user/formatter changes enter `agentFiles`; non-git shell edits can get a post-change baseline (`opencode.ts:527-608`; `store.tsx:905-912`) | Say “observed workspace changes during the session” and document limits, or implement provenance/baseline capture |
| Existing baseline remains session-start content | `docs/shared.md:67-70`; `docs/architecture.md:84-101` | Every editor save replaces main and tab baselines (`opencode.ts:1027-1030`; `store.tsx:839-844`) | Correct implementation; retain claim only after a baseline test exists |
| Main intercepts tool/filesystem events before renderer sees them | `docs/events.md:93-101`; `docs/walkthrough.md:65-69` | Event is emitted first, then `handleServerEvent` is awaited (`opencode.ts:446-452`) | Document forwarding-before-side-effect order, or change ordering deliberately |
| SSE event data is forwarded verbatim as `data` | `docs/architecture.md:47-52`; `docs/events.md:3-6` | Main wraps the complete `evt` object in `data`, while side handling receives `typed.data/properties` (`opencode.ts:448-451`) | Document the exact nested envelope and normalization |
| Terminal is a login shell | `docs/architecture.md:136-141`; `docs/main.md:126`; `docs/walkthrough.md:27-31,187-195` | Login mode is used only for discovery; PTY spawns the resolved shell with `[]` (`terminal.ts:30-50`) | Pass login arguments or describe it as an interactive default shell |
| `node-pty` is rebuilt against Electron ABI “see scripts” | `docs/architecture.md:136-139` | No rebuild script/lifecycle exists (`package.json:7-14`) | Add and verify rebuild workflow or remove claim |
| `npm run build` means typecheck + build | `README.md:66-70` | Script is only `electron-vite build` (`package.json:9`) | Correct README or make script match |
| Dev/start commands are generic prerequisites/workflows | `README.md:54-70`; `docs/operations.md:7-25` | Scripts hard-code a macOS executable and POSIX env syntax (`package.json:8-10`); helper creates it only on Darwin (`make-dev-app.mjs:8-10`) | Declare macOS-only support or implement cross-platform launcher |
| Node 20+ is sufficient | `README.md:54-57`; `docs/operations.md:7-10` | Lock metadata requires newer specific Node versions for tooling; CDP instructions rely on Node 22 (`docs/operations.md:53-60`) | Set and enforce one supported Node range, preferably exact major/minor floor |
| `docs:check` means the project brain is in sync | `AGENTS.md:94-108`; `scripts/check-docs.mjs:154` | Confirmed semantic contradictions pass; script checks narrow regex surfaces (`check-docs.mjs:27-141`) | State exact scope and automate semantics through tests/schema checks |
| Source navigation line references are exact | `docs/architecture.md:36-43`; `docs/walkthrough.md:39-47,65-85,199-204` | Examples point hundreds of lines away; `connect` is `opencode.ts:411`, event loop `:439`, IPC `index.ts:396`, startup `index.ts:524`, open session `opencode.ts:668` | Remove volatile line numbers; use symbols or generated links |
| Startup is connect, start, register IPC, create window | `docs/main.md:194-198` | Actual order is start, forwarders, IPC, window, asynchronous connect (`index.ts:524-542`) | Correct sequence and explain why event loop can begin before client connection |
| Only one session exists per app run | `docs/architecture.md:78-79` | One session is active, but historical and child streams are retained and reopened | Say “one active backend workspace session” |
| TerminalTray subscribes to terminal data and exit | `docs/renderer.md:132` | Component handles only `terminal-data` (`TerminalTray.tsx:155-169`) | Add exit handling or correct doc |
| Delete moves to Trash | `docs/architecture.md:111-114`; `docs/preload.md:32` | Any Trash error silently invokes forced recursive removal (`opencode.ts:1061-1068`) | Describe destructive fallback prominently or remove fallback |
| TODO is the actionable queue | `AGENTS.md:40-42`; `TODO.md:3-5` | All product entries are completed; only an evergreen docs-check item remains (`TODO.md:7-89`) | Archive completed history and provide prioritized open work, or stop directing agents there |
| All opencode API traffic is in `opencode.ts` | `AGENTS.md:66-67`; `docs/main.md:3-7` | Provider OAuth storage and provider HTTP APIs live in `provider-usage.ts:25-55,131-576` | Narrow claim to `@opencode-ai/client` traffic and document provider integration boundary |
| `providerUsage()` appears once in public-method inventory | `docs/main.md:56-58` | Same method is listed twice | Remove duplicate and add duplicate-table detection |

## Project-brain assessment

### What future agents can reliably learn

- The Electron main/preload/renderer process model and principal module locations.
- The literal IPC channel and preload method inventory, because source and docs tables currently agree.
- The broad SSE event taxonomy and reducer responsibilities.
- The intended session, replay, model, agent, permission, terminal, and diff flows.
- The required static build/documentation commands and practical macOS debugging techniques.

### What future agents are likely to miss or misunderstand

- The renderer is a privileged security principal despite context isolation; there is no navigation or sender-origin boundary.
- Active workspace identity is implicit mutable global state, and async operations are not generation-bound.
- Autosave has stale closure, cross-workspace, conflict, and completion-order hazards.
- “Agent changes” is an attribution aspiration rather than a property the watcher can prove.
- A green `docs:check` is a narrow inventory check, not semantic validation.
- Development, native PTY, and operations guidance is effectively macOS-centric despite generic wording.
- The current TODO supplies no actionable handoff queue.

### Add

- Explicit invariants for workspace identity, permitted renderer origin, filesystem root confinement, save revisions, baseline lifetime, and session activation ordering.
- A short supported-platform and Node-version statement.
- A test map describing where reducer fixtures, main-process path tests, renderer timer tests, and Electron smoke tests live once added.
- A current prioritized backlog with ownership/status and links to findings or issues.
- A dependency update policy for the beta OpenCode client.

### Remove or consolidate

- Volatile source line numbers in architecture/walkthrough docs.
- Duplicate `providerUsage()` documentation.
- Repeated absolute wording such as “exactly,” “every,” and “only” where implementation has known qualifications.
- Completed TODO history from the active queue; retain it in git history or a delivered section outside the working queue.
- Highly detailed UI prose that cannot be checked and duplicates component code, unless it captures a deliberate product invariant.

### Automate

- Runtime IPC schema and sender checks.
- Workspace path/symlink confinement tests.
- Autosave and session-generation race tests.
- Event/replay fixture tests against the pinned client protocol.
- All-doc link checking, duplicate table rows, package command claims, supported Node version, and canonical definition-of-done command.
- Supported-platform launch and PTY smoke tests.

## Test and quality-gate gaps

Prioritized by risk reduction:

1. **Electron trust-boundary smoke tests:** attempt same-frame remote navigation, `window.open`, invalid schemes, and IPC from an untrusted frame; verify all are denied.
2. **Autosave fake-timer/deferred-write tests:** latest keystroke reaches disk, reverse completion cannot regress disk/state, dirty clears only for matching revision, and timers cannot cross close/rename/delete/workspace switch.
3. **Filesystem capability tests:** absolute paths, `..`, separators, symlinked parents, oversized content, external source reads, invalid sender, and stale workspace IDs.
4. **Session activation race tests:** overlapping new/reopen/startup restoration and stale file/tree/model/agent responses; renderer and main must converge on the latest generation.
5. **Watcher generation and baseline tests:** switch workspaces during each awaited watcher phase; preserve first baseline through saves; cover git, non-git, create, modify, delete, rename, shell, and user-edit cases.
6. **Reducer/replay sequence tests:** delta before start, duplicate/out-of-order terminal events, replay/live merge, child-session isolation, identical prompts, permission routing, and protocol envelope variants.
7. **Timeline DOM-order tests:** interleave assistant, shell, synthetic, compaction, divider, status, and permission events.
8. **Terminal lifecycle/runtime tests:** close final terminal, exit cleanup, buffer cap, session restart, resize validation, PTY spawn, and Electron ABI compatibility on supported systems.
9. **Long-session performance benchmark:** thousands of deltas, many child sessions, and multi-megabyte outputs with budgets for update latency, retained memory, and initial renderer load.
10. **Canonical local/CI gate:** one command covering typecheck, tests, lint/format policy, docs surface checks, build, and targeted smoke tests.

## Remediation roadmap

### Immediate correctness and security

#### Work unit 1: Lock renderer origin and IPC sender

Scope: F-01 and sender portion of F-03.  
Expected risk: High because it changes navigation and preload assumptions.  
Validation: Electron tests for links, redirects, popups, schemes, trusted development origin, packaged file origin, and rejected untrusted IPC.  
Suggested commit boundary: navigation/link policy plus tests; sandbox enablement can be a separate commit if compatibility work is needed.

#### Work unit 2: Introduce workspace identity and confined filesystem capabilities

Scope: F-02/F-03/F-05 shared workspace token, path validation, symlink policy, argument schemas.  
Expected risk: High because every file/session IPC call changes.  
Validation: traversal/symlink tables, stale workspace rejection, ordinary workspace operations, DevTools source opening, and attachment behavior.  
Suggested commit boundary: shared workspace/token contract; filesystem confinement; separate privileged source-view method.

#### Work unit 3: Make editor persistence revision-safe

Scope: F-02 and F-04.  
Expected risk: High due to data-loss behavior.  
Validation: fake timers and reverse-order promises across typing, manual save, external update, close, rename, delete, switch, and unmount.  
Suggested commit boundary: per-file revision/serialization; lifecycle cancellation/migration; conflict UI.

#### Work unit 4: Preserve baselines and watcher generation

Scope: F-06/F-07/F-12 baseline correctness.  
Expected risk: Medium-high because Changes/Diff semantics change.  
Validation: git/non-git fixtures, watcher race injection, user saves, agent writes, shell edits, create/delete/rename.  
Suggested commit boundary: watcher generation guard; immutable baseline behavior; unknown/non-git baseline semantics and docs.

#### Work unit 5: Make deletion non-destructive by default

Scope: F-13.  
Expected risk: Low.  
Validation: successful Trash, failed Trash, explicit permanent-delete confirmation, directory and file paths.  
Suggested commit boundary: one behavior/UI/docs/test commit.

### Near-term architecture and reliability

#### Work unit 6: Serialize session activation and discard stale renderer work

Scope: F-05.  
Expected risk: Medium-high due to startup/reopen flows.  
Validation: deterministic overlapping operation tests and session ID assertions on all mutations.  
Suggested commit boundary: main activation sequencing; renderer generation checks; mutation contract completion.

#### Work unit 7: Preserve timeline order and terminal lifecycle

Scope: F-08/F-11.  
Expected risk: Medium, localized UI behavior.  
Validation: DOM event order and PTY close/exit/buffer tests.  
Suggested commit boundary: timeline ordering; terminal lifecycle as separate commits.

#### Work unit 8: Establish test and canonical check infrastructure

Scope: F-09/F-14.  
Expected risk: Low to runtime, moderate setup cost.  
Validation: clean local and CI runs, deliberate failing test/lint/docs/build probes.  
Suggested commit boundary: unit runner and initial reducer tests; Electron integration harness; canonical scripts/CI.

#### Work unit 9: Stabilize platform and dependency workflows

Scope: F-15/F-16.  
Expected risk: Medium because native dependencies and developer startup change.  
Validation: clean install, rebuild, dev, preview, PTY smoke on each supported platform; exact lock/client version.  
Suggested commit boundary: platform declaration/launcher; native rebuild/smoke; dependency pin/lock policy.

### Longer-term improvements

#### Work unit 10: Bound and partition high-frequency state

Scope: F-10/F-18.  
Expected risk: High if attempted broadly, so require benchmark and regression tests first.  
Validation: reducer fixtures, UI behavior, update-latency and memory budgets on large sessions.  
Suggested commit boundary: cache/output retention policy; indexed stream updates; context partition; virtualization only if measured need remains.

#### Work unit 11: Make the project brain durable

Scope: F-17 and drift matrix.  
Expected risk: Low.  
Validation: enhanced docs checks plus manual semantic review against passing behavioral tests.  
Suggested commit boundary: remove stale line references/duplicate claims; clarify check scope; add selected machine checks; refresh actionable backlog.

## Coverage ledger

### Root and agent-facing files

- `AGENTS.md`
- `README.md`
- `TODO.md`
- `package.json`
- `package-lock.json` dependency and engine records
- `.gitignore`
- `launch.command`
- Git status, tracked-file inventory, ignored generated artifacts, and lockfile tracking state

### Documentation

- `docs/architecture.md`
- `docs/events.md`
- `docs/main.md`
- `docs/operations.md`
- `docs/preload.md`
- `docs/renderer.md`
- `docs/shared.md`
- `docs/walkthrough.md`

### Main, preload, and shared source

- `src/main/index.ts`
- `src/main/opencode.ts`
- `src/main/provider-usage.ts`
- `src/main/terminal.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`

### Renderer source

- `src/renderer/index.html`
- `src/renderer/src/App.tsx`
- `src/renderer/src/main.tsx`
- `src/renderer/src/store.tsx`
- `src/renderer/src/chat-stream.ts`
- `src/renderer/src/monaco.ts`
- `src/renderer/src/reveal.ts`
- `src/renderer/src/global.d.ts`
- Every file in `src/renderer/src/components/`: `AgentPanel.tsx`, `AgentTray.tsx`, `EditorPane.tsx`, `FileIcons.tsx`, `FileSidebar.tsx`, `OpenCodeTimeline.tsx`, `OpenCodeTodoDock.tsx`, `ShellMark.tsx`, `TerminalTray.tsx`, `Welcome.tsx`
- Every file in `src/renderer/src/styles/`: `_agent.scss`, `_buttons.scss`, `_composer.scss`, `_editor.scss`, `_foundation.scss`, `_layout.scss`, `_opencode-chat.scss`, `_scrollbars.scss`, `_sidebar.scss`, `_terminal.scss`, `_toasts.scss`, `_welcome.scss`, `main.scss`

### Scripts, configuration, and CI

- `scripts/check-docs.mjs`
- `scripts/make-dev-app.mjs`
- `.github/workflows/check.yml`
- `electron.vite.config.ts`
- `tsconfig.json`
- `tsconfig.node.json`
- `tsconfig.web.json`
- Resource paths and build output inventory relevant to packaging/configuration

### Excluded or not fully verifiable

- `node_modules/`, `out/`, `dev/`, `*.tsbuildinfo`, `.DS_Store`: generated/dependency artifacts excluded except manifests, engine records, ignore behavior, and build-size evidence.
- `resources/icon.png`, `resources/icon.icns`, and visual correctness of `resources/icon.svg`: inventoried, not audited for artwork quality.
- OpenCode service behavior and provider endpoint schemas: client call sites were inspected, but no live service/provider accounts were exercised.
- Electron GUI behavior, remote navigation exploit execution, PTY startup, watcher timing, and macOS/Linux/Windows runtime behavior: not dynamically exercised in this audit. Findings are based on confirmed control flow; remediation requires runtime tests.
- Package distribution, signing, notarization, installer, and updater behavior: not verifiable because no production packaging infrastructure exists.
- Dependency source code and transitive supply-chain review: excluded. `npm audit --omit=dev` found no known advisories in the installed snapshot but is not a source audit.
- Accessibility was sampled where it affected functional controls, but this was not a full WCAG audit.
- Performance was assessed from data flow and build output, not profiled on representative long sessions.

## Open questions

1. Which platforms are officially supported: macOS only, macOS-first, or macOS/Linux/Windows? Runtime and CI obligations depend on this decision.
2. Is absolute file reading intended only for DevTools source links, or are external editor tabs a supported capability? This determines the split of privileged IPC methods.
3. Is the product definition of Changes “agent-attributed changes” or “all workspace changes observed during the active session”? The current implementation supports only the latter reliably.
4. Does the deployed OpenCode protocol guarantee `sessionID` on every forwarded event? If not, the renderer's fallback to current session (`store.tsx:946-949`) can misroute queued events after activation.
5. Does `node-pty` happen to load successfully under the installed Electron ABI on each supported developer platform? Build success does not answer this.
6. What retention limits are acceptable for inactive child sessions and tool output? Representative workload data is needed before choosing caps or virtualization thresholds.

This audit does not claim the repository is bug-free. The blind spots above, especially absence of runtime tests and live OpenCode/provider exercise, remain material.
