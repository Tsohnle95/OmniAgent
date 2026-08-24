// Procedural generator for the OmniAgent app-logo study.
// Produces design/logos/logos.js: 300 DISTINCT brand-tailored marks.
// Each entry: { id, name, family, familyId, concept, spec, svg }.
// Marks are parametric SVGs (viewBox 0 0 64 64) themed via class hooks
// (.l-ink/.l-sage/.l-dim/.l-faint/.l-paper/.l-fill-*) resolved in logos.css.
// Every mark is a structurally distinct composition built for OmniAgent:
// OA monograms, app-icon tiles, orbits, terminal prompts, code glyphs,
// diff/merge marks, wordmarks, orchestration hubs, editor chrome, sparks,
// hex/circuit badges, omega forms, negative-space cuts, layer stacks, seals.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const f = (n) => Math.round(n * 100) / 100;
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const jit = (rng, base, amt) => base + (rng() - 0.5) * 2 * amt;
const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const line = (x1, y1, x2, y2, cls, w) =>
  `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${w ? ` style="stroke-width:${w}"` : ""}/>`;
const circ = (cx, cy, r, cls, w) =>
  `<circle class="${cls}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${w ? ` style="stroke-width:${w}"` : ""}/>`;
const dot = (cx, cy, r, cls) => `<circle class="${cls}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
const poly = (pts, cls, w) =>
  `<polygon class="${cls}" points="${pts.map((p) => p.map(f).join(",")).join(" ")}"${w ? ` style="stroke-width:${w}"` : ""}/>`;
const path = (d, cls, w) =>
  `<path class="${cls}" d="${d}"${w ? ` style="stroke-width:${w}"` : ""}/>`;
const rectR = (x, y, w, h, r, cls, w2) =>
  `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}"${w2 ? ` style="stroke-width:${w2}"` : ""}/>`;
const arc = (cx, cy, r, a0, a1, cls, w) => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  const large = (((a1 - a0) % TAU) + TAU) % TAU > Math.PI ? 1 : 0;
  return `<path class="${cls}" d="M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x1)} ${f(y1)}"${w ? ` style="stroke-width:${w}"` : ""}/>`;
};
const ell = (cx, cy, rx, ry, cls = "l-sage", sw = 1.6, rot = 0) =>
  `<ellipse class="${cls}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${rot ? ` transform="rotate(${rot} ${f(cx)} ${f(cy)})"` : ""} style="stroke-width:${sw}"/>`;

const reg = (cx, cy, r, n, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => pt(cx, cy, r, rot + (i * TAU) / n));
const starPts = (cx, cy, ro, ri, n, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) =>
    pt(cx, cy, i % 2 ? ri : ro, rot + (i * Math.PI) / n)
  );

const wrap = (inner) =>
  `<svg class="logo-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

const letterA = (cx, baseY, h, cls = "l-ink", w = 2.2, barCls = "l-sage") => {
  const half = h * 0.44;
  const apex = baseY - h;
  const t = 0.34;
  const yb = baseY - h * t;
  const hw = half * (1 - t);
  return (
    path(`M${f(cx - half)} ${f(baseY)} L${f(cx)} ${f(apex)} L${f(cx + half)} ${f(baseY)}`, cls, w) +
    line(cx - hw, yb, cx + hw, yb, barCls, Math.max(1.4, (w || 2.2) - 0.5))
  );
};

const omegaArc = (cx, cy, r, gapDeg = 50, cls = "l-ink", w = 2.4, foot = 5) => {
  const g = (gapDeg * Math.PI) / 180;
  const [x0, y0] = pt(cx, cy, r, Math.PI / 2 + g);
  const [x1, y1] = pt(cx, cy, r, Math.PI / 2 - g);
  return (
    arc(cx, cy, r, Math.PI / 2 + g, Math.PI / 2 - g, cls, w) +
    line(x0, y0, x0 + foot, y0, cls, w) +
    line(x1, y1, x1 - foot, y1, cls, w)
  );
};

const tile = (cls = "l-fill-sage", inset = 6, rad = 14) =>
  rectR(inset, inset, 64 - inset * 2, 64 - inset * 2, rad, cls);

const gt = (x, y, s, cls = "l-ink", sw = 2.6) =>
  path(`M${f(x)} ${f(y - s)} L${f(x + s * 0.85)} ${f(y)} L${f(x)} ${f(y + s)}`, cls, sw);
const cursorBar = (x, y, len, cls = "l-sage", sw = 2.8) => line(x, y, x + len, y, cls, sw);

const winFrame = () =>
  rectR(10, 14, 44, 36, 5, "l-ink", 1.8) +
  line(10, 23, 54, 23, "l-dim", 1.2) +
  dot(15.5, 18.5, 1.7, "l-fill-dim") +
  dot(20.5, 18.5, 1.7, "l-fill-dim") +
  dot(25.5, 18.5, 1.7, "l-fill-sage");

const codeRows = (x0, y0, rows, step, sw = 2) =>
  rows
    .map((wd, i) => line(x0 + (i % 3) * 3, y0 + i * step, x0 + (i % 3) * 3 + wd, y0 + i * step, i % 2 ? "l-sage" : "l-dim", sw))
    .join("");

const spark4 = (cx, cy, ro, ri, cls = "l-fill-sage") => poly(starPts(cx, cy, ro, ri, 4), cls);

function spokeGraph(cx, cy, n, r, cls = "l-ink", w = 1.3) {
  let s = dot(cx, cy, 3.4, "l-fill-sage");
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    const [x, y] = pt(cx, cy, r, a);
    s += line(cx, cy, x, y, "l-dim", w);
    s += circ(x, y, 2.8, cls, 1.3);
  }
  return s;
}

const FAMILIES = [
  {
    id: "oa-monogram",
    name: "OA Monogram",
    seed: 101,
    variants: [
      { vname: "O Hosts A", concept: "The O holds the A — one identity containing the other.", spec: "Ink O ring, sage A seated in the counter.", draw: () => circ(32, 33, 17, "l-ink", 2.2) + letterA(32, 42, 18, "l-sage", 2) },
      { vname: "A Crowns O", concept: "The A stands over the O like a peak over a pool.", spec: "Ink A above a sage O basin.", draw: () => letterA(32, 30, 20, "l-ink", 2.2) + circ(32, 45, 10, "l-sage", 2) },
      { vname: "Side By Side", concept: "Two letters shoulder to shoulder, equal partners.", spec: "Ink O left, sage A right, shared baseline.", draw: () => circ(21, 36, 9.5, "l-ink", 2.2) + letterA(43, 45, 20, "l-sage", 2) },
      { vname: "Underline Pair", concept: "The pair bound by one shared baseline stroke.", spec: "O and A over a full sage underline.", draw: () => circ(21, 31, 10, "l-ink", 2.2) + letterA(44, 41, 19, "l-ink", 2.2) + line(12, 47, 52, 47, "l-sage", 2) },
      { vname: "Interlock", concept: "A steps through the O; the overlap is the bond.", spec: "Overlapping O and A, crossing strokes kept.", draw: () => circ(26, 34, 13, "l-ink", 2.4) + letterA(39, 46, 22, "l-sage", 2.4) },
      { vname: "Counter Ring", concept: "The A's counter is a perfect small O.", spec: "Open A triangle, sage ring as counter.", draw: () => path("M16 50 L32 14 L48 50", "l-ink", 2.4) + circ(32, 40, 6, "l-sage", 2) },
      { vname: "Tilted Partner", concept: "The A leans into the steady O.", spec: "Upright O with a ten-degree tilted A.", draw: () => circ(32, 35, 16, "l-ink", 2.2) + path("M20 46 L28.8 23.1 L42 42", "l-sage", 2.2) + line(25.5, 37.5, 36, 37.5, "l-sage", 1.7) },
      { vname: "Bold Thin Duo", concept: "Weight contrast carries the pairing.", spec: "Heavy-stroke O beside hairline A.", draw: () => circ(22, 34, 11, "l-ink", 4.2) + letterA(44, 45, 21, "l-sage", 1.5) },
      { vname: "Capsule Mark", concept: "Both initials sealed in one stadium.", spec: "Stadium outline holding miniature o and a.", draw: () => rectR(12, 24, 40, 16, 8, "l-ink", 2) + circ(23, 32, 4.2, "l-sage", 1.8) + circ(38, 33, 3.6, "l-ink", 1.7) + line(41.6, 29, 41.6, 37, "l-ink", 1.7) },
      { vname: "Diagonal Rule", concept: "One slash divides the field; each side keeps a letter.", spec: "Dim diagonal between O and A corners.", draw: () => circ(21, 22, 8.5, "l-ink", 2.1) + letterA(43, 52, 18, "l-sage", 2.1) + line(15, 51, 49, 15, "l-dim", 1.3) },
      { vname: "Tangent Pair", concept: "The A's leg rests tangent on the O's rim.", spec: "O with A leaning at its right edge.", draw: () => circ(24, 34, 12, "l-ink", 2.2) + path("M34 46 L44 22 L52 44", "l-sage", 2.2) + line(38.6, 36, 48, 36, "l-sage", 1.7) },
      { vname: "Registry Coin", concept: "Initials struck like a quiet commemorative coin.", spec: "Double coin rings around tiny O and A.", draw: () => circ(32, 32, 19, "l-dim", 1.4) + circ(32, 32, 15.5, "l-ink", 1.9) + circ(26, 33.5, 3.4, "l-sage", 1.5) + path("M36 37.5 L40.5 27.5 L45 37.5", "l-sage", 1.5) + line(37.8, 34, 43.2, 34, "l-sage", 1.2) },
      { vname: "Apex Over Pool", concept: "A mountain-A mirrored in a still oval O.", spec: "Sage A above a flat ink ellipse.", draw: () => ell(32, 46, 13, 5, "l-ink", 2) + path("M24 40 L32 14 L40 40", "l-sage", 2.1) + line(27.5, 33, 36.5, 33, "l-sage", 1.6) },
      { vname: "Mirror Fold", concept: "Two As folded apex to apex around an O hinge.", spec: "Mirrored triangles meeting at center ring.", draw: () => poly([[10, 46], [24, 20], [24, 46]], "l-ink") + poly([[54, 46], [40, 20], [40, 46]], "l-ink") + circ(32, 38, 5.5, "l-sage", 2) },
      { vname: "Script Loop", concept: "One continuous gesture writes o then a.", spec: "Single cursive stroke, no lifts.", draw: () => path("M18 46 C22 28 34 20 40 28 C44 34 41 43 34 44 C28 45 25 40 29 35 C33 30 40 32 46 40", "l-ink", 2.2) },
      { vname: "Corner Frame", concept: "Four ticks frame the initials like plate marks.", spec: "Corner brackets around centered O A.", draw: () => path("M14 22 V16 H20", "l-dim", 2) + path("M44 16 H50 V22", "l-dim", 2) + path("M50 42 V48 H44", "l-dim", 2) + path("M20 48 H14 V42", "l-dim", 2) + circ(25, 32, 6.5, "l-ink", 2) + path("M38 39 L43.5 25.5 L49 39", "l-sage", 2) + line(40.4, 34.5, 46.6, 34.5, "l-sage", 1.5) },
      { vname: "Totem Stack", concept: "O above A — a totem of the two names.", spec: "Vertical stack, faint connector tick.", draw: () => circ(32, 20, 8, "l-ink", 2.1) + line(32, 30.5, 32, 33.5, "l-faint", 1.6) + letterA(32, 50, 15, "l-sage", 2.1) },
      { vname: "Punched O", concept: "The disc remembers the O as a cut of paper light.", spec: "Solid ink disc, paper ring punched out.", draw: () => dot(32, 32, 17, "l-fill-ink") + circ(32, 32, 9, "l-paper", 3.4) },
      { vname: "Punched A", concept: "The A survives as negative light in the slab.", spec: "Solid ink disc, A cut in paper strokes.", draw: () => dot(32, 32, 17, "l-fill-ink") + path("M24 41 L32 22 L40 41", "l-paper", 3) + line(27.4, 34.5, 36.6, 34.5, "l-paper", 2.6) },
      { vname: "Signature Block", concept: "Initials over the ruled lines of a signed record.", spec: "O A mark above three registry rules.", draw: () => circ(23, 24, 7.5, "l-ink", 2) + path("M34 29 L39.5 16 L45 29", "l-sage", 2) + line(36.9, 25, 42.1, 25, "l-sage", 1.5) + line(14, 40, 50, 40, "l-dim", 1.4) + line(14, 46, 44, 46, "l-faint", 1.4) + line(14, 52, 50, 52, "l-faint", 1.4) },
    ],
  },
  {
    id: "app-tiles",
    name: "App Icon Tiles",
    seed: 202,
    variants: [
      { vname: "Sage Tile O", concept: "Dock-ready tile; the O floats as paper light.", spec: "Full-bleed sage squircle, thick paper O.", draw: () => tile() + circ(32, 32, 11, "l-paper", 3.6) },
      { vname: "Prompt Tile", concept: "The terminal prompt, embossed in paper.", spec: "Ink squircle with paper >_ .", draw: () => tile("l-fill-ink") + gt(26, 31, 7, "l-paper", 3) + cursorBar(31.5, 38, 9, "l-paper", 3) },
      { vname: "Split Tile Spark", concept: "Two worlds, agent and human, meet at a spark.", spec: "Diagonal sage/ink split, paper spark.", draw: () => poly([[6, 6], [58, 6], [58, 58]], "l-fill-sage") + poly([[6, 6], [58, 58], [6, 58]], "l-fill-ink") + spark4(32, 32, 9, 3.4, "l-paper") },
      { vname: "Orbit Tile", concept: "Agents orbit the core on a paper ellipse.", spec: "Sage tile, paper orbit and satellites.", draw: () => tile() + ell(32, 32, 15, 9, "l-paper", 2.6) + dot(45.5, 26, 2.8, "l-paper") + dot(32, 32, 4, "l-paper") },
      { vname: "Outline Tile A", concept: "Hairline tile for light chrome surfaces.", spec: "Outlined squircle, sage A inside.", draw: () => rectR(8, 8, 48, 48, 14, "l-ink", 2.4) + letterA(32, 42, 18, "l-sage", 2.2) },
      { vname: "Nested Tiles", concept: "Sessions within sessions, receding inward.", spec: "Three nested rounded squares, ink core.", draw: () => rectR(8, 8, 48, 48, 13, "l-faint", 1.7) + rectR(15, 15, 34, 34, 10, "l-sage", 2) + dot(32, 32, 4, "l-fill-ink") },
      { vname: "Notch Tile", concept: "A corner of light notched from the slab.", spec: "Ink tile with paper corner cut, sage dot.", draw: () => tile("l-fill-ink") + poly([[58, 6], [58, 26], [38, 6]], "l-fill-paper") + dot(32, 34, 5, "l-fill-sage") },
      { vname: "Window Tile", concept: "The app window itself, reduced to essence.", spec: "Sage tile, paper window with titlebar.", draw: () => tile() + rectR(16, 18, 32, 27, 4, "l-paper", 2.6) + line(16, 26, 48, 26, "l-paper", 2.2) },
      { vname: "Ring Inset Tile", concept: "Concentric focus — the core drawn inward.", spec: "Two inset paper rings on sage tile.", draw: () => tile() + circ(32, 32, 14, "l-paper", 2.7) + circ(32, 32, 8, "l-paper", 2.3) },
      { vname: "Spark Tile", concept: "Intelligence struck into a dark tile.", spec: "Ink squircle, large paper four-point spark.", draw: () => tile("l-fill-ink") + spark4(32, 32, 13, 4.8, "l-paper") },
      { vname: "Duo Tiles", concept: "Front-of-front: layered app surfaces.", spec: "Offset sage tile behind ink tile, paper dot.", draw: () => rectR(14, 14, 44, 44, 13, "l-fill-sage") + rectR(8, 8, 42, 42, 12, "l-fill-ink") + dot(29, 29, 5, "l-fill-paper") },
      { vname: "Hex Tile", concept: "The badge hexagon set into the icon tile.", spec: "Sage tile, outlined paper hexagon.", draw: () => tile() + poly(reg(32, 33, 13, 6), "l-paper", 2.6) + dot(32, 33, 3, "l-paper") },
      { vname: "Terminal Tile", concept: "Where the work happens, carried on the icon.", spec: "Dim tile, sage prompt and cursor.", draw: () => tile("l-fill-dim") + gt(24, 30, 6, "l-sage", 2.6) + cursorBar(29.5, 36.5, 10, "l-sage", 2.6) },
      { vname: "Layers Tile", concept: "Stacked sessions rendered as paper bars.", spec: "Sage tile, three paper layer bars.", draw: () => tile() + rectR(18, 21, 28, 5, 2.5, "l-paper") + rectR(18, 31, 22, 5, 2.5, "l-paper") + rectR(18, 41, 28, 5, 2.5, "l-paper") },
      { vname: "Aperture Tile", concept: "An open aperture — seeing across every workspace.", spec: "Ink tile, two opposite paper wedges.", draw: () => tile("l-fill-ink") + path("M32 32 L32 13 A19 19 0 0 1 51 32 Z", "l-paper") + path("M32 32 L32 51 A19 19 0 0 1 13 32 Z", "l-paper") },
      { vname: "Commit Tile", concept: "A history line with its commits, pocket-sized.", spec: "Tile with paper commit dots on a rail.", draw: () => tile() + line(18, 32, 46, 32, "l-paper", 2.6) + dot(22, 32, 3, "l-paper") + dot(32, 32, 4.4, "l-paper") + dot(42, 32, 3, "l-paper") },
      { vname: "Frame Duo Tile", concept: "Frame within frame, stillness at center.", spec: "Ink outer, sage inner squircle, ink core.", draw: () => rectR(8, 8, 48, 48, 14, "l-ink", 2.4) + rectR(16, 16, 32, 32, 9, "l-sage", 2) + dot(32, 32, 3, "l-fill-ink") },
      { vname: "Half Fill Tile", concept: "Half committed, half open — the working icon.", spec: "Left sage fill inside outlined tile, ink O.", draw: () => { let s = rectR(6, 6, 52, 52, 14, "l-ink", 2.4); s += `<clipPath id="ht"><rect x="6" y="6" width="26" height="52" rx="14"/></clipPath><rect class="l-fill-sage" x="6" y="6" width="26" height="52" clip-path="url(#ht)"/>`; return s + circ(38, 32, 9, "l-ink", 2.4); } },
      { vname: "Omega Tile", concept: "Om — the omega pressed into the tile.", spec: "Sage squircle, paper omega.", draw: () => tile() + omegaArc(32, 34, 11, 55, "l-paper", 3, 4) },
      { vname: "Beacon Tile", concept: "The tile that answers when called.", spec: "Ink tile, paper broadcast arcs and core.", draw: () => tile("l-fill-ink") + dot(32, 40, 3.6, "l-paper") + arc(32, 40, 8, -Math.PI * 0.78, -Math.PI * 0.22, "l-paper", 2.4) + arc(32, 40, 13, -Math.PI * 0.74, -Math.PI * 0.26, "l-paper", 2.2) },
    ],
  },
  {
    id: "orbit-omni",
    name: "Orbit / Omni",
    seed: 303,
    variants: [
      { vname: "Quiet Core", concept: "One agent at center, one calm boundary.", spec: "Sage core dot inside an ink ring.", draw: () => dot(32, 32, 5, "l-fill-sage") + circ(32, 32, 15, "l-ink", 2) },
      { vname: "Twin Rings", concept: "Inner discipline, outer reach.", spec: "Two rings, satellite on the outer track.", draw: () => circ(32, 32, 9.5, "l-sage", 1.8) + circ(32, 32, 16.5, "l-ink", 2) + dot(pt(32, 32, 16.5, -Math.PI / 4)[0], pt(32, 32, 16.5, -Math.PI / 4)[1], 3, "l-fill-sage") },
      { vname: "Ellipse Path", concept: "The orbit slightly squashed, like real paths are.", spec: "Ink ellipse around a sage core.", draw: () => ell(32, 32, 17, 10, "l-ink", 2) + dot(32, 32, 4, "l-fill-sage") },
      { vname: "Three Moons", concept: "Three agents in step around one hub.", spec: "Core, ring, three even satellites.", draw: () => { let s = dot(32, 32, 4.5, "l-fill-sage") + circ(32, 32, 14, "l-ink", 1.9); for (const a of [Math.PI / 2, Math.PI / 2 + (TAU / 3), Math.PI / 2 + (2 * TAU) / 3]) { const [x, y] = pt(32, 32, 14, a); s += dot(x, y, 2.8, "l-fill-ink"); } return s; } },
      { vname: "Crossed Orbits", concept: "Two planes of work crossing at the core.", spec: "Rotated ellipse pair intersecting center.", draw: () => ell(32, 32, 17, 8, "l-ink", 1.8, 28) + ell(32, 32, 17, 8, "l-sage", 1.8, -28) + dot(32, 32, 3.6, "l-fill-ink") },
      { vname: "Gap Ring", concept: "The orbit left deliberately unfinished.", spec: "Open ring with a comet head at the gap.", draw: () => arc(32, 32, 15, 0.35, TAU - 0.35, "l-ink", 2.2) + dot(pt(32, 32, 15, TAU - 0.35)[0], pt(32, 32, 15, TAU - 0.35)[1], 3.4, "l-fill-sage") },
      { vname: "Station Keeping", concept: "A satellite held precisely on its mark.", spec: "Ring, four ticks, satellite on station.", draw: () => circ(32, 32, 14, "l-ink", 1.9) + [0, 90, 180, 270].map((d) => { const a = (d * Math.PI) / 180; const [x1, y1] = pt(32, 32, 11.5, a); const [x2, y2] = pt(32, 32, 14, a); return line(x1, y1, x2, y2, "l-dim", 1.4); }).join("") + dot(pt(32, 32, 14, -Math.PI / 3)[0], pt(32, 32, 14, -Math.PI / 3)[1], 3.2, "l-fill-sage") },
      { vname: "Wide Ring Core", concept: "A heavy world wearing a thin bright ring.", spec: "Filled ink core under a flat sage ring.", draw: () => dot(32, 32, 9, "l-fill-ink") + ell(32, 32, 18, 6, "l-sage", 2) },
      { vname: "Signal Arcs Up", concept: "Quiet transmission rising from the source.", spec: "Nested upward arcs over a core dot.", draw: () => dot(32, 44, 4, "l-fill-sage") + arc(32, 46, 10, -Math.PI * 0.75, -Math.PI * 0.25, "l-dim", 1.8) + arc(32, 46, 16, -Math.PI * 0.72, -Math.PI * 0.28, "l-ink", 2) },
      { vname: "Binary Pair", concept: "Two agents sharing one common track.", spec: "Twin dots on a single shared ellipse.", draw: () => dot(24, 32, 4, "l-fill-ink") + dot(40, 32, 4, "l-fill-sage") + ell(32, 32, 15, 8.5, "l-ink", 1.8) },
      { vname: "Halo Stack", concept: "Attention narrowing to a single point.", spec: "Faint halo, sage ring, ink core.", draw: () => circ(32, 32, 19, "l-faint", 1.3) + circ(32, 32, 13.5, "l-sage", 1.9) + dot(32, 32, 5, "l-fill-ink") },
      { vname: "Moonrise Line", concept: "An agent cresting the workspace horizon.", spec: "Horizon rule, dome arc, rising moon dot.", draw: () => line(10, 46, 54, 46, "l-ink", 1.8) + arc(32, 46, 18, Math.PI, TAU, "l-dim", 1.6) + dot(32, 28, 4, "l-fill-sage") },
      { vname: "Gyroscope", concept: "Balanced motion on every axis at once.", spec: "Ring plus vertical ellipse around core.", draw: () => circ(32, 32, 16, "l-ink", 2) + ell(32, 32, 6.5, 16, "l-sage", 1.7) + dot(32, 32, 3, "l-fill-ink") },
      { vname: "Loose Swarm", concept: "Independent agents, loosely held.", spec: "Five satellites at varied radii and angles.", draw: () => { let s = dot(32, 32, 3.6, "l-fill-sage"); [[10, 2.6], [-70, 3], [140, 2.4], [250, 2.8], [305, 2.2]].forEach(([deg, r]) => { const [x, y] = pt(32, 32, r + 9, (deg * Math.PI) / 180); s += dot(x, y, 2.4, "l-fill-ink"); }); return s; } },
      { vname: "Comet Circuit", concept: "Momentum along the arc, tail behind.", spec: "Three-quarter ring, head dot, dash trail.", draw: () => arc(32, 32, 15, -Math.PI * 0.25, Math.PI * 1.3, "l-ink", 2.2) + dot(pt(32, 32, 15, Math.PI * 1.3)[0], pt(32, 32, 15, Math.PI * 1.3)[1], 3.6, "l-fill-sage") + line(14, 20, 19, 24, "l-faint", 1.6) },
      { vname: "Watch Works", concept: "Rings like a movement, hands like a watch.", spec: "Three alternating rings, hand to satellite.", draw: () => circ(32, 32, 5, "l-fill-ink") + circ(32, 32, 10.5, "l-sage", 1.7) + circ(32, 32, 16.5, "l-ink", 1.9) + line(32, 32, pt(32, 32, 16.5, -Math.PI / 3)[0], pt(32, 32, 16.5, -Math.PI / 3)[1], "l-sage", 1.7) + dot(pt(32, 32, 16.5, -Math.PI / 3)[0], pt(32, 32, 16.5, -Math.PI / 3)[1], 2.6, "l-fill-sage") },
      { vname: "Vertical Weave", concept: "Two narrow orbits woven upright.", spec: "Crossing tall ellipses, core at center.", draw: () => ell(32, 32, 7, 17, "l-ink", 1.8) + ell(32, 32, 7, 17, "l-sage", 1.8, 62) + dot(32, 32, 3.4, "l-fill-ink") },
      { vname: "Drift Trail", concept: "Motion remembered as fading arcs.", spec: "Dot with two trailing arc echoes.", draw: () => dot(44, 24, 4, "l-fill-sage") + arc(30, 34, 14, Math.PI * 0.95, Math.PI * 1.55, "l-dim", 1.7) + arc(30, 34, 19, Math.PI * 0.98, Math.PI * 1.42, "l-faint", 1.4) },
      { vname: "All Directions", concept: "Omni — reaching everywhere at once, calmly.", spec: "Four arc segments at the cardinal points.", draw: () => { let s = dot(32, 32, 4, "l-fill-sage"); for (let i = 0; i < 4; i++) { const a0 = -Math.PI / 2 + (i * TAU) / 4 + 0.42; s += arc(32, 32, 15, a0, a0 + TAU / 4 - 0.84, "l-ink", 2.1); } return s; } },
      { vname: "Chronometer", concept: "Twelve marks, one deliberate hand.", spec: "Ticked ring with sage hand and node.", draw: () => { let s = circ(32, 32, 16, "l-ink", 2); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const [x1, y1] = pt(32, 32, 13.5, a); const [x2, y2] = pt(32, 32, 16, a); s += line(x1, y1, x2, y2, "l-dim", 1.3); } const ha = -Math.PI / 3; return s + line(32, 32, pt(32, 32, 10, ha)[0], pt(32, 32, 10, ha)[1], "l-sage", 1.9) + dot(32, 32, 2.6, "l-fill-ink"); } },
    ],
  },
  {
    id: "terminal",
    name: "Terminal Prompt",
    seed: 404,
    variants: [
      { vname: "Classic Prompt", concept: "The two characters that mean: your move.", spec: "Ink chevron over sage underscore.", draw: () => gt(24, 31, 9) + cursorBar(32, 39, 12) },
      { vname: "Block Cursor", concept: "A cursor you can hold in your hand.", spec: "Chevron beside a filled cursor block.", draw: () => gt(23, 30, 8) + rectR(33, 34, 10, 8, 1.5, "l-fill-sage") },
      { vname: "Double Tap", concept: "Momentum — the command already running.", spec: "Two chevrons ink then sage, short cursor.", draw: () => gt(17, 31, 7, "l-ink", 2.4) + gt(27, 31, 7, "l-sage", 2.4) + cursorBar(36, 38, 10) },
      { vname: "Roundel Prompt", concept: "The prompt sealed in a quiet circle.", spec: "Ring containing centered >_ .", draw: () => circ(32, 32, 17, "l-ink", 2) + gt(26, 30, 6.5, "l-sage", 2.3) + cursorBar(33, 36.5, 8, "l-sage", 2.3) },
      { vname: "Shell Window", concept: "A whole terminal reduced to its titlebar and sign.", spec: "Window frame with prompt line inside.", draw: () => winFrame() + gt(18, 35, 5, "l-ink", 2) + cursorBar(24, 39.5, 9, "l-sage", 2.1) },
      { vname: "Triple Echo", concept: "Commands fading back into history.", spec: "Three chevrons faint to bold, trailing cursor.", draw: () => gt(13, 31, 5.5, "l-faint", 1.9) + gt(23, 31, 6.5, "l-dim", 2.1) + gt(34, 31, 7.5, "l-ink", 2.4) + cursorBar(44, 38.5, 7) },
      { vname: "Caret Rise", concept: "The caret as a small mountain of intent.", spec: "Circumflex above a resting underscore.", draw: () => path("M22 34 L32 23 L42 34", "l-ink", 2.5) + cursorBar(24, 43, 16) },
      { vname: "Squircle Shell", concept: "The prompt wearing the app's own rounded frame.", spec: "Squircle outline holding >_ .", draw: () => rectR(10, 10, 44, 44, 13, "l-ink", 2.2) + gt(25, 30, 8, "l-sage", 2.5) + cursorBar(33.5, 37.5, 10, "l-sage", 2.5) },
      { vname: "Blink Half", concept: "The cursor caught mid-blink.", spec: "Cursor split into two dashes with a gap.", draw: () => gt(22, 31, 8) + line(33, 39, 38, 39, "l-sage", 2.8) + line(42, 39, 46, 39, "l-sage", 2.8) },
      { vname: "Slash First", concept: "The path separator promoted to first class.", spec: "Dim slash leading into a sage cursor.", draw: () => line(26, 22, 19, 40, "l-dim", 2.2) + cursorBar(29, 40, 13) },
      { vname: "Run Triangle", concept: "Press run; the underscore waits for output.", spec: "Open play triangle over a baseline rule.", draw: () => path("M23 21 L41 32 L23 43 Z", "l-sage", 2.3) + line(20, 50, 44, 50, "l-ink", 2.4) },
      { vname: "Bracketed Shell", concept: "The prompt held between square brackets.", spec: "[ >_ ] drawn with corner strokes.", draw: () => path("M22 22 H16 V42 H22", "l-dim", 2.2) + path("M42 22 H48 V42 H42", "l-dim", 2.2) + gt(26, 31, 6, "l-ink", 2.3) + cursorBar(32.5, 37, 6.5) },
      { vname: "Ghost Cursor", concept: "Where the cursor was; where it is.", spec: "Faint block behind a solid sage block.", draw: () => gt(20, 30, 7.5) + rectR(30, 34, 11, 9, 1.5, "l-fill-faint") + rectR(37, 34, 11, 9, 1.5, "l-fill-sage") },
      { vname: "Tall Glyph", concept: "One enormous chevron, quietly monumental.", spec: "Frame-high chevron with low short cursor.", draw: () => gt(22, 30, 15, "l-ink", 3) + cursorBar(38, 45, 8, "l-sage", 3) },
      { vname: "History Twin", concept: "This command, and the one before it.", spec: "Stacked underscores, dim above sage.", draw: () => gt(22, 28, 7) + line(32, 35, 44, 35, "l-dim", 2.3) + line(32, 43, 44, 43, "l-sage", 2.6) },
      { vname: "Period End", concept: "The command finished — a full stop kept.", spec: "Chevron with a period dot as terminator.", draw: () => gt(24, 30, 8.5) + dot(40, 39, 3.4, "l-fill-sage") },
      { vname: "Stepped Depth", concept: "Nesting shown as growing chevrons.", spec: "Three chevrons scaled up from one origin.", draw: () => gt(20, 30, 4.5, "l-faint", 1.8) + gt(20, 31, 7, "l-sage", 2.1) + gt(20, 32, 9.5, "l-ink", 2.4) },
      { vname: "Pipe Cursor", concept: "The insertion point standing upright.", spec: "Chevron beside a tall bar cursor.", draw: () => gt(24, 30, 8) + line(37, 22, 37, 40, "l-sage", 3) },
      { vname: "Echo Output", concept: "Prompt above, calm output below.", spec: ">_ line plus two dim response rules.", draw: () => gt(20, 24, 6) + cursorBar(28, 30, 12) + line(16, 40, 48, 40, "l-dim", 1.8) + line(16, 47, 38, 47, "l-faint", 1.8) },
      { vname: "Minified Shell", concept: "Vast empty space around a tiny prompt.", spec: "Small >_ low-center in open field.", draw: () => gt(27, 40, 5.5, "l-ink", 2) + cursorBar(33, 45, 7, "l-sage", 2) + circ(32, 32, 21, "l-faint", 1.2) },
    ],
  },
  {
    id: "code-brackets",
    name: "Code & Brackets",
    seed: 505,
    variants: [
      { vname: "Angle Diamond", concept: "Opening and closing held apart by one idea.", spec: "< and > facing outward, dot at center.", draw: () => path("M24 20 L12 32 L24 44", "l-ink", 2.4) + path("M40 20 L52 32 L40 44", "l-ink", 2.4) + dot(32, 32, 3.4, "l-fill-sage") },
      { vname: "Curly Embrace", concept: "Braces that hold everything together.", spec: "{ } curves enclosing a center dot.", draw: () => path("M26 16 C20 16 20 22 20 26 C20 30 17 32 15 32 C17 32 20 34 20 38 C20 42 20 48 26 48", "l-ink", 2.2) + path("M38 16 C44 16 44 22 44 26 C44 30 47 32 49 32 C47 32 44 34 44 38 C44 42 44 48 38 48", "l-ink", 2.2) + dot(32, 32, 3.4, "l-fill-sage") },
      { vname: "Self Closing", concept: "Complete in itself — element opened and closed.", spec: "< / > with a sage slash.", draw: () => path("M22 20 L10 32 L22 44", "l-ink", 2.4) + path("M42 20 L54 32 L42 44", "l-ink", 2.4) + line(37, 18, 27, 46, "l-sage", 2.4) },
      { vname: "Square Node", concept: "Array literal as an emblem: brackets around value.", spec: "[ • ] with heavy corner strokes.", draw: () => path("M24 18 H14 V46 H24", "l-ink", 2.6) + path("M40 18 H50 V46 H40", "l-ink", 2.6) + dot(32, 32, 4, "l-fill-sage") },
      { vname: "Lens Parens", concept: "Wide parentheses focusing on the core.", spec: "( ) arcs forming a lens around a dot.", draw: () => arc(-6, 32, 34, -0.62, 0.62, "l-ink", 2.3) + arc(70, 32, 34, Math.PI - 0.62, Math.PI + 0.62, "l-ink", 2.3) + dot(32, 32, 3.6, "l-fill-sage") },
      { vname: "Nested Braces", concept: "Scope inside scope — depth made visible.", spec: "Double braces receding inward.", draw: () => path("M24 14 C19 14 19 20 19 25 C19 29 16 32 14 32 C16 32 19 35 19 39 C19 44 19 50 24 50", "l-dim", 2) + path("M30 18 C26 18 26 23 26 27 C26 30 23.5 32 22 32 C23.5 32 26 34 26 37 C26 41 26 46 30 46", "l-ink", 2.2) + path("M34 18 C38 18 38 23 38 27 C38 30 40.5 32 42 32 C40.5 32 38 34 38 37 C38 41 38 46 34 46", "l-ink", 2.2) + path("M40 14 C45 14 45 20 45 25 C45 29 48 32 50 32 C48 32 45 35 45 39 C45 44 45 50 40 50", "l-dim", 2) },
      { vname: "Tag Wrap Bar", concept: "Markup holding content: tags around the bar.", spec: "< bar > with a sage content rule.", draw: () => path("M22 20 L12 32 L22 44", "l-ink", 2.4) + path("M42 20 L52 32 L42 44", "l-ink", 2.4) + line(27, 32, 37, 32, "l-sage", 2.6) },
      { vname: "Indent Block", concept: "Structure read from indentation alone.", spec: "Staggered code lines with closing brace.", draw: () => codeRows(14, 22, [14, 10, 12], 7, 2) + path("M46 20 C51 20 51 25 51 29 C51 32 53 33.5 54.5 33.5 C53 33.5 51 35 51 38 C51 42 51 47 46 47", "l-ink", 2) },
      { vname: "Angle Peak", concept: "Chevrons stacked into a quiet summit.", spec: "^ over v meeting near the middle.", draw: () => path("M18 30 L32 16 L46 30", "l-ink", 2.4) + path("M18 38 L32 52 L46 38", "l-sage", 2.4) },
      { vname: "Backtick Pair", concept: "Inline code marks floating above the line.", spec: "Two angled ticks high, dot below.", draw: () => path("M22 24 L27 18", "l-ink", 2.6) + path("M37 24 L42 18", "l-ink", 2.6) + dot(32, 42, 3.6, "l-fill-sage") + line(18, 50, 46, 50, "l-faint", 1.6) },
      { vname: "Pipe Columns", concept: "Two uprights bridged mid-height.", spec: "| | with a dim connecting dash.", draw: () => line(24, 18, 24, 46, "l-ink", 2.6) + line(40, 18, 40, 46, "l-ink", 2.6) + line(29, 32, 35, 32, "l-sage", 2.4) },
      { vname: "Lone Angle", concept: "One bracket left open — work in progress.", spec: "Single large < with a dot in its mouth.", draw: () => path("M40 14 L14 32 L40 50", "l-ink", 2.6) + dot(31, 32, 3.6, "l-fill-sage") },
      { vname: "Fragment Slash", concept: "Just the slash, the divider that ends tags.", spec: "Large slash with faint angle echoes.", draw: () => line(38, 14, 26, 50, "l-ink", 2.8) + path("M18 22 L10 32 L18 42", "l-faint", 1.8) + path("M46 22 L54 32 L46 42", "l-faint", 1.8) },
      { vname: "Header Corners", concept: "Only the top corners remain; content below.", spec: "Top brackets plus a row of content dots.", draw: () => path("M18 26 V18 H26", "l-ink", 2.4) + path("M38 18 H46 V26", "l-ink", 2.4) + dot(22, 38, 2.6, "l-fill-dim") + dot(32, 38, 2.6, "l-fill-sage") + dot(42, 38, 2.6, "l-fill-dim") + line(18, 48, 46, 48, "l-faint", 1.6) },
      { vname: "Lambda Form", concept: "The function letter, drawn in one breath.", spec: "Single λ stroke with sage leg.", draw: () => path("M20 16 C26 26 28 32 30 38", "l-ink", 2.4) + path("M44 16 C36 28 30 40 24 48", "l-ink", 2.4) + path("M30 38 C34 44 38 47 44 48", "l-sage", 2.4) },
      { vname: "Statement End", concept: "The semicolon — where thoughts conclude.", spec: "Giant period and comma paired.", draw: () => dot(28, 24, 5.5, "l-fill-ink") + path("M33.5 36 C33.5 46 28 50 22 52 C27 45 27.5 40 27 36 Z", "l-fill-sage") },
      { vname: "Staggered Equals", concept: "Assignment and comparison, offset in time.", spec: "== pairs displaced diagonally.", draw: () => line(18, 24, 32, 24, "l-ink", 2.4) + line(18, 31, 32, 31, "l-ink", 2.4) + line(32, 38, 46, 38, "l-sage", 2.4) + line(32, 45, 46, 45, "l-sage", 2.4) },
      { vname: "Ampersand Loop", concept: "The joiner of names, simplified to loops.", spec: "Reduced & built from two arcs.", draw: () => path("M42 18 C32 24 24 34 22 44 C21 49 26 51 30 47 C36 40 40 32 44 26", "l-ink", 2.3) + path("M22 26 C28 30 38 38 46 46", "l-sage", 2.3) },
      { vname: "Hook Circle", concept: "An angle that never closes — it curls instead.", spec: "< flowing into three-quarters of a ring.", draw: () => path("M26 20 L14 32 L24 42", "l-ink", 2.4) + arc(34, 32, 12, Math.PI * 0.82, Math.PI * 2.4, "l-sage", 2.4) },
      { vname: "Embraced Spark", concept: "Brackets tight around the spark of work.", spec: "Close pair hugging a four-point spark.", draw: () => path("M25 22 H19 V42 H25", "l-ink", 2.5) + path("M39 22 H45 V42 H39", "l-ink", 2.5) + spark4(32, 32, 7.5, 2.8, "l-fill-sage") },
    ],
  },
  {
    id: "diff-merge",
    name: "Diff & Merge",
    seed: 606,
    variants: [
      { vname: "Add Remove", concept: "The two verbs of every change.", spec: "Sage plus over an ink minus.", draw: () => line(24, 24, 40, 24, "l-sage", 2.4) + line(32, 16, 32, 32, "l-sage", 2.4) + line(24, 42, 40, 42, "l-ink", 2.4) },
      { vname: "Feature Branch", concept: "Work peels off the trunk and returns changed.", spec: "Main rail with a curving branch to a node.", draw: () => line(14, 40, 50, 40, "l-ink", 2.2) + dot(20, 40, 3, "l-fill-ink") + path("M32 40 C32 28 40 28 40 20", "l-sage", 2.2) + dot(40, 17, 3.4, "l-fill-sage") },
      { vname: "Merge Knot", concept: "Two histories becoming one.", spec: "Lines converging into a single node.", draw: () => path("M14 20 C26 20 30 32 40 32", "l-ink", 2.2) + path("M14 44 C26 44 30 32 40 32", "l-sage", 2.2) + line(40, 32, 52, 32, "l-ink", 2.2) + dot(40, 32, 3.6, "l-fill-ink") },
      { vname: "Commit Chain", concept: "Three moments linked in a row.", spec: "Hollow-filled-hollow commits on a rail.", draw: () => line(12, 32, 52, 32, "l-dim", 1.7) + circ(18, 32, 4, "l-ink", 2) + dot(32, 32, 4.4, "l-fill-sage") + circ(46, 32, 4, "l-ink", 2) },
      { vname: "Sync Pair", concept: "Two arrows chasing each other around a loop.", spec: "Counter-rotating arc arrows.", draw: () => arc(32, 32, 13, Math.PI * 0.6, Math.PI * 1.75, "l-ink", 2.3) + arc(32, 32, 13, Math.PI * 1.6 + TAU / 2, Math.PI * 0.75 + TAU / 2, "l-sage", 2.3) + poly([[pt(32,32,13,Math.PI*0.72)[0]-2, pt(32,32,13,Math.PI*0.72)[1]], [pt(32,32,13,Math.PI*0.72)[0]+4, pt(32,32,13,Math.PI*0.72)[1]-1.5], [pt(32,32,13,Math.PI*0.72)[0]+1, pt(32,32,13,Math.PI*0.72)[1]+4.5]], "l-ink") + dot(pt(32, 32, 13, Math.PI * 1.68)[0], pt(32, 32, 13, Math.PI * 1.68)[1], 2.8, "l-fill-sage") },
      { vname: "Diff Gutters", concept: "Changed lines ranked by weight.", spec: "Tall sage, medium ink, short dim bars.", draw: () => rectR(16, 16, 8, 32, 2, "l-fill-sage") + rectR(28, 22, 8, 26, 2, "l-fill-ink") + rectR(40, 30, 8, 18, 2, "l-fill-dim") },
      { vname: "Add Chip", concept: "An addition, boxed and labeled.", spec: "Outlined square with a sage plus.", draw: () => rectR(16, 16, 32, 32, 7, "l-ink", 2.2) + line(24, 32, 40, 32, "l-sage", 2.4) + line(32, 24, 32, 40, "l-sage", 2.4) },
      { vname: "Remove Chip", concept: "A deletion, boxed and accepted.", spec: "Outlined square with an ink minus.", draw: () => rectR(16, 16, 32, 32, 7, "l-ink", 2.2) + line(24, 32, 40, 32, "l-ink", 2.4) },
      { vname: "Fork Y", concept: "One way becomes two ways.", spec: "Y fork with nodes at both tips.", draw: () => path("M32 52 L32 34", "l-ink", 2.3) + path("M32 34 C32 26 22 26 18 18", "l-ink", 2.3) + path("M32 34 C32 26 42 26 46 18", "l-sage", 2.3) + dot(18, 16, 3, "l-fill-ink") + dot(46, 16, 3, "l-fill-sage") },
      { vname: "Rebase Slide", concept: "A commit lifted onto newer ground.", spec: "Dashed lift arc from lower to upper rail.", draw: () => line(12, 44, 52, 44, "l-dim", 1.9) + line(12, 26, 52, 26, "l-ink", 2.2) + dot(26, 44, 3.4, "l-fill-sage") + path("M26 40 C26 33 26 31 26 30.5", "l-faint", 1.5) + dot(26, 26, 3.4, "l-fill-sage") },
      { vname: "Side By Side", concept: "Before and after, aligned for the eye.", spec: "Two panes: dim rows left, sage rows right.", draw: () => rectR(10, 18, 20, 28, 3, "l-faint", 1.5) + rectR(34, 18, 20, 28, 3, "l-sage", 1.8) + [[15, 25], [15, 32], [15, 39]].map(([x, y]) => line(x, y, x + 10, y, "l-dim", 1.6)).join("") + [[39, 25], [39, 32], [39, 39]].map(([x, y]) => line(x, y, x + 10, y, "l-sage", 1.8)).join("") },
      { vname: "Cherry Pick", concept: "One commit chosen out of the line.", spec: "Chain of dots, one lifted by a dashed thread.", draw: () => line(14, 40, 50, 40, "l-dim", 1.7) + dot(20, 40, 3, "l-fill-dim") + dot(32, 40, 3, "l-fill-dim") + dot(44, 40, 3, "l-fill-dim") + line(32, 36, 32, 26, "l-faint", 1.5) + dot(32, 22, 4, "l-fill-sage") },
      { vname: "Squash Point", concept: "Many moments pressed into one.", spec: "Arrow from three dots to one large dot.", draw: () => dot(16, 24, 2.6, "l-fill-dim") + dot(16, 32, 2.6, "l-fill-dim") + dot(16, 40, 2.6, "l-fill-dim") + line(22, 32, 36, 32, "l-sage", 2.2) + poly([[36, 27], [44, 32], [36, 37]], "l-sage") + dot(50, 32, 5, "l-fill-ink") },
      { vname: "Stash Hold", concept: "Changes put away but kept in reach.", spec: "Bracket pair storing two dots.", draw: () => path("M22 16 H14 V48 H22", "l-ink", 2.3) + path("M42 16 H50 V48 H42", "l-ink", 2.3) + dot(27, 32, 3.4, "l-fill-sage") + dot(37, 32, 3.4, "l-fill-dim") },
      { vname: "Conflict Meet", concept: "Two intents arriving at the same place.", spec: "Opposing arrows stopped at a shared node.", draw: () => line(10, 32, 24, 32, "l-ink", 2.3) + poly([[24, 27], [30, 32], [24, 37]], "l-ink") + line(54, 32, 40, 32, "l-sage", 2.3) + poly([[40, 27], [34, 32], [40, 37]], "l-sage") + circ(32, 32, 3.4, "l-ink", 2) },
      { vname: "History Rail", concept: "Time running down a single rail.", spec: "Vertical rail with alternating commit ticks.", draw: () => line(32, 12, 32, 52, "l-dim", 1.8) + dot(32, 18, 3.2, "l-fill-ink") + dot(32, 30, 3.2, "l-fill-sage") + dot(32, 42, 3.2, "l-fill-ink") + line(38, 18, 46, 18, "l-faint", 1.5) + line(38, 42, 44, 42, "l-faint", 1.5) },
      { vname: "Patch Page", concept: "The change as a page you can hold.", spec: "Page outline with plus and minus rows.", draw: () => rectR(16, 12, 32, 40, 3, "l-ink", 2) + line(22, 22, 32, 22, "l-sage", 2) + line(27, 17, 27, 27, "l-sage", 2) + line(22, 32, 34, 32, "l-ink", 2) + line(22, 42, 30, 42, "l-dim", 1.8) },
      { vname: "Blame Bars", concept: "Who changed what, as a quiet skyline.", spec: "Five vertical bars of varying height on a rail.", draw: () => [[14, 14, "l-dim"], [23, 26, "l-sage"], [32, 19, "l-ink"], [41, 30, "l-dim"], [50, 23, "l-sage"]].map(([x, top, c]) => line(x, top, x, 48, c, 3)).join("") + line(10, 49, 54, 49, "l-faint", 1.4) },
      { vname: "Fast Forward", concept: "Everything between skipped, cleanly.", spec: "Rail through dots ending in double chevrons.", draw: () => line(10, 32, 34, 32, "l-dim", 2) + dot(16, 32, 2.8, "l-fill-dim") + dot(28, 32, 2.8, "l-fill-dim") + path("M36 24 L46 32 L36 40", "l-ink", 2.3) + path("M46 24 L56 32 L46 40", "l-sage", 2.3) },
      { vname: "Release Tag", concept: "A version pinned like a luggage tag.", spec: "Tag shape with hole dot and string.", draw: () => poly([[14, 26], [34, 26], [50, 38], [34, 50], [14, 50]], "l-ink", 2.2) + dot(22, 38, 3, "l-fill-sage") + path("M22 38 C22 26 30 20 40 16", "l-faint", 1.5) },
    ],
  },
  {
    id: "wordmark-oa",
    name: "Wordmark & Initials",
    seed: 707,
    variants: [
      { vname: "Tight Lockup", concept: "The two letters kerned until they touch.", spec: "O and A set close, sage A.", draw: () => circ(23, 35, 9.5, "l-ink", 2.2) + path("M33.5 44 L42 23 L50.5 44", "l-sage", 2.2) + line(37.3, 37.5, 46.7, 37.5, "l-sage", 1.7) },
      { vname: "Underlined Lockup", concept: "Initials with the confidence of a baseline bar.", spec: "OA over a full-width rule.", draw: () => circ(24, 31, 8.5, "l-ink", 2.1) + letterA(43, 39, 17, "l-sage", 2.1) + line(12, 47, 52, 47, "l-ink", 2.4) },
      { vname: "Stadium Badge", concept: "The initials inside the softest possible box.", spec: "Stadium outline containing small O A.", draw: () => rectR(10, 22, 44, 20, 10, "l-ink", 2) + circ(23, 32, 4.6, "l-ink", 1.9) + path("M38 38 L43 26 L48 38", "l-sage", 1.9) + line(40.2, 34.6, 45.8, 34.6, "l-sage", 1.4) },
      { vname: "Totem Column", concept: "Stacked initials like a carved marker.", spec: "O over A, centered and even.", draw: () => circ(32, 19, 7.5, "l-ink", 2.1) + path("M22 52 L32 30 L42 52", "l-sage", 2.1) + line(25.6, 45.5, 38.4, 45.5, "l-sage", 1.6) },
      { vname: "Full Stop", concept: "The brand stated, then a period — done.", spec: "OA followed by an accent dot.", draw: () => circ(21, 32, 8.5, "l-ink", 2.1) + letterA(40, 40, 17, "l-sage", 2.1) + dot(52, 39, 3, "l-fill-sage") },
      { vname: "Spaced Dot Pair", concept: "A middle dot pacing the two letters apart.", spec: "O · A with generous tracking.", draw: () => circ(18, 32, 8, "l-ink", 2.1) + dot(32, 32, 2.6, "l-fill-dim") + letterA(46, 40, 16, "l-sage", 2.1) },
      { vname: "Outline Solid Mix", concept: "One letter outlined, one filled — tension kept.", spec: "Outline O beside solid sage A.", draw: () => circ(22, 33, 9, "l-ink", 2.2) + poly([[36, 43], [44.5, 23], [53, 43]], "l-fill-sage") + line(39.6, 37, 49.4, 37, "l-fill-paper") },
      { vname: "Solid Outline Mix", concept: "The mirror of the mix: solid O, drawn A.", spec: "Filled ink O beside outline A.", draw: () => dot(22, 33, 9, "l-fill-ink") + path("M36 43 L44.5 23 L53 43", "l-sage", 2.2) + line(39.6, 37, 49.4, 37, "l-sage", 1.7) },
      { vname: "Slashed Divider", concept: "A slash between initials, code style.", spec: "O / A with dim slash between.", draw: () => circ(20, 32, 8, "l-ink", 2.1) + line(34, 20, 28, 44, "l-dim", 2) + letterA(46, 40, 16, "l-sage", 2.1) },
      { vname: "Lowercase Duet", concept: "Softer voice: lowercase o and a.", spec: "Small o plus single-story a with stem.", draw: () => circ(24, 36, 6.5, "l-ink", 2.1) + circ(41, 37.5, 5, "l-sage", 2) + line(46, 27, 46, 43, "l-sage", 2) + path("M46 40 C46 43 43 44.5 40.5 43.5", "l-sage", 1.8) },
      { vname: "Chip Monogram", concept: "The monogram struck into a rounded chip.", spec: "Small rounded chip holding tiny O A.", draw: () => rectR(14, 20, 36, 24, 7, "l-ink", 2.1) + circ(25, 32, 3.6, "l-sage", 1.7) + path("M36 37 L39.5 27.5 L43 37", "l-ink", 1.7) + line(37.4, 34.2, 41.6, 34.2, "l-ink", 1.3) },
      { vname: "Arrow Crossbar", concept: "The A's crossbar fired left as an arrow into O.", spec: "Crossbar extended through to ring center.", draw: () => circ(22, 33, 9, "l-ink", 2.1) + line(22, 33, 44, 33, "l-sage", 2) + poly([[44, 29], [51, 33], [44, 37]], "l-fill-sage") + path("M40 44 L47 24 L54 44", "l-ink", 2.1) },
      { vname: "Serif Feet", concept: "A classical A with quiet feet, beside its O.", spec: "Footed serif A next to plain O.", draw: () => circ(21, 33, 8.5, "l-ink", 2.1) + path("M34 42 L43 21 L52 42", "l-sage", 2.1) + line(30.5, 42, 37.5, 42, "l-sage", 2.1) + line(48.5, 42, 55.5, 42, "l-sage", 2.1) + line(37.2, 35.5, 48.8, 35.5, "l-sage", 1.6) },
      { vname: "Leaning Set", concept: "Both letters leaning forward, in motion.", spec: "Italic-slanted OA pair.", draw: () => { const sk = (x, y) => [x + (46 - y) * 0.24, y]; const c = sk(23, 33); let s = circ(c[0], c[1], 8.5, "l-ink", 2.1); const a = [[38, 43], [45.5, 23], [53, 43]].map(([x, y]) => sk(x, y)); s += path(`M${f(a[0][0])} ${f(a[0][1])} L${f(a[1][0])} ${f(a[1][1])} L${f(a[2][0])} ${f(a[2][1])}`, "l-sage", 2.1); s += line(sk(40.6, 36.5)[0], 36.5, sk(49.6, 36.5)[0], 36.5, "l-sage", 1.6); return s; } },
      { vname: "Swash Tail", concept: "The A's leg sweeps under the O in one flourish.", spec: "Sage swash connecting A base under O.", draw: () => circ(23, 30, 8.5, "l-ink", 2.1) + path("M38 42 L45.5 22 L53 42 C54 47 48 49 42 47 C34 44 26 45 20 48", "l-sage", 2.1) + line(40.3, 35.5, 50.7, 35.5, "l-sage", 1.6) },
      { vname: "Geometric Single Story", concept: "An 'a' built from pure circles and a stem.", spec: "Circle-plus-stem lowercase a by an o.", draw: () => circ(23, 35, 7, "l-ink", 2.1) + circ(42, 36.5, 5.5, "l-sage", 2.1) + line(47.5, 26, 47.5, 43.5, "l-sage", 2.1) },
      { vname: "Offset Baseline", concept: "Playful misregistration of the two initials.", spec: "O raised, A lowered, faint guide rules.", draw: () => line(12, 26, 52, 26, "l-faint", 1.1) + line(12, 46, 52, 46, "l-faint", 1.1) + circ(23, 27, 8, "l-ink", 2.1) + letterA(42, 45, 17, "l-sage", 2.1) },
      { vname: "Corner Framed", concept: "Registration ticks claiming the corner space.", spec: "Four outer ticks around centered OA.", draw: () => path("M12 20 V12 H20", "l-faint", 1.8) + path("M44 12 H52 V20", "l-faint", 1.8) + path("M52 44 V52 H44", "l-faint", 1.8) + path("M20 52 H12 V44", "l-faint", 1.8) + circ(25, 32, 7, "l-ink", 2.1) + path("M38 39 L44 24.5 L50 39", "l-sage", 2.1) + line(40.2, 34.8, 47.8, 34.8, "l-sage", 1.5) },
      { vname: "Vast Field", concept: "Tiny initials in enormous quiet — scale as luxury.", spec: "Micro OA centered in a wide faint ring.", draw: () => circ(32, 32, 21, "l-faint", 1.2) + circ(27.5, 32.5, 3.4, "l-ink", 1.7) + path("M36.5 36 L39.5 28 L42.5 36", "l-sage", 1.6) + line(37.7, 33.6, 41.3, 33.6, "l-sage", 1.1) },
      { vname: "Stamp Pair", concept: "Initials rubber-stamped with a dashed ring.", spec: "Dashed circle seal around OA.", draw: () => `<circle class="l-ink" cx="32" cy="32" r="18" stroke-width="2" style="stroke-width:2;stroke-dasharray:4 4"/>` + circ(26, 33, 4.6, "l-ink", 1.8) + path("M36 38.5 L41 26.5 L46 38.5", "l-sage", 1.8) + line(37.7, 35, 44.3, 35, "l-sage", 1.4) },
    ],
  },
  {
    id: "hub-spoke",
    name: "Hub & Spoke",
    seed: 808,
    variants: [
      { vname: "Hub Four", concept: "One coordinator, four agents, nothing extra.", spec: "Center hub with four spoke nodes.", draw: () => spokeGraph(32, 32, 4, 13) },
      { vname: "Hub Six", concept: "The team grows; the hub stays calm.", spec: "Six evenly spaced spokes from center.", draw: () => spokeGraph(32, 32, 6, 15) },
      { vname: "Rim Team", concept: "Agents seated around one shared table edge.", spec: "Nodes on a rim circle linked to center.", draw: () => { let s = circ(32, 32, 14, "l-faint", 1.3) + dot(32, 32, 3.4, "l-fill-sage"); for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i * TAU) / 4; const [x, y] = pt(32, 32, 14, a); s += line(32, 32, x, y, "l-dim", 1.3) + circ(x, y, 3, "l-ink", 1.4); } return s; } },
      { vname: "Two Tier Tree", concept: "Delegation in two calm hops.", spec: "Hub to two mids to four leaves.", draw: () => { let s = dot(32, 14, 3.2, "l-fill-sage"); [[22, 28], [42, 28]].forEach(([x]) => { s += line(32, 14, x, 28, "l-dim", 1.3) + circ(x, 28, 2.6, "l-ink", 1.3); }); [[14, 44], [26, 44], [38, 44], [50, 44]].forEach(([x], i) => { const px = i < 2 ? 22 : 42; s += line(px, 28, x, 44, "l-faint", 1.2) + circ(x, 44, 2.2, "l-ink", 1.2); }); return s; } },
      { vname: "Daisy Eight", concept: "Petals of work arranged around a still center.", spec: "Eight petal ellipses rotating about core.", draw: () => { let s = dot(32, 32, 4, "l-fill-sage"); for (let i = 0; i < 8; i++) s += ell(32, 20.5, 3.6, 7.5, i % 2 ? "l-dim" : "l-sage", 1.5, (i * 360) / 8); return s; } },
      { vname: "Mesh Four", concept: "Everyone talks to everyone — four only.", spec: "Fully connected square of nodes.", draw: () => { const P = [[18, 18], [46, 18], [46, 46], [18, 46]]; let s = ""; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) s += line(P[i][0], P[i][1], P[j][0], P[j][1], "l-faint", 1.2); P.forEach(([x, y], i) => (s += dot(x, y, i === 0 ? 3.6 : 2.8, i === 0 ? "l-fill-sage" : "l-fill-ink"))); return s; } },
      { vname: "Open Constellation", concept: "Some links made, some left to chance.", spec: "Five irregular nodes, selective links.", draw: () => { const P = [[14, 40], [26, 16], [40, 30], [52, 14], [46, 48]]; const L = [[0, 1], [1, 2], [2, 3], [2, 4]]; let s = ""; L.forEach(([a, b]) => (s += line(P[a][0], P[a][1], P[b][0], P[b][1], "l-dim", 1.2))); P.forEach(([x, y], i) => (s += dot(x, y, i === 2 ? 3.4 : 2.4, i % 2 ? "l-fill-ink" : "l-fill-sage"))); return s; } },
      { vname: "One Chosen", concept: "Same ring, one agent highlighted for the task.", spec: "Six ring nodes, one enlarged and filled sage.", draw: () => { let s = circ(32, 32, 13, "l-faint", 1.3) + dot(32, 32, 2.8, "l-fill-ink"); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const [x, y] = pt(32, 32, 13, a); s += i === 1 ? dot(x, y, 4.2, "l-fill-sage") : circ(x, y, 2.6, "l-ink", 1.3); } return s; } },
      { vname: "Broadcast Corner", concept: "Announcing outward from one point.", spec: "Corner core with three widening arcs.", draw: () => dot(20, 44, 3.6, "l-fill-sage") + arc(20, 44, 9, -Math.PI * 0.75, -Math.PI * 0.05, "l-dim", 1.7) + arc(20, 44, 15, -Math.PI * 0.72, -Math.PI * 0.08, "l-ink", 1.9) + arc(20, 44, 21, -Math.PI * 0.68, -Math.PI * 0.12, "l-faint", 1.5) },
      { vname: "Single Delegation", concept: "The simplest orchestration: one to one.", spec: "Long arrow from hub to a single node.", draw: () => dot(18, 32, 4.4, "l-fill-sage") + line(24, 32, 42, 32, "l-dim", 1.7) + poly([[42, 27.5], [50, 32], [42, 36.5]], "l-fill-ink") },
      { vname: "Fan Blades Three", concept: "Three directions fanned from one hinge.", spec: "120-degree fan lines with end dots.", draw: () => { let s = dot(32, 46, 3.4, "l-fill-ink"); [-90, 30, 150].forEach((deg) => { const a = (deg * Math.PI) / 180; const [x, y] = pt(32, 46, 22, a); s += line(32, 46, x, y, "l-sage", 1.9) + circ(x, y, 3, "l-ink", 1.4); }); return s; } },
      { vname: "Cartwheel", concept: "A wheel of agents, hub at the middle.", spec: "Rim plus eight bare spokes plus hub.", draw: () => { let s = circ(32, 32, 16, "l-ink", 2) + dot(32, 32, 3.4, "l-fill-sage"); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const [x1, y1] = pt(32, 32, 3.4, a); const [x2, y2] = pt(32, 32, 16, a); s += line(x1, y1, x2, y2, "l-dim", 1.2); } return s; } },
      { vname: "Tri Clusters", concept: "Three small teams, each with its own lead.", spec: "Three mini-hubs with paired leaves.", draw: () => { let s = ""; [[32, 14], [15, 42], [49, 42]].forEach(([hx, hy], k) => { s += dot(hx, hy, 3, "l-fill-sage"); for (let i = 0; i < 2; i++) { const a = Math.PI / 2 + (i ? 0.7 : -0.7) + (k * TAU) / 3; const [x, y] = pt(hx, hy, 9, a); s += line(hx, hy, x, y, "l-faint", 1.2) + circ(x, y, 2.2, "l-ink", 1.2); } }); return s; } },
      { vname: "Relay Line", concept: "Work passed hand to hand along a line.", spec: "Four nodes; the passing gap highlighted.", draw: () => { const ys = [20, 20]; return line(12, 32, 52, 32, "l-faint", 1.4) + dot(16, 32, 3, "l-fill-dim") + dot(28, 32, 3, "l-fill-ink") + arc(40, 32, 6, Math.PI * 0.6, Math.PI * 1.4, "l-sage", 2) + dot(48, 32, 3, "l-fill-dim"); } },
      { vname: "Star Core", concept: "The hub drawn as a spark among points.", spec: "Ten-point outline star with core dot.", draw: () => poly(starPts(32, 32, 17, 7, 5), "l-ink", 1.8) + dot(32, 32, 3.4, "l-fill-sage") },
      { vname: "Hex Flower", concept: "Seven seats: one lead, six around.", spec: "Center node plus hexagonal ring nodes.", draw: () => { let s = dot(32, 32, 3.6, "l-fill-sage"); reg(32, 32, 13, 6).forEach(([x, y]) => (s += line(32, 32, x, y, "l-faint", 1.2) + circ(x, y, 2.7, "l-ink", 1.3))); return s; } },
      { vname: "Orbit Team Plus One", concept: "Two circling, one waiting outside.", spec: "Dashed orbit with two dots, one outside.", draw: () => `<circle class="l-faint" cx="30" cy="32" r="12" stroke-width="1.3" style="stroke-width:1.3;stroke-dasharray:3 4"/>` + dot(30, 32, 3.2, "l-fill-sage") + dot(pt(30, 32, 12, 0.9)[0], pt(30, 32, 12, 0.9)[1], 2.8, "l-fill-ink") + dot(51, 32, 2.8, "l-fill-dim") },
      { vname: "Node Pyramid", concept: "Hierarchy as a triangle of peers.", spec: "Three levels of dots fully connected down.", draw: () => { const rows = [[[32, 14]], [[20, 34], [44, 34]], [[12, 50], [32, 50], [52, 50]]]; let s = ""; rows[0].forEach(([x, y]) => { s += dot(x, y, 3.4, "l-fill-sage"); rows[1].forEach(([x2, y2]) => (s += line(x, y, x2, y2, "l-dim", 1.2))); }); rows[1].forEach(([x, y], i) => { s += i === 0 ? dot(x, y, 2.8, "l-fill-ink") : circ(x, y, 2.8, "l-ink", 1.3); rows[2].forEach(([x2, y2]) => (s += line(x, y, x2, y2, "l-faint", 1.1))); }); rows[2].forEach(([x, y]) => (s += dot(x, y, 2.4, "l-fill-dim"))); return s; } },
      { vname: "Hanging Mobile", concept: "Structure suspended, balanced from above.", spec: "Line down to hub fanning three below.", draw: () => line(32, 10, 32, 24, "l-dim", 1.5) + line(26, 10, 38, 10, "l-faint", 1.4) + dot(32, 28, 3.4, "l-fill-sage") + [[18, 46], [32, 48], [46, 46]].map(([x, y]) => line(32, 28, x, y, "l-faint", 1.2) + circ(x, y, 2.6, "l-ink", 1.3)).join("") },
      { vname: "Radar Sweep", concept: "One sweep, two returns.", spec: "Circle, sweep radius, two contact blips.", draw: () => circ(32, 32, 17, "l-ink", 1.9) + line(32, 32, pt(32, 32, 17, -Math.PI / 3)[0], pt(32, 32, 17, -Math.PI / 3)[1], "l-sage", 1.8) + dot(24, 24, 2.6, "l-fill-sage") + dot(42, 38, 2.2, "l-fill-dim") },
    ],
  },
  {
    id: "editor-panes",
    name: "Editor & Window",
    seed: 909,
    variants: [
      { vname: "Explorer Pane", concept: "Files on the left, work on the right.", spec: "Window with sidebar rail and active file tick.", draw: () => winFrame() + line(20, 23, 20, 50, "l-dim", 1.2) + line(24, 30, 32, 30, "l-sage", 2) + line(24, 36, 30, 36, "l-faint", 1.6) + line(24, 42, 31, 42, "l-faint", 1.6) + codeRows(26, 32, [16, 12, 14, 9], 6, 1.6) },
      { vname: "Traffic Lights", concept: "Three dots and nothing else — macOS at rest.", spec: "Minimal titlebar with prominent dots.", draw: () => rectR(12, 22, 40, 22, 5, "l-ink", 1.8) + dot(19, 28, 2.2, "l-fill-dim") + dot(25, 28, 2.2, "l-fill-dim") + dot(31, 28, 2.2, "l-fill-sage") },
      { vname: "Vertical Split", concept: "Two files side by side, one wall between.", spec: "Window divided by a vertical rule.", draw: () => winFrame() + line(32, 23, 32, 50, "l-dim", 1.3) + codeRows(15, 30, [12, 9], 6, 1.5) + codeRows(37, 30, [11, 13], 6, 1.5) },
      { vname: "Horizontal Split", concept: "Editor above, its output below.", spec: "Window divided by a horizontal rule.", draw: () => winFrame() + line(10, 38, 54, 38, "l-dim", 1.3) + codeRows(15, 29, [16, 12], 6, 1.5) + line(15, 44, 29, 44, "l-sage", 1.7) + line(15, 48, 24, 48, "l-faint", 1.6) },
      { vname: "Tab Row", concept: "Three open files, one in focus.", spec: "Tabs along the titlebar, active filled.", draw: () => rectR(10, 14, 44, 36, 5, "l-ink", 1.8) + rectR(13, 16, 12, 7, 2, "l-fill-sage") + rectR(27, 16, 12, 7, 2, "l-faint") + rectR(41, 16, 10, 7, 2, "l-faint") + line(10, 25, 54, 25, "l-dim", 1.2) + codeRows(15, 31, [16, 11, 13], 6, 1.6) },
      { vname: "Activity Rail", concept: "The tall thin rail that anchors everything.", spec: "Far-left icon column, editor lines right.", draw: () => winFrame() + line(17, 23, 17, 50, "l-dim", 1.1) + dot(13.5, 29, 1.8, "l-fill-sage") + dot(13.5, 36, 1.8, "l-fill-dim") + dot(13.5, 43, 1.8, "l-fill-dim") + codeRows(23, 30, [18, 13, 15, 9], 6, 1.6) },
      { vname: "Docked Tray", concept: "The terminal tray tucked under the editor.", spec: "Editor lines over a separated tray strip.", draw: () => winFrame() + codeRows(15, 29, [15, 11], 6, 1.6) + rectR(13, 41, 38, 6, 2, "l-fill-dim") + gt(17, 44, 2.2, "l-paper", 1.6) + cursorBar(21.5, 46, 7, "l-paper", 1.6) },
      { vname: "Cascade Pair", concept: "Two sessions overlapping, both alive.", spec: "Offset window pair, front one brighter.", draw: () => rectR(16, 10, 36, 28, 4, "l-faint", 1.5) + rectR(12, 18, 36, 28, 4, "l-ink", 1.9) + line(12, 25, 48, 25, "l-dim", 1.1) + dot(17, 21.5, 1.5, "l-fill-sage") + codeRows(17, 31, [14, 10, 12], 5.5, 1.4) },
      { vname: "Zen Caret", concept: "Everything hidden but the insertion point.", spec: "Hairline top border and lone caret.", draw: () => line(14, 18, 50, 18, "l-faint", 1.2) + line(32, 30, 32, 42, "l-sage", 2.6) },
      { vname: "Quad Grid", concept: "Four panes, four concurrent views.", spec: "Window crossed into quadrants.", draw: () => rectR(10, 14, 44, 36, 5, "l-ink", 1.8) + line(32, 14, 32, 50, "l-dim", 1.2) + line(10, 32, 54, 32, "l-dim", 1.2) + dot(21, 23, 1.8, "l-fill-sage") + dot(43, 23, 1.8, "l-fill-dim") + dot(21, 41, 1.8, "l-fill-dim") + dot(43, 41, 1.8, "l-fill-dim") },
      { vname: "File Rail Active", concept: "One file expanded, the rest asleep.", spec: "Sidebar list with indented active block.", draw: () => winFrame() + line(22, 23, 22, 50, "l-dim", 1.2) + line(25, 30, 33, 30, "l-dim", 1.6) + rectR(25, 33, 12, 4, 1, "l-fill-sage") + line(29, 42, 37, 42, "l-faint", 1.5) + line(29, 47, 34, 47, "l-faint", 1.5) + codeRows(41, 30, [9, 8], 5, 1.4) },
      { vname: "Inspector Panel", concept: "The object on the left, its dials on the right.", spec: "Main pane plus slider stack in side panel.", draw: () => winFrame() + line(36, 23, 36, 50, "l-dim", 1.2) + codeRows(15, 30, [14, 10, 12], 6, 1.5) + [[42, 30], [42, 38], [42, 46]].map(([x, y], i) => line(x, y, x + 14, y, "l-faint", 1.4) + dot(x + 4 + i * 3, y, 2, "l-fill-sage")).join("") },
      { vname: "Floating Card", concept: "Detail lifted above the page it came from.", spec: "Dimmed window behind an offset card.", draw: () => rectR(10, 12, 40, 34, 4, "l-faint", 1.4) + rectR(18, 22, 34, 26, 4, "l-ink", 1.8) + line(23, 30, 40, 30, "l-sage", 1.9) + line(23, 37, 35, 37, "l-dim", 1.5) + line(23, 43, 38, 43, "l-dim", 1.5) },
      { vname: "Status Strip", concept: "One quiet line reporting all is well.", spec: "Window with bottom strip and status dot.", draw: () => winFrame() + codeRows(15, 29, [16, 12, 14], 5.5, 1.5) + rectR(10, 44, 44, 6, 2, "l-fill-dim") + dot(15, 47, 1.8, "l-fill-sage") + line(20, 47, 34, 47, "l-paper", 1.4) },
      { vname: "Breadcrumb Trail", concept: "Where you are, written as a dotted path.", spec: "Chevron breadcrumb above content rules.", draw: () => winFrame() + dot(17, 29, 1.8, "l-fill-sage") + gt(22, 29, 2.4, "l-faint", 1.5) + dot(30, 29, 1.8, "l-fill-dim") + gt(35, 29, 2.4, "l-faint", 1.5) + dot(43, 29, 1.8, "l-fill-dim") + codeRows(15, 37, [18, 13, 15], 5, 1.5) },
      { vname: "Diff Panes", concept: "Removed left, added right — no colors needed.", spec: "Split window: dim rows vs sage rows.", draw: () => winFrame() + line(32, 23, 32, 50, "l-dim", 1.2) + [29, 35, 41, 47].map((y) => line(15, y, 28, y, "l-dim", 1.6)).join("") + [29, 35, 41, 47].map((y) => line(36, y, 49, y, "l-sage", 1.8)).join("") },
      { vname: "Command Bar", concept: "One input floating above everything.", spec: "Centered palette bar with caret over dim pane.", draw: () => rectR(10, 14, 44, 36, 5, "l-faint", 1.3) + line(14, 22, 50, 22, "l-faint", 1.2) + rectR(14, 30, 36, 8, 3, "l-ink", 1.8) + cursorBar(19, 34, 9, "l-sage", 2) + line(19, 43, 33, 43, "l-faint", 1.4) },
      { vname: "Badge Dot", concept: "Something finished, quietly noted.", spec: "Window titlebar with corner badge dot.", draw: () => winFrame() + codeRows(15, 30, [16, 12], 6, 1.6) + dot(49, 18, 2.6, "l-fill-sage") },
      { vname: "Focus Solo", concept: "Neighbors dashed away; one pane matters.", spec: "Solid main pane between dashed ghosts.", draw: () => rectR(6, 10, 16, 20, 3, "l-faint", 1.2) + rectR(42, 10, 16, 20, 3, "l-faint", 1.2) + rectR(14, 34, 36, 22, 4, "l-ink", 2) + codeRows(19, 40, [16, 11, 13], 5, 1.5) },
      { vname: "Slide Drawer", concept: "A panel mid-slide, caught by its arrow notch.", spec: "Drawer panel entering with tab notch.", draw: () => winFrame() + rectR(34, 26, 20, 22, 3, "l-fill-sage") + poly([[34, 33], [28, 37], [34, 41]], "l-fill-sage") + line(39, 33, 49, 33, "l-paper", 1.6) + line(39, 41, 46, 41, "l-paper", 1.6) },
    ],
  },
  {
    id: "spark-signal",
    name: "Spark & Signal",
    seed: 1010,
    variants: [
      { vname: "Four Point Spark", concept: "The single spark of an agent waking up.", spec: "Classic filled four-point star.", draw: () => spark4(32, 32, 15, 5.5) },
      { vname: "Ringed Spark", concept: "A spark kept within its own boundary.", spec: "Spark centered in a thin ring.", draw: () => circ(32, 32, 17, "l-ink", 1.9) + spark4(32, 32, 9, 3.2) },
      { vname: "Calm Pulse", concept: "Steady work with one bright spike.", spec: "Flatline rising to one ECG peak.", draw: () => path("M10 36 H22 L29 20 L36 46 L41 36 H54", "l-ink", 2.3) + dot(29, 20, 2.6, "l-fill-sage") },
      { vname: "Air Waves", concept: "A signal leaving quietly from a corner.", spec: "Three arcs from a lower-left source.", draw: () => dot(18, 46, 3.4, "l-fill-sage") + arc(18, 46, 9, -Math.PI * 0.5, 0, "l-dim", 1.7) + arc(18, 46, 16, -Math.PI * 0.5, 0, "l-ink", 1.9) + arc(18, 46, 23, -Math.PI * 0.48, -0.04, "l-faint", 1.5) },
      { vname: "Node Triad", concept: "Three points of intelligence, evenly bound.", spec: "Triangle nodes on connecting hairlines.", draw: () => { const P = reg(32, 34, 14, 3); let s = ""; P.forEach(([x, y], i) => s += line(x, y, P[(i + 1) % 3][0], P[(i + 1) % 3][1], "l-faint", 1.3)); P.forEach(([x, y], i) => s += dot(x, y, i === 0 ? 3.6 : 2.8, i === 0 ? "l-fill-sage" : "l-fill-ink")); return s; } },
      { vname: "North Spark", concept: "Direction found: the spark marks true north.", spec: "Spark atop a mast over a baseline.", draw: () => line(12, 50, 52, 50, "l-dim", 1.6) + line(32, 50, 32, 38, "l-ink", 1.9) + spark4(32, 30, 8, 2.8) },
      { vname: "Uneven Radiate", concept: "Energy spent unevenly, honestly.", spec: "Rays of alternating length and class.", draw: () => { let s = dot(32, 32, 3.6, "l-fill-ink"); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; const r = i % 2 ? 9 : 13; const [x1, y1] = pt(32, 32, 5.5, a); const [x2, y2] = pt(32, 32, r, a); s += line(x1, y1, x2, y2, i % 2 ? "l-sage" : "l-dim", 1.7); } return s; } },
      { vname: "Twin Pulses", concept: "Two agents' heartbeats side by side.", spec: "Mirrored small pulses facing a gap.", draw: () => path("M8 34 H16 L21 26 L26 40 L29 34 H36", "l-ink", 2.1) + path("M30 34 H36 L41 42 L46 28 L49 34 H56", "l-sage", 2.1) },
      { vname: "Signal Steps", concept: "Capability arriving one bar at a time.", spec: "Ascending bars, sage at each new height.", draw: () => [[16, 40, 8, "l-dim"], [25, 34, 14, "l-dim"], [34, 28, 20, "l-sage"], [43, 22, 26, "l-ink"]].map(([x, y, h, c]) => rectR(x, y, 6, h, 1.5, c)).join("") },
      { vname: "Inner Eye", concept: "Attention itself — the watching agent.", spec: "Almond eye shape around an iris dot.", draw: () => path("M12 32 C22 20 42 20 52 32 C42 44 22 44 12 32 Z", "l-ink", 2) + circ(32, 32, 5.5, "l-sage", 1.9) + dot(32, 32, 2, "l-fill-ink") },
      { vname: "Spark Trail", concept: "Motion implied by three fading dashes.", spec: "Spark with diagonal echo dashes behind.", draw: () => spark4(42, 24, 10, 3.6) + line(24, 40, 31, 33, "l-dim", 1.8) + line(16, 46, 20, 42, "l-faint", 1.6) },
      { vname: "Mast Antenna", concept: "A tiny station broadcasting on all sides.", spec: "Mast, tripod base, paired side arcs.", draw: () => line(32, 18, 32, 44, "l-ink", 2) + line(24, 50, 32, 42, "l-dim", 1.6) + line(40, 50, 32, 42, "l-dim", 1.6) + arc(24, 30, 7, -Math.PI * 0.45, Math.PI * 0.45, "l-sage", 1.7) + arc(40, 30, 7, Math.PI * 0.55, Math.PI * 1.45, "l-sage", 1.7) },
      { vname: "Thin Burst Eight", concept: "Radiance without weight.", spec: "Eight hairline rays around open center.", draw: () => { let s = ""; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const [x1, y1] = pt(32, 32, 7, a); const [x2, y2] = pt(32, 32, 16, a); s += line(x1, y1, x2, y2, i % 2 ? "l-dim" : "l-ink", 1.4); } return s + circ(32, 32, 3.4, "l-sage", 1.5); } },
      { vname: "Uplink Half Halo", concept: "Sending up only — nothing coming back yet.", spec: "Dot under stacked upper arcs.", draw: () => dot(32, 44, 3.8, "l-fill-ink") + arc(32, 47, 9, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 1.9) + arc(32, 47, 15, -Math.PI * 0.68, -Math.PI * 0.32, "l-faint", 1.5) },
      { vname: "Synapse Gap", concept: "Thought jumping between two points.", spec: "Two dots bridged by a small zigzag.", draw: () => dot(16, 32, 3.6, "l-fill-ink") + dot(48, 32, 3.6, "l-fill-ink") + path("M21 32 L27 27 L33 35 L39 29 L43 32", "l-sage", 1.9) },
      { vname: "Beam Tower", concept: "Light thrown far from a small tower.", spec: "Trapezoid mast with outward beam lines.", draw: () => poly([[26, 50], [29, 26], [35, 26], [38, 50]], "l-ink", 1.9) + line(20, 20, 28, 26, "l-sage", 1.8) + line(44, 20, 36, 26, "l-sage", 1.8) + line(12, 50, 52, 50, "l-dim", 1.5) },
      { vname: "Echo Fade Rings", concept: "Presence fading politely into the room.", spec: "Core dot with rings stepping down classes.", draw: () => dot(32, 32, 4.4, "l-fill-ink") + circ(32, 32, 10, "l-sage", 1.8) + circ(32, 32, 15.5, "l-dim", 1.4) + circ(32, 32, 20.5, "l-faint", 1.1) },
      { vname: "Contained Spark", concept: "Power held inside a soft container.", spec: "Rounded square outline holding a spark.", draw: () => rectR(13, 13, 38, 38, 10, "l-ink", 2.1) + spark4(32, 32, 10, 3.6) },
      { vname: "Fade Row", concept: "Attention tapering off to rest.", spec: "Five dots shrinking toward quiet.", draw: () => [[14, 3.4, "l-fill-ink"], [23, 2.9, "l-fill-ink"], [32, 2.4, "l-fill-sage"], [41, 1.9, "l-fill-sage"], [50, 1.4, "l-fill-dim"]].map(([x, r, c]) => dot(x, 32, r, c)).join("") },
      { vname: "Flare Cross", concept: "One vertical ambition, one horizontal reach.", spec: "Elongated thin cross flare plus core.", draw: () => line(32, 10, 32, 54, "l-ink", 1.6) + line(16, 32, 48, 32, "l-ink", 1.6) + line(25, 20, 39, 44, "l-faint", 1.1) + line(39, 20, 25, 44, "l-faint", 1.1) + dot(32, 32, 3.4, "l-fill-sage") },
    ],
  },
  {
    id: "hex-circuit",
    name: "Hex & Circuit",
    seed: 1111,
    variants: [
      { vname: "Hex Badge", concept: "The engineering badge, plain and proud.", spec: "Hexagon outline with center dot.", draw: () => poly(reg(32, 32, 17, 6), "l-ink", 2.2) + dot(32, 32, 3.4, "l-fill-sage") },
      { vname: "Hex Nut", concept: "Hardware honesty: a nut drawn as identity.", spec: "Hexagon with circular bore.", draw: () => poly(reg(32, 32, 17, 6), "l-ink", 2.2) + circ(32, 32, 7, "l-sage", 1.9) },
      { vname: "Honeycomb Trio", concept: "Three cells working as one structure.", spec: "Clustered hexagons sharing edges.", draw: () => poly(reg(24, 24, 11, 6), "l-ink", 1.9) + poly(reg(40, 24, 11, 6), "l-sage", 1.9) + poly(reg(32, 39, 11, 6), "l-ink", 1.9) },
      { vname: "Chip Legs", concept: "The processor portrait, pins and all.", spec: "Square die with stub pins on four sides.", draw: () => rectR(20, 20, 24, 24, 3, "l-ink", 2.1) + [26, 32, 38].map((p) => line(p, 14, p, 19, "l-dim", 1.7) + line(p, 45, p, 50, "l-dim", 1.7) + line(14, p, 19, p, "l-dim", 1.7) + line(45, p, 50, p, "l-dim", 1.7)).join("") + dot(32, 32, 2.6, "l-fill-sage") },
      { vname: "Round Die", concept: "A softer silicon story.", spec: "Circular die with cardinal pins.", draw: () => circ(32, 32, 12, "l-ink", 2.1) + [[32, 14, 32, 19], [32, 45, 32, 50], [14, 32, 19, 32], [45, 32, 50, 32]].map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, "l-dim", 1.7)).join("") + dot(32, 32, 3, "l-fill-sage") },
      { vname: "Trace Elbow", concept: "A route with two considered turns.", spec: "PCB trace with pads at both ends.", draw: () => path("M12 46 V30 H34 V18 H52", "l-ink", 2.1) + dot(12, 46, 2.8, "l-fill-sage") + dot(52, 18, 2.8, "l-fill-sage") },
      { vname: "Trace Fork", concept: "One signal politely becoming two.", spec: "Splitting trace with via dots.", draw: () => path("M12 32 H28 C34 32 34 22 40 22 H52", "l-ink", 1.9) + path("M28 32 C34 32 34 42 40 42 H52", "l-sage", 1.9) + dot(12, 32, 2.6, "l-fill-ink") + dot(52, 22, 2.2, "l-fill-sage") + dot(52, 42, 2.2, "l-fill-sage") },
      { vname: "Circuit Hex", concept: "The badge with its wiring showing.", spec: "Hexagon with traces from vertices inward.", draw: () => { let s = poly(reg(32, 32, 17, 6), "l-ink", 2); [0, 2, 4].forEach((i) => { const [x, y] = reg(32, 32, 17, 6)[i]; s += line(x, y, pt(32, 32, 6.5, -Math.PI / 2 + (i * TAU) / 6)[0], pt(32, 32, 6.5, -Math.PI / 2 + (i * TAU) / 6)[1], "l-dim", 1.4); }); return s + dot(32, 32, 2.6, "l-fill-sage"); } },
      { vname: "Board Corner", concept: "Traces fanning off the board edge.", spec: "Corner origin with three routed lines.", draw: () => path("M12 12 V52", "l-faint", 1.4) + path("M12 12 H52", "l-faint", 1.4) + [[44, 20, "l-ink"], [36, 30, "l-sage"], [44, 42, "l-dim"]].map(([ex, ey, c]) => path(`M16 ${f(ex === 44 ? 18 : 24)} H28 L${f(ex - 8)} ${f(ey)} H${f(ex)}`, c, 1.6) + dot(ex, ey, 2, "l-fill-sage")).join("") },
      { vname: "Socket Cradle", concept: "The slot waiting for its module.", spec: "U bracket cradling a small square die.", draw: () => path("M16 16 V44 Q16 50 22 50 H42 Q48 50 48 44 V16", "l-ink", 2.1) + rectR(24, 26, 16, 16, 2.5, "l-sage", 1.9) + dot(32, 34, 2.2, "l-fill-ink") },
      { vname: "Pad Grid", concept: "A field of contacts, one chosen.", spec: "Nine pads, center emphasized.", draw: () => { let s = ""; for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 3; rx++) { const x = 20 + rx * 12, y = 20 + ry * 12; s += rx === 1 && ry === 1 ? dot(x, y, 4, "l-fill-sage") : circ(x, y, 2.6, "l-dim", 1.3); } return s; } },
      { vname: "Offset Hex Pair", concept: "Two modules overlapping in cooperation.", spec: "Offset hexes, sage over ink.", draw: () => poly(reg(26, 28, 14, 6), "l-ink", 2) + poly(reg(38, 36, 14, 6), "l-sage", 2) },
      { vname: "Via Run", concept: "A stitched path of connections.", spec: "Dotted vias between terminal pads.", draw: () => line(12, 32, 52, 32, "l-faint", 1.4) + dot(14, 32, 3, "l-fill-ink") + [24, 32, 40].map((x) => dot(x, 32, 2, "l-fill-sage")).join("") + dot(50, 32, 3, "l-fill-ink") },
      { vname: "Diamond Die", concept: "Silicon turned on its corner.", spec: "Rotated square chip, corner pins.", draw: () => poly([[32, 16], [48, 32], [32, 48], [16, 32]], "l-ink", 2.1) + [[32, 16], [48, 32], [32, 48], [16, 32]].map(([x, y]) => line(x, y, x + (x - 32) * 0.18, y + (y - 32) * 0.18, "l-dim", 1.6)).join("") + dot(32, 32, 2.6, "l-fill-sage") },
      { vname: "Hex Annulus", concept: "Depth inside the badge — a hole in the hexagon.", spec: "Hexagon outline with inner hex void.", draw: () => poly(reg(32, 32, 17, 6), "l-ink", 2.2) + poly(reg(32, 32, 8.5, 6), "l-faint", 1.4) },
      { vname: "Bus Trio", concept: "Three lanes running together, dropping off.", spec: "Parallel traces with stubs and pads.", draw: () => [22, 32, 42].map((y, i) => line(12, y, 40, y, i === 1 ? "l-sage" : "l-ink", 1.8) + line(40, y, 46, y + (i - 1) * 4, i === 1 ? "l-sage" : "l-ink", 1.6) + dot(48, y + (i - 1) * 4, 2, "l-fill-sage")).join("") },
      { vname: "Hub Pad", concept: "One large contact feeding three small.", spec: "Big pad linked by traces to three pads.", draw: () => dot(20, 32, 6, "l-fill-ink") + [[44, 18], [46, 32], [44, 46]].map(([x, y]) => path(`M26 32 C34 32 34 ${f(y)} ${f(x - 6)} ${f(y)}`, "l-dim", 1.5) + dot(x, y, 2.6, "l-fill-sage")).join("") },
      { vname: "Coil Bumps", concept: "An inductor resting between its pads.", spec: "Three semicircular bumps on a line.", draw: () => line(10, 36, 16, 36, "l-ink", 2) + arc(21, 36, 5, Math.PI, TAU, "l-ink", 2) + arc(31, 36, 5, Math.PI, TAU, "l-ink", 2) + arc(41, 36, 5, Math.PI, TAU, "l-ink", 2) + line(46, 36, 54, 36, "l-ink", 2) + dot(10, 36, 2.2, "l-fill-sage") + dot(54, 36, 2.2, "l-fill-sage") },
      { vname: "Resistor Zig", concept: "Resistance acknowledged with calm geometry.", spec: "Zigzag stroke between two pads.", draw: () => line(8, 32, 16, 32, "l-dim", 1.8) + path("M16 32 L20 25 L27 39 L34 25 L41 39 L46 32", "l-ink", 1.9) + line(46, 32, 56, 32, "l-dim", 1.8) + dot(8, 32, 2.4, "l-fill-sage") + dot(56, 32, 2.4, "l-fill-sage") },
      { vname: "Grounded Trace", concept: "Every circuit needs somewhere to rest.", spec: "Vertical trace into ground symbol.", draw: () => line(32, 10, 32, 36, "l-ink", 2) + dot(32, 10, 2.6, "l-fill-sage") + line(20, 38, 44, 38, "l-ink", 2) + line(24, 43, 40, 43, "l-dim", 1.8) + line(28, 48, 36, 48, "l-faint", 1.6) },
    ],
  },
  {
    id: "omega-marks",
    name: "Omega Marks",
    seed: 1212,
    variants: [
      { vname: "Omega Plain", concept: "Om — the sound of everything, drawn once.", spec: "Stroke omega with short feet.", draw: () => omegaArc(32, 32, 15) },
      { vname: "Heavy Omega", concept: "The same word said with more weight.", spec: "Thick-stroke omega.", draw: () => omegaArc(32, 33, 14, 55, "l-ink", 5.5, 6) },
      { vname: "Ringed Omega", concept: "The omega kept inside its own boundary.", spec: "Small omega centered in a ring.", draw: () => circ(32, 32, 18, "l-ink", 1.9) + omegaArc(32, 33, 10, 60, "l-sage", 2.1, 3.5) },
      { vname: "Wide Feet Omega", concept: "Standing wider, standing calmer.", spec: "Open omega with long flat feet.", draw: () => omegaArc(32, 31, 14, 70, "l-ink", 2.3, 8) },
      { vname: "Narrow Gap Omega", concept: "Nearly closed — attention almost complete.", spec: "Tight-gap omega.", draw: () => omegaArc(32, 32, 15, 34, "l-ink", 2.4, 4) },
      { vname: "Slit Omega", concept: "Closed except for one honest slit.", spec: "Minimal gap omega.", draw: () => omegaArc(32, 32, 15.5, 22, "l-ink", 2.5, 3.5) },
      { vname: "Twin Omegas", concept: "Said twice, meaning company.", spec: "Two small omegas side by side.", draw: () => omegaArc(21, 34, 9, 60, "l-ink", 2.1, 3) + omegaArc(43, 34, 9, 60, "l-sage", 2.1, 3) },
      { vname: "Counter Dot Omega", concept: "The omega holding one point of light.", spec: "Omega with a sage counter dot.", draw: () => omegaArc(32, 33, 14, 55, "l-ink", 2.3, 4.5) + dot(32, 27, 2.6, "l-fill-sage") },
      { vname: "Baseline Omega", concept: "Set down gently on a rule.", spec: "Omega seated on a baseline bar.", draw: () => line(12, 50, 52, 50, "l-dim", 1.6) + omegaArc(32, 36, 14, 55, "l-ink", 2.3, 4.5) },
      { vname: "Bare Arc Feet Dots", concept: "Deconstructed: arc above, dots beneath.", spec: "Open arc with detached foot dots.", draw: () => { const g = (58 * Math.PI) / 180; return arc(32, 32, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 2.3) + dot(pt(32, 32, 14, Math.PI / 2 + g)[0] + 2, pt(32, 32, 14, Math.PI / 2 + g)[1] + 1, 2, "l-fill-sage") + dot(pt(32, 32, 14, Math.PI / 2 - g)[0] - 2, pt(32, 32, 14, Math.PI / 2 - g)[1] + 1, 2, "l-fill-sage"); } },
      { vname: "Squared Omega", concept: "Geometry first: the omega squared off.", spec: "Rounded-rect arch with legs.", draw: () => path("M20 46 V30 Q20 18 32 18 Q44 18 44 30 V46", "l-ink", 2.4) + line(16, 46, 26, 46, "l-ink", 2.4) + line(38, 46, 48, 46, "l-ink", 2.4) },
      { vname: "Descending Omega", concept: "The omega allowed to sink below the line.", spec: "Baseline crossing through lower third.", draw: () => line(10, 42, 54, 42, "l-dim", 1.5) + omegaArc(32, 37, 14, 55, "l-ink", 2.3, 4.5) },
      { vname: "Halo Omega", concept: "A quiet halo behind the word.", spec: "Faint ring behind smaller omega.", draw: () => circ(32, 32, 19, "l-faint", 1.2) + omegaArc(32, 34, 11, 55, "l-ink", 2.2, 3.5) },
      { vname: "Slit Crown", concept: "Cut clean through the top — openness declared.", spec: "Omega with paper vertical cut at crown.", draw: () => omegaArc(32, 33, 14, 55, "l-ink", 2.3, 4.5) + line(32, 12.8, 32, 21.5, "l-paper", 3.2) },
      { vname: "Raised Mark Rule", concept: "Small mark held high above its underline.", spec: "Compact omega over a wide rule.", draw: () => omegaArc(32, 24, 9, 60, "l-ink", 2.1, 3) + line(14, 46, 50, 46, "l-sage", 2.2) },
      { vname: "Wave Crest Omega", concept: "The crown doubled like a calm wave.", spec: "Double-bump top over straight feet.", draw: () => path("M18 44 V32 Q18 20 26 24 Q29 26 32 22 Q35 26 38 24 Q46 20 46 32 V44", "l-ink", 2.3) + line(14, 44, 24, 44, "l-ink", 2.3) + line(40, 44, 50, 44, "l-ink", 2.3) },
      { vname: "Anchor Omega", concept: "The omega given a keel — held steady.", spec: "Stem descending from the opening.", draw: () => omegaArc(32, 30, 13, 55, "l-ink", 2.3, 4.5) + line(32, 43, 32, 52, "l-sage", 2.1) + line(26, 52, 38, 52, "l-sage", 2.1) },
      { vname: "Coin Omega", concept: "Struck like currency: omega on a coin.", spec: "Double coin ring with tiny omega.", draw: () => circ(32, 32, 18, "l-ink", 1.9) + circ(32, 32, 14.5, "l-faint", 1.1) + omegaArc(32, 33.5, 7.5, 60, "l-sage", 1.9, 2.5) },
      { vname: "Ribbon Omega", concept: "The last stroke let loose as a tail.", spec: "Omega with tail sweeping right.", draw: () => omegaArc(30, 32, 13, 55, "l-ink", 2.3, 4) + path("M43 40 C50 40 52 34 50 28", "l-sage", 2) },
      { vname: "Minimal Curve", concept: "Almost nothing: curve and two points.", spec: "Hairline arc with detached dot feet.", draw: () => { const g = (62 * Math.PI) / 180; return arc(32, 33, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 1.8) + line(pt(32, 33, 14, Math.PI / 2 + g)[0] + 1, pt(32, 33, 14, Math.PI / 2 + g)[1], pt(32, 33, 14, Math.PI / 2 + g)[0] + 5, pt(32, 33, 14, Math.PI / 2 + g)[1], "l-faint", 1.8) + line(pt(32, 33, 14, Math.PI / 2 - g)[0] - 5, pt(32, 33, 14, Math.PI / 2 - g)[1], pt(32, 33, 14, Math.PI / 2 - g)[0] - 1, pt(32, 33, 14, Math.PI / 2 - g)[1], "l-faint", 1.8); } },
    ],
  },
  {
    id: "negative-space",
    name: "Negative Space",
    seed: 1313,
    variants: [
      { vname: "Ring Cut Disc", concept: "The O remembered as light cut from a sage field.", spec: "Solid sage disc, wide paper ring punched out.", draw: () => dot(32, 32, 17, "l-fill-sage") + circ(32, 32, 9, "l-paper", 3.8) },
      { vname: "Slab Letter Cut", concept: "The A survives as paper light in a slab.", spec: "Ink rounded slab with A cut in paper.", draw: () => rectR(14, 14, 36, 36, 7, "l-fill-ink") + path("M24 40 L32 22 L40 40", "l-paper", 3) + line(27.4, 34.5, 36.6, 34.5, "l-paper", 2.6) },
      { vname: "Prompt Slot Tile", concept: "The prompt pressed through the icon.", spec: "Sage squircle, prompt cut in paper.", draw: () => tile() + gt(26, 30, 7, "l-paper", 3) + cursorBar(31.5, 37, 9, "l-paper", 3) },
      { vname: "Channel Disc", concept: "One clean channel crossing the mass.", spec: "Disc with a horizontal paper channel.", draw: () => dot(32, 32, 16, "l-fill-ink") + line(14, 32, 50, 32, "l-paper", 3.2) },
      { vname: "Keyhole Disc", concept: "A keyhole — access granted quietly.", spec: "Disc with paper circle and wedge cut.", draw: () => dot(32, 30, 15, "l-fill-ink") + dot(32, 26, 5, "l-fill-paper") + poly([[27, 28], [37, 28], [34, 42], [30, 42]], "l-fill-paper") },
      { vname: "Bitten Disc", concept: "A bite taken from a full form.", spec: "Offset paper disc cutting the edge.", draw: () => dot(30, 32, 16, "l-fill-ink") + `<circle cx="44" cy="26" r="10" fill="var(--bg-elev)" stroke="none"/>` },
      { vname: "Quarter Release", concept: "A corner of pressure released as a quarter arc.", spec: "Square slab with quarter-circle void.", draw: () => rectR(14, 14, 36, 36, 6, "l-fill-sage") + path("M50 32 A18 18 0 0 0 32 14 L50 14 Z", "l-fill-paper") },
      { vname: "Slot Gate", concept: "A gate of light through the bar.", spec: "Rect slab with thin horizontal slot.", draw: () => rectR(14, 20, 36, 24, 6, "l-fill-ink") + rectR(14, 29.5, 36, 5, 2.5, "l-fill-paper") },
      { vname: "Perforated Disc", concept: "A field of small lights through the dark.", spec: "Disc with a 3x3 paper dot matrix.", draw: () => dot(32, 32, 17, "l-fill-ink") + [24, 32, 40].map((y) => [24, 32, 40].map((x) => dot(x, y, 1.8, "l-fill-paper")).join("")).join("") },
      { vname: "Escape Parallelogram", concept: "Motion leaving the shape that held it.", spec: "Tilted slab with paper arrow cut.", draw: () => poly([[16, 46], [30, 18], [48, 18], [34, 46]], "l-fill-sage") + poly([[33, 24], [41, 31], [31, 39], [35, 31]], "l-fill-paper") },
      { vname: "Halves Apart", concept: "Two halves holding a breath between them.", spec: "Half-discs split by an even gap.", draw: () => path("M32 16 A16 16 0 0 0 32 48 Z", "l-fill-ink") + path("M38 16 A16 16 0 0 1 38 48 Z", "l-fill-sage") },
      { vname: "Notched Ring", concept: "The boundary interrupted at one place.", spec: "Heavy ring with a rectangular notch.", draw: () => circ(32, 32, 13, "l-ink", 7) + rectR(28, 12, 8, 10, 1, "l-fill-paper") },
      { vname: "Fold Reveal Square", concept: "A corner turned back shows what's under.", spec: "Sage slab with folded paper corner.", draw: () => rectR(14, 14, 36, 36, 6, "l-fill-sage") + poly([[50, 32], [50, 50], [32, 50]], "l-fill-paper") + line(50, 32, 32, 50, "l-dim", 1.4) },
      { vname: "Window Punch Tile", concept: "A window opened in the icon wall.", spec: "Ink tile with paper window punch.", draw: () => tile("l-fill-ink") + rectR(19, 21, 26, 22, 3, "l-fill-paper") + rectR(19, 21, 26, 5, 3, "l-fill-dim") },
      { vname: "Diamond Slit", concept: "Precision split through the gem.", spec: "Diamond slab with vertical paper slit.", draw: () => poly([[32, 12], [52, 32], [32, 52], [12, 32]], "l-fill-ink") + rectR(30.5, 12, 3, 40, 1.5, "l-fill-paper") },
      { vname: "Eclipse Edge", concept: "One body passing before another.", spec: "Paper disc cutting the ink disc's edge.", draw: () => dot(28, 32, 16, "l-fill-ink") + `<circle cx="42" cy="32" r="13" fill="var(--bg-elev)" stroke="none"/>` },
      { vname: "Comb Slots", concept: "Rhythm cut as even teeth of light.", spec: "Rect slab with three vertical slots.", draw: () => rectR(14, 16, 36, 32, 5, "l-fill-sage") + [23, 32, 41].map((x) => rectR(x - 1.75, 22, 3.5, 20, 1.75, "l-fill-paper")).join("") },
      { vname: "Spiral Groove", concept: "A path worn into the surface, circling home.", spec: "Disc with paper spiral groove inside.", draw: () => dot(32, 32, 17, "l-fill-ink") + path("M32 24 A8 8 0 1 1 24 32 A11 11 0 1 0 43 32", "l-paper", 2.6) },
      { vname: "Stair Ascent Cut", concept: "Steps rising through the block.", spec: "Slab with paper staircase cut rising.", draw: () => rectR(14, 16, 36, 32, 5, "l-fill-dim") + poly([[20, 42], [20, 36], [26, 36], [26, 30], [32, 30], [32, 24], [38, 24], [38, 42]], "l-fill-paper") },
      { vname: "Lightning Slab", concept: "Energy struck through still material.", spec: "Parallelogram slab with bolt cut.", draw: () => poly([[18, 48], [30, 16], [46, 16], [34, 48]], "l-fill-ink") + poly([[36, 22], [29, 33], [34, 33], [30, 42], [39, 30], [33.5, 30]], "l-fill-paper") },
    ],
  },
  {
    id: "layer-stacks",
    name: "Layer Stacks",
    seed: 1414,
    variants: [
      { vname: "Drift Trio", concept: "Three sessions drifting gently apart.", spec: "Offset rounded rects, back to front.", draw: () => rectR(8, 8, 36, 28, 5, "l-faint", 1.4) + rectR(14, 14, 36, 28, 5, "l-dim", 1.7) + rectR(20, 20, 36, 28, 5, "l-ink", 2.1) },
      { vname: "Iso Slabs", concept: "Slabs stacked isometrically — depth without perspective.", spec: "Three parallelograms in vertical rhythm.", draw: () => poly([[12, 40], [32, 30], [52, 40], [32, 50]], "l-faint", 1.4) + poly([[12, 32], [32, 22], [52, 32], [32, 42]], "l-sage", 1.7) + poly([[12, 24], [32, 14], [52, 24], [32, 34]], "l-ink", 1.9) },
      { vname: "Strata Disc", concept: "Sediment layers inside a circular frame.", spec: "Ring crossed by three chords.", draw: () => circ(32, 32, 17, "l-ink", 2) + line(19, 26, 45, 26, "l-dim", 1.5) + line(16, 33, 48, 33, "l-sage", 1.7) + line(21, 40, 43, 40, "l-dim", 1.5) },
      { vname: "Card Fan", concept: "Options fanned like held cards.", spec: "Three cards rotated around a low pivot.", draw: () => { const rot = (deg) => { const a = (deg * Math.PI) / 180; return (x, y) => { const dx = x - 32, dy = y - 48; return [32 + dx * Math.cos(a) - dy * Math.sin(a), 48 + dx * Math.sin(a) + dy * Math.cos(a)]; }; }; const card = (r, cls) => { const t = rot(r); const p = [[22, 16], [42, 16], [42, 44], [22, 44]].map(([x, y]) => t(x, y)); return poly(p, cls, 1.7); }; return card(-18, "l-faint") + card(0, "l-dim") + card(18, "l-ink"); } },
      { vname: "Lit Top Slab", concept: "Only the active layer is lit.", spec: "Stack of outlines, top filled sage.", draw: () => rectR(16, 38, 32, 10, 3, "l-faint", 1.4) + rectR(16, 27, 32, 10, 3, "l-faint", 1.4) + rectR(16, 16, 32, 10, 3, "l-fill-sage") },
      { vname: "Book Pile", concept: "Finished work stacked like read books.", spec: "Side-view spines of varying width.", draw: () => rectR(12, 40, 40, 8, 1.5, "l-ink") + rectR(16, 31, 32, 8, 1.5, "l-fill-sage") + rectR(20, 22, 22, 8, 1.5, "l-fill-dim") + line(46, 24, 46, 29, "l-paper", 1.4) },
      { vname: "Panel Depth", concept: "Panels receding into the screen's quiet dark? light.", spec: "Three vertical panels shrinking backward.", draw: () => rectR(10, 12, 12, 40, 3, "l-faint", 1.3) + rectR(25, 16, 13, 36, 3, "l-dim", 1.6) + rectR(41, 20, 13, 32, 3, "l-ink", 1.9) },
      { vname: "Terrace Steps", concept: "Progress as wide calm steps.", spec: "Centered bars widening downward.", draw: () => rectR(24, 16, 16, 8, 2, "l-ink") + rectR(18, 28, 28, 8, 2, "l-fill-sage") + rectR(12, 40, 40, 8, 2, "l-fill-dim") },
      { vname: "Levitating Sheet", concept: "One layer lifted, hovering on its shadow.", spec: "Floating bar above stack with gap shadow.", draw: () => rectR(18, 14, 28, 8, 2.5, "l-ink") + rectR(18, 32, 28, 8, 2.5, "l-fill-sage") + rectR(18, 44, 28, 8, 2.5, "l-fill-dim") },
      { vname: "Coin Roll", concept: "Discs stacked on edge — saved sessions.", spec: "Three ellipses in vertical offset.", draw: () => ell(32, 18, 15, 6, "l-ink", 1.9) + ell(32, 31, 15, 6, "l-sage", 1.9) + ell(32, 44, 15, 6, "l-ink", 1.9) },
      { vname: "Ascend Arrow", concept: "The stack beside the arrow that leaves it.", spec: "Small layer pair with upward arrow.", draw: () => rectR(10, 34, 22, 8, 2, "l-fill-dim") + rectR(10, 23, 22, 8, 2, "l-fill-sage") + line(45, 48, 45, 18, "l-ink", 2.2) + poly([[39.5, 24], [45, 15.5], [50.5, 24]], "l-fill-ink") },
      { vname: "Foundation Slabs", concept: "Wide at the base, precise at the top.", spec: "Pyramid of centered slabs.", draw: () => rectR(12, 40, 40, 9, 2, "l-fill-dim") + rectR(18, 28, 28, 9, 2, "l-fill-sage") + rectR(25, 16, 14, 9, 2, "l-fill-ink") },
      { vname: "Pinwheel Blades", concept: "Four blades layered by rotation.", spec: "Rotational parallelogram pinwheel.", draw: () => { let s = ""; for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; const t = (x, y) => { const dx = x - 32, dy = y - 32; return [32 + dx * Math.cos(a) - dy * Math.sin(a), 32 + dx * Math.sin(a) + dy * Math.cos(a)]; }; s += poly([[32, 32], [32, 12], [48, 18]].map(([x, y]) => t(x, y)), i % 2 ? "l-sage" : "l-ink", 1.6); } return s; } },
      { vname: "Sediment Waves", concept: "Time settling in wavy strata.", spec: "Disc with two wavy internal strata.", draw: () => circ(32, 32, 17, "l-ink", 1.9) + path("M17 28 Q24 24 32 28 T47 28", "l-sage", 1.7) + path("M18 37 Q25 33 32 37 T46 37", "l-dim", 1.5) },
      { vname: "Neat Deck", concept: "A deck squared and ready to deal.", spec: "Aligned stack with binding tick and edges.", draw: () => rectR(18, 14, 28, 36, 4, "l-ink", 2.1) + line(18, 20, 14, 20, "l-dim", 1.6) + line(18, 32, 14, 32, "l-dim", 1.6) + line(18, 44, 14, 44, "l-dim", 1.6) + line(42, 18, 42, 46, "l-faint", 1.3) },
      { vname: "Mid Selected", concept: "One layer called out from the pile.", spec: "Middle layer bold sage, others faint.", draw: () => rectR(16, 12, 32, 11, 3, "l-faint", 1.3) + rectR(16, 26.5, 32, 11, 3, "l-sage", 2.2) + rectR(16, 41, 32, 11, 3, "l-faint", 1.3) },
      { vname: "Ziggurat", concept: "The oldest stable shape for building up.", spec: "Three symmetric shrinking tiers.", draw: () => rectR(14, 40, 36, 9, 1.5, "l-fill-dim") + rectR(20, 28, 24, 9, 1.5, "l-fill-sage") + rectR(26, 16, 12, 9, 1.5, "l-fill-ink") },
      { vname: "Cast Shadow Pair", concept: "Every layer carries its soft double.", spec: "Layers with faint offset duplicates.", draw: () => rectR(20, 18, 28, 20, 4, "l-faint", 1.2) + rectR(16, 14, 28, 20, 4, "l-ink", 1.9) + rectR(24, 42, 28, 8, 2, "l-faint", 1.1) + rectR(20, 38, 28, 8, 2, "l-fill-sage") },
      { vname: "Pivot Fan Cards", concept: "History fanned from its first moment.", spec: "Four cards sweeping from a left pivot.", draw: () => { let s = ""; [-6, 8, 22, 36].forEach((deg, i) => { const a = (deg * Math.PI) / 180; const cxp = 16, cyp = 50; const pts = [[cxp, cyp - 30], [cxp + 20, cyp - 30], [cxp + 20, cyp], [cxp, cyp]].map(([x, y]) => { const dx = x - cxp, dy = y - cyp; return [cxp + dx * Math.cos(a) - dy * Math.sin(a), cyp + dx * Math.sin(a) + dy * Math.cos(a)]; }); s += poly(pts, i === 3 ? "l-ink" : i === 2 ? "l-sage" : "l-faint", i === 3 ? 1.8 : 1.2); }); return s; } },
      { vname: "Swap Between Layers", concept: "Two layers trading places mid-flight.", spec: "Curved swap arrows between slabs.", draw: () => rectR(16, 14, 32, 10, 3, "l-fill-dim") + rectR(16, 40, 32, 10, 3, "l-fill-sage") + path("M40 30 C46 30 46 24 42 22", "l-ink", 1.8) + poly([[44.5, 20], [39.5, 20.5], [42.5, 25]], "l-fill-ink") + path("M24 34 C18 34 18 40 22 42", "l-ink", 1.8) + poly([[19.5, 44], [24.5, 43.5], [21.5, 39]], "l-fill-ink") },
    ],
  },
  {
    id: "seal-badge",
    name: "Seals & Badges",
    seed: 1515,
    variants: [
      { vname: "Double Ring Seal", concept: "The simplest seal: two rings and a mark.", spec: "Nested rings around a center dot.", draw: () => circ(32, 32, 18, "l-ink", 2) + circ(32, 32, 13.5, "l-dim", 1.3) + dot(32, 32, 3.4, "l-fill-sage") },
      { vname: "Scalloped Seal", concept: "Edge scallops pressed around a still center.", spec: "Twelve bump arcs ringing an inner disc.", draw: () => { let s = ""; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const [x, y] = pt(32, 32, 16, a); s += arc(x, y, 3.2, a + Math.PI * 0.55, a - Math.PI * 0.55, i % 2 ? "l-dim" : "l-ink", 1.4); } return s + circ(32, 32, 10.5, "l-sage", 1.7); } },
      { vname: "Shield Chevron", concept: "Protection drawn as one falling chevron.", spec: "Shield outline with inner sage chevron.", draw: () => path("M16 14 H48 V34 Q48 48 32 54 Q16 48 16 34 Z", "l-ink", 2.1) + path("M22 30 L32 40 L42 30", "l-sage", 2.2) },
      { vname: "Reeded Coin", concept: "A coin's milled edge around a plain face.", spec: "Circle with radial reeding ticks.", draw: () => circ(32, 32, 17, "l-ink", 2) + Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * TAU; const [x1, y1] = pt(32, 32, 14.5, a); const [x2, y2] = pt(32, 32, 17, a); return line(x1, y1, x2, y2, "l-faint", 1.1); }).join("") + dot(32, 32, 3.2, "l-fill-sage") },
      { vname: "Petal Rosette", concept: "Award-rosette petals, softly drawn.", spec: "Eight petal circles about a core.", draw: () => { let s = dot(32, 32, 4, "l-fill-sage"); reg(32, 32, 11, 8).forEach(([x, y], i) => (s += circ(x, y, 4.6, i % 2 ? "l-dim" : "l-ink", 1.4))); return s; } },
      { vname: "Grid Stamp", concept: "An official stamp reduced to grid and mark.", spec: "Square stamp with inner grid lines.", draw: () => rectR(14, 14, 36, 36, 4, "l-ink", 2) + line(14, 32, 50, 32, "l-faint", 1.2) + line(32, 14, 32, 50, "l-faint", 1.2) + rectR(25, 25, 14, 14, 2, "l-sage", 1.8) },
      { vname: "Banner Emblem", concept: "A medal with its ribbon caught mid-hang.", spec: "Disc emblem above a notched banner.", draw: () => circ(32, 24, 9, "l-ink", 2) + dot(32, 24, 3, "l-fill-sage") + poly([[16, 38], [48, 38], [48, 50], [32, 44], [16, 50]], "l-sage", 1.9) },
      { vname: "Wax Blob", concept: "Hand-pressed wax, imperfect on purpose.", spec: "Irregular blob disc with emboss ring.", draw: () => path("M32 13 C42 12 51 20 50 31 C49 43 42 51 31 50 C20 49 12 42 14 30 C15.5 20 22 14 32 13 Z", "l-fill-ink") + circ(32, 32, 9.5, "l-paper", 1.6) + dot(32, 32, 2.6, "l-fill-sage") },
      { vname: "Branch Arcs Wreath", concept: "A wreath suggested by two dashed arcs.", spec: "Dashed laurel arcs flanking a dot.", draw: () => `<path class="l-dim" d="M 18.87 45.87 A 18 18 0 0 1 18.87 18.13" stroke-width="1.8" style="stroke-width:1.8;stroke-dasharray:3 4"/>` + `<path class="l-dim" d="M 45.13 18.13 A 18 18 0 0 1 45.13 45.87" stroke-width="1.8" style="stroke-width:1.8;stroke-dasharray:3 4"/>` + spark4(32, 32, 7.5, 2.8, "l-fill-sage") },
      { vname: "Rotated Passport Stamp", concept: "The entry stamp, always slightly crooked.", spec: "Rotated rounded stamp with rule lines.", draw: () => `<g transform="rotate(-8 32 32)">` + rectR(16, 22, 32, 20, 3, "l-ink", 2) + line(21, 29, 43, 29, "l-dim", 1.6) + line(21, 35, 37, 35, "l-faint", 1.5) + `</g>` },
      { vname: "Medal Ribbon", concept: "First place, worn quietly.", spec: "V ribbon under a hanging disc.", draw: () => poly([[22, 10], [32, 26], [42, 10]], "l-sage", 1.9) + circ(32, 36, 10, "l-ink", 2) + spark4(32, 36, 5, 1.8) },
      { vname: "Check Badge", concept: "Verified — the check as the whole story.", spec: "Circle badge with sage checkmark.", draw: () => circ(32, 32, 17, "l-ink", 2.1) + path("M22 33 L29 40 L43 24", "l-sage", 2.6) },
      { vname: "Notary Cross", concept: "Crosshair precision, certified round.", spec: "Circled crosshair with center dot.", draw: () => circ(32, 32, 16, "l-ink", 1.9) + line(32, 12, 32, 52, "l-dim", 1.4) + line(12, 32, 52, 32, "l-dim", 1.4) + dot(32, 32, 2.8, "l-fill-sage") },
      { vname: "Wing Emblem", concept: "Speed suggested by three feathers aside.", spec: "Core circle with stacked wing arcs.", draw: () => circ(24, 32, 8, "l-ink", 2) + dot(24, 32, 2.4, "l-fill-sage") + [[36, 26], [40, 32], [36, 38]].map(([x, y], i) => line(33, y, x + 8, y, i === 1 ? "l-sage" : "l-dim", 1.8)).join("") },
      { vname: "Dashed Ring Seal", concept: "Perforated edge like a sticker about to be used.", spec: "Dashed outer ring, solid inner ring.", draw: () => `<circle class="l-dim" cx="32" cy="32" r="18" stroke-width="1.8" style="stroke-width:1.8;stroke-dasharray:2.5 4"/>` + circ(32, 32, 12, "l-ink", 1.9) + dot(32, 32, 3, "l-fill-sage") },
      { vname: "Halved Crest", concept: "Two identities sharing one shield.", spec: "Shield split: sage field over outline.", draw: () => { let s = path("M16 14 H32 V54 Q16 48 16 34 Z", "l-fill-sage"); s += path("M16 14 H48 V34 Q48 48 32 54 V14", "l-ink", 2.1).replace('class="l-ink"', 'class="l-ink" fill="none"'); return s; } },
      { vname: "Ticket Stub", concept: "Admission granted — keep this part.", spec: "Notched ticket with perforation dashes.", draw: () => rectR(12, 22, 40, 20, 4, "l-ink", 2) + dot(12, 32, 3, "l-fill-paper").replace('class="l-fill-paper"', 'class="l-fill-bg" stroke="var(--bg-elev)" stroke-width="3"').replace('fill="var(--bg-elev)"', "") + `<line class="l-faint" x1="40" y1="24" x2="40" y2="40" stroke-width="1.4" style="stroke-width:1.4;stroke-dasharray:2.5 3"/>` + line(18, 32, 32, 32, "l-sage", 2) },
      { vname: "Starburst Coin Edge", concept: "Sixteen points pressing outward.", spec: "Fine-toothed star outline with core.", draw: () => poly(starPts(32, 32, 18, 15.5, 16), "l-ink", 1.5) + circ(32, 32, 9, "l-sage", 1.7) },
      { vname: "Engraved Rings", concept: "Micro-engraving between two close rings.", spec: "Tight ring pair with radial micro ticks.", draw: () => circ(32, 32, 17, "l-ink", 1.8) + circ(32, 32, 14, "l-ink", 1.1) + Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; const [x1, y1] = pt(32, 32, 14.5, a); const [x2, y2] = pt(32, 32, 16.5, a); return line(x1, y1, x2, y2, "l-faint", 1); }).join("") + dot(32, 32, 2.6, "l-fill-sage") },
      { vname: "Corner Plaque", concept: "Mounted like a plaque, screws and all.", spec: "Plaque plate with corner screws and rule.", draw: () => rectR(12, 18, 40, 28, 5, "l-ink", 2) + dot(17.5, 23.5, 1.6, "l-fill-dim") + dot(46.5, 23.5, 1.6, "l-fill-dim") + dot(17.5, 40.5, 1.6, "l-fill-dim") + dot(46.5, 40.5, 1.6, "l-fill-dim") + line(20, 32, 44, 32, "l-sage", 2) },
    ],
  },
];

let NEXT = 1;
const LOGOS = [];
const usedNames = new Set();
FAMILIES.forEach((fam) => {
  fam.variants.forEach((v) => {
    const idNum = NEXT++;
    let name = v.vname;
    let guard = 0;
    while (usedNames.has(name) && guard++ < 50) name = `${v.vname} ${guard}`;
    usedNames.add(name);
    const rng = mulberry32(fam.seed + idNum * 977);
    LOGOS.push({
      id: String(idNum).padStart(3, "0"),
      name,
      family: fam.name,
      familyId: fam.id,
      concept: typeof v.concept === "function" ? v.concept(rng) : v.concept,
      spec: typeof v.spec === "function" ? v.spec(rng) : v.spec,
      svg: wrap(v.draw(rng)),
    });
  });
});

const ids = new Set(LOGOS.map((l) => l.id));
if (ids.size !== 300) throw new Error(`Expected 300 logos, got ${ids.size}`);
if (LOGOS.length !== 300) throw new Error(`Family counts sum to ${LOGOS.length}`);
const svgSet = new Set(LOGOS.map((l) => l.svg));
if (svgSet.size !== 300) throw new Error(`Duplicate SVGs: ${300 - svgSet.size} collisions`);
LOGOS.forEach((l) => {
  if (!l.svg.includes("<svg")) throw new Error(`Bad svg in ${l.name}`);
});
const famCounts = FAMILIES.map((fam) => ({ id: fam.id, name: fam.name, count: fam.variants.length }));
famCounts.forEach((fc) => {
  if (fc.count !== 20) throw new Error(`Family ${fc.id} has ${fc.count} variants`);
});

const header = `// AUTO-GENERATED by generate-logos.mjs — do not edit by hand.
// 300 DISTINCT OmniAgent app-logo directions for the logo study.
// Fields: id, name, family, familyId, concept, spec, svg.
const LOGOS = ${JSON.stringify(LOGOS, null, 0)};
const FAMILIES = ${JSON.stringify(famCounts, null, 0)};
`;

const runtime = readFileSync(join(__dirname, "logos-runtime.js"), "utf8");
writeFileSync(
  join(__dirname, "logos.js"),
  header + "\n// ===== gallery runtime (appended) =====\n" + runtime,
  "utf8"
);
console.log(`Wrote logo data: ${LOGOS.length} entries across ${FAMILIES.length} families.`);
