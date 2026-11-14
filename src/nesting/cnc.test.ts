import { describe, expect, it } from "vitest";
import { cncSettings } from "../components/NestingSection";
import { cncFileName, cncNotes, nestProblems, safeName, sheetOps, thicknessMismatches } from "./cnc";
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
    expect(flipped.some((s) => s.includes("Left out cuts on Shelf"))).toBe(true);
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
