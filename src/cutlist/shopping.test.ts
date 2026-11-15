import { describe, expect, it } from "vitest";
import type { BomItem, CutList, Nesting } from "../kernel/types";
import { bookshelf, row } from "./fixture";
import { smallNesting } from "../nesting/fixture";
import { parseCsv } from "./csv";
import { bought, currencyForLocale, defaultShopPrefs, itemKey, moneyText, priceList, roundUp, shoppingCsv, shoppingList, validCurrency, type ShopPrefs, type ShopRow } from "./shopping";
import { loadShopPrefs, readShopPrefs, saveShopPrefs, SHOP_PREFS_KEY } from "./shop-store";

const HINGE: BomItem = { item: "Blum CLIP top 110° hinge, full overlay, straight arm", qty: 2, unit: "each" };
const RUNNERS: BomItem = { item: "Blum TANDEM 563H runners, 533 mm (21 in), left and right", sku: "563H5330B", qty: 1, unit: "pair" };
const PINS: BomItem = { item: "Shelf pin, 5 mm", qty: 4, unit: "each" };

/** A cut list of a cabinet's hardware-carrying parts. */
function cabinet(): CutList {
  const list = bookshelf();
  list.rows = [
    row("Door", 2, [12, 280, 500], { sheet: true, bom: [HINGE] }),
    row("Drawer front", 3, [12, 100, 300], { sheet: true, bom: [RUNNERS] }),
    row("Shelf", 2, [12, 176, 552], { sheet: true, bom: [PINS] }),
    row("Left side", 1, [12, 180, 1140], { sheet: true }),
  ];
  return list;
}

const prefs = (p: Partial<ShopPrefs> = {}): ShopPrefs => ({ ...defaultShopPrefs("USD"), ...p });

describe("the shopping list", () => {
  it("hardware is what each part carries times its quantity, added up by part number or by name", () => {
    const list = cabinet();
    // A second part with the same hinge: one row, both parts named.
    list.rows.push(row("Pantry door", 1, [12, 300, 1800], { sheet: true, bom: [{ ...HINGE, qty: 5 }] }));
    const shop = shoppingList(list, null);
    const hw = shop.rows.filter((r) => r.category === "hardware");
    // Part numbers first, then by name.
    expect(hw.map((r) => [r.name, r.need, r.unit])).toEqual([
      [RUNNERS.item, 3, "pair"],
      [HINGE.item, 2 * 2 + 5, "each"],
      [PINS.item, 8, "each"],
    ]);
    expect(hw[0].sku).toBe("563H5330B");
    expect(hw[1].parts).toEqual([
      { name: "Door", qty: 4 },
      { name: "Pantry door", qty: 5 },
    ]);
    expect(shop.nested).toBe(false);
    expect(shop.rows.some((r) => r.category === "sheet")).toBe(false);
  });

  it("a part left out of the totals brings no hardware; a hidden part counts as the cut list counts it", () => {
    const list = cabinet();
    list.rows[0] = { ...list.rows[0], included: false };
    // Visible only: the kernel gives the drawn pieces as the quantity.
    list.rows[1] = { ...list.rows[1], qty: 2 };
    const shop = shoppingList(list, null);
    expect(shop.rows.find((r) => r.name === HINGE.item)).toBeUndefined();
    expect(shop.rows.find((r) => r.sku === "563H5330B")!.need).toBe(2);
    expect(shop.excluded).toBe(1);
  });

  it("the same words with a part number and without are two rows; the same part number with other words is one", () => {
    expect(itemKey({ item: "Shelf pin", unit: "each" })).toBe(itemKey({ item: " shelf PIN ", unit: "each" }));
    expect(itemKey({ item: "Runners", sku: "563H5330B", unit: "pair" })).toBe(itemKey({ item: "TANDEM runners", sku: "563H5330B", unit: "pair" }));
    expect(itemKey({ item: "Runners", sku: "563H5330B", unit: "pair" })).not.toBe(itemKey({ item: "Runners", unit: "pair" }));
    expect(itemKey({ item: "Banding", unit: "m" })).not.toBe(itemKey({ item: "Banding", unit: "each" }));
  });

  it("items in metres are edge banding, listed apart from the hardware", () => {
    const list = cabinet();
    list.rows[3] = { ...list.rows[3], bom: [{ item: "Edge banding, birch, 7/8 in", qty: 2.25, unit: "m" }] };
    const shop = shoppingList(list, null);
    const band = shop.rows.filter((r) => r.category === "banding");
    expect(band.map((r) => [r.name, r.need, r.unit])).toEqual([["Edge banding, birch, 7/8 in", 2.25, "m"]]);
  });

  it("sheets and boards are the nesting's, the track saw's sheets among them, by stock and material", () => {
    const n = smallNesting();
    const shop = shoppingList(bookshelf(), n);
    expect(shop.nested).toBe(true);
    expect(shop.rows.map((r) => [r.category, r.name, r.material ?? null, r.need, r.unit])).toEqual([
      ["lumber", "4/4 x 12 x 96", "Oak", 1, "board"],
      ["sheet", "4 x 8 sheet, 1/4", null, 1, "sheet"],
    ]);
    expect(shop.rows[0].boardFeet).toBe(8);
    expect(shop.rows[0].key).toBe("lumber|4/4 x 12 x 96|Oak");
    expect(shop.rows[1].key).toBe("sheet|4 x 8 sheet, 1/4|");
    // The top the nesting could not place is in no row, and said.
    expect(shop.unplaced).toBe(1);
    // A sheet group cut on the track saw is marked.
    const saw: Nesting = { ...n, pieces: n.pieces.map((p) => (p.kind === "sheet" ? { ...p, saw: true } : p)) };
    expect(shoppingList(bookshelf(), saw).rows[1].saw).toBe(true);
    expect(shop.rows[1].saw).toBeUndefined();
  });
});

describe("rounding up to what can be bought", () => {
  const sheet: ShopRow = { key: "s", category: "sheet", name: "4 x 4 sheet, 3/4", need: 5, unit: "sheet" };
  const pair: ShopRow = { key: "p", category: "hardware", name: "Runners", need: 3, unit: "pair" };
  const each: ShopRow = { key: "e", category: "hardware", name: "Shelf pin", need: 24, unit: "each" };
  const band: ShopRow = { key: "b", category: "banding", name: "Banding", need: 7.231, unit: "m" };

  it("whole sheets, whole pairs, whole packs, whole rolls; banding by the metre to the next centimetre", () => {
    expect(bought(sheet, 5.5, null)).toEqual({ count: 6, amount: 6 });
    expect(bought(pair, 3.3, null)).toEqual({ count: 4, amount: 4 });
    expect(bought(each, 24, 100)).toEqual({ count: 1, amount: 100 });
    expect(bought(each, 101, 100)).toEqual({ count: 2, amount: 200 });
    expect(bought(band, 7.231, null)).toEqual({ count: 7.24, amount: 7.24 });
    expect(bought(band, 7.231, 5)).toEqual({ count: 2, amount: 10 });
  });

  it("float noise does not buy one more: 50 sheets plus 10% is 55", () => {
    expect(50 * (1 + 10 / 100)).toBeGreaterThan(55);
    expect(roundUp(50 * (1 + 10 / 100))).toBe(55);
    expect(bought(sheet, 50 * (1 + 10 / 100), null).count).toBe(55);
    expect(roundUp(11.00001)).toBe(12);
  });
});

describe("prices", () => {
  it("overage is added before rounding, per category; totals with and without it", () => {
    const shop = shoppingList(cabinet(), smallNesting());
    const p = priceList(
      shop,
      prefs({
        prices: { "sheet|4 x 8 sheet, 1/4|": 40, "lumber|4/4 x 12 x 96|Oak": 7.5, [itemKey(RUNNERS)]: 30, [itemKey(HINGE)]: 4, [itemKey(PINS)]: 9 },
        packs: { [itemKey(PINS)]: 50 },
        overage: { sheet: 10, lumber: 20, banding: 15, hardware: 0, tools: 0 },
      }),
    );
    const at = (name: string) => p.rows.find((r) => r.name === name)!;
    // 1 sheet + 10% = 1.1: 2 sheets bought with overage, 1 without.
    expect([at("4 x 8 sheet, 1/4").buy.count, at("4 x 8 sheet, 1/4").buyOver.count]).toEqual([1, 2]);
    expect([at("4 x 8 sheet, 1/4").cost, at("4 x 8 sheet, 1/4").costOver]).toEqual([40, 80]);
    // Lumber per board foot of the boards bought: 1 board of 8 bd ft, 2 with overage.
    expect([at("4/4 x 12 x 96").cost, at("4/4 x 12 x 96").costOver]).toEqual([60, 120]);
    expect(at("4/4 x 12 x 96").per).toBe("bd ft");
    // Pins in packs of 50: 8 needed, one pack.
    expect(at(PINS.item).buyOver).toEqual({ count: 1, amount: 50 });
    expect([at(PINS.item).per, at(PINS.item).cost]).toEqual(["pack of 50", 9]);
    expect(at(RUNNERS.item).cost).toBe(90);
    expect(at(HINGE.item).cost).toBe(16);
    expect(p.total).toBe(40 + 60 + 9 + 90 + 16);
    expect(p.totalOver).toBe(80 + 120 + 9 + 90 + 16);
    expect(p.unpriced).toEqual([]);
  });

  it("a row with no price is flagged and left out of the totals, never counted as 0", () => {
    const shop = shoppingList(cabinet(), null);
    const p = priceList(shop, prefs({ prices: { [itemKey(HINGE)]: 4 } }));
    expect(p.total).toBe(16);
    expect(p.unpriced.map((r) => r.name)).toEqual([RUNNERS.item, PINS.item]);
    for (const r of p.unpriced) expect([r.price, r.cost, r.costOver]).toEqual([null, null, null]);
    // A price of 0 is a price (a free part), not "not set".
    const free = priceList(shop, prefs({ prices: { [itemKey(HINGE)]: 4, [itemKey(PINS)]: 0, [itemKey(RUNNERS)]: 30 } }));
    expect(free.unpriced).toEqual([]);
    expect(free.total).toBe(16 + 90);
  });

  it("an overage out of range is clamped; a pack of pairs is whole", () => {
    const shop = shoppingList(cabinet(), null);
    const p = priceList(shop, prefs({ overage: { sheet: 10, lumber: 20, banding: 15, hardware: -5, tools: 0 }, packs: { [itemKey(RUNNERS)]: 2.5 } }));
    const r = p.rows.find((x) => x.sku === "563H5330B")!;
    expect(r.overage).toBe(0);
    expect(r.pack).toBeNull();
    expect(priceList(shop, prefs({ overage: { sheet: 10, lumber: 20, banding: 15, hardware: 9999, tools: 0 } })).rows[0].overage).toBe(500);
  });

  it("labour saved is hours times the rate, only when both are set", () => {
    const shop = shoppingList(cabinet(), null);
    expect(priceList(shop, prefs({ labour: { hours: 12, rate: 45 } })).labour).toBe(540);
    expect(priceList(shop, prefs({ labour: { hours: 12, rate: null } })).labour).toBeNull();
  });
});

describe("money and the shop's prefs", () => {
  it("money is the locale's, in the shop's currency, with no symbol when there is none", () => {
    expect(moneyText(1234.5, "USD", "en-US")).toBe("$1,234.50");
    expect(moneyText(1234.5, "EUR", "de-DE")).toMatch(/^1\.234,50\s€$/);
    expect(moneyText(1234.5, null, "en-US")).toBe("1,234.50");
    expect(currencyForLocale("en-CA")).toBe("CAD");
    expect(currencyForLocale("fr-FR")).toBe("EUR");
    expect(currencyForLocale("xx")).toBeNull();
    expect(validCurrency("usd")).toBeNull();
    expect(validCurrency("GBP")).toBe("GBP");
  });

  it("prefs read back drop anything malformed and keep the rest", () => {
    const p = readShopPrefs({ prices: { a: 12.5, b: -1, c: "9", __proto__: 3 }, packs: { a: 0, b: 100 }, overage: { sheet: 12, lumber: "x" }, currency: "XYZ!", labour: { hours: 3, rate: Infinity } }, "CAD");
    expect(p.prices).toEqual({ a: 12.5 });
    expect(p.packs).toEqual({ b: 100 });
    expect(p.overage).toEqual({ sheet: 12, lumber: 20, banding: 15, hardware: 0, tools: 0 });
    expect(p.currency).toBe("CAD");
    expect(p.labour).toEqual({ hours: 3, rate: null });
    expect(readShopPrefs("junk", null)).toEqual(defaultShopPrefs(null));
  });

  it("prefs are kept on this device and come back", () => {
    localStorage.removeItem(SHOP_PREFS_KEY);
    expect(loadShopPrefs("USD")).toEqual(defaultShopPrefs("USD"));
    const p = prefs({ prices: { "sheet|4 x 4 sheet, 3/4|Cabinet plywood": 89 } });
    saveShopPrefs(p);
    expect(loadShopPrefs("USD")).toEqual(p);
    localStorage.removeItem(SHOP_PREFS_KEY);
  });
});

describe("the CSV", () => {
  it("a row per item, the totals, what they leave out, the banding placeholder and the labour line", () => {
    const shop = shoppingList(cabinet(), smallNesting());
    const p = priceList(shop, prefs({ prices: { "sheet|4 x 8 sheet, 1/4|": 40, [itemKey(HINGE)]: 4 }, labour: { hours: 2, rate: 50 } }));
    const rows = parseCsv(shoppingCsv(p, prefs({ labour: { hours: 2, rate: 50 } })));
    expect(rows[0]).toEqual(["Category", "Item", "Part number", "Material", "Needed", "Overage %", "To buy", "To buy with overage", "Unit price (USD)", "Price per", "Cost (USD)", "Cost with overage (USD)", "Parts", "Notes"]);
    const sheet = rows.find((r) => r[1] === "4 x 8 sheet, 1/4")!;
    expect([sheet[0], sheet[4], sheet[6], sheet[7], sheet[8], sheet[10], sheet[11]]).toEqual(["Sheet goods", "1 sheet", "1 sheet", "2 sheets", "40.00", "40.00", "80.00"]);
    const runners = rows.find((r) => r[2] === "563H5330B")!;
    expect([runners[4], runners[8], runners[10], runners[13]]).toEqual(["3 pairs", "price not set", "", "left out of the total"]);
    expect(rows.find((r) => r[0] === "Edge banding")![13]).toMatch(/not worked out yet/);
    const total = rows.find((r) => r[0] === "Total")!;
    expect([total[10], total[11]]).toEqual([String((40 + 16).toFixed(2)), String((80 + 16).toFixed(2))]);
    expect(total[13]).toMatch(/^Leaves out 3 rows with no price: /);
    expect(rows.find((r) => r[0] === "Labour saved (for fun)")![10]).toBe("100.00");
  });
});

describe("the booklet", () => {
  it("with the shopping list, a page of it follows the summary; without, the booklet is as before", async () => {
    const { nestingPdf } = await import("../nesting/booklet");
    const n = smallNesting();
    const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
    const plain = text(nestingPdf(n, "Kitchen", "sixteenth"));
    expect(plain).not.toContain("Shopping list");
    const p = priceList(shoppingList(cabinet(), n), prefs({ prices: { "sheet|4 x 8 sheet, 1/4|": 40 } }));
    const withShop = text(nestingPdf(n, "Kitchen", "sixteenth", { priced: p, prefs: prefs(), locale: "en-US" }));
    expect(withShop).toContain("(Shopping list: Kitchen)");
    // The part number leads, and the name wraps rather than being cut.
    expect(withShop).toContain("(563H5330B \\267 Blum TANDEM 563H runners, 533)");
    expect(withShop).toContain("(price not set)");
    expect(withShop).toContain("($80.00)");
    expect(withShop).toMatch(/The totals leave out 4 rows with no price/);
    expect((withShop.match(/\/Type \/Page\b/g) ?? []).length).toBe((plain.match(/\/Type \/Page\b/g) ?? []).length + 1);
  });
});
