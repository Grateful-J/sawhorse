// @ts-check
// Frameless cabinets for a CNC router. Sizes are metres inside; hardware tables are in
// millimetres because that is how Blum publishes them.
//
// Joinery is the blind ("hidden") dado: each rail sits in a groove that stops short of the
// side's front edge, and the rail's front corners are notched to clear the solid strip the
// groove stops at. The notch runs one bit diameter past the stop, so the round end the
// router leaves in the groove never meets the rail's square shoulder, and the round inside
// corner the router leaves in the notch never meets the side. The back sits in grooves in
// the sides, the top and the bottom; drawer bottoms slide into grooves in the drawer sides
// and sub-front, under the drawer back.
//
// Hardware is Blum: CLIP top cup hinges on System 32 mounting plates, and TANDEM 563H or
// MOVENTO 763H undermount runners, sized and drilled from Blum's own tables (RUNNERS). Pulls
// are two through holes, placed as asked, or a finger notch in a drawer front. Every hole is
// listed in `rows`, with whether the router drills it or a jig must (an edge bore).
//
// The parts are built in place (left side, right side, ...), so a part that is the mirror of
// another is its own part with its own holes, and the DXF draws it from the face it is cut on.
import { partMesh } from "./mesh.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {"shelves" | "doors" | "drawers" | "mixed"} Layout */
/** @typedef {"overlay" | "inset"} Front */
/** @typedef {"toekick" | "none"} Base */
/** @typedef {"tandem" | "movento"} Slides */
/** @typedef {"groove" | "butt"} BackMount */
/** @typedef {"center" | "top" | "notch" | "none"} DrawerPull */
/** @typedef {"vertical" | "horizontal" | "none"} DoorPull */
/** @typedef {"top" | "bottom"} DoorPullFrom */
/**
 * @typedef {{
 *   name: string,
 *   width: number, height: number, depth: number,
 *   thickness: number, frontThickness: number, drawerThickness: number, backThickness: number,
 *   layout: Layout, shelves: number, drawers: number,
 *   base: Base, toeKick: number, toeSetback: number,
 *   back: boolean, backMount: BackMount, backInset: number, backGrooveDepth: number,
 *   front: Front, gap: number,
 *   dados: boolean, dadoDepth: number, dadoStop: number, fit: number, bit: number,
 *   slides: Slides, runner: number,
 *   hardware: boolean, hingeInset: number, cupDistance: number,
 *   drawerPull: DrawerPull, drawerPullFromTop: number, pullSpacing: number, notchWidth: number, notchDepth: number,
 *   doorPull: DoorPull, doorPullFrom: DoorPullFrom, doorPullEnd: number, doorPullEdge: number, doorPullSpacing: number,
 *   pullHole: number,
 * }} Sizes
 */
/** @typedef {import("./mesh.js").Prism} Prism */
/** @typedef {import("./mesh.js").Hole} Hole */
/** @typedef {[number, number, number]} V3 */
/**
 * @typedef {{
 *   name: string,
 *   material: string,
 *   blank: V3,
 *   copies: { at: V3, name?: string }[],
 *   mesh: import("./mesh.js").Mesh,
 * }} Part
 */

/**
 * Blum runners, from Blum Inc.'s technical pages (millimetres): TANDEM plus BLUMOTION 563H
 * (2017, pp. 14-15) and MOVENTO 763H (2019, pp. 8-9). `minDepth` is the minimum inside
 * cabinet depth; `a` and `b` are the frameless screw locations from the cabinet front (the
 * first screw is at 37). `screwHeight` is the screw line above the bottom of the opening.
 * @typedef {{ nl: number, part: string, minDepth: number, a: number, b: number }} RunnerLength
 * @typedef {{ name: string, lengths: RunnerLength[], screwHeight: number, bottomClearance: number, heightDeduct: number, rearNotch: number, thinShift: number, lock: string }} Runner
 * @type {Record<Slides, Runner>}
 */
export const RUNNERS = {
  tandem: {
    name: "Blum TANDEM 563H",
    lengths: [
      { nl: 229, part: "563H2290B10", minDepth: 266, a: 133, b: 229 },
      { nl: 305, part: "563H3050B", minDepth: 328, a: 165, b: 261 },
      { nl: 381, part: "563H3810B", minDepth: 404, a: 165, b: 357 },
      { nl: 457, part: "563H4570B", minDepth: 480, a: 261, b: 453 },
      { nl: 533, part: "563H5330B", minDepth: 557, a: 261, b: 517 },
    ],
    screwHeight: 37,
    bottomClearance: 14,
    heightDeduct: 21,
    rearNotch: 35,
    thinShift: 0,
    lock: "T51.1901 R/L locking devices: screwed on, nothing to drill",
  },
  movento: {
    name: "Blum MOVENTO 763H",
    lengths: [
      { nl: 305, part: "763H3050S", minDepth: 328, a: 165, b: 261 },
      { nl: 381, part: "763H3810S", minDepth: 404, a: 165, b: 357 },
      { nl: 457, part: "763H4570S", minDepth: 480, a: 261, b: 453 },
      { nl: 533, part: "763H5330S", minDepth: 557, a: 261, b: 517 },
    ],
    screwHeight: 38,
    bottomClearance: 16,
    heightDeduct: 23,
    rearNotch: 50,
    // "If using 15/32 or 1/2 drawer thickness without T59.K010M, subtract 3 from setback and
    // screw locations."
    thinShift: 3,
    lock: "T51.7601 R/L locking devices: pre-bore 2.5 mm at 75 degrees with the T65.1600.01 template",
  },
};

/** Blum drawer rules shared by both runners (mm). */
const BLUM = {
  insideDeduct: 42,
  bottomRecess: 13,
  frontScrew: 37,
  minSide: 11.5,
  maxSide: 16.2,
  minInside: 170,
  hookDia: 6,
  hookDepth: 10,
  hookIn: 7,
  // 11 above the 13 notch.
  hookUp: 24,
};
/** CLIP top: a 35 mm cup 13 mm deep; its centre is 17.5 mm plus the boring distance (3 to 7,
 * Blum's default 4.5) from the hinge edge. System 32 mounting plates sit 37 mm back with their
 * two screws 32 apart. */
const CUP = { dia: 35, depth: 13, radius: 17.5, minK: 3, maxK: 7, plateSetback: 37, plateSpacing: 32 };
/** A mounting plate's half height plus clearance: it must not sit across a rail or a shelf. */
const PLATE_HALF = 26 * MM;
/** The least wood left between a drilled hole and a cut or an edge. */
const WEB = 3 * MM;
/** System 32 screw holes for plates and runners (5 mm, for Blum system screws). */
const SYS = { dia: 5, depth: 13 };
/** A rail's tongue stops this short of the bottom of its dado, so the shoulders close. */
const RELIEF = 0.5 * MM;
/** Panels in grooves (backs, drawer bottoms) are this much smaller per edge than groove to groove. */
const PANEL_GAP = (1 / 32) * IN;
/** A door wider than this is a pair. */
const MAX_DOOR = 24 * IN;
/** Room for fingers behind a finger notch: the sub-front is cut this far below the notch. */
const FINGER_ROOM = 25 * MM;

const rgba = (/** @type {number[]} */ c) => /** @type {[number, number, number, number]} */ (c);
export const MATERIALS = {
  carcass: { name: "Cabinet plywood", color: rgba([214, 186, 140, 255]) },
  back: { name: "Back plywood", color: rgba([196, 170, 128, 255]) },
  box: { name: "Drawer box plywood", color: rgba([226, 204, 160, 255]) },
  doors: { name: "Door plywood", color: rgba([180, 150, 110, 255]) },
  drawerFronts: { name: "Drawer front plywood", color: rgba([170, 140, 100, 255]) },
};

/**
 * Starting points, as on a cabinet shop's order form: each sets the style and the usual sizes,
 * and leaves the stock, joinery and hardware as they were. Inches, then millimetres.
 * @typedef {{ id: string, label: string, name: string, layout: Layout, shelves: number, drawers: number, base: Base,
 *   in: [number, number, number], mm: [number, number, number], doorPullFrom?: DoorPullFrom, doorPullEnd?: [number, number] }} Preset
 * @type {Preset[]}
 */
export const PRESETS = [
  { id: "base", label: "Base: door and a shelf", name: "Base", layout: "doors", shelves: 1, drawers: 0, base: "toekick", in: [24, 34.5, 24], mm: [600, 720, 560], doorPullFrom: "top" },
  { id: "drawers", label: "Drawer base: three drawers", name: "Drawer base", layout: "drawers", shelves: 0, drawers: 3, base: "toekick", in: [18, 34.5, 24], mm: [450, 720, 560] },
  { id: "sink", label: "Sink base: doors, no shelf", name: "Sink base", layout: "doors", shelves: 0, drawers: 0, base: "toekick", in: [36, 34.5, 24], mm: [900, 720, 560], doorPullFrom: "top" },
  { id: "mixed", label: "Base: a drawer over a door", name: "Base", layout: "mixed", shelves: 1, drawers: 1, base: "toekick", in: [24, 34.5, 24], mm: [600, 720, 560], doorPullFrom: "top" },
  { id: "wall", label: "Wall cabinet: doors, 12 in deep", name: "Wall", layout: "doors", shelves: 2, drawers: 0, base: "none", in: [30, 30, 12], mm: [600, 720, 300], doorPullFrom: "bottom", doorPullEnd: [2.5, 64] },
  { id: "tall", label: "Tall pantry: 84 in (needs a sheet over 4 ft)", name: "Pantry", layout: "doors", shelves: 4, drawers: 0, base: "toekick", in: [24, 84, 24], mm: [600, 2100, 560], doorPullFrom: "bottom", doorPullEnd: [30, 760] },
  { id: "open", label: "Open shelves, no doors", name: "Shelves", layout: "shelves", shelves: 2, drawers: 0, base: "toekick", in: [30, 34.5, 12], mm: [600, 720, 300] },
];

/**
 * A starting point applied to the sizes: its style, sizes and name, the rest kept. The name
 * keeps its number ("Base 3" becomes "Sink base 3").
 * @param {Sizes} s @param {string} id @param {boolean} metric @returns {Sizes}
 */
export function applyPreset(s, id, metric) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return s;
  const [w, h, d] = metric ? p.mm.map((v) => v * MM) : p.in.map((v) => v * IN);
  const n = /(\d+)$/.exec(s.name)?.[1] ?? "1";
  /** @type {Sizes} */
  const out = { ...s, name: `${p.name} ${n}`, layout: p.layout, shelves: p.shelves, drawers: p.drawers || s.drawers, base: p.base, width: w, height: h, depth: d };
  if (p.doorPullFrom) out.doorPullFrom = p.doorPullFrom;
  if (p.doorPullEnd) out.doorPullEnd = metric ? p.doorPullEnd[1] * MM : p.doorPullEnd[0] * IN;
  if (p.drawers) out.drawers = p.drawers;
  return out;
}

/**
 * A stock thickness exactly: "23/32 in" (to 1/64, else three decimals) or "18 mm". A
 * document's display precision would round 23/32 to 3/4, the very difference that matters.
 * @param {number} m @param {boolean} metric
 */
export function exactThickness(m, metric) {
  if (metric) return `${Math.round(m / MM * 100) / 100} mm`;
  const n = Math.round((m / IN) * 64);
  if (Math.abs(n / 64 - m / IN) > 1e-6) return `${(m / IN).toFixed(3)} in`;
  const whole = Math.floor(n / 64);
  let num = n % 64;
  let den = 64;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${whole ? `${whole}${num ? " " : ""}` : ""}${num ? `${num}/${den}` : whole ? "" : "0"} in`;
}

/**
 * One line on what the cabinet comes to: its parts, the stocks they need and the cuts.
 * @param {Sizes} s @param {{ parts: Part[], rows: string[][], runner: RunnerLength | null, holes: number }} planned @param {boolean} metric
 */
export function summary(s, planned, metric) {
  const format = (/** @type {number} */ m) => exactThickness(m, metric);
  const parts = planned.parts.reduce((n, p) => n + p.copies.length, 0);
  const used = new Set(planned.parts.map((p) => p.material));
  /** @type {string[]} */
  const stocks = [`${format(s.thickness)} cabinet${used.has(MATERIALS.doors.name) ? " and doors" : ""}`];
  if (used.has(MATERIALS.drawerFronts.name)) stocks.push(`${format(s.frontThickness)} drawer fronts`);
  if (used.has(MATERIALS.box.name)) stocks.push(`${format(s.drawerThickness)} drawer boxes`);
  if (used.has(MATERIALS.back.name)) stocks.push(`${format(s.backThickness)} back${used.has(MATERIALS.box.name) ? " and bottoms" : ""}`);
  const jig = planned.rows.filter((r) => /^Jig/.test(r[4])).length;
  const runner = planned.runner ? `; ${RUNNERS[s.slides].name} ${planned.runner.part}` : "";
  const drilled = s.hardware ? `; ${planned.holes} holes to drill${jig ? `, plus hook bores by jig` : ""}` : "";
  return `${parts} parts from ${stocks.join(", ")}${drilled}${runner}.`;
}

/** @param {string} system */
export const isMetric = (system) => system === "mm" || system === "cm" || system === "m";

/** @param {boolean} metric @returns {Sizes} */
export function defaults(metric) {
  return metric
    ? {
        name: "Cabinet 1",
        width: 600 * MM, height: 720 * MM, depth: 560 * MM,
        thickness: 18 * MM, frontThickness: 12 * MM, drawerThickness: 12 * MM, backThickness: 6 * MM,
        layout: "shelves", shelves: 1, drawers: 3,
        base: "toekick", toeKick: 100 * MM, toeSetback: 75 * MM,
        back: true, backMount: "groove", backInset: 12 * MM, backGrooveDepth: 8 * MM,
        front: "overlay", gap: 3 * MM,
        dados: false, dadoDepth: 6 * MM, dadoStop: 12 * MM, fit: 0.2 * MM, bit: 6 * MM,
        slides: "tandem", runner: 0,
        hardware: false, hingeInset: 100 * MM, cupDistance: 4.5 * MM,
        drawerPull: "center", drawerPullFromTop: 38 * MM, pullSpacing: 96 * MM, notchWidth: 100 * MM, notchDepth: 25 * MM,
        doorPull: "vertical", doorPullFrom: "top", doorPullEnd: 64 * MM, doorPullEdge: 38 * MM, doorPullSpacing: 96 * MM,
        pullHole: 5 * MM,
      }
    : {
        name: "Cabinet 1",
        // "3/4" plywood is 23/32 in, "1/2" is 15/32, "1/4" is 7/32 (the stock library says the
        // same). Measure yours and type it in: every joint is cut to these numbers.
        width: 24 * IN, height: 34.5 * IN, depth: 24 * IN,
        thickness: (23 / 32) * IN, frontThickness: (15 / 32) * IN, drawerThickness: (15 / 32) * IN, backThickness: (7 / 32) * IN,
        layout: "shelves", shelves: 1, drawers: 3,
        base: "toekick", toeKick: 4 * IN, toeSetback: 3 * IN,
        back: true, backMount: "groove", backInset: 0.5 * IN, backGrooveDepth: (5 / 16) * IN,
        front: "overlay", gap: 0.125 * IN,
        dados: false, dadoDepth: 0.25 * IN, dadoStop: 0.5 * IN, fit: 0.008 * IN, bit: 0.25 * IN,
        slides: "tandem", runner: 0,
        hardware: false, hingeInset: 3.5 * IN, cupDistance: 4.5 * MM,
        drawerPull: "center", drawerPullFromTop: 1.5 * IN, pullSpacing: 3 * IN, notchWidth: 4 * IN, notchDepth: 1 * IN,
        doorPull: "vertical", doorPullFrom: "top", doorPullEnd: 2.5 * IN, doorPullEdge: 1.5 * IN, doorPullSpacing: 3 * IN,
        pullHole: 5 * MM,
      };
}

/** @param {Partial<Sizes> & Record<string, unknown> | null | undefined} saved @param {boolean} metric @returns {Sizes} */
export function normalize(saved, metric) {
  const d = defaults(metric);
  const s = /** @type {Record<string, unknown>} */ (saved && typeof saved === "object" ? { ...d, ...saved } : d);
  const num = (/** @type {string} */ k) => {
    const v = s[k];
    return typeof v === "number" && Number.isFinite(v) ? v : /** @type {number} */ (/** @type {Record<string, unknown>} */ (d)[k]);
  };
  /** @template {string} T @param {string} k @param {readonly T[]} options @returns {T} */
  const pick = (k, options) => (options.includes(/** @type {T} */ (s[k])) ? /** @type {T} */ (s[k]) : /** @type {T} */ (/** @type {Record<string, unknown>} */ (d)[k]));
  // An older save had no base: a toe kick of 0 meant none.
  const oldNoKick = !!saved && !("base" in saved) && s.toeKick === 0;
  const base = s.base === "none" || oldNoKick ? "none" : "toekick";
  // An older save had one pull: "face" (two holes, centred) or "undermount" (an edge hole no
  // router can drill, now no pull).
  const oldPull = saved && !("drawerPull" in saved) && typeof s.pull === "string" ? (s.pull === "face" ? "center" : "none") : null;
  const name = typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 60) : d.name;
  return {
    name,
    width: num("width"),
    height: num("height"),
    depth: num("depth"),
    thickness: num("thickness"),
    frontThickness: num("frontThickness"),
    drawerThickness: num("drawerThickness"),
    backThickness: num("backThickness"),
    layout: pick("layout", /** @type {const} */ (["shelves", "doors", "drawers", "mixed"])),
    shelves: Math.round(num("shelves")),
    drawers: Math.round(num("drawers")),
    base,
    toeKick: oldNoKick ? d.toeKick : num("toeKick"),
    toeSetback: num("toeSetback"),
    back: !!s.back,
    backMount: pick("backMount", /** @type {const} */ (["groove", "butt"])),
    backInset: num("backInset"),
    backGrooveDepth: num("backGrooveDepth"),
    front: pick("front", /** @type {const} */ (["overlay", "inset"])),
    gap: num("gap"),
    dados: !!s.dados,
    dadoDepth: num("dadoDepth"),
    dadoStop: num("dadoStop"),
    fit: num("fit"),
    bit: num("bit"),
    slides: pick("slides", /** @type {const} */ (["tandem", "movento"])),
    runner: Math.round(num("runner")),
    hardware: !!s.hardware,
    hingeInset: num("hingeInset"),
    cupDistance: num("cupDistance"),
    drawerPull: oldPull ?? pick("drawerPull", /** @type {const} */ (["center", "top", "notch", "none"])),
    drawerPullFromTop: num("drawerPullFromTop"),
    pullSpacing: num("pullSpacing"),
    notchWidth: num("notchWidth"),
    notchDepth: num("notchDepth"),
    doorPull: pick("doorPull", /** @type {const} */ (["vertical", "horizontal", "none"])),
    doorPullFrom: pick("doorPullFrom", /** @type {const} */ (["top", "bottom"])),
    doorPullEnd: num("doorPullEnd"),
    doorPullEdge: num("doorPullEdge"),
    doorPullSpacing: num("doorPullSpacing"),
    pullHole: num("pullHole"),
  };
}

/** Round down to a sixteenth (inches) or a millimetre. @param {number} m @param {boolean} metric */
const floorTo = (m, metric) => {
  const step = metric ? MM : IN / 16;
  return Math.floor(m / step + 1e-6) * step;
};
const mm = (/** @type {number} */ m) => Math.round(m * 1e4) / 10;
const fmtMm = (/** @type {number} */ m) => `${mm(m)} mm`;
const fmtIn = (/** @type {number} */ m) => `${(m / IN).toFixed(3)} in`;
const both = (/** @type {number} */ m) => `${fmtMm(m)} (${fmtIn(m)})`;

/**
 * What Generate will say it is making.
 * @param {Sizes} s @param {(m: number) => string} format @param {boolean} metric
 */
export function phrase(s, format, metric) {
  void metric;
  const toe = s.base === "toekick" ? `, ${format(s.toeKick)} toe kick` : ", no toe kick (sits on a base)";
  const back = s.back ? ", back" : "";
  const n = s.shelves;
  const shelves = `${n} ${n === 1 ? "shelf" : "shelves"}`;
  const drawers = `${s.drawers} ${s.drawers === 1 ? "drawer" : "drawers"}`;
  const layout = s.layout === "shelves" ? shelves : s.layout === "doors" ? `door and ${shelves}` : s.layout === "drawers" ? drawers : `${drawers} and a door`;
  const extra = `${s.dados ? ", blind dados" : ""}${s.hardware ? ", hardware holes" : ""}`;
  const runner = s.layout === "drawers" || s.layout === "mixed" ? `, ${RUNNERS[s.slides].name}` : "";
  return `${format(s.width)} x ${format(s.height)} x ${format(s.depth)}, ${layout}${back}${toe}${extra}${runner}`;
}

/** @param {Sizes} s @param {boolean} metric @returns {string | null} */
export function issue(s, metric) {
  return plan(s, metric).error;
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ error: string | null, parts: Part[], rows: string[][], runner: RunnerLength | null, holes: number }}
 */
export function plan(s, metric) {
  try {
    return { error: null, ...build(s, metric) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), parts: [], rows: [], runner: null, holes: 0 };
  }
}

/** @param {Sizes} s */
function validate(s) {
  const t = s.thickness;
  const stock = (/** @type {number} */ x) => x > 0 && x <= 2 * IN;
  if (!stock(t)) return "The cabinet stock must be more than 0 and at most 2 in thick.";
  if (!stock(s.frontThickness)) return "The drawer front stock must be more than 0 and at most 2 in thick.";
  if (!stock(s.drawerThickness)) return "The drawer box stock must be more than 0 and at most 2 in thick.";
  if (!(s.backThickness > 0 && s.backThickness < t)) return "The back and drawer-bottom stock must be thinner than the cabinet stock.";
  if (!(s.width > 2 * t)) return "The width must be more than two thicknesses.";
  if (!(s.depth > t + (s.back ? s.backThickness + (s.backMount === "groove" ? s.backInset : 0) : 0))) return "The cabinet is not deep enough for its back.";
  if (s.base === "toekick") {
    if (!(s.toeKick > 0)) return "The toe kick needs a height, or choose no toe kick.";
    if (!(s.toeSetback > 0) || !(s.toeSetback + t < s.depth / 2)) return "The toe kick setback must be more than 0 and leave the side standing.";
  }
  if (!Number.isInteger(s.shelves) || s.shelves < 0 || s.shelves > 20) return "Shelves: a whole number from 0 to 20.";
  if (!Number.isInteger(s.drawers) || s.drawers < 0 || s.drawers > 8) return "Drawers: a whole number from 0 to 8.";
  const needsDrawers = s.layout === "drawers" || s.layout === "mixed";
  if (needsDrawers && s.drawers < 1) return "This layout needs at least one drawer.";
  if (!(s.gap >= 0) || s.gap > 0.5 * IN) return "The gap between fronts must be 0 to 1/2 in.";
  if (!(s.fit >= 0) || s.fit > 1 * MM) return "The fit must be 0 to 1 mm (0.04 in) over the stock.";
  if (!(s.bit > 0) || s.bit > 0.5 * IN) return "The bit diameter must be more than 0 and at most 1/2 in.";
  if (s.back && s.backMount === "groove") {
    if (!(s.backGrooveDepth > 0) || s.backGrooveDepth > t / 2 + 1e-9) return `The back groove must be more than 0 and at most half the stock (${both(t / 2)}) deep.`;
    if (!(s.backInset >= 0) || !(s.backInset < s.depth / 3)) return "The back's inset from the rear edge must be 0 or more, and under a third of the depth.";
    if (s.dados && Math.abs(s.backGrooveDepth - s.dadoDepth) < 0.05 * MM) return "Make the back groove a different depth from the dados (deeper, say), so each gets its own layer and bit in the DXF.";
  }
  if (s.dados) {
    if (!(s.dadoDepth > 0) || s.dadoDepth > t / 2 + 1e-9) return `The dado depth must be more than 0 and at most half the stock (${both(t / 2)}).`;
    if (!(s.dadoDepth > RELIEF + 0.5 * MM)) return "The dado is too shallow to hold a rail.";
    if (!(s.dadoStop > 0)) return "The dado stop must be more than 0, or the groove shows at the front.";
    if (!(s.dadoStop + s.bit < s.depth / 2)) return "The cabinet is not deep enough for a blind dado this far back.";
  }
  if (s.hardware) {
    if (!(t - CUP.depth * MM >= 3 * MM)) return `A Blum hinge cup is ${CUP.depth} mm deep: the door stock must be at least ${CUP.depth + 3} mm.`;
    if (!(t - SYS.depth * MM >= 3 * MM)) return `System screw holes are ${SYS.depth} mm deep: the cabinet stock must be at least ${SYS.depth + 3} mm.`;
    if (!(s.cupDistance >= CUP.minK * MM - 1e-9 && s.cupDistance <= CUP.maxK * MM + 1e-9)) return `The hinge cup boring distance must be ${CUP.minK} to ${CUP.maxK} mm (Blum CLIP top).`;
    if (!(s.pullHole > 0 && s.pullHole <= 12 * MM)) return "The pull hole must be more than 0 and at most 12 mm.";
    if (!(s.pullSpacing >= 0 && s.doorPullSpacing >= 0)) return "Pull spacing cannot be negative.";
  }
  return null;
}

/**
 * @param {Sizes} s
 * @returns {string | {
 *   t: number, kick: number, innerW: number, innerD: number, floor: number, ceiling: number,
 *   bands: { z0: number, z1: number, kind: "drawer" | "door" }[],
 * }}
 */
function openings(s) {
  const t = s.thickness;
  const kick = s.base === "toekick" ? s.toeKick : 0;
  const innerW = s.width - 2 * t;
  // Inside depth: to the front of the back.
  const innerD = !s.back ? s.depth : s.backMount === "groove" ? s.depth - s.backInset - s.backThickness : s.depth - s.backThickness;
  const floor = kick + t;
  const ceiling = s.height - t;
  const interior = ceiling - floor;
  if (!(interior > 0)) return "It is not tall enough for a top and a bottom over the toe kick.";
  /** @type {{ z0: number, z1: number, kind: "drawer" | "door" }[]} */
  const bands = [];
  if (s.layout === "shelves" || s.layout === "doors") {
    if (!(interior > s.shelves * t)) return "It is not tall enough for its shelves.";
    if (s.layout === "doors") bands.push({ z0: floor, z1: ceiling, kind: "door" });
  } else {
    const n = s.layout === "drawers" ? s.drawers : s.drawers + 1;
    const share = interior / n;
    for (let i = 0; i < s.drawers; i++) bands.push({ z0: floor + i * share, z1: floor + (i + 1) * share, kind: "drawer" });
    if (s.layout === "mixed") {
      const z0 = floor + s.drawers * share;
      if (!(ceiling - z0 > s.shelves * t)) return "The opening above the drawers is not tall enough for its shelves.";
      bands.push({ z0, z1: ceiling, kind: "door" });
    }
  }
  return { t, kick, innerW, innerD, floor, ceiling, bands };
}

/**
 * The hole lies inside one cell of the part's grid (no prism edge crosses it), as partMesh needs.
 * @param {V3} size @param {Prism[]} prisms @param {Hole} hole
 */
function holeClear(size, prisms, hole) {
  const axes = [0, 1, 2].filter((k) => k !== hole.axis);
  // The face must be there: a hole whose centre is inside a cut (a dado) has no face to go in.
  const probe = /** @type {V3} */ ([0, 0, 0]);
  probe[hole.axis] = hole.at + hole.inward * 1e-6;
  axes.forEach((k, i) => (probe[k] = hole.center[i]));
  if (prisms.some((p) => probe.every((v, k) => v > p.min[k] - 1e-9 && v < p.max[k] + 1e-9))) return false;
  return axes.every((k, i) => {
    const cuts = [0, size[k]];
    for (const p of prisms) cuts.push(Math.max(0, Math.min(size[k], p.min[k])), Math.max(0, Math.min(size[k], p.max[k])));
    const c = hole.center[i];
    const lo = c - hole.radius - WEB;
    const hi = c + hole.radius + WEB;
    if (lo <= 1e-9 || hi >= size[k] - 1e-9) return false;
    return !cuts.some((x) => x > lo - 1e-9 && x < hi + 1e-9);
  });
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ parts: Part[], rows: string[][], runner: RunnerLength | null, holes: number }}
 */
function build(s, metric) {
  const wrong = validate(s);
  if (wrong) throw new Error(wrong);
  const fit = openings(s);
  if (typeof fit === "string") throw new Error(fit);
  const { t, kick, innerW, innerD, floor, ceiling, bands } = fit;
  const g = s.gap;
  const stop = s.dadoStop;
  const overlay = s.front === "overlay";
  const bT = s.backThickness;
  const grooved = s.back && s.backMount === "groove";
  const bgd = s.backGrooveDepth;
  /** Front face of the back, and its height range (in the grooves). */
  const yb0 = innerD;
  const zb0 = kick + t - bgd;
  const zb1 = s.height - t + bgd;
  /** @type {Part[]} */
  const parts = [];
  /** @type {string[][]} */
  const rows = [];

  /**
   * One definition per distinct part: same name, blank and cuts. Parts that differ (the top
   * drawer front is taller) are separate definitions with the same name.
   * @param {string} name @param {string} material @param {V3} blank @param {Prism[]} prisms @param {Hole[]} holes
   * @param {{ at: V3, name?: string }} copy
   */
  const add = (name, material, blank, prisms, holes, copy) => {
    // Rounded to a micrometre: two fronts a float apart are the same part.
    const key = JSON.stringify([name, blank, prisms, holes], (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) : v));
    let part = /** @type {Part & { key?: string } | undefined} */ (parts.find((p) => /** @type {Part & { key?: string }} */ (p).key === key));
    if (!part) {
      let mesh;
      try {
        mesh = partMesh(name, blank, prisms, holes);
      } catch (e) {
        throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      part = { name, material, blank, copies: [], mesh };
      Object.defineProperty(part, "key", { value: key, enumerable: false });
      parts.push(part);
    }
    part.copies.push(copy);
    drilled += holes.length;
  };
  let drilled = 0;
  /** @param {string} part @param {string} where @param {string} hole @param {string} depth @param {string} how */
  const note = (part, where, hole, depth, how) => rows.push([part, where, hole, depth, how]);
  /** @param {string} part @param {V3} size @param {Prism[]} prisms @param {Hole} h @param {string} what @param {string} [fix] */
  const placeHole = (part, size, prisms, h, what, fix = "Change the sizes, or turn hardware holes off.") => {
    if (!holeClear(size, prisms, h)) throw new Error(`${part}: the ${what} lands on a dado, a joint or an edge. ${fix}`);
    return h;
  };

  // --- the carcass -------------------------------------------------------------------------
  /** Rails the sides are grooved for. */
  const rails = [{ z: kick, name: "Bottom" }, { z: s.height - t, name: "Top" }];
  const shelfZs = shelfHeights(s, floor, ceiling, bands);
  shelfZs.forEach((z, i) => rails.push({ z, name: `Shelf ${i + 1}` }));
  const tongue = s.dados ? s.dadoDepth - RELIEF : 0;
  const notchLen = stop + s.bit;
  /** The back's groove across the depth (y), the back plus the fit. */
  const backY = /** @type {[number, number]} */ ([yb0 - s.fit / 2, yb0 + bT + s.fit / 2]);

  const sideSize = /** @type {V3} */ ([t, s.depth, s.height]);
  /** Prisms of a side whose inner face is at x = `inner` (0 or t). @param {number} inner */
  const sidePrisms = (inner) => {
    /** @param {number} d */
    const xs = (d) => (inner === 0 ? [0, d] : [t - d, t]);
    /** @type {Prism[]} */
    const out = [];
    if (s.dados) {
      const [x0, x1] = xs(s.dadoDepth);
      for (const r of rails) out.push({ min: [x0, stop, r.z - s.fit / 2], max: [x1, s.depth, r.z + t + s.fit / 2] });
    }
    if (grooved) {
      const [x0, x1] = xs(bgd);
      out.push({ min: [x0, backY[0], zb0 - s.fit / 2], max: [x1, backY[1], zb1 + s.fit / 2] });
    }
    if (s.base === "toekick") out.push({ min: [0, 0, 0], max: [t, s.toeSetback, kick] });
    return out;
  };
  /** @type {{ left: Hole[], right: Hole[] }} */
  const sideHoles = { left: [], right: [] };
  /** @param {"left" | "right"} which @param {number} y @param {number} z @param {string} what @param {string} [fix] */
  const sideHole = (which, y, z, what, fix) => {
    const inner = which === "left" ? t : 0;
    const h = /** @type {Hole} */ ({ axis: 0, at: inner, inward: which === "left" ? -1 : 1, center: [y, z], radius: (SYS.dia * MM) / 2, depth: SYS.depth * MM });
    sideHoles[which].push(placeHole(`${which === "left" ? "Left" : "Right"} side`, sideSize, sidePrisms(inner), h, what, fix));
  };

  // --- fronts --------------------------------------------------------------------------------
  const last = bands.length - 1;
  /**
   * The front of band i: x0, x1 across the cabinet, z0, z1 up it, y of its front face.
   * Overlay fronts tile the cabinet's face, a gap between them and half a gap at its edges.
   * @param {number} i @param {number} thick
   */
  const frontBox = (i, thick) => {
    const band = bands[i];
    if (overlay) {
      const z0 = (i === 0 ? kick : band.z0) + g / 2;
      const z1 = (i === last ? s.height : band.z1) - g / 2;
      return { x0: g / 2, x1: s.width - g / 2, z0, z1, y: -thick };
    }
    return { x0: t + g / 2, x1: s.width - t - g / 2, z0: band.z0 + g / 2, z1: band.z1 - g / 2, y: 0 };
  };
  const pullR = s.pullHole / 2;
  /** A through hole in a front's face (y = 0 is the show face). @param {number} x @param {number} z @param {number} thick */
  const pullHoleAt = (x, z, thick) => /** @type {Hole} */ ({ axis: 1, at: 0, inward: 1, center: [x, z], radius: pullR, depth: thick, through: true });

  const doorBand = bands.find((x) => x.kind === "door");
  if (doorBand) {
    const fb = frontBox(bands.indexOf(doorBand), t);
    const across = fb.x1 - fb.x0;
    const pair = across > MAX_DOOR;
    const leaves = pair ? [{ hinge: "left", x0: fb.x0, x1: fb.x0 + (across - g) / 2 }, { hinge: "right", x0: fb.x1 - (across - g) / 2, x1: fb.x1 }] : [{ hinge: "left", x0: fb.x0, x1: fb.x1 }];
    const fh = fb.z1 - fb.z0;
    const count = fh <= 900 * MM ? 2 : fh <= 1600 * MM ? 3 : fh <= 2000 * MM ? 4 : 5;
    const r = (CUP.dia * MM) / 2;
    const cupCenter = CUP.radius * MM + s.cupDistance;
    for (const leaf of leaves) {
      const fw = leaf.x1 - leaf.x0;
      if (!(fw > 2 * t) || !(fh > 2 * t)) throw new Error("The door has no room once the gaps are taken off.");
      const size = /** @type {V3} */ ([fw, t, fh]);
      const name = pair ? (leaf.hinge === "left" ? "Left door" : "Right door") : "Door";
      /** @type {Hole[]} */
      const holes = [];
      /** @type {[number, number][]} */
      const cups = [];
      if (s.hardware) {
        // A short door cannot keep the typed inset: pull the cups in until they clear each other.
        const inset = Math.min(s.hingeInset, (fh - CUP.dia * MM - 6 * MM) / 2);
        if (!(inset > r + 2 * MM)) throw new Error("The door is too short for two hinge cups. Make it taller, or turn hardware holes off.");
        const zs = Array.from({ length: count }, (_, k) => inset + ((fh - 2 * inset) * k) / (count - 1));
        const cx = leaf.hinge === "left" ? cupCenter : fw - cupCenter;
        const which = leaf.hinge === "left" ? "left" : "right";
        const inner = which === "left" ? t : 0;
        /** Both plate holes of a cup at cz (door coordinates) clear the side's dados. @param {number} cz */
        const plateClear = (cz) =>
          !overlay ||
          (rails.every((rl) => fb.z0 + cz + PLATE_HALF <= rl.z - s.fit || fb.z0 + cz - PLATE_HALF >= rl.z + t + s.fit) &&
            [-1, 1].every((d) =>
              holeClear(sideSize, sidePrisms(inner), { axis: 0, at: inner, inward: which === "left" ? -1 : 1, center: [CUP.plateSetback * MM, fb.z0 + cz + (d * CUP.plateSpacing * MM) / 2], radius: (SYS.dia * MM) / 2, depth: SYS.depth * MM }),
            ));
        for (const want of zs) {
          // A plate that lands on a shelf slides along the door, the least it must, and stays
          // clear of the door's edges and the other cups.
          let cz = NaN;
          for (let step = 0; step <= 150 && Number.isNaN(cz); step++) {
            for (const sign of step ? [1, -1] : [1]) {
              const z = want + sign * step * MM;
              const inDoor = z - r >= WEB && z + r <= fh - WEB;
              const apart = cups.every(([, p]) => Math.abs(p - z) >= CUP.dia * MM + 6 * MM);
              if (inDoor && apart && plateClear(z)) {
                cz = z;
                break;
              }
            }
          }
          if (Number.isNaN(cz)) throw new Error(`${name}: no place for a hinge whose mounting plate clears the shelves. Change the hinge inset or the shelf count, or turn hardware holes off.`);
          cups.push([cx, cz]);
          const moved = Math.abs(cz - want) > 1e-6 ? ` (moved ${Math.round((cz - want) / MM)} mm to clear a shelf)` : "";
          // The cup is in the back face (y = t), the face against the cabinet.
          holes.push(placeHole(name, size, [], { axis: 1, at: t, inward: -1, center: [cx, cz], radius: r, depth: CUP.depth * MM }, "hinge cup"));
          note(name, `Hinge cup, ${both(cz)} up, centre ${both(cupCenter)} from the hinge edge, back face${moved}`, `${CUP.dia} mm`, `${CUP.depth} mm`, "CNC");
          if (overlay) {
            for (const dz of [-CUP.plateSpacing / 2, CUP.plateSpacing / 2]) sideHole(which, CUP.plateSetback * MM, fb.z0 + cz + dz * MM, "hinge plate hole");
            note(which === "left" ? "Left side" : "Right side", `Hinge plate, 2 holes ${CUP.plateSpacing} mm apart, ${CUP.plateSetback} mm from front, centred ${both(fb.z0 + cz)} up`, `${SYS.dia} mm`, `${SYS.depth} mm`, "CNC");
          }
        }
        if (!overlay) note(name, "Hinge mounting plates (inset)", "-", "-", "Not drilled: inset plate position depends on the hinge, see Blum's inset tables");

        // The pull, on the opening edge (away from the hinges).
        if (s.doorPull !== "none") {
          const ox = (/** @type {number} */ d) => (leaf.hinge === "left" ? fw - d : d);
          const end = s.doorPullFrom === "top" ? fh - s.doorPullEnd : s.doorPullEnd;
          const toward = s.doorPullFrom === "top" ? -1 : 1;
          /** @type {[number, number][]} */
          const at =
            s.doorPull === "vertical"
              ? [
                  [ox(s.doorPullEdge), end],
                  [ox(s.doorPullEdge), end + toward * s.doorPullSpacing],
                ]
              : [
                  [ox(s.doorPullEdge), end],
                  [ox(s.doorPullEdge + s.doorPullSpacing), end],
                ];
          for (const [x, z] of at) {
            if (cups.some(([cx2, cz2]) => Math.hypot(x - cx2, z - cz2) < r + pullR + WEB)) throw new Error(`${name}: the pull lands on a hinge cup. Move the pull, or change the hinge inset.`);
            holes.push(placeHole(name, size, [], pullHoleAt(x, z, t), "pull hole", "Move the pull (its distance from the edge and the end), or change its spacing."));
          }
          note(name, `Pull, 2 holes ${both(s.doorPullSpacing)} apart, ${s.doorPull}, the nearer ${both(s.doorPullEnd)} from the ${s.doorPullFrom} and ${both(s.doorPullEdge)} from the opening edge`, fmtMm(s.pullHole), "through", "CNC");
        }
      }
      add(name, MATERIALS.doors.name, size, [], holes, { at: [leaf.x0, fb.y, fb.z0], name });
    }
  }

  // --- drawers -------------------------------------------------------------------------------
  const drawerBands = bands.filter((x) => x.kind === "drawer");
  /** @type {RunnerLength | null} */
  let runner = null;
  if (drawerBands.length) {
    const R = RUNNERS[s.slides];
    const ds = s.drawerThickness;
    const tf = s.frontThickness;
    if (!(ds >= BLUM.minSide * MM && ds <= BLUM.maxSide * MM)) throw new Error(`${R.name} takes drawer sides 12 to 16 mm (15/32 to 5/8 in) thick.`);
    const inside = innerW - BLUM.insideDeduct * MM;
    if (!(inside >= BLUM.minInside * MM)) throw new Error(`The drawers are too narrow: Blum locking devices need an inside drawer width of at least ${BLUM.minInside} mm (6-11/16 in).`);
    const outside = inside + 2 * ds;
    const avail = (innerD - (overlay ? 0 : tf)) / MM;
    if (s.runner) {
      runner = R.lengths.find((x) => x.nl === s.runner) ?? null;
      if (!runner) throw new Error(`${R.name} has no ${s.runner} mm runner.`);
      if (runner.minDepth > avail + 1e-6) throw new Error(`A ${runner.nl} mm ${R.name} runner needs ${runner.minDepth} mm inside the cabinet; it has ${Math.floor(avail)} mm.`);
    } else {
      const fits = R.lengths.filter((x) => x.minDepth <= avail + 1e-6);
      runner = fits[fits.length - 1] ?? null;
      if (!runner) throw new Error(`The cabinet is too shallow for ${R.name}: the shortest runner needs ${R.lengths[0].minDepth} mm inside.`);
    }
    const rl = runner;
    const nl = rl.nl * MM;
    const shift = R.thinShift && ds <= 13.5 * MM ? R.thinShift : 0;
    const gd = Math.min(ds / 2, 0.25 * IN);
    const recess = BLUM.bottomRecess * MM;
    /** The bottom's groove, up from the bottom of the box. */
    const gz = /** @type {[number, number]} */ ([recess, recess + bT + s.fit]);
    note("Drawer", `${R.name} ${rl.part}, ${rl.nl} mm (${(rl.nl / 25.4).toFixed(0)} in) drawer length`, "-", "-", "Hardware");
    note("Drawer", R.lock, "-", "-", "Hand");
    note("Drawer box", `Bottom slides in from the back in grooves ${both(bT + s.fit)} wide, ${both(recess)} up; the back sits on it, so the runner passes under the back (no notch)`, "-", both(gd), "CNC (pocket)");

    drawerBands.forEach((band, i) => {
      const n = i + 1;
      const openingH = band.z1 - band.z0;
      const boxH = floorTo(openingH - R.heightDeduct * MM, metric);
      if (!(boxH >= 60 * MM)) throw new Error(`Drawer ${n} is too short: ${R.name} needs the box at least 60 mm tall, ${R.heightDeduct} mm under its opening.`);
      const x0 = t + (innerW - outside) / 2;
      const y0 = overlay ? 0 : tf;
      const z0 = band.z0 + R.bottomClearance * MM;

      // Runner screws in both sides, from Blum's frameless table.
      if (s.hardware && overlay) {
        const zs = band.z0 + R.screwHeight * MM;
        for (const y of [BLUM.frontScrew, rl.a, rl.b]) {
          for (const which of /** @type {const} */ (["left", "right"])) sideHole(which, (y - shift) * MM, zs, `drawer ${n} runner screw`);
        }
        note("Left and right sides", `Drawer ${n} runner screws at ${BLUM.frontScrew - shift}, ${rl.a - shift}, ${rl.b - shift} mm from front, ${R.screwHeight} mm above the opening`, `${SYS.dia} mm`, `${SYS.depth} mm`, "CNC");
      } else if (s.hardware) {
        note("Left and right sides", `Drawer ${n} runner screws (inset)`, "-", "-", "Not drilled: inset setback adds the front thickness, see Blum's inset page");
      }

      // The applied front, and where its finger notch is (if it has one).
      const fb = frontBox(bands.indexOf(band), tf);
      const fw = fb.x1 - fb.x0;
      const fh = fb.z1 - fb.z0;
      const fSize = /** @type {V3} */ ([fw, tf, fh]);
      /** @type {Prism[]} */
      const fPrisms = [];
      /** @type {Hole[]} */
      const fHoles = [];
      /** @type {Prism[]} */
      const subNotch = [];
      if (s.drawerPull === "notch") {
        const W = s.notchWidth;
        const D = s.notchDepth;
        if (!(W > 0 && W < fw - 4 * s.bit)) throw new Error(`Drawer ${n}'s front is too narrow for a ${both(W)} finger notch.`);
        if (!(D > 0 && D < fh / 2)) throw new Error(`Drawer ${n}'s finger notch must be more than 0 and under half the front's height deep.`);
        fPrisms.push({ min: [fw / 2 - W / 2, 0, fh - D], max: [fw / 2 + W / 2, tf, fh] });
        // Cut the sub-front behind it lower, so fingers reach behind the front.
        const subTop = fb.z0 + fh - D - FINGER_ROOM - z0;
        if (!(subTop > gz[1] + 10 * MM)) throw new Error(`Drawer ${n} is too short for a ${both(D)} finger notch: the sub-front behind it would reach its bottom groove.`);
        const sx = fb.x0 + fw / 2 - (x0 + ds);
        subNotch.push({ min: [sx - W / 2, 0, subTop], max: [sx + W / 2, ds, boxH] });
        if (i === 0) note("Drawer front", `Finger notch ${both(W)} wide, ${both(D)} deep, centred in the top edge; the sub-front behind is cut ${both(FINGER_ROOM)} lower`, "-", "through", "CNC (profile)");
      } else if (s.hardware && s.drawerPull !== "none") {
        const z = s.drawerPull === "center" ? fh / 2 : fh - s.drawerPullFromTop;
        if (!(s.pullSpacing / 2 + pullR < fw / 2 - 5 * MM)) throw new Error(`Drawer ${n}'s front is too narrow for pull holes ${both(s.pullSpacing)} apart.`);
        for (const cx of [fw / 2 - s.pullSpacing / 2, fw / 2 + s.pullSpacing / 2]) {
          fHoles.push(placeHole("Drawer front", fSize, [], pullHoleAt(cx, z, tf), "pull hole", "Move the pull down from the top, or change its spacing."));
        }
        note("Drawer front", `Pull, 2 holes ${both(s.pullSpacing)} apart, ${s.drawerPull === "center" ? "centred" : `${both(s.drawerPullFromTop)} down from the top`}`, fmtMm(s.pullHole), "through", "CNC");
      }
      add("Drawer front", MATERIALS.drawerFronts.name, fSize, fPrisms, fHoles, { at: [fb.x0, fb.y, fb.z0], name: `Drawer ${n} front` });

      // Box: sides run the full length; the sub-front and back sit between them. The bottom
      // slides in under the back, in grooves in the sides and the sub-front.
      /** @param {number} inner */
      const groove = (inner) => /** @type {Prism} */ ({ min: [inner === 0 ? 0 : ds - gd, 0, gz[0]], max: [inner === 0 ? gd : ds, nl, gz[1]] });
      const dSize = /** @type {V3} */ ([ds, nl, boxH]);
      add("Drawer side", MATERIALS.box.name, dSize, [groove(ds)], [], { at: [x0, y0, z0], name: `Drawer ${n} left` });
      add("Drawer side", MATERIALS.box.name, dSize, [groove(0)], [], { at: [x0 + outside - ds, y0, z0], name: `Drawer ${n} right` });
      if (s.hardware && i === 0) note("Drawer side", `Rear hook bore, rear end, ${BLUM.hookIn} mm in from outside, ${BLUM.hookUp} mm up`, `${BLUM.hookDia} mm`, `${BLUM.hookDepth} mm`, "Jig (edge bore)");

      add("Drawer sub-front", MATERIALS.box.name, [inside, ds, boxH], [{ min: [0, ds - gd, gz[0]], max: [inside, ds, gz[1]] }, ...subNotch], [], { at: [x0 + ds, y0, z0], name: `Drawer ${n} sub-front` });
      const backH = boxH - gz[1];
      add("Drawer back", MATERIALS.box.name, [inside, ds, backH], [], [], { at: [x0 + ds, y0 + nl - ds, z0 + gz[1]], name: `Drawer ${n} back` });

      const bw = inside + 2 * (gd - PANEL_GAP);
      const bl = nl - ds + gd - PANEL_GAP;
      add("Drawer bottom", MATERIALS.back.name, [bw, bl, bT], [], [], { at: [x0 + ds - gd + PANEL_GAP, y0 + ds - gd + PANEL_GAP, z0 + recess + s.fit / 2], name: `Drawer ${n} bottom` });
    });
  }

  // --- carcass parts ---------------------------------------------------------------------------
  add("Left side", MATERIALS.carcass.name, sideSize, sidePrisms(t), sideHoles.left, { at: [0, 0, 0], name: "Left side" });
  add("Right side", MATERIALS.carcass.name, sideSize, sidePrisms(0), sideHoles.right, { at: [s.width - t, 0, 0], name: "Right side" });

  /**
   * A rail between the sides. The top and the bottom run to the back edge and carry the back's
   * groove (under the top, on the bottom); a shelf stops at the back.
   * @param {number} z @param {string} name @param {string} copyName @param {"top" | "bottom" | "shelf"} kind
   */
  const addRail = (z, name, copyName, kind) => {
    const len = innerW + 2 * tongue;
    const depth = grooved ? (kind === "shelf" ? yb0 - PANEL_GAP : s.depth) : innerD;
    /** @type {Prism[]} */
    const prisms = [];
    if (s.dados) {
      prisms.push({ min: [0, 0, 0], max: [tongue, notchLen, t] }, { min: [len - tongue, 0, 0], max: [len, notchLen, t] });
    }
    if (grooved && kind !== "shelf") {
      prisms.push(kind === "top" ? { min: [0, backY[0], 0], max: [len, backY[1], bgd] } : { min: [0, backY[0], t - bgd], max: [len, backY[1], t] });
    }
    add(name, MATERIALS.carcass.name, [len, depth, t], prisms, [], { at: [t - tongue, 0, z], name: copyName });
  };
  addRail(s.height - t, "Top", "Top", "top");
  addRail(kick, "Bottom", "Bottom", "bottom");
  shelfZs.forEach((z, i) => addRail(z, "Shelf", `Shelf ${i + 1}`, "shelf"));
  if (s.dados) {
    note("Sides", `Blind dados ${both(t + s.fit)} wide, stop ${both(stop)} from the front`, "-", both(s.dadoDepth), "CNC (pocket)");
    note("Rails", `Tongues ${both(tongue)} long, front corners notched ${both(notchLen)} deep (stop + bit)`, "-", "through", "CNC (profile)");
  }

  if (s.back) {
    if (grooved) {
      add("Back", MATERIALS.back.name, [innerW + 2 * (bgd - PANEL_GAP), bT, zb1 - zb0 - 2 * PANEL_GAP], [], [], { at: [t - bgd + PANEL_GAP, yb0, zb0 + PANEL_GAP], name: "Back" });
      note("Sides, top, bottom", `Back groove ${both(bT + s.fit)} wide, ${both(s.backInset)} in from the rear edge`, "-", both(bgd), "CNC (pocket)");
    } else {
      add("Back", MATERIALS.back.name, [innerW, bT, s.height - kick], [], [], { at: [t, s.depth - bT, kick], name: "Back" });
    }
  }
  if (s.base === "toekick") add("Toe kick", MATERIALS.carcass.name, [innerW, t, kick], [], [], { at: [t, s.toeSetback, 0], name: "Toe kick" });

  // A groove narrower than the bit cannot be cut with it.
  const narrow = (s.back && grooved) || drawerBands.length ? bT + s.fit : Infinity;
  if (narrow < s.bit) note("Grooves", `Back and drawer-bottom grooves are ${both(narrow)} wide, narrower than the ${both(s.bit)} bit: cut their layers with a smaller bit (1/8 in or 3 mm)`, "-", "-", "Change bit");

  return { parts, rows, runner, holes: drilled };
}

/** @param {Sizes} s @param {number} floor @param {number} ceiling @param {{ z0: number, z1: number, kind: string }[]} bands */
function shelfHeights(s, floor, ceiling, bands) {
  const door = bands.find((x) => x.kind === "door");
  const z0 = s.layout === "mixed" && door ? door.z0 : floor;
  const z1 = s.layout === "mixed" && door ? door.z1 : ceiling;
  const count = s.layout === "drawers" ? 0 : s.shelves;
  if (!count) return [];
  const t = s.thickness;
  const gap = (z1 - z0 - count * t) / (count + 1);
  return Array.from({ length: count }, (_, i) => z0 + gap * (i + 1) + t * i);
}

/**
 * The import op: one component per part, one assembly, one undo step. `materials` are the
 * ones to define (those the model does not have yet, so a stock picked for one is kept).
 * @param {Part[]} parts
 * @param {V3 | { linear: number[][], translation: V3 } | undefined} at
 * @param {string} assemblyName
 * @param {string} instanceName
 * @param {{ name: string, color: [number, number, number, number] }[]} [materials]
 */
export function importOp(parts, at, assemblyName, instanceName, materials = []) {
  /** @param {V3 | { linear: number[][], translation: V3 } | undefined} place */
  const xform = (place) => {
    if (place && typeof place === "object" && "linear" in place) return place;
    const p = /** @type {V3} */ (place ?? [0, 0, 0]);
    return { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: p };
  };
  /** @type {{ name: string, items: (import("./mesh.js").Mesh & { material?: string })[], children?: Record<string, unknown>[] }[]} */
  const definitions = parts.map((p) => ({ name: p.name, items: [{ ...p.mesh, material: p.material }] }));
  /** @type {Record<string, unknown>[]} */
  const children = [];
  parts.forEach((p, i) => {
    for (const c of p.copies) {
      /** @type {Record<string, unknown>} */
      const child = { kind: "instance", definition: i, xform: xform(c.at) };
      if (c.name) child.name = c.name;
      children.push(child);
    }
  });
  definitions.push({ name: assemblyName, items: [], children });
  /** @type {Record<string, unknown>} */
  const node = { kind: "instance", definition: definitions.length - 1, xform: xform(at) };
  node.name = instanceName;
  /** @type {Record<string, unknown>} */
  const op = { op: "import", definitions, nodes: [node] };
  if (materials.length) op.materials = materials.map((m) => ({ name: m.name, color: m.color }));
  return op;
}
