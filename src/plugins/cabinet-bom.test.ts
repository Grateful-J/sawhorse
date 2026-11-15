// The cabinet generator's hardware for the shopping list: what rides on each part, counted as
// the planner counts it, with only the part numbers Blum prints (cabinet.js HARDWARE, the runner
// tables and the locking devices).
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, normalize, plan, PRESETS, RUNNERS, RUNNERS_EU, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";

type Bom = NonNullable<Part["bom"]>;
const IN = 0.0254;

/** Every part number the generator may name: the runner tables, the locking devices, and the
 * hinges, plates, screws and templates read from Blum's catalogues (cabinet.js HARDWARE). */
const KNOWN = new Set([
  ...[RUNNERS, RUNNERS_EU].flatMap((t) => Object.values(t).flatMap((r) => r.lengths.map((l) => l.part))),
  ...["T51.1901 R", "T51.1901 L", "T51.7601 R", "T51.7601 L", "T51.1700.04", "T51.7601"],
  ...["71B3550", "71B3750", "71T3550", "71T3750", "173L8100", "175L8100", "662.1150.HG", "606N", "609.1700", "T65.1600.01", "DB-2.5mm", "DB-6mm", "T65.1000.02", "T65.9000"],
]);

const built = (s: Sizes, metric = false) => {
  const p = plan(s, metric);
  expect(p.error).toBeNull();
  return p;
};
const bomOf = (parts: Part[], name: string): Bom => parts.find((p) => p.name === name)?.bom ?? [];
const find = (bom: Bom, re: RegExp) => bom.filter((b) => re.test(b.item));
/** The planner's hinge count for a door: the hinge cups it drills in it. */
const hingeRow = (rows: string[][], door: string) => rows.filter((r) => r[0] === door && r[1].startsWith("Hinge cup")).length;

describe("the generator's hardware", () => {
  it("every starting point, both catalogues and both runners: only part numbers Blum prints, every item one the kernel keeps", () => {
    for (const metric of [false, true]) {
      for (const catalog of ["us", "eu"] as const) {
        for (const slides of ["tandem", "movento"] as const) {
          for (const preset of PRESETS) {
            const s = normalize({ ...applyPreset(defaults(metric), preset.id, metric), catalog, slides }, metric);
            const p = plan(s, metric);
            if (p.error) continue;
            for (const part of p.parts) {
              for (const b of part.bom ?? []) {
                if (b.sku) expect(KNOWN.has(b.sku), `${part.name}: ${b.sku}`).toBe(true);
                expect(b.item.length).toBeGreaterThan(0);
                expect(b.item.length).toBeLessThanOrEqual(128);
                expect(b.item.trim()).toBe(b.item);
                expect(b.qty).toBeGreaterThan(0);
                if (b.unit !== "m") expect(Number.isInteger(b.qty)).toBe(true);
              }
              expect((part.bom ?? []).length).toBeLessThanOrEqual(32);
            }
          }
        }
      }
    }
  });

  it("each door carries the planner's own hinge count of hinges, plates and cup screws", () => {
    // The tall pantry: five hinges by Blum Inc.'s chart; a 36 in sink base: two doors of two or three.
    for (const id of ["tall", "sink", "base", "wall"]) {
      const p = built(applyPreset(defaults(false), id, false));
      for (const door of p.parts.filter((x) => /door$/i.test(x.name))) {
        const n = hingeRow(p.rows, door.name);
        expect(n, `${id} ${door.name}`).toBeGreaterThanOrEqual(2);
        const bom = door.bom!;
        expect(bom.find((b) => b.sku === "71B3550")!.qty).toBe(n);
        expect(bom.find((b) => b.sku === "173L8100")!.qty).toBe(n);
        expect(bom.find((b) => b.sku === "606N")!.qty).toBe(2 * n);
      }
    }
    expect(bomOf(built(applyPreset(defaults(false), "tall", false)).parts, "Door").find((b) => b.sku === "71B3550")!.qty).toBe(5);
  });

  it("the hinges follow the door: inset is full-cranked, self-closing on request; Blum Europe's plate is 175L8100 and its cup screw 609.1700", () => {
    const inset = built(normalize({ ...applyPreset(defaults(false), "base", false), front: "inset" }, false));
    expect(bomOf(inset.parts, "Door").map((b) => b.sku)).toContain("71B3750");
    // Review minor 3: the plate's holes are not drilled for an inset door, so it is named in words.
    expect(bomOf(inset.parts, "Door").some((b) => b.sku === "173L8100")).toBe(false);
    expect(find(bomOf(inset.parts, "Door"), /^Blum CLIP mounting plate for an inset door/)[0].qty).toBe(2);
    const self = built(normalize({ ...applyPreset(defaults(false), "base", false), hingeClose: "self" }, false));
    expect(bomOf(self.parts, "Door").map((b) => b.sku)).toContain("71T3550");
    const eu = built(applyPreset(defaults(true), "base", true), true);
    expect(bomOf(eu.parts, "Door").map((b) => b.sku)).toEqual(expect.arrayContaining(["71B3550", "175L8100", "609.1700"]));
    // With hardware holes off the door still needs its hinges.
    const off = built(normalize({ ...applyPreset(defaults(false), "base", false), hardware: false }, false));
    expect(bomOf(off.parts, "Door").find((b) => b.sku === "71B3550")!.qty).toBe(2);
    // ... but its plate holes are drilled by hand, so the plate is in words.
    expect(bomOf(off.parts, "Door").some((b) => b.sku === "173L8100")).toBe(false);
    expect(find(bomOf(off.parts, "Door"), /fixing to suit the holes you drill$/)[0].qty).toBe(2);
  });

  it("each drawer front carries its runner pair, a right and a left locking device and their screws; the template is bought once", () => {
    const p = built(applyPreset(defaults(false), "drawers", false));
    const fronts = p.parts.filter((x) => x.name === "Drawer front");
    expect(fronts.reduce((n, f) => n + f.copies.length, 0)).toBe(3);
    for (const f of fronts) {
      const bom = f.bom!;
      expect(bom.find((b) => b.sku === p.runner!.part)).toMatchObject({ qty: 1, unit: "pair" });
      expect(bom.find((b) => b.sku === "T51.1901 R")).toMatchObject({ qty: 1, unit: "each" });
      expect(bom.find((b) => b.sku === "T51.1901 L")).toMatchObject({ qty: 1, unit: "each" });
      expect(bom.find((b) => b.sku === "606N")!.qty).toBe(4);
      // One system screw per drilled runner hole: three a side.
      expect(bom.find((b) => b.sku === "662.1150.HG")!.qty).toBe(2 * p.runner!.screws.length);
      expect(bom.filter((b) => b.once).map((b) => b.sku)).toEqual(["T65.1600.01", "DB-2.5mm", "DB-6mm", "T65.9000"]);
    }
    // MOVENTO's own locking devices.
    const mov = built(normalize({ ...applyPreset(defaults(false), "drawers", false), slides: "movento" }, false));
    expect(bomOf(mov.parts, "Drawer front").map((b) => b.sku)).toEqual(expect.arrayContaining(["T51.7601 R", "T51.7601 L", "763H5330S"]));
    // Blum Europe: one number for both devices, the runner screws in words, the European template.
    const eu = built(applyPreset(defaults(true), "drawers", true), true);
    const bom = bomOf(eu.parts, "Drawer front");
    expect(bom.find((b) => b.sku === "T51.1700.04")).toMatchObject({ qty: 1, unit: "pair" });
    expect(bom.some((b) => b.sku === "662.1150.HG" || b.sku === "606N" || b.sku === "661.1450.HG")).toBe(false);
    expect(find(bom, /^Runner screw for a drilled 5 mm/)[0].qty).toBe(2 * eu.runner!.screws.length);
    expect(bom.filter((b) => b.once).map((b) => b.sku)).toEqual(["T65.1000.02", "T65.9000"]);
    // Inset drawers: the runner holes are not drilled here, so no count of system screws.
    const inset = built(normalize({ ...applyPreset(defaults(false), "drawers", false), front: "inset" }, false));
    const ib = bomOf(inset.parts, "Drawer front");
    expect(ib.some((b) => b.sku === "662.1150.HG")).toBe(false);
    expect(find(ib, /^Runner screws for a pair/)[0]).toMatchObject({ qty: 1, unit: "pair" });
  });

  it("four pins on each loose shelf, none on a fixed one; a pull and two screws where there is a pull", () => {
    const p = built(applyPreset(defaults(false), "wall", false));
    const shelf = p.parts.find((x) => x.name === "Shelf")!;
    expect(shelf.copies.length).toBe(2);
    expect(shelf.bom).toEqual([{ item: "5 mm shelf pins", qty: 4, unit: "each" }]);
    const fixed = built(normalize({ ...applyPreset(defaults(false), "wall", false), shelfType: "fixed" }, false));
    expect(bomOf(fixed.parts, "Shelf")).toEqual([]);
    const door = bomOf(p.parts, "Left door");
    expect(find(door, /^Pull, /)).toEqual([{ item: `Pull, 76.2 mm (3.000 in) hole centres`, qty: 1, unit: "each" }]);
    expect(find(door, /^Pull screw/)[0].qty).toBe(2);
    const none = built(normalize({ ...applyPreset(defaults(false), "wall", false), doorPull: "none" }, false));
    expect(find(bomOf(none.parts, "Left door"), /^Pull/)).toEqual([]);
    const notch = built(normalize({ ...applyPreset(defaults(false), "drawers", false), drawerPull: "notch" }, false));
    expect(find(bomOf(notch.parts, "Drawer front"), /^Pull/)).toEqual([]);
    // Parts without hardware carry none.
    expect(bomOf(p.parts, "Left side")).toEqual([]);
    expect(p.parts.find((x) => x.name === "Left side")!.bom).toBeUndefined();
    expect(IN).toBeGreaterThan(0);
  });

  it("a trash pull-out's bins ride on its front, in words with their sizes", () => {
    const one = built(applyPreset(defaults(false), "trash", false));
    expect(find(bomOf(one.parts, "Drawer front"), /^Waste bin/)).toEqual([{ item: "Waste bin, Rev-A-Shelf 50 qt (RV-50): rim 14.75 x 10.67 in, 21.75 in tall", qty: 1, unit: "each" }]);
    expect(bomOf(one.parts, "Drawer front").filter((b) => /^Waste bin/.test(b.item) && b.sku)).toEqual([]);
    const custom = built(normalize({ ...applyPreset(defaults(true), "trash", true), bin: "custom", trashBins: "deep" }, true), true);
    const bins = find(bomOf(custom.parts, "Drawer front"), /^Waste bin/);
    expect(bins.length).toBe(1);
    expect(bins[0].qty).toBe(2);
    expect(bins[0].item).toMatch(/cutout \(as measured\)$/);
    // No bins on an ordinary drawer.
    expect(find(bomOf(built(applyPreset(defaults(false), "drawers", false)).parts, "Drawer front"), /^Waste bin/)).toEqual([]);
  });
});
