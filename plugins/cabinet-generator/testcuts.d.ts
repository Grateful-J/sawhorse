import type { Part, RunnerLength, Sizes, plan } from "./cabinet.js";
import type { V3 } from "./mesh.js";

export type TestKind = "machine" | "ladders" | "drawer" | "door";
export type LadderKind = "dado" | "back" | "bottom";
export const TEST_TAG: string;
export const TEST_KINDS: TestKind[];
export const TEST_TITLES: Record<TestKind, string>;
export const LADDER_STEPS: number;
export function measureText(m: number, metric: boolean): string;
export function clearanceText(m: number, metric: boolean): string;
export function areaText(a: number, metric: boolean): string;
/** Five clearances a step apart (0.1 mm, or 0.004 in), one under the current and three over, within 0 to 1 mm. */
export function clearanceSteps(fit: number, metric: boolean): number[];
export function validSteps(v: unknown): number[] | null;
export function partArea(parts: Part[]): number;
export interface MachineSpec {
  side: number;
  slot: { width: number; length: number; depth: number };
  pocket: { side: number; depth: number };
}
export function machineCheck(s: Sizes, metric: boolean): { error: string | null; part: Part | null; spec: MachineSpec | null };
export interface Coupon {
  kind: LadderKind;
  name: string;
  part: Part;
  host: string;
  mating: string;
  stock: number;
  matingStock: number;
  depth: number;
  widths: number[];
}
export function ladderCoupons(s: Sizes, metric: boolean, steps?: number[]): { error: string | null; coupons: Coupon[]; skipped: string[]; steps: number[] };
export function miniDrawer(s: Sizes, metric: boolean): { error: string | null; sizes: Sizes | null; planned: ReturnType<typeof plan> | null; runner: RunnerLength | null };
export function miniDoor(s: Sizes, metric: boolean): { error: string | null; sizes: Sizes | null; planned: ReturnType<typeof plan> | null };
export interface TestCut {
  error: string | null;
  kind: TestKind;
  name: string;
  parts: Part[];
  area: number;
  size: V3 | null;
  proves: string;
  stock: string;
  rows: string[][];
  holes: string[][];
  columns: string[];
  steps: number[];
  coupons: { kind: LadderKind; name: string; widths: number[]; depth: number }[];
  skipped: string[];
  sizes: Sizes | null;
}
export function testCut(kind: TestKind, s: Sizes, metric: boolean, steps?: number[]): TestCut;
