// Chipload: what each bit maker's chart says for a bit and a material, and the starting
// value the research picked (§8a of docs/research/feeds-speeds-sources.md). Only the 1/8 in
// and 1/4 in rows are carried (and Rennie's 6 mm row, the only 6 mm figure found): the
// user's bits, and every bit the Compact Router's 1/4 in collet takes at those sizes.
import type { Sourced } from "./data";
import type { SourceId } from "./sources";

export type MaterialId = "mdf" | "melamine-mdf" | "hpl-mdf" | "baltic-birch" | "laminate-bb";

export interface Material {
  id: MaterialId;
  label: string;
  /** A laminate or melamine face that an up-cut bit chips. */
  faced: boolean;
}

export const MATERIALS: Material[] = [
  { id: "mdf", label: "Raw MDF", faced: false },
  { id: "melamine-mdf", label: "Melamine / TFL on MDF", faced: true },
  { id: "hpl-mdf", label: "HPL on MDF", faced: true },
  { id: "baltic-birch", label: "Baltic birch", faced: false },
  { id: "laminate-bb", label: "Laminate-faced Baltic birch", faced: true },
];

export type BitType = "upcut" | "downcut" | "compression" | "endmill" | "oflute";

export const BIT_TYPES: { id: BitType; label: string }[] = [
  { id: "upcut", label: "Up-cut spiral" },
  { id: "downcut", label: "Down-cut spiral" },
  { id: "compression", label: "Compression" },
  { id: "endmill", label: "End mill" },
  { id: "oflute", label: "O-flute" },
];

const ALL: MaterialId[] = ["mdf", "melamine-mdf", "hpl-mdf", "baltic-birch", "laminate-bb"];
const MDF_LAM: MaterialId[] = ["mdf", "melamine-mdf", "hpl-mdf"];
const PLY: MaterialId[] = ["baltic-birch", "laminate-bb"];
/** An end mill is matched to the up-cut (spiral plunge) rows. */
const SPIRAL: BitType[] = ["upcut", "downcut", "endmill"];

/** One row and column of a chart: a chipload range for a bit at one diameter. */
export interface ChartFigure {
  src: SourceId;
  /** What the chart calls the bit ("2-flute compression", "52-200 / 57-200 up/down spiral"). */
  bit: string;
  /** The tool types it is shown for. */
  kinds: BitType[];
  /** The flute count the row is for (null: the chart does not say). */
  flutes: number | null;
  dia: number;
  diaUnit: "in" | "mm";
  /** The chart's column ("Plywood", "MDF/Laminate"). */
  column: string;
  materials: MaterialId[];
  min: number;
  max: number;
  unit: "in/tooth" | "mm/tooth";
  /** Why the row is only near the material, or what else to know. */
  note?: string;
  /** A row for some bits only (Amana's Spektra-coated tools): counted only for a bit whose
   * name matches, shown for the others as not counted. */
  only?: { pattern: string; label: string };
}

type Row = Omit<ChartFigure, "src" | "bit" | "kinds" | "unit" | "diaUnit"> & { diaUnit?: "in" | "mm" };
const rows = (src: SourceId, bit: string, kinds: BitType[], unit: ChartFigure["unit"], list: Row[]): ChartFigure[] =>
  list.map((r) => ({ src, bit, kinds, unit, diaUnit: r.diaUnit ?? "in", ...r }));
const one = (flutes: number | null, dia: number, column: string, materials: MaterialId[], min: number, max = min, note?: string): Row => ({ flutes, dia, column, materials, min, max, ...(note ? { note } : {}) });

const LAM_PLY_NOTE = 'Onsrud\'s "Laminated Plywood" sheet: not clear whether it means laminate-faced plywood';
const PB_NOTE = "Melamine on particleboard: the nearest chart to laminate on MDF";
const SOFT_PLY_NOTE = "Rennie's row is soft plywood; Baltic birch is harder";
const SPEKTRA_NOTE = "Spektra-coated tools (46700-K, 46701-K, …) in Baltic plywood";
/** A bit named Spektra, or by an Amana 467xx Spektra number. */
const SPEKTRA = { pattern: "spektra|\\b467\\d\\d", label: "Amana's Spektra-coated bits" };
const FREUD_NOTE = "Freud's chart does not separate up-cut, down-cut and compression";
const ATOZ_NOTE = 'The e-book\'s range for "soft wood & hard plastics" on a Shapeoko';

export const CHART_FIGURES: ChartFigure[] = [
  // Amana A1: compression, 18,000 RPM, 1×D.
  ...rows("amana-a1", "1-flute compression", ["compression"], "in/tooth", [
    one(1, 0.125, "Plywood", PLY, 0.0031),
    one(1, 0.125, "MDF/Laminate", MDF_LAM, 0.0062),
    one(1, 0.25, "Plywood", PLY, 0.0031),
    one(1, 0.25, "MDF/Laminate", MDF_LAM, 0.0062),
  ]),
  ...rows("amana-a1", "2-flute compression", ["compression"], "in/tooth", [
    one(2, 0.125, "Plywood", PLY, 0.0011),
    one(2, 0.125, "MDF/Laminate", MDF_LAM, 0.0022),
    one(2, 0.25, "Plywood", PLY, 0.0031),
    one(2, 0.25, "MDF/Laminate", MDF_LAM, 0.0061),
  ]),
  // Amana A2: Spektra compression for Baltic plywood.
  ...rows("amana-a2", "Spektra compression", ["compression"], "in/tooth", [
    one(2, 0.125, "Baltic plywood", PLY, 0.004, 0.004, SPEKTRA_NOTE),
    one(2, 0.25, "Baltic plywood", PLY, 0.004, 0.005, SPEKTRA_NOTE),
    one(3, 0.25, "Baltic plywood", PLY, 0.005, 0.005, SPEKTRA_NOTE),
  ]).map((f) => ({ ...f, only: SPEKTRA })),
  // Amana A4: up-cut and down-cut spiral plunge bits.
  ...rows("amana-a4", "Up-cut / down-cut spiral", SPIRAL, "in/tooth", [
    one(2, 0.125, "Wood/Plywood", PLY, 0.004),
    one(2, 0.125, "MDF/Laminate", MDF_LAM, 0.005),
    one(2, 0.25, "Wood/Plywood", PLY, 0.005),
    one(2, 0.25, "MDF/Laminate", MDF_LAM, 0.006),
    one(3, 0.25, "Wood/Plywood", PLY, 0.005),
    one(3, 0.25, "MDF/Laminate", MDF_LAM, 0.006),
  ]),
  // Onsrud O1 MDF.
  ...rows("onsrud-o1", "52-200 / 57-200 up/down spiral", SPIRAL, "in/tooth", [one(null, 0.125, "MDF", ["mdf"], 0.005, 0.007), one(null, 0.25, "MDF", ["mdf"], 0.006, 0.008)]),
  ...rows("onsrud-o1", "60-100 compression", ["compression"], "in/tooth", [one(null, 0.125, "MDF", ["mdf"], 0.01, 0.012), one(null, 0.25, "MDF", ["mdf"], 0.013, 0.015)]),
  // Onsrud O2 hard plywood (the closest Onsrud sheet to Baltic birch).
  ...rows("onsrud-o2", "60-100 compression", ["compression"], "in/tooth", [one(null, 0.125, "Hard plywood", ["baltic-birch"], 0.012, 0.018), one(null, 0.25, "Hard plywood", ["baltic-birch"], 0.014, 0.016)]),
  // Onsrud O3 laminated plywood.
  ...rows("onsrud-o3", "60-100 compression", ["compression"], "in/tooth", [one(null, 0.125, "Laminated plywood", ["laminate-bb"], 0.013, 0.015, LAM_PLY_NOTE), one(null, 0.25, "Laminated plywood", ["laminate-bb"], 0.015, 0.017, LAM_PLY_NOTE)]),
  // Onsrud O4 laminated chipboard.
  ...rows("onsrud-o4", "60-100 compression", ["compression"], "in/tooth", [one(null, 0.125, "Laminated chipboard", ["melamine-mdf"], 0.013, 0.015, PB_NOTE), one(null, 0.25, "Laminated chipboard", ["melamine-mdf"], 0.015, 0.017, PB_NOTE)]),
  // Onsrud's figures relayed by a reseller: single-flute compression, particleboard core.
  ...rows("crs-melamine", "Single-flute compression (Onsrud, relayed)", ["compression"], "in/tooth", [
    one(1, 0.125, "Particleboard core", ["melamine-mdf"], 0.013, 0.015, PB_NOTE),
    one(1, 0.25, "Particleboard core", ["melamine-mdf"], 0.017, 0.019, PB_NOTE),
  ]),
  // Freud, solid carbide bits at depth = diameter.
  ...rows("freud", "Solid carbide bit", ["upcut", "downcut", "compression", "endmill"], "in/tooth", [
    one(null, 0.125, "MDF / particleboard", ["mdf"], 0.004, 0.007, FREUD_NOTE),
    one(null, 0.125, "Laminated particleboard", ["melamine-mdf", "hpl-mdf"], 0.003, 0.006, `${FREUD_NOTE}. ${PB_NOTE}`),
    one(null, 0.125, "Plywood", PLY, 0.003, 0.005, FREUD_NOTE),
    one(null, 0.25, "MDF / particleboard", ["mdf"], 0.013, 0.017, FREUD_NOTE),
    one(null, 0.25, "Laminated particleboard", ["melamine-mdf", "hpl-mdf"], 0.01, 0.015, `${FREUD_NOTE}. ${PB_NOTE}`),
    one(null, 0.25, "Plywood", PLY, 0.006, 0.009, FREUD_NOTE),
  ]),
  // Rennie (a reseller), mm per tooth, up-cut or down-cut only.
  ...rows("rennie", "Up-cut / down-cut spiral", SPIRAL, "mm/tooth", [
    { ...one(null, 3.175, "Soft plywood", PLY, 0.102, 0.153, SOFT_PLY_NOTE), diaUnit: "mm" },
    { ...one(null, 3.175, "MDF / particleboard", ["mdf", "melamine-mdf"], 0.102, 0.178), diaUnit: "mm" },
    { ...one(null, 3.175, "High-pressure laminate", ["hpl-mdf"], 0.076, 0.127), diaUnit: "mm" },
    { ...one(null, 6, "Soft plywood", PLY, 0.27, 0.32, SOFT_PLY_NOTE), diaUnit: "mm" },
    { ...one(null, 6, "MDF / particleboard", ["mdf", "melamine-mdf"], 0.32, 0.396), diaUnit: "mm" },
    { ...one(null, 6, "High-pressure laminate", ["hpl-mdf"], 0.219, 0.294), diaUnit: "mm" },
    { ...one(null, 6.35, "Soft plywood", PLY, 0.279, 0.33, SOFT_PLY_NOTE), diaUnit: "mm" },
    { ...one(null, 6.35, "MDF / particleboard", ["mdf", "melamine-mdf"], 0.33, 0.406), diaUnit: "mm" },
    { ...one(null, 6.35, "High-pressure laminate", ["hpl-mdf"], 0.229, 0.305), diaUnit: "mm" },
  ]),
  // The Shapeoko community e-book.
  ...rows("atoz", "Any end mill (Shapeoko)", ["upcut", "downcut", "compression", "endmill"], "in/tooth", [one(null, 0.125, "Soft wood", ALL, 0.001, 0.0025, ATOZ_NOTE), one(null, 0.25, "Soft wood", ALL, 0.001, 0.005, ATOZ_NOTE)]),
];

/** Bit makers' own charts: the figures the starting value and the "below the maker's
 * minimum" warning are measured against. Resellers and the community are shown, not used. */
export const MAKER_SOURCES: SourceId[] = ["amana-a1", "amana-a2", "amana-a4", "onsrud-o1", "onsrud-o2", "onsrud-o3", "onsrud-o4", "freud"];

/** The bit makers whose charts are carried, as a tool names its maker. */
export type MakerId = "amana" | "onsrud" | "freud";
export const MAKERS: { id: MakerId; label: string }[] = [
  { id: "amana", label: "Amana Tool" },
  { id: "onsrud", label: "Onsrud" },
  { id: "freud", label: "Freud" },
];

/** Whose chart a maker source is. */
export function makerOf(src: SourceId): MakerId | null {
  if (src.startsWith("amana-")) return "amana";
  if (src.startsWith("onsrud-")) return "onsrud";
  if (src === "freud") return "freud";
  return null;
}

/** Does a bit maker's figure count for this bit (a Spektra-only row counts for Spektra bits)? */
export function figureCounts(f: ChartFigure, toolName: string): boolean {
  return MAKER_SOURCES.includes(f.src) && (!f.only || new RegExp(f.only.pattern, "i").test(toolName));
}

/** A figure in inches per tooth. */
export function inPerTooth(v: number, unit: ChartFigure["unit"]): number {
  return unit === "mm/tooth" ? v / 25.4 : v;
}

/** A figure's diameter in metres. */
export function figureDia(f: ChartFigure): number {
  return f.diaUnit === "mm" ? f.dia / 1000 : f.dia * 0.0254;
}

/** How deep a pass the §8a row asks for. */
export type DepthRule = "compression" | "half" | "one";

/** A starting value from §8a: the bit, the materials, the chipload and the RPM it is run at
 * (a dial on the Compact Router's shop-page table). */
export interface StartRow {
  /** The §8a row itself (its bit, flutes and diameter); the chipload and RPM name their own. */
  src: SourceId;
  kinds: BitType[];
  flutes: number;
  diaIn: number;
  materials: MaterialId[];
  chipload: Sourced;
  /** The RPM §8a runs it at; on another table, the dial nearest it. */
  rpm: Sourced;
  depth: DepthRule;
  /** The row's own words, for the panel. */
  job: string;
}

const dial2: Sourced = { value: 13500, unit: "rpm", src: "ccr-shop", note: "Dial 2 on the shop page's table, the dial §8a uses for this row" };
const dial3: Sourced = { value: 18250, unit: "rpm", src: "ccr-shop", note: "Dial 3 on the shop page's table, the dial §8a uses for this row" };

/** The research's starting values (§8a). Every chipload is the lowest bit maker's figure for
 * the bit and material (Amana), except HPL (derived) and the 1/8 in end mill (the e-book). */
export const START_ROWS: StartRow[] = [
  {
    src: "report8a",
    job: "Profile Baltic birch, plain or laminate-faced",
    kinds: ["compression"],
    flutes: 2,
    diaIn: 0.25,
    materials: PLY,
    chipload: { value: 0.0031, unit: "in/tooth", src: "amana-a1", note: "Amana A1, 2-flute 1/4\", Plywood" },
    rpm: dial3,
    depth: "compression",
  },
  {
    src: "report8a",
    job: "Profile raw MDF, or melamine/TFL on MDF",
    kinds: ["compression"],
    flutes: 2,
    diaIn: 0.25,
    materials: ["mdf", "melamine-mdf"],
    chipload: { value: 0.0061, unit: "in/tooth", src: "amana-a1", note: 'Amana A1, 2-flute 1/4", "MDF/Laminate"' },
    rpm: { ...dial2, note: "Dial 2 on the shop page's table: at dial 3 the feed would be 223 IPM, over the 200 IPM limit" },
    depth: "compression",
  },
  {
    src: "report8a",
    job: "Profile HPL on MDF",
    kinds: ["compression"],
    flutes: 2,
    diaIn: 0.25,
    materials: ["hpl-mdf"],
    chipload: { value: 0.0061 * 0.7, unit: "in/tooth", src: "report8a", note: ".0061 (Amana A1, MDF/Laminate) × 0.70 (Rennie's HPL/MDF ratio at 6.35 mm). A derived ratio: Rennie's chart excludes compression bits" },
    rpm: dial2,
    depth: "compression",
  },
  {
    src: "report8a",
    job: "Dados and pockets in Baltic birch",
    kinds: ["downcut"],
    flutes: 2,
    diaIn: 0.25,
    materials: PLY,
    chipload: { value: 0.005, unit: "in/tooth", src: "amana-a4", note: "Amana A4, 46202 row, Wood/Plywood" },
    rpm: dial2,
    depth: "half",
  },
  {
    src: "report8a",
    job: "Dados and pockets in MDF or laminate on MDF",
    kinds: ["downcut"],
    flutes: 2,
    diaIn: 0.25,
    materials: MDF_LAM,
    chipload: { value: 0.006, unit: "in/tooth", src: "amana-a4", note: "Amana A4, 46202 row, MDF/Laminate" },
    rpm: dial2,
    depth: "half",
  },
  {
    src: "report8a",
    job: "Small parts, 5 mm and 6 mm holes, fine features",
    kinds: ["endmill"],
    flutes: 2,
    diaIn: 0.125,
    materials: ALL,
    chipload: {
      value: 0.002,
      unit: "in/tooth",
      src: "report8a",
      confidence: "low",
      note: "From the Shapeoko e-book's 1/8\" soft-wood range (.001–.0025, low). The only starting value below a bit maker's figure (Amana up-cut 1/8\" .0040; Freud plywood .003–.005). It agrees with a forum result of 75 IPM at 18,000 RPM in Baltic birch, and stays above the .001 rubbing floor",
    },
    rpm: dial3,
    depth: "half",
  },
  {
    src: "report8a",
    job: "Up-cut roughing on faces that never show (Baltic birch)",
    kinds: ["upcut"],
    flutes: 2,
    diaIn: 0.25,
    materials: PLY,
    chipload: { value: 0.005, unit: "in/tooth", src: "amana-a4", note: "Amana A4, 46102 row, Wood/Plywood" },
    rpm: dial2,
    depth: "one",
  },
  {
    src: "report8a",
    job: "Up-cut roughing on faces that never show (MDF)",
    kinds: ["upcut"],
    flutes: 2,
    diaIn: 0.25,
    materials: MDF_LAM,
    chipload: { value: 0.006, unit: "in/tooth", src: "amana-a4", note: "Amana A4, 46102 row, MDF/Laminate" },
    rpm: dial2,
    depth: "one",
  },
];
