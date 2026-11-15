// How the nesting reads (lane 9): lengths in the cut list's rounding, the cut sequence in
// shop words, why a part is not on any stock, and the totals tiles. The pane, the SVG and
// DXF files and the PDF booklet all say exactly the same thing.
import type { GlueUp, NestAlgorithm, NestCut, Nesting, Placement, Rounding, StockDef, StockPiece, Unplaced } from "../kernel/types";
import { formatArea, formatSteps, sizeUnit as unitOf, type SizeStyle } from "../cutlist/format";

/** How lengths are written: a rounding (fractions for inches, mm for metric), or a rounding
 * and the cut list's size style (decimal inches when the model works in decimal inches). */
export type Units = Rounding | { r: Rounding; style: SizeStyle };

export function roundingOf(u: Units): Rounding {
  return typeof u === "string" ? u : u.r;
}

function styleOf(u: Units): SizeStyle {
  return typeof u === "string" ? (u === "half_mm" ? "mm" : "fraction") : u.style;
}

/** "in" or "mm". */
export function sizeUnit(u: Units): string {
  return unitOf(roundingOf(u));
}

export const M_PER_IN = 0.0254;

/** #49: the kernel's default joint loss, 1/8 in (a document stores none until it is changed). */
export const JOINT_LOSS_DEFAULT = M_PER_IN / 8;

/** One rounding step, metres. */
export function stepOf(r: Rounding): number {
  return r === "half_mm" ? 0.0005 : r === "thirty_second" ? M_PER_IN / 32 : M_PER_IN / 16;
}

/** A length as the cut list writes it: "11 1/4", "3/4", "285.5" (no unit). */
export function len(m: number, u: Units): string {
  const r = roundingOf(u);
  return formatSteps(Math.round(m / stepOf(r)), r, styleOf(u));
}

/** The same with its unit: "11 1/4 in", "285.5 mm". */
export function lenU(m: number, r: Units): string {
  return `${len(m, r)} ${sizeUnit(r)}`;
}

/** A small length the saw is set to (kerf, trim) with the precision it needs, whatever the
 * cut list's rounding: inches to the nearest 1/64 ("3/32 in"), decimal inches to 0.001,
 * millimetres to 0.01 ("2.38 mm"). A negative length keeps its sign ("-1/8 in"). */
export function fineU(m: number, u: Units): string {
  const r = roundingOf(u);
  const style = styleOf(u);
  if (r === "half_mm" || style === "mm") return `${Number((m * 1000).toFixed(2))} mm`;
  const inches = m / M_PER_IN;
  if (style === "decimal") return `${Number(inches.toFixed(3))} in`;
  return `${sixtyFourths(Math.round(inches * 64))} in`;
}

/** A whole number of 64ths of an inch as a shop writes it: "4 23/32", "3/8", "0", "-1/8". */
function sixtyFourths(n: number): string {
  if (n < 0) return `-${sixtyFourths(-n)}`;
  const whole = Math.floor(n / 64);
  let num = n - whole * 64;
  let den = 64;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const frac = num ? `${num}/${den}` : "";
  return whole && frac ? `${whole} ${frac}` : whole ? String(whole) : frac || "0";
}

/** One step of [`fineU`]'s precision, metres: 1/64 in, 0.001 in (decimal inches), 0.01 mm. */
export function fineStep(u: Units): number {
  const style = styleOf(u);
  if (roundingOf(u) === "half_mm" || style === "mm") return 1e-5;
  return style === "decimal" ? M_PER_IN / 1000 : M_PER_IN / 64;
}

/** [`fineU`]'s precision in words: "1/64 in", "0.001 in", "0.01 mm". */
export function finePrecision(u: Units): string {
  const style = styleOf(u);
  if (roundingOf(u) === "half_mm" || style === "mm") return "0.01 mm";
  return style === "decimal" ? "0.001 in" : "1/64 in";
}

/** A whole number of [`fineStep`]s written bare, as [`fineU`] writes a length: "4 23/32",
 * "0.727", "18.46". Lengths rounded to steps first and then added or subtracted still agree
 * when written (a width and the two edges it lies between). */
export function fineSteps(steps: number, u: Units): string {
  const style = styleOf(u);
  if (roundingOf(u) === "half_mm" || style === "mm") return String(Number((steps / 100).toFixed(2)));
  return style === "decimal" ? String(Number((steps / 1000).toFixed(3))) : sixtyFourths(steps);
}

/**
 * A thickness (or any length where a hair matters) written so that what is printed is what it
 * is: millimetres to 0.01; inches as a fraction only when the length is that fraction (within
 * 0.005 mm of a 64th), otherwise decimal inches to 0.001. [`fineU`] rounds 0.727 in to
 * "47/64 in" and a 0.15 mm difference to "0 in"; this never does.
 */
export function exactU(m: number, u: Units): string {
  const style = styleOf(u);
  if (roundingOf(u) === "half_mm" || style === "mm") return `${Number((m * 1000).toFixed(2))} mm`;
  const inches = m / M_PER_IN;
  const n = Math.round(inches * 64);
  if (style !== "decimal" && n !== 0 && Math.abs(inches - n / 64) * M_PER_IN <= 5e-6) return `${sixtyFourths(n)} in`;
  return `${Number(inches.toFixed(3))} in`;
}

/** A small difference between two lengths, as a real number: "0.15 mm"; in an inch document
 * "1/32 in" when it is that fraction, otherwise "0.006 in (0.15 mm)". Never "0 in". */
export function diffU(m: number, u: Units): string {
  const mm = `${Number((Math.abs(m) * 1000).toFixed(2))} mm`;
  if (roundingOf(u) === "half_mm" || styleOf(u) === "mm") return mm;
  const exact = exactU(Math.abs(m), u);
  return /\//.test(exact) ? exact : `${exact} (${mm})`;
}

/** "11 1/4 × 34 1/2" (width × length of a placed part, or of a stock). */
export function dims(a: number, b: number, r: Units): string {
  return `${len(a, r)} × ${len(b, r)}`;
}

/** #49: what a placed piece is cut to, width and length: the part's size, or for a strip of
 * a glue-up the strip's width and the part's length. */
export function placedSize(q: Placement): [number, number] {
  return q.strip ? [q.dy, q.size[2]] : [q.size[1], q.size[2]];
}

/** #49: ", strip 2 of 3" for a strip of a glue-up, "" otherwise. */
export function stripText(q: Placement): string {
  return q.strip ? `, strip ${q.strip.n} of ${q.strip.of}` : "";
}

/** #49: "4a Side: glued up from 3 strips of 4/4 x 6 x 96, 6 + 6 + 5 1/4 in". */
export function glueText(g: GlueUp, r: Units): string {
  return `${g.tag} ${g.name}: glued up from ${g.widths.length} strips of ${g.stock}, ${g.widths.map((w) => len(w, r)).join(" + ")} ${sizeUnit(r)}`;
}

/** A fraction 0..1 as a percentage with one decimal: "62.4%". */
export function pct(x: number): string {
  return `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
}

export function area(m2: number, u: Units): string {
  return formatArea(m2, roundingOf(u));
}

export const ALGORITHMS: { id: NestAlgorithm; label: string; title: string }[] = [
  { id: "guillotine", label: "Table saw", title: "Guillotine: every sheet comes apart in straight cuts from edge to edge" },
  { id: "maxrects", label: "Tightest (CNC)", title: "Maximal rectangles: packs tighter; some layouts need a track saw or a CNC" },
];

/** "Sheet", "Board". */
export function kindWord(p: { kind: "sheet" | "board" }): string {
  return p.kind === "sheet" ? "Sheet" : "Board";
}

/** "Sheet 1 of 2". */
export function pieceNumber(p: StockPiece): string {
  return `${kindWord(p)} ${p.seq} of ${p.count}`;
}

/** "Sheet 1 of 2 · 4 x 8 sheet, 3/4 · Oak". */
export function pieceTitle(p: StockPiece): string {
  return `${pieceNumber(p)} · ${p.stock}${p.material ? ` · ${p.material}` : ""}${p.saw ? " · track saw" : ""}`;
}

/** "62.4% used · 12.71 sq ft waste". */
export function pieceYield(p: StockPiece, r: Units): string {
  return `${pct(p.efficiency)} used · ${area(p.waste_area, r)} waste`;
}

/** A stock's size as a shop writes it: "48 × 96 × 23/32 in" (width × length × thickness).
 * The thickness is the actual one at the saw's precision ([`fineU`]), not the cut list's
 * rounding: rounded to 1/16 in, 23/32, 15/32 and 7/32 plywood all read as 3/4, 1/2 and 1/4,
 * and the difference between nominal and actual is the whole point (lane 15 verifier). */
export function stockSize(s: Pick<StockDef, "width" | "length" | "thickness">, r: Units): string {
  return `${len(s.width, r)} × ${len(s.length, r)} × ${fineU(s.thickness, r)}`;
}

/** One step of the cut sequence: "Rip to 11 1/4 in (96 in long)". */
export function cutText(c: NestCut, r: Units): string {
  const run = len(c.to - c.from, r);
  if (c.trim) return `Trim ${c.dir === "rip" ? "a long edge" : "an end"} (${fineU(c.size, r)} off)`;
  return c.dir === "rip" ? `Rip to ${lenU(c.size, r)} (cut ${run} long)` : `Crosscut to ${lenU(c.size, r)} (cut ${run} across)`;
}

/** Why a part is not on any stock, in plain words. */
export function reasonText(u: Unplaced): string {
  switch (u.reason) {
    case "no_stock":
      if (u.sheet && u.asked && u.asked.length === 2) {
        return `no ${len(u.asked[0], "sixteenth")} × ${len(u.asked[1], "sixteenth")} in sheet of this thickness; add one (Stock…), or choose Automatic`;
      }
      return `no ${u.sheet ? "sheet" : "board"} in the stock library is ${u.sheet ? "this thickness" : "this thick"}; add one (Stock…)`;
    case "thickness":
      return `${u.stock} is not its thickness`;
    case "too_large":
      // #49: a board part only too wide is glued up; one still too large cannot be: too
      // long for the board, its grain across, the board no wider than the joint loss, or
      // (lane 42) a last strip narrower than the kerf or 1 mm, or more than 100 strips.
      return u.sheet ? `larger than ${u.stock ?? "any stock"}; glue it up or add larger stock` : `larger than ${u.stock ?? "any board"} and cannot be glued up for width (too long for it, its grain across, the board no wider than the joint loss, a last strip narrower than the kerf or 1 mm, or more than 100 strips); add larger stock`;
    case "grain":
      return `fits ${u.stock} only with its grain across; turn its grain or pick other stock`;
    case "flat":
      return "a flat face with no thickness, not a piece of wood; give it a thickness (Push/Pull) or leave it out";
    case "not_a_board":
      return "open faces thicker than any board, sized as one piece: likely several parts drawn as one; group each board on its own";
    case "whole_piece":
      return "thicker than any board and over 12 in both ways: a whole piece drawn as one block; draw each board as its own part";
    case "hollow":
      return "a solid thicker than any board with more than 30% of its box empty: a whole piece, not a blank; draw each board as its own part";
    case "too_wide":
      return "wider than 4 ft and than any board; mark it sheet goods if it is a sheet, or draw the boards of the glue-up";
    case "together":
      // Kept together (grain-matched fronts): a block is never split between sheets.
      return `kept together with ${blockText(u)}, and the block cannot be cut whole: another part of it has no stock, or its parts want different stock or material, share a place in the order, or run different ways; fix that part, or stop keeping them together (the Cabinet generator: Grain-matched fronts off)`;
    case "together_too_large":
      return `kept together with ${blockText(u)}: the block, laid out a kerf apart, is larger than ${u.stock ?? "any stock"}; add larger stock, tick "Track saw what won't fit", or stop keeping them together (the Cabinet generator: Grain-matched fronts off)`;
  }
}

/** "the 3 other parts of “Cabinet 1 fronts”" (part 2 of 4). */
function blockText(u: Unplaced): string {
  const b = u.together;
  if (!b) return "other parts";
  const others = b.of - 1;
  return `the ${others === 1 ? "other part" : `${others} other parts`} of “${b.key}” (it is ${b.n} of ${b.of})`;
}

export interface NestSummary {
  sheets: string;
  sheetsLabel: string;
  boards: string;
  boardsLabel: string;
  yieldText: string;
  yieldLabel: string;
}

/** What the three tiles say: sheets by stock, boards by nominal size, overall yield. */
export function nestSummary(n: Nesting, r: Units): NestSummary {
  const t = n.totals;
  const sheetGroups = t.groups.filter((g) => g.kind === "sheet");
  const stocks = [...new Set(sheetGroups.map((g) => g.stock))];
  const saw = n.pieces.filter((p) => p.saw).length;
  const sheetsLabel = (stocks.length === 0 ? "sheets" : stocks.length === 1 ? `sheet${t.sheets === 1 ? "" : "s"}: ${stocks[0]}` : `sheets, ${stocks.length} kinds`) + (saw ? `, ${saw} on the track saw` : "");
  const nominal = t.by_nominal.map((b) => `${b.count} × ${b.nominal}`).join(", ");
  const bf = t.by_nominal.reduce((s, b) => s + b.board_feet, 0);
  const boardsLabel = t.boards === 0 ? "boards" : `board${t.boards === 1 ? "" : "s"}: ${nominal}, ${bf.toFixed(1)} bd ft`;
  return {
    sheets: String(t.sheets),
    sheetsLabel,
    boards: String(t.boards),
    boardsLabel,
    yieldText: t.stock_area > 0 ? pct(t.efficiency) : "—",
    yieldLabel: `yield · ${t.placed} of ${t.parts_in} part${t.parts_in === 1 ? "" : "s"} placed${t.stock_area > 0 ? ` · ${area(t.stock_area - t.parts_area, r)} waste` : ""}`,
  };
}

/** The settings in one line: "Kerf 1/8 in · trim 0 · table saw". */
export function settingsText(n: Nesting, r: Units): string {
  const alg = n.algorithm === "guillotine" ? "table saw" : "tightest layout (CNC)";
  // #49: the joint loss only when something is glued up, so every other footer reads as before.
  const joint = n.glue_ups?.length ? ` · joint loss ${fineU(n.settings.jointLoss ?? JOINT_LOSS_DEFAULT, r)}` : "";
  // Mixed: the track saw's own kerf and trim, when anything went to it.
  const o = n.settings.overflow;
  const saw = o && n.pieces.some((p) => p.saw) ? ` · track saw: kerf ${fineU(o.kerf, r)}, trim ${o.trim > 0 ? `${fineU(o.trim, r)} per edge` : "none"}, straight cuts` : "";
  return `Kerf ${fineU(n.settings.kerf, r)} · trim ${n.settings.trim > 0 ? `${fineU(n.settings.trim, r)} per edge` : "none"}${joint} · ${alg}${saw}`;
}

/** The footer every nesting output carries. */
export function nestNote(n: Nesting, r: Units): string {
  return `${settingsText(n, r)}. Parts at their exact finished sizes; grain runs along each sheet's and board's length. Sizes in ${sizeUnit(r)}.`;
}

/** Lane 15: the actual thickness (inches) a nominal one comes to by default, as a lumber yard
 * sells it (the kernel's `stock::standard_actual`, the same table): plywood is undersized
 * ("3/4" is 23/32 in, "1/2" 15/32, "1/4" 7/32, "5/8" 19/32, "3/8" 11/32); hardwood is sold
 * rough by the quarter and surfaced four sides (4/4 is 3/4 in, 5/4 1 1/16, 6/4 1 5/16, 8/4
 * 1 3/4, 10/4 2 1/4, 12/4 2 3/4, 16/4 3 3/4). `null` for a nominal not in the table. */
export function standardActual(kind: "sheet" | "board", nominal: string): number | null {
  const n = nominal.trim();
  const table: Record<string, number> =
    kind === "sheet"
      ? { "3/4": 23 / 32, "1/2": 15 / 32, "1/4": 7 / 32, "5/8": 19 / 32, "3/8": 11 / 32 }
      : { "4/4": 0.75, "5/4": 1.0625, "6/4": 1.3125, "8/4": 1.75, "10/4": 2.25, "12/4": 2.75, "16/4": 3.75 };
  return Object.prototype.hasOwnProperty.call(table, n) ? table[n] : null;
}
