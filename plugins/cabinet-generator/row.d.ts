import type { Part } from "./cabinet.js";
import type { V3 } from "./mesh.js";

export interface Frame {
  linear: number[][];
  translation: V3;
}
/** A cabinet as a row sees it: its box and where it stands (its own axes into the model). */
export interface Cab {
  id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
  world: Frame;
}
export type Place = "right" | "left" | "cornerRight" | "cornerLeft";
export const TOUCH: number;
export const IDENTITY: Frame;
export function compose(a: Frame, b: Frame): Frame;
export function apply(m: Frame, p: V3): V3;
export function applyVector(m: Frame, v: V3): V3;
export function translation(t: V3): Frame;
export function invert(m: Frame): Frame;
export function touchesRight(a: Cab, b: Cab): boolean;
export function rowOf<C extends Cab>(cabs: C[], id: number): C[];
export function rightOf<C extends Cab>(cabs: C[], id: number): C[];
export function placeNext(anchor: Cab, size: { width: number; depth: number }, where: Place, filler?: number): Frame;
export function lineUp(cabs: Cab[]): Map<number, Frame>;
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
}
export function baseDefaults(metric: boolean): BaseSizes;
export function lumberDefaults(metric: boolean): { thickness: number; maxLength: number; joints: "butt" };
export function normalizeBase(saved: Partial<BaseSizes> | null | undefined, metric: boolean): BaseSizes;
export const BASE_LUMBER: { name: string; color: [number, number, number, number] };
export function rowLayout(row: Cab[]): { starts: number[]; length: number; depth: number; depths: number };
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
}
export function planBase(
  row: Cab[],
  b: BaseSizes,
  carcassMaterial?: string,
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
