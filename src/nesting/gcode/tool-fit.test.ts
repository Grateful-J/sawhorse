import { describe, expect, it } from "vitest";
import { smallNesting } from "../fixture";
import { toolFitProblems } from "../cnc";
import type { BlankFeatures } from "../machine";
import type { MeasuredNest } from "../measure";

const mm = 0.001;
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const blank = (): BlankFeatures => ({ profile: null, cutouts: [], pockets: [], drills: [], flip: { pockets: [], drills: [] }, skipped: false });
const measured = (f: BlankFeatures): MeasuredNest => ({ features: new Map([["1a", f]]), skipped: [], flipped: [] });

describe("CAM cutter fit warnings", () => {
  it("flags the example's narrow groove and 5 mm holes, by depth layer", () => {
    const f = blank();
    f.pockets.push({ depth: 7.94 * mm, loop: rect(10 * mm, 10 * mm, 100 * mm, 5.7595 * mm) });
    f.drills.push({ depth: 13 * mm, diameter: 5 * mm, center: [30 * mm, 40 * mm], loop: [], through: false });
    const warnings = toolFitProblems(smallNesting(), measured(f), "half_mm");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: "toolfit", tag: "1a", name: "Shelf" });
    expect(warnings[0].text).toContain("POCKET_7.94MM");
    expect(warnings[0].text).toContain("DRILL_D5MM_13MM");
    expect(warnings[0].text).toContain("6.35 mm");
    expect(warnings[0].text).toContain("does not know which tools you own");
  });
  it("accepts a smaller chosen test bit for this necessary-condition check", () => {
    const f = blank();
    f.pockets.push({ depth: 7.94 * mm, loop: rect(10 * mm, 10 * mm, 100 * mm, 5.7595 * mm) });
    expect(toolFitProblems(smallNesting(), measured(f), "half_mm", 3.175 * mm)).toEqual([]);
  });
  it("includes reverse-face features and warns at equal tool diameter", () => {
    const f = blank();
    f.flip.pockets.push({ depth: 3 * mm, loop: rect(10 * mm, 10 * mm, 6.35 * mm, 40 * mm) });
    expect(toolFitProblems(smallNesting(), measured(f), "half_mm")[0].text).toContain("FLIP_POCKET_3MM");
  });
  it("flags the supplied drawer-front through holes for the assumed #201", () => {
    const f = blank();
    f.drills.push({ depth: 19.05 * mm, diameter: 4.7625 * mm, center: [30 * mm, 40 * mm], loop: [], through: true });
    const [warning] = toolFitProblems(smallNesting(), measured(f), "half_mm");
    expect(warning.text).toContain("DRILL_D4.76MM_THRU");
    expect(warning.text).toContain("6.35 mm");
    expect(warning.text).toContain("matching drill");
  });
  it("checks the same overcut outline that the DXF writes", () => {
    const n = smallNesting();
    n.pieces[0].kerf = 10 * mm;
    n.pieces[0].trim = 5 * mm;
    const f = blank();
    f.pockets.push({ depth: 3 * mm, loop: rect(0, 10 * mm, 4 * mm, 40 * mm) });
    expect(toolFitProblems(n, measured(f), "half_mm")).toEqual([]);
    n.pieces[0].trim = 0;
    expect(toolFitProblems(n, measured(f), "half_mm")).toHaveLength(1);
  });
  it("does not pretend unmeasured or missing cuts were checked", () => {
    expect(toolFitProblems(smallNesting(), null, "half_mm")).toEqual([]);
    expect(toolFitProblems(smallNesting(), { features: new Map(), skipped: [], flipped: [] }, "half_mm")).toEqual([]);
  });
});
