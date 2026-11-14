// @ts-check
// Closed meshes for a cabinet part: a box, minus rectangular prisms (a stopped dado, a
// corner notch), plus round blind holes. Every face is wound outward, the same way as a
// plain box, so the kernel accepts it as one solid. A feature that does not change the
// outer corners leaves the bounding box alone: nesting still packs the blank.

/** @typedef {[number, number, number]} V3 */
/** @typedef {{ min: V3, max: V3 }} Prism */
/** @typedef {{ axis: 0 | 1 | 2, at: number, inward: 1 | -1, center: [number, number], radius: number, depth: number, sides?: number }} Hole */
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
  return { name, positions, faces, merge_coplanar: prisms.length > 0 || holes.length > 0 };
}

/**
 * A blind hole in a face that is already one quad. The circle stays inside that quad.
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
  const face = faces.findIndex((f) => {
    const loop = f[0];
    if (!loop || loop.length < 4) return false;
    if (!loop.every((i) => Math.abs(positions[i][axis] - at) <= 1e-8)) return false;
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
  if (face < 0) throw new Error("a hole does not lie in one face; it crosses a joint or the edge");
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
  const faceArea = area(faces[face][0]);
  if (ringArea * faceArea > 0) ring.reverse();
  const ids = ring.map(vid);
  faces[face].push(ids);
  /** @param {V3} p */
  const inset = (p) => {
    const q = /** @type {V3} */ ([p[0], p[1], p[2]]);
    q[axis] += inward * depth;
    return q;
  };
  const floor = [...ids].reverse().map((id) => vid(inset(positions[id])));
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
