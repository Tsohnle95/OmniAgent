# OmniAgent — App Logo Study

300 distinct, app-ready logo directions for **OmniAgent**, constrained to the
calm **paper** theme: muted sage and beige, soft geometry, negative space.
Every mark is built around what the product actually is — the OA identity,
agents orbiting a coordinator, the terminal prompt, code and diff glyphs — so
shortlisted marks can go straight into an app icon or wordmark.

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
| 1 | **OA Monogram** | O and A interlocked, stacked, punched, ligated. |
| 2 | **App Icon Tiles** | Full-bleed squircle tiles ready for the Dock. |
| 3 | **Orbit / Omni** | Cores with rings and satellites — "all-around" agents. |
| 4 | **Terminal Prompt** | `>_`, cursors, chevrons, shell windows. |
| 5 | **Code & Brackets** | Angle/curly/square brackets, lambdas, semicolons. |
| 6 | **Diff & Merge** | Add/remove chips, branches, merges, commit rails. |
| 7 | **Wordmark & Initials** | Typographic lockups of the two initials. |
| 8 | **Hub & Spoke** | One coordinator directing many agent nodes. |
| 9 | **Editor & Window** | Panes, tabs, sidebars, trays — the app's own chrome. |
| 10 | **Spark & Signal** | Sparks, pulses, broadcasts — intelligence at rest. |
| 11 | **Hex & Circuit** | Hex badges, chip legs, PCB traces. |
| 12 | **Omega Marks** | Ω as "Om" — the everything letter. |
| 13 | **Negative Space** | Marks cut from solid slabs as paper light. |
| 14 | **Layer Stacks** | Stacked sessions, decks, strata, ziggurats. |
| 15 | **Seals & Badges** | Coins, shields, rosettes, stamps, plaques. |

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
