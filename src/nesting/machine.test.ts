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
