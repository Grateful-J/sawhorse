// The cut list by assembly: each piece under the cabinet or base frame it is in.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item, Occurrence } from "../kernel/types";
import { row } from "../cutlist/fixture";
import { CutListPane, groupRows, type CutListPaneProps } from "./CutListPane";
import { bookshelf } from "../cutlist/fixture";

afterEach(cleanup);

const occ = (node: number, visible = true): Occurrence => ({ item: { node }, visible, handed: false, min: [0, 0, 0], max: [1, 1, 1] }) as unknown as Occurrence;
/** Nodes 1-9 are in Base 1, 10-19 in Base frame 1, the rest in nothing. */
const ownerOf = (item: Item) => {
  const id = "node" in item ? item.node : 0;
  return id < 10 ? "Base 1" : id < 20 ? "Base frame 1" : null;
};

describe("groupRows", () => {
  it("puts each part under its assembly, a shared part split by its pieces, loose parts last", () => {
    const rows = [
      row("Left side", 1, [12, 372, 488], { occurrences: [occ(1)], board_feet: 1 }),
      row("Base sleeper", 9, [12, 64, 290], { occurrences: Array.from({ length: 9 }, (_, i) => occ(10 + i)) }),
      row("Loose shelf", 1, [12, 176, 552], { occurrences: [occ(30)] }),
      // The same part in both: 2 pieces in Base 1, 1 in Base frame 1 (hidden).
      row("Cleat", 3, [12, 32, 300], { occurrences: [occ(2), occ(3), occ(11, false)], board_feet: 3, total: 3, hidden: 1 }),
    ];
    const g = groupRows(rows, ownerOf, false);
    expect(g.map((x) => [x.owner, x.rows.map((r) => `${r.name} ${r.qty}`)])).toEqual([
      ["Base 1", ["Left side 1", "Cleat 2"]],
      ["Base frame 1", ["Base sleeper 9", "Cleat 1"]],
      [null, ["Loose shelf 1"]],
    ]);
    const cleat = g[1].rows[1];
    expect([cleat.qty, cleat.total, cleat.hidden, cleat.occurrences.length]).toEqual([1, 1, 1, 1]);
    expect(cleat.board_feet).toBeCloseTo(1, 9);
    // Visible only: the hidden piece is not counted.
    expect(groupRows(rows, ownerOf, true)[1].rows[1].qty).toBe(0);
    // A part in one assembly is its own row, unchanged.
    expect(g[0].rows[0]).toBe(rows[0]);
  });

  it("keeps a part with no pieces under no assembly", () => {
    const g = groupRows([row("Ghost", 0, [12, 10, 10])], ownerOf, false);
    expect(g).toEqual([{ owner: null, rows: [expect.objectContaining({ name: "Ghost" })] }]);
  });
});

describe("Cut list pane: by assembly", () => {
  const props = (over: Partial<CutListPaneProps> = {}): CutListPaneProps => ({
    list: { ...bookshelf(), rows: [row("Left side", 1, [12, 372, 488], { occurrences: [occ(1)] }), row("Base sleeper", 9, [12, 64, 290], { occurrences: Array.from({ length: 9 }, (_, i) => occ(10 + i)) })] },
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
  });

  it("draws a heading per assembly with its pieces, and the switch says so", () => {
    const onByAssembly = vi.fn();
    render(<CutListPane {...props({ byAssembly: true, onByAssembly, ownerOf })} />);
    const heads = [...document.querySelectorAll("tr.group")].map((tr) => tr.textContent);
    expect(heads).toEqual(["Base 1 · 1 piece", "Base frame 1 · 9 pieces"]);
    // The rows sit under their headings, in order.
    const order = [...document.querySelectorAll("tbody tr")].map((tr) => tr.getAttribute("data-group") ?? tr.getAttribute("data-part"));
    expect(order).toEqual(["Base 1", "Left side", "Base frame 1", "Base sleeper"]);
    const box = document.querySelector('[data-field="byAssembly"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onByAssembly).toHaveBeenCalledWith(false);
  });

  it("a click on a grouped row selects that assembly's pieces only", () => {
    const onSelectRows = vi.fn();
    render(<CutListPane {...props({ byAssembly: true, ownerOf, onSelectRows })} />);
    fireEvent.click(screen.getByText("Base sleeper"));
    expect(onSelectRows.mock.calls[0][0][0].occurrences).toHaveLength(9);
  });

  it("without the switch, no headings", () => {
    render(<CutListPane {...props({ ownerOf, onByAssembly: vi.fn() })} />);
    expect(document.querySelectorAll("tr.group")).toHaveLength(0);
    expect((document.querySelector('[data-field="byAssembly"]') as HTMLInputElement).checked).toBe(false);
  });
});
