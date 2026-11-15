import type { Mesh, V3 } from "./mesh.js";

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
export interface BomItem {
  item: string;
  sku?: string;
  qty: number;
  unit: "each" | "pair" | "m";
  /** Bought once for the shop, however many parts carry it (a drilling template). */
  once?: boolean;
}
export interface Sizes {
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
}
export interface Part {
  name: string;
  material: string;
  blank: V3;
  copies: { at: V3; name?: string }[];
  mesh: Mesh;
  grain: Grain;
  /** What is bought for each copy (hinges on a door, runners on a drawer front, pins on a shelf). */
  bom?: BomItem[];
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
