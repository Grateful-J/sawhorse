// @vitest-environment node
// Dowels, Confirmat screws and full-height line boring, all the way to the router through the
// real kernel: a wall cabinet (a full top, two adjustable shelves, hinged doors) generated with
// each joinery, nested on 4 x 4 plywood with the CNC spacing (the app's own CNC files path),
// measured, one DXF per sheet, and each sheet's job sheet. The sides' joint holes must come out
// as circles at their size and depth on their own layer (DRILL_D8MM_11MM, DRILL_D7MM_THRU), cut
// from the face the router cuts, with nothing left out; the rails' edge holes are for a jig and
// are in no file; the job sheet must list exactly the DXF's layers, each with a bit. Needs
// `npm run wasm`; skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, importOp, MATERIALS, normalize, plan, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import type { DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { defaultShop } from "../cam/store";
import { nestingDxf } from "./dxf";
import { measureNest, type MeasuredNest } from "./measure";
import { overflowOps, sheetSetOps } from "./sheetset";
import { cncFileName, routerShare } from "./cnc";
import { jobSheet, jobSheetText } from "./jobsheet";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;

type Doc = {
  apply_op(json: string): string;
  apply_named_batch(json: string): string;
  nest(o: string): string;
  state_json(): string;
  faces_json(object: number): string;
  outline(kind: string, owner: number, index: number): string;
  cut_list(o: string): string;
};
async function doc(): Promise<Doc> {
  const mod = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as { initSync(o: { module: Buffer }): void; document_new(): Doc };
  mod.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  return mod.document_new();
}

const IN = 0.0254;
const mm = (m: number) => Math.round(m * 1e4) / 10;

/** The layer table of a DXF: every name after "0 LAYER / 2", but layer 0. */
function layerNames(text: string): string[] {
  return [...text.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]).filter((l) => l !== "0");
}

/** A cabinet's router sheets, measured, and its files and job sheets, as the CNC files button makes them. */
async function cut(s: Sizes, metric: boolean) {
  const d = await doc();
  const p = plan(s, metric);
  expect(p.error).toBeNull();
  d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [0, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
  const nest = () => JSON.parse(d.nest("{}")) as Nesting;
  d.apply_op(JSON.stringify(sheetSetOps(nest().library, 48 * IN, 48 * IN, metric).op));
  d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest().library.settings, ...cncSettings(metric) } }));
  d.apply_op(JSON.stringify(overflowOps(nest().library, true, metric).op));
  const all = nest();
  expect(all.unplaced).toEqual([]);
  const n = routerShare(all);
  const st = JSON.parse(d.state_json()) as DocState;
  const measured: MeasuredNest = await measureNest(
    {
      faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[],
      outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][],
      cutList: async (o) => JSON.parse(d.cut_list(JSON.stringify(o))),
    },
    st.graph.objects,
    n,
  );
  expect(measured.skipped).toEqual([]);
  // Every joint hole is in the face the router cuts: no part needs a second setup.
  expect(measured.flipped).toEqual([]);
  const files = n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", measured.features, { piece: i, overcut: true }));
  const shop = defaultShop();
  shop.profileTool = "seed-compression";
  const sheets = n.pieces.map((_, i) => jobSheet({ n, index: i, measured, shop, units: metric ? "half_mm" : "sixteenth", file: cncFileName("Kitchen", n, i, measured.features, () => s.name), ownerOf: () => s.name, all }));
  /** Each named part's drilled holes, as measured. */
  const drills = (name: string) => n.pieces.flatMap((piece) => piece.placements.filter((q) => q.name === name).flatMap((q) => measured.features.get(q.tag)?.drills ?? []));
  return { p, n, files, sheets, drills };
}

/** The wall preset with a full top (it has one) and the joinery asked for. */
const wall = (metric: boolean, o: Partial<Sizes>) => normalize({ ...applyPreset(defaults(metric), "wall", metric), ...o }, metric);

run("dowels, Confirmat screws and full-height line boring, through the real kernel", () => {
  for (const metric of [false, true]) {
    it(`${metric ? "metric" : "inch"}: dowels are 8 x 11 mm holes in the sides on DRILL_D8MM_11MM, no dados, and the job sheet lists the layer with a bit`, async () => {
      const { p, files, sheets, drills } = await cut(wall(metric, { fastener: "dowels" }), metric);
      // Wall cabinet: 12 in (300 mm) deep, so 3 dowels a joint (Häfele: up to 18 in); the top and
      // the bottom, so 6 a side.
      for (const side of ["Left side", "Right side"]) {
        const dowels = drills(side).filter((h) => mm(h.diameter) === 8);
        expect(dowels).toHaveLength(6);
        for (const h of dowels) {
          expect(mm(h.depth)).toBe(11);
          expect(h.through).toBeFalsy();
        }
      }
      // The rails' edge holes are for a jig: in no part's measured cuts.
      for (const rail of ["Top", "Bottom"]) expect(drills(rail)).toEqual([]);
      expect(p.rows.filter((r) => r[4] === "Jig")).toHaveLength(2);
      const layers = new Set(files.flatMap(layerNames));
      expect(layers.has("DRILL_D8MM_11MM")).toBe(true);
      // Blind dados off: the only pockets are the back's groove.
      expect([...layers].filter((l) => l.startsWith("POCKET_"))).toEqual([metric ? "POCKET_8MM" : "POCKET_7.94MM"]);
      expect(files.join("\n")).not.toContain("DRILL_D7MM_THRU");
      files.forEach((f, i) => {
        const js = sheets[i];
        expect(js.layers.map((l) => l.name)).toEqual(layerNames(f));
        for (const l of js.layers) if (l.cut) expect(l.tool, `${l.name}: no bit`).not.toBeNull();
        expect(js.order.flatMap((st) => st.layers).sort()).toEqual(js.layers.filter((l) => l.cut).map((l) => l.name).sort());
        if (layerNames(f).includes("DRILL_D8MM_11MM")) {
          const l = js.layers.find((x) => x.name === "DRILL_D8MM_11MM")!;
          expect(l.kind).toBe("hole");
          expect(jobSheetText(js, "Kitchen")).toContain("[ ] DRILL_D8MM_11MM");
        }
      });
      expect(sheets.some((js) => js.layers.some((l) => l.name === "DRILL_D8MM_11MM"))).toBe(true);
    }, 120_000);

    it(`${metric ? "metric" : "inch"}: Confirmat screws are 7 mm through holes in the sides on DRILL_D7MM_THRU, with no countersink`, async () => {
      const { files, sheets, drills } = await cut(wall(metric, { fastener: "confirmat" }), metric);
      for (const side of ["Left side", "Right side"]) {
        const holes = drills(side).filter((h) => mm(h.diameter) === 7);
        expect(holes).toHaveLength(6);
        for (const h of holes) expect(h.through).toBe(true);
        // No countersink: no 10 mm hole anywhere.
        expect(drills(side).filter((h) => mm(h.diameter) === 10)).toEqual([]);
      }
      for (const rail of ["Top", "Bottom"]) expect(drills(rail)).toEqual([]);
      const layers = new Set(files.flatMap(layerNames));
      expect(layers.has("DRILL_D7MM_THRU")).toBe(true);
      expect(layers.has("DRILL_D8MM_11MM")).toBe(false);
      files.forEach((f, i) => expect(sheets[i].layers.map((l) => l.name)).toEqual(layerNames(f)));
      const l = sheets.flatMap((js) => js.layers).find((x) => x.name === "DRILL_D7MM_THRU")!;
      expect(l.kind).toBe("hole");
      expect(l.tool).not.toBeNull();
    }, 120_000);

    it(`${metric ? "metric" : "inch"}: full-height line boring puts every planned pin hole in the file, 5 x 10 mm`, async () => {
      const s = wall(metric, { lineBoring: "full" });
      const { p, drills } = await cut(s, metric);
      const row = p.rows.find((r) => /^Shelf pin holes/.test(r[1]))!;
      const made = Number(/: (\d+)/.exec(row[1])![1]);
      const pins = ["Left side", "Right side"].flatMap((side) => drills(side).filter((h) => mm(h.diameter) === 5 && mm(h.depth) === 10));
      expect(pins).toHaveLength(made);
      // Far more than the five around each shelf: 2 shelves x 5 x 2 rows x 2 sides is 40.
      expect(made).toBeGreaterThan(40);
    }, 120_000);
  }
});
