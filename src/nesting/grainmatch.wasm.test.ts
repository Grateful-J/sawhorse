// @vitest-environment node
// Grain-matched fronts through the real kernel: the Cabinet generator's four-drawer base with
// grain matching on, generated with the ops main.js's addParts sends (set_together on each
// front), nested on 4 x 4 plywood with the CNC router spacing. The fronts must come out as one
// block on one sheet: in the order they stand, a kerf apart exactly, lined up, their grain one
// way; each front's holes measured on that front and drawn inside it in the DXF; and each
// front's top edge against the front above it, so the grain runs on up the cabinet. Needs
// `npm run wasm`; skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import DxfParser from "dxf-parser";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, flatImportOp, MATERIALS, plan, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { MATCH_KEY } from "../../plugins/cabinet-generator/match.js";
import type { DocState, FaceInfo, Nesting, Placement, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { defaultShop } from "../cam/store";
import { nestingDxf } from "./dxf";
import { jobSheet } from "./jobsheet";
import { partLabels } from "./partlabels";
import { measureNest } from "./measure";
import { sheetSetOps } from "./sheetset";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;
const IN = 0.0254;

type Doc = {
  apply_op(json: string): string;
  apply_named_batch(json: string): string;
  cut_list(o: string): string;
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

/** The ops main.js's addParts sends (grain, hardware, keep together), then the cabinet's component. */
function generate(parts: Part[], name: string, at: V3) {
  const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
  const ops: Record<string, unknown>[] = [flatImportOp(parts, at, Object.values(MATERIALS))];
  const items: unknown[] = [];
  let k = 0;
  for (const part of parts) {
    const first = ref(k);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
    if (part.grain !== "length") ops.push({ op: "set_grain", part: { node: first }, grain: part.grain });
    if (part.bom?.length) ops.push({ op: "set_bom", part: { node: first }, bom: part.bom });
    if (part.together) ops.push({ op: "set_together", part: { node: first }, together: part.together });
  }
  ops.push({ op: "make_component", items, name });
  return { name: "Generate cabinet", ops };
}

/** Cabinets generated side by side, on 4 x 4 plywood with the CNC spacing; their nesting. */
async function nested(cabinets: Sizes[]) {
  const d = await doc();
  let x = 0;
  for (const s of cabinets) {
    const p = plan(s, false);
    expect(p.error).toBeNull();
    d.apply_named_batch(JSON.stringify(generate(p.parts, s.name, [x, 0, 0])));
    x += s.width + 0.1;
  }
  const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
  d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * IN, 48 * IN).op));
  const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
  d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(false) } }));
  const n = JSON.parse(d.nest("{}")) as Nesting;
  const st = JSON.parse(d.state_json()) as DocState;
  const measured = await measureNest(
    { faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[], outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][] },
    st.graph.objects,
    n,
  );
  return { d, n, measured };
}

/** A four-drawer base, pulls near the top of each front (so a front's top can be told), its
 * drawer faces' grain as given, grain matching on. */
function fourDrawers(grainFronts: "vertical" | "horizontal", name = "Base 1"): Sizes {
  return { ...applyPreset(defaults(false), "drawers", false), name, drawers: 4, drawerPull: "top", grainFronts, grainMatch: true };
}

/** Each block's fronts (by key and sheet: one cabinet's), in their order, with the sheet they are on. */
function blocks(n: Nesting) {
  const out = new Map<string, { piece: number; q: Placement }[]>();
  n.pieces.forEach((p, piece) => {
    for (const q of p.placements) {
      if (!q.together) continue;
      const k = `${q.together.key}:${piece}`;
      out.set(k, [...(out.get(k) ?? []), { piece, q }]);
    }
  });
  for (const v of out.values()) v.sort((a, b) => a.q.together!.n - b.q.together!.n);
  return [...out.values()];
}

run("grain-matched fronts through the kernel", () => {
  for (const [grain, stack] of [
    ["vertical", "along"],
    ["horizontal", "across"],
  ] as const) {
    it(`four drawer fronts, grain ${grain}: one block, in order, a kerf apart, each with its own holes, tops toward the front above`, async () => {
      const s = fourDrawers(grain);
      const { n, measured } = await nested([s]);
      expect(n.unplaced).toEqual([]);
      expect(measured.skipped).toEqual([]);
      const fronts = n.pieces.flatMap((p, piece) => p.placements.filter((q) => q.name === "Drawer front").map((q) => ({ piece, q })));
      expect(fronts).toHaveLength(4);
      // Every front in the block, on one sheet, in the cabinet's order.
      const bs = blocks(n);
      expect(bs).toHaveLength(1);
      const b = bs[0];
      expect(b.map(({ q }) => q.together)).toEqual([0, 1, 2, 3].map((i) => ({ key: MATCH_KEY, index: i, n: i + 1, of: 4, stack })));
      expect(new Set(b.map(({ piece }) => piece)).size).toBe(1);
      const sheet = n.pieces[b[0].piece];
      expect(sheet.saw ?? false).toBe(false);
      const kerf = sheet.kerf;
      expect(kerf).toBeCloseTo(0.375 * IN, 12);
      // Along the grain (x, the sheet's length) when it runs up the cabinet; across it (y) when
      // across. The kerf to a nanometre; lined up on the near edge; each turned alike.
      const alongX = stack === "along";
      for (let i = 1; i < b.length; i++) {
        const [p, q] = [b[i - 1].q, b[i].q];
        if (alongX) {
          expect(Math.abs(q.x - (p.x + p.dx + kerf))).toBeLessThan(1e-9);
          expect(q.y).toBe(p.y);
        } else {
          expect(Math.abs(q.y - (p.y + p.dy + kerf))).toBeLessThan(1e-9);
          expect(q.x).toBe(p.x);
        }
        expect(q.turned).toBe(p.turned);
        expect(q.grain).toBe(p.grain);
      }
      // The grain runs along the sheet's grain (its length, x) for every front.
      for (const { q } of b) expect(q.grain === "width" ? q.turned : !q.turned).toBe(true);
      // Each front's two pull holes: measured on that front, the drawerPullFromTop (1 1/2 in)
      // from its top edge. Which edge is the top tells whether the fronts meet on the sheet as
      // they meet in the cabinet: the block runs from its corner (low) in index order, so when
      // the index runs down the cabinet each top must be low (its bottom faces the next front,
      // the one below), and when it runs up each top must be high.
      const planned = plan(s, false).parts.filter((p) => p.together).sort((a, b) => a.together!.index - b.together!.index);
      const down = planned[1].copies[0].at[2] < planned[0].copies[0].at[2];
      // Vertical grain from the top front down, grain across from the bottom front up (match.js).
      expect(down).toBe(stack === "along");
      const fromTop = 1.5 * IN;
      for (let i = 0; i < b.length; i++) {
        const q = b[i].q;
        const f = measured.features.get(q.tag)!;
        const pulls = f.drills.filter((h) => h.through);
        expect(pulls).toHaveLength(2);
        // The stack's axis on the sheet, and where along it each hole sits in this front.
        const len = alongX ? q.dx : q.dy;
        const at = pulls.map((h) => (alongX ? h.center[0] : h.center[1]));
        // Both holes one distance from one end: the top.
        expect(Math.abs(at[0] - at[1])).toBeLessThan(1e-9);
        const nearLow = Math.abs(at[0] - fromTop) < 1e-6;
        const nearHigh = Math.abs(len - at[0] - fromTop) < 1e-6;
        expect(nearLow !== nearHigh).toBe(true);
        expect({ front: i, top: nearLow ? "low" : "high" }).toEqual({ front: i, top: down ? "low" : "high" });
      }
      // The DXF: every hole a circle, each inside its own front's outline.
      const dxf = nestingDxf(n, "lwpolyline", measured.features, { piece: b[0].piece });
      const parsed = new DxfParser().parseSync(dxf)!;
      const circles = parsed.entities.filter((e) => e.type === "CIRCLE") as unknown as { center: { x: number; y: number }; layer: string }[];
      const mm = (m: number) => m * 1000;
      const H = mm(sheet.width);
      for (const { q } of b) {
        // The sheet's y runs down in the file: y_file = width - y.
        const inside = circles.filter((c) => c.layer.includes("THRU") && c.center.x > mm(q.x) && c.center.x < mm(q.x + q.dx) && H - c.center.y > mm(q.y) && H - c.center.y < mm(q.y + q.dy));
        expect(inside.length).toBe(measured.features.get(q.tag)!.drills.filter((h) => h.through).length);
      }
      // The job sheet and the labels: each front once, by its own tag, on its sheet.
      const js = jobSheet({ n, index: b[0].piece, measured, shop: defaultShop(), units: "sixteenth", file: "sheet.dxf", ownerOf: () => s.name, all: n });
      expect(js.parts.map((p) => p.tag).sort()).toEqual(sheet.placements.map((q) => q.tag).sort());
      const labels = partLabels([js]);
      for (const { q } of b) expect(labels.filter((l) => l.tag === q.tag)).toHaveLength(1);
    }, 60_000);
  }

  it("a drawer over a door, the grain vertical on both: one block, the drawer front of the door's plywood, top first", async () => {
    const s: Sizes = { ...applyPreset(defaults(false), "mixed", false), name: "Base 2", doors: "one", drawers: 1, drawerPull: "top", doorPull: "vertical", doorPullFrom: "top", grainDoors: "vertical", grainFronts: "vertical", grainMatch: true };
    const { n, measured } = await nested([s]);
    expect(n.unplaced).toEqual([]);
    const bs = blocks(n);
    expect(bs).toHaveLength(1);
    expect(bs[0].map(({ q }) => q.name)).toEqual(["Drawer front", "Door"]);
    const sheet = n.pieces[bs[0][0].piece];
    expect(sheet.material).toBe(MATERIALS.doors.name);
    const [p, q] = [bs[0][0].q, bs[0][1].q];
    expect(Math.abs(q.x - (p.x + p.dx + sheet.kerf))).toBeLessThan(1e-9);
    // One width across: the stack lined up on both edges.
    expect(q.y).toBe(p.y);
    expect(q.dy).toBeCloseTo(p.dy, 12);
    // Both tops toward the block's corner: the drawer front's bottom edge meets the door's top.
    const topLow = (pl: Placement, fromTop: number) => {
      const at = measured.features.get(pl.tag)!.drills.filter((h) => h.through).map((h) => h.center[0]);
      expect(at.length).toBe(2);
      const [lo, hi] = [Math.min(...at), Math.max(...at)];
      if (Math.abs(lo - fromTop) < 1e-6) return true;
      expect(Math.abs(pl.dx - hi - fromTop)).toBeLessThan(1e-6);
      return false;
    };
    expect(topLow(p, s.drawerPullFromTop)).toBe(true);
    expect(topLow(q, s.doorPullEnd)).toBe(true);
    // The door's hinge cups are still on the door.
    expect(measured.features.get(q.tag)!.drills.filter((h) => Math.round(h.diameter * 1e4) === 350)).toHaveLength(2);
  }, 60_000);

  it("two cabinets: a block each; off, the fronts are nested on their own and nothing says otherwise", async () => {
    const { n } = await nested([fourDrawers("vertical", "Base 1"), fourDrawers("vertical", "Base 2")]);
    expect(n.unplaced).toEqual([]);
    const placed = n.pieces.flatMap((p) => p.placements.filter((q) => q.together));
    expect(placed).toHaveLength(8);
    expect(placed.filter((q) => q.together!.n === 1)).toHaveLength(2);
    const off = await nested([{ ...fourDrawers("vertical"), grainMatch: false }]);
    expect(off.n.pieces.flatMap((p) => p.placements).some((q) => q.together)).toBe(false);
    // Off, the identical fronts are one part of four copies, as before.
    const fronts = off.n.pieces.flatMap((p) => p.placements.filter((q) => q.name === "Drawer front"));
    expect(new Set(fronts.map((q) => q.row)).size).toBe(1);
  }, 60_000);
});
