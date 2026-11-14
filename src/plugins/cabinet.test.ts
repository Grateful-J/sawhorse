import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { applyPreset, backInsetOf, defaults, importOp, normalize, phrase, plan, PRESETS, RUNNERS, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";

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

const imperial = (o: Partial<Sizes> = {}) => normalize({ ...defaults(false), ...o }, false);
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
  const ringIds = new Set(part.mesh.faces.flatMap((f) => f.slice(1).flat()));
  const pts = [...ringIds].map((i) => part.mesh.positions[i]).filter((p) => Math.abs(p[axis] - v) < 1e-6);
  const out: [number, number][] = [];
  for (let i = 0; i + 15 < pts.length; i += 16) {
    const ring = pts.slice(i, i + 16);
    out.push(others.map((k) => ring.reduce((sum, p) => sum + p[k], 0) / 16) as [number, number]);
  }
  return out;
};
/** The points of the faces lying wholly in one plane (a groove's floor). */
const floorOf = (part: Part, axis: number, v: number) =>
  part.mesh.faces.filter((f) => f[0].every((i) => Math.abs(part.mesh.positions[i][axis] - v) < 1e-6)).flatMap((f) => f[0].map((i) => part.mesh.positions[i]));

describe("cabinet carcass", () => {
  it("the default is a shelf cabinet of measured 3/4 ply on a notched toe kick, the back in grooves", () => {
    const s = imperial({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, shelves: 3 });
    expect(s.thickness).toBeCloseTo((23 / 32) * IN, 12);
    expect(s.name).toBe("Cabinet 1");
    expect(phrase(s, (m) => String(inches(m)), false)).toBe("30 x 72 x 12, 3 shelves, back, 4 toe kick");
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
    const p = ok(imperial({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, backMount: "butt" }));
    const t = (23 / 32) * IN;
    expect(blank(named(p.parts, "Back")[0].blank)).toEqual(blank([30 * IN - 2 * t, (7 / 32) * IN, 68 * IN]));
    expect(blank(named(p.parts, "Top")[0].blank)).toEqual(blank([30 * IN - 2 * t, 12 * IN - (7 / 32) * IN, t]));
    expect(on(named(p.parts, "Left side")[0], 0, t - (5 / 16) * IN)).toEqual([]);
  });

  it("no toe kick: plain sides, the bottom on the floor, nothing to set back", () => {
    const s = imperial({ base: "none", back: false });
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
  it("overlay fronts tile the face with the gap asked for, none overlapping; drawer fronts are their own stock", () => {
    const s = imperial({ layout: "drawers", drawers: 3, gap: (3 / 32) * IN });
    const p = ok(s);
    const fronts = named(p.parts, "Drawer front").flatMap((f) => f.copies.map((c) => ({ z0: c.at[2], z1: c.at[2] + f.blank[2], y: c.at[1], t: f.blank[1], material: f.material })));
    fronts.sort((a, b) => a.z0 - b.z0);
    expect(fronts).toHaveLength(3);
    expect(fronts[0].z0).toBeCloseTo(s.toeKick + (3 / 64) * IN, 9);
    expect(fronts[2].z1).toBeCloseTo(s.height - (3 / 64) * IN, 9);
    for (let i = 1; i < 3; i++) expect(fronts[i].z0 - fronts[i - 1].z1).toBeCloseTo((3 / 32) * IN, 9);
    for (const f of fronts) {
      expect(f.t).toBeCloseTo((15 / 32) * IN, 12);
      expect(f.y).toBeCloseTo(-(15 / 32) * IN, 12);
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
    for (const [x] of cups) expect(x).toBeCloseTo(22 * MM, 6);
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

  it("refuses hinge cups in door stock thinner than 16 mm", () => {
    expect(plan(imperial({ layout: "doors", hardware: true, thickness: 0.5 * IN, backMount: "butt" }), false).error).toMatch(/13 mm deep/);
  });

  it("a hinge plate slides off a shelf rather than land on it", () => {
    const s = normalize({ ...defaults(true), layout: "mixed", drawers: 2, dados: true, hardware: true }, true);
    const p = ok(s, true);
    expect(p.rows.some((r) => /moved/.test(r[1]))).toBe(true);
  });
});

describe("Blum drawers", () => {
  const mixed = imperial({ layout: "mixed", drawers: 2, width: 18 * IN, depth: 23 * IN, dados: true, hardware: true });
  const ds = (15 / 32) * IN;
  const bT = (7 / 32) * IN;

  it("TANDEM 563H: inside width opening - 42, height opening - 21, 13 mm recess, 21 in runner, a slide-in bottom", () => {
    const p = ok(mixed);
    expect(p.runner?.part).toBe("563H5330B");
    const opening = 18 * IN - 2 * mixed.thickness;
    const side = named(p.parts, "Drawer side")[0];
    expect(side.blank[0]).toBeCloseTo(ds, 12);
    expect(side.blank[1]).toBeCloseTo(533 * MM, 12);
    const interior = 34.5 * IN - 4 * IN - 2 * mixed.thickness;
    const boxH = Math.floor((interior / 3 - 21 * MM) / (IN / 16) + 1e-6) * (IN / 16);
    expect(side.blank[2]).toBeCloseTo(boxH, 12);
    // The bottom groove starts 13 mm up, the bottom plus the fit wide.
    expect(on(side, 2, 13 * MM).length).toBeGreaterThan(0);
    expect(on(side, 2, 13 * MM + bT + mixed.fit).length).toBeGreaterThan(0);
    // The back sits on the bottom: no groove, no notch, just shorter.
    const back = named(p.parts, "Drawer back")[0];
    expect(back.blank[0]).toBeCloseTo(opening - 42 * MM, 12);
    expect(back.blank[2]).toBeCloseTo(boxH - 13 * MM - bT - mixed.fit, 12);
    expect(back.mesh.faces).toHaveLength(6);
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
    expect(text).toContain("Rear hook bore");
    expect(text).toContain("slides in from the back");
    expect(text).toMatch(/narrower than the .* bit/);
  });

  it("MOVENTO 763H: 38 mm screw line, 23 mm off the height, and 3 mm forward for 1/2 in sides", () => {
    const s = { ...mixed, slides: "movento" as const };
    const p = ok(s);
    expect(p.runner?.part).toBe("763H5330S");
    const interior = 34.5 * IN - 4 * IN - 2 * s.thickness;
    const want = Math.floor((interior / 3 - 23 * MM) / (IN / 16) + 1e-6) * (IN / 16);
    expect(named(p.parts, "Drawer side")[0].blank[2]).toBeCloseTo(want, 12);
    expect(p.rows.some((r) => /at 34, 258, 514 mm from front, 38 mm above/.test(r[1]))).toBe(true);
    // 16 mm sides keep Blum's own numbers.
    const thick = ok({ ...s, drawerThickness: 16 * MM });
    expect(thick.rows.some((r) => /at 37, 261, 517 mm from front, 38 mm above/.test(r[1]))).toBe(true);
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
    for (const r of Object.values(RUNNERS)) for (const l of r.lengths) for (const v of [l.a, l.b]) expect((v - 37) % 32).toBe(0);
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
    for (const [x] of rings(door, 1, door.blank[1]).filter(([x]) => x > fw / 2)) expect(x).toBeCloseTo(fw - 22 * MM, 6);
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
    const s = imperial({ layout: "trash", width: 18 * IN, trashBins: "deep", binWidth: 11 * IN, binLength: 9 * IN, binHeight: 17 * IN, trayHeight: 6 * IN });
    const p = ok(s);
    expect(named(p.parts, "Drawer front")).toHaveLength(1);
    expect(named(p.parts, "Drawer front")[0].blank[2]).toBeCloseTo(34.5 * IN - 4 * IN - IN / 8, 9);
    for (const side of named(p.parts, "Drawer side")) expect(side.blank[2]).toBeCloseTo(6 * IN, 12);
    const sub = named(p.parts, "Drawer sub-front")[0];
    expect(sub.blank[2]).toBeGreaterThan(20 * IN);
    const frame = named(p.parts, "Bin frame")[0];
    const [fw, fl, ft] = frame.blank;
    expect(audit(frame.mesh).volume).toBeCloseTo(fw * fl * ft - 2 * 11 * IN * 9 * IN * ft, 12);
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

