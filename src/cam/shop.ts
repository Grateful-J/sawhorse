// The shop's typed API, for the CNC setup dialog, the CNC files' spacing check and a job
// sheet: the machine, the router, the bits, and feeds and speeds for one bit, material and
// cut. Everything reads the shop kept on this device unless one is passed in.
//
//   const shop = loadShop();
//   const r = feedsFor(toolById(shop, "seed-compression")!, "baltic-birch", "profile");
//   r.feedIpm, r.dial, r.warnings
import type { MaterialId } from "./chipload";
import { ROUTERS, SHAPEOKO_5_PRO_4X4, metres, type DialTable, type Router } from "./data";
import { computeFeeds, type FeedsOptions, type FeedsResult, type MachineView, type Spindle } from "./feeds";
import { layerJob, type Operation } from "./layers";
import { CUSTOM_MACHINE, CUSTOM_ROUTER, loadShop, type Shop } from "./store";
import type { Tool } from "./tools";

export { loadShop, saveShop, onShop, defaultShop, SHOP_KEY, CUSTOM_MACHINE, CUSTOM_ROUTER, type Shop } from "./store";
export { layerJob, holeOf, HOLE_LAYERS, OPERATIONS, type Operation, type Hole, type LayerJob } from "./layers";
export { MATERIALS, BIT_TYPES, type MaterialId, type BitType } from "./chipload";
export type { Tool } from "./tools";
export type { FeedsResult, FeedsOptions, Warning } from "./feeds";

/** The machine the shop is set to, as the calculator needs it. */
export function machineOf(shop: Shop = loadShop()): MachineView & { travel: { x: number | null; y: number | null; z: number | null } } {
  if (shop.machine === CUSTOM_MACHINE) {
    const c = shop.custom;
    return { id: CUSTOM_MACHINE, name: c.name, feedWarn: c.feedWarnIpm ? { ipm: c.feedWarnIpm, sourced: null } : null, maxShank: c.maxShank, travel: { x: c.travelX, y: c.travelY, z: c.travelZ } };
  }
  const m = SHAPEOKO_5_PRO_4X4;
  return { id: m.id, name: m.name, feedWarn: { ipm: m.feedWarn.value, sourced: m.feedWarn }, maxShank: null, travel: { x: metres(m.travelX), y: metres(m.travelY), z: metres(m.travelZ) } };
}

/** The router the shop is set to (null: one you typed the RPM of). */
export function routerOf(shop: Shop = loadShop()): Router | null {
  return shop.router === CUSTOM_ROUTER ? null : (ROUTERS.find((r) => r.id === shop.router) ?? null);
}

/** The router's dial table the shop reads. */
export function tableOf(shop: Shop = loadShop()): DialTable | null {
  const r = routerOf(shop);
  return r ? (r.tables.find((t) => t.id === shop.table) ?? r.tables[0]) : null;
}

export function spindleOf(shop: Shop = loadShop()): Spindle {
  const router = routerOf(shop);
  return { router, table: tableOf(shop), rpm: router ? null : shop.rpm };
}

export function shopTools(shop: Shop = loadShop()): Tool[] {
  return shop.tools;
}

export function toolById(shop: Shop, id: string | null): Tool | null {
  return shop.tools.find((t) => t.id === id) ?? null;
}

/** The bit chosen for profiles, if any. */
export function profileTool(shop: Shop = loadShop()): Tool | null {
  return toolById(shop, shop.profileTool);
}

/** The profile bit as the spacing check reads it (null: none chosen, or no diameter). */
export function profileBit(shop: Shop = loadShop()): { diameter: number; name: string } | null {
  const t = profileTool(shop);
  return t && t.diameter !== null ? { diameter: t.diameter, name: t.name } : null;
}

/** Feeds and speeds for a bit, a material and a cut, on the shop's machine and router. */
export function feedsFor(tool: Tool, material: MaterialId, op: Operation, opts: FeedsOptions = {}, shop: Shop = loadShop()): FeedsResult {
  return computeFeeds(tool, material, op, machineOf(shop), spindleOf(shop), opts);
}

/** Feeds and speeds for a CNC file's layer (PROFILE_THRU, POCKET_6.35MM, DRILL_D5MM_10MM),
 * or null for a layer that is not cut. */
export function feedsForLayer(tool: Tool, material: MaterialId, layer: string, opts: FeedsOptions = {}, shop: Shop = loadShop()): FeedsResult | null {
  const job = layerJob(layer);
  if (!job) return null;
  return feedsFor(tool, material, job.op, { cutDepth: job.op === "pocket" ? job.depth : undefined, hole: job.hole, ...opts }, shop);
}
