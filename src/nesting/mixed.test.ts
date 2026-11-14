// Mixed CNC and track saw (NestSettings.overflow): the router's share and the saw's, the bit
// spacing check on the router's sheets only, the hand work a saw's part needs, how the sheets
// are named, and the one-step switch that turns the saw on and off.
import { describe, expect, it } from "vitest";
import type { Nesting, StockLibrary } from "../kernel/types";
import { cncNotes, handWork, handWorkText, HAND_WORK_TYPE, routerShare, sawShare, spacingProblem } from "./cnc";
import { smallNesting } from "./fixture";
import { nestNote, nestSummary, pieceTitle } from "./format";
import type { BlankFeatures } from "./machine";
import { overflowOps, sawDefaults, sawSheet, sheetSetOps } from "./sheetset";

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
    expect(text).toContain("Lengths in inches; hole sizes in millimetres.");
    expect(text).toContain("Kitchen: hand work on the track saw's parts");
    expect(text).toContain("2 Back panel (Sheet 1 of 1 · 4 x 8 sheet, 1/4)\n  - Pocket 3/4 × 33 1/2");
    expect(HAND_WORK_TYPE.extensions).toEqual([".txt"]);
  });

  it("measures a turned part along its own length", () => {
    const n = mixed();
    n.pieces[1].placements[0].turned = true;
    // u runs across the part now: a hole at u = 2, v = 30 is 30 along the part, 2 across it.
    const f = blank({ drills: [{ loop: [], center: [2 * IN, 30 * IN], diameter: 5 * MM, depth: 10 * MM, through: false }] });
    expect(handWork(n, new Map([["2", f]]), "sixteenth")[0].lines).toEqual(["1 hole 5 mm × 10 mm deep at (30, 2)"]);
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
