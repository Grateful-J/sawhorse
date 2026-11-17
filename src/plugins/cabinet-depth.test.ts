// Depth is overall: a kitchen plan's 24 in base cabinet is 24 in from the wall to the face of
// its doors. The box is that less the overlay fronts; the panel shows overall unless "Depth is
// the box only" is ticked. The parts are always cut to the box, and a cabinet kept by an
// older version is the same box it was.
import { describe, expect, it } from "vitest";
import { applyPreset, boxDepth, defaults, frontDepth, overallDepth, plan, PRESETS, shownDepth, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { pack, unpack } from "../../plugins/cabinet-generator/keep.js";

const IN = 0.0254;
const MM = 0.001;

describe("cabinet depth: overall, or the box", () => {
  it("a base cabinet is 24 in overall: the box is 24 in less its 23/32 in door", () => {
    const s = applyPreset(defaults(false), "base", false);
    expect(frontDepth(s)).toBeCloseTo((23 / 32) * IN, 12);
    expect(s.depth).toBeCloseTo((24 - 23 / 32) * IN, 12);
    expect(overallDepth(s)).toBeCloseTo(24 * IN, 12);
    expect(shownDepth(s)).toBeCloseTo(24 * IN, 12);
    expect(shownDepth({ ...s, depthBox: true })).toBe(s.depth);
    // The parts are cut to the box: the side is the box deep.
    const side = plan(s, false).parts.find((p) => p.name === "Left side")!;
    expect(Math.max(...side.blank.filter((v) => Math.abs(v - s.depth) < 1e-9))).toBeCloseTo(s.depth, 12);
  });

  it("every starting point's depth is overall, in both units; metric boxes are what they were", () => {
    for (const metric of [false, true])
      for (const p of PRESETS) {
        const s = applyPreset(defaults(metric), p.id, metric);
        const want = metric ? p.mm[2] * MM : p.in[2] * IN;
        expect(overallDepth(s), `${p.id} ${metric}`).toBeCloseTo(want, 12);
      }
    // 578 mm less 18 mm is exactly the 560 mm box, not 559.9999999.
    expect(applyPreset(defaults(true), "base", true).depth).toBe(560 * MM);
    expect(applyPreset(defaults(true), "open", true).depth).toBe(300 * MM);
  });

  it("the fronts: overlay doors are the carcass stock, drawer fronts their own, the thicker for both; inset and open stand nothing proud", () => {
    const s = { ...defaults(false), thickness: 0.75 * IN, frontThickness: 0.5 * IN, front: "overlay" as const };
    expect(frontDepth({ ...s, layout: "doors" })).toBe(0.75 * IN);
    expect(frontDepth({ ...s, layout: "drawers" })).toBe(0.5 * IN);
    expect(frontDepth({ ...s, layout: "trash" })).toBe(0.5 * IN);
    expect(frontDepth({ ...s, layout: "mixed" })).toBe(0.75 * IN);
    expect(frontDepth({ ...s, layout: "shelves" })).toBe(0);
    expect(frontDepth({ ...s, layout: "doors", front: "inset" })).toBe(0);
    // With nothing proud the box is the overall depth, to the bit.
    expect(boxDepth(12 * IN, { ...s, layout: "shelves" })).toBe(12 * IN);
  });

  it("a plain new cabinet is 24 in deep; open, its box is too", () => {
    const d = defaults(false);
    expect(d.layout).toBe("shelves");
    expect(d.depth).toBe(24 * IN);
    expect(shownDepth(d)).toBe(24 * IN);
  });

  it("a cabinet kept by an older version keeps its box; only the depth shown is overall", () => {
    // Kept against the frozen baseline: no depth stored means the old default, 23 1/4 in.
    const old = unpack({ d: { layout: "doors", front: "overlay" } }, false)!;
    expect(old.depth).toBeCloseTo(23.25 * IN, 12);
    expect(old.depthBox).toBe(false);
    expect(overallDepth(old)).toBeCloseTo(23.25 * IN + old.thickness, 12);
    // The setting is kept only when ticked.
    const s: Sizes = applyPreset(defaults(false), "base", false);
    expect("depthBox" in pack(s, false).d).toBe(false);
    expect(pack({ ...s, depthBox: true }, false).d.depthBox).toBe(true);
    expect(unpack(pack({ ...s, depthBox: true }, false), false)!.depthBox).toBe(true);
  });
});
