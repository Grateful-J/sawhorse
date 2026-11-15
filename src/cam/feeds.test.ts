import { describe, expect, it } from "vitest";
import { COMPACT_ROUTER, DEWALT_DWP611, MAKITA_RT0701C, SHAPEOKO_5_PRO_4X4 } from "./data";
import { chiploadOf, computeFeeds, depthFactor, feedRate, ipmToMmMin, mmMinToIpm, rampFeed, type MachineView, type Spindle } from "./feeds";
import { HOLE_LAYERS, holeOf, layerJob } from "./layers";
import { seedTools, type Tool } from "./tools";

const IN = 0.0254;
const MM = 0.001;

const shapeoko: MachineView = { id: SHAPEOKO_5_PRO_4X4.id, name: "Shapeoko", feedWarn: { ipm: 200, sourced: SHAPEOKO_5_PRO_4X4.feedWarn }, maxShank: null };
const shopTable: Spindle = { router: COMPACT_ROUTER, table: COMPACT_ROUTER.tables[0], rpm: null };
const staffTable: Spindle = { router: COMPACT_ROUTER, table: COMPACT_ROUTER.tables[1], rpm: null };
const makita: Spindle = { router: MAKITA_RT0701C, table: MAKITA_RT0701C.tables[0], rpm: null };
const dewalt: Spindle = { router: DEWALT_DWP611, table: DEWALT_DWP611.tables[0], rpm: null };
const [compression, downcut, endmill] = seedTools();
const tool = (over: Partial<Tool>): Tool => ({ ...compression, from: {}, ...over });
const ids = (r: { warnings: { id: string }[] }) => r.warnings.map((w) => w.id);

describe("the formulas, in both unit systems", () => {
  it("feed = RPM × flutes × chipload: inches per tooth give IPM", () => {
    expect(feedRate(18000, 2, 0.0061)).toBeCloseTo(219.6, 9);
    // Amana A1's 2-flute 1/4 in MDF row: .0061 at 18,000 RPM is its printed 220 IPM.
    expect(Math.round(feedRate(18000, 2, 0.0061))).toBe(220);
    expect(chiploadOf(219.6, 18000, 2)).toBeCloseTo(0.0061, 12);
    expect(rampFeed(220, 2)).toBe(110); // Amana's ramp column
  });

  it("millimetres per tooth give mm/min: Rennie's worked example, 0.32 × 18,000 × 2 = 11,520", () => {
    expect(feedRate(18000, 2, 0.32)).toBeCloseTo(11520, 9);
    expect(chiploadOf(11520, 18000, 2)).toBeCloseTo(0.32, 12);
  });

  it("IPM and mm/min convert at 25.4", () => {
    expect(ipmToMmMin(113.15)).toBeCloseTo(2874.01, 6);
    expect(mmMinToIpm(11520)).toBeCloseTo(453.543, 3);
    // The same cut either way: 0.0061 in/tooth is 0.15494 mm/tooth.
    expect(ipmToMmMin(feedRate(13500, 2, 0.0061))).toBeCloseTo(feedRate(13500, 2, 0.0061 * 25.4), 9);
  });

  it("the depth derate: 1 up to 1 × D, 0.75 to 2 × D, 0.5 to 3 × D, none beyond", () => {
    const d = 0.25 * IN;
    expect(depthFactor(d, d)).toBe(1);
    expect(depthFactor(d * 1.01, d)).toBe(0.75);
    expect(depthFactor(2 * d, d)).toBe(0.75);
    expect(depthFactor(2.01 * d, d)).toBe(0.5);
    expect(depthFactor(3 * d, d)).toBe(0.5);
    expect(depthFactor(3.01 * d, d)).toBeNull();
  });
});

describe("the report's §8a starting values, on the Compact Router's shop-page table", () => {
  const run = (t: Tool, m: Parameters<typeof computeFeeds>[1], op: Parameters<typeof computeFeeds>[2] = "profile") => computeFeeds(t, m, op, shapeoko, shopTable);

  it("compression in Baltic birch: .0031, dial 3 (18,250), 113 IPM, ramp 57; first pass deeper than 0.2856 in at 85 IPM", () => {
    const r = run(compression, "baltic-birch");
    expect(r.start?.chipload).toBe(0.0031);
    expect(r.dial?.dial).toBe(3);
    expect(r.rpm).toBe(18250);
    expect(Math.round(r.feedIpm!)).toBe(113);
    expect(Math.round(r.rampIpm!)).toBe(57);
    expect(r.firstPass!.deeperThan / IN).toBeCloseTo(0.2856, 9);
    expect(Math.round(r.firstPass!.feedIpm!)).toBe(85); // over 1 × D: 25% off
    expect(r.depth.recommended! / IN).toBeCloseTo(0.25, 9);
    expect(r.feedMmMin).toBeCloseTo(113.15 * 25.4, 6);
  });

  it("laminate-faced Baltic birch reads the same row", () => {
    expect(Math.round(run(compression, "laminate-bb").feedIpm!)).toBe(113);
  });

  it("raw MDF and melamine: .0061 at dial 2 (13,500), 165 IPM, ramp 82: dial 3 would be 223 IPM, over 200", () => {
    for (const m of ["mdf", "melamine-mdf"] as const) {
      const r = run(compression, m);
      expect(r.start?.chipload).toBe(0.0061);
      expect(r.dial?.dial).toBe(2);
      expect(Math.round(r.feedIpm!)).toBe(165);
      expect(Math.round(r.rampIpm!)).toBe(82);
    }
    expect(Math.round(feedRate(18250, 2, 0.0061))).toBe(223);
  });

  it("HPL on MDF: .0061 × 0.70 (derived), 115 IPM, ramp 58", () => {
    const r = run(compression, "hpl-mdf");
    expect(r.start?.chipload).toBeCloseTo(0.00427, 12);
    expect(r.start?.from.src).toBe("report8a");
    expect(Math.round(r.feedIpm!)).toBe(115);
    expect(Math.round(r.rampIpm!)).toBe(58);
    expect(r.notes.some((n) => n.text.includes("derived"))).toBe(true);
  });

  it("down-cut dados: Baltic birch .0050 → 135 IPM, MDF .0060 → 162 IPM, at dial 2, 1/8 in a pass (half the diameter, low)", () => {
    const bb = run(downcut, "baltic-birch", "pocket");
    expect(Math.round(bb.feedIpm!)).toBe(135);
    expect(Math.round(bb.rampIpm!)).toBe(68);
    const mdf = run(downcut, "mdf", "pocket");
    expect(Math.round(mdf.feedIpm!)).toBe(162);
    expect(Math.round(mdf.rampIpm!)).toBe(81);
    expect(bb.depth.rule).toBe("half");
    expect(bb.depth.recommended! / IN).toBeCloseTo(0.125, 9);
  });

  it("the 1/8 in end mill: .002 at dial 3, 73 IPM, ramp 37, 1/16 in a pass; flagged below the bit makers on purpose", () => {
    const r = run(endmill, "baltic-birch", "hole");
    expect(r.start?.chipload).toBe(0.002);
    expect(Math.round(r.feedIpm!)).toBe(73);
    expect(Math.round(r.rampIpm!)).toBe(37);
    expect(r.depth.recommended! / IN).toBeCloseTo(0.0625, 9);
    const low = r.warnings.find((w) => w.id === "chipload-low")!;
    expect(low.text).toContain("on purpose");
  });

  it("a Makita at dial 3 (17,000): compression in Baltic birch is 105 IPM, as the report works it", () => {
    const r = computeFeeds(compression, "baltic-birch", "profile", shapeoko, makita);
    expect(r.dial?.dial).toBe(3);
    expect(Math.round(r.feedIpm!)).toBe(105);
  });

  it("the staff chart's nearest dial, and the DeWalt's lowest speed when the row asks for 13,500", () => {
    expect(computeFeeds(compression, "baltic-birch", "profile", shapeoko, staffTable).rpm).toBe(18000);
    expect(computeFeeds(compression, "mdf", "profile", shapeoko, staffTable).rpm).toBe(14000);
    const d = computeFeeds(compression, "mdf", "profile", shapeoko, dewalt);
    expect(d.rpm).toBe(16000);
    expect(d.feedIpm).toBeCloseTo(195.2, 9);
  });

  it("chipload: every maker's figure and the range they span", () => {
    const r = run(compression, "baltic-birch");
    expect(r.makerRange?.min).toBe(0.0031);
    expect(r.makerRange?.max).toBe(0.016); // Onsrud 60-100, hard plywood
    expect(r.makerRange!.spread).toBeGreaterThan(3);
    expect(new Set(r.makerFigures.map((f) => f.src))).toEqual(new Set(["amana-a1", "amana-a2", "onsrud-o2", "freud"]));
    // The reseller and the community are shown after the makers, not counted.
    expect(r.figures.at(-1)!.src).toBe("atoz");
  });

  it("an O-flute: no figure, and it says so", () => {
    const r = run(tool({ type: "oflute" }), "mdf");
    expect(r.start).toBeNull();
    expect(r.feedIpm).toBeNull();
    expect(r.warnings[0].text).toContain("does not know");
  });

  it("a bit size the charts do not carry: no figure, no feed", () => {
    const r = run(tool({ diameter: 0.1875 * IN }), "mdf");
    expect(r.figures).toEqual([]);
    expect(r.feedIpm).toBeNull();
    expect(ids(r)).toContain("no-figure");
  });

  it("a bit with no §8a row starts at the lowest maker's figure (rule 1): a 1/4 in 3-flute down-cut in MDF, Amana .0060", () => {
    const r = run(tool({ type: "downcut", flutes: 3 }), "mdf");
    expect(r.start?.row).toBeNull();
    expect(r.start?.chipload).toBe(0.006);
    expect(r.start?.from.src).toBe("amana-a4");
  });

  it("a 6 mm bit: only Rennie (a reseller) has a figure, so no starting value", () => {
    const r = run(tool({ type: "upcut", diameter: 6 * MM }), "mdf");
    expect(r.figures.map((f) => f.src)).toEqual(["rennie"]);
    expect(r.start).toBeNull();
  });
});

describe("the warnings fire at their boundaries", () => {
  const run = (t: Tool, opts: Parameters<typeof computeFeeds>[5] = {}, op: Parameters<typeof computeFeeds>[2] = "profile", m: Parameters<typeof computeFeeds>[1] = "baltic-birch", spindle = shopTable, machine = shapeoko) => computeFeeds(t, m, op, machine, spindle, opts);
  const deeper = (0.2756 + 0.01) * IN;

  it("compression: a first pass no deeper than the up-cut part plus its tolerance chips the top", () => {
    expect(ids(run(compression, { firstPass: deeper }))).toContain("compression-first-pass");
    expect(ids(run(compression, { firstPass: deeper + 0.0001 * IN }))).not.toContain("compression-first-pass");
    expect(ids(run(compression, { firstPass: 0.2756 * IN }))).toContain("compression-first-pass");
    // Without a tolerance the boundary is the up-cut length itself.
    const t = tool({ upcutTol: null });
    expect(ids(run(t, { firstPass: 0.2756 * IN }))).toContain("compression-first-pass");
    expect(ids(run(t, { firstPass: 0.2757 * IN }))).not.toContain("compression-first-pass");
  });

  it("compression: a dado or a sheet no deeper than the up-cut part is cut as an up-cut bit", () => {
    const dado = run(compression, { cutDepth: 6.35 * MM }, "pocket");
    expect(ids(dado)).toContain("compression-first-pass");
    expect(dado.warnings.find((w) => w.id === "compression-first-pass")!.text).toContain("down-cut");
    expect(ids(run(compression, { thickness: 6 * MM }))).toContain("compression-first-pass");
    expect(ids(run(compression, { thickness: 18 * MM }))).not.toContain("compression-first-pass");
  });

  it("compression with no up-cut length asks for it", () => {
    expect(ids(run(tool({ upcut: null, upcutTol: null })))).toContain("compression-upcut-unknown");
  });

  it("the feed over the machine's threshold, not at it", () => {
    // 200 IPM exactly at dial 3: 200 / (18,250 × 2).
    const at = run(compression, { feedIpm: 200 });
    expect(ids(at)).not.toContain("feed");
    const over = run(compression, { feedIpm: 200.5 });
    expect(ids(over)).toContain("feed");
    expect(over.warnings.find((w) => w.id === "feed")!.text).toContain("forum figure");
    // A custom machine with no threshold never warns.
    expect(ids(run(compression, { feedIpm: 900 }, "profile", "baltic-birch", shopTable, { ...shapeoko, feedWarn: null }))).not.toContain("feed");
  });

  it("the automatic dial steps down until the feed is under the threshold, and warns only when no dial is", () => {
    const fast = tool({ type: "downcut", flutes: 3 }); // MDF .006, 3 flutes
    const r = run(fast, {}, "pocket", "mdf");
    expect(r.feedIpm!).toBeLessThanOrEqual(200);
    expect(r.autoDial).toBe(true);
    const slow: MachineView = { ...shapeoko, feedWarn: { ipm: 50, sourced: null } };
    const r2 = run(compression, {}, "profile", "mdf", shopTable, slow);
    expect(r2.dial?.dial).toBe(1);
    expect(ids(r2)).toContain("feed");
  });

  it("a dial picked by hand is kept, and the feed follows it", () => {
    const r = run(compression, { dial: 4 });
    expect(r.autoDial).toBe(false);
    expect(r.rpm).toBe(24500);
    expect(r.feedIpm).toBeCloseTo(24500 * 2 * 0.0031, 9);
    expect(ids(r)).not.toContain("feed"); // 151.9 IPM
    expect(ids(run(compression, { dial: 6 }, "profile", "mdf"))).toContain("feed"); // 31,000 × 2 × .0061 = 378 IPM
  });

  it("a chipload below the lowest maker's minimum rubs; at it, it does not", () => {
    // The lowest maker's figure for compression in Baltic birch is .0031: at dial 3 that is 113.15 IPM.
    expect(ids(run(compression, { feedIpm: 18250 * 2 * 0.0031 }))).not.toContain("chipload-low");
    expect(ids(run(compression, { feedIpm: 18250 * 2 * 0.003 }))).toContain("chipload-low");
    // Under .001 is the rubbing floor.
    expect(ids(run(compression, { feedIpm: 18250 * 2 * 0.0009 }))).toContain("rubbing");
    // The derate lowers the floor with the feed: a pass over 1 × D at 75% is not "low".
    expect(ids(run(compression, { depth: 0.3 * IN, feedIpm: 18250 * 2 * 0.0031 * 0.75 }))).not.toContain("chipload-low");
  });

  it("a chipload above every maker's figure", () => {
    expect(ids(run(compression, { feedIpm: 18250 * 2 * 0.016 }))).not.toContain("chipload-high");
    expect(ids(run(compression, { feedIpm: 18250 * 2 * 0.0161 }))).toContain("chipload-high");
  });

  it("a shank larger than the router's collet, and one no listed collet fits", () => {
    expect(ids(run(compression))).not.toContain("collet");
    const big = run(tool({ shank: 0.375 * IN }));
    expect(ids(big)).toContain("collet");
    expect(big.warnings.find((w) => w.id === "collet")!.text).toContain("Compact Router");
    // 3/8 in fits the Makita.
    expect(ids(run(tool({ shank: 0.375 * IN }), {}, "profile", "baltic-birch", makita))).not.toContain("collet");
    // A 6 mm shank is not a 1/4 in collet's.
    expect(ids(run(tool({ shank: 6 * MM })))).toContain("collet");
    // Just over 1/4 in (0.02 mm) is too big; within 0.01 mm is 1/4 in.
    expect(ids(run(tool({ shank: 0.25 * IN + 0.02 * MM })))).toContain("collet");
    expect(ids(run(tool({ shank: 0.25 * IN + 0.005 * MM })))).not.toContain("collet");
    // Unknown shank, unknown collets: asked, not guessed.
    expect(ids(run(downcut))).toContain("shank-unknown");
    expect(ids(run(compression, {}, "profile", "baltic-birch", dewalt))).toContain("shank-unknown");
  });

  it("hole pocketing: the end mill must be smaller than the hole", () => {
    const h5 = holeOf("DRILL_D5MM_10MM")!;
    expect(ids(run(endmill, { hole: h5 }, "hole"))).not.toContain("hole-size");
    expect(ids(run(compression, { hole: h5 }, "hole"))).toContain("hole-size");
    // Equal is not smaller.
    expect(ids(run(tool({ type: "endmill", diameter: 5 * MM }), { hole: h5 }, "hole"))).toContain("hole-size");
    expect(ids(run(tool({ type: "endmill", diameter: 4.99 * MM }), { hole: h5 }, "hole"))).not.toContain("hole-size");
  });

  it("hole pocketing: the flutes must reach the hole's depth (or the sheet's, through)", () => {
    const h = holeOf("DRILL_D35MM_13MM")!;
    expect(ids(run(tool({ cuttingLength: 13 * MM }), { hole: h }, "hole"))).not.toContain("hole-depth");
    expect(ids(run(tool({ cuttingLength: 12.9 * MM }), { hole: h }, "hole"))).toContain("hole-depth");
    // The seeded end mill's flute length is unknown: asked for.
    const r = run(endmill, { hole: holeOf("DRILL_D5MM_10MM")! }, "hole");
    expect(r.warnings.find((w) => w.id === "hole-depth")!.level).toBe("caution");
    // Through: the sheet's thickness.
    const thru = holeOf("DRILL_D5MM_THRU")!;
    const e = tool({ type: "endmill", diameter: 0.125 * IN, cuttingLength: 12 * MM });
    expect(ids(run(e, { hole: thru, thickness: 12 * MM }, "hole"))).not.toContain("hole-depth");
    expect(ids(run(e, { hole: thru, thickness: 18 * MM }, "hole"))).toContain("hole-depth");
    expect(run(e, { hole: thru }, "hole").warnings.find((w) => w.id === "hole-depth")!.text).toContain("thickness");
  });

  it("never a Forstner or hinge-boring bit in the router; the 35 mm cups say so", () => {
    const r = run(tool({ name: "35 mm Forstner" }), { hole: holeOf("DRILL_D35MM_13MM")! }, "hole");
    expect(r.warnings.find((w) => w.id === "hinge-bit")!.level).toBe("stop");
    expect(ids(run(tool({ name: "Hinge boring bit" })))).toContain("hinge-bit");
    const cup = run(compression, { hole: holeOf("DRILL_D35MM_13MM")! }, "hole");
    expect(cup.notes.some((n) => n.text.includes("never a Forstner") && n.text.includes("11,000"))).toBe(true);
  });

  it("an up-cut bit on a laminate face", () => {
    expect(ids(run(tool({ type: "upcut" }), {}, "profile", "melamine-mdf"))).toContain("upcut-face");
    expect(ids(run(tool({ type: "upcut" }), {}, "profile", "mdf"))).not.toContain("upcut-face");
    expect(ids(run(compression, {}, "profile", "melamine-mdf"))).not.toContain("upcut-face");
  });

  it("a pass deeper than 3 × D: no chart goes there, no feed", () => {
    const r = run(compression, { depth: 0.76 * IN });
    expect(ids(r)).toContain("too-deep");
    expect(r.feedIpm).toBeNull();
  });

  it("lengths are said in the document's unit first", () => {
    const inch = run(compression, { firstPass: 0.2 * IN }).warnings.find((w) => w.id === "compression-first-pass")!.text;
    expect(inch).toContain("0.200 in (5.08 mm)");
    const mm = run(compression, { firstPass: 0.2 * IN, metric: true }).warnings.find((w) => w.id === "compression-first-pass")!.text;
    expect(mm).toContain("5.08 mm (0.200 in)");
  });
});

describe("layers", () => {
  it("reads each layer the CNC files hold", () => {
    expect(layerJob("PROFILE_THRU")).toMatchObject({ op: "profile", depth: null });
    expect(layerJob("CUTOUT_THRU")?.op).toBe("profile");
    expect(layerJob("POCKET_6.35MM")?.depth).toBeCloseTo(0.00635, 12);
    expect(layerJob("POCKET_6P35MM")?.depth).toBeCloseTo(0.00635, 12); // DXF R12
    expect(layerJob("FLIP_POCKET_8MM")).toMatchObject({ op: "pocket", flip: true });
    expect(layerJob("STOCK")).toBeNull();
    expect(layerJob("LABELS")).toBeNull();
  });

  it("every hole layer of today's files: its diameter and depth", () => {
    const got = HOLE_LAYERS.map((l) => {
      const h = holeOf(l)!;
      return [l, Math.round(h.diameter * 1e5) / 100, h.depth === null ? null : Math.round(h.depth * 1e5) / 100];
    });
    expect(got).toEqual([
      ["DRILL_D35MM_13MM", 35, 13],
      ["DRILL_D5MM_13MM", 5, 13],
      ["DRILL_D5MM_11.5MM", 5, 11.5],
      ["DRILL_D5MM_10MM", 5, 10],
      ["DRILL_D6MM_10MM", 6, 10],
      ["DRILL_D4.76MM_THRU", 4.76, null],
      ["DRILL_D5MM_THRU", 5, null],
    ]);
    expect(holeOf("DRILL_D4P76MM_THRU")?.diameter).toBeCloseTo(0.00476, 12);
  });
});
