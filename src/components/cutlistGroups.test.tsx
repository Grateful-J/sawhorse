// The cut list by assembly: each piece under the cabinet or base frame it is in.
import { cleanup, fireEvent, render } from "@testing-library/react";
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
    // Visible only: the hidden piece is not counted, and a part with no drawn piece in an
    // assembly has no row there (not a row with quantity 0).
    const drawnOnly = groupRows(rows, ownerOf, true);
    expect(drawnOnly.map((x) => [x.owner, x.rows.map((r) => `${r.name} ${r.qty}`)])).toEqual([
      ["Base 1", ["Left side 1", "Cleat 2"]],
      ["Base frame 1", ["Base sleeper 9"]],
      [null, ["Loose shelf 1"]],
    ]);
    // A part in one assembly is its own row, unchanged.
    expect(g[0].rows[0]).toBe(rows[0]);
  });

  it("keeps a part with no pieces under no assembly", () => {
    const g = groupRows([row("Ghost", 0, [12, 10, 10])], ownerOf, false);
    expect(g).toEqual([{ owner: null, key: null, rows: [expect.objectContaining({ name: "Ghost" })] }]);
  });

  it("two assemblies with one name are two headings, each with its own pieces", () => {
    // Nodes 1 and 2 are in one "Base 1", node 3 in another cabinet that is also named "Base 1".
    const named = () => "Base 1";
    const keyOf = (item: Item) => ("node" in item && item.node < 3 ? "cabinet-a" : "cabinet-b");
    const rows = [row("Left side", 3, [12, 372, 488], { occurrences: [occ(1), occ(2), occ(3)], total: 3 })];
    const byName = groupRows(rows, named, false);
    expect(byName.map((x) => [x.owner, x.rows[0].qty])).toEqual([["Base 1", 3]]);
    const byNode = groupRows(rows, named, false, keyOf);
    expect(byNode.map((x) => [x.owner, x.key, x.rows[0].qty])).toEqual([
      ["Base 1", "cabinet-a", 2],
      ["Base 1", "cabinet-b", 1],
    ]);
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

  /** Two cabinets that share parts: "Left side" has a piece in each (nodes 1 and 11), "Cleat"
   * two in Base 1 and one in Base frame 1; "Door" is only in Base 1. */
  const shared = () => ({
    ...bookshelf(),
    rows: [
      row("Left side", 2, [12, 372, 488], { occurrences: [occ(1), occ(11)], total: 2 }),
      row("Door", 1, [12, 300, 400], { occurrences: [occ(4)] }),
      row("Cleat", 3, [12, 32, 300], { occurrences: [occ(2), occ(3), occ(12)], total: 3 }),
    ],
  });
  const nodesOf = (rows: { occurrences: Occurrence[] }[]) => rows.map((r) => r.occurrences.map((o) => ("node" in o.item ? o.item.node : -1)));
  const rowsDrawn = () => [...document.querySelectorAll("tbody tr[data-part]")] as HTMLElement[];

  it("a click on a row under one assembly selects that assembly's pieces only, not the part's pieces everywhere", () => {
    const onSelectRows = vi.fn();
    render(<CutListPane {...props({ list: shared(), byAssembly: true, ownerOf, onSelectRows })} />);
    expect(rowsDrawn().map((tr) => tr.getAttribute("data-part"))).toEqual(["Left side", "Door", "Cleat", "Left side", "Cleat"]);
    // "Left side" under Base frame 1 (the fourth row): node 11 only, never node 1 in Base 1.
    fireEvent.click(rowsDrawn()[3]);
    expect(nodesOf(onSelectRows.mock.calls[0][0])).toEqual([[11]]);
    // And under Base 1: node 1 only.
    fireEvent.click(rowsDrawn()[0]);
    expect(nodesOf(onSelectRows.mock.calls[1][0])).toEqual([[1]]);
    // Flat, the same click is the part: both pieces.
    cleanup();
    const flat = vi.fn();
    render(<CutListPane {...props({ list: shared(), onSelectRows: flat })} />);
    fireEvent.click(rowsDrawn()[0]);
    expect(nodesOf(flat.mock.calls[0][0])).toEqual([[1, 11]]);
  });

  it("Shift picks the range down the list as it is drawn, and Ctrl adds one row of one assembly", () => {
    const onSelectRows = vi.fn();
    render(<CutListPane {...props({ list: shared(), byAssembly: true, ownerOf, onSelectRows })} />);
    // Door (Base 1), then Shift on Left side under Base frame 1: Door, Cleat (Base 1's two),
    // Left side (Base frame 1's one). In the flat list that range would be Left side to Door.
    fireEvent.click(rowsDrawn()[1]);
    fireEvent.click(rowsDrawn()[3], { shiftKey: true });
    expect(nodesOf(onSelectRows.mock.calls[1][0])).toEqual([[4], [2, 3], [11]]);
    // Ctrl on the Cleat under Base frame 1 adds that piece to what is lit (nothing is, here).
    fireEvent.click(rowsDrawn()[4], { ctrlKey: true });
    expect(nodesOf(onSelectRows.mock.calls[2][0])).toEqual([[12]]);
  });

  it("only the row whose own pieces are selected is lit: the same part under the other assembly is not", () => {
    // Node 11 is selected in the model: Base frame 1's Left side.
    const pieceSelected = (item: Item) => "node" in item && item.node === 11;
    render(<CutListPane {...props({ list: shared(), byAssembly: true, ownerOf, pieceSelected })} />);
    expect(rowsDrawn().map((tr) => tr.getAttribute("aria-selected"))).toEqual(["false", "false", "false", "true", "false"]);
  });

  it("a heading counts the pieces that count, and two cabinets with one name get a heading each", () => {
    const named = (item: Item) => ("node" in item && item.node < 20 ? "Base 1" : null);
    const ownerKeyOf = (item: Item) => ("node" in item && item.node < 10 ? "1" : "10");
    const list = shared();
    // The Door is left out of the totals: it is listed, not counted.
    list.rows[1] = { ...list.rows[1], included: false };
    render(<CutListPane {...props({ list, byAssembly: true, ownerOf: named, ownerKeyOf })} />);
    expect([...document.querySelectorAll("tr.group")].map((tr) => tr.textContent)).toEqual(["Base 1 · 3 pieces", "Base 1 · 2 pieces"]);
  });

  it("without the switch, no headings", () => {
    render(<CutListPane {...props({ ownerOf, onByAssembly: vi.fn() })} />);
    expect(document.querySelectorAll("tr.group")).toHaveLength(0);
    expect((document.querySelector('[data-field="byAssembly"]') as HTMLInputElement).checked).toBe(false);
  });
});
