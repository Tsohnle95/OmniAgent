# Landing page directions — fifty calm fronts

Open `index.html` in a browser to review 50 landing directions. The gallery is searchable, filterable by family, previewable in both themes, and supports a shortlist of up to four (persisted per browser).

The set is distilled from the shortlisted **001 "Atelier Split"** of the earlier 20-direction round. Every concept keeps one fixed hierarchy and differs only in composition:

- bare Orbit mark (no container chip);
- serif title → one line → one action → calm recents;
- no feature lists, no drop hints, no runtime picker.

Every concept shares the Orbit paper system:

- System UI stack (`-apple-system`) + `Cormorant Garamond` serif for the hero title only (`_welcome.scss:11`);
- Cream `#fbf7ec` / `#f4eee1` / `#eee5d4` and sage `#617a68` tokens (`_foundation.scss:75`, `_foundation.scss:109`);
- Hairline borders `rgba(43,33,25,0.05–0.15)`, pill radii `999px` / `16` / `20`, and `var(--bg-hover)` washes — no heavy card stacks or plastic shadows;
- Title weights 400–525, sizes 26–110px in mock scale (real hero is `clamp(48,5vw,68)` at 500).

Runtime selection lives in **Settings → Model → Agent runtime** (`src/renderer/src/components/SettingsPage.tsx:161`). No mock includes a runtime picker.

## Regenerate

```sh
node design/landing-page/build-concepts.mjs
```

Emits `concepts/*.html`, `landing-pages.css`, and `index.html`, and removes stale concept pages plus the legacy `landing-pages.js`. Concept definitions, per-concept specs, base CSS, and both page shells all live in that one script.

## The 50

| ID | Name | Family | Composition |
|---|---|---|---|
| 001 | Monolith | `type` | Centered monolith; recents as a bottom ticker |
| 002 | Side Rail | `split` | Sage side rail with rotated wordmark |
| 003 | Shared Baseline | `split` | Mark and title locked into one horizontal unit |
| 004 | Watermark | `atmos` | Giant ghost orbit mark backs a centered lockup |
| 005 | Quiet Cross | `frame` | Hairline cross divides canvas into quadrants |
| 006 | Margin Notes | `list` | Serif italic session names as margin notes |
| 007 | Aperture | `mark` | Mark sits in a thin circular aperture |
| 008 | Duet | `split` | Equal halves split by one hairline |
| 009 | Underline | `type` | Oversized title over a short sage rule |
| 010 | Dot Directory | `list` | Directory of hollow dot rows; live fills sage |
| 011 | Ledger | `table` | Dotted-leader mono ledger owns the base |
| 012 | Wide Gutter | `split` | Wide gutter split; two-line blocks on inset field |
| 013 | Corner Post | `frame` | Content posts to the four corners; empty middle |
| 014 | Nave | `type` | Centered column between full-height hairlines |
| 015 | Baseline | `type` | 88px title rests on a full-width baseline rule |
| 016 | Twin Desk | `split` | Paper left, inset right with numbered serif list |
| 017 | Halo | `mark` | Double-ring halo encircles the bare mark |
| 018 | Spine | `frame` | 10px sage spine with rotated label on left edge |
| 019 | Triptych Bands | `stack` | Three stacked bands: mark, statement, recents |
| 020 | Graph Paper | `atmos` | Fine grid with corner ticks frames the lockup |
| 021 | Cards Row | `cards` | Compact hero over three hairline session cards |
| 022 | Marquee | `type` | 110px title left; action and recents in side column |
| 023 | Footnotes | `list` | Sessions demote to numbered footnotes at the base |
| 024 | Orbits | `mark` | Tilted orbit ellipses sweep behind the lockup |
| 025 | Inset Panel | `split` | Recents recess into a raised inset panel |
| 026 | Ticker | `atmos` | Slim live-session ticker pins the top edge |
| 027 | Small Caps | `type` | Sage small-caps kicker leads a modest serif title |
| 028 | Meridian | `split` | Meridian rail of node dots timestamps sessions |
| 029 | Thirds | `frame` | Two hairlines cut the canvas into thirds |
| 030 | Ghost O | `atmos` | 430px ghost serif O watermarks the right edge |
| 031 | Two-Up Ledger | `table` | Mono ledger splits into two balanced columns |
| 032 | Plaque | `frame` | Single plaque floats alone on open paper |
| 033 | Tab Base | `list` | Sessions as folder tabs flush with the bottom |
| 034 | Nightcap | `split` | Fixed warm-ink band carries the hero |
| 035 | Dial | `mark` | Dashed dial ring surrounds the mark |
| 036 | Sidenotes | `list` | Numbered serif sidenotes answer from the margin |
| 037 | Inverse Field | `atmos` | Fixed ink palette inverts the mock in both themes |
| 038 | Quiet Table | `table` | Airy two-column table with caps header row |
| 039 | Stacked Wordmark | `type` | Wordmark stacks Or / bit with italic sage second line |
| 040 | Arch | `mark` | Round-topped arch frames the mark |
| 041 | Tri Columns | `cards` | Three quiet text columns under a centered hero |
| 042 | Double Rule | `frame` | Double hairlines close above and below the hero |
| 043 | Numbered Margin | `list` | Giant faint numerals hold the row margins |
| 044 | Mirror | `split` | Recents left, right-aligned hero right |
| 045 | Eclipse | `mark` | Sage disc eclipsed by an offset paper circle |
| 046 | Column Rules | `table` | Newspaper columns divided by vertical hairlines |
| 047 | Stepwell | `stack` | Descending staggered bars step down like a well |
| 048 | Vignette | `atmos` | Soft radial vignette presses the edges |
| 049 | Kicker Bar | `frame` | Fading sage bar kisses the top edge |
| 050 | Colophon | `type` | Everything funnels into a bottom colophon strip |

No two share the same composition. The gallery exists to pick a direction, not to fine-tune a single layout across near-identical tweaks.

## Files

- `build-concepts.mjs` — generator: concept definitions + emitters (run to regenerate everything below)
- `index.html` — gallery (search, family filter, theme toggle, four-slot shortlist)
- `landing-pages.css` — shared tokens/components + the 50 scoped sections
- `concepts/001.html` … `050.html` — standalone previews per concept

IDs are stable `001`–`050`. The legacy `landing-pages.js` data module was removed; the gallery is fully static.
