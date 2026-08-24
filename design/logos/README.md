# OmniAgent — Calm Logo Study

300 distinct logo directions for OmniAgent, constrained to the calm **paper**
theme: muted sage and beige, soft geometry, negative space, and quiet metaphors
for orchestration (a coordinator quietly directing many agents).

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

## The data

`logos.js` exports two arrays:

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
| `.l-fill-ink` | Solid primary fill |
| `.l-fill-sage` | Solid sage fill |
| `.l-fill-dim` | Quiet fill |
| `.l-fill-paper` | Paper-colored fill (breaks a shape) |

The 15 families:

1. **Paper & Fold** — sheets, dog-ears, cranes, scrolls, envelopes.
2. **Zen & Circle** — ensō, concentric rings, segments, orbits.
3. **Orchestration / Conductor** — batons, convergences, daisies, hubs.
4. **Terrain / Horizon** — peaks, hills, strata, ripples, islands.
5. **Monoline Node** — loops, knots, lattices, helixes, meanders.
6. **Stamp & Seal** — hanko-style seals with marks and grids.
7. **Window & Portal** — arches, panes, portholes, keyholes.
8. **Wabi-Sabi** — imperfection: wobble, pebbles, fissures, soft shards.
9. **Breath & Mindfulness** — inhale rings, lotus, chakra, mandorla.
10. **Network / Graph** — triads, hubs, meshes, trees, constellations.
11. **Typographic Monogram** — O and A in many calm arrangements.
12. **Ink / Brush** — soft tapered brush strokes and blooms.
13. **Seed & Growth** — sprouts, leaves, flowers, cairns of life.
14. **Stone & Balance** — cairns, beams, stepping stones, equipoise.
15. **Moon & Celestial** — crescents, stars, eclipses, comets, phases.

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
ids unique, all names unique, all SVGs unique.
