// @vitest-environment node
// Finished end panels, fillers and toe-kick skins through the real kernel: the batch main.js
// sends, read back from the cut list, the nesting and the DXF.
// - Each end panel, filler and skin is a part of its own: its size (the blank, banded or not),
//   its material, and its grain as the plugin set it; drawn at that size in the DXF.
// - A banded end panel's band is on the shopping list by the metre.
// - A base frame's skins export with the frame.
// - A cabinet that uses none of the row features gives the same DXF to the byte, whatever the
//   row-feature settings left at rest say.
// Needs `npm run wasm`; skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { applyPreset, defaults, flatImportOp, MATERIALS, plan, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { baseDefaults, IDENTITY, placeNext, planBase, type Cab } from "../../plugins/cabinet-generator/row.js";
import { planCabinet, trimEnds } from "../../plugins/cabinet-generator/trim.js";
import type { CutList, DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { shoppingList } from "../cutlist/shopping";
import { nestingDxf } from "./dxf";
import { measureNest } from "./measure";
import { sheetSetOps } from "./sheetset";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;

const IN = 0.0254;
const MM = 0.001;

type Doc = {
  apply_op(json: string): string;
  apply_named_batch(json: string): string;
  cut_list(o: string): string;
  nest(o: string): string;
  state_json(): string;
  faces_json(object: number): string;
  outline(kind: string, owner: number, index: number): string;
};
type Mod = { initSync(o: { module: Buffer }): void; document_new(): Doc };
let loaded: Mod | null = null;
async function doc(): Promise<Doc> {
  if (!loaded) {
    loaded = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as Mod;
    loaded.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  }
  return loaded.document_new();
}

/** The batch main.js sends (addParts): the parts flat, each part's grain and bom set through its
 * first copy, then the component. */
function generate(parts: Part[], name: string) {
  const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
  const ops: Record<string, unknown>[] = [flatImportOp(parts, [0, 0, 0], [...Object.values(MATERIALS), { name: "Base lumber", color: [214, 184, 140, 255] }])];
  let k = 0;
  const items: unknown[] = [];
  for (const part of parts) {
    const first = ref(k);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
    if (part.grain !== "length") ops.push({ op: "set_grain", part: { node: first }, grain: part.grain });
    if (part.bom?.length) ops.push({ op: "set_bom", part: { node: first }, bom: part.bom });
  }
  ops.push({ op: "make_component", items, name });
  return { name: "Generate cabinet", ops };
}

/** The cut list, the nesting and every sheet's DXF (4 x 4 sheets, CNC spacing). */
async function dxfOf(parts: Part[], name: string, metric: boolean) {
  const d = await doc();
  d.apply_named_batch(JSON.stringify(generate(parts, name)));
  const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
  d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * IN, 48 * IN).op));
  const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
  d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(metric) } }));
  const n = JSON.parse(d.nest("{}")) as Nesting;
  const st = JSON.parse(d.state_json()) as DocState;
  const m = await measureNest(
    {
      faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[],
      outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][],
      cutList: async (o) => JSON.parse(d.cut_list(JSON.stringify(o))),
    },
    st.graph.objects,
    n,
  );
  const list = JSON.parse(d.cut_list("{}")) as CutList;
  return { d, n, m, list, files: n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", m.features, { piece: i })) };
}

/** Each part outline's size in a set of DXFs, millimetres, short side first. */
function outlines(files: string[]) {
  type E = { type: string; layer: string; vertices?: { x: number; y: number }[] };
  return files
    .flatMap((f) => (new DxfParser().parseSync(f) as unknown as { entities: E[] }).entities.filter((e) => e.layer === "PROFILE_THRU"))
    .map((e) => {
      const xs = e.vertices!.map((v) => v.x);
      const ys = e.vertices!.map((v) => v.y);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].sort((a, b) => a - b);
    });
}
const sorted = (v: readonly number[]) => [...v].sort((a, b) => a - b);

run("end panels, fillers and skins through the kernel", () => {
  it("each is a part of its own in the cut list and the DXF: its size, material and grain", async () => {
    for (const metric of [false, true]) {
      const s: Sizes = {
        ...applyPreset(defaults(metric), "base", metric),
        endLeft: "panel",
        endStock: "doors",
        endBand: "frontBottom",
        band: true,
        bandCarcass: "1",
        endRight: "scribe",
        fillerRight: metric ? 50 * MM : 3 * IN,
        endScribe: metric ? 20 * MM : 0.75 * IN,
        kickSkin: "carcass",
        endDown: "floor",
      };
      const planned = planCabinet(s, metric);
      expect(planned.error).toBeNull();
      const { n, m, list, files, d } = await dxfOf(planned.parts, s.name, metric);
      expect(n.unplaced).toEqual([]);
      expect(m.skipped).toEqual([]);
      const T = s.thickness;
      const u = metric ? MM : IN;
      const want: Record<string, { size: number[]; material: string }> = {
        // The panel: the side's thickness; the box's depth, plus the doors' in front and the scribe
        // allowance behind; down to the floor; less a 1 mm band on its front and bottom edges.
        "Left end panel": { size: [T, T + s.depth + s.endScribe - 1 * MM, s.height - 1 * MM], material: "Door plywood" },
        // The scribe filler: its width plus the scribe allowance, above the toe kick.
        "Right filler": { size: [T, (metric ? 70 : 3.75) * u, s.height - s.toeKick], material: "Door plywood" },
        // The skin: under the cabinet and the filler (to its width as scribed), the kick's height.
        "Toe kick skin": { size: [T, s.toeKick, s.width + (metric ? 50 : 3) * u], material: "Cabinet plywood" },
      };
      for (const [name, w] of Object.entries(want)) {
        const row = list.rows.find((r) => r.name === name);
        expect(row, `${metric} ${name}`).toBeDefined();
        const size = sorted(w.size);
        row!.size.forEach((v, k) => expect(v, `${metric} ${name} ${k}`).toBeCloseTo(size[k], 9));
        expect(row!.material).toBe(w.material);
        // Grain along the part's length: up the panel and the filler, along the skin.
        expect(row!.grain, name).toBe("length");
        expect(row!.qty).toBe(1);
        // Drawn at that size.
        expect(outlines(files).some(([a, b]) => Math.abs(a - size[1] / MM) < 1e-6 && Math.abs(b - size[2] / MM) < 1e-6), `${metric} ${name} in the DXF`).toBe(true);
      }
      // The shopping list counts the panel's band by the metre, with the cabinet's own.
      const shop = shoppingList(list, JSON.parse(d.nest("{}")) as Nesting);
      const band = shop.rows.find((r) => r.category === "banding");
      const all = planned.parts.flatMap((p) => (p.bom ?? []).filter((b) => b.unit === "m").map((b) => b.qty * p.copies.length)).reduce((a, b) => a + b, 0);
      const panel = planned.parts.find((p) => p.name === "Left end panel")!.bom![0].qty;
      expect(panel).toBeGreaterThan(0);
      expect(band?.need).toBeCloseTo(all, 9);
    }
  }, 120_000);

  it("a base frame's toe-kick skins export with it, along their length", async () => {
    const s = { ...applyPreset(defaults(false), "base", false), base: "none" as const, height: 30.5 * IN, openRight: "dw-ge" as const, openRightWidth: 24 * IN };
    const a: Cab = { id: 1, name: "A", width: s.width, depth: s.depth, height: s.height, world: IDENTITY, ends: trimEnds(s) };
    const b: Cab = { id: 2, name: "B", width: s.width, depth: s.depth, height: s.height, world: placeNext(a, s, "right") };
    const p = planBase([a, b], { ...baseDefaults(false), skin: "doors" }, undefined, { thickness: s.thickness, material: "Door plywood" });
    expect(p.error).toBeNull();
    const { list, files } = await dxfOf(p.parts, "Base frame 1", false);
    const row = list.rows.find((r) => r.name === "Toe kick skin")!;
    // Two ladders, one each side of the opening, each 24 in: one part, two copies.
    expect(row.qty).toBe(2);
    sorted([s.thickness, 4 * IN, 24 * IN]).forEach((v, k) => expect(row.size[k]).toBeCloseTo(v, 9));
    expect([row.material, row.grain]).toEqual(["Door plywood", "length"]);
    // Drawn: the two skins, beside the four rails of the same face (two ladders, a front and a back rail each).
    expect(outlines(files).filter(([x, y]) => Math.abs(x - 4 * 25.4) < 1e-6 && Math.abs(y - 24 * 25.4) < 1e-6).length).toBe(6);
    const bare = await dxfOf(planBase([a, b], baseDefaults(false)).parts, "Base frame 1", false);
    expect(outlines(bare.files).filter(([x, y]) => Math.abs(x - 4 * 25.4) < 1e-6 && Math.abs(y - 24 * 25.4) < 1e-6).length).toBe(4);
  }, 60_000);

  it("unused, the CNC files are the same to the byte, whatever the row-feature settings at rest say", async () => {
    for (const metric of [false, true]) {
      const s = applyPreset(defaults(metric), "mixed", metric);
      const plain = await dxfOf(plan(s, metric).parts, s.name, metric);
      // Settings that only matter once a side, an opening or a skin is picked.
      const rest: Sizes = { ...s, endStock: "doors", endDown: "box", endFront: "carcass", endBand: "frontTopBottom", endScribe: 0.03, fillerLeft: 0.1, fillerRight: 0.2, openLeftWidth: 0.5, openRightWidth: 0.6 };
      const same = await dxfOf(planCabinet(rest, metric).parts, s.name, metric);
      // A skin on a cabinet with no toe kick has nothing to cover.
      const noKick = await dxfOf(planCabinet({ ...s, base: "none" }, metric).parts, s.name, metric);
      const noKickSkin = await dxfOf(planCabinet({ ...s, base: "none", kickSkin: "doors" }, metric).parts, s.name, metric);
      expect(plain.files.length).toBeGreaterThan(0);
      expect(same.files).toEqual(plain.files);
      expect(noKickSkin.files).toEqual(noKick.files);
      // ... and they do change once a side is picked.
      const on = await dxfOf(planCabinet({ ...s, endLeft: "panel" }, metric).parts, s.name, metric);
      expect(on.files).not.toEqual(plain.files);
    }
  }, 120_000);
});
