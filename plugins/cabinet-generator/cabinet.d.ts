import type { Mesh, V3 } from "./mesh.js";
import type { TrimSizes } from "./trimsizes.js";

export type Layout = "shelves" | "doors" | "drawers" | "mixed" | "trash";
export type DoorCount = "auto" | "one" | "two";
export type HingeSide = "left" | "right";
export type Nailers = "none" | "top" | "both";
export type TrashBins = "one" | "side" | "deep";
/** A Rev-A-Shelf bin (sized from its drawing), or one measured by hand. */
export type Bin = "rv35" | "rv50" | "rv27" | "custom";
export type Front = "overlay" | "inset";
export type Base = "toekick" | "none";
export type Slides = "tandem" | "movento";
export type BackMount = "groove" | "butt";
/** What holds the rails to the sides with no blind dados: nothing drilled (butt joints), 8 mm dowels, or Confirmat screws. */
export type Fastener = "none" | "dowels" | "confirmat";
/** Shelf-pin rows: a band around each shelf, or the full height on Blum Process 32's grid. */
export type LineBoring = "shelves" | "full";
export type DrawerPull = "center" | "top" | "notch" | "none";
export type DoorPull = "vertical" | "horizontal" | "none";
export type DoorPullFrom = "top" | "bottom";
export type Top = "full" | "stretchers";
export type ShelfType = "fixed" | "adjustable";
export type DrawerFronts = "equal" | "graduated";
/** Blum Inc. (US, inch lengths) or Blum's European catalogue (metric lengths). */
export type Catalog = "us" | "eu";
export type Run = "vertical" | "horizontal";
export type SideGrain = "vertical" | "any";
export type HiddenGrain = "any" | "length";
/** The cut list's grain: along a part's length or width, or none (free to turn on the sheet). */
export type Grain = "length" | "width" | "none";
/** Blum CLIP top hinges with BLUMOTION (soft close) or self-closing: what the shopping list names. */
export type HingeClose = "soft" | "self";
/** What is bought for each copy of a part beyond its wood (the kernel's part attribute `bom`). */
/** A band's thickness: one REHAU sells (0.018 in, 1, 2, 3 mm), or measured and typed. */
export type BandSize = "0.018in" | "1" | "2" | "3" | "custom";
/** Which band a kind of part takes: none, or band 1 to 3 of the list. */
export type BandPick = "none" | "1" | "2" | "3";
/** A part's edge: the front edge of a carcass part or shelf; a door's or drawer front's left, right, bottom or top. */
export type EdgeName = "front" | "left" | "right" | "bottom" | "top";
/** One banded edge of a part: which edge, its band (1 to 3), the band's thickness, width and name,
 * and the edge's banded length, finished, from span[0] to span[1] along it (a notch at an end shortens it). */
export interface PartBand {
  edge: EdgeName;
  band: number;
  thickness: number;
  width: number;
  name: string;
  length: number;
  span: [number, number];
  /** The edge's whole length, notches and all: the band an edgebander runs along it (and the band counted). */
  run: number;
}
/** One band of the list: its number, thickness and width (metres), name, and how a row or the shopping list names it. */
export interface Band {
  n: number;
  thickness: number;
  width: number;
  name: string;
  label: string;
}
export interface BomItem {
  item: string;
  sku?: string;
  qty: number;
  unit: "each" | "pair" | "m";
  /** Bought once for the shop, however many parts carry it (a drilling template). */
  once?: boolean;
}
export interface Sizes extends TrimSizes {
  /** The cabinet's name: its instance in the model, and its files. */
  name: string;
  width: number;
  height: number;
  depth: number;
  /** Cabinet and door stock, measured. */
  thickness: number;
  frontThickness: number;
  drawerThickness: number;
  backThickness: number;
  layout: Layout;
  shelves: number;
  /** Adjustable shelves sit on 5 mm pins on the System 32 grid; fixed ones in dados. */
  shelfType: ShelfType;
  drawers: number;
  /** A drawer cabinet's fronts: all one height, or a shorter top drawer (drawerFront) and the rest equal. */
  drawerFronts: DrawerFronts;
  /** A full top panel, or two stretchers (a base cabinet under a countertop). */
  top: Top;
  /** Each stretcher's width, front to back. */
  stretcher: number;
  /** Which way the grain runs: doors, drawer faces, sides; the hidden parts free to turn or along their length. */
  grainDoors: Run;
  grainFronts: Run;
  grainSides: SideGrain;
  grainHidden: HiddenGrain;
  /** Drawers over a door: each drawer front's height (metres). A drawer cabinet's fronts are all one height. */
  drawerFront: number;
  base: Base;
  toeKick: number;
  toeSetback: number;
  back: boolean;
  backMount: BackMount;
  backInset: number;
  backGrooveDepth: number;
  front: Front;
  gap: number;
  dados: boolean;
  dadoDepth: number;
  dadoStop: number;
  fit: number;
  bit: number;
  /** Dowels or Confirmat screws in place of blind dados (dados is then false). */
  fastener: Fastener;
  /** A Confirmat screw's length in mm: 50 or 70, Häfele's self-countersinking connector. */
  confirmatLength: number;
  lineBoring: LineBoring;
  slides: Slides;
  catalog: Catalog;
  /** Drawer length in mm (229, 305, ...), or 0 for the longest that fits. */
  runner: number;
  hardware: boolean;
  hingeInset: number;
  /** Blum boring distance (metres, 3 to 7 mm): the cup's edge from the door's edge. */
  cupDistance: number;
  /** Which CLIP top hinge the shopping list names (the holes are the same). */
  hingeClose: HingeClose;
  drawerPull: DrawerPull;
  drawerPullFromTop: number;
  pullSpacing: number;
  notchWidth: number;
  notchDepth: number;
  doorPull: DoorPull;
  doorPullFrom: DoorPullFrom;
  doorPullEnd: number;
  doorPullEdge: number;
  doorPullSpacing: number;
  pullHole: number;
  doors: DoorCount;
  /** The hinge side of a single door; a pair hinges on both. */
  hingeSide: HingeSide;
  nailers: Nailers;
  nailerHeight: number;
  trashBins: TrashBins;
  bin: Bin;
  /** A bin's cutout across the cabinet, and front to back. */
  binWidth: number;
  binLength: number;
  /** The bin's lip above the tray's bottom: where the frame sits. */
  binHeight: number;
  trayHeight: number;
  /** Edge banding on (off: every part is cut at its finished size, as before banding came). */
  band: boolean;
  /** How many bands are listed (1 to 3). */
  bandCount: number;
  /** Each band: a thickness REHAU sells or "custom" (then its typed `Thick`, metres), a name or colour, and its width. */
  band1Size: BandSize;
  band1Thick: number;
  band1Name: string;
  band1Width: number;
  band2Size: BandSize;
  band2Thick: number;
  band2Name: string;
  band2Width: number;
  band3Size: BandSize;
  band3Thick: number;
  band3Name: string;
  band3Width: number;
  /** Which band doors and drawer fronts (all four edges), the carcass's front edges and adjustable shelves' front edges take. */
  bandFronts: BandPick;
  bandCarcass: BandPick;
  bandShelves: BandPick;
  /** What an edgebander's jointing cutter takes off each banded edge (metres, 0 to 3 mm; iron-on 0). */
  bandPremill: number;
  /** The waste allowance per banded side (metres; Microvellum's default, 1 in). Microvellum's 5% is the shopping list's banding overage. */
  bandWasteEnd: number;
}
export interface Part {
  name: string;
  material: string;
  blank: V3;
  copies: { at: V3; name?: string }[];
  mesh: Mesh;
  grain: Grain;
  /** What is bought for each copy (hinges on a door, runners on a drawer front, pins on a shelf, banding by the metre). */
  bom?: BomItem[];
  /** A banded part: its finished size (blank plus bands; `blank` is then the cut size), how far the
   * blank's corner sits inside the finished part's (each copy's `at` is the blank's corner), and its banded edges. */
  finished?: V3;
  offset?: V3;
  bands?: PartBand[];
}
export interface RunnerLength {
  nl: number;
  part: string;
  minDepth: number;
  /** System 32 screw holes from the cabinet front (mm). */
  screws: number[];
}
export interface Runner {
  name: string;
  lengths: RunnerLength[];
  screwHeight: number;
  bottomClearance: number;
  heightDeduct: number;
  /** How much shorter the box is than the runner (mm): 0 (US), 10 (Europe). */
  boxShort: number;
  minSide: number;
  maxSide: number;
  sides: string;
  rearNotch: number;
  thinShift: number;
  lock: string;
  extra?: string;
}
export const RUNNERS: Record<Slides, Runner>;
export const BINS: Record<Exclude<Bin, "custom">, { label: string; rim: [number, number]; height: number; drop: number; cut: [number, number] }>;
export const RUNNERS_EU: Record<Slides, Runner>;
export function runnerLine(s: { slides: Slides; catalog: Catalog }): Runner;
export const MATERIALS: Record<"carcass" | "back" | "box" | "doors" | "drawerFronts", { name: string; color: [number, number, number, number] }>;
export interface Preset {
  id: string;
  label: string;
  name: string;
  layout: Layout;
  shelves: number;
  drawers: number;
  base: Base;
  in: [number, number, number];
  mm: [number, number, number];
  doorPullFrom?: DoorPullFrom;
  doorPullEnd?: [number, number];
  nailers?: Nailers;
  drawerPull?: DrawerPull;
  top?: Top;
  trashBins?: TrashBins;
  bin?: Bin;
  /** The doors, when not the defaults' (automatic). */
  doors?: DoorCount;
  /** The hinges' inset from the door's ends, inches then millimetres, when not the defaults'. */
  hingeInset?: [number, number];
}
export const PRESETS: Preset[];
export function applyPreset(s: Sizes, id: string, metric: boolean): Sizes;
export function exactThickness(m: number, metric: boolean): string;
export function summary(s: Sizes, planned: { parts: Part[]; rows: string[][]; runner: RunnerLength | null; holes: number }, metric: boolean): string;
export function backInsetOf(s: Sizes): number;
export function isMetric(system: string): boolean;
export function defaults(metric: boolean): Sizes;
export function normalize(saved: (Partial<Sizes> & Record<string, unknown>) | null | undefined, metric: boolean): Sizes;
export function phrase(s: Sizes, format: (m: number) => string, metric: boolean): string;
export function issue(s: Sizes, metric: boolean): string | null;
/** The planner's checks on the settings alone, before any part is laid out: the message, or null. */
export function validate(s: Sizes, metric: boolean): string | null;
/** A hole keeps 3 mm of wood (WEB) to the part's edges and to every cut that reaches it. */
/** Edge banding's constants: the thicknesses offered, the limits, Microvellum's default waste. */
export const BAND: {
  sizes: [Exclude<BandSize, "custom">, number, string][];
  minThick: number;
  maxThick: number;
  maxWidth: number;
  maxPremill: number;
  maxWasteEnd: number;
  maxName: number;
  wasteEnd: number;
};
/** Where each edge is on a part's blank: its axis, and the low (0) or high (1) end. */
/** What a banded edge with a notch at an end asks of you (a row of Cuts and holes says it). */
export const END_NOTCH: string;
export const EDGE_AXES: Record<EdgeName, [0 | 1 | 2, 0 | 1]>;
/** The bands listed (1 to bandCount), each with its thickness. */
export function bandList(s: Sizes, metric: boolean): Band[];
/** The band a kind of part takes: null when not banded, undefined when it names a band past the list. */
export function bandFor(s: Sizes, kind: "fronts" | "carcass" | "shelves", metric: boolean): Band | null | undefined;
/** A part's blank with its banded edges cut short, every cut kept where it is in the finished part; throws what to change when banding would change the part or keep less than 3 mm of wood to a raw edge. */
export function bandPart(name: string, size: V3, prisms: import("./mesh.js").Prism[], holes: import("./mesh.js").Hole[], edges: { edge: EdgeName; band: Band }[], premill: number): { blank: V3; prisms: import("./mesh.js").Prism[]; holes: import("./mesh.js").Hole[]; offset: V3; bands: PartBand[] };
/** Whether a banded edge sits against another part (or in its dado or groove): null, or what. */
export function bandClash(parts: Part[]): string | null;
export function holeClear(size: V3, prisms: import("./mesh.js").Prism[], hole: import("./mesh.js").Hole): boolean;
/** The least wood left between a drilled hole and a cut or an edge (metres). */
export const WEB: number;
/** Blum drawer rules shared by both runners (mm). */
export const BLUM: { insideDeduct: number; bottomRecess: number; minInside: number; hookDia: number; hookDepth: number; hookIn: number; hookUp: number };
/** CLIP top: cup size, its centre's distance from the hinge edge less the boring distance, and the mounting plate's holes (mm). */
export const CUP: { dia: number; depth: number; radius: number; minK: number; maxK: number; plateSetback: number; plateSpacing: number };
/** Hinge mounting plate holes (mm). */
export const PLATE_HOLE: { dia: number; depth: number };
/** Shelf pin holes (mm). */
export const PIN: { dia: number; depth: number; setback: number; pitch: number };
/** Full-height line boring: the lowest hole above the box's bottom, the least room under the top (mm, Blum Process 32). */
export const LINE_BORE: { bottom: number; top: number };
/** Häfele's case dowelling and its assembly dowel's depths (mm; `upTo` inches with the least count). */
export const DOWEL: { dia: number; face: number; edge: number; setback: number; pitch: number; minStock: number; upTo: [number, number][] };
/** Häfele's 7 mm Confirmat: the face's through hole, the edge's pilot, the head (mm), and the self-countersinking lengths' part numbers. */
export const CONFIRMAT: { through: number; pilot: number; head: number; lengths: Record<string, { sku: string }> };
/** What the panel and the rows say of the Confirmat layout. */
export const CONFIRMAT_LAYOUT: string;
/** Where a joint's dowels (or Confirmat screws) go from its front edge, for a joint `d` deep (metres); a string says why not. */
export function dowelLayout(d: number): number[] | string;
export interface BinRoom {
  across: number;
  deep: number;
}
export function plan(s: Sizes, metric: boolean): { error: string | null; parts: Part[]; rows: string[][]; runner: RunnerLength | null; holes: number; room: BinRoom | null };
export function binRoom(s: Sizes, metric: boolean): BinRoom | null;
export function grainFor(s: Sizes, name: string, blank: V3): Grain;
export function flatImportOp(parts: Part[], at: V3 | { linear: number[][]; translation: V3 } | undefined, materials?: { name: string; color: [number, number, number, number] }[]): { op: string; [field: string]: unknown };
export function importOp(
  parts: Part[],
  at: V3 | { linear: number[][]; translation: V3 } | undefined,
  assemblyName: string,
  instanceName: string,
  materials?: { name: string; color: [number, number, number, number] }[],
): { op: string; [field: string]: unknown };
