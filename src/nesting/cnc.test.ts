import { describe, expect, it } from "vitest";
import { cncSettings } from "../components/NestingSection";
import { cncFileName, cncNotes, cutProblems, nestProblems, openPockets, routerSheetProblems, safeName, sheetOps, spacingProblem, thicknessMismatches } from "./cnc";
import DxfParser from "dxf-parser";
import { nestingDxf, overcutLoop, pieceLabel, pocketOvercut, reachesEdge } from "./dxf";
import { diffU, exactU, fineSteps, fineStep, fineU, pieceTitle } from "./format";
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
    // The fixture's first piece is a board, and is called one.
    expect(plain).toBe("Kitchen 01 board 1 of 1 - Sink base Shelf - 4-4 x 12 x 96 (Oak) - profile CNC.dxf");
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

  it("a sheet has one number: in its file's name, in the label inside the file and on screen", () => {
    const n = smallNesting();
    // Three sheets of one stock after the board, the middle one the track saw's: the router's
    // files are sheets 2 and 4 of the nesting, 1 and 3 of 3 of their stock.
    const sheet = n.pieces[1];
    n.pieces = [n.pieces[0], { ...sheet, index: 2, seq: 1, count: 3 }, { ...sheet, index: 3, seq: 2, count: 3, saw: true }, { ...sheet, index: 4, seq: 3, count: 3, material: "Back plywood" }];
    const router = { ...n, pieces: n.pieces.filter((p) => !p.saw) };
    const names = router.pieces.map((_, i) => cncFileName("Kitchen", router, i, undefined, () => null));
    expect(names).toEqual([
      "Kitchen 01 board 1 of 1 - Shelf - 4-4 x 12 x 96 (Oak) - profile CNC.dxf",
      "Kitchen 02 sheet 1 of 3 - Back panel - 4 x 8 sheet, 1-4 - profile CNC.dxf",
      "Kitchen 04 sheet 3 of 3 - Back panel - 4 x 8 sheet, 1-4 (Back plywood) - profile CNC.dxf",
    ]);
    expect(new Set(names).size).toBe(names.length);
    router.pieces.forEach((p, i) => {
      const label = pieceLabel(p);
      // The label is the on-screen title with the sheet's number in the nesting before it...
      expect(label).toBe(`${p.index}. ${pieceTitle(p).replace(/ · /g, " - ")}`);
      // ...and is what the file holds, and the file's name starts with the same two numbers.
      expect(nestingDxf(router, "lwpolyline", undefined, { piece: i })).toContain(`\n${label}\n`);
      const kind = p.kind === "sheet" ? "sheet" : "board";
      expect(names[i].startsWith(`Kitchen ${String(p.index).padStart(2, "0")} ${kind} ${p.seq} of ${p.count} - `)).toBe(true);
    });
    expect(pieceLabel(n.pieces[2])).toBe("3. Sheet 2 of 3 - 4 x 8 sheet, 1/4 - track saw");
  });

  it("a file name is one every file system takes, whatever the title and the parts are called", () => {
    const bytes = (x: string) => new TextEncoder().encode(x).length;
    // Slashes, quotes, control characters, a leading dot, a trailing dot and space.
    expect(safeName("..\tKitchen\u0000 1/2\n.  ")).toBe("Kitchen 1-2");
    expect(safeName(".hidden")).toBe("hidden");
    // Never empty, never a Windows device name.
    expect(safeName("")).toBe("untitled");
    expect(safeName(" ?:. ")).toBe("untitled");
    expect(safeName("CON")).toBe("CON_");
    expect(safeName("lpt1")).toBe("lpt1_");
    // Cut to a number of bytes, never through a character.
    const long = safeName("x".repeat(500));
    expect(bytes(long)).toBeLessThanOrEqual(200);
    expect(long.endsWith("...")).toBe(true);
    const greek = safeName("\u03b1\u03b2\u03b3".repeat(100), 50);
    expect(bytes(greek)).toBeLessThanOrEqual(50);
    expect(greek).toMatch(/^(\u03b1\u03b2\u03b3)+\u03b1?\u03b2?\.\.\.$/);
    expect(safeName("\u{1f600}".repeat(40), 30)).toMatch(/^(\u{1f600})+\.\.\.$/u);
    // A whole CNC file name: a 334-character part, a long title, a long stock, all in three-byte characters.
    const n = smallNesting();
    const piece = n.pieces[1];
    piece.stock = "\u5408\u677f".repeat(60);
    piece.material = "\u6750".repeat(60);
    piece.placements = [{ ...piece.placements[0], name: "\u90e8".repeat(334) }, { ...piece.placements[0], tag: "9", name: "Door" }];
    const name = cncFileName(`.${"\u53f0\u6240".repeat(80)}`, n, 1, undefined, () => "\u30ad\u30e3\u30d3\u30cd\u30c3\u30c8");
    expect(bytes(name)).toBeLessThanOrEqual(255);
    expect(name.startsWith(".")).toBe(false);
    expect(name).toMatch(/ 02 sheet 1 of 1 - /);
    expect(name).toMatch(/ - profile CNC\.dxf$/);
    // A plain one is not touched.
    expect(cncFileName("Kitchen", smallNesting(), 1, undefined, () => "Sink base")).toBe("Kitchen 02 sheet 1 of 1 - Sink base Back panel - 4 x 8 sheet, 1-4 - profile CNC.dxf");
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

  const cutFeature = (o: Partial<BlankFeatures> = {}): BlankFeatures => ({ profile: null, cutouts: [], pockets: [], drills: [], flip: { pockets: [], drills: [] }, skipped: false, ...o });

  it("asks before saving: cuts left out, cuts not measured", () => {
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
  });

  it("asks about a sheet of another thickness only when the file holds machined cuts", () => {
    const n = structuredClone(smallNesting());
    for (const p of n.pieces) for (const q of p.placements) q.size = [p.thickness, q.size[1], q.size[2]];
    // The shelves drawn half a millimetre thicker than their board, the back panel a quarter
    // millimetre thinner than its sheet.
    for (const q of n.pieces[0].placements) q.size = [n.pieces[0].thickness + 0.5e-3, q.size[1], q.size[2]];
    n.pieces[1].placements[0].size = [n.pieces[1].thickness - 0.25e-3, n.pieces[1].placements[0].size[1], n.pieces[1].placements[0].size[2]];
    expect(thicknessMismatches(n)).toHaveLength(2);
    // Plain rectangles (a bookshelf drawn at 3/4 in on 23/32 plywood): nothing was sized to the
    // thickness, nothing to ask. A part measured as a plain box is the same.
    const plain = { features: new Map<string, BlankFeatures>(), skipped: [], flipped: [] };
    expect(cutProblems(n, plain, "half_mm")).toEqual([]);
    expect(cutProblems(n, { ...plain, features: new Map([["2", cutFeature()]]) }, "half_mm")).toEqual([]);
    // One part with a pocket: every mismatched part is named, the one that slides into the
    // dado as much as the one with it.
    const dado = { ...plain, features: new Map([["2", cutFeature({ pockets: [{ loop: [], depth: 0.006 }] })]]) };
    const asked = cutProblems(n, dado, "half_mm");
    expect(asked.map((p) => [p.kind, p.name])).toEqual([
      ["thickness", "Shelf"],
      ["thickness", "Back panel"],
    ]);
    expect(asked[0].text).toBe(
      "drawn 19.55 mm thick but nested on 4/4 x 12 x 96 (19.05 mm), a sheet 0.5 mm thinner: joints and depths sized to the drawing (a dado's width, a tongue's length, a hole's depth) will not fit this sheet. Set the design to the sheet's measured thickness, or the sheet's thickness to what you will cut",
    );
    expect(asked[1].text).toMatch(/^drawn 5\.31 mm thick but nested on 4 x 8 sheet, 1\/4 \(5\.56 mm\), a sheet 0\.25 mm thicker: /);
    // A hole, a cutout, a notched outline or a cut in the other face each count; the wording
    // is true of a file with only holes.
    const hole = { loop: [], center: [0, 0] as [number, number], diameter: 0.005, depth: 0.01, through: false };
    for (const f of [cutFeature({ drills: [hole] }), cutFeature({ cutouts: [[]] }), cutFeature({ profile: [[0, 0]] }), cutFeature({ flip: { pockets: [], drills: [hole] } })]) {
      expect(cutProblems(n, { ...plain, features: new Map([["1a", f]]) }, "half_mm").filter((p) => p.kind === "thickness")).toHaveLength(2);
    }
    expect(asked[0].text).not.toContain("every dado");
    // Not measured: the file may hold cuts, so it is asked, with the cuts problem after.
    expect(cutProblems(n, null, "half_mm").map((p) => p.kind)).toEqual(["thickness", "thickness", "cuts"]);
    // The note after saving still names the mismatch, cuts or none.
    expect(cncNotes(n, plain, "half_mm")[0]).toMatch(/^Shelf is drawn 19\.55 mm thick but nested on .* \(19\.05 mm\), a sheet 0\.5 mm thinner: joints and depths/);
  });

  it("a small difference in thickness is a real number, never 0 in or the same fraction twice", () => {
    const n = structuredClone(smallNesting());
    for (const p of n.pieces) for (const q of p.placements) q.size = [p.thickness, q.size[1], q.size[2]];
    // The back panel drawn 0.15 mm thicker than its 7/32 in sheet: both round to 7/32.
    const q = n.pieces[1].placements[0];
    q.size = [n.pieces[1].thickness + 0.15e-3, q.size[1], q.size[2]];
    expect(fineU(q.size[0], "sixteenth")).toBe(fineU(n.pieces[1].thickness, "sixteenth"));
    expect(fineU(0.15e-3, "sixteenth")).toBe("0 in");
    const dado = { features: new Map([["2", cutFeature({ pockets: [{ loop: [], depth: 0.006 }] })]]), skipped: [], flipped: [] };
    const [p] = cutProblems(n, dado, "sixteenth");
    expect(p.text).toMatch(/^drawn 0\.225 in thick but nested on 4 x 8 sheet, 1\/4 \(7\/32 in\), a sheet 0\.006 in \(0\.15 mm\) thinner: /);
    expect(p.text).not.toContain(" 0 in");
    const note = cncNotes(n, dado, "sixteenth")[0];
    expect(note).toMatch(/drawn 0\.225 in thick but nested on 4 x 8 sheet, 1\/4 \(7\/32 in\), a sheet 0\.006 in \(0\.15 mm\) thinner/);
    // The formatters: a fraction only when the length is that fraction.
    expect(exactU((23 / 32) * IN, "sixteenth")).toBe("23/32 in");
    expect(exactU(0.727 * IN, "sixteenth")).toBe("0.727 in");
    expect(exactU(0.018, "half_mm")).toBe("18 mm");
    expect(exactU(0.727 * IN, { r: "sixteenth", style: "decimal" })).toBe("0.727 in");
    expect(diffU(IN / 32, "sixteenth")).toBe("1/32 in");
    expect(diffU(-0.15e-3, "sixteenth")).toBe("0.006 in (0.15 mm)");
    expect(diffU(0.26e-3, "half_mm")).toBe("0.26 mm");
    // A negative length keeps its sign and its size.
    expect(fineU(-IN / 8, "sixteenth")).toBe("-1/8 in");
    expect(fineU(-1.5 * IN, "sixteenth")).toBe("-1 1/2 in");
    expect(fineU(-0.003, "half_mm")).toBe("-3 mm");
    expect(fineU(1.875 * IN, "sixteenth")).toBe("1 7/8 in");
    expect(fineU(0, "sixteenth")).toBe("0 in");
    // Whole steps write as fineU does, so a width and its edges agree.
    for (const u of ["sixteenth", "half_mm", { r: "sixteenth", style: "decimal" }] as const) {
      for (const m of [0, 0.0031, 0.0185, 0.1234, 2.1336]) expect(`${fineSteps(Math.round(m / fineStep(u)), u)} ${u === "half_mm" ? "mm" : "in"}`).toBe(fineU(m, u));
    }
  });

  it("the spacing problem speaks the document's units", () => {
    const n = smallNesting();
    n.settings = { ...n.settings, kerf: 0.003 };
    expect(spacingProblem(n, "half_mm")?.text).toContain("parts are 3 mm apart (Kerf), too close for a 6.35 mm bit");
    expect(spacingProblem(n, "half_mm")?.text).toContain("Use CNC spacing (10 mm apart)");
    expect(spacingProblem(n, "half_mm")?.text).not.toContain("3/8 in");
    expect(spacingProblem(n, "sixteenth")?.text).toContain("Use CNC spacing (3/8 in apart)");
  });

  it("a sheet among the router's that is not the router's sheet is a problem to ask about", () => {
    const n = structuredClone(smallNesting());
    // No sheet size set: any sheet is the router's.
    expect(routerSheetProblems(n, "sixteenth")).toEqual([]);
    n.settings = { ...n.settings, sheetSize: { width: 48 * IN, length: 48 * IN } };
    // The back panel's 4 x 8: its material's stock is set to it, so "nest on 4 x 4" left it there.
    const sheet = n.pieces[1];
    sheet.material = "Cabinet plywood";
    n.library.defaults = { "Cabinet plywood": sheet.stock };
    n.pieces.push({ ...sheet, index: 3, seq: 2, count: 2, placements: [{ ...sheet.placements[0], tag: "5" }] });
    const [p, ...rest] = routerSheetProblems(n, "sixteenth");
    expect(rest).toEqual([]);
    expect([p.kind, p.name, p.tag]).toEqual(["footprint", "4 x 8 sheet, 1/4", "2, 5"]);
    expect(p.text).toBe("2 sheets 48 x 96 in, not the 48 x 48 in the router is set to: Cabinet plywood's stock is set to it, so they stay on this sheet and would be written as some of the CNC files. Set Cabinet plywood's stock to a sheet the router takes (Stock...), or cut these sheets another way");
    // The board is not a sheet; a sheet the track saw cuts is not the router's; a 4 x 4 either way round is.
    expect(routerSheetProblems({ ...n, pieces: [n.pieces[0]] }, "sixteenth")).toEqual([]);
    expect(routerSheetProblems({ ...n, pieces: n.pieces.map((x) => ({ ...x, saw: x.kind === "sheet" })) }, "sixteenth")).toEqual([]);
    expect(routerSheetProblems({ ...n, pieces: [{ ...sheet, length: 48 * IN }] }, "sixteenth")).toEqual([]);
    // A part that names the sheet as its stock, in millimetres.
    n.library.defaults = {};
    n.pieces = [{ ...sheet, material: sheet.stock }];
    expect(routerSheetProblems(n, "half_mm")[0].text).toMatch(/^a sheet 1219\.2 x 2438\.4 mm, not the 1219\.2 x 1219\.2 mm the router is set to: its parts name it as their stock, so it stays on this sheet and would be written as one of the CNC files\. Set the parts' stock to /);
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
