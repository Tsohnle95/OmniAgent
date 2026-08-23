# 09 — Motion, Elevation & Interaction

> **Sources:** `_foundation.scss:65`, `_layout.scss:38`, `_sidebar.scss:100`, `_terminal.scss:7`, `_agent.scss:42`, `_scrollbars.scss:1`, `_composer.scss:38`, `_opencode-chat.scss:520`

Calm is not static — things move, but slowly, and only on the properties that composite. Depth is conveyed by wash + translucent edge, not by harsh drop shadows.

---

## 1. Motion budget

| Class | Duration | Easing | What may use it | What may not use it |
|---|---|---|---|---|
| **Hover** | `100ms var(--ease)` | default `0.2,0,0,1` | `color`, `background`, `border-color`, `opacity` | `width`, `height`, `transform` |
| **Soft** | `120ms` | default | `color` on pill/toggle/segment, icon tint on hover | `box-shadow` (reserved for composer) |
| **Focus** | `140–180ms` | default | `border-color + box-shadow` on `focus-within` (composer, agent input); `max-height / padding / opacity` on activity dock | background on large areas (too smudgy at 180ms) |
| **Structural** | `180ms` | default | `left`, `width` on `.agent-col.settling` (`_layout.scss:38`) | anything inside a scrollable list |
| **Drawer** | `200ms` | `cubic-bezier(0.16,1,0.3,1)` | `height` on `.tray-area` (`_terminal.scss:7`) — the sole panel-rate spring-timed drawer | other panels (would feel disconnected) |

```css
--ease: cubic-bezier(0.2, 0, 0, 1);           /* _foundation.scss:69 */
/* tray-only exception: 0.16,1,0.3,1 is the gentle pop for drawers */
```

Properties that **composite** (opacity, transform) are cheap; everything else is throttled to 100 ms so the UI never feels sticky when the agent is saturating the JS thread.

A utility guard: `.agent-col.settling { transition: width 180ms var(--ease), left 180ms var(--ease); }` is the only place a layout property animates — and it is class-switched only while the pane drag settles, not on every data update. Similarly, `.tray-area.dragging { transition: none; }` disables the 200 ms drawer while the pointer is down (`_terminal.scss:15`).

Reduced motion: `@media (prefers-reduced-motion: reduce)` suppresses all durations to `0.01ms` in the design study `design/session-panels.css:1202`. The shipped app inherits the same invariant — if a new animation is added, it must respect this media query by aliasing through `var(--ease)` or adding its own guard.

---

## 2. Elevation (without heavy shadows)

There are four elevation levels; none uses opaque black except the agent panel core:

| Level | Render | Token | Example |
|---|---|---|---|
| **0 — matte** | flat tint steps (`bg → inset → panel`) — differentiation is *colour* | `bg`, `bg-inset`, `bg-panel`, `bg-elev` matrix | App shell (`_layout.scss:8 bg-panel`), sidebar vs editor (`_sidebar.scss:3 bg-panel` / `_editor.scss:3 same`) |
| **1 — soft rise (inset)** | 1 px **border hairline** (`--border`, `--border-strong`, `--border-subtle`) | not a shadow | Every tree row hugging line (`_sidebar.scss:528 border-left 1`), divider (`_editor.scss:36 border-subtle`), section triggers — the lightest possible edge |
| **2 — popover** | `border 1/--border-strong` + `box-shadow: var(--shadow-md)` (`_foundation.scss:65`) | `shadow-md` | `ctx-menu` (`_sidebar.scss:580`), `agent-usage-popup` (`_agent.scss:257`), `composer-menu` (`_composer.scss:423`), `sessions-plugins-menu` (`_sessions.scss:88`), `terminal-tray` top cap is both this + a bottom-level hard bottom |
| **3 — floating card** | `border 1/--border` + `box-shadow: var(--shadow-lg)` + translucency `rgba(panel-float-color …)` + `backdrop-filter blur(18)` (`_agent.scss:1`) | `shadow-lg` + frosted glass | **Agent panel only** (`_agent.scss:6` + `_layout.scss:28 z:200`) — the only truly floating element |

Shadow values:

```
--shadow-sm (inset highlight)   0 1px 2  black≈18% + inset 1 white 3–45%   — for segmented controls  _foundation.scss:65
--shadow-md (popover)           0 2/8 + 10–16/30–38  brown 8–22%           — unchanged between themes
--shadow-lg (agent panel+frame) 0 2/6 + 10–12/24–28  brown 6–9 / black 7–9 — the only heavy shadow
--agent-composer-shadow         adds an accent tint 0 4 16 accent:2.5 + grain  — composer's inset glow _foundation.scss:26
```

Before adding a new `box-shadow`, check whether a tint (`bg-elev / bg-hover / accent-tint`) plus a hairline border already communicates the depth. Extra shadows make the app feel plastic.

---

## 3. Hover, focus, active — the three feels

### 3.1 Hover — a wash

Universal wash on rows, tabs, buttons:

```css
:hover { background: var(--bg-hover); color: var(--text); }
/* accent-omitted variant for pill controls: */
:hover { background: var(--accent-tint); color: var(--accent); }
:where(.sessions-row:hover)::before { background: var(--bg-hover); } /* reuses same wash on full-bleed lists */
```

See `tree-row:hover` (`_sidebar.scss:451`), `sessions-row:hover` (`_sessions.scss:282`), `tab:hover` (`_editor.scss:57`), `ctx-item:hover` (`_sidebar.scss:607`), `welcome-row:hover` (`_welcome.scss:328` — lifts sub to `surface-hover + hover`), `btn:hover` (`_buttons.scss:13 — brightens + accent border`).

Interactive vs informational distinction: items that *navigate* (`tree-row`, `session-row`) hover to `bg-hover` with dim→base text; items that *approve* (`composer-approval.active` `/ .panel-row-action`) hover to accent tint + accent tint text.

### 3.2 Focus — a ring

Two mechanics + one global fallback:

| Pattern | Selector | Look |
|---|---|---|
| Container focus | `.composer-body:focus-within`, `.agent-input:focus` | `border-color mix 50% accent + shadow 0 0 0 4 accent-tint` (`_composer.scss:57`, `_agent.scss:659`) — wraps the actual `<textarea>` so the halo fits the card, not the text |
| Control visible focus | `.composer-menu-item:focus-visible`, `.tabbar .tab:focus-visible`, `.btn: focus-visible` etc. | `outline 1 var(--accent) offset 1–2` (`_foundation.scss:154`) — the global default, reused by composer selectors, buttons, editors |
| Tab order trap | `.tree-input` (`_sidebar.scss:623  shadow 0 0 0 3 accent14`) | Renamer steals focus with a stronger halo |

Never combine a `box-shadow` hover halo and an `outline` halo on the same element — pick one.

### 3.3 Active / selected — the stamp

| State | Visual | Selector |
|---|---|---|
| Selected row | `background: var(--bg-active)` + `color var(--text)` (often plus icon turning accent) | `.tree-row.file.active` `_sidebar.scss:482`, `.sessions-row.focused` `_sessions.scss:286`, `active-wash` on `session-panels.css:918` |
| Active tab / pill | `background: var(--bg-active-pill)` + `color var(--text)` (+ `box-shadow 0 2 8`) | `.tab.active` `_editor.scss:59`, `.side-tab.active::after 2px accent` `_sidebar.scss:256` |
| Pressed segment | `background bg-active-pill + shadow-sm` | `.settings-segmented .on`, `.settings-switch.on`, `.sidebar-settings-seg .on` (`_sidebar.scss:166`, `_settings.scss:134`) |
| Selected plugin/item | `background accent-dim + color accent` | `.composer-menu-item.selected`, `.theme-card.selected`, `.welcome-tab.on` |

Hover and selected are distinguished by **weight and colour**, not by inverting the whole background to white — the calm survives selecting things.

---

## 4. Resize & drag interaction

### 4.1 Column resizing (`_layout.scss:97`)

```css
.divider          { position relative; cursor:col-resize; background transparent; z2 }
.divider::before  { absolute top0 bottom0 left -6 width13 cursor:col-resize }  /* fat invisible grab */
.panel-resize-handle { absolute top0 bottom0 width8 cursor:col-resize z4; .left{left0} .right{right0}}
```

The visible chrome is nothing — no track bar. The `::before` gives a generous 13 px hit-zone while the element itself remains invisible. The same trick is reused for `.sidebar-vdivider` (`height5 row-resize + border-top subtle` — `_sidebar.scss:415` ) which drags `var(--changes-height)` inside the sidebar.

### 4.2 File drag target (`_sidebar.scss:451`)

Four sibling visuals for four drop semantics:

- ` .tree-row.drop-target` → `bg accent-tint + inset ring accent` — a folder body glows.
- ` .tree.drop-root` → same but on the tree container — dropping into the workspace root.
- ` .tree.external-drop-active` → materializes `mix 72% accent-tint` + inset accent + `::after 2 dashed accent` overlay `_sidebar.scss:463`.
- ` .editor-pane.external-drop-active` → `inset 2 accent + 0 0 28 accent-tint` interior glow + translucent overlay `_editor.scss:13`.
- ` .composer-body.drag-over` → `accent + 0 0 0 4 accent-tint` (`_composer.scss:32`) and the persistent `composer-drop-hint` dashed dashed ring (`_composer.scss:38`).

All states use accent + accent-tint only — never red/yellow/skylines.

### 4.3 Sortable handle — tray drag (`_terminal.scss:1`)

- `.terminal-header.snapped { cursor pointer } :hover bg-hover`
- `.tray-divider { cursor row-resize height5 transparent }` — the drag target is always visible as a gap.
- Height is set by `style="--tray-height: Npx; --terminal-height: Npx"` and flushed through two nested heights (`.tray-area` + `.terminal-host`) with the 200 ms easing when `.open` and `transition none` while dragging (`_terminal.scss:15`) — matching the column-settle behaviour on the adjacent axis.

---

## 5. Activity cues (pseudo-animation)

| Cue | Drawn as | Spec |
|---|---|---|
| Live agent dot | `green dot + tiny glow` | `.agent-dot.live` (`_sessions.scss:295 green + box 0 0 6 mix45%`); `.panel-status-dot.live` (`_opencode-chat.scss:968 green + bg panel shadow`) |
| Busy pulse | Expanding ring on the 8 px dot | `.agent-dot.busy { background accent + animation pulse-ring 1.8 ease-out infinite }` (`_agent.scss:41`); keyframe expands from `0 0 0 0` → `0 0 0 8 rgba accent 0` |
| Streaming text shimmer | Diagonal `linear-gradient` swipe | `[text-shimmer]` `1200ms linear infinite translate 100%→0%` (`_opencode-chat.scss:520`); activated by `[data-active] + [data-run]` |
| Session progress dots | 25 dot grid with per-dot opacity keyframes | `[session-progress-indicator-v2] [data-dot="N"] animation 1200ms ease-out infinite opacity .2→1` — 25 individual keyframes (`_opencode-chat.scss:895`) |
| Todo pending ring | `border 2 accent-dim top accent` ring | `[todo-checkbox-control][data-in-progress] { spin 900 linear }` (`_opencode-chat.scss:1238`) |
| Validate spin | 10 px ring | `validate-spin 700 linear` (`_statusbar.scss:60`) |

At most one dot per line pulses (the ability line or the activity marker). Avoiding simultaneous pulses preserves the calm while streaming.

---

## 6. Scrollbar, overscroll & anchor

```css
::-webkit-scrollbar { width 8 height 8 }
::-webkit-scrollbar-thumb { bg rgba 0.14 border radius-full; hover 0.24 }         _scrollbars.scss:1
::-webkit-scrollbar-corner { transparent }

.tree, .changes-list, .sessions-pane, [session-todo-list], .agent-scroll
  { overflow:a auto; overflow-anchor none; overscroll-behavior contain/ y contain; scrollbar-gutter stable }

[data-slot="collapsible-content"] [tool-output] { max-height 240; overflow auto; white-space pre-wrap }
```

- Thin trimmed thumbs (`8 px, 2 px border-clip`) — never macOS thick scrollbars.
- `overflow-anchor: none` on `.agent-scroll` prevents Chromium scroll-anchor fighting while streamed rows are appending.
- `overscroll-behavior-y: contain` on every internal scroller so track-pad bounce never leaks the scroll into the outer app.
- Transcription panels hide internal scrollbar when they are discoverable (`[session-todo-list]::-webkit-scrollbar { display none }` — the content is peekable without visual chrome).

---

## 7. Focus traps & modality

- Popovers (agent usage `top +6 right10`, composer `bottom -2 right12`, ctx `fixed`, sessions plugins `top +4` — see `06/07`) trap by layer, not by modal scrim — pressing `Escape` dismisses at `z=60`. Only `sidebar-settings` and `ctx-menu` swallow outside click; others dismiss on outside press via the global dismiss handler.
- The recovery notice (`z 1000`) is modal in contrast (darker than everything) but not in event blocking — it shows while the app is otherwise usable.
- The permission prompt dock (`dock-prompt[kind="permission"]` — `_opencode-chat.scss:1121`) is the sole mid-stream interrupter — a framed card `12 pad radius8 border .5 bg layer01` with two actions, sits above the composer but below the activity trail so conversation context remains visible.

---

## 8. Container-query breakpoints (local, not viewport)

| Query | Effect |
|---|---|
| `@container (max-width: 420px)` inside `agent-panel` | Hide turn timer (`_agent.scss:192`) |
| `@container (max-width: 340px)` | Hide agent status text + tighten header (`_agent.scss:195`) |
| `@container (max-width: 400px)` / `380/260` inside transcript | Narrow `task-tool-*` + `tool/io` girds, wrap agent tail, shrink status pill (`_opencode-chat.scss:939`) |
| `@container (max-width: 460/280px)` inside `editor-pane` | Hide empty sub/details (`_editor.scss:222`) |

Any new responsive collapse must prefer `@container` so it reacts to pane width, not window width — the app always has 1–2 split panes in flight.

---

## 9. Preservation rules

- Do **not** introduce easing new than the two provided (`ease 0.2,0,0,1` + drawer `0.16,1,0.3,1`). A fast `ease-in` or spring `cubic-bezier(0.3…)` would read as a different app.
- Transmuting `transition: all` is forbidden — always specify the properties; many containers limit transitions to exactly the properties mentioned above.
- Hover may never disable a lighter state — e.g., turning the tree hover into a bright card changes the lightness budget and hurts the paper dark-mode luminance relation; washes must remain translucent.
- Never add `will-change: transform` unless a surface is demonstrably jank-prone; the only existing `will-change` is on `[text-shimmer]` (`_opencode-chat.scss:576`) for the streaming sweep.
