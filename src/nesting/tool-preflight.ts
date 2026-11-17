import { layerJob } from "../cam/layers";
import type { Shop } from "../cam/store";
import type { Nesting } from "../kernel/types";
import type { NestProblem } from "./cnc";
import { pieceNumber, type Units } from "./format";
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
      if (!tool) reasons.push("no bit chosen: choose a bit in CNC setup");
      else {
        if (tool.confirmedOwned !== true) reasons.push(`confirm you own ${tool.name}`);
        if (layer.fits !== true) reasons.push(tool.diameter == null ? `${tool.name}'s diameter is unknown` : `${tool.name} does not fit`);
        if (tool.cuttingLength == null || tool.cuttingLength < depth - 1e-9) reasons.push(`needs a cutting length of ${Number((depth * 1000).toFixed(3))} mm or more`);
        const match = findPocketCutters({ width, depth }, [{ ...tool, confirmedOwned: true }], shop.collets ?? null);
        if (tool.shank == null || !shop.collets?.length || !shop.collets.some((s) => Number.isFinite(s) && tool.shank != null && Math.abs(s - tool.shank) <= 1e-6)) reasons.push("confirm its shank and collet");
        // The matcher also rejects malformed dimensions and collet lists.
        if (!match.found && !reasons.length) reasons.push("its size or the collet sizes are incomplete");
      }
      if (layer.narrowest?.approx) reasons.push("width is approximate: check it in CAM");
      if (!reasons.length) continue;
      const fix = layer.suggested && layer.suggested !== tool && layer.kind ? layer.suggested : null;
      const text = `${reasons.join("; ")}.${fix ? ` Try ${fix.name}.` : !tool || layer.fits === false ? " No bit in your library fits." : ""}`;
      out.push({ kind: "toolfit", tag: pieceNumber(piece), name: layer.name, text, ...(fix && layer.kind ? { bit: { kind: layer.kind, id: fix.id, name: fix.name } } : {}) });
    }
  }
  return out;
}
