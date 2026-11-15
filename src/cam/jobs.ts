// What CNC setup keeps for a sheet's job sheet and its part labels (src/nesting/jobsheet.ts,
// src/nesting/partlabels.ts): which bit each kind of layer is cut with, the material the
// feeds are read for, how narrow a part is flagged for hold-down, and the label paper.
// Shop data like the rest of src/cam/store.ts: kept on this device, never in the model.
import { MATERIALS, type MaterialId } from "./chipload";
import type { Tool } from "./tools";

/** The kinds of layer a job sheet gives a bit to. The profile layer reads the shop's
 * Profile bit (`Shop.profileTool`), so it is not here. */
export type JobKind = "cutout" | "pocket" | "narrow" | "hole";

export const JOB_KINDS: { id: JobKind; label: string; title: string }[] = [
  { id: "cutout", label: "Cutouts (CUTOUT_THRU)", title: "Openings through a part, cut as an inside profile. Same as the profile bit unless you pick another." },
  { id: "pocket", label: "Pockets (POCKET_…)", title: "Dados, grooves and rabbets" },
  { id: "narrow", label: "Narrow grooves", title: "A pocket layer with a shape narrower than the pocket bit is cut with this bit instead" },
  { id: "hole", label: "Holes (DRILL_…)", title: "Each circle pocketed with an end mill smaller than the hole" },
];

/** Label paper, and the label sizes laid out on it. No label product is named: Sawhorse
 * found no source for any maker's sheet layout (docs/CNC-CABINETS.md, "Job sheet and part
 * labels"), so labels are laid out edge to edge in a grid centred on the page. */
export type LabelPaper = "letter" | "a4";

export interface LabelSize {
  id: string;
  label: string;
  /** Width and height in PDF points (1/72 in). */
  w: number;
  h: number;
}

const PT_IN = 72;
const PT_MM = 72 / 25.4;

export const LABEL_SIZES: LabelSize[] = [
  { id: "4x2in", label: "4 × 2 in", w: 4 * PT_IN, h: 2 * PT_IN },
  { id: "4x3.33in", label: "4 × 3 1/3 in", w: 4 * PT_IN, h: (10 / 3) * PT_IN },
  { id: "105x74mm", label: "105 × 74 mm", w: 105 * PT_MM, h: 74 * PT_MM },
];

export interface JobPrefs {
  /** Include the assigned cutter in CNC DXF layer names. False keeps legacy CAM templates. */
  toolLayers?: boolean;
  /** The bit for each kind of layer, by tool id (null: none). A null cutout bit is the
   * profile bit. */
  tools: Record<JobKind, string | null>;
  /** The material the feeds are read for, for a stock with none of its own. */
  material: MaterialId;
  /** A stock's own material, by the stock's name ("4 x 4 sheet, 3/4"). */
  materials: Record<string, MaterialId>;
  /** Flag parts this narrow or narrower for hold-down (metres). Null: Sawhorse's default,
   * 4 in, or 100 mm in a metric document. Not a standard: none was found. */
  holdDown: number | null;
  /** Label paper and size, and whether to draw a light cut line round each label (for plain
   * paper). */
  labels: { paper: LabelPaper; size: string; outlines: boolean };
}

/** Sawhorse's own hold-down default, not a standard: the docs name 3 in nailers, 4 in
 * stretchers and drawer sides (4 9/16 in in the starting drawer base) as the parts that need
 * hold-down most, and no source gives a threshold, so it is wide enough to take all three. */
export const HOLD_DOWN_DEFAULT = { inch: 5 * 0.0254, metric: 0.125 };

export function holdDownOf(p: JobPrefs, metric: boolean): number {
  return p.holdDown ?? (metric ? HOLD_DOWN_DEFAULT.metric : HOLD_DOWN_DEFAULT.inch);
}

/** The defaults, for the bits the shop has: pockets with the down-cut, holes and narrow
 * grooves with the 1/8 in end mill (the research's rows for those jobs, §8a), cutouts with the
 * profile bit. A seeded bit that is gone is none. */
export function defaultJobs(tools: Tool[]): JobPrefs {
  const has = (id: string) => (tools.some((t) => t.id === id) ? id : null);
  return {
    toolLayers: true,
    tools: { cutout: null, pocket: has("seed-downcut"), narrow: has("seed-endmill"), hole: has("seed-endmill") },
    // The most cautious of the materials: a laminate face, so the warnings for it show until
    // the material is set.
    material: "laminate-bb",
    materials: {},
    holdDown: null,
    labels: { paper: "letter", size: LABEL_SIZES[0].id, outlines: true },
  };
}

/** The job prefs read back from storage: anything that does not make sense is the default's. */
export function readJobs(x: unknown, tools: Tool[]): JobPrefs {
  const d = defaultJobs(tools);
  if (!x || typeof x !== "object") return d;
  const o = x as Record<string, unknown>;
  const t = (o.tools && typeof o.tools === "object" ? o.tools : {}) as Record<string, unknown>;
  const id = (v: unknown, fallback: string | null) => (v === null ? null : typeof v === "string" && tools.some((k) => k.id === v) ? v : fallback);
  const l = (o.labels && typeof o.labels === "object" ? o.labels : {}) as Record<string, unknown>;
  const hd = o.holdDown;
  return {
    tools: { cutout: id(t.cutout, d.tools.cutout), pocket: id(t.pocket, d.tools.pocket), narrow: id(t.narrow, d.tools.narrow), hole: id(t.hole, d.tools.hole) },
    toolLayers: o.toolLayers !== false,
    material: MATERIALS.some((m) => m.id === o.material) ? (o.material as MaterialId) : d.material,
    materials: Object.fromEntries(
      Object.entries(o.materials && typeof o.materials === "object" ? (o.materials as Record<string, unknown>) : {})
        .filter(([k, v]) => k.length <= 200 && MATERIALS.some((m) => m.id === v))
        .slice(0, 200),
    ) as Record<string, MaterialId>,
    holdDown: typeof hd === "number" && Number.isFinite(hd) && hd > 0 && hd <= 1 ? hd : null,
    labels: {
      paper: l.paper === "a4" ? "a4" : "letter",
      size: typeof l.size === "string" && LABEL_SIZES.some((s) => s.id === l.size) ? l.size : d.labels.size,
      outlines: typeof l.outlines === "boolean" ? l.outlines : d.labels.outlines,
    },
  };
}

/** The material a stock's feeds are read for: its own, or the shop's. */
export function materialFor(p: JobPrefs, stock: string): MaterialId {
  return p.materials[stock] ?? p.material;
}

export function labelSizeOf(p: JobPrefs): LabelSize {
  return LABEL_SIZES.find((s) => s.id === p.labels.size) ?? LABEL_SIZES[0];
}
