// @ts-check
// A cabinet's row features, planned: the finished end panels and fillers beside its sides (real
// parts, in its own axes, built into it), the toe-kick skin on its kick, the appliance openings
// beside it (space where no cabinet goes, nothing cut), and the checks that read the sources
// (docs/research/row-features-sources.md). Every check is a warning, never a refusal; a refusal
// is kept for a value that cannot be built (a filler with no width).
//
// A cabinet that uses none of them is planned exactly as plan() plans it: planCabinet returns
// plan()'s own result, untouched.
//
// Axes are the cabinet's (cabinet.js): x across from its left side, y back from the carcass
// front, z up from its bottom (the floor, for a cabinet with a toe kick).
import { bandFor, bandList, bandPart, exactThickness, frontDepth, MATERIALS, plan } from "./cabinet.js";
import { partMesh } from "./mesh.js";
import { apply, invert, TOUCH } from "./row.js";

const IN = 0.0254;
const MM = 0.001;
/** Two widths within this are the same width (a value typed in the other unit system rounds). */
const SAME = 0.5 * MM;
/** A check's limit is missed by more than this (a micrometre), not by a float's rounding. */
const E = 1e-6;

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("./cabinet.js").Part} Part */
/** @typedef {import("./trimsizes.js").OpenKind} OpenKind */
/** @typedef {import("./row.js").Piece} Piece */
/** @typedef {[number, number, number]} V3 */

/** A length as a maker prints it: inches, or millimetres where the maker prints them.
 * @typedef {{ in: number, mm?: number }} Printed */
/**
 * The appliance openings offered, each from its maker's installation document (the sources file
 * quotes them, with their addresses): the width it starts at, and the limits its checks read.
 * - `start`: the width an opening takes when the preset is picked (0: type it).
 * - `width`: the least width, and the most where the maker gives a range.
 * - `height`: the height under the countertop, least and most (the top of the cabinets beside
 *   the opening above the floor).
 * - `overhead`: the deepest cabinet over it, inches (Frigidaire's 13 in).
 * Inches are the maker's; millimetres only where the maker prints them, used in a metric document.
 * @type {Record<Exclude<OpenKind, "none">, { label: string, short: string, maker: string, kind: "dishwasher" | "range" | "fridge" | "other", start: Printed | null, width?: { min: Printed, max?: Printed }, height?: { min: Printed, max?: Printed }, overhead?: number, source: string }>}
 */
export const APPLIANCES = {
  "dw-ge": {
    label: "Dishwasher, GE built-in (PDT750 family), 24 in",
    short: "Dishwasher (GE)",
    maker: "GE (PDT750 family)",
    kind: "dishwasher",
    start: { in: 24 },
    width: { min: { in: 24 } },
    height: { min: { in: 34.25 }, max: { in: 34.75 } },
    source: 'GE installation instructions 31-31546: an opening "at least 24" deep, 24" wide and approximately 34-1/2" high from floor to underside of the countertop"; Figure A gives 34-1/2" ± 1/4", Figure B 33-1/2" to 34-3/4" (which models each figure is for is not stated in the text read).',
  },
  "dw-bosch": {
    label: "Dishwasher, Bosch (US guide), 24 in (610 mm)",
    short: "Dishwasher (Bosch)",
    maker: "Bosch",
    kind: "dishwasher",
    start: { in: 24, mm: 610 },
    width: { min: { in: 24, mm: 610 } },
    height: { min: { in: 33 + 7 / 8, mm: 860 } },
    source: 'Bosch installation instructions 9002059336: the opening "is at least 33 7/8" (860 mm) high and 24" (610 mm) wide".',
  },
  "dw-bosch-int": {
    label: "Dishwasher, Bosch fully integrated (panel door), 600 mm",
    short: "Dishwasher (Bosch integrated)",
    maker: "Bosch (fully integrated)",
    kind: "dishwasher",
    start: { in: 23 + 5 / 8, mm: 600 },
    width: { min: { in: 23 + 5 / 8, mm: 600 }, max: { in: 24.25, mm: 616 } },
    height: { min: { in: 32, mm: 813 }, max: { in: 34.25, mm: 870 } },
    source: "Bosch 9001450387, fully integrated door panel: an opening 23 5/8 to 24 1/4 in (600 to 616 mm) wide and 32 to 34 1/4 in (813 to 870 mm) high.",
  },
  "range-free": {
    label: "Range, freestanding 30 in (Frigidaire FFEF3003U)",
    short: "Range (freestanding)",
    maker: "Frigidaire (FFEF3003U)",
    kind: "range",
    start: { in: 30 },
    width: { min: { in: 30 } },
    overhead: 13,
    source: "Frigidaire FFEF3003U specifications: cutout 30 in wide at least, 24 in deep at least, 36 in high; overhead cabinets at most 13 in deep, and 30 in above the cooktop unless protected.",
  },
  "range-slide": {
    label: "Range, slide-in 30 in (Frigidaire FGDS3065P)",
    short: "Range (slide-in)",
    maker: "Frigidaire (FGDS3065P)",
    kind: "range",
    start: { in: 30 },
    width: { min: { in: 29 + 15 / 16 }, max: { in: 30 + 1 / 16 } },
    overhead: 13,
    source: "Frigidaire FGDS3065P specifications: cutout 29-15/16 to 30-1/16 in wide; overhead cabinets at most 13 in deep. GE's JS760 slide-in manual allows 16 in: the makers disagree.",
  },
  fridge: {
    label: "Refrigerator: type the opening",
    short: "Refrigerator",
    maker: "",
    kind: "fridge",
    start: null,
    source: "Type the fridge's case width plus its maker's side clearances. GE French-door: 1/8 in (3 mm) each side, 1 in top, 2 in back. Whirlpool WRS588FIH: 1/2 in each side and top, 1 in back, 2 in on the hinge side at a wall. They disagree. Monogram: frameless cabinets may need filler strips beside the fridge for the doors to swing, and the opening must allow for them.",
  },
  other: {
    label: "Another opening: type its width",
    short: "Opening",
    maker: "",
    kind: "other",
    start: null,
    source: "Type the width your appliance's installation guide asks for.",
  },
};

/** GE's over-the-range microwave (installation 49-40765): the space between the cabinets 30 in
 * wide, its top 66 in or more above the floor, the cabinet over it at most 13 in deep. */
export const OTR = {
  width: 30,
  floorToTop: 66,
  depth: 13,
  source: 'GE over-the-range microwave installation 49-40765: "The space between the cabinets must be 30" wide" (a Filler Panel Kit if wider); "66" or More from the Floor to the Top of the Microwave"; the wall cabinet over it "13" max" deep for a standard installation; its bottom 30 in or more above the cooking surface.',
};

/** KCMA A161.1-2022 §2.3: a toe kick, if used, at least 2 in (51 mm) deep and 3 in (76 mm) high. */
export const KCMA = { depth: { in: 2, mm: 51 }, height: { in: 3, mm: 76 } };

/** AWS (2009) §1.2.20.1.4: scribes at wall-to-wall installations not over 1-1/2 in (38.1 mm). */
export const AWS_SCRIBE = 1.5 * IN;

/** Kohler's sink spec sheets: a sink's width (inches, inclusive) and the narrowest base cabinet
 * it takes, with the metric figure where Kohler prints one. Farmhouse (apron) sinks are their own rule. */
export const KOHLER = [
  { from: 24, to: 25, base: { in: 27, mm: 686 }, note: "" },
  { from: 32, to: 33, base: { in: 36 }, note: "" },
  { from: 35, to: 35, base: { in: 36 }, note: ' Kohler says "36"–39" (36" may require cabinet modifications)" for its 35 in Strive.' },
];
export const KOHLER_APRON = { base: { in: 36, mm: 914 } };

/** A printed length in metres, in the document's system. @param {Printed} p @param {boolean} metric */
const printed = (p, metric) => (metric && p.mm !== undefined ? p.mm * MM : p.in * IN);
/** A printed length as text, in the document's system. @param {Printed} p @param {boolean} metric */
const printedText = (p, metric) => (metric && p.mm !== undefined ? `${p.mm} mm` : `${inches(p.in)} in${metric ? ` (${Math.round(p.in * 25.4 * 10) / 10} mm)` : ""}`);
/** 33.875 -> "33 7/8". @param {number} x */
function inches(x) {
  const whole = Math.floor(x + 1e-9);
  const frac = Math.round((x - whole) * 16);
  if (!frac) return String(whole);
  let n = frac;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
}
/** A length the panel shows: the document's system, exactly. @param {number} m @param {boolean} metric */
const len = (m, metric) => (metric ? `${Math.round((m / MM) * 10) / 10} mm` : `${Math.round((m / IN) * 1000) / 1000} in`);

/** The width an opening starts at when its preset is picked: the maker's, or 0 (type it).
 * @param {OpenKind} kind @param {boolean} metric */
export function openingStart(kind, metric) {
  if (kind === "none") return 0;
  const a = APPLIANCES[kind];
  return a.start ? printed(a.start, metric) : 0;
}

/** Whether a cabinet uses any row feature: when none, it is planned, kept and cut as before. @param {Sizes} s */
export function trimUsed(s) {
  return s.endLeft !== "none" || s.endRight !== "none" || s.openLeft !== "none" || s.openRight !== "none" || (s.kickSkin !== "none" && s.base === "toekick") || s.sinkWidth > 0 || s.sinkApron || s.otr;
}

/** How far an overlay front stands in front of the carcass: the door or drawer front stock
 * (none for open shelves, or inset fronts). @param {Sizes} s */
export function frontProud(s) {
  return frontDepth(s);
}

/**
 * What stands beside each side of a cabinet in its row, from its side outward: an end panel (its
 * stock's thickness) or a filler (its width as typed: a scribe filler's extra is scribed off at
 * the wall, so the row counts the width it ends at), then an opening. Nothing on a side: [].
 * @param {Sizes} s @returns {{ left: Piece[], right: Piece[] }}
 */
export function trimEnds(s) {
  /** @param {"left" | "right"} side @returns {Piece[]} */
  const side = (side) => {
    const kind = side === "left" ? s.endLeft : s.endRight;
    const open = side === "left" ? s.openLeft : s.openRight;
    const openWidth = side === "left" ? s.openLeftWidth : s.openRightWidth;
    const word = side === "left" ? "Left" : "Right";
    /** @type {Piece[]} */
    const out = [];
    if (kind === "panel") out.push({ kind: "panel", width: s.thickness, label: `${word} end panel` });
    else if (kind === "filler" || kind === "scribe") out.push({ kind: "filler", width: side === "left" ? s.fillerLeft : s.fillerRight, label: `${word} ${kind === "scribe" ? "scribe filler" : "filler"}` });
    if (open !== "none" && openWidth > 0) out.push({ kind: "opening", width: openWidth, label: APPLIANCES[open].short, open });
    return out;
  };
  return { left: side("left"), right: side("right") };
}

/**
 * The parts beside a cabinet (its end panels and fillers) and on its toe kick (a skin), in its
 * own axes, with the rows they add to Cuts and holes. Refused (`error`) only for what cannot be
 * built: a filler with no width, a negative scribe allowance or opening, a skin thicker than the
 * kick is set back.
 * @param {Sizes} s @param {boolean} metric
 * @returns {{ error: string | null, parts: Part[], rows: string[][] }}
 */
export function trimParts(s, metric) {
  /** @type {Part[]} */
  const parts = [];
  /** @type {string[][]} */
  const rows = [];
  const fail = (/** @type {string} */ error) => ({ error, parts: [], rows: [] });
  const T = s.thickness;
  const kick = s.base === "toekick" ? s.toeKick : 0;
  const stockName = s.endStock === "doors" ? MATERIALS.doors.name : MATERIALS.carcass.name;
  const stockWord = s.endStock === "doors" ? "door plywood" : "carcass plywood";
  if (!(s.endScribe >= 0)) return fail("The scribe allowance cannot be less than 0.");
  if (!(s.openLeftWidth >= 0) || !(s.openRightWidth >= 0)) return fail("An opening's width cannot be less than 0.");
  for (const [side, kind, w] of /** @type {const} */ ([["left", s.endLeft, s.fillerLeft], ["right", s.endRight, s.fillerRight]]))
    if ((kind === "filler" || kind === "scribe") && !(w > 0)) return fail(`The ${side} filler needs a width more than 0.`);
  const band = bandFor(s, "carcass", metric) ?? null;
  const bandSet = bandList(s, metric);
  /** Grain up the part: along its length when its height is its longer side. @param {V3} b */
  const upright = (b) => {
    const thin = b.indexOf(Math.min(...b));
    const other = [0, 1].find((k) => k !== thin && k !== 2) ?? 0;
    return b[2] >= b[other] ? /** @type {const} */ ("length") : /** @type {const} */ ("width");
  };

  // --- finished end panels: on the side's outer face, in the end stock -----------------------
  const proud = s.endFront === "doors" ? frontProud(s) : 0;
  const z0 = s.endDown === "box" ? kick : 0;
  for (const side of /** @type {const} */ (["left", "right"])) {
    if ((side === "left" ? s.endLeft : s.endRight) !== "panel") continue;
    const name = side === "left" ? "Left end panel" : "Right end panel";
    // [thickness, depth, height], as a side: its front edge is low on y, its bottom low on z.
    const size = /** @type {V3} */ ([T, proud + s.depth + s.endScribe, s.height - z0]);
    const at = /** @type {V3} */ ([side === "left" ? -T : s.width, 0 - proud, z0]);
    const which = band && s.endBand !== "none" ? /** @type {import("./cabinet.js").EdgeName[]} */ (s.endBand === "front" ? ["front"] : s.endBand === "frontBottom" ? ["front", "bottom"] : ["front", "bottom", "top"]) : [];
    /** @type {Part} */
    let part;
    if (which.length && band) {
      let b;
      try {
        b = bandPart(name, size, [], [], which.map((edge) => ({ edge, band })), s.bandPremill);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      const bom = [...new Set(b.bands.map((e) => e.band))].map((n) => {
        const metres = b.bands.filter((e) => e.band === n).reduce((m, e) => m + e.run + s.bandWasteEnd, 0);
        return /** @type {import("./cabinet.js").BomItem} */ ({ item: `Edge banding, ${bandSet[n - 1].label}`, qty: Math.ceil(metres * 1000 - 1e-6) / 1000, unit: "m" });
      });
      part = { name, material: stockName, blank: b.blank, copies: [{ at: /** @type {V3} */ (at.map((v, k) => v + b.offset[k])), name }], mesh: partMesh(name, b.blank), grain: upright(b.blank), bom, finished: size, offset: b.offset, bands: b.bands };
      const metres = bom.reduce((m, x) => m + x.qty, 0);
      rows.push([name, `Edge band the ${which.join(", ")} ${which.length === 1 ? "edge" : "edges"} (${bandSet[band.n - 1].label}): finished ${len(size[1], metric)} x ${len(size[2], metric)}, cut ${len(b.blank[1], metric)} x ${len(b.blank[2], metric)}; ${Math.round(metres * 1000) / 1000} m of band, with waste`, "-", "-", "Edge band"]);
    } else part = { name, material: stockName, blank: size, copies: [{ at, name }], mesh: partMesh(name, size), grain: upright(size) };
    parts.push(part);
    const front = proud > 0 ? `its front flush with the ${s.layout === "drawers" || s.layout === "trash" ? "drawer fronts" : "doors"}` : "its front flush with the carcass";
    const down = z0 > 0 ? "its bottom flush with the cabinet's bottom" : kick > 0 ? "down to the floor, over the toe kick" : "the cabinet's full height";
    rows.push([name, `Finished end in ${stockWord}, ${exactThickness(T, metric)}: ${front}, ${down}. Screw it on from inside the cabinet (Decor's guide: 1-1/8 in screws); not drilled, as no source gives a hole pattern`, "-", "-", "Hand"]);
    if (s.endScribe > 0) rows.push([name, `Cut ${len(s.endScribe, metric)} deeper at its back edge: scribe it to the wall by hand (the scribe allowance, your setting)`, "-", "-", "Hand"]);
  }

  // --- fillers: a strip beside the side, its face flush with the carcass front ----------------
  for (const side of /** @type {const} */ (["left", "right"])) {
    const kind = side === "left" ? s.endLeft : s.endRight;
    if (kind !== "filler" && kind !== "scribe") continue;
    const w = side === "left" ? s.fillerLeft : s.fillerRight;
    const extra = kind === "scribe" ? s.endScribe : 0;
    const name = side === "left" ? "Left filler" : "Right filler";
    // [width, thickness, height]: above the toe kick (KraftMaid's base fillers have none), the
    // scribe's extra on the side away from the cabinet.
    const size = /** @type {V3} */ ([w + extra, T, s.height - kick]);
    const at = /** @type {V3} */ ([side === "left" ? -w - extra : s.width, 0, kick]);
    parts.push({ name, material: stockName, blank: size, copies: [{ at, name }], mesh: partMesh(name, size), grain: upright(size) });
    rows.push([name, `Filler ${len(w, metric)} wide in ${stockWord}, ${exactThickness(T, metric)}, its face flush with the carcass front${kick > 0 ? ", above the toe kick" : ""}. Screw through the cabinet's side into its edge (IKEA), fixed before the cabinet is installed (Decor); not drilled`, "-", "-", "Hand"]);
    if (kind === "scribe") rows.push([name, extra > 0 ? `Cut ${len(extra, metric)} wider on its wall side (the scribe allowance, your setting): scribe it to the wall by hand, tracing the wall with a block and a pencil (IKEA), down to ${len(w, metric)}` : "A scribe filler with no scribe allowance is a plain filler: set the allowance (Ends, fillers and openings) to cut it wider", "-", "-", extra > 0 ? "Hand" : "Check"]);
  }

  // --- the toe-kick skin: in front of the kick, under the cabinet and its fillers ------------
  if (s.base === "toekick" && s.kickSkin !== "none") {
    const ts = s.kickSkin === "back" ? s.backThickness : s.thickness;
    const material = s.kickSkin === "back" ? MATERIALS.back.name : s.kickSkin === "doors" ? MATERIALS.doors.name : MATERIALS.carcass.name;
    if (!(s.toeSetback - ts > 0)) return fail(`The kick setback (${len(s.toeSetback, metric)}) must be more than the skin's ${exactThickness(ts, metric)}, or the skin stands in front of the cabinet: set the kick back further, or skin it in thinner stock.`);
    // A filler and an end panel flush with the box's bottom stand over the kick: the skin runs
    // under them; an end panel to the floor closes the kick, and the skin stops at it.
    const beyond = (/** @type {"left" | "right"} */ side) => {
      const kind = side === "left" ? s.endLeft : s.endRight;
      if (kind === "filler" || kind === "scribe") return side === "left" ? s.fillerLeft : s.fillerRight;
      if (kind === "panel" && s.endDown === "box") return T;
      return 0;
    };
    const x0 = -beyond("left");
    const length = s.width + beyond("left") + beyond("right");
    const size = /** @type {V3} */ ([length, ts, kick]);
    parts.push({ name: "Toe kick skin", material, blank: size, copies: [{ at: [x0, s.toeSetback - ts, 0], name: "Toe kick skin" }], mesh: partMesh("Toe kick skin", size), grain: length >= kick ? "length" : "width" });
    rows.push(["Toe kick skin", `${len(length, metric)} x ${len(kick, metric)} in ${s.kickSkin === "back" ? "back" : s.kickSkin === "doors" ? "door" : "carcass"} plywood, ${exactThickness(ts, metric)}, in front of the toe kick: glue and pin or screw it on from behind. Scribe it to the floor as needed (Decor: "Scribe the toe kick as needed")`, "-", "-", "Hand"]);
  }

  // --- openings: space, nothing cut ------------------------------------------------------------
  for (const side of /** @type {const} */ (["left", "right"])) {
    const kind = side === "left" ? s.openLeft : s.openRight;
    if (kind === "none") continue;
    const w = side === "left" ? s.openLeftWidth : s.openRightWidth;
    rows.push([`Opening, ${side}`, `${APPLIANCES[kind].label}: ${w > 0 ? `${len(w, metric)} of space, no cabinet, nothing cut` : "no width yet"}. Check your appliance's installation guide`, "-", "-", "Check"]);
  }
  for (const w of trimChecks(s, metric)) rows.push(["Check", w, "-", "-", "Check"]);
  return { error: null, parts, rows };
}

/**
 * plan(), with the cabinet's row features: its end panels, fillers and skin added to its parts,
 * their rows to Cuts and holes. A cabinet that uses none gets plan()'s own result, untouched.
 * @param {Sizes} s @param {boolean} metric @returns {ReturnType<typeof plan>}
 */
export function planCabinet(s, metric) {
  const p = plan(s, metric);
  if (p.error || !trimUsed(s)) return p;
  const t = trimParts(s, metric);
  if (t.error) return { ...p, error: t.error, parts: [], rows: [] };
  return { ...p, parts: [...p.parts, ...t.parts], rows: [...p.rows, ...t.rows] };
}

/**
 * The checks a cabinet's own settings answer, as warnings: the scribe allowance against AWS's
 * widest scribe, the toe kick and its skin against KCMA's least toe space, the sink against
 * Kohler's base widths, an over-the-range microwave's wall cabinet against GE's width and depth,
 * and each opening's width against its preset. Checks against the cabinets beside or over an
 * opening are rowChecks'.
 * @param {Sizes} s @param {boolean} metric @returns {string[]}
 */
export function trimChecks(s, metric) {
  /** @type {string[]} */
  const out = [];
  const usesScribe = s.endLeft === "panel" || s.endRight === "panel" || s.endLeft === "scribe" || s.endRight === "scribe";
  if (usesScribe && s.endScribe > AWS_SCRIBE + E) out.push(`The scribe allowance, ${len(s.endScribe, metric)}, is wider than the 1-1/2 in (38.1 mm) the AWS standard allows a scribe at wall-to-wall installations.`);
  if (s.base === "toekick" && s.kickSkin !== "none") {
    const ts = s.kickSkin === "back" ? s.backThickness : s.thickness;
    const h = printed(KCMA.height, metric);
    const d = printed(KCMA.depth, metric);
    if (s.toeKick < h - E) out.push(`The toe kick is ${len(s.toeKick, metric)} high: KCMA A161.1 asks for at least ${printedText(KCMA.height, metric)}.`);
    if (s.toeSetback - ts < d - E && s.toeSetback - ts > 0) out.push(`With the skin on, the toe space is ${len(s.toeSetback - ts, metric)} deep: KCMA A161.1 asks for at least ${printedText(KCMA.depth, metric)}. Set the kick back further, or skin it in thinner stock.`);
  }
  if (s.sinkWidth > 0 || s.sinkApron) {
    const w = s.sinkWidth / IN;
    if (s.sinkApron) {
      const need = printed(KOHLER_APRON.base, metric);
      if (s.width < need - E) out.push(`A farmhouse (apron) sink needs a base cabinet at least ${printedText(KOHLER_APRON.base, metric)} wide (Kohler, Whitehaven K-6489 and K-6488); this one is ${len(s.width, metric)}.`);
    } else {
      const rule = KOHLER.find((r) => w >= r.from - SAME / IN && w <= r.to + SAME / IN);
      if (!rule) out.push(`Kohler's spec sheets read here give no base width for a ${len(s.sinkWidth, metric)} sink: check the sink's own spec sheet for the narrowest base it takes.`);
      else {
        const need = printed(rule.base, metric);
        if (s.width < need - E) out.push(`A ${rule.from === rule.to ? rule.from : `${rule.from} to ${rule.to}`} in sink needs a base cabinet at least ${printedText(rule.base, metric)} wide (Kohler's spec sheets); this one is ${len(s.width, metric)}.${rule.note}`);
        else if (rule.note) out.push(rule.note.trim());
      }
    }
  }
  if (s.otr) {
    if (s.width < OTR.width * IN - SAME) out.push(`An over-the-range microwave: GE asks for a 30 in (762 mm) space between the cabinets; this cabinet over it is ${len(s.width, metric)}, narrower. Check your microwave's installation guide.`);
    if (s.width > OTR.width * IN + SAME) out.push(`An over-the-range microwave under a ${len(s.width, metric)} cabinet: GE's microwaves take a 30 in (762 mm) space, and GE says a Filler Panel Kit may be used where it is wider. Check your microwave's installation guide.`);
    if (s.depth > OTR.depth * IN + E) out.push(`The cabinet over an over-the-range microwave is ${len(s.depth, metric)} deep: GE's standard installation takes at most 13 in (330.2 mm). Check your microwave's installation guide.`);
  }
  for (const side of /** @type {const} */ (["left", "right"])) {
    const kind = side === "left" ? s.openLeft : s.openRight;
    if (kind === "none") continue;
    const a = APPLIANCES[kind];
    const w = side === "left" ? s.openLeftWidth : s.openRightWidth;
    if (!(w > 0)) {
      out.push(`The ${side} opening (${a.short}) has no width: type it.${kind === "fridge" ? " The fridge's case width plus its maker's clearances." : ""}`);
      continue;
    }
    if (a.width) {
      const lo = printed(a.width.min, metric);
      const hi = a.width.max ? printed(a.width.max, metric) : Infinity;
      if (w < lo - E || w > hi + E) out.push(`The ${side} opening is ${len(w, metric)} wide: ${a.maker} asks for ${a.width.max ? `${printedText(a.width.min, metric)} to ${printedText(a.width.max, metric)}` : `at least ${printedText(a.width.min, metric)}`}. Check your appliance's installation guide.`);
    }
  }
  return out;
}

/**
 * A cabinet as the row checks see it: where it stands, its box and its settings.
 * @typedef {import("./row.js").Cab & { sizes: Sizes, metric?: boolean }} Checked */

/**
 * The checks that read the cabinets around an opening, as warnings:
 * - a dishwasher: the height under the countertop, taken as the top of the cabinets beside the
 *   opening above the floor (z = 0 of the model; the countertop's thickness is not modelled);
 * - a range: a cabinet of ours over it deeper than its maker's overhead limit;
 * - a cabinet of the row with an over-the-range microwave under it: its bottom at least 66 in
 *   above the floor.
 * @param {Checked[]} row the row, left to right (rowOf) @param {Checked[]} all every cabinet of ours @param {boolean} metric
 * @returns {string[]}
 */
export function rowChecks(row, all, metric) {
  /** @type {string[]} */
  const out = [];
  const top = (/** @type {Checked} */ c) => Math.max(...corners(c).map((p) => p[2]));
  const bottom = (/** @type {Checked} */ c) => Math.min(...corners(c).map((p) => p[2]));
  row.forEach((c, i) => {
    for (const side of /** @type {const} */ (["left", "right"])) {
      const pieces = c.ends?.[side] ?? [];
      const at = pieces.findIndex((p) => p.kind === "opening");
      if (at < 0) continue;
      const open = pieces[at];
      const a = APPLIANCES[/** @type {Exclude<OpenKind, "none">} */ (open.open)];
      if (!a) continue;
      // The opening in the cabinet's own axes, along x.
      const before = pieces.slice(0, at).reduce((t, p) => t + p.width, 0);
      const x0 = side === "right" ? c.width + before : -before - open.width;
      const x1 = x0 + open.width;
      const across = side === "right" ? row[i + 1] : row[i - 1];
      if (a.kind === "dishwasher" && a.height) {
        const beside = [c, ...(across ? [across] : [])];
        const h = Math.min(...beside.map(top));
        const lo = printed(a.height.min, metric);
        const hi = a.height.max ? printed(a.height.max, metric) : Infinity;
        if (h < lo - E || h > hi + E) {
          const want = a.height.max ? `${printedText(a.height.min, metric)} to ${printedText(a.height.max, metric)}` : `at least ${printedText(a.height.min, metric)}`;
          out.push(`${open.label} beside ${beside.map((x) => x.name).join(" and ")}: the countertop's underside would be ${len(h, metric)} above the floor (the cabinets' tops); ${a.maker} asks for ${want}. Check your dishwasher's installation guide.`);
        }
      }
      if (a.kind === "range" && a.overhead) {
        const inv = invert(c.world);
        const cTop = c.height;
        for (const o of all) {
          if (row.includes(o)) continue;
          const pts = corners(o).map((p) => apply(inv, p));
          const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
          const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
          const over = Math.min(hi[0], x1) - Math.max(lo[0], x0) > TOUCH && Math.min(hi[1], c.depth) - Math.max(lo[1], 0) > TOUCH && lo[2] >= cTop - TOUCH;
          if (over && o.sizes.depth > a.overhead * IN + E) out.push(`${o.name} is over the ${open.label.toLowerCase()} and ${len(o.sizes.depth, metric)} deep: ${a.maker} allows cabinets over it at most ${a.overhead} in (${Math.round(a.overhead * 25.4 * 10) / 10} mm) deep${a.width?.max ? "; GE's slide-in manual allows 16 in" : ""}. Check your range's installation guide.`);
        }
      }
    }
  });
  for (const c of row) {
    if (!c.sizes.otr) continue;
    const z = bottom(c);
    if (z < OTR.floorToTop * IN - E) out.push(`${c.name} is over an over-the-range microwave with its bottom ${len(z, metric)} above the floor: GE asks for 66 in (1676.4 mm) or more from the floor to the microwave's top. Check your microwave's installation guide.`);
  }
  return out;
}

/** A cabinet's eight corners in the model. @param {import("./row.js").Cab} c @returns {V3[]} */
function corners(c) {
  /** @type {V3[]} */
  const out = [];
  for (const x of [0, c.width]) for (const y of [0, c.depth]) for (const z of [0, c.height]) out.push(apply(c.world, [x, y, z]));
  return out;
}
