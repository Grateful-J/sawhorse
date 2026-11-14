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
