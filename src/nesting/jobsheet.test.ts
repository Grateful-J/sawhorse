// A sheet's job sheet and its part labels without the kernel: the narrowest place in a shape,
// the bit-fit check against measured widths (the metric 6.2 mm groove against a 1/4 in bit),
// the cut order and its tool changes, the hold-down width, which face is up, the label grid,
// the text file's name and the booklet's pages. The real cabinets go through the kernel in
// jobsheet.wasm.test.ts.
import { describe, expect, it } from "vitest";
import type { Nesting, Placement, StockPiece } from "../kernel/types";
import { defaultShop, type Shop } from "../cam/store";
import { readJobs } from "../cam/jobs";
import { readPdf } from "../cutlist/pdf";
import { nestingDxf } from "./dxf";
import type { BlankFeatures, MachineDrill, MachineLoop } from "./machine";
import type { MeasuredNest } from "./measure";
import { cncSaveMessage } from "./exportGuard";
import { nestingPdf } from "./booklet";
import { faceUp, jobFileName, jobSheet, jobSheetText, narrowestWidth, type JobSheet } from "./jobsheet";
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
  it("the metric 6.2 mm groove against a 1/4 in bit is flagged, and the smallest bit that fits is named", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.jobs.tools.narrow = null)));
    const groove = js.layers.find((l) => l.name === "POCKET_6MM")!;
    expect(groove.narrowest?.width).toBeCloseTo(6.2 * MM, 9);
    expect(groove.narrowest?.tag).toBe("12a");
    expect(groove.tool?.id).toBe("seed-downcut");
    expect(groove.fits).toBe(false);
    expect(groove.fitNotes.join(" ")).toContain("6.20 mm");
    expect(groove.fitNotes.join(" ")).toContain("The smallest bit in your library that fits: 1/8 in end mill");
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
    // A hole with no bit: named, and left out of the cut order.
    expect(js.unordered).toEqual(expect.arrayContaining(["DRILL_D5MM_13MM", "DRILL_D6MM_10MM"]));
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

  it("no profile bit chosen: said so, and the profile is left out of the order", () => {
    const { n, measured } = drawerSheet();
    const js = build(n, measured, shopWith((s) => (s.profileTool = null)));
    const p = js.layers.find((l) => l.name === "PROFILE_THRU")!;
    expect(p.tool).toBeNull();
    expect(p.toolWhy).toContain("no profile bit is chosen");
    expect(js.unordered).toContain("PROFILE_THRU");
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
    const em = js.order.find((s) => s.tool.id === "seed-endmill")!;
    expect(em.layers.sort()).toEqual(["DRILL_D5MM_10MM", "POCKET_7.94MM"]);
    // End mill, down-cut, then the compression bit for the cutout and the profile: 2 changes.
    expect(js.changes).toBe(2);
    expect(js.order.filter((s) => s.change)).toHaveLength(2);
  });

  it("the bits are ordered so the last one before the cutouts is the cutouts' own", () => {
    const { n, measured } = carcass();
    // Cutouts with the end mill: down-cut first, then the end mill runs on into the cutout.
    const js = build(n, measured, shopWith((s) => (s.jobs.tools.cutout = "seed-endmill")), "sixteenth");
    expect(js.order.map((s) => [s.tool.id, s.phase])).toEqual([
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

  it("Sawhorse's default is 4 in: a 3 in nailer and a 4 in stretcher are flagged, 4 1/8 in is not", () => {
    const js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "sixteenth");
    expect(js.parts.map((p) => p.tag)).toEqual(["7", "5", "8", "1"]);
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer", "Stretcher"]);
    expect(js.holdDown).toContain("4 in wide or narrower");
    expect(js.holdDown).toContain("Sawhorse's default, not a standard");
  });

  it("in a metric document the default is 100 mm, and a width typed in CNC setup wins", () => {
    let js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith(() => {}), "half_mm");
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer"]);
    expect(js.holdDown).toContain("100 mm wide or narrower");
    js = build(parts(), { features: new Map(), skipped: [], flipped: [] }, shopWith((s) => (s.jobs.holdDown = 4.2 * IN)), "sixteenth");
    expect(js.parts.filter((p) => p.holdDown).map((p) => p.name)).toEqual(["Nailer", "Stretcher", "Rail"]);
    expect(js.holdDown).not.toContain("Sawhorse's default");
  });
});

describe("which face is up on the router, from the part's measured cuts", () => {
  it("a door: its back, where the hinge cups are; a carcass part: the face with its dados and holes", () => {
    expect(faceUp(feat({ drills: [hole(0.1, 0.1, 35 * MM, 13 * MM), hole(0.1, 0.3, 4.76 * MM, 18 * MM, true)] }), true)).toMatch(/^Back face up: its 35 mm hinge cups/);
    expect(faceUp(feat({ pockets: [pocket(rect(0, 0, 0.1, 0.02), 6.35 * MM)] }), true)).toMatch(/^The face with its dados, grooves and holes up \(on a carcass part, the inside face\)/);
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
    expect(labels[0].faceUp).toMatch(/inside face/);
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
    const full = readPdf(nestingPdf(n, "Kitchen", "half_mm", { sheets: [js], prefs: shop.jobs }));
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

describe("the text file beside each DXF", () => {
  it("has the DXF's name with job.txt for .dxf, so the two sort together", () => {
    expect(jobFileName("Kitchen 02 sheet 1 of 2 - Base 1 Left side - 4 x 4 sheet, 3-4 - profile CNC.dxf")).toBe("Kitchen 02 sheet 1 of 2 - Base 1 Left side - 4 x 4 sheet, 3-4 - profile CNC job.txt");
  });

  it("names its DXF and label, says to measure the thickness, and has a tick box per layer", () => {
    const { n, measured } = drawerSheet();
    const js: JobSheet = build(n, measured, shopWith(() => {}));
    const text = jobSheetText(js, "Kitchen");
    expect(text).toContain("Kitchen 1 sheet 1 of 1 - x CNC.dxf");
    expect(text).toContain("1. Sheet 1 of 1 - 1220 x 1220 sheet, 12 mm - Drawer box plywood");
    expect(text).toContain("12 mm is only what was entered for the stock, not a measurement");
    expect(text).toContain("1220 x 1220 mm (X by Y)");
    for (const l of js.layers) expect(text).toContain(`[ ] ${l.name}`);
    expect(text.split("\n").every((l) => l.length <= 92 || !l.includes(" "))).toBe(true);
  });

  it("the status line says each file has its job sheet, or how many do", () => {
    expect(cncSaveMessage({ saved: 3, total: 3, stoppedAt: null, hand: null, sawSheets: 0, jobs: 3 }, [])).toContain("Each has its job sheet beside it (the same name, ending in job.txt).");
    expect(cncSaveMessage({ saved: 2, total: 3, stoppedAt: "x job.txt", hand: null, sawSheets: 0, jobs: 1 }, [])).toContain("1 of their 2 job sheets was saved.");
  });
});
