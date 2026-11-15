// The shop's prices, pack sizes, overage and currency for the shopping list, kept on this
// device (localStorage), never in the model: typing a price does not change the document, and
// the same prices serve every model. Keyed by stock and material, part number, or item
// (`shopping.ts` `ShopRow.key`). Blocked storage just means the prices last until the page
// closes; anything malformed in storage is dropped, never trusted.
import { DEFAULT_OVERAGE, defaultShopPrefs, MAX_OVERAGE, SHOP_CATEGORIES, validCurrency, type ShopPrefs } from "./shopping";

export const SHOP_PREFS_KEY = "sawhorse.shopPrices";
/** Most prices (and as many pack sizes) kept: far beyond any shop's list, small in storage. */
export const MAX_SHOP_KEYS = 2000;
/** A price or a pack size above this is a typing slip. */
export const MAX_PRICE = 1e7;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

function table(v: unknown, max: number, positive: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n >= MAX_SHOP_KEYS || k === "__proto__" || k.length > 300) continue;
    const ok = num(x, max);
    if (ok === null || (positive && ok === 0)) continue;
    out[k] = ok;
    n++;
  }
  return out;
}

/** Prefs read back from anything (what storage held): every field checked, defaults for the rest. */
export function readShopPrefs(v: unknown, currency: string | null): ShopPrefs {
  const d = defaultShopPrefs(currency);
  if (!isObj(v)) return d;
  const overage = { ...DEFAULT_OVERAGE };
  if (isObj(v.overage)) for (const c of SHOP_CATEGORIES) overage[c.id] = num(v.overage[c.id], MAX_OVERAGE) ?? overage[c.id];
  const labour = isObj(v.labour) ? v.labour : {};
  return {
    prices: table(v.prices, MAX_PRICE, false),
    packs: table(v.packs, MAX_PRICE, true),
    overage,
    currency: v.currency === null ? null : (validCurrency(v.currency) ?? currency),
    labour: { hours: num(labour.hours, 100_000), rate: num(labour.rate, MAX_PRICE) },
  };
}

/** The prefs at start: what this device kept, else the defaults (the currency guessed from the locale). */
export function loadShopPrefs(currency: string | null): ShopPrefs {
  try {
    const raw = localStorage.getItem(SHOP_PREFS_KEY);
    return readShopPrefs(raw ? JSON.parse(raw) : null, currency);
  } catch {
    return defaultShopPrefs(currency);
  }
}

export function saveShopPrefs(p: ShopPrefs): void {
  try {
    localStorage.setItem(SHOP_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked or full: the prices last until the page closes */
  }
}
