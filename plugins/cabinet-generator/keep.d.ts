import type { Sizes } from "./cabinet.js";
import type { Frame } from "./row.js";

export interface Kept {
  d?: Record<string, unknown>;
  m?: 1;
  sizes?: Partial<Sizes>;
  frame?: unknown;
}
export function pack(s: Sizes, metric: boolean): { d: Record<string, unknown>; m?: 1 };
export function unpack(kept: Kept | null | undefined, metric: boolean): Sizes | null;
export function validFrame(f: unknown): Frame | null;
export function prune<T>(all: Record<string, T>, live: Set<string>, budget: number): Record<string, T>;
export const BUDGET: { cabinets: number; bases: number };
