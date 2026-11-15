// @ts-check
// A cabinet's row features, as settings: what covers its left and right sides (a finished end
// panel or a filler), an appliance opening beside it, a skin on its toe kick, the sink it takes,
// and whether an over-the-range microwave hangs under it. Their defaults are "none", so a cabinet
// that leaves them alone is built, kept and cut exactly as before they came. No imports:
// cabinet.js reads these for its defaults and normalize, and trim.js plans the parts
// (docs/research/row-features-sources.md).

const IN = 0.0254;
const MM = 0.001;

/** What covers a side: nothing, a finished end panel, a filler, or a scribe filler (a filler cut
 * wider by the scribe allowance, to scribe to the wall by hand). @typedef {"none" | "panel" | "filler" | "scribe"} EndKind */
/** An appliance opening beside a cabinet: none, a preset (trim.js APPLIANCES), or another
 * opening of a typed width. An over-the-range microwave is not an opening in a row: it hangs
 * under a wall cabinet, which says so (`otr`).
 * @typedef {"none" | "dw-ge" | "dw-bosch" | "dw-bosch-int" | "range-free" | "range-slide" | "fridge" | "other"} OpenKind */
/** The stock a toe-kick skin is cut from: the cabinet's carcass, door or back plywood, or none.
 * @typedef {"none" | "carcass" | "doors" | "back"} SkinStock */
/**
 * @typedef {{
 *   endLeft: EndKind, endRight: EndKind,
 *   endStock: "carcass" | "doors", endDown: "floor" | "box", endFront: "doors" | "carcass",
 *   endBand: "front" | "frontBottom" | "frontTopBottom" | "none", endScribe: number,
 *   fillerLeft: number, fillerRight: number,
 *   openLeft: OpenKind, openRight: OpenKind, openLeftWidth: number, openRightWidth: number,
 *   kickSkin: SkinStock,
 *   sinkWidth: number, sinkApron: boolean, otr: boolean,
 * }} TrimSizes
 */

export const END_KINDS = /** @type {const} */ (["none", "panel", "filler", "scribe"]);
export const OPEN_KINDS = /** @type {const} */ (["none", "dw-ge", "dw-bosch", "dw-bosch-int", "range-free", "range-slide", "fridge", "other"]);
export const SKIN_STOCKS = /** @type {const} */ (["none", "carcass", "doors", "back"]);

/**
 * Where a cabinet's row features start: none of them. The filler width is what a filler starts
 * at once one is picked: 3 in in an inch document, a width KraftMaid sells (BF3) and the filler it
 * ships with each blind corner base; 50 mm in a metric one, IKEA's planning guide's least filler
 * between a cabinet and a wall. Starting values, not a general standard (no table of filler widths
 * was found, and IKEA's Canadian checklist says 1 in). The scribe allowance starts at 0: none.
 * An opening's width is set from its preset when one is picked (trim.js APPLIANCES).
 * @param {boolean} metric @returns {TrimSizes}
 */
export function trimDefaults(metric) {
  return {
    endLeft: "none",
    endRight: "none",
    endStock: "carcass",
    endDown: "floor",
    endFront: "doors",
    endBand: "front",
    endScribe: 0,
    fillerLeft: metric ? 50 * MM : 3 * IN,
    fillerRight: metric ? 50 * MM : 3 * IN,
    openLeft: "none",
    openRight: "none",
    openLeftWidth: 0,
    openRightWidth: 0,
    kickSkin: "none",
    sinkWidth: 0,
    sinkApron: false,
    otr: false,
  };
}

/**
 * The row features of saved settings, each one checked (a document can come from anyone):
 * a choice not offered, or a number that is not finite, takes its default.
 * @param {Record<string, unknown>} s the saved settings over the defaults @param {TrimSizes} d the defaults
 * @returns {TrimSizes}
 */
export function normalizeTrim(s, d) {
  /** @param {keyof TrimSizes} k */
  const num = (k) => {
    const v = s[k];
    return typeof v === "number" && Number.isFinite(v) ? v : /** @type {number} */ (d[k]);
  };
  /** @template {string} T @param {keyof TrimSizes} k @param {readonly T[]} options @returns {T} */
  const pick = (k, options) => (options.includes(/** @type {T} */ (s[k])) ? /** @type {T} */ (s[k]) : /** @type {T} */ (d[k]));
  return {
    endLeft: pick("endLeft", END_KINDS),
    endRight: pick("endRight", END_KINDS),
    endStock: pick("endStock", /** @type {const} */ (["carcass", "doors"])),
    endDown: pick("endDown", /** @type {const} */ (["floor", "box"])),
    endFront: pick("endFront", /** @type {const} */ (["doors", "carcass"])),
    endBand: pick("endBand", /** @type {const} */ (["front", "frontBottom", "frontTopBottom", "none"])),
    endScribe: num("endScribe"),
    fillerLeft: num("fillerLeft"),
    fillerRight: num("fillerRight"),
    openLeft: pick("openLeft", OPEN_KINDS),
    openRight: pick("openRight", OPEN_KINDS),
    openLeftWidth: num("openLeftWidth"),
    openRightWidth: num("openRightWidth"),
    kickSkin: pick("kickSkin", SKIN_STOCKS),
    sinkWidth: num("sinkWidth"),
    sinkApron: s.sinkApron === true,
    otr: s.otr === true,
  };
}
