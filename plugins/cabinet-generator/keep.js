// @ts-check
// What the plugin keeps in the document (saved inside the .shz, 64 KB for the whole plugin):
// each cabinet's settings and frame, each base frame's. Pure, so it is tested on its own.
//
// - Compact: a cabinet's settings are kept as what differs from a frozen baseline
//   (baseline.js), about a fifth of the whole, so a big kitchen fits.
// - Bounded: every entry for something still in the model is kept; entries for what is not
//   (an undone or replaced cabinet, kept so Undo finds it again) go oldest first while the
//   record is over its budget.
// - Read with suspicion: a document can come from anyone. A frame that is not three finite
//   rows and a finite translation, or cannot be inverted, is not used.
import { BASELINE } from "./baseline.js";
import { normalize } from "./cabinet.js";

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("./row.js").Frame} Frame */
/** A cabinet as kept: what differs from the baseline (`d`, with `m` for the metric one), or
 * (before 1.7.0) the whole settings; its frame; and the parts it was made with (`p`, `n`:
 * the ids of the instance's children when it was made, the first and how many; or `k`, all
 * of them, when they were not one run). Entries without parts (older files) are taken as
 * they were.
 * @typedef {{ d?: Record<string, unknown>, m?: 1, sizes?: Partial<Sizes>, frame?: unknown, p?: number, n?: number, k?: number[] }} Kept */
/** The parts something was made with, as kept beside its settings. @typedef {{ p?: number, n?: number, k?: number[] }} Stamp */

/** What differs from the baseline of the document's units. @param {Sizes} s @param {boolean} metric */
export function pack(s, metric) {
  const base = metric ? BASELINE.mm : BASELINE.in;
  // A setting newer than the baseline is kept only when it is not what reading the cabinet back
  // fills in (normalize's default), so a cabinet that leaves it alone stores nothing for it.
  const filled = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (normalize({ ...base }, metric)));
  /** @type {Record<string, unknown>} */
  const d = {};
  for (const [k, v] of Object.entries(s)) if (base[k] !== v && !(!(k in base) && filled[k] === v)) d[k] = v;
  return metric ? { d, m: /** @type {const} */ (1) } : { d };
}

/** A kept cabinet's settings, whole, in the document's units; null when there are none.
 * @param {Kept | null | undefined} kept @param {boolean} metric @returns {Sizes | null} */
export function unpack(kept, metric) {
  if (!kept || typeof kept !== "object") return null;
  if (kept.d && typeof kept.d === "object" && !Array.isArray(kept.d)) return normalize({ ...(kept.m === 1 ? BASELINE.mm : BASELINE.in), ...kept.d }, metric);
  if (kept.sizes && typeof kept.sizes === "object") return normalize(kept.sizes, metric);
  return null;
}

/** A frame read from a document, or null when it is not one: three rows of three finite
 * numbers, a finite translation, and a determinant well away from 0. @param {unknown} f @returns {Frame | null} */
export function validFrame(f) {
  if (!f || typeof f !== "object") return null;
  const { linear, translation } = /** @type {{ linear?: unknown, translation?: unknown }} */ (f);
  const finite3 = (/** @type {unknown} */ r) => Array.isArray(r) && r.length === 3 && r.every((v) => typeof v === "number" && Number.isFinite(v));
  if (!Array.isArray(linear) || linear.length !== 3 || !linear.every(finite3) || !finite3(translation)) return null;
  const [[a, b, c], [d, e, g], [h, i, j]] = /** @type {number[][]} */ (linear);
  const det = a * (e * j - g * i) - b * (d * j - g * h) + c * (d * i - e * h);
  if (!(Math.abs(det) > 1e-9)) return null;
  return { linear: /** @type {number[][]} */ (linear).map((r) => [...r]), translation: /** @type {[number, number, number]} */ ([.../** @type {number[]} */ (translation)]) };
}

/**
 * Drop the oldest entries not in `live` until the record's JSON is at most `budget`
 * characters. Entries in `live` are never dropped. Keys keep their order (oldest first, as
 * they were added). Returns the record.
 * @template T @param {Record<string, T>} all @param {Set<string>} live @param {number} budget
 */
export function prune(all, live, budget) {
  let size = JSON.stringify(all).length;
  // Oldest first, an earlier state of a cabinet edited in place ("n12/40") like any other:
  // Undo needs the newest first, whichever kind it is.
  for (const k of Object.keys(all)) {
    if (size <= budget) break;
    if (live.has(k)) continue;
    size -= JSON.stringify({ [k]: all[k] }).length - 1;
    delete all[k];
  }
  return all;
}

// --- which parts an entry describes ------------------------------------------------------------
//
// The document's store is not part of Undo, and the kernel hands ids out again after an Undo:
// an entry kept by instance id alone could describe parts that are no longer there (an edit
// made inside an open cabinet, undone), or a node that is not a cabinet at all. So each entry
// says which parts it was made with, and is taken only for an instance holding them. A
// cabinet rebuilt in place (the same instance, new parts) moves its earlier entry to
// "n<id>/<its first part>", so an Undo finds it again.

/** What to keep of the children an instance was made with. @param {number[]} kids @returns {Stamp} */
export function stampOf(kids) {
  const ids = [...kids].sort((a, b) => a - b);
  if (!ids.length) return {};
  return ids.every((v, i) => v === ids[0] + i) ? { p: ids[0], n: ids.length } : { p: ids[0], k: ids };
}

/** Whether `id` is one of the parts an entry was made with. @param {Stamp} kept @param {number} id */
export const madeWith = (kept, id) => (Array.isArray(kept.k) ? kept.k.includes(id) : typeof kept.p === "number" && typeof kept.n === "number" && id >= kept.p && id < kept.p + kept.n);

/** Whether an entry describes an instance with these children: any of the parts it was made
 * with still in it (one deleted by hand does not make it a stranger). An entry that does not
 * say (an older file) does. @param {Stamp | null | undefined} kept @param {number[]} kids */
export function describes(kept, kids) {
  if (!kept || typeof kept !== "object") return false;
  if (typeof kept.p !== "number") return true;
  return kids.some((c) => madeWith(kept, c));
}

/** The children this plugin did not make (added by hand); none when the entry does not say.
 * @param {Stamp} kept @param {number[]} kids */
export const strangers = (kept, kids) => (typeof kept.p === "number" ? kids.filter((c) => !madeWith(kept, c)) : []);

/**
 * The entry for an instance: its own when it describes the instance's children, else the
 * earlier one of the same instance that does (an edit in place, undone). Null when none does.
 * @template {Stamp} T @param {Record<string, T>} all @param {number} id @param {number[]} kids
 * @returns {{ key: string, kept: T } | null}
 */
export function keptFor(all, id, kids) {
  const own = all[`n${id}`];
  if (own && typeof own === "object" && describes(own, kids)) return { key: `n${id}`, kept: own };
  if (!own || typeof own !== "object") return null;
  for (const c of kids) {
    const h = all[`n${id}/${c}`];
    if (h && typeof h === "object" && describes(h, kids)) return { key: `n${id}/${c}`, kept: h };
  }
  return null;
}

/**
 * Keep an entry for an instance. An entry it replaces that was made with other parts (a
 * rebuild in place) moves to "n<id>/<its first part>", for Undo. Returns the record.
 * @template {Stamp} T @param {Record<string, T>} all @param {number} id @param {T} entry
 */
export function keep(all, id, entry) {
  const key = `n${id}`;
  const prev = all[key];
  delete all[key];
  if (prev && typeof prev === "object" && typeof prev.p === "number" && prev.p !== entry.p) {
    delete all[`${key}/${prev.p}`];
    all[`${key}/${prev.p}`] = prev;
  }
  all[key] = entry;
  return all;
}

/**
 * The keys of a record that describe the model now: every group and instance ("n12"), and
 * each earlier entry of an instance that describes its children now (an Undo brought them
 * back). Prune never drops these.
 * @param {Record<string, unknown>} all @param {{ id: number, parent: number | null }[]} nodes
 */
export function liveKeysOf(all, nodes) {
  const live = new Set(nodes.map((n) => `n${n.id}`));
  /** @type {Map<number, number[]>} */
  const kids = new Map();
  for (const n of nodes) if (n.parent != null) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id]);
  for (const k of Object.keys(all)) {
    const m = /^n(\d+)\/\d+$/.exec(k);
    if (m && describes(/** @type {Stamp} */ (all[k]), kids.get(Number(m[1])) ?? [])) live.add(k);
  }
  return live;
}

/** Whether a kept cabinet was made in metric units (its own, whatever the document's are now):
 * a cabinet kept whole by an older version says nothing, and takes the document's.
 * @param {Kept} kept @param {boolean} fallback */
export const keptMetric = (kept, fallback) => (kept.d && typeof kept.d === "object" ? kept.m === 1 : fallback);

/** Of the plugin's 64 KB: the cabinets (with their earlier states), and the base frames. The
 * rest is left for the other keys (the last cabinet, the legacy one) and the JSON around them. */
export const BUDGET = { cabinets: 52 * 1024, bases: 10 * 1024 };
