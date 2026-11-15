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
import { matchFronts } from "./match.js";
import { partMesh } from "./mesh.js";
import { normalizeTrim, trimDefaults } from "./trimsizes.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {"shelves" | "doors" | "drawers" | "mixed" | "trash"} Layout */
/** @typedef {"auto" | "one" | "two"} DoorCount */
/** @typedef {"left" | "right"} HingeSide */
/** @typedef {"none" | "top" | "both"} Nailers */
/** @typedef {"one" | "side" | "deep"} TrashBins */
/** @typedef {"rv35" | "rv50" | "rv27" | "custom"} Bin */
/** @typedef {"overlay" | "inset"} Front */
/** @typedef {"toekick" | "none"} Base */
/** @typedef {"tandem" | "movento"} Slides */
/** @typedef {"full" | "stretchers"} Top */
/** @typedef {"fixed" | "adjustable"} ShelfType */
/** @typedef {"equal" | "graduated"} DrawerFronts */
/** @typedef {"vertical" | "horizontal"} Run */
/** @typedef {"vertical" | "any"} SideGrain */
/** @typedef {"any" | "length"} HiddenGrain */
/** The cut list's grain: along a part's length or width, or none (it may turn on the sheet).
 * @typedef {"length" | "width" | "none"} Grain */
/** @typedef {"groove" | "butt"} BackMount */
/** What holds the carcass's rails to the sides when there are no blind dados: nothing drilled
 * (butt joints), 8 mm dowels, or Confirmat screws. @typedef {"none" | "dowels" | "confirmat"} Fastener */
/** Shelf-pin rows: a band around each shelf, or the full height on Blum Process 32's grid.
 * @typedef {"shelves" | "full"} LineBoring */
/** @typedef {"center" | "top" | "notch" | "none"} DrawerPull */
/** @typedef {"vertical" | "horizontal" | "none"} DoorPull */
/** @typedef {"top" | "bottom"} DoorPullFrom */
/** Blum CLIP top hinges with BLUMOTION (soft close) or self-closing (a spring, no damper).
 * @typedef {"soft" | "self"} HingeClose */
/** A band's thickness: one REHAU sells (0.018 in, 1, 2, 3 mm), or measured and typed.
 * @typedef {"0.018in" | "1" | "2" | "3" | "custom"} BandSize */
/** Which band a kind of part takes: none, or band 1 to 3 of the list. @typedef {"none" | "1" | "2" | "3"} BandPick */
/**
 * @typedef {{
 *   name: string,
 *   width: number, height: number, depth: number,
 *   thickness: number, frontThickness: number, drawerThickness: number, backThickness: number,
 *   layout: Layout, shelves: number, shelfType: ShelfType, drawers: number, drawerFronts: DrawerFronts, drawerFront: number,
 *   top: Top, stretcher: number,
 *   grainDoors: Run, grainFronts: Run, grainSides: SideGrain, grainHidden: HiddenGrain, grainMatch: boolean,
 *   base: Base, toeKick: number, toeSetback: number,
 *   back: boolean, backMount: BackMount, backInset: number, backGrooveDepth: number,
 *   front: Front, gap: number,
 *   dados: boolean, dadoDepth: number, dadoStop: number, fit: number, bit: number,
 *   fastener: Fastener, confirmatLength: number, lineBoring: LineBoring,
 *   slides: Slides, catalog: Catalog, runner: number,
 *   hardware: boolean, hingeInset: number, cupDistance: number, hingeClose: HingeClose,
 *   drawerPull: DrawerPull, drawerPullFromTop: number, pullSpacing: number, notchWidth: number, notchDepth: number,
 *   doorPull: DoorPull, doorPullFrom: DoorPullFrom, doorPullEnd: number, doorPullEdge: number, doorPullSpacing: number,
 *   pullHole: number,
 *   doors: DoorCount, hingeSide: HingeSide, nailers: Nailers, nailerHeight: number,
 *   trashBins: TrashBins, bin: Bin, binWidth: number, binLength: number, binHeight: number, trayHeight: number,
 *   band: boolean, bandCount: number,
 *   band1Size: BandSize, band1Thick: number, band1Name: string, band1Width: number,
 *   band2Size: BandSize, band2Thick: number, band2Name: string, band2Width: number,
 *   band3Size: BandSize, band3Thick: number, band3Name: string, band3Width: number,
 *   bandFronts: BandPick, bandCarcass: BandPick, bandShelves: BandPick,
 *   bandPremill: number, bandWasteEnd: number,
 * } & import("./trimsizes.js").TrimSizes} Sizes
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
 *   grain: Grain,
 *   bom?: BomItem[],
 *   finished?: V3,
 *   offset?: V3,
 *   bands?: PartBand[],
 *   together?: { key: string, index: number, stack: "along" | "across" },
 * }} Part
 * A banded part (edge banding on) also says what it is when banded: `blank` is then the cut size
 * (what the mesh and the DXF draw), `finished` the size designed (blank plus bands, less any
 * edgebander pre-mill), `offset` how far the blank's corner sits inside the finished part's (each
 * copy's `at` is the blank's corner), and `bands` its banded edges. Unbanded parts carry none.
 */
/** One banded edge of a part: which edge (the part's front edge, or a front's left, right,
 * bottom or top edge, as it stands in the cabinet), the band (1 to 3, its thickness, width and
 * name), and the edge's banded length, finished, from `span[0]` to `span[1]` along it (a notch at
 * an end shortens it: a rail's tongues, a side's toe kick).
 * `run` is the edge's whole length, notches and all: an edgebander runs the band across a notch at
 * an end and it is trimmed off by hand at the notch's inside corner, so the band bought is the run.
 * @typedef {{ edge: EdgeName, band: number, thickness: number, width: number, name: string, length: number, span: [number, number], run: number }} PartBand */
/** @typedef {"front" | "left" | "right" | "bottom" | "top"} EdgeName */
/** What is bought for each copy of a part beyond its wood, for the shopping list: the kernel's
 * part attribute `bom` (docs/format.md), sent with `set_bom`. Part numbers only where this
 * file already has them (the runner tables, the locking devices).
 * @typedef {{ item: string, sku?: string, qty: number, unit: "each" | "pair" | "m", once?: boolean }} BomItem */

/**
 * Blum runners (millimetres). Two catalogues: Blum Inc.'s (US, inch lengths) and Blum's
 * European one (metric lengths), as a shop buys them.
 * - US: TANDEM plus BLUMOTION 563H (2021 catalog pp. 11-15) and MOVENTO 763H (2026 catalog
 *   pp. 9-13). The box is the runner's length; screws at 37 then Blum's A and B.
 * - Europe: TANDEM 560H (TD-127/3, EN 07.23, pp. 3, 5, 24) and MOVENTO 760H (TD-132/1, EN
 *   06.22, pp. 3, 5, 13). TD-132/1 prints the 760H runners as 760H…1S; Blum's catalogues
 *   (2024/2025 p. 412, 2027/2028 p. 420) list them as 760H…0S, the numbers to order. The box is NL - 10; the least inside depth NL + 3; Blum gives the
 *   underside of the drawer bottom at least 27.5 (TANDEM) or 28.5 (MOVENTO) above the
 *   opening, so with the 13 mm recess the box sits 14.5 or 15.5 up.
 * `minDepth` is the least inside cabinet depth; `screws` the System 32 screw holes from the
 * cabinet front (frameless, overlay); `screwHeight` the screw row above the opening's bottom.
 * @typedef {{ nl: number, part: string, minDepth: number, screws: number[] }} RunnerLength
 * @typedef {{ name: string, lengths: RunnerLength[], screwHeight: number, bottomClearance: number, heightDeduct: number,
 *   boxShort: number, minSide: number, maxSide: number, sides: string, rearNotch: number, thinShift: number, lock: string, extra?: string }} Runner
 * @typedef {"us" | "eu"} Catalog
 */
/** @param {number} nl @param {string} part @param {number} minDepth @param {number[]} screws @returns {RunnerLength} */
const runnerLen = (nl, part, minDepth, screws) => ({ nl, part, minDepth, screws });
const T51_1901 = "T51.1901 R/L locking devices: two 2.5 mm pilot holes each, 10 mm deep at 75 degrees, with the T65.1600.01 template";
const T51_7601 = "T51.7601 R/L locking devices: two 2.5 mm pilot holes each, 10 mm deep at 75 degrees, with the T65.1600.01 template";
// Blum Europe: the 560H's own locking device (TD-127/3 p. 3) and the 760H's (TD-132/1 p. 3), each
// placed with drilling template T65.1000.02 (TD-127/3 p. 5, TD-132/1 p. 5). Blum's pages there
// give no pilot-hole size, so none is given here: the template marks them.
const T51_1700_EU = "T51.1700.04 R/L locking devices, placed with Blum's T65.1000.02 drilling template";
const T51_7601_EU = "T51.7601 R/L locking devices, placed with Blum's T65.1000.02 drilling template";
/** @type {Record<Slides, Runner>} Blum Inc. (US). */
export const RUNNERS = {
  tandem: {
    name: "Blum TANDEM 563H",
    lengths: [
      runnerLen(229, "563H2290B10", 266, [37, 133, 229]),
      runnerLen(305, "563H3050B", 328, [37, 165, 261]),
      runnerLen(381, "563H3810B", 404, [37, 165, 357]),
      runnerLen(457, "563H4570B", 480, [37, 261, 453]),
      runnerLen(533, "563H5330B", 557, [37, 261, 517]),
    ],
    screwHeight: 37,
    bottomClearance: 14,
    heightDeduct: 21,
    boxShort: 0,
    // Blum: 13 (1/2 in) to 16 (5/8 in), its table down to 12; 11.5 lets 15/32 in plywood in.
    minSide: 11.5,
    maxSide: 16.2,
    sides: "12 to 16 mm (15/32 to 5/8 in)",
    // A notched back's notch, 35 wide x 13 high (catalog p. 11). Not cut here: the back sits on
    // the bottom, Blum's "no notching" option.
    rearNotch: 35,
    thinShift: 0,
    lock: T51_1901,
  },
  movento: {
    name: "Blum MOVENTO 763H",
    lengths: [
      runnerLen(305, "763H3050S", 328, [37, 165, 261]),
      runnerLen(381, "763H3810S", 404, [37, 165, 357]),
      runnerLen(457, "763H4570S", 480, [37, 261, 453]),
      runnerLen(533, "763H5330S", 557, [37, 261, 517]),
    ],
    screwHeight: 38,
    bottomClearance: 16,
    heightDeduct: 23,
    boxShort: 0,
    minSide: 11.5,
    maxSide: 16.2,
    sides: "12 to 16 mm (15/32 to 5/8 in)",
    rearNotch: 50,
    // "If using 15/32 or 1/2 drawer thickness without T59.K010M, subtract 3 from setback and
    // screw locations" (2026 catalog p. 13). T59.K010M is for 12 and 13 mm sub-fronts: the
    // box's front, here the drawer box stock.
    thinShift: 3,
    lock: T51_7601,
  },
};
/** @type {Record<Slides, Runner>} Blum (Europe): only the System 32 ("B") screw holes are drilled. */
export const RUNNERS_EU = {
  tandem: {
    name: "Blum TANDEM 560H",
    lengths: [
      runnerLen(250, "560H2500B", 253, [37, 69, 133]),
      runnerLen(270, "560H2700B", 273, [37, 69, 133]),
      runnerLen(300, "560H3000B", 303, [37, 69, 261]),
      runnerLen(320, "560H3200B", 323, [37, 69, 261]),
      runnerLen(350, "560H3500B", 353, [37, 69, 261]),
      runnerLen(380, "560H3800B", 383, [37, 69, 261]),
      runnerLen(400, "560H4000B", 403, [37, 69, 229]),
      runnerLen(420, "560H4200B", 423, [37, 69, 229]),
      runnerLen(450, "560H4500B", 453, [37, 69, 261]),
      runnerLen(480, "560H4800B", 483, [37, 69, 261]),
      runnerLen(500, "560H5000B", 503, [37, 69, 261]),
      runnerLen(520, "560H5200B", 523, [37, 69, 261]),
      runnerLen(550, "560H5500B", 553, [37, 69, 261]),
      runnerLen(600, "560H6000B", 603, [37, 69, 261, 325]),
    ],
    screwHeight: 37,
    bottomClearance: 14.5,
    heightDeduct: 21.5,
    boxShort: 10,
    minSide: 11,
    maxSide: 16.2,
    sides: "11 to 16 mm",
    rearNotch: 33,
    thinShift: 0,
    lock: T51_1700_EU,
    extra: "Blum's chipboard-only holes (4 x 15 mm screws, at 19 mm and as its drawing shows) are not drilled",
  },
  movento: {
    name: "Blum MOVENTO 760H",
    lengths: [
      runnerLen(250, "760H2500S", 253, [37, 69, 197]),
      runnerLen(270, "760H2700S", 273, [37, 69, 197]),
      runnerLen(300, "760H3000S", 303, [37, 69, 261]),
      runnerLen(320, "760H3200S", 323, [37, 69, 261]),
      runnerLen(350, "760H3500S", 353, [37, 69, 261]),
      runnerLen(380, "760H3800S", 383, [37, 69, 261, 293]),
      runnerLen(400, "760H4000S", 403, [37, 69, 261, 293]),
      runnerLen(420, "760H4200S", 423, [37, 69, 261, 293]),
      runnerLen(450, "760H4500S", 453, [37, 69, 261, 293]),
      runnerLen(480, "760H4800S", 483, [37, 69, 261, 293]),
      runnerLen(500, "760H5000S", 503, [37, 69, 261, 293]),
      runnerLen(520, "760H5200S", 523, [37, 69, 261, 293]),
      runnerLen(550, "760H5500S", 553, [37, 69, 261, 293]),
      runnerLen(600, "760H6000S", 603, [37, 69, 261, 293]),
    ],
    screwHeight: 38,
    bottomClearance: 15.5,
    heightDeduct: 22.5,
    boxShort: 10,
    minSide: 11,
    maxSide: 16.2,
    sides: "up to 16 mm",
    rearNotch: 75,
    thinShift: 0,
    lock: T51_7601_EU,
    extra: "The 18 mm front hole (a 4 x 15 mm chipboard screw will do) and Blum's chipboard-only holes are not drilled",
  },
};
/** The runner line for these sizes. @param {{ slides: Slides, catalog: Catalog }} s */
export const runnerLine = (s) => (s.catalog === "eu" ? RUNNERS_EU : RUNNERS)[s.slides];

/** Blum drawer rules shared by both runners (mm). */
export const BLUM = {
  insideDeduct: 42,
  bottomRecess: 13,
  minInside: 170,
  // The rear hook holes: in the drawer BACK's rear face, one at each end, 7 from the inside
  // face of the drawer side and 11 above the 13 mm notch line (24 up from the bottom of the
  // box), 6 across and 10 deep (TANDEM catalog p. 11, MOVENTO p. 11).
  hookDia: 6,
  hookDepth: 10,
  hookIn: 7,
  hookUp: 24,
};
/** CLIP top: a 35 mm cup 13 mm deep; its centre is 17.5 mm plus the boring distance (3 to 7,
 * Blum's default 4.5) from the hinge edge. System 32 mounting plates sit 37 mm back with their
 * two screws 32 apart. */
export const CUP = { dia: 35, depth: 13, radius: 17.5, minK: 3, maxK: 7, plateSetback: 37, plateSpacing: 32 };
/** CLIP top 110, straight arm, frameless (Blum Inc. hinge catalog (c) 2021 p. 12): overlay = 11 +
 * boring distance - plate height, on plates of 0, 3, 6 or 9 mm (4.5 is for face frames only);
 * the front screw moves the door 2 mm either way (hinge catalog (c) 2016 p. 10). */
const OVERLAY = { base: 11, plates: [0, 3, 6, 9], side: 2 };
/** Blum's minimum reveal (mm) between doors, by door thickness (columns) and boring distance
 * 3 to 7 (rows): CLIP top 110, hinge catalog (c) 2021 p. 12. Over 26 mm Blum asks for a trial. */
const REVEAL = { t: [16, 19, 22, 24, 26], b: [[0.5, 1.0, 1.8, 2.7, 4.3], [0.5, 1.0, 1.7, 2.5, 3.8], [0.5, 0.9, 1.7, 2.4, 3.4], [0.5, 0.9, 1.6, 2.3, 3.2], [0.5, 0.9, 1.6, 2.2, 3.0]] };
/** The reveal for door stock `t` and boring distance `k` (metres): the next thicker column and
 * the next smaller boring distance, so never under Blum's figure. @param {number} t @param {number} k */
const minReveal = (t, k) => {
  const col = REVEAL.t.findIndex((x) => t <= x * MM + 1e-9);
  const row = Math.max(0, Math.min(4, Math.floor(k / MM + 1e-6) - CUP.minK));
  return REVEAL.b[row][col < 0 ? REVEAL.t.length - 1 : col] * MM;
};
/** A pull's screw head (and the washer under it) behind the front: this far round the hole's centre. */
const PULL_HEAD = 5 * MM;
/** A single door no wider than this: wider sags on its hinges. */
const MAX_LEAF = 36 * IN;
/** A mounting plate's half height plus clearance: it must not sit across a rail or a shelf. */
const PLATE_HALF = 26 * MM;
/** The least wood left between a drilled hole and a cut or an edge. */
export const WEB = 3 * MM;
const WEB_MM = 3;
/** System 32 screw holes for runners (5 mm, for Blum system screws). */
const SYS = { dia: 5, depth: 13 };
/** Hinge mounting plate holes: Blum draws them 5 mm, 11.5 deep, for the plate's pre-mounted
 * system screws (173L8100, 175L8100 ...; the 173L6100 family takes wood screws instead). */
export const PLATE_HOLE = { dia: 5, depth: 11.5 };
/** A rail's tongue stops this short of the bottom of its dado, so the shoulders close. */
const RELIEF = 0.5 * MM;
/** Panels in grooves (backs, drawer bottoms) are this much smaller per edge than groove to groove. */
const PANEL_GAP = (1 / 32) * IN;
/** A shelf behind an inset door stops this far behind the door's back face: room for the
 * door's bumpers, so the door closes on the cabinet and not on the shelf. */
const DOOR_ROOM = 3 * MM;
/** Shelf pin holes: 5 mm, 10 deep, on the System 32 grid (37 from the front, 32 apart). */
export const PIN = { dia: 5, depth: 10, setback: 37, pitch: 32 };
/** Pin holes stop this far from the bottom and top of the space they serve. */
const PIN_END = 64 * MM;
/** Pin holes around each shelf's place: this many each side of it, 32 mm apart (+-64 mm). */
const PIN_REACH = 2;
/**
 * Full-height line boring: Blum's Process 32 drawing (BUS0126, rev. 4/12/04, p. 3) bores a 775 mm
 * (30 1/2 in) side with its first hole 56.5 mm below the top end and its last 46.5 mm above the
 * bottom end, "672 (22 holes)" between (21 x 32). Generalised here (Sawhorse's own reading, not
 * Blum's): the lowest hole is 46.5 mm above the bottom of the box (the bottom panel's underside:
 * the side's bottom end with no toe kick, the top of the toe-kick notch with one), as Blum
 * measures its hinge-plate holes from the bottom, then one every 32 mm up to the highest that is
 * at least 56.5 mm below the side's top end. A 775 mm side gives Blum's 22 holes exactly.
 */
export const LINE_BORE = { bottom: 46.5, top: 56.5 };
/**
 * Dowelled carcass joints, 8 mm dowels (docs/research/joinery-sources.md):
 * - Häfele America catalogue ch. 11 (2017), FC 11.124, the case-dowelling drawing: dowels 37 mm
 *   from the front edge and 37 mm from the back edge; "up to 18"": "Min. 3 dowels", "up to 24"":
 *   "Min. 4 dowels". Häfele gives no count deeper than 24 in, so a deeper joint is refused.
 * - AWS 2nd ed. (2014) sec. 10: a dowel joint "is often based on 1-1/4" (32 mm) spacing of
 *   dowels": the dowels between the front and back ones go on the 32 mm grid from the front one.
 * - Depths are those of ONE product: Häfele's 8 mm permanent assembly dowel (UK catalogue 2023,
 *   p. 7.96, drawing): 25 mm into the shelf's edge, 11 mm into the side panel's face, "for minimum
 *   wood thickness 18 mm". No maker's depth table for a plain 8 mm wood dowel was found.
 * `dia` and the depths are mm; `setback` and `pitch` mm; `upTo` inches, with the least count.
 */
export const DOWEL = { dia: 8, face: 11, edge: 25, setback: 37, pitch: 32, minStock: 18, upTo: /** @type {[number, number][]} */ ([[18, 3], [24, 4]]) };
/**
 * Confirmat (one-piece connector) screws, 7 mm, from the Häfele America catalogue ch. 11 (2017),
 * FC 11.160 to 11.162: a 5 mm pilot hole in the edge ("Drill hole: Ø5 mm"), a 7 mm "through-hole
 * for Confirmat shank" in the face piece, a 10 mm head; the self-countersinking type needs no
 * countersink ("Countersink is not necessary as the nibs countersink hole"). Häfele lists the
 * self-countersinking connector in 50 and 70 mm only (pointed tip, Pozi drive size 3, zinc-plated:
 * 264.44.190 and 264.44.194), so those are the lengths offered. Not found in any maker's document:
 * the pilot's depth, the distance from the edges, the spacing. The pilot's depth is left to the
 * screw maker's instructions, and the screws go where Häfele's dowels go (DOWEL), said as such.
 */
export const CONFIRMAT = {
  through: 7,
  pilot: 5,
  head: 10,
  lengths: /** @type {Record<string, { sku: string }>} */ ({ 50: { sku: "264.44.190" }, 70: { sku: "264.44.194" } }),
};
/** What the panel and the rows say of the Confirmat layout. */
export const CONFIRMAT_LAYOUT = "Häfele's dowel layout; no confirmat spacing was found in a maker's document";
/**
 * What the shopping list names for the hardware, from Blum's own catalogues (read 2026-11-14).
 * Only part numbers Blum prints are given; anything Blum does not number is named in words.
 * - Hinges, CLIP top 110°, screw-on: BLUMOTION (soft close) 71B3550, full overlay, straight arm,
 *   and 71B3750, inset, full-cranked; self-closing 71T3550 and 71T3750. Blum Inc. Concealed
 *   hinges (c) 2025 pp. 10 and 24; Blum catalogue 2024/2025 p. 76, 2027/2028 p. 70.
 * - Mounting plate, 0 mm, pre-mounted system screws, for the 5 x 11.5 mm holes drilled here:
 *   173L8100 (Concealed hinges (c) 2025 p. 48; Blum Inc. lists no 175L8100) and 175L8100 (Blum
 *   catalogue 2024/2025 p. 155, 2027/2028 p. 149). Blum's inset table is for a 0 mm plate too
 *   (Concealed hinges (c) 2025 p. 10).
 * - A screw-on hinge's cup is held to the door with screws: Blum Inc.'s 606N, #6 x 5/8 in
 *   (Concealed hinges (c) 2025 p. 86), or Blum Europe's 609.1700, 3.5 x 17 mm (catalogue
 *   2024/2025 p. 76; MD-029/3 gives the same size).
 * - Blum Inc.'s runner system screw 662.1150.HG, #6 x 11.5 mm, for 5 mm holes (TANDEM plus
 *   BLUMOTION (c) 2025 pp. 14, 34; MOVENTO (c) 2026 p. 12), and its locking-device screw 606N,
 *   #6 x 5/8 in, two per device (TANDEM plus BLUMOTION (c) 2025 p. 11).
 * - Drilling templates, one per shop: T65.1600.01 with its drill bits DB-2.5mm and DB-6mm
 *   (TANDEM plus BLUMOTION (c) 2025 pp. 11, 35) and T65.1000.02 (Blum catalogue 2024/2025 p. 682,
 *   2027/2028 p. 698; Blum Europe's page names no bits), each with tool set T65.9000.
 * - Blum sells no shelf pins.
 * The plate's part number is given only where this plugin drills its holes (overlay doors with
 * hardware holes on): for holes drilled by hand, or an inset door, the plate is named in words.
 * Blum Europe's runner screw: TD-127/3 p. 24 names system screw 661.1450.HG (6 x 14.5 mm) for
 * the 560H, but Blum gives no hole depth for it through a runner, and this plugin drills 5 x 13
 * mm holes, so it is left in words; so are Blum Europe's locking-device screws, which the pages
 * read do not name. Blum gives no pack sizes: everything is each or pair.
 */
const HARDWARE = {
  hinge: {
    soft: {
      overlay: { item: "Blum CLIP top BLUMOTION 110° hinge, full overlay, straight arm, screw-on", sku: "71B3550" },
      inset: { item: "Blum CLIP top BLUMOTION 110° hinge, inset, full-cranked, screw-on", sku: "71B3750" },
    },
    self: {
      overlay: { item: "Blum CLIP top 110° hinge, self-closing, full overlay, straight arm, screw-on", sku: "71T3550" },
      inset: { item: "Blum CLIP top 110° hinge, self-closing, inset, full-cranked, screw-on", sku: "71T3750" },
    },
  },
  plate: { item: "Blum CLIP mounting plate, 0 mm, pre-mounted system screws", us: "173L8100", eu: "175L8100" },
  // Two per hinge, one through each screw hole of the cup; Blum's pages read give the screw's
  // size, not the count.
  hingeScrew: {
    us: { item: "Blum wood screw, #6 x 5/8 in", sku: "606N" },
    eu: { item: "Blum chipboard screw, 3.5 x 17 mm, hinge cup to door", sku: "609.1700" },
    perHinge: 2,
  },
  runnerScrewUs: { item: "Blum system screw, #6 x 11.5 mm, runner to a 5 mm hole", sku: "662.1150.HG" },
  // The same 606N as the hinge screws: one row on the shopping list, with both parts named.
  lockScrewUs: { item: "Blum wood screw, #6 x 5/8 in", sku: "606N" },
  templates: {
    us: [
      { item: "Blum concealed runner template", sku: "T65.1600.01" },
      { item: "Blum drill bit, 2.5 mm, for the runner template", sku: "DB-2.5mm" },
      { item: "Blum drill bit, 6 mm, for the runner template", sku: "DB-6mm" },
      { item: "Blum tool set for the runner template", sku: "T65.9000" },
    ],
    eu: [
      { item: "Blum drilling template for MOVENTO | TANDEM", sku: "T65.1000.02" },
      { item: "Blum tool set for the drilling template", sku: "T65.9000" },
    ],
  },
  shelfPin: "5 mm shelf pins",
};
/** A door wider than this is a pair. */
const MAX_DOOR = 24 * IN;
/**
 * Waste bins that hang by their rim in a frame, from Rev-A-Shelf's own drawings (inches):
 * the rim, the height, how far the frame's top is below the rim's top, and the frame's
 * "MINIMUM OPENING" ("CUT OUT DIMENSIONS", at the top of the frame). RV-1024 27 QUART, RV-35
 * 35 QUART and RV-50 50 QUART WASTE CAN customer drawings. Other makers' bins differ (Knape &
 * Vogt's 35 qt is 9 3/16 in deep at the rim, Rev-A-Shelf's 10.46): measure those.
 * @type {Record<Exclude<Bin, "custom">, { label: string, rim: [number, number], height: number, drop: number, cut: [number, number] }>}
 */
export const BINS = {
  rv35: { label: "Rev-A-Shelf 35 qt (RV-35)", rim: [14.21, 10.46], height: 17.85, drop: 1.63, cut: [13.16, 9.56] },
  rv50: { label: "Rev-A-Shelf 50 qt (RV-50)", rim: [14.75, 10.67], height: 21.75, drop: 1.75, cut: [13.59, 9.8] },
  rv27: { label: "Rev-A-Shelf 27 qt (RV-1024)", rim: [10.96, 10.96], height: 17.75, drop: 1.8, cut: [10.1, 10.1] },
};
/** A cutout is the bin's minimum opening plus this all round (a rim overhangs it by about 0.45 in). */
const CUT_CLEAR = (1 / 32) * IN;
/** A hanging bin's bottom clears the tray floor by this. */
const BIN_FLOOR = 0.25 * IN;

/** Room for fingers behind a finger notch: the sub-front is cut this far below the notch. */
const FINGER_ROOM = 25 * MM;

/**
 * Edge banding (docs/research/edge-banding-sources.md has every source, quoted).
 *
 * The rule is geometry, not a maker's: a part is designed at its finished size, and each banded
 * edge's blank is cut short by that band's thickness, so blank plus band comes out at the size
 * designed. No edgeband or machine maker's rule for deducting the band from the cut size was
 * found. Of the trade software read, OptiCut deducts the edging thickness "when working in net
 * dimensions"; Mozaik's help says to set the band to 0 mm when the bander pre-mills it, "to
 * ensure Mozaik is not deducting anything"; Promob's worked example subtracts the band; Microvellum
 * offers pre-mill modes. Every cut (holes, dados, notches) stays where it is in the finished part:
 * Blum gives the cup's boring distance from the door's edge, and the plates and runner screws
 * 37 mm from the side's front edge; with a band on, that edge is the band's face. On the blank
 * each cut is then the band's thickness nearer the raw edge, and the planner's 3 mm of wood (WEB)
 * is kept to that raw edge (after any pre-mill).
 *
 * - Thicknesses: REHAU's stock sizes, .018 in (0.457 mm), 1 mm, 2 mm and 3 mm, in 15/16 in among
 *   other widths (REHAU edgeband technical data, p. 2); Ostermann's standard widths include 23 mm.
 *   Measure your band with calipers: REHAU's tolerance is +-0.10 to +-0.15 mm.
 * - Which edges (AWI/AWMAC/WI Architectural Woodwork Standards, 2009, sec. 10): frameless
 *   "TYPE A" cabinets band the front edges of the body; the "visible front edges of stretchers,
 *   ends, divisions, tops, bottoms, shelves, and nailers" are exposed; "the three non-visible
 *   edges of adjustable shelves" are concealed. Nailers are not banded here: they sit behind the
 *   back, at the rear edge, and show no front edge. Doors and drawer fronts: one owner's spec
 *   (University of Maryland, section 123200) bands "all exposed edges", 3 mm PVC at doors and
 *   drawer fronts and 1 mm elsewhere: one spec, not a standard.
 * - Waste: Microvellum's edgeband report adds 1 in per banded side, then 5%: a software default,
 *   not a standard. Each part carries the 1 in per banded side (the end trim, per edge); the 5% is
 *   the shopping list's banding overage, applied once to the total.
 * - Pre-mill: an edgebander's jointing cutter takes 0 to 3 mm off the edge before the band goes
 *   on (Felder tempora F1000 0-3, SCM olimpic K360 up to 3); the blank is cut that much larger.
 *   An iron-on band takes none.
 */
export const BAND = {
  /** The thicknesses offered, mm, with what the select says. */
  sizes: /** @type {[Exclude<BandSize, "custom">, number, string][]} */ ([
    // REHAU prints the thin band as .018 in, not in millimetres: 0.4572 mm.
    ["0.018in", 0.018 * 25.4, "0.018 in (0.457 mm)"],
    ["1", 1, "1 mm"],
    ["2", 2, "2 mm"],
    ["3", 3, "3 mm"],
  ]),
  /** A typed thickness: at least this... (Sawhorse's limit, not a sourced rule) */
  minThick: 0.1 * MM,
  /** ... and at most 1/4 in: Sawhorse's limit, not a sourced rule (thicker is solid-wood edging). */
  maxThick: 0.25 * IN,
  /** The widest band: 4 in (Ostermann cuts edging to any width from 12 to 100 mm). */
  maxWidth: 4 * IN,
  /** The deepest edgebander pre-mill (Felder tempora F1000, SCM olimpic K360). */
  maxPremill: 3 * MM,
  /** A waste allowance per banded side of at most a foot. */
  maxWasteEnd: 12 * IN,
  /** The longest name a band may have. */
  maxName: 40,
  /** Microvellum's default waste per banded side: 1 in. (Its 5% is the shopping list's overage.) */
  wasteEnd: 1 * IN,
};
/** Where each edge is on a part's blank: its axis, and the low (0) or high (1) end of it. Fronts
 * are [width, thickness, height]; sides [thickness, depth, height]; rails and shelves
 * [length, depth, thickness]: a front edge is low on the depth.
 * @type {Record<EdgeName, [0 | 1 | 2, 0 | 1]>} */
export const EDGE_AXES = { front: [1, 0], left: [0, 0], right: [0, 1], bottom: [2, 0], top: [2, 1] };
/** What a banded edge with a notch at an end asks of you. */
export const END_NOTCH = "The edge has a notch at its end (the toe kick, or the tongues): on an edgebander the band runs across the notch; trim it off by hand at the notch's inside corner (the band counted is the edge's whole run)";
/** The four edges of a door or drawer front. @type {EdgeName[]} */
const FRONT_EDGES = ["left", "right", "bottom", "top"];
/** Parts that move: a band on a front is never "against" them, nor theirs against the carcass. */
const MOVING = new Set(["Door", "Left door", "Right door", "Drawer front"]);

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
 * and leaves the stock, joinery and hardware (but the hinges' inset) as they were. Inches, then millimetres.
 * @typedef {{ id: string, label: string, name: string, layout: Layout, shelves: number, drawers: number, base: Base,
 *   in: [number, number, number], mm: [number, number, number], doorPullFrom?: DoorPullFrom, doorPullEnd?: [number, number],
 *   nailers?: Nailers, drawerPull?: DrawerPull, top?: Top, trashBins?: TrashBins, bin?: Bin, doors?: DoorCount, hingeInset?: [number, number] }} Preset
 * @type {Preset[]}
 */
export const PRESETS = [
  // Blum Inc. asks for the top and bottom hinges to be farther apart than the door is wide
  // (hinge catalog (c) 2016 p. 2): a 24 in (600 mm) base door's hinges go 3 in (80 mm) from its
  // ends, and a 600 mm wall door's 50 mm; a drawer over a door is a pair under the drawer.
  { id: "base", label: "Base · door and shelf", name: "Base", layout: "doors", shelves: 1, drawers: 0, base: "toekick", in: [24, 34.5, 23.25], mm: [600, 870, 560], doorPullFrom: "top", top: "stretchers", hingeInset: [3, 80] },
  { id: "drawers", label: "Drawer base · 3 drawers", name: "Drawer base", layout: "drawers", shelves: 0, drawers: 3, base: "toekick", in: [18, 34.5, 23.25], mm: [450, 870, 560], top: "stretchers" },
  { id: "sink", label: "Sink base · 2 doors, open top", name: "Sink base", layout: "doors", shelves: 0, drawers: 0, base: "toekick", in: [36, 34.5, 23.25], mm: [900, 870, 560], doorPullFrom: "top", top: "stretchers" },
  { id: "mixed", label: "Base · drawer over 2 doors", name: "Base", layout: "mixed", shelves: 1, drawers: 1, base: "toekick", in: [24, 34.5, 23.25], mm: [600, 870, 560], doorPullFrom: "top", top: "stretchers", doors: "two" },
  // One bin: two Rev-A-Shelf bins need 27 in side by side, and front to back more depth than
  // a 21 in runner's box (their own double units ride 22 in slides).
  { id: "trash", label: "Trash pull-out · one 50 qt bin", name: "Trash", layout: "trash", shelves: 0, drawers: 1, base: "toekick", in: [18, 34.5, 23.25], mm: [450, 870, 560], drawerPull: "top", top: "stretchers", trashBins: "one", bin: "rv50" },
  { id: "wall", label: "Wall cabinet · doors, nailers", name: "Wall", layout: "doors", shelves: 2, drawers: 0, base: "none", in: [30, 30, 12], mm: [600, 720, 300], doorPullFrom: "bottom", doorPullEnd: [2.5, 64], nailers: "both", hingeInset: [3.5, 50] },
  { id: "tall", label: "Tall pantry · needs sheets over 4 ft", name: "Pantry", layout: "doors", shelves: 4, drawers: 0, base: "toekick", in: [24, 84, 23.25], mm: [600, 2100, 560], doorPullFrom: "bottom", doorPullEnd: [30, 760], nailers: "top" },
  { id: "open", label: "Open shelves · no doors", name: "Shelves", layout: "shelves", shelves: 2, drawers: 0, base: "toekick", in: [30, 34.5, 12], mm: [600, 870, 300] },
];

/**
 * A starting point applied to the sizes: its style, sizes and name. The stock, joinery,
 * hardware, grain and CNC settings are kept. Whatever any starting point sets (the pulls'
 * place, the nailers, the drawer pull, the bins, the drawer count, the doors, the hinges'
 * inset) goes back to where a new
 * cabinet starts unless this one names it, so a base picked after a tall pantry does not keep
 * the pantry's pull 30 in up its door, nor one after a wall cabinet its nailers. The name
 * keeps its number ("Base 3" becomes "Sink base 3").
 * @param {Sizes} s @param {string} id @param {boolean} metric @returns {Sizes}
 */
export function applyPreset(s, id, metric) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return s;
  const d = defaults(metric);
  const [w, h, dp] = metric ? p.mm.map((v) => v * MM) : p.in.map((v) => v * IN);
  const n = /(\d+)$/.exec(s.name)?.[1] ?? "1";
  /** @type {Sizes} */
  const out = { ...s, name: `${p.name} ${n}`, layout: p.layout, shelves: p.shelves, drawers: p.drawers || d.drawers, base: p.base, width: w, height: h, depth: dp };
  out.doorPullFrom = p.doorPullFrom ?? d.doorPullFrom;
  out.doorPullEnd = p.doorPullEnd ? (metric ? p.doorPullEnd[1] * MM : p.doorPullEnd[0] * IN) : d.doorPullEnd;
  out.nailers = p.nailers ?? d.nailers;
  out.drawerPull = p.drawerPull ?? d.drawerPull;
  // A base cabinet's top is two stretchers under the countertop; a wall or tall cabinet's shows.
  out.top = p.top ?? "full";
  out.trashBins = p.trashBins ?? d.trashBins;
  out.bin = p.bin ?? d.bin;
  out.doors = p.doors ?? d.doors;
  out.hingeInset = p.hingeInset ? (metric ? p.hingeInset[1] * MM : p.hingeInset[0] * IN) : d.hingeInset;
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
  void metric;
  const parts = planned.parts.reduce((n, p) => n + p.copies.length, 0);
  const thick = new Set(planned.parts.map((p) => Math.round(p.blank.reduce((a, b) => Math.min(a, b)) * 1e6))).size;
  const out = [`${parts} parts`, `${thick} ${thick === 1 ? "thickness" : "thicknesses"}`];
  if (planned.holes) out.push(`${planned.holes} holes`);
  if (planned.runner) out.push(`${runnerLine(s).name.replace(/^Blum /, "")} ${planned.runner.part}`);
  return out.join(" · ");
}

/** @param {string} system */
export const isMetric = (system) => system === "mm" || system === "cm" || system === "m";

/**
 * Edge banding as a new cabinet starts: off, so a cabinet is what it was before banding came.
 * Turned on, it follows the AWS rule (the front edges of the carcass and of adjustable shelves)
 * and bands doors and drawer fronts all round (one owner's spec: all exposed edges), all with one
 * 1 mm band: REHAU sells 1 mm in 15/16 in; Ostermann's standard widths include 23 mm. The waste is
 * Microvellum's default. A second and third band are there to pick (3 mm, the spec's for fronts,
 * and 2 mm), unused until chosen.
 * @param {number} width
 */
function bandDefaults(width) {
  return {
    band: false,
    bandCount: 1,
    band1Size: /** @type {BandSize} */ ("1"), band1Thick: 1 * MM, band1Name: "", band1Width: width,
    band2Size: /** @type {BandSize} */ ("3"), band2Thick: 3 * MM, band2Name: "", band2Width: width,
    band3Size: /** @type {BandSize} */ ("2"), band3Thick: 2 * MM, band3Name: "", band3Width: width,
    bandFronts: /** @type {BandPick} */ ("1"), bandCarcass: /** @type {BandPick} */ ("1"), bandShelves: /** @type {BandPick} */ ("1"),
    bandPremill: 0, bandWasteEnd: BAND.wasteEnd,
  };
}

/** Joinery as a new cabinet starts: blind dados (no fastener), pins around each shelf, and a 50 mm
 * Confirmat should Confirmat be picked. */
function joineryDefaults() {
  return { fastener: /** @type {Fastener} */ ("none"), confirmatLength: 50, lineBoring: /** @type {LineBoring} */ ("shelves") };
}

/** @param {boolean} metric @returns {Sizes} */
export function defaults(metric) {
  return metric
    ? {
        name: "Cabinet 1",
        // 870 with the toe kick: a 720 carcass on a 150 plinth, under a worktop at about 900.
        width: 600 * MM, height: 870 * MM, depth: 560 * MM,
        // Drawer fronts are door stock, so a drawer over a door is flush with it.
        thickness: 18 * MM, frontThickness: 18 * MM, drawerThickness: 12 * MM, backThickness: 6 * MM,
        layout: "shelves", shelves: 1, shelfType: "adjustable", drawers: 3, drawerFronts: "equal", drawerFront: 150 * MM,
        top: "full", stretcher: 100 * MM,
        grainDoors: "vertical", grainFronts: "horizontal", grainSides: "vertical", grainHidden: "any", grainMatch: false,
        base: "toekick", toeKick: 100 * MM, toeSetback: 75 * MM,
        back: true, backMount: "groove", backInset: 12 * MM, backGrooveDepth: 8 * MM,
        front: "overlay", gap: 3 * MM,
        dados: true, dadoDepth: 6 * MM, dadoStop: 12 * MM, fit: 0.2 * MM, bit: 6 * MM,
        ...joineryDefaults(),
        slides: "tandem", catalog: "eu", runner: 0,
        hardware: true, hingeInset: 100 * MM, cupDistance: 5 * MM, hingeClose: "soft",
        drawerPull: "center", drawerPullFromTop: 38 * MM, pullSpacing: 96 * MM, notchWidth: 100 * MM, notchDepth: 25 * MM,
        doorPull: "vertical", doorPullFrom: "top", doorPullEnd: 64 * MM, doorPullEdge: 38 * MM, doorPullSpacing: 96 * MM,
        pullHole: 5 * MM,
        doors: "auto", hingeSide: "left", nailers: "none", nailerHeight: 75 * MM,
        // Placeholders (measure your bins): two 180 mm cutouts front to back fit the 457 mm runner
        // a 560 mm box takes.
        trashBins: "deep", bin: "rv35", binWidth: 280 * MM, binLength: 180 * MM, binHeight: 430 * MM, trayHeight: 150 * MM,
        ...bandDefaults(23 * MM),
        ...trimDefaults(true),
      }
    : {
        name: "Cabinet 1",
        // "3/4" plywood is 23/32 in, "1/2" is 15/32, "1/4" is 7/32 (the stock library says the
        // same). Measure yours and type it in: every joint is cut to these numbers.
        // A frameless box 23 1/4 in deep is 24 in with its door; and its side and top share a 4 x 4 sheet.
        width: 24 * IN, height: 34.5 * IN, depth: 23.25 * IN,
        // Drawer fronts are door stock, so a drawer over a door is flush with it.
        thickness: (23 / 32) * IN, frontThickness: (23 / 32) * IN, drawerThickness: (15 / 32) * IN, backThickness: (7 / 32) * IN,
        layout: "shelves", shelves: 1, shelfType: "adjustable", drawers: 3, drawerFronts: "equal", drawerFront: 6 * IN,
        top: "full", stretcher: 4 * IN,
        grainDoors: "vertical", grainFronts: "horizontal", grainSides: "vertical", grainHidden: "any", grainMatch: false,
        base: "toekick", toeKick: 4 * IN, toeSetback: 3 * IN,
        back: true, backMount: "groove", backInset: 0.5 * IN, backGrooveDepth: (5 / 16) * IN,
        front: "overlay", gap: 0.125 * IN,
        dados: true, dadoDepth: 0.25 * IN, dadoStop: 0.5 * IN, fit: 0.008 * IN, bit: 0.25 * IN,
        ...joineryDefaults(),
        slides: "tandem", catalog: "us", runner: 0,
        hardware: true, hingeInset: 3.5 * IN, cupDistance: 5 * MM, hingeClose: "soft",
        drawerPull: "center", drawerPullFromTop: 1.5 * IN, pullSpacing: 3 * IN, notchWidth: 4 * IN, notchDepth: 1 * IN,
        doorPull: "vertical", doorPullFrom: "top", doorPullEnd: 2.5 * IN, doorPullEdge: 1.5 * IN, doorPullSpacing: 3 * IN,
        // 3/16 in: the usual drill for the 8-32 screws US pulls take.
        pullHole: (3 / 16) * IN,
        doors: "auto", hingeSide: "left", nailers: "none", nailerHeight: 3 * IN,
        // Bin cutouts are placeholders: measure your bins just under the lip.
        trashBins: "deep", bin: "rv35", binWidth: 11 * IN, binLength: 8.5 * IN, binHeight: 17 * IN, trayHeight: 6 * IN,
        ...bandDefaults((15 / 16) * IN),
        ...trimDefaults(false),
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
  const fastener = pick("fastener", /** @type {const} */ (["none", "dowels", "confirmat"]));
  return {
    name,
    width: num("width"),
    height: num("height"),
    depth: num("depth"),
    thickness: num("thickness"),
    frontThickness: num("frontThickness"),
    drawerThickness: num("drawerThickness"),
    backThickness: num("backThickness"),
    layout: pick("layout", /** @type {const} */ (["shelves", "doors", "drawers", "mixed", "trash"])),
    shelves: Math.round(num("shelves")),
    drawers: Math.round(num("drawers")),
    drawerFront: num("drawerFront"),
    base,
    toeKick: oldNoKick ? d.toeKick : num("toeKick"),
    toeSetback: num("toeSetback"),
    back: !!s.back,
    backMount: pick("backMount", /** @type {const} */ (["groove", "butt"])),
    backInset: num("backInset"),
    backGrooveDepth: num("backGrooveDepth"),
    front: pick("front", /** @type {const} */ (["overlay", "inset"])),
    gap: num("gap"),
    // Dowels or Confirmat screws replace the blind dados: never both.
    dados: !!s.dados && fastener === "none",
    dadoDepth: num("dadoDepth"),
    dadoStop: num("dadoStop"),
    fit: num("fit"),
    bit: num("bit"),
    fastener,
    confirmatLength: Object.keys(CONFIRMAT.lengths).includes(String(s.confirmatLength)) ? Number(s.confirmatLength) : d.confirmatLength,
    lineBoring: pick("lineBoring", /** @type {const} */ (["shelves", "full"])),
    slides: pick("slides", /** @type {const} */ (["tandem", "movento"])),
    catalog: pick("catalog", /** @type {const} */ (["us", "eu"])),
    runner: Math.round(num("runner")),
    hardware: !!s.hardware,
    hingeInset: num("hingeInset"),
    cupDistance: num("cupDistance"),
    hingeClose: pick("hingeClose", /** @type {const} */ (["soft", "self"])),
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
    doors: pick("doors", /** @type {const} */ (["auto", "one", "two"])),
    hingeSide: pick("hingeSide", /** @type {const} */ (["left", "right"])),
    nailers: pick("nailers", /** @type {const} */ (["none", "top", "both"])),
    nailerHeight: num("nailerHeight"),
    trashBins: pick("trashBins", /** @type {const} */ (["one", "side", "deep"])),
    bin: pick("bin", /** @type {const} */ (["rv35", "rv50", "rv27", "custom"])),
    shelfType: pick("shelfType", /** @type {const} */ (["fixed", "adjustable"])),
    drawerFronts: pick("drawerFronts", /** @type {const} */ (["equal", "graduated"])),
    top: pick("top", /** @type {const} */ (["full", "stretchers"])),
    stretcher: num("stretcher"),
    grainDoors: pick("grainDoors", /** @type {const} */ (["vertical", "horizontal"])),
    grainFronts: pick("grainFronts", /** @type {const} */ (["horizontal", "vertical"])),
    grainSides: pick("grainSides", /** @type {const} */ (["vertical", "any"])),
    grainHidden: pick("grainHidden", /** @type {const} */ (["any", "length"])),
    grainMatch: !!s.grainMatch,
    binWidth: num("binWidth"),
    binLength: num("binLength"),
    binHeight: num("binHeight"),
    trayHeight: num("trayHeight"),
    band: !!s.band,
    bandCount: Math.round(num("bandCount")),
    band1Size: pick("band1Size", BAND_SIZES),
    band1Thick: num("band1Thick"),
    band1Name: bandName(s.band1Name),
    band1Width: num("band1Width"),
    band2Size: pick("band2Size", BAND_SIZES),
    band2Thick: num("band2Thick"),
    band2Name: bandName(s.band2Name),
    band2Width: num("band2Width"),
    band3Size: pick("band3Size", BAND_SIZES),
    band3Thick: num("band3Thick"),
    band3Name: bandName(s.band3Name),
    band3Width: num("band3Width"),
    bandFronts: pick("bandFronts", /** @type {const} */ (["none", "1", "2", "3"])),
    bandCarcass: pick("bandCarcass", /** @type {const} */ (["none", "1", "2", "3"])),
    bandShelves: pick("bandShelves", /** @type {const} */ (["none", "1", "2", "3"])),
    bandPremill: num("bandPremill"),
    bandWasteEnd: num("bandWasteEnd"),
    // Row features (trimsizes.js): what covers its sides, an opening beside it, a toe-kick skin, its sink.
    ...normalizeTrim(s, d),
  };
}

const BAND_SIZES = /** @type {const} */ (["0.018in", "1", "2", "3", "custom"]);
/** A band's name or colour as typed: text without control characters, trimmed, at most 40
 * characters (it goes into the shopping list's item, which takes 128). @param {unknown} v */
const bandName = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, BAND.maxName).trim() : "");

/** The back's inset from the rear edge: at least a nailer's thickness when there are nailers
 * (they sit behind it). @param {Sizes} s */
export function backInsetOf(s) {
  return s.nailers !== "none" ? Math.max(s.backInset, s.thickness + s.fit) : s.backInset;
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
/** A part's face, as a cut list says it: millimetres, or inches to 0.001 with millimetres.
 * @param {number} a @param {number} b @param {boolean} metric */
const pairText = (a, b, metric) => (metric ? `${mm(a)} x ${mm(b)} mm` : `${(a / IN).toFixed(3)} x ${(b / IN).toFixed(3)} in (${mm(a)} x ${mm(b)} mm)`);
/** A least (up) or most (down) value as both units say it, rounded the safe way in each, so
 * the value a message names is one it takes. @param {number} m @param {boolean} up */
const bound = (m, up) => {
  const r = up ? Math.ceil : Math.floor;
  return `${r(m / MM * 10 - 1e-6 * (up ? 1 : -1)) / 10} mm (${(r(m / IN * 1000 - 1e-6 * (up ? 1 : -1)) / 1000).toFixed(3)} in)`;
};
const atLeast = (/** @type {number} */ m) => bound(m, true);
const atMost = (/** @type {number} */ m) => bound(m, false);

/**
 * What Generate will say it is making.
 * @param {Sizes} s @param {(m: number) => string} format @param {boolean} metric
 */
export function phrase(s, format, metric) {
  void metric;
  const n = s.shelves;
  const shelves = n ? `${n} ${s.shelfType === "adjustable" ? "adjustable" : "fixed"} ${n === 1 ? "shelf" : "shelves"}` : "no shelves";
  const drawers = `${s.drawers} ${s.drawers === 1 ? "drawer" : "drawers"}`;
  const bins = s.trashBins === "one" ? "one bin" : s.trashBins === "side" ? "two bins side by side" : "two bins front to back";
  const layout =
    s.layout === "shelves"
      ? `open, ${shelves}`
      : s.layout === "doors"
        ? `doors, ${shelves}`
        : s.layout === "drawers"
          ? `${drawers}${s.drawerFronts === "graduated" ? `, ${format(s.drawerFront)} top drawer` : ""}`
          : s.layout === "trash"
            ? `trash pull-out, ${bins}`
            : `${drawers} over a door, ${shelves}`;
  return `${format(s.width)} × ${format(s.height)} × ${format(s.depth)}, ${layout}${s.base === "toekick" ? "" : ", no toe kick"}`;
}

/** @param {Sizes} s @param {boolean} metric @returns {string | null} */
export function issue(s, metric) {
  return plan(s, metric).error;
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ error: string | null, parts: Part[], rows: string[][], runner: RunnerLength | null, holes: number, room: BinRoom | null }}
 */
export function plan(s, metric) {
  try {
    const built = build(s, metric);
    // Grain-matched fronts (match.js): each front of the stack its own part, kept together.
    return { error: null, ...built, parts: matchFronts(built.parts, s) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), parts: [], rows: [], runner: null, holes: 0, room: null };
  }
}

/**
 * The largest bin cutout a trash pull-out of these sizes takes, for its bin layout (3/4 in of
 * wood kept round each cutout), or null when it is not a trash pull-out or cannot be built.
 * @typedef {{ across: number, deep: number }} BinRoom
 * @param {Sizes} s @param {boolean} metric @returns {BinRoom | null}
 */
export function binRoom(s, metric) {
  if (s.layout !== "trash") return null;
  return plan({ ...s, binWidth: 1 * MM, binLength: 1 * MM }, metric).room;
}

/** @param {Sizes} s @param {boolean} metric */
export function validate(s, metric) {
  const t = s.thickness;
  /** A least value in the document's units: inches (with its text) or millimetres.
   * @param {number} inches @param {string} inText @param {number} mms */
  const least = (inches, inText, mms) => (metric ? { v: mms * MM, text: `${mms} mm` } : { v: inches * IN, text: inText });
  const stock = (/** @type {number} */ x) => x > 0 && x <= 2 * IN;
  const hasDoor = s.layout === "doors" || s.layout === "mixed";
  const hasDrawer = s.layout === "drawers" || s.layout === "mixed" || s.layout === "trash";
  const hasShelf = (s.layout === "shelves" || s.layout === "doors" || s.layout === "mixed") && s.shelves > 0;
  const overlay = s.front === "overlay";
  if (!stock(t)) return "The cabinet stock must be more than 0 and at most 2 in thick.";
  if (!stock(s.frontThickness)) return "The drawer front stock must be more than 0 and at most 2 in thick.";
  if (!stock(s.drawerThickness)) return "The drawer box stock must be more than 0 and at most 2 in thick.";
  if (!(s.backThickness > 0 && s.backThickness < t)) return "The back and drawer-bottom stock must be thinner than the cabinet stock.";
  const thinBack = least(3 / 32, "3/32 in", 2.5);
  if (!(s.backThickness >= thinBack.v - 1e-9)) return `The back and drawer-bottom stock must be at least ${thinBack.text} thick.`;
  const thinFront = least(3 / 8, "3/8 in", 10);
  if (hasDrawer && !(s.frontThickness >= thinFront.v - 1e-9)) return `The drawer front stock must be at least ${thinFront.text} thick: screws from the drawer box hold it.`;
  if (!(s.width > 2 * t)) return "The width must be more than two thicknesses.";
  if (!(s.depth > t + (s.back ? s.backThickness + (s.backMount === "groove" ? s.backInset : 0) : 0))) return "The cabinet is not deep enough for its back.";
  if (s.base === "toekick") {
    const lowKick = least(1, "1 in", 25);
    if (!(s.toeKick >= lowKick.v - 1e-9)) return `The toe kick must be at least ${lowKick.text} tall, or choose no toe kick.`;
    if (!(s.toeSetback > 0) || !(s.toeSetback + t < s.depth / 2)) return "The toe kick setback must be more than 0 and leave the side standing.";
  }
  if (!Number.isInteger(s.shelves) || s.shelves < 0 || s.shelves > 20) return "Shelves: a whole number from 0 to 20.";
  if (!Number.isInteger(s.drawers) || s.drawers < 0 || s.drawers > 8) return "Drawers: a whole number from 0 to 8.";
  const needsDrawers = s.layout === "drawers" || s.layout === "mixed";
  if (needsDrawers && s.drawers < 1) return "This layout needs at least one drawer.";
  const lowFront = least(3, "3 in", 76);
  if (s.layout === "mixed" && !(s.drawerFront >= lowFront.v - 1e-9)) return `Each drawer front over the door must be at least ${lowFront.text} tall.`;
  if (s.layout === "drawers" && s.drawerFronts === "graduated") {
    if (s.drawers < 2) return "A shorter top drawer needs at least two drawers.";
    if (!(s.drawerFront >= lowFront.v - 1e-9)) return `The top drawer front must be at least ${lowFront.text} tall.`;
  }
  if (s.top === "stretchers") {
    const sw = stretcherWidth(s, metric);
    const narrow = least(2, "2 in", 50);
    // The stretchers run from the front to the back's groove (or to the rear edge, past it), or to the back's face.
    const room = !s.back || s.backMount === "groove" ? s.depth : s.depth - s.backThickness;
    if (!(s.stretcher >= narrow.v - 1e-9 && 2 * sw < room)) return `Stretchers must be at least ${narrow.text} wide, and two of them narrower than the ${room < s.depth ? `depth in front of the back (${both(room)})` : "depth"}.`;
  }
  if (!(s.gap >= 0) || s.gap > 0.5 * IN) return "The gap between fronts must be at most 1/2 in (12.7 mm).";
  // Blum's least reveal, with no door at all (drawer fronts must not rub either), and its table for hinged doors.
  const reveal = hasDoor && s.hardware && s.cupDistance >= CUP.minK * MM - 1e-9 && s.cupDistance <= CUP.maxK * MM + 1e-9 ? minReveal(t, s.cupDistance) : REVEAL.b[0][0] * MM;
  if (!(s.gap >= reveal - 1e-9)) return `The gap between fronts must be at least ${atLeast(reveal)}${reveal > REVEAL.b[0][0] * MM ? `: Blum's minimum reveal for ${exactThickness(t, metric)} doors bored ${Math.round(s.cupDistance / MM * 10) / 10} mm from the edge` : ", Blum's least reveal, so the fronts do not rub"}.`;
  if (!(s.fit >= 0) || s.fit > 1 * MM) return "The fit must be 0 to 1 mm (0.04 in) over the stock.";
  const smallBit = metric ? "3 mm" : "1/8 in (3 mm)";
  if (!(s.bit >= 3 * MM - 1e-9) || s.bit > 0.5 * IN) return `The bit diameter must be at least ${smallBit} and at most ${metric ? "12.7 mm (1/2 in)" : "1/2 in"}.`;
  if (s.nailers !== "none") {
    if (s.back && s.backMount !== "groove") return "Rear nailers sit behind the back: set Back to In a groove, or to None.";
    // Over the toe kick: the inside height is from the bottom's top to the top's underside.
    const inside = s.height - (s.base === "toekick" ? s.toeKick : 0) - 2 * t;
    if (!(s.nailerHeight > 0) || !(s.nailerHeight < inside / 3)) return `The nailer must be more than 0 tall, and under a third of the inside height (${both(inside)}).`;
  }
  if (s.layout === "trash" && s.bin === "custom") {
    for (const [v, what] of /** @type {[number, string][]} */ ([[s.binWidth, "bin cutout width"], [s.binLength, "bin cutout length"], [s.binHeight, "bin height"], [s.trayHeight, "tray height"]])) {
      if (!(v > 0)) return `The ${what} must be more than 0.`;
    }
  }
  if (s.back && s.backMount === "groove") {
    if (!(s.backGrooveDepth > 0) || s.backGrooveDepth > t / 2 + 1e-9) return `The back groove must be more than 0 and at most half the stock (${both(t / 2)}) deep.`;
    if (!(s.backInset >= 0) || !(backInsetOf(s) < s.depth / 3)) return "The back's inset from the rear edge must be 0 or more, and under a third of the depth.";
    // 0 is a rabbet all round. Any other inset leaves a lip of wood behind the groove: at least WEB.
    const bi = backInsetOf(s);
    if (bi > 1e-9 && !(bi - s.fit / 2 >= WEB - 1e-9)) return `The back's inset must be 0 (a rabbet) or at least ${atLeast(WEB + s.fit / 2)}, to leave 3 mm of wood behind its groove.`;
    // Nailers sit right behind the back. A back a little further forward leaves a sliver between its groove and their dados.
    if (s.nailers !== "none" && s.dados) {
      const sliver = bi - t - s.fit;
      // Under 0.1 mm the groove and the dado meet (they are cut to different depths): nothing to break off.
      if (sliver >= 0.1 * MM && sliver < WEB - 1e-9) return `With nailers, a back inset of ${both(bi)} leaves a ${both(sliver)} sliver between the back's groove and the nailers' dados: make it ${both(t + s.fit)} (the back against the nailers) or at least ${atLeast(t + s.fit + WEB)}.`;
    }
    if (s.dados && Math.abs(s.backGrooveDepth - s.dadoDepth) < 0.05 * MM) return "Make the back groove a different depth from the dados (deeper, say), so each gets its own layer and bit in the DXF.";
  }
  if (s.dados) {
    if (!(s.dadoDepth > 0) || s.dadoDepth > t / 2 + 1e-9) return `The dado depth must be more than 0 and at most half the stock (${both(t / 2)}).`;
    if (!(s.dadoDepth > RELIEF + 0.5 * MM)) return "The dado is too shallow to hold a rail.";
    if (!(s.dadoStop >= WEB - 1e-9)) return `The dado stop must be at least ${metric ? "3 mm" : "1/8 in (3 mm)"}, or the wood in front of the groove breaks out.`;
    if (!(s.dadoStop + s.bit < s.depth / 2)) return "The cabinet is not deep enough for a blind dado this far back.";
  }
  // A dowel's face hole keeps 3 mm of wood behind it, and its edge hole 3 mm each side of it in
  // the rail's thickness; a Confirmat's 5 mm pilot the same in the rail.
  if (s.fastener === "dowels") {
    const least = Math.max(DOWEL.face + WEB_MM, DOWEL.dia + 2 * WEB_MM);
    if (!(t >= least * MM - 1e-9)) return `Dowel holes are ${DOWEL.dia} mm across and ${DOWEL.face} mm deep in the sides' faces (Häfele's depth for its 8 mm assembly dowel): the cabinet stock must be at least ${least} mm thick, for 3 mm of wood behind and beside each. Use blind dados, or thicker stock.`;
  }
  if (s.fastener === "confirmat") {
    if (!Object.keys(CONFIRMAT.lengths).includes(String(s.confirmatLength))) return "Confirmat screws: 50 or 70 mm, the lengths Häfele lists for its self-countersinking connector.";
    // The through hole is centred on the rail's thickness, so flush with the side's end it needs t/2 - 3.5 >= 3 mm too.
    const least = Math.max(CONFIRMAT.pilot, CONFIRMAT.through) + 2 * WEB_MM;
    if (!(t >= least * MM - 1e-9)) return `A Confirmat's ${CONFIRMAT.through} mm through hole in the side and ${CONFIRMAT.pilot} mm pilot in the rail are centred in the rail's thickness: the cabinet stock must be at least ${least} mm thick, for 3 mm of wood each side. Use blind dados, or thicker stock.`;
  }
  // Shelf pins are drilled whenever shelves are adjustable, hardware or not.
  if (hasShelf && s.shelfType === "adjustable" && !(t - PIN.depth * MM >= WEB - 1e-9)) return `Shelf pin holes are ${PIN.depth} mm deep: adjustable shelves need cabinet stock at least ${PIN.depth + 3} mm thick, for 3 mm of wood behind each hole. Use fixed shelves, or thicker stock.`;
  if (s.hardware) {
    // Each check only where its holes are drilled: cups in a door, runner screws in the sides behind overlay drawers.
    if (hasDoor && !(t - CUP.depth * MM >= WEB - 1e-9)) return `A Blum hinge cup is ${CUP.depth} mm deep: the door stock must be at least ${CUP.depth + 3} mm.`;
    if (hasDrawer && overlay && !(t - SYS.depth * MM >= WEB - 1e-9)) return `System screw holes are ${SYS.depth} mm deep: the cabinet stock must be at least ${SYS.depth + 3} mm.`;
    if (hasDoor && !(s.cupDistance >= CUP.minK * MM - 1e-9 && s.cupDistance <= CUP.maxK * MM + 1e-9)) return `The hinge cup boring distance must be ${CUP.minK} to ${CUP.maxK} mm (Blum CLIP top).`;
    if (!(s.pullHole > 0 && s.pullHole <= 12 * MM)) return "The pull hole must be more than 0 and at most 12 mm.";
    if (!(s.pullSpacing >= 0 && s.doorPullSpacing >= 0)) return "Pull spacing cannot be negative.";
  }
  return bandIssue(s, metric);
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
  const innerD = !s.back ? s.depth : s.backMount === "groove" ? s.depth - backInsetOf(s) - s.backThickness : s.depth - s.backThickness;
  const floor = kick + t;
  const ceiling = s.height - t;
  const interior = ceiling - floor;
  if (!(interior > 0)) return "It is not tall enough for a top and a bottom over the toe kick.";
  /** @type {{ z0: number, z1: number, kind: "drawer" | "door" }[]} */
  const bands = [];
  if (s.layout === "trash") {
    // One drawer, the full height, carrying the bins.
    bands.push({ z0: floor, z1: ceiling, kind: "drawer" });
  } else if (s.layout === "shelves" || s.layout === "doors") {
    if (!(interior > s.shelves * t)) return "It is not tall enough for its shelves.";
    if (s.layout === "doors") bands.push({ z0: floor, z1: ceiling, kind: "door" });
  } else {
    // Drawers are laid out by their fronts, as a shop draws them: a drawer cabinet's fronts are
    // all one height, and drawers over a door are each `drawerFront` tall, stacked from the top,
    // with the door under them. Overlay fronts cover the top and the bottom (or the toe kick
    // line), so the top and bottom openings are a thickness shorter than the fronts' pitch.
    const overlay = s.front === "overlay";
    const top = overlay ? s.height : ceiling;
    const bottom = overlay ? kick : floor;
    const n = s.drawers;
    // Each front's pitch (its height plus a gap), from the top down. A graduated drawer cabinet
    // has a short top drawer and the rest equal.
    const own = s.drawerFront + s.gap;
    /** @type {number[]} */
    const pitches =
      s.layout === "mixed"
        ? Array(n).fill(own)
        : s.drawerFronts === "graduated"
          ? [own, ...Array(n - 1).fill((top - bottom - own) / (n - 1))]
          : Array(n).fill((top - bottom) / n);
    if (s.layout === "drawers" && s.drawerFronts === "graduated" && !(pitches[1] > own)) return "The top drawer is not the shortest: make its front shorter, or choose equal fronts.";
    /** Where drawer k's front ends, counted down from the top (k = 0 is the top of the stack). */
    const line = (/** @type {number} */ k) => top - pitches.slice(0, k).reduce((a, b) => a + b, 0);
    if (s.layout === "mixed") {
      const z1 = line(n);
      if (!(z1 - floor > Math.max(s.shelves * t, 0) + 4 * IN)) return `The ${n === 1 ? "drawer takes" : "drawers take"} too much of the height to leave a door under ${n === 1 ? "it" : "them"}: make the drawer fronts shorter, or use fewer drawers.`;
      bands.push({ z0: floor, z1, kind: "door" });
    }
    // Bottom to top: the fronts' order, and drawer 1 is the lowest.
    for (let k = n - 1; k >= 0; k--) {
      const z0 = s.layout === "drawers" && k === n - 1 ? floor : line(k + 1);
      const z1 = k === 0 ? ceiling : line(k);
      if (!(z1 - z0 > 0)) return "The drawer fronts are too short for their openings.";
      bands.push({ z0, z1, kind: "drawer" });
    }
  }
  return { t, kick, innerW, innerD, floor, ceiling, bands };
}

/**
 * The hole keeps WEB of wood to the part's edges and to every cut that reaches it: a cut (a
 * dado, a groove, a notch) that comes within WEB of the hole along its axis, from its mouth to
 * WEB past its floor, must stand WEB clear of the hole's square in the face. A cut elsewhere
 * that merely lines up with the hole is no matter: partMesh merges the face's grid quads under
 * the hole. On a blank face only (every hole here is): the mesh needs the face flat round it.
 * @param {V3} size @param {Prism[]} prisms @param {Hole} hole
 */
export function holeClear(size, prisms, hole) {
  const a = hole.axis;
  const axes = [0, 1, 2].filter((k) => k !== a);
  const r = hole.radius;
  if (!axes.every((k, i) => hole.center[i] - r - WEB >= -1e-9 && hole.center[i] + r + WEB <= size[k] + 1e-9)) return false;
  const ends = [hole.at, hole.at + hole.inward * hole.depth];
  const d0 = Math.min(...ends) - WEB;
  const d1 = Math.max(...ends) + WEB;
  return prisms.every((p) => {
    const lo = p.min.map((v, k) => Math.max(0, Math.min(size[k], v)));
    const hi = p.max.map((v, k) => Math.max(0, Math.min(size[k], v)));
    if (!lo.every((v, k) => hi[k] - v > 1e-9)) return true;
    if (!(hi[a] > d0 + 1e-9 && lo[a] < d1 - 1e-9)) return true;
    return axes.some((k, i) => hi[k] <= hole.center[i] - r - WEB + 1e-9 || lo[k] >= hole.center[i] + r + WEB - 1e-9);
  });
}

/**
 * Where the dowels (or Confirmat screws) of one carcass joint go, from the joint's front edge,
 * for a joint `d` deep front to back (metres): Häfele's case dowelling (DOWEL), one 37 mm from the
 * front edge and one 37 mm from the back edge, at least 3 up to 18 in deep and 4 up to 24 in; the
 * ones between on the 32 mm grid counted from the front one, spread as evenly as the grid allows,
 * each keeping 3 mm of wood (WEB) to the back one. Exactly Häfele's least count: the chart gives a
 * minimum, and more holes are more to drill and line up. A string says why it cannot be done.
 * @param {number} d @returns {number[] | string}
 */
export function dowelLayout(d) {
  const e = DOWEL.setback * MM;
  const pitch = DOWEL.pitch * MM;
  const apart = (DOWEL.dia + WEB_MM) * MM;
  const band = DOWEL.upTo.find(([inch]) => d <= inch * IN + 1e-9);
  if (!band) return `${both(d)} deep: Häfele's dowel chart gives counts for joints up to 24 in (609.6 mm) deep, and nothing deeper`;
  const n = band[1];
  const rear = d - e;
  // The grid points between, k = 1..most, each 3 mm of wood clear of the rear dowel.
  const most = Math.floor((rear - apart - e) / pitch + 1e-9);
  if (most < n - 2) return `${both(d)} deep: Häfele's chart asks for at least ${n} dowels up to ${band[0]} in, 37 mm from the front and back edges, with those between on the 32 mm grid, which needs the joint at least ${atLeast(2 * e + (n - 2) * pitch + apart)} deep`;
  /** @type {number[]} */
  const ks = [];
  for (let i = 1; i <= n - 2; i++) {
    const ideal = e + ((rear - e) * i) / (n - 1);
    const k = Math.round((ideal - e) / pitch);
    ks.push(Math.max(ks.length ? ks[ks.length - 1] + 1 : 1, Math.min(most - (n - 2 - i), k)));
  }
  return [e, ...ks.map((k) => e + k * pitch), rear];
}

/**
 * The stretchers' width as built (metres). With dowels or Confirmat screws, at least the least
 * joint that takes Häfele's fewest dowels (DOWEL.upTo[0]): 37 mm from each edge, those between on
 * the 32 mm grid, 3 mm of wood to the rear one. Rounded up to a millimetre (metric) or a
 * sixteenth (inches). Blind dados and butt joints keep the width as set.
 * @param {Sizes} s @param {boolean} metric @returns {number}
 */
export function stretcherWidth(s, metric) {
  if (s.dados || s.fastener === "none") return s.stretcher;
  const n = DOWEL.upTo[0][1];
  const need = (2 * DOWEL.setback + (n - 2) * DOWEL.pitch + DOWEL.dia + WEB_MM) * MM;
  const step = metric ? MM : IN / 16;
  return Math.max(s.stretcher, Math.ceil(need / step - 1e-6) * step);
}

/** A rail's name as a sentence says it: "bottom", "front stretcher", "fixed shelf 1". @param {string} name */
const jointWord = (name) => (name.startsWith("Shelf") ? name.replace(/^Shelf/, "fixed shelf") : name.toLowerCase());
/** The dowels a rail takes, in words: Häfele's assembly dowel's depths are the holes, no part number. */
const DOWEL_ITEM = `Dowel, ${DOWEL.dia} x 35 mm or shorter (the holes are ${DOWEL.face} mm in the side and ${DOWEL.edge} mm in the edge, ${DOWEL.face + DOWEL.edge} mm together)`;

/**
 * One band of the list, as the planner uses it: its number (1 to 3), thickness and width
 * (metres), name, and how a shopping list or a row names it ("1 mm x 15/16 in, White PVC").
 * @typedef {{ n: number, thickness: number, width: number, name: string, label: string }} Band
 */
/**
 * The bands listed (1 to `bandCount`, at most 3), each with its thickness: the preset picked, or
 * the one typed. @param {Sizes} s @param {boolean} metric @returns {Band[]}
 */
export function bandList(s, metric) {
  const raw = [
    { size: s.band1Size, thick: s.band1Thick, name: s.band1Name, width: s.band1Width },
    { size: s.band2Size, thick: s.band2Thick, name: s.band2Name, width: s.band2Width },
    { size: s.band3Size, thick: s.band3Thick, name: s.band3Name, width: s.band3Width },
  ];
  const count = Math.max(1, Math.min(3, Number.isInteger(s.bandCount) ? s.bandCount : 1));
  return raw.slice(0, count).map((b, i) => {
    const preset = BAND.sizes.find((x) => x[0] === b.size);
    const thickness = preset ? preset[1] * MM : b.thick;
    const thick = preset ? (preset[0] === "0.018in" ? "0.018 in" : `${preset[1]} mm`) : `${Math.round((thickness / MM) * 100) / 100} mm`;
    return { n: i + 1, thickness, width: b.width, name: b.name, label: `${thick} x ${exactThickness(b.width, metric)}${b.name ? `, ${b.name}` : ""}` };
  });
}

/** The band a kind of part takes, or null (banding off, or that kind not banded). Undefined
 * when it names a band past the list (validate refuses that).
 * @param {Sizes} s @param {"fronts" | "carcass" | "shelves"} kind @param {boolean} metric @returns {Band | null | undefined} */
export function bandFor(s, kind, metric) {
  if (!s.band) return null;
  const pick = kind === "fronts" ? s.bandFronts : kind === "carcass" ? s.bandCarcass : s.bandShelves;
  if (pick === "none") return null;
  return bandList(s, metric)[Number(pick) - 1];
}

/** "Band 1 (1 mm)": how a message names a band. @param {Band} b */
const bandWord = (b) => `Band ${b.n} (${Math.round((b.thickness / MM) * 1000) / 1000} mm)`;

/** The edge banding settings, checked: null, or what is wrong. Off, nothing is checked.
 * @param {Sizes} s @param {boolean} metric @returns {string | null} */
function bandIssue(s, metric) {
  if (!s.band) return null;
  // Nothing picked: nothing is banded, and nothing of the list is used.
  if (s.bandFronts === "none" && s.bandCarcass === "none" && s.bandShelves === "none") return null;
  if (!Number.isInteger(s.bandCount) || s.bandCount < 1 || s.bandCount > 3) return "Edge banding: list 1 to 3 bands.";
  const list = bandList(s, metric);
  for (const b of list) {
    if (!(b.thickness >= BAND.minThick - 1e-9 && b.thickness <= BAND.maxThick + 1e-9)) return `Band ${b.n} must be at least 0.1 mm and at most 6.35 mm (1/4 in) thick, Sawhorse's limits: thicker is solid-wood edging, not a band.`;
    if (!(b.width > 0 && b.width <= BAND.maxWidth + 1e-9)) return `Band ${b.n} must be more than 0 and at most 101.6 mm (4 in) wide.`;
  }
  const hasDoor = s.layout === "doors" || s.layout === "mixed";
  const hasDrawer = s.layout === "drawers" || s.layout === "mixed" || s.layout === "trash";
  const hasShelf = (s.layout === "shelves" || s.layout === "doors" || s.layout === "mixed") && s.shelves > 0 && s.shelfType === "adjustable";
  /** @type {[BandPick, string, string, number, boolean][]} which band each kind takes, what it is, what its edges are, the stock, and whether the cabinet has it */
  const kinds = [
    [s.bandFronts, "Doors and drawer fronts", "the doors and drawer fronts", Math.max(hasDoor ? s.thickness : 0, hasDrawer ? s.frontThickness : 0), hasDoor || hasDrawer],
    [s.bandCarcass, "The carcass's front edges", "the carcass", s.thickness, true],
    [s.bandShelves, "Adjustable shelves", "the adjustable shelves", s.thickness, hasShelf],
  ];
  for (const [pick, what, of, stock, applies] of kinds) {
    if (pick === "none") continue;
    const b = list[Number(pick) - 1];
    if (!b) return `${what} take Band ${pick}, but the list has ${list.length === 1 ? "one band" : `${list.length} bands`}: pick another, or list more.`;
    if (applies && b.width < stock - 1e-9) return `Band ${b.n} is ${both(b.width)} wide: too narrow to cover the ${exactThickness(stock, metric)} edges of ${of}. Use a band at least as wide as the stock (Sawhorse's rule: a narrower band leaves the edge bare).`;
  }
  if (!(s.bandPremill >= 0 && s.bandPremill <= BAND.maxPremill + 1e-9)) return "The edgebander pre-mill must be 0 to 3 mm (the most Felder's and SCM's edgebanders take off). Iron-on banding: 0.";
  if (!(s.bandWasteEnd >= 0 && s.bandWasteEnd <= BAND.maxWasteEnd + 1e-9)) return "The banding waste per banded side must be 0 to 12 in (305 mm).";
  // A blind dado stops short of the side's front edge; under a band, the wood in front of it is
  // the band's thickness less, and the planner keeps 3 mm there.
  const carcass = bandFor(s, "carcass", metric);
  if (carcass && s.dados && s.dadoStop - carcass.thickness < WEB - 1e-9) return `The blind dados stop ${both(s.dadoStop)} from the sides' finished front edge; under ${bandWord(carcass)} that leaves ${both(s.dadoStop - carcass.thickness)} of wood in front of them, less than the 3 mm the planner keeps: set Dado stop to at least ${atLeast(carcass.thickness + WEB)}, or use a thinner band on the carcass.`;
  const fronts = bandFor(s, "fronts", metric);
  if (fronts && hasDrawer && s.drawerPull === "notch") return "A finger notch cuts into each drawer front's top edge, and an edgebander runs the band straight across it: choose another drawer pull, or set Doors and drawer fronts to No banding.";
  return null;
}

/** What a hole is, for a message. @param {Hole} h */
const holeWhat = (h) => {
  if (Math.abs(h.radius - CUP.radius * MM) < 1e-9) return "hinge cup";
  if (h.through && h.axis === 0 && Math.abs(h.radius - (CONFIRMAT.through * MM) / 2) < 1e-9) return "Confirmat hole";
  if (h.through) return "pull hole";
  if (Math.abs(h.radius - (DOWEL.dia * MM) / 2) < 1e-9 && Math.abs(h.depth - DOWEL.face * MM) < 1e-9) return "dowel hole";
  if (Math.abs(h.depth - PIN.depth * MM) < 1e-9) return "shelf pin hole";
  if (Math.abs(h.depth - PLATE_HOLE.depth * MM) < 1e-9) return "hinge plate hole";
  if (Math.abs(h.depth - SYS.depth * MM) < 1e-9) return "runner screw hole";
  return "hole";
};

/**
 * A part's blank with its banded edges cut short, every cut kept where it is in the finished
 * part. `size`, `prisms` and `holes` are the finished part's (the planner's, unchanged); the
 * blank is `size` less each banded edge's band (plus the edgebander's pre-mill, which it takes
 * off again), and the prisms and holes are moved by what came off the low edges, so each stays
 * at its absolute place. `offset` is that move: a copy's corner goes that far in.
 *
 * Refused, with what to change, where banding would change the part or a joint:
 * - a dado or groove (a cut through part of the thickness) that runs out of a banded edge: the
 *   band would cover it; bands go only on exposed edges;
 * - a notch in the middle of a banded edge (an edgebander runs the band across it), or one at an
 *   end no deeper than the band (it would be gone from the blank);
 * - a hole drilled into a banded edge;
 * - a cut or a hole that keeps 3 mm of wood (WEB) to the finished edge but would not to the raw
 *   edge under the band: the planner's rule, kept to the wood.
 * @param {string} name @param {V3} size @param {Prism[]} prisms @param {Hole[]} holes
 * @param {{ edge: EdgeName, band: Band }[]} edges @param {number} premill
 * @returns {{ blank: V3, prisms: Prism[], holes: Hole[], offset: V3, bands: PartBand[] }}
 */
export function bandPart(name, size, prisms, holes, edges, premill) {
  const thin = size.indexOf(Math.min(...size));
  const cuts = prisms
    .map((p) => ({ min: p.min.map((v, k) => Math.max(0, Math.min(size[k], v))), max: p.max.map((v, k) => Math.max(0, Math.min(size[k], v))) }))
    .filter((p) => p.min.every((v, k) => p.max[k] - v > 1e-9));
  /** @type {PartBand[]} */
  const bands = [];
  for (const { edge, band } of edges) {
    const [k, hi] = EDGE_AXES[edge];
    if (k === thin) throw new Error(`${name}: its ${edge} is a face, not an edge.`);
    const long = /** @type {0 | 1 | 2} */ ([0, 1, 2].find((j) => j !== k && j !== thin));
    const b = band.thickness;
    let a = 0;
    let z = size[long];
    for (const p of cuts) {
      const gap = hi ? size[k] - p.max[k] : p.min[k];
      if (gap > 1e-9) {
        if (gap - b < WEB - 1e-9) throw new Error(`${name}: a dado or groove comes ${both(gap)} from its finished ${edge} edge; under ${bandWord(band)} that leaves ${both(gap - b)} of wood to the raw edge, less than the 3 mm the planner keeps. Use a thinner band.`);
        continue;
      }
      if (!(p.min[thin] <= 1e-9 && p.max[thin] >= size[thin] - 1e-9)) throw new Error(`${name}: a dado or groove runs out of its ${edge} edge, where a band would cover it and change the joint. Bands go only on exposed edges.`);
      const depth = hi ? size[k] - p.min[k] : p.max[k];
      if (p.min[long] <= 1e-9) a = Math.max(a, p.max[long]);
      else if (p.max[long] >= size[long] - 1e-9) z = Math.min(z, p.min[long]);
      else throw new Error(`${name}: a notch cuts into the middle of its banded ${edge} edge, and an edgebander runs the band straight across it. Do not band that edge, or leave the notch out.`);
      if (!(depth > b + 1e-9)) throw new Error(`${name}: a notch in its banded ${edge} edge is ${both(depth)} deep, no deeper than ${bandWord(band)}: it would be gone from the blank. Use a thinner band, or a deeper notch.`);
    }
    for (const h of holes) if (h.axis === k && Math.abs(h.at - (hi ? size[k] : 0)) < 1e-9) throw new Error(`${name}: a hole is drilled into its ${edge} edge, where a band would cover it. Bands go only on exposed edges.`);
    if (!(z - a > 1e-9)) throw new Error(`${name}: its ${edge} edge is all notches, with nothing to band.`);
    bands.push({ edge, band: band.n, thickness: b, width: band.width, name: band.name, length: z - a, span: [a, z], run: size[long] });
  }
  /** What comes off each axis's low and high end. @param {(b: Band) => number} off */
  const trims = (off) => {
    const lo = /** @type {V3} */ ([0, 0, 0]);
    const hi = /** @type {V3} */ ([0, 0, 0]);
    for (const { edge, band } of edges) {
      const [k, h] = EDGE_AXES[edge];
      (h ? hi : lo)[k] = off(band);
    }
    return { lo, hi };
  };
  /** The blank with `lo` and `hi` off, its cuts moved so they stay where they were. A cut that ran
   * out of an edge still does (when the edge moves out, a pre-mill larger than the band, it runs
   * out of the new one). @param {{ lo: V3, hi: V3 }} t */
  const shift = ({ lo, hi }) => {
    const blank = /** @type {V3} */ (size.map((v, k) => v - lo[k] - hi[k]));
    const ps = prisms.map((p) => ({
      min: /** @type {V3} */ (p.min.map((v, k) => (v <= 1e-9 ? Math.min(v - lo[k], v) : v - lo[k]))),
      max: /** @type {V3} */ (p.max.map((v, k) => (v >= size[k] - 1e-9 ? Math.max(v - lo[k], blank[k] + v - size[k]) : v - lo[k]))),
    }));
    const hs = holes.map((h) => {
      const axes = [0, 1, 2].filter((k) => k !== h.axis);
      return /** @type {Hole} */ ({ ...h, at: h.at - lo[h.axis], center: [h.center[0] - lo[axes[0]], h.center[1] - lo[axes[1]]] });
    });
    return { blank, prisms: ps, holes: hs };
  };
  // The wood under the band, once the edgebander has milled its pre-mill off: the planner's 3 mm
  // to every edge is kept there.
  const wood = trims((band) => band.thickness);
  const under = shift(wood);
  under.holes.forEach((h, i) => {
    if (holeClear(under.blank, under.prisms, h)) return;
    const was = holes[i];
    const axes = [0, 1, 2].filter((k) => k !== was.axis);
    const at = edges.find(({ edge, band }) => {
      const [k, hi] = EDGE_AXES[edge];
      const j = axes.indexOf(k);
      if (j < 0) return false;
      const fin = hi ? size[k] - was.center[j] - was.radius : was.center[j] - was.radius;
      return fin - band.thickness < WEB - 1e-9;
    });
    const what = holeWhat(was);
    if (!at) throw new Error(`${name}: under its bands the ${what} lands on a cut or an edge. Use a thinner band.`);
    const [k, hi] = EDGE_AXES[at.edge];
    const j = axes.indexOf(k);
    const fin = hi ? size[k] - was.center[j] - was.radius : was.center[j] - was.radius;
    const b = at.band.thickness;
    const most = CUP.maxK * MM - WEB;
    const fix =
      what === "hinge cup"
        ? b + WEB <= CUP.maxK * MM + 1e-9
          ? `Set Boring distance to at least ${Math.ceil(((b + WEB) / MM) * 2 - 1e-6) / 2} mm, or band the doors with a thinner band.`
          : `No boring distance Blum gives (3 to 7 mm) leaves that: band the doors with a band of at most ${Math.round((most / MM) * 100) / 100} mm.`
        : what === "pull hole"
          ? `Keep the pull holes at least ${atLeast(b + WEB + was.radius)} from the edge (to their centres), or use a thinner band.`
          : "Use a thinner band.";
    throw new Error(`${name}: the ${what} is ${both(fin)} from the finished ${at.edge} edge; under ${bandWord(at.band)} that leaves ${both(fin - b)} of wood to the raw edge, less than the 3 mm the planner keeps. ${fix}`);
  });
  const t = trims((band) => band.thickness - premill);
  const cut = shift(t);
  if (!cut.blank.every((v) => v > 1e-9)) throw new Error(`${name}: its bands leave no blank.`);
  return { ...cut, offset: t.lo, bands };
}

/**
 * Whether a banded edge sits against another part (or in its dado or groove), where a band
 * would change the joint: null, or what. Every copy of every banded part, at its finished size:
 * no other part may reach across the edge's plane from outside the part, over the band's
 * length and the part's thickness. Doors and drawer fronts move: they never count against a
 * carcass part's edge (an overlay door closes in front of the sides), but every part counts
 * against a front's edge.
 *
 * No edge the panel offers can be banded into a joint (each is a front edge, or a front's edge,
 * that nothing sits against), so from plan() this never fires today: it is a safety net for part
 * kinds added later, and has its own tests.
 * @param {Part[]} parts @returns {string | null}
 */
export function bandClash(parts) {
  const boxes = parts.flatMap((p) =>
    p.copies.map((c) => {
      const off = p.offset ?? [0, 0, 0];
      const size = p.finished ?? p.blank;
      const min = /** @type {V3} */ (c.at.map((v, k) => v - off[k]));
      return { part: p, name: c.name ?? p.name, min, max: /** @type {V3} */ (min.map((v, k) => v + size[k])), moving: MOVING.has(p.name) };
    }),
  );
  const E = 1e-6;
  for (const box of boxes) {
    const bands = box.part.bands;
    if (!bands?.length) continue;
    const size = /** @type {V3} */ (box.part.finished);
    const thin = size.indexOf(Math.min(...size));
    for (const e of bands) {
      const [k, hi] = EDGE_AXES[e.edge];
      const long = /** @type {number} */ ([0, 1, 2].find((j) => j !== k && j !== thin));
      const plane = hi ? box.max[k] : box.min[k];
      const l0 = box.min[long] + e.span[0];
      const l1 = box.min[long] + e.span[1];
      for (const o of boxes) {
        if (o === box || (o.moving && !box.moving)) continue;
        const across = hi ? o.max[k] > plane + E && o.min[k] <= plane + E : o.min[k] < plane - E && o.max[k] >= plane - E;
        if (!across) continue;
        const along = Math.min(l1, o.max[long]) - Math.max(l0, o.min[long]);
        const through = Math.min(box.max[thin], o.max[thin]) - Math.max(box.min[thin], o.min[thin]);
        if (along > E && through > E) return `${box.name}: its banded ${e.edge} edge sits against the ${o.name}, where a band would change the joint. Bands go only on exposed edges: do not band it.`;
      }
    }
  }
  return null;
}

/**
 * Which way a part's grain runs, as the cut list says it (along its length or its width, or
 * none, free to turn on the sheet), from the way it should run in the cabinet:
 * - doors and drawer faces as asked (vertical or across); a trash pull-out's front as a door;
 * - sides vertical, or free when they never show;
 * - shelves across the cabinet, along their span, where plywood is stiffest;
 * - everything else (the box's insides, the back, the toe kick, drawer boxes) free to turn,
 *   so the nester packs them tighter, or along their length if asked.
 * @param {Sizes} s @param {string} name @param {V3} blank @returns {Grain}
 */
export function grainFor(s, name, blank) {
  /** @type {"vertical" | "horizontal" | "any" | "length"} */
  const want = /door$/i.test(name)
    ? s.grainDoors
    : name === "Drawer front"
      ? // A trash pull-out's front is door-sized and reads as a door: it follows the doors.
        s.layout === "trash" ? s.grainDoors : s.grainFronts
      : name === "Left side" || name === "Right side"
        ? s.grainSides
        : name === "Shelf"
          ? "horizontal"
          : s.grainHidden;
  if (want === "any") return "none";
  if (want === "length") return "length";
  // The face's two directions (the thinnest is the thickness); the longer is the cut list's length.
  const t = blank.indexOf(Math.min(...blank));
  const [a, b] = [0, 1, 2].filter((k) => k !== t);
  const long = blank[a] >= blank[b] ? a : b;
  const axis = want === "vertical" ? 2 : 0;
  return axis === long || ![a, b].includes(axis) ? "length" : "width";
}

/**
 * The parts as one import with every copy at the top level, placed at `at`, so a batch can
 * set each part's grain through the instance it makes (its `groups`, in part order) and then
 * wrap them into the cabinet's component (makeComponent). One undo step either way.
 * @param {Part[]} parts @param {V3 | { linear: number[][], translation: V3 } | undefined} at
 * @param {{ name: string, color: [number, number, number, number] }[]} [materials]
 */
export function flatImportOp(parts, at, materials = []) {
  const place = at && typeof at === "object" && "linear" in at ? at : { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: /** @type {V3} */ (at ?? [0, 0, 0]) };
  const L = place.linear;
  /** @param {V3} p @returns {V3} */
  const apply = (p) => /** @type {V3} */ ([0, 1, 2].map((r) => L[r][0] * p[0] + L[r][1] * p[1] + L[r][2] * p[2] + place.translation[r]));
  /** @type {Record<string, unknown>[]} */
  const nodes = [];
  parts.forEach((p, i) => {
    for (const c of p.copies) nodes.push({ kind: "instance", definition: i, ...(c.name ? { name: c.name } : {}), xform: { linear: L, translation: apply(c.at) } });
  });
  /** @type {Record<string, unknown>} */
  const op = { op: "import", definitions: parts.map((p) => ({ name: p.name, items: [{ ...p.mesh, material: p.material }] })), nodes };
  if (materials.length) op.materials = materials.map((m) => ({ name: m.name, color: m.color }));
  return op;
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ parts: Part[], rows: string[][], runner: RunnerLength | null, holes: number, room: BinRoom | null }}
 */
function build(s, metric) {
  const wrong = validate(s, metric);
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
   *
   * Sizes, cuts and the copy's place are the finished part's. With banded `edges`, the part
   * becomes its blank (bandPart): each banded edge cut short by its band, every cut where it was,
   * the copy moved in to the blank's corner; and it carries its banding (the edges, and the band
   * by the metre, with waste, for the shopping list).
   * @param {string} name @param {string} material @param {V3} size @param {Prism[]} prisms @param {Hole[]} holes
   * @param {{ at: V3, name?: string }} copy @param {BomItem[]} [bom] what is bought for each copy (hardware)
   * @param {{ edge: EdgeName, band: Band }[]} [edges] its banded edges
   */
  const add = (name, material, size, prisms, holes, copy, bom = [], edges = []) => {
    let blank = size;
    let cuts = prisms;
    let drills = holes;
    let place = copy;
    /** @type {{ finished?: V3, offset?: V3, bands?: PartBand[] }} */
    let banded = {};
    if (edges.length) {
      const b = bandPart(name, size, prisms, holes, edges, s.bandPremill);
      blank = b.blank;
      cuts = b.prisms;
      drills = b.holes;
      place = { ...copy, at: /** @type {V3} */ (copy.at.map((v, k) => v + b.offset[k])) };
      banded = { finished: size, offset: b.offset, bands: b.bands };
      bom = [...bom, ...bandBom(b.bands)];
    }
    // Rounded to a micrometre: two fronts a float apart are the same part.
    const key = JSON.stringify(edges.length ? [name, blank, cuts, drills, bom, banded] : [name, blank, cuts, drills, bom], (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) : v));
    let part = /** @type {Part & { key?: string } | undefined} */ (parts.find((p) => /** @type {Part & { key?: string }} */ (p).key === key));
    if (!part) {
      let mesh;
      try {
        mesh = partMesh(name, blank, cuts, drills);
      } catch (e) {
        throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      part = { name, material, blank, copies: [], mesh, grain: grainFor(s, name, blank), ...(bom.length ? { bom } : {}), ...banded };
      Object.defineProperty(part, "key", { value: key, enumerable: false });
      parts.push(part);
    }
    part.copies.push(place);
    drilled += holes.length;
  };
  // --- edge banding: which band each kind of part takes (bandFor), and what it buys -----------
  const bandFronts = bandFor(s, "fronts", metric) ?? null;
  const bandCarcass = bandFor(s, "carcass", metric) ?? null;
  const bandShelves = bandFor(s, "shelves", metric) ?? null;
  /** A front's four edges, or a part's front edge, in a band (none when it is not banded).
   * @param {Band | null} band @param {EdgeName[]} which */
  const edgesIn = (band, which) => (band ? which.map((edge) => ({ edge, band })) : []);
  const bandSet = bandList(s, metric);
  /**
   * Each band a part takes, by the metre for each copy: every banded edge's whole run (an
   * edgebander runs the band across a notch at an end, a side's toe kick or a rail's tongue, and
   * it is trimmed off by hand there) plus the waste per banded side (Microvellum's 1 in to start),
   * rounded up to the millimetre. Microvellum's 5% is the shopping list's banding overage, applied
   * once to the total. @param {PartBand[]} on @returns {BomItem[]}
   */
  const bandBom = (on) =>
    [...new Set(on.map((e) => e.band))].map((n) => {
      const edges = on.filter((e) => e.band === n);
      const metres = edges.reduce((m, e) => m + e.run + s.bandWasteEnd, 0);
      return /** @type {BomItem} */ ({ item: `Edge banding, ${bandSet[n - 1].label}`, qty: Math.ceil(metres * 1000 - 1e-6) / 1000, unit: "m" });
    });
  let drilled = 0;
  /** @param {string} part @param {string} where @param {string} hole @param {string} depth @param {string} how */
  const note = (part, where, hole, depth, how) => rows.push([part, where, hole, depth, how]);
  /** @param {string} part @param {V3} size @param {Prism[]} prisms @param {Hole} h @param {string} what @param {string} [fix] */
  const placeHole = (part, size, prisms, h, what, fix = "Change the sizes, or turn hardware holes off.") => {
    if (!holeClear(size, prisms, h)) throw new Error(`${part}: the ${what} lands on a dado, a joint or an edge. ${fix}`);
    return h;
  };

  // --- the carcass -------------------------------------------------------------------------
  /** Rails the sides are grooved for; `front` is where a rail starts when it is not at the
   * cabinet's front (a shelf behind an inset door), and its dado stops that much later.
   * @type {{ z: number, name: string, front?: number }[]} */
  const rails = [{ z: kick, name: "Bottom" }, { z: s.height - t, name: "Top" }];
  const shelfZs = shelfHeights(s, floor, ceiling, bands);
  const fixedShelves = s.shelfType === "fixed";
  // An inset door stands inside the opening, in the first thickness of its depth: the shelves
  // behind it start behind the door. (An overlay door is in front of the cabinet.)
  const shelfFront = !overlay && shelfZs.length && bands.some((x) => x.kind === "door") ? t + DOOR_ROOM : 0;
  // Fixed shelves sit in dados; adjustable ones sit on pins.
  if (fixedShelves) shelfZs.forEach((z, i) => rails.push({ z, name: `Shelf ${i + 1}`, front: shelfFront }));
  const tongue = s.dados ? s.dadoDepth - RELIEF : 0;
  const notchLen = stop + s.bit;
  /** Rear nailers (hanging rails): under the top, and over the bottom, at the rear edge. */
  const nailers = /** @type {{ name: string, z0: number, z1: number }[]} */ ([]);
  if (s.nailers !== "none") nailers.push({ name: "Top nailer", z0: s.height - t - s.nailerHeight, z1: s.height - t });
  if (s.nailers === "both") nailers.push({ name: "Bottom nailer", z0: kick + t, z1: kick + t + s.nailerHeight });
  /** The back's groove across the depth (y), the back plus the fit. */
  const backY = /** @type {[number, number]} */ ([yb0 - s.fit / 2, yb0 + bT + s.fit / 2]);
  /** A shelf stops at the back; with no back but nailers, at the nailers' face. */
  const shelfDepth = grooved ? yb0 - PANEL_GAP : !s.back && nailers.length ? s.depth - t - PANEL_GAP : innerD;
  if (shelfFront && !(shelfDepth - shelfFront > 2 * t)) throw new Error("The shelves have no depth left behind the inset door. Make the cabinet deeper, or use overlay fronts.");

  const sideSize = /** @type {V3} */ ([t, s.depth, s.height]);
  /** Prisms of a side whose inner face is at x = `inner` (0 or t). @param {number} inner */
  const sidePrisms = (inner) => {
    /** @param {number} d */
    const xs = (d) => (inner === 0 ? [0, d] : [t - d, t]);
    /** @type {Prism[]} */
    const out = [];
    if (s.dados) {
      const [x0, x1] = xs(s.dadoDepth);
      for (const r of rails) out.push({ min: [x0, stop + (r.front ?? 0), r.z - s.fit / 2], max: [x1, s.depth, r.z + t + s.fit / 2] });
    }
    if (grooved) {
      const [x0, x1] = xs(bgd);
      out.push({ min: [x0, backY[0], zb0 - s.fit / 2], max: [x1, backY[1], zb1 + s.fit / 2] });
    }
    if (s.dados) {
      const [x0, x1] = xs(s.dadoDepth);
      for (const nl of nailers) out.push({ min: [x0, s.depth - t - s.fit / 2, nl.z0 - s.fit / 2], max: [x1, s.depth, nl.z1 + s.fit / 2] });
    }
    if (s.base === "toekick") out.push({ min: [0, 0, 0], max: [t, s.toeSetback, kick] });
    return out;
  };
  /** @type {{ left: Hole[], right: Hole[] }} */
  const sideHoles = { left: [], right: [] };
  /** Each hinge plate's centre height, by side: no shelf pin goes under a plate. */
  const plates = { left: /** @type {number[]} */ ([]), right: /** @type {number[]} */ ([]) };
  /** What each side hole is for, to name the one a new hole would run into. */
  const sideWhat = { left: /** @type {string[]} */ ([]), right: /** @type {string[]} */ ([]) };
  /** @param {"left" | "right"} which @param {number} y @param {number} z @param {string} what @param {string} [fix] @param {{ dia: number, depth: number, through?: boolean }} [kind] */
  const sideHole = (which, y, z, what, fix, kind = SYS) => {
    const inner = which === "left" ? t : 0;
    const part = `${which === "left" ? "Left" : "Right"} side`;
    const h = /** @type {Hole} */ ({ axis: 0, at: inner, inward: which === "left" ? -1 : 1, center: [y, z], radius: (kind.dia * MM) / 2, depth: kind.through ? t : kind.depth * MM, ...(kind.through ? { through: true } : {}) });
    // A hinge plate and a runner both want the 37 mm line: two holes must keep wood between them.
    const hit = sideHoles[which].findIndex((o) => Math.hypot(o.center[0] - y, o.center[1] - z) < o.radius + h.radius + WEB - 1e-9);
    if (hit >= 0) throw new Error(`${part}: the ${what} runs into the ${sideWhat[which][hit]}. Change the hinge inset or the drawer sizes, or turn hardware holes off.`);
    sideHoles[which].push(placeHole(part, sideSize, sidePrisms(inner), h, what, fix));
    sideWhat[which].push(what);
  };

  // --- dowels or Confirmat screws: each rail's joint with the sides ---------------------------
  /** Where the top and the bottom end at the rear: the rear edge when they carry the back's groove. */
  const railEnd = grooved ? s.depth : innerD;
  /**
   * Each rail the sides are joined to by dowels or Confirmat screws, with no blind dados: its
   * name (the copy's), its height, its front and rear (`ya`, `yb`) and where the holes go along it
   * from its front edge (dowelLayout). The face holes go in both sides now, before any hardware
   * or pin hole, so those keep their wood to them; the rails' edge holes are listed for a jig.
   * @type {{ z: number, name: string, ya: number, yb: number, at: number[] }[]}
   */
  const joints = [];
  const fastener = s.dados ? "none" : s.fastener;
  if (fastener !== "none") {
    /** @type {{ z: number, name: string, ya: number, yb: number }[]} */
    const spans = [];
    const sw = stretcherWidth(s, metric);
    for (const r of rails) {
      if (r.name === "Top" && s.top === "stretchers") spans.push({ z: r.z, name: "Front stretcher", ya: 0, yb: sw }, { z: r.z, name: "Rear stretcher", ya: railEnd - sw, yb: railEnd });
      else if (r.name === "Top" || r.name === "Bottom") spans.push({ z: r.z, name: r.name, ya: 0, yb: railEnd });
      else spans.push({ z: r.z, name: r.name, ya: shelfFront, yb: shelfDepth });
    }
    const kind = fastener === "dowels" ? { dia: DOWEL.dia, depth: DOWEL.face } : { dia: CONFIRMAT.through, depth: 0, through: true };
    const what = fastener === "dowels" ? "dowel hole" : "Confirmat hole";
    for (const j of spans) {
      const at = dowelLayout(j.yb - j.ya);
      const word = jointWord(j.name);
      if (typeof at === "string") throw new Error(`The ${word} is ${at}. ${/stretcher/.test(j.name) ? "Make the stretchers wider, use a full top, or use blind dados." : "Make the cabinet shallower, or use blind dados."}`);
      // The rear hole (the last of `at`) can land in a grooved back's groove: say so, and say what to change.
      const grooved = !!s.back && s.backMount === "groove";
      at.forEach((y, i) => {
        const fix = grooved && i === at.length - 1
          ? `Change the back's inset (now ${both(backInsetOf(s))}): the rear hole is ${DOWEL.setback} mm in from the rail's back edge and may land in the back's groove. Or change the sizes, or use blind dados.`
          : "Change the sizes, or use blind dados.";
        for (const which of /** @type {const} */ (["left", "right"])) sideHole(which, j.ya + y, j.z + t / 2, `${what} for the ${word}`, fix, kind);
      });
      joints.push({ ...j, at });
    }
  }

  /** What a rail's two joints take, for the shopping list: each end's dowels or Confirmat screws,
   * on the rail (the part they go into). @param {string} copyName @returns {BomItem[]} */
  const jointBom = (copyName) => {
    const j = joints.find((x) => x.name === copyName);
    if (!j) return [];
    const qty = 2 * j.at.length;
    if (fastener === "dowels") return [{ item: DOWEL_ITEM, qty, unit: "each" }];
    const len = String(s.confirmatLength);
    return [{ item: `Häfele self-countersinking Confirmat connector, 7 x ${len} mm, pointed tip, Pozi drive size 3, zinc-plated`, sku: CONFIRMAT.lengths[len].sku, qty, unit: "each" }];
  };

  // --- the shopping list: hardware that rides on the part it goes on (HARDWARE) -------------
  /**
   * A door's hinges, their mounting plates (one each) and the screws that hold a screw-on hinge's
   * cup to the door. @param {number} count @returns {BomItem[]}
   */
  const hingeBom = (count) => {
    const hinge = HARDWARE.hinge[s.hingeClose][overlay ? "overlay" : "inset"];
    const screw = HARDWARE.hingeScrew[s.catalog];
    return [
      { item: hinge.item, sku: hinge.sku, qty: count, unit: "each" },
      plateBom(count),
      { item: screw.item, sku: screw.sku, qty: HARDWARE.hingeScrew.perHinge * count, unit: "each" },
    ];
  };
  /**
   * One mounting plate per hinge. Its part number only where this plugin drills its two 5 x 11.5
   * mm holes (an overlay door, hardware holes on) and the Overlay row settles on a 0 mm plate;
   * otherwise in words, as the runner screws are when their holes are not drilled here.
   * @param {number} count @returns {BomItem}
   */
  const plateBom = (count) => {
    if (!overlay) return { item: "Blum CLIP mounting plate for an inset door, as Blum's inset table gives", qty: count, unit: "each" };
    const plate = overlayPlate();
    const height = plate === null ? "height to match the overlay" : `${plate} mm`;
    if (!s.hardware) return { item: `Blum CLIP mounting plate, frameless, ${height}, fixing to suit the holes you drill`, qty: count, unit: "each" };
    if (plate === 0) return { item: HARDWARE.plate.item, sku: HARDWARE.plate[s.catalog], qty: count, unit: "each" };
    return { item: `Blum CLIP mounting plate, frameless, ${height}, system screws`, qty: count, unit: "each" };
  };
  /**
   * The plate height an overlay door's hinges go on (mm), as the Overlay row works it out
   * (overlayText): 0 when the overlay is matched on a 0 mm plate, the hinge's reach is the limit
   * (worked out on a 0 mm plate), a boring distance on a 0 mm plate matches it, or the side screw
   * takes up the rest; the thinnest plate that matches with a boring distance otherwise; null when
   * none does.
   */
  const overlayPlate = () => {
    const want = t - g / 2;
    const reach = (OVERLAY.base + OVERLAY.side) * MM + s.cupDistance;
    if (s.hardware && want > reach + 1e-9) return 0;
    const got = OVERLAY.base * MM + s.cupDistance;
    if (Math.abs(want - got) <= 0.5 * MM || Math.abs(want - got) <= OVERLAY.side * MM + 1e-9) return 0;
    const way = OVERLAY.plates.find((h) => want / MM - OVERLAY.base + h >= CUP.minK - 1e-9 && want / MM - OVERLAY.base + h <= CUP.maxK + 1e-9);
    return way ?? null;
  };
  /**
   * A pull and its two screws, on the front it goes through. Named by hole spacing and the
   * front's thickness (the screw's length depends on it); no part numbers.
   * @param {boolean} has @param {number} spacing @param {number} thick @returns {BomItem[]}
   */
  const pullBom = (has, spacing, thick) =>
    has
      ? [
          { item: `Pull, ${both(spacing)} hole centres`, qty: 1, unit: "each" },
          { item: `Pull screw, through a ${both(thick)} front`, qty: 2, unit: "each" },
        ]
      : [];

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

  /** A rail's name as the text says it. @param {string} name */
  const railWord = (name) => (name === "Bottom" ? "bottom" : name === "Top" ? (s.top === "stretchers" ? "front stretcher" : "top") : name.replace(/^Shelf/, "fixed shelf"));
  /**
   * What of the carcass stands behind a pull hole in an overlay front (a side, the bottom, the
   * top or a stretcher, a fixed shelf), where its screw head would land: null, or what it is and
   * where the pull must go instead. The front is `fw` x `fh` at (fx0, fz0); the hole at (x, z) on it.
   * @param {string} front @param {number} fx0 @param {number} fz0 @param {number} fw @param {number} fh @param {number} x @param {number} z
   */
  const pullBehind = (front, fx0, fz0, fw, fh, x, z) => {
    if (!overlay) return null;
    const wx = fx0 + x;
    const wz = fz0 + z;
    for (const [a, b, what] of /** @type {[number, number, string][]} */ ([[0, t, "left side"], [s.width - t, s.width, "right side"]])) {
      if (!(wx + PULL_HEAD > a + 1e-9 && wx - PULL_HEAD < b - 1e-9)) continue;
      const left = a < s.width / 2;
      return `its screw head would land on the ${what}'s front edge behind the ${front}: keep the pull holes at least ${atLeast(left ? b - fx0 + PULL_HEAD : fx0 + fw - a + PULL_HEAD)} from the ${front}'s ${left ? "left" : "right"} edge`;
    }
    for (const rl of rails) {
      const a = rl.z;
      const b = rl.z + t;
      if (!(wz + PULL_HEAD > a + 1e-9 && wz - PULL_HEAD < b - 1e-9)) continue;
      const what = `the ${railWord(rl.name)}'s front edge behind the ${front}`;
      if (a <= fz0 + 1e-9) return `its screw head would land on ${what}: keep the pull holes at least ${atLeast(b - fz0 + PULL_HEAD)} from the ${front}'s bottom edge`;
      if (b >= fz0 + fh - 1e-9) return `its screw head would land on ${what}: keep the pull holes at least ${atLeast(fz0 + fh - a + PULL_HEAD)} from the ${front}'s top edge`;
      return `its screw head would land on ${what}: keep the pull holes off the band ${both(a - fz0 - PULL_HEAD)} to ${both(b - fz0 + PULL_HEAD)} up the ${front}`;
    }
    return null;
  };
  /** The hinge plates' centre heights on either side, inset or overlay: no loose shelf rests on one. */
  /** @type {number[]} */
  const hingeAt = [];

  const doorBand = bands.find((x) => x.kind === "door");
  if (doorBand) {
    const fb0 = frontBox(bands.indexOf(doorBand), t);
    // An overlay door covers the side but half a gap, as far as its hinges reach: Blum's 11 + the
    // boring distance on a 0 mm plate, and the side screw's 2 mm. Past that (thick sides) the door
    // covers what the hinge reaches, and both its outer edges stay in line with the hinge edge.
    const reach = (OVERLAY.base + OVERLAY.side) * MM + s.cupDistance;
    const capped = overlay && s.hardware && t - g / 2 > reach + 1e-9;
    const fb = capped ? { ...fb0, x0: t - reach, x1: s.width - t + reach } : fb0;
    const across = fb.x1 - fb.x0;
    const pair = s.doors === "two" || (s.doors === "auto" && across > MAX_DOOR);
    const leaves = pair ? [{ hinge: "left", x0: fb.x0, x1: fb.x0 + (across - g) / 2 }, { hinge: "right", x0: fb.x1 - (across - g) / 2, x1: fb.x1 }] : [{ hinge: s.hingeSide, x0: fb.x0, x1: fb.x1 }];
    const fh = fb.z1 - fb.z0;
    // Hinges by height, as before (at or above Blum's US chart: 2 to about 940 mm, 3 to 1650,
    // 4 to 2210), and never fewer than Blum's weight bands ask for (2 under 15 lb, 3 to 30, 4 to
    // 45, 5 to 60). Blum's European chart adds one on a door wider than 600 mm ("Load and height
    // data relates to front widths of 600 mm"); Blum Inc.'s does not, and asks instead for the
    // top and bottom hinges to be farther apart than the door is wide. Weight is the plywood's,
    // at 600 kg/m3, plus a pull.
    // With Blum Europe's catalogue the European chart's height bands apply too, and the larger
    // count wins: 2 hinges to about 750 mm, 3 to 1500, 4 to 2100 (catalogue 2024/2025 p. 75,
    // 2027/2028 p. 69). Blum draws those bands as a chart without printed numbers, so they are
    // read from it; taking the larger count means a misread can only add a hinge, never leave
    // one out.
    const usHeight = fh <= 900 * MM ? 2 : fh <= 1600 * MM ? 3 : fh <= 2000 * MM ? 4 : 5;
    const euHeight = fh <= 750 * MM ? 2 : fh <= 1500 * MM ? 3 : fh <= 2100 * MM ? 4 : 5;
    const byHeight = s.catalog === "eu" ? Math.max(usHeight, euHeight) : usHeight;
    const r = (CUP.dia * MM) / 2;
    const cupCenter = CUP.radius * MM + s.cupDistance;
    for (const leaf of leaves) {
      const fw = leaf.x1 - leaf.x0;
      if (!(fw > 2 * t) || !(fh > 2 * t)) throw new Error("The door has no room once the gaps are taken off.");
      if (fw > MAX_LEAF + 1e-9) throw new Error(`A door ${both(fw)} wide sags on its hinges: at most ${metric ? "914 mm" : "36 in"}. ${pair ? "Make the cabinet narrower, or two cabinets." : "Choose Double doors, or make the cabinet narrower."}`);
      const kg = fw * fh * t * 600 + 0.3;
      const byWeight = kg <= 6.8 ? 2 : kg <= 13.6 ? 3 : kg <= 20.4 ? 4 : kg <= 27.2 ? 5 : 0;
      if (!byWeight) throw new Error(`The door weighs about ${Math.round(kg)} kg, more than Blum's chart takes on CLIP top hinges (27 kg on five): make it two doors.`);
      const wide = s.catalog === "eu" && fw > 600 * MM;
      const count = Math.max(byHeight, byWeight) + (wide ? 1 : 0);
      const size = /** @type {V3} */ ([fw, t, fh]);
      const name = pair ? (leaf.hinge === "left" ? "Left door" : "Right door") : "Door";
      /** @type {Hole[]} */
      const holes = [];
      /** @type {[number, number][]} */
      const cups = [];
      if (s.hardware) {
        // The typed inset, or refused: two cups need their own width and 6 mm between them.
        const most = (fh - CUP.dia * MM - 6 * MM) / 2;
        if (!(most > r + 2 * MM)) throw new Error(`${name}: at ${both(fh)} tall the door is too short for two hinge cups. Make it taller, or turn hardware holes off.`);
        if (s.hingeInset > most + 1e-9) throw new Error(`${name}: a hinge inset of ${both(s.hingeInset)} leaves no room for two hinge cups on a door ${both(fh)} tall: make it at most ${atMost(most)}.`);
        if (!(s.hingeInset > r + 2 * MM)) throw new Error(`${name}: the hinge inset must be at least ${atLeast(r + 2 * MM + 0.05 * MM)}, or the cup runs off the door's end.`);
        const inset = s.hingeInset;
        const zs = Array.from({ length: count }, (_, k) => inset + ((fh - 2 * inset) * k) / (count - 1));
        const cx = leaf.hinge === "left" ? cupCenter : fw - cupCenter;
        const which = leaf.hinge === "left" ? "left" : "right";
        const inner = which === "left" ? t : 0;
        const prisms = sidePrisms(inner);
        /**
         * What keeps a cup at cz (door coordinates) from going there, or null. Its plate (inset or
         * overlay: it is on the side either way) never sits across a rail: the bottom, the top or a
         * stretcher, a fixed shelf. An overlay plate's two holes, drilled here, keep their wood to
         * every cut in the side. (Nailers are at the rear, clear of a plate.)
         * @param {number} cz
         */
        const blocker = (cz) => {
          const zc = fb.z0 + cz;
          const rl = rails.find((x) => !(zc + PLATE_HALF <= x.z - s.fit || zc - PLATE_HALF >= x.z + t + s.fit));
          if (rl) return `the ${railWord(rl.name)}`;
          const hole = (/** @type {number} */ d) => ({ axis: /** @type {0} */ (0), at: inner, inward: /** @type {1 | -1} */ (which === "left" ? -1 : 1), center: /** @type {[number, number]} */ ([CUP.plateSetback * MM, zc + (d * CUP.plateSpacing * MM) / 2]), radius: (PLATE_HOLE.dia * MM) / 2, depth: PLATE_HOLE.depth * MM });
          if (overlay && ![-1, 1].every((d) => holeClear(sideSize, prisms, hole(d)))) return "a cut in the side";
          return null;
        };
        const inDoor = (/** @type {number} */ z) => z - r >= WEB && z + r <= fh - WEB;
        const apart = (/** @type {number} */ z) => cups.every(([, p]) => Math.abs(p - z) >= CUP.dia * MM + 6 * MM);
        for (const want of zs) {
          // A plate that lands on a rail slides along the door, the least it must, and stays
          // clear of the door's edges and the other cups.
          let cz = NaN;
          for (let step = 0; step <= 150 && Number.isNaN(cz); step++) {
            for (const sign of step ? [1, -1] : [1]) {
              const z = want + sign * step * MM;
              if (inDoor(z) && apart(z) && !blocker(z)) {
                cz = z;
                break;
              }
            }
          }
          if (Number.isNaN(cz)) throw new Error(`${name}: no place for a hinge whose mounting plate clears ${blocker(want) ?? "the other hinges"}. Change the hinge inset or the shelf count, or turn hardware holes off.`);
          cups.push([cx, cz]);
          const why = blocker(want) ?? (!inDoor(want) ? "the door's end" : "the next hinge");
          const moved = Math.abs(cz - want) > 1e-6 ? ` (moved ${Math.round((cz - want) / MM)} mm to clear ${why})` : "";
          // The cup is in the back face (y = t), the face against the cabinet.
          holes.push(placeHole(name, size, [], { axis: 1, at: t, inward: -1, center: [cx, cz], radius: r, depth: CUP.depth * MM }, "hinge cup"));
          note(name, `Hinge cup, ${both(cz)} up, centre ${both(cupCenter)} from the hinge edge, back face${moved}`, `${CUP.dia} mm`, `${CUP.depth} mm`, "CNC");
          hingeAt.push(fb.z0 + cz);
          if (overlay) {
            for (const dz of [-CUP.plateSpacing / 2, CUP.plateSpacing / 2]) sideHole(which, CUP.plateSetback * MM, fb.z0 + cz + dz * MM, "hinge plate hole", undefined, PLATE_HOLE);
            plates[which].push(fb.z0 + cz);
            note(which === "left" ? "Left side" : "Right side", `Hinge plate, 2 holes ${CUP.plateSpacing} mm apart, ${CUP.plateSetback} mm from front, centred ${both(fb.z0 + cz)} up`, `${PLATE_HOLE.dia} mm`, `${PLATE_HOLE.depth} mm`, "CNC");
          }
        }
        if (leaf === leaves[0]) {
          const why = [`${both(fh)} tall`, `about ${Math.round(kg * 10) / 10} kg`, ...(wide ? ["over 600 mm wide: one more"] : [])].join(", ");
          note(name, `${count} hinges (${why}; Blum's chart by height and weight)`, "-", "-", "Hardware");
          const spread = cups[cups.length - 1][1] - cups[0][1];
          if (spread < fw) note(name, `The top and bottom hinges are ${both(spread)} apart, less than the door is wide (${both(fw)}): Blum asks for more. Pull the hinges toward the ends, or make two doors.`, "-", "-", "Check");
        }
        if (!overlay) note(name, "Hinge mounting plates (inset)", "-", "-", "Not drilled: inset plate position depends on the hinge, see Blum's inset tables");
        else if (leaf === leaves[0]) note("Doors", overlayText(), "-", "-", "Hardware");

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
            const hit = pullBehind("door", leaf.x0, fb.z0, fw, fh, x, z);
            if (hit) throw new Error(`${name}: a pull hole is ${both(s.doorPull === "vertical" || x === ox(s.doorPullEdge) ? s.doorPullEdge : s.doorPullEdge + s.doorPullSpacing)} from the opening edge and ${both(s.doorPullFrom === "top" ? fh - z : z)} from the ${s.doorPullFrom}, and ${hit}.`);
          }
          note(name, `Pull, 2 holes ${both(s.doorPullSpacing)} apart, ${s.doorPull}, the nearer ${both(s.doorPullEnd)} from the ${s.doorPullFrom} and ${both(s.doorPullEdge)} from the opening edge`, fmtMm(s.pullHole), "through", "CNC");
        }
      }
      add(name, MATERIALS.doors.name, size, [], holes, { at: [leaf.x0, fb.y, fb.z0], name }, [...hingeBom(count), ...pullBom(s.doorPull !== "none", s.doorPullSpacing, t)], edgesIn(bandFronts, FRONT_EDGES));
    }

    /**
     * The overlay row: what the door covers of the side, and how the hinge gets there with the
     * boring distance and a frameless plate (0, 3, 6 or 9 mm; overlay = 11 + boring distance -
     * plate), within the side screw's 2 mm. Advice is only what can be done.
     */
    function overlayText() {
      const want = t - g / 2;
      const cover = capped ? reach : want;
      const k = s.cupDistance / MM;
      const got = (OVERLAY.base + k) * MM;
      const head = `Overlay: ${capped ? `the side is ${both(t)}; this door covers ${both(cover)} of it, the most a CLIP top 110 reaches bored ${Math.round(k * 10) / 10} mm from the edge (11 + ${Math.round(k * 10) / 10} on a 0 mm plate, and 2 mm on the side screw), so ${both(want - cover)} more of the side's edge shows than half the gap${s.layout === "mixed" ? "; the drawer fronts, which have no hinge, cover the side but half the gap" : ""}` : `this door covers ${both(want)} of the side; a 0 mm plate with this boring distance gives ${fmtMm(got)} (Blum: 11 + boring distance)`}.`;
      if (capped) {
        const bore = Math.min(CUP.maxK, Math.ceil(((want - (OVERLAY.base + OVERLAY.side) * MM) / MM) * 2) / 2);
        return `${head}${bore > k ? ` Bore at ${bore} mm to cover ${both(Math.min(want, (OVERLAY.base + OVERLAY.side + bore) * MM))}.` : ""} Set the side screw to its full 2 mm.`;
      }
      if (Math.abs(want - got) <= 0.5 * MM) return `${head} Matched.`;
      // The ways to match: a boring distance (3 to 7) on a frameless plate, the thinnest first.
      const ways = OVERLAY.plates.map((h) => ({ h, b: want / MM - OVERLAY.base + h })).filter((w) => w.b >= CUP.minK - 1e-9 && w.b <= CUP.maxK + 1e-9);
      const best = ways[0];
      const bore = best ? `Bore at ${Math.round(best.b * 10) / 10} mm${best.h ? ` on a ${best.h} mm plate` : ""} to match` : "";
      const off = Math.abs(want - got);
      const screw = off <= OVERLAY.side * MM + 1e-9 ? `take up ${fmtMm(off)} with the hinge's side screw` : "";
      if (bore && screw) return `${head} ${bore}, or ${screw}.`;
      if (bore) return `${head} ${bore}.`;
      if (screw) return `${head} ${screw[0].toUpperCase()}${screw.slice(1)}.`;
      return `${head} No boring distance and plate reach it: change the gap or the stock.`;
    }
  }

  // --- drawers -------------------------------------------------------------------------------
  const drawerBands = bands.filter((x) => x.kind === "drawer");
  /** @type {RunnerLength | null} */
  let runner = null;
  /** @type {BinRoom | null} */
  let room = null;
  if (drawerBands.length) {
    const R = runnerLine(s);
    const ds = s.drawerThickness;
    const tf = s.frontThickness;
    if (!(ds >= R.minSide * MM - 1e-9 && ds <= R.maxSide * MM + 1e-9)) throw new Error(`${R.name} takes drawer sides ${R.sides} thick.`);
    const inside = innerW - BLUM.insideDeduct * MM;
    if (!(inside >= BLUM.minInside * MM)) throw new Error(`The drawers are too narrow: Blum locking devices need an inside drawer width of at least ${BLUM.minInside} mm (6-11/16 in).`);
    const outside = inside + 2 * ds;
    // With no back, the drawers stop in front of the nailers.
    const avail = (innerD - (overlay ? 0 : tf) - (!s.back && nailers.length ? t : 0)) / MM;
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
    // The box's length: the runner's (US), or 10 mm less (Europe).
    const nl = (rl.nl - R.boxShort) * MM;
    const shift = R.thinShift && ds <= 13.5 * MM ? R.thinShift : 0;
    const gd = Math.min(ds / 2, 0.25 * IN);
    const recess = BLUM.bottomRecess * MM;
    /** The bottom's groove, up from the bottom of the box. */
    const gz = /** @type {[number, number]} */ ([recess, recess + bT + s.fit]);
    note("Drawer", `${R.name} ${rl.part}, ${rl.nl} mm${s.catalog === "us" ? ` (${(rl.nl / 25.4).toFixed(0)} in)` : ""} runners; the box is ${mm(nl)} mm long`, "-", "-", "Hardware");
    note("Drawer", R.lock, "-", "-", "Hand");
    // Each drawer's runners, locking devices and their screws ride on its front (one front per
    // drawer); the drilling template and tool set are bought once for the shop.
    const lockPart = R.lock.match(/^T\d+\.\d+(?:\.\d+)?/)?.[0] ?? "";
    const drilled = s.hardware && overlay;
    const us = s.catalog === "us";
    const holes = 2 * rl.screws.length;
    // A trash pull-out's bins ride on its front, in words: BINS has the sizes from each maker's
    // drawing, not an order number.
    const binSpec = s.bin === "custom" ? null : BINS[s.bin];
    /** @type {BomItem[]} */
    const binBom =
      s.layout !== "trash"
        ? []
        : [
            {
              item: binSpec ? `Waste bin, ${binSpec.label}: rim ${binSpec.rim[0]} x ${binSpec.rim[1]} in, ${binSpec.height} in tall` : `Waste bin hung by its rim in a ${both(s.binWidth)} x ${both(s.binLength)} cutout (as measured)`,
              qty: s.trashBins === "one" ? 1 : 2,
              unit: "each",
            },
          ];
    /** @type {BomItem[]} */
    const drawerBom = [
      { item: `${R.name} runners, ${rl.nl} mm${us ? ` (${(rl.nl / 25.4).toFixed(0)} in)` : ""}, left and right`, sku: rl.part, qty: 1, unit: "pair" },
      // Blum Inc. numbers the right and left devices; Blum Europe orders one number left and right.
      ...(us
        ? /** @type {BomItem[]} */ ([
            { item: `${R.name} locking device, right`, sku: `${lockPart} R`, qty: 1, unit: "each" },
            { item: `${R.name} locking device, left`, sku: `${lockPart} L`, qty: 1, unit: "each" },
            { item: HARDWARE.lockScrewUs.item, sku: HARDWARE.lockScrewUs.sku, qty: 4, unit: "each" },
          ])
        : /** @type {BomItem[]} */ ([
            { item: `${R.name} locking devices, left and right (order one of each)`, sku: lockPart, qty: 1, unit: "pair" },
            { item: "Locking-device screws for a left and a right device, as Blum's instructions give", qty: 1, unit: "pair" },
          ])),
      drilled
        ? us
          ? { item: HARDWARE.runnerScrewUs.item, sku: HARDWARE.runnerScrewUs.sku, qty: holes, unit: "each" }
          : { item: "Runner screw for a drilled 5 mm System 32 hole, as Blum's instructions give", qty: holes, unit: "each" }
        : { item: "Runner screws for a pair of runners, as Blum's instructions give", qty: 1, unit: "pair" },
      ...HARDWARE.templates[s.catalog].map((x) => /** @type {BomItem} */ ({ item: x.item, sku: x.sku, qty: 1, unit: "each", once: true })),
    ];
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
        for (const y of rl.screws) {
          for (const which of /** @type {const} */ (["left", "right"])) sideHole(which, (y - shift) * MM, zs, `drawer ${n} runner screw`);
        }
        note("Left and right sides", `Drawer ${n} runner screws at ${rl.screws.map((y) => y - shift).join(", ")} mm from front, ${R.screwHeight} mm above the opening${R.extra ? `. ${R.extra}` : ""}`, `${SYS.dia} mm`, `${SYS.depth} mm`, "CNC");
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
          const hit = pullBehind("drawer front", fb.x0, fb.z0, fw, fh, cx, z);
          if (hit) throw new Error(`Drawer ${n}: a pull hole is ${both(fh - z)} from the top of its front and ${both(Math.min(cx, fw - cx))} from its end, and ${hit}.`);
        }
        note("Drawer front", `Pull, 2 holes ${both(s.pullSpacing)} apart, ${s.drawerPull === "center" ? "centred" : `${both(s.drawerPullFromTop)} down from the top`}`, fmtMm(s.pullHole), "through", "CNC");
      }
      add("Drawer front", MATERIALS.drawerFronts.name, fSize, fPrisms, fHoles, { at: [fb.x0, fb.y, fb.z0], name: `Drawer ${n} front` }, [...drawerBom, ...binBom, ...pullBom(s.drawerPull === "center" || s.drawerPull === "top", s.pullSpacing, tf)], edgesIn(bandFronts, FRONT_EDGES));

      // Box: sides run the full length; the sub-front and back sit between them. The bottom
      // slides in under the back, in grooves in the sides and the sub-front.
      /** @param {number} inner */
      const groove = (inner) => /** @type {Prism} */ ({ min: [inner === 0 ? 0 : ds - gd, 0, gz[0]], max: [inner === 0 ? gd : ds, nl, gz[1]] });
      // A trash pull-out: low sides (a tray), the sub-front and back full height as uprights,
      // and a frame between them, at the bins' lip, with a cutout for each bin.
      const trash = s.layout === "trash";
      const sideH = trash ? Math.min(boxH, s.trayHeight) : boxH;
      if (trash && !(sideH >= 60 * MM)) throw new Error("The trash tray's sides must be at least 60 mm (2 3/8 in) tall for the runners' hooks.");
      const dSize = /** @type {V3} */ ([ds, nl, sideH]);
      add("Drawer side", MATERIALS.box.name, dSize, [groove(ds)], [], { at: [x0, y0, z0], name: `Drawer ${n} left` });
      add("Drawer side", MATERIALS.box.name, dSize, [groove(0)], [], { at: [x0 + outside - ds, y0, z0], name: `Drawer ${n} right` });

      /** @type {Prism[]} */
      const subFrame = [];
      /** @type {Prism[]} */
      const backFrame = [];
      if (trash) {
        // The bin: one of Rev-A-Shelf's (its drawing's opening and heights), or measured.
        const spec = s.bin === "custom" ? null : BINS[s.bin];
        const frameTop = spec ? (spec.height - spec.drop) * IN + BIN_FLOOR : s.binHeight;
        const fz1 = gz[1] + frameTop;
        const fz0 = fz1 - ds;
        if (!(fz1 + s.fit / 2 + 10 * MM <= boxH)) throw new Error(`The bins do not fit in height: their frame's top is ${both(frameTop)} above the tray floor, and the pull-out is ${both(boxH - gz[1] - 10 * MM)} tall inside. Make the cabinet taller or pick a shorter bin.`);
        if (spec && !(z0 + fz1 + spec.drop * IN + 3 * MM <= ceiling)) throw new Error(`The bins' rims would reach the cabinet's top: pick a shorter bin.`);
        subFrame.push({ min: [0, ds - gd, fz0 - s.fit / 2], max: [inside, ds, fz1 + s.fit / 2] });
        // At the back the frame's tongue goes through a slot, not into a dado: the back's rear
        // face has the hook holes, and a dado in its front face would need a second setup. The
        // slot runs a bit diameter past the tongue at each end, so its round ends clear it.
        const margin = 1 * IN;
        if (!(inside - 2 * margin > 2 * IN)) throw new Error("The pull-out is too narrow for its bin frame.");
        backFrame.push({ min: [margin - s.bit, 0, fz0 - s.fit / 2 - gz[1]], max: [inside - margin + s.bit, ds, fz1 + s.fit / 2 - gz[1]] });
        // Frame coordinates: y from the bottom of the sub-front's dado. It spans the opening
        // and runs through the back to its rear face, a tongue between corner notches.
        const open0 = gd - PANEL_GAP;
        const span = nl - 2 * ds;
        const fl = open0 + span + ds;
        const webMin = 0.75 * IN;
        /**
         * The cutouts laid out one way: `turn` puts a bin's long side front to back. Two bins
         * keep enough wood between them that their rims do not meet (1/8 in apart), and every
         * cutout keeps 3/4 in to the frame's edges.
         * @param {boolean} turn
         */
        const layout = (turn) => {
          /** @param {[number, number]} v @returns {[number, number]} */
          const along = (v) => (turn ? [v[1], v[0]] : v);
          const [W, L] = spec ? along(spec.cut).map((v) => v * IN + 2 * CUT_CLEAR) : [s.binWidth, s.binLength];
          const [rimW, rimL] = spec ? along(spec.rim).map((v) => v * IN) : [W, L];
          const middleX = Math.max(webMin, rimW - W + (1 / 8) * IN, (inside - 2 * W) / 3);
          const middleY = Math.max(webMin, rimL - L + (1 / 8) * IN, (span - 2 * L) / 3);
          const edgeX = s.trashBins === "side" ? (inside - 2 * W - middleX) / 2 : (inside - W) / 2;
          const edgeY = s.trashBins === "deep" ? (span - 2 * L - middleY) / 2 : (span - L) / 2;
          return { turn, W, L, cut: spec ? along(spec.cut) : null, middleX, middleY, edgeX, edgeY, fits: edgeX >= webMin - 1e-9 && edgeY >= webMin - 1e-9 };
        };
        // Side by side, bins go long side front to back first; one, or front to back, across.
        // A bin is turned the other way when that is what fits.
        const first = layout(s.trashBins === "side" && !!spec);
        const lay = first.fits || !spec ? first : layout(!first.turn).fits ? layout(!first.turn) : first;
        const { W, L, middleX, middleY, edgeX, edgeY } = lay;
        const mid = open0 + span / 2;
        /** @type {[number, number][]} */
        const centres =
          s.trashBins === "one"
            ? [[inside / 2, mid]]
            : s.trashBins === "side"
              ? [[edgeX + W / 2, mid], [edgeX + W + middleX + W / 2, mid]]
              : [[inside / 2, open0 + edgeY + L / 2], [inside / 2, open0 + edgeY + L + middleY + L / 2]];
        room = {
          across: s.trashBins === "side" ? (inside - 3 * webMin) / 2 : inside - 2 * webMin,
          deep: s.trashBins === "deep" ? (span - 3 * webMin) / 2 : span - 2 * webMin,
        };
        if (!lay.fits) {
          throw new Error(spec
            ? `${s.trashBins === "one" ? `A ${spec.label} bin does` : `Two ${spec.label} bins do`} not fit${s.trashBins === "one" ? "" : s.trashBins === "side" ? " side by side" : " front to back"}, either way round: the frame is ${both(inside)} across and ${both(span)} front to back between the box's uprights, and each rim (${spec.rim[0]} x ${spec.rim[1]} in) needs wood all round. ${s.trashBins === "deep" ? "Two bins front to back need a deeper box than a 533 mm (21 in) runner gives: try them side by side in a wider cabinet, or one bin." : "Pick a smaller bin, one bin, or a wider cabinet."}`
            : `The bins do not fit: each cutout can be at most ${both(room.across)} side to side and ${both(room.deep)} front to back here (3/4 in of wood round each). Change the bins or the cabinet.`);
        }
        const yBack = open0 + span;
        /** @type {Prism[]} */
        const prisms = [
          ...centres.map(([cx, cy]) => /** @type {Prism} */ ({ min: [cx - W / 2, cy - L / 2, 0], max: [cx + W / 2, cy + L / 2, ds] })),
          { min: [0, yBack, 0], max: [margin, fl, ds] },
          { min: [inside - margin, yBack, 0], max: [inside, fl, ds] },
        ];
        add("Bin frame", MATERIALS.box.name, [inside, fl, ds], prisms, [], { at: [x0 + ds, y0 + ds - gd + PANEL_GAP, z0 + fz0], name: `Drawer ${n} bin frame` });
        const which = spec && lay.cut ? ` for ${spec.label} bins, long side ${lay.turn ? "front to back" : "across"} (the drawing's minimum opening ${lay.cut.join(" x ")} in, plus 1/32 in each side)` : "";
        note("Bin frame", `${centres.length} bin cutout${centres.length === 1 ? "" : "s"} ${both(W)} x ${both(L)}${which}; the frame's top ${both(frameTop)} above the tray floor${spec ? ` (the rim sits ${spec.drop} in above it, the bin 1/4 in off the floor)` : ""}: in a dado in the sub-front, its tongue through a slot in the back (so the back is cut from one face)`, "-", "through", "CNC (inside profile)");
      }
      add("Drawer sub-front", MATERIALS.box.name, [inside, ds, boxH], [{ min: [0, ds - gd, gz[0]], max: [inside, ds, gz[1]] }, ...subFrame, ...subNotch], [], { at: [x0 + ds, y0, z0], name: `Drawer ${n} sub-front` });
      const backH = boxH - gz[1];
      /** @type {Hole[]} */
      const hooks = [];
      if (s.hardware) {
        // The runners' rear hooks: in the back's rear face, 7 mm from each end (the sides' inside
        // faces), 24 mm above the bottom of the box. The back sits on the bottom, so the hole is
        // just above the back's bottom edge: a thick bottom leaves no wood under it.
        const hr = (BLUM.hookDia * MM) / 2;
        const hz = BLUM.hookUp * MM - gz[1];
        if (!(hz - hr >= 1 * MM)) throw new Error(`Drawer ${n}: Blum's rear hook hole is ${BLUM.hookUp} mm up, and the back sits on a ${both(bT)} bottom, so the hole would break out of the back's bottom edge. Use a bottom 6 mm (1/4 in) or thinner, or turn hardware holes off.`);
        if (!(BLUM.hookDepth * MM <= ds - 1 * MM + 1e-9)) throw new Error(`Drawer ${n}: Blum's rear hook hole is ${BLUM.hookDepth} mm deep, too deep for a ${both(ds)} back.`);
        for (const hx of [BLUM.hookIn * MM, inside - BLUM.hookIn * MM]) hooks.push({ axis: 1, at: ds, inward: -1, center: [hx, hz], radius: hr, depth: BLUM.hookDepth * MM });
        if (i === 0) note("Drawer back", `Runner rear hook holes, rear face, ${BLUM.hookIn} mm in from each end (the sides' inside faces), ${BLUM.hookUp} mm above the bottom of the box: thin wood, ${both(hz - hr)} under each and ${both(ds - BLUM.hookDepth * MM)} at its floor`, `${BLUM.hookDia} mm`, `${BLUM.hookDepth} mm`, "CNC");
      }
      add("Drawer back", MATERIALS.box.name, [inside, ds, backH], backFrame, hooks, { at: [x0 + ds, y0 + nl - ds, z0 + gz[1]], name: `Drawer ${n} back` });

      const bw = inside + 2 * (gd - PANEL_GAP);
      const bl = nl - ds + gd - PANEL_GAP;
      add("Drawer bottom", MATERIALS.back.name, [bw, bl, bT], [], [], { at: [x0 + ds - gd + PANEL_GAP, y0 + ds - gd + PANEL_GAP, z0 + recess + s.fit / 2], name: `Drawer ${n} bottom` });
    });
  }

  // --- shelf pins ------------------------------------------------------------------------------
  /** Where each loose shelf rests: the bottom of the shelf. */
  /** @type {number[]} */
  const rests = [];
  if (!fixedShelves && shelfZs.length) {
    // System 32: a row 37 mm from the front, and one at the rear on the same 32 mm grid, 37 mm
    // or more in front of the back. The grid runs the shelves' space at a 32 mm pitch, centred;
    // holes are drilled in a band around each shelf's place (two each way, +-64 mm), as shops
    // do, and any that would meet a hinge plate, a runner screw, a dado or a groove are left
    // out.
    const door = bands.find((x) => x.kind === "door");
    const z0 = s.layout === "mixed" && door ? door.z0 : floor;
    const z1 = s.layout === "mixed" && door ? door.z1 : ceiling;
    const pitch = PIN.pitch * MM;
    const front = PIN.setback * MM;
    const rear = front + Math.floor((shelfDepth - 2 * front) / pitch + 1e-9) * pitch;
    const ys = rear > front ? [front, rear] : [front];
    const r = (PIN.dia * MM) / 2;
    const full = s.lineBoring === "full";
    /** @type {number[]} */
    let pinZs;
    if (full) {
      // Full height on Blum Process 32's grid (LINE_BORE): 46.5 mm above the bottom of the box,
      // then every 32 mm to the highest at least 56.5 mm below the top; of those, every one in the
      // shelves' space that keeps 3 mm of wood to the rails' faces.
      pinZs = [];
      const lowest = kick + LINE_BORE.bottom * MM;
      const holes = Math.floor((s.height - LINE_BORE.top * MM - lowest) / pitch + 1e-9) + 1;
      for (let k = 0; k < holes; k++) {
        const z = lowest + k * pitch;
        if (z - r - WEB >= z0 - 1e-9 && z + r + WEB <= z1 + 1e-9) pinZs.push(z);
      }
      if (!pinZs.length) throw new Error("The space for adjustable shelves is too short for pin holes: use fixed shelves, or none.");
    } else {
      const count = Math.floor((z1 - z0 - 2 * PIN_END) / pitch + 1e-9) + 1;
      if (count < 1) throw new Error("The space for adjustable shelves is too short for pin holes: use fixed shelves, or none.");
      /** @type {number[]} */
      const grid = [];
      for (let k = 0; k < count; k++) grid.push((z0 + z1) / 2 + (k - (count - 1) / 2) * pitch);
      const nearest = (/** @type {number} */ z) => grid.reduce((a, b, k) => (Math.abs(b - z) < Math.abs(grid[a] - z) ? k : a), 0);
      const keep = new Set(shelfZs.flatMap((z) => Array.from({ length: 2 * PIN_REACH + 1 }, (_, j) => nearest(z) - PIN_REACH + j)).filter((k) => k >= 0 && k < count));
      pinZs = [...keep].sort((a, b) => a - b).map((k) => grid[k]);
    }
    /** The pin heights with every one of their holes drilled, in both sides. */
    const whole = new Map(pinZs.map((z) => [z, 0]));
    let made = 0;
    let missed = 0;
    for (const which of /** @type {const} */ (["left", "right"])) {
      const inner = which === "left" ? t : 0;
      const prisms = sidePrisms(inner);
      for (const y of ys) {
        for (const z of pinZs) {
          // Eight sides: the DXF draws a true circle from the ring's centre and radius either way,
          // and the kernel takes many holes in one face far faster with fewer edges.
          const h = /** @type {Hole} */ ({ axis: 0, at: inner, inward: which === "left" ? -1 : 1, center: [y, z], radius: r, depth: PIN.depth * MM, sides: 8 });
          const underPlate = y === front && plates[which].some((pz) => Math.abs(pz - z) < PLATE_HALF + r);
          if (underPlate || sideHoles[which].some((o) => Math.hypot(o.center[0] - y, o.center[1] - z) < o.radius + r + WEB) || !holeClear(sideSize, prisms, h)) {
            missed++;
            continue;
          }
          sideHoles[which].push(h);
          sideWhat[which].push("shelf pin hole");
          whole.set(z, /** @type {number} */ (whole.get(z)) + 1);
          made++;
        }
      }
    }
    // Each loose shelf rests on the pin height nearest its place that has all its holes, keeps the
    // shelf off every hinge plate (inset or overlay: the plate is on the side either way) and
    // above the shelf under it. None near: refused, never a shelf on three pins or in a hinge.
    let below = -Infinity;
    shelfZs.forEach((z, i) => {
      let best = NaN;
      for (const pz of pinZs) {
        const z0 = pz + r;
        if (whole.get(pz) !== 2 * ys.length || z0 < below - 1e-9) continue;
        if (hingeAt.some((hz) => z0 < hz + PLATE_HALF && z0 + t > hz - PLATE_HALF)) continue;
        if (Number.isNaN(best) || Math.abs(pz - z) < Math.abs(best - z)) best = pz;
      }
      if (Number.isNaN(best)) throw new Error(`Shelf ${i + 1}: no pin height near its place has all its pins, clear of the hinge plates${i ? " and above the shelf under it" : ""}. Use fewer shelves, fixed shelves, or change the hinge inset.`);
      rests.push(best + r);
      below = best + r + t;
    });
    const span = full ? `the full height, the lowest ${LINE_BORE.bottom} mm above the bottom of the box and none nearer the top than ${LINE_BORE.top} mm (Blum Process 32's rule)` : `${2 * PIN_REACH + 1} around each shelf`;
    note("Sides", `Shelf pin holes, ${ys.length === 2 ? `rows ${mm(front)} and ${mm(rear)} mm` : `a row ${mm(front)} mm`} from the front, ${span}, ${PIN.pitch} mm apart: ${made}${missed ? ` (${missed} left out where a hinge plate, runner or joint is)` : ""}`, `${PIN.dia} mm`, `${PIN.depth} mm`, "CNC");
  }

  // --- carcass parts ---------------------------------------------------------------------------
  add("Left side", MATERIALS.carcass.name, sideSize, sidePrisms(t), sideHoles.left, { at: [0, 0, 0], name: "Left side" }, [], edgesIn(bandCarcass, ["front"]));
  add("Right side", MATERIALS.carcass.name, sideSize, sidePrisms(0), sideHoles.right, { at: [s.width - t, 0, 0], name: "Right side" }, [], edgesIn(bandCarcass, ["front"]));

  /**
   * A rail between the sides. The top and the bottom run to the back edge and carry the back's
   * groove (under the top, on the bottom); a shelf stops at the back.
   * @param {number} z @param {string} name @param {string} copyName @param {"top" | "bottom" | "shelf"} kind
   */
  /** @param {number} z @param {string} name @param {string} copyName @param {"top" | "bottom" | "shelf"} kind @param {[number, number]} [ys] its front and rear (a stretcher)
   * @param {boolean} [shows] its front edge shows, and takes the carcass's band (the rear stretcher's does not) */
  const addRail = (z, name, copyName, kind, ys, shows = true) => {
    const len = innerW + 2 * tongue;
    const [ya, yb] = ys ?? (kind === "shelf" ? [shelfFront, shelfDepth] : [0, railEnd]);
    /** @type {Prism[]} */
    const prisms = [];
    // Only a rail at the front of its dado meets the dado's stop (a shelf's dado starts with it).
    if (s.dados && (ya === 0 || kind === "shelf")) {
      prisms.push({ min: [0, 0, 0], max: [tongue, notchLen, t] }, { min: [len - tongue, 0, 0], max: [len, notchLen, t] });
    }
    // At inset 0 the groove runs out of the rear edge: a rabbet (partMesh cuts it at the blank).
    if (grooved && kind !== "shelf" && backY[0] >= ya - 1e-9 && backY[0] < yb) {
      const [g0, g1] = [backY[0] - ya, backY[1] - ya];
      prisms.push(kind === "top" ? { min: [0, g0, 0], max: [len, g1, bgd] } : { min: [0, g0, t - bgd], max: [len, g1, t] });
    }
    add(name, MATERIALS.carcass.name, [len, yb - ya, t], prisms, [], { at: [t - tongue, ya, z], name: copyName }, jointBom(copyName), shows ? edgesIn(bandCarcass, ["front"]) : []);
  };
  if (s.top === "stretchers") {
    // Two stretchers under the countertop (open for a sink): the front one notched like a top,
    // the rear one carrying the back's groove.
    const sw = stretcherWidth(s, metric);
    if (grooved && !(backY[0] - (railEnd - sw) >= 6 * MM)) throw new Error(`The rear stretcher is too narrow to carry the back's groove ${both(backInsetOf(s))} in from the rear: make it wider.`);
    addRail(s.height - t, "Front stretcher", "Front stretcher", "top", [0, sw]);
    addRail(s.height - t, "Rear stretcher", "Rear stretcher", "top", [railEnd - sw, railEnd], false);
    note("Stretchers", `Two ${both(sw)} wide in place of a top, front and rear${s.dados ? ": in the rabbet along each side's top (a dado open at the top), stopped at the front like the others; the front one notched to the stop, the rear one held by the back's groove" : fastener === "dowels" ? ", dowelled between the sides" : fastener === "confirmat" ? ", screwed between the sides with Confirmat screws" : ", butted between the sides"}`, "-", "-", "CNC (profile)");
    if (sw > s.stretcher + 1e-9) note("Stretchers", `Widened from ${both(s.stretcher)} to ${both(sw)}, the least that takes Häfele's ${DOWEL.upTo[0][1]} ${fastener === "dowels" ? "dowels" : "Confirmat screws"} (${DOWEL.setback} mm from each edge, one between on the ${DOWEL.pitch} mm grid). The Stretcher width setting is kept as you set it.`, "-", "-", "Check");
  } else addRail(s.height - t, "Top", "Top", "top");
  addRail(kick, "Bottom", "Bottom", "bottom");
  if (fixedShelves) shelfZs.forEach((z, i) => addRail(z, "Shelf", `Shelf ${i + 1}`, "shelf"));
  else {
    // Loose shelves on pins, a sliver narrower than the opening so they lift out, each resting
    // on its pins (placed with the pin holes).
    shelfZs.forEach((z, i) => {
      add("Shelf", MATERIALS.carcass.name, [innerW - 2 * PANEL_GAP, shelfDepth - shelfFront, t], [], [], { at: [t + PANEL_GAP, shelfFront, rests[i] ?? z], name: `Shelf ${i + 1}` }, [{ item: HARDWARE.shelfPin, qty: 4, unit: "each" }], edgesIn(bandShelves, ["front"]));
    });
  }
  if (shelfFront) note(shelfZs.length === 1 ? "Shelf" : "Shelves", `Set back ${both(shelfFront)} from the cabinet's front: behind the inset door (${both(t)}) and its bumpers`, "-", "-", "CNC (profile)");
  if (s.dados) {
    note("Sides", `Blind dados ${both(t + s.fit)} wide, stop ${both(stop)} from the front`, "-", both(s.dadoDepth), "CNC (pocket)");
    note("Rails", `Tongues ${both(tongue)} long, front corners notched ${both(notchLen)} deep (stop + bit)`, "-", "through", "CNC (profile)");
  }
  if (joints.length) {
    const dowels = fastener === "dowels";
    /** Places along a joint, as a row lists them: "37, 197, 389 and 553.6 mm", with inches in an inch document. @param {number[]} at */
    const places = (at) => {
      const list = (/** @type {string[]} */ v) => (v.length > 1 ? `${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}` : v[0]);
      return `${list(at.map((y) => String(mm(y))))} mm${metric ? "" : ` (${list(at.map((y) => (y / IN).toFixed(3)))} in)`}`;
    };
    note(dowels ? "Dowels" : "Confirmat screws", dowels
      ? `${DOWEL.dia} mm dowels where each rail meets a side, laid out as Häfele's case-dowelling drawing gives: ${DOWEL.setback} mm from the front and back edges, at least ${DOWEL.upTo.map(([inch, n]) => `${n} up to ${inch} in deep`).join(" and ")}; those between on the ${DOWEL.pitch} mm grid (AWS: dowel joints are "often based on" 32 mm spacing). The holes are the depths Häfele gives for its 8 mm assembly dowel: ${DOWEL.face} mm into the side, ${DOWEL.edge} mm into the edge`
      : `Häfele 7 x ${s.confirmatLength} mm self-countersinking Confirmat screws (${CONFIRMAT.lengths[String(s.confirmatLength)].sku}) where each rail meets a side, at the dowels' places: ${CONFIRMAT_LAYOUT}. A ${CONFIRMAT.through} mm through hole in the side (the nibs under the ${CONFIRMAT.head} mm head cut their own countersink, Häfele: none is cut), a ${CONFIRMAT.pilot} mm pilot in the rail's edge; the heads are on the sides' outer faces`, "-", "-", "Hardware");
    if (dowels && t < DOWEL.minStock * MM - 1e-9) note("Dowels", `Häfele gives its 8 mm assembly dowel, whose depths these are, "for minimum wood thickness ${DOWEL.minStock} mm"; this stock is ${exactThickness(t, metric)}`, "-", "-", "Check");
    /** How far the blank's front edge is inside the finished one (a banded front edge). @param {string} copyName */
    const cutIn = (copyName) => {
      const part = parts.find((p) => p.copies.some((c) => c.name === copyName));
      return part?.offset?.[1] ?? 0;
    };
    for (const j of joints) {
      const word = jointWord(j.name);
      note("Left and right sides", `${dowels ? "Dowel" : "Confirmat through"} holes for the ${word}: ${j.at.length} at ${places(j.at.map((y) => j.ya + y))} from the front, centred ${both(j.z + t / 2)} up`, `${dowels ? DOWEL.dia : CONFIRMAT.through} mm`, dowels ? `${DOWEL.face} mm` : "through", "CNC");
      const off = cutIn(j.name);
      const raw = off > 1e-9 ? `; before banding, from the blank's front edge as cut: ${places(j.at.map((y) => y - off))}` : "";
      note(j.name, `${dowels ? "Dowel" : "Confirmat pilot"} holes in both ends (the edges against the sides), for a ${dowels ? "doweling " : ""}jig: ${j.at.length} at ${places(j.at)} from its front edge${raw}, centred in its thickness${dowels ? ` (Häfele's depth for its 8 mm assembly dowel)` : "; deep as the screw maker's instructions give (no maker's pilot depth was found)"}`, `${dowels ? DOWEL.dia : CONFIRMAT.pilot} mm`, dowels ? `${DOWEL.edge} mm` : "per the screw maker", "Jig");
    }
  }

  for (const nl of nailers) {
    add(nl.name, MATERIALS.carcass.name, [innerW + 2 * tongue, t, nl.z1 - nl.z0], [], [], { at: [t - tongue, s.depth - t, nl.z0], name: nl.name });
  }
  if (nailers.length) note(nailers.length === 1 ? "Top nailer" : "Nailers", `${both(s.nailerHeight)} tall at the rear edge, behind the back${s.dados ? ", in dados in the sides" : ""}${!s.dados && fastener !== "none" ? ", butted between the sides: no dowels or Confirmat screws are drilled for them, so fasten them yourself" : ""}: screw the cabinet to the wall through ${nailers.length === 1 ? "it" : "them"}`, "-", "-", "CNC (profile)");
  if (s.back) {
    if (grooved) {
      add("Back", MATERIALS.back.name, [innerW + 2 * (bgd - PANEL_GAP), bT, zb1 - zb0 - 2 * PANEL_GAP], [], [], { at: [t - bgd + PANEL_GAP, yb0, zb0 + PANEL_GAP], name: "Back" });
      note("Sides, top, bottom", backInsetOf(s) > 1e-9 ? `Back groove ${both(bT + s.fit)} wide, ${both(backInsetOf(s))} in from the rear edge` : `Back rabbet ${both(bT + s.fit / 2)} wide along the rear edge`, "-", both(bgd), "CNC (pocket)");
    } else {
      add("Back", MATERIALS.back.name, [innerW, bT, s.height - kick], [], [], { at: [t, s.depth - bT, kick], name: "Back" });
    }
  }
  if (s.base === "toekick") add("Toe kick", MATERIALS.carcass.name, [innerW, t, kick], [], [], { at: [t, s.toeSetback, 0], name: "Toe kick" });

  // How the box comes out square.
  const squares = [s.dados ? "the bottom in its dados" : "the bottom", ...(s.back && grooved ? ["the back in its grooves"] : [])].join(" and ");
  note("Assembly", `${squares[0].toUpperCase()}${squares.slice(1)} hold the box square${s.top === "stretchers" ? "; the stretchers add little on their own" : ""}. Glue it up with the back in place and check the diagonals (equal within 1/32 in, 1 mm) before the glue sets.`, "-", "-", "Hand");

  // Edge banding: what each banded part is cut at and finished at, and its edges.
  const banded = parts.filter((p) => p.bands);
  if (banded.length) {
    const clash = bandClash(parts);
    if (clash) throw new Error(clash);
    note("Edge banding", `Each banded edge's blank is cut short by its band${s.bandPremill > 0 ? ` less the ${both(s.bandPremill)} the edgebander pre-mills off` : ""}, so blank plus band is the size designed. Holes, dados and notches stay where they are in the finished part, each the band's thickness nearer the raw edge (Blum gives the boring distance from the door's edge and the 37 mm lines from the side's front edge; with a band on, that edge is the band's face). Band after the router; type the thickness your band measures. The model shows the blanks, so a banded edge stands a band short of its neighbours and a size measured in the model is the cut size`, "-", "-", "Hand");
    for (const p of banded) {
      const fin = /** @type {V3} */ (p.finished);
      const thin = fin.indexOf(Math.min(...fin));
      const [a, b] = [0, 1, 2].filter((k) => k !== thin);
      const on = /** @type {PartBand[]} */ (p.bands);
      const where = on.length === 4 ? "all four edges" : on.length === 1 ? `the ${on[0].edge} edge` : `${on.map((e) => e.edge).join(", ")} edges`;
      const which = [...new Set(on.map((e) => e.band))].map((n) => bandSet[n - 1].label).join("; ");
      const metres = (p.bom ?? []).filter((x) => x.unit === "m").map((x) => x.qty).reduce((m, q) => m + q, 0);
      // A notch at an end of a banded edge (a side's toe kick, a rail's tongues): an edgebander
      // runs the band across it, and it is trimmed off by hand at the notch's inside corner.
      const notched = on.some((e) => e.span[0] > 1e-9 || e.span[1] < e.run - 1e-9);
      note(p.name, `Edge band ${where} (${which}): finished ${pairText(fin[a], fin[b], metric)}, cut ${pairText(p.blank[a], p.blank[b], metric)}; ${Math.round(metres * 1000) / 1000} m of band each, with waste${notched ? `. ${END_NOTCH}` : ""}`, "-", "-", "Edge band");
    }
  }

  // A groove narrower than the bit cannot be cut with it.
  const narrow = (s.back && grooved) || drawerBands.length ? bT + s.fit : Infinity;
  if (narrow < s.bit) note("Grooves", `Back and drawer-bottom grooves are ${both(narrow)} wide, narrower than the ${both(s.bit)} bit: cut their layers with a smaller bit (1/8 in or 3 mm)`, "-", "-", "Change bit");
  if (s.dados && t + s.fit < s.bit - 1e-9) note("Dados", `Dados are ${both(t + s.fit)} wide, narrower than the ${both(s.bit)} bit: cut their layers with a smaller bit`, "-", "-", "Change bit");
  // System holes and pull holes are smaller than a sheet-goods bit.
  const small = rows.filter((r) => r[4] === "CNC" && /^\d+(\.\d+)? mm$/.test(r[2]) && parseFloat(r[2]) * MM < s.bit).map((r) => r[2]);
  if (small.length) {
    const sizes = [...new Set(small)].sort((a, b) => parseFloat(a) - parseFloat(b)).join(" and ");
    note("Holes", `The ${sizes} holes are smaller than the ${both(s.bit)} bit: drill their DRILL_ layers with ${small.length > 1 && new Set(small).size > 1 ? `${sizes} drill bits` : `a ${sizes} drill bit`} (or bore them with a 1/8 in or 3 mm bit)`, "-", "-", "Change bit");
  }

  return { parts, rows, runner, holes: drilled, room };
}

/** @param {Sizes} s @param {number} floor @param {number} ceiling @param {{ z0: number, z1: number, kind: string }[]} bands */
function shelfHeights(s, floor, ceiling, bands) {
  const door = bands.find((x) => x.kind === "door");
  const z0 = s.layout === "mixed" && door ? door.z0 : floor;
  const z1 = s.layout === "mixed" && door ? door.z1 : ceiling;
  const count = s.layout === "drawers" || s.layout === "trash" ? 0 : s.shelves;
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
