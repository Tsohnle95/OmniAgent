# TODO / working backlog

Add points here anytime — `- [ ]` for open items, `- [x]` when done.
A fresh session can start working from this file. Bigger ideas belong in
the README roadmap; this file is the actionable queue.

## Agent panel UX (Codex-style polish)

- [ ] Tool cards still feel "dry" — user wants Codex/Antigravity richness.
      Current: name, file/command detail, live args, elapsed time,
      collapsible output (auto-open on failure). Ideas: file-path chips,
      per-tool status colors, inline output preview, nicer permission UX.


## Sessions

- [ ] Session history / reopen — one session per app run today. The
      client has `session.list`/`session.get` + message replay; would
      survive app restarts and crashes without losing agent context.
- [ ] Persist model choice across sessions (last-used or config default).

## Model picker

- [ ] Dropdown is session-gated (`session && models.length > 0`) — decide
      whether it should appear on the Welcome screen too.
- [ ] Show provider alongside model name in the dropdown labels.

## Reliability / correctness

- [ ] Confirm `session.model.selected` always fires on session create, or
      rely fully on the `modelDefault()` seed (currently both exist).
- [ ] Verify tool-card behavior when events arrive out of order or when
      a session is opened mid-run (upsert logic assumes order-independence).
      

## My todo as i think of them:

- [ ] Need to add word-wrap feature in the app. I tried to use my muscle memory cmd + w to enable word-wrap, and it closed the app and destroyed my session. 
- Also, for the right-hand panel in the model message view, make it mimic like open code desktop type logic or open code V2. No, let's go open code desktop type message logic, to which it shows and think and display all the information in the style that Open Code Desktop does. Right now it's displaying like every read path inside of a giant rectangle and it's kind of an eyesore.
- I can't currently scroll in the right-hand panel model message view. So, as it fills up with messages, it doesn't auto-scroll to the bottom, and I'm not able to actually scroll, so let's fix that.
- In the file panel on the left tray, I can't drag the changes bottom panel away to see all the changes that are buried in there. And also, the files, I still can't see any folders, they're just they represent they rep'reresented as periods. Please revamp and increase the attention to detail for the UI of the left-hand file panel.
- I need to be able to sort the models by providers. So if you can add that into the model selection area
- The app is not draggable or movable. I can't move the app to a different screen or anything like that, so please make sure everything is completely movable and responsive.
- The app is not very responsive right now. If I close the tray, uh the bottom part of the app disappears, for example. So make sure it's all responsive and that none of the functionality or the UI disappears if it shouldn't.
- I want to be able to add a terminal into this uh this app, just like in VS Code. I can like pull up the bottom tray and I can select a terminal and I can work in there. I want to be able to add that functionality here as well.
- Also, the title of the app and then the file path and the very top left with the tray, it's literally overlapping the Mac, close, expand, and minimize area. So, can you shift that over a bit so I can actually see the closing and whatever buttons.

      

## Docs / brain

- [ ] Keep `npm run docs:check` green on every change (see AGENTS.md).
