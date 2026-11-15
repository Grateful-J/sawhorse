import type { Shop } from "../cam/store";
import type { JobSheet } from "./jobsheet";

/** Operation intent stays first. DRILL_ geometry is pocketed with the named end mill. */
export function labelJobSheet(js: JobSheet, shop: Shop): JobSheet {
  if (shop.jobs.toolLayers === false) return js;
  const names = new Map(js.layers.filter((l) => l.cut).map((l) => {
    const method = l.kind === "profile" || l.kind === "cutout" ? "PROFILE" : "POCKET";
    const slug = l.tool?.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64) || "CUSTOM_BIT";
    const diameter = l.tool?.diameter == null ? "UNKNOWN" : String(Number((l.tool.diameter * 1000).toFixed(4))).replace(".", "P");
    const suffix = l.tool ? `${method}_WITH_${slug}_D${diameter}MM${l.tool.confirmedOwned === true ? "" : "_OWNERSHIP_UNCONFIRMED"}` : `${method}_TOOL_UNSET`;
    return [l.name, `${l.name}__${suffix}`];
  }));
  return {
    ...js,
    layers: js.layers.map((l) => ({ ...l, exportName: names.get(l.name) ?? l.name })),
    order: js.order.map((s) => ({ ...s, layers: s.layers.map((n) => names.get(n) ?? n), misfit: s.misfit.map((n) => names.get(n) ?? n) })),
  };
}

export function toolLayerNames(js: JobSheet): Map<string, string> {
  return new Map(js.layers.filter((l) => l.exportName && l.exportName !== l.name).map((l) => [l.name, l.exportName!]));
}
