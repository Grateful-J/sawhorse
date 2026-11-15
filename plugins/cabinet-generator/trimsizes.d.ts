export type EndKind = "none" | "panel" | "filler" | "scribe";
export type OpenKind = "none" | "dw-ge" | "dw-bosch" | "dw-bosch-int" | "range-free" | "range-slide" | "fridge" | "other";
export type SkinStock = "none" | "carcass" | "doors" | "back";
/** A cabinet's row features: what covers its sides, an opening beside it, a toe-kick skin, its sink, a microwave under it. */
export type TrimSizes = {
  endLeft: EndKind;
  endRight: EndKind;
  endStock: "carcass" | "doors";
  endDown: "floor" | "box";
  endFront: "doors" | "carcass";
  endBand: "front" | "frontBottom" | "frontTopBottom" | "none";
  endScribe: number;
  fillerLeft: number;
  fillerRight: number;
  openLeft: OpenKind;
  openRight: OpenKind;
  openLeftWidth: number;
  openRightWidth: number;
  kickSkin: SkinStock;
  sinkWidth: number;
  sinkApron: boolean;
  otr: boolean;
};
export const END_KINDS: readonly EndKind[];
export const OPEN_KINDS: readonly OpenKind[];
export const SKIN_STOCKS: readonly SkinStock[];
export function trimDefaults(metric: boolean): TrimSizes;
export function normalizeTrim(s: Record<string, unknown>, d: TrimSizes): TrimSizes;
