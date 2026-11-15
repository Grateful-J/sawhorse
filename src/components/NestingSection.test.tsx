import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handWorkLegend } from "../nesting/cnc";
import { smallNesting } from "../nesting/fixture";
import { NestingSection, type NestingSectionProps } from "./NestingSection";
import { StockDialog, type StockDialogProps } from "./StockDialog";
import { CutListPane, type CutListPaneProps } from "./CutListPane";
import { bookshelf } from "../cutlist/fixture";
import { defaultShop } from "../cam/store";
import { jobSheet } from "../nesting/jobsheet";
import type { Nesting, StockPiece } from "../kernel/types";

afterEach(cleanup);

const IN = 0.0254;

function props(over: Partial<NestingSectionProps> = {}): NestingSectionProps {
  return {
    nesting: smallNesting(),
    rounding: "sixteenth",
    units: "frac-in",
    onSettings: vi.fn(),
    onStock: vi.fn(),
    onHover: vi.fn(),
    onSelect: vi.fn(),
    onSvg: vi.fn(),
    onDxf: vi.fn(),
    onPdf: vi.fn(),
    ...over,
  };
}

describe("Nesting section", () => {
  it("shows the tiles, the parts no stock takes, and a diagram per piece", () => {
    render(<NestingSection {...props()} />);
    expect(screen.getByTestId("tile-nest-sheets").textContent).toContain("1");
    expect(screen.getByTestId("tile-nest-sheets").textContent).toContain("4 x 8 sheet, 1/4");
    expect(screen.getByTestId("tile-nest-boards").textContent).toContain("1 × 4/4, 8.0 bd ft");
    expect(screen.getByTestId("tile-nest-yield").textContent).toContain("3 of 4 parts placed");
    const alert = screen.getByTestId("nest-unplaced");
    expect(alert.textContent).toContain("Top");
    expect(alert.textContent).toContain("only with its grain across");
    const figs = document.querySelectorAll("figure.nest-piece");
    expect(figs.length).toBe(2);
    expect(figs[0].querySelectorAll("g.part").length).toBe(2);
    expect(figs[0].querySelectorAll("line.cut").length).toBe(4);
    expect(figs[0].textContent).toContain("Board 1 of 1");
    expect(within(figs[0] as HTMLElement).getAllByText(/Rip to 11 in/).length).toBe(2);
    expect(screen.getByTestId("nest-note").textContent).toContain("Kerf 1/8 in");
  });

  it("hovering a part lights it in the model, clicking selects it, and the model lights it back", () => {
    const p = props();
    const { rerender } = render(<NestingSection {...p} />);
    const part = document.querySelector('g.part[data-tag="1b"]')!;
    fireEvent.mouseEnter(part);
    expect(p.onHover).toHaveBeenLastCalledWith(expect.objectContaining({ tag: "1b", item: { node: 4 } }));
    expect(part.getAttribute("class")).toContain("on");
    fireEvent.click(part);
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ tag: "1b" }));
    fireEvent.mouseLeave(part.closest("svg")!);
    expect(p.onHover).toHaveBeenLastCalledWith(null);
    rerender(<NestingSection {...p} lit="2" />);
    expect(document.querySelector('g.part[data-tag="2"]')!.getAttribute("class")).toContain("on");
  });

  it("a part clicked in a diagram shows its grain, and picking Free to turn sets it (every copy)", () => {
    const onGrain = vi.fn();
    render(<NestingSection {...props({ onGrain })} />);
    expect(screen.queryByTestId("nest-pick")).toBeNull();
    fireEvent.click(document.querySelector('g.part[data-tag="1b"]')!);
    const bar = screen.getByTestId("nest-pick");
    expect(bar.textContent).toContain("1b");
    const select = bar.querySelector("select")!;
    expect(select.value).toBe("length");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Along its length", "Across its width", "Free to turn"]);
    fireEvent.change(select, { target: { value: "none" } });
    expect(onGrain).toHaveBeenCalledWith(expect.objectContaining({ tag: "1b" }), "none");
    // Without the handler there is no bar.
    cleanup();
    render(<NestingSection {...props()} />);
    fireEvent.click(document.querySelector('g.part[data-tag="1b"]')!);
    expect(screen.queryByTestId("nest-pick")).toBeNull();
  });

  it("kerf and trim take typed lengths, the saw switches, and bad input says why", () => {
    vi.useFakeTimers();
    const p = props();
    render(<NestingSection {...p} />);
    const kerf = screen.getByLabelText("Kerf") as HTMLInputElement;
    expect(kerf.value).toBe("1/8 in");
    fireEvent.change(kerf, { target: { value: "3/32" } });
    fireEvent.keyDown(kerf, { key: "Enter" });
    expect(p.onSettings).toHaveBeenLastCalledWith({ kerf: (3 / 32) * IN, trim: 0, algorithm: "guillotine" }, { kerf: (3 / 32) * IN });
    // A pause after typing commits too.
    const trim = screen.getByLabelText("Trim") as HTMLInputElement;
    fireEvent.change(trim, { target: { value: "1/4" } });
    vi.advanceTimersByTime(800);
    expect(p.onSettings).toHaveBeenLastCalledWith({ kerf: IN / 8, trim: IN / 4, algorithm: "guillotine" }, { trim: IN / 4 });
    const calls = (p.onSettings as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.change(kerf, { target: { value: "2 in" } });
    fireEvent.keyDown(kerf, { key: "Enter" });
    expect((p.onSettings as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(kerf.closest("label")!.getAttribute("title")).toContain("0 to 1/2 in");
    fireEvent.change(screen.getByLabelText("Nesting algorithm"), { target: { value: "maxrects" } });
    expect(p.onSettings).toHaveBeenLastCalledWith({ kerf: IN / 8, trim: 0, algorithm: "maxrects" }, { algorithm: "maxrects" });
    vi.useRealTimers();
  });

  it("#49: the joint loss takes a typed length, 0 to 1/2 in, and keeps the other settings", () => {
    const p = props();
    render(<NestingSection {...p} />);
    const joint = screen.getByLabelText("Joint loss") as HTMLInputElement;
    // Absent from the document's settings: the 1/8 in default.
    expect(joint.value).toBe("1/8 in");
    fireEvent.change(joint, { target: { value: "1/16" } });
    fireEvent.keyDown(joint, { key: "Enter" });
    expect(p.onSettings).toHaveBeenLastCalledWith({ kerf: IN / 8, trim: 0, algorithm: "guillotine", jointLoss: IN / 16 }, { jointLoss: IN / 16 });
    fireEvent.change(joint, { target: { value: "1 in" } });
    fireEvent.keyDown(joint, { key: "Enter" });
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    expect(joint.closest("label")!.getAttribute("title")).toContain("0 to 1/2 in");
  });

  it("#49: a glued part lists its glue-up, each strip at its own width, and the model lights every strip", () => {
    const n = smallNesting();
    const piece = n.pieces[0];
    // A 15 x 34 1/2 in shelf glued from the 12 in board: 12 + 3 1/8 (1/8 in joint loss).
    const strip = (k: number, y: number, w: number) => ({ ...piece.placements[0], tag: `1a.${k}`, y: y * IN, dy: w * IN, size: [0.75 * IN, 15 * IN, 34.5 * IN] as [number, number, number], strip: { n: k, of: 2 } });
    piece.placements = [strip(1, 0, 12), { ...strip(2, 0, 3.125), x: 34.625 * IN }, piece.placements[1]];
    n.glue_ups = [{ row: 0, copy: 1, tag: "1a", name: "Shelf", item: piece.placements[0].item, stock: "4/4 x 12 x 96", widths: [12 * IN, 3.125 * IN] }];
    const p = props({ nesting: n, lit: "1a" });
    render(<NestingSection {...p} />);
    expect(screen.getByTestId("nest-glued").textContent).toContain("1a Shelf: glued up from 2 strips of 4/4 x 12 x 96, 12 + 3 1/8 in");
    const parts = within(screen.getAllByRole("figure")[0]).getAllByRole("listitem").map((li) => li.textContent);
    expect(parts).toContain("1a.1 Shelf, strip 1 of 2 12 × 34 1/2");
    expect(parts).toContain("1a.2 Shelf, strip 2 of 2 3 1/8 × 34 1/2");
    // The model's part lights both strips, and not the other shelf.
    const lit = [...document.querySelectorAll(".nest-diagram .part.on")].map((g) => g.getAttribute("data-tag"));
    expect(lit.sort()).toEqual(["1a.1", "1a.2"]);
    // The footer names the joint loss when something is glued up.
    expect(screen.getByTestId("nest-note").textContent).toContain("joint loss 1/8 in");
  });

  // Lane 30, from the #33 review: the field's 700 ms pause timer kept the value, the shown
  // text and the settings of the render it was set in.
  it("Enter commits a typed kerf once: the pause after the typing does not commit it again", () => {
    vi.useFakeTimers();
    const p = props();
    const { rerender } = render(<NestingSection {...p} />);
    const kerf = screen.getByLabelText("Kerf") as HTMLInputElement;
    // Typed the way the field shows lengths, so the shown text will not change it back.
    fireEvent.change(kerf, { target: { value: "3/16 in" } });
    fireEvent.keyDown(kerf, { key: "Enter" });
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    // The app applies it and the field shows it.
    const n = smallNesting();
    rerender(<NestingSection {...p} nesting={{ ...n, settings: { ...n.settings, kerf: (3 / 16) * IN } }} />);
    expect(kerf.value).toBe("3/16 in");
    vi.advanceTimersByTime(800);
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("a value changed from outside while a typed one waits is kept: the timer neither commits again nor undoes the other field", () => {
    vi.useFakeTimers();
    const p = props();
    const { rerender } = render(<NestingSection {...p} />);
    const kerf = screen.getByLabelText("Kerf") as HTMLInputElement;
    fireEvent.change(kerf, { target: { value: "3/16 in" } });
    vi.advanceTimersByTime(300);
    // A plugin (or Redo) sets the kerf to what was typed and the trim to 1/4 in.
    const n = smallNesting();
    rerender(<NestingSection {...p} nesting={{ ...n, settings: { ...n.settings, kerf: (3 / 16) * IN, trim: IN / 4 } }} />);
    expect(kerf.value).toBe("3/16 in");
    expect((screen.getByLabelText("Trim") as HTMLInputElement).value).toBe("1/4 in");
    vi.advanceTimersByTime(800);
    // Nothing to commit: the kerf already is 3/16, and the trim must not go back to 0.
    expect(p.onSettings).not.toHaveBeenCalled();
    // Typing after that commits against the settings as they are now.
    fireEvent.change(kerf, { target: { value: "1/16" } });
    vi.advanceTimersByTime(800);
    expect(p.onSettings).toHaveBeenLastCalledWith({ kerf: IN / 16, trim: IN / 4, algorithm: "guillotine" }, { kerf: IN / 16 });
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("exports: every SVG, one piece's SVG, both DXFs and the PDF", () => {
    const p = props();
    render(<NestingSection {...p} />);
    const row = document.querySelector(".nesting > .btnrow")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "SVG" }));
    expect(p.onSvg).toHaveBeenLastCalledWith(null);
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "DXF" }));
    expect(p.onDxf).toHaveBeenLastCalledWith("lwpolyline");
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "DXF R12" }));
    expect(p.onDxf).toHaveBeenLastCalledWith("r12");
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "PDF" }));
    expect(p.onPdf).toHaveBeenCalled();
    const fig = document.querySelectorAll("figure.nest-piece")[1] as HTMLElement;
    fireEvent.click(within(fig).getByRole("button", { name: "SVG" }));
    expect(p.onSvg).toHaveBeenLastCalledWith(expect.objectContaining({ index: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Stock…" }));
    expect(p.onStock).toHaveBeenCalled();
  });

  it("no file is saved from a nesting that is not of the model as it is: every file button is off and says why", () => {
    const p = props({ onCnc: vi.fn(), blocked: "Nothing was saved: the model changed and the nesting is being worked out again. Save again in a moment." });
    const { rerender } = render(<NestingSection {...p} />);
    const row = document.querySelector(".nesting > .btnrow") as HTMLElement;
    expect(row.getAttribute("data-blocked")).toBe("true");
    const buttons = [...row.querySelectorAll("button"), ...document.querySelectorAll("figure.nest-piece summary button")] as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(["SVG", "DXF", "DXF R12", "CNC files", "PDF", "SVG", "SVG"]);
    for (const b of buttons) {
      expect(b.disabled, b.textContent ?? "").toBe(true);
      expect(b.title).toBe("Not now: the model changed and the nesting is being worked out again. Save again in a moment.");
      fireEvent.click(b);
    }
    for (const f of [p.onSvg, p.onDxf, p.onCnc, p.onPdf]) expect(f).not.toHaveBeenCalled();
    // The nesting caught up: the buttons are back, with their own titles.
    rerender(<NestingSection {...p} blocked={null} />);
    expect(row.getAttribute("data-blocked")).toBeNull();
    for (const b of buttons) expect(b.disabled, b.textContent ?? "").toBe(false);
    expect((within(row).getByRole("button", { name: "CNC files" }) as HTMLButtonElement).title).toContain("One DXF per sheet");
    fireEvent.click(within(row).getByRole("button", { name: "CNC files" }));
    expect(p.onCnc).toHaveBeenCalledTimes(1);
  });

  it("a nesting that failed keeps the old diagrams and says no file is saved from them", () => {
    render(<NestingSection {...props({ problem: "The nesting could not be worked out: a stock is missing.", blocked: "Nothing was saved: the nesting could not be worked out for the model as it is now." })} />);
    expect(screen.getByText(/a stock is missing\. The diagrams below are of the model before that: no file is saved from them\./)).toBeTruthy();
    expect(document.querySelectorAll("figure.nest-piece").length).toBe(2);
    expect((screen.getByRole("button", { name: "PDF" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says why when there is no nesting, and nothing to export", () => {
    render(<NestingSection {...props({ nesting: null, problem: "Nesting is worked out by the kernel, which is not loaded." })} />);
    expect(screen.getByText(/not loaded/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "PDF" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Stock dialog", () => {
  function dprops(over: Partial<StockDialogProps> = {}): StockDialogProps {
    return {
      library: smallNesting().library,
      materials: ["Oak", "3/4 birch ply"],
      rounding: "sixteenth",
      units: "frac-in",
      onDefine: vi.fn(),
      onDelete: vi.fn(),
      onDefault: vi.fn(),
      onReset: vi.fn(),
      onSheetSize: vi.fn(),
      onClose: vi.fn(),
      ...over,
    };
  }

  it("the sheet-set button says what it adds in the document's units: 23/32, 15/32, 7/32 in, or 18, 12 and 6 mm", () => {
    const onSheetSet = vi.fn();
    const { rerender } = render(<StockDialog {...dprops({ onSheetSet })} />);
    const button = () => document.querySelector('[data-action="sheet-set"]') as HTMLButtonElement;
    expect(button().textContent).toBe("Use 4 × 4 plywood (3/4, 1/2, 1/4)");
    expect(button().title).toContain("23/32, 15/32 and 7/32 in actual");
    expect(button().title).not.toContain("mm");
    for (const units of ["mm", "cm", "m"] as const) {
      rerender(<StockDialog {...dprops({ onSheetSet, units })} />);
      expect(button().textContent).toBe("Use 4 × 4 plywood (18, 12, 6 mm)");
      expect(button().title).toContain("1220 x 1220 mm plywood sheets, 18, 12 and 6 mm thick");
      expect(button().title).not.toContain("23/32");
    }
    // The footprint asked for is the same; the app makes it metric in a metric document.
    fireEvent.click(button());
    expect(onSheetSet).toHaveBeenLastCalledWith({ width: 48 * IN, length: 48 * IN });
  });

  it("sets a material's stock, adds, edits and deletes stock", () => {
    const p = dprops();
    render(<StockDialog {...p} />);
    fireEvent.change(screen.getByLabelText("Stock for Oak"), { target: { value: "4/4 x 12 x 96" } });
    expect(p.onDefault).toHaveBeenLastCalledWith("Oak", "4/4 x 12 x 96");
    fireEvent.change(screen.getByLabelText("Stock for Oak"), { target: { value: "" } });
    expect(p.onDefault).toHaveBeenLastCalledWith("Oak", null);
    // Add a 5 x 5 sheet.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "5 x 5 birch, 1/2" } });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "5'" } });
    fireEvent.change(screen.getByLabelText("Actual thickness"), { target: { value: "1/2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(p.onDefine).toHaveBeenLastCalledWith({ name: "5 x 5 birch, 1/2", kind: "sheet", width: 60 * IN, length: 60 * IN, thickness: 0.5 * IN, nominal: null, grain: "length" }, null);
    // Edit the board: the form fills in with units; saving names the one replaced.
    fireEvent.click(screen.getByRole("button", { name: "Edit 4/4 x 12 x 96" }));
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("12 in");
    expect((screen.getByLabelText("Nominal") as HTMLInputElement).value).toBe("4/4");
    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "10'" } });
    fireEvent.click(screen.getByRole("button", { name: "Save stock" }));
    expect(p.onDefine).toHaveBeenLastCalledWith(expect.objectContaining({ name: "4/4 x 12 x 96", kind: "board", length: 120 * IN, nominal: "4/4" }), "4/4 x 12 x 96");
    // Nest sheet goods on a footprint already in the library. A preset only fills the form.
    fireEvent.change(screen.getByLabelText("Nest sheet goods on"), { target: { value: "0" } });
    expect(p.onSheetSize).toHaveBeenLastCalledWith({ width: 48 * IN, length: 96 * IN });
    const defines = (p.onDefine as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "4×4" }));
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toMatch(/48/);
    expect((screen.getByLabelText("Length") as HTMLInputElement).value).toMatch(/48/);
    expect(p.onDefine).toHaveBeenCalledTimes(defines);
    expect(p.onSheetSize).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete 4 x 8 sheet, 1/4" }));
    expect(p.onDelete).toHaveBeenCalledWith("4 x 8 sheet, 1/4");
    fireEvent.click(screen.getByRole("button", { name: "Built-in stock" }));
    expect(p.onReset).toHaveBeenCalled();
  });

  it("fills the actual thickness from the nominal until it is typed (lane 15)", () => {
    const p = dprops();
    render(<StockDialog {...p} />);
    const actual = () => (screen.getByLabelText("Actual thickness") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ply 3/4" } });
    fireEvent.change(screen.getByLabelText("Nominal"), { target: { value: "3/4" } });
    expect(actual()).toBe("23/32 in");
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "board" } });
    fireEvent.change(screen.getByLabelText("Nominal"), { target: { value: "8/4" } });
    expect(actual()).toBe("1 3/4 in");
    fireEvent.change(screen.getByLabelText("Nominal"), { target: { value: "5/4" } });
    expect(actual()).toBe("1 1/16 in");
    // An override sticks: the nominal no longer changes it.
    fireEvent.change(screen.getByLabelText("Actual thickness"), { target: { value: "1-1/8\"" } });
    fireEvent.change(screen.getByLabelText("Nominal"), { target: { value: "6/4" } });
    expect(actual()).toBe('1-1/8"');
    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(p.onDefine).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Ply 3/4", kind: "board", thickness: 1.125 * IN, nominal: "6/4" }), null);
    // A sheet keeps its nominal too.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ply half" } });
    fireEvent.change(screen.getByLabelText("Nominal"), { target: { value: "1/2" } });
    expect(actual()).toBe("15/32 in");
    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(p.onDefine).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "sheet", thickness: (15 / 32) * IN, nominal: "1/2" }), null);
  });

  // Lane 15 verifier: the list rounded actual thicknesses to the cut list's 1/16 in, so
  // 23/32, 15/32 and 7/32 plywood read "3/4 in actual", "1/2 in actual", "1/4 in actual".
  it("lists each stock's actual thickness at the saw's precision, not the cut list's rounding", () => {
    const sheet = (nominal: string, t: number) => ({ name: `4 x 8 ply, ${nominal}`, kind: "sheet" as const, width: 48 * IN, length: 96 * IN, thickness: t * IN, nominal, grain: "length" as const });
    const library = { ...smallNesting().library, stocks: [sheet("3/4", 23 / 32), sheet("1/2", 15 / 32), sheet("1/4", 7 / 32)] };
    render(<StockDialog {...dprops({ library })} />);
    const list = screen.getByRole("table", { name: "Stock library" }).textContent ?? "";
    expect(list).toContain("sheet 3/4 nominal · 48 × 96 × 23/32 in actual");
    expect(list).toContain("sheet 1/2 nominal · 48 × 96 × 15/32 in actual");
    expect(list).toContain("sheet 1/4 nominal · 48 × 96 × 7/32 in actual");
    expect(list).not.toContain("× 3/4 in actual");
    cleanup();
    render(<StockDialog {...dprops({ library, rounding: "half_mm" })} />);
    expect(screen.getByRole("table", { name: "Stock library" }).textContent).toContain("1219 × 2438.5 × 18.26 mm actual");
  });

  it("refuses stock nobody can cut from, and says why", () => {
    const p = dprops();
    render(<StockDialog {...p} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Odd" } });
    fireEvent.change(screen.getByLabelText("Actual thickness"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(p.onDefine).not.toHaveBeenCalled();
    expect(screen.getByText(/thicker than it is wide/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "wide" } });
    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(screen.getByText(/Width:/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(p.onClose).toHaveBeenCalled();
  });
});

describe("Cut list pane with nesting", () => {
  function cprops(over: Partial<CutListPaneProps> = {}): CutListPaneProps {
    return {
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
      ...over,
    };
  }

  it("the Nesting button opens and closes the section under the list", () => {
    const onNest = vi.fn();
    const { rerender } = render(<CutListPane {...cprops({ onNest, nestOpen: false })} />);
    const b = screen.getByRole("button", { name: "Nesting ›" });
    expect(b.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(b);
    expect(onNest).toHaveBeenCalled();
    rerender(<CutListPane {...cprops({ onNest, nestOpen: true, nesting: <NestingSection {...props()} /> })} />);
    expect(screen.getByRole("button", { name: "Nesting ‹" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("nesting")).toBeTruthy();
  });
});

describe("Nesting section: the track saw for what the CNC cannot take", () => {
  /** A 4 x 4 CNC shop whose 71 1/4 in back panel is on no stock (too large). */
  const cncOnly = () => {
    const n = smallNesting();
    n.settings = { ...n.settings, algorithm: "maxrects", kerf: 0.375 * IN, trim: 0.5 * IN, sheetSize: { width: 48 * IN, length: 48 * IN } };
    n.library = { ...n.library, settings: n.settings };
    n.unplaced.push({ row: 1, copy: 1, tag: "2", name: "Back panel", item: { node: 7 }, size: [0.25 * IN, 34.5 * IN, 71.25 * IN], material: null, stock: "4 x 4 sheet, 1/4", sheet: true, reason: "too_large" });
    n.pieces = n.pieces.slice(0, 1);
    return n;
  };

  it("offers the track saw for parts too large for the CNC's sheet, and the switch beside the kerf", () => {
    const onOverflow = vi.fn();
    render(<NestingSection {...props({ nesting: cncOnly(), onOverflow })} />);
    const offer = screen.getByRole("button", { name: "Cut it on the track saw" });
    fireEvent.click(offer);
    expect(onOverflow).toHaveBeenLastCalledWith(true);
    const box = document.querySelector('[data-field="overflow"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onOverflow).toHaveBeenLastCalledWith(true);
    // No saw yet: no saw kerf, no badges.
    expect(screen.queryByLabelText("Saw kerf")).toBeNull();
    expect(document.querySelector(".via")).toBeNull();
  });

  it("with the saw on: its kerf and trim, a badge on every sheet, and the switch turns it off", () => {
    const n = cncOnly();
    n.unplaced = n.unplaced.filter((u) => u.tag !== "2");
    const back = smallNesting().pieces[1];
    n.pieces.push({ ...back, saw: true, trim: IN / 4 });
    n.settings = { ...n.settings, overflow: { sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: IN / 8, trim: IN / 4 } };
    const onOverflow = vi.fn();
    const onSettings = vi.fn();
    render(<NestingSection {...props({ nesting: n, onOverflow, onSettings })} />);
    expect(screen.queryByRole("button", { name: /on the track saw/ })).toBeNull();
    const figs = document.querySelectorAll("figure.nest-piece");
    expect(figs[0].querySelector(".via")?.textContent).toBe("CNC");
    expect(figs[1].querySelector(".via.saw")?.textContent).toBe("Track saw");
    expect(figs[1].getAttribute("data-saw")).toBe("true");
    const kerf = screen.getByLabelText("Saw kerf") as HTMLInputElement;
    expect(kerf.value).toBe("1/8 in");
    fireEvent.change(kerf, { target: { value: "3/32" } });
    fireEvent.keyDown(kerf, { key: "Enter" });
    // The change goes with the settings as a patch, for the app to apply to the settings as they
    // are now: only the field that was typed, so Saw kerf then Saw trim both land.
    const saw = { sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: (3 / 32) * IN, trim: IN / 4 };
    expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({ overflow: saw }), { overflow: { kerf: (3 / 32) * IN } });
    const trim = screen.getByLabelText("Saw trim") as HTMLInputElement;
    fireEvent.change(trim, { target: { value: "1/2" } });
    fireEvent.keyDown(trim, { key: "Enter" });
    expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({ overflow: { ...saw, kerf: IN / 8, trim: IN / 2 } }), { overflow: { trim: IN / 2 } });
    fireEvent.click(document.querySelector('[data-field="overflow"]') as HTMLInputElement);
    expect(onOverflow).toHaveBeenLastCalledWith(false);
  });

  it("lists the saw's parts with cuts to do by hand", () => {
    const work = [{ tag: "2", name: "Back panel", sheet: "Sheet 1 of 1 · 4 x 8 sheet, 1/4", pockets: 2, holes: 12, cutouts: 0, shaped: false, lines: ["Pocket 3/4 × 33 1/2, 1/4 deep: 10 to 10 3/4 from end A, 1/2 to 34 from edge B"] }] as unknown as NonNullable<NestingSectionProps["handWork"]>;
    render(<NestingSection {...props({ handWork: work })} />);
    const box = screen.getByTestId("nest-handwork");
    expect(box.textContent).toContain("1 track saw part has cuts to do by hand");
    expect(box.textContent).toContain("Back panel: 2 pockets, 12 holes");
    expect(box.querySelector("li")?.getAttribute("title")).toContain("Pocket 3/4");
    // Where the positions are measured from is said with the list, as in the saved file.
    expect(screen.getByTestId("nest-handwork-legend").textContent).toContain(handWorkLegend("sixteenth"));
  });

  it("says so when the saw's parts could not be measured, with or without a list", () => {
    const note = "The track saw's parts could not be measured, so their dados and holes are not listed: mark each from the model.";
    // No list at all: the note alone, never an empty section that reads as "nothing to do".
    const { rerender } = render(<NestingSection {...props({ handWork: [], handWorkNote: note })} />);
    expect(screen.getByTestId("nest-handwork-note").textContent).toBe(note);
    expect(screen.getByTestId("nest-handwork").textContent).not.toContain("cuts to do by hand");
    const work = [{ tag: "2", name: "Back panel", sheet: "Sheet 1 of 1", pockets: 1, holes: 0, cutouts: 0, shaped: false, lines: [] }] as unknown as NonNullable<NestingSectionProps["handWork"]>;
    rerender(<NestingSection {...props({ handWork: work, handWorkNote: "The cuts on Left side could not be measured, so it is missing from the hand work list: mark it from the model." })} />);
    expect(screen.getByTestId("nest-handwork").textContent).toContain("1 track saw part has cuts to do by hand");
    expect(screen.getByTestId("nest-handwork-note").textContent).toContain("Left side");
    rerender(<NestingSection {...props({ handWork: work })} />);
    expect(screen.queryByTestId("nest-handwork-note")).toBeNull();
    rerender(<NestingSection {...props({ handWork: [] })} />);
    expect(screen.queryByTestId("nest-handwork")).toBeNull();
  });

  it("shows no switch without a CNC sheet size", () => {
    render(<NestingSection {...props({ onOverflow: vi.fn() })} />);
    expect(document.querySelector('[data-field="overflow"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /on the track saw/ })).toBeNull();
  });
});

describe("a router sheet's Job sheet", () => {
  /** The job sheet of a piece, as the app works it out (outlines only, no cuts measured). */
  const jobOf = (n: Nesting) => async (piece: StockPiece) => {
    const shop = defaultShop();
    shop.profileTool = "seed-compression";
    return jobSheet({ n, index: n.pieces.indexOf(piece), measured: { features: new Map(), skipped: [], flipped: [] }, shop, units: "sixteenth", file: "K 02 CNC.dxf", ownerOf: () => null });
  };

  it("ticks a cut layer, has no box for STOCK and LABELS, keeps its lists valid, and starts its ticks again with a new nesting", async () => {
    const n = smallNesting();
    const p = props({ nesting: n, jobSheetOf: jobOf(n) });
    const { rerender } = render(<NestingSection {...p} />);
    const fig = document.querySelector('figure.nest-piece[data-piece="2"]') as HTMLElement;
    fireEvent.click(within(fig).getByRole("button", { name: "Job sheet" }));
    await within(fig).findByRole("heading", { name: /Layers: 0 of 1 with a toolpath/ });
    const view = within(fig).getByTestId("job-sheet");
    // STOCK and LABELS: reference, no box.
    expect(view.querySelector('li[data-layer="STOCK"] input')).toBeNull();
    expect(view.querySelector('li[data-layer="LABELS"] input')).toBeNull();
    expect(view.querySelector('li[data-layer="STOCK"]')!.textContent).toContain("reference: no toolpath");
    // A dl holds only dt, dd and div.
    for (const dl of view.querySelectorAll("dl")) for (const c of dl.children) expect(["DT", "DD", "DIV"]).toContain(c.tagName);
    fireEvent.click(within(view).getByRole("checkbox", { name: "PROFILE_THRU has its toolpath" }));
    expect(within(view).getByRole("heading", { name: /Layers: 1 of 1 with a toolpath/ })).toBeTruthy();
    // A new nesting (the same pieces, worked out again): the ticks start again.
    const again: Nesting = { ...n, hash: `${n.hash}-2` };
    rerender(<NestingSection {...p} nesting={again} jobSheetOf={jobOf(again)} />);
    const fig2 = document.querySelector('figure.nest-piece[data-piece="2"]') as HTMLElement;
    await within(fig2).findByRole("heading", { name: /Layers: 0 of 1 with a toolpath/ });
    const fresh = within(fig2).getByTestId("job-sheet");
    expect((within(fresh).getByRole("checkbox", { name: "PROFILE_THRU has its toolpath" }) as HTMLInputElement).checked).toBe(false);
  });
});

