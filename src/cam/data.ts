// The built-in numbers: the Shapeoko 5 Pro 4x4, three routers' dial tables, and how deep and
// how fast a bit may go. Each number is kept in the unit its source prints it in, with the
// source's id (src/cam/sources.ts) beside it. Nothing here is a number the report
// (docs/research/feeds-speeds-sources.md) does not give; where it says NOT FOUND, the field
// is null and the app says it does not know.
import { SOURCES, type Confidence, type Source, type SourceId } from "./sources";

export type Unit = "mm" | "in" | "rpm" | "ipm" | "in/tooth" | "mm/tooth" | "ratio" | "deg" | "percent" | "count";

/** A number from a source, in the unit the source prints it in. */
export interface Sourced {
  value: number;
  unit: Unit;
  src: SourceId;
  /** Lower than the source's own, when the number is a choice made from it (§8a). */
  confidence?: Confidence;
  /** What the source says about it, when that matters. */
  note?: string;
}

export const M_PER_IN = 0.0254;

/** How far to trust a number: its own confidence, else its source's. */
export function confidenceOf(s: Sourced): Confidence {
  return s.confidence ?? (SOURCES[s.src] as Source).confidence;
}

/** A sourced length in metres. */
export function metres(s: Sourced): number {
  if (s.unit === "mm") return s.value / 1000;
  if (s.unit === "in") return s.value * M_PER_IN;
  throw new Error(`not a length: ${s.unit}`);
}

// ---------------------------------------------------------------------------------------
// Routers

export interface DialStep {
  dial: number;
  rpm: Sourced;
}

export interface DialTable {
  id: string;
  label: string;
  steps: DialStep[];
}

export interface Router {
  id: string;
  name: string;
  /** Collet sizes the maker lists (null: the report found none). */
  collets: Sourced[] | null;
  /** The largest shank the maker says the router takes (null: not found). */
  maxShank: Sourced | null;
  /** The stated speed range. */
  range: { low: Sourced; high: Sourced } | null;
  tables: DialTable[];
  /** What a person reading the table must know (each with its source). */
  notes: { text: string; src: SourceId }[];
}

const rpm = (value: number, src: SourceId): Sourced => ({ value, unit: "rpm", src });
const steps = (src: SourceId, pairs: [number, number][]): DialStep[] => pairs.map(([dial, r]) => ({ dial, rpm: rpm(r, src) }));

export const COMPACT_ROUTER: Router = {
  id: "carbide-compact",
  name: "Carbide Compact Router",
  collets: [
    { value: 0.125, unit: "in", src: "ccr-docs" },
    { value: 0.25, unit: "in", src: "ccr-docs" },
  ],
  maxShank: { value: 0.25, unit: "in", src: "c3d-spindles", note: 'Use cutters with a shank up to 1/4"' },
  range: { low: rpm(12000, "ccr-shop"), high: rpm(30000, "ccr-shop") },
  tables: [
    {
      id: "shop",
      label: "Carbide's shop page",
      steps: steps("ccr-shop", [
        [1, 11000],
        [2, 13500],
        [3, 18250],
        [4, 24500],
        [5, 29250],
        [6, 31000],
      ]),
    },
    {
      id: "staff-2020",
      label: "Carbide staff chart, 2020",
      steps: steps("ccr-staff", [
        [1, 10000],
        [1.5, 12000],
        [2, 14000],
        [2.5, 16000],
        [3, 18000],
        [3.5, 20500],
        [4, 23000],
        [4.5, 25000],
        [5, 27000],
        [5.5, 29500],
        [6, 32000],
      ]),
    },
  ],
  notes: [
    { text: "Carbide's two tables disagree at every whole dial (the difference is shown beside them).", src: "ccr-staff" },
    { text: "The shop page's own dial 1 (11,000) and dial 6 (31,000) fall outside the 12,000–30,000 range the same page states.", src: "ccr-shop" },
    { text: 'Carbide staff: speeds "may differ from one unit batch to another", vary with mains frequency, and are "an estimate/guideline only". Measure with a tachometer for exact values.', src: "ccr-staff" },
  ],
};

export const MAKITA_RT0701C: Router = {
  id: "makita-rt0701c",
  name: "Makita RT0701C",
  collets: [
    { value: 0.25, unit: "in", src: "makita-manual" },
    { value: 0.375, unit: "in", src: "makita-manual" },
  ],
  maxShank: { value: 0.375, unit: "in", src: "makita-manual", note: 'Collets 1/4" and 3/8" (specifications, page 2)' },
  range: { low: rpm(10000, "makita-manual"), high: rpm(30000, "makita-manual") },
  tables: [
    {
      id: "manual",
      label: "Makita's manual",
      steps: steps("makita-manual", [
        [1, 10000],
        [2, 12000],
        [3, 17000],
        [4, 22000],
        [5, 27000],
        [6, 30000],
      ]),
    },
  ],
  notes: [
    { text: "The manual's text lists the six speeds out of order; this pairing is the only one that rises with the dial, and it matches the RT0700C manual.", src: "makita-manual" },
    { text: 'Manual: "If the tool is operated continuously at low speeds for a long time, the motor will get overloaded"; "Moving the tool forward too slowly may burn and mar the cut" (page 11).', src: "makita-manual" },
  ],
};

export const DEWALT_DWP611: Router = {
  id: "dewalt-dwp611",
  name: "DeWalt DWP611",
  collets: null,
  maxShank: null,
  range: { low: rpm(16000, "dewalt-manual"), high: rpm(27000, "dewalt-manual") },
  tables: [
    {
      id: "manual",
      label: "DeWalt's manual",
      steps: steps("dewalt-manual", [
        [1, 16000],
        [2, 18200],
        [3, 20400],
        [4, 22600],
        [5, 24800],
        [6, 27000],
      ]),
    },
  ],
  notes: [
    { text: 'The manual gives "an infinite number of speeds between 16,000 and 27,000 RPM". Which uses go with which settings was lost in the text Sawhorse\'s research could read.', src: "dewalt-manual" },
    { text: "The research did not find this router's collet sizes: check the manual for the shanks it takes.", src: "dewalt-manual" },
  ],
};

export const ROUTERS: Router[] = [COMPACT_ROUTER, MAKITA_RT0701C, DEWALT_DWP611];

/** Where two dial tables disagree most, at the dials both have. */
export function tableGap(a: DialTable, b: DialTable): { dial: number; rpm: number } {
  let best = { dial: 0, rpm: 0 };
  for (const s of a.steps) {
    const t = b.steps.find((x) => x.dial === s.dial);
    if (t && Math.abs(s.rpm.value - t.rpm.value) > best.rpm) best = { dial: s.dial, rpm: Math.abs(s.rpm.value - t.rpm.value) };
  }
  return best;
}

// ---------------------------------------------------------------------------------------
// Machines

export interface MachineSpecs {
  travelX: Sourced;
  travelY: Sourced;
  travelZ: Sourced;
  /** The feed above which the app warns (inches per minute). */
  feedWarn: Sourced;
  /** Other published figures worth seeing, each with its source. */
  extra: { label: string; value: Sourced }[];
}

export const SHAPEOKO_5_PRO_4X4: MachineSpecs & { id: string; name: string; routers: string[]; notes: { text: string; src: SourceId }[] } = {
  id: "shapeoko-5-pro-4x4",
  name: "Shapeoko 5 Pro 4×4",
  travelX: { value: 1237, unit: "mm", src: "c3d-specs", note: "formatMM(1249-12) in the page source" },
  travelY: { value: 1237, unit: "mm", src: "c3d-specs", note: "formatMM(1249-12) in the page source" },
  travelZ: { value: 155, unit: "mm", src: "c3d-specs", note: "formatMM(165 - 10): Total Z Travel" },
  feedWarn: { value: 200, unit: "ipm", src: "forum-max-feed", note: "Not published by Carbide 3D. A forum user gives 200 IPM as delivered (and 275 IPM as the firmware maximum)." },
  extra: [
    { label: "Z travel with Sweepy Pro", value: { value: 140, unit: "mm", src: "c3d-specs" } },
    { label: "Clearance under the Z axis, with the Hybrid Table", value: { value: 4, unit: "in", src: "c3d-specs" } },
    { label: "Clearance under the Z axis, without it", value: { value: 5, unit: "in", src: "c3d-specs" } },
    { label: "Spindle mount", value: { value: 65, unit: "mm", src: "c3d-specs" } },
  ],
  routers: [COMPACT_ROUTER.id, MAKITA_RT0701C.id, DEWALT_DWP611.id],
  notes: [
    { text: "No router ships with the machine: you provide a 65 mm trim router or spindle.", src: "c3d-specs" },
    { text: "Carbide 3D sells the Compact Router (110 V) for it, and suggests a Makita RT0700C in 220 V countries.", src: "c3d-shop-s5" },
    { text: "Carbide 3D publishes no feeds and speeds for the 5 Pro on the web: its staff point to Carbide Create's built-in library, which is not published.", src: "c3d-superseded" },
  ],
};

// ---------------------------------------------------------------------------------------
// Rules that are numbers

/** Depth of cut: the charts' basis, and their derate for deeper passes (applied to the feed
 * by Amana, to the chipload by Onsrud and Freud; the same thing at a fixed RPM). */
export const CHART_DEPTH = {
  basis: { value: 1, unit: "ratio", src: "amana-charts", note: "Chart values are for a depth of cut of 1 × the bit's diameter" } as Sourced,
  over1D: { value: 0.75, unit: "ratio", src: "amana-charts", note: "2×D: reduce by 25%" } as Sourced,
  over2D: { value: 0.5, unit: "ratio", src: "amana-charts", note: "3×D: reduce by 50%" } as Sourced,
  /** The charts' RPM: every chart assumes an industrial machine at this speed. */
  rpm: { value: 18000, unit: "rpm", src: "amana-a1", note: "Amana, Onsrud and Freud give their charts at 18,000 RPM" } as Sourced,
};

/** The Shapeoko community's figures (all low confidence). */
export const COMMUNITY = {
  halfD: { value: 0.5, unit: "ratio", src: "forum-85436", note: '"Standard rule of thumb is DOC should be approximately 1/2 of the bit diameter" (Tim Jones)' } as Sourced,
  rampAngle: { value: 20, unit: "deg", src: "forum-85436", note: "Ramp in at 20° in Baltic birch on a Shapeoko 5 Pro (Ryan Quick). No bit maker's ramp angle was found." } as Sourced,
  plungeLow: { value: 30, unit: "percent", src: "atoz", note: "Straight plunge 30–40% of the feed for woods" } as Sourced,
  plungeHigh: { value: 40, unit: "percent", src: "atoz" } as Sourced,
  stepoverRoughLow: { value: 40, unit: "percent", src: "atoz", note: "Roughing 40–100% of the diameter (wide and shallow); no bit maker's stepover was found" } as Sourced,
  stepoverRoughHigh: { value: 100, unit: "percent", src: "atoz" } as Sourced,
  stepoverFinishLow: { value: 5, unit: "percent", src: "atoz", note: "Finishing 5–10% of the diameter" } as Sourced,
  stepoverFinishHigh: { value: 10, unit: "percent", src: "atoz" } as Sourced,
  rubbingFloor: { value: 0.001, unit: "in/tooth", src: "atoz", note: '0.001" is the commonly cited minimum; it "may need to be lowered to 0.0005" for 1/8" and smaller endmills"' } as Sourced,
  ccLibraryDepthLow: { value: 0.03, unit: "in", src: "forum-46692", note: "Carbide Create's library depth of cut for compression bits in plywood, as a user reports it" } as Sourced,
  ccLibraryDepthHigh: { value: 0.04, unit: "in", src: "forum-46692" } as Sourced,
};

/** A plunge at about half the feed (ToolsToday), and Amana's ramp: feed ÷ flutes. */
export const PLUNGE_HALF = { value: 0.5, unit: "ratio", src: "toolstoday", note: '"many CNC users reduce ramp or plunge feed to about half the main feed rate"' } as Sourced;

/** Leave this much under a small part (onion skin). */
export const ONION_SKIN = { value: 0.02, unit: "in", src: "laguna", note: '"Set the cut depth to .020" less than the thickness of your material"' } as Sourced;

/** Why a 35 mm hinge-boring or Forstner bit never goes in the router. */
export const HINGE_BIT_MAX = { value: 8000, unit: "rpm", src: "amana-203431", note: 'Amana 203431, 35 mm hinge boring bit: "Maximum RPM is 8,000"; "Not to be used in portable drills or hand held routers"' } as Sourced;
export const FORSTNER_35 = { value: 900, unit: "rpm", src: "wurth", note: "Würth Forstner bits over 35 mm: 900 rpm in hardwood or MDF" } as Sourced;

/** The HPL factor: Rennie's HPL row is about 70% of its MDF row at 6.35 mm. */
export const HPL_FACTOR = { value: 0.7, unit: "ratio", src: "rennie", note: "Rennie: HPL .229–.305 mm vs MDF .330–.406 mm at 6.35 mm; a derived ratio, and Rennie's chart excludes compression bits" } as Sourced;
