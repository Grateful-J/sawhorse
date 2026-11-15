// What the edge banding tests compare (cabinet-banding.test.ts on the plugin's meshes,
// cabinet-banding.wasm.test.ts on the kernel's faces): every cut of a part, at its absolute place
// in the cabinet, and each part's box.
//
// A face is a cut's when it is not on the part's own box: a hole's walls and floor, a dado's or
// groove's floor and walls, a notch's faces. Each is keyed by its normal and its box, clipped to
// the region both parts share (a notch that runs out of a banded edge is that much shorter on the
// blank, and nothing else about it changes). Two parts whose cuts are all at the same absolute
// places give the same keys, to a nanometre.

export type P3 = [number, number, number];
export interface Box {
  min: P3;
  max: P3;
}
export interface WorldFace {
  normal: P3;
  points: P3[];
}

export function boxOf(points: P3[]): Box {
  const min: P3 = [Infinity, Infinity, Infinity];
  const max: P3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return { min, max };
}

/** The box both boxes cover. */
export function overlap(a: Box, b: Box): Box {
  return { min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])) as P3, max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) as P3 };
}

/** A ring's normal (Newell), unit length. */
export function normalOf(ring: P3[]): P3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** A plugin part's faces, each copy's, in the cabinet's coordinates (its outer ring). */
export function meshFaces(mesh: { positions: P3[]; faces: number[][][] }, at: P3): WorldFace[] {
  return mesh.faces.map((f) => {
    const points = f[0].map((i) => mesh.positions[i].map((v, k) => v + at[k]) as P3);
    return { normal: normalOf(points), points };
  });
}

/** A part's cuts (its faces off its own box), clipped to `clip`: each its normal, then its box's
 * low and high corners (9 numbers), in a fixed order. */
export function cutKeys(faces: WorldFace[], clip: Box): number[][] {
  const all = boxOf(faces.flatMap((f) => f.points));
  const out: number[][] = [];
  for (const f of faces) {
    const k = f.normal.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-9);
    if (k >= 0 && f.points.every((p) => Math.abs(p[k] - all.min[k]) < 1e-9)) continue;
    if (k >= 0 && f.points.every((p) => Math.abs(p[k] - all.max[k]) < 1e-9)) continue;
    const b = boxOf(f.points);
    const c = overlap(b, clip);
    const flat = (x: Box) => [0, 1, 2].filter((j) => x.max[j] - x.min[j] < 1e-9).length;
    // A cut wholly in the band's place: gone from the blank (the planner refuses that for a notch).
    if (flat(c) > flat(b) || c.min.some((v, j) => v > c.max[j] + 1e-9)) continue;
    out.push([...f.normal, ...c.min, ...c.max]);
  }
  return out.sort(byKey);
}

/** Two keys in order, numbers within 0.1 micrometre counting as equal (float noise in a
 * placement is far smaller; any real difference between cuts is far larger). */
function byKey(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-7) return a[i] - b[i];
  return 0;
}

/** Where two parts' cuts differ (by more than a nanometre), or null when they are the same. */
export function cutsDiffer(a: number[][], b: number[][]): string | null {
  if (a.length !== b.length) return `${a.length} cuts, then ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i].some((v, j) => Math.abs(v - b[i][j]) > 1e-9)) return `cut ${i}: ${JSON.stringify(a[i])} then ${JSON.stringify(b[i])}`;
  }
  return null;
}
