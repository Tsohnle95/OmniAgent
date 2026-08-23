# 04 — Navigation & Lists

> **Sources:** `_sidebar.scss:1`, `_sessions.scss:1`, `_editor.scss:28`, `src/renderer/src/components/FileSidebar.tsx`, `src/renderer/src/components/SessionsPane.tsx`

The product is a navigational app before it is a chat app — files and sessions are transparent item lists. They share one interaction grammar so a keyboard user can treat them as one large listbox.

---

## 1. Shared list grammar

| Rule | Value | Applies to |
|---|---|---|
| Row height | `28px` (`--session-list-row-height` in sessions; hard `28` in sidebar tree ` _sidebar.scss:442`) | Every project head, session row, tree row, change row |
| Hover | `background: var(--bg-hover)` (`rgba….055/0.05`) | `.tree-row:hover` `_sidebar.scss:451`, `.sessions-row:hover` `_sessions.scss:282`, `.tab:hover` `_editor.scss:57`, `.welcome-row:hover` `_welcome.scss:328` |
| Active/selected | `background: var(--bg-active)` `(.14 alpha sage)` · `.tree-row.file.active` `_sidebar.scss:482`; or `.bg-active-pill` for tabs — chosen so hover and selection are distinguishable | Same rows + `.tab.active` (explicit pill) |
| Shape | `border-radius: var(--radius-full)` `999px`, `margin: 0 2 or 1 2` | Tree row, session row, project head |
| Text | `12.5px / 400–500 / -0.01em` · dim (`--text-dim` / `--text-faint`), `500` for file names | `tree-name` `_sidebar.scss:522` `500 -0.01`, `sessions-row-title` `_sessions.scss:323` `400 -0.01`, `tab` `_editor.scss:51` |
| Chevron | `IconChevronDown` 16×16 @ `stroke 1.5`, rotation `rotate(180deg)` for `.open` | `_sidebar.scss:407`, `_sessions.scss:230` — unified easing `transform 120ms var(--ease)` |
| Count pill | `.sidebar-count` / `.panel-count` / `.sessions-project-count` — pill or numeric text; warm muted casing; `.changes-count` is borderless | `_sidebar.scss:300`, `_sessions.scss:242` |
| Access | All toggles are `<button>` with a `.section-toggle` or `.tree-row` wrapper; chevron clicks are the button click | `FileSidebar.tsx` / `SessionsPane.tsx` |

> Constraint from `design/README.md:9` — titles `400–525` weight only. Boldness is encoded by **colour** (dim → base/accent) + background wash, not by heavier weight.

---

## 2. Side tabs (workspace vs external)

`_sidebar.scss:199`

```
.side-tabs { padding 0 14; margin-top -2; border-bottom 1 hairline; gap 0 }
.side-tab {
  position relative; flex inline
  padding 9 13 10 (first-child 2 left);
  color var(--text-faint); font 10.5/700/0.14em uppercase;
}
.side-tab + .side-tab::before { width 1 left divider var(--border-strong) }  _sidebar.scss:231
.side-tab::after { bottom -1; height 2; radius-full; transparent → accent for .active } _sidebar.scss:242
.side-tab.active { color var(--text); ::after bg var(--accent) }
```

Two tabs exist in the sidebar (`Explorer` / `Changes`-style groups vary by workspace). The bottom border is 1 px; the active underline sits at `-1` overlapping the border — it paints over the hairline rather than beside it.

---

## 3. Sidebar sections

`_sidebar.scss:291`

- Wrapper `.sidebar-section` is `flex-col min-height:0`; `.changes` variant uses `height: var(--changes-height) flex-shrink:0`; `.explorer` uses `flex:1` (`_sidebar.scss:293`).
- ` .section-trigger` is the header bar (`4 8 0 pad`); with the `.with-actions` modifier it becomes `flex space-between` with hover wash (`bg-hover + radius-full`), revealing `.section-actions` on `hover / focus-within` (`_sidebar.scss:336`).
- ` .section-toggle` is the left label button: `5 8 pad gap 6 w:100% text-left radius-sm 10/700/0.12em uppercase faint` — `hover / .open` bumps to `text` and `bg-hover` (`_sidebar.scss:374`). Component keeps `.push` spacer for right-aligned chevron/count.
- `.section-chevron-button` is the compact 24×26 icon-button variant used when the header owns a separate button rather than the whole bar (`_sidebar.scss:351`).
- `.sidebar-count` chip: `1 8 pad radius-full 10/700 accent-hover on bg-active` (`_sidebar.scss:300`). `.changes-count` strips to bare text (`_sidebar.scss:345`) since changes is already a small panel.

---

## 4. File tree (`src/renderer/src/components/FileSidebar.tsx`)

### 4.1 Row kinds

| Class | Selector | Visual |
|---|---|---|
| `dir` | `_sidebar.scss:505` | Folder icon (`--text-dim`, `--accent` when open) |
| `file` | `_sidebar.scss:488` | Doc icon (`--text-faint`, `--accent` when `.active`) |
| `active` | `_sidebar.scss:482` | `background: var(--bg-active); color var(--text)` + icon accent |
| `open` (dir expanded) | `_sidebar.scss:507` | Icon turns accent |
| `workspace-root` | `_sidebar.scss:509` | Bold-ish border-bottom subtle, `font-weight 600` |
| `drop-target` | `_sidebar.scss:453` | `background accent-tint + ring 1 accent` |
| `deleted` | `_sidebar.scss:489` | Name red + strikethrough; meta badge bg red14 |

### 4.2 Indentation & ancestry

```css
.tree        { padding 2 8 14 }
.tree-row      { gap7 · height28 · radius-full · min-width:0 · white-space:nowrap }
.tree-children { margin-left 14; border-left 1/border; padding-left 0 }
.tree-meta     { margin-left auto · 10 faint; .modified bg-accent-tint; .observed bg-sky14; .deleted bg-red14 } _sidebar.scss:534
.tree-badge    { 7×7 accent · glow mix 50% }
```

- Nested folders are indicated by a `.tree-children` left-rule indent, not by stepped padding — so 14 px per level with a continuous vertical hairline (`_sidebar.scss:528`).
- `external-drop-active` elevates the whole tree (`bg acc tint + inset ring accent + ::after translucent overlay across the tree interior` — `_sidebar.scss:463`), and the `drop-root` empty-drop style does the same for the root.

### 4.3 Inline editing & actions

- When a file/dir is being renamed/created, `.tree-input-row` swaps the label for `.tree-input` — `height 20`, `bg-elev`, `border 1 accent`, `radius-full`, focus ring `0 0 0 3 accent14` (`_sidebar.scss:623`). The row hover is suppressed while the input is active.
- Row actions `.tree-row-actions` (`hidden until :hover` — `display inline-flex`), gap `2`, per-action `.tree-row-action` `20×18` with hover `bg-active → accent` (`_sidebar.scss:637`).

### 4.4 Context menu

```css
.ctx-menu  { fixed z:100 min 176 bg-elev border-strong radius-lg 5 pad shadow-lg } _sidebar.scss:576
.ctx-item  { gap8 6 10 pad transparent text 12.5 left radius-sm }                  _sidebar.scss:589
 .ctx-item:hover { bg-hover }  .si-mini dim → accent on hover
 .ctx-item.danger { color var(--red) }  _sidebar.scss:611
 .ctx-sep   { 1 height bg border · margin 4 6 }
```

### 4.5 Change badges

Inline badge ladder for file state (`_sidebar.scss:540`):

- `modified` → `bg var(--accent-tint)` + `color accent-hover`
- `observed` → `bg rgba(sky .14)` + `color var(--sky)`
- `deleted` → `bg rgba(red .14)` + `color var(--red)`
- `changed .tree-badge` — dot lamp (7 px + glow).

---

## 5. Sessions pane

`_sessions.scss:1` — uses the same 28 px rhythm but adds grouping, pins, and a plugin popover.

```
.sessions-pane         6 8 14 pad; overflow-y:auto; --session-list-row-height:28 _sessions.scss:2
├─ .sessions-actions   2 4 8 row gap3                    _sessions.scss:11
│   ├─ .sessions-new   accent rounded 12.5/500           _sessions.scss:20
│   ├─ .sessions-file  square icon 29×29                 _sessions.scss:45
│   └─ .sessions-plugins (+ .sessions-plugins-menu)      _sessions.scss:46
├─ .sessions-section   gap0 · margin-top3                _sessions.scss:139
│   └─ .sessions-project group
│       ├─ .sessions-project-head  height28 margin0 2 radius-full hover: bg-hover  _sessions.scss:192
│       │    .sessions-project-toggle gap7 icon+name+chev+count
│       │    .section-chevron .si-chevron rotation 90 when open
│       │    .sessions-row-icon dim → accent when open
│       │    .sessions-project-count 9.5/400 faint pushed right
│       │    .sessions-project-new opacity0→1 on head hover/focus   _sessions.scss:250
│       └─ .sessions-project-sessions margin-left12 (nests sessions) _sessions.scss:263
└─ .sessions-row       position relative gap7 height28 pad4 8 margin0 2 radius-full  _sessions.scss:267
     .agent-dot live → green; .focused adds accent-tint box-shadow
     .sessions-row-title 12.5/400/-0.01 faint → text when .focused
     .sessions-row-pin pinned → accent always visible; otherwise opacity0→1 on hover
```

Virtualization note: `.sessions-section-list` is capped `max-height calc(rowHeight*7)` with `overflow-y: auto` + `overscroll-behavior: contain` + `scrollbar-gutter: stable` (`_sessions.scss:179`) — long session histories paginate rather than inflating the sidebar. The same cap pattern is re-evaluated if the row height changes.

### 5.1 Plugin menu

`_sessions.scss:76` — pops from the `plugins` trigger:

- `absolute top calc(100%+4) right3 z:90 min 220 maxH300 bg-elev border-strong radius-lg shadow-lg 5 pad flex-col gap1 overflow-y`.
- Items `.sessions-plugin-item` `6 8 pad radius-sm` with `sessions-plugin-kind` (`9/600/0.08em uppercase accent pill on bg-active`) + `sessions-plugin-name` (`flex1 ellipsis`) + `sessions-plugin-check` accent (`_sessions.scss:94`).

---

## 6. Editor tabs

`_editor.scss:28` — a pill-segmented horizontal tab strip independent from Monaco:

```
.tabbar  12 14 0 top · 4 pad · bg-inset + border-subtle + radius-full · scrollbar hidden
.tab       5 13 · 12.5 dim · radius-full · max 220 · gap6
           hover bg-hover→text; .active bg-active-pill + text + shadow 0 2px 8px  _editor.scss:59
  .tab-name       ellipsis gap6 · dirty dot 7×7 accent glow _editor.scss:72
  .tab-actions    gap2 · .tab-diff-badge (accent) + .tab-close (14 faint→text)
```

The pill container is itself the visual — tabs are *items on a tray*, not browser tabs. `active` is a raised stripe + shadow, hover is the same `bg-hover` wash as list rows.

### Editor toolbar

`_editor.scss:108` — `6 16 pad border-bottom 12 dim` row between tabbar and Monaco:

- Left: `gap8` — path (`ellipsis tabular-nums` `_editor.scss:121`), state hints (`editor-dirty yellow 11/600`, `editor-stale yellow 11`, `editor-deleted red 11` — `_editor.scss:128`), `.deleted-banner` + `.conflict-banner` (`_editor.scss:157`) rendered conditionally above the editor.
- Right: pill `.toolbar-btn` (`11.5/500 3 12 radius-full`; `.on = accent-dim/accent/accent + 600` — `_editor.scss:136`). These double as Edit/Diff toggles.
- Owner/resize hooks: `.editor-pane { margin-right: var(--editor-right,0px); container-type inline-size }` (`_editor.scss:1`) so the floating agent column doesn't overlap the last few columns.

---

## 7. Changes sub-list (inside sidebar)

`_sidebar.scss:292` — a second collapsible section above the tree:

- Outer height is `height: var(--changes-height)` — JS-managed so the user can drag a horizontal `sidebar-vdivider` (`height 5; cursor row-resize; border-top 1 subtle` `_sidebar.scss:415`).
- Inner list ` .changes-list { flex:1 2 6 8 }` (`_sidebar.scss:409`) uses the same 28 px row treatment but is filtered to computed diff against the effective baseline (session + git metadata watch — see `AGENTS.md:Architecture`).

---

## 8. Empty / no-result states

| Region | Class | Text | Treatment |
|---|---|---|---|
| Tree | `.tree-empty` `_sidebar.scss:430` | 13 faint/1.5 | Pad 10 12 inside the tree box |
| Sessions | `.sessions-empty` `_sessions.scss:370` | 10.5 faint | `5 10 pad` |
| Editor | `.editor-empty` `_editor.scss:192` | `42 icon faint + glow; title 14/500 dim centered; sub 12 faint` | Container-queries at `460px` (hide sub) / `280px` (collapse to icon ghost `_editor.scss:222`) |

---

## 9. Resizers & dividers

```
.divider  position relative z:2 cursor:col-resize; ::before catches 13px target (_layout.scss:97)
.panel-resize-handle { 8px edge strip z:4; .left {left0} .right {right0} } _layout.scss:114
.sidebar-vdivider    { 5px row-resize + border-top subtle } _sidebar.scss:415
```

All handles are invisible until drag — no grippers. Cursor changes to `col-resize` / `row-resize` are the only affordance.

---

## 10. Preservation notes

- Never introduce card stacks or shadows **inside** these lists — hover washes and pill shapes are the only item emphasis.
- Session and tree rows must keep the same 28 px rhythm and 999 px radius so folding depth reads consistently.
- Counts (changed-files / session count) are always muted (`--text-faint` / `accent-hover on accent-tint`) — never high contrast.
- Context menus use `fixed`, not `absolute` — they must float above the pane scroller without being clipped (`_sidebar.scss:577`).
