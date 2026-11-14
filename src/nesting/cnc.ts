// What a CNC export must say before anything is cut: parts drawn at one thickness and nested
// on a sheet of another (every dado in the design is cut to the drawn thickness), parts closer
// together than a bit, no margin at the sheet edge, and cuts that were left out.
import type { Nesting, Placement, StockPiece } from "../kernel/types";
import type { BlankFeatures } from "./machine";
import { fineU, type Units } from "./format";
import type { MeasuredNest } from "./measure";

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

/** Warnings for a CNC export, each a sentence, most serious first. */
export function cncNotes(n: Nesting, measured: MeasuredNest | null, units: Units): string[] {
  const notes: string[] = [];
  for (const m of thicknessMismatches(n)) {
    notes.push(`${m.parts.join(", ")} ${m.parts.length === 1 ? "is" : "are"} drawn ${fineU(m.drawn, units)} thick but nested on ${m.stock} (${fineU(m.sheet, units)}): every dado and fit was cut to the drawing. Set the design to the sheet's measured thickness, or the sheet to what you will cut.`);
  }
  if (!measured) notes.push("The cuts inside the parts could not be measured: only the outlines were written.");
  else {
    if (measured.skipped.length) notes.push(`Left out cuts on ${measured.skipped.join(", ")}: a loop fell outside the blank, so only its outline was written.`);
    if (measured.flipped.length) notes.push(`${measured.flipped.join(", ")} ${measured.flipped.length === 1 ? "has" : "have"} cuts in both faces: those on FLIP_ layers are cut after turning the part over.`);
  }
  const kerf = n.settings.kerf;
  notes.push(`Parts are ${fineU(kerf, units)} apart: use a smaller bit than that.`);
  if (!(n.settings.trim > 0)) notes.push("No margin at the sheet edges (Trim is 0).");
  return notes;
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

/** A file name a shop can read: no slashes, quotes or other characters a file system refuses
 * ("3/4" 4x4" is "3-4in 4x4"). */
export function safeName(s: string): string {
  return s
    .replace(/"/g, "in")
    .replace(/[\\/]/g, "-")
    .replace(/[:*?<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The file for one sheet of a CNC export: its number, the cabinets and parts on it, its stock
 * and what the router does to it, e.g. "Kitchen sheet 05 of 06 - Sink base Left door, Right
 * door - 3-4in 4x4 (Door plywood) - profile, drills CNC.dxf". `ownerOf` names the cabinet a
 * part belongs to (null for a part on its own).
 */
export function cncFileName(title: string, n: Nesting, index: number, features: ReadonlyMap<string, BlankFeatures> | undefined, ownerOf: (q: Placement) => string | null): string {
  const piece = n.pieces[index];
  const width = String(n.pieces.length).length < 2 ? 2 : String(n.pieces.length).length;
  const num = `${String(index + 1).padStart(width, "0")} of ${String(n.pieces.length).padStart(width, "0")}`;
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
  const stock = piece.material && !piece.stock.includes(piece.material) ? `${piece.stock} (${piece.material})` : piece.stock;
  return safeName(`${title} sheet ${num} - ${parts.join("; ")}${more} - ${stock} - ${sheetOps(piece, features).join(", ")} CNC`) + ".dxf";
}

export interface NestProblem {
  kind: "unplaced" | "glued" | "material" | "spacing";
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
      const why = s ? `${want} is ${fineU(s.thickness, units)}, the part ${fineU(q.size[0], units)}` : `${want} is not in the library`;
      out.push({ kind: "material", tag: q.tag, name: q.name, text: `${p.material} is set to ${want}, but it went on ${p.stock}: ${why}` });
    }
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
  if (!n.pieces.some((p) => p.placements.length > 1)) return null;
  return {
    kind: "spacing",
    tag: "",
    name: "Every sheet",
    text: `parts are ${fineU(gap, units)} apart (Kerf), too close for a ${fineU(bit, units)} bit: the outside cuts of neighbouring parts meet, and the CAM program cuts around the group, not between its parts. Use CNC spacing (3/8 in apart), or set Kerf larger than your bit.`,
  };
}
