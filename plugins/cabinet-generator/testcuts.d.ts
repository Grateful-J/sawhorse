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
/** A ladder as cut: the mating stock's thickness then, and each dado's width. */
export interface CutLadder {
  kind: LadderKind;
  name: string;
  mating: number;
  widths: number[];
}
/** The joint ladders as added, kept in the document, with the node they were added as. */
export interface LadderRecord {
  steps: number[];
  ladders: CutLadder[];
  node: number;
}
export function matingNow(kind: LadderKind, s: Sizes): number;
export function ladderRecord(t: TestCut, node: number): LadderRecord;
export function validLadderRecord(v: unknown): LadderRecord | null;
export function liveLadders(mine: LadderRecord | null, kept: LadderRecord | null, there: (node: number) => boolean): LadderRecord | null;
export function pickOptions(l: CutLadder, s: Sizes, metric: boolean): [string, string][];
/** The clearance the picks come to: the width that fit less the mating stock typed now, held to 0 to 1 mm. */
export function fitFromPicks(ladders: CutLadder[], picks: Record<string, string>, s: Sizes, metric: boolean): { value: number | null; text: string; tone: "info" | "warning" };
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
  coupons: { kind: LadderKind; name: string; widths: number[]; depth: number; mating: number }[];
  skipped: string[];
  sizes: Sizes | null;
}
export function testCut(kind: TestKind, s: Sizes, metric: boolean, steps?: number[]): TestCut;
