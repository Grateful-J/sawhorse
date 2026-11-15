import type { Sizes } from "./cabinet.js";
import type { Frame } from "./row.js";

export interface Stamp {
  p?: number;
  n?: number;
  k?: number[];
}
export interface Kept extends Stamp {
  d?: Record<string, unknown>;
  m?: 1;
  sizes?: Partial<Sizes>;
  frame?: unknown;
}
export function pack(s: Sizes, metric: boolean): { d: Record<string, unknown>; m?: 1 };
export function unpack(kept: Kept | null | undefined, metric: boolean): Sizes | null;
export function validFrame(f: unknown): Frame | null;
export function prune<T>(all: Record<string, T>, live: Set<string>, budget: number): Record<string, T>;
export function stampOf(kids: number[]): Stamp;
export function madeWith(kept: Stamp, id: number): boolean;
export function describes(kept: Stamp | null | undefined, kids: number[]): boolean;
export function strangers(kept: Stamp, kids: number[]): number[];
export function keptFor<T extends Stamp>(all: Record<string, T>, id: number, kids: number[]): { key: string; kept: T } | null;
export function keep<T extends Stamp>(all: Record<string, T>, id: number, entry: T): Record<string, T>;
export function liveKeysOf(all: Record<string, unknown>, nodes: { id: number; parent: number | null }[]): Set<string>;
export function keptMetric(kept: Kept, fallback: boolean): boolean;
export const BUDGET: { cabinets: number; bases: number };
