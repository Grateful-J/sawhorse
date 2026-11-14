import { describe, expect, it } from "vitest";
import { cncSettings } from "../components/NestingSection";
import { cncFileName, cncNotes, cutProblems, nestProblems, openPockets, safeName, sheetOps, spacingProblem, thicknessMismatches } from "./cnc";
import DxfParser from "dxf-parser";
import { nestingDxf, overcutLoop, pocketOvercut, reachesEdge } from "./dxf";
import type { BlankFeatures } from "./machine";
import { smallNesting } from "./fixture";

const IN = 0.0254;

describe("CNC export notes", () => {
  it("names parts drawn at a thickness their sheet is not", () => {
    const n = smallNesting();
    const exact = structuredClone(n);
    for (const p of exact.pieces) for (const q of p.placements) q.size = [p.thickness, q.size[1], q.size[2]];
    expect(thicknessMismatches(exact)).toEqual([]);

    const off = structuredClone(exact);
    const piece = off.pieces[0];
    const q = piece.placements[0];
    q.size = [piece.thickness + 0.5e-3, q.size[1], q.size[2]];
    const m = thicknessMismatches(off);
    expect(m).toHaveLength(1);
    expect(m[0].stock).toBe(piece.stock);
    expect(m[0].parts).toEqual([q.name]);
    const notes = cncNotes(off, { features: new Map(), skipped: [], flipped: [] }, "sixteenth");
    expect(notes[0]).toMatch(/drawn .* thick but nested on/);
    // A tenth of a millimetre is drawing noise, not a different sheet.
    q.size = [piece.thickness + 0.5e-4, q.size[1], q.size[2]];
    expect(thicknessMismatches(off)).toEqual([]);
  });

  it("says how far apart the parts are, and when nothing is measured or the sheet has no margin", () => {
    const n = smallNesting();
    n.settings = { ...n.settings, kerf: 0.375 * IN, trim: 0 };
    const notes = cncNotes(n, null, "sixteenth");
    expect(notes.some((s) => s.includes("3/8 in apart"))).toBe(true);
    expect(notes.some((s) => s.includes("could not be measured"))).toBe(true);
    expect(notes.some((s) => s.includes("No margin"))).toBe(true);
    const flipped = cncNotes(n, { features: new Map(), skipped: ["Shelf"], flipped: ["Door"] }, "sixteenth");
    expect(flipped.some((s) => s.includes("Cuts were left out on Shelf"))).toBe(true);
    expect(flipped.some((s) => s.includes("Door has cuts in both faces"))).toBe(true);
  });

  it("the CNC preset leaves more room between parts than a 1/4 in bit, and a margin", () => {
    for (const metric of [false, true]) {
      const s = cncSettings(metric);
      expect(s.algorithm).toBe("maxrects");
      expect(s.kerf).toBeGreaterThan(0.25 * IN);
      expect(s.trim).toBeGreaterThanOrEqual(s.kerf);
    }
  });

  it("names each sheet's file by its number, cabinet, parts, stock and cuts", () => {
    const n = smallNesting();
    const piece = n.pieces[0];
    const owner = (q: { name: string }) => (q.name === "Shelf" ? "Sink base" : null);
    const plain = cncFileName("Kitchen", n, 0, undefined, owner);
    expect(plain).toMatch(/^Kitchen sheet 01 of 0\d - Sink base Shelf - /);
    expect(plain).toMatch(/ - profile CNC\.dxf$/);
    expect(plain).toContain(safeName(piece.stock));
    // Cuts measured on its parts say what the router does.
    const f: BlankFeatures = { profile: null, cutouts: [], pockets: [{ loop: [], depth: 0.006 }], drills: [{ loop: [], center: [0, 0], depth: 0.013, diameter: 0.035, through: false }], flip: { pockets: [], drills: [] }, skipped: false };
    const features = new Map([[piece.placements[0].tag, f]]);
    expect(sheetOps(piece, features)).toEqual(["profile", "pockets", "drills"]);
    expect(cncFileName("Kitchen", n, 0, features, owner)).toMatch(/ - profile, pockets, drills CNC\.dxf$/);
    // Quotes and slashes never reach the file system.
    expect(safeName('3/4" 4x4: Front?')).toBe("3-4in 4x4 Front");
  });

  it("a long list of parts is cut short with how many more", () => {
    const n = smallNesting();
    const piece = n.pieces[0];
    piece.placements = Array.from({ length: 30 }, (_, i) => ({ ...piece.placements[0], tag: `t${i}`, name: `Part number ${i}` }));
    const name = cncFileName("Kitchen", n, 0, undefined, () => "Pantry");
    expect(name).toMatch(/\+\d+ more/);
    expect(name.length).toBeLessThan(220);
  });
});


describe("nest problems", () => {
  it("lists parts on no stock, glued up, and off the sheet their material names", () => {
    const n = smallNesting();
    n.unplaced = [{ ...n.unplaced[0], tag: "9", name: "Pantry side", reason: "too_large" } as (typeof n.unplaced)[number]].filter((u) => u.tag);
    n.glue_ups = [];
    const piece = n.pieces.find((p) => p.kind === "sheet")!;
    piece.material = "Door plywood";
    n.library.stocks.push({ name: '1/2" 4x4', kind: "sheet", length: 48 * IN, width: 48 * IN, thickness: (15 / 32) * IN, grain: "length" });
    n.library.defaults = { "Door plywood": '1/2" 4x4' };
    const problems = nestProblems(n, "sixteenth", () => "larger than every sheet");
    expect(problems.filter((p) => p.kind === "unplaced").map((p) => p.name)).toEqual(["Pantry side"]);
    const off = problems.filter((p) => p.kind === "material");
    expect(off).toHaveLength(piece.placements.length);
    expect(off[0].text).toContain('Door plywood is set to 1/2" 4x4, but it went on');
    expect(off[0].text).toContain("15/32");
    // Set right, nothing to say.
    n.library.defaults = { "Door plywood": piece.stock };
    n.unplaced = [];
    expect(nestProblems(n, "sixteenth", () => "")).toEqual([]);
  });
});

describe("spacing for the router", () => {
  it("parts 1/8 in apart are too close for a 1/4 in bit; the CNC router spacing is not", () => {
    const n = smallNesting();
    n.settings = { ...n.settings, kerf: IN / 8 };
    const p = spacingProblem(n, "sixteenth");
    expect(p?.kind).toBe("spacing");
    expect(p?.text).toContain("1/8 in apart");
    n.settings = { ...n.settings, ...cncSettings(false) };
    expect(spacingProblem(n, "sixteenth")).toBeNull();
    // A sheet with one part each has nothing to merge.
    n.settings = { ...n.settings, kerf: IN / 8 };
    for (const piece of n.pieces) piece.placements = piece.placements.slice(0, 1);
    expect(spacingProblem(n, "sixteenth")).toBeNull();
  });

  it("asks before saving: a sheet of another thickness, cuts left out, cuts not measured", () => {
    const n = structuredClone(smallNesting());
    for (const p of n.pieces) for (const q of p.placements) q.size = [p.thickness, q.size[1], q.size[2]];
    const clean = { features: new Map<string, BlankFeatures>(), skipped: [], flipped: [] };
    expect(cutProblems(n, clean, "sixteenth")).toEqual([]);
    // Cuts in both faces are a second setup, not a problem.
    expect(cutProblems(n, { ...clean, flipped: ["Shelf"] }, "sixteenth")).toEqual([]);
    // Not measured at all: every part is its outline only.
    expect(cutProblems(n, null, "sixteenth")).toEqual([expect.objectContaining({ kind: "cuts", name: "Every part" })]);
    // Cuts left out on a part: named once, with the tags of its pieces.
    const left = cutProblems(n, { ...clean, skipped: ["Shelf"] }, "sixteenth");
    expect(left).toEqual([expect.objectContaining({ kind: "cuts", name: "Shelf", tag: "1a, 1b" })]);
    expect(left[0].text).toMatch(/would be left out of the file/);
    // Drawn half a millimetre thicker than its sheet: named with both thicknesses and which way.
    const piece = n.pieces[0];
    piece.placements[0].size = [piece.thickness + 0.5e-3, piece.placements[0].size[1], piece.placements[0].size[2]];
    const thick = cutProblems(n, clean, "half_mm");
    expect(thick).toEqual([expect.objectContaining({ kind: "thickness", name: "Shelf" })]);
    expect(thick[0].text).toMatch(/a sheet 0\.5 mm thinner: every dado and fit was cut to the drawing/);
  });

  // A pocket toolpath keeps the bit inside its outline: a dado that ends on its part's edge
  // would keep round corners there. It is drawn past the edge, into the gap between parts.
  describe("dados that run out of a part's edge", () => {
    const MM = 1e-3;
    it("the overcut is just under half the gap, never more than the sheet's margin, and 0 without either", () => {
      const cnc = cncSettings(false);
      expect(pocketOvercut({ kerf: cnc.kerf, trim: cnc.trim })).toBeCloseTo((3 / 8 / 2) * IN - 0.25 * MM, 12);
      // Larger than the radius of every bit the spacing check lets through (the gap less 1/16 in).
      expect(pocketOvercut({ kerf: cnc.kerf, trim: cnc.trim })).toBeGreaterThan((cnc.kerf - IN / 16) / 2);
      const metric = cncSettings(true);
      expect(pocketOvercut({ kerf: metric.kerf, trim: metric.trim })).toBeCloseTo(4.75 * MM, 12);
      expect(pocketOvercut({ kerf: 10 * MM, trim: 2 * MM })).toBeCloseTo(2 * MM, 12);
      expect(pocketOvercut({ kerf: 10 * MM, trim: 0 })).toBe(0);
      expect(pocketOvercut({ kerf: 0, trim: 12 * MM })).toBe(0);
      expect(pocketOvercut({ kerf: 0.4 * MM, trim: 12 * MM })).toBe(0);
    });

    it("only the corners on the blank's edge move, straight out; a blind end and the width stay as measured", () => {
      const dx = 0.8;
      const dy = 0.5;
      const e = 4 * MM;
      // A dado across the part, blind 12 mm from the front (v = 0), open at the rear (v = dy).
      const dado: [number, number][] = [[0.1, 0.012], [0.118, 0.012], [0.118, dy], [0.1, dy]];
      expect(reachesEdge(dado, dx, dy)).toBe(true);
      expect(overcutLoop(dado, dx, dy, e)).toEqual([[0.1, 0.012], [0.118, 0.012], [0.118, dy + e], [0.1, dy + e]]);
      // A rabbet along the end (u = dx) that also runs out at the rear: its corner goes out both ways.
      const rabbet: [number, number][] = [[dx - 0.018, 0.012], [dx, 0.012], [dx, dy], [dx - 0.018, dy]];
      expect(overcutLoop(rabbet, dx, dy, e)).toEqual([[dx - 0.018, 0.012], [dx + e, 0.012], [dx + e, dy + e], [dx - 0.018, dy + e]]);
      // A groove from end to end: out at both.
      const groove: [number, number][] = [[0, 0.4], [dx, 0.4], [dx, 0.406], [0, 0.406]];
      expect(overcutLoop(groove, dx, dy, e)).toEqual([[-e, 0.4], [dx + e, 0.4], [dx + e, 0.406], [-e, 0.406]]);
      // A pocket inside the part is left alone, and so is everything when there is no room.
      const inside: [number, number][] = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]];
      expect(reachesEdge(inside, dx, dy)).toBe(false);
      expect(overcutLoop(inside, dx, dy, e)).toEqual(inside);
      expect(overcutLoop(dado, dx, dy, 0)).toBe(dado);
    });

    it("the file draws them past the edge, and the notes say how far, or that they could not be", () => {
      const n = structuredClone(smallNesting());
      const piece = n.pieces[1];
      const q = piece.placements[0];
      const open: [number, number][] = [[0.1, 0.012], [0.118, 0.012], [0.118, q.dy], [0.1, q.dy]];
      const blind: [number, number][] = [[0.3, 0.1], [0.4, 0.1], [0.4, 0.2], [0.3, 0.2]];
      const f: BlankFeatures = { profile: null, cutouts: [], pockets: [{ loop: open, depth: 0.006 }, { loop: blind, depth: 0.006 }], drills: [], flip: { pockets: [], drills: [] }, skipped: false };
      const features = new Map([[q.tag, f]]);
      type E = { type: string; layer: string; vertices?: { x: number; y: number }[] };
      const pockets = (text: string) => (new DxfParser().parseSync(text) as unknown as { entities: E[] }).entities.filter((x) => x.layer === "POCKET_6MM");
      const spanY = (x: E) => Math.max(...x.vertices!.map((v) => v.y)) - Math.min(...x.vertices!.map((v) => v.y));
      // The fixture's sheet has no margin (trim 0): nothing is drawn past an edge, and the notes say so.
      expect(pocketOvercut(piece)).toBe(0);
      const flat = pockets(nestingDxf(n, "lwpolyline", features, { piece: 1, overcut: true }));
      expect(spanY(flat[0])).toBeCloseTo((q.dy - 0.012) * 1000, 6);
      expect(openPockets(n, features)).toEqual({ drawn: 0, past: 0, left: 1 });
      expect(cncNotes(n, { features, skipped: [], flipped: [] }, "sixteenth").some((x) => /1 dado or groove runs out of a part's edge and could not be drawn past it/.test(x))).toBe(true);
      // With CNC spacing: 3/16 in less 0.25 mm past the edge, the blind pocket untouched.
      piece.kerf = cncSettings(false).kerf;
      piece.trim = cncSettings(false).trim;
      const e = pocketOvercut(piece);
      const over = pockets(nestingDxf(n, "lwpolyline", features, { piece: 1, overcut: true }));
      expect(spanY(over[0])).toBeCloseTo((q.dy - 0.012 + e) * 1000, 6);
      expect(spanY(over[1])).toBeCloseTo(100, 6);
      expect(openPockets(n, features)).toEqual({ drawn: 1, past: e, left: 0 });
      expect(cncNotes(n, { features, skipped: [], flipped: [] }, "sixteenth").some((x) => /run out of a part's edge are drawn .* past it/.test(x))).toBe(true);
      // Not asked for: the pocket as measured.
      expect(spanY(pockets(nestingDxf(n, "lwpolyline", features, { piece: 1 }))[0])).toBeCloseTo((q.dy - 0.012) * 1000, 6);
      // The track saw's sheets are not routed: their pockets are hand work, not counted here.
      piece.saw = true;
      expect(openPockets(n, features)).toEqual({ drawn: 0, past: 0, left: 0 });
    });
  });
});
