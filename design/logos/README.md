# OmniAgent — App Logo Study (Iteration 2)

300 brand-grade logo marks for **OmniAgent** in the calm **paper** theme.
This iteration is distilled from the 24 shortlisted favorites of iteration 1:
omega letterforms, solid negative-space tiles, circuit/hex badges, node
networks, code glyphs, signals, and terraced steps — rebuilt with brand
discipline: solid silhouettes, contained compositions, two-tone ink/sage,
generous stroke weights.

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
| 1 | **Omega Identity** | Ω as the hero letter — coins, slabs, monoliths, crests. |
| 2 | **Omega Fusion** | Ω fused with meshes, circuits, orbits, prompts, shields. |
| 3 | **Solid Tiles** | Full-bleed squircles with bold paper cutouts. |
| 4 | **Disc Emblems** | Solid circular marks with channels, bites, and voids. |
| 5 | **Agent Networks** | Meshes, pyramids, triads, hubs — the orchestration graph. |
| 6 | **Flow & Merge** | Rails converging, braiding, forking through nodes. |
| 7 | **Circuit Badges** | Hexes, dies, traces, pads, coils — engineering heraldry. |
| 8 | **Code Glyphs** | `</>`, braces, angles, semicolons at brand weight. |
| 9 | **Prompt Icons** | Chevrons, cursors, run keys, return arrows. |
| 10 | **Signal & Pulse** | Heartbeats, broadcasts, radar, sonar. |
| 11 | **Steps & Strata** | Terraces, ziggurats, ramps, podiums — visible progress. |
| 12 | **Orbit & Eclipse** | Rings, satellites, eclipses, closest approaches. |
| 13 | **Solid Initials** | O / A / Ω as filled letterforms with cut counters. |
| 14 | **Shield Crests** | Shields, medals, plaques, gates, wax seals. |
| 15 | **Monogram Tiles** | Ω / OA set into tiles — the icon-ready lockups. |

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
