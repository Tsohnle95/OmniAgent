# 05 — Chat & Transcript

> **Sources:** `_agent.scss:1`, `_opencode-chat.scss:1` (1381 lines), `src/renderer/src/chat-store.ts`, `src/renderer/src/streaming.ts`

The transcript is the most complex subsystem — it replaces the generic `.agent-scroll` (agent-panel) host with a themed transcript built from OpenCode `session_turn` + `part` records projected into a timeline. The raw list is `src/renderer/src/chat-store.ts`; the streaming projection and 1 Hz heartbeats live in `src/renderer/src/streaming.ts`.

---

## 1. Panel host

`_agent.scss:1`, `_opencode-chat.scss:27`

```css
.agent-panel {
  --v2-… aliases of agent tokens (_opencode-chat.scss:1)
  --font-family-sans / mono / sizes / weights / line-height
}
.agent-panel .agent-scroll {
  /* overrides the generic agent-scroll */
  padding: 12 0 24;            /* 0 horizontal — rows carry their own gutters */
  gap: 0;                      /* row gaps are on the timeline */
  background: transparent;     /* transcript owns no bg */
  overflow-y: auto; overflow-x: hidden; overflow-anchor: none;
  overscroll-behavior-y: contain; scrollbar-gutter: stable;
}
.agent-scroll > * { width:100%; max-width:100%; min-width:0; }  /* tame flex children */
.opencode-timeline {
  --timeline-turn-gap: 24px;
  --timeline-row-gap: 16px;
  display:flex; flex-direction:column; /* rows are stacked; turn gaps are empty rows */
}
[data-timeline-row="TurnGap"] { height: var(--timeline-turn-gap); flex: 0 0 var(--timeline-turn-gap); } /* _opencode-chat.scss:48 */
```

Empty state `.agent-empty` / `.agent-empty-sub` (`13 dim / 12 faint`) in `.opencode-timeline` is centred with 20 px inline margin (`_opencode-chat.scss:37`).

Container queries inside `.agent-panel` hide the turn timer at `420px` and the status text at `340px` (`_agent.scss:191`), and tighten padding below `400px` (`_opencode-chat.scss:939`).

---

## 2. Turn grouping

```css
[data-component="session-turn-group"]       /* one turn — user + N assistants */
[data-component="session-turn"]             /* one message in the turn */
[data-component="session-turn-group"] > .opencode-row + .opencode-row { padding-top: var(--timeline-row-gap) }
[data-component="session-turn-group"] > [AssistantActivity]+[AssistantActivity] { padding-top: 5px } /* tighter inside an activity burst */
[session-turn] [session-turn-message-container] { width:100%; padding: 0 20px; display:flex; flex-direction:column; gap:0; overflow-anchor:none; }
[session-turn] [session-turn-message-content],
[session-turn] [session-turn-assistant-content] { width:100%; overflow-wrap: anywhere; }
[session-turn] [session-turn-assistant-content] { display:flex; flex-direction:column; align-self: stretch; } /* assistant flow is block, user flow is right-aligned */
```

Turns are the **user** perspective (`prompt` → `assistant replies`); within an assistant turn, rows are `TextPart`, `ToolPart`, `ReasoningPart`, `SessionNote`, `CompactionPart`, etc. Each row type is a distinct `data-component` selector so marketing and chat styles never collide.

---

## 3. Live activity dock

`_opencode-chat.scss:53`

```css
[data-component="live-activity-dock"]       { max-height:0; opacity:0; padding 0 18; transition max-height 180ms, padding 180ms, opacity 140ms  }
[data-component="live-activity-dock"][data-visible="true"] { max-height:42; padding 2 18 7; opacity:1 }
[data-component="live-activity"] { grid 1fr; min-height:33; padding 0 0 4 }
[data-slot="live-activity-title"] { color muted 12.5/500/19; ellipsis }
```

A thin strip above the transcript that animates open when the agent reports work (`session-activity.ts`). Hidden by default (height 0) — never reserve empty space.

---

## 4. Assistant activity stack

`_opencode-chat.scss:139` — the vertical trace of tool use:

```css
[assistant-activity-stack] { display:flex; flex:col; gap4; padding 2 0; ::before 1px muted vertical line top10/bottom10 left7 }
[assistant-activity-entry] { grid 15 + 1fr; min-height:26; gap8 }
  [assistant-activity-marker] { 15×26 centred; color muted (running→accent, failed→red) ; .codicon 11 + bg-base centre dot + pulse dot 7×7 }
  [assistant-activity-content] { min-width:0 }
```

The `::before` spine + `border 2 accent-dim` pulse gives a lightweight timeline feel without heavy chrome.

---

## 5. User message (right-bubbled)

`_opencode-chat.scss:187`

```css
[user-message] {
  width:100%; display:flex; flex-direction:column; align-items:flex-end; align-self:stretch;
  color var(--v2-text-text-base); font 14/21 regular sans
}
[user-message-attachments] { fit 82%/64ch right; gap8 wrap; margin-bottom8 }
  [user-message-attachment] { min220×48 pad0 10 flex; border .5/border-base radius6 bg layer02 }
    [user-message-attachment-file] gap8
    [user-message-attachment-name] ellipsis 12 muted
[user-message-body] { fit 82%/64ch right }
  [user-message-text] {
    display:inline-block; padding 9 14;
    border 1 rgba(accent .22) ; radius 18/18/6/18;  /* bottom-right corner is tighter — chat "speech" cue */
    background linear-gradient 160° (accent 24%→12% over bg-base)
    white-space pre-wrap; word-break break-word; unicode-bidi plaintext;
  }
```

Bubble corner-radius asymmetry (18/18/6/18) marks the speaker — assistant text is frameless (see §7) and reads as page copy, user text is enclosed.

---

## 6. Assistant blocks

| Component | Selector | Look |
|---|---|---|
| **Text** | `[text-part]` (`_opencode-chat.scss:267`) | Plain flow + conditional copy affordance: `[text-part-body]` with `padding-right:32` when `[data-copyable="true"]`; copy wrapper at `top0 right0` (`min24, gap10`) hidden `opacity:0 pointer-events:none` until `:hover/:focus-within`; button `24×24` (`_opencode-chat.scss:365`). Streaming makes markdown `color: mix(text-base 82%, bg-layer-01)` + `240ms` transition (`_opencode-chat.scss:505`). |
| **Reasoning** | `[reasoning-part]` (`_opencode-chat.scss:281`) | Collapsible head: `[reasoning-part-trigger]` (`26 min-h, 3 0 pad, 12/18 regular dim flex gap0`) with inline `title` (`muted 500`), `separator 2×2 dot`, `summary` (`faint ellipsis`), `arrow 14 muted opacity0→1 on hover/expand, rotates 180 when open`. Body `[reasoning-part-content]` (`8 10 pad, margin 4 0 6, radius7, mix 3% base, 12/18, white-space pre-wrap`). |
| **Markdown** | ` [markdown]` (`_opencode-chat.scss:398`) | Full prose flow: `14/168% 0.002em`. Headings h1 `17` / h2 `15` / h3–h6 `13 500` with `28/24/20` top margins. Bulleted `disc` + numbered `decimal` `8 0 12` + `32` indent, `li 8 gap`. Blockquote `border-inline-start .5 border-base` + `0.5 pad` muted. Inline `\`code\`` gets `2 4 pad mix 8% base radius4`. Code fencing `pre` is `34 16 16 pad` (`12 0 24 margin, .5 border-base, radius6, bg #eee5d4`), with absolute corner copy `26×26 muted → base on hover` (`_opencode-chat.scss:482`). Tables are `width100 collapsing` with `12 pad`. Images/videos `max100%`. Shimmer text `[text-shimmer]` runs a diagonal sweep animation when `[data-active]` (`_opencode-chat.scss:520`). |
| **Tool** | `[tool-part-wrapper]` (`_opencode-chat.scss:584`) | Collapsible row: `[tool-trigger] { 26 min-h, 3 0 pad }` (`_opencode-chat.scss:603`) — title `12/18 500 muted`, subtitle/arg `13/18 regular muted ellipsis`, status dot. `> [collapsible-trigger]` disables pointer `cursor default`; arrow `14, opacity0→1, rotates 180`. Content `margin 2 0 6 + padding 2 0 2 14` inside `2 solid muted border-left` (`_opencode-chat.scss:635`). Variants: `failed` makes title `mix 68% red` (`_opencode-chat.scss:590`). Subtypes: `[tool-io]` framed scroll (`.5 border-muted radius-sm`), `[tool-files]` list (`gap7 12/18 accent link`), `[nested-tool-calls]` indented (`margin 10 0 2 8 + padding-left10 + border-left`), `[edit-tool-*]` heads/stats/line states (`edit-stat-add green, del red, hunk accent` — `_opencode-chat.scss:735`). Width guard: `.tool-collapsible`, `[tool-io]`, `[tool*] card` are all `width min(100%,640px)` (`_opencode-chat.scss:585`) — tools never overflow the script. |
| **Task / delegation** | `[task-tool-card]` (`_opencode-chat.scss:763`) | Surface grid `16 + 1fr + auto, gap10, 8 10 pad, radius-sm, bg mix 4% accent + border .5` — clicking brightens to `mix 8%`. Holds `[task-tool-title]`, `[task-tool-status]` (`10/14 pill accent-tint`), `[task-tool-agent]` (`12/20 acute accent-tint pill max 14ch`), icon `16` + tail affordances. `@container` rules tidy at `380/260px` collapsing grid (`_opencode-chat.scss:945`). |
| **Sub-agent link** | `[subagent-link-card]` (`_opencode-chat.scss:930`) | Same grid surface as task but links to a child session. Disabled when not clickable. |
| **Progress** | `[session-progress-indicator-v2]` (`_opencode-chat.scss:895`) | 25 dots in a grid; each `[data-dot="0..24"]` runs a unique keyframe `session-progress-indicator-v2-dot-*` (alternating opacity 0.2→1) with `--_duration 1200ms` ease-out (`_opencode-chat.scss:977`). Task context recolours to accent. |
| **Session message** | `[session-message]` (`_opencode-chat.scss:1039`) | Inset aside: `padding 1 0 1 12` + `border-left 2 muted`; label/meta `11/16`; markdown inside is `6 top, 13 muted` (`_opencode-chat.scss:1059`). |
| **Session note** | `[session-note]` (`_opencode-chat.scss:1067`) | Flex row `gap7 12/18 muted` with `icon 13 muted` (error→red, success→green). |
| **Compaction** | `[compaction-part]` (`_opencode-chat.scss:1110`) | Flex row `gap12` — `[compaction-part-line]` 1 px divider + `[label]` centre muted `12` (`_opencode-chat.scss:1118`). |
| **Permission dock** | `[dock-prompt][kind="permission"]` (`_opencode-chat.scss:1121`) | Card `12 pad gap8 border .5 + radius8 bg layer01` with `header 14 500`, action dim + `code 11 mono break-all`, action buttons `wrap gap6`. |

---

## 7. Markdown prose — detailed

Scoped to `[markdown]` (`_opencode-chat.scss:398`) — all selectors are descendants so they never leak outside a TextPart:

- **Headings**: `h1–h6` cascade from `h1 17 → h2 15 → h3–h6 13 medium 20` — margins descend from `28→20→8` to compress the prose.
- **Lists**: `margin 8 0 12; padding-inline-start 32` — outside markers colour is muted; list items are spaced `8 bottom`.
- **Blockquote**, **hr** (`32 vertical margin`), **strong/b** (`500 inherit`), **a** (`accent` + `underline-offset 2 on hover`).
- **Code**: inline `2 4 mix 8% radius4`; fenced `pre code` is forced `display:block width100 pre-wrap overflow-wrap anywhere break-word 1.65/13` — so the horizontal overflow is contained and the corner copy affordance is not clipped.
- **Code token spans** `[data-code-token="comment|…"]` are supported: `comment faint italic, string green, number yellow, keyword accent, function text` (`_opencode-chat.scss:510`).
- **Shimmer** `[text-shimmer]` runs a `1200ms linear infinite translate` diagonal sweep from muted → base/accent at `gap 45ms per char`, paused/resumed via `[data-active]` / `[data-run]` attributes — the transcript can shimmer partial text while streaming without re-rendering the whole block.

---

## 8. Todo dock

`_opencode-chat.scss:1148`

```css
[session-todo-dock] {
  width:100%; min 78 max 244; overflow hidden;
  border .5/border-base; radius12; bg layer01;
}
[data-collapsed="true"] → min78 max78  (only header visible)
[data-action="session-todo-toggle"] { height42; pad 0 8 16 16; gap8; }
  [session-todo-progress] → 13/20 muted -0.04px white-space pre
  [session-todo-toggle-button] → 28×28 muted → hover layer02
[data-slot="session-todo-list"] { max168; pad 0 12 44; flex col gap6; overflow-y auto; scrollbar hidden }
[todo-item] → 14/20 regular; states: pending 0.92, completed/cancelled faint + strikethrough
  [todo-checkbox-control] → 17×17; ring (accent-dim/ accent on progress); spin 900ms; dot 6×6 muted pulsing
```

The todo dock overlaps the composer bottom by `margin-top: -18` when both are present (`[session-todo-dock] + .composer { margin-top:-18 }` — `_opencode-chat.scss:1262`) — it chips into the composer body edge by `0.5` so the card looks docked, not stacked.

---

## 9. Session prompt dock + composer host

`_opencode-chat.scss:1138` / `1264`

- `[session-prompt-dock] { width100; flex-col; pad 0 5 5; bg var(--v2-background-bg-base) }` — pins the composer at bottom.
- `.agent-panel .composer` overrides (`_opencode-chat.scss:1250`):
  - `gap4 border0 bg transparent` — the dock owns the bg.
  - `.composer-body { min96 pad0 overflow hidden border .5 radius12 bg agent-composer-background (+ inset accent glow) }` whose `focus-within` swaps to `agent-composer-focus-*`.
  - `.composer-input { 12 16 6 pad; 48 min / 180 max; 13/20 regular }`.
  - `.composer-actions { 44×12 8 pad gap4 }`, `.composer-chips` wraps without wrap; on `min 440` container the action moves to a second grid column (`_opencode-chat.scss:1315`).

---

## 10. Preservation notes

- Transcript horizontal overflow must always be contained — `overflow-x: hidden` on panel/scroll + per-row `overflow-wrap anywhere / word-break break-word / box-sizing border-box` on `pre`.
- Never add a global shadow inside transcript rows — the only depth cues allowed are the activity spine (`::before 1px muted`), todo `ring`, and composer `inset accent glow`.
- Markdown must remain scoped to `[markdown]` — raw `p, h1, li, code, table` selectors with no root scope will bleed onto the welcome / settings surfaces.
- Keep `width: min(100%,640px)` on `tool-part-wrapper` / `tool-io` etc — tools are allowed to be wider than prose but not wider than the agent panel core.
