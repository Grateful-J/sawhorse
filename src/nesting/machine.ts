// Measured CNC features for a nested blank. Every loop comes from a face of the part.
// A loop that does not sit inside the blank is left out: nothing here invents a cut.
import type { V3 } from "../kernel/types";

/** 0.1 mm: a face on the blank's skin, and a circle that is not round, both stop here. */
const EPS = 1e-4;

export interface FaceLoop {
  points: V3[];
  normal: V3;
  /** A point on the face plane. */
  origin: V3;
}

export interface MachineLoop {
  loop: [number, number][];
  depth: number;
}

export interface MachineDrill extends MachineLoop {
  diameter: number;
}

/** Profile, pockets and drills in the blank's face, origin at its low corner.
 * `profile` is set only when the outline is not the rectangle (a corner notch). */
export interface BlankFeatures {
  profile: [number, number][] | null;
  pockets: MachineLoop[];
  drills: MachineDrill[];
  /** A loop was left out because it crossed the blank. */
  skipped: boolean;
}

const nearly = (a: number, b: number) => Math.abs(a - b) <= Math.max(EPS, Math.abs(b) * 1e-6);

/** The one axis whose extent is `target`, or null when none or two are. */
function axisOf(ext: number[], target: number, used: number[]): number | null {
  const hits = [0, 1, 2].filter((i) => !used.includes(i) && nearly(ext[i], target));
  return hits.length === 1 ? hits[0] : null;
}

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull, counter-clockwise. Duplicate points are dropped. */
function hull(pts: [number, number][]): [number, number][] {
  const key = (p: [number, number]) => `${Math.round(p[0] * 1e9)},${Math.round(p[1] * 1e9)}`;
  const seen = new Set<string>();
  const p = pts.filter((q) => {
    const k = key(q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const lower: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function inside(p: [number, number], dx: number, dy: number): boolean {
  return p[0] >= -EPS && p[0] <= dx + EPS && p[1] >= -EPS && p[1] <= dy + EPS;
}

/** A loop that is a circle: at least 8 points, radii within 0.1 mm or 2% . */
function asCircle(loop: [number, number][]): { diameter: number } | null {
  if (loop.length < 8) return null;
  let cx = 0;
  let cy = 0;
  for (const p of loop) {
    cx += p[0];
    cy += p[1];
  }
  cx /= loop.length;
  cy /= loop.length;
  const rs = loop.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const r = rs.reduce((a, b) => a + b, 0) / rs.length;
  if (!(r > EPS)) return null;
  const tol = Math.max(EPS, 0.02 * r);
  if (rs.some((x) => Math.abs(x - r) > tol)) return null;
  return { diameter: 2 * r };
}

function isRectangle(h: [number, number][], dx: number, dy: number): boolean {
  if (h.length !== 4) return false;
  const corners: [number, number][] = [
    [0, 0],
    [dx, 0],
    [dx, dy],
    [0, dy],
  ];
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;
  return corners.every((c) => h.some((p) => near(p, c))) && h.every((p) => corners.some((c) => near(p, c)));
}

/**
 * Features of one blank. `size` is the cut-list box [thickness, width, length].
 * `turned` means the length runs across the sheet.
 * Loops are in the part's coordinates (world, for a placed solid). When the blank is
 * not axis-aligned to those coordinates, no feature is emitted.
 */
export function machineBlank(size: V3, loops: FaceLoop[], turned: boolean): BlankFeatures {
  const empty: BlankFeatures = { profile: null, pockets: [], drills: [], skipped: false };
  const pts = loops.flatMap((l) => l.points);
  if (pts.length < 4) return empty;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  const ext: V3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const tAxis = axisOf(ext, size[0], []);
  const wAxis = tAxis === null ? null : axisOf(ext, size[1], [tAxis]);
  const lAxis = tAxis === null || wAxis === null ? null : axisOf(ext, size[2], [tAxis, wAxis]);
  if (tAxis === null || wAxis === null || lAxis === null) {
    // An interior face we cannot place on the blank is left out, and named.
    const inset = loops.some((face) =>
      [0, 1, 2].some((k) => {
        let c = 0;
        for (const p of face.points) c += p[k];
        c /= face.points.length;
        const thin = face.points.every((p) => Math.abs(p[k] - c) <= EPS);
        return thin && c > lo[k] + EPS && c < hi[k] - EPS;
      }),
    );
    return { ...empty, skipped: inset };
  }
  const uAxis = turned ? wAxis : lAxis;
  const vAxis = turned ? lAxis : wAxis;
  const dx = hi[uAxis] - lo[uAxis];
  const dy = hi[vAxis] - lo[vAxis];
  const project = (p: V3): [number, number] => [p[uAxis] - lo[uAxis], p[vAxis] - lo[vAxis]];
  const outline = hull(pts.map(project));
  let skipped = false;
  let profile: [number, number][] | null = null;
  if (outline.length >= 3 && outline.every((p) => inside(p, dx, dy)) && !isRectangle(outline, dx, dy)) profile = outline;
  else if (outline.some((p) => !inside(p, dx, dy))) skipped = true;

  const pockets: MachineLoop[] = [];
  const drills: MachineDrill[] = [];
  for (const face of loops) {
    if (Math.abs(face.normal[tAxis]) < 0.999) continue;
    const coord = face.points.reduce((s, p) => s + p[tAxis], 0) / face.points.length;
    if (!(coord > lo[tAxis] + EPS && coord < hi[tAxis] - EPS)) continue;
    const loop = face.points.map(project);
    if (loop.length < 3 || loop.some((p) => !inside(p, dx, dy))) {
      skipped = true;
      continue;
    }
    const depth = Math.min(coord - lo[tAxis], hi[tAxis] - coord);
    if (!(depth > EPS)) continue;
    const circle = asCircle(loop);
    if (circle) drills.push({ loop, depth, diameter: circle.diameter });
    else pockets.push({ loop, depth });
  }
  return { profile, pockets, drills, skipped };
}
