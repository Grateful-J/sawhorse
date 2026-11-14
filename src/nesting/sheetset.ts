// One click for a shop whose router or saw takes one sheet size: plywood of that footprint in
// the three thicknesses cabinets are made of, and nesting set to use it.
import type { KernelOp, StockDef, StockLibrary } from "../kernel/types";

const IN = 0.0254;

/** "3/4" plywood is 23/32 in, "1/2" is 15/32, "1/4" is 7/32 (as the built-in sheets). */
export const PLY_THICKNESSES: { nominal: string; actual: number }[] = [
  { nominal: "3/4", actual: (23 / 32) * IN },
  { nominal: "1/2", actual: (15 / 32) * IN },
  { nominal: "1/4", actual: (7 / 32) * IN },
];

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

/** The footprint in feet for a name: "4 x 4". */
function feet(width: number, length: number): string {
  const ft = (m: number) => String(Math.round((m / IN / 12) * 100) / 100);
  return `${ft(Math.min(width, length))} x ${ft(Math.max(width, length))}`;
}

/**
 * The ops (one batch, one undo step) that add plywood sheets of this footprint in 3/4, 1/2 and
 * 1/4 where the library has none of that size and thickness, and nest sheet goods on it.
 * `added` names the sheets it adds; a sheet already there is left as it is.
 */
export function sheetSetOps(lib: StockLibrary, width: number, length: number): { op: KernelOp; added: string[] } {
  const ops: KernelOp[] = [];
  const added: string[] = [];
  const fits = (s: StockDef) => s.kind === "sheet" && ((same(s.width, width) && same(s.length, length)) || (same(s.width, length) && same(s.length, width)));
  for (const t of PLY_THICKNESSES) {
    if (lib.stocks.some((s) => fits(s) && Math.abs(s.thickness - t.actual) <= IN / 32)) continue;
    let name = `${feet(width, length)} sheet, ${t.nominal}`;
    for (let k = 2; lib.stocks.some((s) => s.name === name); k++) name = `${feet(width, length)} sheet, ${t.nominal} (${k})`;
    ops.push({ op: "define_stock", stock: { name, kind: "sheet", width, length, thickness: t.actual, nominal: t.nominal, grain: "length" }, replace: null });
    added.push(name);
  }
  ops.push({ op: "set_nest_settings", settings: { ...lib.settings, sheetSize: { width, length } } });
  return { op: { op: "batch", ops }, added };
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
 * library lacks in 3/4, 1/2 and 1/4, and the overflow setting. Off clears the setting and
 * leaves the sheets.
 */
export function overflowOps(lib: StockLibrary, on: boolean, metric: boolean): { op: KernelOp; added: string[] } {
  if (!on) return { op: { op: "set_nest_settings", settings: { ...lib.settings, overflow: null } }, added: [] };
  const size = sawSheet(metric);
  const { op, added } = sheetSetOps(lib, size.width, size.length);
  const ops = (op as { op: "batch"; ops: KernelOp[] }).ops.slice(0, -1);
  const saw = { sheetSize: size, ...sawDefaults(metric), ...(lib.settings.overflow ? { kerf: lib.settings.overflow.kerf, trim: lib.settings.overflow.trim } : {}) };
  ops.push({ op: "set_nest_settings", settings: { ...lib.settings, overflow: saw } });
  return { op: { op: "batch", ops }, added };
}
