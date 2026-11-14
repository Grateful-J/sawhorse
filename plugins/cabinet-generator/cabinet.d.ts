import type { Mesh, V3 } from "./mesh.js";

export type Layout = "shelves" | "doors" | "drawers" | "mixed";
export type Front = "overlay" | "inset";
export type Pull = "face" | "undermount";
export interface Sizes {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  shelves: number;
  back: boolean;
  toeKick: number;
  layout: Layout;
  drawers: number;
  front: Front;
  dados: boolean;
  hardware: boolean;
  hingeInset: number;
  slideClearance: number;
  slideSetback: number;
  pull: Pull;
  pullSpacing: number;
}
export interface Part {
  name: string;
  blank: V3;
  copies: { at: V3 | { linear: number[][]; translation: V3 }; name?: string }[];
  mesh: Mesh;
}
export function isMetric(system: string): boolean;
export function defaults(metric: boolean): Sizes;
export function normalize(saved: Partial<Sizes> | null | undefined, metric: boolean): Sizes;
export function phrase(s: Sizes, format: (m: number) => string, metric: boolean): string;
export function issue(s: Sizes, metric: boolean): string | null;
export function plan(s: Sizes, metric: boolean): { error: string | null; parts: Part[]; rows: string[][] };
export function importOp(parts: Part[], at: V3 | { linear: number[][]; translation: V3 } | undefined, assemblyName: string, instanceName: string): { op: string; [field: string]: unknown };
