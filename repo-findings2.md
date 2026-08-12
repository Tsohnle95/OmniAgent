# Review of `repo-findings.md`

**Date:** 2026-08-12
**Scope:** every factual claim in `repo-findings.md` (written at `HEAD`
`83b88d0`; review at `3e375b9`) was re-verified against the tree, package
manifests, docs, scripts, CI, and git history. No claim was accepted on
courtesy.

## Verdict

**Accurate.** Every claim checked out except one simplification that is
inherited from `AGENTS.md` rather than original error (see C-01). Line
counts, versions, IPC naming, docs-check scope, CI layout, and the git
history claims all match the repository exactly.

## Verified claims

| Claim in repo-findings.md | Verification |
|---|---|
| HEAD `83b88d0` "Repair launch lifecycle: surface lock conflicts and recover dead renderers" | `git log` — exact match |
| Worktree clean at start | `git status --short` empty |
| `opencode.ts` 1706 lines, `index.ts` 758, `provider-usage.ts` 578, `preload/index.ts` 94, `types.ts` 326 | `wc -l` — all exact |
| `store.tsx` 1494, `AgentPanel.tsx` 1148, `OpenCodeTimeline.tsx` 903, `FileSidebar.tsx` 440, `EditorPane.tsx` 228, `TerminalTray.tsx` 273, `Welcome.tsx` 142 | `wc -l` — all exact |
| Electron ^37, React 19, Monaco 0.53, Vite 6, electron-vite 4, Vitest 3, `@opencode-ai/client` pinned `0.0.0-next-17126`, node-pty, xterm | `package.json` — exact |
| Node engine `>=22.23.2 <23` and `.node-version` | both files match (22.23.2) |
| IPC channels named `shell:*` | `grep` in `src/main/index.ts` — 20+ channels all `shell:`-prefixed |
| Events batched/coalesced at 16ms, reduced per session id | `docs/events.md:13` (16ms frame) + TODO.md stream-model entry |
| Git `HEAD` used as baseline for observed changes | `opencode.ts:857-937` — `gitShow("HEAD:${rel}")` feeding `observedBaseline(hasGit, git)` |
| `docs:check` inventories IPC channels, `OpenShellBackend` methods, `window.openshell` contract, handled/ignored events, message kinds | `check-docs.mjs` lines 102-118 (IPC + methods), 130-133 (preload contract), 135-153 (event tables), 158-168 (message kinds) |
| CI: `npm run check` on push main + PR; 3-OS platform-smoke matrix | `.github/workflows/check.yml` — verify job + `test:platform` matrix (macos/ubuntu/windows) |
| Single `main` branch, `origin/main` | `git branch -a` — exact |
| Commit history entries and dates | `git log --date=short` — all 10 entries exact, all 2026-08-12 |
| Prior reports' baselines predate HEAD | `git merge-base --is-ancestor 35fd176 HEAD` — true; `updated-findings.md` cites `35fd176`/`24065f3`, both ancestors |
| 18 numbered findings in `findings.md`; 10 accurate / 7 overstated / 1 architectural in `findings2.md` | `findings2.md` verbatim confirms |
| `dev/` = gitignored macOS app bundle, `out/` gitignored | `.gitignore` + directory listing of `dev/OpenShell.app` |

## Corrections

- **C-01 (minor, inherited):** repo-findings.md states backend→renderer
  messages are `{kind: "event" | "file-update" | "session", ...}`, quoting
  `AGENTS.md`. The actual `BackendMessage` union in `src/shared/types.ts:312`
  has five kinds — `event`, `file-update`, `session`, `ui-command`,
  `recovery` — and `check-docs.mjs` additionally inventories
  `terminal-data` / `terminal-exit`. The finding is faithful to the
  documented convention but understates the real envelope; `AGENTS.md`
  itself is the simplified source.

## Conclusion

No substantive factual errors found. The report can be relied on as an
inventory of the repository at `83b88d0`; if it is kept, update the
message-kind line to the full five-kind union.
