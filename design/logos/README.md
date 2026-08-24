# OmniAgent — App Logo Study (Iteration 3)

300 marks for **OmniAgent** in the calm **paper** theme, distilled from the
iteration-2 shortlist. The convergence was unambiguous — **Circuit Hex II**,
**Honeycomb Bold**, and the omegas — so this iteration fuses them into one
brand language: the omega set in hexagonal circuit geometry, supported by
honeycomb fields, code glyphs, hub pads, resistors, and crossed orbits.

This is a study, not a brand decision. Every mark is a separate idea so the
set can be browsed, compared, and shortlisted.

## Viewing the gallery

Open `index.html` directly in any browser — no server needed. The page is
fully self-contained: `index.html` → `logos.css` → `logos.js` (a classic
script holding both the 300-entry dataset and the gallery runtime).

### Gallery controls

- **Search** — matches name, family, concept, spec, or id.
- **Family filter** — 15 families, 20 marks each.
- **Dark preview** — toggles the `paper` (light) / `dark` theme.
- **Shortlist** — click any card to add it (max 24); the tray at the bottom
  holds your picks and can be cleared.

## The families

| # | Family | Territory |
|---|---|---|
| 1 | **Hex Core Badges** | Circuit Hex II refined — pads, traces, bores, rivets. |
| 2 | **Omega Hex Fusion** | Ω set into hexes: wired, cut, stacked, crowned. |
| 3 | **Honeycomb Fields** | Honeycomb Bold expanded — trios, rings, pyramids, flowers. |
| 4 | **Omega Solo Marks** | The letter alone: weights, serifs, terminals, frames. |
| 5 | **Omega Tiles III** | Your omega tiles refined — cuts, splits, orbits. |
| 6 | **Trace & Pad** | Hub Pad II and Load Resistor territory — routes and contacts. |
| 7 | **Heavy Hex Rings** | Hex Nut Heavy deepened — nuts, washers, flanges, plugs. |
| 8 | **Bracket Icons III** | Self Closing II, Nested Braces II, Lone Angle II, Vessel Braces. |
| 9 | **Omega Markup** | Ω in code context: `<Ω>`, `{Ω}`, `Ω_`, `Ω =`. |
| 10 | **Hex Networks** | Emphasis Orbit Nodes on the hex grid — meshes and relays. |
| 11 | **Crossed Orbits III** | Crossed Planes refined — gyroscopes, eclipses, perigees. |
| 12 | **Resonant Hex** | Broadcasts, radar, vitals contained in cells. |
| 13 | **Cut Light Tiles** | Solid tiles with stair, terrace, keyhole, bolt cuts. |
| 14 | **Stacked Cells** | Honeycomb depth — towers, totems, cascades. |
| 15 | **Emblem Lockups** | Final-logo composites: badge + wordmark bars + baseline. |

## The data

`logos.js` exports nothing; it defines two arrays used by the appended
runtime:

- `LOGOS` — 300 entries, each:
  `{ id, name, family, familyId, concept, spec, svg }`.
- `FAMILIES` — `{ id, name, count }`.

Each `svg` is a parametric `viewBox="0 0 64 64"` drawing themed through class
hooks so it resolves against the active theme:

| Class | Meaning |
|---|---|
| `.l-ink` | Primary line / stroke |
| `.l-sage` | Accent (sage) line / stroke |
| `.l-dim` | Quiet supporting stroke |
| `.l-faint` | Faintest stroke / ghost |
| `.l-paper` | Paper-colored stroke (cut-out lines) |
| `.l-fill-ink` | Solid primary fill |
| `.l-fill-sage` | Solid sage fill |
| `.l-fill-dim` | Quiet fill |
| `.l-fill-paper` | Paper-colored fill (breaks a shape) |

## Regenerating

`generate-logos.mjs` is the single source. It builds all 300 marks
deterministically (seeded RNG, so output is stable) and writes `logos.js`,
appending the runtime so the published file is self-contained.

```sh
node design/logos/generate-logos.mjs
```

Editing the study means editing `generate-logos.mjs` (the `FAMILIES` array —
each family has 20 structurally distinct `variants`), never `logos.js` by hand.
The generator enforces invariants before writing: exactly 300 entries, all
ids unique, all names unique, all SVGs unique, every family at exactly 20.
