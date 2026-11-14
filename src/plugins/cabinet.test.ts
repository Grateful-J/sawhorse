import { describe, expect, it } from "vitest";
import { audit } from "../../plugins/cabinet-generator/mesh.js";
import { defaults, normalize, phrase, plan } from "../../plugins/cabinet-generator/cabinet.js";

const IN = 0.0254;

function inches(n: number) {
  return Math.round((n / IN) * 1000) / 1000;
}

/** Thickness, width, length in inches, the way the cut list sorts a blank. */
function blank(size: number[]) {
  return [...size].map(inches).sort((a, b) => a - b);
}

const tall = { ...defaults(false), width: 30 * IN, height: 72 * IN, depth: 12 * IN, shelves: 3, toeKick: 4 * IN };

describe("cabinet layouts", () => {
  it("the default shelf cabinet is the original butt-jointed carcass", () => {
    const s = normalize({ width: 30 * IN, height: 72 * IN, depth: 12 * IN, shelves: 3, toeKick: 4 * IN }, false);
    expect(s.layout).toBe("shelves");
    expect(s.dados).toBe(false);
    expect(phrase(s, (m) => String(inches(m)), false)).toBe("30 x 72 x 12, 3 shelves, back, 4 toe kick");
    const p = plan(s, false);
    expect(p.error).toBeNull();
    const row = (name: string) => {
      const part = p.parts.find((x) => x.name === name)!;
      return [part.copies.length, blank(part.blank)];
    };
    expect(row("Side")).toEqual([2, [0.75, 12, 72]]);
    expect(row("Top")).toEqual([1, [0.75, 11.75, 28.5]]);
    expect(row("Bottom")).toEqual([1, [0.75, 11.75, 28.5]]);
    expect(row("Shelf")).toEqual([3, [0.75, 11.75, 28.5]]);
    expect(row("Back")).toEqual([1, [0.25, 28.5, 68]]);
    expect(row("Toe kick")).toEqual([1, [0.75, 4, 28.5]]);
    expect(p.parts.map((x) => x.name)).toEqual(["Side", "Top", "Bottom", "Shelf", "Back", "Toe kick"]);
    for (const part of p.parts) expect(audit(part.mesh).problems, part.name).toEqual([]);
  });

  it("blind dados do not shrink a side, and the rails grow by the two tenons", () => {
    const plain = plan(tall, false);
    const dadoed = plan({ ...tall, dados: true }, false);
    expect(dadoed.error).toBeNull();
    const side0 = plain.parts.find((p) => p.name === "Side")!;
    const side1 = dadoed.parts.find((p) => p.name === "Side")!;
    expect(blank(side1.blank)).toEqual(blank(side0.blank));
    const top0 = plain.parts.find((p) => p.name === "Top")!;
    const top1 = dadoed.parts.find((p) => p.name === "Top")!;
    const tenon = (0.75 / 3) * 2;
    expect(inches(top1.blank[0])).toBeCloseTo(inches(top0.blank[0]) + tenon, 6);
    const a0 = audit(side0.mesh);
    const a1 = audit(side1.mesh);
    expect(a1.problems).toEqual([]);
    expect(a1.hi.map(inches)).toEqual(a0.hi.map(inches));
    expect(a1.volume).toBeLessThan(a0.volume);
    // Five rails (top, bottom, three shelves), each a stopped groove.
    const groove = (0.75 / 3) * (12 - 0.5) * 0.75 * IN ** 3;
    expect(a0.volume - a1.volume).toBeCloseTo(5 * groove, 10);
  });

  it("doors, drawers and a mixed bay name every part and stay watertight", () => {
    for (const layout of ["doors", "drawers", "mixed"] as const) {
      const p = plan({ ...defaults(false), layout, drawers: 3, shelves: 1, hardware: true, dados: true }, false);
      expect(p.error, layout).toBeNull();
      const names = p.parts.map((x) => x.name);
      if (layout !== "drawers") expect(names).toContain("Door");
      if (layout !== "doors") {
        expect(names).toEqual(expect.arrayContaining(["Drawer front", "Drawer side", "Drawer box front", "Drawer box back", "Drawer bottom"]));
      }
      for (const part of p.parts) {
        const a = audit(part.mesh);
        expect(a.problems, `${layout} ${part.name}: ${a.problems.join("; ")}`).toEqual([]);
        expect(a.volume, part.name).toBeGreaterThan(0);
      }
    }
  });

  it("lists hinge cups, slide holes and an undermount pull before anything is cut", () => {
    const p = plan({ ...defaults(true), layout: "mixed", drawers: 2, shelves: 1, hardware: true, pull: "undermount" }, true);
    expect(p.error).toBeNull();
    const text = p.rows.map((r) => r.join(" ")).join("\n");
    expect(text).toContain("Hinge cup");
    expect(text).toContain("35 mm");
    expect(text).toContain("slide");
    expect(text).toContain("Undermount pull");
    const door = p.parts.find((x) => x.name === "Door")!;
    // Two cup loops on the back face: the mesh has more than the six box faces.
    expect(door.mesh.faces.length).toBeGreaterThan(6);
  });

  it("refuses a cabinet the stock cannot make", () => {
    expect(plan({ ...defaults(false), width: 1 * IN }, false).error).toMatch(/width/i);
    expect(plan({ ...defaults(false), layout: "drawers", drawers: 0 }, false).error).toMatch(/drawer/i);
  });
});
