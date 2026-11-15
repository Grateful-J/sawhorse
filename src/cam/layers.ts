// What a CNC file's layer asks the router to do, read from its name (src/nesting/dxf.ts
// writes them): PROFILE_THRU, CUTOUT_THRU, POCKET_<depth>MM, DRILL_D<dia>MM_<depth>MM,
// DRILL_D<dia>MM_THRU, each perhaps FLIP_ first, and in DXF R12 with a P for the point.

export type Operation = "profile" | "pocket" | "hole";

export const OPERATIONS: { id: Operation; label: string }[] = [
  { id: "profile", label: "Profile, through the sheet" },
  { id: "pocket", label: "Pocket or dado" },
  { id: "hole", label: "Hole, pocketed with an end mill" },
];

/** A hole the router pockets: its diameter and depth in metres (depth null: through). */
export interface Hole {
  layer: string;
  diameter: number;
  depth: number | null;
}

export interface LayerJob {
  op: Operation;
  /** A pocket's depth in metres (null: through the sheet). */
  depth: number | null;
  hole: Hole | null;
  /** The cut is in the part's other face, after it is turned over. */
  flip: boolean;
}

/** The hole layers the cabinet generator's files hold today. */
export const HOLE_LAYERS = ["DRILL_D35MM_13MM", "DRILL_D5MM_13MM", "DRILL_D5MM_11.5MM", "DRILL_D5MM_10MM", "DRILL_D6MM_10MM", "DRILL_D4.76MM_THRU", "DRILL_D5MM_THRU"] as const;

const MM = (s: string) => Number(s.replace("P", ".")) / 1000;

/** The job a layer asks for, or null for a layer that is not cut (STOCK, LABELS) or not known. */
export function layerJob(name: string): LayerJob | null {
  const flip = name.startsWith("FLIP_");
  const n = flip ? name.slice(5) : name;
  if (n === "PROFILE_THRU" || n === "CUTOUT_THRU") return { op: "profile", depth: null, hole: null, flip };
  let m = /^POCKET_(\d+(?:[.P]\d+)?)MM$/.exec(n);
  if (m) return { op: "pocket", depth: MM(m[1]), hole: null, flip };
  m = /^DRILL_D(\d+(?:[.P]\d+)?)MM_(?:(\d+(?:[.P]\d+)?)MM|THRU)$/.exec(n);
  if (m) return { op: "hole", depth: m[2] ? MM(m[2]) : null, hole: { layer: name, diameter: MM(m[1]), depth: m[2] ? MM(m[2]) : null }, flip };
  return null;
}

/** A hole layer's hole (null for any other layer). */
export function holeOf(name: string): Hole | null {
  return layerJob(name)?.hole ?? null;
}
