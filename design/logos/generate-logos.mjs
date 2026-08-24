// Procedural generator for the OmniAgent calm-logo study.
// Produces design/logos/logos.js: an array of 300 DISTINCT logo entries.
// Each entry: { id, name, family, familyId, concept, spec, svg }.
// Logos are parametric SVGs (viewBox 0 0 64 64) themed via class hooks
// (.l-ink / .l-sage / .l-dim / .l-faint / .l-fill-*) resolved in logos.css.
//
// IMPORTANT: every one of the 300 marks is a structurally distinct composition
// (different primitives, counts, orientations, open/closed forms) — NOT a
// jittered re-render of the same concept. 15 families x 20 distinct marks.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- deterministic RNG (mulberry32) -----------------------------------------
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

// ---- svg primitives ---------------------------------------------------------
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

const reg = (cx, cy, r, n, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => pt(cx, cy, r, rot + (i * TAU) / n));
const starPts = (cx, cy, ro, ri, n, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) =>
    pt(cx, cy, i % 2 ? ri : ro, rot + (i * Math.PI) / n)
  );
const ptsStr = (pts) => pts.map((p) => p.map(f).join(",")).join(" ");

const wrap = (inner) =>
  `<svg class="logo-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

// helper: concentric rings (count, ratio step)
function rings(cx, cy, r0, count, cls, w) {
  let s = "";
  for (let i = 0; i < count; i++) s += circ(cx, cy, r0 * (1 - i * 0.22), i === 0 ? cls : "l-sage", i === 0 ? w : Math.max(1.2, w - 0.3));
  return s;
}
// helper: radiating arms
function arms(cx, cy, n, r0, r1, cls, w) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const [x0, y0] = pt(cx, cy, r0, a);
    const [x1, y1] = pt(cx, cy, r1, a);
    s += line(x0, y0, x1, y1, i % 2 ? cls : "l-dim", w || 1.6);
  }
  return s;
}
// helper: node graph from center
function spokeGraph(cx, cy, n, r, cls, w) {
  let s = dot(cx, cy, 3.4, "l-fill-sage");
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    const [x, y] = pt(cx, cy, r, a);
    s += line(cx, cy, x, y, "l-dim", w || 1.3);
    s += circ(x, y, 2.8, "l-ink", 1.3);
  }
  return s;
}

// =============================================================================
// FAMILY DEFINITIONS — each family has 20 structurally distinct marks.
// variants: { vname, concept, spec, draw(rng) }  (draw returns inner SVG)
// =============================================================================

const FAMILIES = [
  // 1. PAPER & FOLD -----------------------------------------------------------
  {
    id: "paper-fold",
    name: "Paper & Fold",
    seed: 11,
    variants: [
      { vname: "Dogear", concept: "A calm sheet with one corner turned down — the page kept.", spec: "Folded corner, paper-fill flap over ink outline.", draw: () => path(`M15 13 H44 L49 18 V51 H15 Z`, "l-ink") + poly([[44,13],[49,18],[44,18]], "l-fill-paper") + path(`M44 13 L49 18 L44 18 Z`, "l-dim") },
      { vname: "Crane", concept: "An origami form from one continuous triangle.", spec: "Equilateral fold, sage spine, dim stem.", draw: (rng) => { const ax=jit(rng,32,3); return poly([[ax,18],[15,45],[49,45]], "l-ink") + path(`M${ax} 18 L49 45`, "l-sage") + line(ax,45,ax,52,"l-dim"); } },
      { vname: "Stack", concept: "Three sheets offset like a resting manuscript.", spec: "Three parallelograms, ink/sage/dim.", draw: () => poly([[14,48],[40,30],[54,37],[28,55]], "l-dim") + poly([[18,45],[44,27],[52,33],[26,51]], "l-sage") + poly([[22,42],[48,24],[50,30],[24,48]], "l-ink") },
      { vname: "Stack Tall", concept: "Four sheets, a small quiet ream.", spec: "Four offset leaves, alternating.", draw: () => poly([[18,50],[40,34],[52,40],[30,56]], "l-faint") + poly([[20,47],[42,31],[50,36],[28,52]], "l-sage") + poly([[22,44],[44,28],[49,32],[27,48]], "l-dim") + poly([[24,41],[46,25],[48,29],[26,45]], "l-ink") },
      { vname: "Accordion", concept: "A bellows of parallel folds, breath held in pleats.", spec: "Five pleats alternating ink and sage.", draw: () => { let s=""; const n=5; for(let i=0;i<n;i++){const x=16+i*(32/n);const x2=x+32/n; s+=path(`M${x} 16 L${x2} 26 L${x} 36 L${x2} 46 L${x} 52`, i%2?"l-sage":"l-ink");} return s; } },
      { vname: "Accordion Six", concept: "A tighter bellows, six pleats.", spec: "Six pleats, ink/sage alternation.", draw: () => { let s=""; const n=6; for(let i=0;i<n;i++){const x=15+i*(34/n);const x2=x+34/n; s+=path(`M${x} 18 L${x2} 27 L${x} 36 L${x2} 45 L${x} 50`, i%2?"l-sage":"l-ink", 1.8);} return s; } },
      { vname: "Sail", concept: "A folded sail and a still waterline.", spec: "Triangle sail on dim mast above sage waterline.", draw: (rng) => { const mx=jit(rng,32,2); return line(mx,12,mx,50,"l-dim") + poly([[mx,16],[mx+14,44],[mx,44]], "l-ink") + line(12,52,52,52,"l-sage",1.6) + path(`M18 50 q4 -3 8 0 t8 0 t8 0`,"l-faint",1.2); } },
      { vname: "Envelope", concept: "A calm envelope, the message at rest.", spec: "Rectangle with sage flap diagonals.", draw: () => rectR(16,18,32,28,3,"l-ink",2) + path(`M16 19 L32 35 L48 19`,"l-sage",1.8) },
      { vname: "Envelope Open", concept: "An opened envelope, flap lifted.", spec: "Rect with upward sage flap.", draw: () => rectR(16,22,32,24,3,"l-ink",2) + path(`M16 22 L32 12 L48 22`,"l-sage",1.8) },
      { vname: "Page Curl", concept: "A sheet with a soft curling corner.", spec: "Rounded rect with curled base corner.", draw: () => path(`M16 14 H47 Q49 14 49 16 V45 Q49 51 43 51 H17 Q16 51 16 50 Z`,"l-ink") + path(`M43 51 Q49 51 49 45 Q44 47 43 51 Z`,"l-fill-sage") },
      { vname: "Scroll", concept: "A rolled scroll, the kept record.", spec: "Two end rolls with a sheet between.", draw: () => rectR(20,22,24,20,2,"l-ink",1.8) + circ(20,32,6,"l-sage",2) + circ(44,32,6,"l-sage",2) },
      { vname: "Map Fold", concept: "A folded map, creased into four.", spec: "Rect with sage cross creases.", draw: () => rectR(16,18,32,28,2,"l-ink",2) + line(32,18,32,46,"l-sage",1.2) + line(16,32,48,32,"l-sage",1.2) },
      { vname: "Book", concept: "An open book, two calm pages.", spec: "Two pages meeting at a spine.", draw: () => path(`M14 20 Q22 16 32 20 V46 Q22 42 14 46 Z`,"l-ink") + path(`M50 20 Q42 16 32 20 V46 Q42 42 50 46 Z`,"l-sage") + line(32,20,32,46,"l-dim",1.2) },
      { vname: "Paper Plane", concept: "A folded plane, the small dispatch.", spec: "Triangle with sage center fold.", draw: () => poly([[12,40],[52,14],[34,46],[24,46]],"l-ink") + path(`M12 40 L52 14 L34 46 Z`,"l-sage") },
      { vname: "Torn Edge", concept: "A sheet with a torn bottom, honesty of paper.", spec: "Rect with jagged sage base.", draw: () => path(`M16 16 H48 V42 L44 46 L40 42 L36 47 L32 42 L28 47 L24 42 L20 46 L16 42 Z`,"l-ink") + path(`M16 16 H48 V42`,"l-sage",1.8) },
      { vname: "Quire", concept: "A bound quire, stitched at the spine.", spec: "Rect with sage binding ticks.", draw: () => rectR(18,16,28,32,2,"l-ink",2) + line(18,32,46,32,"l-sage",1.4) + [22,28,32,36,40].map((y)=>line(22,y,42,y,"l-dim",1)).join("") },
      { vname: "Fan Fold", concept: "A folded fan, the measured spread.", spec: "Sector with sage ribs.", draw: () => path(`M32 50 L14 22 A22 22 0 0 1 50 22 Z`,"l-ink") + [0.25,0.5,0.75].map((t)=>{const a=Math.PI*(1+t);const [x,y]=pt(32,50,30,a); return line(32,50,x,y,"l-sage",1.2);}).join("") },
      { vname: "Ticket", concept: "A ticket stub, notched and kept.", spec: "Rounded rect with two notch dots.", draw: () => rectR(15,22,34,20,4,"l-ink",2) + circ(15,32,2.4,"l-sage") + circ(49,32,2.4,"l-sage") + line(32,22,32,42,"l-dim",1.2) },
      { vname: "Tag", concept: "A luggage tag, the marker of belonging.", spec: "Rounded tag with sage hole.", draw: () => path(`M20 18 H46 Q50 18 50 22 V46 Q50 50 46 50 H20 Q16 50 16 46 V22 Q16 18 20 18 Z`,"l-ink") + circ(33,26,3,"l-sage") + line(33,29,33,44,"l-dim",1.2) },
      { vname: "Letter", concept: "A sealed letter, the calm correspondence.", spec: "Rect with wax-sage seal dot.", draw: () => rectR(16,18,32,28,3,"l-ink",2) + path(`M16 19 L32 33 L48 19`,"l-dim",1.4) + dot(32,38,4,"l-fill-sage") },
    ],
  },

  // 2. ZEN & CIRCLE -----------------------------------------------------------
  {
    id: "zen-circle",
    name: "Zen & Circle",
    seed: 22,
    variants: [
      { vname: "Enso Open", concept: "An open brush ring, whole enough.", spec: "≈300° open ring, sage start node.", draw: () => arc(32,32,18,-Math.PI/2+0.5,-Math.PI/2-0.5+TAU,"l-ink",3) + dot(...pt(32,32,18,-Math.PI/2+0.5),2.4,"l-fill-sage") },
      { vname: "Enso Wide", concept: "A wider-open ensō, more breath.", spec: "≈210° open ring.", draw: () => arc(32,32,17,-Math.PI/2+1.2,-Math.PI/2-1.2+TAU,"l-ink",3) + dot(...pt(32,32,17,-Math.PI/2+1.2),2.4,"l-fill-sage") },
      { vname: "Concentric", concept: "Two calm rings sharing one center.", spec: "Outer ink ring, inner sage ring.", draw: () => circ(32,32,18,"l-ink") + circ(32,32,11,"l-sage",1.8) },
      { vname: "Triple Ring", concept: "Three nested rings, deepening attention.", spec: "Three concentric rings ink/sage/ink.", draw: () => circ(32,32,19,"l-ink") + circ(32,32,13,"l-sage",1.8) + circ(32,32,7,"l-ink",1.8) },
      { vname: "Dot Offset", concept: "A ring holding one quiet mark off-center.", spec: "Ink ring with an offset sage dot.", draw: (rng) => { const dx=jit(rng,32,5),dy=jit(rng,32,5); return circ(32,32,17,"l-ink") + dot(dx,dy,3,"l-fill-sage"); } },
      { vname: "Segmented", concept: "A ring broken into resting arcs.", spec: "Three broken arc segments with sage gaps.", draw: () => { let s=""; const segs=3, span=(TAU/segs)*0.62; for(let i=0;i<segs;i++){const a=(i*TAU)/segs+0.2; s+=arc(32,32,17,a,a+span,i%2?"l-sage":"l-ink",2.6);} return s; } },
      { vname: "Segmented Five", concept: "Five resting arc segments.", spec: "Five arc segments, sage gaps.", draw: () => { let s=""; const segs=5, span=(TAU/segs)*0.58; for(let i=0;i<segs;i++){const a=(i*TAU)/segs+0.15; s+=arc(32,32,17,a,a+span,i%2?"l-sage":"l-ink",2.4);} return s; } },
      { vname: "Mark", concept: "A closed circle bearing one horizontal line.", spec: "Ink ring with a centered sage stroke.", draw: (rng) => { const ly=jit(rng,32,6); return circ(32,32,17,"l-ink") + line(24,ly,40,ly,"l-sage",2); } },
      { vname: "Half Ring", concept: "A calm semicircle, half of whole.", spec: "Upper half-ring ink + sage base.", draw: () => arc(32,32,17,Math.PI,0,"l-ink",2.6) + line(15,32,49,32,"l-sage",1.6) },
      { vname: "Quarter Ring", concept: "A quarter arc, the corner of the circle.", spec: "Quarter arc with sage radius.", draw: () => arc(32,32,17,0,Math.PI/2,"l-ink",2.6) + line(32,32,49,32,"l-sage",1.4) + line(32,32,32,49,"l-sage",1.4) },
      { vname: "Intersect", concept: "Two circles overlapping, the shared space.", spec: "Two ink rings intersecting.", draw: () => circ(26,32,14,"l-ink") + circ(38,32,14,"l-sage",1.6) },
      { vname: "Dot Grid", concept: "A ring cradling a small field of dots.", spec: "Ink ring with inner sage dot grid.", draw: () => { let s=circ(32,32,18,"l-ink"); for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++) s+=dot(32+i*7,32+j*7,(i+j)%2?2.2:1.6,i%2?"l-fill-sage":"l-fill-dim"); return s; } },
      { vname: "Spiral Ring", concept: "A ring curling inward at its end.", spec: "Open ring with inward spiral tail.", draw: () => { let d="M50 32 "; for(let i=0;i<=30;i++){const t=i/30;const a=t*2.4*Math.PI;const r=18*(1-t)+3;const [x,y]=pt(32,32,r,a);d+=`L${f(x)} ${f(y)} `;} return path(d,"l-ink",2); } },
      { vname: "Double Offset", concept: "Two rings offset, echoing.", spec: "Ink ring + sage ring beside it.", draw: () => circ(28,32,13,"l-ink") + circ(40,32,9,"l-sage",1.8) },
      { vname: "Ticks", concept: "A ring marked by four quiet ticks.", spec: "Ring with four sage tick marks.", draw: () => { let s=circ(32,32,17,"l-ink"); for(let i=0;i<4;i++){const a=(i/4)*TAU;const [x0,y0]=pt(32,32,14,a);const [x1,y1]=pt(32,32,19,a); s+=line(x0,y0,x1,y1,"l-sage",1.6);} return s; } },
      { vname: "Crossbar", concept: "A ring split by a vertical sage line.", spec: "Ink ring with vertical sage bar.", draw: () => circ(32,32,17,"l-ink") + line(32,15,32,49,"l-sage",1.8) },
      { vname: "Trail", concept: "A ring with a dot travelling its edge.", spec: "Ink ring with three sage edge dots.", draw: () => { let s=circ(32,32,17,"l-ink"); for(let i=0;i<3;i++){const a=-Math.PI/2+i*1.1;const [x,y]=pt(32,32,17,a); s+=dot(x,y,2.4,"l-fill-sage");} return s; } },
      { vname: "Eclipse", concept: "Two circles overlapping, calm eclipse.", spec: "Ink ring overlapped by sage disc.", draw: (rng) => { const dx=jit(rng,8,2); return circ(32-dx,32,14,"l-ink") + dot(32+dx,32,14,"l-fill-sage"); } },
      { vname: "Crescent Ring", concept: "A ring thinned to a crescent.", spec: "Filled crescent from two arcs.", draw: (rng) => { const r=jit(rng,16,2); return path(`M${32+r*0.5} 15 A${r} ${r} 0 1 0 ${32+r*0.5} 49 A${r*0.78} ${r*0.78} 0 1 1 ${32+r*0.5} 15 Z`,"l-fill-ink"); } },
      { vname: "Orbit", concept: "A dot orbiting a quiet ring.", spec: "Ring with a sage dot on its path.", draw: () => circ(32,32,16,"l-ink") + dot(...pt(32,32,16,-Math.PI/2),3.4,"l-fill-sage") + dot(32,32,2.4,"l-fill-dim") },
    ],
  },

  // 3. ORCHESTRATION / CONDUCTOR ---------------------------------------------
  {
    id: "orchestration",
    name: "Orchestration / Conductor",
    seed: 33,
    variants: [
      { vname: "Baton", concept: "A lifted baton drawing arcs.", spec: "Diagonal baton with sage arc sweep.", draw: (rng) => { const bx=jit(rng,32,3); return line(bx,14,bx+6,46,"l-ink",2.4) + arc(32,40,16,Math.PI*1.05,Math.PI*1.95,"l-sage",1.8) + dot(bx+6,46,2.4,"l-fill-sage"); } },
      { vname: "Podium", concept: "A stand from which lines rise.", spec: "Trapezoid podium with five gesture lines.", draw: () => { const px=32; let s=poly([[px-9,50],[px+9,50],[px+5,40],[px-5,40]],"l-ink"); for(let i=-2;i<=2;i++) s+=line(px,40,px+i*7,18,i===0?"l-sage":"l-dim",i===0?2.2:1.4); return s; } },
      { vname: "Converge", concept: "Several agents' paths meeting one point.", spec: "Five converging strokes into a sage hub.", draw: () => { const cx=32,cy=34; let s=dot(cx,cy,3,"l-fill-sage"); const n=5; for(let i=0;i<n;i++){const a=(i/n)*TAU+rng0(); const [x,y]=pt(cx,cy,22,a); s+=line(x,y,cx,cy,i%2?"l-dim":"l-ink",1.5);} return s; function rng0(){return Math.random()*0;} } },
      { vname: "Converge Six", concept: "Six paths gathering to a cue.", spec: "Six converging strokes, sage hub.", draw: () => { const cx=32,cy=32; let s=dot(cx,cy,3.2,"l-fill-sage"); const n=6; for(let i=0;i<n;i++){const a=(i/n)*TAU; const [x,y]=pt(cx,cy,21,a); s+=line(x,y,cx,cy,i%2?"l-dim":"l-ink",1.4);} return s; } },
      { vname: "Gesture", concept: "An upraised curve with small motions.", spec: "Curved arm stroke ending in a sage flick.", draw: (rng) => { const bx=jit(rng,24,3); return path(`M${bx} 50 Q${bx+8} 30 ${bx+22} 22`,"l-ink",2.4) + path(`M${bx+22} 22 q6 -4 10 2`,"l-sage",2) + dot(bx+32,24,2,"l-fill-dim"); } },
      { vname: "Radiate", concept: "A center sending calm arms outward.", spec: "Six radiating arms from an ink hub.", draw: () => { let s=dot(32,32,3.2,"l-fill-ink"); for(let i=0;i<6;i++){const a=(i/6)*TAU;const [x1,y1]=pt(32,32,9,a);const [x2,y2]=pt(32,32,20,a); s+=line(x1,y1,x2,y2,i%2?"l-sage":"l-dim",1.6);} return s; } },
      { vname: "Radiate Eight", concept: "Eight calm arms, the quiet sun.", spec: "Eight radiating arms, sage/dim.", draw: () => { let s=dot(32,32,3,"l-fill-sage"); for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x1,y1]=pt(32,32,8,a);const [x2,y2]=pt(32,32,20,a); s+=line(x1,y1,x2,y2,i%2?"l-sage":"l-dim",1.5);} return s; } },
      { vname: "Score", concept: "A staff of lines with a single note.", spec: "Five? no — four staff lines with sage note.", draw: () => { let s=""; for(let i=0;i<4;i++) s+=line(14,22+i*5,50,22+i*5,"l-dim",1.1); const ny=22+((Math.floor(3*0.7))*5); return s + dot(36,ny,3,"l-fill-sage") + line(36,ny,36,16,"l-sage",1.4); } },
      { vname: "Notes", concept: "Two notes on a calm staff.", spec: "Staff with two sage note dots.", draw: () => { let s=""; for(let i=0;i<3;i++) s+=line(16,26+i*6,48,26+i*6,"l-dim",1.1); return s + dot(28,38,3,"l-fill-sage") + dot(40,26,3,"l-fill-sage") + line(28,38,28,24,"l-sage",1.3) + line(40,26,40,16,"l-sage",1.3); } },
      { vname: "Fan Out", concept: "Lines fanning from a point like a cue.", spec: "Seven gesture lines from a pivot.", draw: () => { const px=32,py=50; let s=dot(px,py,2.6,"l-fill-sage"); for(let i=-3;i<=3;i++){const a=-Math.PI/2+i*0.22;const [x,y]=pt(px,py,30,a); s+=line(px,py,x,y,i===0?"l-sage":"l-ink",i===0?2:1.4);} return s; } },
      { vname: "Daisy", concept: "A ring of agents around one leader.", spec: "Center sage dot ringed by ink dots.", draw: () => { let s=dot(32,32,4,"l-fill-sage"); const n=7; for(let i=0;i<n;i++){const a=(i/n)*TAU;const [x,y]=pt(32,32,15,a); s+=dot(x,y,3,"l-ink");} return s; } },
      { vname: "Hub", concept: "One coordinator linked to many.", spec: "Sage hub with five ink satellites.", draw: () => spokeGraph(32,32,5,20,2) },
      { vname: "Hub Seven", concept: "A coordinator with seven links.", spec: "Sage hub with seven satellites.", draw: () => spokeGraph(32,32,7,19,2) },
      { vname: "Triangle Ensemble", concept: "Three agents in a triangle.", spec: "Triangle of nodes with a sage lead.", draw: () => { const p=reg(32,34,16,3); let s=""; for(let i=0;i<3;i++) s+=line(p[i][0],p[i][1],p[(i+1)%3][0],p[(i+1)%3][1],"l-dim",1.5); p.forEach((q,i)=>s+=circ(q[0],q[1],4,i===0?"l-fill-sage":"l-ink",1.5)); return s; } },
      { vname: "Arrow In", concept: "Arrows converging to a mark.", spec: "Three sage arrows into an ink point.", draw: () => { let s=dot(32,38,3.2,"l-fill-ink"); const n=3; for(let i=0;i<n;i++){const a=-Math.PI/2+(i-1)*0.7;const [x,y]=pt(32,38,20,a); s+=line(x,y,32,36,i===0?"l-sage":"l-dim",1.6);} return s; } },
      { vname: "Branching", concept: "A tree of intents from one root.", spec: "Single stem branching to four sage tips.", draw: () => { let s=path(`M32 52 V30`,"l-ink",2); const tips=[[20,18],[32,14],[44,18],[32,24]]; tips.forEach((t,i)=>{s+=path(`M32 34 Q${32+(t[0]-32)/2} ${28} ${t[0]} ${t[1]}`,"l-sage",1.6); s+=dot(t[0],t[1],2.4,"l-fill-sage");}); return s; } },
      { vname: "Woven", concept: "Two threads woven, the intertwined team.", spec: "Two interlaced sage/ink sine strands.", draw: () => { let s=path(`M12 24 Q24 14 32 24 T52 24`,"l-ink",2)+path(`M12 40 Q24 50 32 40 T52 40`,"l-ink",2); s+=path(`M12 24 Q24 34 32 24 T52 24`,"l-sage",1.6)+path(`M12 40 Q24 30 32 40 T52 40`,"l-sage",1.6); return s; } },
      { vname: "Paired Batons", concept: "Two batons crossing, the duet.", spec: "Two diagonal batons with sage arc.", draw: () => line(20,14,36,50,"l-ink",2.2)+line(44,14,28,50,"l-dim",1.8)+arc(32,32,12,Math.PI*1.1,Math.PI*1.9,"l-sage",1.6) },
      { vname: "Pulse Orbit", concept: "Pulses circling a calm center.", spec: "Ink ring with three orbiting sage dots.", draw: () => { let s=circ(32,32,15,"l-ink"); for(let i=0;i<3;i++){const a=-Math.PI/2+i*2.1;const [x,y]=pt(32,32,15,a);s+=dot(x,y,2.6,"l-fill-sage");} return s; } },
      { vname: "Conductor Star", concept: "A star of coordinated points.", spec: "Eight-point star burst in sage/ink.", draw: () => { let s=""; for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x0,y0]=pt(32,32,6,a);const [x1,y1]=pt(32,32,20,a); s+=line(x0,y0,x1,y1,i%2?"l-sage":"l-dim",1.5);} s+=dot(32,32,3.4,"l-fill-ink"); return s; } },
    ],
  },

  // 4. TERRAIN / HORIZON ------------------------------------------------------
  {
    id: "terrain",
    name: "Terrain / Horizon",
    seed: 44,
    variants: [
      { vname: "Mountain", concept: "Two still peaks under open sky.", spec: "Two overlapping peaks, ink front / sage behind.", draw: (rng) => { const h=jit(rng,30,4); return path(`M10 50 L${24+h/4} ${50-h} L${38-h/6} 50 Z`,"l-ink") + path(`M28 50 L44 ${50-h*0.7} L58 50 Z`,"l-sage"); } },
      { vname: "Three Peaks", concept: "A range of three calm summits.", spec: "Three peaks, ink/sage/ink.", draw: () => path(`M8 50 L20 34 L30 50 Z`,"l-dim") + path(`M24 50 L36 28 L48 50 Z`,"l-ink") + path(`M44 50 L54 36 L60 50 Z`,"l-sage") },
      { vname: "Hill", concept: "A soft rise holding a low sun.", spec: "Sage disc resting on an ink hill curve.", draw: (rng) => { const sy=jit(rng,24,4); return circ(40,sy,8,"l-fill-sage") + path(`M8 50 Q24 36 40 48 T60 46`,"l-ink",2.2); } },
      { vname: "Strata", concept: "Layered horizon lines, quiet geology.", spec: "Four wavy horizon strata.", draw: () => { let s=""; const lines=4; for(let i=0;i<lines;i++){const y=20+i*8; s+=path(`M10 ${y} Q22 ${y-6} 32 ${y} T54 ${y} T60 ${y-2}`,i%2?"l-sage":"l-ink",1.8-i*0.2);} return s; } },
      { vname: "Ripple", concept: "A single wave drawn calm, water remembering.", spec: "Twin sine waves, ink over sage.", draw: (rng) => { const amp=jit(rng,7,2); return path(`M8 34 Q18 ${34-amp} 28 34 T48 34 T60 ${34-amp/2}`,"l-ink",2.2)+path(`M8 44 Q18 ${44+amp} 28 44 T48 44 T60 ${44+amp/2}`,"l-sage",1.6); } },
      { vname: "Valley", concept: "A V of land cradling the middle ground.", spec: "Ink V meeting a sage baseline at the node.", draw: (rng) => { const vx=jit(rng,32,4); return path(`M10 18 L${vx} 50 L58 18`,"l-ink",2.2) + line(10,50,58,50,"l-sage",1.6) + dot(vx,50,2.4,"l-fill-sage"); } },
      { vname: "Dune", concept: "A single wind-shaped dune.", spec: "Sage dune curve on ink baseline.", draw: () => path(`M8 50 Q26 30 40 46 Q50 54 58 50 Z`,"l-sage") + line(8,50,58,50,"l-ink",1.6) },
      { vname: "Archipelago", concept: "Small islands scattered on calm water.", spec: "Three sage dots as islets on ink water.", draw: () => { let s=line(8,46,58,46,"l-ink",1.6); [[20,42],[36,38],[48,43]].forEach((p,i)=>s+=circ(p[0],p[1],3+i,"l-fill-sage")); return s; } },
      { vname: "Peninsula", concept: "Land reaching into water.", spec: "Ink land form with sage shore.", draw: () => path(`M8 50 Q20 44 30 50 L30 30 Q40 22 50 30 L50 50 Z`,"l-ink") + path(`M30 50 Q40 44 50 50`,"l-sage",1.6) },
      { vname: "River Bend", concept: "A river curving through calm land.", spec: "Sage curve flanked by ink banks.", draw: () => path(`M8 20 Q32 32 20 44 Q12 52 30 56`,"l-sage",2) + path(`M8 16 Q34 30 22 46`,"l-ink",1.4) + path(`M24 50 Q40 40 56 48`,"l-ink",1.4) },
      { vname: "Island", concept: "One island alone on still water.", spec: "Sage island disc on ink baseline.", draw: () => path(`M14 46 Q32 30 50 46 Z`,"l-sage") + line(8,46,58,46,"l-ink",1.8) },
      { vname: "Plateau", concept: "A flat-topped calm mesa.", spec: "Ink mesa with sage cap line.", draw: () => path(`M14 50 L18 34 L46 34 L50 50 Z`,"l-ink") + line(18,34,46,34,"l-sage",1.8) },
      { vname: "Cliff", concept: "A vertical drop to water.", spec: "Ink cliff with sage waterline.", draw: () => path(`M14 18 L30 18 L30 50 L14 50 Z`,"l-ink") + line(14,50,58,50,"l-sage",1.6) + path(`M30 50 Q44 44 58 50`,"l-dim",1.2) },
      { vname: "Canyon", concept: "A narrow V cut into land.", spec: "Ink V with sage floor line.", draw: () => path(`M12 20 L32 48 L52 20`,"l-ink",2.2) + line(12,20,52,20,"l-dim",1.2) + line(20,40,44,40,"l-sage",1.4) },
      { vname: "Twin Hills", concept: "Two soft rises, the balanced land.", spec: "Two ink/sage hills.", draw: () => path(`M8 50 Q22 38 36 50 Z`,"l-ink") + path(`M30 50 Q44 36 58 50 Z`,"l-sage") },
      { vname: "Range", concept: "A low silhouette of distant peaks.", spec: "Five small peaks, sage wash.", draw: () => { let s=""; const xs=[10,20,30,40,50]; xs.forEach((x,i)=>{s+=path(`M${x-7} 50 L${x} ${50-8-i*1.5} L${x+7} 50 Z`,i%2?"l-sage":"l-ink");}); return s; } },
      { vname: "Delta", concept: "A river splitting into channels.", spec: "Ink trunk splitting to sage mouths.", draw: () => path(`M32 14 V34`,"l-ink",2) + path(`M32 34 L18 50`,"l-sage",1.8) + path(`M32 34 L46 50`,"l-sage",1.8) + path(`M32 34 L32 50`,"l-dim",1.4) },
      { vname: "Lagoon", concept: "A still pool inside a shore.", spec: "Ink shore ring with sage pool.", draw: () => circ(32,34,18,"l-ink",2) + circ(32,34,9,"l-sage",1.6) },
      { vname: "Mesa", concept: "A broad flat summit.", spec: "Wide ink cap on a sage base.", draw: () => path(`M16 50 L20 30 L44 30 L48 50 Z`,"l-ink") + rectR(20,28,24,4,2,"l-sage",1.8) },
      { vname: "Coastline", concept: "Land meeting sea in a long curve.", spec: "Ink land mass with sage sea edge.", draw: () => path(`M8 50 L8 30 Q24 20 40 32 Q52 40 58 30 L58 50 Z`,"l-ink") + path(`M8 40 Q24 32 40 42`,"l-sage",1.6) },
    ],
  },

  // 5. MONOLINE NODE ----------------------------------------------------------
  {
    id: "monoline",
    name: "Monoline Node",
    seed: 55,
    variants: [
      { vname: "Loop", concept: "One line drawn as a closed loop.", spec: "Single continuous loop, 2.2 stroke.", draw: () => path(`M32 16 C48 16 48 48 32 48 C16 48 16 16 32 16 Z`,"l-ink",2.2) },
      { vname: "Knot", concept: "A line threading a small ring.", spec: "Sage ring with an ink line looping through.", draw: () => circ(32,24,7,"l-sage",2) + path(`M20 44 C20 28 44 28 44 44 C44 54 18 52 18 40`,"l-ink",2.2) },
      { vname: "Zig", concept: "A calm zigzag held by a node.", spec: "Three-step monoline zigzag with sage ends.", draw: () => { const n=3; let d=`M14 40 `; for(let i=0;i<n;i++) d+=`L${14+(36/n)*(i+0.5)} ${i%2?22:44} L${14+(36/n)*(i+1)} 40 `; return path(d,"l-ink",2.2)+dot(14,40,2.4,"l-fill-sage")+dot(50,40,2.4,"l-fill-sage"); } },
      { vname: "Zig Five", concept: "A five-step monoline zigzag.", spec: "Five-step zig with sage end nodes.", draw: () => { const n=5; let d=`M10 38 `; for(let i=0;i<n;i++) d+=`L${10+(44/n)*(i+0.5)} ${i%2?22:42} L${10+(44/n)*(i+1)} 38 `; return path(d,"l-ink",2.2)+dot(10,38,2.4,"l-fill-sage")+dot(54,38,2.4,"l-fill-sage"); } },
      { vname: "Spiral In", concept: "A line curling inward.", spec: "Inward monoline spiral, ~2.4 turns.", draw: () => { let d="M50 32 "; for(let i=0;i<=40;i++){const t=i/40;const a=t*2.4*TAU;const r=20*(1-t)+2;const [x,y]=pt(32,32,r,a);d+=`L${f(x)} ${f(y)} `;} return path(d,"l-ink",2); } },
      { vname: "Spiral Out", concept: "A line unfurling outward.", spec: "Outward monoline spiral.", draw: () => { let d="M32 32 "; for(let i=0;i<=40;i++){const t=i/40;const a=t*2.4*TAU;const r=2+t*20;const [x,y]=pt(32,32,r,a);d+=`L${f(x)} ${f(y)} `;} return path(d,"l-ink",2); } },
      { vname: "Thread", concept: "A line stringing quiet beads.", spec: "Four nodes strung on one monoline.", draw: () => { const n=4; const pts=[]; for(let i=0;i<n;i++) pts.push([14+i*(36/(n-1)),18+i*10]); let d=`M${pts[0][0]} ${pts[0][1]} `; pts.forEach((p)=>d+=`L${f(p[0])} ${f(p[1])} `); let s=path(d,"l-ink",1.8); pts.forEach((p,i)=>s+=dot(p[0],p[1],i%2?2.6:2,i%2?"l-fill-sage":"l-fill-dim")); return s; } },
      { vname: "Infinity", concept: "A calm infinity loop.", spec: "Sideways figure-eight monoline.", draw: () => path(`M16 32 C16 20 28 20 32 32 C36 44 48 44 48 32 C48 20 36 20 32 32 C28 44 16 44 16 32 Z`,"l-ink",2.2) },
      { vname: "Figure Eight", concept: "A vertical figure-eight.", spec: "Upright woven loop.", draw: () => path(`M32 14 C44 14 44 30 32 32 C20 34 20 50 32 50 C44 50 44 34 32 32 C20 30 20 14 32 14 Z`,"l-ink",2.2) },
      { vname: "Lattice", concept: "A tidy 3x3 monoline grid.", spec: "Three-by-three grid, sage nodes.", draw: () => { let s=""; for(let i=0;i<3;i++){const x=18+i*14; s+=line(x,18,x,46,"l-ink",1.4); const y=18+i*14; s+=line(18,y,46,y,"l-ink",1.4);} for(let i=0;i<3;i++)for(let j=0;j<3;j++) s+=dot(18+i*14,18+j*14,1.8,"l-fill-sage"); return s; } },
      { vname: "Hex", concept: "A calm hexagon outline.", spec: "Six-sided monoline, sage nodes.", draw: () => { const p=reg(32,32,18,6); let s=poly(p,"l-ink",2.2); p.forEach(q=>s+=dot(q[0],q[1],2,"l-fill-sage")); return s; } },
      { vname: "Triangle", concept: "A calm triangle outline.", spec: "Three-sided monoline, sage nodes.", draw: () => { const p=reg(32,34,18,3); let s=poly(p,"l-ink",2.2); p.forEach(q=>s+=dot(q[0],q[1],2.2,"l-fill-sage")); return s; } },
      { vname: "Square Soft", concept: "A rounded square outline.", spec: "Rounded rect monoline, sage nodes.", draw: () => { let s=rectR(16,16,32,32,8,"l-ink",2.2); [[16,16],[48,16],[16,48],[48,48]].forEach(q=>s+=dot(q[0],q[1],2,"l-fill-sage")); return s; } },
      { vname: "Sine", concept: "A single calm wave, monoline.", spec: "One sine period, sage endpoints.", draw: () => path(`M10 32 Q22 16 32 32 T54 32`,"l-ink",2.2)+dot(10,32,2.4,"l-fill-sage")+dot(54,32,2.4,"l-fill-sage") },
      { vname: "Square Wave", concept: "A calm square wave.", spec: "Two steps monoline with sage nodes.", draw: () => { let d="M10 36 H22 V20 H42 V36 H54"; return path(d,"l-ink",2.2)+dot(10,36,2.4,"l-fill-sage")+dot(54,36,2.4,"l-fill-sage"); } },
      { vname: "Helix", concept: "A coiled line, the gentle spring.", spec: "Two-turn helix monoline.", draw: () => { let d="M32 14 "; for(let i=0;i<=40;i++){const t=i/40;const a=t*4*Math.PI;const y=14+t*36;const x=32+10*Math.sin(a); d+=`L${f(x)} ${f(y)} `;} return path(d,"l-ink",2); } },
      { vname: "Braid", concept: "Three strands woven, the braided intent.", spec: "Three interlaced monoline strands.", draw: () => { let s=""; for(let k=0;k<3;k++){let d=`M10 ${20+k*6} `; for(let i=0;i<=20;i++){const t=i/20;const x=10+t*44;const y=20+k*6+6*Math.sin(t*Math.PI*3+k); d+=`L${f(x)} ${f(y)} `;} s+=path(d,k===1?"l-sage":"l-dim",1.8);} return s; } },
      { vname: "Orbit Loop", concept: "A loop with an orbiting node.", spec: "Monoline loop with sage traveling dot.", draw: () => { let s=path(`M32 16 C46 16 46 48 32 48 C18 48 18 16 32 16 Z`,"l-ink",2.2); const [x,y]=pt(32,32,16,-Math.PI/2); return s+dot(x,y,2.8,"l-fill-sage"); } },
      { vname: "Pulse Line", concept: "A flat line with one calm pulse.", spec: "Monoline with a single sage bump.", draw: () => path(`M10 34 H26 Q32 22 38 34 H54`,"l-ink",2.2)+dot(32,28,2.4,"l-fill-sage") },
      { vname: "Meander", concept: "A Greek-key meander, the steady path.", spec: "Single meander turn monoline.", draw: () => path(`M14 46 V26 H40 V40 H26 V32`,"l-ink",2.2) + dot(14,46,2.2,"l-fill-sage") },
    ],
  },

  // 6. STAMP & SEAL -----------------------------------------------------------
  {
    id: "stamp-seal",
    name: "Stamp & Seal",
    seed: 66,
    variants: [
      { vname: "Hanko", concept: "A rounded square seal bearing a centered mark.", spec: "Rounded seal with a sage triangle (A) and crossbar.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + path(`M32 24 L40 42 L24 42 Z`,"l-sage",2) + line(28,38,36,38,"l-ink",1.4) },
      { vname: "Ringseal", concept: "A seal framing an open circle.", spec: "Square seal enclosing a sage ring.", draw: () => rectR(16,16,32,32,9,"l-ink",2) + circ(32,32,10,"l-sage",2) },
      { vname: "Pluseal", concept: "A seal crossed by one calm plus.", spec: "Square seal with a sage plus mark.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); s+=line(32,22,32,42,"l-sage",2.2); s+=line(22,32,42,32,"l-sage",2.2); return s; } },
      { vname: "Bars Two", concept: "A seal ruled by two even lines.", spec: "Square seal with two dim ledger lines.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); for(let i=0;i<2;i++) s+=line(22,28+i*8,42,28+i*8,"l-dim",1.6); return s; } },
      { vname: "Bars Three", concept: "A seal ruled by three even lines.", spec: "Square seal with three dim ledger lines.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); for(let i=0;i<3;i++) s+=line(22,26+i*6,42,26+i*6,"l-dim",1.6); return s; } },
      { vname: "Matrix", concept: "A seal filled with a tidy dot grid.", spec: "3x3 grid of ink/sage dots in a seal.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); for(let i=0;i<3;i++)for(let j=0;j<3;j++) s+=dot(24+i*8,24+j*8,1.8,(i+j)%2?"l-fill-sage":"l-fill-dim"); return s; } },
      { vname: "Monogram Seal", concept: "A seal bearing an O and A.", spec: "Rounded seal with sage O and ink A.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + circ(32,32,9,"l-sage",1.8) + path(`M32 26 L38 42 L26 42 Z`,"l-ink",1.8) },
      { vname: "Star Seal", concept: "A seal bearing a calm star.", spec: "Rounded seal with sage four-point star.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); const p=starPts(32,32,11,4,4); return s+poly(p,"l-sage",1.8); } },
      { vname: "Dot Seal", concept: "A seal centered on one mark.", spec: "Rounded seal with a sage center dot.", draw: () => rectR(16,16,32,32,9,"l-ink",2) + dot(32,32,6,"l-fill-sage") },
      { vname: "Scallop", concept: "A seal with a scalloped edge.", spec: "Circle seal with sage scallop ticks.", draw: () => { let s=circ(32,32,16,"l-ink",2); for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x1,y1]=pt(32,32,16,a);const [x2,y2]=pt(32,32,12,a); s+=line(x1,y1,x2,y2,"l-sage",1.4);} return s; } },
      { vname: "Double Ring", concept: "A seal of two concentric frames.", spec: "Two nested square seals, sage inner.", draw: () => rectR(14,14,36,36,10,"l-ink",2) + rectR(22,22,20,20,6,"l-sage",1.6) },
      { vname: "Hex Seal", concept: "A hexagonal seal, the wax mark.", spec: "Hex outline seal with sage core.", draw: () => { let s=poly(reg(32,32,18,6),"l-ink",2); s+=dot(32,32,4,"l-fill-sage"); return s; } },
      { vname: "Tri Seal", concept: "A triangular seal.", spec: "Triangle seal with sage center.", draw: () => { let s=poly(reg(32,34,18,3),"l-ink",2); s+=dot(32,34,4,"l-fill-sage"); return s; } },
      { vname: "Quartered", concept: "A seal split into four calm fields.", spec: "Square seal with sage cross quarters.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + line(32,16,32,48,"l-sage",1.4) + line(16,32,48,32,"l-sage",1.4) },
      { vname: "Concentric Seal", concept: "A seal of nested rings.", spec: "Square seal with two concentric sage rings.", draw: () => rectR(16,16,32,32,9,"l-ink",2) + circ(32,32,9,"l-sage",1.6) + circ(32,32,5,"l-sage",1.4) },
      { vname: "Chevron Seal", concept: "A seal marked by a calm chevron.", spec: "Rounded seal with sage chevron.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + path(`M24 26 L32 36 L40 26`,"l-sage",2) + line(24,40,40,40,"l-dim",1.4) },
      { vname: "Arc Seal", concept: "A seal bearing a rising arc.", spec: "Rounded seal with sage arc.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + arc(32,40,14,Math.PI*1.15,Math.PI*1.85,"l-sage",2) },
      { vname: "Plus Minus", concept: "A seal of balanced marks.", spec: "Rounded seal with sage plus and dim minus.", draw: () => { let s=rectR(16,16,32,32,8,"l-ink",2); s+=line(32,24,32,38,"l-sage",2)+line(25,31,39,31,"l-sage",2); s+=line(25,42,39,42,"l-dim",1.6); return s; } },
      { vname: "Initial O", concept: "A seal framing a single O.", spec: "Rounded seal with sage O.", draw: () => rectR(16,16,32,32,8,"l-ink",2) + circ(32,32,9,"l-sage",2) },
      { vname: "Flower Seal", concept: "A seal bearing a small bloom.", spec: "Rounded seal with sage petal flower.", draw: () => { let s=rectR(16,16,32,32,9,"l-ink",2); const p=reg(32,32,9,6); p.forEach(q=>s+=dot(q[0],q[1],2.4,"l-fill-sage")); s+=dot(32,32,2.6,"l-fill-ink"); return s; } },
    ],
  },

  // 7. WINDOW & PORTAL --------------------------------------------------------
  {
    id: "window-portal",
    name: "Window & Portal",
    seed: 77,
    variants: [
      { vname: "Arch", concept: "An arched opening onto calm.", spec: "Rounded arch window with a sage sill.", draw: (rng) => { const span=jit(rng,22,3); return path(`M21 ${52-span/2} V32 A11 11 0 0 1 43 32 V${52-span/2}`,"l-ink",2.2) + line(21,52-span/2,43,52-span/2,"l-sage",1.8); } },
      { vname: "Quads", concept: "A window split into four calm panes.", spec: "Square window with a dim mullion cross.", draw: () => { let s=rectR(18,18,28,28,4,"l-ink",2); s+=line(32,18,32,46,"l-dim",1.4); s+=line(18,32,46,32,"l-dim",1.4); return s; } },
      { vname: "Portal", concept: "A round opening, the soft circle.", spec: "Circular portal, sage inner ring.", draw: (rng) => { const r=jit(rng,16,2); return circ(32,32,r,"l-ink",2.2) + circ(32,32,r*0.62,"l-sage",1.6); } },
      { vname: "Lattice", concept: "A window braced by a single bar.", spec: "Square window with a single sage mullion.", draw: () => rectR(18,18,28,28,4,"l-ink",2) + line(32,18,32,46,"l-sage",1.8) },
      { vname: "Vista", concept: "A portal crossed by a low horizon.", spec: "Circular portal with a sage horizon and dim sun.", draw: () => circ(32,32,17,"l-ink",2.2) + path(`M15 40 Q24 34 32 40 T49 40`,"l-sage",1.6) + dot(40,26,3,"l-fill-dim") },
      { vname: "Two Bars", concept: "A window with two calm mullions.", spec: "Square window with two sage bars.", draw: () => rectR(18,18,28,28,4,"l-ink",2) + line(25,18,25,46,"l-sage",1.4) + line(39,18,39,46,"l-sage",1.4) },
      { vname: "Arched Sill", concept: "An arched window on a sill.", spec: "Arch with sage sill and side jambs.", draw: () => path(`M20 48 V30 A12 12 0 0 1 44 30 V48`,"l-ink",2.2) + line(16,48,48,48,"l-sage",1.8) },
      { vname: "Octagon", concept: "An eight-sided window, the calm lantern.", spec: "Octagon window with sage inner.", draw: () => { const p=reg(32,32,18,8,Math.PI/8); let s=poly(p,"l-ink",2); s+=circ(32,32,7,"l-sage",1.6); return s; } },
      { vname: "Porthole", concept: "A round window with a cross.", spec: "Circular porthole with sage cross.", draw: () => { let s=circ(32,32,17,"l-ink",2.2); s+=line(32,15,32,49,"l-sage",1.4); s+=line(15,32,49,32,"l-sage",1.4); return s; } },
      { vname: "Bay", concept: "A three-pane bay window.", spec: "Three panes with sage center.", draw: () => { let s=rectR(14,20,10,24,3,"l-ink",1.8); s+=rectR(27,16,10,28,3,"l-sage",1.8); s+=rectR(40,20,10,24,3,"l-ink",1.8); return s; } },
      { vname: "Three Col", concept: "A window in three columns.", spec: "Three vertical panes, dim mullions.", draw: () => { let s=rectR(16,20,32,24,4,"l-ink",2); for(let i=1;i<3;i++) s+=line(16+i*10.6,20,16+i*10.6,44,"l-dim",1.2); return s; } },
      { vname: "Three Row", concept: "A window in three rows.", spec: "Three horizontal panes, dim rails.", draw: () => { let s=rectR(20,16,24,32,4,"l-ink",2); for(let i=1;i<3;i++) s+=line(20,16+i*10.6,44,16+i*10.6,"l-dim",1.2); return s; } },
      { vname: "Diamond", concept: "A diamond window, the quiet facet.", spec: "Rotated square window with sage core.", draw: () => { const p=reg(32,32,18,4,0); let s=poly(p,"l-ink",2); s+=dot(32,32,3,"l-fill-sage"); return s; } },
      { vname: "Pill", concept: "A tall pill window.", spec: "Rounded-tall window with sage sill.", draw: () => rectR(22,14,20,36,10,"l-ink",2) + line(22,50,42,50,"l-sage",1.6) },
      { vname: "Hex Win", concept: "A hexagonal window.", spec: "Hex outline with sage inner hex.", draw: () => { let s=poly(reg(32,32,18,6),"l-ink",2); s+=poly(reg(32,32,9,6,Math.PI/6),"l-sage",1.6); return s; } },
      { vname: "Keyhole", concept: "A keyhole, the doorway mark.", spec: "Circle over a sage trapezoid.", draw: () => circ(32,26,10,"l-ink",2) + poly([[28,30],[36,30],[34,46],[30,46]],"l-sage") },
      { vname: "Lantern", concept: "A hanging lantern window.", spec: "Rounded-top window with sage glow.", draw: () => path(`M22 22 Q22 14 32 14 Q42 14 42 22 V48 H22 Z`,"l-ink",2) + circ(32,34,7,"l-fill-sage") },
      { vname: "Framed", concept: "A circle framed by a square.", spec: "Square frame around a sage ring.", draw: () => rectR(16,16,32,32,6,"l-ink",2) + circ(32,32,10,"l-sage",1.8) },
      { vname: "Lattice 2x2", concept: "A window with a 2x2 mullion grid.", spec: "Square window with four panes.", draw: () => { let s=rectR(18,18,28,28,4,"l-ink",2); s+=line(32,18,32,46,"l-dim",1.4); s+=line(18,32,46,32,"l-dim",1.4); s+=rectR(22,22,20,20,3,"l-sage",1.4); return s; } },
      { vname: "Open Book Win", concept: "A window like an open book.", spec: "Two arched panes meeting at center.", draw: () => path(`M14 46 V32 A9 9 0 0 1 32 32`,"l-ink",2) + path(`M50 46 V32 A9 9 0 0 0 32 32`,"l-sage",2) + line(32,23,32,46,"l-dim",1.2) },
    ],
  },

  // 8. WABI-SABI --------------------------------------------------------------
  {
    id: "wabi-sabi",
    name: "Wabi-Sabi",
    seed: 88,
    variants: [
      { vname: "Wobble", concept: "A circle that will not be perfect.", spec: "Imperfect closed curve, gentle wobble.", draw: () => { let d="M32 14 "; const n=18; for(let i=0;i<=n;i++){const a=(i/n)*TAU; const r=18+Math.sin(a*3)*1.8+Math.cos(a*5)*1.2; const [x,y]=pt(32,32,r,a); d+=`L${f(x)} ${f(y)} `;} return path(d+"Z","l-ink",2.2); } },
      { vname: "Blob", concept: "An asymmetric soft shape that grew.", spec: "Asymmetric organic blob in sage.", draw: () => path(`M24 18 C40 14 52 26 48 40 C44 52 28 54 18 46 C10 38 12 24 24 18 Z`,"l-sage",2.2) },
      { vname: "Fissure", concept: "A single line that breaks, the honest crack.", spec: "Broken ink stroke with a sage fracture node.", draw: (rng) => { const y=jit(rng,32,6); return path(`M14 ${y} q8 -4 14 0 t14 2`,"l-ink",2.2)+path(`M46 ${y+3} q5 3 6 6`,"l-dim",2)+dot(46,y+3,2,"l-fill-sage"); } },
      { vname: "Pebbles Two", concept: "Two uneven stones resting together.", spec: "Two irregular stones, ink and sage.", draw: (rng) => { const oy=jit(rng,36,3); return path(`M16 ${oy} q8 -10 18 -3 q6 6 -4 9 q-12 4 -14 -6 Z`,"l-ink",2.2)+path(`M34 ${oy-4} q7 -7 14 -1 q4 5 -4 8 q-9 3 -10 -7 Z`,"l-sage",2); } },
      { vname: "Pebbles Three", concept: "Three uneven stones, the paired quiet.", spec: "Three stones, ink/sage/dim.", draw: () => path(`M14 44 q7 -9 15 -3 q5 5 -3 8 q-10 3 -12 -5 Z`,"l-ink",2)+path(`M30 46 q7 -8 13 -2 q4 5 -3 7 q-8 2 -10 -5 Z`,"l-sage",2)+path(`M44 44 q6 -7 11 -2 q3 4 -3 6 q-7 2 -8 -4 Z`,"l-dim",1.8) },
      { vname: "Stray", concept: "One loose stroke beside a calm field.", spec: "Faint field circle with one ink stray stroke.", draw: (rng) => { const x=jit(rng,30,4); return circ(32,32,17,"l-faint",1.4)+path(`M${x-8} 40 q6 -14 16 -10`,"l-ink",2.4); } },
      { vname: "Cracked Vessel", concept: "A vessel with a hairline crack.", spec: "Sage vessel outline with ink fracture.", draw: () => { let s=path(`M22 18 Q22 14 28 14 H36 Q42 14 42 18 Q48 30 44 44 Q40 52 32 52 Q24 52 20 44 Q16 30 22 18 Z`,"l-sage",2); s+=path(`M32 22 q-3 10 2 18 q4 6 1 14`,"l-ink",1.6); return s; } },
      { vname: "Uneven Arch", concept: "An arch that leans, the human hand.", spec: "Asymmetric arch in ink.", draw: () => path(`M20 48 V30 Q20 18 34 18 Q46 18 46 32 V48`,"l-ink",2.2) },
      { vname: "Asym Leaf", concept: "A leaf that is not quite symmetric.", spec: "Asymmetric sage leaf with ink vein.", draw: () => path(`M32 50 V22`,"l-ink",2)+path(`M32 40 C44 38 46 22 32 16 C30 28 30 36 32 40 Z`,"l-fill-sage")+line(32,40,38,30,"l-dim",1) },
      { vname: "Tilted Square", concept: "A square that will not sit straight.", spec: "Rotated rounded square, ink.", draw: () => { const p=[[20,20],[46,16],[50,42],[24,46]]; let s=poly(p,"l-ink",2.2); s+=dot(33,33,2.4,"l-fill-sage"); return s; } },
      { vname: "Drip", concept: "A single drop, the slow release.", spec: "Sage teardrop with ink stem.", draw: () => path(`M32 16 C36 26 40 32 32 40 C24 32 28 26 32 16 Z`,"l-fill-sage")+line(32,40,32,50,"l-ink",1.6) },
      { vname: "Knotted String", concept: "A loose knot, the untidy tie.", spec: "Ink loop knotted with sage slip.", draw: () => path(`M18 32 C18 20 46 20 46 32 C46 44 18 44 18 34 C18 28 30 28 32 34`,"l-ink",2.2)+dot(32,34,2.4,"l-fill-sage") },
      { vname: "Moss Dot", concept: "A dot softened by a halo.", spec: "Sage dot with faint ink halo.", draw: () => circ(32,32,12,"l-faint",1.2)+dot(32,32,6,"l-fill-sage") },
      { vname: "Broken Ring", concept: "A ring with a missing arc, the worn circle.", spec: "Three-quarter ink ring with sage gap node.", draw: () => arc(32,32,16,0.4,TAU-0.4,"l-ink",2.4)+dot(...pt(32,32,16,TAU-0.4),2.4,"l-fill-sage") },
      { vname: "Soft Triangle", concept: "A triangle with soft unequal sides.", spec: "Asymmetric triangle, ink/sage.", draw: () => { const p=[[18,46],[48,44],[34,18]]; let s=poly(p,"l-ink",2.2); s+=dot(34,18,2.6,"l-fill-sage"); return s; } },
      { vname: "Stone Ripple", concept: "A stone with a single calm ring.", spec: "Ink stone above a sage ripple arc.", draw: () => path(`M24 44 q8 -10 16 0 q-3 5 -8 5 q-5 0 -8 -5 Z`,"l-ink",2.2)+arc(32,46,12,Math.PI*1.15,Math.PI*1.85,"l-sage",1.5) },
      { vname: "Brush Dot", concept: "A soft filled dot, the ink breath.", spec: "Ink filled circle, soft.", draw: () => circ(32,32,14,"l-fill-ink") },
      { vname: "Organic Cross", concept: "A cross of four uneven arms, the calm plus.", spec: "Four tapered arms meeting at a sage center.", draw: () => path(`M27 18 C31 27 31 35 27 48 C36 38 36 28 33 18 Z`,"l-fill-ink")+path(`M16 27 C25 31 33 31 48 27 C38 36 28 36 16 27 Z`,"l-fill-sage")+dot(32,32,2.6,"l-fill-sage") },
      { vname: "Uneven Stack", concept: "A stack that lists to one side.", spec: "Three offset stones, listing.", draw: () => path(`M18 50 q12 -8 24 0 q-4 5 -12 5 q-8 0 -12 -5 Z`,"l-ink",2)+path(`M20 40 q10 -7 19 0 q-3 5 -9 5 q-6 0 -10 -5 Z`,"l-sage",2)+path(`M24 31 q7 -6 13 0 q-2 4 -6 4 q-4 0 -7 -4 Z`,"l-dim",1.8) },
      { vname: "Moon Reflect", concept: "A calm crescent beside its glow.", spec: "Sage crescent with faint ink halo.", draw: () => circ(32,32,18,"l-faint",1.2)+path(`M40 16 A16 16 0 1 0 40 48 A12.5 12.5 0 1 1 40 16 Z`,"l-fill-sage") },
    ],
  },

  // 9. BREATH & MINDFULNESS ---------------------------------------------------
  {
    id: "breath",
    name: "Breath & Mindfulness",
    seed: 99,
    variants: [
      { vname: "Inhale", concept: "Concentric rings expanding outward.", spec: "Three expanding rings around a sage core.", draw: (rng) => { const n=3; let s=""; for(let i=0;i<n;i++) s+=circ(32,32,8+i*6,i===n-1?"l-ink":"l-sage",i===n-1?2.2:1.4); return s+dot(32,32,2.6,"l-fill-sage"); } },
      { vname: "Lungs", concept: "A soft paired shape opening like breath.", spec: "Central stem with two symmetric sage lobes.", draw: () => path(`M32 16 V40`,"l-ink",2)+path(`M32 26 C22 26 18 36 22 46 C26 52 32 48 32 40`,"l-sage",2)+path(`M32 26 C42 26 46 36 42 46 C38 52 32 48 32 40`,"l-sage",2) },
      { vname: "Expand", concept: "Arcs opening upward like a slow exhale.", spec: "Three upward arcs, sage to ink.", draw: () => { let s=""; const n=3; for(let i=0;i<n;i++) s+=arc(32,46,8+i*7,Math.PI*1.15,Math.PI*1.85,i===n-1?"l-ink":"l-sage",i===n-1?2.2:1.5); return s; } },
      { vname: "Wavebreath", concept: "A wave that rises and falls once.", spec: "One ink breath wave with a sage undertow.", draw: (rng) => { const amp=jit(rng,10,3); return path(`M10 34 Q22 ${34-amp} 32 34 Q42 ${34+amp} 54 34`,"l-ink",2.2)+path(`M16 44 Q28 40 32 44 Q40 48 48 44`,"l-sage",1.6); } },
      { vname: "Pulse", concept: "A center dot breathing within rings.", spec: "Sage core within dim and faint rings.", draw: () => circ(32,32,18,"l-faint",1.3)+circ(32,32,12,"l-dim",1.6)+dot(32,32,4,"l-fill-sage") },
      { vname: "Single Ring", concept: "One ring, the held breath.", spec: "Ink ring with a sage center dot.", draw: () => circ(32,32,18,"l-ink",2.2)+dot(32,32,3,"l-fill-sage") },
      { vname: "Double Breath", concept: "Two rings sharing a breath.", spec: "Two concentric sage rings, ink outer.", draw: () => circ(32,32,19,"l-ink",2)+circ(32,32,12,"l-sage",1.6)+dot(32,32,3,"l-fill-sage") },
      { vname: "Lotus", concept: "A bloom of calm petals.", spec: "Eight sage petals around a core.", draw: () => { let s=""; const p=reg(32,32,10,8); p.forEach(q=>s+=path(`M32 32 Q${q[0]} ${q[1]} ${pt(32,32,16,Math.atan2(q[1]-32,q[0]-32))[0]} ${pt(32,32,16,Math.atan2(q[1]-32,q[0]-32))[1]} Z`,"l-sage",1.6)); s+=dot(32,32,3,"l-fill-ink"); return s; } },
      { vname: "Lotus Five", concept: "A five-petal calm flower.", spec: "Five sage petals around a core.", draw: () => { const p=reg(32,32,9,5); let s=""; p.forEach(q=>{const a=Math.atan2(q[1]-32,q[0]-32);const [x,y]=pt(32,32,15,a); s+=path(`M32 32 Q${q[0]} ${q[1]} ${x} ${y} Z`,"l-sage",1.6);}); s+=dot(32,32,3.4,"l-fill-ink"); return s; } },
      { vname: "Chakra", concept: "A vertical column of calm dots.", spec: "Four sage dots stacked on a dim line.", draw: () => { let s=line(32,16,32,50,"l-dim",1.2); for(let i=0;i<4;i++) s+=dot(32,20+i*9,3,i===1||i===3?"l-fill-sage":"l-fill-dim"); return s; } },
      { vname: "Om Curve", concept: "A calm curve suggesting the sacred sound.", spec: "Sage semicircle with ink tail.", draw: () => arc(32,34,12,Math.PI,0,"l-sage",2.2)+line(20,34,32,46,"l-ink",2)+dot(32,46,2.6,"l-fill-ink") },
      { vname: "Calm Field", concept: "A soft field of resting dots.", spec: "Five sage dots in a gentle arc.", draw: () => { let s=""; for(let i=0;i<5;i++){const a=Math.PI*0.8+i*(Math.PI*0.4/4);const [x,y]=pt(32,38,16,a); s+=dot(x,y,i%2?3:2.2,"l-fill-sage");} return s; } },
      { vname: "Exhale", concept: "Lines flowing downward, release.", spec: "Three sage downward exhale lines.", draw: () => { let s=""; for(let i=-1;i<=1;i++) s+=line(32+i*10,16,32+i*10,46,i===0?"l-sage":"l-dim",i===0?2:1.4); return s; } },
      { vname: "Breathe Square", concept: "A rounded square breathing.", spec: "Rounded square with sage inset ring.", draw: () => rectR(18,18,28,28,10,"l-ink",2)+circ(32,32,8,"l-sage",1.6) },
      { vname: "Mandorla", concept: "Two arcs meeting, the almond of light.", spec: "Two sage arcs forming a vesica.", draw: () => arc(32,32,18,-Math.PI/3,Math.PI/3,"l-sage",2)+arc(32,32,18,Math.PI*2/3,Math.PI*4/3,"l-sage",2) },
      { vname: "Petal Single", concept: "One petal, the smallest bloom.", spec: "Single sage petal on an ink stem.", draw: () => path(`M32 50 V30`,"l-ink",2)+path(`M32 30 C40 28 42 16 32 12 C22 16 24 28 32 30 Z`,"l-sage",1.8) },
      { vname: "Seed Life", concept: "Six circles around one, the seed of life.", spec: "Six sage rings around a core.", draw: () => { let s=dot(32,32,3,"l-fill-ink"); const p=reg(32,32,11,6); p.forEach(q=>s+=circ(q[0],q[1],7,"l-sage",1.4)); return s; } },
      { vname: "Ripples Out", concept: "Ripples spreading from a point.", spec: "Three sage ripple arcs from a core.", draw: () => { let s=dot(32,40,3,"l-fill-sage"); for(let i=1;i<=3;i++) s+=arc(32,40,6*i,Math.PI*1.1,Math.PI*1.9,i===3?"l-ink":"l-sage",i===3?2:1.4); return s; } },
      { vname: "Centered Cross", concept: "A calm cross of breath, four directions.", spec: "Four arms meeting at a sage center.", draw: () => { let s=dot(32,32,3.4,"l-fill-sage"); [[-1,0],[1,0],[0,-1],[0,1]].forEach(d=>s+=line(32,32,32+d[0]*18,32+d[1]*18,"l-dim",1.6)); return s; } },
      { vname: "Wave Stack", concept: "Three stacked calm waves.", spec: "Three sage waves, ink baseline.", draw: () => { let s=line(10,50,54,50,"l-ink",1.8); for(let i=0;i<3;i++) s+=path(`M10 ${20+i*9} Q22 ${14+i*9} 32 ${20+i*9} T54 ${20+i*9}`,"l-sage",1.5); return s; } },
    ],
  },

  // 10. NETWORK / GRAPH -------------------------------------------------------
  {
    id: "network",
    name: "Network / Graph",
    seed: 110,
    variants: [
      { vname: "Triad", concept: "Three agents in a triangle, the smallest ensemble.", spec: "Three nodes in a triangle with a sage lead.", draw: () => { const p=reg(32,34,16,3); let s=""; for(let i=0;i<3;i++) s+=line(p[i][0],p[i][1],p[(i+1)%3][0],p[(i+1)%3][1],"l-dim",1.5); p.forEach((q,i)=>s+=circ(q[0],q[1],4,i===0?"l-fill-sage":"l-ink",1.5)); s+=dot(32,34,2.6,"l-fill-dim"); return s; } },
      { vname: "Quad", concept: "Four agents on a square, the balanced panel.", spec: "Four nodes on a square, alternating.", draw: () => { const p=[[22,22],[42,22],[42,42],[22,42]]; let s=""; for(let i=0;i<4;i++) s+=line(p[i][0],p[i][1],p[(i+1)%4][0],p[(i+1)%4][1],"l-dim",1.4); p.forEach((q,i)=>s+=circ(q[0],q[1],3.4,i%2?"l-fill-sage":"l-ink",1.4)); return s; } },
      { vname: "Hub", concept: "One coordinator linked to many.", spec: "Sage hub with five ink satellites.", draw: () => spokeGraph(32,32,5,20,2)+circ(32,32,15,"l-faint",1.2) },
      { vname: "Scatter", concept: "Agents placed without a grid.", spec: "Six scattered nodes linked by proximity.", draw: () => { const pts=[[18,20],[44,18],[50,40],[30,50],[16,42],[38,32]]; let s=""; for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++) if(Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1])<26) s+=line(pts[i][0],pts[i][1],pts[j][0],pts[j][1],"l-faint",1.1); pts.forEach((p,i)=>s+=circ(p[0],p[1],3,i===0?"l-fill-sage":"l-ink",1.3)); return s; } },
      { vname: "Grid 3x3", concept: "A tidy lattice of agents, the orchestrated field.", spec: "3x3 node grid with sage dots and dim links.", draw: () => { const g=3,cells=36/(g-1); const pts=[]; for(let i=0;i<g;i++)for(let j=0;j<g;j++) pts.push([14+i*cells,14+j*cells]); let s=""; for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++) if((Math.abs(pts[i][0]-pts[j][0])<cells+1&&Math.abs(pts[i][1]-pts[j][1])<cells+1)&&(pts[i][0]===pts[j][0]||pts[i][1]===pts[j][1])) s+=line(pts[i][0],pts[i][1],pts[j][0],pts[j][1],"l-dim",1.2); pts.forEach((p)=>s+=circ(p[0],p[1],2.6,"l-fill-sage")); return s; } },
      { vname: "Chain", concept: "A chain of agents in a line.", spec: "Five nodes in a chain, sage ends.", draw: () => { const pts=[[12,32],[23,32],[34,32],[45,32],[54,32]]; let s=""; for(let i=0;i<pts.length-1;i++) s+=line(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],"l-dim",1.5); pts.forEach((p,i)=>s+=circ(p[0],p[1],3,i===0||i===4?"l-fill-sage":"l-ink",1.4)); return s; } },
      { vname: "Star Net", concept: "One center, four around it.", spec: "Central sage node with four ink satellites.", draw: () => { let s=dot(32,32,4,"l-fill-sage"); [[32,16],[48,32],[32,48],[16,32]].forEach((p)=>{s+=line(32,32,p[0],p[1],"l-dim",1.4);s+=circ(p[0],p[1],3,"l-ink",1.4);}); return s; } },
      { vname: "Ring of Dots", concept: "A circle of agents around the center.", spec: "Six ink dots on a ring with sage hub.", draw: () => { let s=dot(32,32,3.4,"l-fill-sage"); for(let i=0;i<6;i++){const a=(i/6)*TAU;const [x,y]=pt(32,32,16,a); s+=line(32,32,x,y,"l-dim",1.2)+circ(x,y,2.8,"l-ink",1.3);} return s; } },
      { vname: "Binary Tree", concept: "A branching tree of agents.", spec: "Root with two children each branching.", draw: () => { let s=dot(32,14,3.4,"l-fill-sage"); const l1=[20,30],r1=[44,30]; s+=line(32,14,l1[0],l1[1],"l-dim",1.4)+line(32,14,r1[0],r1[1],"l-dim",1.4); [l1,r1].forEach(p=>{const c1=[p[0]-8,46],c2=[p[0]+8,46]; s+=line(p[0],p[1],c1[0],c1[1],"l-dim",1.2)+line(p[0],p[1],c2[0],c2[1],"l-dim",1.2)+circ(c1[0],c1[1],2.6,"l-ink",1.3)+circ(c2[0],c2[1],2.6,"l-ink",1.3);}); return s; } },
      { vname: "Mesh", concept: "An irregular mesh of links.", spec: "Five nodes fully linked, sage hub.", draw: () => { const p=reg(32,33,15,5); let s=dot(32,33,3,"l-fill-sage"); for(let i=0;i<5;i++)for(let j=i+1;j<5;j++) s+=line(p[i][0],p[i][1],p[j][0],p[j][1],"l-faint",1); p.forEach(q=>s+=circ(q[0],q[1],2.8,"l-ink",1.3)); return s; } },
      { vname: "Hub Seven", concept: "A coordinator with seven links.", spec: "Sage hub with seven satellites.", draw: () => spokeGraph(32,32,7,19,2)+circ(32,32,17,"l-faint",1.1) },
      { vname: "Cluster", concept: "Two clusters loosely linked.", spec: "Left and right node groups joined.", draw: () => { let s=dot(22,30,3.4,"l-fill-sage")+dot(22,38,2.8,"l-ink",1.3)+dot(20,34,2.8,"l-ink",1.3)+line(20,34,22,30,"l-dim",1.3)+line(20,34,22,38,"l-dim",1.3); s+=dot(44,30,3.4,"l-fill-sage")+dot(46,38,2.8,"l-ink",1.3)+dot(44,34,2.8,"l-ink",1.3)+line(44,34,44,30,"l-dim",1.3)+line(44,34,46,38,"l-dim",1.3); s+=line(22,38,44,30,"l-dim",1.2); return s; } },
      { vname: "Path Nodes", concept: "A meandering path of agents.", spec: "Five nodes along a curve.", draw: () => { const pts=[[14,46],[26,34],[34,40],[44,24],[52,32]]; let s=path(`M14 46 Q26 34 34 40 T52 32`,"l-dim",1.4); pts.forEach((p,i)=>s+=circ(p[0],p[1],3,i%2?"l-fill-sage":"l-ink",1.3)); return s; } },
      { vname: "Radial Eight", concept: "Eight agents around one.", spec: "Sage hub with eight satellites.", draw: () => { let s=dot(32,32,3,"l-fill-sage"); for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x,y]=pt(32,32,18,a); s+=line(32,32,x,y,"l-dim",1.1)+circ(x,y,2.6,"l-ink",1.2);} return s; } },
      { vname: "Triangle Mesh", concept: "Agents on a triangle, fully linked.", spec: "Three nodes with all three links.", draw: () => { const p=reg(32,33,16,3); let s=""; for(let i=0;i<3;i++)for(let j=i+1;j<3;j++) s+=line(p[i][0],p[i][1],p[j][0],p[j][1],"l-dim",1.3); p.forEach(q=>s+=circ(q[0],q[1],3,"l-ink",1.3)); s+=dot(32,33,3.2,"l-fill-sage"); return s; } },
      { vname: "Ladder", concept: "Two rails with rungs of agents.", spec: "Two rails linked by three rungs.", draw: () => { let s=line(22,16,22,50,"l-dim",1.4)+line(42,16,42,50,"l-dim",1.4); for(let i=0;i<3;i++) s+=line(22,24+i*10,42,24+i*10,"l-sage",1.4); s+=dot(22,16,2.6,"l-fill-sage")+dot(42,16,2.6,"l-fill-sage"); return s; } },
      { vname: "Spiral Graph", concept: "Nodes arranged on a spiral.", spec: "Five nodes on an inward spiral, sage core.", draw: () => { let s=dot(32,32,3,"l-fill-sage"); for(let i=1;i<=5;i++){const t=i/6;const a=t*2.4*Math.PI;const r=20*(1-t)+3;const [x,y]=pt(32,32,r,a); s+=circ(x,y,2.6,"l-ink",1.2);} return s; } },
      { vname: "Web Corner", concept: "A web anchored at one corner.", spec: "Radial links from a top-left anchor.", draw: () => { const a=[10,10]; let s=dot(a[0],a[1],3.4,"l-fill-sage"); const nodes=[[50,12],[52,50],[14,52],[40,30],[26,40]]; nodes.forEach(n=>{s+=line(a[0],a[1],n[0],n[1],"l-dim",1.2)+circ(n[0],n[1],2.6,"l-ink",1.2);}); return s; } },
      { vname: "Paired Clusters", concept: "Two small groups, the conversation.", spec: "Two pairs of nodes, sage leads.", draw: () => { let s=""; [[24,30],[24,38]].forEach((p,i)=>{s+=circ(p[0],p[1],3,i?"l-ink":"l-fill-sage",1.3)+line(24,30,24,38,"l-dim",1.2);}); [[40,30],[40,38]].forEach((p,i)=>{s+=circ(p[0],p[1],3,i?"l-ink":"l-fill-sage",1.3)+line(40,30,40,38,"l-dim",1.2);}); s+=line(24,34,40,34,"l-dim",1.2); return s; } },
      { vname: "Constellation", concept: "A loose star map of agents.", spec: "Seven nodes joined sparsely, sage core.", draw: () => { const pts=[[14,18],[30,14],[48,22],[52,42],[36,50],[18,44],[32,32]]; let s=dot(32,32,3.4,"l-fill-sage"); for(let i=0;i<pts.length-1;i++){if(Math.hypot(pts[i][0]-pts[i+1][0],pts[i][1]-pts[i+1][1])<30) s+=line(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],"l-faint",1);} pts.forEach((p,i)=>{if(i!==6)s+=circ(p[0],p[1],2.6,"l-ink",1.2);}); return s; } },
    ],
  },

  // 11. TYPOGRAPHIC MONOGRAM ------------------------------------------------
  {
    id: "monogram",
    name: "Typographic Monogram",
    seed: 121,
    variants: [
      { vname: "O in A", concept: "An O holding an A, the OmniAgent mark at rest.", spec: "Ink O enclosing a sage A with crossbar.", draw: (rng) => { const r=jit(rng,16,2); return circ(32,32,r,"l-ink",2.4)+path(`M32 ${32-r*0.6} L${32+r*0.5} ${32+r*0.5} L${32-r*0.5} ${32+r*0.5} Z`,"l-sage",2)+line(32-r*0.28,32+r*0.22,32+r*0.28,32+r*0.22,"l-sage",1.6); } },
      { vname: "Interlock", concept: "O and A sharing a stroke, the joined identity.", spec: "Ink O interlocked with a sage A to the right.", draw: () => circ(28,32,13,"l-ink",2.2)+path(`M40 20 L52 46 L28 46`,"l-sage",2.2)+line(34,38,46,38,"l-sage",1.6) },
      { vname: "A in O", concept: "An A set inside a thin circle, the mark framed.", spec: "Faint ring framing an ink A with sage bar.", draw: (rng) => { const r=jit(rng,18,1); return circ(32,32,r,"l-faint",1.4)+path(`M32 22 L44 44 L20 44 Z`,"l-ink",2.2)+line(26,36,38,36,"l-sage",1.8); } },
      { vname: "Stacked", concept: "O above A, the calm vertical monogram.", spec: "Ink O over a sage A, vertically stacked.", draw: () => circ(32,22,9,"l-ink",2.2)+path(`M22 40 L32 30 L42 40 Z`,"l-sage",2)+line(27,36,37,36,"l-sage",1.6) },
      { vname: "Monoline OA", concept: "O and A drawn in one line weight.", spec: "Monoline O and A at equal stroke.", draw: () => path(`M26 24 a6 6 0 1 0 0.1 0`,"l-ink",2.2)+path(`M26 44 L32 30 L38 44 M28 39 L36 39`,"l-sage",2.2) },
      { vname: "OA Overlap", concept: "O and A overlapping, the blended mark.", spec: "Ink O overlapped by a sage A.", draw: () => circ(30,32,12,"l-ink",2.2)+path(`M34 22 L48 46 L26 46 Z`,"l-sage",1.8) },
      { vname: "O with Bar", concept: "An O bearing a calm bar, the anchored O.", spec: "Ink O with a sage horizontal bar.", draw: () => circ(32,32,16,"l-ink",2.2)+line(22,32,42,32,"l-sage",2) },
      { vname: "A Circle", concept: "An A with a sage dot above, the aimed A.", spec: "Ink A with a sage node apex.", draw: () => path(`M24 46 L32 22 L40 46 M27 38 L37 38`,"l-ink",2.2)+dot(32,18,2.6,"l-fill-sage") },
      { vname: "O in Square", concept: "An O set in a calm frame.", spec: "Rounded square framing an ink O.", draw: () => rectR(16,16,32,32,8,"l-ink",2)+circ(32,32,11,"l-sage",1.8) },
      { vname: "AO Vertical", concept: "A over O, the flipped stack.", spec: "Sage A above an ink O.", draw: () => path(`M22 30 L32 18 L42 30 Z`,"l-sage",2)+line(27,26,37,26,"l-sage",1.6)+circ(32,40,9,"l-ink",2.2) },
      { vname: "Double O", concept: "Two O's side by side, the paired O.", spec: "Two ink rings, sage between.", draw: () => circ(24,32,11,"l-ink",2.2)+circ(42,32,11,"l-ink",2.2)+dot(33,32,2.6,"l-fill-sage") },
      { vname: "A Triangle", concept: "An A within a triangle, the grounded A.", spec: "Ink triangle with a sage A.", draw: () => poly(reg(32,34,17,3),"l-ink",2)+path(`M32 26 L40 42 L24 42 Z`,"l-sage",1.8) },
      { vname: "O Dotted", concept: "An O with a dotted sage interior.", spec: "Ink O with sage dot field.", draw: () => circ(32,32,16,"l-ink",2.2)+dot(32,32,3,"l-fill-sage")+dot(26,32,2,"l-fill-sage")+dot(38,32,2,"l-fill-sage") },
      { vname: "A Pennant", concept: "An A as a pennant, the banner A.", spec: "Sage A on a dim staff.", draw: () => line(20,16,20,50,"l-dim",1.6)+path(`M20 18 L46 26 L20 34 Z`,"l-sage",2) },
      { vname: "O Coronet", concept: "An O crowned by a small mark.", spec: "Ink O with a sage crown arc.", draw: () => circ(32,34,14,"l-ink",2.2)+arc(32,20,10,Math.PI*1.1,Math.PI*1.9,"l-sage",2) },
      { vname: "A Mirror", concept: "An A mirrored, the reflected identity.", spec: "Ink A with a sage mirrored A.", draw: () => path(`M22 44 L32 24 L42 44 M26 37 L38 37`,"l-ink",2)+path(`M22 44 L32 24 L42 44`,"l-sage",1.4) },
      { vname: "O Halo", concept: "An O with a soft halo, the lit O.", spec: "Ink O with a faint outer ring.", draw: () => circ(32,32,16,"l-ink",2.2)+circ(32,32,21,"l-faint",1.2) },
      { vname: "Monogram Tile", concept: "An O and A within a seal.", spec: "Rounded seal with sage O and ink A.", draw: () => rectR(16,16,32,32,8,"l-ink",2)+circ(32,32,8,"l-sage",1.6)+path(`M32 27 L37 39 L27 39 Z`,"l-ink",1.6) },
      { vname: "A Stroke", concept: "A single A stroke, the minimal mark.", spec: "One ink A stroke with sage bar.", draw: () => path(`M24 46 L32 20 L40 46`,"l-ink",2.4)+line(27,38,37,38,"l-sage",2) },
      { vname: "O Stack", concept: "Two O's stacked, the doubled O.", spec: "Two ink rings stacked with sage dot.", draw: () => circ(32,22,10,"l-ink",2.2)+circ(32,42,10,"l-ink",2.2)+dot(32,32,2.6,"l-fill-sage") },
    ],
  },

  // 12. INK / BRUSH (softened) ------------------------------------------------
  {
    id: "ink-brush",
    name: "Ink / Brush",
    seed: 132,
    variants: [
      { vname: "Stroke", concept: "One soft brush stroke, the deliberate single mark.", spec: "Tapered filled brush stroke, soft ends.", draw: (rng) => { const x=jit(rng,30,3); return path(`M${x-12} 44 C${x-4} 40 ${x+2} 22 ${x+14} 18 C${x+6} 26 ${x+2} 40 ${x-12} 44 Z`,"l-fill-ink"); } },
      { vname: "River", concept: "Two strokes flowing side by side, the quiet current.", spec: "Pair of tapered strokes, sage and ink.", draw: () => path(`M18 46 C26 36 22 24 30 16 C24 26 28 38 22 48 Z`,"l-fill-sage")+path(`M34 48 C42 38 38 26 46 18 C40 28 44 40 38 50 Z`,"l-fill-ink") },
      { vname: "Comma", concept: "A single brush comma, the ensō tail at rest.", spec: "Filled brush comma with soft taper.", draw: (rng) => { const x=jit(rng,30,3); return path(`M${x} 18 C${x+14} 22 ${x+14} 40 ${x} 46 C${x+8} 40 ${x+6} 28 ${x-4} 26 C${x+2} 26 ${x+2} 22 ${x} 18 Z`,"l-fill-ink"); } },
      { vname: "Vertical", concept: "A calm vertical brush, the upright mark.", spec: "Tapered vertical sage brush stroke.", draw: (rng) => { const x=jit(rng,32,3); return path(`M${x} 14 C${x+6} 20 ${x+4} 30 ${x+2} 44 C${x+4} 50 ${x-4} 50 ${x-4} 44 C${x-2} 30 ${x-4} 22 ${x} 14 Z`,"l-fill-sage"); } },
      { vname: "Cross", concept: "Two soft strokes crossing, the gentle mark made twice.", spec: "Crossed tapered strokes, ink over sage.", draw: () => path(`M22 20 C28 26 30 34 26 46 C32 36 30 28 26 22 Z`,"l-fill-ink")+path(`M44 18 C38 24 36 32 40 46 C34 36 36 26 42 20 Z`,"l-fill-sage") },
      { vname: "Enso Tail", concept: "An ensō tail, the open brush ring.", spec: "Filled brush arc, soft open end.", draw: () => { let d="M44 22 "; for(let i=0;i<=24;i++){const t=i/24;const a=Math.PI*0.15+t*Math.PI*1.5;const r=18-t*2;const [x,y]=pt(32,34,r,a);d+=`L${f(x)} ${f(y)} `;} return path(d+"Z","l-fill-ink"); } },
      { vname: "Sweep", concept: "A single broad sweep, the confident mark.", spec: "Wide tapered ink sweep.", draw: () => path(`M12 40 C24 30 40 30 52 22 C44 36 30 44 16 48 C14 46 12 44 12 40 Z`,"l-fill-ink") },
      { vname: "Double Sweep", concept: "Two sweeps echoing, the paired stroke.", spec: "Two ink sweeps, sage between.", draw: () => path(`M12 30 C26 22 42 22 52 16 C46 30 32 38 16 40 Z`,"l-fill-ink")+path(`M14 48 C28 42 42 42 52 36 C46 48 32 52 16 52 Z`,"l-fill-sage") },
      { vname: "Brush Dot", concept: "A soft brush dot, the ink breath.", spec: "Sage filled circle, soft.", draw: () => circ(32,32,14,"l-fill-sage") },
      { vname: "Brush Arc", concept: "A soft brush arc, the moon stroke.", spec: "Filled sage arc with tapered ends.", draw: () => { let d="M16 40 "; for(let i=0;i<=20;i++){const t=i/20;const a=Math.PI+ t*Math.PI;const [x,y]=pt(32,32,18,a);d+=`L${f(x)} ${f(y)} `;} return path(d+"Z","l-fill-sage"); } },
      { vname: "Brush Leaf", concept: "A brush leaf, the botanical stroke.", spec: "Sage filled leaf with ink vein.", draw: () => path(`M32 50 V24`,"l-ink",2)+path(`M32 42 C46 40 48 22 32 16 C30 28 30 38 32 42 Z`,"l-fill-sage") },
      { vname: "Brush Mountain", concept: "A brush triangle, the ink peak.", spec: "Filled ink triangle, soft.", draw: () => poly([[16,48],[32,20],[48,48]],"l-fill-ink") },
      { vname: "Brush Wave", concept: "A brush wave, the ink tide.", spec: "Filled ink wave shape.", draw: () => path(`M10 34 Q20 22 30 34 T54 34 Q44 44 30 38 T10 44 Z`,"l-fill-ink") },
      { vname: "Brush Spiral", concept: "A brush spiral, the curling ink.", spec: "Filled inward spiral.", draw: () => { let d="M50 32 "; for(let i=0;i<=40;i++){const t=i/40;const a=t*2.6*Math.PI;const r=20*(1-t)+2;const [x,y]=pt(32,32,r,a);d+=`L${f(x)} ${f(y)} `;} return path(d+"Z","l-fill-sage"); } },
      { vname: "Brush Fork", concept: "A brush that splits, the branching ink.", spec: "Ink stroke splitting to two tips.", draw: () => path(`M24 50 C24 36 30 28 34 18 C36 28 34 36 32 50 Z`,"l-fill-ink")+path(`M34 30 C40 26 46 22 50 16 C46 28 42 34 36 40 Z`,"l-fill-sage") },
      { vname: "Brush Star", concept: "A soft brush star, the ink bloom.", spec: "Filled sage four-point star.", draw: () => poly(starPts(32,32,16,5,4),"l-fill-sage") },
      { vname: "Brush Triangle", concept: "A brush triangle, the grounded ink.", spec: "Filled ink triangle with sage base.", draw: () => poly([[18,46],[32,22],[46,46]],"l-fill-ink")+line(18,46,46,46,"l-sage",3) },
      { vname: "Brush Crescent", concept: "A brush crescent, the ink moon.", spec: "Filled ink crescent.", draw: () => path(`M40 16 A16 16 0 1 0 40 48 A12.5 12.5 0 1 1 40 16 Z`,"l-fill-ink") },
      { vname: "Brush Loop", concept: "A brush loop, the tied ink.", spec: "Filled sage loop.", draw: () => path(`M32 14 C46 14 48 50 32 50 C18 50 18 14 32 14 Z`,"l-fill-sage") },
      { vname: "Brush Burst", concept: "A brush burst, the sudden ink.", spec: "Sage filled star with ink center.", draw: () => poly(starPts(32,32,17,6,5),"l-fill-sage")+circ(32,32,4,"l-ink",1.4) },
    ],
  },

  // 13. SEED & GROWTH ---------------------------------------------------------
  {
    id: "seed-growth",
    name: "Seed & Growth",
    seed: 143,
    variants: [
      { vname: "Sprout", concept: "A seed cracked by a single shoot, the first arising.", spec: "Dim seed with an ink stem and two sage leaves.", draw: (rng) => { const x=jit(rng,32,3); return path(`M${x-9} 50 q9 -4 18 0 q-2 6 -9 6 q-7 0 -9 -6 Z`,"l-fill-dim")+path(`M${x} 50 V30`,"l-ink",2.2)+path(`M${x} 36 q-8 -6 -10 -14 q9 2 10 14 Z`,"l-fill-sage")+path(`M${x} 32 q8 -5 12 -12 q-9 1 -12 12 Z`,"l-fill-sage"); } },
      { vname: "Leaf", concept: "A single leaf on a stem, the calm botanical.", spec: "Ink stem with a sage leaf and dim vein.", draw: (rng) => { const x=jit(rng,30,3); return path(`M${x} 50 V26`,"l-ink",2)+path(`M${x} 40 C${x+14} 38 ${x+16} 22 ${x} 18 C${x-2} 28 ${x-2} 36 ${x} 40 Z`,"l-fill-sage")+line(x,40,x+4,30,"l-dim",1); } },
      { vname: "Twin", concept: "Two leaves opening, the symmetrical beginning.", spec: "Ink stem with paired sage and dim leaves.", draw: () => path(`M32 50 V34`,"l-ink",2)+path(`M32 40 C20 38 18 24 32 20 C32 30 32 36 32 40 Z`,"l-fill-sage")+path(`M32 40 C44 38 46 24 32 20 C32 30 32 36 32 40 Z`,"l-fill-dim") },
      { vname: "Seed", concept: "A seed alone, the held potential.", spec: "Filled seed silhouette with a paper center line.", draw: (rng) => { const x=jit(rng,32,3); return path(`M${x} 20 C${x+8} 26 ${x+8} 42 ${x} 48 C${x-8} 42 ${x-8} 26 ${x} 20 Z`,"l-fill-ink")+line(x,24,x,44,"l-fill-paper",1.4); } },
      { vname: "Branch", concept: "A slender branch with small buds, the patient growth.", spec: "Ink branch with a sage twig and bud nodes.", draw: (rng) => { const x=jit(rng,28,3); return path(`M${x} 50 C${x+6} 40 ${x+2} 30 ${x+10} 16`,"l-ink",2)+path(`M${x+4} 38 q8 -4 12 -12`,"l-sage",1.8)+dot(x+10,16,2.4,"l-fill-sage")+dot(x+16,26,2,"l-fill-dim"); } },
      { vname: "Bud", concept: "A single bud, the promise before bloom.", spec: "Ink stem with a sage bud.", draw: () => path(`M32 50 V30`,"l-ink",2)+path(`M32 30 C26 28 26 18 32 14 C38 18 38 28 32 30 Z`,"l-fill-sage") },
      { vname: "Vine", concept: "A curling vine with small leaves.", spec: "Ink vine with two sage leaves.", draw: () => path(`M20 50 C20 34 44 34 44 18`,"l-ink",2)+path(`M30 36 C24 34 24 28 30 26 C32 30 32 34 30 36 Z`,"l-fill-sage")+path(`M38 28 C44 26 44 20 38 18 C36 22 36 26 38 28 Z`,"l-fill-sage") },
      { vname: "Flower", concept: "A small flower, the open bloom.", spec: "Five sage petals around an ink core.", draw: () => { const p=reg(32,32,10,5); let s=""; p.forEach(q=>{const a=Math.atan2(q[1]-32,q[0]-32);const [x,y]=pt(32,32,15,a); s+=path(`M32 32 Q${q[0]} ${q[1]} ${x} ${y} Z`,"l-fill-sage");}); s+=circ(32,32,3.4,"l-ink",1.4); return s; } },
      { vname: "Fern", concept: "A fern frond, the feathered leaf.", spec: "Ink stem with paired sage leaflets.", draw: () => { let s=path(`M32 50 V18`,"l-ink",2); for(let i=0;i<5;i++){const y=22+i*6; s+=path(`M32 ${y} q-8 -2 -10 -8 q8 2 10 8 Z`,"l-fill-sage")+path(`M32 ${y} q8 -2 10 -8 q-8 2 -10 8 Z`,"l-fill-sage");} return s; } },
      { vname: "Tree", concept: "A simple tree, the small woodland.", spec: "Ink trunk with sage crown.", draw: () => path(`M32 50 V34`,"l-ink",2.4)+path(`M20 34 Q32 14 44 34 Q32 28 20 34 Z`,"l-fill-sage") },
      { vname: "Seedling", concept: "A sprout in soil, the first soil.", spec: "Sage sprout above a dim soil line.", draw: () => path(`M32 36 V24`,"l-ink",2)+path(`M32 30 C26 28 26 20 32 16 C38 20 38 28 32 30 Z`,"l-fill-sage")+line(14,40,50,40,"l-dim",1.6) },
      { vname: "Two Seeds", concept: "Two seeds resting, the doubled potential.", spec: "Two ink seeds, sage between.", draw: (rng) => { const x=jit(rng,28,3); return path(`M${x} 22 C${x+7} 27 ${x+7} 39 ${x} 44 C${x-7} 39 ${x-7} 27 ${x} 22 Z`,"l-fill-ink")+path(`M${x+12} 22 C${x+19} 27 ${x+19} 39 ${x+12} 44 C${x+5} 39 ${x+5} 27 ${x+12} 22 Z`,"l-fill-sage"); } },
      { vname: "Grain", concept: "A single grain, the held harvest.", spec: "Ink grain with sage awns.", draw: () => path(`M32 46 C28 38 28 26 32 18 C36 26 36 38 32 46 Z`,"l-fill-ink")+line(32,18,32,10,"l-sage",1.6)+line(32,18,28,12,"l-sage",1.4)+line(32,18,36,12,"l-sage",1.4) },
      { vname: "Blossom", concept: "A blossom of circles, the open face.", spec: "Five sage circles around an ink center.", draw: () => { const p=reg(32,32,11,5); let s=""; p.forEach(q=>s+=circ(q[0],q[1],5,"l-fill-sage")); s+=circ(32,32,4,"l-ink",1.4); return s; } },
      { vname: "Cactus", concept: "A rounded cactus, the desert calm.", spec: "Sage cactus with ink arms.", draw: () => path(`M28 50 V26 Q28 18 32 18 Q36 18 36 26 V50 Z`,"l-fill-sage")+path(`M28 34 q-6 0 -6 -6 q0 -4 4 -4`,"l-ink",2)+path(`M36 30 q6 0 6 -6 q0 -4 -4 -4`,"l-ink",2) },
      { vname: "Mushroom", concept: "A small mushroom, the quiet fungus.", spec: "Sage cap with ink stem.", draw: () => path(`M18 32 Q32 14 46 32 Z`,"l-fill-sage")+rectR(28,32,8,14,3,"l-ink",2) },
      { vname: "Clover", concept: "A three-leaf clover, the small luck.", spec: "Three sage leaf circles and a stem.", draw: () => path(`M32 50 V36`,"l-ink",2)+circ(32,24,7,"l-fill-sage")+circ(25,32,7,"l-fill-sage")+circ(39,32,7,"l-fill-sage") },
      { vname: "Hanging", concept: "A hanging plant, the suspended growth.", spec: "Ink pot with sage trails.", draw: () => { let s=path(`M22 20 H42 L38 30 H26 Z`,"l-ink",2); s+=path(`M26 30 C20 40 22 48 26 52`,"l-sage",1.8)+path(`M38 30 C44 40 42 48 38 52`,"l-sage",1.8)+path(`M32 30 V50`,"l-sage",1.8); return s; } },
      { vname: "Rooted Arrow", concept: "An arrow taking root, the directed growth.", spec: "Ink arrow with sage roots.", draw: () => path(`M22 16 L38 16 L38 28 L48 28 L32 44 L16 28 L26 28 L26 16 Z`,"l-ink",2)+path(`M32 44 V52`,"l-sage",1.8)+path(`M32 48 q-4 2 -6 0`,"l-sage",1.6)+path(`M32 48 q4 2 6 0`,"l-sage",1.6) },
      { vname: "Vine Heart", concept: "A leaf pair forming a calm heart.", spec: "Two sage leaves meeting at a point.", draw: () => path(`M32 46 C20 38 20 22 32 28 C44 22 44 38 32 46 Z`,"l-fill-sage")+line(32,28,32,46,"l-ink",1.4) },
    ],
  },

  // 14. STONE & BALANCE -------------------------------------------------------
  {
    id: "stone-balance",
    name: "Stone & Balance",
    seed: 154,
    variants: [
      { vname: "Cairn", concept: "Three stones stacked, the calm tower of attention.", spec: "Three stacked stones, ink/sage/ink.", draw: (rng) => { const x=jit(rng,32,3); return path(`M${x-12} 50 q12 -8 24 0 q-4 5 -12 5 q-8 0 -12 -5 Z`,"l-ink",2.2)+path(`M${x-9} 38 q9 -7 18 0 q-3 5 -9 5 q-6 0 -9 -5 Z`,"l-sage",2)+path(`M${x-6} 28 q6 -6 12 0 q-2 4 -6 4 q-4 0 -6 -4 Z`,"l-ink",2); } },
      { vname: "Pair Stones", concept: "Two stones resting, the balanced couple.", spec: "Two resting stones, ink and sage.", draw: (rng) => { const x=jit(rng,30,3); return path(`M${x-12} 50 q12 -9 24 0 q-4 5 -12 5 q-8 0 -12 -5 Z`,"l-ink",2.2)+path(`M${x+2} 44 q8 -8 16 0 q-2 5 -8 5 q-6 0 -8 -5 Z`,"l-sage",2); } },
      { vname: "Drop", concept: "A stone dropping into rings, the cause and the calm.", spec: "Stone above two sage/dim ripple arcs.", draw: () => path(`M26 46 q6 -6 12 0 q-2 4 -6 4 q-4 0 -6 -4 Z`,"l-ink",2.2)+arc(32,48,13,Math.PI*1.1,Math.PI*1.9,"l-sage",1.5)+arc(32,48,19,Math.PI*1.15,Math.PI*1.85,"l-dim",1.2) },
      { vname: "Tower", concept: "A slender tower of stones, the patient stack.", spec: "Four diminishing stones, alternating ink/sage.", draw: (rng) => { const x=jit(rng,32,2); const ys=[50,42,35,29], ws=[13,10,8,6]; let s=""; ys.forEach((y,i)=>s+=path(`M${x-ws[i]} ${y} q${ws[i]} -${ws[i]*0.6} ${ws[i]*2} 0 q-${ws[i]*0.4} ${ws[i]*0.4} -${ws[i]} 0 Z`,i%2?"l-sage":"l-ink",2)); return s; } },
      { vname: "Beam", concept: "A stone balanced on a line, the still point of equipoise.", spec: "Ink stone balanced on a dim beam with sage node.", draw: (rng) => { const x=jit(rng,32,3); return line(12,44,52,44,"l-dim",1.6)+path(`M${x-8} 44 q8 -12 16 0 q-3 4 -8 4 q-5 0 -8 -4 Z`,"l-ink",2.2)+dot(x,36,2,"l-fill-sage"); } },
      { vname: "Single Stone", concept: "One stone alone, the quiet weight.", spec: "Filled ink stone, soft.", draw: () => path(`M18 44 Q18 30 32 30 Q48 30 48 44 Q48 52 32 52 Q18 52 18 44 Z`,"l-fill-ink") },
      { vname: "Stack Two", concept: "Two stones stacked, the simple cairn.", spec: "Two stacked stones, ink over sage.", draw: () => path(`M18 50 q14 -8 28 0 q-5 5 -14 5 q-9 0 -14 -5 Z`,"l-ink",2.2)+path(`M22 40 q10 -7 20 0 q-4 5 -10 5 q-6 0 -10 -5 Z`,"l-sage",2) },
      { vname: "Stack Five", concept: "Five diminishing stones, the tall cairn.", spec: "Five stones, alternating ink/sage.", draw: () => { const ys=[50,43,37,32,28], ws=[14,11,9,7,5]; let s=""; ys.forEach((y,i)=>s+=path(`M${32-ws[i]} ${y} q${ws[i]} -${ws[i]*0.55} ${ws[i]*2} 0 q-${ws[i]*0.4} ${ws[i]*0.45} -${ws[i]} 0 Z`,i%2?"l-sage":"l-ink",1.8)); return s; } },
      { vname: "Tilted Beam", concept: "A stone balanced on a tilted beam.", spec: "Ink stone on a dim slanted beam, sage node.", draw: () => line(14,40,50,48,"l-dim",1.6)+path(`M28 38 q8 -10 16 0 q-3 4 -8 4 q-5 0 -8 -4 Z`,"l-ink",2.2)+dot(36,30,2,"l-fill-sage") },
      { vname: "Stone Arch", concept: "Two stones forming an arch, the gateway.", spec: "Two ink stones meeting at a sage keystone.", draw: () => path(`M18 50 V32 q0 -8 8 -8`,"l-ink",2.2)+path(`M46 50 V32 q0 -8 -8 -8`,"l-ink",2.2)+poly([[28,24],[36,24],[34,30],[30,30]],"l-sage") },
      { vname: "Stone Circle", concept: "Three stones in a row, the calm row.", spec: "Three ink/sage/dim stones in a line.", draw: () => path(`M14 48 q8 -9 16 0 q-3 4 -8 4 q-5 0 -8 -4 Z`,"l-ink",2)+path(`M26 48 q8 -9 16 0 q-3 4 -8 4 q-5 0 -8 -4 Z`,"l-sage",2)+path(`M38 48 q8 -9 16 0 q-3 4 -8 4 q-5 0 -8 -4 Z`,"l-dim",1.8) },
      { vname: "Pebble Line", concept: "A row of small pebbles, the shoreline.", spec: "Four small stones, alternating.", draw: () => { let s=""; [[18,46],[28,47],[38,46],[48,47]].forEach((p,i)=>s+=path(`M${p[0]-6} ${p[1]} q6 -7 12 0 q-2 3 -6 3 q-4 0 -6 -3 Z`,i%2?"l-sage":"l-ink",1.8)); return s; } },
      { vname: "Stone Shadow", concept: "A stone with a soft shadow, the grounded weight.", spec: "Ink stone with a sage shadow ellipse.", draw: () => path(`M20 40 Q20 28 32 28 Q44 28 44 40 Q44 48 32 48 Q20 48 20 40 Z`,"l-fill-ink")+ellipse(32,52,14,3) },
      { vname: "Egg", concept: "An oval stone, the smooth weight.", spec: "Sage oval with ink highlight.", draw: () => { const p=[]; for(let i=0;i<=24;i++){const a=(i/24)*TAU; const rx=15,ry=19; p.push([32+rx*Math.cos(a),34+ry*Math.sin(a)]);} let s=poly(p,"l-fill-sage"); s+=ellipse(26,28,4,6); return s; } },
      { vname: "Boulder", concept: "A large rounded boulder, the settled mass.", spec: "Ink boulder with sage cap.", draw: () => path(`M14 48 Q14 30 32 30 Q50 30 50 48 Q50 54 32 54 Q14 54 14 48 Z`,"l-fill-ink")+path(`M14 48 Q14 30 32 30 Q50 30 50 48`,"l-sage",2) },
      { vname: "Stepping", concept: "Three stepping stones across water.", spec: "Three stones with sage ripples.", draw: () => { let s=line(10,46,54,46,"l-sage",1.4); [[20,40],[34,44],[46,40]].forEach((p,i)=>s+=path(`M${p[0]-7} ${p[1]} q7 -8 14 0 q-3 4 -7 4 q-4 0 -7 -4 Z`,i%2?"l-ink":"l-dim",1.8)); return s; } },
      { vname: "Zen Rock", concept: "A single rock with raked lines, the garden.", spec: "Ink rock with three sage rake lines.", draw: () => path(`M22 44 Q22 30 34 30 Q46 30 46 44 Q46 50 34 50 Q22 50 22 44 Z`,"l-ink",2)+line(16,40,50,40,"l-sage",1.2)+line(14,46,52,46,"l-sage",1.2)+line(18,52,48,52,"l-sage",1.2) },
      { vname: "Balanced Tri", concept: "A triangle of stones, the stable set.", spec: "Three stones in a triangle, sage apex.", draw: () => path(`M16 50 q10 -9 20 0 q-4 4 -10 4 q-6 0 -10 -4 Z`,"l-ink",2)+path(`M34 50 q10 -9 20 0 q-4 4 -10 4 q-6 0 -10 -4 Z`,"l-ink",2)+path(`M26 36 q6 -7 12 0 q-2 4 -6 4 q-4 0 -6 -4 Z`,"l-sage",2) },
      { vname: "Monolith", concept: "A single standing stone, the marker.", spec: "Tall ink monolith with sage base line.", draw: () => path(`M26 50 V20 Q26 14 32 14 Q38 14 38 20 V50 Z`,"l-ink",2)+line(18,50,46,50,"l-sage",1.8) },
      { vname: "Resting Shard", concept: "A leaning shard, the broken whole at rest.", spec: "Asymmetric stone shard, sage base.", draw: () => poly([[22,48],[34,22],[46,32],[40,50]],"l-fill-ink")+line(16,50,50,50,"l-sage",1.6) },
    ],
  },

  // 15. MOON & CELESTIAL ------------------------------------------------------
  {
    id: "moon-celestial",
    name: "Moon & Celestial",
    seed: 165,
    variants: [
      { vname: "Crescent", concept: "A thin crescent, the calm of the waning night.", spec: "Filled crescent from two offset arcs.", draw: (rng) => { const r=jit(rng,16,2); return path(`M${32+r*0.5} 15 A${r} ${r} 0 1 0 ${32+r*0.5} 49 A${r*0.78} ${r*0.78} 0 1 1 ${32+r*0.5} 15 Z`,"l-fill-ink"); } },
      { vname: "Starlet", concept: "A crescent with one small companion, the quiet sky.", spec: "Ink crescent with a sage companion dot.", draw: () => path(`M38 16 A16 16 0 1 0 38 48 A12.5 12.5 0 1 1 38 16 Z`,"l-fill-ink")+dot(20,20,2.4,"l-fill-sage") },
      { vname: "Fullmoon", concept: "A soft full circle, the settled light.", spec: "Sage disc with a paper inner field and dim craters.", draw: (rng) => { const r=jit(rng,16,2); return circ(32,32,r,"l-fill-sage")+circ(32,32,r*0.7,"l-fill-paper")+dot(28,28,1.6,"l-fill-sage")+dot(37,35,1.2,"l-fill-sage"); } },
      { vname: "Softsun", concept: "A disc with short calm rays, the gentle warmth.", spec: "Sage disc with eight dim soft rays.", draw: () => { let s=circ(32,32,11,"l-fill-sage"); for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x1,y1]=pt(32,32,15,a);const [x2,y2]=pt(32,32,20,a); s+=line(x1,y1,x2,y2,"l-dim",1.6);} return s; } },
      { vname: "Eclipse", concept: "Two circles overlapping, the calm eclipse.", spec: "Ink ring overlapped by a sage disc.", draw: (rng) => { const dx=jit(rng,8,2); return circ(32-dx,32,14,"l-ink")+dot(32+dx,32,14,"l-fill-sage"); } },
      { vname: "Star Four", concept: "A four-point star, the calm spark.", spec: "Filled sage four-point star.", draw: () => poly(starPts(32,32,16,4,4),"l-fill-sage") },
      { vname: "Star Five", concept: "A five-point star, the quiet beacon.", spec: "Filled ink five-point star with sage center.", draw: () => poly(starPts(32,32,17,7,5),"l-fill-ink")+dot(32,32,3,"l-fill-sage") },
      { vname: "Star Six", concept: "A six-point star, the balanced light.", spec: "Filled sage six-point star.", draw: () => { const o=starPts(32,32,17,7,6), i2=starPts(32,32,17,7,6).map((p,i)=>p); let s=""; const a=reg(32,32,17,6); for(let k=0;k<3;k++){const p1=a[k],p2=a[(k+2)%6]; s+=poly([p1,[32,32],p2],"l-fill-sage");} return s; } },
      { vname: "Ring Dots", concept: "A ring of dots, the constellation.", spec: "Eight sage dots on a faint ring.", draw: () => { let s=circ(32,32,18,"l-faint",1.2); for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x,y]=pt(32,32,18,a); s+=dot(x,y,2.2,"l-fill-sage");} return s; } },
      { vname: "Comet", concept: "A comet, the travelling light.", spec: "Sage head with a dim trailing tail.", draw: () => { let s=dot(44,20,5,"l-fill-sage"); s+=path(`M44 20 Q30 30 16 46`,"l-dim",1.6); return s; } },
      { vname: "Ringed Planet", concept: "A planet with a calm ring, the orbited world.", spec: "Sage disc with an ink ring.", draw: () => circ(32,32,11,"l-fill-sage")+ellipse(32,32,19,7) },
      { vname: "Phases", concept: "Three moon phases, the passing month.", spec: "Full, half, crescent in a row.", draw: () => circ(18,32,8,"l-fill-sage")+path(`M32 24 A8 8 0 1 0 32 40 A4 8 0 1 1 32 24 Z`,"l-fill-ink")+path(`M46 24 A8 8 0 1 0 46 40 A6 8 0 1 1 46 24 Z`,"l-fill-dim") },
      { vname: "Sun Long", concept: "A sun with long calm rays.", spec: "Sage disc with six long dim rays.", draw: () => { let s=circ(32,32,10,"l-fill-sage"); for(let i=0;i<6;i++){const a=(i/6)*TAU;const [x1,y1]=pt(32,32,15,a);const [x2,y2]=pt(32,32,22,a); s+=line(x1,y1,x2,y2,"l-dim",1.6);} return s; } },
      { vname: "Half Moon", concept: "A clean half moon, the balanced night.", spec: "Half-filled ink disc, sage flat edge.", draw: () => circ(32,32,16,"l-ink",2)+rectR(32,16,16,32,0,"l-fill-ink")+line(32,16,32,48,"l-sage",1.6) },
      { vname: "Quarter Moon", concept: "A quarter moon, the corner of night.", spec: "Quarter ink disc with sage edge.", draw: () => circ(32,32,16,"l-ink",2)+path(`M32 16 A16 16 0 0 1 48 32 L32 32 Z`,"l-fill-ink")+line(32,16,32,32,"l-sage",1.6)+line(32,32,48,32,"l-sage",1.6) },
      { vname: "Star Burst", concept: "A burst of light, the sudden star.", spec: "Eight-ray sage burst with ink center.", draw: () => { let s=""; for(let i=0;i<8;i++){const a=(i/8)*TAU;const [x1,y1]=pt(32,32,6,a);const [x2,y1b]=pt(32,32,20,a); s+=line(x1,y1,x2,y1b,i%2?"l-sage":"l-dim",1.5);} s+=circ(32,32,4,"l-ink",1.4); return s; } },
      { vname: "Galaxy", concept: "A spiral galaxy, the turning light.", spec: "Sage spiral with ink core.", draw: () => { let d="M32 32 "; for(let i=0;i<=40;i++){const t=i/40;const a=t*3*Math.PI;const r=2+t*18;const [x,y]=pt(32,32,r,a);d+=`L${f(x)} ${f(y)} `;} let s=path(d,"l-sage",1.8); s+=circ(32,32,3.4,"l-ink",1.4); return s; } },
      { vname: "Shooting Star", concept: "A star with a trail, the falling light.", spec: "Sage star with a dim trail.", draw: () => poly(starPts(40,24,9,4,5),"l-fill-sage")+path(`M40 24 Q26 34 14 46`,"l-dim",1.6) },
      { vname: "Moon Cloud", concept: "A moon above a calm cloud.", spec: "Ink crescent above a sage cloud.", draw: () => path(`M40 18 A14 14 0 1 0 40 44 A11 11 0 1 1 40 18 Z`,"l-fill-ink")+path(`M14 46 Q14 38 24 38 Q26 32 34 38 Q46 38 46 46 Z`,"l-fill-sage") },
      { vname: "Moon Horizon", concept: "A moon above a low horizon.", spec: "Sage disc above an ink horizon line.", draw: () => circ(32,24,11,"l-fill-sage")+line(10,46,54,46,"l-ink",1.8)+path(`M16 46 Q24 40 32 46 T48 46`,"l-dim",1.2) },
    ],
  },
];

// tiny local ellipse helper (used a few places above)
function ellipse(cx, cy, rx, ry) {
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${""}" stroke="${""}" class="l-sage" style="fill:none;stroke-width:1.4"/>`;
}

// ---- assemble ---------------------------------------------------------------
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
const names = new Set(LOGOS.map((l) => l.name));
if (names.size !== 300) throw new Error(`Duplicate names: ${names.size}`);

const header = `// AUTO-GENERATED by generate-logos.mjs — do not edit by hand.
// 300 DISTINCT calm logo entries for the OmniAgent logo study.
// Fields: id, name, family, familyId, concept, spec, svg.
const LOGOS = ${JSON.stringify(LOGOS, null, 0)};
const FAMILIES = ${JSON.stringify(
  FAMILIES.map((f) => ({ id: f.id, name: f.name, count: f.variants.length })),
  null,
  0
)};
`;

const runtime = readFileSync(join(__dirname, "logos-runtime.js"), "utf8");
writeFileSync(
  join(__dirname, "logos.js"),
  header + "\n// ===== gallery runtime (appended) =====\n" + runtime,
  "utf8"
);
console.log(`Wrote logo data: ${LOGOS.length} entries across ${FAMILIES.length} families.`);
