// @vitest-environment node
// Dowels and Confirmat screws in place of blind dados, and full-height line boring: where each
// hole goes and why (docs/research/joinery-sources.md), what the router drills and what a jig
// must, the 3 mm of wood the planner keeps, the shopping list, edge banding, and that a cabinet
// made with the defaults is what it was before any of this came.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { applyPreset, CONFIRMAT, CONFIRMAT_LAYOUT, defaults, DOWEL, dowelLayout, LINE_BORE, normalize, plan, PRESETS, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { pack, unpack } from "../../plugins/cabinet-generator/keep.js";
import { ladderCoupons } from "../../plugins/cabinet-generator/testcuts.js";

const IN = 0.0254;
const MM = 0.001;
const WEB = 3 * MM;

const ok = (s: Sizes, metric: boolean) => {
  const p = plan(s, metric);
  expect(p.error).toBeNull();
  for (const part of p.parts) expect(audit(part.mesh).problems, part.name).toEqual([]);
  return p;
};
const named = (parts: Part[], name: string) => parts.filter((x) => x.name === name);
/** The round holes whose mouths lie in a plane of a part: centre (the two other axes) and radius. */
const holesAt = (part: Part, axis: number, v: number) => {
  const others = [0, 1, 2].filter((k) => k !== axis);
  const out: { c: [number, number]; r: number }[] = [];
  for (const f of part.mesh.faces) {
    for (const ring of f.slice(1)) {
      const pts = ring.map((i) => part.mesh.positions[i]);
      if (!pts.every((q) => Math.abs(q[axis] - v) < 1e-6)) continue;
      const c = others.map((k) => pts.reduce((sum, q) => sum + q[k], 0) / pts.length) as [number, number];
      // A regular polygon's circumradius: the distance to a corner.
      out.push({ c, r: Math.hypot(pts[0][others[0]] - c[0], pts[0][others[1]] - c[1]) });
    }
  }
  return out;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;
/** A left side's holes in its inner face (x = t), by radius in mm. */
const leftHoles = (p: ReturnType<typeof plan>, t: number, rMm: number) =>
  holesAt(named(p.parts, "Left side")[0], 0, t).filter((h) => near(h.r, rMm * MM, 1e-5));

/** The wall cabinet (12 in or 300 mm deep, a full top, doors, two adjustable shelves) with these settings. */
const wall = (metric: boolean, o: Partial<Sizes> = {}) => normalize({ ...applyPreset(defaults(metric), "wall", metric), ...o }, metric);

describe("full-height line boring (Blum Process 32's rule, generalised)", () => {
  it("a 775 mm side with no toe kick is Blum's: 22 holes a row, the first 56.5 mm below the top, the last 46.5 mm above the bottom", () => {
    expect(LINE_BORE).toEqual({ bottom: 46.5, top: 56.5 });
    // Open shelves (no hardware in the way), no toe kick, so the box's bottom is the side's end.
    const s = normalize({ ...defaults(true), layout: "shelves", shelves: 1, base: "none", height: 775 * MM, depth: 560 * MM, lineBoring: "full" }, true);
    const p = ok(s, true);
    const t = s.thickness;
    const front = leftHoles(p, t, 2.5).filter((h) => near(h.c[0], 37 * MM)).map((h) => h.c[1]).sort((a, b) => a - b);
    expect(front).toHaveLength(22);
    expect(front[0]).toBeCloseTo(46.5 * MM, 9);
    expect(s.height - front[21]).toBeCloseTo(56.5 * MM, 9);
    expect(front[21] - front[0]).toBeCloseTo(672 * MM, 9);
    front.forEach((z, k) => expect(z).toBeCloseTo((46.5 + 32 * k) * MM, 9));
    // The rear row matches it, hole for hole.
    const rear = leftHoles(p, t, 2.5).filter((h) => !near(h.c[0], 37 * MM));
    expect(rear).toHaveLength(22);
    expect(p.rows.find((r) => /^Shelf pin holes/.test(r[1]))![1]).toMatch(/the full height, the lowest 46\.5 mm above the bottom of the box and none nearer the top than 56\.5 mm \(Blum Process 32's rule\), 32 mm apart: 88$/);
  });

  it("other heights: from 46.5 mm above the bottom of the box (the toe kick's top) up the 32 mm grid, the last at least 56.5 mm below the top", () => {
    for (const metric of [false, true]) {
      for (const height of metric ? [720, 870, 900, 2100].map((v) => v * MM) : [30, 34.5, 42, 84].map((v) => v * IN)) {
        const s = normalize({ ...defaults(metric), layout: "shelves", shelves: 2, height, lineBoring: "full" }, metric);
        const p = ok(s, metric);
        const kick = s.base === "toekick" ? s.toeKick : 0;
        const zs = leftHoles(p, s.thickness, 2.5).filter((h) => near(h.c[0], 37 * MM)).map((h) => h.c[1]).sort((a, b) => a - b);
        expect(zs[0]).toBeCloseTo(kick + 46.5 * MM, 9);
        const top = s.height - zs[zs.length - 1];
        expect(top).toBeGreaterThanOrEqual(56.5 * MM - 1e-9);
        expect(top).toBeLessThan(88.5 * MM);
        zs.forEach((z, k) => expect(z).toBeCloseTo(zs[0] + 32 * MM * k, 9));
      }
    }
  });

  it("skips the hinge plates, the joints and the runner screws, as the pins around a shelf do; every shelf still rests on four pins", () => {
    for (const metric of [false, true]) {
      for (const fastener of ["none", "dowels", "confirmat"] as const) {
        const s = wall(metric, { lineBoring: "full", fastener, height: metric ? 900 * MM : 36 * IN });
        const p = ok(s, metric);
        const t = s.thickness;
        const row = p.rows.find((r) => /^Shelf pin holes/.test(r[1]))![1];
        // Some were left out for the plates (both doors' hinges are on the 37 mm line).
        expect(row).toMatch(/\(\d+ left out where a hinge plate, runner or joint is\)/);
        for (const [side, x] of [["Left side", t], ["Right side", 0]] as const) {
          const all = holesAt(named(p.parts, side)[0], 0, x);
          const pins = all.filter((h) => near(h.r, 2.5 * MM, 1e-5) && near(h.c[0], 37 * MM));
          // Every hole keeps 3 mm of wood to every other.
          for (let i = 0; i < all.length; i++)
            for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].c[0] - all[j].c[0], all[i].c[1] - all[j].c[1]), `${side} holes ${i}, ${j}`).toBeGreaterThanOrEqual(all[i].r + all[j].r + WEB - 1e-6);
          expect(pins.length).toBeGreaterThan(20);
        }
      }
    }
    // A drawer over a door: the pins stay in the door's space, clear of the drawer's runner screws.
    for (const metric of [false, true]) {
      const s = normalize({ ...applyPreset(defaults(metric), "mixed", metric), lineBoring: "full" }, metric);
      const p = ok(s, metric);
      const all = holesAt(named(p.parts, "Left side")[0], 0, s.thickness);
      const door = p.parts.find((x) => /door$/i.test(x.name))!;
      const top = door.copies[0].at[2] + door.blank[2];
      // The holes full height adds to the pins around the shelf are all pins below the door's
      // top: none in the drawer's space, where its runner screws are.
      const key = (h: { c: [number, number] }) => h.c.map((v) => Math.round(v * 1e6)).join(",");
      const before = new Set(holesAt(named(ok({ ...s, lineBoring: "shelves" }, metric).parts, "Left side")[0], 0, s.thickness).map(key));
      const added = all.filter((h) => !before.has(key(h)));
      expect(added.length).toBeGreaterThan(0);
      for (const h of added) {
        expect(h.r).toBeCloseTo(2.5 * MM, 9);
        expect(h.c[1] + h.r + WEB).toBeLessThanOrEqual(top + 1e-9);
      }
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].c[0] - all[j].c[0], all[i].c[1] - all[j].c[1])).toBeGreaterThanOrEqual(all[i].r + all[j].r + WEB - 1e-6);
    }
  });

  it("is off to start, and Around each shelf is the five holes it always was", () => {
    for (const metric of [false, true]) {
      expect(defaults(metric).lineBoring).toBe("shelves");
      const p = ok(wall(metric), metric);
      expect(p.rows.find((r) => /^Shelf pin holes/.test(r[1]))![1]).toMatch(/5 around each shelf/);
    }
  });
});

describe("dowel and Confirmat layout (Häfele's case dowelling)", () => {
  it("37 mm from the front and back edges; 3 up to 18 in, 4 up to 24 in; those between on the 32 mm grid; refused past 24 in", () => {
    expect(DOWEL).toMatchObject({ dia: 8, face: 11, edge: 25, setback: 37, pitch: 32 });
    const at = (d: number) => {
      const r = dowelLayout(d);
      if (typeof r === "string") throw new Error(r);
      return r;
    };
    const check = (d: number, n: number) => {
      const r = at(d);
      expect(r, `${d}`).toHaveLength(n);
      expect(r[0]).toBeCloseTo(37 * MM, 12);
      expect(d - r[n - 1]).toBeCloseTo(37 * MM, 12);
      for (const y of r.slice(1, -1)) expect(Math.abs(((y - 37 * MM) / (32 * MM)) % 1) < 1e-9 || Math.abs(((y - 37 * MM) / (32 * MM)) % 1) > 1 - 1e-9, `${y} on the grid`).toBe(true);
      for (let i = 1; i < n; i++) expect(r[i] - r[i - 1]).toBeGreaterThanOrEqual(11 * MM - 1e-9);
      return r;
    };
    // The boundaries, exactly and just past.
    check(18 * IN, 3);
    check(18 * IN + 0.01 * MM, 4);
    check(24 * IN, 4);
    expect(dowelLayout(24 * IN + 0.01 * MM)).toMatch(/up to 24 in \(609\.6 mm\) deep, and nothing deeper/);
    // The frameless 23 1/4 in box: 37, 197, 389 and 553.55 mm, the middle two the grid points
    // nearest a third and two thirds of the way.
    expect(check(23.25 * IN, 4).map((y) => Math.round(y / MM * 100) / 100)).toEqual([37, 197, 389, 553.55]);
    // A 12 in wall cabinet: 37, 165, 267.8.
    expect(check(12 * IN, 3).map((y) => Math.round(y / MM * 100) / 100)).toEqual([37, 165, 267.8]);
    // The least depth for three: 37 + 32 + 11 (3 mm of wood to the back one's 8 mm) + 37.
    check(117 * MM, 3);
    expect(dowelLayout(116.9 * MM)).toMatch(/at least 3 dowels up to 18 in.*at least 117 mm \(4\.607 in\) deep/);
  });

  it("in a cabinet: the top and bottom of an 18 in deep cabinet take 3 each, 18 in and a millimetre 4, 24 in 4, deeper is refused", () => {
    for (const fastener of ["dowels", "confirmat"] as const) {
      const r = fastener === "dowels" ? 4 : 3.5;
      for (const [depth, n] of [[18 * IN, 3], [18 * IN + 1 * MM, 4], [24 * IN, 4]] as const) {
        const s = normalize({ ...defaults(false), layout: "shelves", depth, fastener }, false);
        const p = ok(s, false);
        // With the back in a groove the top and bottom run to the rear edge: the joint is the depth.
        const holes = leftHoles(p, s.thickness, r);
        expect(holes, `${fastener} ${depth}`).toHaveLength(2 * n);
        const ys = [...new Set(holes.map((h) => Math.round(h.c[0] * 1e6)))].sort((a, b) => a - b).map((v) => v / 1e6);
        expect(ys[0]).toBeCloseTo(37 * MM, 9);
        expect(depth - ys[ys.length - 1]).toBeCloseTo(37 * MM, 9);
        for (const row of p.rows.filter((x) => x[4] === "Jig")) expect(row[1]).toMatch(new RegExp(`: ${n} at `));
      }
      const deep = plan(normalize({ ...defaults(false), layout: "shelves", depth: 24 * IN + 1 * MM, fastener }, false), false);
      expect(deep.error).toMatch(/^The bottom is 610\.6 mm \(24\.039 in\) deep: Häfele's dowel chart gives counts for joints up to 24 in .*Make the cabinet shallower, or use blind dados\.$/);
    }
  });

  it("narrow stretchers are refused with the width that takes three; a full top or wider stretchers build", () => {
    for (const metric of [false, true]) {
      const base = applyPreset(defaults(metric), "base", metric);
      for (const fastener of ["dowels", "confirmat"] as const) {
        expect(plan(normalize({ ...base, fastener }, metric), metric).error).toMatch(/^The front stretcher is .* deep: .*at least 117 mm \(4\.607 in\) deep\. Make the stretchers wider, use a full top, or use blind dados\.$/);
        ok(normalize({ ...base, fastener, stretcher: 117 * MM }, metric), metric);
        ok(normalize({ ...base, fastener, top: "full" }, metric), metric);
      }
    }
  });

  it("fixed shelves are joined too, from the shelf's own front and back edges (behind an inset door, too)", () => {
    for (const front of ["overlay", "inset"] as const) {
      const s = wall(false, { fastener: "dowels", shelfType: "fixed", shelves: 1, front, hardware: false });
      const p = ok(s, false);
      const shelf = named(p.parts, "Shelf")[0];
      const ya = shelf.copies[0].at[1];
      const yb = ya + shelf.blank[1];
      const z = shelf.copies[0].at[2] + s.thickness / 2;
      const ys = leftHoles(p, s.thickness, 4).filter((h) => near(h.c[1], z)).map((h) => h.c[0]).sort((a, b) => a - b);
      expect(ys).toHaveLength(3);
      expect(ys[0] - ya).toBeCloseTo(37 * MM, 9);
      expect(yb - ys[2]).toBeCloseTo(37 * MM, 9);
      if (front === "inset") expect(ya).toBeGreaterThan(s.thickness);
      expect(p.rows.some((r) => r[0] === "Shelf 1" && r[4] === "Jig")).toBe(true);
    }
  });
});

describe("dowels and Confirmat screws: what the router drills, what a jig does", () => {
  it("dowels: 8 x 11 mm holes in both sides by CNC, 8 x 25 mm in each rail's ends for a doweling jig; no dados, notches or tongues", () => {
    for (const metric of [false, true]) {
      const s = wall(metric, { fastener: "dowels" });
      expect(s.dados).toBe(false);
      const p = ok(s, metric);
      const t = s.thickness;
      const cnc = p.rows.filter((r) => /^Dowel holes for the/.test(r[1]));
      expect(cnc.map((r) => [r[0], r[2], r[3], r[4]])).toEqual([
        ["Left and right sides", "8 mm", "11 mm", "CNC"],
        ["Left and right sides", "8 mm", "11 mm", "CNC"],
      ]);
      const jig = p.rows.filter((r) => r[4] === "Jig");
      expect(jig.map((r) => [r[0], r[2], r[3]])).toEqual([
        ["Bottom", "8 mm", "25 mm"],
        ["Top", "8 mm", "25 mm"],
      ]);
      const want = metric ? ": 3 at 37, 165 and 263 mm from its front edge" : ": 3 at 37, 165 and 267.8 mm (1.457, 6.496 and 10.543 in) from its front edge";
      for (const r of jig) {
        expect(r[1]).toContain(want);
        expect(r[1]).toMatch(/^Dowel holes in both ends \(the edges against the sides\), for a doweling jig: .*, centred in its thickness \(Häfele's depth for its 8 mm assembly dowel\)$/);
      }
      expect(p.rows.some((r) => r[0] === "Dowels" && r[4] === "Hardware" && /Häfele's case-dowelling drawing/.test(r[1]) && /AWS/.test(r[1]) && /assembly dowel/.test(r[1]))).toBe(true);
      // Holes in both sides, 6 each (3 at the top, 3 at the bottom), in the inner faces only.
      expect(leftHoles(p, t, 4)).toHaveLength(6);
      expect(holesAt(named(p.parts, "Left side")[0], 0, 0).filter((h) => near(h.r, 4 * MM, 1e-5))).toHaveLength(0);
      expect(holesAt(named(p.parts, "Right side")[0], 0, 0).filter((h) => near(h.r, 4 * MM, 1e-5))).toHaveLength(6);
      // The rails carry no holes of their own (the jig's are listed) and no notches: plain boxes the inside width long.
      for (const rail of ["Top", "Bottom"]) {
        const r = named(p.parts, rail)[0];
        expect(r.blank[0]).toBeCloseTo(s.width - 2 * t, 9);
        expect(r.mesh.faces.every((f) => f.length === 1)).toBe(true);
      }
      expect(p.rows.some((r) => /Blind dados|Tongues/.test(r[1]))).toBe(false);
    }
  });

  it("Confirmat: a 7 mm hole through each side by CNC, no countersink; a 5 mm pilot in each rail's ends for a jig, depth left to the screw maker", () => {
    for (const metric of [false, true]) {
      const s = wall(metric, { fastener: "confirmat" });
      const p = ok(s, metric);
      const t = s.thickness;
      // Through: the same holes in both faces of each side, 7 mm.
      const inner = leftHoles(p, t, 3.5);
      const outer = holesAt(named(p.parts, "Left side")[0], 0, 0).filter((h) => near(h.r, 3.5 * MM, 1e-5));
      expect(inner).toHaveLength(6);
      expect(outer.map((h) => h.c.map((v) => Math.round(v * 1e6)))).toEqual(expect.arrayContaining(inner.map((h) => h.c.map((v) => Math.round(v * 1e6)))));
      // No countersink: nothing 10 mm.
      expect(holesAt(named(p.parts, "Left side")[0], 0, 0).filter((h) => near(h.r, 5 * MM, 1e-5))).toEqual([]);
      const cnc = p.rows.filter((r) => /^Confirmat through holes for the/.test(r[1]));
      expect(cnc.map((r) => [r[2], r[3], r[4]])).toEqual([["7 mm", "through", "CNC"], ["7 mm", "through", "CNC"]]);
      const jig = p.rows.filter((r) => r[4] === "Jig");
      expect(jig.map((r) => [r[0], r[2], r[3]])).toEqual([["Bottom", "5 mm", "per the screw maker"], ["Top", "5 mm", "per the screw maker"]]);
      for (const r of jig) expect(r[1]).toMatch(/deep as the screw maker's instructions give \(no maker's pilot depth was found\)$/);
      const hw = p.rows.find((r) => r[0] === "Confirmat screws")!;
      expect(hw[1]).toContain(CONFIRMAT_LAYOUT);
      expect(CONFIRMAT_LAYOUT).toBe("Häfele's dowel layout; no confirmat spacing was found in a maker's document");
      expect(hw[1]).toMatch(/264\.44\.190/);
      expect(hw[1]).toMatch(/none is cut/);
    }
  });

  it("every joint hole keeps 3 mm of wood to the side's edges, its cuts (the back's groove, the toe kick) and every other hole", () => {
    for (const metric of [false, true]) {
      for (const id of ["wall", "tall", "open"]) {
        for (const fastener of ["dowels", "confirmat"] as const) {
          for (const backInset of [undefined, 0]) {
            const s = normalize({ ...applyPreset(defaults(metric), id, metric), fastener, ...(backInset === 0 ? { backInset: 0, nailers: "none" } : {}) }, metric);
            const p = ok(s, metric);
            const t = s.thickness;
            const r = fastener === "dowels" ? 4 * MM : 3.5 * MM;
            const all = holesAt(named(p.parts, "Left side")[0], 0, t);
            const joint = all.filter((h) => near(h.r, r, 1e-5));
            expect(joint.length).toBeGreaterThan(0);
            for (const h of joint) {
              expect(h.c[0] - r).toBeGreaterThanOrEqual(WEB - 1e-9);
              expect(s.depth - h.c[0] - r).toBeGreaterThanOrEqual(WEB - 1e-9);
              // The back's groove (or rabbet) at the rear.
              const groove = s.depth - (backInset === 0 ? 0 : s.nailers !== "none" ? Math.max(s.backInset, t + s.fit) : s.backInset) - s.backThickness - s.fit / 2;
              expect(groove - (h.c[0] + r)).toBeGreaterThanOrEqual(WEB - 1e-9);
              // The toe kick notch.
              if (s.base === "toekick" && h.c[0] - r < s.toeSetback) expect(h.c[1] - r - s.toeKick).toBeGreaterThanOrEqual(WEB - 1e-9);
            }
            for (let i = 0; i < all.length; i++)
              for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].c[0] - all[j].c[0], all[i].c[1] - all[j].c[1])).toBeGreaterThanOrEqual(all[i].r + all[j].r + WEB - 1e-6);
          }
        }
      }
    }
  });

  it("thin stock is refused with the least that keeps 3 mm of wood: 14 mm for dowels, 11 mm for Confirmat pilots", () => {
    expect(plan(wall(true, { fastener: "dowels", thickness: 13.9 * MM, backThickness: 6 * MM, backGrooveDepth: 6 * MM }), true).error).toMatch(/^Dowel holes are 8 mm across and 11 mm deep .* at least 14 mm thick/);
    ok(wall(true, { fastener: "dowels", thickness: 14 * MM, backThickness: 6 * MM, backGrooveDepth: 6 * MM, shelfType: "fixed", hardware: false }), true);
    expect(plan(wall(true, { fastener: "confirmat", thickness: 10.9 * MM, backThickness: 6 * MM, backGrooveDepth: 5 * MM, shelfType: "fixed", hardware: false }), true).error).toMatch(/^A Confirmat's pilot hole is 5 mm across.* at least 11 mm thick/);
    // Under Häfele's 18 mm for its assembly dowel: built, with a Check row that says so.
    const p = ok(wall(true, { fastener: "dowels", thickness: 16 * MM, backThickness: 6 * MM, shelfType: "fixed", hardware: false }), true);
    expect(p.rows.find((r) => r[4] === "Check" && r[0] === "Dowels")![1]).toMatch(/"for minimum wood thickness 18 mm"; this stock is 16 mm$/);
    expect(ok(wall(true, { fastener: "dowels" }), true).rows.some((r) => r[0] === "Dowels" && r[4] === "Check")).toBe(false);
  });

  it("drawers: the runner screws on the 37 mm line, the front dowels' line, keep 3 mm of wood to the joint holes", () => {
    // The runner screws are drilled after the joint holes and checked against them (sideHole);
    // in the starting cabinets they never come that near (a hinge plate cannot: it never sits
    // across a rail), so this pins the outcome: every side hole keeps 3 mm to every other.
    for (const metric of [false, true]) {
      const s = normalize({ ...applyPreset(defaults(metric), "drawers", metric), top: "full", fastener: "dowels" }, metric);
      const p = ok(s, metric);
      const all = holesAt(named(p.parts, "Left side")[0], 0, s.thickness);
      expect(all.filter((h) => near(h.r, 4 * MM, 1e-5))).toHaveLength(8);
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].c[0] - all[j].c[0], all[i].c[1] - all[j].c[1])).toBeGreaterThanOrEqual(all[i].r + all[j].r + WEB - 1e-6);
    }
  });
});

describe("dowels and Confirmat screws: the shopping list, banding, storage, test cuts", () => {
  it("each rail carries its two joints' dowels or Confirmat screws (Häfele's part number for the length)", () => {
    const d = ok(wall(false, { fastener: "dowels" }), false);
    for (const rail of ["Top", "Bottom"]) expect(named(d.parts, rail)[0].bom).toEqual([{ item: "Dowel, 8 mm, no longer than 36 mm (an 11 mm hole in the side and a 25 mm hole in the edge)", qty: 6, unit: "each" }]);
    expect(named(d.parts, "Left side")[0].bom).toBeUndefined();
    for (const [len, sku] of [[50, "264.44.190"], [70, "264.44.194"]] as const) {
      expect(CONFIRMAT.lengths[String(len)].sku).toBe(sku);
      const c = ok(wall(false, { fastener: "confirmat", confirmatLength: len }), false);
      for (const rail of ["Top", "Bottom"]) expect(named(c.parts, rail)[0].bom).toEqual([{ item: `Häfele self-countersinking Confirmat connector, 7 x ${len} mm, pointed tip, Pozi drive size 3, zinc-plated`, sku, qty: 6, unit: "each" }]);
    }
    // 40 mm is not a self-countersinking length: it falls back to 50 when read, and is refused when planned.
    expect(normalize({ ...defaults(false), confirmatLength: 40 }, false).confirmatLength).toBe(50);
    expect(plan({ ...wall(false, { fastener: "confirmat" }), confirmatLength: 40 }, false).error).toMatch(/50 or 70 mm/);
    // A 23 1/4 in base with a full top: 4 a joint, 8 per rail; stretchers widened to take 3.
    const b = ok(normalize({ ...applyPreset(defaults(false), "base", false), fastener: "dowels", stretcher: 5 * IN }, false), false);
    expect(named(b.parts, "Bottom")[0].bom![0].qty).toBe(8);
    expect(named(b.parts, "Front stretcher")[0].bom![0].qty).toBe(6);
    expect(named(b.parts, "Rear stretcher")[0].bom![0].qty).toBe(6);
  });

  it("edge banding: bandPart moves the joint holes with the side's front edge, and the jig rows give the blank's own distances", () => {
    for (const fastener of ["dowels", "confirmat"] as const) {
      for (const premill of [0, 0.5 * MM]) {
        const s = wall(true, { fastener, band: true, bandPremill: premill });
        const p = ok(s, true);
        const side = named(p.parts, "Left side")[0];
        expect(side.offset![1]).toBeCloseTo(1 * MM - premill, 12);
        const r = fastener === "dowels" ? 4 : 3.5;
        const ys = [...new Set(holesAt(side, 0, s.thickness).filter((h) => near(h.r, r * MM, 1e-5)).map((h) => Math.round(h.c[0] * 1e7)))].sort((a, b) => a - b).map((v) => v / 1e7);
        // 37 mm from the finished (banded) edge is 1 mm less, plus any pre-mill, from the blank's.
        expect(ys[0]).toBeCloseTo(37 * MM - (1 * MM - premill), 9);
        // Where it stands in the cabinet is where it was: the copy moved in by the same.
        expect(side.copies[0].at[1] + ys[0]).toBeCloseTo(37 * MM, 9);
        for (const row of p.rows.filter((x) => x[4] === "Jig")) expect(row[1]).toContain(`before banding, from the blank's front edge as cut: ${premill ? "36.5, 164.5 and 262.5" : "36, 164 and 262"} mm`);
      }
    }
    // Unbanded: no such note.
    expect(ok(wall(true, { fastener: "dowels" }), true).rows.filter((x) => x[4] === "Jig").every((r) => !/before banding/.test(r[1]))).toBe(true);
  });

  it("kept in the document: the new settings come back as they went in, and a cabinet that leaves them alone stores nothing for them", () => {
    for (const metric of [false, true]) {
      for (const o of [{ fastener: "dowels" }, { fastener: "confirmat", confirmatLength: 70 }, { lineBoring: "full" }, { fastener: "confirmat", lineBoring: "full" }] as Partial<Sizes>[]) {
        const s = normalize({ ...applyPreset(defaults(metric), "wall", metric), ...o }, metric);
        const packed = pack(s, metric);
        expect(unpack(packed, metric)).toEqual(s);
        for (const [k, v] of Object.entries(o)) expect(packed.d[k]).toEqual(v);
        // Dowels turn the dados off, and that is kept too.
        if (o.fastener) expect(packed.d.dados).toBe(false);
      }
      const plain = pack(applyPreset(defaults(metric), "wall", metric), metric);
      for (const k of ["fastener", "confirmatLength", "lineBoring"]) expect(k in plain.d).toBe(false);
    }
    // Never both: a document that says dados and dowels is read as dowels.
    expect(normalize({ ...defaults(false), dados: true, fastener: "dowels" }, false).dados).toBe(false);
    expect(normalize({ ...defaults(false), fastener: "glue" as never }, false).fastener).toBe("none");
    expect(normalize({ ...defaults(false), lineBoring: "x" as never }, false).lineBoring).toBe("shelves");
  });

  it("test cuts: no dado ladder with dowels or Confirmat, and it says ladders do not apply", () => {
    for (const fastener of ["dowels", "confirmat"] as const) {
      const lad = ladderCoupons(wall(false, { fastener }), false);
      expect(lad.error).toBeNull();
      expect(lad.coupons.map((c) => c.kind)).not.toContain("dado");
      expect(lad.skipped[0]).toBe(`Dado ladder: the carcass is joined with ${fastener === "dowels" ? "dowels" : "Confirmat screws"}, not dados. A ladder proves a dado's clearance; it does not apply to ${fastener === "dowels" ? "dowel holes" : "Confirmat holes"}.`);
    }
  });
});

describe("the defaults are unchanged", () => {
  // Every starting cabinet, in both units, and with each setting the joinery work touches (butt
  // joints, fixed shelves, inset, banding, hardware off), planned as before joinery came: the
  // hash of plan()'s whole result, parts, meshes and rows. Pinned from the commit before.
  const PINNED: Record<string, string> = {
    "in/base/plain": "164c1c84d9d7ac57",
    "in/base/butt": "490bf6ecd93cfd06",
    "in/base/fixed": "54a3f70e6a4c8d12",
    "in/base/inset": "4c4f8eea087a035a",
    "in/base/band": "ed42ed5fc6e14380",
    "in/base/nohw": "af5b577d23dc988c",
    "in/drawers/plain": "79b3076cbd43e973",
    "in/drawers/butt": "b6d5add875fa59fc",
    "in/drawers/fixed": "79b3076cbd43e973",
    "in/drawers/inset": "d0edf32f1d2c88b7",
    "in/drawers/band": "aed61eece90552ca",
    "in/drawers/nohw": "a061e48cb860f5f5",
    "in/sink/plain": "cb9a385c9c920295",
    "in/sink/butt": "9621bf736509e173",
    "in/sink/fixed": "cb9a385c9c920295",
    "in/sink/inset": "1d70203d6c4c8f33",
    "in/sink/band": "b84599d9393d7b7f",
    "in/sink/nohw": "55e68f71480ab3fb",
    "in/mixed/plain": "14ecb695537b2dec",
    "in/mixed/butt": "5c1becd42cbd5c3d",
    "in/mixed/fixed": "830b7079e5560586",
    "in/mixed/inset": "687ddbe5cda51d88",
    "in/mixed/band": "6eb442ed1fb07250",
    "in/mixed/nohw": "5c1a40a64cabae44",
    "in/trash/plain": "de3e12502ef15f93",
    "in/trash/butt": "8b966df57e8a2c52",
    "in/trash/fixed": "de3e12502ef15f93",
    "in/trash/inset": "b07977555b6e860f",
    "in/trash/band": "084e4290fa465303",
    "in/trash/nohw": "6d43a94bd6be17af",
    "in/wall/plain": "66d10c6496ceb4cf",
    "in/wall/butt": "8b60c16d136b6336",
    "in/wall/fixed": "fe5f77492e9b1005",
    "in/wall/inset": "1f980dd61b0f5081",
    "in/wall/band": "359632340a1b25f1",
    "in/wall/nohw": "389407422acf858f",
    "in/tall/plain": "1f395a14b824adaf",
    "in/tall/butt": "690afb6b5a8ad3dd",
    "in/tall/fixed": "c33f5ea70af3ddc9",
    "in/tall/inset": "2aa3a1f6e13d518b",
    "in/tall/band": "24d87bb957a94f89",
    "in/tall/nohw": "77b8d0109dc1df8c",
    "in/open/plain": "2d2c33520b88bc4d",
    "in/open/butt": "0e1d93d666e025f5",
    "in/open/fixed": "d92512197cda9ef2",
    "in/open/inset": "2d2c33520b88bc4d",
    "in/open/band": "16b64c654bbd1430",
    "in/open/nohw": "2d2c33520b88bc4d",
    "mm/base/plain": "1cd22d9d7ce4904f",
    "mm/base/butt": "e834bd857418e224",
    "mm/base/fixed": "2d28033ea82aa5f5",
    "mm/base/inset": "813355c91757db3f",
    "mm/base/band": "0f4d66cb2c0d1750",
    "mm/base/nohw": "de40a6cca8ac9089",
    "mm/drawers/plain": "dbabda5e09a76d8a",
    "mm/drawers/butt": "d7d07a24ce93cb50",
    "mm/drawers/fixed": "dbabda5e09a76d8a",
    "mm/drawers/inset": "a325295929f94872",
    "mm/drawers/band": "1a8617cee40d6cdd",
    "mm/drawers/nohw": "51f05bd6c8f7d6cd",
    "mm/sink/plain": "4ea4360a4fb7fc95",
    "mm/sink/butt": "ab4c943118e64c57",
    "mm/sink/fixed": "4ea4360a4fb7fc95",
    "mm/sink/inset": "94cc57ddaae5d2a8",
    "mm/sink/band": "43a8be6ab18ff827",
    "mm/sink/nohw": "74aa13404e604ae8",
    "mm/mixed/plain": "c6762e3618f018f6",
    "mm/mixed/butt": "3e5b0127c88f9cb5",
    "mm/mixed/fixed": "a7ef84057a4c4bb0",
    "mm/mixed/inset": "fef5b2512e21d6b0",
    "mm/mixed/band": "0c4421773ade6263",
    "mm/mixed/nohw": "6d7ed0ec57aafcc3",
    "mm/trash/plain": "ff708384e4f0a78f",
    "mm/trash/butt": "6afc12efb8d88f70",
    "mm/trash/fixed": "ff708384e4f0a78f",
    "mm/trash/inset": "d4c4a68dca880399",
    "mm/trash/band": "7f0cad7e44cda5bb",
    "mm/trash/nohw": "4a424e262446f114",
    "mm/wall/plain": "4b7610dc5c9e83f8",
    "mm/wall/butt": "f3e2d10c3dc78bb3",
    "mm/wall/fixed": "8add6bbb0770f72e",
    "mm/wall/inset": "25d10ec485ab2c26",
    "mm/wall/band": "59ef4c81d8f9e437",
    "mm/wall/nohw": "e08ad363f346e544",
    "mm/tall/plain": "b7a5044eaf938159",
    "mm/tall/butt": "73108148e7cf30dd",
    "mm/tall/fixed": "9b1eeb29131119b7",
    "mm/tall/inset": "c3b6929e1421f5f8",
    "mm/tall/band": "182a7a63459fda01",
    "mm/tall/nohw": "d48bdb9321ccada1",
    "mm/open/plain": "1c095d5d712b4dcf",
    "mm/open/butt": "ca84e28294152431",
    "mm/open/fixed": "a2efcdf887444fab",
    "mm/open/inset": "1c095d5d712b4dcf",
    "mm/open/band": "f4c507b8606a0f15",
    "mm/open/nohw": "1c095d5d712b4dcf",
  };
  it("every plan is byte-for-byte what it was", () => {
    const variants: Record<string, Partial<Sizes>> = { plain: {}, butt: { dados: false }, fixed: { shelfType: "fixed" }, inset: { front: "inset" }, band: { band: true }, nohw: { hardware: false } };
    const got: Record<string, string> = {};
    for (const metric of [false, true])
      for (const p of PRESETS)
        for (const [v, o] of Object.entries(variants)) {
          const s = normalize({ ...applyPreset(defaults(metric), p.id, metric), ...o }, metric);
          got[`${metric ? "mm" : "in"}/${p.id}/${v}`] = createHash("sha256").update(JSON.stringify(plan(s, metric))).digest("hex").slice(0, 16);
        }
    expect(got).toEqual(PINNED);
    for (const metric of [false, true]) expect(defaults(metric)).toMatchObject({ dados: true, fastener: "none", lineBoring: "shelves", confirmatLength: 50 });
  });
});
