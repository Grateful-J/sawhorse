import type { Mesh, V3 } from "./mesh.js";

export type Layout = "shelves" | "doors" | "drawers" | "mixed" | "trash";
export type DoorCount = "auto" | "one" | "two";
export type HingeSide = "left" | "right";
export type Nailers = "none" | "top" | "both";
export type TrashBins = "one" | "side" | "deep";
export type Front = "overlay" | "inset";
export type Base = "toekick" | "none";
export type Slides = "tandem" | "movento";
export type BackMount = "groove" | "butt";
export type DrawerPull = "center" | "top" | "notch" | "none";
export type DoorPull = "vertical" | "horizontal" | "none";
export type DoorPullFrom = "top" | "bottom";
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
  drawers: number;
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
  /** Drawer length in mm (229, 305, ...), or 0 for the longest that fits. */
  runner: number;
  hardware: boolean;
  hingeInset: number;
  /** Blum boring distance (metres, 3 to 7 mm): the cup's edge from the door's edge. */
  cupDistance: number;
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
}
export interface RunnerLength {
  nl: number;
  part: string;
  minDepth: number;
  a: number;
  b: number;
}
export interface Runner {
  name: string;
  lengths: RunnerLength[];
  screwHeight: number;
  bottomClearance: number;
  heightDeduct: number;
  rearNotch: number;
  thinShift: number;
  lock: string;
}
export const RUNNERS: Record<Slides, Runner>;
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
export function plan(s: Sizes, metric: boolean): { error: string | null; parts: Part[]; rows: string[][]; runner: RunnerLength | null; holes: number };
export function importOp(
  parts: Part[],
  at: V3 | { linear: number[][]; translation: V3 } | undefined,
  assemblyName: string,
  instanceName: string,
  materials?: { name: string; color: [number, number, number, number] }[],
): { op: string; [field: string]: unknown };
