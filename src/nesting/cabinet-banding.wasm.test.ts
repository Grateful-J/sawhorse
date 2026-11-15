// @vitest-environment node
// Edge banding through the real kernel: a banded cabinet and the same cabinet unbanded, made by
// the kernel from the plugin's import, read back face by face in the model's coordinates.
// - Every hole, dado, groove and notch is at the same absolute place in both: Blum measures the
//   cups and the 37 mm lines from the finished edge, and the band does not move them.
// - Each banded part's blank plus its bands is the unbanded part, on the edges it should be.
// - The cut list lists the blank; the nesting and the DXF draw it.
// - Off, nothing changes: the same DXF to the byte.
// - The shopping list counts the band by the metre.
// Every starting point, inch and metric, overlay and inset, Blum Inc. and Blum Europe, with
// bands of 0.45, 1, 2 and 3 mm. Needs `npm run wasm`; skipped without the kernel unless
// REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { applyPreset, defaults, EDGE_AXES, flatImportOp, importOp, MATERIALS, plan, PRESETS, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import type { CutList, DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { boxOf, cutKeys, cutsDiffer, overlap, type Box, type P3, type WorldFace } from "../plugins/bandingProof";
import { defaultShopPrefs, itemKey, priceList, shoppingList } from "../cutlist/shopping";
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

/** A cabinet's parts read back from the kernel, by copy name: each solid's faces (the model's
 * coordinates, less where the cabinet was put) and its box. */
type Read = Map<string, { faces: WorldFace[]; box: Box }>;
function readCabinets(d: Doc, at: Map<string, number>): Map<string, Read> {
  const st = JSON.parse(d.state_json()) as DocState;
  const nodes = st.graph.nodes;
  const out = new Map<string, Read>();
  for (const top of nodes.filter((n) => n.parent === null && n.name && at.has(n.name))) {
    const dx = at.get(top.name!)!;
    const parts: Read = new Map();
    for (const child of nodes.filter((n) => n.parent === top.id)) {
      const faces: WorldFace[] = [];
      for (const o of st.graph.objects.filter((x) => x.parent === child.id)) {
        for (const f of JSON.parse(d.faces_json(o.id)) as FaceInfo[]) {
          const rings = JSON.parse(d.outline("face", o.id, f.id)) as V3[][];
          // The outer ring: the one that spans the most.
          const outer = rings.reduce((a, r) => (boxSpan(r) > boxSpan(a) ? r : a), rings[0]);
          faces.push({ normal: f.normal as P3, points: outer.map((p) => [p[0] - dx, p[1], p[2]] as P3) });
        }
      }
      parts.set(child.name ?? child.label, { faces, box: boxOf(faces.flatMap((f) => f.points)) });
    }
    out.set(top.name!, parts);
  }
  return out;
}
const boxSpan = (r: V3[]) => {
  const b = boxOf(r as P3[]);
  return b.max[0] - b.min[0] + b.max[1] - b.min[1] + b.max[2] - b.min[2];
};

/** The edges a copy is banded on, with every kind banded: decided here, not read from the
 * planner. Doors and drawer fronts all round; the sides, the top, the bottom, the front stretcher
 * and every shelf at the front; nothing else. */
function expectedEdges(name: string): (keyof typeof EDGE_AXES)[] {
  if (/door$/i.test(name) || /^Drawer \d+ front$/.test(name)) return ["left", "right", "bottom", "top"];
  if (["Left side", "Right side", "Top", "Bottom", "Front stretcher"].includes(name) || /^Shelf \d+$/.test(name)) return ["front"];
  return [];
}

const SIZES = ["0.45", "1", "2", "3"] as const;
const THICK = { "0.45": 0.45 * MM, "1": 1 * MM, "2": 2 * MM, "3": 3 * MM };

/** A cabinet as the plugin makes it, and the same with each band: the boring distance 6 mm, so a
 * 3 mm band on the doors leaves 3 mm of wood beside the cups. */
const sizesFor = (id: string, metric: boolean, front: "overlay" | "inset", catalog: "us" | "eu"): Sizes => ({ ...applyPreset(defaults(metric), id, metric), front, catalog, cupDistance: 6 * MM });

/** The DXF of every sheet the cabinet nests on (4 x 4 sheets, CNC spacing), and the nesting. */
async function dxfOf(parts: Part[], name: string, metric: boolean) {
  const d = await doc();
  d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(parts, [0, 0, 0], name, name, Object.values(MATERIALS))] }));
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
  return { d, n, m, files: n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", m.features, { piece: i })) };
}

run("edge banding through the kernel", () => {
  // One test per starting point and unit: each overlay and inset, Blum Inc. and Blum Europe,
  // with bands of 0.45, 1, 2 and 3 mm.
  for (const metric of [false, true]) {
    for (const p of PRESETS) {
      it(`${p.label} (${metric ? "metric" : "inch"}): every hole, dado and notch at its unbanded place, and each blank plus its bands the unbanded part`, async () => {
        let compared = 0;
        for (const front of ["overlay", "inset"] as const) {
          for (const catalog of ["us", "eu"] as const) {
            // A document each: the kernel's import slows as a document fills. The cabinet, then
            // the same cabinet with each band, side by side.
            const d = await doc();
            const s = sizesFor(p.id, metric, front, catalog);
            const at = new Map<string, number>();
            [null, ...SIZES].forEach((size, i) => {
              const key = size ?? "plain";
              const planned = plan(size ? { ...s, band: true, band1Size: size } : s, metric);
              expect(planned.error, `${p.id} ${front} ${catalog} ${key}`).toBeNull();
              d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(planned.parts, [3 * i, 0, 0], key, key, Object.values(MATERIALS))] }));
              at.set(key, 3 * i);
            });
            const read = readCabinets(d, at);
            const plain = read.get("plain")!;
            for (const size of SIZES) {
              const banded = read.get(size)!;
              const label = `${p.id} ${metric ? "mm" : "in"} ${front} ${catalog} ${size} mm`;
              expect([...banded.keys()].sort(), label).toEqual([...plain.keys()].sort());
              const b = THICK[size];
              for (const [name, part] of banded) {
                const was = plain.get(name)!;
                // Every cut where it was.
                const clip = overlap(was.box, part.box);
                expect(cutsDiffer(cutKeys(was.faces, clip), cutKeys(part.faces, clip)), `${label} ${name}`).toBeNull();
                // The blank plus the bands, on the edges it should have them, is the part unbanded.
                const edges = expectedEdges(name);
                for (let k = 0; k < 3; k++) {
                  const lo = edges.some((e) => EDGE_AXES[e][0] === k && EDGE_AXES[e][1] === 0) ? b : 0;
                  const hi = edges.some((e) => EDGE_AXES[e][0] === k && EDGE_AXES[e][1] === 1) ? b : 0;
                  expect(Math.abs(part.box.min[k] - lo - was.box.min[k]), `${label} ${name} min ${k}`).toBeLessThan(1e-9);
                  expect(Math.abs(part.box.max[k] + hi - was.box.max[k]), `${label} ${name} max ${k}`).toBeLessThan(1e-9);
                }
                compared++;
              }
            }
          }
        }
        // Four cabinets, four bands each, every part of each (a cabinet has at least 8 parts).
        expect(compared).toBeGreaterThanOrEqual(4 * 4 * 8);
      }, 300_000);
    }
  }

  it("the cut list lists each banded part at its blank, and the DXF draws the blank", async () => {
    for (const metric of [false, true]) {
      for (const id of ["base", "mixed"]) {
        const s: Sizes = { ...applyPreset(defaults(metric), id, metric), band: true, bandCount: 2, band2Size: "3", bandFronts: "2", cupDistance: 6 * MM };
        const planned = plan(s, metric);
        expect(planned.error).toBeNull();
        const { d, n, m, files } = await dxfOf(planned.parts, s.name, metric);
        expect(n.unplaced).toEqual([]);
        expect(m.skipped).toEqual([]);
        // The cut list: each part's size is its blank's, sorted (thickness, width, length).
        const list = JSON.parse(d.cut_list("{}")) as CutList;
        for (const part of planned.parts) {
          const row = list.rows.find((r) => r.name === part.name && r.size.every((v, k) => Math.abs(v - [...part.blank].sort((a, b) => a - b)[k]) < 1e-9));
          expect(row, `${id} ${part.name}`).toBeDefined();
        }
        // Each door and drawer front is its blank in the DXF: 3 mm short of the finished front on each edge.
        type E = { type: string; layer: string; vertices?: { x: number; y: number }[] };
        const outlines = files.flatMap((f) => (new DxfParser().parseSync(f) as unknown as { entities: E[] }).entities.filter((e) => e.layer === "PROFILE_THRU"));
        const sizes = outlines.map((e) => {
          const xs = e.vertices!.map((v) => v.x);
          const ys = e.vertices!.map((v) => v.y);
          return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].sort((a, b) => a - b);
        });
        const has = (w: number, h: number) => sizes.some(([a, b]) => Math.abs(a - Math.min(w, h) / MM) < 1e-6 && Math.abs(b - Math.max(w, h) / MM) < 1e-6);
        for (const part of planned.parts.filter((x) => /door$/i.test(x.name) || x.name === "Drawer front")) {
          const [a, , c] = part.blank;
          expect(has(a, c), `${id} ${part.name} ${a} x ${c}`).toBe(true);
          expect(part.finished![0] - a).toBeCloseTo(6 * MM, 12);
          expect(part.finished![2] - c).toBeCloseTo(6 * MM, 12);
          // Not the finished size.
          expect(has(part.finished![0], part.finished![2])).toBe(false);
        }
        // Every outline is a part's blank, sized from the mesh the plugin sent.
        const blanks = planned.parts.flatMap((p) => p.copies.map(() => [...p.blank].sort((x, y) => x - y)));
        for (const [u, v] of sizes) expect(blanks.some((b) => (Math.abs(b[1] / MM - u) < 1e-6 && Math.abs(b[2] / MM - v) < 1e-6) || (Math.abs(b[0] / MM - u) < 1e-6 && Math.abs(b[2] / MM - v) < 1e-6) || (Math.abs(b[0] / MM - u) < 1e-6 && Math.abs(b[1] / MM - v) < 1e-6)), `${u} x ${v}`).toBe(true);
      }
    }
  }, 120_000);

  it("off, the CNC files are the same to the byte, whatever the band settings say", async () => {
    for (const metric of [false, true]) {
      const s = applyPreset(defaults(metric), "mixed", metric);
      const plain = await dxfOf(plan(s, metric).parts, s.name, metric);
      const off = await dxfOf(plan({ ...s, band: false, band1Size: "3", bandPremill: 2 * MM, bandFronts: "1" }, metric).parts, s.name, metric);
      const none = await dxfOf(plan({ ...s, band: true, bandFronts: "none", bandCarcass: "none", bandShelves: "none" }, metric).parts, s.name, metric);
      expect(plain.files.length).toBeGreaterThan(0);
      expect(off.files).toEqual(plain.files);
      expect(none.files).toEqual(plain.files);
      // ... and they do change when a band is on.
      const on = await dxfOf(plan({ ...s, band: true }, metric).parts, s.name, metric);
      expect(on.files).not.toEqual(plain.files);
    }
  }, 120_000);

  it("the shopping list counts each band by the metre over every copy, rounded to rolls when a roll length is set", async () => {
    const d = await doc();
    const s: Sizes = { ...applyPreset(defaults(false), "mixed", false), band: true, bandCount: 2, band2Size: "3", band2Name: "White PVC", bandFronts: "2", cupDistance: 6 * MM };
    const planned = plan(s, false);
    // The batch main.js sends: the parts flat, each part's bom through its first copy.
    const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
    const ops: Record<string, unknown>[] = [flatImportOp(planned.parts, [0, 0, 0], Object.values(MATERIALS))];
    let k = 0;
    const items: unknown[] = [];
    for (const part of planned.parts) {
      const first = ref(k);
      for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
      if (part.grain !== "length") ops.push({ op: "set_grain", part: { node: first }, grain: part.grain });
      if (part.bom?.length) ops.push({ op: "set_bom", part: { node: first }, bom: part.bom });
    }
    ops.push({ op: "make_component", items, name: s.name });
    d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops }));
    const list = JSON.parse(d.cut_list("{}")) as CutList;
    const shop = shoppingList(list, JSON.parse(d.nest("{}")) as Nesting);
    const banding = shop.rows.filter((r) => r.category === "banding");
    const want = new Map<string, number>();
    for (const p of planned.parts) for (const b of p.bom ?? []) if (b.unit === "m") want.set(b.item, (want.get(b.item) ?? 0) + b.qty * p.copies.length);
    expect(banding.map((r) => r.name).sort()).toEqual(["Edge banding, 1 mm x 15/16 in", "Edge banding, 3 mm x 15/16 in, White PVC"]);
    for (const r of banding) {
      expect(r.unit).toBe("m");
      expect(r.need).toBeCloseTo(want.get(r.name)!, 9);
    }
    // A 3 m roll: whole rolls, with the shopping list's own overage set to 0 (the band already
    // carries its waste).
    const thick = banding.find((r) => r.name.includes("3 mm"))!;
    const priced = priceList(shop, { ...defaultShopPrefs(), overage: { ...defaultShopPrefs().overage, banding: 0 }, packs: { [itemKey({ item: thick.name, unit: "m" })]: 3 } });
    const row = priced.rows.find((r) => r.name === thick.name)!;
    expect(row.buy.count).toBe(Math.ceil(want.get(thick.name)! / 3 - 1e-9));
  }, 60_000);
});
