// @vitest-environment node
// The layer names the starting cabinets put in their CNC files, pinned. The CAM guides
// (docs/CAM-CARBIDE-CREATE.md, docs/CAM-VCARVE.md) list them, because a CAM template's toolpaths
// are linked to layer names and a depth is part of the name: a layer this test does not know
// is a layer no template has a toolpath for. When a name changes here, update both guides'
// "Templates and layer names: the safety rule" sections, then this list.
//
// Each Start from preset is generated with a new cabinet's settings, in an inch document and in
// a metric one, and taken through the app's own path: Use 4 x 4 plywood, CNC spacing, the track
// saw for what does not fit, the router's sheets only, measured, one DXF per sheet with the
// overcut on. Needs `npm run wasm`; skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { applyPreset, defaults, importOp, MATERIALS, plan, PRESETS } from "../../plugins/cabinet-generator/cabinet.js";
import type { DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { nestingDxf } from "./dxf";
import { measureNest } from "./measure";
import { overflowOps, sheetSetOps } from "./sheetset";
import { routerShare } from "./cnc";

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
};
async function doc(): Promise<Doc> {
  const mod = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as { initSync(o: { module: Buffer }): void; document_new(): Doc };
  mod.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  return mod.document_new();
}

const IN = 0.0254;

/** The layer table of a DXF: every name after "0 LAYER / 2". */
function layerNames(text: string): string[] {
  return [...text.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]);
}

/** The CNC files of one preset, as the app's CNC files button writes them. */
async function presetFiles(id: string, metric: boolean): Promise<string[]> {
  const d = await doc();
  const s = applyPreset(defaults(metric), id, metric);
  const p = plan(s, metric);
  expect(p.error, `${id}: the preset does not build`).toBeNull();
  d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [0, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
  const nest = () => JSON.parse(d.nest("{}")) as Nesting;
  d.apply_op(JSON.stringify(sheetSetOps(nest().library, 48 * IN, 48 * IN, metric).op));
  d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest().library.settings, ...cncSettings(metric) } }));
  d.apply_op(JSON.stringify(overflowOps(nest().library, true, metric).op));
  const all = nest();
  expect(all.unplaced, `${id}: parts on no stock`).toEqual([]);
  const n = routerShare(all);
  const st = JSON.parse(d.state_json()) as DocState;
  const measured = await measureNest(
    { faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[], outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][] },
    st.graph.objects,
    n,
  );
  expect(measured.skipped, `${id}: cuts left out`).toEqual([]);
  return n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", measured.features, { piece: i, overcut: true }));
}

type Box = [number, number, number, number];
/** Each closed shape's box, per layer. */
function boxes(text: string): Map<string, Box[]> {
  const parsed = new DxfParser().parseSync(text) as unknown as { entities: { type: string; layer: string; vertices?: { x: number; y: number }[]; center?: { x: number; y: number }; radius?: number }[] };
  const out = new Map<string, Box[]>();
  for (const e of parsed.entities) {
    let b: Box | null = null;
    if (e.type === "CIRCLE" && e.center && e.radius) b = [e.center.x - e.radius, e.center.y - e.radius, e.center.x + e.radius, e.center.y + e.radius];
    else if (e.vertices?.length) {
      const xs = e.vertices.map((v) => v.x);
      const ys = e.vertices.map((v) => v.y);
      b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    if (b) out.set(e.layer, [...(out.get(e.layer) ?? []), b]);
  }
  return out;
}
const within = (a: Box, b: Box) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

// The pinned lists. A change here is a change the CAM guides must show.
const INCH = [
  "CUTOUT_THRU",
  "DRILL_D35MM_13MM",
  "DRILL_D4.76MM_THRU",
  "DRILL_D5MM_10MM",
  "DRILL_D5MM_11.5MM",
  "DRILL_D5MM_13MM",
  "DRILL_D6MM_10MM",
  "LABELS",
  "POCKET_5.95MM",
  "POCKET_6.35MM",
  "POCKET_7.94MM",
  "PROFILE_THRU",
  "STOCK",
];
const METRIC = [
  "CUTOUT_THRU",
  "DRILL_D35MM_13MM",
  "DRILL_D5MM_10MM",
  "DRILL_D5MM_11.5MM",
  "DRILL_D5MM_13MM",
  "DRILL_D5MM_THRU",
  "DRILL_D6MM_10MM",
  "LABELS",
  "POCKET_6MM",
  "POCKET_8MM",
  "PROFILE_THRU",
  "STOCK",
];

run("the layer names the CAM guides list", () => {
  for (const [metric, pinned] of [
    [false, INCH],
    [true, METRIC],
  ] as const) {
    it(`${metric ? "metric" : "inch"} document: every starting cabinet's CNC layers`, async () => {
      const found = new Set<string>();
      const nested: string[] = [];
      const overlapping: string[] = [];
      for (const { id } of PRESETS as { id: string }[]) {
        const files = await presetFiles(id, metric);
        const mine = new Set<string>();
        for (const f of files) {
          for (const l of layerNames(f)) if (l !== "0") mine.add(l);
          for (const [layer, list] of boxes(f)) {
            if (layer === "STOCK" || layer === "LABELS") continue;
            for (let i = 0; i < list.length; i++)
              for (let j = 0; j < list.length; j++) {
                if (i === j) continue;
                if (within(list[i], list[j])) nested.push(`${id} ${layer}`);
                else if (i < j && overlap(list[i], list[j])) overlapping.push(`${id} ${layer}`);
              }
          }
        }
        for (const l of mine) found.add(l);
      }
      expect(
        [...found].sort(),
        `The starting cabinets' CNC layer names changed. Update the layer lists in docs/CAM-CARBIDE-CREATE.md and docs/CAM-VCARVE.md ("Templates and layer names: the safety rule"), then the ${metric ? "METRIC" : "INCH"} list in this test.`,
      ).toEqual(pinned);
      // No cut layer holds a shape inside another, or two shapes whose boxes overlap: Carbide
      // Create pockets nested shapes on one layer as islands, and the guides say these files
      // have none.
      expect([...new Set(nested)], "A CNC layer holds a shape inside another. The CAM guides say the starting cabinets never do: fix the export or the guides.").toEqual([]);
      expect([...new Set(overlapping)], "Two shapes on one CNC layer overlap. The CAM guides say the starting cabinets' never do: fix the export or the guides.").toEqual([]);
    }, 300_000);
  }
});
