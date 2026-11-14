// The nesting as a DXF for CNC routers and lasers (lane 9), ASCII, millimetres: one closed
// polyline per part on a layer per stock piece (SHEET-01, BOARD-02, ...), each stock's
// outline (and its trim line) on layer STOCK, and each part's tag as TEXT on layer LABELS,
// so a CAM program can cut one layer, or turn the outlines and labels off. Pieces are laid
// out one above the other, 100 mm apart, in the order of the booklet; y runs up, so each
// piece reads as in the diagrams (length left to right, the stock's first edge on top).
//
// Measured cuts (machine.ts) go on a layer per operation: POCKET_6.35MM, DRILL_D35MM_13MM,
// DRILL_D5MM_THRU, CUTOUT_THRU, so a CAM program (VCarve, Carbide Create, Fusion) gives one
// toolpath to each layer; holes are CIRCLEs at their true diameter. With `piece`, the file is
// one sheet with its lower-left corner at the origin and part outlines on PROFILE_THRU.
//
// A pocket toolpath keeps the bit inside its outline, so a dado that ends on its part's edge
// would be left with round corners there, and the part that slides into it would not seat.
// With `overcut`, a pocket that reaches the edge of its blank is drawn past it into the gap
// between parts (`pocketOvercut`), where the profile cut passes anyway.
//
// Two flavours, like the face outline export (crates/export dxf.rs): LWPOLYLINE, which
// every laser and CAM program reads; or R12 (`$ACADVER` AC1009, POLYLINE / VERTEX / SEQEND)
// for strict R12-only readers.
import type { Nesting, StockPiece } from "../kernel/types";
import { pieceNumber } from "./format";
import type { BlankFeatures } from "./machine";

export const DXF_TYPE = { description: "DXF", mime: "image/vnd.dxf", extensions: [".dxf"] };

export type DxfFlavour = "lwpolyline" | "r12";

const MM = 1000;
/** Space between pieces, mm. */
export const PIECE_GAP = 100;

/** A number as DXF wants it: plain decimal, at most six places, no "-0". */
export function dxfNum(x: number): string {
  const s = (Math.round(x * 1e6) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

/** The layer of a stock piece: "SHEET-01", "BOARD-12". */
export function pieceLayer(p: StockPiece): string {
  return `${p.kind.toUpperCase()}-${String(p.index).padStart(2, "0")}`;
}

/** A piece's label in the file: its number in the nesting and its title as the Nesting
 * section, the PDF and the CNC file names write it, in plain ASCII: "8. Sheet 1 of 2 - 4 x 4
 * sheet, 3/4 - Door plywood". One sheet has one number wherever it is named. */
export function pieceLabel(p: StockPiece): string {
  return `${p.index}. ${pieceNumber(p)} - ${p.stock}${p.material ? ` - ${p.material}` : ""}${p.saw ? " - track saw" : ""}`;
}

/** Each piece's lower-left corner in the file (mm): stacked upward, the first on top. */
export function pieceOrigins(n: Nesting): [number, number][] {
  const out: [number, number][] = [];
  let y = 0;
  for (let i = n.pieces.length - 1; i >= 0; i--) {
    out[i] = [0, y];
    y += n.pieces[i].width * MM + PIECE_GAP;
  }
  return out;
}

class Dxf {
  readonly lines: string[] = [];
  pair(code: number, value: string | number) {
    this.lines.push(String(code).padStart(3, " "), String(value));
  }
}

/** A length in mm for a layer name: at most two decimals, "6.35". R12 names allow only
 * letters, digits, "_", "-" and "$", so there the point is a "P" ("6P35"). */
function layerMm(m: number, r12: boolean): string {
  const s = String(Math.round(m * MM * 100) / 100);
  return r12 ? s.replace(".", "P") : s;
}

/** CNC layers, one per operation so a CAM program assigns one toolpath to each:
 * POCKET_<depth>MM, DRILL_D<dia>MM_<depth>MM or DRILL_D<dia>MM_THRU, CUTOUT_THRU, and
 * PROFILE_THRU for part outlines in a per-sheet file. Cuts from the other face are FLIP_... */
export function featureLayers(f: BlankFeatures, r12 = false): { pockets: string[]; drills: string[]; flipPockets: string[]; flipDrills: string[] } {
  const pocket = (d: number) => `POCKET_${layerMm(d, r12)}MM`;
  const drill = (h: { diameter: number; depth: number; through: boolean }) => `DRILL_D${layerMm(h.diameter, r12)}MM_${h.through ? "THRU" : `${layerMm(h.depth, r12)}MM`}`;
  return {
    pockets: f.pockets.map((p) => pocket(p.depth)),
    drills: f.drills.map(drill),
    flipPockets: f.flip.pockets.map((p) => `FLIP_${pocket(p.depth)}`),
    flipDrills: f.flip.drills.map((h) => `FLIP_${drill(h)}`),
  };
}

export interface DxfOptions {
  /** Only this piece (its index in `n.pieces`), with the sheet's lower-left corner at the
   * origin and part outlines on PROFILE_THRU: one file per sheet, ready for a CAM job. */
  piece?: number;
  /** Draw each pocket that reaches its part's edge past that edge (see `pocketOvercut`), so a
   * router bit clears the end of a dado or groove that runs out of the part. */
  overcut?: boolean;
}

/** 0.25 mm: what an overcut stops short of the middle of the gap between two parts, so the
 * overcuts of two neighbours never touch. */
const OVERCUT_CLEAR = 0.00025;
/** 0.01 mm: a pocket's corner this near its blank's edge is on it. */
const ON_EDGE = 1e-5;

/**
 * How far past a part's edge a pocket that reaches it is drawn, on this piece: just under half
 * the gap between parts, and never more than the margin at the sheet's edge. Any bit that fits
 * between the parts (the CNC export checks that) has a radius smaller than this, so its centre
 * passes the edge and the pocket's end is cut square; and the cut stays in the waste, short of
 * the next part's own overcut. 0 when the parts touch or the sheet has no margin.
 */
export function pocketOvercut(p: Pick<StockPiece, "kerf" | "trim">): number {
  const e = Math.min(p.kerf / 2 - OVERCUT_CLEAR, p.trim);
  return e > 0 ? e : 0;
}

/** Whether a pocket reaches the edge of its `dx` by `dy` blank (a dado or groove that runs
 * out of the part, a rabbet along its edge). */
export function reachesEdge(loop: readonly (readonly [number, number])[], dx: number, dy: number): boolean {
  return loop.some(([u, v]) => u <= ON_EDGE || u >= dx - ON_EDGE || v <= ON_EDGE || v >= dy - ON_EDGE);
}

/** A pocket's outline with each corner that is on the blank's edge moved `e` straight out
 * past it. Corners inside the blank stay where they are, so the pocket's width and its
 * blind end are as measured. */
export function overcutLoop(loop: [number, number][], dx: number, dy: number, e: number): [number, number][] {
  if (!(e > 0)) return loop;
  return loop.map(([u, v]) => [u <= ON_EDGE ? -e : u >= dx - ON_EDGE ? dx + e : u, v <= ON_EDGE ? -e : v >= dy - ON_EDGE ? dy + e : v]);
}

/** The whole nesting as one DXF. Without `features` the file is the rectangles only.
 * A measured profile replaces that part's rectangle. Pockets, drills and cutouts go on a
 * layer per operation (see `featureLayers`), and holes are circles. */
export function nestingDxf(n: Nesting, flavour: DxfFlavour = "lwpolyline", features?: ReadonlyMap<string, BlankFeatures>, options: DxfOptions = {}): string {
  const r12 = flavour === "r12";
  const d = new Dxf();
  const feat = (tag: string) => features?.get(tag);
  const sheet = options.piece;
  const pieces = sheet === undefined ? n.pieces.map((p, i) => ({ p, i })) : [{ p: n.pieces[sheet], i: sheet }];
  if (sheet !== undefined && !n.pieces[sheet]) throw new Error(`no piece ${sheet}`);
  const profileLayer = (p: StockPiece) => (sheet === undefined ? pieceLayer(p) : "PROFILE_THRU");
  // Every layer the file uses, in a steady order.
  const featureNames = new Set<string>();
  let cutouts = false;
  for (const { p } of pieces) {
    for (const q of p.placements) {
      const f = feat(q.tag);
      if (!f) continue;
      const l = featureLayers(f, r12);
      for (const name of [...l.pockets, ...l.drills, ...l.flipPockets, ...l.flipDrills]) featureNames.add(name);
      if (f.cutouts.length) cutouts = true;
    }
  }
  const profiles = sheet === undefined ? n.pieces.map(pieceLayer) : ["PROFILE_THRU"];
  const layers = ["STOCK", "LABELS", ...profiles, ...(cutouts ? ["CUTOUT_THRU"] : []), ...[...featureNames].sort()];
  // Colours: stock grey (8), labels yellow (2), profiles through the ACI wheel, cutouts red,
  // pockets cyan, drills blue, the other face magenta.
  const colour = (name: string, i: number) => {
    if (name === "0") return 7;
    if (name === "STOCK") return 8;
    if (name === "LABELS") return 2;
    if (name.startsWith("FLIP_")) return 6;
    if (name === "CUTOUT_THRU") return 1;
    if (name.startsWith("POCKET_")) return 4;
    if (name.startsWith("DRILL_")) return 5;
    if (name === "PROFILE_THRU") return 3;
    return 1 + ((i - 3) % 6);
  };
  d.pair(0, "SECTION");
  d.pair(2, "HEADER");
  if (r12) {
    d.pair(9, "$ACADVER");
    d.pair(1, "AC1009");
  }
  d.pair(9, "$INSUNITS");
  d.pair(70, 4);
  d.pair(0, "ENDSEC");
  d.pair(0, "SECTION");
  d.pair(2, "TABLES");
  d.pair(0, "TABLE");
  d.pair(2, "LTYPE");
  d.pair(70, 1);
  d.pair(0, "LTYPE");
  d.pair(2, "CONTINUOUS");
  d.pair(70, 0);
  d.pair(3, "Solid line");
  d.pair(72, 65);
  d.pair(73, 0);
  d.pair(40, "0.0");
  d.pair(0, "ENDTAB");
  d.pair(0, "TABLE");
  d.pair(2, "LAYER");
  d.pair(70, layers.length + 1);
  ["0", ...layers].forEach((name, i) => {
    d.pair(0, "LAYER");
    d.pair(2, name);
    d.pair(70, 0);
    d.pair(62, colour(name, i));
    d.pair(6, "CONTINUOUS");
  });
  d.pair(0, "ENDTAB");
  d.pair(0, "ENDSEC");
  d.pair(0, "SECTION");
  d.pair(2, "ENTITIES");
  const poly = (layer: string, pts: [number, number][]) => {
    if (r12) {
      d.pair(0, "POLYLINE");
      d.pair(8, layer);
      d.pair(66, 1);
      d.pair(10, "0");
      d.pair(20, "0");
      d.pair(30, "0");
      d.pair(70, 1);
      for (const [x, y] of pts) {
        d.pair(0, "VERTEX");
        d.pair(8, layer);
        d.pair(10, dxfNum(x));
        d.pair(20, dxfNum(y));
        d.pair(30, "0");
      }
      d.pair(0, "SEQEND");
      d.pair(8, layer);
    } else {
      d.pair(0, "LWPOLYLINE");
      d.pair(100, "AcDbEntity");
      d.pair(8, layer);
      d.pair(100, "AcDbPolyline");
      d.pair(90, pts.length);
      d.pair(70, 1);
      for (const [x, y] of pts) {
        d.pair(10, dxfNum(x));
        d.pair(20, dxfNum(y));
      }
    }
  };
  const text = (layer: string, x: number, y: number, h: number, s: string) => {
    d.pair(0, "TEXT");
    d.pair(8, layer);
    d.pair(10, dxfNum(x));
    d.pair(20, dxfNum(y));
    d.pair(30, "0");
    d.pair(40, dxfNum(h));
    // Plain ASCII: R12 readers vary in what else they take.
    d.pair(1, s.replace(/[^\x20-\x7e]/g, "?"));
    d.pair(72, 1);
    d.pair(11, dxfNum(x));
    d.pair(21, dxfNum(y));
    d.pair(31, "0");
  };
  const circle = (layer: string, x: number, y: number, r: number) => {
    d.pair(0, "CIRCLE");
    if (!r12) d.pair(100, "AcDbEntity");
    d.pair(8, layer);
    if (!r12) d.pair(100, "AcDbCircle");
    d.pair(10, dxfNum(x));
    d.pair(20, dxfNum(y));
    d.pair(30, "0");
    d.pair(40, dxfNum(r));
  };
  const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const origins = sheet === undefined ? pieceOrigins(n) : [];
  if (sheet !== undefined) origins[sheet] = [0, 0];
  for (const { p, i } of pieces) {
    const [ox, oy] = origins[i];
    const W = p.width * MM;
    // Stock y (from the top edge) to file y (up): y' = oy + W - y.
    const fy = (y: number) => oy + W - y * MM;
    poly("STOCK", rect(ox, oy, p.length * MM, W));
    if (p.trim > 0) {
      const [x0, y0, x1, y1] = p.usable;
      poly("STOCK", rect(ox + x0 * MM, fy(y1), (x1 - x0) * MM, (y1 - y0) * MM));
    }
    text("LABELS", ox, oy + W + Math.min(40, W / 12), Math.min(30, W / 16), pieceLabel(p));
    const layer = profileLayer(p);
    const over = options.overcut ? pocketOvercut(p) : 0;
    for (const q of p.placements) {
      // Blank (u, v) to file millimetres. v runs with the sheet's y, which the file flips.
      const f = feat(q.tag);
      const place = (u: number, v: number): [number, number] => [ox + (q.x + u) * MM, fy(q.y + v)];
      if (f?.profile && f.profile.length >= 3) poly(layer, f.profile.map(([u, v]) => place(u, v)));
      else poly(layer, rect(ox + q.x * MM, fy(q.y + q.dy), q.dx * MM, q.dy * MM));
      // A sheet on its own names each part, so the shop knows the left door from the right.
      const label = sheet === undefined ? q.tag : `${q.tag} ${q.name}`;
      const h = Math.max(1, Math.min(25, (q.dy * MM) / 4, (q.dx * MM) / (label.length * 0.9 + 1)));
      text("LABELS", ox + (q.x + q.dx / 2) * MM, fy(q.y + q.dy / 2) - h / 2, h, label);
      if (!f) continue;
      const l = featureLayers(f, r12);
      for (const c of f.cutouts) poly("CUTOUT_THRU", c.map(([u, v]) => place(u, v)));
      f.pockets.forEach((pocket, k) => poly(l.pockets[k], overcutLoop(pocket.loop, q.dx, q.dy, over).map(([u, v]) => place(u, v))));
      f.flip.pockets.forEach((pocket, k) => poly(l.flipPockets[k], overcutLoop(pocket.loop, q.dx, q.dy, over).map(([u, v]) => place(u, v))));
      f.drills.forEach((drill, k) => {
        const [x, y] = place(drill.center[0], drill.center[1]);
        circle(l.drills[k], x, y, (drill.diameter * MM) / 2);
      });
      f.flip.drills.forEach((drill, k) => {
        const [x, y] = place(drill.center[0], drill.center[1]);
        circle(l.flipDrills[k], x, y, (drill.diameter * MM) / 2);
      });
    }
  }
  d.pair(0, "ENDSEC");
  d.pair(0, "EOF");
  return d.lines.join("\n") + "\n";
}
