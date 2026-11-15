import DxfParser from "dxf-parser";
import { describe, expect, it } from "vitest";
import { layerJob } from "../../cam/layers";
import { defaultShop, readShop } from "../../cam/store";
import { nestingDxf } from "../dxf";
import { smallNesting } from "../fixture";
import { jobSheets, jobSheetsText } from "../jobsheet";
import type { BlankFeatures } from "../machine";
import type { MeasuredNest } from "../measure";
import { toolLayerNames } from "../tool-layers";
import { cncToolProblems } from "../tool-preflight";

const mm = 0.001;
function setup() {
  const n = smallNesting();
  n.pieces = [n.pieces[0]];
  n.pieces[0].placements = [n.pieces[0].placements[0]];
  const f: BlankFeatures = {
    profile: null, cutouts: [], skipped: false,
    pockets: [{ depth: 7.94 * mm, loop: [[.01, .01], [.11, .01], [.11, .0157595], [.01, .0157595]] }],
    drills: [{ diameter: 4.7625 * mm, depth: 19.05 * mm, through: true, center: [.15, .05], loop: [] }],
    flip: { pockets: [], drills: [] },
  };
  const m: MeasuredNest = { features: new Map([["1a", f]]), skipped: [], flipped: [] };
  const shop = defaultShop();
  shop.collets = [3.175 * mm];
  shop.tools = [{ id: "fit", name: "My 1/8 inch end mill", type: "endmill", diameter: 3.175 * mm, flutes: 2, shank: 3.175 * mm, cuttingLength: 25.4 * mm, upcut: null, upcutTol: null, confirmedOwned: true }];
  shop.profileTool = "fit";
  shop.jobs.tools = { pocket: "fit", narrow: "fit", hole: "fit", cutout: "fit" };
  return { n, m, shop, f };
}

describe("export checks the assigned shop tools", () => {
  it("accepts confirmed tools which fit, reach and have a confirmed collet", () => {
    const { n, m, shop } = setup();
    expect(cncToolProblems(n, m, shop, "half_mm")).toEqual([]);
  });
  it("never treats starter tools as owned", () => {
    const { n, m } = setup();
    const problems = cncToolProblems(n, m, defaultShop(), "half_mm");
    expect(problems.some((p) => p.text.includes("confirm you own"))).toBe(true);
    expect(problems.some((p) => p.text.includes("cutting length"))).toBe(true);
    expect(problems.some((p) => p.text.includes("choose a bit"))).toBe(true);
  });
  it.each([4.7625, 6.35])("refuses a %s mm cutter for the example's 3/16 inch hole", (d) => {
    const { n, m, shop } = setup();
    shop.tools[0].diameter = d * mm;
    expect(cncToolProblems(n, m, shop, "half_mm")).toContainEqual(expect.objectContaining({ name: expect.stringContaining("DRILL_D4.76MM_THRU"), text: expect.stringContaining("does not fit") }));
  });
  it.each([null, 12.7 * mm, 19.05 * mm])("requires reach through the stock plus breakthrough: %s", (length) => {
    const { n, m, shop } = setup();
    shop.tools[0].cuttingLength = length;
    expect(cncToolProblems(n, m, shop, "half_mm")).toContainEqual(expect.objectContaining({ name: expect.stringContaining("THRU"), text: expect.stringContaining("19.55 mm") }));
  });
  it.each([undefined, [], [6.35 * mm], [NaN]])("requires a confirmed compatible collet: %s", (collets) => {
    const { n, m, shop } = setup();
    shop.collets = collets;
    expect(cncToolProblems(n, m, shop, "half_mm").length).toBeGreaterThan(0);
  });
  it("checks reverse-face features and names their operation", () => {
    const { n, m, shop, f } = setup();
    f.flip.drills.push({ ...f.drills[0], diameter: 2 * mm });
    expect(cncToolProblems(n, m, shop, "half_mm")).toContainEqual(expect.objectContaining({ name: expect.stringContaining("FLIP_DRILL_D2MM_THRU") }));
  });
  it("uses the job sheet's narrow-groove assignment, rather than assuming a quarter-inch bit", () => {
    const { n, m, shop } = setup();
    shop.tools.push({ ...shop.tools[0], id: "wide", name: "Quarter inch", diameter: 6.35 * mm });
    shop.jobs.tools.pocket = "wide";
    expect(cncToolProblems(n, m, shop, "half_mm")).toEqual([]);
  });
  it("excludes track-saw sheets from the router tool check", () => {
    const { n, m, shop } = setup();
    n.pieces[0].saw = true;
    shop.tools = [];
    expect(cncToolProblems(n, m, shop, "half_mm")).toEqual([]);
  });
  it("loads confirmations strictly and does not infer ownership from old saved shops", () => {
    const { shop } = setup();
    expect(readShop(shop).tools[0].confirmedOwned).toBe(true);
    expect(readShop(shop).collets).toEqual(shop.collets);
    expect(readShop({ ...shop, tools: [{ ...shop.tools[0], confirmedOwned: "true" }], collets: [NaN] }).tools[0].confirmedOwned).toBe(false);
    expect(readShop({ ...shop, collets: [0] }).collets).toEqual([]);
    expect(readShop({ ...shop, collets: undefined }).collets).toEqual([]);
  });
});

describe("CNC layers identify the selected tool and pocketed holes", () => {
  it("writes consistent layer names into the table, entities and job sheet without changing geometry", () => {
    const { n, m, shop } = setup();
    const [js] = jobSheets(n, m, shop, "half_mm", "Test", () => null);
    const names = toolLayerNames(js);
    const text = nestingDxf(n, "lwpolyline", m.features, { piece: 0, layerNames: names });
    const parsed = new DxfParser().parseSync(text)!;
    const hole = parsed.entities.find((e) => e.type === "CIRCLE") as unknown as { layer: string; radius: number };
    expect(hole.layer).toBe("DRILL_D4.76MM_THRU__POCKET_WITH_MY_1_8_INCH_END_MILL_D3P175MM");
    expect(hole.radius).toBeCloseTo(2.38125, 6);
    expect(Object.keys(parsed.tables.layer.layers)).toContain(hole.layer);
    expect(jobSheetsText([js], "Test")).toContain(hole.layer);
    expect(js.order.flatMap((s) => s.layers)).toContain(hole.layer);
    expect(layerJob(hole.layer)).toMatchObject({ op: "hole", depth: null, hole: { diameter: 4.76 * mm } });
    expect(names.has("STOCK")).toBe(false);
    expect(names.has("LABELS")).toBe(false);
  });
  it("marks unassigned and unconfirmed tools and sanitizes arbitrary names", () => {
    const { n, m, shop } = setup();
    shop.tools[0].name = 'Bad\nname<:/\\";$()';
    shop.tools[0].confirmedOwned = false;
    shop.profileTool = null;
    const [js] = jobSheets(n, m, shop, "half_mm", "Test", () => null);
    expect(toolLayerNames(js).get("PROFILE_THRU")).toContain("PROFILE_TOOL_UNSET");
    const hole = toolLayerNames(js).get("DRILL_D4.76MM_THRU")!;
    expect(hole).toContain("BAD_NAME_D3P175MM_OWNERSHIP_UNCONFIRMED");
    expect(hole).toMatch(/^[A-Z0-9_.]+$/);
  });
  it("preserves legacy templates when tool labels are disabled, including R12", () => {
    const { n, m, shop } = setup();
    shop.jobs.toolLayers = false;
    const [js] = jobSheets(n, m, shop, "half_mm", "Test", () => null);
    expect(toolLayerNames(js).size).toBe(0);
    expect(nestingDxf(n, "r12", m.features, { piece: 0, layerNames: toolLayerNames(js) })).toContain("DRILL_D4P76MM_THRU");
  });
});
