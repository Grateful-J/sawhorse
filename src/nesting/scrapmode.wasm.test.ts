// @vitest-environment node
// Scrap mode through the real kernel: the Cabinet generator's drawer base (grain matching on)
// and door base, nested on 4 x 4 plywood with CNC spacing. With `mix` on, parts of one
// thickness share sheets whatever their material, so it takes fewer sheets; every part is
// still placed, on a sheet of its own thickness. Needs `npm run wasm`; skipped without the
// kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, flatImportOp, MATERIALS, plan, type Part } from "../../plugins/cabinet-generator/cabinet.js";
import type { Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { sheetSetOps } from "./sheetset";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;
const IN = 0.0254;

type Doc = { apply_op(json: string): string; apply_named_batch(json: string): string; nest(o: string): string };
async function doc(): Promise<Doc> {
  const mod = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as { initSync(o: { module: Buffer }): void; document_new(): Doc };
  mod.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  return mod.document_new();
}

/** The ops main.js's addParts sends (grain, keep together), then the cabinet's component. */
function generate(parts: Part[], name: string, at: V3) {
  const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
  const ops: Record<string, unknown>[] = [flatImportOp(parts, at, Object.values(MATERIALS))];
  const items: unknown[] = [];
  let k = 0;
  for (const part of parts) {
    const first = ref(k);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
    if (part.grain !== "length") ops.push({ op: "set_grain", part: { node: first }, grain: part.grain });
    if (part.together) ops.push({ op: "set_together", part: { node: first }, together: part.together });
  }
  ops.push({ op: "make_component", items, name });
  return { name: "Generate cabinet", ops };
}

run("scrap mode through the kernel", () => {
  it("shares sheets across materials, places every part, and keeps each on a sheet of its thickness", async () => {
    const d = await doc();
    const cabinets = [
      { ...applyPreset(defaults(false), "drawers", false), name: "Drawers 1", grainMatch: true },
      { ...applyPreset(defaults(false), "base", false), name: "Base 1" },
    ];
    let x = 0;
    for (const s of cabinets) {
      const p = plan(s, false);
      expect(p.error).toBeNull();
      d.apply_named_batch(JSON.stringify(generate(p.parts, s.name, [x, 0, 0])));
      x += s.width + 0.1;
    }
    d.apply_op(JSON.stringify(sheetSetOps((JSON.parse(d.nest("{}")) as Nesting).library, 48 * IN, 48 * IN).op));
    const settings = { ...(JSON.parse(d.nest("{}")) as Nesting).library.settings, ...cncSettings(false) };
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings }));
    const strict = JSON.parse(d.nest("{}")) as Nesting;
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...settings, mix: true } }));
    const mixed = JSON.parse(d.nest("{}")) as Nesting;

    expect(mixed.settings.mix).toBe(true);
    expect(mixed.unplaced).toEqual(strict.unplaced);
    const count = (n: Nesting) => n.pieces.reduce((a, x) => a + x.placements.length, 0);
    expect(count(mixed)).toBe(count(strict));
    expect(mixed.pieces.length).toBeLessThan(strict.pieces.length);
    // One sheet group per stock: no material splits them.
    expect(mixed.pieces.every((x) => x.material == null)).toBe(true);
    expect(mixed.pieces.flatMap((x) => x.placements).some((q) => q.together)).toBe(false);
    expect(strict.pieces.flatMap((x) => x.placements).some((q) => q.together)).toBe(true);
    for (const pc of mixed.pieces) for (const q of pc.placements) expect(Math.abs(q.size[0] - pc.thickness)).toBeLessThanOrEqual(IN / 16);
    // Off again: the nesting is the strict one.
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...settings, mix: false } }));
    expect((JSON.parse(d.nest("{}")) as Nesting).hash).toBe(strict.hash);
  });
});
