// Nesting settings changed a field at a time.
//
// The settings are one object in the document, replaced whole by `set_nest_settings`. A change
// to one field must therefore be built on the settings as they are when the change is applied,
// not as they were when the field was typed: two changes made one after the other (CNC spacing,
// then the track saw; Kerf, then Trim) both read the same settings, and the second put the
// first one's field back. So the read and the write are one task in the edit queue.
import type { KernelOp, NestSettings, SawOverflow, StockLibrary } from "../kernel/types";

/** Some nesting settings. The saw's (`overflow`) are patched field by field too: `{ kerf }`
 * changes only its kerf; null turns the saw off. */
export type NestSettingsPatch = Partial<Omit<NestSettings, "overflow">> & { overflow?: Partial<SawOverflow> | null };

/** `current` with `patch` applied. A patch of some of the saw's fields changes the saw that is
 * set; with no saw set it is dropped unless it is a whole saw (a sheet size and a kerf). */
export function patchSettings(current: NestSettings, patch: NestSettingsPatch): NestSettings {
  const { overflow, ...rest } = patch;
  const next: NestSettings = { ...current, ...rest };
  if (overflow === undefined) return next;
  if (overflow === null) return { ...next, overflow: null };
  if (current.overflow) return { ...next, overflow: { ...current.overflow, ...overflow } };
  if (overflow.sheetSize && overflow.kerf !== undefined) return { ...next, overflow: { sheetSize: overflow.sheetSize, kerf: overflow.kerf, trim: overflow.trim ?? 0 } };
  return next;
}

export interface LibraryKernel<R> {
  stockLibrary(): Promise<StockLibrary>;
  apply(op: KernelOp): Promise<R>;
}

/**
 * Read the stock library and apply the op built from it, as ONE task: run it inside the edit
 * queue, so no other edit lands between the read and the write. A library that cannot be read
 * rejects (the queue says so); nothing is applied.
 */
export async function applyFromLibrary<R>(kernel: LibraryKernel<R>, build: (lib: StockLibrary) => KernelOp): Promise<R> {
  return kernel.apply(build(await kernel.stockLibrary()));
}

/**
 * The materials that keep their own stock when sheet goods are set to nest on a footprint: each
 * has a default stock that is a sheet of another size, which the nester takes as said. (A
 * material on a board, or on a sheet of this footprint, is not one.)
 */
export function ownStockMaterials(lib: StockLibrary, size: { width: number; length: number }): string[] {
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  const out: string[] = [];
  for (const [material, name] of Object.entries(lib.defaults ?? {})) {
    const s = lib.stocks.find((x) => x.name === name);
    if (!s || s.kind !== "sheet") continue;
    const fits = (same(s.width, size.width) && same(s.length, size.length)) || (same(s.width, size.length) && same(s.length, size.width));
    if (!fits) out.push(material);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
