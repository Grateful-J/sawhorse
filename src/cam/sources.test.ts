// Every built-in number has a source and a confidence: this walks the data and fails on a
// number with no `src` above it, on a `src` that is not in SOURCES, and on a confidence
// that is not high, medium or low.
import { describe, expect, it } from "vitest";
import { CHART_FIGURES, START_ROWS } from "./chipload";
import * as data from "./data";
import { SCRAP_TEST } from "./scrap";
import { SOURCES, source } from "./sources";
import { SEED_TOOLS } from "./tools";

const CONF = ["high", "medium", "low"];

/** Paths of numbers no source covers, and of bad sources. */
function walk(node: unknown, path: string, covered: boolean, out: string[]): void {
  if (typeof node === "number") {
    if (!covered) out.push(`${path}: ${node} has no source`);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, `${path}[${i}]`, covered, out));
    return;
  }
  const o = node as Record<string, unknown>;
  let here = covered;
  if ("src" in o) {
    const s = typeof o.src === "string" ? source(o.src) : undefined;
    if (!s) out.push(`${path}.src: ${String(o.src)} is not a source`);
    else here = true;
  }
  if ("confidence" in o && !CONF.includes(o.confidence as string)) out.push(`${path}.confidence: ${String(o.confidence)}`);
  // A dial position is the table's own label for the RPM beside it (from the same source).
  const rpm = o.rpm as Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "dial" && typeof v === "number" && rpm && typeof rpm.src === "string" && source(rpm.src)) continue;
    walk(v, `${path}.${k}`, here, out);
  }
}

describe("every built-in number has a source and a confidence", () => {
  const all: Record<string, unknown> = {
    ROUTERS: data.ROUTERS,
    SHAPEOKO_5_PRO_4X4: data.SHAPEOKO_5_PRO_4X4,
    CHART_DEPTH: data.CHART_DEPTH,
    COMMUNITY: data.COMMUNITY,
    PLUNGE_HALF: data.PLUNGE_HALF,
    ONION_SKIN: data.ONION_SKIN,
    HINGE_BIT_MAX: data.HINGE_BIT_MAX,
    FORSTNER_35: data.FORSTNER_35,
    HPL_FACTOR: data.HPL_FACTOR,
    CHART_FIGURES,
    START_ROWS,
    SEED_TOOLS,
    SCRAP_TEST,
  };

  it("walks the data: no number without a source", () => {
    const out: string[] = [];
    for (const [k, v] of Object.entries(all)) walk(v, k, false, out);
    expect(out).toEqual([]);
  });

  it("the walker catches a number with no source, and a source that does not exist", () => {
    const out: string[] = [];
    walk({ a: { value: 3, unit: "in" }, b: { value: 4, src: "nobody" }, c: { value: 5, src: "amana-a1" } }, "x", false, out);
    expect(out).toEqual(["x.a.value: 3 has no source", "x.b.src: nobody is not a source", "x.b.value: 4 has no source"]);
  });

  it("every source has a maker, a document, a place in it, a URL, a confidence and its report section", () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.maker, id).toBeTruthy();
      expect(s.document, id).toBeTruthy();
      expect(s.where, id).toBeTruthy();
      expect(s.url, id).toMatch(/^(https:\/\/|docs\/research\/)/);
      expect(CONF, id).toContain(s.confidence);
      expect(s.report, id).toMatch(/^§/);
    }
  });

  it("the confidences are the report's: Shapeoko depth, stepover, ramp and the max feed are low", () => {
    expect(data.confidenceOf(data.SHAPEOKO_5_PRO_4X4.feedWarn)).toBe("low");
    expect(data.confidenceOf(data.COMMUNITY.halfD)).toBe("low");
    expect(data.confidenceOf(data.COMMUNITY.rampAngle)).toBe("low");
    expect(data.confidenceOf(data.COMMUNITY.stepoverRoughLow)).toBe("low");
    expect(data.confidenceOf(data.SHAPEOKO_5_PRO_4X4.travelX)).toBe("high");
    expect(data.confidenceOf(data.COMPACT_ROUTER.tables[1].steps[0].rpm)).toBe("medium"); // the staff chart
    expect(data.confidenceOf(START_ROWS.find((r) => r.kinds.includes("endmill"))!.chipload)).toBe("low");
  });

  it("each scrap-test step names who says it", () => {
    for (const s of SCRAP_TEST) expect(s.says.length, s.title).toBeGreaterThan(0);
  });
});

describe("the numbers are the report's", () => {
  it("the Shapeoko 5 Pro 4x4: 1237 x 1237 mm travel, 155 mm Z, the Compact Router's 1/4 in shank, 200 IPM as a forum figure", () => {
    const m = data.SHAPEOKO_5_PRO_4X4;
    expect([m.travelX.value, m.travelY.value, m.travelZ.value]).toEqual([1237, 1237, 155]);
    expect(m.travelX.unit).toBe("mm");
    expect(data.COMPACT_ROUTER.maxShank).toMatchObject({ value: 0.25, unit: "in", src: "c3d-spindles" });
    expect(m.feedWarn).toMatchObject({ value: 200, unit: "ipm", src: "forum-max-feed" });
    expect(m.feedWarn.note).toContain("Not published by Carbide 3D");
  });

  it("the dial tables: Carbide's shop page and its 2020 staff chart disagree, Makita, DeWalt", () => {
    const rpms = (t: data.DialTable) => t.steps.map((s) => [s.dial, s.rpm.value]);
    expect(rpms(data.COMPACT_ROUTER.tables[0])).toEqual([[1, 11000], [2, 13500], [3, 18250], [4, 24500], [5, 29250], [6, 31000]]);
    expect(rpms(data.COMPACT_ROUTER.tables[1]).filter(([d]) => Number.isInteger(d))).toEqual([[1, 10000], [2, 14000], [3, 18000], [4, 23000], [5, 27000], [6, 32000]]);
    expect(rpms(data.COMPACT_ROUTER.tables[1]).filter(([d]) => !Number.isInteger(d))).toEqual([[1.5, 12000], [2.5, 16000], [3.5, 20500], [4.5, 25000], [5.5, 29500]]);
    expect(rpms(data.MAKITA_RT0701C.tables[0])).toEqual([[1, 10000], [2, 12000], [3, 17000], [4, 22000], [5, 27000], [6, 30000]]);
    expect(rpms(data.DEWALT_DWP611.tables[0])).toEqual([[1, 16000], [2, 18200], [3, 20400], [4, 22600], [5, 24800], [6, 27000]]);
    // The largest disagreement between Carbide's two tables, dial for dial: 2,250 RPM at dial 5
    // (29,250 against 27,000). The report's text says "up to about 1,500"; its tables say this.
    expect(data.tableGap(data.COMPACT_ROUTER.tables[0], data.COMPACT_ROUTER.tables[1])).toEqual({ dial: 5, rpm: 2250 });
    expect(data.DEWALT_DWP611.collets).toBeNull();
  });

  it("the Amana 46170: 0.2756 in up-cut, ± 0.010, 0.875 in flutes, 1/4 in shank", () => {
    const f = SEED_TOOLS[0].fields;
    expect(f.upcut).toMatchObject({ value: 0.2756, src: "amana-a5" });
    expect(f.upcutTol?.value).toBe(0.01);
    expect(f.cuttingLength?.value).toBe(0.875);
    expect(f.shank?.value).toBe(0.25);
    // The two generic bits: shank and flute length not found, so not filled in.
    expect(SEED_TOOLS[1].fields.shank).toBeUndefined();
    expect(SEED_TOOLS[2].fields.cuttingLength).toBeUndefined();
  });
});
