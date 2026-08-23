# 07 — Overlays & Feedback

> **Sources:** `_agent.scss:209`, `_sidebar.scss:576`, `_sessions.scss:76`, `_composer.scss:414`, `_toasts.scss:1`, `_statusbar.scss:1`, `_error-boundary.scss:1`, `src/renderer/src/components/RecoveryNotice.tsx`, `src/renderer/src/w3c-validation.ts`

Every transient surface (context menu, composite menus, popovers, toasts, recovery rollbar, validation wash) is built from the same three tokens: translucent bordered `bg-elev/panel`, `border-strong`, `shadow-md`, radius `lg (16)` — except one large floating surface that elevates more.

---

## 1. Elevation ladder (quick map)

| Layer | Surface | Border | Shadow | Radius | Z-index | File |
|---|---|---|---|---|---|---|
| 0 — matte surface | Content panels (sidebar/editor body) | `hairline --border` | none | — | — | `02/03` |
| 1 — in-page menu | Dropdown/popover content that sits inside a pane (`bg-elev`) | `--border-strong` | `shadow-md` | `lg 16` | — | ctx, provider cards, etc. |
| 60 — floating popover | `agent-usage-popup`, `composer-menu`, `composer-completions`, `sessions-plugins-menu`, `sidebar-settings` | `--border-strong` | `shadow-md` | `lg 16` | `60–90` (see §3) | `_agent.scss:60`, `_composer.scss:60`, `_sessions.scss:90` |
| 70 — agent panel | Floating card `backdrop-filter blur(18)` (`_agent.scss:6`) | `1 solid --border` | `shadow-lg` | `xl 20` | `200` on its column (`_layout.scss:32`) | `03-layout` |
| 90–100 — system | `ctx-menu` `fixed 100` + `.toasts` `fixed 100` + `.recovery-notice` `1000` | — | — | — | `100` | `_sidebar.scss:577` / `_toasts.scss:7` |

> Menus and popups never add a larger shadow than the agent panel — the agent column guard in `z` keeps depth hierarchy legible.

---

## 2. Agent usage popup (`_agent.scss:251`)

The per-agent metrics + provider health popover top-locked to the agent header.

```css
.agent-usage-popup {
  absolute top calc(100%+6) right10 width min(300, 100-20) max calc(100vw-40)
  bg var(--bg-elev) border 1/--border-strong radius-lg shadow-md z 60
}
  ::before { 8×8 rotated 45 right14 top-5 same bg + top/left borders — CSS arrow}
  .agent-usage-scroll { max 100dvh-84 overflow-y overscroll-contain gutter stable radius inherit } _agent.scss:264
```

Inside (`_agent.scss:287`):

```
.agent-usage-head            11/700/0.6 uppercase faint gap6 icon 12 accent + 8 bottom margin
  .codicon accent 12
.agent-usage-cost             flex baseline space-between 8 bottom
  -label 12 dim / -value 16/700 tabular-nums
.agent-usage-context          8 bottom margin · head uses 12.5 baseline gap4 · bar 5×full rounded bg-active overflow hidden · bar fill ok/warn/danger → green/yellow/red _agent.scss:336
.agent-usage-context-percent  700 tabular-nums · variant colors mirror the bar
.agent-usage-context-counts   11 faint tabular-nums
.agent-usage-bar              5 height rounded overflow hidden 8 bottom = stacked seg bar
  .agent-usage-seg.input/.output/.reasoning/.cache → 4 hues (_agent.scss:372)
.agent-usage-rows             flex-col gap4 8 bottom · .agent-usage-row (12.5 baseline between)
.agent-usage-total            12 flex baseline between border-top 1 7 top  → label faint600 / value 700
.agent-usage-empty            12.5 faint 2 0 4 pad
.usage-provider-section       border-top 1 10 top content with refresh + empty/loading (±code styling) _agent.scss:415
  .usage-provider            border 1 1 10 radius-md bg-raised 7 9 pad + named plan-dot + plan-status colour 5 hues ok/stale… _agent.scss:482
  .usage-window-row / bar / reset / credits inverse cuts _agent.scss:536
```

Toggle: `.agent-usage-toggle` (`30×28 radius-md faint-dim hover bg-hover→accent tint + inset mix ring when .open _agent.scss:245`). Tier `.ok / .warn / .danger` colours the glyph before opening — `ok green / warn yellow / danger red`.

---

## 3. Other floating popovers & menus

### 3.1 Context menu (file tree actions)

`_sidebar.scss:576`

```css
.ctx-menu {
  position fixed; z-index 100; min-width176;
  bg var(--bg-elev); border 1/--border-strong; radius-lg; padding5; shadow-lg; display:flex; flex:col;
}
  .ctx-item  { gap8 6 10 bg transparent text 12.5 left radius-sm }  hover bg-hover .si-mini dim→accent
    .danger  { color var(--red); .si-mini red}
  .ctx-sep   { 1 height var(--border) margin 4 6 }
```

### 3.2 Sessions plugin menu

`_sessions.scss:76` (see `04-navigation-and-lists.md:§5.1`) — identical chrome (`bg-elev / border-strong / radius-lg / shadow-lg`), triggered from `.sessions-plugins` inside `.sessions-actions`.

### 3.3 Sidebar settings popover

`_sidebar.scss:115`

```
.sidebar-settings {
  absolute bottom calc(100%+8) left10 z90 min-width230
  flex col gap4 pads10 bg var(--bg-elev) border 1/strong radius-lg shadow-md
}
  .sidebar-settings-row  flex centre between gap12 11 dim
  .sidebar-settings-seg  inline-flex bg-inset radius-full 2 pad — active segment bg-active-pill _sidebar.scss:148
  .sidebar-settings-switch 30×17 radius-full bg-inset knob 13 faint → .on bg accent-dim knob accent translateX13 _sidebar.scss:170
```

### 3.4 Composer menus & completions

Full spec in `06-composer-and-input.md`, but summary overlay contract: `absolute bottom calc(100% ±N) (right|left)12 z60 bg-elev border-strong radius-lg shadow-md overflow-y auto; group/tool rows use bg-hover on hover; typing dims non-matches rather than hiding`.

---

## 4. Terminal tray chrome (`_terminal.scss:1`)

The tray is **not** an overlay — it is a structural panel that animates `height`, re-using the overlay spec only for its header:

- ` .tray-area { height0 → .open{ var(--tray-height)} transition 200 ease(0.16,1,0.3,1) ; & .dragging{ transition none } }`
- Divider `.tray-divider { cursor row-resize height5 }`
- Frame `.terminal-tray { height var(--terminal-height) ; bg var(--bg-panel) ; border-radius var(--radius-xl) var(--radius-xl) 00 ; box-shadow 0 -4 12 …, 0 -16 40 … }` (`_terminal.scss:33`) — a vertical mirror of the agent panel shadow.
- Header `.terminal-header { horizontal 8 12 4 }` — `.terminal-tab` (`4 12 pad 10.5/600` pill `radius-full`; `hover bg-hover`, `.active bg-active-pill` mirroring the editor tab).

---

## 5. Statusbar

`_statusbar.scss:1`

```css
.statusbar {
  display flex space-between gap10; height26 pad 0 10;
  background transparent; border-top none; color dim 11.5; z-index 60;
}
  .statusbar-btn { 2 10 radius-full gap6 11.5/500 dim → hover bg-hover text ; disabled faint }
  .validate-spinner { 10×10 ring 1.5 accent-dim top accent, 700 linear infinite }
  .validate-result { tabular-nums nowrap · { .clean→green .has-errors→red .has-warnings→yellow .failed→red } }
  .statusbar-path { color faint; tabular-nums }
```

Transparent by design — like the titlebar it should breathe over whatever pane happens to be behind it, not add its own border. Future branding should not turn it into a solid footer.

---

## 6. Toasts

`_toasts.scss:1`

```css
.toasts { fixed bottom18 left50 translateX(-50%) flex col 6 gap centre  z100 }
.toast  { bg var(--bg-raised) border 1/--border-strong radius-md 7 14 12.5 shadow-sm max70vw }  _toasts.scss:13
  .toast.error { border rgba(red .6) color #e2988a }
```

One line by default. No timed parade — one toast at a time centred at `bottom 18`.

---

## 7. Recovery notice

`_toasts.scss:25` / `src/renderer/src/components/RecoveryNotice.tsx:1`

```css
.recovery-notice {
  fixed right16 bottom16 z-index 1000;
  width min(440, 100vw-32); max-height min(420, 100vh-80); overflow auto;
  padding 14; border 1 rgba(#e0af68 .45); radius-lg; background #1c1812;
  shadow-md; color #efe7d8;
}
  p { 5 0 12 dim 12 }
  .recovery-record { gap4 9 0 pad border-top 1 rgba(white .08); spans ellipsis; small faint }
```

Warm disaster-yellow, **not** sage — intentionally distinct from the rest of the system so unsaved/session-recovery content is recognisable at a glance in dark mode. The dark colour is hard-coded (`#1c1812 / #efe7d8`) and does not theme-tokenise — in `paper` this notice is intentionally darker than any other surface so it reads as outstanding work.

---

## 8. Error boundary

`_error-boundary.scss:1` — full-crash surface:

```css
.error-boundary { height100 flex centred col gap14 pad32 bg var(--bg) text centre }
  -title { 18 red }                     _error-boundary.scss:16
  -detail { max680 mono 12 dim pre-wrap break-word } _error-boundary.scss:21
  -reload { bg raised 1/border-strong 6 14 radius-md 12.5; hover bg-hover → accent } _error-boundary.scss:30
```

Always rendered outside the app chrome (`App` → `ErrorBoundary` per above); does not use a modal scrim — it replaces the entire window with a diagnosable state.

---

## 9. Validation / lint cascade

`src/renderer/src/w3c-validation.ts` / `_statusbar.scss:54`

A statusbar-adjacent behaviour, not a popover. On `W3C`-validate the bar drops into a spinner (`validate-spinner`) then a status (`clean / has-errors / has-warnings / failed` at `tabular-nums 11.5`) next to the path breadcrumb. The bar reuses the statusbar button underline rhythm and never auto-pops a modal.

---

## 10. Preservation notes

- New overlays must **inherit** the `bg-elev + border-strong + shadow-md + radius-lg` recipe — do not invent a new chrome (e.g., a hard white popover in dark mode would clash with the matte paper).
- `z` should stay at `60` for most floating menus. Only escape to `90`/`100` for truely global layers (context menu, toasts). The tray and statusbar each claim `z 60` because they live on the same stacking stacking-plane as the agent panel's popovers — raising one without the other breaks layering.
- Always add `overscroll-behavior: contain; scrollbar-gutter: stable` inside every scrollable popover so long menus never scroll the underlying pane.
- Keep the recovery-notice black-earth (`#1c1812`) — theming it to paper would make it invisible as a warning state.
