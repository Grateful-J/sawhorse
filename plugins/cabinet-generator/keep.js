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
 * (before 1.7.0) the whole settings; and its frame.
 * @typedef {{ d?: Record<string, unknown>, m?: 1, sizes?: Partial<Sizes>, frame?: unknown }} Kept */

/** What differs from the baseline of the document's units. @param {Sizes} s @param {boolean} metric */
export function pack(s, metric) {
  const base = metric ? BASELINE.mm : BASELINE.in;
  /** @type {Record<string, unknown>} */
  const d = {};
  for (const [k, v] of Object.entries(s)) if (base[k] !== v) d[k] = v;
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
  for (const k of Object.keys(all)) {
    if (size <= budget) break;
    if (live.has(k)) continue;
    size -= JSON.stringify({ [k]: all[k] }).length - 1;
    delete all[k];
  }
  return all;
}

/** Of the plugin's 64 KB: the cabinets, and the base frames. The rest is left for the
 * other keys (the last cabinet, the legacy one) and the JSON around them. */
export const BUDGET = { cabinets: 52 * 1024, bases: 10 * 1024 };
