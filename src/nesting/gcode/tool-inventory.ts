// Pure preflight for integration with the shop tool library. A match is a necessary
// geometric check, never an assertion that the tool or setup is safe for machining.
export interface ShopCutter {
  name: string;
  diameter: number | null;
  cuttingLength: number | null;
  shank: number | null;
  /** This must be an explicit confirmation, not a starter catalog entry. */
  confirmedOwned: boolean;
}
export interface ToolNeed {
  /** The narrowest known width, or null when geometry has not been measured. */
  width: number | null;
  /** Required reach, including any planned breakthrough, in metres. */
  depth: number | null;
}
export interface InventoryResult {
  candidates: ShopCutter[];
  incomplete: string[];
  /** No candidate means 'not established', not necessarily that no tool exists. */
  found: boolean;
}
const positive = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

export function findPocketCutters(need: ToolNeed, cutters: readonly ShopCutter[], acceptedShanks: readonly number[] | null): InventoryResult {
  const incomplete: string[] = [];
  if (!positive(need.width)) incomplete.push("feature width is unknown");
  if (!positive(need.depth)) incomplete.push("required cutting depth is unknown");
  if (!acceptedShanks || !acceptedShanks.length || acceptedShanks.some(s => !positive(s))) incomplete.push("compatible collets are unknown");
  const candidates: ShopCutter[] = [];
  for (const tool of cutters) {
    if (!tool.confirmedOwned) continue;
    if (!positive(tool.diameter) || !positive(tool.cuttingLength) || !positive(tool.shank)) {
      incomplete.push(`${tool.name}: cutter dimensions are incomplete`);
      continue;
    }
    if (!positive(need.width) || !positive(need.depth) || !acceptedShanks?.length || acceptedShanks.some(s => !positive(s))) continue;
    if (tool.diameter >= need.width || tool.cuttingLength < need.depth || !acceptedShanks.some(s => Math.abs(s - tool.shank!) <= 1e-6)) continue;
    candidates.push(tool);
  }
  return { candidates, incomplete, found: candidates.length > 0 };
}
