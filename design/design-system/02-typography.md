# 02 — Typography

> **Sources:** `_foundation.scss:138`, `_welcome.scss:82`, `_opencode-chat.scss:18`, package `package.json:25`

The system uses three families, never more. Weight carries most hierarchy — size steps are small (±1–2 px) and tracking is measured in hundredths of an em.

---

## 1. Families

| Role | Stack | Where | Notes |
|---|---|---|---|
| **UI sans** | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` `_foundation.scss:141` | Everywhere except the hero and code. The only font on `body`. | System font — no web-font load, crisp on macOS retina, neutral. |
| **Serif display** | `"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Georgia, serif` `_welcome.scss:11` · loaded as `@fontsource/cormorant-garamond:5.3.0` `package.json:25` · referenced as `var(--serif)` `_welcome.scss:76` | `.welcome-title` (`_welcome.scss:74`), `.welcome-empty` (`_welcome.scss:305`) — marketing surface only | Never in panels, trees, rows, or chat. Reserved for the splash moment. |
| **Mono** | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` `_opencode-chat.scss:19` · `SF Mono` · `"SF Mono", Menlo, monospace` in `_editor.scss` / `_settings.scss:72` | Code blocks (`_opencode-chat.scss:481`), tool IO (`_opencode-chat.scss:627`), editor area via Monaco, stats (`_opencode-chat.scss:734`), settings section numbers (`_settings.scss:72`), statusbar path, conflict/terminal output | Never for marketing copy. |

`button` explicitly reasserts `font-family: inherit` (`_foundation.scss:160`) so UA defaults cannot leak in. Composer uses `font: inherit` / `font-family: inherit` on every input and menu item.

---

## 2. Global defaults

```css
body {                                   /* _foundation.scss:138 */
  font-family: -apple-system, …;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  user-select: none;                     /* text is re-enabled per region (§6) */
}
::selection { background: rgba(126,153,132,.32); }  /* _foundation.scss:150 */
```

The app is a tool with draggable surfaces; `user-select: none` on `body` prevents accidental text trails, then individual scroll/text regions flip it back on.

---

## 3. Type scale (as used, not invented)

There is no strict 4/8 px scale — sizes evolved per component. This is the **as-built inventory** from the stylesheets:

### 3.1 Chrome / small UI (9 – 11.5 px)

| Size | Weight | Case / tracking | Tokens / examples |
|---|---|---|---|
| `9px` | `700` | `uppercase 0.15–0.16em` | Kicker: `.review-kicker` · `design/session-panels.css:129`, `.welcome-eyebrow` `_welcome.scss:86`, `.settings-page-kicker` `_settings.scss:41`, `.panel-section-head.count-none` context |
| `10px` | `700` | `uppercase 0.08–0.12em` | Sidebar section toggle `_sidebar.scss:387` (`10px 700 0.12em uppercase`), panel section head, composer notice `_composer.scss:109`, usage provider plan `_agent.scss:501` |
| `10.5px` | `500–600` | often `uppercase 0.13–0.14em` | Side-tab `_sidebar.scss:217` (`10.5/700/0.14em uppercase`), `.side-tab` first-class citizen; sessions file/plugin btn `_sessions.scss:59`; agent status `_agent.scss:155` (`10.5/400 capitalized`); `usage-window` labels `_agent.scss:550` |
| `11px` | `400–600` | normal | Turn timer `_agent.scss:185`, queued chip `_composer.scss:158`, conflict banner `_editor.scss:172`, terminal tab `_terminal.scss:78` (`10.5`), statusbar `_statusbar.scss:11` (`11.5`) |
| `11.5px` | `400–500` | normal | Busy line `_agent.scss:640`, window value `_agent.scss:547`, welcome row meta `_welcome.scss:365`, theme copy small `_settings.scss:121` |
| `12px` | `400–600` | normal / generous leading | Composer selector `_composer.scss:296`, input, settings list row `_settings.scss:130` (`12.5`), welcome-row-title is `12.5` |

### 3.2 Body / row titles (12.5 – 14 px)

| Size | Weight | Usage |
|---|---|---|
| `12.5px` | `400–600  -0.01em` | **The system's favourite size.** Tree name `_sidebar.scss:523` (`500 -0.01em`), session row title `_sessions.scss:323` (`400 -0.01em`), tab `_editor.scss:51`, welcome row title `_welcome.scss:357` (`600`), composer-menu item `_composer.scss:582` (`12.5 dim`), welcome pane etc. Intervals like counts use `9.5–10px` at same line. |
| `13px` | `400` | `body` default · `_foundation.scss:142`; composer input `_composer.scss:97` (`13.5/1.4`); `agent-input` `_agent.scss:653`; welcome sub `_welcome.scss:95` (`13.5/1.7`) |
| `13.5px` / `14px` | `400 regular` | Chat markdown body `_opencode-chat.scss:404` (`14/21 0.002em`); `--font-size-base: 14px` is the chat budget. Theme card copy `13px`, welcome mark-adjacent. |

### 3.3 Headings / display

| Size | Family | Weight | Case | Usage |
|---|---|---|---|---|
| `clamp(48px, 5vw, 68px)` | Cormorant Garamond | `500` `-0.02em` | Titlecase | `.welcome-title` `_welcome.scss:76` — hero only |
| `28px` `-0.035em` | UI sans | `—` | Titlecase | Settings page header `_settings.scss:49` |
| `24px` | UI sans | — | Titlecase | Settings about title `_settings.scss:220` |
| `18px` | UI sans | — | Titlecase | Sidebar settings header strong `_sidebar.scss:64`, error title (`_error-boundary.scss:15` `18 red`) |
| `16px` | UI sans | — | Titlecase | Settings section heading `_settings.scss:73` |
| `17px` / `15px` / `13px` | UI sans / Mono | `490` | Titlecase | Markdown `h1` `17` · `h2` `15` · `h3/4` `13` inside `_opencode-chat.scss:437` — scoped to `[data-component="markdown"]`; outside markdown the UI rarely uses a true heading |
| `12.5px` | UI sans | `600` | Titlecase | Settings list row strong `_settings.scss:130`, sessions row title |

### 3.4 Mono specifics

| Stack | Size | Line-height | Usage |
|---|---|---|---|
| `ui-monospace, SF Mono, Menlo, Consolas` | `11–12px` | `16–18px` | Tool IO `_opencode-chat.scss:627` (`12/18`), reasoning content `_opencode-chat.scss:359` (`12/18`), patch diff `_opencode-chat.scss:749` (`12/18`), provider monogram `_settings.scss:173` (`10 SF Mono 700`) |
| `SF Mono` · `10px` | `10` | mono | Settings section index `_settings.scss:72` (`10 SF Mono accent`), statusbar path `_statusbar.scss:83` |
| Inherited `12px` | — | — | Editor via Monaco (`_monaco.ts:1`), xterm in terminal |

---

## 4. Weight ladder

Weights are deliberately narrow — calm comes from restraint, not from mixing ultra-light and black.

| Weight | Where it is allowed |
|---|---|
| `400` regular | Body, rows, faint labels. The default. |
| `490–500` | Row names (`_sidebar.scss:523` `500`), composer-menu items, section headings, queued chips. Mapping note: chat tokens define `410 / 490` to use on variable-font systems; code falls back to `400 / 500`. |
| `600` semibold | Side-tab title (`_sidebar.scss:29`), group headings (`12.5 600`), welcome title (`500`), active tab (`500`), tabbar active, any active/selected row, titlebar `650` (`_layout.scss:68`) — the sole `650` in the app, required for macOS titlebar legibility. |
| `700` bold | Kicker (`_welcome.scss:86` `700 0.22em uppercase`), sidebar section uppercase (`_sidebar.scss:387` `700`), usage-provider-title `700`, small uppercase chips. Never a whole paragraph at 700. |

> `design/README.md:9` caps session-panel title weights to `400–525`. The shipped sidebar respects this: active row boldens by colour, not by jumping to 700.

---

## 5. Case & tracking

- **Uppercase** with `letter-spacing: 0.12–0.22em` is the detail type: kicker (`0.22em`), side-tab (`0.14em`), panel section head (`0.12em`), app title (`0.14em`), usage head (`0.6px` ≈ `~0.05em`).
- **Capitalize** is used only for agent status (`text-transform: capitalize` `_agent.scss:157` — `Thinking` / `Working`).
- Everywhere else is sentence / Titlecase with `letter-spacing: -0.01–0.02em` on titles to tighten large headings and `0.01–0.02em` on tiny meta to loosen them.

---

## 6. Selection & truncation

- Row titles (`tree-name`, `sessions-row-title`, `tab-name`, `panel-row-title`) all use `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` — single-line truncation.
- Chat markdown code inside `pre` uses `white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word` (`_opencode-chat.scss:476`) — never clipped.
- Selection highlight is sage-washed: `rgba(126,153,132,.32)` (`_foundation.scss:151`) in both themes.
- Regions that contain user/typeable text re-enable selection: `.agent-scroll`, `.composer-input`, `.agent-input`, `pre code`, `.tree-input`, markdown paragraphs (`_agent.scss:603` `user-select: text`).

---

## 7. Titlebar & hero — the two exceptions

| Location | Spec | Why it differs |
|---|---|---|
| `.titlebar-title` `_layout.scss:64` | `12.5 / 650 / 0.14em uppercase / dim` | Must scan like a native macOS title (traffic-light proximity). The only `650` in the app. |
| `.welcome-title` `_welcome.scss:74` | `Cormorant Garamond 500 clamp(48–68) -0.02em` | Marketing moment — the single serif statement. No other surface uses serif at this size. |

Everything between these poles (top chrome vs marketing) lives inside the 10–13 px / 400–500 / tight-tracking core described above.

---

## 8. What not to do

- Never introduce a new family (no Inter, no JetBrains Mono import — use the stacks above).
- Never use `font-weight: 800+` or `letter-spacing: >0.22em` — they break the calm (hard caps in the design study, `design/index.html:49`-`66` badge row).
- Never render display serif outside `welcome` / marketing.
- When adding a new component, pick a size that already exists in §3 — the scale is intentionally sparse so the app reads as fashion-clean, not as a typographic catalog.
