import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { applyPreset, defaults, normalize, plan, PRESETS, type Part, type Sizes } from "../../plugins/cabinet-generator/cabinet.js";
import { areaText, clearanceSteps, clearanceText, ladderCoupons, machineCheck, measureText, miniDoor, miniDrawer, partArea, TEST_KINDS, testCut, validSteps } from "../../plugins/cabinet-generator/testcuts.js";

// The test cuts (plugins/cabinet-generator/testcuts.js): small pieces that prove a setup before
// the real sheet. Each must go through the planner's own code, so these tests hold the coupons'
// cuts against the cuts the planner makes in a real cabinet, and the mini drawer's and mini
// door's hardware holes against a full cabinet's, coordinate for coordinate in each part's frame.

const IN = 0.0254;
const MM = 0.001;
const T = 1e-9;

const sorted = (pts: number[][]) => pts.map((p) => p.map((v) => Math.round(v * 1e7) / 1e7)).sort((a, b) => a.reduce((d, v, i) => d || v - b[i], 0));
const uniq = (pts: number[][]) => sorted(pts).filter((p, i, all) => !i || p.some((v, k) => v !== all[i - 1][k]));
/** Centres of the round holes in a part's mesh whose mouths lie in the plane `axis` = v. */
const rings = (part: Part, axis: number, v: number) => {
  const others = [0, 1, 2].filter((k) => k !== axis);
  const out: [number, number][] = [];
  for (const f of part.mesh.faces) {
    for (const ring of f.slice(1)) {
      const pts = ring.map((i) => part.mesh.positions[i]);
      if (!pts.every((p) => Math.abs(p[axis] - v) < 1e-6)) continue;
      out.push(others.map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length) as [number, number]);
    }
  }
  return out;
};
/** The floors lying in the plane `axis` = v (a groove's floor, split by the part's grid into
 * several faces), as their extents along `along`, faces that meet merged into one. */
const floors = (part: Part, axis: number, v: number, along: number) => {
  const spans = part.mesh.faces
    .filter((f) => f[0].every((i) => Math.abs(part.mesh.positions[i][axis] - v) < 1e-6))
    .map((f) => {
      const vs = f[0].map((i) => part.mesh.positions[i][along]);
      return [Math.min(...vs), Math.max(...vs)];
    })
    .sort((a, b) => a[0] - b[0]);
  const out: number[][] = [];
  for (const sp of spans) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], sp[1]);
    else out.push([...sp]);
  }
  return out;
};
const clean = (parts: Part[]) => {
  for (const p of parts) {
    const a = audit(p.mesh);
    expect(a.problems, `${p.name}: ${a.problems.join("; ")}`).toEqual([]);
    expect(a.volume, p.name).toBeGreaterThan(0);
  }
};
/** The part one copy of which has this name. */
const copyNamed = (parts: Part[], name: string) => {
  const p = parts.find((x) => x.copies.some((c) => c.name === name));
  expect(p, name).toBeDefined();
  return { part: p!, at: p!.copies.find((c) => c.name === name)!.at };
};

describe("the joint ladders' clearances", () => {
  it("five steps a tenth of a millimetre (0.004 in) apart, one under the clearance and three over, within 0 to 1 mm", () => {
    const mm = clearanceSteps(0.2 * MM, true).map((v) => v / MM);
    expect(mm.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    const inch = clearanceSteps(0.008 * IN, false).map((v) => v / IN);
    expect(inch.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.004, 0.008, 0.012, 0.016, 0.02]);
    // At the panel's limits the window moves to stay inside them.
    expect(clearanceSteps(0, true)[0]).toBe(0);
    expect(clearanceSteps(0.05 * MM, true)[0]).toBe(0);
    const top = clearanceSteps(1 * MM, true);
    expect(top[4]).toBeCloseTo(1 * MM, 12);
    expect(top[0]).toBeCloseTo(0.6 * MM, 12);
    for (const fit of [0, 0.1, 0.2, 0.55, 0.9, 1].map((v) => v * MM)) {
      for (const metric of [false, true]) {
        const s = clearanceSteps(fit, metric);
        expect(s).toHaveLength(5);
        expect(Math.min(...s)).toBeGreaterThanOrEqual(-T);
        expect(Math.max(...s)).toBeLessThanOrEqual(1 * MM + T);
        // The current clearance is among them, to the step.
        expect(s.some((v) => Math.abs(v - fit) < (metric ? 0.1 * MM : 0.004 * IN) / 2 + T)).toBe(true);
      }
    }
  });

  it("steps read from a document are used only when they are five rising clearances from 0 to 1 mm", () => {
    expect(validSteps(clearanceSteps(0.2 * MM, true))).toHaveLength(5);
    for (const bad of [null, "x", [], [0, 1, 2, 3, 4], [0.0001, 0.0002, 0.0003, 0.0004], [0.0004, 0.0003, 0.0002, 0.0001, 0], [0, 0.0001, 0.0002, NaN, 0.0004], { steps: [] }]) expect(validSteps(bad)).toBeNull();
  });

  it("are said in the document's units: millimetres, or inches to 0.001", () => {
    expect(clearanceText(0.3 * MM, true)).toBe("0.3 mm");
    expect(clearanceText(0.012 * IN, false)).toBe("0.012 in");
    expect(measureText(100 * MM, true)).toBe("100 mm");
    expect(measureText(4 * IN, false)).toBe("4.000 in (101.6 mm)");
    expect(areaText(0.0929, false)).toBe("1.0 sq ft (0.09 m²)");
  });
});

describe("the machine check", () => {
  it("a 100 mm (4 in) square of carcass stock, a slot one bit wide and 50 mm (2 in) long, and a pocket 6 mm (1/4 in) deep", () => {
    for (const metric of [false, true]) {
      const s = defaults(metric);
      const m = machineCheck(s, metric);
      expect(m.error).toBeNull();
      const part = m.part!;
      clean([part]);
      const a = metric ? 100 * MM : 4 * IN;
      expect(part.blank[0]).toBeCloseTo(a, 12);
      expect(part.blank[1]).toBeCloseTo(a, 12);
      expect(part.blank[2]).toBeCloseTo(s.thickness, 12);
      expect(part.material).toBe("Cabinet plywood");
      const t = s.thickness;
      // The slot's floor: one bit wide across, 50 mm (2 in) long.
      const slotDepth = metric ? 3 * MM : 0.125 * IN;
      const [slotY] = floors(part, 2, t - slotDepth, 1);
      expect(slotY[1] - slotY[0]).toBeCloseTo(s.bit, 12);
      const [slotX] = floors(part, 2, t - slotDepth, 0);
      expect(slotX[1] - slotX[0]).toBeCloseTo(metric ? 50 * MM : 2 * IN, 12);
      const pocketDepth = metric ? 6 * MM : 0.25 * IN;
      const [px] = floors(part, 2, t - pocketDepth, 0);
      expect(px[1] - px[0]).toBeCloseTo(metric ? 30 * MM : 1.25 * IN, 12);
      // The slot follows Bit diameter.
      const wide = machineCheck({ ...s, bit: 0.5 * IN }, metric).part!;
      expect(floors(wide, 2, t - slotDepth, 1)[0][1] - floors(wide, 2, t - slotDepth, 1)[0][0]).toBeCloseTo(0.5 * IN, 12);
    }
  });

  it("is refused with the planner's message for settings the planner refuses, and when the stock is too thin for its pocket", () => {
    expect(machineCheck({ ...defaults(true), bit: 2 * MM }, true).error).toMatch(/^The bit diameter must be at least 3 mm/);
    const thin = normalize({ ...defaults(true), thickness: 8 * MM, backThickness: 4 * MM, dados: false, shelfType: "fixed", hardware: false, back: false }, true);
    expect(machineCheck(thin, true).error).toBe("The machine check's pocket is 6 mm deep: the carcass stock must be at least 9 mm thick for it.");
  });
});

describe("the joint ladders", () => {
  it("a coupon per joint whose stock differs, each dado the mating stock plus its step, as deep as the cabinet's, named by its dimples", () => {
    for (const metric of [false, true]) {
      const s = defaults(metric);
      const lad = ladderCoupons(s, metric);
      expect(lad.error).toBeNull();
      expect(lad.coupons.map((c) => c.name)).toEqual(["Dado ladder", "Back groove ladder", "Drawer bottom ladder"]);
      expect(lad.coupons.map((c) => c.part.material)).toEqual(["Cabinet plywood", "Cabinet plywood", "Drawer box plywood"]);
      clean(lad.coupons.map((c) => c.part));
      const steps = clearanceSteps(s.fit, metric);
      const want = {
        dado: { stock: s.thickness, mating: s.thickness, depth: s.dadoDepth },
        back: { stock: s.thickness, mating: s.backThickness, depth: s.backGrooveDepth },
        bottom: { stock: s.drawerThickness, mating: s.backThickness, depth: Math.min(s.drawerThickness / 2, 0.25 * IN) },
      };
      for (const c of lad.coupons) {
        const w = want[c.kind];
        expect(c.part.blank[2]).toBeCloseTo(w.stock, 12);
        expect(c.depth).toBeCloseTo(w.depth, 12);
        // Five floors at the depth, each the mating stock plus its step wide, left to right.
        const fl = floors(c.part, 2, w.stock - w.depth, 0).sort((a, b) => a[0] - b[0]);
        expect(fl).toHaveLength(5);
        fl.forEach(([x0, x1], k) => expect(x1 - x0).toBeCloseTo(w.mating + steps[k], 12));
        // Each runs out of the rear edge and stops behind the dimples.
        const ys = floors(c.part, 2, w.stock - w.depth, 1);
        for (const [, y1] of ys) expect(y1).toBeCloseTo(c.part.blank[1], 12);
        const stop = Math.min(...ys.map((y) => y[0]));
        // Dado k has k dimples in front of it, a little wider than the bit, 2 mm deep.
        const dimples = rings(c.part, 2, w.stock);
        expect(dimples).toHaveLength(15);
        fl.forEach(([x0, x1], k) => {
          const mine = dimples.filter(([x]) => x > x0 - T && x < x1 + T);
          expect(mine, `${c.name} dado ${k + 1}`).toHaveLength(k + 1);
          for (const [x, y] of mine) {
            expect(x).toBeCloseTo((x0 + x1) / 2, 9);
            expect(y).toBeLessThan(stop);
          }
        });
      }
    }
  });

  it("their dados at the current clearance are the planner's own: the side's dado and back groove, the drawer side's groove", () => {
    for (const metric of [false, true]) {
      const s = applyPreset(defaults(metric), "drawers", metric);
      const lad = ladderCoupons(s, metric);
      const at = clearanceSteps(s.fit, metric).findIndex((v) => Math.abs(v - s.fit) < T);
      expect(at).toBe(1);
      const p = plan(s, metric);
      expect(p.error).toBeNull();
      const t = s.thickness;
      const left = copyNamed(p.parts, "Left side").part;
      const coupon = (kind: string) => lad.coupons.find((c) => c.kind === kind)!;
      // The bottom's dado in the side: t + fit wide along z, a dado deep.
      const kick = s.toeKick;
      const dado = floors(left, 0, t - s.dadoDepth, 2).find(([z0]) => Math.abs(z0 - (kick - s.fit / 2)) < 1e-6)!;
      expect(dado[1] - dado[0]).toBeCloseTo(coupon("dado").widths[at], 12);
      expect(coupon("dado").depth).toBeCloseTo(s.dadoDepth, 12);
      // The back's groove in the side: across the depth.
      const back = floors(left, 0, t - s.backGrooveDepth, 1);
      const bw = Math.max(...back.map((b) => b[1])) - Math.min(...back.map((b) => b[0]));
      expect(bw).toBeCloseTo(coupon("back").widths[at], 12);
      // The drawer bottom's groove in a drawer side, from the floor of the groove in its inner face.
      const side = copyNamed(p.parts, "Drawer 1 left").part;
      const ds = s.drawerThickness;
      const gd = coupon("bottom").depth;
      const g = floors(side, 0, ds - gd, 2);
      expect(g.length).toBeGreaterThan(0);
      expect(Math.max(...g.map((x) => x[1])) - Math.min(...g.map((x) => x[0]))).toBeCloseTo(coupon("bottom").widths[at], 12);
    }
  });

  it("only the joints the settings cut: no dado ladder with butt joints, no back ladder for a rabbet, a back between the sides or none", () => {
    const s = defaults(false);
    expect(ladderCoupons({ ...s, dados: false }, false).coupons.map((c) => c.kind)).toEqual(["back", "bottom"]);
    expect(ladderCoupons({ ...s, backInset: 0 }, false).coupons.map((c) => c.kind)).toEqual(["dado", "bottom"]);
    expect(ladderCoupons({ ...s, backInset: 0 }, false).skipped).toEqual(["Back groove ladder: a back inset of 0 is a rabbet, with nothing to fit."]);
    expect(ladderCoupons({ ...s, backMount: "butt" }, false).coupons.map((c) => c.kind)).toEqual(["dado", "bottom"]);
    expect(ladderCoupons({ ...s, back: false }, false).skipped[0]).toBe("Back groove ladder: no back.");
  });

  it("is refused with the planner's message, or when a groove leaves under 3 mm of its stock", () => {
    expect(ladderCoupons({ ...defaults(true), fit: 2 * MM }, true).error).toMatch(/^The fit must be 0 to 1 mm/);
    const r = ladderCoupons({ ...defaults(true), drawerThickness: 5 * MM }, true);
    expect(r.error).toMatch(/^Drawer bottom ladder: a 2.5 mm groove leaves less than 3 mm/);
    expect(r.coupons).toEqual([]);
  });

  it("are cut at the steps given (those of the ladders made), not the current clearance's", () => {
    const s = defaults(true);
    const cut = clearanceSteps(0.5 * MM, true);
    const lad = ladderCoupons(s, true, cut);
    expect(lad.steps).toEqual(cut);
    expect(lad.coupons[0].widths[0]).toBeCloseTo(s.thickness + 0.4 * MM, 12);
  });
});

/** Each drawer combination the planner takes. */
const drawerCases = () => {
  const out: { label: string; s: Sizes; metric: boolean }[] = [];
  for (const metric of [false, true]) {
    for (const catalog of ["us", "eu"] as const) {
      for (const slides of ["tandem", "movento"] as const) {
        const s = { ...applyPreset(defaults(metric), "drawers", metric), catalog, slides };
        out.push({ label: `${metric ? "mm" : "in"} ${catalog} ${slides}`, s, metric });
      }
    }
  }
  return out;
};

describe("the mini drawer", () => {
  it("takes the real cabinet's runner and depth, one drawer, no toe kick, and the narrowest, shortest opening the planner takes", () => {
    for (const { label, s, metric } of drawerCases()) {
      const full = plan(s, metric);
      expect(full.error, label).toBeNull();
      const mini = miniDrawer(s, metric);
      expect(mini.error, label).toBeNull();
      const ms = mini.sizes!;
      expect(mini.planned!.runner!.part, label).toBe(full.runner!.part);
      expect(ms.depth).toBe(s.depth);
      expect(ms.base).toBe("none");
      expect(ms.drawers).toBe(1);
      clean(mini.planned!.parts);
      // The narrowest: one step narrower or shorter is refused.
      const step = metric ? 10 * MM : 0.5 * IN;
      const hStep = metric ? 5 * MM : 0.25 * IN;
      expect(plan({ ...ms, width: ms.width - step }, metric).error, label).not.toBeNull();
      expect(plan({ ...ms, height: ms.height - hStep }, metric).error, label).not.toBeNull();
      expect(partArea(mini.planned!.parts)).toBeLessThan(partArea(full.parts) / 4);
    }
  });

  it("its runner screws, rear hook holes, box length and the bottom's grooves are the full cabinet's, coordinate for coordinate", () => {
    for (const { label, s, metric } of drawerCases()) {
      const full = plan(s, metric);
      const mini = miniDrawer(s, metric);
      const fp = full.parts;
      const mp = mini.planned!.parts;
      const ms = mini.sizes!;
      const t = s.thickness;
      // The runner screws in the left side, the lowest row (drawer 1), from the front and up from
      // the opening's bottom: the full cabinet's opening starts over its toe kick.
      const screws = (parts: Part[], floor: number) =>
        sorted(
          rings(copyNamed(parts, "Left side").part, 0, t)
            .map(([y, z]) => [y, z - floor])
            .filter(([, z]) => z < 0.1),
        );
      const fs = screws(fp, s.toeKick + t);
      expect(fs.length, label).toBeGreaterThanOrEqual(3);
      expect(screws(mp, t), label).toEqual(fs);
      // The drawer side: the same length, and its groove the same, point for point, below the groove's top.
      const fSide = copyNamed(fp, "Drawer 1 left");
      const mSide = copyNamed(mp, "Drawer 1 left");
      expect(mSide.part.blank[1], label).toBeCloseTo(fSide.part.blank[1], 12);
      const gz = 13 * MM + s.backThickness + s.fit;
      const low = (p: Part) => sorted(p.mesh.positions.filter((q) => q[2] < gz + 1e-9));
      expect(low(mSide.part), label).toEqual(low(fSide.part));
      expect(low(copyNamed(mp, "Drawer 1 right").part), label).toEqual(low(copyNamed(fp, "Drawer 1 right").part));
      // Where the box sits: its bottom above the opening, its side in from the cabinet's side.
      expect(mSide.at[2] - t, label).toBeCloseTo(fSide.at[2] - (s.toeKick + t), 9);
      expect(mSide.at[1], label).toBeCloseTo(fSide.at[1], 12);
      // The rear hook holes: 7 mm in from each end, 24 mm above the box's bottom.
      const hooks = (parts: Part[]) => {
        const back = copyNamed(parts, "Drawer 1 back").part;
        return sorted(rings(back, 1, s.drawerThickness).map(([x, z]) => [Math.min(x, back.blank[0] - x), z]));
      };
      expect(hooks(mp), label).toEqual(hooks(fp));
      expect(hooks(mp)).toHaveLength(2);
      // The sub-front's groove: the same across its thickness and up it.
      const subGroove = (parts: Part[]) => uniq(copyNamed(parts, "Drawer 1 sub-front").part.mesh.positions.filter((q) => q[2] < gz + 1e-9).map((q) => [q[1], q[2]]));
      expect(subGroove(mp), label).toEqual(subGroove(fp));
      // Blum's rule, 42 mm under the opening inside, in both.
      const inside = (parts: Part[], w: number) => copyNamed(parts, "Drawer 1 sub-front").part.blank[0] - (w - 2 * t);
      expect(inside(mp, ms.width)).toBeCloseTo(-42 * MM, 9);
      expect(inside(fp, s.width)).toBeCloseTo(-42 * MM, 9);
    }
  });

  it("a finger notch is the full cabinet's, from the front's centre and top, and so is the sub-front's cut behind it", () => {
    for (const metric of [false, true]) {
      const s = { ...applyPreset(defaults(metric), "drawers", metric), drawerPull: "notch" as const };
      const full = plan(s, metric);
      expect(full.error).toBeNull();
      const mini = miniDrawer(s, metric);
      expect(mini.error).toBeNull();
      const notch = (parts: Part[]) => {
        const { part, at } = copyNamed(parts, "Drawer 1 front");
        const [fw, , fh] = part.blank;
        const front = sorted(part.mesh.positions.filter((q) => q[2] > fh - s.notchDepth - 1e-9 && Math.abs(q[0] - fw / 2) < s.notchWidth / 2 + 1e-9).map((q) => [q[0] - fw / 2, fh - q[2], q[1]]));
        // The sub-front's cut, from the front's top.
        const sub = copyNamed(parts, "Drawer 1 sub-front");
        const subZs = sub.part.mesh.positions.map((q) => q[2]);
        const cut = Math.min(...subZs.filter((z) => z > 13 * MM + s.backThickness + s.fit + 1e-6 && z < sub.part.blank[2] - 1e-6));
        return { front, below: at[2] + fh - (sub.at[2] + cut) };
      };
      const f = notch(full.parts);
      const m = notch(mini.planned!.parts);
      expect(m.front).toEqual(f.front);
      expect(m.below).toBeCloseTo(f.below, 9);
      expect(m.below).toBeCloseTo(s.notchDepth + 25 * MM, 9);
    }
  });

  it("from a cabinet with no drawers, the runner a drawer in it would take; refused with the planner's message", () => {
    const s = applyPreset(defaults(false), "base", false);
    const withDrawer = plan({ ...s, layout: "drawers", drawers: 1, drawerFronts: "equal" }, false);
    const mini = miniDrawer(s, false);
    expect(mini.error).toBeNull();
    expect(mini.planned!.runner!.part).toBe(withDrawer.runner!.part);
    const bad = miniDrawer({ ...applyPreset(defaults(true), "drawers", true), drawerThickness: 18 * MM }, true);
    expect(bad.error).toMatch(/^Drawer base 1: Blum TANDEM 560H takes drawer sides 11 to 16 mm thick\.$/);
  });
});

describe("the mini door", () => {
  it("its hinge cups and mounting plates are the full cabinet's, from the door's hinge edge and ends", () => {
    for (const metric of [false, true]) {
      for (const front of ["overlay", "inset"] as const) {
        const s = { ...applyPreset(defaults(metric), "base", metric), front };
        const full = plan(s, metric);
        expect(full.error).toBeNull();
        const mini = miniDoor(s, metric);
        expect(mini.error, `${front}`).toBeNull();
        const ms = mini.sizes!;
        expect(ms.width).toBeCloseTo(Math.min(s.width, metric ? 300 * MM : 12 * IN), 12);
        expect(ms.depth).toBeLessThan(s.depth);
        clean(mini.planned!.parts);
        const t = s.thickness;
        // The cups on the hinge (left) half; the pull's holes on the other, from the opening edge and the top.
        const cups = (parts: Part[]) => {
          const { part } = copyNamed(parts, "Door");
          const [fw, , fh] = part.blank;
          return sorted(rings(part, 1, t).filter(([x]) => x < fw / 2).map(([x, z]) => [x, Math.min(z, fh - z)]));
        };
        const pulls = (parts: Part[]) => {
          const { part } = copyNamed(parts, "Door");
          const [fw, , fh] = part.blank;
          return sorted(rings(part, 1, 0).filter(([x]) => x > fw / 2).map(([x, z]) => [fw - x, fh - z]));
        };
        expect(cups(mini.planned!.parts)).toEqual(cups(full.parts));
        expect(cups(full.parts)).toHaveLength(2);
        expect(pulls(mini.planned!.parts)).toEqual(pulls(full.parts));
        expect(pulls(full.parts)).toHaveLength(2);
        // The plates' holes in the hinge side: 37 mm back, 16 mm either side of each cup's height,
        // in both cabinets (overlay; inset plates are listed, not drilled). The shelf pins share the
        // 37 mm row, so each hole is looked for where the cup puts it.
        const plates = (parts: Part[]) => {
          const door = copyNamed(parts, "Door");
          const fh = door.part.blank[2];
          const side = rings(copyNamed(parts, "Left side").part, 0, t).filter(([y]) => Math.abs(y - 37 * MM) < 1e-6);
          const zs = rings(door.part, 1, t).filter(([x]) => x < door.part.blank[0] / 2).map(([, z]) => z);
          return zs.flatMap((cz) => [-16, 16].map((d) => ({ fromEnd: Math.min(cz, fh - cz) + (cz < fh / 2 ? d : -d) * MM, found: side.some(([, z]) => Math.abs(z - (door.at[2] + cz + d * MM)) < 1e-9) })));
        };
        const mPlates = plates(mini.planned!.parts);
        const fPlates = plates(full.parts);
        expect(mPlates.map((p) => p.found)).toEqual(Array(4).fill(front === "overlay"));
        expect(fPlates.map((p) => p.found)).toEqual(Array(4).fill(front === "overlay"));
        expect(sorted(mPlates.map((p) => [p.fromEnd]))).toEqual(sorted(fPlates.map((p) => [p.fromEnd])));
      }
    }
  });

  it("an adjustable shelf on two rows of pins; as short and as shallow as the planner takes with them", () => {
    for (const metric of [false, true]) {
      const s = applyPreset(defaults(metric), "base", metric);
      const mini = miniDoor(s, metric);
      const ms = mini.sizes!;
      expect(ms.shelves).toBe(1);
      expect(ms.shelfType).toBe("adjustable");
      const left = copyNamed(mini.planned!.parts, "Left side").part;
      const ys = new Set(rings(left, 0, s.thickness).map(([y]) => Math.round(y * 1e6)));
      expect(ys.size).toBe(2);
      expect(ys.has(37000)).toBe(true);
      // A step shallower loses the rear row (or is refused); a step shorter is refused.
      const shallower = plan({ ...ms, depth: ms.depth - (metric ? 10 * MM : 0.5 * IN) }, metric);
      expect(shallower.error !== null || !shallower.rows.some((r) => /^Shelf pin holes, rows /.test(r[1]))).toBe(true);
      const shorter = plan({ ...ms, height: ms.height - (metric ? 5 * MM : 0.25 * IN) }, metric);
      expect(shorter.error).not.toBeNull();
    }
  });
});

describe("every test", () => {
  it("from every starting point, in inches and millimetres: built, closed solids, and a guide to measure it by", () => {
    for (const metric of [false, true]) {
      for (const p of PRESETS) {
        const s = applyPreset(defaults(metric), p.id, metric);
        const full = plan(s, metric);
        for (const kind of TEST_KINDS) {
          const t = testCut(kind, s, metric);
          const label = `${metric ? "mm" : "in"} ${p.id} ${kind}`;
          expect(t.error, label).toBeNull();
          clean(t.parts);
          expect(t.name).toMatch(/^Test cuts · /);
          expect(t.proves.length, label).toBeGreaterThan(20);
          expect(t.stock.length, label).toBeGreaterThan(20);
          expect(t.rows.length, label).toBeGreaterThan(0);
          for (const r of t.rows) expect(r, label).toHaveLength(3);
          for (const r of t.holes) expect(r, label).toHaveLength(t.columns.length);
          expect(t.area, label).toBeGreaterThan(0);
          // Every test is much smaller than the cabinet it stands for (the tall pantry's not least).
          expect(t.area, label).toBeLessThan(partArea(full.parts) / 3);
        }
      }
    }
  });

  it("with hardware holes off, the mini door and drawer say so, and keep the rows that still apply", () => {
    for (const front of ["overlay", "inset"] as const) {
      const door = testCut("door", { ...applyPreset(defaults(false), "base", false), hardware: false, front }, false);
      expect(door.error).toBeNull();
      expect(door.rows.map((r) => r[0])).toEqual(["Hardware holes", "The gap round the door, closed", "Shelf pins"]);
    }
    const drawer = testCut("drawer", { ...applyPreset(defaults(false), "drawers", false), hardware: false }, false);
    expect(drawer.error).toBeNull();
    expect(drawer.rows[4][0]).toBe("Hardware holes");
    expect(drawer.rows).toHaveLength(6);
  });

  it("the machine check says what to measure in the document's units", () => {
    const mm = testCut("machine", defaults(true), true);
    expect(mm.rows.map((r) => r[1])).toEqual(["6 mm", "100 mm", "141.42 mm, the two equal", "6 mm", "3 mm"]);
    const inch = testCut("machine", defaults(false), false);
    expect(inch.rows.map((r) => r[1])).toEqual(["0.250 in (6.35 mm)", "4.000 in (101.6 mm)", "5.657 in (143.68 mm), the two equal", "0.250 in (6.35 mm)", "0.125 in (3.18 mm)"]);
    // A tenth of a millimetre between the diagonals is 0.862 mm across 4 ft at 100 mm (1219.2 / 141.42).
    expect(mm.rows[2][2]).toContain("0.86 mm out of square across a 4 ft sheet");
  });

  it("the ladders list each dado's clearance and width; the coupons sit side by side, apart", () => {
    const s = defaults(false);
    const t = testCut("ladders", s, false);
    expect(t.holes).toHaveLength(15);
    expect(t.holes[0]).toEqual(["Dado ladder", "Dado 1 (1 dimple)", "0.004 in", measureText(s.thickness + 0.004 * IN, false)]);
    expect(t.holes[14][1]).toBe("Dado 5 (5 dimples)");
    const xs = t.parts.map((p) => p.copies[0].at[0]);
    for (let i = 1; i < t.parts.length; i++) expect(xs[i] - (xs[i - 1] + t.parts[i - 1].blank[0])).toBeCloseTo(1 * IN, 12);
  });
});
