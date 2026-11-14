import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { apply, baseDefaults, compose, cutRows, IDENTITY, invert, lineUp, normalizeBase, placeNext, planBase, rightOf, rowOf, sections, sleepers, touchesRight, translation, type Cab, type Frame } from "../../plugins/cabinet-generator/row.js";

const IN = 0.0254;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const inches = (v: number) => Math.round((v / IN) * 1000) / 1000;
const cab = (id: number, width: number, world: Frame = IDENTITY, depth = 23.25 * IN, height = 30.5 * IN): Cab => ({ id, name: `Cab ${id}`, width: width * IN, depth, height, world });
/** A cabinet's carcass corners in the model. */
const box = (c: Cab) => {
  const pts = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => apply(c.world, [i * c.width, j * c.depth, k * c.height]))));
  return [0, 1, 2].map((a) => [r6(Math.min(...pts.map((p) => p[a]))), r6(Math.max(...pts.map((p) => p[a])))]);
};
const turned = (deg: number, at: [number, number, number]): Frame => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return { linear: [[c, -s, 0], [s, c, 0], [0, 0, 1]], translation: at };
};

describe("frames", () => {
  it("inverts a turned, moved frame", () => {
    const m = turned(30, [1, 2, 3]);
    const back = compose(invert(m), m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(back.linear[i][j]).toBeCloseTo(i === j ? 1 : 0, 12);
    for (const v of back.translation) expect(v).toBeCloseTo(0, 12);
  });
});

describe("rows", () => {
  it("places a cabinet against the right and left of another, backs in line, on its floor", () => {
    const a = cab(1, 24, turned(90, [1, 1, 0.1]));
    const r = { ...cab(2, 18), world: placeNext(a, { width: 18 * IN, depth: 23.25 * IN }, "right") };
    expect(touchesRight(a, r)).toBe(true);
    const l = { ...cab(3, 15, IDENTITY, 12 * IN), world: placeNext(a, { width: 15 * IN, depth: 12 * IN }, "left") };
    // A shallower cabinet: its back on the same wall.
    expect(touchesRight(l, a)).toBe(true);
    expect(rowOf([r, a, l], 1).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(rightOf([r, a, l], 3).map((c) => c.id)).toEqual([1, 2]);
  });

  it("turns an inside corner: back on the next wall, side a filler in front of the corner cabinet", () => {
    const a = cab(1, 36);
    const d = 23.25 * IN;
    const right = { ...cab(2, 24), world: placeNext(a, { width: 24 * IN, depth: d }, "cornerRight", 3 * IN) };
    // Back at the row's right end (x = 36), its front facing -x, spanning y from -3 in forward.
    expect(box(right)).toEqual([[r6(36 * IN - d), r6(36 * IN)], [r6(-27 * IN), r6(-3 * IN)], [0, r6(30.5 * IN)]]);
    expect(apply(right.world, [0, -1, 0])[0]).toBeLessThan(36 * IN - d);
    const left = { ...cab(3, 24), world: placeNext(a, { width: 24 * IN, depth: d }, "cornerLeft", 3 * IN) };
    expect(box(left)).toEqual([[0, r6(d)], [r6(-27 * IN), r6(-3 * IN)], [0, r6(30.5 * IN)]]);
    // Going on down the new wall: right of the right corner, left of the left one.
    const next = { ...cab(4, 18), world: placeNext(right, { width: 18 * IN, depth: d }, "right") };
    expect(box(next)[1]).toEqual([r6(-45 * IN), r6(-27 * IN)]);
    expect(rowOf([a, right, next], 2).map((c) => c.id)).toEqual([2, 4]);
  });

  it("does not take cabinets apart, turned, or at another height for a row", () => {
    const a = cab(1, 24);
    expect(touchesRight(a, cab(2, 24, translation([24.1 * IN, 0, 0])))).toBe(false);
    expect(touchesRight(a, cab(2, 24, translation([24 * IN, 0, 0.01])))).toBe(false);
    expect(touchesRight(a, cab(2, 24, turned(1, [24 * IN, 0, 0])))).toBe(false);
    // Wall cabinets of two heights, tops level: a row.
    expect(touchesRight(cab(1, 30, IDENTITY, 12 * IN, 30 * IN), cab(2, 30, translation([30 * IN, 0, 6 * IN]), 12 * IN, 24 * IN))).toBe(true);
  });

  it("lines cabinets up: the longest row stays, the others join it in order", () => {
    const a = cab(1, 24);
    const b = { ...cab(2, 18), world: placeNext(a, { width: 18 * IN, depth: 23.25 * IN }, "right") };
    // Dropped roughly: one past the right end, a little turned; one off to the left, forward.
    const c = cab(3, 36, turned(3, [45 * IN, 1 * IN, 0.02]));
    const d = cab(4, 15, translation([-20 * IN, -2 * IN, 0]));
    const moved = lineUp([c, a, d, b]);
    expect([...moved.keys()].sort()).toEqual([3, 4]);
    const all = [a, b, { ...c, world: moved.get(3)! }, { ...d, world: moved.get(4)! }];
    expect(rowOf(all, 1).map((x) => x.id)).toEqual([4, 1, 2, 3]);
    expect(box(all[2])).toEqual([[r6(42 * IN), r6(78 * IN)], [0, r6(23.25 * IN)], [0, r6(30.5 * IN)]]);
    expect(box(all[3])[0]).toEqual([r6(-15 * IN), 0]);
  });
});

describe("base frame", () => {
  const row = (...widths: number[]) => {
    const out: Cab[] = [];
    for (const w of widths) out.push({ ...cab(out.length + 1, w), world: out.length ? placeNext(out[out.length - 1], { width: w * IN, depth: 23.25 * IN }, "right") : IDENTITY });
    return out;
  };
  const b = (o = {}) => normalizeBase({ ...baseDefaults(false), ...o }, false);

  it("breaks ladders at cabinet joints, each no longer than the longest piece", () => {
    expect(sections(0, 78, [24, 42], 47).map((s) => s.map(r6))).toEqual([[0, 42], [42, 78]]);
    // A 60 in cabinet alone is halved.
    expect(sections(0, 60, [], 47)).toEqual([[0, 30], [30, 60]]);
    expect(sections(0, 40, [24], 47)).toEqual([[0, 40]]);
  });

  it("puts sleepers at the ends, under each joint, and no further apart than the spacing", () => {
    const T = 0.75;
    // 0..42 with a joint at 24: ends at 0 and 41.25, joint sleeper at 23.625, one between 0 and 23.625.
    expect(sleepers(0, 42, [24], T, 16).map(r6)).toEqual([0, 11.8125, 23.625, 32.4375, 41.25]);
  });

  it("plans a ladder for each run that fits a 4 x 4 sheet, with dados, and lists its cuts", () => {
    const p = planBase(row(24, 18, 36), b());
    expect(p.error).toBeNull();
    expect(inches(p.length)).toBe(78);
    expect(p.ladders).toBe(2);
    for (const part of p.parts) {
      const a = audit(part.mesh);
      expect(a.problems, part.name).toEqual([]);
    }
    const cuts = cutRows(p.parts).map((r) => [r.name, r.qty, inches(r.length), inches(r.width), inches(r.thickness)]);
    const T = 23 / 32;
    // Sleepers: rails 3 in back from the front, flush at the back, tongues in 1/4 in dados less 0.5 mm.
    const sleeper = inches(23.25 * IN - 3 * IN - 2 * T * IN + 2 * (0.25 * IN - 0.0005));
    expect(cuts).toEqual([
      ["Base back rail", 1, 42, 4, inches(T * IN)],
      ["Base front rail", 1, 42, 4, inches(T * IN)],
      ["Base back rail", 1, 36, 4, inches(T * IN)],
      ["Base front rail", 1, 36, 4, inches(T * IN)],
      ["Base sleeper", p.sleepers, sleeper, 4, inches(T * IN)],
    ]);
    // Every piece fits the 47 in a 4 x 4 sheet leaves inside the trim.
    expect(Math.max(...cuts.map((c) => c[2] as number))).toBeLessThanOrEqual(47);
    // The front rail stands 3 in back from the carcass front; the back rail at the back.
    const front = p.parts.find((x) => x.name === "Base front rail")!;
    expect(front.copies[0].at.map(inches)).toEqual([0, 3, 0]);
    const back = p.parts.find((x) => x.name === "Base back rail")!;
    expect(back.copies[0].at.map(inches)).toEqual([0, inches(23.25 * IN - T * IN), 0]);
  });

  it("sets the frame back at an exposed end, and follows the shallowest cabinet", () => {
    const r = row(24, 24);
    r[1] = { ...r[1], depth: 12 * IN, world: placeNext(r[0], { width: 24 * IN, depth: 12 * IN }, "right") };
    const p = planBase(r, b({ ends: "both", joints: "butt" }));
    expect(p.error).toBeNull();
    expect(inches(p.depth)).toBe(12);
    // In the first cabinet's axes the frame starts at its back less 12 in.
    expect(p.at.map(inches)).toEqual([0, 11.25, 0]);
    const front = p.parts.find((x) => x.name === "Base front rail")!;
    expect(front.copies[0].at.map(inches)[0]).toBe(3);
    expect(inches(front.blank[0])).toBe(42);
    expect(p.notes.some((n) => n[0] === "Depth")).toBe(true);
  });

  it("refuses a frame with no room for sleepers", () => {
    expect(planBase(row(24), b({ setback: 20 * IN })).error).toMatch(/no room/);
  });
});
