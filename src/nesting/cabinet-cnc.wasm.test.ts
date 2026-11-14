// @vitest-environment node
// The cabinet generator's parts all the way to the router, through the real kernel: generate
// a drawer-over-door base and a drawer base with the defaults (blind dados, hardware drilled),
// nest them on 4 x 4 plywood with the CNC router spacing, measure the cuts and write a DXF per
// sheet. Every Blum hole must come out as a circle at its true size and depth, on the face the
// router cuts, and nothing may be left out. Needs `npm run wasm`; skipped without the kernel
// unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, flatImportOp, importOp, MATERIALS, plan } from "../../plugins/cabinet-generator/cabinet.js";
import type { DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { nestingDxf } from "./dxf";
import { measureNest } from "./measure";
import { sheetSetOps } from "./sheetset";
import { spacingProblem, thicknessMismatches } from "./cnc";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;

type Doc = {
  apply_op(json: string): string;
  cut_list(o: string): string;
  undo(): void;
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

run("a cabinet to the CNC router", () => {
  it("drawer-over-door base and drawer base: every hole a circle at its Blum size, nothing left out", async () => {
    const d = await doc();
    let x = 0;
    for (const id of ["mixed", "drawers"]) {
      const s = applyPreset(defaults(false), id, false);
      const p = plan(s, false);
      expect(p.error).toBeNull();
      const op = importOp(p.parts, [x, 0, 0], `${s.name}`, s.name, Object.values(MATERIALS));
      d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [op] }));
      x += s.width + 0.1;
    }
    const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * 0.0254, 48 * 0.0254).op));
    const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(false) } }));
    const n = JSON.parse(d.nest("{}")) as Nesting;
    expect(n.unplaced).toEqual([]);
    expect(thicknessMismatches(n)).toEqual([]);
    expect(spacingProblem(n, "sixteenth")).toBeNull();

    const st = JSON.parse(d.state_json()) as DocState;
    const measured = await measureNest(
      {
        faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[],
        outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][],
      },
      st.graph.objects,
      n,
    );
    expect(measured.skipped).toEqual([]);
    // At the frameless 23 1/4 in depth a cabinet's two sides share a 4 x 4 sheet (10 sheets in all;
    // 12 at 24 in deep).
    expect(n.pieces.length).toBeLessThanOrEqual(10);
    expect(n.pieces.filter((p) => p.placements.some((q) => q.name === "Left side") && p.placements.some((q) => q.name === "Right side"))).toHaveLength(2);

    const byName = new Map<string, ReturnType<typeof measured.features.get>[]>();
    for (const piece of n.pieces) for (const q of piece.placements) byName.set(q.name, [...(byName.get(q.name) ?? []), measured.features.get(q.tag)]);
    const drills = (name: string) => (byName.get(name) ?? []).flatMap((f) => f?.drills ?? []);
    const mm = (m: number) => Math.round(m * 1e4) / 10;

    // The door: two 35 x 13 cups from the face the router cuts, and the pull through.
    const door = drills("Door");
    expect(door.filter((h) => mm(h.diameter) === 35 && mm(h.depth) === 13)).toHaveLength(2);
    // Pull holes 3/16 in (4.8 mm), for 8-32 screws.
    expect(door.filter((h) => h.through && Math.abs(h.diameter - (3 / 16) * 0.0254) < 1e-6)).toHaveLength(2);
    // The hinge side: two plates, 5 x 11.5, on the up face with the dados.
    const left = drills("Left side");
    expect(left.filter((h) => mm(h.diameter) === 5 && mm(h.depth) === 11.5).length).toBeGreaterThanOrEqual(4);
    expect(left.filter((h) => mm(h.diameter) === 5 && mm(h.depth) === 13).length).toBeGreaterThanOrEqual(3);
    // Each drawer back: the runners' two rear hook holes, 6 x 10, as drills (no jig).
    const backs = (byName.get("Drawer back") ?? []).filter(Boolean);
    expect(backs.length).toBeGreaterThan(0);
    for (const f of backs) expect(f!.drills.filter((h) => mm(h.diameter) === 6 && mm(h.depth) === 10)).toHaveLength(2);

    // A file per sheet with each hole a CIRCLE on its own layer.
    const all = n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", measured.features, { piece: i })).join("\n");
    for (const layer of ["PROFILE_THRU", "DRILL_D35MM_13MM", "DRILL_D5MM_11.5MM", "DRILL_D5MM_13MM", "DRILL_D6MM_10MM", "DRILL_D4.76MM_THRU", "POCKET_6.35MM"]) expect(all).toContain(layer);
    expect(all.split("\nCIRCLE\n").length - 1).toBe([...measured.features.values()].reduce((k, f) => k + f.drills.length + f.flip.drills.length, 0));
   }, 60_000);

  it("sink base, trash pull-out and a base with an adjustable shelf: stretchers, pin holes, and nothing cut from both faces", async () => {
    const d = await doc();
    let x = 0;
    for (const id of ["sink", "trash", "base"]) {
      const s = applyPreset(defaults(false), id, false);
      const p = plan(s, false);
      expect(p.error).toBeNull();
      d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [x, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
      x += s.width + 0.1;
    }
    const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * 0.0254, 48 * 0.0254).op));
    const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(false) } }));
    const n = JSON.parse(d.nest("{}")) as Nesting;
    expect(n.unplaced).toEqual([]);
    const st = JSON.parse(d.state_json()) as DocState;
    const measured = await measureNest(
      { faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[], outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][] },
      st.graph.objects,
      n,
    );
    expect(measured.skipped).toEqual([]);
    // The trash back's frame goes through a slot, so no part needs a second setup.
    expect(measured.flipped).toEqual([]);
    const names = n.pieces.flatMap((p) => p.placements.map((q) => q.name));
    expect(names).toEqual(expect.arrayContaining(["Front stretcher", "Rear stretcher", "Bin frame"]));
    const of = (name: string) => n.pieces.flatMap((p) => p.placements.filter((q) => q.name === name).map((q) => measured.features.get(q.tag)));
    const back = of("Drawer back")[0]!;
    expect(back.cutouts).toHaveLength(1);
    expect(back.drills.filter((h) => Math.round(h.diameter * 1e4) === 60)).toHaveLength(2);
    const all = n.pieces.map((_, i) => nestingDxf(n, "lwpolyline", measured.features, { piece: i })).join("\n");
    for (const layer of ["DRILL_D5MM_10MM", "CUTOUT_THRU", "DRILL_D6MM_10MM"]) expect(all).toContain(layer);
    // Eight-sided pin rings still come out as 5 mm circles.
    const pins = [...measured.features.values()].flatMap((f) => f.drills).filter((h) => Math.abs(h.depth - 0.01) < 1e-6 && h.diameter < 0.0055);
    expect(pins.length).toBeGreaterThan(0);
    for (const h of pins) expect(h.diameter).toBeCloseTo(0.005, 9);
  }, 60_000);

  it("the generator's batch: parts imported flat, each one's grain set, wrapped in one cabinet; and rebuilt from inside it", async () => {
    const d = await doc();
    const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
    /** The ops main.js sends (with the kernel's placeholders): import, grains, component, name. */
    const ops = (parts: ReturnType<typeof plan>["parts"], inside: number[] | null) => {
      const out: Record<string, unknown>[] = [flatImportOp(parts, [0, 0, 0], inside ? [] : Object.values(MATERIALS))];
      let k = 0;
      const items: unknown[] = [];
      for (const part of parts) {
        if (part.grain !== "length") out.push({ op: "set_grain", part: { node: ref(k) }, grain: part.grain });
        for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
      }
      if (inside) {
        out.push({ op: "make_group", items: inside.map((node) => ({ node })) });
        out.push({ op: "delete_node", node: { $ref: out.length - 1, path: "group" } });
      } else out.push({ op: "make_component", items, name: "Base 1" });
      return out;
    };
    const s = applyPreset(defaults(false), "mixed", false);
    const p = plan(s, false);
    const made = JSON.parse(d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: ops(p.parts, null) })));
    const cab = made.outcomes[made.outcomes.length - 1].instance as number;
    const rows = () => (JSON.parse(d.cut_list("{}")) as { rows: { name: string; grain: string }[] }).rows;
    const grain = (name: string) => rows().find((r) => r.name === name)?.grain;
    expect(grain("Door")).toBe("length");
    expect(grain("Drawer front")).toBe("length");
    expect(grain("Left side")).toBe("length");
    for (const n of ["Bottom", "Toe kick", "Back", "Front stretcher", "Rear stretcher", "Drawer side", "Drawer bottom"]) expect(grain(n)).toBe("none");
    const st = JSON.parse(d.state_json()) as DocState;
    expect(st.undo_depth).toBe(1);
    expect(st.graph.nodes.filter((n) => n.parent === null).map((n) => n.id)).toEqual([cab]);

    // Opened (double-clicked) and rebuilt with two shelves from inside: the same cabinet.
    d.apply_op(JSON.stringify({ op: "set_context", node: cab }));
    const kids = st.graph.nodes.filter((n) => n.parent === cab).map((n) => n.id);
    const p2 = plan({ ...s, shelves: 2 }, false);
    d.apply_named_batch(JSON.stringify({ name: "Update cabinet", ops: ops(p2.parts, kids) }));
    const st2 = JSON.parse(d.state_json()) as DocState;
    expect(st2.graph.nodes.filter((n) => n.parent === null).map((n) => n.id)).toEqual([cab]);
    expect(st2.graph.objects.length).toBe(st.graph.objects.length + 1);
    expect(grain("Toe kick")).toBe("none");
    expect(st2.undo_depth).toBe(2);
  }, 60_000);
});

