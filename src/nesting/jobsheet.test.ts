// A sheet's job sheet and its part labels without the kernel: the narrowest place in a shape,
// the bit-fit check against measured widths (the metric 6.2 mm groove against a 1/4 in bit),
// the cut order and its tool changes, the hold-down width, which face is up, the label grid,
// the text file's name and the booklet's pages. The real cabinets go through the kernel in
// jobsheet.wasm.test.ts.
import { describe, expect, it } from "vitest";
import type { Nesting, Placement, StockPiece } from "../kernel/types";
import { defaultShop, type Shop } from "../cam/store";
import { readJobs } from "../cam/jobs";
import { readPdf, winAnsi } from "../cutlist/pdf";
import { nestingDxf } from "./dxf";
import type { BlankFeatures, MachineDrill, MachineLoop } from "./machine";
import type { MeasuredNest } from "./measure";
import { cncSaveMessage } from "./exportGuard";
import { nestingPdf } from "./booklet";
import { faceUp, jobSheet, jobSheetsFileName, jobSheetsText, jobSheetText, narrowestWidth, orderSummary, stepText, type JobSheet } from "./jobsheet";
import { labelAt, labelGrid, partLabels } from "./partlabels";

const IN = 0.0254;
const MM = 0.001;
type P2 = [number, number];
const rect = (u0: number, v0: number, u1: number, v1: number): P2[] => [
  [u0, v0],
  [u1, v0],
  [u1, v1],
  [u0, v1],
];

describe("the narrowest place in a shape", () => {
  it("a groove is as narrow as it is wide, whichever way it runs", () => {
    expect(narrowestWidth(rect(0, 0, 0.5, 0.0062)).width).toBeCloseTo(0.0062, 9);
    expect(narrowestWidth(rect(0, 0, 0.0062, 0.5)).width).toBeCloseTo(0.0062, 9);
  });

  it("an L of two dados is as narrow as its narrower arm, not its junction", () => {
    // An 18 mm dado down the side and a 12 mm one across its foot.
    const l: P2[] = [
      [0, 0],
      [0.3, 0],
      [0.3, 0.012],
      [0.018, 0.012],
      [0.018, 0.4],
      [0, 0.4],
    ];
    expect(narrowestWidth(l).width).toBeCloseTo(0.012, 9);
  });

  it("the strip of a dado left between a crossing deeper groove and the edge is not a slot", () => {
    // A dado 18 mm wide whose floor is cut 3 mm from its end by a deeper groove: the floor's
    // loop is 3 mm long, but the bit runs on through the groove (cut anyway).
    const strip = rect(0, 0, 0.003, 0.018);
    expect(narrowestWidth(strip).width).toBeCloseTo(0.003, 9);
    expect(narrowestWidth(strip, [rect(0.003, -0.01, 0.009, 0.03), rect(0.009, 0, 0.3, 0.018)]).width).toBeCloseTo(0.018, 9);
  });

  it("a shape with slanted edges is measured by its convex hull, and says so", () => {
    const w = narrowestWidth([
      [0, 0],
      [0.1, 0],
      [0.11, 0.02],
      [0.01, 0.02],
    ]);
    expect(w.approx).toBe(true);
    expect(w.width).toBeGreaterThan(0.019);
    expect(w.width).toBeLessThan(0.0201);
  });
});

// ---------------------------------------------------------------------------------------
// A small router sheet: parts and their measured cuts, as measureNest would give them.

function part(tag: string, name: string, x: number, y: number, w: number, l: number, t = 18 * MM): Placement {
  return { row: 0, copy: 1, tag, name, item: { node: 1 }, x, y, dx: l, dy: w, turned: false, grain: "length", size: [t, w, l] };
}

function sheet(placements: Placement[], index = 1, extra: Partial<StockPiece> = {}): StockPiece {
  return {
    index,
    group: 0,
    seq: 1,
    count: 1,
    stock: "1220 x 1220 sheet, 12 mm",
    kind: "sheet",
    material: "Drawer box plywood",
    length: 1.22,
    width: 1.22,
    thickness: 12 * MM,
    grain: "length",
    trim: 0.012,
    kerf: 0.01,
    usable: [0.012, 0.012, 1.208, 1.208],
    placements,
    cuts: [],
    guillotine: false,
    parts_area: 0,
    stock_area: 0,
    waste_area: 0,
    efficiency: 0.5,
    ...extra,
  };
}

function nesting(pieces: StockPiece[]): Nesting {
  return {
    algorithm: "maxrects",
    settings: { algorithm: "maxrects", kerf: 0.01, trim: 0.012 } as Nesting["settings"],
    visible_only: false,
    library: { stocks: [], settings: {} } as unknown as Nesting["library"],
    pieces,
    unplaced: [],
    totals: { sheets: pieces.length, boards: 0, parts_in: 0, placed: 0, unplaced: 0, parts_area: 0, stock_area: 0, efficiency: 0, groups: [], by_nominal: [] },
    hash: "h",
  };
}

const pocket = (loop: P2[], depth: number): MachineLoop => ({ loop, depth });
const hole = (u: number, v: number, d: number, depth: number, through = false): MachineDrill => {
  const r = d / 2;
  const loop: P2[] = Array.from({ length: 16 }, (_, k) => [u + r * Math.cos((k * Math.PI) / 8), v + r * Math.sin((k * Math.PI) / 8)]);
  return { loop, depth, center: [u, v], diameter: d, through };
};
const feat = (f: Partial<BlankFeatures>): BlankFeatures => ({ profile: null, cutouts: [], pockets: [], drills: [], flip: { pockets: [], drills: [] }, skipped: false, ...f });

/** A metric drawer side: 6.2 mm groove for the bottom, 6 mm deep, and two 5 mm runner holes. */
function drawerSheet() {
  const side = part("12a", "Drawer side", 0.02, 0.02, 0.15, 0.5, 12 * MM);
  const back = part("13", "Drawer back", 0.02, 0.2, 0.12, 0.35, 12 * MM);
  const features = new Map<string, BlankFeatures>([
    ["12a", feat({ pockets: [pocket(rect(0, 0.01, 0.5, 0.0162), 6 * MM)], drills: [hole(0.05, 0.08, 5 * MM, 13 * MM), hole(0.45, 0.08, 5 * MM, 13 * MM)] })],
    ["13", feat({ drills: [hole(0.03, 0.06, 6 * MM, 10 * MM)] })],
  ]);
  const n = nesting([sheet([side, back])]);
  const measured: MeasuredNest = { features, skipped: [], flipped: [] };
  return { n, measured };
}

const build = (n: Nesting, measured: MeasuredNest | null, shop: Shop, units: "half_mm" | "sixteenth" = "half_mm", index = 0) => jobSheet({ n, index, measured, shop, units, file: "Kitchen 1 sheet 1 of 1 - x CNC.dxf", ownerOf: () => "Drawer base 1" });

function shopWith(patch: (s: Shop) => void): Shop {
  const s = defaultShop();
  s.profileTool = "seed-compression";
  patch(s);
  return s;
}

describe("each layer's bit, checked against the narrowest shape on it in this sheet", () => {
  it("the metric 6.2 mm groove against a 1/4 in bit is flagged, and the bit that would fit is named", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.jobs.tools.narrow = null)));
    const groove = js.layers.find((l) => l.name === "POCKET_6MM")!;
    expect(groove.narrowest?.width).toBeCloseTo(6.2 * MM, 9);
    expect(groove.narrowest?.tag).toBe("12a");
    expect(groove.tool?.id).toBe("seed-downcut");
    expect(groove.fits).toBe(false);
    expect(groove.fitNotes.join(" ")).toContain("6.20 mm");
    // The built-in end mill's flute length is not known: it is named as one that would fit.
    expect(groove.fitNotes.join(" ")).toMatch(/1\/8 in end mill \(.*\) would fit if its flutes reach 6\.00 mm/);
  });

  it("with a narrow-groove bit set (the default), the groove goes to it", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith(() => {}));
    const groove = js.layers.find((l) => l.name === "POCKET_6MM")!;
    expect(groove.tooWide?.id).toBe("seed-downcut");
    expect(groove.tool?.id).toBe("seed-endmill");
    expect(groove.kind).toBe("narrow");
    expect(groove.fits).toBe(true);
    expect(groove.fitNotes[0]).toMatch(/^The pocket bit, 1\/4 in down-cut .* is not narrower than the narrowest shape on this layer: 6\.20 mm/);
  });

  it("no bit in the library fits: said so", () => {
    const { n, measured } = drawerSheet();
    const js = build(
      n,
      measured,
      shopWith((s) => {
        s.tools = s.tools.filter((t) => t.id !== "seed-endmill");
        s.jobs.tools = readJobs(s.jobs, s.tools).tools;
      }),
    );
    const groove = js.layers.find((l) => l.name === "POCKET_6MM")!;
    expect(groove.fits).toBe(false);
    expect(groove.fitNotes.join(" ")).toContain("No bit in your library is narrower than 6.20 mm");
    // The holes have no bit: each is a step to choose one, in the order.
    const choose = js.order.filter((st) => !st.tool).flatMap((st) => st.layers);
    expect(choose).toEqual(expect.arrayContaining(["DRILL_D5MM_13MM", "DRILL_D6MM_10MM"]));
  });

  it("a 1/4 in end mill set for holes cannot pocket a 5 mm hole: flagged, and the feeds' own warning rendered", () => {
    const { n, measured } = drawerSheet();
    const js = build(
      n,
      measured,
      shopWith((s) => {
        s.tools.push({ ...s.tools[2], id: "em-quarter", name: "1/4 in end mill", diameter: 0.25 * IN, from: {} });
        s.jobs.tools.hole = "em-quarter";
      }),
    );
    const h = js.layers.find((l) => l.name === "DRILL_D5MM_13MM")!;
    expect(h.fits).toBe(false);
    expect(h.fitNotes.join(" ")).toContain("1/8 in end mill");
    // Whatever the API's wording, it says Stop for this bit in this hole.
    expect(h.warnings.some((w) => w.level === "stop")).toBe(true);
  });

  it("the layers are the DXF's own, and each has the toolpath and depth the docs give", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith(() => {}));
    const dxf = nestingDxf(n, "lwpolyline", measured.features, { piece: 0, overcut: true });
    const inFile = [...dxf.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]).filter((x) => x !== "0");
    expect(js.layers.map((l) => l.name)).toEqual(inFile);
    const at = (name: string) => js.layers.find((l) => l.name === name)!;
    expect(at("STOCK").cut).toBe(false);
    expect(at("LABELS").cut).toBe(false);
    expect(at("PROFILE_THRU").toolpath).toBe("Outside profile, through the sheet");
    expect(at("PROFILE_THRU").depth).toMatch(/^Through: this sheet's measured thickness plus about 0\.5 mm/);
    expect(at("POCKET_6MM").toolpath).toBe("Pocket");
    expect(at("POCKET_6MM").depth).toMatch(/^6 mm, from the top of the sheet/);
    expect(at("DRILL_D5MM_13MM").toolpath).toBe("Pocket the circle");
    expect(at("DRILL_D5MM_13MM").depth).toMatch(/^13 mm/);
    // Every cut layer's feeds come from the API, each with a label and a value.
    for (const l of js.layers.filter((x) => x.cut)) expect(l.feeds.map((f) => f.label)).toEqual(expect.arrayContaining(["Feed"]));
  });

  it("no profile bit chosen: said so, and the profile is a step to choose a bit for", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.profileTool = null)));
    const p = js.layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.tool).toBeNull();
    expect(p.toolWhy).toContain("no profile bit is chosen");
    expect(js.order.find((st) => st.layers.includes("PROFILE_THRU"))?.tool).toBeNull();
  });
});

describe("the cut order and its tool changes", () => {
  /** A carcass part with a dado, a back groove (narrow), shelf-pin holes and a cutout. */
  function carcass() {
    const p = part("2", "Left side", 0.02, 0.02, 0.56, 0.87);
    const features = new Map<string, BlankFeatures>([
      [
        "2",
        feat({
          pockets: [pocket(rect(0.3, 0, 0.3185, 0.56), 6.35 * MM), pocket(rect(0, 0.54, 0.87, 0.5458), 7.94 * MM)],
          drills: [hole(0.1, 0.1, 5 * MM, 10 * MM), hole(0.1, 0.4, 5 * MM, 10 * MM)],
          cutouts: [rect(0.5, 0.2, 0.7, 0.3)],
        }),
      ],
    ]);
    return { n: nesting([sheet([p], 2, { thickness: 18.26 * MM })]), measured: { features, skipped: [], flipped: [] } as MeasuredNest };
  }

  it("drills and pockets, then cutouts, then profiles; the layers that share a bit together", () => {
    const { n, measured } = carcass();
    const js = build(n, measured, shopWith(() => {}), "sixteenth");
    const phases = js.order.map((s) => s.phase);
    expect(phases.indexOf("cutouts")).toBeGreaterThan(phases.lastIndexOf("drills and pockets"));
    expect(phases.indexOf("profiles")).toBeGreaterThan(phases.lastIndexOf("cutouts"));
    // The end mill takes the holes and the narrow back groove in one step.
    const em = js.order.find((s) => s.tool?.id === "seed-endmill")!;
    expect(em.layers.sort()).toEqual(["DRILL_D5MM_10MM", "POCKET_7.94MM"]);
    // End mill, down-cut, then the compression bit for the cutout and the profile: 2 changes.
    expect(js.changes).toBe(2);
    expect(js.order.filter((s) => s.change)).toHaveLength(2);
  });

  it("the bits are ordered so the last one before the cutouts is the cutouts' own", () => {
    const { n, measured } = carcass();
    // Cutouts with the end mill: down-cut first, then the end mill runs on into the cutout.
    const js = build(n, measured, shopWith((s) => (s.jobs.tools.cutout = "seed-endmill")), "sixteenth");
    expect(js.order.map((s) => [s.tool?.id, s.phase])).toEqual([
      ["seed-downcut", "drills and pockets"],
      ["seed-endmill", "drills and pockets"],
      ["seed-endmill", "cutouts"],
      ["seed-compression", "profiles"],
    ]);
    // Taken in the layers' own order it would be end mill, down-cut, end mill, compression: 3.
    expect(js.changes).toBe(2);
    expect(jobSheetText(js, "Kitchen")).toContain("Cut order: 3 bits, 2 tool changes".toUpperCase());
  });

  it("FLIP_ layers are a second setup, after the profiles", () => {
    const p = part("4", "Odd part", 0.02, 0.02, 0.3, 0.6);
    const features = new Map<string, BlankFeatures>([["4", feat({ drills: [hole(0.1, 0.1, 5 * MM, 10 * MM)], flip: { pockets: [], drills: [hole(0.2, 0.1, 5 * MM, 10 * MM)] } })]]);
    const js = build(nesting([sheet([p])]), { features, skipped: [], flipped: ["Odd part"] }, shopWith(() => {}));
    const last = js.order[js.order.length - 1];
    expect(last.layers).toEqual(["FLIP_DRILL_D5MM_10MM"]);
    expect(last.secondSetup).toBe(true);
    expect(js.flip.join(" ")).toContain("4 Odd part has cuts in the other face");
    expect(js.flip.join(" ")).toContain("mirror image");
  });
});

describe("hold-down: the parts, smallest first, those this narrow or narrower flagged", () => {
  const parts = () => nesting([sheet([part("1", "Side", 0.02, 0.02, 23.25 * IN, 34.5 * IN), part("5", "Stretcher", 0.02, 0.7, 4 * IN, 22.5 * IN), part("7", "Nailer", 0.02, 0.85, 3 * IN, 22.5 * IN), part("8", "Rail", 0.4, 0.85, 4.125 * IN, 22.5 * IN)])]);

  it("Sawhorse's default is 5 in: the 3 in nailer, the 4 in stretcher and a 4 1/8 in rail are flagged, a side is not", () => {
    const js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "sixteenth");
    expect(js.parts.map((p) => p.tag)).toEqual(["7", "5", "8", "1"]);
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer", "Stretcher", "Rail"]);
    expect(js.holdDown).toContain("5 in wide or narrower");
    expect(js.holdDown).toContain("Sawhorse's default, not a standard");
  });

  it("in a metric document the default is 125 mm, and a width typed in CNC setup wins; a part as wide as it is flagged", () => {
    let js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "half_mm");
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer", "Stretcher", "Rail"]);
    expect(js.holdDown).toContain("125 mm wide or narrower");
    js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith((s) => (s.jobs.holdDown = 4 * IN)), "sixteenth");
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer", "Stretcher"]);
    expect(js.holdDown).not.toContain("Sawhorse's default");
  });
});

describe("which face is up on the router, from the part's measured cuts", () => {
  it("a door: its back, where the hinge cups are; a carcass part: the face with its dados and holes", () => {
    expect(faceUp(feat({ drills: [hole(0.1, 0.1, 35 * MM, 13 * MM), hole(0.1, 0.3, 4.76 * MM, 18 * MM, true)] }), true)).toMatch(/^Back face up: its 35 mm hinge cups/);
    expect(faceUp(feat({ pockets: [pocket(rect(0, 0, 0.1, 0.02), 6.35 * MM)], drills: [hole(0.05, 0.05, 5 * MM, 10 * MM)] }), true)).toBe("The face with its dados or grooves and its 5 mm holes up.");
  });

  it("a part with only holes through it (a drawer face), or none: either face", () => {
    expect(faceUp(feat({ drills: [hole(0.1, 0.1, 5 * MM, 18 * MM, true)] }), true)).toMatch(/^Either face/);
    expect(faceUp(undefined, true)).toMatch(/^Either face/);
    expect(faceUp(feat({ profile: rect(0, 0, 0.1, 0.1) }), true)).toContain("mirror image");
  });

  it("cuts in both faces: turn it over for the FLIP_ ones; not measured: not known", () => {
    expect(faceUp(feat({ pockets: [pocket(rect(0, 0, 0.1, 0.02), 6 * MM)], flip: { pockets: [], drills: [hole(0.1, 0.1, 5 * MM, 10 * MM)] } }), true)).toContain("FLIP_");
    expect(faceUp(undefined, false)).toMatch(/^Not known/);
  });

  it("a part whose cuts were left out says not known on its label", () => {
    const { n } = drawerSheet();
    const js = build(n, { features: new Map(), skipped: ["Drawer side"], flipped: [] }, shopWith(() => {}));
    expect(js.parts.find((p) => p.tag === "12a")?.faceUp).toMatch(/^Not known/);
    expect(js.notes.join(" ")).toContain("12a Drawer side");
  });
});

describe("part labels", () => {
  it("one per part, with its tag, name, cabinet, sheet, size, grain and face up, and a line for banding", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith(() => {}));
    const labels = partLabels([js]);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatchObject({ tag: "13", name: "Drawer back", cabinet: "Drawer base 1", sheet: "1. Sheet 1 of 1", grain: "length", banding: null });
    expect(labels[0].size).toBe("120 × 350 × 12 mm");
    expect(labels[0].faceUp).toBe("The face with its 6 mm holes up.");
  });

  it("the grid: 4 x 2 in on letter is 2 by 5, 105 x 74 mm on A4 2 by 4, centred", () => {
    const shop = defaultShop();
    let g = labelGrid(shop.jobs);
    expect([g.columns, g.rows]).toEqual([2, 5]);
    expect(g.left).toBeCloseTo(18, 6);
    expect(g.bottom).toBeCloseTo(36, 6);
    expect(labelAt(g, 0)).toEqual({ page: 0, x: g.left, y: g.bottom + 4 * 144 });
    expect(labelAt(g, 11)).toEqual({ page: 1, x: g.left + 288, y: g.bottom + 4 * 144 });
    g = labelGrid({ ...shop.jobs, labels: { paper: "a4", size: "105x74mm", outlines: false } });
    expect([g.columns, g.rows]).toEqual([2, 4]);
  });

  it("the booklet carries each router sheet's job sheet after its page, then the labels, and says which pages they are", () => {
    const { n, measured } = drawerSheet();
    const shop = shopWith(() => {});
    const js = build(n, measured, shop);
    const plain = readPdf(nestingPdf(n, "Kitchen", "half_mm"));
    const full = readPdf(nestingPdf(n, "Kitchen", "half_mm", undefined, { sheets: [js], prefs: shop.jobs }));
    expect(full.pages).toBeGreaterThan(plain.pages + 1);
    const all = full.text.map((t) => t.join("\n"));
    expect(all[plain.pages]).toContain("Job sheet: 1. Sheet 1 of 1");
    const job = all.slice(plain.pages, -1).join("\n");
    for (const l of js.layers) expect(job).toContain(l.name);
    expect(job).toContain("Cut order: 2 bits, 1 tool change");
    expect(all[all.length - 1]).toContain("12a  Drawer side");
    expect(all[all.length - 1]).toContain("Banding: ______________");
    expect(all[0]).toMatch(new RegExp(`Part labels: page ${full.pages}\\.`));
  });
});

describe("a sheet's job sheet as text", () => {
  it("names its DXF and label, says to measure the thickness, and has a tick box per cut layer", () => {
    const { n, measured } = drawerSheet();
    const js: JobSheet = build(n, measured, shopWith(() => {}));
    const text = jobSheetText(js, "Kitchen");
    expect(text).toContain("Kitchen 1 sheet 1 of 1 - x CNC.dxf");
    expect(text).toContain("1. Sheet 1 of 1 - 1220 x 1220 sheet, 12 mm - Drawer box plywood");
    expect(text).toContain("12 mm is only what was entered for the stock, not a measurement");
    expect(text).toContain("1220 x 1220 mm (X by Y)");
    for (const l of js.layers) expect(text).toContain(l.cut ? `[ ] ${l.name}` : `    ${l.name} (reference: no toolpath)`);
    // Wrapped at 92 characters, but for the DXF's name, which stays whole on its line.
    expect(text.split("\n").filter((l) => !l.startsWith("DXF ")).every((l) => l.length <= 92 || !l.includes(" "))).toBe(true);
    expect(text).toContain(`DXF            ${js.file}\n`);
  });
});

// ---------------------------------------------------------------------------------------
// The independent review of feat/job-sheet: one block per finding, each failing before its fix.

/** A tool like the seeded ones, with its own id, size and flute length. */
function bit(id: string, type: Shop["tools"][number]["type"], dia: number, cuttingLength: number | null): Shop["tools"][number] {
  return { id, name: id, type, diameter: dia, flutes: 2, shank: 0.25 * IN, cuttingLength, upcut: type === "compression" ? 0.2756 * IN : null, upcutTol: type === "compression" ? 0.01 * IN : null, from: {} };
}

describe("review C1: every cut layer is in the cut order, a layer with no bit as a step to choose one", () => {
  it("no profile bit: PROFILE_THRU is a numbered step reading CHOOSE A BIT, and counted", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.profileTool = null)));
    const step = js.order.find((s) => s.layers.includes("PROFILE_THRU"));
    expect(step, "PROFILE_THRU is in the order").toBeDefined();
    expect(step!.tool).toBeNull();
    const k = js.order.indexOf(step!);
    expect(stepText(step!, k, true)).toMatch(new RegExp(`^${k + 1}\\. CHOOSE A BIT: PROFILE_THRU`));
    // End mill (holes, groove), then the profile's bit to choose: 2 bits, 1 still to choose.
    expect(orderSummary(js)).toMatch(/^2 bits \(1 still to choose\), 1 tool change/);
    expect(jobSheetText(js, "K")).toContain("CHOOSE A BIT: PROFILE_THRU");
  });

  it("a through layer's suggestion needs flutes that reach through the sheet, and prefers a compression bit in a faced sheet", () => {
    const { n, measured } = drawerSheet();
    // 12 mm sheet: the bit must reach 12.5 mm. The end mill's flutes are 10 mm: not suggested.
    const shop = shopWith((s) => {
      s.profileTool = null;
      s.jobs.material = "laminate-bb";
      s.tools = [bit("em", "endmill", 0.125 * IN, 10 * MM), bit("up", "upcut", 0.25 * IN, 25 * MM), bit("comp", "compression", 0.25 * IN, 22 * MM)];
    });
    const p = build(n, measured, shop).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.fitNotes.join(" ")).toMatch(/fits .* and reaches 12\.50 mm deep: comp/);
    // Without the compression bit, the up-cut is offered, and said not to be a compression bit.
    shop.tools = shop.tools.filter((t) => t.id !== "comp");
    const q = build(n, measured, shop).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(q.fitNotes.join(" ")).toMatch(/: up \(.*\), though not a compression bit/);
    // With only the short end mill, none is suitable, and it says so plainly.
    shop.tools = shop.tools.filter((t) => t.id === "em");
    const r = build(n, measured, shop).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(r.fitNotes.join(" ")).toContain("No bit in your library is narrower than");
    expect(r.fitNotes.join(" ")).toContain("with flutes at least 12.50 mm long");
  });

  it("a bit whose flute length is not typed is never suggested as reaching; it is named as one that would if its flutes do", () => {
    const { n, measured } = drawerSheet();
    const shop = shopWith((s) => {
      s.profileTool = null;
      s.tools = [bit("em", "endmill", 0.125 * IN, null)];
    });
    const p = build(n, measured, shop).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.fitNotes.join(" ")).toContain("No bit in your library is narrower than");
    expect(p.fitNotes.join(" ")).toMatch(/em \(.*\) would fit if its flutes reach 12\.50 mm/);
  });
});

/** One part with a notched outline, alone on its sheet (so the gap between parts plays no part). */
function notched(profile: P2[], dx: number, dy: number) {
  const q = part("4", "Front stretcher", 0.02, 0.02, dy, dx, 18 * MM);
  const features = new Map<string, BlankFeatures>([["4", feat({ profile })]]);
  return { n: nesting([sheet([q], 1, { thickness: 18 * MM })]), measured: { features, skipped: [], flipped: [] } as MeasuredNest };
}

describe("review M1: a notch limits the bit only across the way it is closed", () => {
  it("corner notches (open on two sides), as on every stretcher and bottom, put no limit on the 1/4 in bit", () => {
    // The base's front stretcher: 0.23 x 0.75 in notches at both ends of one edge.
    const dx = 23.023 * IN;
    const dy = 4 * IN;
    const { n, measured } = notched(
      [
        [dx, dy],
        [0, dy],
        [0, 0.75 * IN],
        [0.23 * IN, 0.75 * IN],
        [0.23 * IN, 0],
        [dx - 0.23 * IN, 0],
        [dx - 0.23 * IN, 0.75 * IN],
        [dx, 0.75 * IN],
      ],
      dx,
      dy,
    );
    const p = build(n, measured, shopWith(() => {}), "sixteenth").layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.fits).toBe(true);
    expect(p.fitNotes).toEqual([]);
  });

  it("a slot in the middle of an edge (open on one side) limits it to its width", () => {
    // A 5 mm slot 30 mm deep into the bottom edge.
    const dx = 0.5;
    const dy = 0.1;
    const { n, measured } = notched(
      [
        [0, 0],
        [0.2475, 0],
        [0.2475, 0.03],
        [0.2525, 0.03],
        [0.2525, 0],
        [dx, 0],
        [dx, dy],
        [0, dy],
      ],
      dx,
      dy,
    );
    const p = build(n, measured, shopWith(() => {})).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.narrowest?.width).toBeCloseTo(5 * MM, 9);
    expect(p.narrowest?.what).toContain("notch");
    expect(p.fits).toBe(false);
  });

  it("the gap between parts limits the profile bit, and is said to be between parts, not one part's", () => {
    const { n, measured } = drawerSheet();
    n.pieces[0] = { ...n.pieces[0], kerf: 5 * MM };
    const p = build(n, measured, shopWith(() => {})).layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.fits).toBe(false);
    expect(p.narrowest?.width).toBeCloseTo(5 * MM, 9);
    expect(p.narrowest?.tag).toBe("");
    expect(p.fitNotes.join(" ")).toContain("the gap between parts");
    expect(p.fitNotes.join(" ")).not.toContain("12a Drawer side, the gap");
  });
});

describe("review M2: the bit that fits, and what the job sheet says about it", () => {
  it("a bit exactly as wide as the groove does not fit (strict), and needs an on-line slot toolpath", () => {
    const side = part("12a", "Drawer side", 0.02, 0.02, 0.15, 0.5, 12 * MM);
    const features = new Map<string, BlankFeatures>([["12a", feat({ pockets: [pocket(rect(0.05, 0.05, 0.45, 0.05 + 0.25 * IN), 6 * MM)] })]]);
    const js = build(nesting([sheet([side])]), { features, skipped: [], flipped: [] }, shopWith((s) => (s.jobs.tools.narrow = null)));
    const g = js.layers.find((l) => l.name === "POCKET_6MM")!;
    expect(g.fits).toBe(false);
    expect(g.fitNotes.join(" ")).toContain("on-line");
  });

  it("the suggestion is the LARGEST bit that fits and reaches, not the smallest", () => {
    const { n, measured } = drawerSheet();
    const shop = shopWith((s) => {
      s.tools = [...s.tools, bit("em3", "endmill", 0.125 * IN, 12 * MM), bit("em316", "endmill", 0.1875 * IN, 12 * MM)];
      s.jobs.tools.narrow = null;
    });
    const g = build(n, measured, shop).layers.find((l) => l.name === "POCKET_6MM")!;
    expect(g.fitNotes.join(" ")).toMatch(/Largest bit in your library that fits .*: em316/);
  });

  it("a pocket that reaches the part's edge is measured as drawn, past the edge into the gap", () => {
    // 4 mm in from the left edge, 18 mm across: drawn 4.75 mm past the edge (Kerf 10 mm), so
    // 8.75 mm, and the 1/4 in down-cut fits.
    const side = part("2", "Side", 0.02, 0.02, 0.3, 0.6, 18 * MM);
    const features = new Map<string, BlankFeatures>([["2", feat({ pockets: [pocket(rect(0, 0.1, 0.004, 0.118), 6.35 * MM)] })]]);
    const js = build(nesting([sheet([side], 1, { thickness: 18 * MM })]), { features, skipped: [], flipped: [] }, shopWith(() => {}));
    const p = js.layers.find((l) => l.name === "POCKET_6.35MM")!;
    expect(p.narrowest?.width).toBeCloseTo(8.75 * MM, 6);
    expect(p.tool?.id).toBe("seed-downcut");
  });

  it("a step whose bit does not fit says so in the cut order", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.jobs.tools.narrow = null)));
    const k = js.order.findIndex((s) => s.layers.includes("POCKET_6MM"));
    expect(stepText(js.order[k], k, true)).toContain("DOES NOT FIT: see POCKET_6MM");
  });

  it("a larger bit in the library that also fits is noted (the 35 mm cups and the 1/4 in down-cut)", () => {
    const door = part("1", "Door", 0.02, 0.02, 0.6, 0.76, 18 * MM);
    const features = new Map<string, BlankFeatures>([["1", feat({ drills: [hole(0.1, 0.1, 35 * MM, 13 * MM)] })]]);
    const js = build(nesting([sheet([door], 1, { thickness: 18 * MM })]), { features, skipped: [], flipped: [] }, shopWith(() => {}));
    const cups = js.layers.find((l) => l.name === "DRILL_D35MM_13MM")!;
    expect(cups.tool?.id).toBe("seed-endmill");
    expect(cups.fitNotes.join(" ")).toMatch(/1\/4 in down-cut .* is larger and also fits/);
  });
});

describe("review M3: one job sheets file for every router sheet, after the DXFs", () => {
  it("is named for the model and the date, names each sheet by its DXF's default name, and says it assumes those names", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith(() => {}));
    expect(jobSheetsFileName("Kitchen", new Date(2026, 10, 15))).toBe("Kitchen job sheets 2026-11-15.txt");
    const text = jobSheetsText([js, { ...js, number: "2. Sheet 1 of 1", file: "Kitchen 2 CNC.dxf" }], "Kitchen");
    expect(text).toContain("Kitchen 1 sheet 1 of 1 - x CNC.dxf");
    expect(text).toContain("Kitchen 2 CNC.dxf");
    expect(text).toMatch(/default names?/);
    // The list of sheets, then each sheet after a page break of its own.
    const parts = text.split("\n\f\n");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toMatch(/^Kitchen: job sheet for 1\. Sheet 1 of 1/);
    expect(parts[2]).toMatch(/^Kitchen: job sheet for 2\. Sheet 1 of 1/);
  });

  it("the status line says exactly what was saved: the DXFs, and the job sheets file or not", () => {
    const saved = cncSaveMessage({ saved: 3, total: 3, stoppedAt: null, hand: null, sawSheets: 0, jobSheets: { name: "K job sheets 2026-11-15.txt", saved: true, sheets: 3 } }, [])!;
    expect(saved).toContain("Saved 3 CNC files");
    expect(saved).toContain("Saved the job sheets for 3 sheets as K job sheets 2026-11-15.txt.");
    const cancelled = cncSaveMessage({ saved: 3, total: 3, stoppedAt: null, hand: null, sawSheets: 0, jobSheets: { name: "K job sheets 2026-11-15.txt", saved: false, sheets: 3 } }, [])!;
    expect(cancelled).toContain("Saved 3 CNC files");
    expect(cancelled).toContain("The job sheets were not saved");
  });
});

describe("review: the smaller findings", () => {
  it("the shop's material starts as laminate-faced Baltic birch, a stock can have its own, and each sheet prints its material", () => {
    expect(defaultShop().jobs.material).toBe("laminate-bb");
    const { n, measured } = drawerSheet();
    let js = build(n, measured, shopWith(() => {}));
    expect(js.material).toContain("Laminate-faced Baltic birch");
    js = build(n, measured, shopWith((s) => (s.jobs.materials = { "1220 x 1220 sheet, 12 mm": "baltic-birch" })));
    expect(js.material).toMatch(/^Baltic birch/);
    expect(jobSheetText(js, "K")).toContain("Material       Baltic birch");
  });

  it("a second setup that also changes the bit prints both", () => {
    const p = part("4", "Odd part", 0.02, 0.02, 0.3, 0.6);
    const features = new Map<string, BlankFeatures>([["4", feat({ flip: { pockets: [], drills: [hole(0.2, 0.1, 5 * MM, 10 * MM)] } })]]);
    const js = build(nesting([sheet([p])]), { features, skipped: [], flipped: ["Odd part"] }, shopWith(() => {}));
    const text = jobSheetText(js, "K");
    expect(text).toContain("-- second setup: turn the parts over --");
    expect(text).toContain("-- change the bit --");
  });

  it("STOCK and LABELS have no tick box: reference, no toolpath", () => {
    const { n, measured } = drawerSheet();
    const text = jobSheetText(build(n, measured, shopWith(() => {})), "K");
    expect(text).not.toContain("[ ] STOCK");
    expect(text).not.toContain("[ ] LABELS");
    expect(text).toContain("STOCK (reference: no toolpath)");
    // Layer 0, in every DXF's layer table, is named as empty.
    expect(text).toMatch(/Layer 0 .* empty/);
  });

  it("a drawer back's hook holes are in its rear face: the face up is said by its cuts, not called the inside", () => {
    const up = faceUp(feat({ drills: [hole(0.03, 0.06, 6 * MM, 10 * MM)] }), true);
    expect(up).toContain("6 mm holes");
    expect(up).not.toContain("inside");
  });

  it("± and every other character a job sheet prints is one the PDF's font has", () => {
    expect(winAnsi("±")).toEqual([0xb1]);
  });

  it("a label says the grain in words with the side it runs along, and never drops the sheet number for a long cabinet name", () => {
    const { n, measured } = drawerSheet();
    const js = jobSheet({ n, index: 0, measured, shop: shopWith(() => {}), units: "half_mm", file: "x.dxf", ownerOf: () => "A cabinet with a very long name indeed, longer than any label could hold on one line" });
    const labels = partLabels([js]);
    expect(labels[0].grainText).toBe("Grain along the length (the 350 mm side)");
    const text = readPdf(nestingPdf(n, "K", "half_mm", undefined, { sheets: [js], prefs: defaultShop().jobs })).text.flat().join("\n");
    expect(text).toContain("Grain along the length (the 350 mm side)");
    expect(text).toMatch(/1\. Sheet 1 of 1 · A cabinet with/);
  });

  it("with A4 label paper, the job sheet and label pages are A4", () => {
    const { n, measured } = drawerSheet();
    const shop = shopWith((s) => (s.jobs.labels = { paper: "a4", size: "105x74mm", outlines: false }));
    const js = build(n, measured, shop);
    const pdf = new TextDecoder("latin1").decode(nestingPdf(n, "K", "half_mm", undefined, { sheets: [js], prefs: shop.jobs }));
    const a4 = pdf.match(/MediaBox \[0 0 595\.28 841\.89\]/g)?.length ?? 0;
    expect(a4).toBeGreaterThanOrEqual(2);
  });

  it("hold-down defaults to 5 in (125 mm): the docs name drawer sides, 4 9/16 in, among the parts that need it most", () => {
    const n = nesting([sheet([part("7", "Drawer side", 0.02, 0.02, 4.5625 * IN, 20 * IN), part("1", "Side", 0.3, 0.02, 23.25 * IN, 34.5 * IN)])]);
    let js = build(n, { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "sixteenth");
    expect(js.parts.find((p) => p.name === "Drawer side")?.holdDown).toBe(true);
    expect(js.holdDown).toContain("5 in wide or narrower");
    js = build(n, { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "half_mm");
    expect(js.holdDown).toContain("125 mm wide or narrower");
  });
});
