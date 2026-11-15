// The independent review of feat/feeds (2026-11-14): one test per finding, each written to
// fail before its fix. C = critical, M = major, m = minor.
import { describe, expect, it } from "vitest";
import { CHART_FIGURES } from "./chipload";
import { COMPACT_ROUTER, SHAPEOKO_5_PRO_4X4 } from "./data";
import { computeFeeds, type MachineView, type Spindle } from "./feeds";
import { holeOf } from "./layers";
import { readTool, seedTools, type Tool } from "./tools";

const IN = 0.0254;
const MM = 0.001;
const shapeoko: MachineView = { id: SHAPEOKO_5_PRO_4X4.id, name: "Shapeoko", feedWarn: { ipm: 200, sourced: SHAPEOKO_5_PRO_4X4.feedWarn }, maxShank: null };
const shop: Spindle = { router: COMPACT_ROUTER, table: COMPACT_ROUTER.tables[0], rpm: null };
const [compression, downcut, endmill] = seedTools();
const tool = (over: Partial<Tool>): Tool => ({ ...compression, from: {}, ...over });
type Args = Parameters<typeof computeFeeds>;
const run = (t: Tool, m: Args[1], op: Args[2], opts: Args[5] = {}, spindle = shop, machine = shapeoko) => computeFeeds(t, m, op, machine, spindle, opts);
const w = (r: ReturnType<typeof computeFeeds>, id: string) => r.warnings.find((x) => x.id === id);

describe("C1: with no first pass typed, the depth per pass is the first pass", () => {
  it("1/8 in and 0.03 in a pass with the Amana 46170 in 18 mm laminate-faced Baltic birch: Stop", () => {
    for (const d of [0.125, 0.03]) {
      const r = run(compression, "laminate-bb", "profile", { thickness: 18 * MM, depth: d * IN });
      expect(w(r, "compression-first-pass")?.level, `${d} in`).toBe("stop");
      expect(w(r, "compression-first-pass")!.text).toContain("depth per pass");
    }
  });

  it("a depth per pass deeper than the up-cut part, or a first pass typed, is not stopped", () => {
    expect(w(run(compression, "laminate-bb", "profile", { thickness: 18 * MM, depth: 0.3 * IN }), "compression-first-pass")).toBeUndefined();
    expect(w(run(compression, "laminate-bb", "profile", { thickness: 18 * MM, depth: 0.125 * IN, firstPass: 0.3 * IN }), "compression-first-pass")).toBeUndefined();
  });

  it("the first pass's feed is checked against the machine's limit", () => {
    // Later passes at 2.4 × D (50% off) stay under 200 IPM at dial 6; a 0.3 in first pass, at 75%, does not.
    const r = run(compression, "mdf", "profile", { depth: 0.6 * IN, firstPass: 0.3 * IN, dial: 6 });
    expect(r.feedIpm!).toBeLessThanOrEqual(200);
    expect(r.firstPass!.feedIpm!).toBeGreaterThan(200);
    expect(w(r, "feed")?.text).toContain("first pass");
    // When the later passes are over the limit too, one warning says it.
    expect(run(compression, "mdf", "profile", { dial: 6 }).warnings.filter((x) => x.id === "feed")).toHaveLength(1);
  });

  it("the first pass's chipload is checked for rubbing: a 1/8 in compression bit's first pass at .00055", () => {
    // Its first pass (0.2856 in, over 2 × D) takes 50% off: .001 × 0.5, under the 0.001 floor.
    const r = run(tool({ diameter: 0.125 * IN }), "baltic-birch", "profile");
    expect(w(r, "rubbing")?.text).toContain("first pass");
  });
});

describe("M1: a compression bit in a pocket with no depth typed", () => {
  it("asks for the depth, and says dados shallower than the up-cut part want the down-cut", () => {
    const x = w(run(compression, "laminate-bb", "pocket"), "compression-depth-unknown")!;
    expect(x.level).toBe("caution");
    expect(x.text).toContain("down-cut");
    expect(w(run(compression, "laminate-bb", "pocket", { cutDepth: 12 * MM }), "compression-depth-unknown")).toBeUndefined();
    expect(w(run(downcut, "laminate-bb", "pocket"), "compression-depth-unknown")).toBeUndefined();
  });
});

describe("M2: bits with no §8a row follow the report's rules, and say which", () => {
  it("a 1/8 in bit starts at half Amana's printed figure (§8b): a 1/8 in down-cut in Baltic birch is .002, 73 IPM", () => {
    const r = run(tool({ type: "downcut", diameter: 0.125 * IN, upcut: null, upcutTol: null }), "baltic-birch", "pocket");
    expect(r.start?.chipload).toBeCloseTo(0.002, 12);
    expect(Math.round(r.feedIpm!)).toBe(73);
    expect(r.start?.why).toContain("§8b");
  });

  it("half is not taken below the 0.001 rubbing floor: a 1/8 in compression bit in Baltic birch starts at .001", () => {
    // Half of Amana's .0011 would be .00055: the floor keeps it at .001.
    const r = run(tool({ diameter: 0.125 * IN }), "baltic-birch", "profile");
    expect(r.start?.chipload).toBeCloseTo(0.001, 12);
    expect(r.start?.why).toContain("floor");
    const d = run(tool({ type: "downcut", diameter: 0.125 * IN, flutes: 3 }), "baltic-birch", "pocket");
    expect(d.start?.why).toContain("§8b");
  });

  it("a 1/4 in end mill runs at the dial §8a uses for the matching row: Baltic birch at dial 2, 135 IPM", () => {
    const r = run(tool({ type: "endmill", upcut: null, upcutTol: null }), "baltic-birch", "pocket");
    expect(r.start?.chipload).toBe(0.005);
    expect(r.dial?.dial).toBe(2);
    expect(Math.round(r.feedIpm!)).toBe(135);
    expect(r.start?.why).toContain("§8a");
    expect(r.start?.why).toContain("dial");
  });

  it("every starting value says which rule of the report it follows", () => {
    const tools = [compression, downcut, endmill, tool({ type: "endmill" }), tool({ type: "downcut", flutes: 3 }), tool({ type: "upcut", diameter: 0.125 * IN }), tool({ flutes: 1 })];
    for (const t of tools) for (const m of ["mdf", "baltic-birch", "hpl-mdf"] as const) {
      const r = run(t, m, "profile");
      if (r.start) expect(r.start.why, `${t.type} ${t.diameter} ${t.flutes} ${m}`).toMatch(/§8[ab]/);
    }
  });
});

describe("M3: a down-cut through a laminate-faced sheet chips its underside", () => {
  it("a Check for a down-cut profile in laminate, not for a pocket or raw MDF", () => {
    expect(w(run(downcut, "laminate-bb", "profile"), "downcut-underside")?.level).toBe("caution");
    expect(w(run(downcut, "melamine-mdf", "profile"), "downcut-underside")!.text).toContain("compression");
    expect(w(run(downcut, "laminate-bb", "pocket"), "downcut-underside")).toBeUndefined();
    expect(w(run(downcut, "mdf", "profile"), "downcut-underside")).toBeUndefined();
  });
});

describe("M4: the chipload is checked against the bit's own maker, or the most conservative one", () => {
  it("185 IPM at dial 2 is .0069 a tooth, 2.2 × Amana's .0031 for the Amana 46170: a Check", () => {
    const r = run(compression, "baltic-birch", "profile", { dial: 2, feedIpm: 185 });
    const x = w(r, "chipload-high")!;
    expect(x.text).toContain("Amana");
    expect(w(run(compression, "baltic-birch", "profile", { feedIpm: 18250 * 2 * 0.0031 }), "chipload-high")).toBeUndefined();
  });

  it("a bit of unknown make is checked against the most conservative maker's maximum, named", () => {
    const r = run(tool({ maker: null, name: "some compression bit" }), "baltic-birch", "profile", { dial: 2, feedIpm: 185 });
    expect(w(r, "chipload-high")!.text).toContain("most conservative");
    expect(w(r, "chipload-high")!.text).toContain("Amana");
  });
});

describe("M5: the reason a start is under the makers' comes from its own row", () => {
  it("HPL: the derived 0.70 ratio at medium confidence, not a light machine", () => {
    const t = w(run(compression, "hpl-mdf", "profile"), "chipload-low")!.text;
    expect(t).toContain("0.70");
    expect(t).toContain("medium");
    expect(t).not.toContain("light machine");
  });

  it("the 1/8 in end mill: the e-book's range, low confidence", () => {
    const t = w(run(endmill, "baltic-birch", "profile"), "chipload-low")!.text;
    expect(t).toContain("low confidence");
  });
});

describe("M6: a feed's sources are its inputs', and its confidence the lowest of them", () => {
  it("compression in Baltic birch: Amana's chipload and Carbide's shop page, high", () => {
    const r = run(compression, "baltic-birch", "profile");
    expect(r.feedFrom.map((f) => f.src)).toEqual(expect.arrayContaining(["amana-a1", "ccr-shop"]));
    expect(r.feedConfidence).toBe("high");
  });

  it("the 1/8 in end mill is low, HPL medium, a staff-chart dial medium, a pass over 1 × D adds the derate", () => {
    expect(run(endmill, "baltic-birch", "profile").feedConfidence).toBe("low");
    expect(run(compression, "hpl-mdf", "profile").feedConfidence).toBe("medium");
    expect(run(compression, "baltic-birch", "profile", {}, { ...shop, table: COMPACT_ROUTER.tables[1] }).feedConfidence).toBe("medium");
    expect(run(compression, "baltic-birch", "profile", { depth: 0.3 * IN }).feedFrom.map((f) => f.src)).toContain("amana-charts");
  });

  it("an RPM you typed is yours, with no source", () => {
    const r = run(compression, "baltic-birch", "profile", {}, { router: null, table: null, rpm: 18000 });
    expect(r.feedFrom.some((f) => f.src === null)).toBe(true);
  });
});

describe("minor findings", () => {
  it("an up-cut bit on a laminate top face is a Stop (§8a: never); an end mill is a Check", () => {
    expect(w(run(tool({ type: "upcut" }), "laminate-bb", "profile"), "upcut-face")?.level).toBe("stop");
    expect(w(run(endmill, "melamine-mdf", "hole", { hole: holeOf("DRILL_D5MM_10MM")! }), "upcut-face")?.level).toBe("caution");
    expect(w(run(endmill, "mdf", "profile"), "upcut-face")).toBeUndefined();
  });

  it("the rubbing floor: 0.001, which may drop to 0.0005 for 1/8 in and smaller", () => {
    const e = tool({ type: "endmill", diameter: 0.125 * IN });
    expect(w(run(e, "baltic-birch", "profile", { feedIpm: 18250 * 2 * 0.0007 }), "rubbing")?.level).toBe("caution");
    expect(w(run(e, "baltic-birch", "profile", { feedIpm: 18250 * 2 * 0.0004 }), "rubbing")?.level).toBe("stop");
    expect(w(run(compression, "baltic-birch", "profile", { feedIpm: 18250 * 2 * 0.0009 }), "rubbing")?.level).toBe("stop");
  });

  it("a dial outside the router's stated range says so, picked or chosen", () => {
    const hand = run(compression, "baltic-birch", "profile", { dial: 1 });
    expect(hand.notes.some((n) => n.text.includes("12,000–30,000"))).toBe(true);
    expect(run(compression, "baltic-birch", "profile", { dial: 6 }).notes.some((n) => n.text.includes("12,000–30,000"))).toBe(true);
    expect(run(compression, "baltic-birch", "profile").notes.some((n) => n.text.includes("12,000–30,000"))).toBe(false);
  });

  it("Amana's Spektra figures count only for a Spektra bit", () => {
    const plain = run(tool({ flutes: 3, name: "1/4 in 3-flute compression" }), "baltic-birch", "profile");
    expect(plain.makerFigures.map((f) => f.src)).not.toContain("amana-a2");
    expect(plain.start?.from.src).not.toBe("amana-a2");
    const spektra = run(tool({ flutes: 3, name: "Amana 46700-K Spektra" }), "baltic-birch", "profile");
    expect(spektra.makerFigures.map((f) => f.src)).toContain("amana-a2");
  });

  it("another router with no shank limit typed: the shank is a Check", () => {
    expect(w(run(compression, "baltic-birch", "profile", {}, { router: null, table: null, rpm: 18000 }), "shank-unknown")?.level).toBe("caution");
  });

  it("a Forstner or hinge bit is caught by more names", () => {
    for (const name of ["Blum 35mm cup bit", "hinge bit", "35 mm boring", "FORSTNER 1-3/8", "Cup cutter"]) {
      expect(w(run(tool({ name, type: "endmill" }), "baltic-birch", "hole", { hole: holeOf("DRILL_D35MM_13MM")! }), "hinge-bit"), name).toBeDefined();
    }
    expect(w(run(endmill, "baltic-birch", "hole", { hole: holeOf("DRILL_D5MM_10MM")! }), "hinge-bit")).toBeUndefined();
  });

  it("a sheet thinner than the up-cut part: the down-cut it recommends can chip the bottom face", () => {
    expect(w(run(compression, "laminate-bb", "profile", { thickness: 6 * MM }), "compression-first-pass")!.text).toContain("bottom face");
  });

  it("storage applies the tool limits, and drops a seed's source when the value is not the seed's", () => {
    expect(readTool({ ...seedTools()[0], diameter: 0.25 })).toBeNull();
    const t = readTool({ ...seedTools()[0], diameter: 0.0127 })!;
    expect(t.from?.diameter).toBeUndefined();
    expect(t.from?.upcut).toBe("amana-a5");
  });
});

describe("mutations the first tests let through", () => {
  it("ramp = feed ÷ flutes: a 1-flute bit ramps at its feed", () => {
    const r = run(tool({ flutes: 1 }), "mdf", "profile");
    expect(r.rampIpm).toBe(r.feedIpm);
    expect(run(tool({ flutes: 3 }), "mdf", "profile").rampIpm).toBeCloseTo(run(tool({ flutes: 3 }), "mdf", "profile").feedIpm! / 3, 12);
  });

  it("the exact boundary: a cut of the up-cut length plus its tolerance is not deeper", () => {
    const at = compression.upcut! + compression.upcutTol!;
    expect(w(run(compression, "baltic-birch", "pocket", { cutDepth: at }), "compression-first-pass")).toBeDefined();
    expect(w(run(compression, "baltic-birch", "pocket", { cutDepth: at + 1e-6 }), "compression-first-pass")).toBeUndefined();
  });

  it("every chart figure is the report's, digit for digit", () => {
    const got = CHART_FIGURES.map((f) => `${f.src} ${f.bit} ${f.flutes ?? "-"} ${f.dia}${f.diaUnit} ${f.column}: ${f.min}-${f.max} ${f.unit}`);
    expect(got).toEqual([
      "amana-a1 1-flute compression 1 0.125in Plywood: 0.0031-0.0031 in/tooth",
      "amana-a1 1-flute compression 1 0.125in MDF/Laminate: 0.0062-0.0062 in/tooth",
      "amana-a1 1-flute compression 1 0.25in Plywood: 0.0031-0.0031 in/tooth",
      "amana-a1 1-flute compression 1 0.25in MDF/Laminate: 0.0062-0.0062 in/tooth",
      "amana-a1 2-flute compression 2 0.125in Plywood: 0.0011-0.0011 in/tooth",
      "amana-a1 2-flute compression 2 0.125in MDF/Laminate: 0.0022-0.0022 in/tooth",
      "amana-a1 2-flute compression 2 0.25in Plywood: 0.0031-0.0031 in/tooth",
      "amana-a1 2-flute compression 2 0.25in MDF/Laminate: 0.0061-0.0061 in/tooth",
      "amana-a2 Spektra compression 2 0.125in Baltic plywood: 0.004-0.004 in/tooth",
      "amana-a2 Spektra compression 2 0.25in Baltic plywood: 0.004-0.005 in/tooth",
      "amana-a2 Spektra compression 3 0.25in Baltic plywood: 0.005-0.005 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 2 0.125in Wood/Plywood: 0.004-0.004 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 2 0.125in MDF/Laminate: 0.005-0.005 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 2 0.25in Wood/Plywood: 0.005-0.005 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 2 0.25in MDF/Laminate: 0.006-0.006 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 3 0.25in Wood/Plywood: 0.005-0.005 in/tooth",
      "amana-a4 Up-cut / down-cut spiral 3 0.25in MDF/Laminate: 0.006-0.006 in/tooth",
      "onsrud-o1 52-200 / 57-200 up/down spiral - 0.125in MDF: 0.005-0.007 in/tooth",
      "onsrud-o1 52-200 / 57-200 up/down spiral - 0.25in MDF: 0.006-0.008 in/tooth",
      "onsrud-o1 60-100 compression - 0.125in MDF: 0.01-0.012 in/tooth",
      "onsrud-o1 60-100 compression - 0.25in MDF: 0.013-0.015 in/tooth",
      "onsrud-o2 60-100 compression - 0.125in Hard plywood: 0.012-0.018 in/tooth",
      "onsrud-o2 60-100 compression - 0.25in Hard plywood: 0.014-0.016 in/tooth",
      "onsrud-o3 60-100 compression - 0.125in Laminated plywood: 0.013-0.015 in/tooth",
      "onsrud-o3 60-100 compression - 0.25in Laminated plywood: 0.015-0.017 in/tooth",
      "onsrud-o4 60-100 compression - 0.125in Laminated chipboard: 0.013-0.015 in/tooth",
      "onsrud-o4 60-100 compression - 0.25in Laminated chipboard: 0.015-0.017 in/tooth",
      "crs-melamine Single-flute compression (Onsrud, relayed) 1 0.125in Particleboard core: 0.013-0.015 in/tooth",
      "crs-melamine Single-flute compression (Onsrud, relayed) 1 0.25in Particleboard core: 0.017-0.019 in/tooth",
      "freud Solid carbide bit - 0.125in MDF / particleboard: 0.004-0.007 in/tooth",
      "freud Solid carbide bit - 0.125in Laminated particleboard: 0.003-0.006 in/tooth",
      "freud Solid carbide bit - 0.125in Plywood: 0.003-0.005 in/tooth",
      "freud Solid carbide bit - 0.25in MDF / particleboard: 0.013-0.017 in/tooth",
      "freud Solid carbide bit - 0.25in Laminated particleboard: 0.01-0.015 in/tooth",
      "freud Solid carbide bit - 0.25in Plywood: 0.006-0.009 in/tooth",
      "rennie Up-cut / down-cut spiral - 3.175mm Soft plywood: 0.102-0.153 mm/tooth",
      "rennie Up-cut / down-cut spiral - 3.175mm MDF / particleboard: 0.102-0.178 mm/tooth",
      "rennie Up-cut / down-cut spiral - 3.175mm High-pressure laminate: 0.076-0.127 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6mm Soft plywood: 0.27-0.32 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6mm MDF / particleboard: 0.32-0.396 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6mm High-pressure laminate: 0.219-0.294 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6.35mm Soft plywood: 0.279-0.33 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6.35mm MDF / particleboard: 0.33-0.406 mm/tooth",
      "rennie Up-cut / down-cut spiral - 6.35mm High-pressure laminate: 0.229-0.305 mm/tooth",
      "atoz Any end mill (Shapeoko) - 0.125in Soft wood: 0.001-0.0025 in/tooth",
      "atoz Any end mill (Shapeoko) - 0.25in Soft wood: 0.001-0.005 in/tooth",
    ]);
  });
});
