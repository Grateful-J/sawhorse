// @ts-check
// Closed meshes for a cabinet part: a box, minus rectangular prisms (a stopped dado, a
// corner notch), plus round blind holes. Every face is wound outward, the same way as a
// plain box, so the kernel accepts it as one solid. A feature that does not change the
// outer corners leaves the bounding box alone: nesting still packs the blank.

/** @typedef {[number, number, number]} V3 */
/** @typedef {{ min: V3, max: V3 }} Prism */
/** A round hole drilled into the face at `at` on `axis`, `depth` deep toward `inward`.
 * `through`: it comes out of the opposite face (`depth` is then the part's thickness).
 * @typedef {{ axis: 0 | 1 | 2, at: number, inward: 1 | -1, center: [number, number], radius: number, depth: number, sides?: number, through?: boolean }} Hole */
/** @typedef {{ name: string, positions: V3[], faces: number[][][], merge_coplanar: boolean }} Mesh */

const EPS = 1e-9;

/** @param {number[]} xs */
function unique(xs) {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  /** @type {number[]} */
  const out = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > EPS) out.push(x);
  return out;
}

/** @param {V3} c @param {Prism} p */
function inPrism(c, p) {
  return c[0] > p.min[0] + EPS && c[0] < p.max[0] - EPS && c[1] > p.min[1] + EPS && c[1] < p.max[1] - EPS && c[2] > p.min[2] + EPS && c[2] < p.max[2] - EPS;
}

/**
 * A box from the origin to `size`, with rectangular voids and blind holes.
 * Prisms may open through a face (a dado that runs to the back, a corner notch).
 * Holes must lie in one face of the result, clear of every prism.
 * @param {string} name
 * @param {V3} size
 * @param {Prism[]} [prisms]
 * @param {Hole[]} [holes]
 * @returns {Mesh}
 */
export function partMesh(name, size, prisms = [], holes = []) {
  if (size.some((s) => !(s > 0))) throw new Error(`${name}: every size must be positive`);
  // A prism that runs past the blank (a dado out through the top) is cut at the blank:
  // outside it there is nothing to remove.
  prisms = prisms
    .map((p) => ({
      min: /** @type {V3} */ (p.min.map((v, k) => Math.max(0, Math.min(size[k], v)))),
      max: /** @type {V3} */ (p.max.map((v, k) => Math.max(0, Math.min(size[k], v)))),
    }))
    .filter((p) => p.min.every((v, k) => p.max[k] - v > EPS));
  const cuts = /** @type {[number[], number[], number[]]} */ ([0, 1, 2].map((axis) => unique([0, size[axis], ...prisms.flatMap((p) => [p.min[axis], p.max[axis]])])));
  const [nx, ny, nz] = cuts.map((c) => c.length - 1);
  /** @type {boolean[][][]} */
  const mat = [];
  for (let ix = 0; ix < nx; ix++) {
    mat[ix] = [];
    for (let iy = 0; iy < ny; iy++) {
      mat[ix][iy] = [];
      for (let iz = 0; iz < nz; iz++) {
        const c = /** @type {V3} */ ([(cuts[0][ix] + cuts[0][ix + 1]) / 2, (cuts[1][iy] + cuts[1][iy + 1]) / 2, (cuts[2][iz] + cuts[2][iz + 1]) / 2]);
        mat[ix][iy][iz] = !prisms.some((p) => inPrism(c, p));
      }
    }
  }
  /** @param {number} ix @param {number} iy @param {number} iz */
  const live = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && mat[ix][iy][iz];

  /** @type {V3[]} */
  const positions = [];
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @param {V3} p */
  const vid = (p) => {
    const k = p.map((v) => Math.round(v * 1e9)).join(",");
    let i = index.get(k);
    if (i === undefined) {
      i = positions.length;
      positions.push([p[0], p[1], p[2]]);
      index.set(k, i);
    }
    return i;
  };
  /** @type {number[][][]} */
  const faces = [];
  /** @param {V3[]} loop */
  const add = (loop) => faces.push([loop.map(vid)]);

  // The six windings of a plain box (outward), on one grid cell.
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let iz = 0; iz < nz; iz++) {
        if (!mat[ix][iy][iz]) continue;
        const x0 = cuts[0][ix];
        const x1 = cuts[0][ix + 1];
        const y0 = cuts[1][iy];
        const y1 = cuts[1][iy + 1];
        const z0 = cuts[2][iz];
        const z1 = cuts[2][iz + 1];
        if (!live(ix - 1, iy, iz)) add([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
        if (!live(ix + 1, iy, iz)) add([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
        if (!live(ix, iy - 1, iz)) add([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
        if (!live(ix, iy + 1, iz)) add([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
        if (!live(ix, iy, iz - 1)) add([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
        if (!live(ix, iy, iz + 1)) add([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      }
    }
  }

  for (const hole of holes) drill(hole, positions, faces, vid);
  if (!faces.length) throw new Error(`${name}: the features remove the whole part`);
  return { name, ...compact(positions, faces), merge_coplanar: prisms.length > 0 || holes.length > 0 };
}

/**
 * The mesh without the vertices no face uses (a hole across several grid quads merges them,
 * and the grid points inside the merged face are left over). Untouched when every vertex is
 * used, so a part with no such hole is exactly what it was.
 * @param {V3[]} positions @param {number[][][]} faces
 */
function compact(positions, faces) {
  const used = new Uint8Array(positions.length);
  for (const f of faces) for (const loop of f) for (const i of loop) used[i] = 1;
  if (used.every((u) => u === 1)) return { positions, faces };
  /** @type {number[]} */
  const to = [];
  /** @type {V3[]} */
  const kept = [];
  positions.forEach((p, i) => {
    if (used[i]) {
      to[i] = kept.length;
      kept.push(p);
    }
  });
  return { positions: kept, faces: faces.map((f) => f.map((loop) => loop.map((i) => to[i]))) };
}

/**
 * A blind hole in a flat face. Where the circle lies inside one quad of the part's grid, that
 * quad takes it. Where it spans several (a cut somewhere else on the part lines up with the
 * hole and splits the face there), the coplanar quads it touches are first merged into one
 * rectangle, which keeps every grid point on its boundary, so the faces round it still meet
 * it edge for edge.
 * @param {Hole} hole
 * @param {V3[]} positions
 * @param {number[][][]} faces
 * @param {(p: V3) => number} vid
 */
function drill(hole, positions, faces, vid) {
  const { axis, at, inward, center, radius, depth } = hole;
  const n = hole.sides ?? 16;
  if (!(radius > 0) || !(depth > 0) || n < 8) throw new Error("a hole needs a radius, a depth and at least 8 sides");
  const axes = /** @type {[number, number]} */ ([0, 1, 2].filter((i) => i !== axis));
  /** @param {number[]} loop */
  const area = (loop) => {
    let a = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = positions[loop[i]];
      const q = positions[loop[(i + 1) % loop.length]];
      a += p[axes[0]] * q[axes[1]] - q[axes[0]] * p[axes[1]];
    }
    return a;
  };
  // The outer ring is f[0]. Later rings are holes already cut in that same face.
  /** @param {number} plane */
  const findFace = (plane) => faces.findIndex((f) => {
    const loop = f[0];
    if (!loop || loop.length < 4) return false;
    if (!loop.every((i) => Math.abs(positions[i][axis] - plane) <= 1e-8)) return false;
    const us = loop.map((i) => positions[i][axes[0]]);
    const vs = loop.map((i) => positions[i][axes[1]]);
    const u0 = Math.min(...us);
    const u1 = Math.max(...us);
    const v0 = Math.min(...vs);
    const v1 = Math.max(...vs);
    if (!(center[0] - radius > u0 + EPS && center[0] + radius < u1 - EPS && center[1] - radius > v0 + EPS && center[1] + radius < v1 - EPS)) return false;
    for (let k = 1; k < f.length; k++) {
      const inner = f[k];
      let cu = 0;
      let cv = 0;
      for (const i of inner) {
        cu += positions[i][axes[0]];
        cv += positions[i][axes[1]];
      }
      cu /= inner.length;
      cv /= inner.length;
      let hr = 0;
      for (const i of inner) hr = Math.max(hr, Math.hypot(positions[i][axes[0]] - cu, positions[i][axes[1]] - cv));
      if (Math.hypot(center[0] - cu, center[1] - cv) <= radius + hr + EPS) return false;
    }
    return true;
  });
  /** A loop's box in the face's plane. @param {number[]} loop */
  const box = (loop) => {
    const us = loop.map((i) => positions[i][axes[0]]);
    const vs = loop.map((i) => positions[i][axes[1]]);
    return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
  };
  /**
   * The face in `plane` that holds the circle, as an entry of `faces`: one quad as built, or
   * the rectangle of coplanar quads the circle touches, merged. `out` is the face's outward
   * normal along the hole's axis (+1 or -1). Null when the circle is not on solid, flat face.
   * @param {number} plane @param {number} out
   */
  const faceFor = (plane, out) => {
    const one = findFace(plane);
    if (one >= 0) return faces[one];
    // Which way a loop of positive area faces: y x z = +x, x x z = -y, x x y = +z.
    const side = axis === 1 ? -1 : 1;
    const c = { u0: center[0] - radius, u1: center[0] + radius, v0: center[1] - radius, v1: center[1] + radius };
    const parts = faces.filter((f) => {
      const loop = f[0];
      if (!loop || loop.length < 4 || !loop.every((i) => Math.abs(positions[i][axis] - plane) <= 1e-8)) return false;
      if (Math.sign(area(loop)) * side !== out) return false;
      const b = box(loop);
      return b.u0 < c.u1 - EPS && b.u1 > c.u0 + EPS && b.v0 < c.v1 - EPS && b.v1 > c.v0 + EPS;
    });
    if (parts.length < 2) return null;
    const boxes = parts.map((f) => box(f[0]));
    const all = { u0: Math.min(...boxes.map((b) => b.u0)), u1: Math.max(...boxes.map((b) => b.u1)), v0: Math.min(...boxes.map((b) => b.v0)), v1: Math.max(...boxes.map((b) => b.v1)) };
    // The circle inside the rectangle, and the quads tiling it: no cut inside it.
    if (!(c.u0 > all.u0 + EPS && c.u1 < all.u1 - EPS && c.v0 > all.v0 + EPS && c.v1 < all.v1 - EPS)) return null;
    const whole = (all.u1 - all.u0) * (all.v1 - all.v0);
    const tiles = boxes.reduce((a, b) => a + (b.u1 - b.u0) * (b.v1 - b.v0), 0);
    if (Math.abs(tiles - whole) > 1e-9 * whole + 1e-15) return null;
    // Each quad is a rectangle of the grid (four corners, or an earlier merge with its
    // boundary points): its loop's area is its box's.
    if (parts.some((f, i) => Math.abs(Math.abs(area(f[0])) / 2 - (boxes[i].u1 - boxes[i].u0) * (boxes[i].v1 - boxes[i].v0)) > 1e-9 * whole + 1e-15)) return null;
    // No other face meets the plane inside the rectangle (at a point, or along an edge): the
    // edges and points inside it go with the quads, so nothing else may use them. The rings of
    // holes already in the quads (and their walls) come along with them, and are not counted.
    /** @type {Set<number>} */
    const rings = new Set();
    for (const f of parts) for (const loop of f.slice(1)) for (const i of loop) rings.add(i);
    const inside = (/** @type {number} */ i, /** @type {number} */ j) => {
      if (rings.has(i) && rings.has(j)) return false;
      const p = positions[i];
      const q = positions[j];
      if (Math.abs(p[axis] - plane) > 1e-8 || Math.abs(q[axis] - plane) > 1e-8) return false;
      const mu = (p[axes[0]] + q[axes[0]]) / 2;
      const mv = (p[axes[1]] + q[axes[1]]) / 2;
      return mu > all.u0 + EPS && mu < all.u1 - EPS && mv > all.v0 + EPS && mv < all.v1 - EPS;
    };
    if (faces.some((f) => !parts.includes(f) && f.some((loop) => loop.some((i, k) => inside(i, i) || inside(i, loop[(k + 1) % loop.length]))))) return null;
    // Its boundary: every vertex of the quads that lies on it, in order round it.
    /** @type {Set<number>} */
    const ids = new Set();
    for (const f of parts) for (const i of f[0]) ids.add(i);
    const on = (/** @type {number} */ x, /** @type {number} */ edge) => Math.abs(x - edge) <= 1e-8;
    const u = (/** @type {number} */ i) => positions[i][axes[0]];
    const v = (/** @type {number} */ i) => positions[i][axes[1]];
    const rim = [...ids].filter((i) => on(u(i), all.u0) || on(u(i), all.u1) || on(v(i), all.v0) || on(v(i), all.v1));
    const bottom = rim.filter((i) => on(v(i), all.v0)).sort((a, b) => u(a) - u(b));
    const right = rim.filter((i) => on(u(i), all.u1) && !on(v(i), all.v0)).sort((a, b) => v(a) - v(b));
    const top = rim.filter((i) => on(v(i), all.v1) && !on(u(i), all.u1)).sort((a, b) => u(b) - u(a));
    const left = rim.filter((i) => on(u(i), all.u0) && !on(v(i), all.v0) && !on(v(i), all.v1)).sort((a, b) => v(b) - v(a));
    const loop = [...bottom, ...right, ...top, ...left];
    // Counter-clockwise as built here: turned to face the way the quads did.
    if (Math.sign(area(loop)) !== Math.sign(area(parts[0][0]))) loop.reverse();
    const merged = [loop, ...parts.flatMap((f) => f.slice(1))];
    const first = faces.indexOf(parts[0]);
    for (const f of parts) faces.splice(faces.indexOf(f), 1);
    faces.splice(Math.min(first, faces.length), 0, merged);
    // The circle clear of the holes already in it.
    return findFace(plane) === faces.indexOf(merged) ? merged : null;
  };
  const entry = faceFor(at, -inward);
  if (!entry) throw new Error("a hole does not lie in one face; it crosses a joint or the edge");
  /** @type {V3[]} */
  const ring = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    const p = /** @type {V3} */ ([0, 0, 0]);
    p[axis] = at;
    p[axes[0]] = center[0] + radius * Math.cos(t);
    p[axes[1]] = center[1] + radius * Math.sin(t);
    ring.push(p);
  }
  // The hole winds against the face, so the face keeps its outward normal.
  const ringArea = (() => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      a += p[axes[0]] * q[axes[1]] - q[axes[0]] * p[axes[1]];
    }
    return a;
  })();
  const faceArea = area(entry[0]);
  if (ringArea * faceArea > 0) ring.reverse();
  // A through hole needs its exit in one face too, found before anything is added.
  const exit = hole.through ? faceFor(at + inward * depth, inward) : null;
  if (hole.through && !exit) throw new Error("a through hole does not come out in one face; it crosses a joint or the edge");
  const ids = ring.map(vid);
  entry.push(ids);
  /** @param {V3} p */
  const inset = (p) => {
    const q = /** @type {V3} */ ([p[0], p[1], p[2]]);
    q[axis] += inward * depth;
    return q;
  };
  const floor = [...ids].reverse().map((id) => vid(inset(positions[id])));
  if (hole.through) {
    // The floor ring becomes a hole in the exit face: it already winds against the wall.
    /** @type {number[][]} */ (exit).push(floor);
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      faces.push([[b, a, vid(inset(positions[a])), vid(inset(positions[b]))]]);
    }
    return;
  }
  // Wall: the face's hole edge is A->B, so the wall's opening edge is B->A.
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const b = ids[(i + 1) % ids.length];
    const bp = vid(inset(positions[b]));
    const ap = vid(inset(positions[a]));
    faces.push([[b, a, ap, bp]]);
  }
  faces.push([floor]);
}

/** @param {V3[]} pts */
function loopVolume(pts) {
  let v = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0];
    const b = pts[i];
    const c = pts[i + 1];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v;
}

/**
 * Manifold check and signed volume. A hole loop is wound opposite its face, so its
 * fan subtracts. Quads and convex holes only.
 * @param {Mesh} mesh
 */
export function audit(mesh) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, { n: number, dir: number }>} */
  const edges = new Map();
  let volume = 0;
  const lo = /** @type {V3} */ ([Infinity, Infinity, Infinity]);
  const hi = /** @type {V3} */ ([-Infinity, -Infinity, -Infinity]);
  for (const p of mesh.positions) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  mesh.faces.forEach((f, fi) => {
    if (!f.length || f[0].length < 3) problems.push(`face ${fi} has no outer ring`);
    for (const loop of f) {
      const pts = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a === b) problems.push(`face ${fi} has a zero edge`);
        if (a < 0 || b < 0 || a >= mesh.positions.length || b >= mesh.positions.length) {
          problems.push(`face ${fi} uses a missing vertex`);
          continue;
        }
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        const dir = a < b ? 1 : -1;
        const prev = edges.get(k);
        if (!prev) edges.set(k, { n: 1, dir });
        else {
          prev.n += 1;
          if (prev.dir === dir) problems.push(`edge ${k} is wound twice the same way`);
        }
        pts.push(mesh.positions[a]);
      }
      volume += loopVolume(pts);
    }
  });
  for (const [k, e] of edges) if (e.n !== 2) problems.push(`edge ${k} is used ${e.n} times`);
  return { problems, volume: volume / 6, lo, hi };
}
