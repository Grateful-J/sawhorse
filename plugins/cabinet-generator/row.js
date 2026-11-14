// @ts-check
// Rows of cabinets, and the base frame a row stands on. Pure (no app calls), so it is tested
// on its own; main.js reads the model and makes the changes.
//
// A cabinet's own axes: x across (0 at its left side, seen from the front), y front to back
// (0 at the carcass front, the doors in front of it), z up (0 at its bottom). Its `world`
// frame maps those into the model. A row is cabinets standing side by side: turned the same
// way, each against the last one's right side, backs in line (on the wall), on one floor.
import { MATERIALS } from "./cabinet.js";
import { partMesh } from "./mesh.js";

const IN = 0.0254;
const MM = 0.001;
/** Closer than this, two cabinets touch and their backs are in line. */
export const TOUCH = 0.5 * MM;
/** A sleeper's tongue is this much shorter than its dado, so the shoulders close (as the cabinet's rails). */
const TONGUE_SHORT = 0.5 * MM;

/** @typedef {[number, number, number]} V3 */
/** @typedef {{ linear: number[][], translation: V3 }} Frame */
/** A cabinet as a row sees it: its box and where it stands.
 * @typedef {{ id: number, name: string, width: number, depth: number, height: number, world: Frame }} Cab */
/** Where a new cabinet goes against another.
 * @typedef {"right" | "left" | "cornerRight" | "cornerLeft"} Place */

/** @type {Frame} */
export const IDENTITY = { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0] };

/** a after b. @param {Frame} a @param {Frame} b @returns {Frame} */
export function compose(a, b) {
  return {
    linear: a.linear.map((row) => [0, 1, 2].map((c) => row[0] * b.linear[0][c] + row[1] * b.linear[1][c] + row[2] * b.linear[2][c])),
    translation: /** @type {V3} */ ([0, 1, 2].map((r) => a.linear[r][0] * b.translation[0] + a.linear[r][1] * b.translation[1] + a.linear[r][2] * b.translation[2] + a.translation[r])),
  };
}

/** @param {Frame} m @param {V3} p @returns {V3} */
export const apply = (m, p) => /** @type {V3} */ ([0, 1, 2].map((r) => m.linear[r][0] * p[0] + m.linear[r][1] * p[1] + m.linear[r][2] * p[2] + m.translation[r]));

/** @param {Frame} m @param {V3} v @returns {V3} */
export const applyVector = (m, v) => /** @type {V3} */ ([0, 1, 2].map((r) => m.linear[r][0] * v[0] + m.linear[r][1] * v[1] + m.linear[r][2] * v[2]));

/** @param {V3} t @returns {Frame} */
export const translation = (t) => ({ linear: IDENTITY.linear, translation: t });

/** @param {Frame} m @returns {Frame} */
export function invert(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m.linear;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!(Math.abs(det) > 1e-12)) throw new Error("A cabinet's transform cannot be inverted.");
  const L = [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
  const t = m.translation;
  return { linear: L, translation: /** @type {V3} */ ([0, 1, 2].map((r) => -(L[r][0] * t[0] + L[r][1] * t[1] + L[r][2] * t[2]))) };
}

/** Turned a quarter right, seen from above (x to -y): a cabinet around a corner at a row's right end. */
const TURN_RIGHT = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]];
/** Turned a quarter left (x to +y): around a corner at a row's left end. */
const TURN_LEFT = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];

/** b in a's own axes. @param {Cab} a @param {Cab} b */
const relative = (a, b) => compose(invert(a.world), b.world);

/** Turned the same way (within a hair: a rotation typed or snapped). @param {Frame} r */
export const unturned = (r) => [0, 1, 2].every((i) => [0, 1, 2].every((j) => Math.abs(r.linear[i][j] - (i === j ? 1 : 0)) < 1e-6));

/** b stands against a's right side: turned the same way, backs in line, on a's floor (or tops level, as wall cabinets).
 * @param {Cab} a @param {Cab} b */
export function touchesRight(a, b) {
  const r = relative(a, b);
  if (!unturned(r)) return false;
  const [x, y, z] = r.translation;
  return Math.abs(x - a.width) < TOUCH && Math.abs(y + b.depth - a.depth) < TOUCH && (Math.abs(z) < TOUCH || Math.abs(z + b.height - a.height) < TOUCH);
}

/** The row a cabinet is in, left to right (just itself when nothing touches it).
 * @template {Cab} C @param {C[]} cabs @param {number} id @returns {C[]} */
export function rowOf(cabs, id) {
  const start = cabs.find((c) => c.id === id);
  if (!start) return [];
  const row = [start];
  const seen = new Set([id]);
  for (let c = start; ; ) {
    const n = cabs.find((o) => !seen.has(o.id) && touchesRight(c, o));
    if (!n) break;
    row.push(n);
    seen.add(n.id);
    c = n;
  }
  for (let c = start; ; ) {
    const n = cabs.find((o) => !seen.has(o.id) && touchesRight(o, c));
    if (!n) break;
    row.unshift(n);
    seen.add(n.id);
    c = n;
  }
  return row;
}

/** The cabinets right of this one in its row, nearest first (they move when it grows).
 * @template {Cab} C @param {C[]} cabs @param {number} id @returns {C[]} */
export function rightOf(cabs, id) {
  const row = rowOf(cabs, id);
  return row.slice(row.findIndex((c) => c.id === id) + 1);
}

/**
 * Where a new cabinet (`size`) stands against `anchor`, as a world frame:
 * - right, left: against its side, backs in line, on its floor;
 * - cornerRight, cornerLeft: around an inside corner at that end, turned a quarter, its back
 *   on the next wall (in line with the anchor's end) and its side `filler` in front of the
 *   anchor's carcass, for the doors and pulls to clear (a filler strip covers the gap).
 * @param {Cab} anchor @param {{ width: number, depth: number }} size @param {Place} where @param {number} [filler]
 * @returns {Frame}
 */
export function placeNext(anchor, size, where, filler = 0) {
  const { width: w, depth: d } = size;
  /** @type {Frame} */
  let local;
  if (where === "right") local = translation([anchor.width, anchor.depth - d, 0]);
  else if (where === "left") local = translation([-w, anchor.depth - d, 0]);
  else if (where === "cornerRight") local = { linear: TURN_RIGHT, translation: [anchor.width - d, -filler, 0] };
  else local = { linear: TURN_LEFT, translation: [d, -filler - w, 0] };
  return compose(anchor.world, local);
}

/**
 * Line cabinets up into one straight row: the longest row among them stays where it is; the
 * others join it in the order they stand along it (nearest its middle first, outward), each
 * turned its way, backs in line, on its floor. Returns each moved cabinet's new world frame.
 * @param {Cab[]} cabs @returns {Map<number, Frame>}
 */
export function lineUp(cabs) {
  /** @type {Cab[]} */
  let keep = [];
  for (const c of cabs) {
    const r = rowOf(cabs, c.id);
    if (r.length > keep.length) keep = r;
  }
  const out = new Map();
  if (!keep.length) return out;
  const inv = invert(keep[0].world);
  const along = (/** @type {Cab} */ c) => apply(inv, apply(c.world, [c.width / 2, c.depth / 2, c.height / 2]))[0];
  const keepLength = relative(keep[0], keep[keep.length - 1]).translation[0] + keep[keep.length - 1].width;
  const rest = cabs.filter((c) => !keep.includes(c)).sort((a, b) => along(a) - along(b));
  const right = rest.filter((c) => along(c) >= keepLength / 2);
  const left = rest.filter((c) => along(c) < keepLength / 2).reverse();
  let end = keep[keep.length - 1];
  for (const c of right) {
    const world = placeNext(end, c, "right");
    out.set(c.id, world);
    end = { ...c, world };
  }
  let start = keep[0];
  for (const c of left) {
    const world = placeNext(start, c, "left");
    out.set(c.id, world);
    start = { ...c, world };
  }
  return out;
}

// --- the base frame -----------------------------------------------------------------------

/**
 * A ladder frame a row stands on (cabinets with no toe kick): a front rail set back for the
 * toes, a back rail, and sleepers between them, under every joint between cabinets and no
 * further apart than `spacing`. A row longer than a sheet (or a board) is split into
 * ladders at the joints between cabinets, each its own frame, screwed together.
 * @typedef {{
 *   height: number, setback: number, backInset: number, ends: "none" | "left" | "right" | "both",
 *   stock: "plywood" | "lumber", thickness: number, joints: "dado" | "butt", dadoDepth: number, fit: number,
 *   spacing: number, maxLength: number,
 * }} BaseSizes
 */

/** @param {boolean} metric @returns {BaseSizes} */
export function baseDefaults(metric) {
  return metric
    ? // 100 mm plinth, 75 mm toe space: the cabinet's own toe kick. A 1220 x 1220 sheet less a
      // 12 mm trim each side is 1196: rails up to 1190 nest on a 4 x 4 bed.
      { height: 100 * MM, setback: 75 * MM, backInset: 0, ends: "none", stock: "plywood", thickness: 18 * MM, joints: "dado", dadoDepth: 6 * MM, fit: 0.2 * MM, spacing: 400 * MM, maxLength: 1190 * MM }
    : // 4 x 3 in, as the toe kick; a 48 in sheet less the CNC preset's 1/2 in trim each side is 47.
      { height: 4 * IN, setback: 3 * IN, backInset: 0, ends: "none", stock: "plywood", thickness: (23 / 32) * IN, joints: "dado", dadoDepth: 0.25 * IN, fit: 0.008 * IN, spacing: 16 * IN, maxLength: 47 * IN };
}

/** What lumber starts at: a 2x4 (1 1/2 in, 38 mm), 8 ft (2400 mm) long. @param {boolean} metric */
export const lumberDefaults = (metric) => (metric ? { thickness: 38 * MM, maxLength: 2400 * MM, joints: /** @type {const} */ ("butt") } : { thickness: 1.5 * IN, maxLength: 96 * IN, joints: /** @type {const} */ ("butt") });

/** @param {Partial<BaseSizes> | null | undefined} saved @param {boolean} metric @returns {BaseSizes} */
export function normalizeBase(saved, metric) {
  const d = baseDefaults(metric);
  const s = /** @type {Record<string, unknown>} */ ({ ...d, ...(saved && typeof saved === "object" ? saved : {}) });
  const num = (/** @type {keyof BaseSizes} */ k) => (typeof s[k] === "number" && Number.isFinite(s[k]) ? /** @type {number} */ (s[k]) : /** @type {number} */ (d[k]));
  return {
    height: num("height"),
    setback: num("setback"),
    backInset: num("backInset"),
    ends: s.ends === "left" || s.ends === "right" || s.ends === "both" ? s.ends : "none",
    stock: s.stock === "lumber" ? "lumber" : "plywood",
    thickness: num("thickness"),
    joints: s.joints === "butt" ? "butt" : "dado",
    dadoDepth: num("dadoDepth"),
    fit: num("fit"),
    spacing: num("spacing"),
    maxLength: num("maxLength"),
  };
}

/** Lumber for a base frame: not sheet goods (its name has no "ply"), so the cut list counts boards. */
export const BASE_LUMBER = { name: "Base lumber", color: /** @type {[number, number, number, number]} */ ([214, 184, 140, 255]) };

/** The row laid out along its first cabinet: where each cabinet starts, the row's length and the frame's depth.
 * @param {Cab[]} row */
export function rowLayout(row) {
  const starts = row.map((c) => relative(row[0], c).translation[0]);
  const length = starts[starts.length - 1] + row[row.length - 1].width;
  const depth = Math.min(...row.map((c) => c.depth));
  return { starts, length, depth, depths: new Set(row.map((c) => Math.round(c.depth / TOUCH))).size };
}

/**
 * Why a base frame cannot be made for these sizes, or null.
 * @param {BaseSizes} b @param {number} depth the row's carcass depth (the shallowest)
 */
export function baseIssue(b, depth) {
  const T = b.thickness;
  if (!(b.height > 0)) return "The base frame needs a height.";
  if (!(T > 0)) return "The base frame needs a stock thickness.";
  if (!(b.setback >= 0) || !(b.backInset >= 0)) return "The setback and back inset cannot be less than 0.";
  if (!(depth - b.setback - b.backInset - 2 * T >= 2 * IN)) return "The setback and back inset leave no room for sleepers between the rails.";
  if (b.joints === "dado" && !(b.dadoDepth > 0 && b.dadoDepth <= T / 2)) return "The dado depth must be more than 0 and no more than half the stock.";
  if (!(b.spacing > 2 * T)) return "The sleeper spacing must be more than two thicknesses.";
  if (!(b.maxLength >= 6 * T)) return "The longest piece is too short.";
  return null;
}

/** @param {number} n @returns {string} "A", "B" ... "Z", "AA" */
const letter = (n) => (n < 26 ? String.fromCharCode(65 + n) : letter(Math.floor(n / 26) - 1) + letter(n % 26));

/**
 * Where the ladders break: at joints between cabinets, each ladder no longer than the
 * longest piece; a cabinet longer than that is split evenly.
 * @param {number} x0 @param {number} x1 @param {number[]} joints interior joints, left to right @param {number} max
 * @returns {[number, number][]}
 */
export function sections(x0, x1, joints, max) {
  /** @type {[number, number][]} */
  const out = [];
  let a = x0;
  const inside = joints.filter((j) => j > x0 + TOUCH && j < x1 - TOUCH);
  while (x1 - a > max + 1e-9) {
    const fits = inside.filter((j) => j > a + TOUCH && j - a <= max + 1e-9);
    if (fits.length) {
      const b = fits[fits.length - 1];
      out.push([a, b]);
      a = b;
    } else {
      // No joint near enough: split the stretch to the next joint evenly.
      const next = inside.find((j) => j > a + TOUCH) ?? x1;
      const k = Math.ceil((next - a) / max - 1e-9);
      const step = (next - a) / k;
      for (let i = 0; i < k - 1; i++) {
        out.push([a, a + step]);
        a += step;
      }
      if (next < x1) {
        out.push([a, next]);
        a = next;
      }
    }
  }
  out.push([a, x1]);
  return out;
}

/**
 * The sleepers of one ladder (their left edges): one at each end, one centred under each
 * joint between cabinets inside it, and more between so none are further apart than the
 * spacing, centre to centre.
 * @param {number} a @param {number} b @param {number[]} joints @param {number} T @param {number} spacing
 */
export function sleepers(a, b, joints, T, spacing) {
  const xs = [a, b - T];
  for (const j of joints) if (j - T / 2 >= a + T + TOUCH && j + T / 2 <= b - T - TOUCH) xs.push(j - T / 2);
  xs.sort((p, q) => p - q);
  const out = [xs[0]];
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    const k = Math.ceil(gap / spacing - 1e-9);
    for (let m = 1; m < k; m++) out.push(xs[i - 1] + (gap * m) / k);
    out.push(xs[i]);
  }
  return out;
}

/**
 * Plan the base frame of a row: its parts in the frame's own axes (x along the row from the
 * first cabinet's left side, y = 0 at the front of the shallowest carcass, z = 0 the floor),
 * where that frame sits in the first cabinet's axes (`at`, before it is dropped to the
 * floor), and its cut list.
 * @param {Cab[]} row @param {BaseSizes} b @param {string} [carcassMaterial]
 */
export function planBase(row, b, carcassMaterial = MATERIALS.carcass.name) {
  const { starts, length, depth, depths } = rowLayout(row);
  const error = baseIssue(b, depth);
  /** @type {import("./cabinet.js").Part[]} */
  const parts = [];
  if (error) return { error, parts, length, depth, depths, at: /** @type {V3} */ ([0, 0, 0]), ladders: 0, sleepers: 0, notes: /** @type {string[][]} */ ([]) };
  const T = b.thickness;
  const H = b.height;
  const material = b.stock === "lumber" ? BASE_LUMBER.name : carcassMaterial;
  const dd = b.joints === "dado" ? b.dadoDepth : 0;
  const x0 = b.ends === "left" || b.ends === "both" ? b.setback : 0;
  const x1 = length - (b.ends === "right" || b.ends === "both" ? b.setback : 0);
  const joints = starts.slice(1);
  const yf = b.setback;
  const yb = depth - b.backInset;
  const sleeperLen = yb - yf - 2 * T + 2 * Math.max(0, dd - TONGUE_SHORT);
  const ladders = sections(x0, x1, joints, b.maxLength);
  /** Rails by shape, so identical ladders share one part. @type {Map<string, import("./cabinet.js").Part>} */
  const rails = new Map();
  /** @type {{ at: V3, name: string }[]} */
  const sleeperCopies = [];
  ladders.forEach(([a, c], i) => {
    const xs = sleepers(a, c, joints, T, b.spacing);
    const len = c - a;
    /** Each sleeper's dado in a rail, across its inner face. */
    const cuts = dd ? xs.map((x) => [Math.max(0, x - a - b.fit / 2), Math.min(len, x - a + T + b.fit / 2)]) : [];
    const tag = letter(i);
    for (const [which, y, inner] of /** @type {const} */ ([["Front", yf, T - dd], ["Back", yb - T, 0]])) {
      const name = `Base ${which.toLowerCase()} rail`;
      const key = `${name}|${len.toFixed(6)}|${cuts.map((q) => q.map((v) => v.toFixed(6)).join(",")).join(";")}`;
      let part = rails.get(key);
      if (!part) {
        const prisms = cuts.map(([p, q]) => ({ min: /** @type {V3} */ ([p, inner, 0]), max: /** @type {V3} */ ([q, inner + dd, H]) }));
        part = { name, material, blank: [len, T, H], copies: [], mesh: partMesh(name, [len, T, H], prisms), grain: "none" };
        rails.set(key, part);
      }
      part.copies.push({ at: [a, y, 0], name: `${which} rail ${tag}` });
    }
    xs.forEach((x, k) => sleeperCopies.push({ at: [x, yf + T - Math.max(0, dd - TONGUE_SHORT), 0], name: `Sleeper ${tag}${k + 1}` }));
  });
  parts.push(...rails.values());
  parts.push({ name: "Base sleeper", material, blank: [T, sleeperLen, H], copies: sleeperCopies, mesh: partMesh("Base sleeper", [T, sleeperLen, H]), grain: "none" });
  /** @type {string[][]} */
  const notes = [];
  if (ladders.length > 1) notes.push(["Ladders", `${ladders.length} ladders, each under whole cabinets where it can: set them side by side and screw them together through the end sleepers`]);
  if (dd) notes.push(["Rails", "A dado across each rail's inside face for each sleeper, the stock plus the fit wide, open top and bottom: the ladder comes out square. Glue and screw (or brad) the sleepers in"]);
  else notes.push(["Rails", "Sleepers butt between the rails: glue and screw through the rails into their ends, and check the diagonals"]);
  notes.push(["Setting", "Level the frame on the floor with shims under the sleepers, screw it down, then set the cabinets on it and screw down through their bottoms"]);
  if (depths > 1) notes.push(["Depth", "The cabinets differ in depth: the frame follows the shallowest, backs in line"]);
  return { error: null, parts, length, depth, depths, at: /** @type {V3} */ ([0, row[0].depth - depth, 0]), ladders: ladders.length, sleepers: sleeperCopies.length, notes };
}

/**
 * The cut list of a base frame: one row per part, longest first.
 * @param {import("./cabinet.js").Part[]} parts
 * @returns {{ name: string, qty: number, length: number, width: number, thickness: number, material: string }[]}
 */
export function cutRows(parts) {
  return parts
    .map((p) => {
      const [t, w, l] = [...p.blank].sort((x, y) => x - y);
      return { name: p.name, qty: p.copies.length, length: l, width: w, thickness: t, material: p.material };
    })
    .sort((p, q) => q.length - p.length || p.name.localeCompare(q.name));
}
