# TODO / working backlog

Add points here anytime — `- [ ]` for open items, `- [x]` when done.
A fresh session can start working from this file. Bigger ideas belong in
the README roadmap; this file is the actionable queue.

Work order: execute per `docs/dispatch.md` (one commit per unit, `npm run check`
green before each commit, fresh reviewer + mechanical closure at the end).

Wave 1 (parallel — disjoint file areas):
- recovery retention (main process)
- packaging / launch button (scripts)
- HTML/CSS validation (editor/monaco)

Wave 2 (sequential — shared agent panel/store files):
- `/` commands + @file support
- context-window usage tracker
- subagent session links

Wave 3 (sequential): folder drag-and-drop (sidebar/store)

Wave 4 (last, cross-cutting — restructures session state): concurrent
multi-session/window support

- [x] - `.openshell-recovery/` transactions are never deleted, so every app-mediated save leaves 3 full file copies behind and the dir grows forever. Add retention: on activation, purge `complete`/`failed`/`acknowledged` transactions older than 24h, and interrupted (`source-held`/`held-validated`) ones older than 7 days. (`.openshell-recovery/` is already gitignored.)

- [x] - there seems to be a run failed every time i push code to github? what is this? does it need to exist? — Fixed: `scripts/check-docs.mjs` still required the deleted `final-document.md`, breaking the `verify` job on every push. Removed the reference; CI gate is green again.

- [ ] Agent commands in the chat input when I type / are missing. Where is opencodes compact command? Look into this. Also confirm that the @file feature works to give the model access to that file context in the chat, or however it's supposed to work.

- [ ] - My session usage tracker does not track the total context of this conversation that's been taken up. It just shows me input, output, cache, total tokens, etcetera but it doesn't show me what I've actually used that the model itself can handle for total context. So please fix that. Turn the icon into a little circle that uh changes color based on the amount of context being taken up. A little spinner type of thing. Doesn't have to move, but a circle type of spinner looking thing. 

- [x]  it seems when something dispatches a sub-agent, it doesn't indicate that to me. I want to copy openchamber's functionality where they provide a link to the subagent task, so you can click it and see what it's doing. Again, currently all I can see is: Subagent
* Subagent
* agent=generalprompt=You are reviewing a plan to fix inconsistent vertical spacing in t…{
*   "metadata": {
*     "sessionID": "ses_0084ad34fffe5eoTJrdIHFxE3n",
*     "status": "running"
*   }
* } - this is a very poor user experience. Please fix this so I can click the subagent link and view it, as well as have a return link to the main session.

- [ ] When I go to create a folder or anything in the explorer area, I'm not able to drag folders out of their current hierarchy and into different places, so I need to be able to do that.

- [x] - add w3c or equivalent html and css validation functionality like in vs code

- [ ] I want to be able to start entirely new model sessions, where it spawns another identical model panel with the same resizing panel logic, where you can pick another work space, etc. also add a sessions tab with the recents and saved workspaces, so i can swap sessions easily By clicking them.

- [x] I want to be able to add some sort of a or build some sort of a launch button so I can treat this like a normal application, like any other application built with Electron, like Spotify, for example. I don't want to have to keep building it by clicking the build command in the root. I want to be able to drag this to my applications folder and then bring an icon into my dock.

## Docs / brain

- [ ] Keep `npm run docs:check` green on every change (see AGENTS.md).
