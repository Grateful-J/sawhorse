import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { applyPreset, backInsetOf, BINS, binRoom, defaults, flatImportOp, grainFor, importOp, normalize, phrase, plan, PRESETS, RUNNERS, RUNNERS_EU, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";

const IN = 0.0254;
const MM = 0.001;
const GAP = IN / 32;

function inches(n: number) {
  return Math.round((n / IN) * 1000) / 1000;
}

/** Thickness, width, length in inches, the way the cut list sorts a blank. */
function blank(size: number[]) {
  return [...size].map(inches).sort((a, b) => a - b);
}

// Fixed shelves unless a test asks: most tests count the dados and holes in a side, and pin
// holes would swamp them (adjustable shelves have their own tests).
const imperial = (o: Partial<Sizes> = {}) => normalize({ ...defaults(false), shelfType: "fixed", ...o }, false);
const ok = (s: Sizes, metric = false) => {
  const p = plan(s, metric);
  expect(p.error).toBeNull();
  for (const part of p.parts) {
    const a = audit(part.mesh);
    expect(a.problems, `${part.name}: ${a.problems.join("; ")}`).toEqual([]);
    expect(a.volume, part.name).toBeGreaterThan(0);
  }
  return p;
};
const named = (parts: Part[], name: string) => parts.filter((p) => p.name === name);
/** The mesh's points with one coordinate at `v` (within a micrometre). */
const on = (part: Part, axis: number, v: number) => part.mesh.positions.filter((p) => Math.abs(p[axis] - v) < 1e-6);
/** Centres of the round holes (16-gon rings) in a part's mesh at one coordinate: ring points
 * cluster, a box's own corners and grid points do not. */
const rings = (part: Part, axis: number, v: number) => {
  const others = [0, 1, 2].filter((k) => k !== axis);
  const out: [number, number][] = [];
  // Each inner ring of a face (a hole's mouth) lying in the plane, whatever its number of sides.
  for (const f of part.mesh.faces) {
    for (const ring of f.slice(1)) {
      const pts = ring.map((i) => part.mesh.positions[i]);
      if (!pts.every((p) => Math.abs(p[axis] - v) < 1e-6)) continue;
      out.push(others.map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length) as [number, number]);
    }
  }
  return out;
};
/** The points of the faces lying wholly in one plane (a groove's floor). */
const floorOf = (part: Part, axis: number, v: number) =>
  part.mesh.faces.filter((f) => f[0].every((i) => Math.abs(part.mesh.positions[i][axis] - v) < 1e-6)).flatMap((f) => f[0].map((i) => part.mesh.positions[i]));

describe("cabinet carcass", () => {
  it("the defaults are what a CNC shop builds: measured 3/4 ply, blind dados, hardware drilled, fronts of door stock", () => {
    for (const metric of [false, true]) {
      const d = defaults(metric);
      expect(d.dados).toBe(true);
      expect(d.hardware).toBe(true);
      expect(d.frontThickness).toBe(d.thickness);
      expect(d.cupDistance).toBeCloseTo(5 * MM, 12);
    }
    // A metric base is 870 overall with its toe kick: a 720 carcass on a plinth.
    expect(defaults(true).height).toBeCloseTo(870 * MM, 12);
    expect(applyPreset(defaults(true), "base", true).height).toBeCloseTo(870 * MM, 12);
    expect(applyPreset(defaults(true), "wall", true).height).toBeCloseTo(720 * MM, 12);
    ok(defaults(false));
    ok(defaults(true), true);
  });

  it("every starting point makes a cabinet with the defaults, in inches and in millimetres, on either runner", () => {
    for (const metric of [false, true]) {
      for (const p of PRESETS) {
        for (const slides of ["tandem", "movento"] as const) ok({ ...applyPreset(defaults(metric), p.id, metric), slides }, metric);
      }
    }
  });

  it("a butt-jointed shelf cabinet of measured 3/4 ply on a notched toe kick, the back in grooves", () => {
    const s = imperial({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, shelves: 3, dados: false, hardware: false });
    expect(s.thickness).toBeCloseTo((23 / 32) * IN, 12);
    expect(s.name).toBe("Cabinet 1");
    expect(phrase(s, (m) => String(inches(m)), false)).toBe("30 × 72 × 12, open, 3 fixed shelves");
    const p = ok(s);
    const row = (name: string) => {
      const part = p.parts.find((x) => x.name === name)!;
      return [part.copies.length, blank(part.blank)];
    };
    const t = (23 / 32) * IN;
    const inner = 30 * IN - 2 * t;
    const bT = (7 / 32) * IN;
    const bgd = (5 / 16) * IN;
    expect(row("Left side")).toEqual([1, [0.719, 12, 72]]);
    expect(row("Right side")).toEqual([1, [0.719, 12, 72]]);
    // The top and bottom run to the back edge (they carry the back's groove); a shelf stops at the back.
    expect(row("Top")).toEqual([1, [0.719, 12, inches(inner)]]);
    expect(row("Shelf")).toEqual([3, [0.719, inches(12 * IN - 0.5 * IN - bT - GAP), inches(inner)]]);
    expect(row("Back")).toEqual([1, blank([inner + 2 * (bgd - GAP), bT, 72 * IN - 4 * IN - 2 * t + 2 * bgd - 2 * GAP])]);
    expect(row("Toe kick")).toEqual([1, [0.719, 4, inches(inner)]]);
    expect(p.parts.map((x) => x.name)).toEqual(["Left side", "Right side", "Top", "Bottom", "Shelf", "Back", "Toe kick"]);
    for (const part of p.parts) expect(part.material).toMatch(/plywood/);
    // The back's groove: in each side's inner face, 1/2 in from the rear, the back plus the fit wide.
    const left = named(p.parts, "Left side")[0];
    const floor = floorOf(left, 0, t - bgd);
    const ys = floor.map((q) => q[1]);
    expect(Math.min(...ys)).toBeCloseTo(12 * IN - 0.5 * IN - bT - s.fit / 2, 9);
    expect(Math.max(...ys)).toBeCloseTo(12 * IN - 0.5 * IN + s.fit / 2, 9);
  });

  it("a back between the sides is the old butt joint", () => {
    const p = ok(imperial({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, backMount: "butt", dados: false }));
    const t = (23 / 32) * IN;
    expect(blank(named(p.parts, "Back")[0].blank)).toEqual(blank([30 * IN - 2 * t, (7 / 32) * IN, 68 * IN]));
    expect(blank(named(p.parts, "Top")[0].blank)).toEqual(blank([30 * IN - 2 * t, 12 * IN - (7 / 32) * IN, t]));
    expect(on(named(p.parts, "Left side")[0], 0, t - (5 / 16) * IN)).toEqual([]);
  });

  it("no toe kick: plain sides, the bottom on the floor, nothing to set back", () => {
    const s = imperial({ base: "none", back: false, dados: false });
    expect(phrase(s, (m) => String(inches(m)), false)).toContain("no toe kick");
    const p = ok(s);
    expect(p.parts.map((x) => x.name)).not.toContain("Toe kick");
    expect(p.parts[0].mesh.faces).toHaveLength(6);
    expect(named(p.parts, "Bottom")[0].copies[0].at[2]).toBe(0);
  });

  it("blind dados are cut to the stock plus the fit, stop where asked, and the rails' notches clear the bit", () => {
    const s = imperial({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, shelves: 3, dados: true, back: false, dadoStop: 0.75 * IN });
    const p = ok(s);
    const t = s.thickness;
    const tongue = s.dadoDepth - 0.5 * MM;
    const top = named(p.parts, "Top")[0];
    expect(top.blank[0]).toBeCloseTo(30 * IN - 2 * t + 2 * tongue, 12);
    const notchLen = 0.75 * IN + s.bit;
    const a = audit(top.mesh);
    expect(a.volume).toBeCloseTo(top.blank[0] * top.blank[1] * t - 2 * tongue * notchLen * t, 12);
    // Five grooves in each side, t + fit wide, a dado deep, from the stop to the back; the
    // top one runs out of the top edge, so it loses half the fit.
    const side = audit(named(p.parts, "Left side")[0].mesh);
    const run = 12 * IN - 0.75 * IN;
    const full = t * 12 * IN * 72 * IN - t * 3 * IN * 4 * IN;
    // The bottom groove's lower half-fit overlaps the toe notch between the stop and 3 in.
    const overlap = s.dadoDepth * (3 * IN - 0.75 * IN) * (s.fit / 2);
    expect(full - side.volume).toBeCloseTo(s.dadoDepth * run * (5 * (t + s.fit) - s.fit / 2) - overlap, 12);
    // The left side is grooved in its inner face (x = t), the right in its (x = 0).
    const left = named(p.parts, "Left side")[0];
    const right = named(p.parts, "Right side")[0];
    expect(on(left, 0, t - s.dadoDepth).length).toBeGreaterThan(0);
    expect(on(left, 0, s.dadoDepth)).toEqual([]);
    expect(on(right, 0, s.dadoDepth).length).toBeGreaterThan(0);
  });

  it("dados and the back's groove go together, at different depths so each has its own layer", () => {
    ok(imperial({ layout: "mixed", drawers: 2, dados: true, hardware: true }));
    expect(plan(imperial({ dados: true, backGrooveDepth: 0.25 * IN }), false).error).toMatch(/different depth/);
  });

  it("refuses a dado deeper than half the stock, and a cabinet the stock cannot make", () => {
    expect(plan(imperial({ dados: true, dadoDepth: 0.5 * IN }), false).error).toMatch(/half/);
    expect(plan(imperial({ width: 1 * IN }), false).error).toMatch(/width/i);
    expect(plan(imperial({ layout: "drawers", drawers: 0 }), false).error).toMatch(/drawer/i);
  });
});

describe("fronts", () => {
  it("overlay fronts tile the face with the gap asked for, all one height, none overlapping; drawer fronts are door stock on their own material", () => {
    const s = imperial({ layout: "drawers", drawers: 3, gap: (3 / 32) * IN });
    const p = ok(s);
    const fronts = named(p.parts, "Drawer front").flatMap((f) => f.copies.map((c) => ({ z0: c.at[2], z1: c.at[2] + f.blank[2], y: c.at[1], t: f.blank[1], material: f.material })));
    fronts.sort((a, b) => a.z0 - b.z0);
    expect(fronts).toHaveLength(3);
    expect(fronts[0].z0).toBeCloseTo(s.toeKick + (3 / 64) * IN, 9);
    expect(fronts[2].z1).toBeCloseTo(s.height - (3 / 64) * IN, 9);
    for (let i = 1; i < 3; i++) expect(fronts[i].z0 - fronts[i - 1].z1).toBeCloseTo((3 / 32) * IN, 9);
    // A drawer cabinet's fronts are equal, as a shop lays them out.
    const h = (s.height - s.toeKick - 3 * (3 / 32) * IN) / 3;
    for (const f of fronts) {
      expect(f.z1 - f.z0).toBeCloseTo(h, 9);
      expect(f.t).toBeCloseTo((23 / 32) * IN, 12);
      expect(f.y).toBeCloseTo(-(23 / 32) * IN, 12);
      expect(f.material).toBe("Drawer front plywood");
    }
  });

  it("hinge cups are 35 mm, 13 mm deep, in the door's back face, 17.5 mm plus the boring distance from the hinge edge", () => {
    const s = imperial({ layout: "doors", hardware: true, doorPull: "none" });
    const p = ok(s);
    const door = named(p.parts, "Door")[0];
    expect(door.material).toBe("Door plywood");
    expect(door.blank[1]).toBeCloseTo(s.thickness, 12);
    // The door hangs in front of the cabinet: its back face (y = t) is against the carcass.
    expect(door.copies[0].at[1]).toBeCloseTo(-s.thickness, 12);
    const cups = rings(door, 1, s.thickness);
    expect(cups).toHaveLength(2);
    for (const [x] of cups) expect(x).toBeCloseTo(22.5 * MM, 6);
    // Its plate on the left side, 37 mm back, two holes 32 mm apart per hinge.
    const left = named(p.parts, "Left side")[0];
    expect(rings(left, 0, s.thickness)).toHaveLength(4);
    expect(rings(named(p.parts, "Right side")[0], 0, 0)).toEqual([]);
    // Another boring distance moves the cups.
    const k6 = ok(imperial({ layout: "doors", hardware: true, doorPull: "none", cupDistance: 6 * MM }));
    for (const [x] of rings(named(k6.parts, "Door")[0], 1, s.thickness)) expect(x).toBeCloseTo(23.5 * MM, 6);
    expect(plan(imperial({ layout: "doors", hardware: true, cupDistance: 8 * MM }), false).error).toMatch(/3 to 7 mm/);
  });

  it("a door pull goes on the opening edge, vertical or horizontal, from the top or the bottom", () => {
    const base = { layout: "doors" as const, hardware: true, doorPullEdge: 1.5 * IN, doorPullEnd: 2.5 * IN, doorPullSpacing: 3 * IN };
    const holes = (o: Partial<Sizes>) => {
      const p = ok(imperial({ ...base, ...o }));
      const door = named(p.parts, "Door")[0];
      // Through holes: a ring in the show face (y = 0).
      return { fw: door.blank[0], fh: door.blank[2], at: rings(door, 1, 0).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
    };
    const v = holes({ doorPull: "vertical", doorPullFrom: "top" });
    expect(v.at).toHaveLength(2);
    for (const [x] of v.at) expect(x).toBeCloseTo(v.fw - 1.5 * IN, 6);
    expect(v.at.map(([, z]) => z).sort((a, b) => a - b)).toEqual([expect.closeTo(v.fh - 5.5 * IN, 6), expect.closeTo(v.fh - 2.5 * IN, 6)]);
    const low = holes({ doorPull: "vertical", doorPullFrom: "bottom" });
    expect(low.at.map(([, z]) => z).sort((a, b) => a - b)).toEqual([expect.closeTo(2.5 * IN, 6), expect.closeTo(5.5 * IN, 6)]);
    const h = holes({ doorPull: "horizontal" });
    expect(h.at.map(([x]) => x)).toEqual([expect.closeTo(h.fw - 4.5 * IN, 6), expect.closeTo(h.fw - 1.5 * IN, 6)]);
    for (const [, z] of h.at) expect(z).toBeCloseTo(h.fh - 2.5 * IN, 6);
    expect(holes({ doorPull: "none" }).at).toEqual([]);
    // A pull on the hinge cups is refused.
    expect(plan(imperial({ ...base, doorPull: "horizontal", doorPullEdge: 20 * IN, hingeInset: 2.5 * IN }), false).error).toMatch(/hinge cup|lands/);
  });

  it("a door wider than 24 in is a pair, each hinged on its own side, its pull at the middle", () => {
    const p = ok(imperial({ layout: "doors", width: 36 * IN, hardware: true }));
    const left = named(p.parts, "Left door")[0];
    const right = named(p.parts, "Right door")[0];
    expect(rings(named(p.parts, "Right side")[0], 0, 0)).toHaveLength(4);
    for (const [x] of rings(left, 1, 0)) expect(x).toBeCloseTo(left.blank[0] - 1.5 * IN, 6);
    for (const [x] of rings(right, 1, 0)) expect(x).toBeCloseTo(1.5 * IN, 6);
  });

  it("drawer pulls: centred, down from the top, or a finger notch with the sub-front cut lower", () => {
    const front = (o: Partial<Sizes>) => {
      const p = ok(imperial({ layout: "drawers", drawers: 2, hardware: true, ...o }));
      return { p, f: named(p.parts, "Drawer front")[0] };
    };
    const c = front({ drawerPull: "center" });
    const cz = rings(c.f, 1, 0).map(([, z]) => z);
    expect(cz).toHaveLength(2);
    for (const z of cz) expect(z).toBeCloseTo(c.f.blank[2] / 2, 6);
    const t = front({ drawerPull: "top", drawerPullFromTop: 2 * IN });
    for (const [, z] of rings(t.f, 1, 0)) expect(z).toBeCloseTo(t.f.blank[2] - 2 * IN, 6);
    const n = front({ drawerPull: "notch", notchWidth: 4 * IN, notchDepth: 1 * IN });
    expect(rings(n.f, 1, 0)).toEqual([]);
    const [fw, tf, fh] = n.f.blank;
    expect(audit(n.f.mesh).volume).toBeCloseTo(fw * tf * fh - 4 * IN * tf * 1 * IN, 12);
    const sub = named(n.p.parts, "Drawer sub-front")[0];
    expect(audit(sub.mesh).volume).toBeLessThan(sub.blank[0] * sub.blank[1] * sub.blank[2] - 4 * IN * sub.blank[1] * 1 * IN);
    expect(n.p.rows.some((r) => /Finger notch/.test(r[1]))).toBe(true);
  });

  it("drawers over a door: the drawers on top at the front height asked for, the door under them, flush", () => {
    const s = imperial({ layout: "mixed", drawers: 1, shelves: 1, gap: 0.125 * IN });
    const p = ok(s);
    const door = named(p.parts, "Door")[0];
    const front = named(p.parts, "Drawer front")[0];
    const dz = door.copies[0].at[2];
    const fz = front.copies[0].at[2];
    expect(fz).toBeGreaterThan(dz);
    expect(front.blank[2]).toBeCloseTo(6 * IN, 9);
    expect(fz + front.blank[2]).toBeCloseTo(s.height - 0.0625 * IN, 9);
    expect(dz).toBeCloseTo(s.toeKick + 0.0625 * IN, 9);
    expect(fz - (dz + door.blank[2])).toBeCloseTo(0.125 * IN, 9);
    // Same face plane: no step between the drawer front and the door.
    expect(front.copies[0].at[1]).toBeCloseTo(door.copies[0].at[1], 12);
    // The shelf is behind the door, not the drawer.
    const shelf = named(p.parts, "Shelf")[0].copies[0].at[2];
    expect(shelf).toBeLessThan(dz + door.blank[2]);
    expect(plan(imperial({ layout: "mixed", drawers: 4, drawerFront: 8 * IN }), false).error).toMatch(/door under/);
  });

  it("two holes in a side never run into each other", () => {
    // A hinge cup pulled right up under the drawer puts its plate on the runner's 37 mm line.
    const s = imperial({ layout: "mixed", drawers: 1, shelves: 0, hardware: true, hingeInset: 25 * MM, drawerFront: 5 * IN });
    const p = plan(s, false);
    if (p.error) expect(p.error).toMatch(/runs into|lands on/);
    else {
      const right = named(p.parts, "Left side")[0];
      const holes = rings(right, 0, s.thickness);
      for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) expect(Math.hypot(holes[i][0] - holes[j][0], holes[i][1] - holes[j][1])).toBeGreaterThan(5 * MM);
    }
  });

  it("says when the holes are smaller than the bit", () => {
    const p = ok(imperial({ layout: "doors", hardware: true }));
    expect(p.rows.some((r) => r[4] === "Change bit" && /5 mm holes are smaller than/.test(r[1]))).toBe(true);
    expect(ok(imperial({ layout: "doors", hardware: true, bit: 3 * MM })).rows.some((r) => /holes are smaller/.test(r[1]))).toBe(false);
  });

  it("refuses hinge cups in door stock thinner than 16 mm", () => {
    expect(plan(imperial({ layout: "doors", hardware: true, thickness: 0.5 * IN, backMount: "butt" }), false).error).toMatch(/13 mm deep/);
  });

  it("a hinge plate slides off a shelf rather than land on it", () => {
    // A cup 1 in up the door puts its plate on the bottom's dado.
    const s = imperial({ layout: "doors", dados: true, hardware: true, hingeInset: 1 * IN });
    const p = ok(s);
    expect(p.rows.some((r) => /moved/.test(r[1]))).toBe(true);
  });
});

describe("Blum drawers", () => {
  // Three equal fronts: the bottom drawer's opening is its pitch less the bottom's thickness.
  const mixed = imperial({ layout: "drawers", drawers: 3, width: 18 * IN, depth: 23 * IN, dados: true, hardware: true });
  const pitch = (34.5 * IN - 4 * IN) / 3;
  const ds = (15 / 32) * IN;
  const bT = (7 / 32) * IN;

  it("TANDEM 563H: inside width opening - 42, height opening - 21, 13 mm recess, 21 in runner, a slide-in bottom", () => {
    const p = ok(mixed);
    expect(p.runner?.part).toBe("563H5330B");
    const opening = 18 * IN - 2 * mixed.thickness;
    const side = named(p.parts, "Drawer side")[0];
    expect(side.blank[0]).toBeCloseTo(ds, 12);
    expect(side.blank[1]).toBeCloseTo(533 * MM, 12);
    const boxH = Math.floor((pitch - mixed.thickness - 21 * MM) / (IN / 16) + 1e-6) * (IN / 16);
    expect(side.blank[2]).toBeCloseTo(boxH, 12);
    // The bottom groove starts 13 mm up, the bottom plus the fit wide.
    expect(on(side, 2, 13 * MM).length).toBeGreaterThan(0);
    expect(on(side, 2, 13 * MM + bT + mixed.fit).length).toBeGreaterThan(0);
    // The back sits on the bottom: no groove, no notch, just shorter.
    const back = named(p.parts, "Drawer back")[0];
    expect(back.blank[0]).toBeCloseTo(opening - 42 * MM, 12);
    expect(back.blank[2]).toBeCloseTo(boxH - 13 * MM - bT - mixed.fit, 12);
    expect(back.mesh.faces).toHaveLength(6 + 2 * 17);
    // The bottom runs from the sub-front's groove to the back of the box.
    const bottom = named(p.parts, "Drawer bottom")[0];
    const gd = Math.min(ds / 2, 0.25 * IN);
    expect(bottom.blank[1]).toBeCloseTo(533 * MM - ds + gd - GAP, 12);
    expect(bottom.blank[0]).toBeCloseTo(opening - 42 * MM + 2 * (gd - GAP), 12);
    // Runner screws 37 mm above the opening at 37, 261 and 517 mm from the front.
    const right = named(p.parts, "Right side")[0];
    const holes = rings(right, 0, 0);
    for (const y of [37, 261, 517]) expect(holes.some(([hy]) => Math.abs(hy - y * MM) < 1e-6)).toBe(true);
    const z = 4 * IN + mixed.thickness + 37 * MM;
    expect(holes.some(([, hz]) => Math.abs(hz - z) < 1e-6)).toBe(true);
    const text = p.rows.map((r) => r.join(" ")).join("\n");
    expect(text).toContain("rear hook holes");
    expect(text).toContain("slides in from the back");
    expect(text).toMatch(/narrower than the .* bit/);
  });

  it("MOVENTO 763H: 38 mm screw line, 23 mm off the height, and 3 mm forward for 1/2 in sides", () => {
    const s = { ...mixed, slides: "movento" as const };
    const p = ok(s);
    expect(p.runner?.part).toBe("763H5330S");
    const want = Math.floor((pitch - s.thickness - 23 * MM) / (IN / 16) + 1e-6) * (IN / 16);
    expect(named(p.parts, "Drawer side")[0].blank[2]).toBeCloseTo(want, 12);
    expect(p.rows.some((r) => /at 34, 258, 514 mm from front, 38 mm above/.test(r[1]))).toBe(true);
    // 16 mm sides keep Blum's own numbers.
    const thick = ok({ ...s, drawerThickness: 16 * MM });
    expect(thick.rows.some((r) => /at 37, 261, 517 mm from front, 38 mm above/.test(r[1]))).toBe(true);
  });

  it("rear hook holes: in the drawer back's rear face, 7 mm from the sides' inside faces, 24 mm above the box bottom, 6 x 10 mm", () => {
    const p = ok(mixed);
    const back = named(p.parts, "Drawer back")[0];
    const [inside, ds] = back.blank;
    // Back coordinates: x along it, y its thickness (rear face y = ds), z up from its bottom edge.
    const holes = rings(back, 1, ds);
    const up = 24 * MM - (13 * MM + bT + mixed.fit);
    expect(holes.map(([x]) => Math.round(x / MM * 1000) / 1000).sort((a, b) => a - b)).toEqual([7, Math.round((inside / MM - 7) * 1000) / 1000]);
    for (const [, z] of holes) expect(z).toBeCloseTo(up, 9);
    // 10 deep: the floor is 10 mm in from the rear face.
    expect(rings(back, 1, ds - 10 * MM)).toHaveLength(0);
    expect(on(back, 1, ds - 10 * MM).length).toBe(32);
    expect(p.rows.find((r) => /rear hook/.test(r[1]))?.[4]).toBe("CNC");
    // A bottom thick enough to put the hole in the joint is refused.
    expect(plan({ ...mixed, backThickness: 0.5 * IN }, false).error).toMatch(/rear hook hole/);
  });

  it("hinge plate holes are 11.5 mm deep (Blum's pre-mounted system screws); runner screws 13", () => {
    const p = ok(imperial({ layout: "mixed", drawers: 1, hardware: true }));
    expect(p.rows.filter((r) => /Hinge plate/.test(r[1])).every((r) => r[3] === "11.5 mm")).toBe(true);
    expect(p.rows.filter((r) => /runner screws at/.test(r[1])).every((r) => r[3] === "13 mm")).toBe(true);
    expect(p.rows.some((r) => /T51\.1901.*2\.5 mm pilot holes.*75 degrees/.test(r[1]))).toBe(true);
  });

  it("picks the longest runner the depth allows, and refuses one that does not fit", () => {
    expect(ok(imperial({ layout: "drawers", depth: 18 * IN })).runner?.nl).toBe(381);
    expect(plan(imperial({ layout: "drawers", depth: 18 * IN, runner: 533 }), false).error).toMatch(/needs 557 mm/);
    expect(plan(imperial({ layout: "drawers", depth: 12 * IN, slides: "movento" }), false).error).toMatch(/too shallow/);
  });

  it("refuses drawer sides Blum does not take, and a box too narrow for the locking devices", () => {
    expect(plan(imperial({ layout: "drawers", drawerThickness: 0.75 * IN }), false).error).toMatch(/12 to 16 mm/);
    expect(plan(imperial({ layout: "drawers", width: 8 * IN }), false).error).toMatch(/170 mm/);
  });

  it("every runner in the table has its frameless screws on the System 32 grid from 37 mm", () => {
    for (const line of [RUNNERS, RUNNERS_EU]) for (const r of Object.values(line)) for (const l of r.lengths) for (const v of l.screws) expect((v - 37) % 32).toBe(0);
  });
});

describe("old settings and the import", () => {
  it("an older save keeps working: its pull, a zero toe kick is no toe kick, unknown keys dropped", () => {
    const s = normalize({ pull: "undermount", toeKick: 0, slideClearance: 0.02 } as never, false);
    expect(s.drawerPull).toBe("none");
    expect(s.base).toBe("none");
    expect("slideClearance" in s).toBe(false);
    expect("pull" in s).toBe(false);
    expect(normalize({ pull: "face" } as never, false).drawerPull).toBe("center");
    expect(normalize({ name: "  " } as never, false).name).toBe("Cabinet 1");
  });

  it("the import names the cabinet, puts each part on its plywood material and defines only the materials asked for", () => {
    const p = ok(imperial({ layout: "mixed", drawers: 1 }));
    const op = importOp(p.parts, [0, 0, 0], "Sink base 24 x 34.5 x 24", "Sink base", [{ name: "Cabinet plywood", color: [1, 2, 3, 255] }]) as unknown as {
      definitions: { items: { material?: string }[] }[];
      nodes: { name: string }[];
      materials?: { name: string }[];
    };
    expect(op.nodes[0].name).toBe("Sink base");
    expect(op.materials?.map((m) => m.name)).toEqual(["Cabinet plywood"]);
    const mats = new Set(op.definitions.flatMap((d) => d.items.map((i) => i.material)).filter(Boolean));
    expect([...mats].sort()).toEqual(["Back plywood", "Cabinet plywood", "Door plywood", "Drawer box plywood", "Drawer front plywood"]);
    expect(importOp(p.parts, undefined, "a", "b")).not.toHaveProperty("materials");
  });
});

describe("doors, nailers and the trash pull-out", () => {
  it("doors with no shelves, one door or two, hinged on the side asked for, the pull on the other", () => {
    const none = imperial({ layout: "doors", shelves: 0 });
    expect(phrase(none, (m) => String(inches(m)), false)).toContain("doors, no shelves");
    expect(named(ok(none).parts, "Shelf")).toEqual([]);
    const right = ok(imperial({ layout: "doors", hardware: true, hingeSide: "right" }));
    const door = named(right.parts, "Door")[0];
    const fw = door.blank[0];
    for (const [x] of rings(door, 1, door.blank[1]).filter(([x]) => x > fw / 2)) expect(x).toBeCloseTo(fw - 22.5 * MM, 6);
    for (const [x] of rings(door, 1, 0)) expect(x).toBeCloseTo(1.5 * IN, 6);
    expect(rings(named(right.parts, "Right side")[0], 0, 0)).toHaveLength(4);
    expect(rings(named(right.parts, "Left side")[0], 0, (23 / 32) * IN)).toEqual([]);
    // Hinged left (the default), the plates are in the left side's inner face.
    expect(rings(named(ok(imperial({ layout: "doors", hardware: true })).parts, "Left side")[0], 0, (23 / 32) * IN)).toHaveLength(4);
    expect(named(ok(imperial({ layout: "doors", width: 36 * IN, doors: "one" })).parts, "Door")).toHaveLength(1);
    const two = ok(imperial({ layout: "doors", width: 18 * IN, doors: "two" }));
    expect(named(two.parts, "Left door")).toHaveLength(1);
    expect(named(two.parts, "Right door")).toHaveLength(1);
  });

  it("rear nailers sit behind the back at the rear edge, in dados with blind dados on", () => {
    const s = imperial({ layout: "doors", width: 30 * IN, height: 30 * IN, depth: 12 * IN, base: "none", nailers: "both", nailerHeight: 3 * IN, dados: true });
    const p = ok(s);
    const t = s.thickness;
    const top = named(p.parts, "Top nailer")[0];
    const bottom = named(p.parts, "Bottom nailer")[0];
    expect(top.copies[0].at[1]).toBeCloseTo(12 * IN - t, 12);
    expect(top.copies[0].at[2]).toBeCloseTo(30 * IN - t - 3 * IN, 12);
    expect(bottom.copies[0].at[2]).toBeCloseTo(t, 12);
    expect(top.blank[0]).toBeCloseTo(30 * IN - 2 * t + 2 * (s.dadoDepth - 0.5 * MM), 12);
    // The back moves in to clear them.
    expect(backInsetOf(s)).toBeCloseTo(t + s.fit, 12);
    expect(named(p.parts, "Back")[0].copies[0].at[1]).toBeCloseTo(12 * IN - t - s.fit - s.backThickness, 12);
    expect(plan({ ...s, backMount: "butt" }, false).error).toMatch(/nailers sit behind the back/);
    // No back: the shelves stop at the nailers.
    const open = ok({ ...s, back: false });
    expect(named(open.parts, "Shelf")[0].blank[1]).toBeCloseTo(12 * IN - t - GAP, 12);
  });

  it("a trash pull-out: one tall front, a low tray, tall uprights and a frame cut for the bins", () => {
    // Bins measured by hand, two front to back in a deep EU-runner box.
    const s = imperial({ layout: "trash", width: 18 * IN, depth: 26 * IN, catalog: "eu", trashBins: "deep", bin: "custom", binWidth: 11 * IN, binLength: 8.5 * IN, binHeight: 17 * IN, trayHeight: 6 * IN });
    const p = ok(s);
    expect(named(p.parts, "Drawer front")).toHaveLength(1);
    expect(named(p.parts, "Drawer front")[0].blank[2]).toBeCloseTo(34.5 * IN - 4 * IN - IN / 8, 9);
    for (const side of named(p.parts, "Drawer side")) expect(side.blank[2]).toBeCloseTo(6 * IN, 12);
    const sub = named(p.parts, "Drawer sub-front")[0];
    expect(sub.blank[2]).toBeGreaterThan(20 * IN);
    const frame = named(p.parts, "Bin frame")[0];
    const [fw, fl, ft] = frame.blank;
    // Two cutouts, and the corners notched beside the tongue that goes through the back.
    const ds = s.drawerThickness;
    expect(audit(frame.mesh).volume).toBeCloseTo(fw * fl * ft - 2 * 11 * IN * 8.5 * IN * ft - 2 * IN * ds * ft, 12);
    // The back: a through slot a bit longer each end than the tongue, and the two hook holes,
    // all from one face: no pocket in its front face, so no second setup.
    const back = named(p.parts, "Drawer back")[0];
    const [bw, bd, bh] = back.blank;
    const slot = (fw - 2 * IN + 2 * s.bit) * bd * (ds + s.fit);
    const hook = 8 * (3 * MM) ** 2 * Math.sin((2 * Math.PI) / 16) * 10 * MM;
    expect(audit(back.mesh).volume).toBeCloseTo(bw * bd * bh - slot - 2 * hook, 12);
    expect(p.rows.some((r) => /through a slot in the back/.test(r[1]))).toBe(true);
    expect(p.rows.some((r) => /2 bin cutouts/.test(r[1]))).toBe(true);
    // Two side by side do not fit an 18 in cabinet at 11 in each.
    expect(plan({ ...s, trashBins: "side" }, false).error).toMatch(/bins do not fit/);
    // Bins taller than the pull-out are refused.
    expect(plan({ ...s, binHeight: 40 * IN }, false).error).toMatch(/do not fit/);
    expect(phrase(s, (m) => String(inches(m)), false)).toContain("trash pull-out, two bins front to back");
  });

  it("every starting point builds, and the wall cabinet hangs on nailers", () => {
    for (const preset of PRESETS) {
      const s = applyPreset(imperial({ dados: true, hardware: true }), preset.id, false);
      const p = plan(s, false);
      expect(p.error, preset.id).toBeNull();
    }
    const wall = applyPreset(imperial(), "wall", false);
    expect(wall.nailers).toBe("both");
    expect(wall.doorPullFrom).toBe("bottom");
    expect(applyPreset(imperial(), "trash", false).drawerPull).toBe("top");
    expect(applyPreset({ ...imperial(), name: "Base 4" }, "sink", false).name).toBe("Sink base 4");
  });
});

describe("tops, shelves, drawer heights and catalogues", () => {
  it("a stretcher top: two stretchers, the front notched for the dado stop, the rear carrying the back's groove", () => {
    const s = imperial({ layout: "doors", top: "stretchers", stretcher: 4 * IN, dados: true });
    const p = ok(s);
    expect(named(p.parts, "Top")).toEqual([]);
    const front = named(p.parts, "Front stretcher")[0];
    const rear = named(p.parts, "Rear stretcher")[0];
    expect(front.blank[1]).toBeCloseTo(4 * IN, 12);
    expect(front.copies[0].at[1]).toBe(0);
    expect(rear.copies[0].at[1] + rear.blank[1]).toBeCloseTo(s.depth, 12);
    // The front one has the notches (more than a box's 6 faces); the rear one the back's groove.
    expect(front.mesh.faces.length).toBeGreaterThan(6);
    expect(on(rear, 2, (5 / 16) * IN).length).toBeGreaterThan(0);
    expect(applyPreset(defaults(false), "sink", false).top).toBe("stretchers");
    expect(applyPreset(applyPreset(defaults(false), "sink", false), "wall", false).top).toBe("full");
    expect(plan(imperial({ top: "stretchers", stretcher: 0.5 * IN }), false).error).toMatch(/Stretchers/);
  });

  it("adjustable shelves: loose shelves a sliver narrower, on 5 x 10 mm pin holes 37 mm and on the 32 mm grid", () => {
    const s = imperial({ layout: "doors", shelfType: "adjustable", shelves: 1, hardware: true });
    const p = ok(s);
    const shelf = named(p.parts, "Shelf")[0];
    expect(shelf.blank[0]).toBeCloseTo(s.width - 2 * s.thickness - 2 * GAP, 12);
    expect(shelf.mesh.faces).toHaveLength(6);
    const right = named(p.parts, "Right side")[0];
    const holes = rings(right, 0, 0);
    const ys = [...new Set(holes.map(([y]) => Math.round(y / MM)))].sort((a, b) => a - b);
    expect(ys[0]).toBe(37);
    for (const y of ys) expect((y - 37) % 32).toBe(0);
    const zs = [...new Set(holes.map(([, z]) => Math.round(z * 1e6)))].sort((a, b) => a - b).map((z) => z / 1e6);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeCloseTo(32 * MM, 6);
    expect(p.rows.some((r) => /Shelf pin holes/.test(r[1]) && r[2] === "5 mm" && r[3] === "10 mm")).toBe(true);
    // Holes in a band around the shelf: five a row, 32 mm apart (+-64 mm).
    expect(zs).toHaveLength(5);
    // The hinge side keeps its plates: a 48 in cabinet's middle hinge is at its shelf, and the
    // pins under that plate are left out, never the plate.
    const tall = ok(imperial({ layout: "doors", shelfType: "adjustable", shelves: 1, hardware: true, height: 48 * IN }));
    expect(tall.rows.some((r) => /left out where a hinge plate/.test(r[1]))).toBe(true);
    expect(tall.rows.filter((r) => /^Hinge plate/.test(r[1]))).toHaveLength(3);
    // No dado for a loose shelf.
    expect(ok(imperial({ layout: "doors", shelfType: "adjustable", dados: true })).rows.some((r) => /Shelf pin/.test(r[1]))).toBe(true);
  });

  it("graduated drawers: a short top drawer, the rest equal", () => {
    const s = imperial({ layout: "drawers", drawers: 3, drawerFronts: "graduated", drawerFront: 6 * IN, gap: 0.125 * IN });
    const p = ok(s);
    const fronts = named(p.parts, "Drawer front").flatMap((f) => f.copies.map((c) => ({ z: c.at[2], h: f.blank[2] }))).sort((a, b) => a.z - b.z);
    expect(fronts.map((f) => f.h)).toHaveLength(3);
    expect(fronts[2].h).toBeCloseTo(6 * IN, 9);
    expect(fronts[0].h).toBeCloseTo(fronts[1].h, 9);
    expect(fronts[0].h).toBeCloseTo((s.height - s.toeKick - 6.125 * IN) / 2 - 0.125 * IN, 9);
    expect(plan({ ...s, drawerFront: 14 * IN }, false).error).toMatch(/not the shortest/);
  });

  it("Blum's European runners: 560H lengths, the box 10 mm short, NL + 3 inside, its own screw holes", () => {
    const s = normalize({ ...defaults(true), layout: "drawers", drawers: 3 }, true);
    expect(s.catalog).toBe("eu");
    const p = ok(s, true);
    // 560 deep less a 12 mm inset and a 6 mm back is 542 inside: NL 520 (needs 523) is the longest.
    expect(p.runner?.part).toBe("560H5200B");
    expect(named(p.parts, "Drawer side")[0].blank[1]).toBeCloseTo(510 * MM, 12);
    expect(p.rows.some((r) => /runner screws at 37, 69, 261 mm/.test(r[1]))).toBe(true);
    const mov = ok({ ...s, slides: "movento" }, true);
    expect(mov.runner?.part).toBe("760H5201S");
    expect(mov.rows.some((r) => /runner screws at 37, 69, 261, 293 mm/.test(r[1]))).toBe(true);
    // The US catalogue in a metric document still works, by choice.
    expect(ok({ ...s, catalog: "us" }, true).runner?.part).toBe("563H4570B");
  });

  it("hinges: never fewer than Blum's weight bands, one more over 600 mm wide in Blum's European chart", () => {
    const cups = (p: ReturnType<typeof plan>, name = "Door") => p.rows.filter((r) => r[0] === name && /^Hinge cup/.test(r[1])).length;
    const base = imperial({ layout: "doors", shelves: 0, hardware: true });
    expect(cups(ok(base))).toBe(2);
    expect(cups(ok({ ...base, catalog: "eu" }))).toBe(3);
    // A tall door is heavy: an 84 in pantry's 24 in door, about 14 kg, gets the height's 5.
    const tall = imperial({ layout: "doors", shelves: 0, hardware: true, height: 84 * IN });
    expect(cups(ok(tall))).toBe(5);
    expect(ok(tall).rows.some((r) => /5 hinges \(.*kg/.test(r[1]))).toBe(true);
  });
});

describe("grain, bins and placement", () => {
  it("each part's grain: doors vertical, drawer faces across, sides vertical, shelves along their span, the rest free to turn", () => {
    const s = imperial({});
    expect(grainFor(s, "Door", [0.6, 0.018, 0.77])).toBe("length");
    expect(grainFor(s, "Left door", [0.3, 0.018, 0.77])).toBe("length");
    // A wide, short door: vertical runs along its width.
    expect(grainFor(s, "Door", [0.9, 0.018, 0.3])).toBe("width");
    expect(grainFor(s, "Drawer front", [0.6, 0.018, 0.25])).toBe("length");
    // A tall front, grain across: along its width; a trash pull-out's front follows the doors.
    expect(grainFor(s, "Drawer front", [0.45, 0.018, 0.77])).toBe("width");
    expect(grainFor({ ...s, layout: "trash" }, "Drawer front", [0.45, 0.018, 0.77])).toBe("length");
    expect(grainFor(s, "Left side", [0.018, 0.59, 0.87])).toBe("length");
    // A shelf in a narrow, deep cabinet: across the cabinet is its width.
    expect(grainFor(s, "Shelf", [0.27, 0.56, 0.018])).toBe("width");
    for (const n of ["Bottom", "Toe kick", "Back", "Front stretcher", "Drawer side", "Drawer bottom", "Top nailer"]) expect(grainFor(s, n, [0.5, 0.3, 0.018])).toBe("none");
    expect(grainFor({ ...s, grainHidden: "length" }, "Bottom", [0.5, 0.3, 0.018])).toBe("length");
    expect(grainFor({ ...s, grainSides: "any" }, "Right side", [0.018, 0.59, 0.87])).toBe("none");
    expect(grainFor({ ...s, grainFronts: "vertical" }, "Drawer front", [0.6, 0.018, 0.25])).toBe("width");
    const p = ok(imperial({ layout: "mixed", drawers: 1 }));
    expect(named(p.parts, "Toe kick")[0].grain).toBe("none");
    expect(named(p.parts, "Door")[0].grain).toBe("length");
  });

  it("Rev-A-Shelf bins: the drawing's minimum opening plus 1/32 in a side, hung 1/4 in off the floor; a 50 qt in a 24 in cabinet", () => {
    const s = imperial({ layout: "trash", width: 24 * IN, trashBins: "one", bin: "rv50" });
    const p = ok(s);
    const frame = named(p.parts, "Bin frame")[0];
    const [fw, fl, ft] = frame.blank;
    const cut = (13.59 + 1 / 16) * (9.8 + 1 / 16) * IN * IN;
    // The cutout and the two corner notches beside the tongue.
    expect(audit(frame.mesh).volume).toBeCloseTo(fw * fl * ft - cut * ft - 2 * IN * s.drawerThickness * ft, 12);
    const row = p.rows.find((r) => r[0] === "Bin frame")![1];
    expect(row).toContain("Rev-A-Shelf 50 qt (RV-50)");
    expect(row).toContain("13.59 x 9.8 in");
    // Frame top: the bin's height less the rim's drop, plus 1/4 in off the floor.
    expect(row).toContain(`${((21.75 - 1.75 + 0.25) * 25.4).toFixed(1)} mm`);
    expect(BINS.rv35.cut).toEqual([13.16, 9.56]);
  });

  it("bins that cannot fit say why; one turns to fit; two side by side keep their rims apart", () => {
    // Two 35 qt front to back: 20.92 in of rims, 20.05 in between the box's uprights on 21 in runners.
    expect(plan(imperial({ layout: "trash", width: 18 * IN, trashBins: "deep", bin: "rv35" }), false).error).toMatch(/deeper box than a 533 mm/);
    // A 35 qt in a 450 mm cabinet fits only turned, long side front to back.
    const m = normalize({ ...defaults(true), layout: "trash", width: 450 * MM, trashBins: "one", bin: "rv35" }, true);
    expect(plan(m, true).rows.find((r) => r[0] === "Bin frame")?.[1]).toContain("long side front to back");
    // Two side by side in a 30 in cabinet: the web between them is at least the rims' overhang plus 1/8 in.
    const p = ok(imperial({ layout: "trash", width: 30 * IN, trashBins: "side", bin: "rv35" }));
    expect(p.rows.find((r) => r[0] === "Bin frame")?.[1]).toContain("2 bin cutouts");
    expect(plan(imperial({ layout: "trash", width: 24 * IN, trashBins: "side", bin: "rv35" }), false).error).toMatch(/side by side/);
    // A measured bin: the panel says how big a cutout fits.
    const room = binRoom(imperial({ layout: "trash", width: 24 * IN, trashBins: "one", bin: "custom" }), false)!;
    expect(room.across).toBeGreaterThan(18 * IN);
  });

  it("the flat import places every copy at the top level, moved and turned by the cabinet's frame", () => {
    const p = ok(imperial({ layout: "doors", shelves: 1 }));
    const turn = { linear: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [1, 2, 3] as [number, number, number] };
    const op = flatImportOp(p.parts, turn) as unknown as { nodes: { definition: number; xform: { linear: number[][]; translation: number[] } }[] };
    expect(op.nodes).toHaveLength(p.parts.reduce((n, x) => n + x.copies.length, 0));
    const side = p.parts.findIndex((x) => x.name === "Right side");
    const at = p.parts[side].copies[0].at;
    const node = op.nodes.find((n) => n.definition === side)!;
    expect(node.xform.translation[0]).toBeCloseTo(1 - at[1], 12);
    expect(node.xform.translation[1]).toBeCloseTo(2 + at[0], 12);
    expect(node.xform.linear).toEqual(turn.linear);
  });
});

describe("inset fronts", () => {
  // An inset door stands inside the opening, in the first thickness of the cabinet's depth.
  // Shelves that ran to the front would be in the door's way: it could not close.
  const t = (23 / 32) * IN;
  const room = t + 3 * MM;
  it("adjustable shelves start behind the door and its bumpers, and are that much shorter", () => {
    const over = ok(applyPreset(defaults(false), "base", false));
    const inset = ok({ ...applyPreset(defaults(false), "base", false), front: "inset" });
    const shelf = (p: typeof over) => p.parts.find((x) => x.name === "Shelf")!;
    expect(shelf(over).copies[0].at[1]).toBe(0);
    expect(shelf(inset).copies[0].at[1]).toBeCloseTo(room, 12);
    // The same rear end, so the depth is less by what the front gave up.
    expect(shelf(inset).blank[1]).toBeCloseTo(shelf(over).blank[1] - room, 12);
    expect(shelf(inset).blank[0]).toBeCloseTo(shelf(over).blank[0], 12);
    // The door is in the opening: its back face is one thickness in, 3 mm in front of the shelf.
    const door = inset.parts.find((x) => x.name === "Door")!;
    expect(door.copies[0].at[1]).toBe(0);
    expect(door.blank[1]).toBeCloseTo(t, 12);
    expect(inset.rows.some((r) => /Set back .* behind the inset door/.test(r[1]))).toBe(true);
    expect(over.rows.some((r) => /behind the inset door/.test(r[1]))).toBe(false);
  });

  it("fixed shelves too: the shelf and its dados start behind the door, the top and bottom do not", () => {
    const s = { ...applyPreset(imperial(), "base", false), front: "inset" as const, top: "full" as const };
    const p = ok(s);
    const shelf = p.parts.find((x) => x.name === "Shelf")!;
    expect(shelf.copies[0].at[1]).toBeCloseTo(room, 12);
    for (const name of ["Top", "Bottom"]) expect(p.parts.find((x) => x.name === name)!.copies[0].at[1]).toBe(0);
    // In the side, the shelf's dado stops half an inch behind the shelf's front; the top's and
    // the bottom's half an inch behind the cabinet's. A dado's floor is 1/4 in into the side.
    const side = p.parts.find((x) => x.name === "Left side")!;
    const floors = side.mesh.faces.map((rings) => rings[0].map((i) => side.mesh.positions[i])).filter((pts) => pts.every((q) => Math.abs(q[0] - (t - 0.25 * IN)) < 1e-9));
    const frontOf = (name: string) => {
      const z = p.parts.find((x) => x.name === name)!.copies[0].at[2];
      const mine = floors.filter((pts) => pts.every((q) => q[2] > z - 1 * MM && q[2] < z + t + 1 * MM));
      expect(mine.length, name).toBeGreaterThan(0);
      return Math.min(...mine.flatMap((pts) => pts.map((q) => q[1])));
    };
    expect(frontOf("Bottom")).toBeCloseTo(0.5 * IN, 9);
    expect(frontOf("Top")).toBeCloseTo(0.5 * IN, 9);
    expect(frontOf("Shelf")).toBeCloseTo(room + 0.5 * IN, 9);
  });

  it("open shelves and overlay doors keep their shelves at the front; a cabinet too shallow for an inset door says so", () => {
    const open = ok({ ...applyPreset(defaults(false), "open", false), front: "inset" });
    expect(open.parts.find((x) => x.name === "Shelf")!.copies[0].at[1]).toBe(0);
    // Whatever the depth, a shelf behind an inset door is never left a sliver: it is refused first.
    for (const depth of [2.5, 3, 3.5, 4, 5, 8]) {
      const shallow = plan({ ...applyPreset(defaults(false), "base", false), front: "inset", base: "none", top: "full", depth: depth * IN }, false);
      if (shallow.error) expect(shallow.error.length).toBeGreaterThan(10);
      else expect(shallow.parts.find((x) => x.name === "Shelf")!.blank[1]).toBeGreaterThan(2 * t);
    }
    const shallow = plan({ ...applyPreset(defaults(false), "base", false), front: "inset", base: "none", top: "full", hardware: false, depth: 3 * IN }, false);
    if (shallow.error) expect(shallow.error).toMatch(/no depth left behind the inset door|depth|deep/i);
    else expect(shallow.parts.find((x) => x.name === "Shelf")!.blank[1]).toBeGreaterThan(2 * t);
  });
});

