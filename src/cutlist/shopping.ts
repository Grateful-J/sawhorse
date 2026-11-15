// The shopping list: what to buy for the model, and what it costs at the shop's own prices.
//
// - Sheet goods and solid lumber come from the nesting (the kernel's layout on real stock):
//   the sheets and boards it uses, the track saw's sheets among them. Never the cut list's
//   rough 4 x 8 count.
// - Hardware and edge banding come from the parts: each cut list row carries what is bought for
//   each of its pieces (`bom`, set on the part in the model), multiplied by the row's quantity.
//   So a copied cabinet doubles its hardware and a deleted one takes it away. Items with a part
//   number are added up by part number, the rest by their words; items in metres are banding.
//   A row left out of the totals (unticked) brings no hardware. An item bought once for the
//   shop (`once`: a drilling template) is a tool: the most any part asks for, never a sum.
// - Prices are the shop's, not the model's (kept on this device: `shop-store.ts`). A row with no
//   price is "price not set" and is left out of the total, which says so; never $0.
// - Bought quantities are rounded up to what can be bought: whole sheets and boards, whole
//   packs (a pack is 1 piece or 1 pair unless a pack size is set), whole rolls of banding when a
//   roll length is set. Overage is a percentage per category, added before rounding.
import type { BomUnit, CutList, Nesting } from "../kernel/types";
import { field, withBom } from "./csv";

export type ShopCategory = "sheet" | "lumber" | "banding" | "hardware" | "tools";

export const SHOP_CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: "sheet", label: "Sheet goods" },
  { id: "lumber", label: "Solid lumber" },
  { id: "banding", label: "Edge banding" },
  { id: "hardware", label: "Hardware" },
  { id: "tools", label: "Tools (once for the shop)" },
];

/** Overage to start with (percent): assumptions the view states as such, never facts. */
export const DEFAULT_OVERAGE: Record<ShopCategory, number> = { sheet: 10, lumber: 20, banding: 15, hardware: 0, tools: 0 };

/** Largest overage accepted (percent). */
export const MAX_OVERAGE = 500;

export type ShopUnit = "sheet" | "board" | BomUnit;

export interface ShopRow {
  /** What its price and pack size are kept by: the stock (and material), the part number, or the item's words. */
  key: string;
  category: ShopCategory;
  name: string;
  sku?: string;
  /** The material its sheets or boards are for (the nesting never puts two on one sheet). */
  material?: string | null;
  /** What the parts need, in `unit`s (sheets and boards: as nested, already whole). */
  need: number;
  unit: ShopUnit;
  /** Lumber: board feet in one board (lumber is priced per board foot). */
  boardFeet?: number;
  /** Sheet goods cut on the track saw (the nesting's overflow sheets). */
  saw?: boolean;
  /** Hardware and banding: the parts it rides on, and how many of it each brings. */
  parts?: { name: string; qty: number }[];
}

export interface ShoppingList {
  rows: ShopRow[];
  /** The nesting was there to read (without it there are no sheet goods or lumber rows). */
  nested: boolean;
  /** Pieces the nesting placed on no stock: in no row. */
  unplaced: number;
  /** Cut list rows left out of the totals: in no row, and nor is their hardware. */
  excluded: number;
}

/** A hardware item's key: by part number when it has one, else by its words; and its unit. */
export function itemKey(item: { item: string; sku?: string; unit: BomUnit; once?: boolean }): string {
  const k = item.sku ? `sku|${item.sku}|${item.unit}` : `item|${item.item.trim().toLowerCase()}|${item.unit}`;
  return item.once ? `${k}|once` : k;
}

/** The shopping list for a cut list and its nesting (either may be missing). */
export function shoppingList(list: CutList | null, nesting: Nesting | null): ShoppingList {
  const rows: ShopRow[] = [];
  if (nesting) {
    nesting.totals.groups.forEach((g, i) => {
      if (g.count <= 0) return;
      const saw = nesting.pieces.some((p) => p.group === i && p.saw);
      const key = `${g.kind === "sheet" ? "sheet" : "lumber"}|${g.stock}|${g.material ?? ""}`;
      if (g.kind === "sheet") rows.push({ key, category: "sheet", name: g.stock, material: g.material, need: g.count, unit: "sheet", ...(saw ? { saw } : {}) });
      else rows.push({ key, category: "lumber", name: g.stock, material: g.material, need: g.count, unit: "board", boardFeet: g.board_feet / g.count });
    });
  }
  const items = new Map<string, ShopRow>();
  for (const row of list?.rows ?? []) {
    if (row.included === false || row.qty <= 0) continue;
    for (const b of row.bom ?? []) {
      const key = itemKey(b);
      // A tool is bought once, whatever number of parts ask for it.
      const qty = b.once ? b.qty : b.qty * row.qty;
      const had = items.get(key);
      if (had) {
        had.need = b.once ? Math.max(had.need, qty) : had.need + qty;
        const part = had.parts!.find((p) => p.name === row.name);
        if (part) part.qty = b.once ? Math.max(part.qty, qty) : part.qty + qty;
        else had.parts!.push({ name: row.name, qty });
      } else {
        items.set(key, { key, category: b.once ? "tools" : b.unit === "m" ? "banding" : "hardware", name: b.item, ...(b.sku ? { sku: b.sku } : {}), need: qty, unit: b.unit, parts: [{ name: row.name, qty }] });
      }
    }
  }
  // Banding, then hardware: by part number first (as a parts counter files them), then by name.
  const byName = (a: ShopRow, b: ShopRow) => (a.sku && b.sku ? a.sku.localeCompare(b.sku) : a.sku ? -1 : b.sku ? 1 : a.name.localeCompare(b.name));
  const found = [...items.values()];
  for (const c of ["banding", "hardware", "tools"] as const) rows.push(...found.filter((r) => r.category === c).sort(byName));
  return {
    rows,
    nested: !!nesting,
    unplaced: nesting?.totals.unplaced ?? 0,
    excluded: list?.rows.filter((r) => r.included === false).length ?? 0,
  };
}

// ---- prices -----------------------------------------------------------------------------------

/** The shop's prices and assumptions (kept on this device, never in the model). */
export interface ShopPrefs {
  /** Price by row key: per sheet, per board foot, per pack (a piece or a pair unless a pack
   * size is set), per roll of banding (or per metre with no roll length). */
  prices: Record<string, number>;
  /** Pack size by row key: pieces or pairs in a pack, or metres in a roll. Absent: 1 (no roll). */
  packs: Record<string, number>;
  /** Overage per category, percent. */
  overage: Record<ShopCategory, number>;
  /** ISO 4217 code the prices are in; null: plain numbers. */
  currency: string | null;
  /** Labour saved, for fun: hours and an hourly rate. */
  labour: { hours: number | null; rate: number | null };
}

export function defaultShopPrefs(currency: string | null = null): ShopPrefs {
  return { prices: {}, packs: {}, overage: { ...DEFAULT_OVERAGE }, currency, labour: { hours: null, rate: null } };
}

/** Up to the next whole number, shrugging off float noise (10 x 1.1 is 11, not 12). */
export function roundUp(x: number): number {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

export interface Bought {
  /** What is bought, counted as it is sold: sheets, boards, packs, rolls (or metres). */
  count: number;
  /** That in the row's own units (packs x pack size; boards; metres). */
  amount: number;
}

export interface PricedRow extends ShopRow {
  overage: number;
  /** Pack size (pieces or pairs) or roll length (metres); null: sold singly, or banding by the metre. */
  pack: number | null;
  /** Bought for `need` exactly, and with the overage added. */
  buy: Bought;
  buyOver: Bought;
  /** The price as the shop entered it; null: not set. */
  price: number | null;
  /** What `price` is for: "sheet", "bd ft", "pack of 100", "each", "pair", "roll of 50 m", "m". */
  per: string;
  cost: number | null;
  costOver: number | null;
}

export interface PricedList {
  rows: PricedRow[];
  /** Priced rows only; rows with no price are left out (see `unpriced`). */
  total: number;
  totalOver: number;
  unpriced: PricedRow[];
  /** Hours x rate, when both are set. */
  labour: number | null;
}

function packOf(row: ShopRow, prefs: ShopPrefs): number | null {
  if (row.unit === "sheet" || row.unit === "board") return null;
  const p = prefs.packs[row.key];
  if (!(typeof p === "number" && Number.isFinite(p) && p > 0)) return null;
  // Pieces and pairs come in whole numbers to a pack.
  if (row.unit !== "m" && !Number.isInteger(p)) return null;
  return p;
}

/** What is bought for `need` of a row: whole sheets and boards, whole packs or rolls. */
export function bought(row: ShopRow, need: number, pack: number | null): Bought {
  if (row.unit === "sheet" || row.unit === "board") {
    const n = roundUp(need);
    return { count: n, amount: n };
  }
  if (row.unit === "m" && pack === null) {
    // By the metre: up to the next centimetre.
    const m = roundUp(need * 100) / 100;
    return { count: m, amount: m };
  }
  const size = pack ?? 1;
  const n = roundUp(need / size);
  return { count: n, amount: n * size };
}

function perText(row: ShopRow, pack: number | null): string {
  switch (row.unit) {
    case "sheet":
      return "sheet";
    case "board":
      return "bd ft";
    case "m":
      return pack === null ? "m" : `roll of ${trim(pack)} m`;
    default:
      return pack === null || pack === 1 ? (row.unit === "pair" ? "pair" : "each") : `pack of ${pack}${row.unit === "pair" ? " pairs" : ""}`;
  }
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function costOf(row: ShopRow, b: Bought, price: number): number {
  // Lumber is priced per board foot of the boards bought.
  return row.unit === "board" ? b.count * (row.boardFeet ?? 0) * price : b.count * price;
}

/** Overage clamped to 0..MAX_OVERAGE (a bad value is 0). */
export function overageOf(prefs: ShopPrefs, c: ShopCategory): number {
  // A tool is bought once: no spare.
  if (c === "tools") return 0;
  const v = prefs.overage[c];
  return typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_OVERAGE, Math.max(0, v)) : 0;
}

/** The list priced at the shop's prices. */
export function priceList(shop: ShoppingList, prefs: ShopPrefs): PricedList {
  const rows: PricedRow[] = shop.rows.map((row) => {
    const overage = overageOf(prefs, row.category);
    const pack = packOf(row, prefs);
    const buy = bought(row, row.need, pack);
    const buyOver = bought(row, row.need * (1 + overage / 100), pack);
    const p = prefs.prices[row.key];
    const price = typeof p === "number" && Number.isFinite(p) && p >= 0 ? p : null;
    return { ...row, overage, pack, buy, buyOver, price, per: perText(row, pack), cost: price === null ? null : costOf(row, buy, price), costOver: price === null ? null : costOf(row, buyOver, price) };
  });
  const priced = rows.filter((r) => r.cost !== null);
  const { hours, rate } = prefs.labour;
  const labour = typeof hours === "number" && typeof rate === "number" && Number.isFinite(hours) && Number.isFinite(rate) && hours >= 0 && rate >= 0 ? hours * rate : null;
  return {
    rows,
    total: priced.reduce((s, r) => s + r.cost!, 0),
    totalOver: priced.reduce((s, r) => s + r.costOver!, 0),
    unpriced: rows.filter((r) => r.cost === null),
    labour,
  };
}

// ---- words and money -------------------------------------------------------------------------

/** "3 sheets", "1 pair", "2.35 m". */
export function amountText(n: number, unit: ShopUnit): string {
  const v = unit === "m" ? trim(n) : String(Math.round(n * 1e6) / 1e6);
  if (unit === "m") return `${v} m`;
  const word = unit === "sheet" ? "sheet" : unit === "board" ? "board" : unit === "pair" ? "pair" : "";
  if (!word) return v;
  return `${v} ${word}${n === 1 ? "" : "s"}`;
}

/** What is bought, as it is sold: "4 sheets", "2 packs of 100 (200)", "3 boards (24.0 bd ft)". */
export function boughtText(row: PricedRow, b: Bought): string {
  if (row.unit === "board") return `${amountText(b.count, "board")} (${(b.count * (row.boardFeet ?? 0)).toFixed(1)} bd ft)`;
  if (row.unit === "sheet") return amountText(b.count, "sheet");
  if (row.pack !== null && row.pack !== 1) {
    const what = row.unit === "m" ? `roll${b.count === 1 ? "" : "s"} of ${trim(row.pack)} m` : `pack${b.count === 1 ? "" : "s"} of ${row.pack}`;
    return `${b.count} ${what} (${amountText(b.amount, row.unit)})`;
  }
  return amountText(b.amount, row.unit);
}

/** Currencies by region, for the starting guess only (the view lets it be changed). */
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR", MT: "EUR", CY: "EUR", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", JP: "JPY",
  CN: "CNY", IN: "INR", MX: "MXN", BR: "BRL", ZA: "ZAR", SG: "SGD", HK: "HKD", KR: "KRW", IL: "ILS",
};

/** The currency a locale's region uses, when it is one of the common ones; else null. */
export function currencyForLocale(locale: string | undefined): string | null {
  if (!locale) return null;
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) || null;
  } catch {
    return null;
  }
}

/** A well-formed ISO 4217 code that this browser can format, or null. */
export function validCurrency(code: unknown): string | null {
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) return null;
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code });
    return code;
  } catch {
    return null;
  }
}

/** Money in the locale's way, in `currency` (no currency: a plain number with two decimals). */
export function moneyText(n: number, currency: string | null, locale?: string): string {
  try {
    if (currency) return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    /* an unknown code: plain */
  }
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ---- files -----------------------------------------------------------------------------------

export const SHOPPING_CSV_TYPE = { description: "Shopping list (CSV)", mime: "text/csv", extensions: [".csv"] };

/** Said wherever the list is written: how quantities are rounded, and what overage is. */
export const ROUNDING_NOTE = "Quantities to buy are rounded up: whole sheets and boards, whole pairs, whole packs (and rolls, when a size is set). Overage is added before rounding.";
export const BANDING_PLACEHOLDER = "Edge banding is not worked out yet: when a part says how much it takes (an item in metres), it is listed here.";

function money2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** The priced list as CSV (RFC 4180, CRLF): a row per item, then the totals, what they leave
 * out, and the labour line. Money as plain numbers in the header's currency. */
export function shoppingCsv(p: PricedList, prefs: ShopPrefs): string {
  const cur = prefs.currency ? ` (${prefs.currency})` : "";
  const lines: string[][] = [["Category", "Item", "Part number", "Material", "Needed", "Overage %", "To buy", "To buy with overage", `Unit price${cur}`, "Price per", `Cost${cur}`, `Cost with overage${cur}`, "Parts", "Notes"]];
  const label = (c: ShopCategory) => SHOP_CATEGORIES.find((x) => x.id === c)!.label;
  for (const r of p.rows) {
    lines.push([
      label(r.category),
      r.name,
      r.sku ?? "",
      r.material ?? "",
      amountText(r.need, r.unit),
      String(r.overage),
      boughtText(r, r.buy),
      boughtText(r, r.buyOver),
      r.price === null ? "price not set" : money2(r.price),
      r.per,
      r.cost === null ? "" : money2(r.cost),
      r.costOver === null ? "" : money2(r.costOver),
      (r.parts ?? []).map((x) => `${x.name} (${trim(x.qty)})`).join("; "),
      [r.saw ? "track saw" : "", r.cost === null ? "left out of the total" : ""].filter(Boolean).join("; "),
    ]);
  }
  if (!p.rows.some((r) => r.category === "banding")) lines.push([label("banding"), "", "", "", "", "", "", "", "", "", "", "", "", BANDING_PLACEHOLDER]);
  const left = p.unpriced.length ? `Leaves out ${p.unpriced.length} row${p.unpriced.length === 1 ? "" : "s"} with no price: ${p.unpriced.map((r) => r.name).join("; ")}` : "Every row is priced";
  lines.push(["Total", "", "", "", "", "", "", "", "", "", money2(p.total), money2(p.totalOver), "", left]);
  lines.push(["", "", "", "", "", "", "", "", "", "", "", "", "", ROUNDING_NOTE]);
  if (p.labour !== null) lines.push(["Labour saved (for fun)", `${trim(prefs.labour.hours ?? 0)} h`, "", "", "", "", "", "", money2(prefs.labour.rate ?? 0), "hour", money2(p.labour), "", "", "hours x your rate"]);
  return lines.map((l) => l.map(field).join(",")).join("\r\n") + "\r\n";
}

export function shoppingCsvBytes(p: PricedList, prefs: ShopPrefs): Uint8Array {
  return withBom(shoppingCsv(p, prefs));
}
