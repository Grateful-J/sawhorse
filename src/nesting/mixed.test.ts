// Mixed CNC and track saw (NestSettings.overflow): the router's share and the saw's, the bit
// spacing check on the router's sheets only, the hand work a saw's part needs, how the sheets
// are named, and the one-step switch that turns the saw on and off.
import { describe, expect, it } from "vitest";
import type { Nesting, StockLibrary } from "../kernel/types";
import { cncNotes, handWork, handWorkLegend, handWorkText, HAND_WORK_TYPE, loopRectangles, notchRectangles, routerShare, sawShare, spacingProblem } from "./cnc";
import { smallNesting } from "./fixture";
import { nestNote, nestSummary, pieceTitle } from "./format";
import type { BlankFeatures } from "./machine";
import { overflowOps, routerSheet, sawDefaults, sawSheet, sheetSetOps } from "./sheetset";

const IN = 0.0254;
const MM = 0.001;

/** The small nesting with its sheet (the back panel) on the track saw: kerf 1/8, trim 1/4. */
function mixed(): Nesting {
  const n = smallNesting();
  const saw = { sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: IN / 8, trim: IN / 4 };
  n.settings = { ...n.settings, kerf: 0.375 * IN, trim: 0.5 * IN, algorithm: "maxrects", sheetSize: { width: 48 * IN, length: 48 * IN }, overflow: saw };
  n.library = { ...n.library, settings: n.settings };
  n.pieces[1].saw = true;
  return n;
}

const blank = (o: Partial<BlankFeatures> = {}): BlankFeatures => ({ profile: null, cutouts: [], pockets: [], drills: [], flip: { pockets: [], drills: [] }, skipped: false, ...o });
/** A rectangle loop in blank coordinates (u along the sheet, v across), inches. */
const rect = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [
  [u0 * IN, v0 * IN],
  [u1 * IN, v0 * IN],
  [u1 * IN, v1 * IN],
  [u0 * IN, v1 * IN],
];

describe("the router's share and the saw's", () => {
  it("splits the sheets by who cuts them, and is the same nesting with no saw", () => {
    const n = mixed();
    expect(routerShare(n).pieces.map((p) => p.index)).toEqual([1]);
    expect(sawShare(n).pieces.map((p) => p.index)).toEqual([2]);
    const plain = smallNesting();
    expect(routerShare(plain)).toBe(plain);
    expect(sawShare(plain).pieces).toEqual([]);
  });

  it("checks the bit spacing on the router's sheets only", () => {
    const n = mixed();
    n.settings.kerf = IN / 8;
    // Only the saw's sheet holds more than one part: nothing for the router to merge.
    n.pieces[0].placements = n.pieces[0].placements.slice(0, 1);
    n.pieces[1].placements = [n.pieces[1].placements[0], { ...n.pieces[1].placements[0], tag: "2b", x: 40 * IN }];
    expect(spacingProblem(n, "sixteenth")).toBeNull();
    // The same parts on the router's sheet are too close for the bit.
    n.pieces[1].saw = false;
    expect(spacingProblem(n, "sixteenth")?.kind).toBe("spacing");
  });

  it("says the saw's sheets are not in the CNC files", () => {
    const notes = cncNotes(mixed(), { features: new Map(), skipped: [], flipped: [] }, "sixteenth");
    expect(notes.some((s) => /1 sheet is for the track saw, not the router/.test(s))).toBe(true);
    expect(cncNotes(smallNesting(), null, "sixteenth").some((s) => s.includes("track saw"))).toBe(false);
  });
});

describe("hand work on the saw's parts", () => {
  it("lists each pocket, hole and cutout from end A and edge B, holes of a size together", () => {
    const n = mixed();
    const f = blank({
      pockets: [{ loop: rect(10, 0.5, 10.75, 34), depth: 0.25 * IN }],
      drills: [
        { loop: [], center: [2 * IN, 1.5 * IN], diameter: 5 * MM, depth: 13 * MM, through: false },
        { loop: [], center: [1 * IN, 1.5 * IN], diameter: 5 * MM, depth: 13 * MM, through: false },
        { loop: [], center: [3 * IN, 3 * IN], diameter: 35 * MM, depth: 13 * MM, through: false },
      ],
      cutouts: [rect(20, 5, 30, 15)],
      flip: { pockets: [], drills: [{ loop: [], center: [5 * IN, 5 * IN], diameter: 5 * MM, depth: 0.25 * IN, through: true }] },
      profile: [[0, 0]],
    });
    const work = handWork(n, new Map([["2", f]]), "sixteenth");
    expect(work).toHaveLength(1);
    const w = work[0];
    expect([w.tag, w.name, w.pockets, w.holes, w.cutouts, w.shaped]).toEqual(["2", "Back panel", 1, 4, 1, true]);
    expect(w.sheet).toBe("Sheet 1 of 1 · 4 x 8 sheet, 1/4");
    expect(w.lines).toEqual([
      "Pocket 3/4 × 33 1/2, 1/4 deep: 10 to 10 3/4 from end A, 1/2 to 34 from edge B",
      "2 holes 5 mm × 13 mm deep at (1, 1 1/2), (2, 1 1/2)",
      "1 hole 35 mm × 13 mm deep at (3, 3)",
      "1 hole (other face) 5 mm through at (5, 5)",
      "Cutout through: 20 to 30 from end A, 5 to 15 from edge B",
      "Outline: not a rectangle (a notch): cut it to the drawing after the saw",
    ]);
    const text = handWorkText("Kitchen", work, "sixteenth");
    // The rounding is said, and where A and B are: one rule, the same as the list on screen.
    expect(text).toContain("Lengths in inches, to the nearest 1/64 in; hole sizes in millimetres.");
    expect(text).toContain("End A is its left end. Edge B is its far edge, the one away from you.");
    expect(text).not.toContain("edge B at the bottom");
    expect(handWorkLegend("sixteenth")).toBe("Positions are (A, B): lay the part with the face to cut up and its length left to right; A is along the length from its left end, B across the width from its far edge (the one away from you). To the nearest 1/64 in.");
    expect(handWorkLegend("half_mm")).toContain("To the nearest 0.01 mm.");
    expect(handWorkText("Kitchen", work, "half_mm")).toContain("Lengths in millimetres, to the nearest 0.01 mm; hole sizes in millimetres.");
    expect(w.turned).toBe(false);
    expect(text).toContain("Kitchen: hand work on the track saw's parts");
    expect(text).toContain("2 Back panel (Sheet 1 of 1 · 4 x 8 sheet, 1/4)\n  - Pocket 3/4 × 33 1/2");
    expect(HAND_WORK_TYPE.extensions).toEqual([".txt"]);
  });

  // A part the nester turns is drawn with its length down the sheet. Laid with its length left
  // to right it is the same part a quarter turn round: its top end as drawn is end A and its
  // right edge as drawn is edge B.
  /** The back panel turned in its sheet: its 71 1/4 in length down the sheet. */
  const turnedPanel = () => {
    const n = mixed();
    const q = n.pieces[1].placements[0];
    n.pieces[1].placements[0] = { ...q, turned: true, dx: q.dy, dy: q.dx };
    return n;
  };

  it("measures a turned part along its own length, from the edge that is far when its top end is at the left", () => {
    const n = turnedPanel();
    // u runs across the part now, v along it: a hole 2 in from the left edge as drawn and 30 in
    // down is 30 in along the part and 34 1/2 - 2 from its right edge as drawn.
    const f = blank({ drills: [{ loop: [], center: [2 * IN, 30 * IN], diameter: 5 * MM, depth: 10 * MM, through: false }] });
    const work = handWork(n, new Map([["2", f]]), "sixteenth");
    expect(work[0].lines).toEqual(["1 hole 5 mm × 10 mm deep at (30, 32 1/2)"]);
    expect(work[0].turned).toBe(true);
    expect(handWorkText("Kitchen", work, "sixteenth")).toContain("2 Back panel (Sheet 1 of 1 · 4 x 8 sheet, 1/4) (drawn turned)");
  });

  it("lists a part the same however the nester laid it, and never as its mirror image", () => {
    // A side with a dado near one end, a hinge-plate hole near one edge and a notched corner:
    // nothing about it is symmetric.
    const L = 71.25;
    const W = 34.5;
    const side = blank({
      pockets: [{ loop: rect(4, 0.5, 4.75, W), depth: 0.25 * IN }],
      drills: [{ loop: [], center: [7 * IN, 37 * MM], diameter: 5 * MM, depth: 11.5 * MM, through: false }],
      profile: [[0, 3 * IN], [4 * IN, 3 * IN], [4 * IN, 0], [L * IN, 0], [L * IN, W * IN], [0, W * IN]],
    });
    const flat = handWork(mixed(), new Map([["2", side]]), "sixteenth")[0].lines;
    expect(flat).toEqual([
      "Pocket 3/4 × 34, 1/4 deep: 4 to 4 3/4 from end A, 1/2 to 34 1/2 from edge B",
      "1 hole 5 mm × 11.5 mm deep at (7, 1 29/64)",
      "Notch through, 4 × 3, cut out of the outline: 0 to 4 from end A, 0 to 3 from edge B",
    ]);
    // The same part a quarter turn round, as the nester draws a turned part: (u, v) is at
    // (W - v, u). Every line is the same.
    const turn = ([u, v]: [number, number]): [number, number] => [W * IN - v, u];
    const quarter = blank({
      pockets: [{ loop: side.pockets[0].loop.map(turn), depth: 0.25 * IN }],
      drills: [{ ...side.drills[0], center: turn(side.drills[0].center) }],
      profile: side.profile!.map(turn),
    });
    expect(handWork(turnedPanel(), new Map([["2", quarter]]), "sixteenth")[0].lines).toEqual(flat);
    // Its mirror image (u and v swapped) is another part, and the list says so.
    const swap = ([u, v]: [number, number]): [number, number] => [v, u];
    const mirror = blank({
      pockets: [{ loop: side.pockets[0].loop.map(swap), depth: 0.25 * IN }],
      drills: [{ ...side.drills[0], center: swap(side.drills[0].center) }],
      profile: side.profile!.map(swap),
    });
    const mirrored = handWork(turnedPanel(), new Map([["2", mirror]]), "sixteenth")[0].lines;
    expect(mirrored).not.toEqual(flat);
    expect(mirrored[1]).toBe("1 hole 5 mm × 11.5 mm deep at (7, 33 3/64)");
  });

  it("a pocket that is not a rectangle is listed by the rectangles it is made of, never by the box around it", () => {
    // A tall pantry's side, its top end: the top's dado across the part joined to the top
    // nailer's dado along the rear edge, with the back's deeper groove through both.
    const top: [number, number][] = [[84, 0.5], [83.2773, 0.5], [83.2773, 22.3005], [83.5978, 22.3005], [83.5978, 22.5273], [80.2773, 22.5273], [80.2773, 23.25], [84, 23.25]].map(([u, v]) => [u * IN, v * IN]);
    const groove = rect(4.4023, 22.3005, 83.5978, 22.5273);
    // The bottom's dado: a hair into the toe-kick notch at its front, and the groove through it.
    const bottom: [number, number][] = [[4, 0.5], [4, 3], [3.996, 3], [3.996, 23.25], [4.7227, 23.25], [4.7227, 22.5273], [4.4023, 22.5273], [4.4023, 22.3005], [4.7227, 22.3005], [4.7227, 0.5]].map(([u, v]) => [u * IN, v * IN]);
    const profile: [number, number][] = [[0, 3], [4, 3], [4, 0], [84, 0], [84, 23.25], [0, 23.25]].map(([u, v]) => [u * IN, v * IN]);
    const n = mixed();
    const q = n.pieces[1].placements[0];
    n.pieces[1].placements[0] = { ...q, dx: 84 * IN, dy: 23.25 * IN, size: [0.71875 * IN, 23.25 * IN, 84 * IN] };
    const f = blank({ pockets: [{ loop: groove, depth: 0.3125 * IN }, { loop: bottom, depth: 0.25 * IN }, { loop: top, depth: 0.25 * IN }], profile });
    const lines = handWork(n, new Map([["2", f]]), "sixteenth")[0].lines;
    expect(lines).toEqual([
      "Pocket 79 13/64 × 15/64, 5/16 deep: 4 13/32 to 83 39/64 from end A, 22 19/64 to 22 17/32 from edge B",
      // One rectangle: the groove that crosses it is cut deeper anyway, and the hair at its
      // front is in the notch. Its width and its edges agree (4 and 47/64 make 4 47/64).
      "Pocket 47/64 × 22 3/4, 1/4 deep: 4 to 4 47/64 from end A, 1/2 to 23 1/4 from edge B",
      // Two strips: 47/64 across the top end, and 47/64 along the rear edge under it.
      "Pocket, 1/4 deep, in 2 rectangles that join: 23/32 × 22 3/4 at 83 9/32 to 84 from end A, 1/2 to 23 1/4 from edge B; 3 × 23/32 at 80 9/32 to 83 9/32 from end A, 22 17/32 to 23 1/4 from edge B",
      "Notch through, 4 × 3, cut out of the outline: 0 to 4 from end A, 0 to 3 from edge B",
    ]);
    // Nothing says to rout the 3 23/32 x 22 3/4 box around the L.
    expect(lines.join("\n")).not.toMatch(/3 23\/32 × 22 3\/4/);
    // The rectangles are the shape exactly: their area is the outline's.
    const area = (loop: [number, number][]) => Math.abs(loop.reduce((a, p, i) => a + p[0] * loop[(i + 1) % loop.length][1] - loop[(i + 1) % loop.length][0] * p[1], 0)) / 2;
    const boxes = loopRectangles(top)!;
    expect(boxes).toHaveLength(3);
    expect(boxes.reduce((a, r) => a + (r.u1 - r.u0) * (r.v1 - r.v0), 0)).toBeCloseTo(area(top), 12);
    // With the groove known to be cut anyway, two; a plain rectangle is itself; a slanted edge is not rectangles.
    expect(loopRectangles(top, [groove])).toHaveLength(2);
    expect(loopRectangles(rect(1, 2, 3, 4))).toEqual([{ u0: 1 * IN, v0: 2 * IN, u1: 3 * IN, v1: 4 * IN }]);
    expect(loopRectangles([[0, 0], [1, 0], [1, 1], [0.5, 2]])).toBeNull();
    // A notched outline: what it takes out of the blank.
    expect(notchRectangles(profile, 84 * IN, 23.25 * IN)).toEqual([{ u0: 0, v0: 0, u1: 4 * IN, v1: 3 * IN }]);
  });

  it("a shape too intricate to list as rectangles is given up on at once, never searched for seconds where the page draws", () => {
    // A staircase of 24 steps: a 24 by 24 grid, past what the search takes on.
    const stairs: [number, number][] = [[0, 0]];
    for (let k = 0; k < 24; k++) stairs.push([(k + 1) * IN, k * IN], [(k + 1) * IN, (k + 1) * IN]);
    stairs.push([0, 24 * IN]);
    // A comb of 14 teeth on a spine: a small grid, but 15 rectangles, more than one cut is listed as.
    const comb: [number, number][] = [[0, 0]];
    for (let k = 0; k < 14; k++) comb.push([(2 * k + 1) * IN, 0], [(2 * k + 1) * IN, IN], [(2 * k + 2) * IN, IN], [(2 * k + 2) * IN, 0]);
    comb.push([29 * IN, 0], [29 * IN, 2 * IN], [0, 2 * IN]);
    const t0 = performance.now();
    expect(loopRectangles(stairs)).toBeNull();
    expect(loopRectangles(comb)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
    // Three teeth are still listed: the spine and each tooth.
    const small: [number, number][] = [[0, 0], [IN, 0], [IN, IN], [2 * IN, IN], [2 * IN, 0], [3 * IN, 0], [3 * IN, IN], [4 * IN, IN], [4 * IN, 0], [5 * IN, 0], [5 * IN, 2 * IN], [0, 2 * IN]];
    const boxes = loopRectangles(small)!;
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(boxes.length).toBeLessThanOrEqual(4);
  });

  it("a pocket with a slanted edge is listed by its corners; a hole that is not a round metric size is also written the document's way", () => {
    const n = mixed();
    const wedge: [number, number][] = [[10 * IN, 5 * IN], [20 * IN, 5 * IN], [20 * IN, 8 * IN], [12 * IN, 9 * IN]];
    const f = blank({
      pockets: [{ loop: wedge, depth: 0.25 * IN }],
      // A 3/16 in pull hole (4.7625 mm) through, and a 1/4 in hole 1/4 in deep.
      drills: [
        { loop: [], center: [5 * IN, 5 * IN], diameter: (3 / 16) * IN, depth: 0.25 * IN, through: true },
        { loop: [], center: [6 * IN, 5 * IN], diameter: 0.25 * IN, depth: 0.25 * IN, through: false },
      ],
    });
    expect(handWork(n, new Map([["2", f]]), "sixteenth")[0].lines).toEqual([
      "Pocket, 1/4 deep, not a rectangle, its corners at (10, 5), (20, 5), (20, 8), (12, 9)",
      "1 hole 4.76 mm (3/16 in) through at (5, 5)",
      "1 hole 6.35 mm (1/4 in) × 6.35 mm (1/4 in) deep at (6, 5)",
    ]);
    // In a metric document, millimetres only, to 0.01.
    expect(handWork(n, new Map([["2", f]]), "half_mm")[0].lines.slice(1)).toEqual(["1 hole 4.76 mm through at (127, 127)", "1 hole 6.35 mm × 6.35 mm deep at (152.4, 127)"]);
  });

  it("names the sheet as the Nesting section does, with its material", () => {
    const n = mixed();
    n.pieces[1].material = "Back plywood";
    const f = blank({ drills: [{ loop: [], center: [IN, IN], diameter: 5 * MM, depth: 10 * MM, through: false }] });
    expect(handWork(n, new Map([["2", f]]), "sixteenth")[0].sheet).toBe("Sheet 1 of 1 · 4 x 8 sheet, 1/4 · Back plywood");
    expect(`${handWork(n, new Map([["2", f]]), "sixteenth")[0].sheet} · track saw`).toBe(pieceTitle(n.pieces[1]));
  });

  it("leaves out the router's parts and plain saw parts", () => {
    const n = mixed();
    const f = blank({ drills: [{ loop: [], center: [IN, IN], diameter: 5 * MM, depth: 10 * MM, through: false }] });
    // Tag 1a is on the router's board: never hand work.
    expect(handWork(n, new Map([["1a", f]]), "sixteenth")).toEqual([]);
    expect(handWork(n, new Map([["2", blank()]]), "sixteenth")).toEqual([]);
    expect(handWork(n, undefined, "sixteenth")).toEqual([]);
  });
});

describe("naming the saw's sheets", () => {
  it("titles, the summary tile and the footer say track saw only when something went to it", () => {
    const n = mixed();
    expect(pieceTitle(n.pieces[1])).toBe("Sheet 1 of 1 · 4 x 8 sheet, 1/4 · track saw");
    expect(pieceTitle(n.pieces[0])).not.toContain("track saw");
    expect(nestSummary(n, "sixteenth").sheetsLabel).toBe("sheet: 4 x 8 sheet, 1/4, 1 on the track saw");
    expect(nestNote(n, "sixteenth")).toContain("track saw: kerf 1/8 in, trim 1/4 in per edge, straight cuts");
    n.pieces[1].saw = false;
    expect(nestNote(n, "sixteenth")).not.toContain("track saw");
    expect(nestSummary(n, "sixteenth").sheetsLabel).toBe("sheet: 4 x 8 sheet, 1/4");
  });
});

describe("the track saw switch", () => {
  const lib = (): StockLibrary => ({
    stocks: [{ name: "4 x 4 sheet, 3/4", kind: "sheet", length: 48 * IN, width: 48 * IN, thickness: (23 / 32) * IN, nominal: "3/4", grain: "length" }],
    defaults: {},
    settings: { kerf: 0.375 * IN, trim: 0.5 * IN, algorithm: "maxrects", sheetSize: { width: 48 * IN, length: 48 * IN } },
  });

  it("adds the 4 x 8 sheets it lacks and the saw, keeping the router's sheet size, in one batch", () => {
    const { op, added } = overflowOps(lib(), true, false);
    expect(added).toEqual(["4 x 8 sheet, 3/4", "4 x 8 sheet, 1/2", "4 x 8 sheet, 1/4"]);
    if (op.op !== "batch") throw new Error("one batch");
    const last = op.ops[op.ops.length - 1];
    expect(last).toEqual({
      op: "set_nest_settings",
      settings: { ...lib().settings, overflow: { sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: IN / 8, trim: IN / 4 } },
    });
    expect(op.ops.filter((o) => o.op === "define_stock")).toHaveLength(3);
  });

  it("keeps a saw kerf and trim already set, and adds no sheet the library has", () => {
    const l = lib();
    l.stocks.push(...(sheetSetOps(l, 48 * IN, 96 * IN).op as { ops: { op: string; stock?: never }[] }).ops.flatMap((o) => (o.op === "define_stock" ? [(o as unknown as { stock: StockLibrary["stocks"][number] }).stock] : [])));
    l.settings.overflow = { sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: 0.1 * IN, trim: 0 };
    const { op, added } = overflowOps(l, true, false);
    expect(added).toEqual([]);
    if (op.op !== "batch") throw new Error("one batch");
    expect(op.ops).toHaveLength(1);
    expect((op.ops[0] as { settings: { overflow: unknown } }).settings.overflow).toEqual({ sheetSize: { width: 48 * IN, length: 96 * IN }, kerf: 0.1 * IN, trim: 0 });
  });

  it("a saw kerf and trim set before it was turned off come back with it", () => {
    // Off clears the setting, so the document no longer holds them: the caller hands them back.
    const { op } = overflowOps(lib(), true, false, { kerf: 0.1 * IN, trim: 0.5 * IN });
    if (op.op !== "batch") throw new Error("one batch");
    expect((op.ops[op.ops.length - 1] as { settings: { overflow: unknown } }).settings.overflow).toEqual({ sheetSize: sawSheet(false), kerf: 0.1 * IN, trim: 0.5 * IN });
    // What the document holds wins over what was remembered; with neither, the defaults.
    const set = { ...lib(), settings: { ...lib().settings, overflow: { sheetSize: sawSheet(false), kerf: 0.2 * IN, trim: 0 } } };
    const kept = overflowOps(set, true, false, { kerf: 0.1 * IN, trim: 0.5 * IN }).op as { ops: { settings?: { overflow: unknown } }[] };
    expect(kept.ops[kept.ops.length - 1].settings!.overflow).toEqual({ sheetSize: sawSheet(false), kerf: 0.2 * IN, trim: 0 });
    const fresh = overflowOps(lib(), true, false, null).op as { ops: { settings?: { overflow: unknown } }[] };
    expect(fresh.ops[fresh.ops.length - 1].settings!.overflow).toEqual({ sheetSize: sawSheet(false), ...sawDefaults(false) });
  });

  it("a metric document gets metric sheets: 1220 x 1220 and 1220 x 2440 at 18, 12 and 6 mm, named in millimetres", () => {
    const empty = (): StockLibrary => ({ stocks: [...lib().stocks], defaults: {}, settings: { kerf: 0.01, trim: 0.012, algorithm: "maxrects" } });
    // The button sends 48 x 48 in whatever the units: in a metric document that is 1220 x 1220.
    const set = sheetSetOps(empty(), 48 * IN, 48 * IN, true);
    expect(set.added).toEqual(["1220 x 1220 sheet, 18 mm", "1220 x 1220 sheet, 12 mm", "1220 x 1220 sheet, 6 mm"]);
    expect(set.size).toEqual(routerSheet(true));
    if (set.op.op !== "batch") throw new Error("one batch");
    const stocks = set.op.ops.flatMap((o) => (o.op === "define_stock" ? [o.stock] : []));
    expect(stocks.map((x) => [x.width, x.length, x.thickness, x.nominal])).toEqual([
      [1.22, 1.22, 0.018, null],
      [1.22, 1.22, 0.012, null],
      [1.22, 1.22, 0.006, null],
    ]);
    expect(set.op.ops[set.op.ops.length - 1]).toEqual({ op: "set_nest_settings", settings: { ...empty().settings, sheetSize: { width: 1.22, length: 1.22 } } });
    // The saw's: never "4 x 8.01", never "3/4".
    const saw = overflowOps({ ...empty(), settings: { ...empty().settings, sheetSize: routerSheet(true) } }, true, true);
    expect(saw.added).toEqual(["1220 x 2440 sheet, 18 mm", "1220 x 2440 sheet, 12 mm", "1220 x 2440 sheet, 6 mm"]);
    // An inch document is as it was, with the same call.
    const inch = sheetSetOps(empty(), 48 * IN, 48 * IN);
    expect(inch.added).toEqual(["4 x 4 sheet, 1/2", "4 x 4 sheet, 1/4"]);
    expect(inch.size).toEqual({ width: 48 * IN, length: 48 * IN });
    expect(routerSheet(false)).toEqual({ width: 48 * IN, length: 48 * IN });
  });

  it("a sheet you already have is kept, measured or nominal, and the next size is not mistaken for it", () => {
    const withSheet = (thickness: number, side = 48 * IN): StockLibrary => ({ stocks: [{ name: "Mine", kind: "sheet", length: side, width: side, thickness, grain: "length" }], defaults: {}, settings: { kerf: IN / 8, trim: 0, algorithm: "guillotine" } });
    const adds = (l: StockLibrary, metric = false) => sheetSetOps(l, 48 * IN, 48 * IN, metric).added.map((name) => name.split(", ")[1]);
    // A true 3/4, 1/2 or 1/4 in sheet (1/32 over the plywood) is that sheet; so is one measured a hair under.
    expect(adds(withSheet(0.75 * IN))).toEqual(["1/2", "1/4"]);
    expect(adds(withSheet(0.5 * IN))).toEqual(["3/4", "1/4"]);
    expect(adds(withSheet(0.25 * IN))).toEqual(["3/4", "1/2"]);
    expect(adds(withSheet(0.7 * IN))).toEqual(["1/2", "1/4"]);
    // 5/8 and 3/8 are neither: all three are added.
    expect(adds(withSheet((19 / 32) * IN))).toEqual(["3/4", "1/2", "1/4"]);
    expect(adds(withSheet((11 / 32) * IN))).toEqual(["3/4", "1/2", "1/4"]);
    // Metric: 19 mm is the 18, 6.5 the 6; 15 and 9 are neither. A 48 in sheet is not a 1220.
    expect(adds(withSheet(0.019, 1.22), true)).toEqual(["12 mm", "6 mm"]);
    expect(adds(withSheet(0.0065, 1.22), true)).toEqual(["18 mm", "12 mm"]);
    expect(adds(withSheet(0.015, 1.22), true)).toEqual(["18 mm", "12 mm", "6 mm"]);
    expect(adds(withSheet(0.009, 1.22), true)).toEqual(["18 mm", "12 mm", "6 mm"]);
    expect(adds(withSheet(0.018), true)).toEqual(["18 mm", "12 mm", "6 mm"]);
  });

  it("turns off by clearing the saw, and starts metric shops on 1220 x 2440 with a 3 mm blade", () => {
    const off = overflowOps({ ...lib(), settings: { ...lib().settings, overflow: { sheetSize: sawSheet(false), ...sawDefaults(false) } } }, false, false);
    expect(off).toEqual({ op: { op: "set_nest_settings", settings: { ...lib().settings, overflow: null } }, added: [] });
    expect(sawSheet(true)).toEqual({ width: 1.22, length: 2.44 });
    expect(sawDefaults(true)).toEqual({ kerf: 0.003, trim: 0.006 });
    // A 4 x 8 less the trim takes a 95 1/2 in part: a full-length 95 in base rail.
    const t = sawDefaults(false).trim;
    expect((sawSheet(false).length - 2 * t) / IN).toBeCloseTo(95.5, 9);
  });
});
