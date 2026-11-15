import { layerJob } from "../cam/layers";
import type { Shop } from "../cam/store";
import type { Nesting } from "../kernel/types";
import type { NestProblem } from "./cnc";
import type { Units } from "./format";
import { findPocketCutters } from "./gcode/tool-inventory";
import { jobSheet } from "./jobsheet";
import type { MeasuredNest } from "./measure";

/** Checks the same per-layer assignments as the job sheet; never silently substitutes a bit. */
export function cncToolProblems(n: Nesting, measured: MeasuredNest | null, shop: Shop, units: Units, options: { profiles?: boolean } = {}): NestProblem[] {
  const out: NestProblem[] = [];
  for (const [index, piece] of n.pieces.entries()) {
    if (piece.saw) continue;
    const js = jobSheet({ n, index, measured, shop, units, file: "", ownerOf: () => null });
    for (const layer of js.layers) {
      if (!layer.cut || (options.profiles === false && layer.kind === "profile")) continue;
      const reasons: string[] = [];
      const tool = layer.tool;
      const width = layer.narrowest?.width ?? Math.max(piece.length, piece.width) + 1;
      const depth = layerJob(layer.name)?.depth ?? piece.thickness + 0.0005;
      if (!tool) reasons.push("choose a bit in CNC setup > Tools / Job sheet");
      else {
        if (tool.confirmedOwned !== true) reasons.push(`confirm you own ${tool.name} in CNC setup > Tools`);
        if (layer.fits !== true) reasons.push("the assigned bit does not fit, or its diameter is unknown");
        if (tool.cuttingLength == null || tool.cuttingLength < depth - 1e-9) reasons.push(`verify a cutting length of at least ${Number((depth * 1000).toFixed(3))} mm (including 0.5 mm breakthrough for through cuts)`);
        const match = findPocketCutters({ width, depth }, [{ ...tool, confirmedOwned: true }], shop.collets ?? null);
        if (tool.shank == null || !shop.collets?.length || !shop.collets.some((s) => Number.isFinite(s) && tool.shank != null && Math.abs(s - tool.shank) <= 1e-6)) reasons.push("confirm the bit's shank and a matching collet in CNC setup > Tools");
        // The matcher also rejects malformed dimensions and collet lists.
        if (!match.found && !reasons.length) reasons.push("the cutter dimensions or collet sizes are incomplete or invalid");
      }
      if (layer.narrowest?.approx) reasons.push("the width uses an approximate outline; verify the complete pocket in CAM");
      if (reasons.length) out.push({ kind: "toolfit", tag: String(piece.index), name: `${piece.stock}: ${layer.name}`, text: `${reasons.join("; ")}. ${layer.fitNotes.join(" ")} Holes use a pocket toolpath with a smaller end mill, not a drilling toolpath. Check and simulate every CAM toolpath before cutting.` });
    }
  }
  return out;
}
