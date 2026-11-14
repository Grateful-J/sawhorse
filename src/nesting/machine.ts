// Measured CNC features for a nested blank. Every loop comes from a face of the part.
// A loop that does not sit inside the blank is left out: nothing here invents a cut.
//
// A flat-bed router cuts from one face. Each part is drawn as seen from above with the face
// its cuts are in facing up (the "up" face): a left and a right side, mirror images of each
// other, come out mirror images in the file, so neither is cut as a copy of the other. Cuts
// in the other face (rare) are kept apart as `flip`, drawn where they are when looking down
// through the part, for a second setup.
import type { V3 } from "../kernel/types";

/** 0.1 mm: a face on the blank's skin, and a circle that is not round, both stop here. */
const EPS = 1e-4;

export interface FaceLoop {
  /** The face's outer ring. */
  points: V3[];
  /** Its inner rings (holes in the face). */
  holes?: V3[][];
  normal: V3;
  /** A point on the face plane. */
  origin: V3;
}

export interface MachineLoop {
  loop: [number, number][];
  depth: number;
}

export interface MachineDrill extends MachineLoop {
  center: [number, number];
  diameter: number;
  /** Through the part: `depth` is its thickness. */
  through: boolean;
}

export interface FaceFeatures {
  pockets: MachineLoop[];
  drills: MachineDrill[];
}

/** Profile, pockets and drills in the blank's face, origin at its low corner, seen from above
 * with the up face up. */
export interface BlankFeatures extends FaceFeatures {
  /** The outline, when it is not the rectangle (a notch): counter-clockwise. */
  profile: [number, number][] | null;
  /** Openings through the part that are not round. */
  cutouts: [number, number][][];
  /** Cuts in the face that is down while the up face is cut. */
  flip: FaceFeatures;
  /** A loop was left out because it crossed the blank, or the outline could not be traced. */
  skipped: boolean;
}

type P2 = [number, number];

const nearly = (a: number, b: number) => Math.abs(a - b) <= Math.max(EPS, Math.abs(b) * 1e-6);

/** The one axis whose extent is `target`, or null when none or two are. */
function axisOf(ext: number[], target: number, used: number[]): number | null {
  const hits = [0, 1, 2].filter((i) => !used.includes(i) && nearly(ext[i], target));
  return hits.length === 1 ? hits[0] : null;
}

function area(loop: P2[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function inside(p: P2, dx: number, dy: number): boolean {
  return p[0] >= -EPS && p[0] <= dx + EPS && p[1] >= -EPS && p[1] <= dy + EPS;
}

/** A loop that is a circle: at least 8 points, radii within 0.1 mm or 2%. The vertices of a
 * drilled ring lie on the circle, so their mean radius is the hole's radius. */
function asCircle(loop: P2[]): { center: P2; diameter: number } | null {
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
  return { center: [cx, cy], diameter: 2 * r };
}

function pointIn(p: P2, ring: P2[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Every edge runs along u or along v. */
function rectilinear(ring: P2[]): boolean {
  return ring.every((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return Math.abs(p[0] - q[0]) <= EPS || Math.abs(p[1] - q[1]) <= EPS;
  });
}

/** Drop vertices on a straight run, and repeated ones. */
function simplify(ring: P2[]): P2[] {
  let out = ring.filter((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9;
  });
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) <= 1e-12) {
        out = out.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * The outline of the union of rectilinear rings: the grid of their vertex coordinates, the
 * cells inside any ring, and the boundary between filled and empty cells, chained into loops
 * (counter-clockwise outer). Returns the loop of largest area, or null.
 */
function unionOutline(rings: P2[][]): P2[] | null {
  const key = (x: number) => Math.round(x * 1e7);
  const uniq = (xs: number[]) => {
    const m = new Map<number, number>();
    for (const x of xs) if (!m.has(key(x))) m.set(key(x), x);
    return [...m.values()].sort((a, b) => a - b);
  };
  const xs = uniq(rings.flatMap((r) => r.map((p) => p[0])));
  const ys = uniq(rings.flatMap((r) => r.map((p) => p[1])));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;
  const filled: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    filled[i] = [];
    for (let j = 0; j < ny; j++) {
      const c: P2 = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      filled[i][j] = rings.some((r) => pointIn(c, r));
    }
  }
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && filled[i][j];
  // Directed edges with the filled cell on the left.
  const edges: [number, number, number, number][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!filled[i][j]) continue;
      if (!at(i, j - 1)) edges.push([i, j, i + 1, j]);
      if (!at(i + 1, j)) edges.push([i + 1, j, i + 1, j + 1]);
      if (!at(i, j + 1)) edges.push([i + 1, j + 1, i, j + 1]);
      if (!at(i - 1, j)) edges.push([i, j + 1, i, j]);
    }
  }
  const from = new Map<string, number[]>();
  edges.forEach((e, k) => {
    const id = `${e[0]},${e[1]}`;
    const list = from.get(id);
    if (list) list.push(k);
    else from.set(id, [k]);
  });
  const used = new Set<number>();
  let best: P2[] | null = null;
  let bestArea = 0;
  for (let k0 = 0; k0 < edges.length; k0++) {
    if (used.has(k0)) continue;
    const ring: P2[] = [];
    let k = k0;
    for (let guard = 0; guard <= edges.length; guard++) {
      used.add(k);
      const e = edges[k];
      ring.push([xs[e[0]], ys[e[1]]]);
      const next = (from.get(`${e[2]},${e[3]}`) ?? []).find((c) => !used.has(c));
      if (next === undefined) break;
      k = next;
    }
    const a = area(ring);
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return best ? simplify(best) : null;
}

function isRectangle(h: P2[], dx: number, dy: number): boolean {
  if (h.length !== 4) return false;
  const corners: P2[] = [
    [0, 0],
    [dx, 0],
    [dx, dy],
    [0, dy],
  ];
  const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;
  return corners.every((c) => h.some((p) => near(p, c))) && h.every((p) => corners.some((c) => near(p, c)));
}

/** Same loop within EPS: same centroid, same area. */
function sameLoop(a: P2[], b: P2[]): boolean {
  const c = (l: P2[]) => l.reduce<P2>((s, p) => [s[0] + p[0] / l.length, s[1] + p[1] / l.length], [0, 0]);
  const ca = c(a);
  const cb = c(b);
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= EPS && Math.abs(Math.abs(area(a)) - Math.abs(area(b))) <= Math.max(EPS * EPS, Math.abs(area(a)) * 1e-3);
}

/** The sign of the permutation (u, v, t) of the axes (0, 1, 2). */
function parity(u: number, v: number, t: number): 1 | -1 {
  const p = [u, v, t];
  let inv = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) inv++;
  return inv % 2 === 0 ? 1 : -1;
}

/**
 * Features of one blank. `size` is the cut-list box [thickness, width, length].
 * `turned` means the length runs across the sheet.
 * Loops are in the part's coordinates (world, for a placed solid). When the blank is not
 * axis-aligned to those coordinates, no feature is emitted.
 */
export function machineBlank(size: V3, loops: FaceLoop[], turned: boolean): BlankFeatures {
  const empty = (): BlankFeatures => ({ profile: null, cutouts: [], pockets: [], drills: [], flip: { pockets: [], drills: [] }, skipped: false });
  const pts = loops.flatMap((l) => l.points);
  if (pts.length < 4) return empty();
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
    return { ...empty(), skipped: inset };
  }
  const uAxis = turned ? wAxis : lAxis;
  const vAxis = turned ? lAxis : wAxis;
  const dx = hi[uAxis] - lo[uAxis];
  const dy = hi[vAxis] - lo[vAxis];
  const raw = (p: V3): P2 => [p[uAxis] - lo[uAxis], p[vAxis] - lo[vAxis]];
  let skipped = false;

  // Faces across the thickness: the skin (top and bottom) and the floors of cuts.
  type Floor = { loop: P2[]; depth: number; side: 1 | -1 };
  const floors: Floor[] = [];
  const skin: { [side: number]: { outer: P2[][]; holes: P2[][] } } = { 1: { outer: [], holes: [] }, [-1]: { outer: [], holes: [] } };
  for (const face of loops) {
    if (Math.abs(face.normal[tAxis]) < 0.999) continue;
    const coord = face.points.reduce((s, p) => s + p[tAxis], 0) / face.points.length;
    const loop = face.points.map(raw);
    if (loop.length < 3 || loop.some((p) => !inside(p, dx, dy))) {
      skipped = true;
      continue;
    }
    if (Math.abs(coord - hi[tAxis]) <= EPS || Math.abs(coord - lo[tAxis]) <= EPS) {
      const side = Math.abs(coord - hi[tAxis]) <= EPS ? 1 : -1;
      skin[side].outer.push(loop);
      for (const h of face.holes ?? []) {
        const hl = h.map(raw);
        if (hl.length >= 3 && hl.every((p) => inside(p, dx, dy))) skin[side].holes.push(hl);
        else skipped = true;
      }
      continue;
    }
    // A floor faces the opening it is the bottom of.
    const side: 1 | -1 = face.normal[tAxis] > 0 ? 1 : -1;
    const depth = side > 0 ? hi[tAxis] - coord : coord - lo[tAxis];
    if (depth > EPS) floors.push({ loop, depth, side });
  }

  // Up: the face with the most cuts in it (the top, hi, when none or tied).
  const count = (side: 1 | -1) => floors.filter((f) => f.side === side).length;
  const up: 1 | -1 = count(-1) > count(1) ? -1 : 1;
  // The file's x runs with u and its y against v (the sheet's y runs down), so the face the
  // file shows from above is the one whose outward normal is e_u x (-e_v) = -parity * e_t.
  // When that is not the up face, mirror u.
  const mirror = parity(uAxis, vAxis, tAxis) * -1 !== up;
  const view = (p: P2): P2 => (mirror ? [dx - p[0], p[1]] : p);
  const viewLoop = (l: P2[]) => {
    const out = l.map(view);
    return mirror ? out.reverse() : out;
  };

  const sides: Record<string, FaceFeatures> = { up: { pockets: [], drills: [] }, down: { pockets: [], drills: [] } };
  for (const f of floors) {
    const into = sides[f.side === up ? "up" : "down"];
    const loop = viewLoop(f.loop);
    const circle = asCircle(loop);
    if (circle) into.drills.push({ loop, depth: f.depth, center: circle.center, diameter: circle.diameter, through: false });
    else into.pockets.push({ loop, depth: f.depth });
  }

  // Openings in both skins at the same place go through.
  const cutouts: P2[][] = [];
  const thickness = ext[tAxis];
  for (const h of skin[1].holes) {
    if (!skin[-1].holes.some((o) => sameLoop(h, o))) continue;
    const loop = viewLoop(h);
    const circle = asCircle(loop);
    if (circle) sides.up.drills.push({ loop, depth: thickness, center: circle.center, diameter: circle.diameter, through: true });
    else cutouts.push(loop);
  }

  // The outline: the union of both skins' outer rings, traced when every edge is square.
  let profile: P2[] | null = null;
  const outers = [...skin[1].outer, ...skin[-1].outer];
  if (outers.length) {
    if (outers.every(rectilinear)) {
      const traced = unionOutline(outers);
      if (traced && traced.length >= 3 && traced.every((p) => inside(p, dx, dy))) {
        if (!isRectangle(traced, dx, dy)) {
          const v = viewLoop(traced);
          profile = area(v) < 0 ? v.reverse() : v;
        }
      } else skipped = true;
    } else {
      // A curved or sloped edge: one skin face that covers the blank is the outline.
      const whole = outers.find((o) => Math.abs(Math.abs(area(o)) - Math.max(...outers.map((x) => Math.abs(area(x))))) <= 1e-12);
      if (whole && whole.every((p) => inside(p, dx, dy))) {
        const v = viewLoop(whole);
        if (!isRectangle(simplify(v), dx, dy)) profile = area(v) < 0 ? v.reverse() : v;
      } else skipped = true;
    }
  }

  return { profile, cutouts, pockets: sides.up.pockets, drills: sides.up.drills, flip: sides.down, skipped };
}
