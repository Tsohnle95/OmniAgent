# Review of `findings.md`

Review date: 2026-08-12

## Scope and method

This review checked every finding and every documentation-drift row in `findings.md` against the current repository at `HEAD` (`35fd176`). It also checked relevant Electron 37 behavior, Git ignore behavior, the locked dependency metadata, and interactions between the cited code paths. No claim was accepted solely because its cited line exists.

The original report is strong on runtime ordering, filesystem capability risks, missing tests, and documentation drift. Its principal defects are severity inflation, a few incorrect platform/runtime assertions, treating an internally inconsistent baseline policy as settled, and several tooling claims that do not distinguish a tracked lockfile or CI's actual commands from broader desired policy.

Overall verdict: **substantially accurate, but not fully accurate**. Of 18 numbered findings, 10 are accurate in substance, 7 are partially accurate or materially overstated, and 1 is a reasonable architectural concern rather than a verifiable defect. Several proposed remediations remain useful even where severity or rationale needs correction.

## Summary verdicts

| Finding | Verdict | Corrected severity | Key correction |
|---|---|---:|---|
| F-01 | Partially accurate | Critical | Exploit is real, but Electron 37 sandboxes this renderer by default; enabling sandbox is not a missing fix. |
| F-02 | Accurate | Critical/High | Confirmed stale save closure and cross-workspace write; “penultimate” is only the common case. |
| F-03 | Accurate with qualifications | High | Confirmed arbitrary direct reads/writes and symlink escapes; unknown PTY IDs are mostly harmless by themselves. |
| F-04 | Accurate | High | Pending/in-flight saves can overwrite a detected external update and clear the warning. |
| F-05 | Accurate with clarification | High | Mismatch requires activation/history interleaving, not history completion order alone. |
| F-06 | Accurate | Medium/High | Confirmed cross-workspace watcher contamination; direct disk overwrite is not caused by this finding alone. |
| F-07 | Partially accurate | Medium | Baselines are reset on save, but docs explicitly disagree on whether that is intentional; “session-start” is not universal. |
| F-08 | Accurate | Medium | Rendering reorders events, but High severity is excessive for a misleading timeline without execution impact. |
| F-09 | Accurate | High/Medium | No automated tests exist; severity is policy-dependent but the gap is material. |
| F-10 | Partially accurate | Medium | Structural risks are real, but caches do not all persist for the whole window lifetime and impact is unmeasured. |
| F-11 | Accurate | Medium | Final terminal state, exit handling, and uncapped buffering defects are confirmed. |
| F-12 | Accurate with qualifications | Medium | Baseline/provenance defects are confirmed; not literally every filesystem event is emitted. |
| F-13 | Accurate | Medium | Trash failure permanently deletes; fallback is documented in two module docs but not surfaced to users. |
| F-14 | Partially accurate | Medium | Local aggregate command is incomplete, but CI does enforce the current AGENTS definition of done. |
| F-15 | Partially accurate | Medium | Portability/login-shell drift is confirmed; current native ABI failure is speculative and `node-pty` uses Node-API. |
| F-16 | Partially accurate | Medium/Low | Floating `next` is risky, but tracked-lock installs are reproducible and Git does not hide tracked lock changes. |
| F-17 | Mostly accurate | Medium/Low | Script output overpromises; AGENTS already limits the check to machine-checkable/public surfaces. |
| F-18 | Valid concern, not a demonstrated defect | Low | File size and broad ownership are facts; predicted scaling/maintainability effects remain inferential. |

## Numbered findings review

### F-01: Partially accurate

The central exploit is valid. Ordinary model-controlled Markdown links are rendered as same-frame anchors because `MARKDOWN_COMPONENTS` overrides only `code` (`src/renderer/src/components/OpenCodeTimeline.tsx:173-201`). The window blocks new windows but not same-frame navigation (`src/main/index.ts:263-266`), the configured preload runs on subsequent documents, and `contextBridge.exposeInMainWorld` exposes the privileged API to the loaded page (`src/preload/index.ts:19-75`). None of the IPC handlers validates sender ownership, frame, or URL (`src/main/index.ts:396-503`). A user click can therefore navigate to attacker content that receives filesystem, session, prompt, and PTY capabilities.

Corrections:

- “No sandbox” is incorrect as a statement of runtime state. Electron has defaulted `sandbox` to `true` since Electron 20 when `nodeIntegration` is disabled. This repository uses Electron 37 and sets `nodeIntegration: false` (`package.json:35`, `src/main/index.ts:247-251`). Explicit `sandbox: true` would document the invariant, not newly enable it.
- The bridge is not transferred from the old document; the preload exposes it anew to the navigated document. Security impact is unchanged.
- The demonstrated Markdown path requires a click. `react-markdown` does not execute raw HTML by default.
- The report missed a second serious issue: every popup URL is passed directly to `shell.openExternal` (`src/main/index.ts:263-265`). Electron explicitly warns that untrusted/custom schemes passed to `openExternal` can compromise the host. URL allowlisting is required even though window creation is denied.

Critical severity remains defensible because one click can expose terminal input and arbitrary file writes. Sender/frame validation and navigation denial are necessary; explicit sandboxing is defense/documentation rather than the missing control claimed by the report.

### F-02: Accurate

`doSave` closes over the `tabs` value from its render (`src/renderer/src/store.tsx:832-850`). `editContent` schedules state and then schedules that pre-update callback (`:863-880`), so the timer writes the last content visible to the prior committed render. That is commonly the penultimate edit, but React batching can make it older than one keystroke. Completion then installs the captured content as `saved`, clears `dirty`, and replaces `baseline` without checking current content (`:839-844`).

`resetAll`, close, delete, and rename do not cancel or migrate timers or `expectedRef` entries (`:348-362,668-694,747-824`). Main resolves the relative path against mutable `this.directory` only when the delayed write executes (`src/main/opencode.ts:476-478,1023-1030`). A timer created in repository A can therefore write A's captured content to the same relative path in B. An in-flight old save can also finish after a newer save.

The report's remediation is sound. Exact content alone is insufficient: workspace generation, content revision, completion validation, and per-file ordering/cancellation are all required. Flushing on workspace switch is unsafe unless the old root remains explicitly bound.

### F-03: Accurate with qualifications

The direct capability defects are confirmed:

- IPC has no sender or runtime argument validation (`src/main/index.ts:396-503`).
- Absolute reads use unrestricted Node `fs` (`src/main/opencode.ts:1007-1014`).
- Writes accept absolute paths and `..` because `writeFile` skips `safeRel` and `abs` preserves absolute paths (`:476-478,1023-1030`).
- `safeRel` is lexical; intermediate symlinks can make create/delete/rename act outside the root (`:1033-1099`).
- Terminal start accepts any renderer-provided cwd and input/resize values are unvalidated (`src/main/index.ts:479-494`, `src/main/terminal.ts:40-50`).

Qualifications:

- Deleting a final symlink usually deletes the link itself; the escape is through an intermediate symlinked directory.
- Unknown terminal IDs generally no-op (`src/main/terminal.ts:62-70`); arbitrary cwd and command input are the meaningful PTY powers.
- Behavior of relative reads delegated to the OpenCode service is not established here. The unrestricted absolute-read path is independently confirmed.
- `realpath` of the nearest parent is not fully race-proof if symlinks change between validation and mutation. The remediation needs an explicit symlink policy and validation immediately around operations, not a claim of perfect confinement from one pre-check.

### F-04: Accurate

A file update marks a dirty tab stale but does not cancel or block its timer (`src/renderer/src/store.tsx:905-940`). `doSave` ignores stale/disk state, writes unconditionally, then clears stale and dirty (`:832-850`). Main performs no compare-and-swap (`src/main/opencode.ts:1023-1030`). The report correctly identifies silent overwrite of agent/user/external work.

Canceling a timer only fixes writes that have not started. Once stale is detected, saves must be conflict-blocked or protected by a real version/CAS contract. A separate read-then-write check would still have a TOCTOU race.

### F-05: Accurate with clarification

Main has one mutable active session/root (`src/main/opencode.ts:371-375`). `openSessionById` activates after `session.get`, then waits for message history (`:723-788`). Renderer accepts every reopen completion without a request token (`src/renderer/src/store.tsx:489-521`), and startup restoration can race user activation (`:1140-1143`). File/tree/catalog reads are likewise unversioned.

The stated mismatch is possible, but “B history returns first, A later” is not sufficient by itself. A concrete sequence is: A lookup resolves and activates A; B lookup resolves and activates B; B history completes; then A history completes and renderer installs A while main remains B. The lookup/activation order is part of the proof.

Main serialization alone would not prevent stale renderer completions. Generations must be assigned at request acceptance, stale completions discarded on both sides, and mutations bound to expected workspace/session identity.

### F-06: Accurate

Activation mutates root/session and clears shared maps (`src/main/opencode.ts:656-665`). An already-running `onFsChanged` survives watcher shutdown and performs awaits while helpers and maps continue to use mutable global state (`:480-608`). An A callback can consequently populate B's maps and emit a path relative to B, including `../...`. Renderer accepts such updates without identity (`src/renderer/src/store.tsx:905-940`).

This finding alone confirms cross-workspace UI/baseline contamination, not a direct disk write. Medium to High is more proportionate than an unqualified High. Captured roots are not enough; generation checks must occur before map mutation/emission, and renderer messages should also carry generation identity.

### F-07: Partially accurate

The observed behavior is correct: main replaces the snapshot on editor save (`src/main/opencode.ts:1027-1030`), renderer replaces the tab baseline (`src/renderer/src/store.tsx:839-844`), and Monaco consequently shows no accumulated diff after save (`src/renderer/src/components/EditorPane.tsx:140-145`).

The report incorrectly treats the intended invariant as settled. Documentation is internally contradictory:

- `docs/shared.md:67-70` calls baseline “session start.”
- `AGENTS.md:52-54` and `docs/architecture.md:84-101` frame it as what the agent changed.
- `docs/walkthrough.md:134-136` explicitly says editor writes reset the baseline so the app's own edits do not count as agent changes.
- `docs/main.md:44` documents snapshot updates on write.

Baselines are also not universally literal session-start state: they may be pre-tool content, Git `HEAD`, first-observed non-git content, or empty content for a created file (`src/main/opencode.ts:491-501,590-595,1046-1053`).

The visible diff disappearance is a Medium provenance/UI defect, not High data loss. The product must first choose “all observed session changes” versus “agent-attributed changes.” Preserving the first baseline supports the former; a single mutable baseline cannot correctly subtract interleaved user edits for the latter.

### F-08: Accurate, severity overstated

`buildTurns` preserves body order (`src/renderer/src/components/OpenCodeTimeline.tsx:724-739`), but rendering filters all assistant items into one `AssistantTurn` before rendering all non-assistant events (`:868-879`). `assistant A -> shell -> assistant B` is therefore displayed as `assistant A -> assistant B -> shell`. The proposed contiguous-assistant grouping is correct.

This materially misrepresents chronology, but no execution or data-integrity effect is shown. Medium is more proportionate than High.

### F-09: Accurate

There are no test/spec files or test framework configuration, `package.json` has no test script (`package.json:7-14`), and CI runs only install/typecheck/docs/build (`.github/workflows/check.yml:17-20`). The cited reducer, replay, save, activation, watcher, and terminal paths are sufficiently complex that absence of tests is a material reliability risk.

High is defensible as a repository-level risk because multiple confirmed defects are in these state machines, though Medium would be conventional if severity is reserved for direct runtime failures.

### F-10: Partially accurate

Confirmed structural risks include uncapped tool/shell output retained in state, repeated linear transcript updates, a non-virtualized full timeline, and a broad active-state context (`src/renderer/src/chat-stream.ts`, `src/renderer/src/components/OpenCodeTimeline.tsx:851-883`, `src/renderer/src/store.tsx:1164-1229`). Render-time truncation does not release retained output.

Overstatements:

- Busy/transcript maps do not always persist for the window lifetime. `resetAll(false)` clears them (`src/renderer/src/store.tsx:348-352`); reopen uses `resetAll(true)` and preserves them. `usageBySession` is not cleared.
- Raw events are batched/coalesced (`:1116-1137`). Inactive-session updates do not necessarily change the active `transcript` reference or context value, so “every stream update” notifying all consumers is too absolute.
- No benchmark demonstrates an actual responsiveness ceiling. Confidence should be Medium for impact, though confidence is High for the structural facts.

Benchmark-first remediation is appropriate.

### F-11: Accurate

Closing the final terminal computes an empty list but returns before `setTerms(next)` (`src/renderer/src/components/TerminalTray.tsx:208-219`). The hidden tray remains mounted (`src/renderer/src/App.tsx:296-303`), so reopening shows the stopped tab. Natural exits are emitted by main but ignored because the renderer accepts only `terminal-data` (`src/main/terminal.ts:54-57`, `TerminalTray.tsx:155-169`). Data for unregistered IDs accumulates in an uncapped map (`TerminalTray.tsx:138-166`). Medium severity and the proposed lifecycle fixes are correct.

### F-12: Accurate with minor wording qualifications

Tool snapshotting recognizes only structured path keys (`src/main/opencode.ts:62-80,491-501`), so a shell command represented only by a command string has no pre-change snapshot. In non-git workspaces, the first post-change content becomes baseline (`:563-597`), producing an empty diff. The watcher has no actor provenance, and every accepted file update is placed in `agentFiles` (`src/renderer/src/store.tsx:905-912`).

“Every watched disk change is emitted” is too broad: skipped roots, duplicate content, directories, and some untracked deletions are excluded. The provenance and non-git false-negative conclusions remain correct. Git `HEAD` also does not prove actor provenance and can include pre-existing working-tree changes.

### F-13: Accurate

Every `shell.trashItem` rejection falls through to recursive forced removal (`src/main/opencode.ts:1061-1068`) with no confirmation or user-visible distinction. This can convert a transient Trash failure into permanent directory deletion.

The report slightly mischaracterizes documentation. `docs/main.md:47` and `docs/preload.md:32` do document the fallback; `docs/architecture.md:111-114` and `docs/walkthrough.md:160-163` describe only Trash. The defect is dangerous behavior and inconsistent prominence/consent, not a wholly undocumented fallback. Propagating Trash failure is the smallest safe fix.

### F-14: Partially accurate

Confirmed:

- README incorrectly says `npm run build` includes typecheck (`README.md:66-70`, `package.json:9`).
- `npm run check` omits build (`package.json:13`).
- No test/lint scripts exist.
- CI is Ubuntu-only and has no runtime/platform smoke tests.

Incorrect/overstated:

- CI **does** enforce the currently documented definition of done. AGENTS requires typecheck, build, and docs check (`AGENTS.md:72-76`); CI runs all three (`.github/workflows/check.yml:17-20`).
- Neither README nor AGENTS calls `npm run check` canonical. Its name is misleading, but that role is inferred.
- Tests, lint, packaging, PTY smoke tests, and a platform matrix are proposed improvements, not currently omitted parts of AGENTS' definition.

A more accurate title is: “The local aggregate command and README build description do not match the enforced gates.”

### F-15: Partially accurate

Portability and documentation defects are confirmed. `dev`/`start` use POSIX environment syntax and a Darwin-only executable (`package.json:8-10`). The helper exits on non-Darwin while claiming plain Electron will be used, but the caller still sets the macOS path (`scripts/make-dev-app.mjs:8-10`). Default Windows npm shells cannot parse the inline assignment. Generic docs do not state a macOS-only policy.

Login-shell drift is also confirmed. `-l -c` is used only to discover an executable; the PTY spawns it with `[]` (`src/main/terminal.ts:30-50`). Claims that the PTY itself is a login shell are false.

The ABI argument is overstated. No script invokes `@electron/rebuild`, so the architecture claim is false. However, installed `node-pty@1.1.0` is Node-API based, which is designed for ABI stability across Node/Electron. No PTY was launched during the original audit. Runtime compatibility remains untested; current ABI failure is not established.

### F-16: Partially accurate

The manifest's floating `next` tag is a real update-policy risk (`package.json:18`), especially for a beta protocol dependency without contract tests. The lock currently pins a concrete prerelease, while lock regeneration or explicit update can move it.

The reproducibility and Git claims need correction:

- `package-lock.json` is tracked, and CI uses `npm ci` (`.github/workflows/check.yml:17`), so current clean installs are locked and reproducible.
- Git ignore rules do not apply to an already tracked path. Modifying or deleting the lock remains visible in `git status`; `.gitignore:8` does not hide those changes.
- The ignore rule is still confusing hygiene debt and can affect re-adding after removal, but it does not undermine current tracked-lock visibility.

An exact manifest version is useful defense in depth. The accurate title is: “Locked installs are reproducible, but manifest-level client updates and lock regeneration are uncontrolled.”

### F-17: Mostly accurate

The script performs narrow regex/inventory checks and selected AGENTS/README link checks (`scripts/check-docs.mjs:27-141`). It does not validate behavioral prose, package command claims, all-doc links, line references, platform support, startup ordering, duplicates, or full shared type shapes. Its success output, “project brain is in sync with the code,” overpromises (`:154`). Duplicate `providerUsage()` rows pass (`docs/main.md:56,58`).

The report omits AGENTS' qualification: it says the script verifies “machine-checkable parts” and the “public, verifiable surface” (`AGENTS.md:98-112`). AGENTS' “every file the docs link to exists” is still broader than the implementation, which checks links in AGENTS and README rather than every doc.

This is mostly accurate but better characterized as misleading script branding/output and incomplete link scope, not a claim that AGENTS promises semantic proof.

### F-18: Valid concern, not a demonstrated defect

The line counts and concentration of responsibilities are accurate. The earlier races show that implicit global active-session ownership is problematic. File size itself does not establish a defect, and predictions about contributor scaling, test setup cost, or future rerenders are not measured. Low severity is appropriate; confidence should be Medium-High rather than High for the predicted impact. The report correctly recommends invariants/tests before extraction and rejects a broad rewrite.

## Documentation drift matrix review

| Matrix row | Verdict | Correction |
|---|---|---|
| Diff is exactly what the agent changed | Confirmed | Better wording is “file updates observed by the active watcher with partial baseline recovery,” not all workspace changes without qualification. |
| Baseline remains session-start content | Confirmed conflict | Direct contradiction is `docs/shared.md`; architecture describes several non-session-start baseline sources, while walkthrough explicitly documents save reset. |
| Main handles events before forwarding | Confirmed | Source emits first, then awaits side handling (`src/main/opencode.ts:448-451`). |
| SSE data forwarded verbatim | Ambiguous, not plainly false | Main really does put the complete `evt` unchanged in outer `BackendMessage.data`; docs should clarify that this creates a nested envelope and side handling receives inner `data/properties`. |
| Terminal is a login shell | Confirmed | Discovery is login-mode; PTY spawn is not. |
| `node-pty` rebuilt against Electron | Confirmed doc drift | No script invokes rebuild; lack of rebuild is not proof of current ABI failure because this version uses Node-API. |
| Build means typecheck + build | Confirmed | README conflicts with package script. |
| Generic dev/start workflow | Confirmed pending support policy | Scripts are not portable; declaring macOS-only support would resolve the documentation side. |
| Node 20+ is sufficient | Confirmed, but nuanced | Locked tools require narrower/newer ranges, including electron-vite `^20.19.0 || >=22.12.0` and rebuild `>=22.12.0`; npm usually warns unless `engine-strict` is enabled. Node 22 in the optional CDP example is not itself an app requirement. |
| `docs:check` means full synchronization | Mostly confirmed | Script output overpromises; AGENTS already says “machine-checkable” and “public, verifiable” surfaces. |
| Source line references are exact | Confirmed | Numerous references are stale by hundreds of lines. Symbol references are preferable. |
| Startup order | Confirmed | Actual order is start, forwarders, IPC, window, async connect (`src/main/index.ts:524-542`). Walkthrough already describes this correctly; `docs/main.md` does not. |
| Only one session exists | Confirmed wording defect | There is one mutable active backend session, not one service session per app run. |
| TerminalTray handles data and exit | Confirmed | It ignores exit. |
| Delete moves to Trash | Partially confirmed | Architecture/walkthrough omit permanent fallback; main/preload docs disclose it. User behavior remains unsafe. |
| TODO is actionable queue | Confirmed | Only an evergreen process checkbox remains open. |
| All opencode API traffic in `opencode.ts` | Incorrect matrix row | Cited docs say **opencode2** traffic and only `opencode.ts` imports `@opencode-ai/client`; provider HTTP APIs are separate and already mapped in AGENTS. Remove or rewrite this row. |
| Duplicate `providerUsage()` | Confirmed | Duplicate rows exist and the checker accepts them. |

## Material omissions from `findings.md`

### O-01: Unvalidated `shell.openExternal` is an independent security issue

`setWindowOpenHandler` sends every renderer-controlled URL to `shell.openExternal` before denying the Electron window (`src/main/index.ts:263-266`). This includes links with attacker-selected schemes from model-generated Markdown and `target="_blank"` file/tool links. Electron's security guidance explicitly says not to pass untrusted content to `openExternal`, because OS protocol handlers can lead to command execution or unsafe application launches.

This should either be part of F-01 or a separate High finding. Allow only explicitly intended schemes, normally parsed `https:` URLs (and narrowly designed local-file behavior if required), before calling `openExternal`.

### O-02: macOS reactivation starts duplicate SSE event loops

On initial readiness, `backend.start()` launches `runEventLoop()` (`src/main/index.ts:533`, `src/main/opencode.ts:434-437`). Closing the last window on macOS does not call `backend.stop`; shutdown occurs only in `before-quit` (`src/main/index.ts:553-559`). Dock reactivation then calls `backend.start()` again before creating a new window (`:544-548`). `start()` only sets `stopped = false` and launches another loop; it has no running-task guard.

After each close/reactivate cycle, another independent SSE subscription can remain active. This can duplicate renderer events, side handling, filesystem snapshot work, reconnect attempts, and resource use. The docs incorrectly call this “restartable” behavior (`docs/main.md:194-198`, `docs/walkthrough.md:210-216`). This is a confirmed High/Medium correctness and lifecycle issue. Make `start()` idempotent by tracking the running loop promise/controller, or stop and await the existing subscription before restarting.

### O-03: The documented editor/watcher dedupe mechanism is not implemented as described

Docs say the file-update handler consults `expectedRef` so editor echoes do not mark tabs stale (`docs/architecture.md:103-110`, `docs/renderer.md:79-82`, `docs/walkthrough.md:150-158`). In source, the file-update branch never compares incoming content with `expectedRef`; any update arriving while the tab is dirty sets `stale: true` (`src/renderer/src/store.tsx:905-929`). Save completion often clears it shortly afterward, which masks the mismatch.

This is lower impact than F-02/F-04 but is a distinct confirmed documentation/behavior defect. It also weakens the report's assumption that `expectedRef` currently identifies write echoes; it does not.

## Final assessment

The original audit correctly identifies the repository's most important classes of risk: renderer trust boundaries, stale/unbound saves, filesystem confinement, asynchronous session/watcher ownership, chronology, destructive fallback, and lack of tests. F-01 through F-06 should still drive immediate work.

The report should not be adopted verbatim. Before using it as a backlog, correct F-01's sandbox claim, downgrade/reframe F-07 and F-08, qualify F-10, rewrite F-14 through F-17, remove the provider-API drift row, and add the unsafe external-link and duplicate-event-loop omissions above. The original validation command results were not rerun for this review because this task was to verify the report and permitted creating only `findings2.md`; source inspection was sufficient to assess those historical result claims.
