# OpenShell Problems

This file records the Explorer and workspace bugs investigated across iterations. Read it before changing related code. Do not repeat a prior fix without explaining why it addresses a different root cause.

## Current Bugs

1. The active OpenShell workspace does not show every directory physically inside its root. Previously imported `advanced-web-concepts` folders can remain on disk but be absent from Explorer.
2. After deleting `advanced-web-concepts` from disk outside OpenShell, dragging it into the OpenShell workspace can report `already exists` even when the item is not visible in Explorer.
3. With the OpenShell root collapsed, dragging `advanced-web-concepts` into the Explorer area can replace the visible OpenShell workspace instead of adding a second workspace panel.

## Prior Iterations

1. `0e88398`: added context-menu open/close regression coverage.
2. `0a215be`: isolated context-menu state from the main store to reduce whole-app rerenders.
3. `966b694`: persisted removed paths by workspace directory. This made removed entries invisible across reloads but did not remove physical entries from the workspace.
4. `b801305`: attempted to restore hidden entries when re-imported based on result name. This caused unrelated folders with matching names to be treated as restores.
5. `ea0baa6`: removed the Restore Removed Items context-menu action and automatic restore branch.
6. `2bd3dee`: reintroduced explicit drag restoration for a hidden path, initially matching by basename and then tightened to the exact active-workspace path.
7. `316b9c3`: routed background drops over a collapsed root to `addModelPanel`, while expanded-root drops still import into the active workspace.
8. `b03d769`: added Finder `text/uri-list` drag support because some macOS folder drags did not expose `File` objects.
9. Current iteration: invalidated the old hidden-path storage namespace because stale prior removals made physically present folders invisible. Also verified that collapsed-root background drops use workspace-panel opening rather than import validation.

10. `59c0216` improved stale metadata and Finder drag detection, but did not solve the active-panel-only Explorer design. Importing a folder already physically inside the active root can still emit a misleading duplicate error, and opening a second panel changes the sidebar to that panel instead of showing both collapsible workspace roots.
11. Current iteration: stopped reporting an error when the dropped source is already the exact active workspace path, and added inactive workspace root rows beneath the active tree so multiple open workspace panels remain visible and selectable.
12. Current iteration: remove all user-facing `restored` behavior. Workspace roots must render in panel creation order, not active-panel order, with a visual separator between roots.
13. Follow-up: exact existing-path drops now silently unhide the path when necessary, with no `restored` status or toast. Non-existing external imports still follow normal import handling.
14. Current iteration: a hidden target collision during an active-workspace import will silently reveal the existing target instead of reporting a duplicate. Collapsed-background drops remain separate workspace creation.
15. Current iteration: filesystem inspection confirmed `advanced-web-concepts` exists under the OpenShell root while persisted hidden-path state hid it. Persisted removal tracking is removed; Explorer state is now session-only and reloads enumerate the physical workspace again.
16. Current iteration: opening a nested folder as a second workspace must also hide that nested path from the parent workspace for the lifetime of both panels; otherwise the same physical directory correctly appears in both trees.
17. New requested behavior: right-clicking a workspace root must remove that workspace from the app without touching disk. Dropping a folder onto Explorer must switch the current workspace, not create an agent panel; agent panels are explicit UI actions only.
18. Current iteration: duplicate import outcomes are expected when a destination already exists, and the active workspace-only panel must replace the default agent tray rather than render beside it. Explicit agent-mode panels remain additional trays.
19. Current iteration: the default agent header now falls back to the active workspace directory name when the session has no title or agent name.
20. Rejected approach: adding workspace context to ordinary prompt text and answering workspace questions locally. OpenCode should receive repository context from the session location, as it does when launched in a repository.
21. Current iteration: OpenShell previously displayed the fallback `build` agent without applying it to sessions that had no recorded agent selection; new sessions now synchronize that real OpenCode agent selection.
22. Rejected approach: refreshing the transcript after prompt completion caused the optimistic user message to merge with the server user message, producing duplicate prompts. Do not use transcript refresh as the SSE fallback without an explicit deduplication strategy.
23. Current iteration: the transcript fallback now uses the session transcript endpoint directly and removes only matching optimistic user rows before merging canonical history; it must not reopen or activate the session.
24. Current iteration: external drops directly on a collapsed workspace root were routed to import instead of the same workspace-opening path as background drops.

## Constraints

- Removing an item must not silently delete the user's source files.
- Delete must remain destructive.
- A collapsed workspace must remain visible when another workspace is opened.
- A folder that is physically present must not be falsely reported as absent, and a folder that is absent must not be falsely reported as present.
- New fixes must be cross-referenced against this history and must target a distinct root cause.
