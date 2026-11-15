// The shop: your machine, your router and your bits. Shop data, not model data: it is kept
// on this device (localStorage, under its own key), never in a .shz, and changing it does not
// mark the document changed. Blocked storage means the built-in shop, every time.
import { MATERIALS, type MaterialId } from "./chipload";
import { ROUTERS, SHAPEOKO_5_PRO_4X4 } from "./data";
import { OPERATIONS, type Operation } from "./layers";
import { readTool, seedTools, type Tool } from "./tools";

export const SHOP_KEY = "sawhorse.cam.shop";

export const CUSTOM_MACHINE = "custom";
/** The router id for "my router: I type its RPM". */
export const CUSTOM_ROUTER = "custom";

export interface CustomMachine {
  name: string;
  /** Travel in metres (null: not typed). */
  travelX: number | null;
  travelY: number | null;
  travelZ: number | null;
  /** Warn above this feed, IPM (null: no warning). */
  feedWarnIpm: number | null;
  /** The largest shank the router takes, metres (null: the router's own, if known). */
  maxShank: number | null;
}

export interface Shop {
  version: 1;
  /** SHAPEOKO_5_PRO_4X4.id or CUSTOM_MACHINE. */
  machine: string;
  custom: CustomMachine;
  /** A router id from ROUTERS, or CUSTOM_ROUTER. */
  router: string;
  /** The router's dial table, when it has several (the Compact Router). */
  table: string;
  /** The RPM of a router that is not built in. */
  rpm: number | null;
  tools: Tool[];
  /** The bit you cut the profiles with: the spacing check reads its diameter. */
  profileTool: string | null;
  /** The calculator's last choices. */
  feeds: { tool: string | null; material: MaterialId; op: Operation };
}

export function defaultShop(): Shop {
  const tools = seedTools();
  return {
    version: 1,
    machine: SHAPEOKO_5_PRO_4X4.id,
    custom: { name: "My machine", travelX: null, travelY: null, travelZ: null, feedWarnIpm: null, maxShank: null },
    router: ROUTERS[0].id,
    table: ROUTERS[0].tables[0].id,
    rpm: null,
    tools,
    profileTool: null,
    feeds: { tool: tools[0].id, material: "baltic-birch", op: "profile" },
  };
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v > lo && v <= hi ? v : null);

/** A shop read back from storage: anything that does not make sense is the default's. */
export function readShop(x: unknown): Shop {
  const d = defaultShop();
  if (!x || typeof x !== "object") return d;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return d;
  const c = (o.custom && typeof o.custom === "object" ? o.custom : {}) as Record<string, unknown>;
  const tools = Array.isArray(o.tools) ? o.tools.map(readTool).filter((t): t is Tool => !!t) : d.tools;
  const ids = new Set<string>();
  const unique = tools.filter((t) => !ids.has(t.id) && ids.add(t.id));
  const router = typeof o.router === "string" && (o.router === CUSTOM_ROUTER || ROUTERS.some((r) => r.id === o.router)) ? o.router : d.router;
  const r = ROUTERS.find((x) => x.id === router);
  const table = typeof o.table === "string" && r?.tables.some((t) => t.id === o.table) ? o.table : (r?.tables[0].id ?? "");
  const f = (o.feeds && typeof o.feeds === "object" ? o.feeds : {}) as Record<string, unknown>;
  const toolId = (v: unknown) => (typeof v === "string" && unique.some((t) => t.id === v) ? v : null);
  return {
    version: 1,
    machine: o.machine === CUSTOM_MACHINE || o.machine === SHAPEOKO_5_PRO_4X4.id ? o.machine : d.machine,
    custom: {
      name: typeof c.name === "string" && c.name.trim() ? c.name.slice(0, 60) : d.custom.name,
      travelX: num(c.travelX, 0, 10),
      travelY: num(c.travelY, 0, 10),
      travelZ: num(c.travelZ, 0, 10),
      feedWarnIpm: num(c.feedWarnIpm, 0, 10000),
      maxShank: num(c.maxShank, 0, 0.0254),
    },
    router,
    table,
    rpm: num(o.rpm, 0, 100000),
    tools: unique,
    profileTool: toolId(o.profileTool),
    feeds: {
      tool: toolId(f.tool) ?? unique[0]?.id ?? null,
      material: MATERIALS.some((m) => m.id === f.material) ? (f.material as MaterialId) : d.feeds.material,
      op: OPERATIONS.some((p) => p.id === f.op) ? (f.op as Operation) : d.feeds.op,
    },
  };
}

/** The shop kept on this device, or the built-in one. */
export function loadShop(): Shop {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    return raw ? readShop(JSON.parse(raw)) : defaultShop();
  } catch {
    return defaultShop();
  }
}

/** Keep the shop on this device. */
export function saveShop(s: Shop): void {
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the shop lasts until the page closes */
  }
  for (const f of listeners) f(s);
}

const listeners = new Set<(s: Shop) => void>();

/** Hear every saved change (the CNC files' spacing check, a job sheet). Returns the unsubscribe. */
export function onShop(f: (s: Shop) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
