// @vitest-environment node
// A sheet's job sheet through the real kernel: starting cabinets generated with a new cabinet's
// settings, taken through the app's own CNC files path (Use 4 x 4 plywood, CNC spacing, the
// track saw for what does not fit, the router's sheets only, measured), then each sheet's job
// sheet built with the built-in shop. Its layers must be the DXF's layers exactly, and the
// metric drawer box's 6.2 mm grooves must be flagged against a 1/4 in bit. Needs `npm run
// wasm`; skipped without the kernel unless REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, importOp, MATERIALS, plan } from "../../plugins/cabinet-generator/cabinet.js";
import type { DocState, FaceInfo, Nesting, V3 } from "../kernel/types";
import { cncSettings } from "../components/NestingSection";
import { defaultShop } from "../cam/store";
import { nestingDxf } from "./dxf";
import { measureNest, type MeasuredNest } from "./measure";
import { overflowOps, sheetSetOps } from "./sheetset";
import { cncFileName, routerShare } from "./cnc";
import { jobSheet, jobSheetText } from "./jobsheet";
import { winAnsi } from "../cutlist/pdf";

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

/** The layer table of a DXF: every name after "0 LAYER / 2", but layer 0. */
function layerNames(text: string): string[] {
  return [...text.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]).filter((l) => l !== "0");
}

/** A preset's router sheets, measured, as the CNC files button takes them. */
async function preset(id: string, metric: boolean): Promise<{ all: Nesting; n: Nesting; measured: MeasuredNest }> {
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
    {
      faces: async (o) => JSON.parse(d.faces_json(o)) as FaceInfo[],
      outline: async (_k, owner, index) => JSON.parse(d.outline("face", owner, index)) as V3[][],
      cutList: async (o) => JSON.parse(d.cut_list(JSON.stringify(o))),
    },
    st.graph.objects,
    n,
  );
  expect(measured.skipped, `${id}: cuts left out`).toEqual([]);
  return { all, n, measured };
}

run("a sheet's job sheet, through the real kernel", () => {
  it("every starting cabinet's sheets, inch and metric: the job sheet lists exactly the DXF's layers", async () => {
    const shop = defaultShop();
    shop.profileTool = "seed-compression";
    for (const metric of [false, true]) {
      for (const id of ["base", "drawers", "trash", "tall"]) {
        const { all, n, measured } = await preset(id, metric);
        const units = metric ? "half_mm" : "sixteenth";
        n.pieces.forEach((_, i) => {
          const file = cncFileName("Kitchen", n, i, measured.features, () => "Base 1");
          const dxf = nestingDxf(n, "lwpolyline", measured.features, { piece: i, overcut: true });
          const js = jobSheet({ n, index: i, measured, shop, units, file, ownerOf: () => "Base 1", all });
          expect(js.layers.map((l) => l.name), `${id} ${metric ? "metric" : "inch"} sheet ${i}`).toEqual(layerNames(dxf));
          // The file's name and label, as the DXF says them.
          expect(js.file).toBe(file);
          expect(dxf).toContain(`\n${js.label}\n`);
          // Every cut layer has a bit (the built-in bits and a profile bit), and none of them
          // is left out of the order; the text has a tick box per layer.
          for (const l of js.layers) if (l.cut) expect(l.tool, `${id} ${l.name}: no bit`).not.toBeNull();
          expect(js.order.every((st) => st.tool)).toBe(true);
          // Every cut layer is a step of the order.
          expect(js.order.flatMap((st) => st.layers).sort()).toEqual(js.layers.filter((l) => l.cut).map((l) => l.name).sort());
          const text = jobSheetText(js, "Kitchen");
          for (const l of js.layers) expect(text).toContain(l.cut ? `[ ] ${l.name}` : `${l.name} (reference: no toolpath)`);
          // The 1/4 in compression bit fits every sheet's outlines: the stretchers' and bottoms'
          // corner notches are open on two sides and put no limit on it.
          expect(js.layers.find((l) => l.name === "PROFILE_THRU")?.fits, `${id} ${metric ? "metric" : "inch"} sheet ${i}: ${js.layers.find((l) => l.name === "PROFILE_THRU")?.fitNotes.join(" ")}`).toBe(true);
          // Every character it prints, the PDF's font has (a "?" in the PDF is a character lost).
          const lost = [...text].filter((ch) => ch >= " " && ch !== "?" && winAnsi(ch)[0] === 63);
          expect([...new Set(lost)], `${id}: characters the PDF cannot print`).toEqual([]);
          // Each part is on it, once.
          expect(js.parts.map((p) => p.tag).sort()).toEqual(n.pieces[i].placements.map((q) => q.tag).sort());
        });
      }
    }
  }, 300_000);

  it("metric drawer base: the 6.2 mm grooves are flagged against the 1/4 in down-cut, and go to the 1/8 in end mill", async () => {
    const { all, n, measured } = await preset("drawers", true);
    const shop = defaultShop();
    shop.profileTool = "seed-compression";
    const sheets = n.pieces.map((_, i) => jobSheet({ n, index: i, measured, shop, units: "half_mm", file: `sheet ${i}.dxf`, ownerOf: () => null, all }));
    const grooves = sheets.flatMap((js) => js.layers.filter((l) => l.name.startsWith("POCKET_") && l.narrowest && l.narrowest.width < 0.0063));
    expect(grooves.length).toBeGreaterThan(0);
    for (const l of grooves) {
      // Measured from the parts: 6 mm plywood plus the 0.2 mm joint clearance.
      expect(l.narrowest!.width).toBeCloseTo(0.0062, 5);
      expect(l.tooWide?.id).toBe("seed-downcut");
      expect(l.fitNotes.join(" ")).toMatch(/1\/4 in down-cut \(6\.35 mm, 0\.25 in\) is not narrower than the narrowest shape on this layer: 6\.20 mm/);
      expect(l.tooWide?.diameter).toBeCloseTo(0.25 * IN, 9);
      expect(l.tool?.id).toBe("seed-endmill");
      expect(l.kind).toBe("narrow");
      expect(l.fits).toBe(true);
    }
    // The 18.2 mm dados keep the down-cut.
    const dados = sheets.flatMap((js) => js.layers.filter((l) => l.name === "POCKET_6MM" && l.narrowest && l.narrowest.width > 0.018));
    expect(dados.length).toBeGreaterThan(0);
    for (const l of dados) expect(l.tool?.id).toBe("seed-downcut");
  }, 120_000);

  it("inch base: the 0.227 in back groove goes to the 1/8 in end mill; the 1/4 in compression first-pass rule is printed; hold-down flags the narrow parts", async () => {
    const { all, n, measured } = await preset("base", false);
    const shop = defaultShop();
    shop.profileTool = "seed-compression";
    const sheets = n.pieces.map((_, i) => jobSheet({ n, index: i, measured, shop, units: "sixteenth", file: `sheet ${i}.dxf`, ownerOf: () => "Base 1", all }));
    const back = sheets.flatMap((js) => js.layers.filter((l) => l.name === "POCKET_7.94MM"));
    expect(back.length).toBeGreaterThan(0);
    for (const l of back) {
      expect(l.narrowest!.width / IN).toBeCloseTo(0.227, 3);
      expect(l.tool?.id).toBe("seed-endmill");
    }
    for (const js of sheets) {
      expect(js.compression).toMatch(/deeper than 0\.2856 in/);
      // The holes take the end mill, which is smaller than every hole.
      for (const l of js.layers.filter((x) => x.name.startsWith("DRILL_"))) expect(l.fits).toBe(true);
    }
    // The 4 in stretchers are flagged at Sawhorse's 5 in default.
    const parts = sheets.flatMap((js) => js.parts);
    const stretchers = parts.filter((p) => /stretcher/i.test(p.name));
    expect(stretchers.length).toBeGreaterThan(0);
    for (const p of stretchers) expect(p.holdDown).toBe(true);
    expect(parts.filter((p) => /side/i.test(p.name)).every((p) => !p.holdDown)).toBe(true);
    // The door's back is up; the sides' inside faces are.
    expect(parts.find((p) => p.name === "Door")?.faceUp).toMatch(/^Back face up/);
    expect(parts.find((p) => p.name === "Left side")?.faceUp).toBe("The face with its dados or grooves and its 5 mm holes up.");
  }, 120_000);

  it("drawer over 2 doors, inch: the drawer back's rear hook holes are named as the face up, and its 4 9/16 in drawer sides are on hold-down", async () => {
    const { all, n, measured } = await preset("mixed", false);
    const shop = defaultShop();
    shop.profileTool = "seed-compression";
    const parts = n.pieces.flatMap((_, i) => jobSheet({ n, index: i, measured, shop, units: "sixteenth", file: `sheet ${i}.dxf`, ownerOf: () => null, all }).parts);
    const backs = parts.filter((p) => p.name === "Drawer back");
    expect(backs.length).toBeGreaterThan(0);
    for (const p of backs) {
      expect(p.faceUp).toBe("The face with its 6 mm holes up.");
      expect(p.faceUp).not.toContain("inside");
    }
    const sides = parts.filter((p) => p.name === "Drawer side");
    expect(sides.length).toBeGreaterThan(0);
    for (const p of sides) {
      expect(p.width / IN, `${p.tag} ${p.size}`).toBeCloseTo(4.5625, 3);
      expect(p.holdDown, `${p.tag} ${p.size}`).toBe(true);
    }
  }, 120_000);
});
