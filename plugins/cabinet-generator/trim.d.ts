import type { Part, Sizes, plan } from "./cabinet.js";
import type { Cab, Piece } from "./row.js";
import type { OpenKind } from "./trimsizes.js";

/** A length as a maker prints it: inches, or millimetres where the maker prints them. */
export interface Printed {
  in: number;
  mm?: number;
}
export interface Appliance {
  label: string;
  short: string;
  maker: string;
  kind: "dishwasher" | "range" | "fridge" | "other";
  start: Printed | null;
  width?: { min: Printed; max?: Printed };
  height?: { min: Printed; max?: Printed; approx?: boolean };
  overhead?: number;
  source: string;
}
export const APPLIANCES: Record<Exclude<OpenKind, "none">, Appliance>;
export const OTR: { width: number; floorToTop: number; depth: number; source: string };
export const KCMA: { depth: { in: number; mm: number }; height: { in: number; mm: number } };
export const AWS_SCRIBE: number;
export const KOHLER: { from: number; to: number; base: Printed; note: string }[];
export const KOHLER_APRON: { base: Printed };
export function openingStart(kind: OpenKind, metric: boolean): number;
export function trimUsed(s: Sizes): boolean;
export function frontProud(s: Sizes): number;
export function trimEnds(s: Sizes): { left: Piece[]; right: Piece[] };
export function trimParts(s: Sizes, metric: boolean): { error: string | null; parts: Part[]; rows: string[][] };
export function planCabinet(s: Sizes, metric: boolean): ReturnType<typeof plan>;
export function trimChecks(s: Sizes, metric: boolean): string[];
export type Checked = Cab & { sizes: Sizes; metric?: boolean };
export function rowChecks(row: Checked[], all: Checked[], metric: boolean): string[];
