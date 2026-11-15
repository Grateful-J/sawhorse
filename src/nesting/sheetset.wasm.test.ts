// @vitest-environment node
// "Use 4 x 4 plywood" through the real kernel: one batch adds the three sheets and nests on
// 4 x 4, a second click adds nothing, and one undo takes it all back. Needs `npm run wasm`;
// skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Nesting, StockLibrary } from "../kernel/types";
import { sheetSetOps } from "./sheetset";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;
const IN = 0.0254;

type Doc = { apply_op(json: string): string; nest(o: string): string; undo(): void };
async function doc(): Promise<Doc> {
  const mod = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as { initSync(o: { module: Buffer }): void; document_new(): Doc };
  mod.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  return mod.document_new();
}

run("4 x 4 plywood in one click", () => {
  it("adds 3/4, 1/2 and 1/4 sheets of 4 x 4, nests a plywood part on one, and undoes as one step", async () => {
    const d = await doc();
    // A 3/4 plywood panel 30 x 20 in.
    d.apply_op(JSON.stringify({ op: "add_rectangle", sketch: 1, x: 0, y: 0, w: 30 * IN, h: 20 * IN }));
    const made = JSON.parse(d.apply_op(JSON.stringify({ op: "extrude", sketch: 1, region: 1, distance: (23 / 32) * IN })));
    d.apply_op(JSON.stringify({ op: "set_stock", part: { object: made.object }, stock: null, sheet: true }));
    const before = JSON.parse(d.nest("{}")) as Nesting;
    expect(before.pieces.every((p) => p.length !== 48 * IN || p.width !== 48 * IN)).toBe(true);

    const lib: StockLibrary = before.library;
    const { op, added } = sheetSetOps(lib, 48 * IN, 48 * IN);
    expect(added).toEqual(["4 x 4 sheet, 3/4", "4 x 4 sheet, 1/2", "4 x 4 sheet, 1/4"]);
    d.apply_op(JSON.stringify(op));
    const after = JSON.parse(d.nest("{}")) as Nesting;
    expect(after.settings.sheetSize).toEqual({ width: 48 * IN, length: 48 * IN });
    const sheet = after.pieces.find((p) => p.kind === "sheet")!;
    expect(sheet.stock).toBe("4 x 4 sheet, 3/4");
    expect(sheet.thickness).toBeCloseTo((23 / 32) * IN, 12);

    // Again: nothing to add.
    expect(sheetSetOps(after.library, 48 * IN, 48 * IN).added).toEqual([]);

    d.undo();
    const undone = JSON.parse(d.nest("{}")) as Nesting;
    expect(undone.library.stocks.some((s) => s.name.startsWith("4 x 4"))).toBe(false);
    expect(undone.settings.sheetSize ?? null).toBeNull();
  });
});
