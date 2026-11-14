import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import type { V3 } from "../kernel/types";
import { featureLayers, nestingDxf } from "./dxf";
import { smallNesting } from "./fixture";
import { machineBlank, type BlankFeatures, type FaceLoop } from "./machine";

const IN = 0.0254;

function face(normal: V3, points: V3[]): FaceLoop {
  return { normal, origin: points[0], points };
}

/** An axis-aligned box from the origin, as six outward faces. */
function box(sx: number, sy: number, sz: number, extra: FaceLoop[] = []): FaceLoop[] {
  return [
    face([-1, 0, 0], [[0, 0, 0], [0, 0, sz], [0, sy, sz], [0, sy, 0]]),
    face([1, 0, 0], [[sx, 0, 0], [sx, sy, 0], [sx, sy, sz], [sx, 0, sz]]),
    face([0, -1, 0], [[0, 0, 0], [sx, 0, 0], [sx, 0, sz], [0, 0, sz]]),
    face([0, 1, 0], [[0, sy, 0], [0, sy, sz], [sx, sy, sz], [sx, sy, 0]]),
    face([0, 0, -1], [[0, 0, 0], [0, sy, 0], [sx, sy, 0], [sx, 0, 0]]),
    face([0, 0, 1], [[0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz]]),
    ...extra,
  ];
}

describe("measured blanks", () => {
  const size: V3 = [0.75 * IN, 12 * IN, 30 * IN];

  it("a plain box is the rectangle and nothing else", () => {
    const f = machineBlank(size, box(0.75 * IN, 12 * IN, 30 * IN), false);
    expect(f.profile).toBeNull();
    expect(f.pockets).toEqual([]);
    expect(f.drills).toEqual([]);
    expect(f.skipped).toBe(false);
  });

  it("a corner notch replaces the rectangle and stays inside it", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const notch = 0.5 * IN;
    const dado = t / 3;
    // Thickness is z. The notch takes the corner at x=0, y=0, so the outline is no longer a rectangle.
    const ring = (z: number): V3[] => [
      [dado, 0, z],
      [l, 0, z],
      [l, w, z],
      [0, w, z],
      [0, notch, z],
      [dado, notch, z],
    ];
    const loops = [face([0, 0, -1], ring(0)), face([0, 0, 1], ring(t))];
    const feat = machineBlank([t, w, l], loops, false);
    expect(feat.profile).not.toBeNull();
    // The notch itself, not a diagonal across it (a convex hull would cut that corner off).
    expect(feat.profile).toHaveLength(6);
    const has = (u: number, v: number) => feat.profile!.some((p) => Math.abs(p[0] - u) < 1e-9 && Math.abs(p[1] - v) < 1e-9);
    // Seen from the top (z = t), u = x runs one way and the file's y the other: the notch is drawn at u = 0..dado.
    expect(has(dado, notch) || has(l - dado, notch)).toBe(true);
    for (const [u, v] of feat.profile!) {
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(l + 1e-6);
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(w + 1e-6);
    }
  });

  it("a mirrored pair is drawn mirrored, each from the face its cuts are in", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const d = t / 3;
    const floor = (x: number, nx: 1 | -1) => face([nx, 0, 0], [
      [x, 1 * IN, 2 * IN],
      [x, 2 * IN, 2 * IN],
      [x, 2 * IN, 5 * IN],
      [x, 1 * IN, 5 * IN],
    ]);
    // A is cut in its +x face, B (A's mirror image) in its -x face.
    const a = machineBlank([t, w, l], box(t, w, l, [floor(t - d, 1)]), false);
    const b = machineBlank([t, w, l], box(t, w, l, [floor(d, -1)]), false);
    const us = (f: typeof a) => f.pockets[0].loop.map((p) => p[0]);
    expect(Math.min(...us(a))).toBeCloseTo(2 * IN, 9);
    expect(Math.max(...us(a))).toBeCloseTo(5 * IN, 9);
    expect(Math.min(...us(b))).toBeCloseTo(l - 5 * IN, 9);
    expect(Math.max(...us(b))).toBeCloseTo(l - 2 * IN, 9);
    for (const f of [a, b]) {
      expect(f.pockets[0].depth).toBeCloseTo(d, 9);
      expect(f.flip.pockets).toEqual([]);
    }
  });

  it("a ring through both faces is a through hole; a cut in the other face is a flip", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const r = 2.5e-3;
    const ring = (z: number): V3[] => Array.from({ length: 16 }, (_, k) => [6 * IN + r * Math.cos((2 * Math.PI * k) / 16), 3 * IN + r * Math.sin((2 * Math.PI * k) / 16), z] as V3);
    const loops = box(l, w, t);
    loops[4] = { ...loops[4], holes: [ring(0)] };
    loops[5] = { ...loops[5], holes: [ring(t)] };
    const pocketAt = (z: number, nz: 1 | -1, u0: number) => face([0, 0, nz], [
      [u0, IN, z],
      [u0 + IN, IN, z],
      [u0 + IN, 2 * IN, z],
      [u0, 2 * IN, z],
    ]);
    loops.push(pocketAt(t - t / 3, 1, 10 * IN), pocketAt(t - t / 3, 1, 14 * IN), pocketAt(t / 4, -1, 20 * IN));
    const f = machineBlank([t, w, l], loops, false);
    expect(f.drills).toHaveLength(1);
    expect(f.drills[0].through).toBe(true);
    expect(f.drills[0].depth).toBeCloseTo(t, 9);
    expect(f.drills[0].diameter).toBeCloseTo(2 * r, 6);
    expect(f.pockets).toHaveLength(2);
    expect(f.flip.pockets).toHaveLength(1);
    expect(f.flip.pockets[0].depth).toBeCloseTo(t / 4, 9);
  });

  it("an inset floor is a pocket, and a round floor is a drill", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const depth = t / 3;
    const pocket = face([-1, 0, 0], [
      [depth, 1 * IN, 2 * IN],
      [depth, 4 * IN, 2 * IN],
      [depth, 4 * IN, 8 * IN],
      [depth, 1 * IN, 8 * IN],
    ]);
    const r = 0.5 * IN;
    const ring: V3[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (2 * Math.PI * k) / 16;
      ring.push([depth, 6 * IN + r * Math.cos(a), 15 * IN + r * Math.sin(a)]);
    }
    const drill = face([-1, 0, 0], ring);
    const feat = machineBlank([t, w, l], box(t, w, l, [pocket, drill]), false);
    expect(feat.profile).toBeNull();
    expect(feat.pockets).toHaveLength(1);
    expect(feat.pockets[0].depth).toBeCloseTo(depth, 9);
    expect(feat.drills).toHaveLength(1);
    expect(feat.drills[0].diameter).toBeCloseTo(2 * r, 6);
    expect(feat.drills[0].depth).toBeCloseTo(depth, 9);
    expect(feat.drills[0].through).toBe(false);
    for (const loop of [feat.pockets[0].loop, feat.drills[0].loop]) {
      for (const [u, v] of loop) {
        expect(u).toBeGreaterThanOrEqual(-1e-6);
        expect(v).toBeGreaterThanOrEqual(-1e-6);
        expect(u).toBeLessThanOrEqual(l + 1e-6);
        expect(v).toBeLessThanOrEqual(w + 1e-6);
      }
    }
  });

  // A part standing at an angle, measured along its own directions (the cut list's box).
  describe("with the part's own directions", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const d = t / 3;
    type M = [V3, V3, V3];
    /** Rotation by `deg` about `axis` (Rodrigues). */
    const rotation = (axis: V3, deg: number): M => {
      const n = Math.hypot(...axis);
      const [x, y, z] = axis.map((c) => c / n);
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = 1 - c;
      return [
        [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
        [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
        [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
      ];
    };
    const mul = (m: M, p: V3): V3 => [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2], m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2]];
    const turn = (m: M, loops: FaceLoop[]): FaceLoop[] => loops.map((f) => ({ normal: mul(m, f.normal), origin: mul(m, f.origin), points: f.points.map((q) => mul(m, q)), holes: f.holes?.map((h) => h.map((q) => mul(m, q))) }));
    /** Three square floors of different sizes in the face x = t (`side` 1) or x = 0 (-1), at
     * (y, z) centres that are not in a line: enough to tell a part from its mirror image. */
    const marks: { c: [number, number]; a: number }[] = [
      { c: [1.5 * IN, 3 * IN], a: 1 * IN },
      { c: [4 * IN, 12 * IN], a: 0.6 * IN },
      { c: [9 * IN, 24 * IN], a: 0.3 * IN },
    ];
    const part = (side: 1 | -1): FaceLoop[] =>
      box(t, w, l, marks.map(({ c, a }) => {
        const x = side > 0 ? t - d : d;
        const ring: V3[] = [[x, c[0] - a / 2, c[1] - a / 2], [x, c[0] + a / 2, c[1] - a / 2], [x, c[0] + a / 2, c[1] + a / 2], [x, c[0] - a / 2, c[1] + a / 2]];
        return face([side, 0, 0], ring);
      }));
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    /** The turn of the three marks seen from outside the face they are cut in: +1 or -1. */
    const seen = (side: 1 | -1) => {
      const [a, b, c] = marks.map((m) => [0, m.c[0], m.c[1]] as V3);
      return Math.sign(cross(sub(b, a), sub(c, a))[0] * side);
    };
    /** The same turn in the file: x runs with u and y against v (the sheet's y runs down). */
    const drawn = (f: BlankFeatures) => {
      const centre = (loop: [number, number][]): [number, number] => [loop.reduce((k, q) => k + q[0], 0) / loop.length, -loop.reduce((k, q) => k + q[1], 0) / loop.length];
      const size = (loop: [number, number][]) => Math.max(...loop.map((q) => q[0])) - Math.min(...loop.map((q) => q[0]));
      const [a, b, c] = [...f.pockets].sort((p, q) => size(q.loop) - size(p.loop)).map((k) => centre(k.loop));
      return { turn: Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])), ab: Math.hypot(b[0] - a[0], b[1] - a[1]), ac: Math.hypot(c[0] - a[0], c[1] - a[1]) };
    };
    const turns: [string, M][] = [
      ["square on", rotation([0, 0, 1], 0)],
      ["a quarter turn", rotation([0, 0, 1], 90)],
      ["30 degrees", rotation([0, 0, 1], 30)],
      ["half a degree", rotation([0, 0, 1], 0.5)],
      ["tipped over", rotation([1, 2, 3], 77)],
    ];
    const signs: V3[] = [];
    for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) signs.push([a, b, c]);

    it.each(turns)("%s: the cuts are found, the same distances apart, and never as the mirror image", (_name, m) => {
      for (const side of [1, -1] as const) {
        for (const turned of [false, true]) {
          for (const sg of signs) {
            // The box's directions may point either way along each edge (a left-handed set too).
            const frame: M = [mul(m, [sg[0], 0, 0]), mul(m, [0, sg[1], 0]), mul(m, [0, 0, sg[2]])];
            const f = machineBlank([t, w, l], turn(m, part(side)), turned, frame);
            expect(f.skipped).toBe(false);
            expect(f.pockets).toHaveLength(3);
            expect(f.flip.pockets).toEqual([]);
            for (const k of f.pockets) expect(k.depth).toBeCloseTo(d, 9);
            const got = drawn(f);
            expect(got.turn).toBe(seen(side));
            expect(got.ab).toBeCloseTo(Math.hypot(marks[1].c[0] - marks[0].c[0], marks[1].c[1] - marks[0].c[1]), 9);
            expect(got.ac).toBeCloseTo(Math.hypot(marks[2].c[0] - marks[0].c[0], marks[2].c[1] - marks[0].c[1]), 9);
            // Along the sheet: the length, or the width when the part is turned.
            const us = f.pockets.flatMap((k) => k.loop.map((q) => q[0]));
            expect(Math.max(...us)).toBeLessThanOrEqual((turned ? w : l) + 1e-9);
          }
        }
      }
    });

    it("square on, the same answer with and without the directions", () => {
      for (const side of [1, -1] as const) {
        const plain = machineBlank([t, w, l], part(side), false);
        expect(drawn(plain).turn).toBe(seen(side));
        expect(machineBlank([t, w, l], part(side), false, [[1, 0, 0], [0, 1, 0], [0, 0, 1]])).toEqual(plain);
      }
    });

    it("at an angle without the directions: the cuts are named as left out, never dropped quietly", () => {
      const m = rotation([0, 0, 1], 30);
      const f = machineBlank([t, w, l], turn(m, part(1)), false);
      expect(f.pockets).toEqual([]);
      expect(f.skipped).toBe(true);
      // A notch alone (no floor inside the part) is named too.
      const notched = box(t, w, l);
      notched.push(face([0, -1, 0], [[0, IN, 0], [t, IN, 0], [t, IN, IN], [0, IN, IN]]));
      expect(machineBlank([t, w, l], turn(m, notched), false).skipped).toBe(true);
      // A plain box has nothing to leave out.
      expect(machineBlank([t, w, l], turn(m, box(t, w, l)), false).skipped).toBe(false);
      // Directions that are not the part's (a stale cut list) are not used.
      const wrong = machineBlank([t, w, l], turn(m, part(1)), false, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      expect(wrong.pockets).toEqual([]);
      expect(wrong.skipped).toBe(true);
    });

    it("a square part: measured along the cut list's length, and named without it", () => {
      const sq = 20 * IN;
      const floor = face([1, 0, 0], [[t - d, 2 * IN, 3 * IN], [t - d, 4 * IN, 3 * IN], [t - d, 4 * IN, 10 * IN], [t - d, 2 * IN, 10 * IN]]);
      const loops = box(t, sq, sq, [floor]);
      expect(machineBlank([t, sq, sq], loops, false).skipped).toBe(true);
      // Length along z: the pocket is 7 in along the sheet and 2 in across it.
      const along = machineBlank([t, sq, sq], loops, false, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      expect(along.skipped).toBe(false);
      const span = (f: BlankFeatures, k: 0 | 1) => Math.max(...f.pockets[0].loop.map((q) => q[k])) - Math.min(...f.pockets[0].loop.map((q) => q[k]));
      expect(span(along, 0)).toBeCloseTo(7 * IN, 9);
      expect(span(along, 1)).toBeCloseTo(2 * IN, 9);
      // Length along y: the same pocket lies the other way.
      const across = machineBlank([t, sq, sq], loops, false, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]);
      expect(span(across, 0)).toBeCloseTo(2 * IN, 9);
      expect(span(across, 1)).toBeCloseTo(7 * IN, 9);
    });
  });

  it("leaves out a loop that crosses the blank", () => {
    const t = 0.75 * IN;
    const w = 12 * IN;
    const l = 30 * IN;
    const stray = face([-1, 0, 0], [
      [t / 3, -IN, 0],
      [t / 3, IN, 0],
      [t / 3, IN, IN],
      [t / 3, -IN, IN],
    ]);
    const feat = machineBlank([t, w, l], box(t, w, l, [stray]), false);
    expect(feat.pockets).toEqual([]);
    expect(feat.skipped).toBe(true);
  });
});

describe("DXF measured cuts", () => {
  type E = { type: string; layer: string; vertices?: { x: number; y: number }[]; center?: { x: number; y: number }; radius?: number };
  const parse = (text: string) => (new DxfParser().parseSync(text) as unknown as { entities: E[] }).entities;
  const features = (dx: number, dy: number): BlankFeatures => ({
    profile: [
      [0, 0],
      [dx * 0.9, 0],
      [dx * 0.9, dy * 0.1],
      [dx, dy * 0.1],
      [dx, dy],
      [0, dy],
    ],
    cutouts: [],
    pockets: [{ loop: [[0.01, 0.01], [0.02, 0.01], [0.02, 0.02], [0.01, 0.02]], depth: 0.006 }],
    drills: [{ loop: [], center: [0.05, 0.05], depth: 0.012, diameter: 0.004, through: false }, { loop: [], center: [0.06, 0.05], depth: 0.018, diameter: 0.005, through: true }],
    flip: { pockets: [], drills: [] },
    skipped: false,
  });

  it("a nesting with no features is the rectangle file", () => {
    const n = smallNesting();
    expect(nestingDxf(n, "lwpolyline", new Map())).toBe(nestingDxf(n));
  });

  it("a notch replaces the rectangle; a pocket and each hole size are on their own layers, holes as circles", () => {
    const n = smallNesting();
    const q = n.pieces[1].placements[0];
    const text = nestingDxf(n, "lwpolyline", new Map([[q.tag, features(q.dx, q.dy)]]));
    const all = parse(text);
    const part = all.filter((e) => e.type === "LWPOLYLINE" && e.layer === "SHEET-02");
    expect(part).toHaveLength(1);
    expect(part[0].vertices?.length).toBe(6);
    const pockets = all.filter((e) => e.layer === "POCKET_6MM");
    expect(pockets).toHaveLength(1);
    const blind = all.filter((e) => e.layer === "DRILL_D4MM_12MM");
    const thru = all.filter((e) => e.layer === "DRILL_D5MM_THRU");
    expect(blind.map((e) => e.type)).toEqual(["CIRCLE"]);
    expect(thru.map((e) => e.type)).toEqual(["CIRCLE"]);
    expect(blind[0].radius).toBeCloseTo(2, 9);
    const xs = (part[0].vertices ?? []).map((v) => v.x);
    const ys = (part[0].vertices ?? []).map((v) => v.y);
    const within = (v: { x: number; y: number }) => v.x >= Math.min(...xs) - 1e-3 && v.x <= Math.max(...xs) + 1e-3 && v.y >= Math.min(...ys) - 1e-3 && v.y <= Math.max(...ys) + 1e-3;
    expect((pockets[0].vertices ?? []).every(within)).toBe(true);
    expect(within(blind[0].center!)).toBe(true);
    // No depth text in the cut layers.
    expect(all.filter((e) => e.type === "TEXT" && e.layer !== "LABELS")).toEqual([]);
  });

  it("one sheet per file: the sheet's corner at the origin, outlines on PROFILE_THRU", () => {
    const n = smallNesting();
    const q = n.pieces[1].placements[0];
    const text = nestingDxf(n, "lwpolyline", new Map([[q.tag, features(q.dx, q.dy)]]), { piece: 1 });
    const all = parse(text);
    const stock = all.filter((e) => e.layer === "STOCK")[0];
    expect(Math.min(...stock.vertices!.map((v) => v.x))).toBe(0);
    expect(Math.min(...stock.vertices!.map((v) => v.y))).toBe(0);
    expect(all.filter((e) => e.layer === "PROFILE_THRU")).toHaveLength(n.pieces[1].placements.length);
    expect(all.some((e) => e.layer.startsWith("SHEET-"))).toBe(false);
    // Each part is labelled with its name as well as its tag.
    const labels = (new DxfParser().parseSync(text) as unknown as { entities: { type: string; text?: string }[] }).entities.filter((e) => e.type === "TEXT").map((e) => e.text);
    for (const p of n.pieces[1].placements) expect(labels).toContain(`${p.tag} ${p.name}`);
    // R12 layer names take no point.
    expect(nestingDxf(n, "r12", new Map([[q.tag, features(q.dx, q.dy)]]), { piece: 1 })).toContain("POCKET_6MM");
    expect(featureLayers({ ...features(1, 1), pockets: [{ loop: [], depth: 0.00635 }] }, true).pockets).toEqual(["POCKET_6P35MM"]);
  });
});
