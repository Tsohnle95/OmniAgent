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

## Constraints

- Removing an item must not silently delete the user's source files.
- Delete must remain destructive.
- A collapsed workspace must remain visible when another workspace is opened.
- A folder that is physically present must not be falsely reported as absent, and a folder that is absent must not be falsely reported as present.
- New fixes must be cross-referenced against this history and must target a distinct root cause.
