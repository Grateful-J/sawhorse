import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookshelf, row } from "../cutlist/fixture";
import { smallNesting } from "../nesting/fixture";
import { defaultShopPrefs, itemKey, type ShopPrefs } from "../cutlist/shopping";
import type { BomItem, CutList } from "../kernel/types";
import { parseAmount, ShoppingSection, type ShoppingSectionProps } from "./ShoppingSection";
import { CutListPane, type CutListPaneProps } from "./CutListPane";

afterEach(cleanup);

const HINGE: BomItem = { item: "Blum CLIP top BLUMOTION 110° hinge, full overlay, straight arm, screw-on", sku: "71B3550", qty: 2, unit: "each" };
const PINS: BomItem = { item: "5 mm shelf pins", qty: 4, unit: "each" };
const TEMPLATE: BomItem = { item: "Blum concealed runner template", sku: "T65.1600.01", qty: 1, unit: "each", once: true };

function list(): CutList {
  const l = bookshelf();
  l.rows = [row("Door", 2, [12, 280, 500], { sheet: true, bom: [HINGE] }), row("Shelf", 3, [12, 176, 552], { sheet: true, bom: [PINS] }), row("Drawer front", 2, [12, 100, 300], { sheet: true, bom: [TEMPLATE] })];
  return l;
}

/** The section with its prefs held as App holds them. */
function Harness(p: Partial<ShoppingSectionProps> & { start?: ShopPrefs; spy?: (p: ShopPrefs) => void }) {
  const [prefs, setPrefs] = useState<ShopPrefs>(p.start ?? defaultShopPrefs("USD"));
  return (
    <ShoppingSection
      list={list()}
      nesting={smallNesting()}
      locale="en-US"
      {...p}
      prefs={prefs}
      onPrefs={(x) => {
        setPrefs(x);
        p.spy?.(x);
      }}
    />
  );
}

const rowOf = (key: string) => document.querySelector(`[data-shop-row="${CSS.escape(key)}"]`) as HTMLElement;

describe("Shopping list section", () => {
  it("lists sheets and boards from the nesting and hardware from the parts, every price empty and the total saying so", () => {
    render(<Harness />);
    const sec = screen.getByTestId("shopping");
    expect(within(sec).getByText("4 x 8 sheet, 1/4")).toBeTruthy();
    expect(within(sec).getByText("4/4 x 12 x 96")).toBeTruthy();
    const hinge = rowOf(itemKey(HINGE));
    expect(hinge.textContent).toContain("71B3550");
    expect(hinge.textContent).toContain("Needs 4");
    expect(hinge.textContent).toContain("On Door (4)");
    expect(within(hinge).getByTestId("shop-cost").textContent).toBe("price not set");
    // Every price field starts empty: no price is shipped.
    for (const input of within(sec).getAllByLabelText(/^Price per /)) expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("shop-total").textContent).toContain("$0.00");
    expect(screen.getByTestId("shop-unpriced").textContent).toMatch(/No prices yet/);
    // The template is a tool, bought once, though two drawer fronts carry it.
    const tool = rowOf(itemKey(TEMPLATE));
    expect(tool.closest("[data-category]")!.getAttribute("data-category")).toBe("tools");
    expect(tool.textContent).toContain("Needs 1");
    // The part the nesting could not place is said.
    expect(screen.getByTestId("shop-unplaced").textContent).toMatch(/^1 part is on no stock/);
    // Banding is a placeholder for now.
    expect(sec.querySelector('[data-category="banding"]')!.textContent).toMatch(/not worked out yet/);
    // Overage defaults are stated as assumptions.
    expect(screen.getByTestId("shop-assumptions").textContent).toMatch(/10% for sheet goods, 20% for lumber.*assumptions, not facts/);
  });

  it("a price typed is costed with the overage, kept in the prefs, and the total names what it leaves out", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByLabelText("Price per sheet: 4 x 8 sheet, 1/4"), { target: { value: "42.50" } });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ prices: { "sheet|4 x 8 sheet, 1/4|": 42.5 } }));
    const sheet = rowOf("sheet|4 x 8 sheet, 1/4|");
    // 1 sheet + 10% buys 2.
    expect(sheet.textContent).toContain("buy 2 sheets (10% over; 1 sheet without)");
    expect(within(sheet).getByTestId("shop-cost").textContent).toBe("$85.00");
    const total = screen.getByTestId("shop-total").textContent!;
    expect(total).toContain("$85.00 with overage");
    expect(total).toContain("$42.50 without");
    expect(screen.getByTestId("shop-unpriced").textContent).toBe(`The total leaves out 4 rows with no price: 4/4 x 12 x 96, ${HINGE.item}, 5 mm shelf pins, Blum concealed runner template.`);
    // Overage to 0: the sheet is bought as nested.
    fireEvent.change(screen.getByLabelText("Sheet goods overage (%)"), { target: { value: "0" } });
    expect(within(rowOf("sheet|4 x 8 sheet, 1/4|")).getByTestId("shop-cost").textContent).toBe("$42.50");
    // Clearing the price puts it back to not set.
    fireEvent.change(screen.getByLabelText("Price per sheet: 4 x 8 sheet, 1/4"), { target: { value: "" } });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ prices: {} }));
  });

  it("a pack size rounds up to whole packs; a bad entry is refused, not committed", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} start={{ ...defaultShopPrefs("USD"), prices: { [itemKey(PINS)]: 9 } }} />);
    fireEvent.change(screen.getByLabelText(`Pack size: ${PINS.item}`), { target: { value: "50" } });
    const pins = rowOf(itemKey(PINS));
    expect(pins.textContent).toContain("buy 1 pack of 50 (50)");
    expect(pins.textContent).toContain("per pack of 50");
    expect(within(pins).getByTestId("shop-cost").textContent).toBe("$9.00");
    spy.mockClear();
    fireEvent.change(screen.getByLabelText(`Pack size: ${PINS.item}`), { target: { value: "2.5" } });
    expect(spy).not.toHaveBeenCalled();
    expect((screen.getByLabelText(`Pack size: ${PINS.item}`) as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
  });

  it("money follows the currency; labour saved is hours times the rate", () => {
    render(<Harness start={{ ...defaultShopPrefs("EUR"), prices: { [itemKey(HINGE)]: 4 } }} locale="de-DE" />);
    expect(within(rowOf(itemKey(HINGE))).getByTestId("shop-cost").textContent).toMatch(/^16,00\s€$/);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "gbp" } });
    expect(within(rowOf(itemKey(HINGE))).getByTestId("shop-cost").textContent).toMatch(/^16,00\s£$/);
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Hourly rate"), { target: { value: "45" } });
    expect(screen.getByTestId("shop-labour").textContent).toMatch(/450,00\s£/);
  });

  it("without the nesting it says it is working the sheets out, and still lists the hardware", () => {
    render(<Harness nesting={null} />);
    expect(screen.getAllByText(/Working out the nesting/).length).toBeGreaterThan(0);
    expect(rowOf(itemKey(HINGE))).toBeTruthy();
  });

  it("reads typed amounts the way people type them", () => {
    expect(parseAmount("12.50")).toBe(12.5);
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("$1,234.5")).toBe(1234.5);
    expect(parseAmount("")).toBeNull();
    expect(Number.isNaN(parseAmount("abc")!)).toBe(true);
    expect(Number.isNaN(parseAmount("1.2.3")!)).toBe(true);
  });

  it("the cut list's Shopping list button opens it", () => {
    const onShop = vi.fn();
    const p: CutListPaneProps = {
      list: bookshelf(),
      rounding: "sixteenth",
      onRounding: vi.fn(),
      visibleOnly: false,
      onVisibleOnly: vi.fn(),
      selected: new Set(),
      onSelectRows: vi.fn(),
      onGrain: vi.fn(),
      onStock: vi.fn(),
      onCsv: vi.fn(),
      onPdf: vi.fn(),
      onPrint: vi.fn(),
      onLabels: vi.fn(),
      onShop,
    };
    render(<CutListPane {...p} />);
    const btn = screen.getByRole("button", { name: "Shopping list ›" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(onShop).toHaveBeenCalled();
    cleanup();
    render(<CutListPane {...p} shopOpen shopping={<p>the list</p>} />);
    expect(screen.getByRole("button", { name: "Shopping list ‹" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("the list")).toBeTruthy();
  });
});
