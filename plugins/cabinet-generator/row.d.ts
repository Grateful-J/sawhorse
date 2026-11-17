import type { Part } from "./cabinet.js";
import type { V3 } from "./mesh.js";

export interface Frame {
  linear: number[][];
  translation: V3;
}
/** What stands beside a cabinet's side in its row, from its side outward: a finished end panel,
 * a filler, or an appliance opening (space where no cabinet goes), each its width along the row.
 * `open` names an opening's appliance preset (trim.js APPLIANCES). */
export interface Piece {
  kind: "panel" | "filler" | "opening";
  width: number;
  label: string;
  open?: string;
}
/** A cabinet as a row sees it: its box and where it stands (its own axes into the model), and what
 * stands beside its sides (none: the row is its boxes side by side). */
export interface Cab {
  id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
  world: Frame;
  ends?: { left: Piece[]; right: Piece[] };
}
/** One thing along a row, from x0 to x1 in the first cabinet's axes: a cabinet, or a piece beside
 * one (`cab` is that cabinet's place in the row, `side` the side it stands on). */
export interface RowItem {
  kind: "cabinet" | Piece["kind"];
  x0: number;
  x1: number;
  cab: number;
  label: string;
  open?: string;
  side?: "left" | "right";
}
export type Place = "right" | "left" | "cornerRight" | "cornerLeft";
export const TOUCH: number;
export const IDENTITY: Frame;
export function compose(a: Frame, b: Frame): Frame;
export function apply(m: Frame, p: V3): V3;
export function applyVector(m: Frame, v: V3): V3;
export function translation(t: V3): Frame;
export function invert(m: Frame): Frame;
export function rigid(m: Frame): boolean;
export function nextName(name: string, taken?: Set<string>): string;
export function freeName(name: string, taken: Set<string>): string;
export function reach(c: { ends?: Cab["ends"] }, side: "left" | "right"): number;
export function touchesRight(a: Cab, b: Cab): boolean;
export function rowOf<C extends Cab>(cabs: C[], id: number): C[];
export function rightOf<C extends Cab>(cabs: C[], id: number): C[];
export function placeNext(anchor: Cab, size: { width: number; depth: number; ends?: Cab["ends"] }, where: Place, filler?: number): Frame;
export function lineUp(cabs: Cab[], all?: Cab[]): Map<number, Frame>;
export interface BaseSizes {
  height: number;
  setback: number;
  backInset: number;
  ends: "none" | "left" | "right" | "both";
  stock: "plywood" | "saw" | "lumber";
  thickness: number;
  joints: "dado" | "butt";
  dadoDepth: number;
  fit: number;
  spacing: number;
  maxLength: number;
  /** A toe-kick skin in front of the front rail, in the row's first cabinet's carcass, door or back plywood, or none. */
  skin: "none" | "carcass" | "doors" | "back";
}
export function baseDefaults(metric: boolean): BaseSizes;
export function lumberDefaults(metric: boolean): { thickness: number; maxLength: number; joints: "butt" };
export function normalizeBase(saved: Partial<BaseSizes> | null | undefined, metric: boolean): BaseSizes;
export const BASE_LUMBER: { name: string; color: [number, number, number, number] };
export function rowLayout(row: Cab[]): { starts: number[]; length: number; depth: number; depths: number; items: RowItem[] };
export function solidRuns(items: RowItem[]): { runs: [number, number][]; joints: number[] };
export function baseIssue(b: BaseSizes, depth: number): string | null;
export function sections(x0: number, x1: number, joints: number[], max: number): [number, number][];
export function sleepers(a: number, b: number, joints: number[], T: number, spacing: number): number[];
/** The planned ladders in the frame's axes. */
export interface Layout {
  ladders: { tag: string; x0: number; x1: number; sleepers: number[] }[];
  front: number;
  back: number;
  thickness: number;
  depth: number;
  /** Where the row starts when a filler stands left of its first cabinet (below 0). */
  start?: number;
}
export function planBase(
  row: Cab[],
  b: BaseSizes,
  carcassMaterial?: string,
  skinStock?: { thickness: number; material: string },
): { error: string | null; parts: Part[]; length: number; depth: number; depths: number; at: V3; ladders: number; sleepers: number; notes: string[][]; layout: Layout };
export function sawStripDefaults(metric: boolean): { maxLength: number; joints: "butt" };
export function cncLength(metric: boolean): number;
export function boxesOf(parts: Part[]): { min: V3; max: V3 }[];
export function edgesOf(b: { min: V3; max: V3 }): [V3, V3][];
export function ladderPicture(
  layout: Layout,
  length: number,
  format: (m: number) => string,
  width?: number,
): {
  width: number;
  height: number;
  rects: { x: number; y: number; w: number; h: number; kind: "rail" | "sleeper" | "outline" }[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  texts: { x: number; y: number; text: string; align: "left" | "center" | "right"; size: number }[];
};
export function cutRows(parts: Part[]): { name: string; qty: number; length: number; width: number; thickness: number; material: string }[];
/** Turned the same way (the linear part is the identity, within a hair). */
export function unturned(r: Frame): boolean;
