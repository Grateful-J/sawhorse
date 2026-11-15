// The cabinet generator's grain-matched fronts (match.js): which stacks can match, the message
// for the ones that cannot, each front its own part in the stack's order, and nothing changed
// when the setting is off (the default).
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, MATERIALS, normalize, plan, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { pack } from "../../plugins/cabinet-generator/keep.js";
import { MATCH_KEY } from "../../plugins/cabinet-generator/match.js";

const preset = (id: string, over: Partial<Sizes> = {}, metric = false): Sizes => ({ ...applyPreset(defaults(metric), id, metric), ...over });
const fronts = (parts: Part[]) => parts.filter((p) => p.together).sort((a, b) => a.together!.index - b.together!.index);
const z = (p: Part) => p.copies[0].at[2];

describe("grain-matched fronts", () => {
  it("is off by default, and off changes nothing: the same parts, and nothing kept in the document for it", () => {
    for (const metric of [false, true]) {
      const d = defaults(metric);
      expect(d.grainMatch).toBe(false);
      expect(normalize({}, metric).grainMatch).toBe(false);
      expect(normalize({ grainMatch: "yes" } as unknown as Partial<Sizes>, metric).grainMatch).toBe(true);
      for (const id of ["drawers", "mixed", "base", "trash", "tall"]) {
        const s = preset(id, {}, metric);
        const p = plan(s, metric);
        expect(p.error).toBeNull();
        expect(p.parts.some((q) => q.together)).toBe(false);
        // A cabinet that leaves it alone stores nothing for it.
        expect("grainMatch" in pack(s, metric).d).toBe(false);
      }
    }
    expect(pack({ ...defaults(false), grainMatch: true }, false).d.grainMatch).toBe(true);
  });

  it("four drawers, grain across: each front its own part, indexed from the bottom up, side by side across the grain", () => {
    const off = plan(preset("drawers", { drawers: 4 }), false);
    const on = plan(preset("drawers", { drawers: 4, grainMatch: true }), false);
    expect(on.error).toBeNull();
    // Off: the identical fronts are one part of several copies.
    const offFronts = off.parts.filter((p) => p.name === "Drawer front");
    expect(offFronts.reduce((k, p) => k + p.copies.length, 0)).toBe(4);
    expect(offFronts.length).toBeLessThan(4);
    const f = fronts(on.parts);
    expect(f).toHaveLength(4);
    expect(f.every((p) => p.copies.length === 1 && p.together!.key === MATCH_KEY && p.together!.stack === "across")).toBe(true);
    expect(f.map((p) => p.together!.index)).toEqual([0, 1, 2, 3]);
    for (let i = 1; i < 4; i++) expect(z(f[i])).toBeGreaterThan(z(f[i - 1]));
    // Everything else as it was.
    const rest = (parts: Part[]) => parts.filter((p) => p.name !== "Drawer front").map((p) => [p.name, p.copies.length]);
    expect(rest(on.parts)).toEqual(rest(off.parts));
    // The same pieces in all: as many copies, the same blanks.
    const pieces = (parts: Part[]) => parts.flatMap((p) => p.copies.map((c) => `${p.name} ${p.blank.map((v) => v.toFixed(6))} ${c.at.map((v) => v.toFixed(6))}`)).sort();
    expect(pieces(on.parts)).toEqual(pieces(off.parts));
  });

  it("vertical grain runs from the top front down, end to end along the grain", () => {
    const p = plan(preset("drawers", { drawers: 3, grainFronts: "vertical", grainMatch: true }), false);
    expect(p.error).toBeNull();
    const f = fronts(p.parts);
    expect(f.map((q) => q.together!.stack)).toEqual(["along", "along", "along"]);
    for (let i = 1; i < f.length; i++) expect(z(f[i])).toBeLessThan(z(f[i - 1]));
    // Each front's grain runs up the cabinet: across its length when it is wider than tall.
    expect(f.every((q) => q.grain === "width")).toBe(true);
  });

  it("a drawer over a door: one stack when both run one way, the drawer front of the door's plywood", () => {
    const s = preset("mixed", { doors: "one", drawers: 1, grainDoors: "vertical", grainFronts: "vertical", grainMatch: true });
    const p = plan(s, false);
    expect(p.error).toBeNull();
    const f = fronts(p.parts);
    expect(f.map((q) => q.name)).toEqual(["Drawer front", "Door"]);
    expect(f.every((q) => q.material === MATERIALS.doors.name)).toBe(true);
    // Off, the drawer front keeps its own plywood.
    const off = plan({ ...s, grainMatch: false }, false);
    expect(off.parts.find((q) => q.name === "Drawer front")!.material).toBe(MATERIALS.drawerFronts.name);
  });

  it("refuses what cannot be one stack, saying what to change", () => {
    const why = (over: Partial<Sizes>, id = "mixed") => plan(preset(id, { grainMatch: true, ...over }), false).error;
    // The defaults: doors vertical, drawer faces across.
    expect(why({ doors: "one", drawers: 1 })).toMatch(/grain to run one way up the stack: the doors' grain is vertical and the drawer faces' across.*Materials › Grain/);
    // A pair of doors stands side by side.
    expect(why({ doors: "two", drawers: 1, grainFronts: "vertical" })).toMatch(/pair of doors stands side by side.*single door/);
    // Two thicknesses are two panels.
    expect(why({ doors: "one", drawers: 1, grainFronts: "vertical", frontThickness: 0.5 * 0.0254 })).toMatch(/one thickness/);
  });

  it("one front or none: nothing to match, nothing changed", () => {
    for (const [id, over] of [
      ["doors", { doors: "one" }],
      ["shelves", {}],
      ["trash", {}],
    ] as const) {
      const p = plan(preset(id, { ...over, grainMatch: true }), false);
      expect(p.error).toBeNull();
      expect(p.parts.some((q) => q.together)).toBe(false);
    }
  });
});
