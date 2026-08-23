# 06 — Composer & Input

> **Sources:** `_composer.scss:1` (619 lines), `_agent.scss:627`, `_opencode-chat.scss:1138`

The composer is the bottom pinned input for turning intent into work. It appears in two hosts: the generic `.composer` (used when the prompt dock is inactive) and the transcript-pinned ` .agent-panel .composer` / `[session-prompt-dock] .composer` variant which adds a grid rearrangement at wide widths.

---

## 1. Anatomy

```
.composer
├─ .composer-body        inset card — border · radius-lg · bg-inset + inset shadow  _composer.scss:16
│    (or .agent-panel .composer-body overrides _opencode-chat.scss:1264)
├─ .composer-attachments  row wrap gap5                                          _composer.scss:191
├─ textarea.composer-input  flex1 min56 max160 7 8 transparent · 13.5/1.4       _composer.scss:85
├─ .composer-drop-hint      absolute dashed ring over body when drag-over         _composer.scss:38
├─ .composer-notice         10 yellow ellipsis single line                         _composer.scss:107
├─ .composer-actions / .composer-chips / .queued-chips (variants — see §4–5)
└─ overlays (absolute bottom):
     ├─ .composer-menu              310×340 max   south of composer  _composer.scss:414
     ├─ .composer-menu.add          200 fixed left                    _composer.scss:436
     ├─ .composer-completions       360×280 max   bottom-ish          _composer.scss:506
     └─ usage of any menu reuses .composer-menu-* line spec (§6)
```

Z-order rule: every composer popup is `z-index: 60`; the agent-panel's `.agent-usage-popup` and other floating panels also sit at `60`, so the composer menu's stacking order is set by DOM order and `bottom/calc(...)` offset, not by competing z.

---

## 2. `.composer` shell & `.composer-body`

`_composer.scss:1`

```css
.composer {
  position relative; flex-shrink:0; margin 6 10 8; padding 0; display flex; flex-col gap4;
  background transparent; border none; box-shadow none; min-width:0; max-width:100%;
}
.composer-body {
  min-height:0; display:flex; flex:col; gap8; padding 10 12;
  background: var(--bg-inset); border 1/--border-strong; radius var(--radius-lg);
  box-shadow 0 8px 24 rgba(0,0,0,.16); transition border-color 140, box-shadow 140 var(--ease);
}
.composer-body:focus-within {
  border-color: color-mix(sr --accent 50%, transparent);
  box-shadow: 0 0 0 4 accent-tint;
}
.composer-body.drag-over {
  border-color: var(--accent); box-shadow 0 0 0 4 var(--accent-tint);
}
.composer-drop-hint {
  absolute inset -1 z:5 flex centre gap7; border 1.5 dashed accent; radius inherit;
  background: mix(bg-inset 78%, transparent); backdrop-filter: blur(2); 11.5/600 accent-hover;
}
.composer-input {
  flex 1 1 auto; width 100%; min-height56 max-height160; padding 7 8;
  background transparent; border none; outline none;
  color var(--text); font inherit inherit 13.5/1.4; resize none; overflow-y auto; user-select: text;
}
.composer-input::placeholder { color var(--text-faint); }
.composer-notice { color var(--yellow) 10 ellipsis nowrap 0 6 pad }
```

The body is intentionally the *inset* surface (`var(--bg-inset)`) not the panel — the inset is always darker than the surrounding shell, so the composer looks engraved rather than floating. `focus-within` lifts the border with an accent mix halo.

### Transcript variant

When nested as `[session-prompt-dock] .composer` / `.agent-panel .composer` (`_opencode-chat.scss:1250`):

- The `.composer` shell becomes `gap4 border0 bg transparent` — the dock owns the bg.
- `.composer-body` shrinks to `min96 pad0 overflow hidden border .5 radius12 bg var(--agent-composer-background) (gradient + base) + agent-composer-shadow` — i.e., the floating paper/glow seen in §1.2 of `01-tokens.md`.
- Its `focus-within` uses `agent-composer-focus-*` rather than the generic mix.
- `.composer-input` is restyled to `12 16 6 pad 13/20/48→180` (the same inside the agent).
- `.composer-actions` hardens to `44 height / 4 gap / 12 8 pad` and `.composer-chips` becomes a straight `> nowrap` row.
- On `@container (min-width: 440px)` the body becomes `grid 1fr / auto` — input spans both columns, actions sit grid-right and chips grid-left inline (`_opencode-chat.scss:1315`) — so wide agent panels put the send button on the bottom-right rail instead of wrapping.

---

## 3. Inputs & textareas

| Element | Selector | Spec |
|---|---|---|
| Agent inline input | `.agent-input` `_agent.scss:645` | `bg-elev / color text / border 1 / radius-md / 8 10 pad / 13 / inherit / resize none` — `:focus` turns to `accent + 0 0 0 3 accent15` |
| Composer textarea | `.composer-input` `_composer.scss:85` | `transparent bg / no border / 7 8 pad / 13.5/1.4 inherit / resize none / 56–160` |
| Tree rename input | `.tree-input` `_sidebar.scss:623` | `bg-elev / text / 1 accent / 2 8 pad / 12.5 / radius-full / shadow 0 0 0 3 accent14` — pill. |
| Settings/provider inputs | `.provider-key-form input` `_settings.scss:188` / `.provider-toolbar input` `_settings.scss:163` / `.settings-select` `_settings.scss:197` | Consistently `bg-inset / text / 1 border-strong / radius-md / 7–9 pad 11`; `:focus` swaps to accent ring `0 0 0 2 accent-dim` — settings toolbar's input additionally uses `radius-full 9 12` + `min 280 / 42% width` |

Cursor focus indicator is always `1–1.5px accent + halo accent-tint` — no OS-standard outline is used inside composer regions (uses `:focus-within` on the container + `:focus-visible` rays on the inner controls).

---

## 4. Attachments & queued chips

### Composer attachments

`_composer.scss:191`

```css
.composer-attachments { flex wrap gap5 0 2 pad }
.composer-attachment  { gap5 max100% bg-hover border-strong radius-sm 10.5 dim 4 5 7 pad }
  .composer-attachment-thumb 18×18 cover radius4
  span:nth-child(2) ellipsis
  .composer-attachment-remove border0 transparent accent on hover 14/1
```

### Queued chips (persisted queue while agent is busy)

`_composer.scss:116`

```css
.queued-chips       { flex col gap4 2 6 6 pad border-bottom subtle }
  .queued-chips-head   dim 10 uppercase 0.4px + .queued-chips-count (yellow)
  .queued-chips-list   flex col gap2 max96 scroll-y auto
  .queued-chip         row gap2; .queued-chip-text 11 base ellipsis nowrap; .queued-chip-attachments  weak
  .queued-chip-button  20×20 base→ hover base (interactive-hover) ; disabled 0.35
```

The `queued-chip` layout mirrors `.composer-attachment` but lives *above* the composer (queue label + compact list). Its list is capped (`max 96` — just enough to show 2–3 chips) — scrolling handles deeper queues.

---

## 5. Action row & chips selectors

`_composer.scss:71`

```css
.composer-actions   { flex centre gap6 min0 }
.composer-chips     { flex centre gap6 min0 }

.composer-icon-button, .composer-approval  { 28×28 transparent faint → hover bg-hover text ; active .composer-approval .codicon green }
.composer-icon-button.active, .composer-approval.active → bg-hover text
.composer-selector  { h26 0 11 pad gap5 bg none border-strong radius-full 11.5 dim → hover/open mix45% text; icon 11  }
  .composer-selector.model   { flex 0 1 140 accent-hover mix35% border tint bg }  _composer.scss:310
  .composer-selector.strength { flex 0 0 auto max84 dim }  _composer.scss:316
```

Composable units:

- **Approval toggle** (`.composer-approval`, small circular) — active recolours `.codicon` to `--green` (`_composer.scss:279`).
- **Selector chips** (`model`, `strength`) — pill buttons that open the composer's menus; `model` is the bright sage-tint pill, `strength` is dim; both flex-constrain so they truncate (`overflow hidden on the 2nd span — _composer.scss:305`).
- **Send button** inside the transcript is `position:relative 28×28 radius-full bg var(--agent-send-background) color --agent-send-color shadow --agent-send-shadow` (`_opencode-chat.scss:1353`) — light on hover `brightness(1.08)`. Disabled `opacity .55`. When the stream is active the same button is `.stop`: `bg red / white text` with `hover mix 80% white` (`_composer.scss:357`). Outside the transcript the generic `.composer-send` (same spec) sits `margin-left auto` (`_composer.scss:331`).

---

## 6. Menus & pills

`_composer.scss:414` — every composer popup is `absolute; overflow-y auto; bg-elev; border-strong; shadow-md; radius-lg; z-index 60`.

| Class | Position | Size | Notes |
|---|---|---|---|
| `.composer-menu` | `bottom calc(100%-2) right12` | `310×340 max (100-24)` | Default right-aligned model/strength menus. Group row = `gap1`; group separators use `border-top` on `.composer-menu-group + … / .variant-menu` (`_composer.scss:444`). |
| `.composer-menu.add` | `left12 right auto` | `200` | Small left-aligned "attach/add" palette (`flex gap8` per item `_composer.scss:436`). |
| `.composer-completions` | `bottom calc(100%-4) left12` | `360×280 max (100-24)` | Typeahead (@-mention / file) (`_composer.scss:506`); has `head 10/700/0.6 uppercase faint 4 8 6` (`_composer.scss:522`) and item with icon `13 dim` + label `55% max ellipsis` + detail `11.5 faint` (`_composer.scss:535`). |

Menu internal line spec `_composer.scss:573`:

```css
.composer-menu-head   { 10/700/0.6 uppercase faint; width100 text-left gap5 } /* group header button with chevron */
.composer-menu-item   { flex centre gap8 width100 bg none text-dim 12.5 left 5 8 pad radius-sm; hover bg-hover → text ; .selected → text }
.composer-menu-empty  { 10 8 centred 12 faint }
.composer-menu-check  { 14 fixed; .codicon-eye green / eye-closed faint } _composer.scss:608
.composer-menu-star   { 13 faint→hover yellow→on yellow }                    _composer.scss:494
.composer-menu-title  { 10/700/0.6 uppercase faint 0 4 pad }
```

Shares the `.composer-pills` / `.composer-footer` row (`_composer.scss:366` — `flex gap8 0 2` + per-pill `2 8 pad radius-sm 11.5 dim` pill with `pop border accent on hover/open`).

Tab completions (not to be confused with composer completions) live on `.tab-actions` — `_editor.scss:82` / `src/renderer/src/components/AgentPanel.tsx` wire the menu to the prompt head.

### `aria` / keyboard

- `.composer-menu-item`, `.composer-selector`, `.composer-approval/icon-button/send` all expose `:focus-visible` rays (`outline 1 accent offset1` `_composer.scss:612`) — the visual is identical to the tree/toolbar focus and uses the global accent token.
- Typeahead completions specifically mark `.composer-menu-item.dimmed { opacity 0.5 }` (`_composer.scss:454`) when a result would mismatch the effective baseline — dimming rather than hiding preserves navigation continuity.

---

## 7. Other inputs in the app (for parity)

| Spot | Spec | Host |
|---|---|---|
| Settings toolbar search | `9 12 pad full text/strong border/inset radius-full; focus accent-dim shadow 2` | `_settings.scss:163` |
| Settings select | `7 30 7 10 pad 11 text/inset/strong border/medium radius-md` | `_settings.scss:197` |
| Terminal prompt (xterm) | `via @xterm/xterm` — styled by `_terminal.scss:33` panel, not by composer rules — its colours come from xterm theme mapping, not the 40+ tokens | `_terminal.scss:1` |

---

## 8. Preservation notes

- Never reintroduce a separated bright-card composer — the inset + subtle focus halo **is** the composer's identity; pushing it to a floating white card breaks the calm (and collides with the agent-panel float).
- `.composer-body` in transcript mode has `min-height 96` — dropping below ~96 causes the textarea to clip and hides the composer-action row.
- When the transcript todo dock is visible its negative overlap (`-18`) places its bottom edge *into* the composer body edge by `0.5` — floating either card alone would leave a gap; keep the adjacency override in `05-chat-and-transcript.md:§8`.
- Menus are `overscroll-behavior contain` + `stable gutter` — adding `contain` again elsewhere is redundant.
