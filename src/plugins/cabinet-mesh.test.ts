import { describe, expect, it } from "vitest";
import { audit, partMesh } from "../../plugins/cabinet-generator/mesh.js";

const IN = 0.0254;

function box(sx: number, sy: number, sz: number, prisms: { min: [number, number, number]; max: [number, number, number] }[] = [], holes: { axis: 0 | 1 | 2; at: number; inward: 1 | -1; center: [number, number]; radius: number; depth: number; sides?: number }[] = []) {
  const mesh = partMesh("part", [sx, sy, sz], prisms, holes);
  const a = audit(mesh);
  expect(a.problems, a.problems.join("\n")).toEqual([]);
  expect(a.lo).toEqual([0, 0, 0]);
  expect(a.hi[0]).toBeCloseTo(sx, 9);
  expect(a.hi[1]).toBeCloseTo(sy, 9);
  expect(a.hi[2]).toBeCloseTo(sz, 9);
  return a.volume;
}

describe("cabinet part meshes", () => {
  it("a plain box is the blank, wound outward", () => {
    expect(box(1, 2, 3)).toBeCloseTo(6, 9);
    const mesh = partMesh("box", [1, 2, 3]);
    expect(mesh.faces).toHaveLength(6);
    expect(mesh.merge_coplanar).toBe(false);
  });

  it("an interior pocket removes only its volume and keeps the blank", () => {
    const full = 0.75 * 12 * 30 * IN ** 3;
    const pocket = (0.25 * 2 * 4) * IN ** 3;
    const v = box(0.75 * IN, 12 * IN, 30 * IN, [{ min: [0, 2 * IN, 10 * IN], max: [0.25 * IN, 4 * IN, 14 * IN] }]);
    expect(v).toBeCloseTo(full - pocket, 12);
  });

  it("a dado open at the back keeps the blank and the groove volume", () => {
    const t = 0.75 * IN;
    const depth = 24 * IN;
    const height = 30 * IN;
    const dado = t / 3;
    const full = t * depth * height;
    const groove = dado * depth * t;
    const v = box(t, depth, height, [{ min: [0, 0, 10 * IN], max: [dado, depth, 10 * IN + t] }]);
    expect(v).toBeCloseTo(full - groove, 12);
  });

  it("a corner notch keeps the blank box", () => {
    const full = 10 * 8 * 0.75 * IN ** 3;
    const notch = (0.25 * 0.5 * 0.75) * IN ** 3;
    const v = box(10 * IN, 8 * IN, 0.75 * IN, [{ min: [0, 0, 0], max: [0.25 * IN, 0.5 * IN, 0.75 * IN] }]);
    expect(v).toBeCloseTo(full - notch, 12);
  });

  it("a blind hole is a round pocket inside one face", () => {
    const r = 2.5 * 0.001;
    const depth = 0.01;
    const v = box(0.1, 0.2, 0.4, [], [{ axis: 0, at: 0, inward: 1, center: [0.1, 0.2], radius: r, depth, sides: 16 }]);
    const hole = Math.PI * r * r * depth;
    // A 16-gon is a little under the circle.
    expect(v).toBeLessThan(0.1 * 0.2 * 0.4 - hole * 0.95);
    expect(v).toBeGreaterThan(0.1 * 0.2 * 0.4 - hole);
  });

  it("two holes share one face", () => {
    const r = 0.01;
    const depth = 0.02;
    const full = 0.2 * 0.3 * 0.05;
    const v = box(0.2, 0.3, 0.05, [], [
      { axis: 2, at: 0.05, inward: -1, center: [0.06, 0.1], radius: r, depth },
      { axis: 2, at: 0.05, inward: -1, center: [0.14, 0.2], radius: r, depth },
    ]);
    const hole = Math.PI * r * r * depth;
    expect(v).toBeLessThan(full - 2 * hole * 0.95);
    expect(v).toBeGreaterThan(full - 2 * hole);
  });

  it("refuses a hole that crosses the edge", () => {
    expect(() => partMesh("part", [0.1, 0.2, 0.4], [], [{ axis: 0, at: 0, inward: 1, center: [0.01, 0.2], radius: 0.02, depth: 0.01 }])).toThrow(/one face/);
  });
});
