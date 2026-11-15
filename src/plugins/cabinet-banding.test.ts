// Edge banding in the cabinet generator: the part is designed at its finished size, each banded
// edge's blank is cut short by its band, and every cut stays where it is in the finished part.
// These tests prove it on the plugin's own meshes; cabinet-banding.wasm.test.ts proves it again
// through the kernel, the cut list and the DXF.
import { describe, expect, it } from "vitest";
import { applyPreset, BAND, bandClash, bandFor, bandList, bandPart, defaults, EDGE_AXES, END_NOTCH, plan, PRESETS, WEB, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { pack, unpack } from "../../plugins/cabinet-generator/keep.js";
import { testCut } from "../../plugins/cabinet-generator/testcuts.js";
import { boxOf, cutKeys, cutsDiffer, holeCentres, meshFaces, overlap, type P3 } from "./bandingProof";

const IN = 0.0254;
const MM = 0.001;
const SIZES = ["0.018in", "1", "2", "3"] as const;
const THICK = { "0.018in": 0.018 * IN, "1": 1 * MM, "2": 2 * MM, "3": 3 * MM };

/** Every starting point in both units, overlay and inset, Blum Inc. and Blum Europe. The boring
 * distance is 6 mm, so a 3 mm band on the doors keeps 3 mm of wood beside the cup. */
function* matrix(): Generator<{ label: string; s: Sizes; metric: boolean }> {
  for (const metric of [false, true]) {
    for (const p of PRESETS) {
      for (const front of ["overlay", "inset"] as const) {
        for (const catalog of ["us", "eu"] as const) {
          const s: Sizes = { ...applyPreset(defaults(metric), p.id, metric), front, catalog, cupDistance: 6 * MM };
          yield { label: `${p.id} ${metric ? "mm" : "in"} ${front} ${catalog}`, s, metric };
        }
      }
    }
  }
}

/** Each copy, by its name: its part and where it is. */
function copies(parts: Part[]) {
  const out = new Map<string, { part: Part; at: P3 }>();
  for (const p of parts) for (const c of p.copies) out.set(c.name ?? p.name, { part: p, at: c.at as P3 });
  return out;
}

/** The edges a copy is banded on, by its name, with every kind banded: decided here, not read
 * from the planner. Doors and drawer fronts all round; the sides, the top, the bottom, the front
 * stretcher and every shelf at the front; nothing else (the rear stretcher, the back, the toe
 * kick, nailers, drawer boxes, the bin frame). */
function expectedEdges(name: string): (keyof typeof EDGE_AXES)[] {
  if (/door$/i.test(name) || /^Drawer \d+ front$/.test(name)) return ["left", "right", "bottom", "top"];
  if (["Left side", "Right side", "Top", "Bottom", "Front stretcher"].includes(name) || /^Shelf \d+$/.test(name)) return ["front"];
  return [];
}

const worldBox = (part: Part, at: P3) => boxOf(meshFaces(part.mesh as never, at).flatMap((f) => f.points));

describe("edge banding: geometry", () => {
  it("every hole, dado and notch is where it is unbanded, in every preset, unit, mounting and catalogue, with bands of 0.018 in, 1, 2 and 3 mm", () => {
    let compared = 0;
    let cuts = 0;
    let holes = 0;
    for (const { label, s, metric } of matrix()) {
      const plain = plan(s, metric);
      expect(plain.error, label).toBeNull();
      const before = copies(plain.parts);
      for (const size of SIZES) {
        const banded = plan({ ...s, band: true, band1Size: size }, metric);
        expect(banded.error, `${label} ${size}`).toBeNull();
        const after = copies(banded.parts);
        expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
        for (const [name, b] of after) {
          const a = before.get(name)!;
          const fa = meshFaces(a.part.mesh as never, a.at);
          const fb = meshFaces(b.part.mesh as never, b.at);
          const clip = overlap(boxOf(fa.flatMap((f) => f.points)), boxOf(fb.flatMap((f) => f.points)));
          const ka = cutKeys(fa, clip);
          expect(cutsDiffer(ka, cutKeys(fb, clip)), `${label} ${size} ${name}`).toBeNull();
          // Never compared blank: a part with cuts (more than a box's eight corners) has keys.
          if (a.part.mesh.positions.length > 8) expect(ka.length, `${label} ${name}`).toBeGreaterThan(0);
          // Every hole, read from its own ring, at its unbanded place on both axes of its face.
          const ha = holeCentres(fa);
          expect(cutsDiffer(ha, holeCentres(fb)), `${label} ${size} ${name} holes`).toBeNull();
          cuts += ka.length;
          holes += ha.length;
          compared++;
        }
      }
    }
    // 64 cabinets, four bands each, every part of each.
    expect(compared).toBeGreaterThan(3000);
    expect(cuts).toBeGreaterThan(100_000);
    expect(holes).toBeGreaterThan(9_000);
  });

  it("the comparison sees each part's cuts and holes: the counts of two cabinets, part by part", () => {
    // Faces off the part's box (cutKeys), then hole rings (holeCentres), from the real data. A
    // proof that read nothing would read 0 here.
    const want = {
      base: { Door: [66, 6], "Left side": [211, 14], "Right side": [143, 10], "Front stretcher": [4, 0], "Rear stretcher": [3, 0], Bottom: [17, 0], "Shelf 1": [0, 0], Back: [0, 0], "Toe kick": [0, 0] },
      mixed: { "Left door": [66, 6], "Right door": [66, 6], "Drawer 1 front": [32, 4], "Drawer 1 left": [3, 0], "Drawer 1 right": [3, 0], "Drawer 1 sub-front": [3, 0], "Drawer 1 back": [34, 2], "Drawer 1 bottom": [0, 0], "Left side": [143, 10], "Right side": [143, 10], "Front stretcher": [4, 0], "Rear stretcher": [3, 0], Bottom: [17, 0], "Shelf 1": [0, 0], Back: [0, 0], "Toe kick": [0, 0] },
    };
    for (const [id, metric, front, catalog] of [["base", false, "overlay", "us"], ["mixed", true, "inset", "eu"]] as const) {
      const s = { ...applyPreset(defaults(metric), id, metric), front, catalog, cupDistance: 6 * MM };
      const before = copies(plan(s, metric).parts);
      const got: Record<string, number[]> = {};
      for (const [name, b] of copies(plan({ ...s, band: true }, metric).parts)) {
        const a = before.get(name)!;
        const fa = meshFaces(a.part.mesh as never, a.at);
        const fb = meshFaces(b.part.mesh as never, b.at);
        const clip = overlap(boxOf(fa.flatMap((f) => f.points)), boxOf(fb.flatMap((f) => f.points)));
        got[name] = [cutKeys(fb, clip).length, holeCentres(fb).length];
      }
      expect(got, id).toEqual(want[id]);
    }
  });

  it("each banded part's blank plus its bands is the unbanded part, on exactly the edges it should be; the rest are untouched", () => {
    for (const { label, s, metric } of matrix()) {
      const before = copies(plan(s, metric).parts);
      for (const size of SIZES) {
        const b = THICK[size];
        const after = copies(plan({ ...s, band: true, band1Size: size }, metric).parts);
        for (const [name, { part, at }] of after) {
          const was = before.get(name)!;
          const want = worldBox(was.part, was.at);
          const got = worldBox(part, at);
          const edges = expectedEdges(name);
          // A banded part says so, and says what it is finished: the unbanded part.
          if (edges.length) {
            expect(part.finished, `${label} ${name}`).toEqual(was.part.blank);
            expect(part.bands!.map((e) => e.edge).sort(), `${label} ${name}`).toEqual([...edges].sort());
            expect(part.bands!.every((e) => e.thickness === b)).toBe(true);
          } else {
            expect(part.bands, `${label} ${name}`).toBeUndefined();
            expect(part.blank).toEqual(was.part.blank);
          }
          for (let k = 0; k < 3; k++) {
            const lo = edges.some((e) => EDGE_AXES[e][0] === k && EDGE_AXES[e][1] === 0) ? b : 0;
            const hi = edges.some((e) => EDGE_AXES[e][0] === k && EDGE_AXES[e][1] === 1) ? b : 0;
            expect(got.min[k] - lo, `${label} ${size} ${name} min ${k}`).toBeCloseTo(want.min[k], 9);
            expect(got.max[k] + hi, `${label} ${size} ${name} max ${k}`).toBeCloseTo(want.max[k], 9);
            expect(part.blank[k] + lo + hi).toBeCloseTo(was.part.blank[k], 9);
          }
          // The grain is the part's, banded or not.
          expect(part.grain, `${label} ${name}`).toBe(was.part.grain);
        }
      }
    }
  });

  it("an edgebander's pre-mill makes the blank that much larger on each banded edge, every cut still in place", () => {
    for (const metric of [false, true]) {
      for (const id of ["base", "mixed", "drawers", "wall"]) {
        const s = { ...applyPreset(defaults(metric), id, metric), cupDistance: 6 * MM };
        const before = copies(plan(s, metric).parts);
        // Less than the band, as much, and more (the blank is then larger than the part).
        for (const premill of [0.5 * MM, 1 * MM, 2 * MM]) {
          const after = copies(plan({ ...s, band: true, bandPremill: premill }, metric).parts);
          for (const [name, { part, at }] of after) {
            const was = before.get(name)!;
            const want = worldBox(was.part, was.at);
            const got = worldBox(part, at);
            const off = 1 * MM - premill;
            for (const e of expectedEdges(name)) {
              const [k, hi] = EDGE_AXES[e];
              if (hi) expect(got.max[k] + off).toBeCloseTo(want.max[k], 9);
              else expect(got.min[k] - off).toBeCloseTo(want.min[k], 9);
            }
            const fa = meshFaces(was.part.mesh as never, was.at);
            const fb = meshFaces(part.mesh as never, at);
            const clip = overlap(boxOf(fa.flatMap((f) => f.points)), boxOf(fb.flatMap((f) => f.points)));
            expect(cutsDiffer(cutKeys(fa, clip), cutKeys(fb, clip)), `${id} ${premill} ${name}`).toBeNull();
          }
        }
      }
    }
  });

  it("a band thicker than the pre-mill takes the notch at a banded edge's end with it: the rail's tongues and the side's toe kick", () => {
    const s = { ...applyPreset(defaults(false), "base", false), band: true, band1Size: "2" as const };
    const p = plan(s, false);
    const side = p.parts.find((x) => x.name === "Left side")!;
    // The side's front edge is banded from the toe kick's notch to its top.
    expect(side.bands![0].span[0]).toBeCloseTo(s.toeKick, 12);
    expect(side.bands![0].length).toBeCloseTo(s.height - s.toeKick, 12);
    // The bottom's front edge between the sides: its tongues are notched, so only the opening shows.
    const bottom = p.parts.find((x) => x.name === "Bottom")!;
    expect(bottom.bands![0].length).toBeCloseTo(s.width - 2 * s.thickness, 12);
  });
});

describe("edge banding off changes nothing", () => {
  it("off, every band setting is ignored: the plan is the same to the byte, meshes and rows", () => {
    for (const { label, s, metric } of matrix()) {
      const base = JSON.stringify(plan(s, metric));
      const fiddled: Sizes = { ...s, band: false, bandCount: 3, band1Size: "3", band2Size: "custom", band2Thick: 5 * MM, band1Name: "Oak", bandFronts: "2", bandCarcass: "3", bandShelves: "1", bandPremill: 2 * MM, bandWasteEnd: 0 };
      expect(JSON.stringify(plan(fiddled, metric)), label).toBe(base);
      // On, with no kind of part picked: nothing banded, nothing changed.
      const none: Sizes = { ...s, band: true, bandFronts: "none", bandCarcass: "none", bandShelves: "none" };
      expect(JSON.stringify(plan(none, metric)), label).toBe(base);
    }
  });

  it("a new cabinet starts with banding off, and its test cuts are what they were", () => {
    for (const metric of [false, true]) {
      expect(defaults(metric).band).toBe(false);
      const s = applyPreset(defaults(metric), "mixed", metric);
      for (const kind of ["machine", "ladders", "drawer", "door"] as const) {
        expect(JSON.stringify(testCut(kind, { ...s, bandPremill: 1 * MM, band1Size: "3" }, metric).parts)).toBe(JSON.stringify(testCut(kind, s, metric).parts));
      }
    }
  });
});

describe("edge banding refuses what it would spoil", () => {
  const base = (metric = false, over: Partial<Sizes> = {}): Sizes => ({ ...applyPreset(defaults(metric), "mixed", metric), band: true, ...over });
  const err = (s: Sizes, metric = false) => plan(s, metric).error;

  it("a blind dado's stop: the wood in front of it under the band", () => {
    // 1/8 in stop, 1 mm band: 2.2 mm of wood.
    expect(err(base(false, { dadoStop: 0.125 * IN }))).toMatch(/^The blind dados stop 3\.2 mm \(0\.125 in\) from the sides' finished front edge; under Band 1 \(1 mm\) that leaves 2\.2 mm .* set Dado stop to at least 4 mm \(0\.158 in\), or use a thinner band on the carcass\.$/);
    // The value the message names is taken.
    expect(err(base(false, { dadoStop: 4 * MM }))).toBeNull();
    // Unbanded, the same stop is fine; banded only the doors, too.
    expect(err({ ...base(false, { dadoStop: 0.125 * IN }), band: false })).toBeNull();
    expect(err(base(false, { dadoStop: 0.125 * IN, bandCarcass: "none" }))).toBeNull();
  });

  it("the 3 mm of wood beside a hinge cup, and a pull hole, under the band", () => {
    // A 3 mm band and the cup 5 mm from the finished edge: 2 mm of wood.
    const m = err(base(false, { band1Size: "3", cupDistance: 5 * MM }));
    expect(m).toMatch(/: the hinge cup is 5 mm \(0\.197 in\) from the finished (left|right) edge; under Band 1 \(3 mm\) that leaves 2 mm \(0\.079 in\) of wood .* Set Boring distance to at least 6 mm, or band the doors with a thinner band\.$/);
    expect(err(base(false, { band1Size: "3", cupDistance: 6 * MM }))).toBeNull();
    // A band no boring distance can clear.
    expect(err(base(false, { band1Size: "custom", band1Thick: 4.5 * MM, cupDistance: 7 * MM }))).toMatch(/No boring distance Blum gives \(3 to 7 mm\) leaves that: band the doors with a band of at most 4 mm\.$/);
    // A pull 8 mm from the opening edge: 5.6 mm of wood bare, 2.6 under a 3 mm band.
    const pull = { band1Size: "3" as const, cupDistance: 6 * MM, doorPullEdge: 8 * MM };
    expect(err({ ...base(false, pull), band: false })).toBeNull();
    expect(err(base(false, pull))).toMatch(/: the pull hole is .* from the finished (left|right) edge; .* Keep the pull holes at least 8\.4 mm \(0\.330 in\) from the edge \(to their centres\), or use a thinner band\.$/);
    expect(err(base(false, { ...pull, doorPullEdge: 8.4 * MM }))).toBeNull();
  });

  it("with a pre-mill, the 3 mm is kept to the edge after the pre-mill, under the band, not to the larger blank's edge", () => {
    // A 3 mm band and a 1 mm pre-mill: the blank is cut 2 mm short, but once pre-milled the wood
    // beside a cup bored 5 mm from the finished edge is 2 mm.
    expect(err(base(false, { band1Size: "3", cupDistance: 5 * MM, bandPremill: 1 * MM }))).toMatch(/: the hinge cup is 5 mm .* under Band 1 \(3 mm\) that leaves 2 mm .* Set Boring distance to at least 6 mm/);
    expect(err(base(false, { band1Size: "3", cupDistance: 5 * MM, bandPremill: 3 * MM }))).toMatch(/Set Boring distance to at least 6 mm/);
    expect(err(base(false, { band1Size: "3", cupDistance: 6 * MM, bandPremill: 1 * MM }))).toBeNull();
    // The same for a blind dado's stop: 5 mm, a 3 mm band, a 2 mm pre-mill: 2 mm in front of it.
    expect(err(base(false, { band1Size: "3", cupDistance: 6 * MM, dadoStop: 5 * MM, bandPremill: 2 * MM }))).toMatch(/^The blind dados stop 5 mm .* leaves 2 mm/);
    // Through bandPart, a groove 3.5 mm from the edge under a 1 mm band with a 1 mm pre-mill.
    const band = bandList(base(), false)[0];
    expect(() => bandPart("Side", [0.018, 0.5, 0.8], [{ min: [0, 0.0035, 0.1], max: [0.006, 0.5, 0.12] }], [], [{ edge: "front", band }], 1 * MM)).toThrow(/leaves 2\.5 mm/);
  });

  it("the thin preset is REHAU's .018 in, 0.457 mm", () => {
    const s = base(false, { band1Size: "0.018in" });
    expect(BAND.sizes[0]).toEqual(["0.018in", 0.018 * 25.4, "0.018 in (0.457 mm)"]);
    expect(bandList(s, false)[0].thickness).toBeCloseTo(0.4572 * MM, 12);
    expect(bandList(s, false)[0].label).toBe("0.018 in x 15/16 in");
  });

  it("a finger notch in a banded drawer front, a band too narrow for its stock, a band not listed, and settings out of range", () => {
    expect(err(base(false, { drawerPull: "notch" }))).toMatch(/finger notch cuts into each drawer front's top edge/);
    expect(err(base(false, { drawerPull: "notch", bandFronts: "none" }))).toBeNull();
    expect(err(base(false, { band1Width: 15 * MM }))).toMatch(/^Band 1 is 15 mm \(0\.591 in\) wide: too narrow to cover the 23\/32 in edges of the doors and drawer fronts/);
    expect(err(base(false, { bandShelves: "2" }))).toMatch(/^Adjustable shelves take Band 2, but the list has one band/);
    expect(err(base(false, { bandCount: 2, bandShelves: "2" }))).toBeNull();
    expect(err(base(false, { band1Size: "custom", band1Thick: 7 * MM }))).toMatch(/^Band 1 must be at least 0\.1 mm and at most 6\.35 mm/);
    expect(err(base(false, { band1Size: "custom", band1Thick: 0.05 * MM }))).toMatch(/^Band 1 must be at least 0\.1 mm/);
    expect(err(base(false, { bandPremill: 3.5 * MM }))).toMatch(/pre-mill must be 0 to 3 mm/);
    expect(err(base(false, { bandPremill: 3 * MM }))).toBeNull();
    // Nothing picked: the list is not used, so it is not checked.
    expect(err(base(false, { bandCount: 7, bandFronts: "none", bandCarcass: "none", bandShelves: "none" }))).toBeNull();
    expect(err(base(false, { bandCount: 7 }))).toMatch(/list 1 to 3 bands/);
    expect(err(base(false, { bandWasteEnd: -1 * MM }))).toMatch(/waste per banded side/);
    expect(err(base(false, { bandCount: 4 }))).toMatch(/list 1 to 3 bands/);
  });

  it("a band where it would change a joint: a groove or rabbet out of the edge, a notch mid-edge, a hole in the edge", () => {
    const band = bandList(base(), false)[0];
    const t = 18 * MM;
    // A rabbet along the front edge (part of the thickness): a band would cover it.
    expect(() => bandPart("Shelf", [0.5, 0.3, t], [{ min: [0, 0, 0], max: [0.5, 0.01, t / 2] }], [], [{ edge: "front", band }], 0)).toThrow(/^Shelf: a dado or groove runs out of its front edge, where a band would cover it and change the joint\. Bands go only on exposed edges\.$/);
    // A notch in the middle of the edge.
    expect(() => bandPart("Shelf", [0.5, 0.3, t], [{ min: [0.2, 0, 0], max: [0.3, 0.02, t] }], [], [{ edge: "front", band }], 0)).toThrow(/a notch cuts into the middle of its banded front edge/);
    // A notch at the end no deeper than the band.
    expect(() => bandPart("Shelf", [0.5, 0.3, t], [{ min: [0, 0, 0], max: [0.02, 0.0005, t] }], [], [{ edge: "front", band }], 0)).toThrow(/no deeper than Band 1/);
    // A hole bored into the edge.
    expect(() => bandPart("Shelf", [0.5, 0.3, t], [], [{ axis: 1, at: 0, inward: 1, center: [0.25, t / 2], radius: 0.004, depth: 0.03 }], [{ edge: "front", band }], 0)).toThrow(/a hole is drilled into its front edge/);
    // A dado 3.5 mm from the edge: 2.5 mm of wood under a 1 mm band.
    expect(() => bandPart("Side", [t, 0.5, 0.8], [{ min: [0, 0.0035, 0.1], max: [0.006, 0.5, 0.12] }], [], [{ edge: "front", band }], 0)).toThrow(/^Side: a dado or groove comes 3\.5 mm .* leaves 2\.5 mm .* less than the 3 mm the planner keeps/);
    expect(() => bandPart("Side", [t, 0.5, 0.8], [{ min: [0, 0.004, 0.1], max: [0.006, 0.5, 0.12] }], [], [{ edge: "front", band }], 0)).not.toThrow();
    expect(WEB).toBe(3 * MM);
  });

  it("a banded edge against another part, or in its dado: refused; an overlay door in front of the carcass is not a joint", () => {
    // Overlay doors and drawer fronts close in front of the banded carcass: no clash.
    expect(bandClash(plan(base(), false).parts)).toBeNull();
    // Open shelves, fixed in dados: the carcass's edges alone.
    const s = { ...applyPreset(defaults(false), "open", false), band: true, shelfType: "fixed" as const };
    const p = plan(s, false);
    expect(p.error).toBeNull();
    expect(bandClash(p.parts)).toBeNull();
    const t = s.thickness;
    // A strip glued on the sides' front edges (a face frame): the bands would sit in the glue line.
    const strip: Part = { name: "Face frame", material: "x", blank: [t, t, s.height], copies: [{ at: [0, -t, 0], name: "Face frame stile" }], mesh: { name: "x", positions: [], faces: [], merge_coplanar: false }, grain: "length" };
    expect(bandClash([...p.parts, strip])).toBe("Left side: its banded front edge sits against the Face frame stile, where a band would change the joint. Bands go only on exposed edges: do not band it.");
    // A rail's end banded: it sits in the side's dado.
    const shelf = p.parts.find((x) => x.name === "Shelf")!;
    const end: Part = { ...shelf, bands: [{ ...shelf.bands![0], edge: "left", span: [0, shelf.finished![1]] }] };
    expect(bandClash([...p.parts.filter((x) => x !== shelf), end])).toMatch(/^Shelf 1: its banded left edge sits against the Left side/);
  });
});

describe("edge banding: what is bought", () => {
  it("each banded part carries its band by the metre: each banded edge's whole run plus 1 in per banded side, rounded up to the millimetre (the 5% is the shopping list's)", () => {
    for (const metric of [false, true]) {
      const s = { ...applyPreset(defaults(metric), "base", metric), band: true };
      const p = plan(s, metric);
      const door = p.parts.find((x) => x.name === "Door")!;
      const [w, , h] = door.finished!;
      const want = Math.ceil((2 * (w + h) + 4 * IN) * 1000 - 1e-6) / 1000;
      const label = bandList(s, metric)[0].label;
      expect(label).toBe(metric ? "1 mm x 23 mm" : "1 mm x 15/16 in");
      expect(door.bom!.filter((b) => b.unit === "m")).toEqual([{ item: `Edge banding, ${label}`, qty: want, unit: "m" }]);
      // The side's front edge: its whole height, toe kick notch and all (the band runs across the
      // notch and is trimmed there by hand), though only the part above the notch is banded.
      const side = p.parts.find((x) => x.name === "Left side")!;
      expect(side.bands![0].length).toBeCloseTo(s.height - s.toeKick, 12);
      expect(side.bands![0].run).toBeCloseTo(s.height, 12);
      expect(side.bom).toEqual([{ item: `Edge banding, ${label}`, qty: Math.ceil((s.height + IN) * 1000 - 1e-6) / 1000, unit: "m" }]);
      // The bottom: its tongues are notched, and the band runs their whole length too.
      const bottom = p.parts.find((x) => x.name === "Bottom")!;
      expect(bottom.bom![0].qty).toBe(Math.ceil((bottom.finished![0] + IN) * 1000 - 1e-6) / 1000);
      // Each says how to trim at the notch; the door, with no notch, does not.
      expect(p.rows.find((r) => r[0] === "Left side" && r[4] === "Edge band")![1]).toContain(END_NOTCH);
      expect(p.rows.find((r) => r[0] === "Bottom" && r[4] === "Edge band")![1]).toContain(END_NOTCH);
      expect(p.rows.find((r) => r[0] === "Door" && r[4] === "Edge band")![1]).not.toContain(END_NOTCH);
      // No waste: the length exactly (to the millimetre).
      const exact = plan({ ...s, bandWasteEnd: 0 }, metric).parts.find((x) => x.name === "Door")!;
      expect(exact.bom!.find((b) => b.unit === "m")!.qty).toBe(Math.ceil(2 * (w + h) * 1000 - 1e-6) / 1000);
      // Unbanded parts carry none; the hardware is still there, first.
      expect(door.bom![0].sku).toMatch(/^71B/);
      expect(p.parts.find((x) => x.name === "Back")!.bom).toBeUndefined();
    }
  });

  it("two bands: each part names its own, by its name, and the doors' list says which", () => {
    const s = { ...applyPreset(defaults(false), "base", false), band: true, bandCount: 2, band2Name: "White PVC", bandFronts: "2" as const, cupDistance: 6 * MM };
    const p = plan(s, false);
    expect(bandFor(s, "fronts", false)!.label).toBe("3 mm x 15/16 in, White PVC");
    const door = p.parts.find((x) => x.name === "Door")!;
    expect(door.bom!.filter((b) => b.unit === "m").map((b) => b.item)).toEqual(["Edge banding, 3 mm x 15/16 in, White PVC"]);
    expect(p.parts.find((x) => x.name === "Bottom")!.bom!.map((b) => b.item)).toEqual(["Edge banding, 1 mm x 15/16 in"]);
    // The shop sheet lists each banded part, finished and cut.
    const row = p.rows.find((r) => r[0] === "Door" && r[4] === "Edge band")!;
    expect(row[1]).toMatch(/^Edge band all four edges \(3 mm x 15\/16 in, White PVC\): finished 23\.875 x 30\.375 in \(606\.4 x 771\.5 mm\), cut 23\.639 x 30\.139 in \(600\.4 x 765\.5 mm\); 2\.858 m of band each, with waste$/);
    // A name with line breaks and tabs is one line; a long one is cut to 40 characters.
    const odd = plan({ ...s, band2Name: "  White\n\tPVC  " + "x".repeat(60) }, false);
    expect(odd.error).toBeNull();
  });
});

describe("edge banding is kept with the cabinet", () => {
  it("every band setting comes back exactly as it went in, in both units; banding untouched keeps nothing", () => {
    for (const metric of [false, true]) {
      expect(pack(defaults(metric), metric).d).toEqual({});
      const s: Sizes = {
        ...applyPreset(defaults(metric), "mixed", metric),
        band: true,
        bandCount: 3,
        band1Size: "custom",
        band1Thick: 0.97 * MM,
        band1Name: "Maple",
        band1Width: 22 * MM,
        band2Size: "0.018in",
        band3Size: "3",
        band3Name: "Black",
        bandFronts: "3",
        bandCarcass: "1",
        bandShelves: "2",
        bandPremill: 0.5 * MM,
        bandWasteEnd: 50 * MM,
        cupDistance: 6.5 * MM,
      };
      const kept = pack(s, metric);
      expect(unpack(JSON.parse(JSON.stringify(kept)), metric)).toEqual(s);
      expect(plan(unpack(kept, metric)!, metric).error).toBeNull();
      // Junk from a document is read safely.
      const junk = unpack({ ...kept, d: { ...kept.d, band1Size: "9", bandFronts: "x", band1Name: 7, bandCount: "three" } } as never, metric)!;
      expect([junk.band1Size, junk.bandFronts, junk.band1Name, junk.bandCount]).toEqual(["1", "1", "", 1]);
    }
  });
});

describe("edge banding in the test cuts", () => {
  it("the raw-edge numbers come from the blank: a band less its pre-mill (metric, drawer over doors, 1 mm band)", () => {
    const at = (premill: number) => {
      const t = testCut("door", { ...applyPreset(defaults(true), "mixed", true), band: true, bandPremill: premill }, true);
      expect(t.error).toBeNull();
      return [t.rows.find((r) => r[0] === "Hinge cup centre, from the door's hinge edge")![1], t.rows.find((r) => r[0] === "Mounting plate holes")![1]];
    };
    expect(at(0)).toEqual(["22.5 mm from the banded edge (21.5 mm from the raw edge, before banding)", "5 mm, 11.5 deep, 32 mm apart, 37 mm from the side's banded front edge (36 mm from the raw edge, before banding)"]);
    // A 1 mm pre-mill: the blank is the finished size, the cup 22.5 and the plates 37 from its edge.
    expect(at(1 * MM)).toEqual(["22.5 mm from the banded edge (22.5 mm from the blank's edge as cut, before the pre-mill and the band)", "5 mm, 11.5 deep, 32 mm apart, 37 mm from the side's banded front edge (37 mm from the blank's edge as cut, before the pre-mill and the band)"]);
    expect(at(0.5 * MM)[0]).toMatch(/\(22 mm from the blank's edge as cut/);
    // The mini drawer's scale check: the side's blank, 1 mm short, or the depth with a 1 mm pre-mill.
    const side = (premill: number) => testCut("drawer", { ...applyPreset(defaults(true), "mixed", true), band: true, bandPremill: premill }, true).rows.find((r) => r[0] === "Each side's length (a long cut: the machine's scale)")![1];
    expect(side(0)).toBe("559 mm, as cut: measure it before banding (560 mm, your cabinet's depth, once banded)");
    expect(side(1 * MM)).toBe("560 mm, as cut: measure it before banding (560 mm, your cabinet's depth, once banded)");
  });

  it("the mini door and mini drawer are banded as the cabinet is; the machine check and the ladders never are", () => {
    for (const metric of [false, true]) {
      const s = { ...applyPreset(defaults(metric), "mixed", metric), band: true };
      const door = testCut("door", s, metric);
      expect(door.error).toBeNull();
      const d = door.parts.find((p) => p.name === "Door")!;
      expect(d.bands!.map((e) => e.edge).sort()).toEqual(["bottom", "left", "right", "top"]);
      expect(door.rows[0][0]).toBe("Edge banding");
      expect(door.holes.some((r) => r[0] === "Door" && r[4] === "Edge band")).toBe(true);
      // The gap is the finished door's, not the blank's.
      const unbanded = testCut("door", { ...s, band: false }, metric);
      expect(door.rows.find((r) => r[0] === "The gap round the door, closed")).toEqual(unbanded.rows.find((r) => r[0] === "The gap round the door, closed"));
      expect(door.rows.find((r) => r[0] === "Hinge cup centre, from the door's hinge edge")![1]).toMatch(/from the banded edge \(.* from the raw edge, before banding\)$/);
      // The scale check is the side's blank, as cut: measured before banding.
      const drawerRows = testCut("drawer", s, metric).rows;
      const sideRow = drawerRows.find((r) => r[0] === "Each side's length (a long cut: the machine's scale)")!;
      expect(sideRow[1]).toMatch(/, as cut: measure it before banding \(/);
      expect(testCut("drawer", { ...s, band: false }, metric).rows.find((r) => r[0] === sideRow[0])![1]).not.toMatch(/banding/);
      const drawer = testCut("drawer", s, metric);
      expect(drawer.error).toBeNull();
      expect(drawer.parts.find((p) => p.name === "Drawer front")!.bands).toHaveLength(4);
      for (const kind of ["machine", "ladders"] as const) expect(JSON.stringify(testCut(kind, s, metric))).toBe(JSON.stringify(testCut(kind, { ...s, band: false }, metric)).replace('"band":false', '"band":true'));
    }
  });
});
