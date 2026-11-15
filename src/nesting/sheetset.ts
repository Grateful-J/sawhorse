// One click for a shop whose router or saw takes one sheet size: plywood of that footprint in
// the three thicknesses cabinets are made of, and nesting set to use it.
//
// An inch document gets the sheets a US yard sells: 4 x 4 at 23/32, 15/32 and 7/32 in ("3/4",
// "1/2", "1/4"). A metric document gets metric sheets: 1220 x 1220 at 18, 12 and 6 mm, the
// thicknesses a metric cabinet is drawn at, so its parts are not nested on a sheet 0.26 mm
// thicker than they were drawn.
import type { KernelOp, StockDef, StockLibrary } from "../kernel/types";

const IN = 0.0254;
const MM = 0.001;

/** "3/4" plywood is 23/32 in, "1/2" is 15/32, "1/4" is 7/32 (as the built-in sheets). */
export const PLY_THICKNESSES: { nominal: string; actual: number }[] = [
  { nominal: "3/4", actual: (23 / 32) * IN },
  { nominal: "1/2", actual: (15 / 32) * IN },
  { nominal: "1/4", actual: (7 / 32) * IN },
];

/** Metric plywood: 18, 12 and 6 mm, named by what it is. */
export const PLY_THICKNESSES_MM: { nominal: string; actual: number }[] = [
  { nominal: "18 mm", actual: 0.018 },
  { nominal: "12 mm", actual: 0.012 },
  { nominal: "6 mm", actual: 0.006 },
];

/** The kernel's `STOCK_EPSILON`: two sheet sides this close are the same footprint. */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

/**
 * 1.5 mm: a sheet of the footprint within this of a thickness is that thickness's sheet
 * already (the kernel puts a part on a sheet within 1/16 in, 1.59 mm, of it). It is well clear
 * of every difference it has to tell apart: a nominal sheet and the same one measured (3/4 in
 * against 23/32 is 0.79 mm, 19 mm against 18 is 1, 6.35 against 6 is 0.35) are one sheet; the
 * next size down or up (5/8 against 3/4, 15 or 16 mm against 18, 9 against 12 or 6) is 2 mm or
 * more away and is not.
 */
const SAME_THICKNESS = 1.5 * MM;

/** The footprint in feet for a name: "4 x 4". */
function feet(width: number, length: number): string {
  const ft = (m: number) => String(Math.round((m / IN / 12) * 100) / 100);
  return `${ft(Math.min(width, length))} x ${ft(Math.max(width, length))}`;
}

/** The footprint in millimetres for a name: "1220 x 1220". */
function millimetres(width: number, length: number): string {
  const mm = (m: number) => String(Math.round(m / MM));
  return `${mm(Math.min(width, length))} x ${mm(Math.max(width, length))}`;
}

/** A sheet side as a metric yard sells it: a whole number of feet is 305 mm a foot (4 ft is
 * 1220, 5 ft 1525, 8 ft 2440); any other side is itself. */
function metricSide(m: number): number {
  const ft = m / (12 * IN);
  const whole = Math.round(ft);
  return whole >= 1 && Math.abs(ft - whole) * 12 * IN <= 1.5 * MM ? whole * 305 * MM : m;
}

/** The CNC router's sheet: 4 x 4 (1220 x 1220 in a metric shop). */
export function routerSheet(metric: boolean): { width: number; length: number } {
  return metric ? { width: 1.22, length: 1.22 } : { width: 48 * IN, length: 48 * IN };
}

/**
 * The ops (one batch, one undo step) that add plywood sheets of this footprint in 3/4, 1/2 and
 * 1/4 (18, 12 and 6 mm in a `metric` document) where the library has none of that size and
 * thickness, and nest sheet goods on it. `added` names the sheets it adds; a sheet already
 * there is left as it is, whatever its measured thickness. `size` is the footprint the
 * nesting is set to: the one asked for, or in a metric document its metric size (a 48 x 48 in
 * footprint is 1220 x 1220).
 */
export function sheetSetOps(lib: StockLibrary, width: number, length: number, metric = false): { op: KernelOp; added: string[]; size: { width: number; length: number } } {
  const ops: KernelOp[] = [];
  const added: string[] = [];
  if (metric) {
    width = metricSide(width);
    length = metricSide(length);
  }
  const fits = (s: StockDef) => s.kind === "sheet" && ((same(s.width, width) && same(s.length, length)) || (same(s.width, length) && same(s.length, width)));
  for (const t of metric ? PLY_THICKNESSES_MM : PLY_THICKNESSES) {
    if (lib.stocks.some((s) => fits(s) && Math.abs(s.thickness - t.actual) <= SAME_THICKNESS)) continue;
    const base = `${metric ? millimetres(width, length) : feet(width, length)} sheet, ${t.nominal}`;
    let name = base;
    for (let k = 2; lib.stocks.some((s) => s.name === name); k++) name = `${base} (${k})`;
    // A metric sheet has no nominal thickness: 18 mm is what it is.
    ops.push({ op: "define_stock", stock: { name, kind: "sheet", width, length, thickness: t.actual, nominal: metric ? null : t.nominal, grain: "length" }, replace: null });
    added.push(name);
  }
  ops.push({ op: "set_nest_settings", settings: { ...lib.settings, sheetSize: { width, length } } });
  return { op: { op: "batch", ops }, added, size: { width, length } };
}

/** The track saw's sheet: 4 x 8 (1220 x 2440 in a metric shop). */
export function sawSheet(metric: boolean): { width: number; length: number } {
  return metric ? { width: 1.22, length: 2.44 } : { width: 48 * IN, length: 96 * IN };
}

/** A track saw's defaults: a 1/8 in (3 mm) blade, 1/4 in (6 mm) off each factory edge so the
 * first cuts square the sheet. A 4 x 8 then takes parts up to 95 1/2 x 47 1/2 in. */
export function sawDefaults(metric: boolean): { kerf: number; trim: number } {
  return metric ? { kerf: 0.003, trim: 0.006 } : { kerf: IN / 8, trim: IN / 4 };
}

/**
 * Mixed: what does not fit the CNC router's sheet (`settings.sheetSize`) is cut on a track saw
 * from 4 x 8 sheets, laid out in straight cuts. One batch, one undo step: the 4 x 8 plywood the
 * library lacks in 3/4, 1/2 and 1/4 (1220 x 2440 at 18, 12 and 6 mm in a metric document), and
 * the overflow setting. Off clears the setting and leaves the sheets.
 *
 * The saw's kerf and trim are those already set; with none set, `last` (what they were before
 * the saw was turned off: the caller keeps them, the document does not); with neither, the
 * defaults.
 */
export function overflowOps(lib: StockLibrary, on: boolean, metric: boolean, last?: { kerf: number; trim: number } | null): { op: KernelOp; added: string[] } {
  if (!on) return { op: { op: "set_nest_settings", settings: { ...lib.settings, overflow: null } }, added: [] };
  const size = sawSheet(metric);
  const { op, added } = sheetSetOps(lib, size.width, size.length, metric);
  const ops = (op as { op: "batch"; ops: KernelOp[] }).ops.slice(0, -1);
  const set = lib.settings.overflow ?? last;
  const saw = { sheetSize: size, ...sawDefaults(metric), ...(set ? { kerf: set.kerf, trim: set.trim } : {}) };
  ops.push({ op: "set_nest_settings", settings: { ...lib.settings, overflow: saw } });
  return { op: { op: "batch", ops }, added };
}
