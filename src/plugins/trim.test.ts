import { describe, expect, it } from "vitest";
import { applyPreset, defaults, normalize, plan, PRESETS, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { pack, unpack } from "../../plugins/cabinet-generator/keep.js";
import { baseDefaults, IDENTITY, lineUp, normalizeBase, placeNext, planBase, reach, rowLayout, rowOf, solidRuns, touchesRight, translation, type Frame } from "../../plugins/cabinet-generator/row.js";
import { APPLIANCES, frontProud, openingStart, planCabinet, rowChecks, trimChecks, trimEnds, trimParts, trimUsed, type Checked } from "../../plugins/cabinet-generator/trim.js";
import { trimDefaults } from "../../plugins/cabinet-generator/trimsizes.js";

const IN = 0.0254;
const MM = 0.001;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const v6 = (v: number[]) => v.map(r6);
const inch = (m = false): Sizes => defaults(m);
const base = (m = false, over: Partial<Sizes> = {}): Sizes => ({ ...applyPreset(defaults(m), "base", m), ...over });
const wall = (m = false, over: Partial<Sizes> = {}): Sizes => ({ ...applyPreset(defaults(m), "wall", m), ...over });
/** A cabinet as a row sees it, its ends from its settings. */
const cab = (id: number, s: Sizes, world: Frame = IDENTITY): Checked => ({ id, name: `Cab ${id}`, width: s.width, depth: s.depth, height: s.height, world, ends: trimEnds(s), sizes: s });
const part = (parts: { name: string }[], name: string) => {
  const p = parts.find((x) => x.name === name);
  if (!p) throw new Error(`no ${name}`);
  return p as ReturnType<typeof plan>["parts"][number];
};

describe("a row with fillers, end panels and openings", () => {
  it("a new cabinet stands past what stands beside both: the anchor's right filler and its own left end panel", () => {
    const a = cab(1, base(false, { endRight: "filler", fillerRight: 3 * IN }));
    const s = base(false, { endLeft: "panel" });
    const world = placeNext(a, { ...s, ends: trimEnds(s) }, "right");
    expect(r6(world.translation[0])).toBe(r6(24 * IN + 3 * IN + (23 / 32) * IN));
    const b = cab(2, s, world);
    expect(touchesRight(a, b)).toBe(true);
    expect(rowOf([b, a], 2).map((c) => c.id)).toEqual([1, 2]);
    // The same two boxes side by side, with the filler between them unaccounted for, do not touch.
    expect(touchesRight(a, { ...b, world: translation([24 * IN, 0, 0]) })).toBe(false);
  });

  it("an opening is space in the row: the next cabinet stands past it, left and right", () => {
    const a = cab(1, base(false, { openRight: "dw-ge", openRightWidth: 24 * IN, openLeft: "range-free", openLeftWidth: 30 * IN }));
    const r = placeNext(a, base(), "right");
    const l = placeNext(a, base(), "left");
    expect(r6(r.translation[0])).toBe(r6(48 * IN));
    expect(r6(l.translation[0])).toBe(r6(-54 * IN));
    const row = [cab(3, base(), l), a, cab(2, base(), r)];
    expect(rowOf(row, 1).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(reach(a, "right")).toBeCloseTo(24 * IN, 12);
  });

  it("lays the row out left to right: each cabinet, and the end panels, fillers and openings beside them", () => {
    const s1 = base(false, { endLeft: "scribe", fillerLeft: 1.5 * IN, endScribe: 0.5 * IN, openRight: "dw-bosch", openRightWidth: 24 * IN });
    const s2 = base(false, { width: 36 * IN, endRight: "panel" });
    const a = cab(1, s1, translation([1, 2, 0]));
    const b = cab(2, s2, placeNext(a, { ...s2, ends: trimEnds(s2) }, "right"));
    const lay = rowLayout(rowOf([a, b], 1));
    expect(lay.items.map((it) => [it.kind, it.label, r6(it.x0 / IN), r6(it.x1 / IN)])).toEqual([
      // A scribe filler's row width is the width it ends at; its extra is scribed off at the wall.
      ["filler", "Left scribe filler", -1.5, 0],
      ["cabinet", "Cab 1", 0, 24],
      ["opening", "Dishwasher (Bosch)", 24, 48],
      ["cabinet", "Cab 2", 48, 84],
      ["panel", "Right end panel", 84, r6(84 + 23 / 32)],
    ]);
    expect(r6(lay.length / IN)).toBe(84);
    // A base frame stands under the cabinets and fillers in runs; an opening breaks a run, an end panel is in none.
    const { runs, joints } = solidRuns(lay.items);
    expect(runs.map(([x0, x1]) => [r6(x0 / IN), r6(x1 / IN)])).toEqual([[-1.5, 24], [48, 84]]);
    expect(joints.map((x) => r6(x / IN))).toEqual([0]);
  });

  it("plans a base frame that stops at an opening, runs under a filler, and skins each front rail", () => {
    const s1 = base(false, { base: "none", height: 30.5 * IN, endLeft: "filler", fillerLeft: 3 * IN, openRight: "dw-ge", openRightWidth: 24 * IN });
    const s2 = base(false, { base: "none", height: 30.5 * IN });
    const a = cab(1, s1);
    const b = cab(2, s2, placeNext(a, s2, "right"));
    const b0 = { ...baseDefaults(false), skin: "doors" as const };
    const T = (23 / 32) * IN;
    const p = planBase([a, b], b0, undefined, { thickness: T, material: "Door plywood" });
    expect(p.error).toBeNull();
    expect(p.layout.ladders.map((l) => [r6(l.x0 / IN), r6(l.x1 / IN)])).toEqual([[-3, 24], [48, 72]]);
    expect(p.layout.start).toBeCloseTo(-3 * IN, 12);
    const skins = p.parts.filter((x) => x.name === "Toe kick skin");
    expect(skins.map((x) => [v6(x.blank.map((v) => v / IN)), x.material, x.grain, x.copies.map((c) => v6(c.at.map((v) => v / IN)))])).toEqual([
      [[27, r6(23 / 32), 4], "Door plywood", "length", [[-3, r6(3 - 23 / 32), 0]]],
      [[24, r6(23 / 32), 4], "Door plywood", "length", [[48, r6(3 - 23 / 32), 0]]],
    ]);
    expect(p.notes.map((n) => n[0])).toEqual(expect.arrayContaining(["Openings", "Skin"]));
    // A skin no thinner than the setback stands in front of the cabinets: refused.
    expect(planBase([a, b], { ...b0, setback: T }, undefined, { thickness: T, material: "Door plywood" }).error).toMatch(/skin's thickness/);
    // No skin, no opening: the frame of two boxes side by side.
    const plain = planBase([cab(1, s2), cab(2, s2, translation([24 * IN, 0, 0]))], baseDefaults(false));
    expect(plain.layout.ladders.map((l) => [r6(l.x0 / IN), r6(l.x1 / IN)])).toEqual([[0, 24], [24, 48]]);
    expect(plain.parts.some((x) => x.name === "Toe kick skin")).toBe(false);
  });

  it("lines cabinets up past what stands beside them, and turns a corner past a filler at the row's end", () => {
    const s1 = base(false, { endRight: "filler", fillerRight: 2 * IN });
    const a = cab(1, s1);
    const b = cab(2, base(), translation([40 * IN, 3, 0]));
    const moved = lineUp([a, b]);
    expect(r6((moved.get(2) as Frame).translation[0] / IN)).toBe(26);
    const corner = placeNext(a, { width: 24 * IN, depth: 23.25 * IN }, "cornerRight", 3 * IN);
    // The new cabinet's back is on the next wall: at the filler's outer face.
    expect(r6(corner.translation[0] / IN)).toBe(r6(26 - 23.25));
  });
});

describe("end panels, fillers and skins are parts", () => {
  const T = (23 / 32) * IN;
  it("an end panel to the floor, flush with the doors, on the side's outer face, its grain up", () => {
    const s = base(false, { endLeft: "panel", endRight: "panel", endScribe: 0.25 * IN });
    const { parts, error } = trimParts(s, false);
    expect(error).toBeNull();
    const l = part(parts, "Left end panel");
    const r = part(parts, "Right end panel");
    expect(frontProud(s)).toBeCloseTo(T, 12);
    expect(v6(l.blank.map((v) => v / IN))).toEqual(v6([23 / 32, 23 / 32 + (24 - 23 / 32) + 0.25, 34.5]));
    expect(v6(l.copies[0].at.map((v) => v / IN))).toEqual(v6([-23 / 32, -23 / 32, 0]));
    expect(v6(r.copies[0].at.map((v) => v / IN))).toEqual(v6([24, -23 / 32, 0]));
    expect([l.grain, l.material, l.bands, l.bom]).toEqual(["length", "Cabinet plywood", undefined, undefined]);
  });

  it("an end panel flush with the box's bottom and the carcass front, in the door plywood", () => {
    const s = base(false, { endRight: "panel", endDown: "box", endFront: "carcass", endStock: "doors" });
    const r = part(trimParts(s, false).parts, "Right end panel");
    expect(v6(r.blank.map((v) => v / IN))).toEqual(v6([23 / 32, 24 - 23 / 32, 30.5]));
    expect(v6(r.copies[0].at.map((v) => v / IN))).toEqual(v6([24, 0, 4]));
    expect(r.material).toBe("Door plywood");
    // No fronts to be flush with: open shelves, inset doors. Drawers: the drawer front stock.
    expect(frontProud(inch())).toBe(0);
    expect(frontProud(base(false, { front: "inset" }))).toBe(0);
    expect(frontProud({ ...applyPreset(defaults(false), "drawers", false), frontThickness: 0.75 * IN })).toBeCloseTo(0.75 * IN, 12);
  });

  it("an end panel's edges take the carcass front edges' band, cut short by it, and carry it by the metre", () => {
    const s = base(true, { endLeft: "panel", endBand: "frontBottom", band: true, bandCarcass: "1", bandWasteEnd: 25.4 * MM, endFront: "carcass" });
    const { parts } = trimParts(s, true);
    const l = part(parts, "Left end panel");
    expect(v6((l.finished as number[]).map((v) => v / MM))).toEqual([18, 560, 870]);
    expect(v6(l.blank.map((v) => v / MM))).toEqual([18, 559, 869]);
    expect(v6((l.offset as number[]).map((v) => v / MM))).toEqual([0, 1, 1]);
    // The blank's corner is in from the finished panel's by the band, so the finished panel is where it was.
    expect(v6(l.copies[0].at.map((v) => v / MM))).toEqual([-18, 1, 1]);
    expect(l.bands?.map((b) => [b.edge, b.band, r6(b.run / MM)])).toEqual([["front", 1, 870], ["bottom", 1, 560]]);
    expect(l.bom).toEqual([{ item: "Edge banding, 1 mm x 23 mm", qty: Math.ceil((0.87 + 0.56 + 2 * 0.0254) * 1000 - 1e-6) / 1000, unit: "m" }]);
    // The carcass not banded, or banding off: the panel is not either.
    expect(part(trimParts({ ...s, bandCarcass: "none" }, true).parts, "Left end panel").bands).toBeUndefined();
    expect(part(trimParts({ ...s, band: false }, true).parts, "Left end panel").bands).toBeUndefined();
    expect(part(trimParts({ ...s, endBand: "none" }, true).parts, "Left end panel").bands).toBeUndefined();
  });

  it("a filler is a strip above the toe kick, flush with the carcass front; a scribe filler is cut wider on its wall side", () => {
    const s = base(false, { endLeft: "scribe", fillerLeft: 3 * IN, endScribe: 1 * IN, endRight: "filler", fillerRight: 1.5 * IN });
    const { parts } = trimParts(s, false);
    const l = part(parts, "Left filler");
    const r = part(parts, "Right filler");
    expect(v6(l.blank.map((v) => v / IN))).toEqual(v6([4, 23 / 32, 30.5]));
    expect(v6(l.copies[0].at.map((v) => v / IN))).toEqual([-4, 0, 4]);
    expect(v6(r.blank.map((v) => v / IN))).toEqual(v6([1.5, 23 / 32, 30.5]));
    expect(v6(r.copies[0].at.map((v) => v / IN))).toEqual([24, 0, 4]);
    expect([l.grain, r.grain, l.material, l.bands]).toEqual(["length", "length", "Cabinet plywood", undefined]);
    // The row counts the width it ends at.
    expect(trimEnds(s).left.map((p) => r6(p.width / IN))).toEqual([3]);
    // A wall cabinet's filler is its full height.
    expect(v6(part(trimParts(wall(false, { endRight: "filler" }), false).parts, "Right filler").blank.map((v) => v / IN))).toEqual(v6([3, 23 / 32, 30]));
  });

  it("a toe-kick skin runs under the cabinet, its fillers and a panel flush with the box, and stops at a panel to the floor", () => {
    const s = base(false, { kickSkin: "back", endLeft: "filler", fillerLeft: 2 * IN, endRight: "panel", endDown: "box" });
    const k = part(trimParts(s, false).parts, "Toe kick skin");
    const tb = s.backThickness;
    expect(v6(k.blank.map((v) => v / IN))).toEqual(v6([2 + 24 + 23 / 32, tb / IN, 4]));
    expect(v6(k.copies[0].at.map((v) => v / IN))).toEqual(v6([-2, 3 - tb / IN, 0]));
    expect([k.material, k.grain]).toEqual(["Back plywood", "length"]);
    const floor = part(trimParts({ ...s, endDown: "floor" }, false).parts, "Toe kick skin");
    expect(r6(floor.blank[0] / IN)).toBe(26);
    // No toe kick (a wall cabinet, or on a base frame): no skin.
    expect(trimParts({ ...s, base: "none" }, false).parts.some((p) => p.name === "Toe kick skin")).toBe(false);
    // Thicker than the kick is set back: refused, with what to change.
    expect(trimParts({ ...s, kickSkin: "carcass", toeSetback: T }, false).error).toMatch(/set the kick back further/);
  });

  it("refuses only what cannot be built: a filler with no width, a negative scribe or opening", () => {
    expect(trimParts(base(false, { endLeft: "filler", fillerLeft: 0 }), false).error).toMatch(/left filler needs a width/);
    expect(trimParts(base(false, { endRight: "scribe", fillerRight: -1 }), false).error).toMatch(/right filler/);
    expect(trimParts(base(false, { endScribe: -0.01 }), false).error).toMatch(/scribe allowance/);
    expect(trimParts(base(false, { openLeft: "other", openLeftWidth: -1 }), false).error).toMatch(/opening/);
    expect(planCabinet(base(false, { endLeft: "filler", fillerLeft: 0 }), false).error).toMatch(/left filler/);
  });

  it("adds its parts and rows to plan()'s, and leaves a cabinet that uses none as plan() plans it", () => {
    const s = base(false, { endLeft: "panel", openRight: "dw-ge", openRightWidth: 24 * IN });
    const all = planCabinet(s, false);
    const p = plan(s, false);
    expect(all.parts.map((x) => x.name)).toEqual([...p.parts.map((x) => x.name), "Left end panel"]);
    expect(all.rows.filter((r) => r[0] === "Opening, right")).toHaveLength(1);
    for (const m of [false, true])
      for (const id of PRESETS.map((x) => x.id)) {
        const d = applyPreset(defaults(m), id, m);
        expect(trimUsed(d)).toBe(false);
        expect(JSON.stringify(planCabinet(d, m))).toBe(JSON.stringify(plan(d, m)));
      }
  });
});

describe("checks, at their cited boundaries", () => {
  const T = (23 / 32) * IN;
  it("KCMA's toe kick: at least 3 in (76 mm) high and 2 in (51 mm) deep, once skinned", () => {
    const ok = base(false, { kickSkin: "carcass", toeKick: 3 * IN, toeSetback: 2 * IN + T });
    expect(trimChecks(ok, false)).toEqual([]);
    expect(trimChecks({ ...ok, toeKick: 3 * IN - 0.001 * IN }, false).join()).toMatch(/at least 3 in/);
    expect(trimChecks({ ...ok, toeSetback: 2 * IN + T - 0.001 * IN }, false).join()).toMatch(/at least 2 in/);
    const mm = base(true, { kickSkin: "carcass", toeKick: 76 * MM, toeSetback: 51 * MM + 18 * MM });
    expect(trimChecks(mm, true)).toEqual([]);
    expect(trimChecks({ ...mm, toeKick: 75.9 * MM }, true).join()).toMatch(/at least 76 mm/);
    expect(trimChecks({ ...mm, toeSetback: 68.9 * MM }, true).join()).toMatch(/at least 51 mm/);
    // Without a skin, KCMA's numbers are not checked here (the brief: checks for the skin).
    expect(trimChecks({ ...ok, kickSkin: "none", toeKick: 2 * IN }, false)).toEqual([]);
  });

  it("the AWS scribe: up to 1-1/2 in", () => {
    const s = base(false, { endLeft: "panel", endScribe: 1.5 * IN });
    expect(trimChecks(s, false)).toEqual([]);
    expect(trimChecks({ ...s, endScribe: 1.501 * IN }, false).join()).toMatch(/1-1\/2 in/);
    // Only where a scribe is used: a plain filler has none.
    expect(trimChecks({ ...s, endLeft: "filler", endScribe: 2 * IN }, false)).toEqual([]);
  });

  it("Kohler's sink bases: 24-25 in sinks 27 in, 32-33 in 36 in, 35 in 36 in with a note, farmhouse 36 in (914 mm)", () => {
    const s = (sink: number, width: number, apron = false) => trimChecks(base(false, { sinkWidth: sink * IN, width: width * IN, sinkApron: apron }), false);
    expect(s(24, 27)).toEqual([]);
    expect(s(25, 27)).toEqual([]);
    expect(s(24, 26.99).join()).toMatch(/at least 27 in/);
    expect(s(32, 36)).toEqual([]);
    expect(s(33, 35.99).join()).toMatch(/at least 36 in/);
    expect(s(35, 36).join()).toMatch(/may require cabinet modifications/);
    expect(s(35, 35.99).join()).toMatch(/at least 36 in/);
    expect(s(0, 36, true)).toEqual([]);
    expect(s(0, 35.99, true).join()).toMatch(/farmhouse/);
    expect(s(28, 36).join()).toMatch(/give no base width/);
    const mm = (sink: number, width: number, apron = false) => trimChecks(base(true, { sinkWidth: sink * MM, width: width * MM, sinkApron: apron }), true);
    // Kohler prints 686 mm and 914 mm: a metric document reads those.
    expect(mm(610, 686)).toEqual([]);
    expect(mm(610, 685.9).join()).toMatch(/at least 686 mm/);
    expect(mm(0, 914, true)).toEqual([]);
    expect(mm(0, 913.9, true).join()).toMatch(/914 mm/);
  });

  it("each opening's width against its preset", () => {
    const w = (kind: keyof typeof APPLIANCES, width: number, m = false) => trimChecks(base(m, { openRight: kind, openRightWidth: width * (m ? MM : IN) }), m);
    expect(w("dw-ge", 24)).toEqual([]);
    expect(w("dw-ge", 23.99).join()).toMatch(/at least 24 in/);
    expect(w("dw-bosch", 24)).toEqual([]);
    expect(w("dw-bosch", 610, true)).toEqual([]);
    // Bosch prints 610 mm: 24 in (609.6 mm) in a metric document is under it.
    expect(w("dw-bosch", 609.6, true).join()).toMatch(/at least 610 mm/);
    expect(w("dw-bosch-int", 600, true)).toEqual([]);
    expect(w("dw-bosch-int", 616, true)).toEqual([]);
    expect(w("dw-bosch-int", 599.9, true).join()).toMatch(/600 mm to 616 mm/);
    expect(w("dw-bosch-int", 616.1, true).join()).toMatch(/600 mm to 616 mm/);
    expect(w("range-free", 30)).toEqual([]);
    expect(w("range-free", 29.99).join()).toMatch(/at least 30 in/);
    expect(w("range-slide", 29 + 15 / 16)).toEqual([]);
    expect(w("range-slide", 30 + 1 / 16)).toEqual([]);
    expect(w("range-slide", 29.93).join()).toMatch(/29 15\/16 in to 30 1\/16 in/);
    expect(w("range-slide", 30.07).join()).toMatch(/29 15\/16 in to 30 1\/16 in/);
    expect(w("fridge", 0).join()).toMatch(/no width: type it/);
    expect(w("fridge", 36)).toEqual([]);
    // What a preset starts at: the maker's width, or none to type.
    expect(openingStart("dw-bosch", true)).toBeCloseTo(0.61, 12);
    expect(openingStart("dw-bosch", false)).toBeCloseTo(24 * IN, 12);
    expect(openingStart("range-slide", false)).toBeCloseTo(30 * IN, 12);
    expect(openingStart("fridge", false)).toBe(0);
    expect(openingStart("other", true)).toBe(0);
  });

  it("a dishwasher's height under the countertop: the tops of the cabinets beside it", () => {
    const row = (kind: keyof typeof APPLIANCES, height: number, m = false) => {
      const u = m ? MM : IN;
      const a = cab(1, base(m, { height: height * u, openRight: kind, openRightWidth: openingStart(kind, m) }));
      const b = cab(2, base(m, { height: height * u }), placeNext(a, base(m), "right"));
      return rowChecks([a, b], [a, b], m);
    };
    // GE's printed tolerance, 34-1/2" plus or minus 1/4" (Figure A): 34-1/4" to 34-3/4".
    expect(row("dw-ge", 34.25)).toEqual([]);
    expect(row("dw-ge", 34.5)).toEqual([]);
    expect(row("dw-ge", 34.24).join()).toMatch(/34 1\/4 in to 34 3\/4 in/);
    expect(row("dw-ge", 34.75)).toEqual([]);
    expect(row("dw-ge", 34.76).join()).toMatch(/34 3\/4 in/);
    expect(row("dw-ge", 870, true)).toEqual([]);
    expect(row("dw-ge", 869, true).join()).toMatch(/869 mm/);
    expect(row("dw-bosch", 33 + 7 / 8)).toEqual([]);
    expect(row("dw-bosch", 33.87).join()).toMatch(/at least 33 7\/8 in/);
    expect(row("dw-bosch", 860, true)).toEqual([]);
    expect(row("dw-bosch", 859.9, true).join()).toMatch(/860 mm/);
    expect(row("dw-bosch-int", 870, true)).toEqual([]);
    expect(row("dw-bosch-int", 870.1, true).join()).toMatch(/813 mm to 870 mm/);
    expect(row("dw-bosch-int", 812.9, true).join()).toMatch(/813 mm to 870 mm/);
    // The lower of the two tops beside it is the countertop's underside.
    const lo = cab(1, base(false, { openRight: "dw-ge", openRightWidth: 24 * IN }));
    const hi = (h: number) => cab(2, base(false, { height: h * IN }), placeNext(lo, base(), "right"));
    expect(rowChecks([lo, hi(34.5)], [lo, hi(34.5)], false)).toEqual([]);
    expect(rowChecks([lo, hi(34.24)], [lo, hi(34.24)], false).join()).toMatch(/beside Cab 1 and Cab 2: the countertop's underside would be 34.24 in/);
    // Lifted onto a frame, the tops are higher: the check reads where they stand.
    const a = cab(1, base(false, { height: 30.5 * IN, base: "none", openRight: "dw-ge", openRightWidth: 24 * IN }), translation([0, 0, 4 * IN]));
    expect(rowChecks([a], [a], false)).toEqual([]);
  });

  it("a cabinet over a range deeper than 13 in, and one over an over-the-range microwave", () => {
    const r = cab(1, base(false, { openRight: "range-free", openRightWidth: 30 * IN }));
    // A wall cabinet over the range's opening, its back on the wall, 54 in up.
    const over = (depth: number, x = 24) => cab(2, wall(false, { depth: depth * IN }), translation([x * IN, 23.25 * IN - depth * IN, 54 * IN]));
    expect(rowChecks([r], [r, over(13)], false)).toEqual([]);
    expect(rowChecks([r], [r, over(13.01)], false).join()).toMatch(/at most 13 in/);
    // Beside the range, not over it: nothing to say.
    expect(rowChecks([r], [r, over(15, 54)], false)).toEqual([]);
    expect(rowChecks([r], [r, over(15, -30)], false)).toEqual([]);
    const otr = (bottom: number, width = 30, depth = 13) => {
      const s = wall(false, { otr: true, width: width * IN, depth: depth * IN });
      const c = cab(3, s, translation([0, 0, bottom * IN]));
      return [...trimChecks(s, false), ...rowChecks([c], [c], false)];
    };
    expect(otr(66)).toEqual([]);
    expect(otr(65.99).join()).toMatch(/66 in/);
    expect(otr(66, 30.1).join()).toMatch(/Filler Panel Kit/);
    expect(otr(66, 29).join()).toMatch(/29 in, narrower/);
    expect(otr(66, 29).join()).not.toMatch(/Filler Panel Kit/);
    expect(otr(66, 30.1).join()).not.toMatch(/narrower/);
    expect(otr(66, 36).join()).toMatch(/Filler Panel Kit/);
    expect(otr(66, 36).join()).not.toMatch(/narrower/);
    expect(otr(66, 30).join()).not.toMatch(/narrower|Filler Panel Kit/);
    expect(otr(66, 30, 13.01).join()).toMatch(/at most 13 in/);
  });
});

describe("the settings are kept", () => {
  it("a cabinet that leaves them alone stores none of them; one that sets them gets them back", () => {
    for (const m of [false, true]) {
      const d = normalize({ ...defaults(m) } as Partial<Sizes> & Record<string, unknown>, m);
      const kept = pack(d, m).d;
      for (const k of Object.keys(trimDefaults(m))) expect(kept).not.toHaveProperty(k);
      const s: Sizes = { ...d, endLeft: "panel", endRight: "scribe", endStock: "doors", endDown: "box", endFront: "carcass", endBand: "frontTopBottom", endScribe: 0.02, fillerLeft: 0.04, fillerRight: 0.06, openLeft: "fridge", openRight: "range-slide", openLeftWidth: 0.9, openRightWidth: 0.762, kickSkin: "back", sinkWidth: 0.8, sinkApron: true, otr: true };
      expect(unpack(JSON.parse(JSON.stringify(pack(s, m))), m)).toEqual(s);
    }
  });

  it("reads a damaged or hostile document's values as their defaults", () => {
    const s = normalize({ ...defaults(false), endLeft: "wall" as never, fillerLeft: Number.NaN, openRight: "otr" as never, openRightWidth: "24" as never, kickSkin: "lumber" as never, otr: "yes" as never, sinkApron: 1 as never }, false);
    const d = trimDefaults(false);
    expect([s.endLeft, s.fillerLeft, s.openRight, s.openRightWidth, s.kickSkin, s.otr, s.sinkApron]).toEqual([d.endLeft, d.fillerLeft, d.openRight, d.openRightWidth, d.kickSkin, d.otr, d.sinkApron]);
  });

  it("a base frame's skin is kept with its settings, and an unknown one is none", () => {
    expect(normalizeBase({ ...baseDefaults(true), skin: "back" }, true).skin).toBe("back");
    expect(normalizeBase({ ...baseDefaults(true), skin: "oak" as never }, true).skin).toBe("none");
    expect(normalizeBase(null, false).skin).toBe("none");
  });
});

