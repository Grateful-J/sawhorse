import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { nestingDxf } from "../dxf";
import { smallNesting } from "../fixture";
import type { BlankFeatures } from "../machine";

// Synthetic geometry reproducing the dimension mismatch seen in the user's C2D.
// The layer records depth, not width; this is an export test, not a CAM simulation.
const mm = 0.001;
const features: BlankFeatures = {
  profile: null, cutouts: [], skipped: false,
  pockets: [{ depth: 7.94 * mm, loop: [[10 * mm, 10 * mm], [110 * mm, 10 * mm], [110 * mm, 15.7595 * mm], [10 * mm, 15.7595 * mm]] }],
  drills: [{ depth: 13 * mm, diameter: 5 * mm, through: false, center: [150 * mm, 50 * mm], loop: [] }],
  flip: { pockets: [{ depth: 6.35 * mm, loop: [[30 * mm, 30 * mm], [40 * mm, 30 * mm], [40 * mm, 50 * mm], [30 * mm, 50 * mm]] }], drills: [] },
};
type Entity = { type: string; layer: string; shape?: boolean; vertices?: { x: number; y: number }[]; radius?: number; center?: { x: number; y: number } };

describe.each(["lwpolyline", "r12"] as const)("Shapeoko CAM input DXF: %s", flavour => {
  const n = smallNesting();
  const tag = n.pieces[0].placements[0].tag;
  const text = nestingDxf(n, flavour, new Map([[tag, features]]), { piece: 0 });
  const parsed = new DxfParser().parseSync(text)!;
  const entities = parsed.entities as Entity[];
  const layer = flavour === "r12" ? "POCKET_7P94MM" : "POCKET_7.94MM";
  const flip = flavour === "r12" ? "FLIP_POCKET_6P35MM" : "FLIP_POCKET_6.35MM";
  it("writes millimetres and separates the other face", () => {
    expect(parsed.header.$INSUNITS).toBe(4);
    expect(entities.filter(e => e.layer === layer)).toHaveLength(1);
    expect(entities.filter(e => e.layer === flip)).toHaveLength(1);
  });
  it("preserves the narrow pocket geometry and depth independently", () => {
    const pocket = entities.find(e => e.layer === layer)!;
    expect(pocket.shape).toBe(true);
    const vertices = pocket.vertices!;
    expect(vertices).toHaveLength(4);
    const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5.7595, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6.35);
  });
  it("preserves the hole diameter and depth in a separate layer", () => {
    const name = flavour === "r12" ? "DRILL_D5MM_13MM" : "DRILL_D5MM_13MM";
    const hole = entities.filter(e => e.layer === name);
    expect(hole).toHaveLength(1);
    expect(hole[0].type).toBe("CIRCLE");
    expect(hole[0].radius).toBeCloseTo(2.5, 6);
  });
  it("writes each selected profile and never another sheet's geometry", () => {
    expect(entities.filter(e => e.layer === "PROFILE_THRU")).toHaveLength(n.pieces[0].placements.length);
    expect(entities.some(e => e.layer.startsWith("SHEET-"))).toBe(false);
  });
});
