// Procedural generator for the OmniAgent brand-logo study, iteration 3.
// Produces design/logos/logos.js: 300 DISTINCT marks distilled from the
// iteration-2 shortlist — circuit hexes, honeycombs, and omegas above all,
// supported by code glyphs, hub pads, resistors, and crossed planes.
// Craft rules: hexagonal circuit geometry as the container language, the
// omega as the hero letterform, solid fills first, disciplined two-tone
// ink/sage, contained compositions, icon-scale spacing.

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
  `<ellipse class="${cls}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${rot ? ` transform="rotate(${rot} ${f(cx)} ${f(cy)})"` : ""} style="fill:none;stroke-width:${sw}"/>`;
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

const hexStroke = (cx, cy, r, cls = "l-ink", w = 2.8) => poly(reg(cx, cy, r, 6), cls, w);
const hexFill = (cx, cy, r, cls = "l-fill-sage") => poly(reg(cx, cy, r, 6), cls);

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

const gt = (x, y, s, cls = "l-ink", sw = 3) =>
  path(`M${f(x)} ${f(y - s)} L${f(x + s * 0.85)} ${f(y)} L${f(x)} ${f(y + s)}`, cls, sw);
const cursorBar = (x, y, len, cls = "l-sage", sw = 3) => line(x, y, x + len, y, cls, sw);

const spark4 = (cx, cy, ro, ri, cls = "l-fill-sage") => poly(starPts(cx, cy, ro, ri, 4), cls);

function nodeAt(x, y, r = 3.2, cls = "l-fill-ink") {
  return dot(x, y, r, cls);
}
function link(x1, y1, x2, y2, w = 1.8, cls = "l-dim") {
  return line(x1, y1, x2, y2, cls, w);
}

const bgCircle = (cx, cy, r) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="var(--bg-elev)" stroke="none"/>`;
const paperFill = (d) => `<path class="l-fill-paper" d="${d}"/>`;
const strokeOnly = (d, cls = "l-ink", w = 3) => `<path d="${d}" fill="none" class="${cls}" style="stroke-width:${w}"/>`;

const FAMILIES = [
  {
    id: "hex-core",
    name: "Hex Core Badges",
    seed: 3101,
    variants: [
      { vname: "Circuit Pad Hex III", concept: "Your favorite, distilled to essentials.", spec: "Bold hexagon, solid center pad.", draw: () => hexStroke(32, 32, 20) + nodeAt(32, 32, 4.6, "l-fill-sage") },
      { vname: "Single Feed Hex", concept: "One trace feeding the core.", spec: "Hex with a single top feed and pad.", draw: () => hexStroke(32, 34, 18) + line(32, 8, 32, 16, "l-dim", 2.6) + nodeAt(32, 34, 4.4, "l-fill-sage") },
      { vname: "Tri Trace Hex II", concept: "Circuit Hex II at full authority.", spec: "Three traces from alternating vertices to pad.", draw: () => hexStroke(32, 32, 20) + [0, 2, 4].map((i) => { const [x, y] = reg(32, 32, 20, 6)[i]; const [ix, iy] = reg(32, 32, 7.5, 6)[i]; return line(x, y, ix, iy, "l-dim", 2.2); }).join("") + nodeAt(32, 32, 5, "l-fill-sage") },
      { vname: "Quad Trace Hex", concept: "Four ways in, one way out.", spec: "Cardinal traces converging on the pad.", draw: () => hexStroke(32, 32, 19) + [[32, 9, 32, 17], [32, 47, 32, 55], [9, 32, 17, 32], [47, 32, 55, 32]].map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, "l-dim", 2.2)).join("") + nodeAt(32, 32, 4.6, "l-fill-sage") },
      { vname: "Ring Bore Hex", concept: "A bore you can see through.", spec: "Hexagon ring around small circle.", draw: () => hexStroke(32, 32, 20) + circ(32, 32, 6.5, "l-sage", 3) },
      { vname: "Drilled Nut", concept: "The nut, drilled clean.", spec: "Heavy hex wall, round bore.", draw: () => poly(reg(32, 32, 20, 6), "l-ink", 5) + circ(32, 32, 8, "l-sage", 3) },
      { vname: "Triad Cell Hex", concept: "Three points of presence.", spec: "Hex containing a triangle of dots.", draw: () => hexStroke(32, 33, 19) + reg(32, 33, 9, 3).map(([x, y], i) => nodeAt(x, y, i === 0 ? 3.8 : 3, i === 0 ? "l-fill-sage" : "l-fill-ink")).join("") },
      { vname: "Crosshair Cell", concept: "Aimed precisely at the center.", spec: "Crosshair lines through center dot.", draw: () => hexStroke(32, 32, 19) + line(32, 15, 32, 49, "l-dim", 2) + line(15, 32, 49, 32, "l-dim", 2) + nodeAt(32, 32, 4, "l-fill-sage") },
      { vname: "Vertex Pads Hex", concept: "Contacts waiting at the corners.", spec: "Pads seated on alternate vertices.", draw: () => hexStroke(32, 32, 19) + [0, 2, 4].map((i) => { const [x, y] = reg(32, 32, 19, 6)[i]; return nodeAt(x, y, 3.2, "l-fill-sage"); }).join("") },
      { vname: "Echo Wall Hex", concept: "The badge doubled inward.", spec: "Hex outline plus inner offset echo.", draw: () => hexStroke(32, 32, 20) + hexStroke(32, 32, 13, "l-dim", 1.8) },
      { vname: "Stemmed Hex", concept: "Mounted on its own stem.", spec: "Hex with descending stem and foot pad.", draw: () => hexStroke(32, 26, 16) + line(32, 42, 32, 52, "l-ink", 3) + nodeAt(32, 54.5, 3, "l-fill-sage") },
      { vname: "Twin Pin Hex", concept: "Two leads ready to connect.", spec: "Pair of pins rising from the crown.", draw: () => hexStroke(32, 38, 16) + line(26, 14, 26, 22, "l-dim", 2.6) + line(38, 14, 38, 22, "l-dim", 2.6) + nodeAt(32, 38, 3.6, "l-fill-sage") },
      { vname: "Notched Crown Hex", concept: "Keyed so it only fits one way.", spec: "Hex ring with a triangular notch at the crown.", draw: () => { const pts = reg(32, 34, 18, 6); return poly(pts, "l-ink", 3) + poly([[26, 8], [38, 8], [32, 17]], "l-fill-paper"); } },
      { vname: "Riveted Hex Plate", concept: "Fastened at four corners.", spec: "Plate hex with four rivet dots.", draw: () => hexFill(32, 32, 20, "l-fill-ink") + reg(32, 32, 12, 4).map(([x, y]) => nodeAt(x, y, 2.2, "l-fill-paper")).join("") + nodeAt(32, 32, 3.4, "l-fill-sage") },
      { vname: "Haloed Hex", concept: "Presence announced twice.", spec: "Solid halo echo behind bold hex.", draw: () => hexStroke(32, 32, 23, "l-faint", 2) + hexStroke(32, 32, 17) + nodeAt(32, 32, 4, "l-fill-sage") },
      { vname: "Keystone Cell", concept: "The piece that locks the arch.", spec: "Wedge keystone seated in hex crown.", draw: () => hexStroke(32, 34, 18) + poly([[27, 10], [37, 10], [35, 17], [29, 17]], "l-fill-sage") },
      { vname: "Bolt Circle Hex", concept: "Patterned like a flange face.", spec: "Ring of bolt holes around center pad.", draw: () => hexStroke(32, 32, 20) + reg(32, 32, 11, 6).map(([x, y]) => nodeAt(x, y, 2, "l-fill-dim")).join("") + nodeAt(32, 32, 4, "l-fill-sage") },
      { vname: "Spined Hex Column", concept: "One backbone through the cell.", spec: "Vertical spine with side ticks in hex.", draw: () => hexStroke(32, 32, 19) + line(32, 14, 32, 50, "l-ink", 3) + [[24, 24], [40, 32], [24, 40]].map(([x, y]) => line(x, y, 40 - (x - 32), y, "l-dim", 2)).join("") },
      { vname: "Anchored Cell", concept: "Grounded at the lowest point.", spec: "Hex with drop stub and ground tick.", draw: () => hexStroke(32, 28, 17) + line(32, 45, 32, 53, "l-ink", 3) + line(26, 55, 38, 55, "l-sage", 3) },
      { vname: "Radiating Cell", concept: "Energy measured from the middle.", spec: "Short rays fanning from center pad.", draw: () => hexStroke(32, 32, 20) + Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * TAU; return line(pt(32, 32, 6, a)[0], pt(32, 32, 6, a)[1], pt(32, 32, 11, a)[0], pt(32, 32, 11, a)[1], "l-faint", 1.8); }).join("") + nodeAt(32, 32, 4, "l-fill-sage") },
    ],
  },
  {
    id: "omega-hex",
    name: "Omega Hex Fusion",
    seed: 3102,
    variants: [
      { vname: "Omega Hex Badge", concept: "The flagship: the word in the cell.", spec: "Bold hexagon holding centered omega.", draw: () => hexStroke(32, 32, 21) + omegaArc(32, 33, 11, 56, "l-ink", 3.2, 4.5) },
      { vname: "Solid Hex Omega Cut", concept: "Carved from one piece.", spec: "Solid hex with paper omega cutout.", draw: () => hexFill(32, 32, 22) + paperFill("M25 43 V39 Q19 36.5 19 29 Q19 20 32 20 Q45 20 45 29 Q45 36.5 39 39 V43 H35 V37.5 H29 V43 Z") },
      { vname: "Omega Hex Wired", concept: "The letter wired for power.", spec: "Hex omega with traces from base vertices.", draw: () => hexStroke(32, 31, 18) + omegaArc(32, 32, 9.5, 56, "l-ink", 3, 4) + line(18, 44, 14, 52, "l-dim", 2.2) + line(46, 44, 50, 52, "l-dim", 2.2) + nodeAt(13, 54, 2.6, "l-fill-sage") + nodeAt(51, 54, 2.6, "l-fill-sage") },
      { vname: "Omega In The Nut", concept: "Softness inside the heaviest shell.", spec: "Ultra-thick hex ring, omega in bore.", draw: () => poly(reg(32, 32, 21, 6), "l-ink", 6) + omegaArc(32, 32.5, 8.5, 58, "l-sage", 2.8, 3.5) },
      { vname: "Hive Omega Center", concept: "The honored cell of the hive.", spec: "Filled center cell, flanking outline cells.", draw: () => hexStroke(10, 32, 10.5, "l-faint", 2) + hexStroke(54, 32, 10.5, "l-faint", 2) + hexFill(32, 32, 13) + paperFill("M28.5 39 V36 Q25 34.5 25 30 Q25 25 32 25 Q39 25 39 30 Q39 34.5 35.5 36 V39 H33 V35 H31 V39 Z") },
      { vname: "Crowned Omega Hex", concept: "Attendance from above.", spec: "Node hovering over hex omega.", draw: () => hexStroke(32, 35, 18) + omegaArc(32, 36, 9.5, 56, "l-ink", 3, 4) + nodeAt(32, 10, 3.4, "l-fill-sage") + line(32, 13.5, 32, 17, "l-dim", 2) },
      { vname: "Divided Cell Omega", concept: "Two halves, one word spanning them.", spec: "Split-tone hex, omega crossing the seam.", draw: () => path("M32 12 L51 23 L51 43 L32 54 Z", "l-fill-sage") + path("M32 12 L13 23 L13 43 L32 54 Z", "l-fill-ink") + omegaArc(32, 33, 10, 56, "l-paper", 3, 4) },
      { vname: "Pedestal Omega Hex", concept: "Given somewhere to stand.", spec: "Omega on an inner baseline within hex.", draw: () => hexStroke(32, 31, 19) + omegaArc(32, 30, 9.5, 56, "l-ink", 3, 4) + line(20, 42, 44, 42, "l-sage", 3) },
      { vname: "Spanning Omega Cells", concept: "One word across two houses.", spec: "Twin cells sharing an omega across.", draw: () => hexStroke(18, 32, 12, "l-dim", 2.6) + hexStroke(46, 32, 12, "l-dim", 2.6) + omegaArc(32, 33, 10, 56, "l-ink", 3.2, 4.5) },
      { vname: "Bore Word Hex", concept: "Set into the thickest wall.", spec: "Hex donut with small omega floating in band.", draw: () => poly(reg(32, 32, 21, 6), "l-ink", 5) + circ(32, 32, 10, "l-sage", 2.8) + omegaArc(32, 32.5, 6, 60, "l-ink", 2.2, 2.5) },
      { vname: "Vertex Tied Omega", concept: "Held by the corners that matter.", spec: "Ties running from omega feet to vertices.", draw: () => hexStroke(32, 32, 19) + omegaArc(32, 31, 9.5, 56, "l-ink", 3, 4) + line(24, 39, 18, 46, "l-dim", 2) + line(40, 39, 46, 46, "l-dim", 2) },
      { vname: "Rounded Hex Omega Slab", concept: "Softer walls, same word.", spec: "Rounded-corner hex slab, paper omega.", draw: () => raw(`<path class="l-fill-ink" d="M32 10 L50.5 21 L50.5 43 L32 54 L13.5 43 L13.5 21 Z" stroke="none"/>`) + omegaArc(32, 33, 10, 56, "l-paper", 3.2, 4.5) },
      { vname: "Lattice Corner Omega", concept: "Positioned within the array.", spec: "Corner lattice dots framing omega in hex.", draw: () => hexStroke(32, 32, 20) + [[15, 15], [49, 15], [15, 49], [49, 49]].map(([x, y]) => nodeAt(x, y, 2, "l-fill-dim")).join("") + omegaArc(32, 32, 9.5, 56, "l-ink", 3, 4) },
      { vname: "Low Slung Omega Hex", concept: "Weight where the work is.", spec: "Omega dipping below the hex base.", draw: () => hexStroke(32, 29, 17) + omegaArc(32, 34, 11, 56, "l-ink", 3.2, 4.5) + line(16, 50, 48, 50, "l-faint", 2) },
      { vname: "Stacked Cell Omega Pad", concept: "The word above; the contact below.", spec: "Two stacked cells: omega up, pad down.", draw: () => hexStroke(32, 18, 11) + omegaArc(32, 19, 6, 60, "l-ink", 2.6, 3) + hexFill(32, 45, 11, "l-fill-sage") + nodeAt(32, 45, 3, "l-fill-paper") },
      { vname: "Diadem Omega Cell", concept: "A small crown for a quiet king.", spec: "Tiny hex diadem above the omega cell.", draw: () => hexStroke(32, 37, 15) + omegaArc(32, 38, 8.5, 58, "l-ink", 2.8, 3.5) + hexStroke(32, 13, 6, "l-sage", 2.4) },
      { vname: "Charged Omega Cell", concept: "Potential stored beside the word.", spec: "Hex omega with bolt tick companion.", draw: () => hexStroke(32, 32, 20) + omegaArc(28, 33, 10, 56, "l-ink", 3, 4) + path("M46 22 L41 32 H45 L41 42 L48 30 H44 Z", "l-fill-sage") },
      { vname: "Orbiting Omega Cell", concept: "The word attended by its moon.", spec: "Orbit ellipse crossing hex and omega.", draw: () => hexStroke(32, 32, 19) + omegaArc(32, 32, 9.5, 56, "l-ink", 3, 4) + ell(32, 32, 24, 8, "l-sage", 2.4) + nodeAt(pt(32, 32, 24, -0.5)[0], 32 + 8 * Math.sin(-0.5), 3, "l-fill-sage") },
      { vname: "Announcing Omega Cell", concept: "The broadcast starts here.", spec: "Signal arcs rising from hex omega.", draw: () => hexStroke(32, 38, 17) + omegaArc(32, 39, 9, 56, "l-ink", 3, 4) + arc(32, 18, 6, -Math.PI * 0.75, -Math.PI * 0.25, "l-sage", 2.6) + arc(32, 18, 11, -Math.PI * 0.72, -Math.PI * 0.28, "l-dim", 2.2) },
      { vname: "Gateword Hex", concept: "The word as the keystone of the gate.", spec: "Arch hex with omega keystone center.", draw: () => hexStroke(32, 32, 21) + line(20, 46, 20, 26, "l-dim", 2.6) + line(44, 46, 44, 26, "l-dim", 2.6) + omegaArc(32, 34, 8, 58, "l-sage", 2.8, 3.5) },
    ],
  },
  {
    id: "honeycomb-fields",
    name: "Honeycomb Fields",
    seed: 3103,
    variants: [
      { vname: "Honeycomb Trio III", concept: "Your pick: three cells, one filled.", spec: "Outline duo flanking a solid cell.", draw: () => hexStroke(18, 22, 11, "l-ink", 2.8) + hexStroke(46, 22, 11, "l-ink", 2.8) + hexFill(32, 42, 11) },
      { vname: "Ring Of Six Cells", concept: "A council of six around an empty seat.", spec: "Six cells arranged in a ring.", draw: () => reg(32, 32, 17, 6).map(([x, y], i) => hexStroke(x, y, 8.5, i === 0 ? "l-sage" : "l-ink", 2.4)).join("") },
      { vname: "Pyramid Patch", concept: "Built up row by row.", spec: "3-2-1 pyramid of filled cells.", draw: () => hexFill(14, 46, 9) + hexFill(32, 46, 9) + hexFill(50, 46, 9) + hexFill(23, 29, 9) + hexFill(41, 29, 9) + hexFill(32, 12, 9, "l-fill-sage") },
      { vname: "Bridged Twin Cells", concept: "Two rooms, one corridor.", spec: "Cells joined by a connecting trace.", draw: () => hexStroke(17, 32, 12) + hexStroke(47, 32, 12) + line(29, 32, 35, 32, "l-sage", 3.4) },
      { vname: "Cell Column Trio", concept: "Stacked storeys of the hive.", spec: "Vertical trio touching vertex to vertex.", draw: () => hexStroke(32, 10, 9, "l-faint", 2.2) + hexStroke(32, 27, 9, "l-ink", 2.8) + hexFill(32, 44, 9) },
      { vname: "Diamond Cell Four", concept: "Four cells pointing every way.", spec: "Diamond arrangement with sage tip.", draw: () => hexFill(32, 10, 8.5, "l-fill-sage") + hexStroke(51, 32, 8.5) + hexFill(32, 54, 8.5) + hexStroke(13, 32, 8.5) },
      { vname: "Great And Small Cells", concept: "Scale saying seniority.", spec: "Large outline hex with small solid satellite.", draw: () => hexStroke(26, 32, 17) + hexFill(50, 44, 8) },
      { vname: "Stepped Cell Chain", concept: "Connected corner to corner downhill.", spec: "Diagonal chain of three linked cells.", draw: () => hexStroke(12, 14, 8.5) + hexStroke(32, 32, 8.5) + hexFill(52, 50, 8.5) + link(18, 19, 26, 26, 2.2) + link(38, 37, 46, 44, 2.2) },
      { vname: "Outlined Court Hive", concept: "Six around a marked center court.", spec: "Ring of six with outlined center cell.", draw: () => reg(32, 32, 17, 6).map(([x, y]) => hexStroke(x, y, 8.5, "l-ink", 2.2)).join("") + hexStroke(32, 32, 8, "l-sage", 2.6) },
      { vname: "Overlap Twin Fills", concept: "Sharing territory gracefully.", spec: "Two solid cells overlapping mid-seam.", draw: () => hexFill(24, 32, 14, "l-fill-ink") + `<path d="M ${reg(41, 32, 14, 6).map((p) => p.map(f).join(",")).join(" L")} Z" fill="var(--accent)" opacity="0.85" stroke="none"/>` },
      { vname: "Arc Of Five Cells", concept: "A gallery curved around the work.", spec: "Five cells sweeping an arc.", draw: () => [-70, -35, 0, 35, 70].map((deg, i) => { const a = ((deg - 90) * Math.PI) / 180; const [x, y] = pt(32, 66, 40, a); return hexStroke(x, y, 7.5, i === 2 ? "l-sage" : "l-ink", 2.4); }).join("") },
      { vname: "Core Bore Cell", concept: "A cell within the cell.", spec: "Hex with inner filled hex core.", draw: () => hexStroke(32, 32, 19) + hexFill(32, 32, 9) },
      { vname: "Stagger Row Five", concept: "Rhythm read left to right.", spec: "Five small cells alternating fill.", draw: () => [8, 20, 32, 44, 56].map((x, i) => hexStroke(x, 32, 5.8, i % 2 ? "l-sage" : "l-ink", 2.2)).join("") },
      { vname: "Offset Twin Columns", concept: "Bricks offset for strength.", spec: "Two columns of cells at offset heights.", draw: () => hexStroke(20, 14, 8.5, "l-faint", 2.2) + hexFill(20, 31, 8.5) + hexStroke(20, 48, 8.5, "l-faint", 2.2) + hexFill(44, 22, 8.5) + hexStroke(44, 39, 8.5) + hexFill(44, 56, 8.5, "l-fill-sage") },
      { vname: "Scatter Constellation Cells", concept: "Wild hive, still ordered.", spec: "Five cells scattered with varied scale.", draw: () => hexStroke(14, 16, 7, "l-faint", 2) + hexFill(38, 12, 6) + hexStroke(52, 30, 9, "l-ink", 2.6) + hexFill(20, 44, 8) + hexStroke(42, 52, 6.5, "l-sage", 2.4) },
      { vname: "Vee Formation Cells", concept: "Flying in formation.", spec: "Three cells in a downward V.", draw: () => hexFill(12, 14, 8.5) + hexStroke(32, 40, 8.5) + hexFill(52, 14, 8.5) },
      { vname: "Scale Contrast Pair", concept: "Giant outline, tiny solid — hierarchy instant.", spec: "Huge faint hex with micro solid cell inside.", draw: () => hexStroke(32, 32, 24, "l-faint", 2) + hexFill(32, 32, 6.5) },
      { vname: "Ascending Cells", concept: "Steps built from structure.", spec: "Three cells climbing rightward.", draw: () => hexStroke(14, 48, 8.5) + hexFill(32, 32, 8.5) + hexStroke(50, 16, 8.5, "l-sage", 2.8) },
      { vname: "Arc Segment Quartet", concept: "Part of the ring, honestly.", spec: "Four cells tracing an arc segment.", draw: () => [-60, -20, 20, 60].map((deg) => { const a = ((deg + 90) * Math.PI) / 180; const [x, y] = pt(32, 74, 52, a); return hexStroke(x, y, 8, "l-ink", 2.4); }).join("") },
      { vname: "Full Flower Seven", concept: "The complete hive blossom.", spec: "Six outlined petal cells around a solid core.", draw: () => reg(32, 32, 15.5, 6).map(([x, y], i) => hexStroke(x, y, 7.5, i % 2 ? "l-dim" : "l-ink", 2.2)).join("") + hexFill(32, 32, 7) },
    ],
  },
  {
    id: "omega-solo",
    name: "Omega Solo Marks",
    seed: 3104,
    variants: [
      { vname: "Monoline Omega Fine", concept: "The letter whispered.", spec: "Hairline-weight elegant omega.", draw: () => omegaArc(32, 32, 16, 52, "l-ink", 2.2, 4) },
      { vname: "Omega Heavyweight", concept: "The letter shouted once.", spec: "Extra-bold omega with tight counter.", draw: () => omegaArc(32, 33, 16, 58, "l-ink", 7.5, 7) },
      { vname: "Omega Leaning Italic", concept: "Forward motion in a letterform.", spec: "Slanted heavy omega.", draw: () => raw(`<g transform="translate(32 32) skewX(-10) translate(-32 -32)">`) + omegaArc(32, 33, 13, 56, "l-ink", 4.4, 5) + raw(`</g>`) },
      { vname: "Wide Stance Omega", concept: "Taking up room on purpose.", spec: "Horizontally extended omega.", draw: () => { const cx = 32, cy = 29, rx = 21, ry = 13; const g = (55 * Math.PI) / 180; const ex = (a) => cx + rx * Math.cos(a); const ey = (a) => cy + ry * Math.sin(a); const aL = Math.PI / 2 + g, aR = Math.PI / 2 - g; return raw(`<path d="M ${f(ex(aL))} ${f(ey(aL))} A ${f(rx)} ${f(ry)} 0 1 0 ${f(ex(aR))} ${f(ey(aR))}" fill="none" class="l-ink" style="stroke-width:4.4"/>`) + line(ex(aL), ey(aL), ex(aL) + 6, ey(aL), "l-ink", 4.4) + line(ex(aR), ey(aR), ex(aR) - 6, ey(aR), "l-ink", 4.4); } },
      { vname: "Condensed Tall Omega", concept: "Upright and narrow.", spec: "Vertically stretched monoline omega.", draw: () => { const g = (55 * Math.PI) / 180; const [x0, y0] = pt(32, 26, 9, Math.PI / 2 + g); const [x1, y1] = pt(32, 26, 9, Math.PI / 2 - g); return arc(32, 26, 9, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3.6) + line(x0, y0, x0, y0 + 16, "l-ink", 3.6) + line(x1, y1, x1, y1 + 16, "l-ink", 3.6) + line(x0 - 3, y0 + 16, x0 + 3, y0 + 16, "l-ink", 3.2) + line(x1 - 3, y1 + 16, x1 + 3, y1 + 16, "l-ink", 3.2); } },
      { vname: "Open Arms Omega", concept: "Welcoming everything in.", spec: "Wide-gap light omega.", draw: () => omegaArc(32, 31, 15, 78, "l-ink", 3.2, 4.5) },
      { vname: "Near Closed Omega", concept: "Almost complete — deliberately.", spec: "Tight-slit heavy omega.", draw: () => omegaArc(32, 32, 16, 26, "l-ink", 4.6, 4) },
      { vname: "Slab Serif Omega", concept: "Classical print heritage.", spec: "Omega with block slab feet.", draw: () => omegaArc(32, 31, 14, 55, "l-ink", 4, 5) + rectR(11, 41, 9, 5, 1.5, "l-fill-ink") + rectR(44, 41, 9, 5, 1.5, "l-fill-ink") },
      { vname: "Hairline Feet Omega", concept: "Ending on a whisper.", spec: "Standard omega with hairline foot strokes.", draw: () => omegaArc(32, 32, 14, 55, "l-ink", 3.4, 0) + line(pt(32, 32, 14, Math.PI / 2 + (55 * Math.PI) / 180)[0] - 4, pt(32, 32, 14, Math.PI / 2 + (55 * Math.PI) / 180)[1], pt(32, 32, 14, Math.PI / 2 + (55 * Math.PI) / 180)[0] + 4, pt(32, 32, 14, Math.PI / 2 + (55 * Math.PI) / 180)[1], "l-faint", 1.6) + line(pt(32, 32, 14, Math.PI / 2 - (55 * Math.PI) / 180)[0] - 4, pt(32, 32, 14, Math.PI / 2 - (55 * Math.PI) / 180)[1], pt(32, 32, 14, Math.PI / 2 - (55 * Math.PI) / 180)[0] + 4, pt(32, 32, 14, Math.PI / 2 - (55 * Math.PI) / 180)[1], "l-faint", 1.6) },
      { vname: "Dot Terminal Omega", concept: "Feet that end in full stops.", spec: "Open arc with detached dot terminals.", draw: () => { const g = (60 * Math.PI) / 180; return arc(32, 32, 14, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3.4) + nodeAt(pt(32, 32, 14, Math.PI / 2 + g)[0] + 2, pt(32, 32, 14, Math.PI / 2 + g)[1] + 1, 2.2, "l-fill-sage") + nodeAt(pt(32, 32, 14, Math.PI / 2 - g)[0] - 2, pt(32, 32, 14, Math.PI / 2 - g)[1] + 1, 2.2, "l-fill-sage"); } },
      { vname: "Ball Terminal Omega", concept: "Type-nerd precision at the ends.", spec: "Arc with filled ball terminals.", draw: () => { const g = (56 * Math.PI) / 180; return arc(32, 31, 13, Math.PI / 2 + g, Math.PI / 2 - g, "l-ink", 3.4) + nodeAt(pt(32, 31, 13, Math.PI / 2 + g)[0], pt(32, 31, 13, Math.PI / 2 + g)[1], 3, "l-fill-ink") + nodeAt(pt(32, 31, 13, Math.PI / 2 - g)[0], pt(32, 31, 13, Math.PI / 2 - g)[1], 3, "l-fill-ink"); } },
      { vname: "High Shoulder Omega", concept: "One shoulder carries more weight.", spec: "Asymmetric omega: heavy left arc, light right.", draw: () => { const g = (55 * Math.PI) / 180; const [x0, y0] = pt(32, 32, 14, Math.PI / 2 + g); const [xm, ym] = pt(32, 32, 14, -Math.PI / 2); const [x1, y1] = pt(32, 32, 14, Math.PI / 2 - g); return raw(`<path d="M ${f(x0)} ${f(y0)} A 14 14 0 0 1 ${f(xm)} ${f(ym)}" fill="none" class="l-ink" style="stroke-width:5.4"/>`) + raw(`<path d="M ${f(xm)} ${f(ym)} A 14 14 0 0 1 ${f(x1)} ${f(y1)}" fill="none" class="l-ink" style="stroke-width:2.6"/>`) + line(x0, y0, x0 + 5, y0, "l-ink", 5.4) + line(x1, y1, x1 - 5, y1, "l-ink", 2.6); } },
      { vname: "Double Stroke Omega", concept: "The letter and its echo.", spec: "Outline omega with inner offset echo line.", draw: () => omegaArc(32, 32, 16, 55, "l-ink", 3, 4.5) + omegaArc(32, 32, 11, 55, "l-dim", 1.8, 3) },
      { vname: "Cast Shadow Omega", concept: "Depth from an honest offset.", spec: "Solid omega with faint offset duplicate.", draw: () => omegaArc(35, 35, 14, 55, "l-faint", 4, 5) + omegaArc(30, 31, 14, 55, "l-ink", 4, 5) },
      { vname: "Swash Underline Omega", concept: "Signature flourish included.", spec: "Omega over sweeping underline swash.", draw: () => omegaArc(30, 29, 12, 55, "l-ink", 3.4, 4.5) + path("M36 44 C44 44 50 40 54 34", "l-sage", 3.2) },
      { vname: "Plinth Omega", concept: "Exhibited, not just drawn.", spec: "Stepped pedestal blocks under omega.", draw: () => omegaArc(32, 27, 12, 55, "l-ink", 3.4, 4.5) + rectR(22, 43, 20, 4.5, 2, "l-fill-sage") + rectR(16, 49, 32, 4.5, 2, "l-fill-ink") },
      { vname: "Capsuled Omega", concept: "Contained by the softest border.", spec: "Stadium outline holding the word.", draw: () => rectR(8, 21, 48, 22, 11, "l-ink", 3) + omegaArc(32, 32.5, 8, 58, "l-sage", 2.8, 3) },
      { vname: "Sealed Circle Omega", concept: "Certified round.", spec: "Circle seal boundary with omega inside.", draw: () => circ(32, 32, 20, "l-ink", 2.8) + omegaArc(32, 33, 11.5, 56, "l-ink", 3, 4) },
      { vname: "Framed Square Omega", concept: "Straight answers only.", spec: "Square frame around centered omega.", draw: () => rectR(11, 11, 42, 42, 7, "l-ink", 3) + omegaArc(32, 32.5, 11, 56, "l-ink", 3, 4) },
      { vname: "Coin Cut Omega", concept: "Struck through solid metal.", spec: "Solid ink coin with stroked paper omega.", draw: () => dot(32, 32, 20, "l-fill-ink") + omegaArc(32, 33, 11, 56, "l-paper", 3, 4) },
    ],
  },
  {
    id: "omega-tiles",
    name: "Omega Tiles III",
    seed: 3105,
    variants: [
      { vname: "Sage Field Omega", concept: "The calm standard-bearer.", spec: "Sage squircle, balanced paper omega.", draw: () => tile() + omegaArc(32, 34, 12, 56, "l-paper", 3.2, 4.5) },
      { vname: "Night Field Omega", concept: "The dark-mode sibling.", spec: "Ink squircle, heavy paper omega.", draw: () => tile("l-fill-ink") + omegaArc(32, 34, 12, 56, "l-paper", 4, 5) },
      { vname: "Line Frame Omega Tile", concept: "For light chrome surfaces.", spec: "Outlined squircle with sage omega.", draw: () => rectR(8, 8, 48, 48, 14, "l-ink", 2.8) + omegaArc(32, 34, 12, 56, "l-sage", 3.2, 4.5) },
      { vname: "Corner Signed Omega", concept: "Signed discreetly from below.", spec: "Tucked omega with accent dot companion.", draw: () => tile() + omegaArc(26, 27, 9, 58, "l-paper", 2.8, 3.5) + nodeAt(45, 45, 4, "l-fill-paper") },
      { vname: "Fore Tile Omega", concept: "Frontmost of every window.", spec: "Offset duo tiles with omega on front.", draw: () => rectR(14, 14, 44, 44, 13, "l-fill-sage") + rectR(8, 8, 42, 42, 12, "l-fill-ink") + omegaArc(29, 30, 8.5, 58, "l-paper", 2.8, 3.5) },
      { vname: "Attended Omega Tile", concept: "The word and its orbit together.", spec: "Ring around omega on tile.", draw: () => tile() + circ(32, 32, 16, "l-paper", 2.6) + omegaArc(32, 33, 9, 58, "l-paper", 3, 3.5) },
      { vname: "Summit Steps Omega Tile", concept: "Climb to the meaning.", spec: "Stairs rising to omega on dark tile.", draw: () => tile("l-fill-ink") + paperFill("M12 52 H22 V42 H32 V32 H42 V22 H52 V52 Z") + omegaArc(42, 15, 5.5, 60, "l-paper", 2.4, 2.5) },
      { vname: "Hex Face Omega Tile", concept: "Badge geometry as the canvas.", spec: "Hexagonal face holding paper omega.", draw: () => hexFill(32, 32, 25) + omegaArc(32, 34, 12, 56, "l-paper", 3.2, 4.5) },
      { vname: "Crossfield Omega Tile", concept: "Spanning both worlds at once.", spec: "Split tile, omega crossing the seam.", draw: () => poly([[6, 6], [58, 6], [58, 58]], "l-fill-sage") + poly([[6, 6], [58, 58], [6, 58]], "l-fill-ink") + omegaArc(32, 33, 11, 56, "l-paper", 3.2, 4.5) },
      { vname: "Slot Mate Omega Tile", concept: "Kept beside its slot of light.", spec: "Vertical slot paired with omega.", draw: () => tile("l-fill-ink") + rectR(13, 17, 6, 30, 3, "l-fill-paper") + omegaArc(41, 34, 10, 56, "l-paper", 3, 4) },
      { vname: "Living Omega Tile", concept: "Alive, with the pulse to prove it.", spec: "Omega above pulse channel on tile.", draw: () => tile() + omegaArc(32, 27, 10, 56, "l-paper", 3, 4) + path("M14 47 H24 L28 40 L33 52 L37 47 H50", "l-paper", 3) },
      { vname: "Ceremonial Frame Omega", concept: "Framed twice for occasion.", spec: "Nested outline tiles around ink omega.", draw: () => rectR(6, 6, 52, 52, 14, "l-ink", 2.6) + rectR(13, 13, 38, 38, 10, "l-sage", 2.2) + omegaArc(32, 34, 9.5, 56, "l-ink", 2.8, 3.5) },
      { vname: "Tide Rider Omega Tile", concept: "Steady above the current.", spec: "Wave channel under omega on tile.", draw: () => tile() + path("M12 46 Q19 39 26 46 T40 46 T54 46", "l-paper", 3.4) + omegaArc(32, 31, 10, 56, "l-paper", 3, 4) },
      { vname: "Announcer Omega Tile", concept: "Broadcasting from the tile.", spec: "Signal arcs over omega on tile.", draw: () => tile() + omegaArc(32, 44, 10, 56, "l-paper", 3, 4) + arc(32, 25, 7, -Math.PI * 0.75, -Math.PI * 0.25, "l-paper", 2.6) + arc(32, 25, 13, -Math.PI * 0.72, -Math.PI * 0.28, "l-paper", 2.4) },
      { vname: "Quarter Round Omega Tile", concept: "A corner office for the word.", spec: "Quarter-round tile with paper omega.", draw: () => path("M6 58 V22 A36 36 0 0 1 42 58 Z", "l-fill-sage") + omegaArc(29, 38, 10, 56, "l-paper", 3, 4) },
      { vname: "Keyed Omega Tile", concept: "Fits one way only.", spec: "Corner notch tile with centered omega.", draw: () => tile("l-fill-ink") + poly([[58, 6], [58, 24], [40, 6]], "l-fill-paper") + omegaArc(31, 36, 10, 56, "l-paper", 3, 4) },
      { vname: "Passing Shade Omega", concept: "Something vast behind the word.", spec: "Eclipse disc with peeking sage omega.", draw: () => tile("l-fill-ink") + bgCircle(23, 29, 12) + omegaArc(41, 37, 10, 56, "l-sage", 3, 4) },
      { vname: "Strata Omega Tile", concept: "Layers of history under the word.", spec: "Bands beneath omega on tile.", draw: () => tile() + omegaArc(32, 25, 10, 56, "l-paper", 3, 4) + rectR(14, 42, 36, 5, 2.5, "l-fill-paper") + rectR(14, 51, 24, 5, 2.5, "l-fill-paper") },
      { vname: "Four Word Tile", concept: "The brand repeated into pattern.", spec: "2x2 grid of mini omegas on tile.", draw: () => tile("l-fill-ink") + [[20, 20], [44, 20], [20, 44], [44, 44]].map(([x, y]) => omegaArc(x, y + 0.5, 6.5, 60, "l-paper", 2.2, 2.5)).join("") },
      { vname: "Half Devotion Tile", concept: "Half given to light, half to dark.", spec: "Vertical split fill with spanning omega.", draw: () => raw(`<clipPath id="hdt"><rect x="6" y="6" width="52" height="52" rx="14"/></clipPath><rect class="l-fill-ink" x="6" y="6" width="52" height="52" clip-path="url(#hdt)"/><rect x="6" y="6" width="26" height="52" clip-path="url(#hdt)" fill="var(--accent)" stroke="none"/>`) + omegaArc(32, 33, 11, 56, "l-paper", 3.2, 4.5) },
    ],
  },
  {
    id: "trace-pad",
    name: "Trace & Pad",
    seed: 3106,
    variants: [
      { vname: "Load Resistor II", concept: "Your pick: resistance between strong points.", spec: "Bold zigzag between fat pads.", draw: () => line(6, 32, 15, 32, "l-ink", 3.2) + path("M15 32 L20 22 L28 42 L36 22 L44 42 L49 32", "l-ink", 3.2) + line(49, 32, 58, 32, "l-ink", 3.2) + nodeAt(6, 32, 3.8, "l-fill-sage") + nodeAt(58, 32, 3.8, "l-fill-sage") },
      { vname: "Hub Pad Trio II", concept: "One source feeding three loads.", spec: "Fat hub pad, three traces, three pads.", draw: () => nodeAt(17, 32, 7, "l-fill-ink") + [[46, 15], [51, 32], [46, 49]].map(([x, y]) => strokeOnly(`M24 32 C34 32 35 ${f(y)} ${f(x - 7)} ${f(y)}`, "l-dim", 2.4) + nodeAt(x, y, 3.6, "l-fill-sage")).join("") },
      { vname: "Elbow Run Pads", concept: "One considered turn.", spec: "Right-angle trace with terminal pads.", draw: () => strokeOnly("M12 48 V28 Q12 16 24 16 H50", "l-ink", 3.4) + nodeAt(12, 50, 3.8, "l-fill-sage") + nodeAt(52, 16, 3.8, "l-fill-sage") },
      { vname: "Ess Bend Trace", concept: "The graceful detour.", spec: "Smooth S-curve between pads.", draw: () => strokeOnly("M10 16 Q24 16 24 32 T38 48 H54", "l-ink", 3.2) + nodeAt(56, 48, 3.6, "l-fill-sage") + nodeAt(8, 16, 3.6, "l-fill-sage") },
      { vname: "Via Chain Rail", concept: "Stitched from pad to pad.", spec: "Rail with three vias mid-span.", draw: () => line(10, 32, 54, 32, "l-dim", 2.6) + nodeAt(10, 32, 4, "l-fill-ink") + [24, 32, 40].map((x) => circ(x, 32, 3, "l-sage", 2.2)).join("") + nodeAt(54, 32, 4, "l-fill-ink") },
      { vname: "Drop Stub Bus", concept: "Main line with four takeoffs.", spec: "Bus rail with stub drops to pads.", draw: () => line(8, 14, 56, 14, "l-ink", 3) + [17, 27, 37, 47].map((x, i) => line(x, 14, x, 26 + (i % 2) * 10, "l-dim", 2.4) + nodeAt(x, 29 + (i % 2) * 10, 3, i % 2 ? "l-fill-sage" : "l-fill-ink")).join("") },
      { vname: "Double Coil Run", concept: "Energy banked twice.", spec: "Two coil bumps between pads.", draw: () => line(6, 36, 12, 36, "l-ink", 3) + arc(18, 36, 6, Math.PI, TAU, "l-ink", 3) + arc(30, 36, 6, Math.PI, TAU, "l-ink", 3) + arc(42, 36, 6, Math.PI, TAU, "l-ink", 3) + line(48, 36, 58, 36, "l-ink", 3) + nodeAt(6, 36, 3.2, "l-fill-sage") + nodeAt(58, 36, 3.2, "l-fill-sage") },
      { vname: "Test Point Halo", concept: "Where you check the pulse.", spec: "Lone pad inside a halo ring.", draw: () => circ(32, 32, 15, "l-faint", 2) + nodeAt(32, 32, 6, "l-fill-ink") + nodeAt(32, 32, 2.2, "l-fill-sage") },
      { vname: "Four Way Junction", concept: "Every direction accounted for.", spec: "Cross traces radiating from center pad.", draw: () => [[32, 10], [32, 54], [10, 32], [54, 32]].map(([x, y]) => line(32, 32, x, y, "l-dim", 2.6)).join("") + nodeAt(32, 32, 5, "l-fill-sage") + [[32, 10], [32, 54], [10, 32], [54, 32]].map(([x, y]) => nodeAt(x, y, 2.8)).join("") },
      { vname: "Long Meander", concept: "The scenic route between pins.", spec: "Serpentine trace with end pads.", draw: () => strokeOnly("M8 16 H30 V32 H14 V48 H40 V32 H56", "l-ink", 3) + nodeAt(8, 16, 3.2, "l-fill-sage") + nodeAt(56, 32, 3.2, "l-fill-sage") },
      { vname: "Single Branch Tee", concept: "One split, cleanly made.", spec: "Trunk with a single branch.", draw: () => line(8, 46, 56, 46, "l-ink", 3.2) + strokeOnly("M28 46 V26 Q28 18 36 18 H52", "l-ink", 3.2) + nodeAt(8, 46, 3.4, "l-fill-sage") + nodeAt(54, 18, 3.4, "l-fill-sage") },
      { vname: "Ground Stack Bold", concept: "Solid footing for the circuit.", spec: "Drop trace into bold ground stack.", draw: () => line(32, 8, 32, 34, "l-ink", 3.4) + nodeAt(32, 8, 3.2, "l-fill-sage") + line(18, 36, 46, 36, "l-ink", 3.4) + line(23, 43, 41, 43, "l-ink", 3) + line(28, 50, 36, 50, "l-ink", 2.6) },
      { vname: "Coil Fed Whip", concept: "Antenna with its tuning coil.", spec: "Coil feeding straight whip antenna.", draw: () => arc(20, 40, 9, -Math.PI * 0.5, Math.PI * 1.1, "l-ink", 2.8) + arc(20, 40, 4.5, -Math.PI * 0.5, Math.PI * 1.25, "l-ink", 2.8) + line(38, 50, 38, 14, "l-sage", 3.2) + nodeAt(38, 11, 2.8, "l-fill-sage") },
      { vname: "Twin Lane Bridge", concept: "Two lanes, one destination.", spec: "Parallel traces converging on a pad.", draw: () => line(8, 22, 30, 22, "l-ink", 3) + line(8, 42, 30, 42, "l-ink", 3) + strokeOnly("M30 22 Q44 22 44 32 M30 42 Q44 42 44 32", "l-ink", 3) + nodeAt(48, 32, 4.4, "l-fill-sage") },
      { vname: "Spiral To Pad", concept: "Wound tight, released once.", spec: "Small spiral terminating in a pad.", draw: () => arc(26, 32, 12, -Math.PI * 0.5, Math.PI * 1.2, "l-ink", 3) + arc(26, 32, 6, -Math.PI * 0.5, Math.PI * 1.4, "l-ink", 3) + line(38, 32, 52, 32, "l-dim", 2.6) + nodeAt(55, 32, 3.6, "l-fill-sage") },
      { vname: "Cascade Step Trace", concept: "Descending in ordered steps.", spec: "Staircase trace with pads.", draw: () => strokeOnly("M8 14 H24 V28 H40 V42 H56", "l-ink", 3.2) + nodeAt(8, 14, 3.2, "l-fill-sage") + nodeAt(56, 42, 3.2, "l-fill-sage") },
      { vname: "Hop Crossing", concept: "No collision where lines meet.", spec: "Bridge hop over a passing trace.", draw: () => line(8, 42, 56, 42, "l-dim", 3) + line(26, 42, 33, 42, "l-paper", 5.4) + strokeOnly("M8 22 H20 Q30 22 30 32 Q30 42 40 42 H56", "l-ink", 3.2) },
      { vname: "Broad Feed Line", concept: "Power delivered without apology.", spec: "Wide tapering feed into pad.", draw: () => poly([[10, 26], [40, 29], [40, 35], [10, 38]], "l-fill-ink") + nodeAt(46, 32, 5.5, "l-fill-sage") },
      { vname: "Stitch Via Border", concept: "Sewn down at the edges.", spec: "L-shaped border of vias.", draw: () => [[12, 12], [22, 12], [32, 12], [12, 22], [12, 32]].map(([x, y]) => circ(x, y, 3, "l-ink", 2.2)).join("") + nodeAt(12, 12, 3.4, "l-fill-sage") },
      { vname: "Probe Pin Pair", concept: "Ready for inspection.", spec: "Two spring probes over a contact bar.", draw: () => line(24, 14, 24, 36, "l-ink", 3) + line(40, 14, 40, 36, "l-ink", 3) + nodeAt(24, 11, 3, "l-fill-ink") + nodeAt(40, 11, 3, "l-fill-ink") + rectR(16, 42, 32, 10, 3, "l-fill-sage") },
    ],
  },
  {
    id: "hex-rings",
    name: "Heavy Hex Rings",
    seed: 3107,
    variants: [
      { vname: "Hex Nut III", concept: "Your pick at maximum weight.", spec: "Ultra-thick hex wall, sage bore.", draw: () => poly(reg(32, 32, 20, 6), "l-ink", 6.5) + circ(32, 32, 7.5, "l-sage", 2.8) },
      { vname: "Off Center Annulus", concept: "Deliberately imperfect centering.", spec: "Hex ring with offset inner hex.", draw: () => hexStroke(32, 32, 21) + hexStroke(36, 35, 8, "l-faint", 2) },
      { vname: "Drilled Round Bore", concept: "Round hole in a hex world.", spec: "Thick hex ring with circular bore.", draw: () => poly(reg(32, 32, 20, 6), "l-ink", 5.5) + circ(32, 32, 7, "l-sage", 3) },
      { vname: "Double Wall Hex", concept: "Two walls, one structure.", spec: "Two tight concentric hex outlines.", draw: () => hexStroke(32, 32, 21) + hexStroke(32, 32, 16.5, "l-ink", 1.8) },
      { vname: "Keyed Bore Hex", concept: "The bore that accepts one key.", spec: "Bore with keyway notch.", draw: () => poly(reg(32, 32, 20, 6), "l-ink", 4.5) + circ(32, 32, 8, "l-sage", 2.8) + rectR(30, 18, 4, 6, 1, "l-fill-sage") },
      { vname: "Counter Rotated Pair", concept: "Same shape, different angle.", spec: "Two hexes rotated 30 degrees apart.", draw: () => poly(reg(26, 32, 14, 6), "l-ink", 2.8) + poly(reg(38, 32, 14, 6, 0), "l-sage", 2.8) },
      { vname: "Stacked Ring Cells", concept: "Washers piled for later.", spec: "Two hex rings stacked vertex to vertex.", draw: () => poly(reg(32, 17, 12, 6), "l-ink", 3.4) + poly(reg(32, 45, 12, 6), "l-ink", 3.4) },
      { vname: "Open Wall Hex", concept: "One wall left unbuilt.", spec: "Hex ring missing its base segment.", draw: () => { const pts = reg(32, 32, 19, 6); return strokeOnly(`M ${pts[3].map(f).join(" ")} L ${pts[4].map(f).join(" ")} L ${pts[5].map(f).join(" ")} L ${pts[0].map(f).join(" ")}`, "l-ink", 3.4); } },
      { vname: "Lock Washer Hex", concept: "Tension you can see.", spec: "Hex ring with a shear gap.", draw: () => { const pts = reg(32, 32, 19, 6); return strokeOnly(`M ${pts[0].map(f).join(" ")} L ${pts[1].map(f).join(" ")} L ${pts[2].map(f).join(" ")} L ${pts[3].map(f).join(" ")}`, "l-ink", 3.6) + line(pts[3][0], pts[3][1], pts[3][0] - 4, pts[3][1] + 3, "l-ink", 3.6) + line(pts[0][0], pts[0][1], pts[0][0] + 4, pts[0][1] - 3, "l-ink", 3.6); } },
      { vname: "Triple Concentric Hex", concept: "Three generations of the same cell.", spec: "Three nested outlines stepping down.", draw: () => hexStroke(32, 32, 22, "l-ink", 3) + hexStroke(32, 32, 15, "l-dim", 2.2) + hexStroke(32, 32, 8, "l-faint", 1.8) },
      { vname: "Flanged Hex", concept: "Built to be bolted down.", spec: "Hex with flange wings.", draw: () => hexStroke(32, 32, 16) + line(10, 24, 16, 28, "l-ink", 3) + line(54, 24, 48, 28, "l-ink", 3) + line(10, 40, 16, 36, "l-ink", 3) + line(54, 40, 48, 36, "l-ink", 3) },
      { vname: "Chamfered Bore Cell", concept: "Every edge considered.", spec: "Hex with octagonal inner bore.", draw: () => hexStroke(32, 32, 21) + poly(reg(32, 32, 8.5, 8), "l-sage", 2.6) },
      { vname: "Stemmed Plug Hex", concept: "The plug and its lead.", spec: "Hex with protruding stem cap.", draw: () => hexFill(32, 38, 15) + rectR(27, 8, 10, 14, 4, "l-fill-ink") + nodeAt(32, 44, 3.4, "l-fill-paper") },
      { vname: "Domed Turret Hex", concept: "Soft crown on hard walls.", spec: "Hex with filled semicircle dome cap.", draw: () => hexStroke(32, 39, 15) + path("M22 22 A10 10 0 0 1 42 22 Z", "l-fill-ink") + nodeAt(32, 39, 3.2, "l-fill-sage") },
      { vname: "Shield Point Hex", concept: "The nut that became a crest.", spec: "Elongated hex tapering to a shield point.", draw: () => strokeOnly("M13 20 L32 8 L51 20 V38 Q51 50 32 57 Q13 50 13 38 Z", "l-ink", 3.2) + nodeAt(32, 34, 3.6, "l-fill-sage") },
      { vname: "Wide Hex Bar", concept: "Landscape proportions.", spec: "Horizontally stretched heavy hex.", draw: () => poly([[8, 32], [17, 18], [47, 18], [56, 32], [47, 46], [17, 46]], "l-ink", 4.4) },
      { vname: "Tall Hex Bar", concept: "Portrait proportions.", spec: "Vertically stretched heavy hex.", draw: () => poly([[32, 6], [46, 15], [46, 49], [32, 58], [18, 49], [18, 15]], "l-ink", 4.4) },
      { vname: "Micro Array Nine", concept: "A field of cells in waiting.", spec: "Nine tiny hexes filling the frame.", draw: () => [12, 32, 52].flatMap((x) => [16, 32, 48].map((y) => [x, y])).map(([x, y], i) => hexStroke(x, y, 5, i === 4 ? "l-sage" : "l-ink", 2)).join("") },
      { vname: "Corner Bracket Hex", concept: "Only the corner remains — registration mark.", spec: "Two adjacent hex walls as bracket.", draw: () => { const pts = reg(32, 32, 20, 6); return strokeOnly(`M ${pts[5].map(f).join(" ")} L ${pts[0].map(f).join(" ")} L ${pts[1].map(f).join(" ")}`, "l-ink", 4); } },
      { vname: "Studded Solid Hex", concept: "Solid, with something to hold onto.", spec: "Filled hex with stud nub above.", draw: () => hexFill(32, 38, 16) + rectR(27, 12, 10, 11, 3, "l-fill-ink") + nodeAt(32, 34, 3.4, "l-fill-paper") },
    ],
  },
  {
    id: "bracket-icons",
    name: "Bracket Icons III",
    seed: 3108,
    variants: [
      { vname: "Self Closing III", concept: "Your pick, final form.", spec: "</> tightened to icon weight.", draw: () => path("M25 17 L11 32 L25 47", "l-ink", 4) + path("M39 17 L53 32 L39 47", "l-ink", 4) + line(38, 13, 26, 51, "l-sage", 4) },
      { vname: "Lone Angle Minimal", concept: "One bracket. One dot. Done.", spec: "Large < with low companion dot.", draw: () => path("M44 12 L12 32 L44 52", "l-ink", 4.4) + nodeAt(36, 46, 4, "l-fill-sage") },
      { vname: "Braces Vessel Bar", concept: "The vessel with its cargo line.", spec: "{ } bowl braces holding a sage bar.", draw: () => path("M24 12 C16 12 16 21 16 27 C16 31 12 32 10 32 C12 32 16 33 16 37 C16 43 16 52 24 52", "l-ink", 3.6) + path("M40 12 C48 12 48 21 48 27 C48 31 52 32 54 32 C52 32 48 33 48 37 C48 43 48 52 40 52", "l-ink", 3.6) + line(23, 32, 41, 32, "l-sage", 3.6) },
      { vname: "Tag Core Diamond II", concept: "Open meets close around the point.", spec: "<> diamond with solid core.", draw: () => path("M25 14 L8 32 L25 50", "l-ink", 3.8) + path("M39 14 L56 32 L39 50", "l-ink", 3.8) + nodeAt(32, 32, 5, "l-fill-sage") },
      { vname: "Comment Slash Gate", concept: "Explaining itself at the door.", spec: "// slashes before a gate bar.", draw: () => line(24, 14, 15, 50, "l-ink", 3.8) + line(38, 14, 29, 50, "l-ink", 3.8) + line(46, 20, 46, 44, "l-sage", 3.4) },
      { vname: "Fragment Duo Quiet", concept: "Two-thirds of a tag — enough.", spec: "< / pair only.", draw: () => path("M26 16 L11 32 L26 48", "l-ink", 3.8) + line(40, 12, 28, 52, "l-sage", 3.8) },
      { vname: "Caret Nest Pair", concept: "Held from above and below.", spec: "^ nested inside v.", draw: () => path("M18 28 L32 14 L46 28", "l-ink", 3.8) + path("M18 38 L32 52 L46 38", "l-dim", 3.2) },
      { vname: "Equals Ladder Steps", concept: "Assignments in sequence.", spec: "== pairs stepping down-right.", draw: () => line(12, 16, 28, 16, "l-ink", 3.6) + line(12, 25, 28, 25, "l-ink", 3.6) + line(22, 33, 38, 33, "l-sage", 3.6) + line(22, 42, 38, 42, "l-sage", 3.6) + line(32, 50, 48, 50, "l-faint", 3) },
      { vname: "Pipe Dot Gate", concept: "Value between uprights.", spec: "| • | heavy pipes, sage core.", draw: () => line(20, 12, 20, 52, "l-ink", 4) + line(44, 12, 44, 52, "l-ink", 4) + nodeAt(32, 32, 4.6, "l-fill-sage") },
      { vname: "Quote Stack Marks", concept: "Cited twice over.", spec: "Two rows of paired quotes.", draw: () => [[14, 14], [34, 14]].map(([x, y]) => path(`M${x} ${y} C${x + 7} ${y} ${x + 11} ${y + 5} ${x + 11} ${y + 11} C${x + 11} ${y + 18} ${x + 6} ${y + 23} ${x - 1} ${y + 24} C${x + 3} ${y + 19} ${x + 4} ${y + 14} ${x + 2} ${y + 10} C${f(x)} ${y + 6} ${f(x - 1)} ${y + 3} ${f(x)} ${f(y)} Z`, "l-fill-ink")).join("") + [[24, 36], [44, 36]].map(([x, y]) => path(`M${x} ${y} C${x + 7} ${y} ${x + 11} ${y + 5} ${x + 11} ${y + 11} C${x + 11} ${y + 18} ${x + 6} ${y + 23} ${x - 1} ${y + 24} C${x + 3} ${y + 19} ${x + 4} ${y + 14} ${x + 2} ${y + 10} C${f(x)} ${y + 6} ${f(x - 1)} ${y + 3} ${f(x)} ${f(y)} Z`, "l-fill-sage")).join("") },
      { vname: "Low Ticks Pair", concept: "Inline code, resting low.", spec: "Backticks hugging the baseline.", draw: () => path("M18 44 L24 34", "l-ink", 3.8) + path("M36 44 L42 34", "l-ink", 3.8) + line(12, 52, 52, 52, "l-sage", 3.2) },
      { vname: "Ampersand Heavy", concept: "And — with conviction.", spec: "Bold simplified ampersand.", draw: () => circ(26, 24, 10, "l-ink", 3.8) + strokeOnly("M33 30 C42 40 49 47 56 53", "l-ink", 3.8) + strokeOnly("M16 49 C25 42 34 32 41 21", "l-sage", 3.8) },
      { vname: "Lambda Monoline Fine", concept: "The function, drawn thin.", spec: "Hairline lambda with sage leg.", draw: () => path("M20 12 C27 24 30 32 33 40", "l-ink", 3) + path("M45 12 C36 28 28 42 21 52", "l-ink", 3) + path("M33 40 C38 47 44 51 51 52", "l-sage", 3) },
      { vname: "Semicolon Stagger Duo", concept: "Statement after statement.", spec: "Two semicolons stepped diagonally.", draw: () => dot(22, 18, 4.4, "l-fill-ink") + path("M27 28 C27 37 22 41 16 43 C20 36 21 32 20 28 Z", "l-fill-ink") + dot(40, 30, 4.4, "l-fill-sage") + path("M45 40 C45 49 40 53 34 55 C38 48 39 44 38 40 Z", "l-fill-sage") },
      { vname: "Bracket Embrace Tight", concept: "Held so close it disappears.", spec: "[] nearly touching around core.", draw: () => path("M26 16 H18 V48 H26", "l-ink", 4) + path("M38 16 H46 V48 H38", "l-ink", 4) + nodeAt(32, 32, 4.6, "l-fill-sage") },
      { vname: "Approximation Solo", concept: "One honest tilde.", spec: "Single heavy wave.", draw: () => strokeOnly("M10 34 Q20 22 32 34 T56 34", "l-ink", 4) },
      { vname: "Greater Less Kiss", concept: "Opposites meeting mid-air.", spec: ">< facing pair with spark contact.", draw: () => path("M20 14 L8 32 L20 50", "l-ink", 3.8) + path("M44 14 L56 32 L44 50", "l-ink", 3.8) + spark4(32, 32, 6, 2.2) },
      { vname: "Colon Trail Dots", concept: "Scope opening downward.", spec: ": followed by trailing dots.", draw: () => dot(20, 20, 4.4, "l-fill-ink") + dot(20, 40, 4.4, "l-fill-ink") + dot(34, 40, 3.6, "l-fill-sage") + dot(46, 40, 3.2, "l-fill-dim") + dot(56, 40, 2.8, "l-fill-faint") },
      { vname: "Wide Slash Pair", concept: "Space held between statements.", spec: "/ / with generous tracking.", draw: () => line(24, 12, 12, 52, "l-ink", 4) + line(52, 12, 40, 52, "l-sage", 4) },
      { vname: "Curly To Arrow", concept: "A brace that decided to move.", spec: "{ flowing into an arrowhead.", draw: () => path("M28 12 C21 12 21 19 21 25 C21 29 18 32 16 32 C18 32 21 35 21 39 C21 45 21 52 28 52", "l-ink", 3.8) + line(28, 32, 44, 32, "l-sage", 3.8) + poly([[44, 26], [54, 32], [44, 38]], "l-fill-sage") },
    ],
  },
  {
    id: "omega-markup",
    name: "Omega Markup",
    seed: 3109,
    variants: [
      { vname: "Omega Tagged", concept: "The word, marked up.", spec: "< Ω > lockup.", draw: () => path("M18 18 L8 32 L18 46", "l-ink", 3.6) + path("M46 18 L56 32 L46 46", "l-ink", 3.6) + omegaArc(32, 33, 9, 58, "l-sage", 3, 3.5) },
      { vname: "Omega Braced", concept: "Scoped: everything inside is omega.", spec: "{ Ω } pairing.", draw: () => path("M22 12 C15 12 15 20 15 26 C15 30 12 32 10 32 C12 32 15 34 15 38 C15 44 15 52 22 52", "l-ink", 3.6) + path("M42 12 C49 12 49 20 49 26 C49 30 52 32 54 32 C52 32 49 34 49 38 C49 44 49 52 42 52", "l-ink", 3.6) + omegaArc(32, 32.5, 8.5, 58, "l-sage", 3, 3.5) },
      { vname: "Omega Prompt Tail", concept: "The word awaiting your input.", spec: "Ω with trailing cursor underscore.", draw: () => omegaArc(28, 32, 13, 56, "l-ink", 3.4, 4.5) + cursorBar(44, 45, 12, "l-sage", 3.4) },
      { vname: "Struck Omega Mark", concept: "Crossed out, still standing.", spec: "Heavy omega under diagonal strike.", draw: () => omegaArc(32, 33, 13, 55, "l-ink", 4.4, 5) + line(14, 47, 50, 19, "l-sage", 3.6) },
      { vname: "Commented Omega", concept: "Explained away but kept.", spec: "// preceding the word.", draw: () => line(16, 14, 8, 50, "l-dim", 3.2) + line(28, 14, 20, 50, "l-dim", 3.2) + omegaArc(42, 32, 11, 56, "l-ink", 3.2, 4) },
      { vname: "Assigned Omega", concept: "Everything means this now.", spec: "Ω = assignment lockup.", draw: () => omegaArc(20, 32, 11, 56, "l-ink", 3.2, 4) + line(36, 28, 50, 28, "l-sage", 3.4) + line(36, 37, 50, 37, "l-sage", 3.4) },
      { vname: "Parenthesized Omega", concept: "Aside, but essential.", spec: "( Ω ) soft containment.", draw: () => arc(-4, 32, 30, -0.55, 0.55, "l-ink", 3.6) + arc(68, 32, 30, Math.PI - 0.55, Math.PI + 0.55, "l-ink", 3.6) + omegaArc(32, 32.5, 9.5, 58, "l-sage", 3, 3.5) },
      { vname: "Piped Omega Absolute", concept: "Magnitude of meaning.", spec: "|Ω| absolute-value bars.", draw: () => line(16, 12, 16, 52, "l-ink", 3.6) + line(48, 12, 48, 52, "l-ink", 3.6) + omegaArc(32, 32.5, 9.5, 58, "l-sage", 3, 3.5) },
      { vname: "Omega To The Power", concept: "Exponentially itself.", spec: "^ raised beside the word.", draw: () => omegaArc(28, 36, 12, 56, "l-ink", 3.4, 4.5) + path("M42 20 L47 12 L52 20", "l-sage", 3.4) },
      { vname: "Backtick Omega", concept: "Literal omega — nothing more.", spec: "`Ω` inline-code wrap.", draw: () => path("M16 20 L22 12", "l-dim", 3.2) + path("M48 20 L42 12", "l-dim", 3.2) + omegaArc(32, 33, 11, 56, "l-ink", 3.2, 4) },
      { vname: "Omega Statement End", concept: "Said, finished.", spec: "Ω followed by semicolon.", draw: () => omegaArc(26, 32, 12, 56, "l-ink", 3.4, 4.5) + dot(46, 30, 3.4, "l-fill-sage") + path("M51 40 C51 48 47 51 42 53 C46 47 47 43 46 40 Z", "l-fill-sage") },
      { vname: "Omega And Company", concept: "The word, plus everything else.", spec: "Ω & lockup.", draw: () => omegaArc(20, 32, 11, 56, "l-ink", 3.2, 4) + circ(42, 27, 6.5, "l-sage", 3) + strokeOnly("M47 33 C52 39 56 43 60 47", "l-sage", 3) + strokeOnly("M36 45 C41 41 46 36 49 31", "l-sage", 3) },
      { vname: "Omega Definition", concept: "Defined once for all scopes.", spec: "Ω : definition colon.", draw: () => omegaArc(24, 32, 12, 56, "l-ink", 3.4, 4.5) + dot(42, 26, 3.4, "l-fill-sage") + dot(42, 39, 3.4, "l-fill-sage") },
      { vname: "Omega Ellipsis Trail", concept: "To be continued, endlessly.", spec: "Ω … trailing dots.", draw: () => omegaArc(24, 32, 12, 56, "l-ink", 3.4, 4.5) + [40, 48, 56].map((x, i) => nodeAt(x, 32, 3.4 - i * 0.5, i === 0 ? "l-fill-sage" : "l-fill-dim")).join("") },
      { vname: "Omega Forward Flow", concept: "Pointing at what comes next.", spec: "Ω → arrow.", draw: () => omegaArc(22, 32, 12, 56, "l-ink", 3.4, 4.5) + line(38, 32, 48, 32, "l-sage", 3.4) + poly([[48, 26], [57, 32], [48, 38]], "l-fill-sage") },
      { vname: "Hash Omega Topic", concept: "Trending by definition.", spec: "# prefix before omega.", draw: () => line(22, 12, 18, 52, "l-ink", 3) + line(34, 12, 30, 52, "l-ink", 3) + line(14, 24, 42, 24, "l-dim", 2.6) + line(12, 40, 40, 40, "l-dim", 2.6) + omegaArc(49, 32, 9.5, 58, "l-sage", 2.8, 3.5) },
      { vname: "Omega Plus More", concept: "This, and then some.", spec: "Ω + addition mark.", draw: () => omegaArc(24, 32, 12, 56, "l-ink", 3.4, 4.5) + line(42, 32, 56, 32, "l-sage", 3.4) + line(49, 25, 49, 39, "l-sage", 3.4) },
      { vname: "At Omega Address", concept: "Reachable everywhere.", spec: "@Ω handle lockup.", draw: () => circ(22, 32, 11, "l-ink", 3.2) + raw(`<path d="M33 32 V38 Q33 43 38 43 Q43 43 43 32 Q43 20 32 20 Q21 20 21 32" fill="none" class="l-ink" style="stroke-width:3"/>`) + omegaArc(50, 32, 8.5, 58, "l-sage", 2.8, 3) },
      { vname: "Near Enough Omega", concept: "Approximately everything.", spec: "~Ω approximation pair.", draw: () => path("M10 18 Q16 12 22 18 T34 18", "l-sage", 3.2) + omegaArc(30, 36, 12, 56, "l-ink", 3.4, 4.5) },
      { vname: "Omega Share Of", concept: "Part of the whole.", spec: "% fraction beside omega.", draw: () => omegaArc(22, 32, 11, 56, "l-ink", 3.2, 4) + line(38, 46, 54, 18, "l-sage", 3.2) + circ(39, 21, 4.5, "l-sage", 3) + circ(53, 43, 4.5, "l-sage", 3) },
    ],
  },
  {
    id: "hex-networks",
    name: "Hex Networks",
    seed: 3110,
    variants: [
      { vname: "Emphasis Orbit Nodes II", concept: "Your pick: the team with one chosen.", spec: "Ring of nodes, one enlarged and sage.", draw: () => { let s = circ(32, 32, 16, "l-faint", 1.8) + nodeAt(32, 32, 3); reg(32, 32, 16, 6).forEach(([x, y], i) => (s += i === 0 ? nodeAt(x, y, 5, "l-fill-sage") : nodeAt(x, y, 3.2))); return s; } },
      { vname: "Vertex Net Hex", concept: "The cell fully wired.", spec: "Vertex nodes linked through center.", draw: () => hexStroke(32, 32, 20) + reg(32, 32, 20, 6).map(([x, y]) => line(x, y, 32, 32, "l-faint", 1.6)).join("") + nodeAt(32, 32, 4, "l-fill-sage") + reg(32, 32, 20, 6).map(([x, y]) => nodeAt(x, y, 2.8)).join("") },
      { vname: "Hub Pad Mesh", concept: "One source, three loads, all linked.", spec: "Hub linked to three pads plus cross ties.", draw: () => nodeAt(32, 18, 4.4, "l-fill-sage") + [[14, 46], [50, 46]].map(([x, y]) => link(32, 18, x, y) + nodeAt(x, y, 3.4)).join("") + link(14, 46, 50, 46) + nodeAt(32, 40, 2.8, "l-fill-dim") },
      { vname: "Triad Cells Linked", concept: "Three cells sharing one bus.", spec: "Hex trio connected by traces.", draw: () => hexStroke(32, 13, 9) + hexStroke(13, 45, 9) + hexStroke(51, 45, 9, "l-sage", 2.8) + line(24, 21, 17, 37, "l-dim", 2.2) + line(40, 21, 47, 37, "l-dim", 2.2) },
      { vname: "Constellation Five Hex", concept: "Five cells, drawn as stars are.", spec: "Scattered cells with selective links.", draw: () => { const P = [[12, 14], [36, 10], [54, 26], [44, 52], [14, 44]]; const L = [[0, 1], [1, 2], [2, 3], [3, 4]]; let s = ""; L.forEach(([a, b]) => (s += link(P[a][0], P[a][1], P[b][0], P[b][1]))); P.forEach(([x, y], i) => (s += hexStroke(x, y, i === 2 ? 7 : 5.5, i % 2 ? "l-ink" : "l-sage", 2.2))); return s; } },
      { vname: "Center Spoke Six", concept: "Six directions from one will.", spec: "Hub with six spokes to dots.", draw: () => nodeAt(32, 32, 4.4, "l-fill-sage") + reg(32, 32, 17, 6).map(([x, y]) => line(32, 32, x, y, "l-dim", 2) + nodeAt(x, y, 3)).join("") },
      { vname: "Bridged Nut Pair", concept: "Two fasteners, one tie.", draw: () => poly(reg(17, 32, 12, 6), "l-ink", 3.2) + poly(reg(47, 32, 12, 6), "l-ink", 3.2) + line(29, 32, 35, 32, "l-sage", 3.4), spec: "Hex nuts bridged by a tie bar." },
      { vname: "Node Rail Hex End", concept: "A line of work ending in structure.", spec: "Dot rail terminating in hex.", draw: () => [[10, 32], [20, 32], [30, 32]].map(([x, y], i) => nodeAt(x, y, 3 - i * 0.4)).join("") + link(10, 32, 38, 32) + hexStroke(48, 32, 9) },
      { vname: "Pyramid In Cell", concept: "Hierarchy housed safely.", spec: "Node pyramid inside hex outline.", draw: () => hexStroke(32, 33, 21) + nodeAt(32, 20, 3.4, "l-fill-sage") + nodeAt(22, 34, 3) + nodeAt(42, 34, 3) + nodeAt(15, 46, 3) + nodeAt(49, 46, 3) + link(32, 20, 22, 34) + link(32, 20, 42, 34) + link(22, 34, 15, 46) + link(22, 34, 49, 46, 1.5) + link(42, 34, 15, 46, 1.5, "l-faint") + link(42, 34, 49, 46) },
      { vname: "Mesh Clipped Cell", concept: "The network wearing its boundary.", spec: "Quad mesh inside hex silhouette.", draw: () => { const P = [[20, 20], [44, 20], [44, 44], [20, 44]]; let s = ""; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) s += link(P[i][0], P[i][1], P[j][0], P[j][1], 1.6); P.forEach(([x, y]) => (s += nodeAt(x, y, 3))); return hexStroke(32, 32, 22) + s + nodeAt(32, 32, 3.4, "l-fill-sage"); } },
      { vname: "Satellite Cells Orbit", concept: "Moons around the home cell.", spec: "Center hex with three orbiting dots.", draw: () => hexStroke(32, 32, 11) + circ(32, 32, 20, "l-faint", 1.8) + nodeAt(pt(32, 32, 20, -0.4)[0], pt(32, 32, 20, -0.4)[1], 3.2, "l-fill-sage") + nodeAt(pt(32, 32, 20, 2.2)[0], pt(32, 32, 20, 2.2)[1], 3) + nodeAt(pt(32, 32, 20, 4)[0], pt(32, 32, 20, 4)[1], 3) },
      { vname: "Long Bridge Cells", concept: "Distant outposts, firmly joined.", spec: "Two hexes at frame edges, long bridge.", draw: () => hexStroke(10, 32, 9) + hexStroke(54, 32, 9) + line(19, 32, 45, 32, "l-sage", 3.2) + nodeAt(32, 32, 3, "l-fill-ink") },
      { vname: "Relay Chain Alternating", concept: "Handoff after handoff.", spec: "Alternating hex-dot-dot relay chain.", draw: () => hexStroke(10, 32, 8) + nodeAt(24, 32, 3) + nodeAt(34, 32, 3) + hexStroke(46, 32, 8, "l-sage", 2.8) + link(16, 32, 24, 32) + link(28, 32, 40, 32) },
      { vname: "Star Topology Hex Hub", concept: "All routes lead to the cell.", spec: "Hex hub with five spoke endpoints.", draw: () => hexStroke(32, 32, 10) + reg(32, 32, 20, 5).map(([x, y]) => line(32, 32, x, y, "l-dim", 2) + nodeAt(x, y, 3.2)).join("") + nodeAt(32, 32, 3.4, "l-fill-sage") },
      { vname: "Six Dots Court", concept: "Minimal council ring.", spec: "Six dots ringing an empty center.", draw: () => reg(32, 32, 16, 6).map(([x, y], i) => nodeAt(x, y, 3.4, i === 0 ? "l-fill-sage" : "l-fill-ink")).join("") },
      { vname: "Tied Twin Hubs", concept: "Equal partners, tied twice.", spec: "Hubs joined by double midpoint ties.", draw: () => nodeAt(14, 26, 4.4, "l-fill-ink") + nodeAt(50, 26, 4.4, "l-fill-ink") + link(14, 31, 50, 31, 2.2) + link(14, 39, 50, 39, 2.2) + hexStroke(32, 35, 7.5, "l-sage", 2.6) },
      { vname: "Keystone Node Arch", concept: "The arch that needs its keystone.", spec: "Node arch with hex keystone at crown.", draw: () => arc(32, 52, 21, Math.PI * 1.08, Math.PI * 1.92, "l-ink", 3.4) + nodeAt(12, 44, 3.2) + nodeAt(52, 44, 3.2) + hexStroke(32, 20, 7.5, "l-sage", 2.8) },
      { vname: "Radial Pads Trio", concept: "Three probes from one heart.", spec: "Radial traces to three pads.", draw: () => nodeAt(32, 32, 5, "l-fill-ink") + [-90, 150, 30].map((deg) => { const a = (deg * Math.PI) / 180; const [x, y] = pt(32, 32, 16, a); return line(32, 32, x, y, "l-dim", 2.4) + nodeAt(x, y, 3.8, "l-fill-sage"); }).join("") },
      { vname: "Home Cell Moons", concept: "The cell and its attendants.", spec: "Solid cell flanked by orbit dots.", draw: () => hexFill(32, 32, 12) + nodeAt(10, 20, 3) + nodeAt(54, 20, 3) + nodeAt(32, 56, 3, "l-fill-dim") },
      { vname: "Grid Nine Nodes", concept: "Order in all nine positions.", spec: "3x3 grid with emphasized center.", draw: () => [14, 32, 50].flatMap((x) => [14, 32, 50].map((y) => [x, y])).map(([x, y], i) => (i === 4 ? nodeAt(x, y, 5, "l-fill-sage") : nodeAt(x, y, 3))).join("") + [[14, 32], [50, 32], [32, 14], [32, 50]].map(([x, y]) => link(32, 32, x, y, 1.5, "l-faint")).join("") },
    ],
  },
  {
    id: "crossed-orbits",
    name: "Crossed Orbits III",
    seed: 3111,
    variants: [
      { vname: "Crossed Planes II", concept: "Your pick: two paths, one center.", spec: "Bold rotated ellipse pair with core.", draw: () => ell(32, 32, 18, 9, "l-ink", 3) + ell(32, 32, 18, 9, "l-sage", 3, 62) + nodeAt(32, 32, 4.4, "l-fill-ink") },
      { vname: "Plane Meets Ring", concept: "The ellipse and the circle negotiate.", spec: "Circle crossed by tilted ellipse.", draw: () => circ(32, 32, 15, "l-ink", 3) + ell(32, 32, 20, 7, "l-sage", 3, -24) + nodeAt(32, 32, 3.4, "l-fill-ink") },
      { vname: "Gyroscope In Cell", concept: "Balance housed in the badge.", spec: "Gyro ring plus vertical ellipse in hex.", draw: () => hexStroke(32, 32, 21) + circ(32, 32, 13, "l-ink", 2.8) + ell(32, 32, 5.5, 13, "l-sage", 2.4) + nodeAt(32, 32, 2.6, "l-fill-ink") },
      { vname: "Minimal Atom Pair", concept: "Two orbits, one nucleus — nothing else.", spec: "Tight crossed ellipses around core.", draw: () => ell(32, 32, 16, 6.5, "l-ink", 2.8) + ell(32, 32, 16, 6.5, "l-ink", 2.8, 90) + nodeAt(32, 32, 4.4, "l-fill-sage") },
      { vname: "Comet Dash Ring", concept: "Motion implied by honest dashes.", spec: "Ring with comet head and trail dashes.", draw: () => circ(32, 32, 15, "l-faint", 1.8) + arc(32, 32, 15, Math.PI * 0.85, Math.PI * 1.75, "l-ink", 3.4) + line(14, 18, 19, 21, "l-dim", 2.4) + line(9, 25, 13, 27, "l-dim", 2) + nodeAt(pt(32, 32, 15, Math.PI * 1.75)[0], pt(32, 32, 15, Math.PI * 1.75)[1], 4, "l-fill-sage") },
      { vname: "Perpendicular Ellipses", concept: "One wide, one tall — both yours.", spec: "Flat and tall ellipses crossing.", draw: () => ell(32, 32, 20, 7, "l-ink", 3) + ell(32, 32, 7, 20, "l-sage", 3) + nodeAt(32, 32, 3.6, "l-fill-ink") },
      { vname: "Saturn In Hex", concept: "The ringed world, contained.", spec: "Core with wide ring inside hex frame.", draw: () => hexStroke(32, 32, 22) + nodeAt(32, 32, 9, "l-fill-ink") + ell(32, 32, 17, 5.5, "l-sage", 3) },
      { vname: "Tilted Ring Core", concept: "One orbit, slightly off-axis.", spec: "Single tilted ellipse around bold core.", draw: () => ell(32, 32, 19, 10, "l-ink", 3, 28) + nodeAt(32, 32, 6, "l-fill-sage") },
      { vname: "Binary Shared World", concept: "Two cores agreeing on one path.", spec: "Twin dots on a shared ellipse.", draw: () => ell(32, 32, 18, 11, "l-ink", 3) + nodeAt(14, 32, 4.6, "l-fill-ink") + nodeAt(50, 32, 4.6, "l-fill-sage") },
      { vname: "Sweep And Contact", concept: "Scanning, and finding.", spec: "Bold circle with sweep hand to blip.", draw: () => circ(32, 32, 19, "l-ink", 3.2) + line(32, 32, pt(32, 32, 19, -Math.PI / 3)[0], pt(32, 32, 19, -Math.PI / 3)[1], "l-sage", 3) + nodeAt(25, 25, 3.4, "l-fill-sage") },
      { vname: "Triple Halo Stack", concept: "Presence in three registers.", spec: "Faint, sage, solid concentric rings.", draw: () => circ(32, 32, 21, "l-faint", 1.8) + circ(32, 32, 15, "l-sage", 2.8) + circ(32, 32, 9, "l-ink", 3.4) },
      { vname: "Moonrise Over Ring", concept: "Rising past the boundary.", spec: "Horizon rule with dome and moon.", draw: () => line(8, 44, 56, 44, "l-ink", 3) + arc(32, 44, 14, Math.PI, TAU, "l-dim", 2.6) + nodeAt(32, 30, 4.4, "l-fill-sage") },
      { vname: "Tri Plane Web", concept: "Three planes cannot share a point twice.", spec: "Ellipses at sixty degrees with core.", draw: () => [0, 60, 120].map((deg) => ell(32, 32, 18, 6.5, deg === 0 ? "l-ink" : deg === 60 ? "l-sage" : "l-dim", 2.4, deg)).join("") + nodeAt(32, 32, 3.4, "l-fill-ink") },
      { vname: "Open Orbit Comet II", concept: "Unfinished on purpose.", spec: "Heavy open ring with comet head.", draw: () => arc(32, 32, 16, 0.45, TAU - 0.45, "l-ink", 3.8) + nodeAt(pt(32, 32, 16, TAU - 0.45)[0], pt(32, 32, 16, TAU - 0.45)[1], 4.4, "l-fill-sage") },
      { vname: "Chronometer Face", concept: "Twelve positions, one choice.", spec: "Tick ring with sage hand and hub.", draw: () => { let s = circ(32, 32, 18, "l-ink", 3); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; s += line(pt(32, 32, 15, a)[0], pt(32, 32, 15, a)[1], pt(32, 32, 18, a)[0], pt(32, 32, 18, a)[1], "l-dim", 1.8); } return s + line(32, 32, pt(32, 32, 11, -Math.PI / 3)[0], pt(32, 32, 11, -Math.PI / 3)[1], "l-sage", 3.2) + nodeAt(32, 32, 3.2, "l-fill-ink"); } },
      { vname: "Closest Approach Mark", concept: "The near pass, celebrated.", spec: "Orbit with emphasized perigee node.", draw: () => ell(32, 32, 19, 12, "l-faint", 2) + nodeAt(51, 32, 5.5, "l-fill-sage") + nodeAt(32, 32, 4, "l-fill-ink") + link(32, 32, 47, 32, 1.8, "l-dim") },
      { vname: "Apapsis Ghost", concept: "Where it was; where it will be.", spec: "Ghost position opposite live satellite.", draw: () => ell(32, 32, 19, 12, "l-faint", 2) + nodeAt(13, 32, 3, "l-fill-dim") + nodeAt(51, 32, 5, "l-fill-sage") + nodeAt(32, 32, 4, "l-fill-ink") },
      { vname: "Concentric Resolve", concept: "Three rings, all centered.", spec: "Target of bold concentric circles.", draw: () => circ(32, 32, 20, "l-ink", 3.4) + circ(32, 32, 12.5, "l-sage", 3) + nodeAt(32, 32, 4, "l-fill-ink") },
      { vname: "Ring Pass Disc", concept: "The band that circles the body.", spec: "Solid disc wearing a passing band.", draw: () => dot(32, 32, 13, "l-fill-ink") + ell(32, 32, 22, 7, "l-sage", 3) + nodeAt(52, 29, 3.4, "l-fill-sage") },
      { vname: "Ascent Arc Trio", concept: "Leaving in stages.", spec: "Nested arcs stepping from source dot.", draw: () => nodeAt(32, 46, 4.4, "l-fill-ink") + arc(32, 48, 10, -Math.PI * 0.74, -Math.PI * 0.26, "l-faint", 2.2) + arc(32, 48, 16, -Math.PI * 0.72, -Math.PI * 0.28, "l-dim", 2.8) + arc(32, 48, 22, -Math.PI * 0.68, -Math.PI * 0.32, "l-ink", 3.4) },
    ],
  },
  {
    id: "resonant-hex",
    name: "Resonant Hex",
    seed: 3114,
    variants: [
      { vname: "Broadcast Apex Hex", concept: "The cell that announces itself.", spec: "Hex with signal arcs off the crown.", draw: () => hexStroke(32, 39, 17) + arc(32, 20, 6, -Math.PI * 0.75, -Math.PI * 0.25, "l-sage", 2.6) + arc(32, 20, 11, -Math.PI * 0.72, -Math.PI * 0.28, "l-dim", 2.2) + nodeAt(32, 39, 3.4, "l-fill-ink") },
      { vname: "Radar Sweep Cell", concept: "Scanning every corner of the workspace.", spec: "Sweep ring and blip framed by hex.", draw: () => hexStroke(32, 32, 21) + circ(32, 32, 13, "l-faint", 1.8) + line(32, 32, pt(32, 32, 13, -Math.PI / 3)[0], pt(32, 32, 13, -Math.PI / 3)[1], "l-sage", 2.8) + nodeAt(26, 26, 3, "l-fill-sage") },
      { vname: "Vitals Across Cell", concept: "Alive between the walls.", spec: "Pulse channel crossing the hex.", draw: () => hexStroke(32, 32, 20) + strokeOnly("M13 34 H24 L28 26 L33 42 L37 34 H51", "l-sage", 3) },
      { vname: "Mast In Cell", concept: "A station built into the badge.", spec: "Antenna mast with side waves in hex.", draw: () => hexStroke(32, 33, 21) + line(32, 22, 32, 42, "l-ink", 3) + line(24, 46, 32, 40, "l-dim", 2.2) + line(40, 46, 32, 40, "l-dim", 2.2) + arc(23, 30, 6.5, -Math.PI * 0.45, Math.PI * 0.45, "l-sage", 2.4) + arc(41, 30, 6.5, Math.PI * 0.55, Math.PI * 1.45, "l-sage", 2.4) },
      { vname: "Beacon Word Cell", concept: "The word, glowing from its cell.", spec: "Solid hex omega with radiating ray ticks.", draw: () => hexFill(32, 34, 15) + omegaArc(32, 35, 8, 58, "l-paper", 2.8, 3.5) + Array.from({ length: 8 }, (_, i) => { if (i === 5 || i === 6) return ""; const a = (i / 8) * TAU; return line(pt(32, 34, 19, a)[0], pt(32, 34, 19, a)[1], pt(32, 34, 24, a)[0], pt(32, 34, 24, a)[1], i % 2 ? "l-sage" : "l-ink", 2.4); }).join("") },
      { vname: "Sonar Core Cell", concept: "Listening in all directions.", spec: "Fading rings around core in hex.", draw: () => hexStroke(32, 32, 21) + nodeAt(32, 32, 4, "l-fill-ink") + circ(32, 32, 9.5, "l-dim", 2.2) + circ(32, 32, 15, "l-faint", 1.8) },
      { vname: "Uplink Bars Cell", concept: "Everything sent upward.", spec: "Stacked arcs over source in hex.", draw: () => hexStroke(32, 36, 20) + nodeAt(32, 44, 4.2, "l-fill-ink") + arc(32, 47, 10, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 2.8) + arc(32, 47, 16, -Math.PI * 0.66, -Math.PI * 0.34, "l-faint", 2.2) },
      { vname: "Echo Between Cells", concept: "One says it; the other repeats it.", spec: "Twin cells with echo arcs between.", draw: () => hexStroke(13, 32, 10) + hexStroke(51, 32, 10) + arc(27, 32, 7, -Math.PI * 0.42, Math.PI * 0.42, "l-sage", 2.6) + arc(37, 32, 7, Math.PI * 0.58, Math.PI * 1.42, "l-dim", 2.4) },
      { vname: "Whip Antenna Badge", concept: "Reach extended past the frame.", spec: "Whip antenna breaking the hex top.", draw: () => hexStroke(32, 40, 16) + line(40, 34, 40, 6, "l-ink", 3) + nodeAt(40, 5, 2.8, "l-fill-sage") + nodeAt(32, 40, 3, "l-fill-dim") },
      { vname: "Ping And Reply Cell", concept: "Asked upward; answered downward.", spec: "Bidirectional ping arcs in hex.", draw: () => hexStroke(32, 32, 20) + nodeAt(32, 32, 4, "l-fill-ink") + arc(32, 29, 8, -Math.PI * 0.72, -Math.PI * 0.28, "l-sage", 2.8) + arc(32, 35, 8, Math.PI * 0.28, Math.PI * 0.72, "l-dim", 2.4) },
      { vname: "Facing Resonators", concept: "Two antennas agreeing.", spec: "Mirror arcs sharing a core.", draw: () => nodeAt(32, 32, 4, "l-fill-ink") + arc(22, 32, 8, -Math.PI * 0.42, Math.PI * 0.42, "l-sage", 3) + arc(42, 32, 8, Math.PI * 0.58, Math.PI * 1.42, "l-sage", 3) },
      { vname: "Beacon Tower Solo", concept: "Small structure, wide reach.", spec: "Tower mast with paired beam wedges.", draw: () => poly([[27, 54], [29.5, 28], [34.5, 28], [37, 54]], "l-fill-ink") + poly([[8, 20], [23, 28], [8, 32]], "l-fill-sage") + poly([[56, 20], [41, 28], [56, 32]], "l-fill-sage") + line(18, 54, 46, 54, "l-dim", 2.4) },
      { vname: "Round Vitals Disc", concept: "The heartbeat minted round.", spec: "Disc with paper pulse channel.", draw: () => dot(32, 32, 19, "l-fill-sage") + strokeOnly("M14 34 H24 L28 26 L33 42 L37 34 H50", "l-paper", 3.6) },
      { vname: "Wrapped Sine Ring", concept: "The wave held in a boundary.", spec: "Circle containing a sine strand.", draw: () => circ(32, 32, 19, "l-ink", 3) + strokeOnly("M18 32 Q23 26 28 32 T38 32 T48 32", "l-sage", 2.8) },
      { vname: "Square Wave Cell", concept: "Digital pulses in analog clothes.", spec: "Square-wave train inside hex.", draw: () => hexStroke(32, 32, 21) + raw(`<path d="M14 38 H22 V26 H31 V38 H40 V26 H49" fill="none" class="l-sage" style="stroke-width:2.8"/>`) },
      { vname: "Paired Beacon Wedges", concept: "Light thrown both ways.", spec: "Core dot emitting twin wedges.", draw: () => nodeAt(32, 32, 5, "l-fill-ink") + poly([[8, 22], [22, 29], [8, 35]], "l-fill-sage") + poly([[56, 22], [42, 29], [56, 35]], "l-fill-sage") },
      { vname: "Approach Compress Hex", concept: "Getting closer all the time.", spec: "Compressing arcs toward hex wall.", draw: () => hexStroke(32, 32, 21) + nodeAt(20, 32, 4, "l-fill-ink") + arc(30, 32, 8, -Math.PI * 0.42, Math.PI * 0.42, "l-sage", 2.6) + arc(38, 32, 8, -Math.PI * 0.4, Math.PI * 0.4, "l-dim", 2.2) + arc(45, 32, 8, -Math.PI * 0.38, Math.PI * 0.38, "l-faint", 1.8) },
      { vname: "Send Up Cell", concept: "Report everything upward.", spec: "Dot with double uplink arcs in hex.", draw: () => hexStroke(32, 37, 19) + nodeAt(32, 43, 4.2, "l-fill-ink") + arc(32, 46, 10, -Math.PI * 0.74, -Math.PI * 0.26, "l-sage", 2.8) + arc(32, 46, 16, -Math.PI * 0.68, -Math.PI * 0.32, "l-faint", 2.2) },
      { vname: "Heartbeat Rail Heavy", concept: "Mostly quiet, occasionally loud.", spec: "Heavy rail with single spike and node.", draw: () => line(6, 36, 20, 36, "l-ink", 3.6) + strokeOnly("M20 36 L27 20 L34 48 L39 36 H58", "l-ink", 3.6) + nodeAt(27, 20, 3.2, "l-fill-sage") },
      { vname: "Triple Mast Array", concept: "Coverage from every angle.", spec: "Three fanned masts from one base.", draw: () => line(32, 52, 32, 20, "l-ink", 3) + line(18, 52, 24, 26, "l-ink", 2.8) + line(46, 52, 40, 26, "l-ink", 2.8) + line(10, 54, 54, 54, "l-dim", 2.4) + nodeAt(32, 17, 3, "l-fill-sage") + nodeAt(23, 23, 2.6) + nodeAt(41, 23, 2.6) },
    ],
  },
  {
    id: "cut-light-tiles",
    name: "Cut Light Tiles",
    seed: 3112,
    variants: [
      { vname: "Stair Tile III", concept: "Progress cut clean and deep.", spec: "Ink tile, bold ascending paper stairs.", draw: () => tile("l-fill-ink") + paperFill("M14 50 H25 V39 H36 V28 H47 V17 H50 V50 Z") },
      { vname: "Terrace Tile III", concept: "Three calm steps of light.", spec: "Sage tile with terrace bars.", draw: () => tile() + rectR(17, 19, 30, 7, 3.5, "l-fill-paper") + rectR(17, 29.5, 22, 7, 3.5, "l-fill-paper") + rectR(17, 40, 30, 7, 3.5, "l-fill-paper") },
      { vname: "Twin Wedge Tile", concept: "Open on exactly two fronts.", spec: "Opposite paper wedges on ink tile.", draw: () => tile("l-fill-ink") + path("M32 32 L32 12 A20 20 0 0 1 52 32 Z", "l-fill-paper") + path("M32 32 L32 52 A20 20 0 0 1 12 32 Z", "l-fill-paper") },
      { vname: "Keyhole Tile II", concept: "One way in, kept locked.", spec: "Keyhole void on sage tile.", draw: () => tile() + dot(32, 26, 6.5, "l-fill-paper") + poly([[26.5, 29.5], [37.5, 29.5], [35, 46], [29, 46]], "l-fill-paper") },
      { vname: "Twin Slot Tile", concept: "Counting in twos.", spec: "Two vertical slots of light.", draw: () => tile() + rectR(21, 16, 7, 32, 3.5, "l-fill-paper") + rectR(36, 16, 7, 32, 3.5, "l-fill-paper") },
      { vname: "Single Peak Tile", concept: "One direction, boldly.", spec: "Large paper chevron on ink tile.", draw: () => tile("l-fill-ink") + strokeOnly("M18 42 L32 26 L46 42", "l-paper", 5) },
      { vname: "Diamond Void Tile", concept: "A gem set into darkness.", spec: "Rotated square hole in ink tile.", draw: () => tile("l-fill-ink") + poly([[32, 17], [47, 32], [32, 47], [17, 32]], "l-fill-paper") },
      { vname: "Plus Void Tile II", concept: "Adding, as identity.", spec: "Thick cross void on sage tile.", draw: () => tile() + rectR(26.5, 15, 11, 34, 5, "l-fill-paper") + rectR(15, 26.5, 34, 11, 5, "l-fill-paper") },
      { vname: "Bite Moon Tile", concept: "Phases on the face of it.", spec: "Crescent bite on ink tile.", draw: () => tile("l-fill-ink") + bgCircle(41, 25, 13) },
      { vname: "Archway Tile", concept: "A door opened upward.", spec: "Arch void rising from base.", draw: () => tile("l-fill-ink") + paperFill("M21 58 V38 A11 11 0 0 1 43 38 V58 Z") },
      { vname: "Vertical Comb Tile", concept: "Even teeth standing tall.", spec: "Four vertical light slots.", draw: () => tile("l-fill-ink") + [17, 26, 35, 44].map((x) => rectR(x, 16, 4, 32, 2, "l-fill-paper")).join("") },
      { vname: "Current Channel Tile", concept: "Flow given its channel.", spec: "Wave channel through sage tile.", draw: () => tile() + strokeOnly("M12 32 Q20 24 28 32 T44 32 T60 32", "l-paper", 5.5) },
      { vname: "Charge Tile", concept: "Energy under calm skin.", spec: "Bolt void on ink tile.", draw: () => tile("l-fill-ink") + paperFill("M37 13 L23 33 H31 L27 51 L43 29 H34 L39 13 Z") },
      { vname: "Order Matrix Tile", concept: "Everything in its place.", spec: "3x3 paper dot matrix on tile.", draw: () => tile("l-fill-ink") + [23, 32, 41].map((y) => [23, 32, 41].map((x) => dot(x, y, 2.8, "l-fill-paper")).join("")).join("") },
      { vname: "Half Light Tile", concept: "Day side, night side.", spec: "Lower half removed, disc remaining.", draw: () => tile() + rectR(6, 33, 52, 25, 0, "l-fill-paper") + circ(32, 32, 10, "l-fill-ink") },
      { vname: "Signed Notch Tile", concept: "Marked where it matters.", spec: "Corner notch with offset sage dot.", draw: () => tile("l-fill-ink") + poly([[58, 6], [58, 26], [38, 6]], "l-fill-paper") + nodeAt(31, 37, 5.5, "l-fill-sage") },
      { vname: "Worn Groove Tile", concept: "A path used so often it shows.", spec: "Spiral groove on sage tile.", draw: () => tile() + strokeOnly("M32 19 A13 13 0 1 1 19 32 A16 16 0 1 0 48 32", "l-paper", 5) },
      { vname: "Summit Silhouette Tile", concept: "The mountain kept in mind.", spec: "Peak silhouette void on tile.", draw: () => tile("l-fill-ink") + paperFill("M14 50 L30 20 L38 32 L44 24 L50 50 Z") },
      { vname: "Off Center Ring Tile", concept: "Almost aligned — alive.", spec: "Eccentric paper ring on tile.", draw: () => tile() + circ(28, 29, 11, "l-paper", 4.5) },
      { vname: "Seam Dot Tile", concept: "Two materials meeting on a point.", spec: "Diagonal split with seam dot.", draw: () => poly([[6, 6], [58, 6], [58, 58]], "l-fill-ink") + poly([[6, 6], [58, 58], [6, 58]], "l-fill-sage") + nodeAt(32, 32, 4, "l-fill-paper") },
    ],
  },
  {
    id: "stacked-cells",
    name: "Stacked Cells",
    seed: 3113,
    variants: [
      { vname: "Cell Pair Vertical", concept: "Two storeys of the hive.", spec: "Two hexes stacked vertex to vertex.", draw: () => hexStroke(32, 16, 11) + hexFill(32, 43, 11) },
      { vname: "Cell Tower Trio", concept: "Three floors, one structure.", spec: "Column of three cells.", draw: () => hexStroke(32, 9.5, 8, "l-faint", 2) + hexStroke(32, 25.5, 8) + hexFill(32, 41.5, 8) + line(32, 52, 32, 58, "l-ink", 3) },
      { vname: "Receding Cell Stack", concept: "Depth by repetition.", spec: "Three cells shrinking upward.", draw: () => hexStroke(32, 46, 15) + hexStroke(32, 30, 11, "l-dim", 2.4) + hexFill(32, 17, 7.5) },
      { vname: "Twin Towers Cells", concept: "Side by side at different heights.", spec: "Two cell columns, unequal.", draw: () => hexFill(20, 20, 10) + hexFill(20, 40, 10) + hexStroke(44, 30, 10) + hexFill(44, 50, 10) },
      { vname: "Shrinking Totem", concept: "Focused as it rises.", spec: "Cells shrinking toward apex dot.", draw: () => hexStroke(32, 48, 13) + hexStroke(32, 28, 9, "l-dim", 2.4) + nodeAt(32, 12, 4.4, "l-fill-sage") },
      { vname: "Adjoined Pair", concept: "Sharing a wall — the hive way.", spec: "Two cells flush along one edge.", draw: () => hexStroke(21, 26, 12) + hexFill(43, 38, 12) },
      { vname: "Honeycomb Steps Up", concept: "The staircase built from cells.", spec: "Ascending stair of three cells.", draw: () => hexStroke(14, 48, 9.5) + hexFill(32, 34, 9.5) + hexStroke(50, 20, 9.5, "l-sage", 2.8) },
      { vname: "Six Cell Pyramid", concept: "Mass arranged to a point.", spec: "3-2-1 hex pyramid with sage cap.", draw: () => hexStroke(13, 47, 8.5) + hexFill(32, 47, 8.5) + hexStroke(51, 47, 8.5) + hexStroke(22, 31, 8.5) + hexFill(41, 31, 8.5, "l-fill-sage") + hexFill(32, 15, 8.5) },
      { vname: "Levitating Top Cell", concept: "The best layer floats.", spec: "Stack below, hovering cell above.", draw: () => hexFill(32, 44, 12) + hexStroke(32, 18, 9, "l-sage", 2.8) + line(24, 30, 40, 30, "l-faint", 1.6) },
      { vname: "Interlocked Cell Chain", concept: "Linked without breaking.", spec: "Two overlapping hex outlines chained.", draw: () => poly(reg(23, 32, 13, 6), "l-ink", 3) + poly(reg(41, 32, 13, 6), "l-sage", 3) },
      { vname: "Cell With Echo", concept: "Every action leaves a copy.", spec: "Solid hex with offset faint duplicate.", draw: () => hexStroke(37, 37, 15, "l-faint", 2) + hexFill(29, 29, 15) },
      { vname: "Zigzag Cell Stack", concept: "Alternating balance.", spec: "Offset alternating stack.", draw: () => hexFill(22, 14, 9) + hexFill(42, 27, 9) + hexFill(22, 40, 9) + hexFill(42, 53, 9, "l-fill-dim") },
      { vname: "Foundation Slab Cell", concept: "Wide base, focused top.", spec: "Wide flat hex under small cell.", draw: () => poly([[6, 40], [19, 33], [45, 33], [58, 40], [45, 47], [19, 47]], "l-fill-dim") + hexFill(32, 20, 11) },
      { vname: "Fanned Cell Trio", concept: "Options spread like cards.", spec: "Three cells rotated around low pivot.", draw: () => [[-24, "l-faint"], [0, "l-ink"], [24, "l-sage"]].map(([deg, cls]) => raw(`<g transform="rotate(${deg} 32 54)">`) + hexStroke(32, 26, 9, cls, 2.8) + raw(`</g>`)).join("") },
      { vname: "Outline Under Solid", concept: "Support drawn, weight shown.", spec: "Outline base cell holding solid cell.", draw: () => hexStroke(32, 44, 14, "l-faint", 2.4) + hexFill(32, 22, 14) },
      { vname: "Uneven Twin Columns", concept: "Growth is never symmetrical.", spec: "Adjacent columns of two and one.", draw: () => hexFill(20, 18, 9.5) + hexFill(20, 37, 9.5) + hexFill(20, 56, 9.5, "l-fill-dim") + hexFill(44, 28, 9.5) + hexStroke(44, 47, 9.5) },
      { vname: "Column By Rail", concept: "Guided growth.", spec: "Cell column beside vertical rail.", draw: () => line(52, 8, 52, 56, "l-ink", 3.2) + hexFill(28, 14, 9) + hexFill(28, 32, 9) + hexFill(28, 50, 9) },
      { vname: "Capsuled Cell Run", concept: "Contained expansion.", spec: "Stadium outline over three solid cells.", draw: () => raw(`<rect x="8" y="18" width="48" height="28" rx="14" fill="none" class="l-ink" style="stroke-width:3"/>`) + hexFill(21, 32, 7, "l-fill-dim") + hexFill(32, 32, 7) + hexFill(43, 32, 7, "l-fill-sage") },
      { vname: "Weighted Base Pair", concept: "Low center, high reach.", spec: "Large solid low, small solid high.", draw: () => hexFill(32, 44, 15) + hexFill(32, 17, 8, "l-fill-sage") },
      { vname: "Diagonal Cascade", concept: "Overflowing gracefully.", spec: "Four cells stepping down-right.", draw: () => hexStroke(12, 12, 8) + hexStroke(26, 25, 8, "l-dim", 2.4) + hexFill(40, 38, 8) + hexFill(54, 51, 8, "l-fill-sage") },
    ],
  },
  {
    id: "emblem-lockups",
    name: "Emblem Lockups",
    seed: 3115,
    variants: [
      { vname: "Hex Omega Standard", concept: "The complete signature lockup.", spec: "Hex badge omega over baseline bar.", draw: () => hexStroke(32, 26, 17) + omegaArc(32, 27, 9, 56, "l-ink", 3, 4) + rectR(14, 50, 36, 4.5, 2, "l-fill-sage") },
      { vname: "Omega Rule Period", concept: "Stated, underlined, finished.", spec: "Omega, underline rule, period dot.", draw: () => omegaArc(29, 30, 13, 55, "l-ink", 3.4, 4.5) + line(12, 48, 46, 48, "l-ink", 3.4) + nodeAt(53, 47, 3.4, "l-fill-sage") },
      { vname: "Badge With Nameplate Bars", concept: "Mark and wordmark in one breath.", spec: "Hex badge beside abstract name bars.", draw: () => hexFill(20, 32, 14) + paperFill("M25 39 V35.5 Q21 33.5 21 29 Q21 24 20? ", "l-x") },
      { vname: "Crest Ribbon Omega", concept: "Honors, attached.", spec: "Shield hex omega with banner strip.", draw: () => hexStroke(32, 24, 16) + omegaArc(32, 25, 8.5, 56, "l-ink", 3, 3.5) + poly([[12, 46], [52, 46], [52, 56], [32, 50], [12, 56]], "l-fill-sage") },
      { vname: "Sealed Omega Rules", concept: "Certified from both sides.", spec: "Circle seal with flanking rules.", draw: () => line(4, 32, 14, 32, "l-dim", 2.6) + line(50, 32, 60, 32, "l-dim", 2.6) + circ(32, 32, 17, "l-ink", 2.8) + omegaArc(32, 33, 10.5, 56, "l-ink", 3, 4) },
      { vname: "Tile Baseline Lockup", concept: "Icon plus baseline, dock-ready.", spec: "Tile mark with external rule bar.", draw: () => tile() + omegaArc(32, 30, 10, 56, "l-paper", 3, 4) + rectR(10, 50, 44, 4.5, 2, "l-fill-paper") },
      { vname: "Pill Omega Bars", concept: "Compact lockup for tight spaces.", spec: "Pill badge with trailing text bars.", draw: () => rectR(8, 22, 26, 20, 10, "l-fill-sage") + omegaArc(21, 32.5, 7, 58, "l-paper", 2.6, 3) + rectR(38, 27, 18, 4, 2, "l-fill-ink") + rectR(38, 35, 12, 4, 2, "l-fill-dim") },
      { vname: "Arc Trio Over Omega", concept: "A constellation above the word.", spec: "Three small hexes arced over omega.", draw: () => hexStroke(14, 18, 6.5, "l-faint", 2.2) + hexStroke(32, 12, 6.5, "l-ink", 2.4) + hexStroke(50, 18, 6.5, "l-faint", 2.2) + omegaArc(32, 44, 13, 55, "l-ink", 3.4, 5) },
      { vname: "Wired Word Emblem", concept: "Fully wired, fully framed.", spec: "Omega with traces inside corner frame.", draw: () => path("M10 22 V10 H22", "l-dim", 2.6) + path("M42 10 H54 V22", "l-dim", 2.6) + path("M54 42 V54 H42", "l-dim", 2.6) + path("M22 54 H10 V42", "l-dim", 2.6) + omegaArc(32, 30, 10.5, 56, "l-ink", 3.2, 4) + line(24, 48, 40, 48, "l-sage", 3) + nodeAt(24, 48, 2.4, "l-fill-sage"),
      },
      { vname: "Vertical Stack Emblem", concept: "Everything in its column.", spec: "Hex, omega, and rule stacked.", draw: () => hexStroke(32, 14, 10) + omegaArc(32, 36, 10, 56, "l-ink", 3.2, 4) + line(18, 54, 46, 54, "l-sage", 3.4) },
      { vname: "Flag Omega Standard", concept: "Planted and claimed.", spec: "Omega pennant on pole with base.", draw: () => line(18, 8, 18, 54, "l-ink", 3.4) + line(12, 54, 24, 54, "l-ink", 3) + poly([[18, 10], [50, 19], [18, 28]], "l-fill-sage") + omegaArc(30, 19, 5.5, 60, "l-paper", 2.2, 2.5) },
      { vname: "Squared Frame Hex Omega", concept: "Straight frame, hex heart.", spec: "Square frame containing hex omega.", draw: () => rectR(8, 8, 48, 48, 6, "l-ink", 2.8) + hexStroke(32, 32, 15, "l-sage", 2.8) + omegaArc(32, 32.5, 7, 58, "l-ink", 2.6, 3) },
      { vname: "Bannered Word Omega", concept: "Carried on its own banner.", spec: "Omega above notched ribbon.", draw: () => omegaArc(32, 26, 12, 55, "l-ink", 3.4, 4.5) + poly([[14, 44], [50, 44], [50, 54], [32, 49], [14, 54]], "l-fill-sage") },
      { vname: "Registration Omega", concept: "Print-ready by nature.", spec: "Corner ticks framing centered omega.", draw: () => path("M10 20 V10 H20", "l-dim", 2.6) + path("M44 10 H54 V20", "l-dim", 2.6) + path("M54 44 V54 H44", "l-dim", 2.6) + path("M20 54 H10 V44", "l-dim", 2.6) + omegaArc(32, 33, 11, 56, "l-ink", 3.2, 4) },
      { vname: "Engraved Plate Omega", concept: "Mounted where decisions are made.", spec: "Plaque with engraved omega and screws.", draw: () => rectR(10, 14, 44, 36, 6, "l-ink", 3) + nodeAt(16, 20, 2, "l-fill-dim") + nodeAt(48, 20, 2, "l-fill-dim") + nodeAt(16, 44, 2, "l-fill-dim") + nodeAt(48, 44, 2, "l-fill-dim") + omegaArc(32, 32, 10.5, 56, "l-sage", 3, 4) },
      { vname: "Medallion Reeded Omega", concept: "Struck like currency of the realm.", spec: "Reeded coin rim around omega.", draw: () => circ(32, 32, 20, "l-ink", 3) + Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * TAU; return line(pt(32, 32, 16.5, a)[0], pt(32, 32, 16.5, a)[1], pt(32, 32, 19, a)[0], pt(32, 32, 19, a)[1], "l-faint", 1.4); }).join("") + omegaArc(32, 32.5, 10, 56, "l-sage", 2.8, 3.5) },
      { vname: "Right Banner Omega", concept: "Wordmark block anchored right.", spec: "Omega mark with side name bars.", draw: () => omegaArc(22, 32, 12, 56, "l-ink", 3.2, 4) + rectR(38, 24, 18, 6, 3, "l-fill-ink") + rectR(38, 35, 13, 5, 2.5, "l-fill-sage") },
      { vname: "Winged Hex Omega", concept: "Speed attributed to the badge.", spec: "Hex omega with flanking wing bars.", draw: () => hexStroke(32, 32, 16) + omegaArc(32, 32.5, 8.5, 58, "l-ink", 2.8, 3.5) + line(4, 26, 12, 29, "l-dim", 2.8) + line(4, 38, 12, 35, "l-dim", 2.8) + line(60, 26, 52, 29, "l-dim", 2.8) + line(60, 38, 52, 35, "l-dim", 2.8) },
      { vname: "Pillared Word Hall", concept: "Housed between columns.", spec: "Omega between pillars on plinth.", draw: () => rectR(12, 12, 7, 34, 3, "l-fill-ink") + rectR(45, 12, 7, 34, 3, "l-fill-ink") + omegaArc(32, 30, 9.5, 58, "l-sage", 3, 3.5) + rectR(8, 48, 48, 6, 3, "l-fill-ink") },
      { vname: "Master Cell Emblem", concept: "Everything learned so far, one mark.", spec: "Orbit ring around hex omega on baseline.", draw: () => ell(32, 27, 21, 8, "l-faint", 1.8) + hexStroke(32, 27, 13) + omegaArc(32, 27.5, 7, 58, "l-ink", 2.8, 3) + nodeAt(pt(32, 27, 21, -0.6)[0], 27 + 8 * Math.sin(-0.6), 3.2, "l-fill-sage") + rectR(16, 50, 32, 4.5, 2, "l-fill-sage") },
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
// 300 DISTINCT OmniAgent logo marks, iteration 3 — hex-circuit omegas.
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
