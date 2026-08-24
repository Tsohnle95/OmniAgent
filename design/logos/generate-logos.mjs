// Procedural generator for the OmniAgent brand-logo study, iteration 2.
// Produces design/logos/logos.js: 300 DISTINCT brand-grade marks distilled
// from the shortlisted iteration-1 favorites (omegas, solid cut tiles,
// circuit hexes, node networks, code glyphs, signals, steps).
// Brand craft rules for this iteration: solid silhouettes first, contained
// compositions (tiles, discs, shields, badges), disciplined two-tone ink/sage,
// generous stroke weights, optical centering.

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
const raw = (s) => s;

const reg = (cx, cy, r, n, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => pt(cx, cy, r, rot + (i * TAU) / n));
const starPts = (cx, cy, ro, ri, n, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) =>
    pt(cx, cy, i % 2 ? ri : ro, rot + (i * Math.PI) / n)
  );

const wrap = (inner) =>
  `<svg class="logo-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

const tile = (cls = "l-fill-sage", inset = 6, rad = 14) =>
  rectR(inset, inset, 64 - inset * 2, 64 - inset * 2, rad, cls);

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

const gt = (x, y, s, cls = "l-ink", sw = 2.6) =>
  path(`M${f(x)} ${f(y - s)} L${f(x + s * 0.85)} ${f(y)} L${f(x)} ${f(y + s)}`, cls, sw);
const cursorBar = (x, y, len, cls = "l-sage", sw = 2.8) => line(x, y, x + len, y, cls, sw);

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

const paperFill = (d) => `<path class="l-fill-paper" d="${d}"/>`;
const bgCircle = (cx, cy, r) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="var(--bg-elev)" stroke="none"/>`;

function nodeAt(x, y, r = 3.2, cls = "l-fill-ink") {
  return dot(x, y, r, cls);
}
function link(x1, y1, x2, y2, w = 1.6, cls = "l-dim") {
  return line(x1, y1, x2, y2, cls, w);
}

const FAMILIES = [
  {
    id: "omega-core",
    name: "Omega Identity",
    seed: 2101,
    variants: [
      { vname: "Omega Disc Brand", concept: "The om struck into a solid coin.", spec: "Sage disc with paper omega cut clean through.", draw: () => dot(32, 32, 19, "l-fill-sage") + paperFill("M24.5 42 V38 Q18 36 18 28 Q18 19 32 19 Q46 19 46 28 Q46 36 39.5 38 V42 H35 V37 H29 V42 Z") },
      { vname: "Omega Slab", concept: "The wordmark letter carved from a dark tile.", spec: "Ink rounded slab, paper omega counter.", draw: () => rectR(10, 12, 44, 40, 11, "l-fill-ink") + paperFill("M25 43 V39.5 Q20 37.5 20 31 Q20 23 32 23 Q44 23 44 31 Q44 37.5 39 39.5 V43 H35.5 V38 H28.5 V43 Z") },
      { vname: "Heavy Omega Solo", concept: "One heavy stroke says everything.", spec: "Thick-stroke omega, no container.", draw: () => omegaArc(32, 34, 16, 55, "l-ink", 6.5, 7) },
      { vname: "Ringed Omega Bold", concept: "The letter held by its own boundary.", spec: "Bold ring, sage omega centered inside.", draw: () => circ(32, 32, 19, "l-ink", 2.8) + omegaArc(32, 33.5, 11, 58, "l-sage", 2.9, 4) },
      { vname: "Omega On Bar", concept: "Set down firmly on a plinth.", spec: "Heavy omega over a full baseline slab.", draw: () => omegaArc(32, 33, 15, 55, "l-ink", 5, 6) + rectR(14, 47, 36, 5, 2.5, "l-fill-sage") },
      { vname: "Omega Coin Face", concept: "Minted: rim, field, and letter.", spec: "Ink rim, sage field, paper omega.", draw: () => circ(32, 32, 19, "l-ink", 3) + dot(32, 32, 15, "l-fill-sage") + omegaArc(32, 33, 8.5, 60, "l-paper", 2.6, 3) },
      { vname: "Slit Omega Mark", concept: "Opened at the crown to admit light.", spec: "Heavy omega with a vertical paper slit.", draw: () => omegaArc(32, 34, 15, 50, "l-ink", 5.5, 6) + line(32, 13.5, 32, 22, "l-paper", 3.4) },
      { vname: "Omega Node Feet", concept: "The network living in the letter's feet.", spec: "Omega whose feet terminate in filled nodes.", draw: () => { const g = (52 * Math.PI) / 180; const [x0, y0] = pt(32, 33, 14, Math.PI / 2 + g); const [x1, y1] = pt(32, 33, 14, Math.PI / 2 - g); return arc(32, 33, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3.4) + line(x0, y0, x0 + 5, y0, "l-ink", 3.4) + line(x1, y1, x1 - 5, y1, "l-ink", 3.4) + dot(x0 + 7, y0, 3, "l-fill-sage") + dot(x1 - 7, y1, 3, "l-fill-sage"); } },
      { vname: "Orbiting Omega", concept: "A satellite attending the letter.", spec: "Omega crown carrying one orbit dot.", draw: () => omegaArc(32, 35, 14, 55, "l-ink", 3.6, 5) + ell(32, 21, 10, 3.4, "l-sage", 2) + dot(pt(32, 21, 10, 0)[0], pt(32, 21, 10, 0)[1], 2.8, "l-fill-sage") },
      { vname: "Omega Pill", concept: "The letter sealed in the softest container.", spec: "Stadium outline holding a compact omega.", draw: () => rectR(9, 20, 46, 24, 12, "l-ink", 2.8) + omegaArc(32, 33, 8.5, 58, "l-sage", 2.7, 3) },
      { vname: "Stacked Twin Omega", concept: "Above and below — the paired brand.", spec: "Two compact omegas stacked, sage over ink.", draw: () => omegaArc(32, 22.5, 8, 58, "l-sage", 2.7, 3) + omegaArc(32, 45, 8, 58, "l-ink", 2.7, 3) },
      { vname: "Filled Counter Omega", concept: "The opening held open by a point of light.", spec: "Heavy omega with a large counter dot.", draw: () => omegaArc(32, 34, 15, 55, "l-ink", 5.5, 6) + dot(32, 27.5, 3.4, "l-fill-sage") },
      { vname: "Nested Omegas", concept: "Scale as identity: the letter within the letter.", spec: "Large outline omega, small solid-stroke omega nested.", draw: () => omegaArc(32, 37, 17, 55, "l-ink", 2.8, 5) + omegaArc(32, 29, 7, 60, "l-sage", 3.6, 2.5) },
      { vname: "Omega Crest Pedestal", concept: "An award for finished work.", spec: "Omega on a stepped pedestal with side ticks.", draw: () => omegaArc(32, 28, 11, 56, "l-ink", 3.2, 4) + rectR(22, 44, 20, 4, 1.5, "l-fill-sage") + rectR(16, 49, 32, 4, 1.5, "l-fill-ink") },
      { vname: "Omega Over Wave", concept: "The constant above the changing tide.", spec: "Omega riding a single sine rule.", draw: () => omegaArc(32, 30, 13, 55, "l-ink", 3.4, 5) + path("M12 48 Q19 42 26 48 T40 48 T54 48", "l-sage", 2.6) },
      { vname: "Struck Omega", concept: "Crossed out and still true.", spec: "Heavy omega under a diagonal strike.", draw: () => omegaArc(32, 34, 14, 55, "l-ink", 4.6, 5) + line(16, 46, 48, 20, "l-sage", 3) },
      { vname: "Haloed Omega", concept: "Crowned by its own quiet halo.", spec: "Omega with an overhead arc halo.", draw: () => omegaArc(32, 37, 13, 55, "l-ink", 3.4, 5) + arc(32, 37, 19, -Math.PI * 0.78, -Math.PI * 0.22, "l-sage", 2.8) },
      { vname: "Omega Monolith", concept: "The letter as standing stone.", spec: "Vertical slab with carved omega window.", draw: () => rectR(22, 10, 20, 44, 9, "l-fill-ink") + omegaArc(32, 32, 7, 58, "l-paper", 2.4, 2.5) },
      { vname: "Broadcasting Omega", concept: "The word, sent outward.", spec: "Omega emitting three rising arcs.", draw: () => omegaArc(32, 42, 12, 55, "l-ink", 3.4, 4.5) + arc(32, 40, 15, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 2.6) + arc(32, 40, 21, -Math.PI * 0.66, -Math.PI * 0.34, "l-dim", 2.2) },
      { vname: "Anchored Omega", concept: "Held to one point below.", spec: "Omega with a center drop and foot node.", draw: () => omegaArc(32, 31, 13, 55, "l-ink", 3.4, 5) + line(32, 44, 32, 51, "l-sage", 2.8) + dot(32, 53.5, 2.8, "l-fill-sage") },
    ],
  },
  {
    id: "omega-fusion",
    name: "Omega Fusion",
    seed: 2102,
    variants: [
      { vname: "Omega Mesh Core", concept: "The letter is the network.", spec: "Omega outline with three linked inner nodes.", draw: () => omegaArc(32, 33, 15, 55, "l-ink", 2.8, 4.5) + link(26, 30, 38, 30) + link(26, 30, 32, 38) + link(38, 30, 32, 38) + nodeAt(26, 30, 2.6, "l-fill-sage") + nodeAt(38, 30, 2.6, "l-fill-sage") + nodeAt(32, 38, 2.6, "l-fill-ink") },
      { vname: "Omega Traces", concept: "The letter wired like a die.", spec: "Omega legs extending into traces with pads.", draw: () => { const g = (52 * Math.PI) / 180; const [x0, y0] = pt(32, 33, 14, Math.PI / 2 + g); const [x1, y1] = pt(32, 33, 14, Math.PI / 2 - g); return arc(32, 33, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3) + path(`M${f(x0)} ${f(y0)} H${f(x0 - 6)} V50`, "l-dim", 2) + path(`M${f(x1)} ${f(y1)} H${f(x1 + 6)} V50`, "l-dim", 2) + dot(x0 - 6, 51, 2.4, "l-fill-sage") + dot(x1 + 6, 51, 2.4, "l-fill-sage"); } },
      { vname: "Twin Satellite Omega", concept: "Two agents in stable attendance.", spec: "Ringed omega with satellites on the ring.", draw: () => circ(32, 32, 17, "l-faint", 1.6) + omegaArc(32, 33, 9.5, 58, "l-ink", 3, 3.5) + dot(pt(32, 32, 17, -0.5)[0], pt(32, 32, 17, -0.5)[1], 3, "l-fill-sage") + dot(pt(32, 32, 17, Math.PI + 0.6)[0], pt(32, 32, 17, Math.PI + 0.6)[1], 3, "l-fill-ink") },
      { vname: "Terminal Omega", concept: "The prompt tail growing from the word.", spec: "Omega whose right foot extends as cursor.", draw: () => omegaArc(29, 33, 14, 55, "l-ink", 3.2, 4) + line(43, 41, 54, 41, "l-sage", 3.2) },
      { vname: "Bracketed Omega", concept: "Marked up: the letter between tags.", spec: "< Ω > with tight bold brackets.", draw: () => path("M20 20 L10 32 L20 44", "l-ink", 3) + path("M44 20 L54 32 L44 44", "l-ink", 3) + omegaArc(32, 33.5, 8.5, 58, "l-sage", 2.8, 3) },
      { vname: "Omega Totem", concept: "Three scales of the same idea.", spec: "Pyramid of shrinking omegas.", draw: () => omegaArc(32, 16.5, 5, 58, "l-faint", 2, 2) + omegaArc(32, 32, 8, 58, "l-sage", 2.5, 3) + omegaArc(32, 50, 11, 58, "l-ink", 3, 4) },
      { vname: "Converge Omega", concept: "Two histories flowing into one letter.", spec: "Merge rails feeding the omega opening.", draw: () => path("M12 18 C24 18 24 30 32 30", "l-sage", 2.6) + path("M12 46 C24 46 24 34 32 34", "l-sage", 2.6) + arc(32, 32, 13, Math.PI * 0.62, TAU + Math.PI * 0.38, "l-ink", 3) + line(pt(32, 32, 13, Math.PI * 0.38 + TAU)[0], pt(32, 32, 13, Math.PI * 0.38 + TAU)[1], pt(32, 32, 13, Math.PI * 0.38 + TAU)[0] - 4, pt(32, 32, 13, Math.PI * 0.38 + TAU)[1], "l-ink", 3) },
      { vname: "Hive Omega", concept: "The letter housed in the strongest cell.", spec: "Hexagon badge containing solid omega.", draw: () => poly(reg(32, 32, 19, 6), "l-ink", 2.8) + omegaArc(32, 33, 10, 58, "l-sage", 2.9, 3.5) },
      { vname: "Omega Vital", concept: "A heartbeat running through the word.", spec: "Pulse spike crossing the omega baseline.", draw: () => omegaArc(32, 32, 13, 55, "l-ink", 3.2, 4.5) + path("M14 44 H24 L28 36 L33 50 L37 44 H50", "l-sage", 2.4) },
      { vname: "Ascent Omega", concept: "The letter climbing its own stairs.", spec: "Stair blocks rising to an omega summit.", draw: () => rectR(12, 44, 12, 8, 1.5, "l-fill-dim") + rectR(24, 36, 12, 16, 1.5, "l-fill-sage") + rectR(36, 28, 12, 24, 1.5, "l-fill-ink") + omegaArc(42, 20, 6.5, 58, "l-ink", 2.4, 2.5) },
      { vname: "Eclipse Omega", concept: "Something vast passing before the word.", spec: "Disc edge cutting the omega's side.", draw: () => omegaArc(28, 33, 15, 55, "l-ink", 3.4, 5) + `<circle cx="46" cy="33" r="11" fill="var(--bg-elev)" stroke="none"/>` + arc(46, 33, 11, Math.PI * 0.62, Math.PI * 1.38, "l-sage", 2.6) },
      { vname: "Spark Counter Omega", concept: "Intelligence seated in the opening.", spec: "Spark replacing the omega's counter dot.", draw: () => omegaArc(32, 34, 14, 55, "l-ink", 3.4, 5) + spark4(32, 27, 5, 1.8) },
      { vname: "Omega Aegis", concept: "Protection drawn around the word.", spec: "Shield outline holding the omega.", draw: () => path("M14 12 H50 V34 Q50 48 32 55 Q14 48 14 34 Z", "l-ink", 2.8) + omegaArc(32, 33, 10.5, 58, "l-sage", 2.9, 3.5) },
      { vname: "Announcing Omega", concept: "Waves leaving the crowned letter.", spec: "Air-wave arcs fanning from the crown.", draw: () => omegaArc(32, 40, 12, 55, "l-ink", 3.2, 4.5) + arc(32, 24, 7, -Math.PI * 0.75, -Math.PI * 0.25, "l-dim", 2) + arc(32, 24, 13, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 2.4) + arc(32, 24, 19, -Math.PI * 0.68, -Math.PI * 0.32, "l-faint", 2) },
      { vname: "Knotted Omega", concept: "The feet tied together — commitment.", spec: "Omega legs crossing beneath in an X.", draw: () => { const g = (55 * Math.PI) / 180; const [x0, y0] = pt(32, 31, 14, Math.PI / 2 + g); const [x1, y1] = pt(32, 31, 14, Math.PI / 2 - g); return arc(32, 31, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3.2) + line(x0, y0, x1 + 2, y1 + 6, "l-ink", 3.2) + line(x1, y1, x0 - 2, y0 + 6, "l-ink", 3.2); } },
      { vname: "Die Omega", concept: "Packaged silicon wearing its letter.", spec: "Chip die outline with pins and omega core.", draw: () => rectR(17, 17, 30, 30, 5, "l-ink", 2.8) + [[24, 12], [32, 12], [40, 12], [24, 52], [32, 52], [40, 52]].map(([x, y]) => line(x, y === 12 ? 12 : 52, x, y === 12 ? 17 : 47, "l-dim", 2)).join("") + omegaArc(32, 32, 8, 58, "l-sage", 2.7, 3) },
      { vname: "Climb Omega", concept: "Progression rails beside the word.", spec: "Ladder rail with rungs beside omega.", draw: () => omegaArc(25, 33, 13, 55, "l-ink", 3.2, 4.5) + line(49, 14, 49, 50, "l-sage", 2.6) + [20, 28, 36, 44].map((y) => line(43, y, 55, y, "l-dim", 2)).join("") },
      { vname: "Gateway Omega", concept: "The letter framed as a gate.", spec: "Two pillars and lintel around omega.", draw: () => rectR(12, 14, 7, 40, 3, "l-fill-ink") + rectR(45, 14, 7, 40, 3, "l-fill-ink") + rectR(12, 14, 40, 6, 3, "l-fill-ink") + omegaArc(32, 36, 10, 58, "l-sage", 2.8, 3.5) },
      { vname: "Comet Omega", concept: "Arrival written as a trail.", spec: "Omega with a comet sweep off the crown.", draw: () => omegaArc(36, 36, 12, 55, "l-ink", 3.2, 4.5) + path("M30 22 Q20 16 10 16", "l-sage", 2.6) + dot(9, 16, 3, "l-fill-sage") },
      { vname: "Field Omega", concept: "Positioned within a field of peers.", spec: "Solid omega over a subtle dot lattice.", draw: () => [[16, 16], [32, 16], [48, 16], [16, 48], [48, 48]].map(([x, y]) => dot(x, y, 1.8, "l-faint")).join("") + omegaArc(32, 34, 14, 55, "l-ink", 4, 5) },
    ],
  },
  {
    id: "solid-tiles",
    name: "Solid Tiles",
    seed: 2103,
    variants: [
      { vname: "Prompt Tile II", concept: "Your pick, grown up: bigger cut, calmer tile.", spec: "Ink squircle with a large paper prompt.", draw: () => tile("l-fill-ink") + gt(25, 30, 8.5, "l-paper", 3.6) + cursorBar(32.5, 38.5, 11, "l-paper", 3.6) },
      { vname: "Ring Tile II", concept: "The punched ring promoted to a whole icon.", spec: "Sage squircle, wide paper ring.", draw: () => tile() + circ(32, 32, 12, "l-paper", 5) },
      { vname: "Stair Tile II", concept: "Progress cut into the surface.", spec: "Ink squircle, ascending paper stairs.", draw: () => tile("l-fill-ink") + paperFill("M16 46 H24 V38 H32 V30 H40 V22 H48 V46 Z") },
      { vname: "Terrace Tile II", concept: "Terraced light on the icon field.", spec: "Sage squircle, three paper terrace bars.", draw: () => tile() + rectR(17, 20, 30, 7, 3.5, "l-fill-paper") + rectR(17, 31, 22, 7, 3.5, "l-fill-paper") + rectR(17, 42, 30, 7, 3.5, "l-fill-paper") },
      { vname: "Chevron Tile", concept: "Direction, pressed into the tile.", spec: "Ink squircle with double paper chevron up.", draw: () => tile("l-fill-ink") + path("M20 34 L32 22 L44 34", "l-paper", 4) + path("M20 46 L32 34 L44 46", "l-paper", 4) },
      { vname: "Slot Dot Tile", concept: "A slit of light and a companion point.", spec: "Sage squircle, vertical slot plus offset dot.", draw: () => tile() + rectR(29, 16, 6, 22, 3, "l-fill-paper") + dot(32, 46, 4, "l-fill-paper") },
      { vname: "Aperture Tile II", concept: "Open exactly two sides.", spec: "Ink squircle, offset paper wedges.", draw: () => tile("l-fill-ink") + path("M32 32 L32 12 A20 20 0 0 1 52 32 Z", "l-fill-paper") + path("M32 32 L32 52 A20 20 0 0 1 12 32 Z", "l-fill-paper") },
      { vname: "Keyhole Tile", concept: "Access as the whole identity.", spec: "Sage squircle with paper keyhole.", draw: () => tile() + dot(32, 27, 6.5, "l-fill-paper") + poly([[26.5, 30], [37.5, 30], [35, 46], [29, 46]], "l-fill-paper") },
      { vname: "Bolt Tile", concept: "Energy held in a calm frame.", spec: "Ink squircle, paper bolt cutout.", draw: () => tile("l-fill-ink") + paperFill("M36 14 L22 34 H31 L27 50 L42 28 H33 L38 14 Z") },
      { vname: "Wave Channel Tile", concept: "Flow given a channel through the tile.", spec: "Sage squircle, horizontal wave channel.", draw: () => tile() + path("M12 32 Q20 24 28 32 T44 32 T60 32", "l-paper", 6) },
      { vname: "Diamond Hole Tile", concept: "A gem turned through the slab.", spec: "Ink squircle, rotated square void.", draw: () => tile("l-fill-ink") + poly([[32, 18], [46, 32], [32, 46], [18, 32]], "l-fill-paper") },
      { vname: "Plus Void Tile", concept: "First aid for code: add, boldly.", spec: "Sage squircle with thick plus void.", draw: () => tile() + rectR(27, 16, 10, 32, 4, "l-fill-paper") + rectR(16, 27, 32, 10, 4, "l-fill-paper") },
      { vname: "Moon Bite Tile", concept: "Night phases on the icon.", spec: "Ink squircle, crescent paper bite.", draw: () => tile("l-fill-ink") + bgCircle(40, 26, 12) },
      { vname: "Exit Arrow Tile", concept: "Shipping is an exit executed well.", spec: "Sage squircle, arrow escaping the corner.", draw: () => tile() + paperFill("M18 34 H34 V24 L48 36 L34 48 V38 H18 Z") },
      { vname: "Comb Tile", concept: "Even teeth of light, evenly spaced.", spec: "Ink squircle, four horizontal slots.", draw: () => tile("l-fill-ink") + [20, 28, 36, 44].map((y) => rectR(16, y, 32, 4, 2, "l-fill-paper")).join("") },
      { vname: "Groove Tile", concept: "A path worn circling home.", spec: "Sage squircle, spiral groove.", draw: () => tile() + path("M32 20 A12 12 0 1 1 20 32 A15 15 0 1 0 47 32", "l-paper", 5) },
      { vname: "Matrix Tile", concept: "Order you can count.", spec: "Ink squircle, 3x3 paper dot matrix.", draw: () => tile("l-fill-ink") + [23, 32, 41].map((y) => [23, 32, 41].map((x) => dot(x, y, 2.6, "l-fill-paper")).join("")).join("") },
      { vname: "Horizon Tile", concept: "Half world, half light.", spec: "Sage squircle with lower half removed.", draw: () => tile() + rectR(6, 32, 52, 26, 0, "l-fill-paper") + circ(32, 32, 10, "l-fill-ink") },
      { vname: "Corner Notch Tile", concept: "Signed with one deliberate notch.", spec: "Ink squircle, corner notch, sage dot.", draw: () => tile("l-fill-ink") + poly([[58, 6], [58, 28], [36, 6]], "l-fill-paper") + dot(32, 36, 5.5, "l-fill-sage") },
      { vname: "Arch Tile", concept: "A doorway opened from the base.", spec: "Sage squircle, arch void rising from bottom.", draw: () => tile() + paperFill("M22 58 V40 A10 10 0 0 1 42 40 V58 Z") },
    ],
  },
  {
    id: "disc-emblems",
    name: "Disc Emblems",
    seed: 2104,
    variants: [
      { vname: "Ring Disc II", concept: "Your favorite, tightened for icon scale.", spec: "Sage disc, bold paper ring.", draw: () => dot(32, 32, 19, "l-fill-sage") + circ(32, 32, 10.5, "l-paper", 5) },
      { vname: "Horizon Channel", concept: "One clean cut across the mass.", spec: "Ink disc with a full paper channel.", draw: () => dot(32, 32, 19, "l-fill-ink") + line(11, 32, 53, 32, "l-paper", 5) },
      { vname: "Keyhole Disc II", concept: "The door and its lock as one mark.", spec: "Ink disc, paper keyhole.", draw: () => dot(32, 30, 17, "l-fill-ink") + dot(32, 26, 6, "l-fill-paper") + poly([[27, 29], [37, 29], [34.5, 44], [29.5, 44]], "l-fill-paper") },
      { vname: "Tide Bite Disc", concept: "Something taken; the shape holds.", spec: "Sage disc with an offset paper bite.", draw: () => dot(29, 32, 18, "l-fill-sage") + bgCircle(45, 25, 12) },
      { vname: "Vertical Slot Disc", concept: "A single decisive slit.", spec: "Ink disc, one vertical slot.", draw: () => dot(32, 32, 19, "l-fill-ink") + rectR(28.5, 13, 7, 24, 3.5, "l-fill-paper") },
      { vname: "Quad Dot Disc", concept: "Four points of light in balance.", spec: "Sage disc, diamond of four paper dots.", draw: () => dot(32, 32, 19, "l-fill-sage") + [[32, 21], [43, 32], [32, 43], [21, 32]].map(([x, y]) => dot(x, y, 3, "l-fill-paper")).join("") },
      { vname: "Cleaved Disc", concept: "Two halves holding one gap of air.", spec: "Ink half-discs parted by an even gap.", draw: () => path("M30 14 A18 18 0 0 0 30 50 Z", "l-fill-ink") + path("M36 14 A18 18 0 0 1 36 50 Z", "l-fill-ink") },
      { vname: "Gate Ring", concept: "The boundary with one opening kept.", spec: "Heavy ring with a rectangular notch.", draw: () => circ(32, 32, 15, "l-ink", 8) + rectR(27, 10, 10, 12, 2, "l-fill-paper") },
      { vname: "Crescent Slice Disc", concept: "Moonlight pared from the edge inward.", spec: "Ink disc with crescent slice removed.", draw: () => dot(30, 32, 18, "l-fill-ink") + bgCircle(38, 32, 13) },
      { vname: "Barred Disc", concept: "Counting in twos.", spec: "Ink disc with twin parallel channels.", draw: () => dot(32, 32, 19, "l-fill-ink") + line(12, 26, 52, 26, "l-paper", 4) + line(12, 38, 52, 38, "l-paper", 4) },
      { vname: "Wedge Open Disc", concept: "Opened to the right like a rising gate.", spec: "Sage disc with a wedge to the rim.", draw: () => path("M32 13 A19 19 0 1 0 51 32 L32 32 Z", "l-fill-sage") },
      { vname: "Orbit Band Disc", concept: "The ring worn across the body.", spec: "Ink disc crossed by a paper orbit band.", draw: () => dot(32, 32, 18, "l-fill-ink") + ell(32, 32, 22, 7, "l-paper", 4.5) + dot(32 + 22 * Math.cos(-0.4), 32 + 7 * Math.sin(-0.4), 3.4, "l-fill-paper") },
      { vname: "Summit Cut Disc", concept: "The peak remembered inside the round.", spec: "Ink disc, triangle peak cut.", draw: () => dot(32, 34, 18, "l-fill-ink") + poly([[32, 20], [43, 40], [21, 40]], "l-fill-paper") },
      { vname: "Arch Void Disc", concept: "An entrance opened upward.", spec: "Sage disc with arch void at base.", draw: () => dot(32, 30, 18, "l-fill-sage") + paperFill("M23 48 V36 A9 9 0 0 1 41 36 V48 Z") },
      { vname: "Ascent Steps Disc", concept: "Steps carried inside the round.", spec: "Ink disc with ascending step cuts.", draw: () => dot(32, 32, 19, "l-fill-ink") + paperFill("M20 44 H26 V38 H33 V31 H40 V44 Z") },
      { vname: "Vital Disc", concept: "The pulse that proves it lives.", spec: "Sage disc with paper pulse channel.", draw: () => dot(32, 32, 19, "l-fill-sage") + path("M14 34 H24 L28 26 L33 42 L37 34 H50", "l-paper", 3.6) },
      { vname: "Bolt Round", concept: "Charge contained in a coin.", spec: "Ink disc, paper bolt.", draw: () => dot(32, 32, 19, "l-fill-ink") + paperFill("M36 16 L23 34 H31 L28 48 L41 29 H33 L37 16 Z") },
      { vname: "Eyelet Disc", concept: "Hung from a single point of light.", spec: "Sage disc, small high eyelet hole.", draw: () => dot(32, 34, 18, "l-fill-sage") + dot(32, 22, 4, "l-fill-paper") },
      { vname: "Double Slice Disc", concept: "Cut twice on the diagonal — sharded calm.", spec: "Ink disc with two diagonal slices.", draw: () => dot(32, 32, 19, "l-fill-ink") + line(16, 40, 44, 16, "l-paper", 4) + line(26, 50, 50, 30, "l-paper", 4) },
      { vname: "Target Core Disc", concept: "Concentric resolve.", spec: "Sage disc, paper ring, ink core visible in hole.", draw: () => dot(32, 32, 19, "l-fill-sage") + circ(32, 32, 10, "l-paper", 4.5) + dot(32, 32, 4, "l-fill-ink") },
    ],
  },
  {
    id: "agent-networks",
    name: "Agent Networks",
    seed: 2105,
    variants: [
      { vname: "Merge Knot II", concept: "Your pick, heavier: histories becoming one.", spec: "Bold converging rails into a filled junction.", draw: () => path("M10 18 C26 18 26 32 40 32", "l-ink", 3) + path("M10 46 C26 46 26 32 40 32", "l-sage", 3) + line(40, 32, 54, 32, "l-ink", 3) + dot(40, 32, 4.5, "l-fill-ink") },
      { vname: "Mesh Four II", concept: "Everyone wired to everyone.", spec: "Bold quad mesh, solid nodes.", draw: () => { const P = [[17, 17], [47, 17], [47, 47], [17, 47]]; let s = ""; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) s += link(P[i][0], P[i][1], P[j][0], P[j][1], 1.7); P.forEach(([x, y], i) => (s += nodeAt(x, y, i === 0 ? 4 : 3.2, i === 0 ? "l-fill-sage" : "l-fill-ink"))); return s; } },
      { vname: "Node Pyramid II", concept: "Hierarchy you can read at 16 pixels.", spec: "Three tiers, filled dots, hairline links.", draw: () => { const rows = [[[32, 13]], [[18, 32], [46, 32]], [[10, 51], [32, 51], [54, 51]]]; let s = ""; rows[0].forEach(([x, y]) => { s += nodeAt(x, y, 4, "l-fill-sage"); rows[1].forEach(([x2, y2]) => (s += link(x, y, x2, y2))); }); rows[1].forEach(([x, y]) => { s += nodeAt(x, y, 3.2); rows[2].forEach(([x2, y2]) => (s += link(x, y, x2, y2, 1.3))); }); rows[2].forEach(([x, y]) => (s += nodeAt(x, y, 3.2))); return s; } },
      { vname: "Node Triad II", concept: "The smallest possible team.", spec: "Bold triangle nodes on thin ties.", draw: () => { const P = reg(32, 35, 15, 3); let s = ""; P.forEach(([x, y], i) => (s += link(x, y, P[(i + 1) % 3][0], P[(i + 1) % 3][1], 1.7))); P.forEach(([x, y], i) => (s += nodeAt(x, y, i === 0 ? 4.4 : 3.4, i === 0 ? "l-fill-sage" : "l-fill-ink"))); return s; } },
      { vname: "Spine Network", concept: "A backbone with hands on both sides.", spec: "Central rail with alternating branch nodes.", draw: () => line(32, 10, 32, 54, "l-ink", 2.8) + [[24, 18], [40, 28], [24, 38], [40, 48]].map(([x, y]) => link(32, y - (y < 33 ? 4 : -4), x, y) + nodeAt(x, y)).join("") },
      { vname: "Diamond Constellation", concept: "Four stars, one shape.", spec: "Diamond constellation with center emphasis.", draw: () => { const P = [[32, 12], [52, 32], [32, 52], [12, 32]]; let s = ""; P.forEach(([x, y], i) => (s += link(x, y, P[(i + 1) % 4][0], P[(i + 1) % 4][1]))); P.forEach(([x, y]) => (s += nodeAt(x, y, 3))); s = s + nodeAt(32, 32, 3.6, "l-fill-sage"); return s; } },
      { vname: "Relay Sizes", concept: "Signal passing and growing.", spec: "Three linked dots growing along the chain.", draw: () => link(14, 40, 50, 22, 1.8) + nodeAt(14, 40, 3) + nodeAt(32, 31, 3.6) + nodeAt(50, 22, 4.4, "l-fill-sage") },
      { vname: "Six Around One", concept: "The council and its chair.", spec: "Center hub plus five around, all linked.", draw: () => { let s = nodeAt(32, 32, 4.4, "l-fill-sage"); reg(32, 32, 16, 5).forEach(([x, y]) => (s += link(32, 32, x, y) + nodeAt(x, y, 3))); return s; } },
      { vname: "Twin Hubs Bridge", concept: "Two teams, two strong lines between.", spec: "Hub pair joined by double bridges.", draw: () => nodeAt(18, 32, 4.4, "l-fill-sage") + nodeAt(46, 32, 4.4, "l-fill-ink") + link(18, 28, 46, 28, 1.8) + link(18, 36, 46, 36, 1.8) },
      { vname: "Chain Triangle", concept: "Links forged into a cycle.", spec: "Triangle drawn as three chunky chain links.", draw: () => { const P = reg(32, 34, 14, 3); let s = ""; P.forEach(([x, y], i) => { const [nx, ny] = P[(i + 1) % 3]; const mx = (x + nx) / 2, my = (y + ny) / 2; s += circ(mx, my, 4.6, "l-ink", 2.4); }); return s; } },
      { vname: "Radial Trio Bold", concept: "One decision, three outcomes.", spec: "Hub fanning three thick spokes, fat tips.", draw: () => nodeAt(32, 32, 4.6, "l-fill-sage") + [-90, 150, 30].map((deg) => { const a = (deg * Math.PI) / 180; const [x, y] = pt(32, 32, 17, a); return line(32, 32, x, y, "l-ink", 2.4) + nodeAt(x, y, 3.6); }).join("") },
      { vname: "Corner Web", concept: "Structure spun from the corner.", spec: "Quarter arcs anchored by two nodes.", draw: () => arc(12, 52, 14, -Math.PI / 2, 0, "l-dim", 1.7) + arc(12, 52, 26, -Math.PI / 2, 0, "l-dim", 1.7) + arc(12, 52, 38, -Math.PI / 2, 0, "l-dim", 1.7) + nodeAt(12, 52, 3.4, "l-fill-sage") + nodeAt(12 + 38 * Math.cos(-Math.PI / 2), 52 + 38 * Math.sin(-Math.PI / 2), 3) + nodeAt(50, 52, 3) },
      { vname: "Interlocked Rings Pair", concept: "Two circles agreeing to overlap.", spec: "Interlocked bold rings, node at crossing.", draw: () => circ(25, 32, 11, "l-ink", 3) + circ(39, 32, 11, "l-sage", 3) + nodeAt(32, 32, 3, "l-fill-ink") },
      { vname: "Split Rejoin", concept: "Parallel work meeting again.", spec: "One rail splitting around and rejoining.", draw: () => path("M10 32 H22 C30 32 30 20 40 20 H54", "l-ink", 2.6) + path("M22 32 C30 32 30 44 40 44 H54", "l-sage", 2.6) + nodeAt(10, 32, 3.4, "l-fill-ink") + nodeAt(54, 20, 3) + nodeAt(54, 44, 3) + nodeAt(54, 32, 3.4, "l-fill-sage") },
      { vname: "Star Topology Five", concept: "All routes lead here.", spec: "Five spokes to bold endpoints.", draw: () => nodeAt(32, 32, 4.6, "l-fill-ink") + reg(32, 32, 18, 5).map(([x, y]) => line(32, 32, x, y, "l-dim", 2) + nodeAt(x, y, 3.4, "l-fill-sage")).join("") },
      { vname: "Org Chart Bar", concept: "Reporting lines, minimal.", spec: "Top node over a bar of three.", draw: () => nodeAt(32, 14, 4.4, "l-fill-sage") + line(32, 18, 32, 26, "l-dim", 2) + line(16, 26, 48, 26, "l-dim", 2) + [16, 32, 48].map((x) => line(x, 26, x, 34, "l-dim", 2) + rectR(x - 5, 36, 10, 12, 3, "l-fill-ink")).join("") },
      { vname: "Mobile Balance", concept: "Weight hung in equilibrium.", spec: "Hanging bar with two paired dots.", draw: () => line(32, 8, 32, 20, "l-dim", 2) + line(18, 26, 46, 26, "l-ink", 2.8) + line(18, 26, 18, 36, "l-dim", 1.8) + line(46, 26, 46, 36, "l-dim", 1.8) + nodeAt(18, 40, 4, "l-fill-sage") + nodeAt(46, 40, 4, "l-fill-ink") },
      { vname: "Emphasis Orbit Nodes", concept: "The team, with one member highlighted.", spec: "Five ring nodes, one enlarged sage.", draw: () => { let s = circ(32, 32, 15, "l-faint", 1.5) + nodeAt(32, 32, 3); reg(32, 32, 15, 5).forEach(([x, y], i) => (s += i === 0 ? nodeAt(x, y, 4.6, "l-fill-sage") : nodeAt(x, y, 3, "l-fill-ink"))); return s; } },
      { vname: "Tetra Wireframe", concept: "Depth from four points alone.", spec: "Tetrahedron wireframe with solid vertices.", draw: () => { const A = [32, 12], B = [12, 40], C = [52, 40], D = [32, 30]; let s = ""; [[A, B], [B, C], [A, C], [A, D], [B, D], [C, D]].forEach(([[x1, y1], [x2, y2]]) => (s += line(x1, y1, x2, y2, "l-faint", 1.4))); [A, B, C].forEach(([x, y], i) => (s += nodeAt(x, y, 3.4, i === 0 ? "l-fill-sage" : "l-fill-ink"))); return s + nodeAt(D[0], D[1], 2.6, "l-fill-dim"); } },
      { vname: "Square Diagonal Net", concept: "The box with a crossroads inside.", spec: "Corner squares with crossing diagonals.", draw: () => { const P = [[14, 14], [50, 14], [50, 50], [14, 50]]; let s = ""; P.forEach(([x, y], i) => (s += rectR(x - 5, y - 5, 10, 10, 2.5, "l-fill-ink"))); s += line(14, 14, 50, 50, "l-dim", 1.6) + line(50, 14, 14, 50, "l-dim", 1.6); return s + nodeAt(32, 32, 3.6, "l-fill-sage"); } },
    ],
  },
  {
    id: "flow-merge",
    name: "Flow & Merge",
    seed: 2106,
    variants: [
      { vname: "Converge Junction", concept: "Many inputs, one confident output.", spec: "Two bold rails into a filled junction node.", draw: () => path("M10 20 H28 Q40 20 40 32", "l-ink", 3.2) + path("M10 44 H28 Q40 44 40 32", "l-sage", 3.2) + line(40, 32, 54, 32, "l-ink", 3.2) + dot(40, 32, 5, "l-fill-ink") },
      { vname: "Double Braid", concept: "Two strands that keep choosing each other.", spec: "Lines crossing twice, alternating tones.", draw: () => path("M12 20 C28 20 36 44 52 44", "l-ink", 3) + path("M12 44 C28 44 36 20 52 20", "l-sage", 3) },
      { vname: "Crossroads Dot", concept: "Where decisions meet.", spec: "Crossed rails with a bold center node.", draw: () => line(12, 32, 52, 32, "l-ink", 3) + line(32, 12, 32, 52, "l-sage", 3) + dot(32, 32, 5, "l-fill-ink") },
      { vname: "Fork Nodal Y", concept: "One root, two commitments.", spec: "Bold Y with nodal tips.", draw: () => line(32, 52, 32, 34, "l-ink", 3.2) + path("M32 34 C32 25 21 25 16 15", "l-ink", 3.2) + path("M32 34 C32 25 43 25 48 15", "l-sage", 3.2) + nodeAt(16, 14, 3.6) + nodeAt(48, 14, 3.6, "l-fill-sage") },
      { vname: "Weave Through Pair", concept: "The thread that visits each post.", spec: "Rail weaving through two fixed rings.", draw: () => path("M8 44 Q20 44 26 34 T44 22 L56 22", "l-sage", 2.8) + circ(24, 36, 5, "l-ink", 2.6) + circ(42, 24, 5, "l-ink", 2.6) },
      { vname: "Bend Terminals", concept: "A single considered turn.", spec: "One thick bend with terminal pads.", draw: () => path("M14 46 V30 Q14 18 26 18 H50", "l-ink", 4) + nodeAt(14, 48, 3.8, "l-fill-sage") + nodeAt(52, 18, 3.8, "l-fill-sage") },
      { vname: "Through Diamond", concept: "Flow passing through the decision gem.", spec: "Rails entering and leaving a solid diamond.", draw: () => line(8, 32, 22, 32, "l-ink", 3) + poly([[32, 18], [46, 32], [32, 46], [18, 32]], "l-fill-sage") + line(42, 32, 56, 32, "l-ink", 3) },
      { vname: "Terraced Current", concept: "Current stepping down calmly.", spec: "Stair-stepped flow with end pads.", draw: () => line(10, 18, 26, 18, "l-ink", 3.4) + line(26, 18, 26, 32, "l-ink", 3.4) + line(26, 32, 42, 32, "l-ink", 3.4) + line(42, 32, 42, 46, "l-ink", 3.4) + line(42, 46, 54, 46, "l-ink", 3.4) + nodeAt(10, 18, 3.4, "l-fill-sage") + nodeAt(54, 46, 3.4, "l-fill-sage") },
      { vname: "Return Loop", concept: "Everything comes back to source.", spec: "Line leaving and looping home.", draw: () => dot(18, 40, 4.4, "l-fill-ink") + path("M18 36 C18 18 46 18 46 32 C46 44 30 44 28 36", "l-sage", 3) },
      { vname: "Funnel Point", concept: "Wide attention narrowed to one result.", spec: "Diverging rails closing to an exit dot.", draw: () => line(10, 16, 30, 28, "l-ink", 3) + line(10, 48, 30, 36, "l-ink", 3) + line(30, 28, 30, 36, "l-ink", 3) + line(30, 32, 48, 32, "l-sage", 3.4) + dot(51, 32, 4, "l-fill-sage") },
      { vname: "Bridge Crossing", concept: "One line carried over another.", spec: "Solid line bridging a broken line.", draw: () => line(10, 40, 54, 40, "l-dim", 3) + line(24, 40, 30, 40, "l-paper", 5) + path("M10 24 H22 Q30 24 30 32 Q30 40 38 40 H54", "l-ink", 3.2) },
      { vname: "Thickening Branch", concept: "The option that grows into the mainline.", spec: "Fork where one branch widens to a wedge.", draw: () => path("M12 32 H30", "l-ink", 3) + path("M30 32 C38 32 40 24 48 24", "l-dim", 2.4) + poly([[32, 36], [50, 40], [32, 44]], "l-fill-sage") },
      { vname: "Merge Arrows", concept: "Two pushes becoming one thrust.", spec: "Arrow pair joining into a single bold arrow.", draw: () => line(10, 20, 26, 20, "l-ink", 2.8) + line(10, 44, 26, 44, "l-sage", 2.8) + path("M26 20 Q38 20 38 32", "l-ink", 2.8) + path("M26 44 Q38 44 38 32", "l-sage", 2.8) + line(38, 32, 46, 32, "l-ink", 3.2) + poly([[46, 26], [56, 32], [46, 38]], "l-fill-ink") },
      { vname: "Roundabout Three", concept: "Traffic that never collides.", spec: "Circular junction with three entry stubs.", draw: () => circ(32, 32, 11, "l-sage", 3.4) + line(10, 32, 21, 32, "l-ink", 2.8) + line(43, 43, 52, 52, "l-ink", 2.8) + line(43, 21, 52, 12, "l-ink", 2.8) + nodeAt(32, 32, 3.4, "l-fill-sage") },
      { vname: "Switch Point", concept: "The track that chooses.", spec: "Branching track with switch node.", draw: () => line(8, 46, 30, 46, "l-ink", 3) + line(30, 46, 54, 46, "l-ink", 3) + path("M30 46 C40 46 40 22 54 22", "l-sage", 3) + nodeAt(30, 46, 3.8, "l-fill-ink") },
      { vname: "Lens Twin Bridges", concept: "Two arcs trusting each other's ends.", spec: "Lens formed by two thick arcs.", draw: () => arc(-8, 32, 34, -0.55, 0.55, "l-ink", 3.4) + arc(72, 32, 34, Math.PI - 0.55, Math.PI + 0.55, "l-sage", 3.4) + dot(32, 32, 3.4, "l-fill-ink") },
      { vname: "Tapered Current", concept: "Motion drawn as a living wedge.", spec: "Calligraphic tapered sweep.", draw: () => path("M12 44 C22 40 30 28 52 20 C40 34 30 44 14 46 Z", "l-fill-ink") },
      { vname: "Vertex Cascade", concept: "Every turn is a checkpoint.", spec: "Zigzag flow with vertex dots.", draw: () => path("M10 44 L24 30 L38 44 L52 30", "l-sage", 3) + nodeAt(10, 44, 3) + nodeAt(24, 30, 3, "l-fill-ink") + nodeAt(38, 44, 3) + nodeAt(52, 30, 3, "l-fill-sage") },
      { vname: "Inflow Trio", concept: "Three sources, one destination.", spec: "Arrows converging into a solid hub.", draw: () => [[10, 16, 26, 28], [10, 32, 26, 32], [10, 48, 26, 36]].map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, "l-dim", 2.4) + poly([[x2, y2 - 3], [x2 + 6, y2], [x2, y2 + 3]], "l-fill-dim")).join("") + nodeAt(36, 32, 5.5, "l-fill-sage") },
      { vname: "Outflow Fan", concept: "One engine, many directions.", spec: "Hub emitting three arrows fanned wide.", draw: () => nodeAt(20, 32, 5.5, "l-fill-ink") + [[44, 16], [48, 32], [44, 48]].map(([tx, ty], i) => line(26, 32, tx - 8, ty, "l-sage", 2.4) + poly([[tx - 8, ty - 3], [tx, ty], [tx - 8, ty + 3]], "l-fill-sage")).join("") },
    ],
  },
  {
    id: "circuit-badges",
    name: "Circuit Badges",
    seed: 2107,
    variants: [
      { vname: "Circuit Hex II", concept: "Your pick, emblem-grade.", spec: "Bold hexagon, three traces to a center pad.", draw: () => poly(reg(32, 32, 19, 6), "l-ink", 2.8) + [0, 2, 4].map((i) => { const [x, y] = reg(32, 32, 19, 6)[i]; const [ix, iy] = reg(32, 32, 7, 6)[i]; return line(x, y, ix, iy, "l-dim", 2); }).join("") + dot(32, 32, 4.4, "l-fill-sage") },
      { vname: "Honeycomb Bold", concept: "Cells that hold each other up.", spec: "Trio of hexes, center cell filled.", draw: () => poly(reg(22, 22, 12, 6), "l-ink", 2.6) + poly(reg(42, 22, 12, 6), "l-ink", 2.6) + poly(reg(32, 40, 12, 6), "l-fill-sage") },
      { vname: "Offset Hex Pair II", concept: "Two modules in quiet cooperation.", spec: "Outline hex behind filled hex.", draw: () => poly(reg(25, 26, 15, 6), "l-ink", 2.8) + poly(reg(39, 38, 15, 6), "l-fill-sage") },
      { vname: "Hex Annulus II", concept: "Depth declared in the strongest shape.", spec: "Thick hexagon ring with hex void.", draw: () => poly(reg(32, 32, 19, 6), "l-ink", 3.2) + poly(reg(32, 32, 9.5, 6), "l-faint", 1.6) },
      { vname: "Hub Pad II", concept: "One source feeding the field.", spec: "Fat pad, three traces, three pads.", draw: () => nodeAt(18, 32, 7, "l-fill-ink") + [[46, 16], [50, 32], [46, 48]].map(([x, y]) => path(`M24 32 C34 32 36 ${f(y)} ${f(x - 7)} ${f(y)}`, "l-dim", 2.2) + nodeAt(x, y, 3.4, "l-fill-sage")).join("") },
      { vname: "Die With Pins", concept: "The chip as heraldry.", spec: "Filled die with paper pin stubs and core.", draw: () => rectR(17, 17, 30, 30, 5, "l-fill-ink") + [24, 32, 40].map((p) => line(p, 10, p, 16, "l-paper", 2.6) + line(p, 48, p, 54, "l-paper", 2.6) + line(10, p, 16, p, "l-paper", 2.6) + line(48, p, 54, p, "l-paper", 2.6)).join("") + dot(32, 32, 3.6, "l-fill-sage") },
      { vname: "Diamond Pads", concept: "Contacts at every corner of intent.", spec: "Rotated pad square plus four vias.", draw: () => poly([[32, 18], [46, 32], [32, 46], [18, 32]], "l-fill-ink") + reg(32, 32, 21, 4).map(([x, y]) => dot(x, y, 2.6, "l-fill-sage")).join("") },
      { vname: "Trace Loop Rails", concept: "A route that returns on itself.", spec: "Rectangular trace loop with two pads.", draw: () => raw(`<rect class="l-ink" x="14" y="20" width="36" height="24" rx="9" style="fill:none;stroke-width:3"/>`) + nodeAt(17, 44, 3.6, "l-fill-sage") + nodeAt(47, 20, 3.6, "l-fill-sage") },
      { vname: "Quad Lane Bus", concept: "Four lanes, one direction.", spec: "Parallel traces with terminal pads.", draw: () => [16, 26, 38, 48].map((y, i) => line(10, y, 46, y, i === 1 || i === 2 ? "l-sage" : "l-ink", 2.8) + nodeAt(51, y, 2.8, i === 1 || i === 2 ? "l-fill-sage" : "l-fill-ink")).join("") },
      { vname: "Socketed Module", concept: "Seated firmly where it belongs.", spec: "U cradle holding a solid module.", draw: () => raw(`<path class="l-ink" d="M14 12 V40 Q14 50 24 50 H40 Q50 50 50 40 V12" style="fill:none;stroke-width:3.4"/>`) + rectR(24, 28, 16, 14, 3, "l-fill-sage") },
      { vname: "Triple Coil", concept: "Stored energy, drawn plainly.", spec: "Three bold bumps between fat pads.", draw: () => line(8, 36, 14, 36, "l-ink", 3) + arc(20, 36, 6, Math.PI, TAU, "l-ink", 3) + arc(32, 36, 6, Math.PI, TAU, "l-ink", 3) + arc(44, 36, 6, Math.PI, TAU, "l-ink", 3) + line(50, 36, 56, 36, "l-ink", 3) + nodeAt(8, 36, 3, "l-fill-sage") + nodeAt(56, 36, 3, "l-fill-sage") },
      { vname: "Via Ladder", concept: "Two rails stitched together.", spec: "Parallel rails joined by via rungs.", draw: () => line(18, 14, 18, 50, "l-ink", 3) + line(46, 14, 46, 50, "l-sage", 3) + [22, 32, 42].map((y) => line(18, y, 46, y, "l-dim", 2.2) + dot(32, y, 2.6, "l-fill-ink")).join("") },
      { vname: "Hex Nut Heavy", concept: "Hardware honesty at full weight.", spec: "Thick hexagon with wide bore.", draw: () => poly(reg(32, 32, 19, 6), "l-ink", 4.5) + circ(32, 32, 8, "l-sage", 2.6) },
      { vname: "Edge Fan Traces", concept: "Everything routed from one edge.", spec: "Fan of three traces from an edge pad.", draw: () => nodeAt(12, 32, 4.6, "l-fill-sage") + [[50, 16], [54, 32], [50, 48]].map(([x, y]) => path(`M16 32 C30 32 30 ${f(y)} ${f(x - 6)} ${f(y)} H${f(x)}`, "l-dim", 2.2) + nodeAt(x, y, 3)).join("") },
      { vname: "Pin Header Row", concept: "Ready to be connected.", spec: "Header block with three pin legs.", draw: () => rectR(12, 24, 24, 16, 3, "l-fill-ink") + [17, 24, 31].map((x) => line(x, 40, x, 52, "l-sage", 2.6)).join("") },
      { vname: "Ground Rail", concept: "Solid footing for everything above.", spec: "Trace into a bold ground stack.", draw: () => line(32, 8, 32, 36, "l-ink", 3.2) + nodeAt(32, 8, 3, "l-fill-sage") + line(18, 38, 46, 38, "l-ink", 3.2) + line(23, 45, 41, 45, "l-ink", 2.8) + line(28, 52, 36, 52, "l-ink", 2.4) },
      { vname: "Antenna Spiral", concept: "Reaching out and coiling home.", spec: "Spiral coil beside a whip antenna.", draw: () => arc(24, 40, 10, -Math.PI * 0.5, Math.PI * 1.15, "l-ink", 2.8) + arc(24, 40, 5.5, -Math.PI * 0.5, Math.PI * 1.3, "l-ink", 2.8) + line(44, 50, 44, 16, "l-sage", 3) + dot(44, 13, 2.8, "l-fill-sage") },
      { vname: "Load Resistor", concept: "Resistance between two strong points.", spec: "Bold zigzag between fat pads.", draw: () => line(6, 32, 15, 32, "l-ink", 3) + path("M15 32 L20 23 L28 41 L36 23 L44 41 L49 32", "l-ink", 3) + line(49, 32, 58, 32, "l-ink", 3) + nodeAt(6, 32, 3.4, "l-fill-sage") + nodeAt(58, 32, 3.4, "l-fill-sage") },
      { vname: "Coupled Squares", concept: "Two blocks sharing one wall.", spec: "Adjacent squares with bridge node.", draw: () => rectR(12, 20, 20, 24, 4, "l-fill-ink") + rectR(34, 20, 20, 24, 4, "l-fill-sage") + dot(33, 32, 3.4, "l-fill-paper") },
      { vname: "Heat Sink Fins", concept: "Cool under any load.", spec: "Base bar with rising fins.", draw: () => rectR(12, 44, 40, 8, 3, "l-fill-ink") + [18, 27, 37, 46].map((x) => rectR(x - 3, 16, 6, 24, 2, "l-fill-sage")).join("") },
    ],
  },
  {
    id: "code-glyphs",
    name: "Code Glyphs",
    seed: 2108,
    variants: [
      { vname: "Self Closing II", concept: "Your favorite, set heavier and tighter.", spec: "</> with confident strokes.", draw: () => path("M24 18 L10 32 L24 46", "l-ink", 3.6) + path("M40 18 L54 32 L40 46", "l-ink", 3.6) + line(37, 15, 27, 49, "l-sage", 3.6) },
      { vname: "Nested Braces II", concept: "Your pick, bolder scope.", spec: "{{ }} double braces, ink outside, sage inside.", draw: () => path("M24 12 C17 12 17 19 17 25 C17 30 13 32 10 32 C13 32 17 34 17 39 C17 45 17 52 24 52", "l-ink", 3.2) + path("M40 12 C47 12 47 19 47 25 C47 30 51 32 54 32 C51 32 47 34 47 39 C47 45 47 52 40 52", "l-ink", 3.2) + path("M31 17 C27 17 27 21 27 26 C27 29 25 32 23 32 C25 32 27 35 27 38 C27 43 27 47 31 47", "l-sage", 3) + path("M33 17 C37 17 37 21 37 26 C37 29 39 32 41 32 C39 32 37 35 37 38 C37 43 37 47 33 47", "l-sage", 3) },
      { vname: "Lone Angle II", concept: "Your pick: one bracket, all attention.", spec: "Single large < with a solid dot.", draw: () => path("M42 12 L12 32 L42 52", "l-ink", 4) + dot(33, 32, 4.4, "l-fill-sage") },
      { vname: "Tag Diamond Core", concept: "Open and close meeting as one gem.", spec: "<> forming a diamond around a dot.", draw: () => path("M26 14 L8 32 L26 50", "l-ink", 3.4) + path("M38 14 L56 32 L38 50", "l-ink", 3.4) + dot(32, 32, 4.6, "l-fill-sage") },
      { vname: "Vessel Braces", concept: "Braces as a vessel holding nothing yet.", spec: "{ } mirrored into a bowl shape.", draw: () => path("M24 14 C17 14 17 22 17 28 C17 32 13 32 11 32 C13 32 17 33 17 37 C17 46 20 50 26 50", "l-ink", 3.2) + path("M40 14 C47 14 47 22 47 28 C47 32 51 32 53 32 C51 32 47 33 47 37 C47 46 44 50 40 50", "l-ink", 3.2) + line(24, 32, 40, 32, "l-sage", 3) },
      { vname: "Angle Gate", concept: "Open above, closed below — choose.", spec: "^ over v as an abstract gate.", draw: () => path("M16 26 L32 12 L48 26", "l-ink", 3.6) + path("M16 40 L32 54 L48 40", "l-sage", 3.6) },
      { vname: "Slash Comment", concept: "The line that explains the others.", spec: "// doubled bold slashes.", draw: () => line(26, 12, 16, 52, "l-ink", 4) + line(42, 12, 32, 52, "l-ink", 4) },
      { vname: "Quote Marks Pair", concept: "Attribution built in.", spec: "Two bold comma quotes high.", draw: () => path("M20 20 C26 20 30 25 30 31 C30 38 25 43 18 44 C22 39 23 34 21 30 C19 26 19 23 20 20 Z", "l-fill-ink") + path("M40 20 C46 20 50 25 50 31 C50 38 45 43 38 44 C42 39 43 34 41 30 C39 26 39 23 40 20 Z", "l-fill-sage") },
      { vname: "Pipe Gate Bold", concept: "Two uprights, one truth between.", spec: "| | heavy with center dot.", draw: () => line(22, 12, 22, 52, "l-ink", 4) + line(42, 12, 42, 52, "l-ink", 4) + dot(32, 32, 4.4, "l-fill-sage") },
      { vname: "Shifted Equals", concept: "Assignment and comparison, staged.", spec: "== pairs displaced diagonally, heavy.", draw: () => line(14, 22, 30, 22, "l-ink", 3.4) + line(14, 31, 30, 31, "l-ink", 3.4) + line(34, 37, 50, 37, "l-sage", 3.4) + line(34, 46, 50, 46, "l-sage", 3.4) },
      { vname: "Backtick Shelter", concept: "Inline code under its little roof.", spec: "Ticks above, caret shelter beneath.", draw: () => path("M20 22 L26 14", "l-ink", 3.4) + path("M38 22 L44 14", "l-ink", 3.4) + path("M18 44 L32 32 L46 44", "l-sage", 3.4) },
      { vname: "Fragment Trio", concept: "The tag reduced to essentials.", spec: "< / with the closing angle faint.", draw: () => path("M24 16 L10 32 L24 48", "l-ink", 3.4) + line(38, 13, 27, 51, "l-sage", 3.4) + path("M44 16 L58 32 L44 48", "l-faint", 2.6) },
      { vname: "Statement End Bold", concept: "Finished — and it stays finished.", spec: "Giant semicolon as identity.", draw: () => dot(30, 22, 7, "l-fill-ink") + path("M37 36 C37 48 30 53 22 55 C28 46 29 41 28 36 Z", "l-fill-sage") },
      { vname: "Simplified Ampersand", concept: "Joining things, with two strokes only.", spec: "& built from one loop and one leg.", draw: () => circ(27, 25, 9, "l-ink", 3.4) + path("M33 30 C40 38 46 44 54 50", "l-ink", 3.4) + path("M18 48 C26 42 34 34 40 24", "l-sage", 3.4) },
      { vname: "Lambda Heavy", concept: "The function letter at brand weight.", spec: "λ with thick primary and sage leg.", draw: () => path("M20 12 C27 24 30 32 33 40", "l-ink", 3.8) + path("M46 12 C37 28 29 42 22 52", "l-ink", 3.8) + path("M33 40 C38 47 44 51 50 52", "l-sage", 3.8) },
      { vname: "Embraced Dot", concept: "Held tightly from both sides.", spec: "[ ] tight around a solid core.", draw: () => path("M26 14 H16 V50 H26", "l-ink", 3.6) + path("M38 14 H48 V50 H38", "l-ink", 3.6) + dot(32, 32, 5, "l-fill-sage") },
      { vname: "Double Caret", concept: "Yes — twice.", spec: "^^ stacked carets.", draw: () => path("M14 30 L24 18 L34 30", "l-ink", 3.6) + path("M30 30 L40 18 L50 30", "l-sage", 3.6) + line(14, 46, 50, 46, "l-ink", 3) },
      { vname: "Approximately Mark", concept: "Close enough, honestly labeled.", spec: "Double tilde waves.", draw: () => path("M10 26 Q18 18 26 26 T42 26 T58 26", "l-ink", 3.4) + path("M10 42 Q18 34 26 42 T42 42 T58 42", "l-sage", 3.4) },
      { vname: "Config Keys", concept: "YAML calm: keys and values.", spec: ": − pair as composition.", draw: () => dot(24, 22, 4.4, "l-fill-ink") + dot(24, 40, 4.4, "l-fill-ink") + line(36, 22, 52, 22, "l-sage", 3.4) + line(36, 40, 52, 40, "l-sage", 3.4) },
      { vname: "Hook Curl Dot", concept: "An angle that decided to stay.", spec: "< curling into a hook with a dot.", draw: () => path("M28 14 L12 32 L26 46", "l-ink", 3.6) + arc(36, 32, 13, Math.PI * 0.8, Math.PI * 2.35, "l-sage", 3.6) + dot(36, 32, 3.6, "l-fill-ink") },
    ],
  },
  {
    id: "prompt-icons",
    name: "Prompt Icons",
    seed: 2109,
    variants: [
      { vname: "Classic Prompt II", concept: "Your move, stated boldly.", spec: "Large ink chevron over thick sage cursor.", draw: () => gt(23, 30, 10) + cursorBar(32, 39, 14, "l-sage", 3.6) },
      { vname: "Block Cursor II", concept: "The cursor as a solid fact.", spec: "Chevron beside a filled block.", draw: () => gt(22, 29, 9) + rectR(34, 33, 12, 11, 2, "l-fill-sage") },
      { vname: "Rising Double Chevron", concept: "Upward, twice for emphasis.", spec: "Two stacked chevrons pointing up.", draw: () => path("M18 30 L32 18 L46 30", "l-ink", 3.6) + path("M18 46 L32 34 L46 46", "l-sage", 3.6) },
      { vname: "Roundel Prompt II", concept: "Sealed and ready.", spec: "Bold ring holding centered prompt.", draw: () => circ(32, 32, 19, "l-ink", 3) + gt(26, 30, 7.5, "l-sage", 3) + cursorBar(34, 37, 9, "l-sage", 3) },
      { vname: "Shell Window Lite", concept: "Just enough chrome to say terminal.", spec: "Minimal window frame with prompt.", draw: () => rectR(8, 14, 48, 36, 7, "l-ink", 2.8) + line(8, 24, 56, 24, "l-dim", 1.8) + dot(14, 19, 1.8, "l-fill-sage") + gt(17, 37, 5.5, "l-ink", 2.6) + cursorBar(24, 42, 10, "l-sage", 2.6) },
      { vname: "Cursor Monolith", concept: "One standing bar — pure readiness.", spec: "Tall solid cursor with small chevron escort.", draw: () => rectR(36, 12, 9, 40, 4.5, "l-fill-sage") + gt(20, 32, 8, "l-ink", 3.2) },
      { vname: "Echo Bars", concept: "Command above, output below.", spec: "Prompt line over two output rules.", draw: () => gt(16, 22, 7, "l-ink", 3.2) + cursorBar(26, 28, 13, "l-sage", 3.2) + line(12, 41, 52, 41, "l-dim", 2.6) + line(12, 49, 38, 49, "l-faint", 2.4) },
      { vname: "Stepped Chevrons Bold", concept: "Depth rendered as growing arrows.", spec: "Three chevrons ascending in weight.", draw: () => gt(16, 28, 5, "l-faint", 2.4) + gt(26, 30, 7.5, "l-sage", 3) + gt(38, 32, 10, "l-ink", 3.6) },
      { vname: "Run Key", concept: "Press once; trust what follows.", spec: "Solid play triangle over baseline.", draw: () => poly([[20, 18], [44, 32], [20, 46]], "l-fill-sage") + line(14, 53, 50, 53, "l-ink", 3.6) },
      { vname: "Ghost Pair Offset", concept: "Where the caret was; where it is.", spec: "Faint block trailing solid block.", draw: () => gt(18, 29, 8, "l-dim", 3) + rectR(30, 32, 11, 10, 2, "l-fill-faint") + rectR(37, 32, 11, 10, 2, "l-fill-sage") },
      { vname: "Minified Roundel", concept: "A tiny prompt in a huge calm field.", spec: "Small >_ inside wide faint circle.", draw: () => circ(32, 32, 23, "l-faint", 1.6) + gt(27, 38, 6, "l-ink", 2.6) + cursorBar(34, 44, 8, "l-sage", 2.6) },
      { vname: "Pipe Prompt Pair", concept: "Insertion point standing at attention.", spec: "Chevron beside tall pipe cursor.", draw: () => gt(22, 30, 9) + line(38, 18, 38, 46, "l-sage", 4) },
      { vname: "Blink Alternator", concept: "Two states of the same promise.", spec: "Cursor blocks alternating tone.", draw: () => gt(16, 30, 8) + rectR(28, 32, 11, 10, 2, "l-fill-sage") + rectR(43, 32, 11, 10, 2, "l-fill-faint") },
      { vname: "Prompt Archway", concept: "The command beneath its own arch.", spec: "Chevron under a protective arc.", draw: () => arc(32, 40, 20, Math.PI * 1.08, Math.PI * 1.92, "l-dim", 2.8) + gt(25, 38, 8, "l-ink", 3.4) + cursorBar(33, 46, 10, "l-sage", 3.4) },
      { vname: "Command Period", concept: "Done — with conviction.", spec: "Chevron and heavy period.", draw: () => gt(22, 28, 9.5) + dot(42, 40, 4.6, "l-fill-sage") },
      { vname: "Triple Rise", concept: "Yes, yes, yes.", spec: "Three carets fading upward.", draw: () => path("M18 50 L32 36 L46 50", "l-ink", 3.6) + path("M21 34 L32 23 L43 34", "l-sage", 3) + path("M24 19 L32 11 L40 19", "l-faint", 2.6) },
      { vname: "Type Caret Rail", concept: "Writing, mid-sentence.", spec: "Text lines with insertion caret.", draw: () => line(12, 22, 44, 22, "l-dim", 2.8) + line(38, 15, 38, 29, "l-sage", 3.2) + line(12, 38, 52, 38, "l-dim", 2.8) + line(12, 50, 40, 50, "l-faint", 2.6) },
      { vname: "Send Wing", concept: "Delivered, with momentum.", spec: "Bold paper plane with speed dashes.", draw: () => poly([[10, 30], [52, 12], [34, 52], [28, 38]], "l-fill-ink") + line(8, 44, 18, 44, "l-sage", 3) + line(12, 51, 22, 51, "l-faint", 2.6) },
      { vname: "Return Key Mark", concept: "Committing to the line above.", spec: "Geometric return arrow.", draw: () => raw(`<path d="M50 14 V34 H18 Q12 34 12 40 V46" fill="none" class="l-ink" style="stroke-width:3.4"/>`) + poly([[17, 38], [9, 46], [17, 54]], "l-fill-sage") },
      { vname: "Tab Arrow Bar", concept: "Indent as intention.", spec: "Bold arrow into a vertical stop bar.", draw: () => line(10, 32, 34, 32, "l-ink", 3.4) + poly([[34, 25], [44, 32], [34, 39]], "l-fill-sage") + line(48, 16, 48, 48, "l-ink", 3.6) },
    ],
  },
  {
    id: "signal-pulse",
    name: "Signal & Pulse",
    seed: 2110,
    variants: [
      { vname: "Calm Pulse II", concept: "Your pick at brand weight.", spec: "Bold ECG line with one spike and node.", draw: () => path("M8 36 H20 L27 20 L34 48 L39 36 H56", "l-ink", 3.6) + dot(27, 20, 3.4, "l-fill-sage") },
      { vname: "Air Waves II", concept: "Your pick, heavier broadcast.", spec: "Corner source with three bold arcs.", draw: () => dot(18, 46, 4.4, "l-fill-sage") + arc(18, 46, 10, -Math.PI * 0.5, 0, "l-dim", 2.4) + arc(18, 46, 17, -Math.PI * 0.5, 0, "l-ink", 2.8) + arc(18, 46, 24, -Math.PI * 0.5, 0, "l-faint", 2) },
      { vname: "Framed Pulse", concept: "The heartbeat kept in a window.", spec: "Pulse inside a squircle outline.", draw: () => rectR(9, 15, 46, 34, 11, "l-ink", 3) + path("M16 32 H24 L28 25 L33 40 L37 32 H48", "l-sage", 3) },
      { vname: "Twin Spike Range", concept: "Two events, one steady baseline.", spec: "Double pulse peaks on a rail.", draw: () => line(6, 38, 14, 38, "l-ink", 3.2) + path("M14 38 L20 24 L26 38", "l-ink", 3.2) + line(26, 38, 36, 38, "l-ink", 3.2) + path("M36 38 L42 28 L48 38", "l-sage", 3.2) + line(48, 38, 58, 38, "l-ink", 3.2) },
      { vname: "Broadcast Core", concept: "Speaking in every direction at once.", spec: "Core with symmetric side arcs.", draw: () => dot(32, 32, 4.6, "l-fill-ink") + arc(24, 32, 9, Math.PI * 0.55, Math.PI * 1.45, "l-sage", 2.8) + arc(40, 32, 9, -Math.PI * 0.45, Math.PI * 0.45, "l-sage", 2.8) + arc(18, 32, 13, Math.PI * 0.62, Math.PI * 1.38, "l-faint", 2.2) + arc(46, 32, 13, -Math.PI * 0.38, Math.PI * 0.38, "l-faint", 2.2) },
      { vname: "Radar Contact II", concept: "One sweep, one confident blip.", spec: "Bold circle with sweep and contact.", draw: () => circ(32, 32, 19, "l-ink", 3) + line(32, 32, pt(32, 32, 19, -Math.PI / 3)[0], pt(32, 32, 19, -Math.PI / 3)[1], "l-sage", 3) + nodeAt(25, 25, 3.4, "l-fill-sage") },
      { vname: "Uplink Stack II", concept: "Sending everything upward.", spec: "Dot under two stacked arcs.", draw: () => dot(32, 44, 4.6, "l-fill-ink") + arc(32, 47, 11, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 3) + arc(32, 47, 18, -Math.PI * 0.66, -Math.PI * 0.34, "l-dim", 2.4) },
      { vname: "Sonar Fade", concept: "Presence announced, then quiet.", spec: "Three fading rings around solid core.", draw: () => dot(32, 32, 5, "l-fill-ink") + circ(32, 32, 11, "l-sage", 2.8) + circ(32, 32, 17, "l-dim", 2) + circ(32, 32, 23, "l-faint", 1.4) },
      { vname: "Flatline Beat", concept: "Calm most of the time — that is the point.", spec: "Straight rail with a single bump.", draw: () => line(8, 32, 26, 32, "l-ink", 3.6) + path("M26 32 Q32 21 38 32", "l-sage", 3.6) + line(38, 32, 56, 32, "l-ink", 3.6) },
      { vname: "Signal Fan Three", concept: "Options radiating from one source.", spec: "Three fanned rays from a hub dot.", draw: () => nodeAt(16, 44, 4.4, "l-fill-ink") + [[52, 12], [56, 30], [50, 50]].map(([x, y], i) => line(20, 42, x, y, i === 1 ? "l-ink" : "l-dim", 2.8)).join("") + nodeAt(52, 12, 3, "l-fill-sage") + nodeAt(56, 30, 3, "l-fill-sage") + nodeAt(50, 50, 3, "l-fill-sage") },
      { vname: "Echo Pair Right", concept: "Said once, echoed twice.", spec: "Dot followed by double arcs.", draw: () => nodeAt(18, 32, 4.4, "l-fill-ink") + arc(18, 32, 10, -Math.PI * 0.42, Math.PI * 0.42, "l-sage", 2.8) + arc(18, 32, 17, -Math.PI * 0.38, Math.PI * 0.38, "l-dim", 2.4) },
      { vname: "Guttered Wave", concept: "Flow held between firm banks.", spec: "Sine between two straight rails.", draw: () => line(10, 18, 54, 18, "l-ink", 2.8) + line(10, 46, 54, 46, "l-ink", 2.8) + path("M14 32 Q20 24 26 32 T38 32 T50 32", "l-sage", 3) },
      { vname: "Beacon Beams", concept: "Light thrown from the tower top.", spec: "Wedge beams over a small tower.", draw: () => poly([[27, 52], [29.5, 30], [34.5, 30], [37, 52]], "l-fill-ink") + poly([[10, 22], [25, 30], [10, 34]], "l-fill-sage") + poly([[54, 22], [39, 30], [54, 34]], "l-fill-sage") },
      { vname: "Mast Broadcast", concept: "Standing tall, heard widely.", spec: "Mast with paired waves and ground.", draw: () => line(32, 16, 32, 46, "l-ink", 3.2) + line(20, 52, 32, 44, "l-dim", 2.2) + line(44, 52, 32, 44, "l-dim", 2.2) + arc(22, 28, 8, -Math.PI * 0.45, Math.PI * 0.45, "l-sage", 2.6) + arc(42, 28, 8, Math.PI * 0.55, Math.PI * 1.45, "l-sage", 2.6) },
      { vname: "Square Wave Steps", concept: "Digital by birthright.", spec: "Square-wave pulse train.", draw: () => raw(`<path class="l-ink" d="M8 40 H18 V22 H30 V40 H42 V22 H52 V40 H56" style="fill:none;stroke-width:3.4"/>`) },
      { vname: "Doppler Compress", concept: "Approaching fast.", spec: "Arcs compressing toward the motion side.", draw: () => dot(20, 32, 4.6, "l-fill-ink") + arc(20, 32, 9, -Math.PI * 0.45, Math.PI * 0.45, "l-sage", 2.8) + arc(30, 32, 9, -Math.PI * 0.42, Math.PI * 0.42, "l-dim", 2.4) + arc(38, 32, 9, -Math.PI * 0.4, Math.PI * 0.4, "l-faint", 2) },
      { vname: "Ping Reply", concept: "Asked above; answered below.", spec: "Outgoing arc up, reply arc down.", draw: () => dot(32, 32, 4.4, "l-fill-ink") + arc(32, 29, 9, -Math.PI * 0.75, -Math.PI * 0.25, "l-sage", 2.8) + arc(32, 35, 9, Math.PI * 0.25, Math.PI * 0.75, "l-dim", 2.4) },
      { vname: "Amplify Pair", concept: "Small signal made large.", spec: "Small triangle feeding a large one.", draw: () => poly([[12, 26], [22, 32], [12, 38]], "l-fill-dim") + line(22, 32, 30, 32, "l-dim", 2.4) + poly([[34, 20], [54, 32], [34, 44]], "l-fill-sage") },
      { vname: "Quiet Carrier", concept: "Always on, rarely noticed.", spec: "Long rail with one tiny center blip.", draw: () => line(8, 32, 28, 32, "l-ink", 3) + dot(32, 32, 3.4, "l-fill-sage") + line(36, 32, 56, 32, "l-ink", 3) },
      { vname: "Resonant Faces", concept: "Two antennas agreeing.", spec: "Facing arcs around a shared core.", draw: () => dot(32, 32, 4, "l-fill-ink") + arc(22, 32, 8, -Math.PI * 0.42, Math.PI * 0.42, "l-sage", 2.8) + arc(42, 32, 8, Math.PI * 0.58, Math.PI * 1.42, "l-sage", 2.8) },
    ],
  },
  {
    id: "steps-strata",
    name: "Steps & Strata",
    seed: 2111,
    variants: [
      { vname: "Terrace Steps II", concept: "Your pick, heavier and centered.", spec: "Three bold widening bars.", draw: () => rectR(22, 14, 20, 9, 3, "l-fill-ink") + rectR(16, 27.5, 32, 9, 3, "l-fill-sage") + rectR(10, 41, 44, 9, 3, "l-fill-ink") },
      { vname: "Stair Ascent II", concept: "Your pick as a solid monument.", spec: "Bold staircase rising right.", draw: () => path("M12 52 H24 V40 H36 V28 H48 V16 H56 V52 Z", "l-fill-ink") },
      { vname: "Round Steps", concept: "Terraces wrapped in a circle.", spec: "Disc with step cuts rising.", draw: () => dot(32, 32, 19, "l-fill-ink") + paperFill("M18 44 H25 V37 H32 V30 H39 V23 H46 V44 Z") },
      { vname: "Ziggurat Solid", concept: "The oldest way to build up.", spec: "Three filled tiers, widest at base.", draw: () => rectR(10, 42, 44, 10, 2.5, "l-fill-dim") + rectR(17, 29, 30, 10, 2.5, "l-fill-sage") + rectR(24, 16, 16, 10, 2.5, "l-fill-ink") },
      { vname: "Progress Segments", concept: "Work divided into visible thirds.", spec: "Rising segment bars with round caps.", draw: () => rectR(12, 38, 10, 14, 4, "l-fill-faint") + rectR(27, 26, 10, 26, 4, "l-fill-sage") + rectR(42, 14, 10, 38, 4, "l-fill-ink") },
      { vname: "Equalizer Quartet", concept: "Levels finding their balance.", spec: "Four bars at staggered heights.", draw: () => [14, 26, 38, 50].map((x, i) => rectR(x - 4, [34, 22, 40, 18][i], 8, 52 - [34, 22, 40, 18][i], 3, i === 1 ? "l-fill-sage" : "l-fill-ink")).join("") },
      { vname: "Dotted Ascent", concept: "The route marked one point at a time.", spec: "Dotted path climbing steps.", draw: () => [[12, 48], [22, 40], [32, 32], [42, 24], [52, 16]].map(([x, y], i) => dot(x, y, i === 4 ? 4 : 2.8, i === 4 ? "l-fill-sage" : "l-fill-ink")).join("") + link(12, 48, 52, 16, 1.6, "l-faint") },
      { vname: "Foundation Pair", concept: "Built on something wider.", spec: "Base slab with two towers above.", draw: () => rectR(8, 42, 48, 10, 3, "l-fill-ink") + rectR(14, 24, 14, 14, 3, "l-fill-sage") + rectR(36, 14, 14, 24, 3, "l-fill-sage") },
      { vname: "Strata Bands Disc", concept: "Time settled into rings of work.", spec: "Disc with three horizontal bands.", draw: () => dot(32, 32, 19, "l-fill-ink") + line(13, 26, 51, 26, "l-paper", 3.4) + line(11, 33, 53, 33, "l-paper", 3.4) + line(15, 40, 49, 40, "l-paper", 3.4) },
      { vname: "Summit Mark", concept: "Reached the top; planted the point.", spec: "Stepped mound with summit node.", draw: () => poly([[10, 52], [22, 36], [30, 36], [30, 26], [42, 26], [42, 52]], "l-fill-ink") + dot(36, 18, 3.6, "l-fill-sage") },
      { vname: "Amphitheater Arcs", concept: "Every layer with a view.", spec: "Nested arc terraces opening upward.", draw: () => arc(32, 44, 8, Math.PI, TAU, "l-faint", 2.4) + arc(32, 44, 14, Math.PI, TAU, "l-dim", 3) + arc(32, 44, 20, Math.PI, TAU, "l-ink", 3.6) + nodeAt(32, 44, 4, "l-fill-sage") },
      { vname: "Facing Stairs", concept: "Two sides climbing toward each other.", spec: "Mirror staircases with a center gap.", draw: () => path("M6 52 V44 H14 V36 H22 V28 H30 V52 Z", "l-fill-ink") + path("M58 52 V44 H50 V36 H42 V28 H34 V52 Z", "l-fill-sage") },
      { vname: "Chosen Layer", concept: "One stratum called out from the core sample.", spec: "Layer stack with bold middle band.", draw: () => rectR(12, 12, 40, 10, 3, "l-fill-faint") + rectR(12, 27, 40, 10, 3, "l-fill-sage") + rectR(12, 42, 40, 10, 3, "l-fill-faint") },
      { vname: "Supported Ramp", concept: "Inclined, and held up properly.", spec: "Ramp plane on a strut.", draw: () => poly([[8, 50], [52, 18], [56, 24], [12, 56]], "l-fill-ink") + line(30, 36, 30, 54, "l-dim", 5) },
      { vname: "Mesa Silhouette", concept: "Level-headed even at altitude.", spec: "Flat-topped formation with step sides.", draw: () => path("M8 52 V42 H16 V32 H24 V22 H40 V32 H48 V42 H56 V52 Z", "l-fill-ink") },
      { vname: "Climbing Bars Arrow", concept: "Growth you can measure.", spec: "Ascending bars under an arrow tip.", draw: () => rectR(12, 36, 9, 16, 2.5, "l-fill-dim") + rectR(26, 28, 9, 24, 2.5, "l-fill-sage") + rectR(40, 20, 9, 32, 2.5, "l-fill-ink") + poly([[44.5, 8], [52, 16], [41, 16]], "l-fill-sage") },
      { vname: "Coin Stack Bold", concept: "Sessions banked like currency.", spec: "Three thick coin ellipses.", draw: () => ell(32, 44, 17, 7, "l-ink", 3) + ell(32, 31, 17, 7, "l-sage", 3) + ell(32, 18, 17, 7, "l-ink", 3) },
      { vname: "Milestone Flags", concept: "Progress celebrated at intervals.", spec: "Flag dots along an ascending rail.", draw: () => line(8, 50, 56, 18, "l-dim", 2.4) + [[16, 45], [30, 36], [44, 27]].map(([x, y]) => dot(x, y, 3, "l-fill-ink") + line(x, y, x, y - 10, "l-ink", 2.2) + poly([[x, y - 10], [x + 7, y - 7.5], [x, y - 5]], "l-fill-sage")).join("") + dot(54, 19.5, 3.6, "l-fill-sage") },
      { vname: "Podium Trio", concept: "Ranked, but still standing together.", spec: "2-1-3 podium blocks with rank dots.", draw: () => rectR(10, 30, 14, 22, 3, "l-fill-dim") + rectR(26, 20, 14, 32, 3, "l-fill-sage") + rectR(42, 36, 14, 16, 3, "l-fill-dim") + dot(17, 24, 3, "l-fill-ink") + dot(33, 14, 3, "l-fill-ink") + dot(49, 30, 3, "l-fill-ink") },
      { vname: "Terrace Contained", concept: "Your pick inside the app tile.", spec: "Tile with terrace bars cut in paper.", draw: () => tile("l-fill-sage") + rectR(18, 18, 28, 7, 3.5, "l-fill-paper") + rectR(18, 29, 20, 7, 3.5, "l-fill-paper") + rectR(18, 40, 28, 7, 3.5, "l-fill-paper") },
    ],
  },
  {
    id: "orbit-eclipse",
    name: "Orbit & Eclipse",
    seed: 2112,
    variants: [
      { vname: "Eclipse Passage", concept: "One body passing before another — timing made visible.", spec: "Solid disc eclipsed by a paper disc edge.", draw: () => dot(26, 32, 17, "l-fill-ink") + bgCircle(42, 32, 14) },
      { vname: "Single Satellite", concept: "One moon is enough.", spec: "Bold ring with a single large satellite.", draw: () => circ(32, 32, 15, "l-ink", 3.2) + nodeAt(pt(32, 32, 15, -Math.PI / 4)[0], pt(32, 32, 15, -Math.PI / 4)[1], 4.4, "l-fill-sage") },
      { vname: "Open Ring Comet", concept: "The orbit left deliberately unfinished.", spec: "Heavy open ring with comet head.", draw: () => arc(32, 32, 16, 0.4, TAU - 0.4, "l-ink", 3.6) + nodeAt(pt(32, 32, 16, TAU - 0.4)[0], pt(32, 32, 16, TAU - 0.4)[1], 4.4, "l-fill-sage") },
      { vname: "Ringed Planet Bold", concept: "The classic worn confidently.", spec: "Solid core with wide ellipse ring.", draw: () => dot(32, 32, 10, "l-fill-ink") + ell(32, 32, 21, 7, "l-sage", 3) },
      { vname: "Gyroscope Bold", concept: "Stable on every axis at once.", spec: "Ring plus vertical ellipse plus core.", draw: () => circ(32, 32, 17, "l-ink", 3) + ell(32, 32, 7, 17, "l-sage", 2.6) + nodeAt(32, 32, 3.4, "l-fill-ink") },
      { vname: "Shared Orbit Pair", concept: "Two agents, one track, no collisions.", spec: "Twin dots on one bold ellipse.", draw: () => ell(32, 32, 17, 10, "l-ink", 3) + nodeAt(15, 32, 4.4, "l-fill-ink") + nodeAt(49, 32, 4.4, "l-fill-sage") },
      { vname: "Attention Rings", concept: "Focus narrowing to a single point.", spec: "Faint halo, sage ring, solid core.", draw: () => circ(32, 32, 21, "l-faint", 1.6) + circ(32, 32, 15, "l-sage", 2.8) + nodeAt(32, 32, 6, "l-fill-ink") },
      { vname: "Phase Set Row", concept: "Everything the light does, in order.", spec: "Crescent, half, and full discs in a row.", draw: () => path("M14 21 A11 11 0 1 0 14 43 A8.5 8.5 0 1 1 14 21 Z", "l-fill-ink") + path("M32 21 A11 11 0 0 1 32 43 Z", "l-fill-ink") + dot(48, 32, 11, "l-fill-sage") },
      { vname: "Crossed Planes", concept: "Two orbits agreeing to intersect.", spec: "Rotated ellipse pair with solid core.", draw: () => ell(32, 32, 18, 8, "l-ink", 2.8, 30) + ell(32, 32, 18, 8, "l-sage", 2.8, -30) + nodeAt(32, 32, 4, "l-fill-ink") },
      { vname: "Tilted Path Core", concept: "One ellipse, one truth at center.", spec: "Single tilted orbit around core.", draw: () => ell(32, 32, 19, 9, "l-ink", 3, 24) + nodeAt(32, 32, 5, "l-fill-sage") },
      { vname: "Chronometer Bold", concept: "Twelve marks, one deliberate hand.", spec: "Ticked ring with sage hand and hub.", draw: () => { let s = circ(32, 32, 18, "l-ink", 3); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; s += line(pt(32, 32, 15, a)[0], pt(32, 32, 15, a)[1], pt(32, 32, 18, a)[0], pt(32, 32, 18, a)[1], "l-dim", 1.8); } return s + line(32, 32, pt(32, 32, 11, -Math.PI / 3)[0], pt(32, 32, 11, -Math.PI / 3)[1], "l-sage", 3) + nodeAt(32, 32, 3.2, "l-fill-ink"); } },
      { vname: "Loose Five Swarm", concept: "Independent, loosely held, all yours.", spec: "Core with five satellites at varied radii.", draw: () => nodeAt(32, 32, 4.4, "l-fill-sage") + [[10, 12], [80, 14], [150, 12], [215, 15], [300, 11]].map(([deg, r]) => nodeAt(pt(32, 32, r, (deg * Math.PI) / 180)[0], pt(32, 32, r, (deg * Math.PI) / 180)[1], 3)).join("") },
      { vname: "Comet Passage", concept: "Arrival with momentum intact.", spec: "Head with tapering trail arcs.", draw: () => nodeAt(46, 22, 5, "l-fill-sage") + arc(30, 36, 16, Math.PI * 0.9, Math.PI * 1.5, "l-ink", 2.8) + arc(30, 36, 22, Math.PI * 0.95, Math.PI * 1.4, "l-faint", 2) },
      { vname: "Quarter Ring Node", concept: "A quarter turn, owned completely.", spec: "Thick 90-degree ring segment plus node.", draw: () => arc(28, 36, 16, Math.PI, Math.PI * 1.5, "l-ink", 5) + nodeAt(28, 20, 4.4, "l-fill-sage") + nodeAt(44, 36, 4.4, "l-fill-ink") },
      { vname: "Offset Twin Rings", concept: "Alignment is optional; overlap is not.", spec: "Two rings slightly off-center overlapping.", draw: () => circ(26, 32, 14, "l-ink", 3.2) + circ(40, 32, 14, "l-sage", 3.2) },
      { vname: "Closest Approach", concept: "The moment of nearest passing.", spec: "Satellite at perigee emphasized.", draw: () => ell(32, 32, 19, 11, "l-faint", 1.8) + nodeAt(32, 32, 4, "l-fill-ink") + nodeAt(51, 32, 5, "l-fill-sage") },
      { vname: "Farthest Point", concept: "Distance measured, patience kept.", spec: "Satellite at apogee with ghost position.", draw: () => ell(32, 32, 19, 11, "l-faint", 1.8) + nodeAt(13, 32, 3, "l-fill-dim") + nodeAt(32, 32, 4, "l-fill-ink") + nodeAt(51, 32, 5, "l-fill-sage") },
      { vname: "Spin Marks", concept: "Motion implied by honest dashes.", spec: "Arc with tangential motion dashes.", draw: () => arc(30, 34, 16, Math.PI * 0.75, Math.PI * 1.85, "l-ink", 3.4) + line(12, 16, 17, 19, "l-dim", 2.4) + line(8, 24, 13, 26, "l-dim", 2.2) },
      { vname: "Intersect Lens Rings", concept: "Where two orbits agree.", spec: "Overlapping rings with lens node.", draw: () => circ(24, 32, 13, "l-ink", 3.2) + circ(40, 32, 13, "l-sage", 3.2) + nodeAt(32, 32, 3.6, "l-fill-ink") },
      { vname: "Orbital Ladder", concept: "Altitude taken one ring at a time.", spec: "Three nested arcs stepping outward.", draw: () => arc(32, 44, 10, -Math.PI * 0.78, -Math.PI * 0.22, "l-faint", 2.4) + arc(32, 44, 16, -Math.PI * 0.74, -Math.PI * 0.26, "l-dim", 2.8) + arc(32, 44, 22, -Math.PI * 0.7, -Math.PI * 0.3, "l-ink", 3.2) + nodeAt(32, 44, 4, "l-fill-sage") },
    ],
  },
  {
    id: "solid-initials",
    name: "Solid Initials",
    seed: 2113,
    variants: [
      { vname: "O Solid Counter", concept: "The O at full weight, light in the middle.", spec: "Thick filled O with paper counter dot.", draw: () => circ(32, 32, 17, "l-fill-ink") + dot(32, 32, 7.5, "l-fill-paper") },
      { vname: "A Solid Peak", concept: "The mountain that means A.", spec: "Filled triangle with paper counter and notch crossbar.", draw: () => poly([[32, 12], [52, 52], [12, 52]], "l-fill-ink") + poly([[32, 26], [41, 46], [23, 46]], "l-fill-paper") + rectR(24, 38, 16, 4, 2, "l-fill-paper") },
      { vname: "Omega Solid Slit", concept: "The word as one heavy mass, opened once.", spec: "Filled omega silhouette with paper slit.", draw: () => path("M24 46 V40 Q15 37 15 27 Q15 14 32 14 Q49 14 49 27 Q49 37 40 40 V46 H33 V39 H31 V46 Z", "l-fill-ink") + line(32, 14, 32, 24, "l-paper", 3) },
      { vname: "Fused OA Ligament", concept: "Two letters sharing one leg — the partnership.", spec: "O ring whose right wall carries the A.", draw: () => circ(23, 36, 13, "l-ink", 5) + path("M36 50 L47 20 L58 50", "l-sage", 4.4) + line(40.5, 40, 53.5, 40, "l-sage", 3) },
      { vname: "O Stadium Void", concept: "The pill containing its own absence.", spec: "Solid stadium with paper O window.", draw: () => rectR(10, 18, 44, 28, 14, "l-fill-sage") + circ(32, 32, 8, "l-fill-paper") },
      { vname: "Snowcap Peak", concept: "The summit kept white.", spec: "Filled A-mountain with paper apex cap.", draw: () => poly([[32, 12], [54, 52], [10, 52]], "l-fill-ink") + poly([[32, 12], [41, 30], [36, 34], [32, 28], [28, 34], [23, 30]], "l-fill-paper") },
      { vname: "Double O Bond", concept: "Two rounds bound by shared weight.", spec: "OO ligature with touching walls.", draw: () => circ(22, 32, 11, "l-ink", 5) + circ(42, 32, 11, "l-ink", 5) },
      { vname: "Architectural A Frame", concept: "Shelter built from one letter.", spec: "A-frame with paper door cut.", draw: () => poly([[32, 10], [56, 54], [8, 54]], "l-fill-ink") + rectR(27, 40, 10, 14, 2, "l-fill-paper") },
      { vname: "Bowl Omega Stem", concept: "The vessel that holds everything.", spec: "Omega bowl on a short stem foot.", draw: () => omegaArc(32, 30, 14, 55, "l-ink", 5, 6) + line(32, 45, 32, 54, "l-ink", 5) },
      { vname: "Broken Ring Satellite", concept: "The ring opened for a companion.", spec: "Thick O with a gap holding a sage satellite.", draw: () => raw(`<path d="M 33.5 16.6 A 16 16 0 1 0 39.4 17.5" fill="none" class="l-ink" style="stroke-width:7"/>`) + nodeAt(32, 14, 4.4, "l-fill-sage") },
      { vname: "Crossbar Arrow A", concept: "The A aiming somewhere.", spec: "A with crossbar extended to arrowhead.", draw: () => path("M28 50 L40 18 L52 50", "l-ink", 4) + line(33, 39, 58, 39, "l-sage", 3.4) + poly([[58, 34.5], [56, 39], [58, 43.5]], "l-fill-sage") },
      { vname: "Keyhole O", concept: "The round door and what unlocks it.", spec: "Thick O with keyhole counter.", draw: () => circ(32, 32, 17, "l-fill-ink") + dot(32, 29, 5, "l-fill-paper") + poly([[28, 31], [36, 31], [34.5, 42], [29.5, 42]], "l-fill-paper") },
      { vname: "Stamped OA Small", concept: "Official, but modest about it.", spec: "Rough stamp frame around solid OA.", draw: () => raw(`<rect class="l-ink" x="10" y="18" width="44" height="28" rx="7" style="fill:none;stroke-width:2.6;stroke-dasharray:5 4"/>`) + circ(25, 32, 5, "l-fill-ink") + path("M38 39 L43.5 25 L49 39", "l-sage", 3) + line(40.1, 35, 46.9, 35, "l-sage", 2.2) },
      { vname: "Serif Feet Omega", concept: "Classical weight for an old idea.", spec: "Heavy omega with block serif feet.", draw: () => omegaArc(32, 32, 14, 55, "l-ink", 4.6, 5) + rectR(11, 42, 9, 5, 1.5, "l-fill-ink") + rectR(44, 42, 9, 5, 1.5, "l-fill-ink") },
      { vname: "Eclipsed O", concept: "Partly seen is still itself.", spec: "Solid O partially covered by sage disc.", draw: () => circ(28, 32, 15, "l-fill-ink") + dot(28, 32, 6.5, "l-fill-paper") + `<circle cx="44" cy="32" r="13" fill="var(--accent)" opacity="0.55" stroke="none"/>` },
      { vname: "Ladder A", concept: "Every rung a step toward the apex.", spec: "A frame with three sage rungs.", draw: () => path("M20 52 L32 12 L44 52", "l-ink", 4) + [24, 34, 44].map((y, i) => { const t = (52 - y) / 40; const half = 12 * t; return line(32 - half, y, 32 + half, y, "l-sage", i === 1 ? 3.4 : 2.8); }).join("") },
      { vname: "Slotted O", concept: "One clean aperture in the ring wall.", spec: "Thick O with vertical slot cut.", draw: () => circ(32, 32, 16, "l-ink", 7) + line(32, 12, 32, 22, "l-paper", 3.6) },
      { vname: "Ribbon Omega II", concept: "The word with flourish to spare.", spec: "Omega with sweeping ribbon tail.", draw: () => omegaArc(28, 32, 13, 55, "l-ink", 4, 5) + path("M40 40 C50 40 53 32 50 24", "l-sage", 3.4) },
      { vname: "Monogram OA Tile Cut", concept: "Both initials sharing one tile of light.", spec: "Tile with OA cut in paper.", draw: () => tile() + circ(24, 32, 5.5, "l-paper", 3) + path("M37 40 L43 24 L49 40", "l-paper", 3) + line(39.3, 35.5, 46.7, 35.5, "l-paper", 2.4) },
      { vname: "Target Rings Bold", concept: "On target, always.", spec: "Concentric solid rings with sage center.", draw: () => circ(32, 32, 18, "l-ink", 5) + circ(32, 32, 10, "l-sage", 4.5) + nodeAt(32, 32, 3.6, "l-fill-ink") },
    ],
  },
  {
    id: "shield-crests",
    name: "Shield Crests",
    seed: 2114,
    variants: [
      { vname: "Shield Core Dot", concept: "Protection centered on one idea.", spec: "Bold shield with solid center dot.", draw: () => path("M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z", "l-ink", 3.2) + nodeAt(32, 32, 5, "l-fill-sage") },
      { vname: "Shield Chevron Heavy", concept: "The rank insignia, earned.", spec: "Shield with bold inner chevron.", draw: () => path("M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z", "l-ink", 3.2) + path("M20 30 L32 42 L44 30", "l-sage", 4) },
      { vname: "Halved Crest Field", concept: "Two houses, one crest.", spec: "Shield split sage over outline.", draw: () => path("M13 11 H32 V56 Q13 49 13 33 Z", "l-fill-sage") + raw(`<path d="M13 11 H51 V33 Q51 49 32 56 V11" fill="none" class="l-ink" style="stroke-width:3"/>`) },
      { vname: "Hex Crest Chevron", concept: "The badge hexagon given rank.", spec: "Hexagon shield with chevron inside.", draw: () => poly(reg(32, 33, 19, 6), "l-ink", 3.2) + path("M21 30 L32 41 L43 30", "l-sage", 3.6) },
      { vname: "Verified Roundel", concept: "Checked, sealed, done.", spec: "Circle badge with bold checkmark.", draw: () => circ(32, 32, 19, "l-ink", 3.2) + path("M21 33 L29 41 L45 23", "l-sage", 4) },
      { vname: "Diagonal Band Crest", concept: "Division of honor across the field.", spec: "Shield with diagonal sage band.", draw: () => raw(`<path d="M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z" fill="none" class="l-ink" style="stroke-width:3"/>`) + poly([[13, 20], [24, 11], [36, 11], [13, 34]], "l-fill-sage") },
      { vname: "Rosette Award", concept: "Recognition rendered as petals.", spec: "Eight petal circles around bold core.", draw: () => reg(32, 32, 12, 8).map(([x, y], i) => circ(x, y, 5, i % 2 ? "l-dim" : "l-ink", 2)).join("") + nodeAt(32, 32, 5.5, "l-fill-sage") },
      { vname: "Medal Ribbon Bold", concept: "First place, worn plainly.", spec: "V ribbon under hanging disc with spark.", draw: () => poly([[21, 8], [32, 26], [43, 8]], "l-sage", 3) + circ(32, 38, 11, "l-ink", 3) + spark4(32, 38, 5, 1.8) },
      { vname: "Bannered Shield", concept: "Achievement with its name carried below.", spec: "Small shield above a notched banner.", draw: () => path("M20 10 H44 V26 Q44 36 32 41 Q20 36 20 26 Z", "l-ink", 2.8) + nodeAt(32, 25, 3.4, "l-fill-sage") + poly([[14, 46], [50, 46], [50, 57], [32, 51], [14, 57]], "l-fill-ink") },
      { vname: "Keyhole Crest", concept: "Access controlled, elegantly.", spec: "Shield with keyhole void.", draw: () => path("M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z", "l-fill-ink") + dot(32, 27, 5.5, "l-fill-paper") + poly([[27.5, 30], [36.5, 30], [34.5, 44], [29.5, 44]], "l-fill-paper") },
      { vname: "Tower Keep", concept: "Standing watch over the workspace.", spec: "Tower silhouette in shield frame.", draw: () => raw(`<path d="M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z" fill="none" class="l-ink" style="stroke-width:3"/>`) + rectR(25, 20, 14, 26, 2, "l-fill-sage") + rectR(22, 15, 20, 7, 2, "l-fill-sage") },
      { vname: "Laurel Flanks", concept: "Honor framed by growth.", spec: "Two branch arcs flanking a core.", draw: () => arc(32, 34, 20, Math.PI * 0.62, Math.PI * 1.28, "l-dim", 2.6) + arc(32, 34, 20, -Math.PI * 0.28, Math.PI * 0.38, "l-dim", 2.6) + [[13, 26], [51, 26]].map(([x]) => [0, 1, 2].map((k) => dot(x + (x < 32 ? k * 3 : -k * 3), 26 + k * 7, 2.2, "l-fill-sage")).join("")).join("") + spark4(32, 34, 7, 2.6) },
      { vname: "Engraved Plaque", concept: "Permanence mounted properly.", spec: "Plaque plate with engraving rules and screws.", draw: () => rectR(10, 16, 44, 32, 6, "l-ink", 3) + nodeAt(16, 22, 2, "l-fill-dim") + nodeAt(48, 22, 2, "l-fill-dim") + nodeAt(16, 42, 2, "l-fill-dim") + nodeAt(48, 42, 2, "l-fill-dim") + line(20, 32, 44, 32, "l-sage", 3) },
      { vname: "Reeded Rim Coin", concept: "Value you can feel at the edge.", spec: "Coin with reeded rim and emblem core.", draw: () => circ(32, 32, 19, "l-ink", 3.2) + Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return line(pt(32, 32, 16, a)[0], pt(32, 32, 16, a)[1], pt(32, 32, 19, a)[0], pt(32, 32, 19, a)[1], "l-faint", 1.4); }).join("") + nodeAt(32, 32, 4.4, "l-fill-sage") },
      { vname: "Portcullis Gate", concept: "Open by design, closed on purpose.", spec: "Arched gate grid in frame.", draw: () => raw(`<path d="M12 54 V28 Q12 10 32 10 Q52 10 52 28 V54" fill="none" class="l-ink" style="stroke-width:3"/>`) + line(24, 22, 24, 54, "l-ink", 2.6) + line(40, 22, 40, 54, "l-ink", 2.6) + line(32, 16, 32, 54, "l-sage", 2.6) },
      { vname: "Pennant Standard", concept: "A flag worth following.", spec: "Pennant flag on pole with base.", draw: () => line(20, 8, 20, 54, "l-ink", 3.2) + line(14, 54, 26, 54, "l-ink", 2.8) + poly([[20, 10], [50, 18], [20, 26]], "l-fill-sage") },
      { vname: "Wreath Omega Crest", concept: "The word, honored.", spec: "Laurel arcs cradling small omega.", draw: () => arc(32, 36, 19, Math.PI * 0.65, Math.PI * 1.3, "l-dim", 2.6) + arc(32, 36, 19, -Math.PI * 0.3, Math.PI * 0.35, "l-dim", 2.6) + omegaArc(32, 34, 9.5, 58, "l-ink", 2.8, 3.5) },
      { vname: "Star Field Shield", concept: "Excellence cut into the record.", spec: "Shield with star void.", draw: () => path("M13 11 H51 V33 Q51 49 32 56 Q13 49 13 33 Z", "l-fill-ink") + poly(starPts(32, 30, 9, 3.6, 5), "l-fill-paper") },
      { vname: "Keystone Arch", concept: "One piece holds it all together.", spec: "Archway with keystone accent block.", draw: () => raw(`<path d="M14 54 V30 Q14 12 32 12 Q50 12 50 30 V54" fill="none" class="l-ink" style="stroke-width:3.4"/>`) + rectR(27, 8, 10, 9, 2, "l-fill-sage") },
      { vname: "Wax Seal Press", concept: "Pressed by hand, meant to last.", spec: "Blob disc with emboss ring and core.", draw: () => path("M32 11 C43 10 53 19 52 31 C51 44 43 53 31 52 C19 51 10 43 12 30 C13.5 19 21 12 32 11 Z", "l-fill-ink") + circ(32, 32, 10.5, "l-paper", 2) + nodeAt(32, 32, 3.4, "l-fill-sage") },
    ],
  },
  {
    id: "monogram-tiles",
    name: "Monogram Tiles",
    seed: 2115,
    variants: [
      { vname: "Omega Tile II", concept: "Your pick, refined proportions.", spec: "Sage squircle, balanced paper omega.", draw: () => tile() + omegaArc(32, 34, 12, 56, "l-paper", 3.2, 4.5) },
      { vname: "Ink Omega Tile", concept: "The dark variant of the same idea.", spec: "Ink squircle, paper heavy omega.", draw: () => tile("l-fill-ink") + omegaArc(32, 34, 12, 56, "l-paper", 4, 5) },
      { vname: "Split OA Tile", concept: "One tile, two initials, fair halves.", spec: "Diagonal split tile, paper O and A divided.", draw: () => poly([[6, 6], [58, 6], [58, 58]], "l-fill-sage") + poly([[6, 6], [58, 58], [6, 58]], "l-fill-ink") + circ(22, 24, 6, "l-paper", 3) + path("M38 46 L44 30 L50 46", "l-paper", 3) + line(40.2, 41.5, 47.8, 41.5, "l-paper", 2.4) },
      { vname: "Tailed Omega Tile", concept: "The prompt living inside the letter.", spec: "Tile with omega plus cursor tail.", draw: () => tile("l-fill-ink") + omegaArc(29, 34, 11, 56, "l-paper", 3.2, 4) + line(41, 43, 51, 43, "l-sage", 3.4) },
      { vname: "Outlined Omega Tile", concept: "For light surfaces, quietly.", spec: "Outlined squircle, sage omega inside.", draw: () => rectR(8, 8, 48, 48, 14, "l-ink", 2.8) + omegaArc(32, 34, 12, 56, "l-sage", 3.2, 4.5) },
      { vname: "Corner Omega Tile", concept: "Signed from the corner.", spec: "Tile with tucked omega and accent dot.", draw: () => tile() + omegaArc(26, 27, 9, 56, "l-paper", 2.8, 3.5) + dot(44, 45, 4, "l-fill-paper") },
      { vname: "Layered Duo Omega", concept: "Frontmost among many sessions.", spec: "Offset tiles with omega on front face.", draw: () => rectR(14, 14, 44, 44, 13, "l-fill-sage") + rectR(8, 8, 42, 42, 12, "l-fill-ink") + omegaArc(29, 30, 8.5, 58, "l-paper", 2.8, 3.5) },
      { vname: "Ring Omega Tile", concept: "The letter attended by its orbit.", spec: "Tile, paper ring, omega within.", draw: () => tile() + circ(32, 32, 16, "l-paper", 2.8) + omegaArc(32, 33, 9, 58, "l-paper", 3, 3.5) },
      { vname: "Ascent Omega Tile", concept: "Climbing to the letter.", spec: "Stairs rising to omega summit on tile.", draw: () => tile("l-fill-ink") + paperFill("M12 52 H22 V42 H32 V32 H42 V22 H52 V52 Z") + omegaArc(42, 15, 5.5, 60, "l-paper", 2.4, 2.5) },
      { vname: "Network Omega Tile", concept: "The mesh with a mind at center.", spec: "Tile with mini mesh converging on omega.", draw: () => tile() + [[16, 16], [48, 16], [16, 48], [48, 48]].map(([x, y]) => line(x, y, 32, 32, "l-paper", 2.2)).join("") + omegaArc(32, 33, 8, 60, "l-paper", 2.8, 3) },
      { vname: "Hex Omega Tile", concept: "Badge geometry meets the word.", spec: "Hexagonal tile face with paper omega.", draw: () => poly(reg(32, 32, 25, 6), "l-fill-sage") + omegaArc(32, 34, 12, 56, "l-paper", 3.2, 4.5) },
      { vname: "Spanned Omega Split", concept: "The letter crossing every boundary.", spec: "Split tile with omega spanning both fields.", draw: () => rectR(6, 6, 52, 52, 14, "l-fill-sage") + `<rect x="32" y="6" width="26" height="52" rx="14" fill="var(--text)" stroke="none"/>` + omegaArc(32, 34, 12, 56, "l-paper", 3.2, 4.5) },
      { vname: "Slot Omega Tile", concept: "Paired with its slot of light.", spec: "Tile with vertical slot beside omega.", draw: () => tile("l-fill-ink") + rectR(14, 16, 6, 32, 3, "l-fill-paper") + omegaArc(41, 34, 10, 56, "l-paper", 2.8, 3.5) },
      { vname: "Vitals Omega Tile", concept: "Alive, and saying so.", spec: "Pulse channel under omega on tile.", draw: () => tile() + omegaArc(32, 27, 10, 56, "l-paper", 3, 4) + path("M14 47 H24 L28 40 L33 52 L37 47 H50", "l-paper", 3) },
      { vname: "Quarter Round Omega", concept: "Only part of the tile needed.", spec: "Quarter-round tile face with paper omega.", draw: () => path("M6 58 V22 A36 36 0 0 1 42 58 Z", "l-fill-sage") + omegaArc(28, 38, 10, 56, "l-paper", 3, 4) },
      { vname: "Double Frame Omega", concept: "Framed twice for ceremony.", spec: "Nested outline tiles holding omega.", draw: () => rectR(6, 6, 52, 52, 14, "l-ink", 2.6) + rectR(13, 13, 38, 38, 10, "l-sage", 2.2) + omegaArc(32, 34, 9.5, 56, "l-ink", 2.8, 3.5) },
      { vname: "Eclipse Omega Tile", concept: "Something vast behind the word.", spec: "Tile with eclipse disc and peeking omega.", draw: () => tile("l-fill-ink") + `<circle cx="24" cy="30" r="12" fill="var(--bg-elev)" stroke="none"/>` + omegaArc(40, 36, 10, 56, "l-sage", 3, 4) },
      { vname: "Tide Omega Tile", concept: "The word steady above the current.", spec: "Wave base with omega riding on tile.", draw: () => tile() + path("M12 44 Q19 37 26 44 T40 44 T54 44", "l-paper", 3.4) + omegaArc(32, 30, 10, 56, "l-paper", 3, 4) },
      { vname: "Terrace Summit Omega", concept: "Progress crowned with meaning.", spec: "Terrace bars with omega at the top.", draw: () => tile("l-fill-ink") + paperFill("M14 52 H24 V44 H34 V36 H44 V52 Z") + omegaArc(34, 26, 7, 60, "l-paper", 2.6, 3) },
      { vname: "Broadcast Omega Tile", concept: "Sending the word outward.", spec: "Omega source with rising arcs on tile.", draw: () => tile() + omegaArc(32, 44, 10, 56, "l-paper", 3, 4) + arc(32, 26, 7, -Math.PI * 0.75, -Math.PI * 0.25, "l-paper", 2.6) + arc(32, 26, 13, -Math.PI * 0.72, -Math.PI * 0.28, "l-paper", 2.4) },
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

if (LOGOS.length !== 300) throw new Error(`Expected 300 logos, got ${LOGOS.length}`);
const ids = new Set(LOGOS.map((l) => l.id));
if (ids.size !== 300) throw new Error(`Duplicate ids: ${ids.size}`);
const svgSet = new Set(LOGOS.map((l) => l.svg));
if (svgSet.size !== 300) throw new Error(`Duplicate SVGs: ${300 - svgSet.size}`);
const famCounts = FAMILIES.map((fam) => ({ id: fam.id, name: fam.name, count: fam.variants.length }));
famCounts.forEach((fc) => {
  if (fc.count !== 20) throw new Error(`Family ${fc.id} has ${fc.count} variants`);
});

const header = `// AUTO-GENERATED by generate-logos.mjs — do not edit by hand.
// 300 DISTINCT brand-grade OmniAgent logo marks, iteration 2.
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
