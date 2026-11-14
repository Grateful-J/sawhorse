import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import type { V3 } from "../kernel/types";
import { nestingDxf } from "./dxf";
import { smallNesting } from "./fixture";
import { machineBlank, type FaceLoop } from "./machine";

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
    expect(feat.profile!.length).toBeGreaterThan(4);
    for (const [u, v] of feat.profile!) {
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(l + 1e-6);
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(w + 1e-6);
    }
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
  it("a nesting with no features is the rectangle file", () => {
    const n = smallNesting();
    expect(nestingDxf(n, "lwpolyline", new Map())).toBe(nestingDxf(n));
  });

  it("a notch replaces the rectangle, and a pocket is on its own layer inside it", () => {
    const n = smallNesting();
    const q = n.pieces[1].placements[0];
    const features = new Map([
      [
        q.tag,
        {
          profile: [
            [0, 0],
            [q.dx * 0.9, 0],
            [q.dx, q.dy * 0.1],
            [q.dx, q.dy],
            [0, q.dy],
          ] as [number, number][],
          pockets: [{ loop: [[0.01, 0.01], [0.02, 0.01], [0.02, 0.02], [0.01, 0.02]] as [number, number][], depth: 0.006 }],
          drills: [{ loop: Array.from({ length: 8 }, (_, i) => {
            const a = (2 * Math.PI * i) / 8;
            return [0.05 + 0.002 * Math.cos(a), 0.05 + 0.002 * Math.sin(a)] as [number, number];
          }), depth: 0.012, diameter: 0.004 }],
          skipped: false,
        },
      ],
    ]);
    const text = nestingDxf(n, "lwpolyline", features);
    expect(text).not.toBe(nestingDxf(n));
    const dxf = new DxfParser().parseSync(text) as unknown as {
      entities: { type: string; layer: string; vertices?: { x: number; y: number }[] }[];
    };
    const part = dxf.entities.filter((e) => e.type === "LWPOLYLINE" && e.layer === "SHEET-02");
    expect(part).toHaveLength(1);
    expect(part[0].vertices?.length).toBe(5);
    const pockets = dxf.entities.filter((e) => e.layer === "POCKETS" && e.type === "LWPOLYLINE");
    const drills = dxf.entities.filter((e) => e.layer === "DRILL" && e.type === "LWPOLYLINE");
    expect(pockets).toHaveLength(1);
    expect(drills).toHaveLength(1);
    const rect = part[0].vertices ?? [];
    const xs = rect.map((v) => v.x);
    const ys = rect.map((v) => v.y);
    const inRect = (vs: { x: number; y: number }[]) => vs.every((v) => v.x >= Math.min(...xs) - 1e-3 && v.x <= Math.max(...xs) + 1e-3 && v.y >= Math.min(...ys) - 1e-3 && v.y <= Math.max(...ys) + 1e-3);
    expect(inRect(pockets[0].vertices ?? [])).toBe(true);
    expect(inRect(drills[0].vertices ?? [])).toBe(true);
  });
});
