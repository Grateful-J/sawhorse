import { describe, expect, it } from "vitest";
import type { KernelOp, NestSettings, StockLibrary } from "../kernel/types";
import { applyFromLibrary, ownStockMaterials, patchSettings, type NestSettingsPatch } from "./settingsQueue";

const IN = 0.0254;
const FOUR = { width: 48 * IN, length: 48 * IN };
const EIGHT = { width: 48 * IN, length: 96 * IN };
const tableSaw: NestSettings = { kerf: IN / 8, trim: 0, algorithm: "guillotine", sheetSize: FOUR };
const cnc = { algorithm: "maxrects" as const, kerf: 0.375 * IN, trim: 0.5 * IN };
const saw = { sheetSize: EIGHT, kerf: IN / 8, trim: IN / 4 };

/** A kernel that answers a tick late, as the worker does, and counts what it was asked. */
function kernel(start: NestSettings, failLibrary = false) {
  const lib: StockLibrary = { stocks: [], defaults: {}, settings: start };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    lib,
    applied: [] as KernelOp[],
    async stockLibrary(): Promise<StockLibrary> {
      await tick();
      if (failLibrary) throw new Error("the kernel stopped");
      return structuredClone(lib);
    },
    async apply(op: KernelOp): Promise<NestSettings> {
      await tick();
      this.applied.push(op);
      if (op.op === "set_nest_settings") lib.settings = op.settings;
      return lib.settings;
    },
  };
}

/** The app's edit queue: one task at a time, in the order they were asked for. */
function queue() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = last.then(task);
    last = next.catch(() => undefined);
    return next;
  };
}

const set = (patch: NestSettingsPatch) => (lib: StockLibrary): KernelOp => ({ op: "set_nest_settings", settings: patchSettings(lib.settings, patch) });

describe("a change to some nesting settings", () => {
  it("changes those and keeps the rest", () => {
    expect(patchSettings(tableSaw, { kerf: 0.01 })).toEqual({ ...tableSaw, kerf: 0.01 });
    expect(patchSettings(tableSaw, cnc)).toEqual({ ...tableSaw, ...cnc });
    expect(patchSettings({ ...tableSaw, jointLoss: 0.002 }, { trim: 0.01 })).toEqual({ ...tableSaw, jointLoss: 0.002, trim: 0.01 });
  });

  it("changes the saw a field at a time: its kerf keeps its trim and its sheet", () => {
    const on = { ...tableSaw, overflow: saw };
    expect(patchSettings(on, { overflow: { kerf: (3 / 32) * IN } })).toEqual({ ...on, overflow: { ...saw, kerf: (3 / 32) * IN } });
    expect(patchSettings(on, { overflow: { trim: 0.01 } })).toEqual({ ...on, overflow: { ...saw, trim: 0.01 } });
    expect(patchSettings(on, { overflow: null })).toEqual({ ...on, overflow: null });
    expect(patchSettings(on, { kerf: 0.01 }).overflow).toEqual(saw);
    // The saw turned off in the meantime: a field of it has nothing to change.
    expect(patchSettings(tableSaw, { overflow: { kerf: 0.002 } })).toEqual(tableSaw);
    // A whole saw turns it on.
    expect(patchSettings(tableSaw, { overflow: { sheetSize: EIGHT, kerf: 0.003 } }).overflow).toEqual({ sheetSize: EIGHT, kerf: 0.003, trim: 0 });
  });
});

describe("two changes made one right after the other both land", () => {
  it("CNC spacing, then the track saw in the same tick: the saw is on AND the spacing is the router's", async () => {
    const k = kernel(tableSaw);
    const run = queue();
    // Both asked for before either has read anything.
    const a = run(() => applyFromLibrary(k, set(cnc)));
    const b = run(() => applyFromLibrary(k, (lib) => ({ op: "set_nest_settings", settings: { ...lib.settings, overflow: saw } })));
    await Promise.all([a, b]);
    expect(k.lib.settings).toEqual({ ...tableSaw, ...cnc, overflow: saw });
    expect(k.applied.length).toBe(2);
  });

  it("Kerf then Trim, Enter on each: both are set", async () => {
    const k = kernel(tableSaw);
    const run = queue();
    await Promise.all([run(() => applyFromLibrary(k, set({ kerf: 0.375 * IN }))), run(() => applyFromLibrary(k, set({ trim: 0.5 * IN })))]);
    expect(k.lib.settings.kerf).toBeCloseTo(0.375 * IN, 12);
    expect(k.lib.settings.trim).toBeCloseTo(0.5 * IN, 12);
  });

  it("Saw kerf then Saw trim: both are set, on the saw as it is", async () => {
    const k = kernel({ ...tableSaw, overflow: saw });
    const run = queue();
    await Promise.all([run(() => applyFromLibrary(k, set({ overflow: { kerf: 0.002 } }))), run(() => applyFromLibrary(k, set({ overflow: { trim: 0.01 } })))]);
    expect(k.lib.settings.overflow).toEqual({ sheetSize: EIGHT, kerf: 0.002, trim: 0.01 });
  });

  it("what it replaces lost the first change: a library read before the queue was joined", async () => {
    // The old way, kept here so the tests above are known to be able to fail: each change
    // reads the library first, then queues only the write.
    const k = kernel(tableSaw);
    const run = queue();
    const old = async (patch: NestSettingsPatch) => {
      const lib = await k.stockLibrary();
      return run(() => k.apply(set(patch)(lib)));
    };
    await Promise.all([old({ kerf: 0.375 * IN }), old({ trim: 0.5 * IN })]);
    expect(k.lib.settings.kerf).toBe(IN / 8); // the kerf was put back
    expect(k.lib.settings.trim).toBeCloseTo(0.5 * IN, 12);
  });

  it("a library that cannot be read rejects, applies nothing, and the next change still runs", async () => {
    const bad = kernel(tableSaw, true);
    const run = queue();
    await expect(run(() => applyFromLibrary(bad, set({ kerf: 0.01 })))).rejects.toThrow("the kernel stopped");
    expect(bad.applied).toEqual([]);
    const k = kernel(tableSaw);
    const first = run(() => applyFromLibrary(bad, set({ kerf: 0.01 }))).catch((e: Error) => e.message);
    const second = run(() => applyFromLibrary(k, set({ trim: 0.01 })));
    expect(await first).toBe("the kernel stopped");
    expect((await second).trim).toBe(0.01);
  });
});

describe("materials that keep their own stock when sheet goods nest on a footprint", () => {
  const sheet = (name: string, width: number, length: number) => ({ name, kind: "sheet" as const, width, length, thickness: 0.018, grain: "length" as const });
  const lib: StockLibrary = {
    stocks: [sheet("4 x 8 sheet, 3/4", 48 * IN, 96 * IN), sheet("4 x 4 sheet, 3/4", 48 * IN, 48 * IN), sheet("5 x 5 Baltic birch, 3/4", 60 * IN, 60 * IN), { name: "4/4 x 6 x 96", kind: "board", width: 6 * IN, length: 96 * IN, thickness: 0.75 * IN, grain: "length" }],
    defaults: { "Cabinet plywood": "4 x 8 sheet, 3/4", Baltic: "5 x 5 Baltic birch, 3/4", "Shop ply": "4 x 4 sheet, 3/4", Oak: "4/4 x 6 x 96", Gone: "No such stock" },
    settings: tableSaw,
  };

  it("are those whose default is a sheet of another size, by name", () => {
    expect(ownStockMaterials(lib, FOUR)).toEqual(["Baltic", "Cabinet plywood"]);
    // Either way round is the same sheet.
    expect(ownStockMaterials(lib, { width: 96 * IN, length: 48 * IN })).toEqual(["Baltic", "Shop ply"]);
    expect(ownStockMaterials({ ...lib, defaults: undefined }, FOUR)).toEqual([]);
  });
});
