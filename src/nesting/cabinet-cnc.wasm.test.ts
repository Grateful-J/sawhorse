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
import { handWork, routerShare, sawShare, spacingProblem, thicknessMismatches } from "./cnc";
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
