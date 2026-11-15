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
import { baseDefaults, IDENTITY, placeNext, planBase, type Cab } from "../../plugins/cabinet-generator/row.js";
import type { DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import DxfParser from "dxf-parser";
import { nestingDxf, pocketOvercut } from "./dxf";
import { measureNest } from "./measure";
import { sheetSetOps } from "./sheetset";
import { handWork, handWorkText, routerShare, sawShare, spacingProblem, thicknessMismatches } from "./cnc";
import { overflowOps } from "./sheetset";

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
/** What the app hands `measureNest`: the kernel's faces, outlines and cut list. */
const measurer = (d: Doc) => ({
  faces: async (o: number) => JSON.parse(d.faces_json(o)) as FaceInfo[],
  outline: async (_k: string, owner: number, index: number) => JSON.parse(d.outline("face", owner, index)) as V3[][],
  cutList: async (o: unknown) => JSON.parse(d.cut_list(JSON.stringify(o))),
});
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

    // The drawer-over-door base has a pair of doors (one door that wide breaks Blum's rule that
    // the hinges be farther apart than the door is wide). Each: two 35 x 13 cups from the face
    // the router cuts, and the pull through.
    expect(byName.get("Door")).toBeUndefined();
    for (const name of ["Left door", "Right door"]) {
      const door = drills(name);
      expect(door.filter((h) => mm(h.diameter) === 35 && mm(h.depth) === 13)).toHaveLength(2);
      // Pull holes 3/16 in (4.8 mm), for 8-32 screws.
      expect(door.filter((h) => h.through && Math.abs(h.diameter - (3 / 16) * 0.0254) < 1e-6)).toHaveLength(2);
    }
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

  it("a row's base frame: rails that fit a 4 x 4 sheet, a dado for every sleeper cut from one face, nothing left out", async () => {
    const d = await doc();
    const IN = 0.0254;
    // 24, 18 and 36 in cabinets side by side: a 78 in row, two ladders (42 and 36 in).
    const row: Cab[] = [];
    for (const w of [24, 18, 36]) {
      const size = { width: w * IN, depth: 23.25 * IN };
      row.push({ id: row.length + 1, name: `Cab ${row.length + 1}`, ...size, height: 30.5 * IN, world: row.length ? placeNext(row[row.length - 1], size, "right") : IDENTITY });
    }
    const b = baseDefaults(false);
    const p = planBase(row, b);
    expect(p.error).toBeNull();
    d.apply_named_batch(JSON.stringify({ name: "Base frame", ops: [importOp(p.parts, p.at, "Base frame 1", "Base frame 1", Object.values(MATERIALS))] }));
    const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * IN, 48 * IN).op));
    const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(false) } }));
    const n = JSON.parse(d.nest("{}")) as Nesting;
    expect(n.unplaced).toEqual([]);
    expect(thicknessMismatches(n)).toEqual([]);
    expect(spacingProblem(n, "sixteenth")).toBeNull();
    // Strips: one 4 x 4 sheet holds the whole frame.
    expect(n.pieces).toHaveLength(1);
    const st = JSON.parse(d.state_json()) as DocState;
    const measured = await measureNest(
      { faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[], outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][] },
      st.graph.objects,
      n,
    );
    expect(measured.skipped).toEqual([]);
    expect(measured.flipped).toEqual([]);
    const placements = n.pieces.flatMap((q) => q.placements);
    // Every rail: a pocket per sleeper on the face up, 1/4 in deep, 23/32 + 0.008 wide; sleepers plain.
    const sleepersIn = new Map<string, number>();
    for (const q of placements) {
      const f = measured.features.get(q.tag);
      // A plain blank has nothing to measure beyond its profile.
      if (q.name === "Base sleeper") {
        expect(f?.pockets ?? []).toEqual([]);
        continue;
      }
      expect(q.name).toMatch(/^Base (front|back) rail$/);
      expect(f).toBeDefined();
      if (!f) continue;
      expect(f.flip.pockets).toEqual([]);
      for (const k of f.pockets) expect(k.depth).toBeCloseTo(0.25 * IN, 9);
      sleepersIn.set(q.name, (sleepersIn.get(q.name) ?? 0) + f.pockets.length);
    }
    expect(sleepersIn.get("Base front rail")).toBe(p.sleepers);
    expect(sleepersIn.get("Base back rail")).toBe(p.sleepers);
    const all = nestingDxf(n, "lwpolyline", measured.features, { piece: 0 });
    expect(all).toContain("PROFILE_THRU");
    expect(all).toMatch(/POCKET_6\.35MM/);
  }, 60_000);

  it("mixed: a tall pantry's long parts go to the track saw on 4 x 8, the rest stays on the 4 x 4 CNC, the saw's dados and holes are hand work", async () => {
    const d = await doc();
    const IN = 0.0254;
    let x = 0;
    for (const id of ["tall", "base"]) {
      const s = applyPreset(defaults(false), id, false);
      const p = plan(s, false);
      expect(p.error).toBeNull();
      d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [x, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
      x += s.width + 0.1;
    }
    const lib = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(sheetSetOps(lib, 48 * IN, 48 * IN).op));
    const lib2 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib2.settings, ...cncSettings(false) } }));
    // CNC only: the pantry's 84 in sides, back and doors are on no stock.
    const before = JSON.parse(d.nest("{}")) as Nesting;
    const long = before.unplaced.map((u) => u.name);
    expect(long).toEqual(expect.arrayContaining(["Left side", "Right side", "Back"]));
    expect(before.unplaced.every((u) => u.reason === "too_large")).toBe(true);

    // The switch the Nesting section sends: 4 x 8 sheets added, the saw set, one undo step.
    const lib3 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(overflowOps(lib3, true, false).op));
    const n = JSON.parse(d.nest("{}")) as Nesting;
    expect(n.unplaced).toEqual([]);
    const saw = n.pieces.filter((p) => p.saw);
    expect(saw.length).toBeGreaterThan(0);
    for (const p of saw) {
      expect(p.stock.startsWith("4 x 8")).toBe(true);
      expect(p.guillotine).toBe(true);
      expect(p.kerf).toBeCloseTo(IN / 8, 12);
      expect(p.trim).toBeCloseTo(IN / 4, 12);
      // Every part the saw takes is one the 4 x 4 could not.
      for (const q of p.placements) expect(long).toContain(q.name);
    }
    for (const p of n.pieces.filter((p) => !p.saw)) expect(p.stock.startsWith("4 x 4")).toBe(true);
    // The router's files: its sheets only, spaced for the bit, nothing too thick or thin.
    const cnc = routerShare(n);
    expect(cnc.pieces.every((p) => !p.saw)).toBe(true);
    expect(spacingProblem(n, "sixteenth")).toBeNull();
    expect(thicknessMismatches(cnc)).toEqual([]);
    const st = JSON.parse(d.state_json()) as DocState;
    const m = { faces: async (o: number) => JSON.parse(d.faces_json(o)) as FaceInfo[], outline: async (_k: string, owner: number, index: number) => JSON.parse(d.outline("face", owner, index)) as V3[][] };
    const routed = await measureNest(m, st.graph.objects, cnc);
    expect(routed.skipped).toEqual([]);
    const files = cnc.pieces.map((_, i) => nestingDxf(cnc, "lwpolyline", routed.features, { piece: i }));
    expect(files).toHaveLength(cnc.pieces.length);
    // The saw's parts: the pantry sides' dados and runner-free holes, measured, listed by hand.
    const sawn = await measureNest(m, st.graph.objects, sawShare(n));
    expect(sawn.skipped).toEqual([]);
    const work = handWork(n, sawn.features, "sixteenth");
    const side = work.find((w) => w.name === "Left side");
    expect(side).toBeDefined();
    // The back's groove and the top's and bottom's blind dados; 10 hinge-plate holes (five
    // hinges on an 84 in door) and 40 shelf-pin holes; and its toe-kick notch.
    expect([side!.pockets, side!.holes, side!.cutouts, side!.shaped]).toEqual([3, 50, 0, true]);
    expect(side!.lines.filter((l) => l.includes("5 mm × 11.5 mm deep"))).toEqual([expect.stringMatching(/^10 holes /)]);
    expect(side!.lines.filter((l) => l.includes("5 mm × 10 mm deep"))).toEqual([expect.stringMatching(/^40 holes /)]);
    // The hinge plates are 37 mm (1 29/64 in) in from the front edge.
    expect(side!.lines.find((l) => l.includes("11.5 mm"))).toMatch(/^10 holes 5 mm × 11\.5 mm deep at \(6 15\/16, 1 29\/64\)/);
    // Each line places its cut inside the part (84 x 23 1/4 in).
    for (const line of side!.lines.filter((l) => l.startsWith("Pocket"))) expect(line).toMatch(/from end A, .* from edge B$/);
    // Off again: the saw is gone and the long parts are on no stock, as before.
    const lib4 = (JSON.parse(d.nest("{}")) as Nesting).library;
    d.apply_op(JSON.stringify(overflowOps(lib4, false, false).op));
    const off = JSON.parse(d.nest("{}")) as Nesting;
    expect(off.pieces.some((p) => p.saw)).toBe(false);
    expect(off.unplaced.map((u) => u.tag).sort()).toEqual(before.unplaced.map((u) => u.tag).sort());
    expect(off.hash).toBe(before.hash);
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
    expect(grain("Left door")).toBe("length");
    expect(grain("Right door")).toBe("length");
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

  /** One preset, nested on 4 x 4 with the CNC spacing, standing turned `deg` about the vertical. */
  const nested = async (preset: string, deg: number, metric = false) => {
    const d = await doc();
    const s = applyPreset(defaults(metric), preset, metric);
    const p = plan(s, metric);
    expect(p.error).toBeNull();
    const a = (deg * Math.PI) / 180;
    const at = { linear: [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]], translation: [0.3, -0.2, 0] as V3 };
    d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, at, s.name, s.name, Object.values(MATERIALS))] }));
    const side = metric ? 1.22 : 48 * 0.0254;
    d.apply_op(JSON.stringify(sheetSetOps((JSON.parse(d.nest("{}")) as Nesting).library, side, side).op));
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...(JSON.parse(d.nest("{}")) as Nesting).library.settings, ...cncSettings(metric) } }));
    const n = JSON.parse(d.nest("{}")) as Nesting;
    const st = JSON.parse(d.state_json()) as DocState;
    return { d, n, st };
  };
  type Cut = { kind: string; nums: number[]; pts: [number, number][] };
  /** Every cut of every part, by tag and name, with the blank's size: a list to compare. */
  const cuts = (n: Nesting, m: Awaited<ReturnType<typeof measureNest>>) => {
    const out = new Map<string, { dx: number; dy: number; cuts: Cut[] }>();
    for (const q of n.pieces.flatMap((p) => p.placements)) {
      const f = m.features.get(q.tag);
      const list: Cut[] = [];
      if (f) {
        if (f.profile) list.push({ kind: "profile", nums: [], pts: f.profile });
        for (const k of f.pockets) list.push({ kind: "pocket", nums: [k.depth], pts: k.loop });
        for (const h of f.drills) list.push({ kind: h.through ? "through" : "drill", nums: [h.diameter, h.depth], pts: [h.center] });
        for (const c of f.cutouts) list.push({ kind: "cutout", nums: [], pts: c });
        for (const k of f.flip.pockets) list.push({ kind: "flip pocket", nums: [k.depth], pts: k.loop });
        for (const h of f.flip.drills) list.push({ kind: "flip drill", nums: [h.diameter, h.depth], pts: [h.center] });
      }
      // Along the sheet and across it, whichever way the nester turned the part.
      out.set(`${q.tag} ${q.name}`, { dx: q.turned ? q.dy : q.dx, dy: q.turned ? q.dx : q.dy, cuts: q.turned ? list.map((c) => ({ ...c, pts: c.pts.map(([u, v]) => [v, u] as [number, number]) })) : list });
    }
    return out;
  };
  const TOL = 1e-7;
  /** The same cut: its kind, its sizes, and the same corners in any order, within a tenth of a micron. */
  const sameCut = (a: Cut, b: Cut) =>
    a.kind === b.kind &&
    a.nums.length === b.nums.length &&
    a.nums.every((x, i) => Math.abs(x - b.nums[i]) <= TOL) &&
    a.pts.length === b.pts.length &&
    a.pts.every((p) => b.pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= TOL));
  /** Every cut of `a` is one of `b`'s and the other way round. */
  const sameCuts = (a: Cut[], b: Cut[]) => {
    if (a.length !== b.length) return false;
    const left = [...b];
    for (const c of a) {
      const i = left.findIndex((x) => sameCut(c, x));
      if (i < 0) return false;
      left.splice(i, 1);
    }
    return true;
  };
  /**
   * The parts that are not cut the same in `got` as in `want`. A part may lie either way round
   * in its rectangle (turned half a turn: the same part), but never as its mirror image.
   * A part turned on its sheet by the nester has its length across the sheet in both.
   */
  const differ = (got: ReturnType<typeof cuts>, want: ReturnType<typeof cuts>) => {
    const out: string[] = [];
    if ([...got.keys()].sort().join("|") !== [...want.keys()].sort().join("|")) return ["the parts are not the same"];
    for (const [name, w] of want) {
      const g = got.get(name)!;
      if (Math.abs(g.dx - w.dx) > TOL || Math.abs(g.dy - w.dy) > TOL) {
        out.push(`${name}: its blank`);
        continue;
      }
      const half = g.cuts.map((c) => ({ ...c, pts: c.pts.map(([u, v]) => [g.dx - u, g.dy - v] as [number, number]) }));
      if (!sameCuts(g.cuts, w.cuts) && !sameCuts(half, w.cuts)) out.push(name);
    }
    return out;
  };

  it("a cabinet standing at any angle is cut exactly as one standing square: every dado, groove and hole", async () => {
    for (const preset of ["base", "drawers"]) {
      const square = await nested(preset, 0);
      const want = await measureNest(measurer(square.d), square.st.graph.objects, square.n);
      expect(want.skipped).toEqual([]);
      const total = [...want.features.values()].reduce((k, f) => k + f.pockets.length + f.drills.length, 0);
      expect(total).toBeGreaterThan(30);
      for (const deg of [30, 45, 0.5, 213]) {
        const { d, n, st } = await nested(preset, deg);
        expect(n.unplaced).toEqual([]);
        const got = await measureNest(measurer(d), st.graph.objects, n);
        expect(got.skipped).toEqual([]);
        expect(got.flipped).toEqual([]);
        expect(differ(cuts(n, got), cuts(square.n, want))).toEqual([]);
        // The comparison can fail: a part drawn as its mirror image is not the same part.
        const flipped = cuts(n, got);
        const side = [...flipped.keys()].find((k) => k.endsWith("Left side"));
        if (side) {
          const g = flipped.get(side)!;
          flipped.set(side, { ...g, cuts: g.cuts.map((c) => ({ ...c, pts: c.pts.map(([u, v]) => [g.dx - u, v] as [number, number]) })) });
          expect(differ(flipped, cuts(square.n, want))).toEqual([side]);
        }
        // Without the cut list's directions the parts cannot be placed on their blanks: every
        // part with a cut is named, none is written as a bare rectangle without a word.
        const blind = await measureNest({ faces: measurer(d).faces, outline: measurer(d).outline }, st.graph.objects, n);
        expect(blind.features.size).toBe(0);
        const cut = n.pieces.flatMap((p) => p.placements).filter((q) => want.features.has(q.tag)).map((q) => q.name);
        expect([...blind.skipped].sort()).toEqual([...new Set(cut)].sort());
      }
    }
  }, 120_000);

  it("a dado or groove that runs out of a part is drawn past its edge: in the waste, short of the next part, inside the sheet", async () => {
    type E = { type: string; layer: string; vertices?: { x: number; y: number }[] };
    for (const metric of [false, true]) {
      for (const preset of ["base", "drawers", "mixed"]) {
        const { d, n, st } = await nested(preset, 0, metric);
        const m = await measureNest(measurer(d), st.graph.objects, n);
        expect(m.skipped).toEqual([]);
        let open = 0;
        n.pieces.forEach((piece, i) => {
          const e = pocketOvercut(piece) * 1000;
          expect(e).toBeGreaterThan(4.5);
          const all = (new DxfParser().parseSync(nestingDxf(n, "lwpolyline", m.features, { piece: i, overcut: true })) as unknown as { entities: E[] }).entities;
          const box = (x: E) => ({ x0: Math.min(...x.vertices!.map((v) => v.x)), x1: Math.max(...x.vertices!.map((v) => v.x)), y0: Math.min(...x.vertices!.map((v) => v.y)), y1: Math.max(...x.vertices!.map((v) => v.y)) });
          const parts = all.filter((x) => x.layer === "PROFILE_THRU").map(box);
          expect(parts).toHaveLength(piece.placements.length);
          const W = piece.width * 1000;
          const L = piece.length * 1000;
          const gap = piece.kerf * 1000;
          for (const pocket of all.filter((x) => x.layer.startsWith("POCKET_")).map(box)) {
            // Its own part: the one it overlaps by more than a sliver.
            const own = parts.filter((b) => Math.min(pocket.x1, b.x1) - Math.max(pocket.x0, b.x0) > 1 && Math.min(pocket.y1, b.y1) - Math.max(pocket.y0, b.y0) > 1);
            expect(own).toHaveLength(1);
            const b = own[0];
            const out = [b.x0 - pocket.x0, pocket.x1 - b.x1, b.y0 - pocket.y0, pocket.y1 - b.y1];
            // Out of the part by the overcut exactly, or not at all.
            for (const o of out) expect(o <= 1e-6 || Math.abs(o - e) <= 1e-6).toBe(true);
            if (out.some((o) => o > 1e-6)) open += 1;
            // Inside the sheet, and more than half the gap from every other part.
            expect(pocket.x0).toBeGreaterThanOrEqual(-1e-6);
            expect(pocket.y0).toBeGreaterThanOrEqual(-1e-6);
            expect(pocket.x1).toBeLessThanOrEqual(L + 1e-6);
            expect(pocket.y1).toBeLessThanOrEqual(W + 1e-6);
            for (const other of parts) {
              if (other === b) continue;
              const apart = Math.max(other.x0 - pocket.x1, pocket.x0 - other.x1, other.y0 - pocket.y1, pocket.y0 - other.y1);
              expect(apart).toBeGreaterThan(gap / 2);
            }
          }
        });
        // The sides' rail dados run out at the rear; the bottom's and the stretchers' grooves at both ends.
        expect(open).toBeGreaterThanOrEqual(4);
      }
    }
    // The default base's left side: the bottom's dado stops 1/2 in from the front as drawn, and
    // runs 3/16 in less 0.25 mm past the rear edge.
    const { d, n, st } = await nested("base", 0);
    const m = await measureNest(measurer(d), st.graph.objects, n);
    const pi = n.pieces.findIndex((p) => p.placements.some((q) => q.name === "Left side"));
    const q = n.pieces[pi].placements.find((x) => x.name === "Left side")!;
    const f = m.features.get(q.tag)!;
    const dados = f.pockets.filter((k) => Math.abs(k.depth - 0.25 * 0.0254) < 1e-9);
    expect(dados).toHaveLength(2);
    for (const k of dados) {
      const vs = k.loop.map((v) => v[1]);
      expect(Math.min(...vs)).toBeCloseTo(0.5 * 0.0254, 9);
      expect(Math.max(...vs)).toBeCloseTo(q.dy, 9);
    }
  }, 120_000);
});

// The hand work list of the track saw's parts, and the sheets a metric document gets, through
// the real kernel. What the list says is checked against the model itself (the kernel's faces
// of the solid), and against the drawing of the sheet, not against the list's own wording.
run("the track saw's hand work and metric sheets, through the kernel", () => {
  const IN = 0.0254;
  const MM = 0.001;
  type Dx = { type: string; layer: string; vertices?: { x: number; y: number }[]; center?: { x: number; y: number } };

  /**
   * A tall pantry nested on 4 x 4 with the track saw on, and its saw parts measured. With
   * `across`, the 3/4 in 4 x 8 lies the other way (48 long, 96 wide, no grain), so the nester
   * has to turn the 84 in sides: they are drawn with their length down the sheet.
   */
  const pantry = async (across: boolean) => {
    const d = await doc();
    const s = applyPreset(defaults(false), "tall", false);
    const p = plan(s, false);
    expect(p.error).toBeNull();
    d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [0, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
    const nest = () => JSON.parse(d.nest("{}")) as Nesting;
    d.apply_op(JSON.stringify(sheetSetOps(nest().library, 48 * IN, 48 * IN).op));
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest().library.settings, ...cncSettings(false) } }));
    d.apply_op(JSON.stringify(overflowOps(nest().library, true, false).op));
    if (across) {
      const sheet = nest().library.stocks.find((x) => x.name === "4 x 8 sheet, 3/4")!;
      d.apply_op(JSON.stringify({ op: "define_stock", stock: { ...sheet, length: sheet.width, width: sheet.length, grain: "none" }, replace: sheet.name }));
    }
    const n = nest();
    expect(n.unplaced).toEqual([]);
    const st = JSON.parse(d.state_json()) as DocState;
    const sawn = await measureNest(measurer(d), st.graph.objects, sawShare(n));
    expect(sawn.skipped).toEqual([]);
    return { d, n, st, sawn, s };
  };

  /** A list's number in metres: "6 15/16", "3/4", "84". */
  const inches = (text: string) => text.trim().split(" ").reduce((x, part) => x + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part)), 0) * IN;
  /** Every (A, B) of a line of holes, metres. */
  const centres = (line: string) => [...line.matchAll(/\(([^,()]+), ([^()]+)\)/g)].map((m) => [inches(m[1]), inches(m[2])] as [number, number]);
  /** Half a 64th: what a position rounded to the nearest 1/64 in may be off by. */
  const ROUND = IN / 128 + 1e-9;

  it("the pantry's Left side: the hinge plates are 37 mm from its front edge, measured from the corner the list says, turned or not", async () => {
    const lists: string[][] = [];
    for (const across of [false, true]) {
      const { d, n, st, sawn, s } = await pantry(across);
      const pi = n.pieces.findIndex((p) => p.placements.some((x) => x.name === "Left side"));
      const piece = n.pieces[pi];
      expect(piece.saw).toBe(true);
      const q = piece.placements.find((x) => x.name === "Left side")!;
      expect(q.turned).toBe(across);

      // --- The model. The side's box, and where the cabinet's front and bottom are: the door
      // stands in front of the side's front edge, the toe kick is at its bottom end.
      const rows = (JSON.parse(d.cut_list(JSON.stringify({ rounding: "sixteenth", visible_only: false }))) as { rows: { name: string; occurrences: { center: V3; size: V3; axes: [V3, V3, V3] }[] }[] }).rows;
      const at = (name: string) => rows.find((r) => r.name === name)!.occurrences[0];
      const side = at("Left side");
      // Its thickness is along x, its width (the cabinet's depth) along y, its length up z.
      expect(side.axes.map((a) => a.map((v) => Math.round(v * 1e9) / 1e9 + 0))).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      const [t, D, H] = side.size;
      const y0 = side.center[1] - D / 2;
      const z0 = side.center[2] - H / 2;
      expect(at("Door").center[1]).toBeLessThan(y0);
      expect(at("Toe kick").center[2]).toBeLessThan(z0 + s.toeKick + 1e-9);
      expect(at("Toe kick").center[2]).toBeLessThan(side.center[2]);
      // The hinge plates' holes, from the kernel's faces of the solid: their floors look into
      // the cabinet (+x) 11.5 mm under the inside face. Each is 37 mm from the front edge.
      const ids = "object" in q.item ? [q.item.object] : st.graph.objects.filter((o) => o.parent === (q.item as { node: number }).node).map((o) => o.id);
      const floors = ids.flatMap((id) => JSON.parse(d.faces_json(id)) as FaceInfo[]).filter((f) => Math.abs(f.normal[0] - 1) < 1e-9 && Math.abs(f.origin[0] - (side.center[0] + t / 2 - 11.5 * MM)) < 1e-6);
      expect(floors).toHaveLength(10);
      const model = floors.map((f) => ({ front: f.centroid[1] - y0, bottom: f.centroid[2] - z0 })).sort((a, b) => a.bottom - b.bottom);
      for (const h of model) expect(h.front).toBeCloseTo(37 * MM, 6);

      // --- The list. Ten holes, each 37 mm (1 29/64 in) from edge B, as far from end A as the
      // model's hole is from the side's bottom: end A is the bottom, edge B the front edge. The
      // side is not its mirror image (that would be B from the back, or A from the top alone).
      const work = handWork(n, sawn.features, "sixteenth");
      const w = work.find((x) => x.name === "Left side")!;
      expect(w.turned).toBe(across);
      const line = w.lines.find((l) => l.includes("5 mm × 11.5 mm deep"))!;
      expect(line).toMatch(/^10 holes 5 mm × 11\.5 mm deep at \(6 15\/16, 1 29\/64\)/);
      const listed = centres(line);
      expect(listed).toHaveLength(10);
      listed.forEach(([a, b], k) => {
        expect(Math.abs(a - model[k].bottom)).toBeLessThanOrEqual(ROUND);
        expect(Math.abs(b - model[k].front)).toBeLessThanOrEqual(ROUND);
        // Never the mirror image: 37 mm from the back edge is 21 51/64 in from edge B.
        expect(Math.abs(b - (D - model[k].front))).toBeGreaterThan(0.5);
      });
      // The toe-kick notch is in the list too, at the same corner: the bottom end, the front edge.
      expect(w.lines).toContain("Notch through, 4 × 3, cut out of the outline: 0 to 4 from end A, 0 to 3 from edge B");
      expect([s.toeKick / IN, s.toeSetback / IN].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([4, 3]);

      // --- The drawing. In the sheet's drawing (the DXF: x to the right, y up) end A is the
      // part's left end and edge B its top edge; turned, its top end and its right edge.
      const all = (new DxfParser().parseSync(nestingDxf(n, "lwpolyline", sawn.features, { piece: pi })) as unknown as { entities: Dx[] }).entities;
      const holes = all.filter((x) => x.type === "CIRCLE" && x.layer === "DRILL_D5MM_11.5MM").map((x) => x.center!);
      expect(holes).toHaveLength(10);
      const outlines = all.filter((x) => x.layer === "PROFILE_THRU").map((x) => ({ x0: Math.min(...x.vertices!.map((v) => v.x)), x1: Math.max(...x.vertices!.map((v) => v.x)), y0: Math.min(...x.vertices!.map((v) => v.y)), y1: Math.max(...x.vertices!.map((v) => v.y)) }));
      const box = outlines.find((b) => holes.every((h) => h.x > b.x0 && h.x < b.x1 && h.y > b.y0 && h.y < b.y1))!;
      expect(box).toBeDefined();
      const drawn = holes.map((h) => (across ? [box.y1 - h.y, box.x1 - h.x] : [h.x - box.x0, box.y1 - h.y]).map((mm) => mm * MM) as [number, number]).sort((a, b) => a[0] - b[0]);
      listed.forEach(([a, b], k) => {
        expect(Math.abs(a - drawn[k][0])).toBeLessThanOrEqual(ROUND);
        expect(Math.abs(b - drawn[k][1])).toBeLessThanOrEqual(ROUND);
      });
      const text = handWorkText("Pantry", work, "sixteenth");
      expect(text).toContain("In the sheet's diagram end A is the part's left end and edge B its top edge. For a part");
      expect(text).toContain("drawn turned (its length down the sheet), end A is its top end and edge B its right edge.");
      expect(text).toContain(`${w.tag} Left side (Sheet 1 of 1 · 4 x 8 sheet, 3/4 · Cabinet plywood)${across ? " (drawn turned)" : ""}`);
      lists.push(w.lines);
    }
    // One rule for every part: the list is the same however the nester laid the side.
    expect(lists[1]).toEqual(lists[0]);
  }, 120_000);

  it("the pantry side's top end: a strip across the top and a strip along the rear edge, not the box around them; the right side is the left's mirror", async () => {
    const { n, sawn } = await pantry(false);
    const work = handWork(n, sawn.features, "sixteenth");
    const left = work.find((x) => x.name === "Left side")!;
    const right = work.find((x) => x.name === "Right side")!;
    // The top's dado (the 23/32 in stock and its clearance, to the part's end) across the
    // side from its 1/2 in stop to the rear edge, joined to the top nailer's dado along the
    // rear edge: 3 in long, as wide as the nailer is thick, behind the back's groove.
    expect(left.lines).toContain("Pocket, 1/4 deep, in 2 rectangles that join: 23/32 × 22 3/4 at 83 9/32 to 84 from end A, 1/2 to 23 1/4 from edge B; 3 × 23/32 at 80 9/32 to 83 9/32 from end A, 22 17/32 to 23 1/4 from edge B");
    // The bottom's dado is one rectangle (the back's groove through it is cut deeper anyway),
    // its width and its edges agreeing; the back's groove is the third pocket.
    expect(left.lines).toContain("Pocket 47/64 × 22 3/4, 1/4 deep: 4 to 4 47/64 from end A, 1/2 to 23 1/4 from edge B");
    expect(left.lines.filter((l) => l.startsWith("Pocket"))).toHaveLength(3);
    expect(left.pockets).toBe(3);
    // Nothing tells the reader to rout the box around the L away.
    for (const w of [left, right]) expect(w.lines.join("\n")).not.toMatch(/3 23\/32 × 22 3\/4/);
    // The right side: every shelf pin hole where the left's is, counted from the other end.
    const pins = (w: typeof left) => centres(w.lines.find((l) => l.includes("5 mm × 10 mm deep"))!);
    const L = 84 * IN;
    const mirrored = pins(left).map(([a, b]) => [L - a, b] as [number, number]);
    expect(pins(right)).toHaveLength(40);
    for (const [a, b] of pins(right)) expect(mirrored.some(([x, y]) => Math.abs(x - a) <= 2 * ROUND && Math.abs(y - b) <= 2 * ROUND)).toBe(true);
    expect(right.lines).toContain("Notch through, 4 × 3, cut out of the outline: 80 to 84 from end A, 0 to 3 from edge B");
    // The door: its pull holes are 3/16 in, said both ways.
    const door = work.find((x) => x.name === "Door")!;
    expect(door.lines.some((l) => /^2 holes 4\.76 mm \(3\/16 in\) through at /.test(l))).toBe(true);
  }, 120_000);

  it("a metric cabinet nests on metric sheets: nothing drawn at a thickness its sheet is not, nothing on no stock", async () => {
    const metricDoc = async (preset: string) => {
      const d = await doc();
      const s = applyPreset(defaults(true), preset, true);
      const p = plan(s, true);
      expect(p.error).toBeNull();
      d.apply_named_batch(JSON.stringify({ name: "Generate cabinet", ops: [importOp(p.parts, [0, 0, 0], s.name, s.name, Object.values(MATERIALS))] }));
      return d;
    };
    const nest = (d: Doc) => JSON.parse(d.nest("{}")) as Nesting;
    // The default base cabinet, 18, 12 and 6 mm: "Use 4 x 4 plywood", then CNC spacing.
    const d = await metricDoc("base");
    const set = sheetSetOps(nest(d).library, 48 * IN, 48 * IN, true);
    expect(set.added).toEqual(["1220 x 1220 sheet, 18 mm", "1220 x 1220 sheet, 12 mm", "1220 x 1220 sheet, 6 mm"]);
    d.apply_op(JSON.stringify(set.op));
    d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest(d).library.settings, ...cncSettings(true) } }));
    const n = nest(d);
    expect(n.settings.sheetSize).toEqual({ width: 1.22, length: 1.22 });
    expect(n.unplaced).toEqual([]);
    expect(thicknessMismatches(n)).toEqual([]);
    expect(n.pieces.every((p) => p.stock.startsWith("1220 x 1220 sheet, "))).toBe(true);
    expect(new Set(n.pieces.map((p) => Math.round(p.thickness * 1000)))).toEqual(new Set([18, 6]));
    // Again: nothing to add.
    expect(sheetSetOps(n.library, 48 * IN, 48 * IN, true).added).toEqual([]);
    // What it did before (the inch sheets, 18.26 and 5.56 mm): every part named as a mismatch.
    const old = await metricDoc("base");
    old.apply_op(JSON.stringify(sheetSetOps(nest(old).library, 1.22, 1.22).op));
    old.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest(old).library.settings, ...cncSettings(true) } }));
    expect(thicknessMismatches(nest(old)).length).toBeGreaterThan(0);

    // The tall pantry with the track saw on: 1220 x 2440 at 18, 12 and 6 mm for what the
    // 1220 x 1220 cannot take, by name and by thickness.
    const tall = await metricDoc("tall");
    tall.apply_op(JSON.stringify(sheetSetOps(nest(tall).library, 48 * IN, 48 * IN, true).op));
    tall.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...nest(tall).library.settings, ...cncSettings(true) } }));
    expect(nest(tall).unplaced.map((u) => u.name)).toEqual(expect.arrayContaining(["Left side", "Right side"]));
    const saw = overflowOps(nest(tall).library, true, true);
    expect(saw.added).toEqual(["1220 x 2440 sheet, 18 mm", "1220 x 2440 sheet, 12 mm", "1220 x 2440 sheet, 6 mm"]);
    tall.apply_op(JSON.stringify(saw.op));
    const m = nest(tall);
    expect(m.unplaced).toEqual([]);
    expect(thicknessMismatches(m)).toEqual([]);
    const sawn = m.pieces.filter((p) => p.saw);
    expect(sawn.length).toBeGreaterThan(0);
    expect(sawn.every((p) => p.stock.startsWith("1220 x 2440 sheet, "))).toBe(true);
    expect(sawn.flatMap((p) => p.placements.map((q) => q.name))).toEqual(expect.arrayContaining(["Left side", "Right side"]));
    expect(m.pieces.filter((p) => !p.saw).every((p) => p.stock.startsWith("1220 x 1220 sheet, "))).toBe(true);
    expect(m.library.stocks.some((x) => /8\.01|3\/4 \(2\)/.test(x.name))).toBe(false);
  }, 120_000);
});
