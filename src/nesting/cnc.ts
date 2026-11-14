// What a CNC export must say before anything is cut: parts drawn at one thickness and nested
// on a sheet of another (every dado in the design is cut to the drawn thickness), parts closer
// together than a bit, no margin at the sheet edge, and cuts that were left out.
import type { Nesting, Placement, StockPiece } from "../kernel/types";
import type { BlankFeatures } from "./machine";
import { diffU, exactU, finePrecision, fineStep, fineSteps, fineU, kindWord, pieceNumber, sizeUnit, type Units } from "./format";
import type { MeasuredNest } from "./measure";
import { pocketOvercut, reachesEdge } from "./dxf";

/** 0.1 mm: a part drawn thinner or thicker than this from its sheet is named. */
export const THICKNESS_TOLERANCE = 1e-4;

export interface ThicknessMismatch {
  stock: string;
  sheet: number;
  drawn: number;
  parts: string[];
}

/** Parts drawn at a thickness their sheet is not, by sheet and drawn thickness. */
export function thicknessMismatches(n: Nesting): ThicknessMismatch[] {
  const out: ThicknessMismatch[] = [];
  for (const p of n.pieces) {
    for (const q of p.placements) {
      const drawn = q.size[0];
      if (Math.abs(drawn - p.thickness) <= THICKNESS_TOLERANCE) continue;
      let m = out.find((x) => x.stock === p.stock && Math.abs(x.drawn - drawn) <= 1e-9);
      if (!m) {
        m = { stock: p.stock, sheet: p.thickness, drawn, parts: [] };
        out.push(m);
      }
      if (!m.parts.includes(q.name)) m.parts.push(q.name);
    }
  }
  return out;
}

/** What a sheet of another thickness spoils, true of a part with dados and of one with only
 * holes: whatever was sized to the drawn thickness. */
const SIZED_TO_THE_DRAWING = "joints and depths sized to the drawing (a dado's width, a tongue's length, a hole's depth) will not fit this sheet";

/** Warnings for a CNC export, each a sentence, most serious first. */
export function cncNotes(n: Nesting, measured: MeasuredNest | null, units: Units): string[] {
  const notes: string[] = [];
  for (const m of thicknessMismatches(n)) {
    notes.push(`${m.parts.join(", ")} ${m.parts.length === 1 ? "is" : "are"} drawn ${exactU(m.drawn, units)} thick but nested on ${m.stock} (${exactU(m.sheet, units)}), a sheet ${diffU(m.drawn - m.sheet, units)} ${m.drawn > m.sheet ? "thinner" : "thicker"}: ${SIZED_TO_THE_DRAWING}. Set the design to the sheet's measured thickness, or the sheet's thickness to what you will cut.`);
  }
  if (!measured) notes.push("The cuts inside the parts could not be measured: only the outlines were written.");
  else {
    if (measured.skipped.length) notes.push(`Cuts were left out on ${measured.skipped.join(", ")}: they could not be placed on the part, so it is not cut as drawn. Check it against the model before cutting.`);
    if (measured.flipped.length) notes.push(`${measured.flipped.join(", ")} ${measured.flipped.length === 1 ? "has" : "have"} cuts in both faces: those on FLIP_ layers are cut after turning the part over.`);
  }
  const kerf = n.settings.kerf;
  notes.push(`Parts are ${fineU(kerf, units)} apart: use a smaller bit than that.`);
  const open = openPockets(n, measured?.features);
  if (open.drawn) notes.push(`Dados and grooves that run out of a part's edge are drawn ${fineU(open.past, units)} past it, into the gap between parts, so the bit cuts their ends square.`);
  if (open.left) notes.push(`${open.left} ${open.left === 1 ? "dado or groove runs" : "dados or grooves run"} out of a part's edge and could not be drawn past it (the parts touch, or Trim is 0): the bit leaves round corners at ${open.left === 1 ? "its end" : "their ends"}. Use CNC spacing, or square them with a chisel.`);
  if (!(n.settings.trim > 0)) notes.push("No margin at the sheet edges (Trim is 0).");
  const saw = n.pieces.filter((p) => p.saw).length;
  if (saw) notes.push(`${saw} ${saw === 1 ? "sheet is" : "sheets are"} for the track saw, not the router: ${saw === 1 ? "it is" : "they are"} not in these files (see its cut sequence in the Nesting section or the PDF).`);
  return notes;
}

/**
 * The router's pockets that reach their part's edge (a dado or groove that runs out of the
 * part): how many are drawn past it and how far (`pocketOvercut`), and how many could not be
 * because their sheet has no gap between parts or no margin.
 */
export function openPockets(n: Nesting, features: ReadonlyMap<string, BlankFeatures> | undefined): { drawn: number; past: number; left: number } {
  let drawn = 0;
  let left = 0;
  let past = 0;
  for (const p of n.pieces) {
    if (p.saw) continue;
    const e = pocketOvercut(p);
    for (const q of p.placements) {
      const f = features?.get(q.tag);
      if (!f) continue;
      const k = [...f.pockets, ...f.flip.pockets].filter((pocket) => reachesEdge(pocket.loop, q.dx, q.dy)).length;
      if (!k) continue;
      if (e > 0) {
        drawn += k;
        past = past ? Math.min(past, e) : e;
      } else left += k;
    }
  }
  return { drawn, past, left };
}

/** The CNC router's share of a nesting: every sheet and board but those the track saw cuts
 * (`StockPiece.saw`). The same nesting when nothing goes to the saw. */
export function routerShare(n: Nesting): Nesting {
  return n.pieces.some((p) => p.saw) ? { ...n, pieces: n.pieces.filter((p) => !p.saw) } : n;
}

/** The track saw's share: the sheets too large parts went to (none without an overflow). */
export function sawShare(n: Nesting): Nesting {
  return { ...n, pieces: n.pieces.filter((p) => p.saw) };
}

/** A part cut on the track saw that has cuts a router would have made: they are done by hand. */
export interface HandWork {
  tag: string;
  name: string;
  /** The sheet as the Nesting section titles it: "Sheet 1 of 2 · 4 x 8 sheet, 3/4 · Cabinet plywood". */
  sheet: string;
  pockets: number;
  holes: number;
  cutouts: number;
  /** Its outline is not a rectangle (a notch, a rabbet through the thickness). */
  shaped: boolean;
  /** Drawn turned in its sheet's diagram: its length runs down the sheet. The positions do not
   * depend on it (see `handWork`); it says where end A and edge B are in the diagram. */
  turned?: boolean;
  /** One line per cut (or per group of like holes), positions from the part's corner. */
  lines: string[];
}

type P2 = [number, number];
/** A rectangle in a blank's (u, v), or along and across a part (a, b). */
interface Box {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** 1 micron: two coordinates this close are one line, and an edge this far off an axis is
 * not along it. */
const GRID = 1e-6;
/** 0.2 mm, half the list's finest rounding (1/64 in): a strip narrower than this is drawing
 * noise (a joint clearance, a relief), not a cut to describe. */
const SLIVER = 2e-4;
/** The largest grid `cover` searches (16 by 16). A dado crossed by a groove is 3 by 3 cells; a
 * back groove crossed by seven rails about 15 by 3. */
const MAX_CELLS = 256;
/** The most rectangles one cut is listed as. */
const MAX_RECTANGLES = 12;
/** 0.01 mm: a cut this near the part's edge reaches it. */
const AT_EDGE = 1e-5;

/** Every edge runs along u or along v. */
function rectilinear(loop: readonly P2[]): boolean {
  return (
    loop.length >= 4 &&
    loop.every((p, i) => {
      const q = loop[(i + 1) % loop.length];
      return Math.abs(p[0] - q[0]) <= GRID || Math.abs(p[1] - q[1]) <= GRID;
    })
  );
}

function within(u: number, v: number, loop: readonly P2[]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ui, vi] = loop[i];
    const [uj, vj] = loop[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

/** Sorted, each once (within `GRID`). */
function gridLines(values: number[]): number[] {
  const out: number[] = [];
  for (const x of [...values].sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > GRID) out.push(x);
  return out;
}

/**
 * Rectangles that together are exactly a shape on a grid. `state(u, v)` says what the cell
 * around a point is: 2 is the shape (every such cell is in a rectangle), 1 may be in a
 * rectangle or not (it is cut anyway, or it is not wood), 0 is never in one. A cell narrower
 * than `SLIVER` may be in one or not, whatever it is. The widest rectangle first; each is then
 * drawn in to what it alone adds, so two never claim the same cut and none claims more
 * than it needs. Null when the grid is too fine to be a shape a person routs by hand.
 */
function cover(us: number[], vs: number[], state: (u: number, v: number) => 0 | 1 | 2): Box[] | null {
  const nu = us.length - 1;
  const nv = vs.length - 1;
  // The search below tries every rectangle of cells for every rectangle it places, so its
  // cost climbs steeply with the grid. It runs where the page draws, each time a nesting sends
  // parts to the saw: a grid past `MAX_CELLS` is listed by its corners instead.
  if (nu < 1 || nv < 1 || nu * nv > MAX_CELLS) return null;
  const cell: number[][] = [];
  // The shape's cells that must be in a rectangle, and all of them (the thin ones too: a
  // rectangle that reaches one takes it in, so a dado keeps its joint clearance).
  const need: boolean[][] = [];
  const shape: boolean[][] = [];
  let left = 0;
  for (let i = 0; i < nu; i++) {
    cell.push([]);
    need.push([]);
    shape.push([]);
    for (let j = 0; j < nv; j++) {
      const thin = us[i + 1] - us[i] < SLIVER || vs[j + 1] - vs[j] < SLIVER;
      const st = state((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2);
      cell[i].push(thin ? 1 : st);
      need[i].push(!thin && st === 2);
      shape[i].push(st === 2);
      if (need[i][j]) left += 1;
    }
  }
  const out: Box[] = [];
  while (left > 0) {
    let best: { i0: number; i1: number; j0: number; j1: number; gain: number; all: number; area: number } | null = null;
    for (let i0 = 0; i0 < nu; i0++) {
      for (let j0 = 0; j0 < nv; j0++) {
        // The furthest v this rectangle may reach narrows as it widens along u.
        let jMax = nv - 1;
        for (let i1 = i0; i1 < nu && jMax >= j0; i1++) {
          let j = j0;
          while (j <= jMax && cell[i1][j] !== 0) j++;
          jMax = j - 1;
          for (let j1 = j0; j1 <= jMax; j1++) {
            // What it adds of the shape that must be covered, then of the shape in all (its
            // thin strips too), then the least that is not the shape.
            let gain = 0;
            let all = 0;
            for (let i = i0; i <= i1; i++) {
              for (let k = j0; k <= j1; k++) {
                const a = (us[i + 1] - us[i]) * (vs[k + 1] - vs[k]);
                if (need[i][k]) gain += a;
                if (shape[i][k]) all += a;
              }
            }
            if (!(gain > 0)) continue;
            const area = (us[i1 + 1] - us[i0]) * (vs[j1 + 1] - vs[j0]);
            const more = (a: number, b: number) => a > b * (1 + 1e-9) + 1e-15;
            if (!best || more(gain, best.gain) || (!more(best.gain, gain) && (more(all, best.all) || (!more(best.all, all) && area < best.area)))) best = { i0, i1, j0, j1, gain, all, area };
          }
        }
      }
    }
    // More rectangles than a person reads as one cut: by its corners instead.
    if (!best || out.length >= MAX_RECTANGLES) return null;
    // Drawn in to what it adds.
    let [a0, a1, b0, b1] = [best.i1, best.i0, best.j1, best.j0];
    for (let i = best.i0; i <= best.i1; i++) {
      for (let j = best.j0; j <= best.j1; j++) {
        if (!shape[i][j]) continue;
        a0 = Math.min(a0, i);
        a1 = Math.max(a1, i);
        b0 = Math.min(b0, j);
        b1 = Math.max(b1, j);
      }
    }
    const before = left;
    for (let i = a0; i <= a1; i++) {
      for (let j = b0; j <= b1; j++) {
        if (need[i][j]) left -= 1;
        need[i][j] = false;
        shape[i][j] = false;
      }
    }
    // Every rectangle takes at least one cell that was needed, so this ends.
    if (left >= before) return null;
    out.push({ u0: us[a0], v0: vs[b0], u1: us[a1 + 1], v1: vs[b1 + 1] });
  }
  return out;
}

/**
 * A pocket's (or a cutout's) outline as the rectangles it is made of: one for a plain dado,
 * two for an L (a top's dado joined to a nailer's), never the box around something that is not
 * a rectangle. `others` are outlines whose inside may be covered all the same when it makes the
 * rectangles simpler: a deeper pocket that crosses this one, an opening through the part. So
 * may what lies outside `outline` (the part's own notched outline). Null when the outline has
 * an edge that runs along neither side (it is listed by its corners instead).
 */
export function loopRectangles(loop: readonly P2[], others: readonly (readonly P2[])[] = [], outline: readonly P2[] | null = null): Box[] | null {
  if (!rectilinear(loop)) return null;
  const marks = [...others, ...(outline ? [outline] : [])].filter(rectilinear);
  const lo = [Math.min(...loop.map((p) => p[0])), Math.min(...loop.map((p) => p[1]))];
  const hi = [Math.max(...loop.map((p) => p[0])), Math.max(...loop.map((p) => p[1]))];
  const lines = (k: 0 | 1) => gridLines([...loop.map((p) => p[k]), ...marks.flatMap((m) => m.map((p) => p[k])).filter((x) => x > lo[k] && x < hi[k])]);
  const cut = others.filter(rectilinear);
  const edge = outline && rectilinear(outline) ? outline : null;
  return cover(lines(0), lines(1), (u, v) => (within(u, v, loop) ? 2 : cut.some((o) => within(u, v, o)) || (edge && !within(u, v, edge)) ? 1 : 0));
}

/** What a notched outline takes out of its `dx` by `dy` blank, as rectangles (a toe-kick notch
 * is one). Null when the outline is not made of edges along the sides. */
export function notchRectangles(profile: readonly P2[], dx: number, dy: number): Box[] | null {
  if (!rectilinear(profile)) return null;
  const lines = (k: 0 | 1, full: number) => gridLines([0, full, ...profile.map((p) => p[k]).filter((x) => x > 0 && x < full)]);
  return cover(lines(0, dx), lines(1, dy), (u, v) => (within(u, v, profile) ? 0 : 2));
}

/**
 * Where hand work is measured from, in one line: the Nesting section's list and the file's
 * header say the same. One rule for every part, however it lies in its sheet's diagram.
 */
export function handWorkLegend(units: Units): string {
  return `Positions are (A, B): lay the part with the face to cut up and its length left to right; A is along the length from its left end, B across the width from its far edge (the one away from you). To the nearest ${finePrecision(units)}.`;
}

/**
 * The hand work on the track saw's parts: each pocket, hole, cutout and notch the router would
 * have cut, measured from the part.
 *
 * A position is (A, B): with the cut face up and the part's length left to right, A is along
 * the length from the left end (end A) and B across the width from the far edge (edge B). The
 * rule is the same for every part, so the list for a part does not change with how the nester
 * laid it: in its sheet's diagram end A is the part's left end and edge B its top edge, and
 * for a part drawn turned (its length down the sheet) end A is its top end and edge B its
 * right edge. Seen from above the two are the same lay, a quarter turn apart, so a mirrored
 * pair stays mirrored and no part comes out as its mirror image. A plain rectangle has no end
 * A until the first cut is made: any lay with the length left to right gives the same part.
 * Which edge is a cabinet part's front or bottom is not known here (a nesting holds blanks,
 * not cabinets); the notch in a side's outline is listed with the rest, and places it.
 */
export function handWork(n: Nesting, features: ReadonlyMap<string, BlankFeatures> | undefined, units: Units): HandWork[] {
  const out: HandWork[] = [];
  const step = fineStep(units);
  const steps = (m: number) => Math.round(m / step);
  // Bare numbers: the unit is said once, at the top of the list (holes stay in mm, as Blum's).
  const u = (m: number) => fineSteps(steps(m), units);
  // A drill as Blum and the DXF layers write it, millimetres to 0.1; one that is not a round
  // metric size (a 3/16 in pull hole is 4.76 mm) to 0.01, and the document's way beside it.
  const hole = (m: number) => {
    const mm = m * 1000;
    const round = Math.round(mm * 10) / 10;
    if (Math.abs(mm - round) < 0.005) return `${round} mm`;
    const exact = `${Number(mm.toFixed(2))} mm`;
    return sizeUnit(units) === "in" ? `${exact} (${fineU(m, units)})` : exact;
  };
  for (const piece of n.pieces) {
    if (!piece.saw) continue;
    for (const q of piece.placements) {
      const f = features?.get(q.tag);
      if (!f) continue;
      // The blank's u runs along the sheet and its v down it, from the part's top-left corner
      // as drawn. Not turned, that is along the part's length and from its far edge. Turned,
      // the length runs down the sheet: a quarter turn puts its top end at the left, and the
      // far edge is then the part's right edge as drawn.
      const along = q.turned ? q.dy : q.dx;
      const across = q.turned ? q.dx : q.dy;
      const part = ([x, y]: P2): P2 => (q.turned ? [y, q.dx - x] : [x, y]);
      const box = (r: Box): Box => {
        const [a, b] = [part([r.u0, r.v0]), part([r.u1, r.v1])];
        return { u0: Math.min(a[0], b[0]), v0: Math.min(a[1], b[1]), u1: Math.max(a[0], b[0]), v1: Math.max(a[1], b[1]) };
      };
      const bounds = (loop: readonly P2[]): Box => {
        const us = loop.map((p) => p[0]);
        const vs = loop.map((p) => p[1]);
        return box({ u0: Math.min(...us), v0: Math.min(...vs), u1: Math.max(...us), v1: Math.max(...vs) });
      };
      // A width and the two edges it lies between, rounded so they agree: the width first (it
      // is what must fit), then the edges from it; from the part's own edge when the cut
      // reaches it, so an edge is never a 64th past the part.
      const ends = (lo: number, hi: number, full: number): [number, number, number] => {
        const size = steps(hi - lo);
        if (Math.abs(hi - full) <= AT_EDGE) return [steps(full) - size, steps(full), size];
        const from = lo <= AT_EDGE ? 0 : steps(lo);
        return [from, from + size, size];
      };
      const w = (k: number) => fineSteps(k, units);
      const span = (r: Box) => {
        const a = ends(r.u0, r.u1, along);
        const b = ends(r.v0, r.v1, across);
        return { size: `${w(a[2])} × ${w(b[2])}`, where: `${w(a[0])} to ${w(a[1])} from end A, ${w(b[0])} to ${w(b[1])} from edge B` };
      };
      const corners = (loop: readonly P2[]) => loop.map((p) => part([p[0], p[1]])).map(([a, b]) => `(${u(a)}, ${u(b)})`).join(", ");
      // A shape that is not made of rectangles: its corners when they are few, otherwise the
      // box it lies inside, said to be that and no more.
      const odd = (loop: readonly P2[]) => (loop.length <= 12 ? `not a rectangle, its corners at ${corners(loop)}` : `not a rectangle (${loop.length} corners) inside ${span(bounds(loop)).where}: cut it to the drawing`);
      const joined = (rs: Box[]) => `in ${rs.length} rectangles that join: ${rs.map((r) => span(box(r))).map((s) => `${s.size} at ${s.where}`).join("; ")}`;
      const lines: string[] = [];
      const outline = f.profile && f.profile.length >= 3 ? f.profile : null;
      const face = (ff: { pockets: BlankFeatures["pockets"]; drills: BlankFeatures["drills"] }, other: boolean) => {
        const side = other ? " (other face)" : "";
        for (const k of ff.pockets) {
          const deep = `${u(k.depth)} deep`;
          // A deeper pocket that crosses this one (the back's groove through a dado), and an
          // opening through the part, are cut whatever this line says: it may run over them.
          const others = [...ff.pockets.filter((o) => o !== k && o.depth >= k.depth - GRID).map((o) => o.loop), ...f.cutouts];
          const rs = loopRectangles(k.loop, others, outline);
          if (!rs || !rs.length) lines.push(`Pocket${side}, ${deep}, ${odd(k.loop)}`);
          else if (rs.length === 1) {
            const s = span(box(rs[0]));
            lines.push(`Pocket${side} ${s.size}, ${deep}: ${s.where}`);
          } else lines.push(`Pocket${side}, ${deep}, ${joined(rs)}`);
        }
        // Like holes together: one line each size and depth, every centre listed.
        const groups = new Map<string, P2[]>();
        for (const h of ff.drills) {
          const key = `${hole(h.diameter)} ${h.through ? "through" : `× ${hole(h.depth)} deep`}`;
          const list = groups.get(key) ?? [];
          list.push(part(h.center));
          groups.set(key, list);
        }
        for (const [key, cs] of groups) {
          cs.sort((p, r) => p[0] - r[0] || p[1] - r[1]);
          lines.push(`${cs.length} ${cs.length === 1 ? "hole" : "holes"}${side} ${key} at ${cs.map(([a, b]) => `(${u(a)}, ${u(b)})`).join(", ")}`);
        }
      };
      face(f, false);
      face(f.flip, true);
      for (const c of f.cutouts) {
        const rs = loopRectangles(c);
        if (!rs || !rs.length) lines.push(`Cutout through, ${odd(c)}`);
        else if (rs.length === 1) lines.push(`Cutout through: ${span(box(rs[0])).where}`);
        else lines.push(`Cutout through, ${joined(rs)}`);
      }
      if (f.profile) {
        const rs = outline ? notchRectangles(outline, q.dx, q.dy) : null;
        if (rs && rs.length) {
          for (const r of rs) {
            const s = span(box(r));
            lines.push(`Notch through, ${s.size}, cut out of the outline: ${s.where}`);
          }
        } else if (outline && outline.length <= 12) lines.push(`Outline: not a rectangle, its corners at ${corners(outline)}`);
        else lines.push("Outline: not a rectangle (a notch): cut it to the drawing after the saw");
      }
      if (!lines.length) continue;
      out.push({
        tag: q.tag,
        name: q.name,
        sheet: `${pieceNumber(piece)} · ${piece.stock}${piece.material ? ` · ${piece.material}` : ""}`,
        pockets: f.pockets.length + f.flip.pockets.length,
        holes: f.drills.length + f.flip.drills.length,
        cutouts: f.cutouts.length,
        shaped: !!f.profile,
        turned: q.turned,
        lines,
      });
    }
  }
  return out;
}

/** The hand work list's file: plain text. */
export const HAND_WORK_TYPE = { description: "Hand work list (text)", mime: "text/plain", extensions: [".txt"] };

/** The hand work as a text file a shop can print. */
export function handWorkText(title: string, work: HandWork[], units: Units): string {
  const head = [
    `${title}: hand work on the track saw's parts`,
    "",
    "These parts are too large for the CNC router's sheet and are cut on the track saw. Their",
    "dados, grooves, holes and notches are done by hand (a router with a guide or jig, a drill",
    "press).",
    "",
    "How to read a position",
    "  Lay the part with the face you will cut up and its length running left to right.",
    "  End A is its left end. Edge B is its far edge, the one away from you.",
    "  A position is (A, B): along the length from end A, then across the width from edge B.",
    "  A plain rectangle has no end A yet: any way round with its length left to right gives",
    "  the same part. After the first cut, keep that end and that edge for the rest.",
    "  In the sheet's diagram end A is the part's left end and edge B its top edge. For a part",
    "  drawn turned (its length down the sheet), end A is its top end and edge B its right edge.",
    "  A cut marked (other face) is in the face underneath, at the position given as seen",
    "  through the part: roll the part over toward you (end A stays at your left) and measure",
    "  B from the edge now nearest you.",
    "",
    `Lengths in ${sizeUnit(units) === "in" ? "inches" : "millimetres"}, to the nearest ${finePrecision(units)}; hole sizes in millimetres.`,
    "",
  ];
  const body = work.flatMap((w) => [`${w.tag} ${w.name} (${w.sheet})${w.turned ? " (drawn turned)" : ""}`, ...w.lines.map((l) => `  - ${l}`), ""]);
  return [...head, ...body].join("\n");
}

/** What a sheet's file asks of the router: the outlines, and pockets, holes and so on when
 * any part on it has them. */
export function sheetOps(piece: StockPiece, features?: ReadonlyMap<string, BlankFeatures>): string[] {
  const fs = piece.placements.map((q) => features?.get(q.tag)).filter((f): f is BlankFeatures => !!f);
  const ops = ["profile"];
  if (fs.some((f) => f.pockets.length)) ops.push("pockets");
  if (fs.some((f) => f.drills.length)) ops.push("drills");
  if (fs.some((f) => f.cutouts.length)) ops.push("cutouts");
  if (fs.some((f) => f.flip.pockets.length || f.flip.drills.length)) ops.push("flip");
  return ops;
}

const utf8 = new TextEncoder();
const bytes = (s: string) => utf8.encode(s).length;

/** `s` cut to at most `max` bytes of UTF-8, never through a character, with "..." when it was
 * cut. File systems count a name in bytes (255 on most): a name in Greek or Japanese is two
 * or three bytes a character. */
function clip(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let out = "";
  let used = 3;
  for (const ch of s) {
    const k = bytes(ch);
    if (used + k > max) break;
    out += ch;
    used += k;
  }
  return `${out.replace(/[ .,;-]+$/, "")}...`;
}

/** A file name a shop can read, and that every file system takes: no slashes, quotes or other
 * characters one refuses ("3/4" 4x4" is "3-4in 4x4"), no control characters, no dot at the
 * start (a hidden file) or the end (Windows drops it), not one of Windows' device names, at
 * most `max` bytes, and never empty. `max` leaves room for an extension and a few words after
 * it under the 255 bytes a name may be. */
export function safeName(s: string, max = 200): string {
  const plain = [...s]
    .map((ch) => {
      const k = ch.codePointAt(0) ?? 0;
      return k < 32 || (k >= 127 && k <= 159) ? " " : ch;
    })
    .join("");
  let out = plain
    .replace(/"/g, "in")
    .replace(/[\\/]/g, "-")
    .replace(/[:*?<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "");
  out = clip(out, max).replace(/^[. ]+/, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `${out}_`;
  return out || "untitled";
}

/**
 * The file for one sheet of a CNC export: its number, the cabinets and parts on it, its stock
 * and what the router does to it, e.g. "Kitchen 08 sheet 1 of 2 - Sink base Left door, Right
 * door - 4 x 4 sheet, 3-4 (Door plywood) - profile, drills CNC.dxf". `ownerOf` names the
 * cabinet a part belongs to (null for a part on its own).
 *
 * The number is the sheet's own, the same wherever it is named: "08" is its place in the whole
 * nesting (the label inside the file, the PDF's page and the SVG's name say 8 too), and "sheet
 * 1 of 2" its place among the sheets of its stock, as the Nesting section titles it. A board
 * is a board. The track saw's sheets keep their numbers, so the router's files may skip one.
 * The whole name stays under 255 bytes whatever the title and the parts are called.
 */
export function cncFileName(title: string, n: Nesting, index: number, features: ReadonlyMap<string, BlankFeatures> | undefined, ownerOf: (q: Placement) => string | null): string {
  const piece = n.pieces[index];
  const width = Math.max(2, String(Math.max(...n.pieces.map((p) => p.index))).length);
  const num = `${String(piece.index).padStart(width, "0")} ${kindWord(piece).toLowerCase()} ${piece.seq} of ${piece.count}`;
  const groups = new Map<string, string[]>();
  for (const q of piece.placements) {
    const owner = ownerOf(q) ?? "";
    const names = groups.get(owner) ?? [];
    if (!names.includes(q.name)) names.push(q.name);
    groups.set(owner, names);
  }
  const MAX = 90;
  const parts: string[] = [];
  let shown = 0;
  let total = 0;
  for (const [owner, names] of groups) {
    total += names.length;
    const kept: string[] = [];
    for (const name of names) {
      const next = [...parts, `${owner ? `${owner} ` : ""}${[...kept, name].join(", ")}`].join("; ");
      if (next.length > MAX && (kept.length || parts.length)) break;
      kept.push(name);
    }
    if (kept.length) {
      parts.push(`${owner ? `${owner} ` : ""}${kept.join(", ")}`);
      shown += kept.length;
    }
  }
  const more = total > shown ? ` +${total - shown} more` : "";
  const stock = safeName(piece.material && !piece.stock.includes(piece.material) ? `${piece.stock} (${piece.material})` : piece.stock, 60);
  const head = safeName(title, 60);
  const tail = `${more} - ${stock} - ${sheetOps(piece, features).join(", ")} CNC`;
  // 240 bytes and ".dxf": what the title, the number, the stock and the cuts leave is the parts'.
  const room = Math.max(24, 240 - bytes(head) - bytes(num) - bytes(tail) - 4);
  return `${head} ${num} - ${safeName(parts.join("; "), room)}${tail}.dxf`;
}

export interface NestProblem {
  kind: "unplaced" | "glued" | "material" | "spacing" | "thickness" | "cuts" | "footprint";
  tag: string;
  name: string;
  text: string;
}

/**
 * What went wrong in a nesting, part by part, before anything is cut:
 * - a part on no stock (too large for the sheet, no sheet of its thickness, ...);
 * - a part glued up from strips (its cuts are not measured onto the strips);
 * - a part whose material names a sheet it is not on, because that sheet is another
 *   thickness: the nester quietly took the first sheet that fits instead.
 */
export function nestProblems(n: Nesting, units: Units, reason: (u: Nesting["unplaced"][number]) => string): NestProblem[] {
  const out: NestProblem[] = n.unplaced.map((u) => ({ kind: "unplaced" as const, tag: u.tag, name: u.name, text: reason(u) }));
  for (const g of n.glue_ups ?? []) out.push({ kind: "glued", tag: g.tag, name: g.name, text: `glued up from ${g.widths.length} strips of ${g.stock}: its cuts are not on the strips` });
  const defaults = n.library.defaults ?? {};
  for (const p of n.pieces) {
    const want = p.material ? defaults[p.material] : undefined;
    if (!want || want === p.stock) continue;
    const s = n.library.stocks.find((x) => x.name === want);
    for (const q of p.placements) {
      if (q.strip) continue;
      const why = s ? `${want} is ${exactU(s.thickness, units)}, the part ${exactU(q.size[0], units)}` : `${want} is not in the library`;
      out.push({ kind: "material", tag: q.tag, name: q.name, text: `${p.material} is set to ${want}, but it went on ${p.stock}: ${why}` });
    }
  }
  return out;
}

/** Whether anything measured is more than a plain rectangle: a pocket, a hole, an opening or
 * a notched outline, in either face of any part. */
function hasCuts(measured: MeasuredNest): boolean {
  for (const f of measured.features.values()) {
    if (f.pockets.length || f.drills.length || f.cutouts.length || f.profile || f.flip.pockets.length || f.flip.drills.length) return true;
  }
  return false;
}

/**
 * What a file with measured cuts would get wrong, asked about before it is saved (a status
 * line after the files are written is too late for a sheet of plywood):
 * - parts drawn at a thickness their sheet is not, when the file holds machined cuts (or the
 *   cuts could not be measured, so it may): joints and depths were sized to the drawing, so on
 *   that sheet they are loose or will not go together. Every such part is named, with or
 *   without cuts of its own: the part that slides into a dado matters as much as the dado.
 *   Plain rectangles (a bookshelf drawn at 3/4 in and nested on 23/32 plywood) have nothing
 *   sized to their thickness, and are not asked about;
 * - parts whose cuts could not be placed on them, written as their outline only;
 * - the cuts could not be measured at all (`measured` null): every part is its outline only.
 * `n` is what the file holds (the router's share for the CNC files).
 */
export function cutProblems(n: Nesting, measured: MeasuredNest | null, units: Units): NestProblem[] {
  const out: NestProblem[] = [];
  if (!measured || hasCuts(measured)) {
    for (const m of thicknessMismatches(n)) {
      out.push({
        kind: "thickness",
        tag: "",
        name: m.parts.join(", "),
        text: `drawn ${exactU(m.drawn, units)} thick but nested on ${m.stock} (${exactU(m.sheet, units)}), a sheet ${diffU(m.drawn - m.sheet, units)} ${m.drawn > m.sheet ? "thinner" : "thicker"}: ${SIZED_TO_THE_DRAWING}. Set the design to the sheet's measured thickness, or the sheet's thickness to what you will cut`,
      });
    }
  }
  if (!measured) {
    out.push({ kind: "cuts", tag: "", name: "Every part", text: "the cuts inside the parts (dados, grooves, holes, notches) could not be measured: only the outlines would be written" });
    return out;
  }
  const byName = new Map<string, string[]>();
  for (const p of n.pieces) for (const q of p.placements) if (measured.skipped.includes(q.name)) byName.set(q.name, [...(byName.get(q.name) ?? []), q.tag]);
  for (const [name, tags] of byName) out.push({ kind: "cuts", tag: tags.join(", "), name, text: "some of its cuts (dados, grooves, holes or notches) could not be placed on the part and would be left out of the file" });
  return out;
}

/**
 * Sheets among the router's that are not the router's sheet: with a sheet size set
 * (`settings.sheetSize`), a sheet of another footprint that the track saw does not cut. The
 * nester puts a part there only because it was told to (the material's stock is set to that
 * sheet, or the part names it), so "nest on 4 x 4" does not move it, and it would be written
 * as one of the CNC files for a bed it may not fit. One problem per stock and material.
 */
export function routerSheetProblems(n: Nesting, units: Units): NestProblem[] {
  const fp = n.settings.sheetSize;
  if (!fp) return [];
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  const fits = (p: StockPiece) => (same(p.width, fp.width) && same(p.length, fp.length)) || (same(p.width, fp.length) && same(p.length, fp.width));
  const size = (a: number, b: number) => `${fineU(Math.min(a, b), units).replace(/ (in|mm)$/, "")} x ${fineU(Math.max(a, b), units)}`;
  const defaults = n.library.defaults ?? {};
  const groups = new Map<string, { piece: StockPiece; sheets: number; tags: string[] }>();
  for (const p of n.pieces) {
    if (p.saw || p.kind !== "sheet" || fits(p)) continue;
    const key = `${p.stock}\u0000${p.material ?? ""}`;
    const g = groups.get(key) ?? { piece: p, sheets: 0, tags: [] };
    g.sheets += 1;
    for (const q of p.placements) if (!g.tags.includes(q.tag)) g.tags.push(q.tag);
    groups.set(key, g);
  }
  const out: NestProblem[] = [];
  for (const { piece: p, sheets, tags } of groups.values()) {
    const why =
      p.material && defaults[p.material] === p.stock
        ? `${p.material}'s stock is set to it`
        : p.material && n.library.stocks.some((s) => s.name === p.material)
          ? "its parts name it as their stock"
          : "its parts were put on it by name or by their material's stock";
    out.push({
      kind: "footprint",
      tag: tags.join(", "),
      name: p.stock,
      text: `${sheets === 1 ? "a sheet" : `${sheets} sheets`} ${size(p.width, p.length)}, not the ${size(fp.width, fp.length)} the router is set to: ${why}, so ${sheets === 1 ? "it stays" : "they stay"} on this sheet and would be written as ${sheets === 1 ? "one" : "some"} of the CNC files. Set ${p.material && defaults[p.material] === p.stock ? `${p.material}'s stock` : "the parts' stock"} to a sheet the router takes (Stock...), or cut ${sheets === 1 ? "this sheet" : "these sheets"} another way`,
    });
  }
  return out;
}

/** The bit a CNC export assumes when it checks the spacing: 1/4 in, the usual for sheet goods. */
export const CNC_BIT = 0.25 * 0.0254;

/**
 * Parts too close together for a router bit. An outside profile runs half the bit outside each
 * part, so two parts closer than the bit (plus 1/16 in of wood between the two cuts) have cuts
 * that meet, and CAM programs (Carbide Create, VCarve) merge outside cuts that meet: they cut
 * around the group and skip the edges between its parts.
 */
export function spacingProblem(n: Nesting, units: Units, bit = CNC_BIT): NestProblem | null {
  const gap = n.settings.kerf;
  if (gap >= bit + 0.0625 * 0.0254 - 1e-9) return null;
  // The track saw's sheets are laid out with the saw's kerf: only the router's sheets count.
  if (!n.pieces.some((p) => !p.saw && p.placements.length > 1)) return null;
  return {
    kind: "spacing",
    tag: "",
    name: "Every sheet",
    text: `parts are ${fineU(gap, units)} apart (Kerf), too close for a ${fineU(bit, units)} bit: the outside cuts of neighbouring parts meet, and the CAM program cuts around the group, not between its parts. Use CNC spacing (${sizeUnit(units) === "mm" ? "10 mm" : "3/8 in"} apart), or set Kerf larger than your bit.`,
  };
}
