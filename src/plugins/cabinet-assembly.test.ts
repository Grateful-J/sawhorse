// @vitest-environment node
// Does the cabinet go together? Every part of every preset, as solid geometry where the
// generator puts it, checked with an independent solid modeller (npm manifold-3d, the C++
// Manifold: not the Sawhorse kernel and not the generator's own arithmetic):
// - no two parts occupy the same space (a tongue too long for its dado, a back wider than its
//   grooves, a shelf through a side, a drawer box into a runner's side);
// - every part is a closed solid of the volume its blank less its cuts must have;
// - the parts stay inside the cabinet's own box (fronts and pulls aside).
// The joints' clearances (0.1 mm a side, tongues 0.5 mm short) are far above what the check
// resolves, so a part 0.1 mm into another fails it.
import Module from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { applyPreset, defaults, plan, PRESETS } from "../../plugins/cabinet-generator/cabinet.js";
import { baseDefaults, IDENTITY, placeNext, planBase, type Cab } from "../../plugins/cabinet-generator/row.js";

type V3 = [number, number, number];
type PartMesh = { positions: V3[]; faces: number[][][] };
type Solid = { name: string; lo: V3; hi: V3; solid: { volume(): number; intersect(o: unknown): { volume(): number; delete(): void }; delete(): void } };

let wasm: Awaited<ReturnType<typeof Module>>;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A part's mesh (polygons with holes) as a closed triangle solid, moved to `at`, in mm. */
function solidOf(name: string, mesh: PartMesh, at: V3): Solid {
  const tris: number[] = [];
  for (const rings of mesh.faces) {
    // Newell normal of each ring; the outer ring is the one of largest area.
    const normal = (ring: number[]): V3 => {
      const n: V3 = [0, 0, 0];
      for (let i = 0; i < ring.length; i++) {
        const p = mesh.positions[ring[i]];
        const q = mesh.positions[ring[(i + 1) % ring.length]];
        n[0] += (p[1] - q[1]) * (p[2] + q[2]);
        n[1] += (p[2] - q[2]) * (p[0] + q[0]);
        n[2] += (p[0] - q[0]) * (p[1] + q[1]);
      }
      return n;
    };
    const normals = rings.map(normal);
    let outer = 0;
    normals.forEach((n, i) => {
      if (Math.hypot(...n) > Math.hypot(...normals[outer])) outer = i;
    });
    const len = Math.hypot(...normals[outer]);
    const n: V3 = [normals[outer][0] / len, normals[outer][1] / len, normals[outer][2] / len];
    // A basis in the face's plane with u x v = n: the outer ring runs counter-clockwise in it.
    const seed: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u0 = cross(n, seed);
    const ul = Math.hypot(...u0);
    const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
    const v = cross(n, u);
    const flat = (i: number): [number, number] => [dot(mesh.positions[i], u) * 1000, dot(mesh.positions[i], v) * 1000];
    const area = (ring: number[]) => {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = flat(ring[i]);
        const q = flat(ring[(i + 1) % ring.length]);
        a += p[0] * q[1] - q[0] * p[1];
      }
      return a / 2;
    };
    // Outer counter-clockwise, holes clockwise, whatever way the mesh wound them.
    const ordered = rings.map((ring, i) => ((area(ring) > 0) === (i === outer) ? ring : [...ring].reverse()));
    const index = ordered.flat();
    for (const t of wasm.triangulate(ordered.map((ring) => ring.map(flat)))) tris.push(index[t[0]], index[t[1]], index[t[2]]);
  }
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  const verts = new Float32Array(mesh.positions.length * 3);
  mesh.positions.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      const c = (p[k] + at[k]) * 1000;
      verts[i * 3 + k] = c;
      lo[k] = Math.min(lo[k], c);
      hi[k] = Math.max(hi[k], c);
    }
  });
  const solid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: verts, triVerts: Uint32Array.from(tris) }));
  return { name, lo, hi, solid: solid as unknown as Solid["solid"] };
}

/** Every pair of solids whose boxes meet and that share more than `limit` mm3. */
function clashes(solids: Solid[], limit: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      if ([0, 1, 2].some((k) => a.lo[k] >= b.hi[k] || b.lo[k] >= a.hi[k])) continue;
      const both = a.solid.intersect(b.solid);
      const v = both.volume();
      both.delete();
      if (v > limit) out.push(`${a.name} and ${b.name} share ${v.toFixed(1)} mm3`);
    }
  }
  return out;
}

/** Float32 noise where two faces touch over a whole panel stays under this (mm3). A real
 * overlap is far more: a tongue 0.1 mm too long over a 500 mm dado is about 900 mm3. */
const NOISE = 40;

type Settings = ReturnType<typeof defaults>;
const MM = 0.001;
const VARIANTS: [string, (s: Settings) => Settings][] = [
  ["as the preset", (s) => s],
  ["butt joints", (s) => ({ ...s, dados: false })],
  ["back between the sides", (s) => ({ ...s, backMount: "butt" })],
  ["no back", (s) => ({ ...s, back: false })],
  ["inset fronts", (s) => ({ ...s, front: "inset" })],
  ["inset fronts, fixed shelves", (s) => ({ ...s, front: "inset", shelfType: "fixed" })],
  ["inset fronts, butt joints, no back", (s) => ({ ...s, front: "inset", dados: false, back: false })],
  ["fixed shelves", (s) => ({ ...s, shelfType: "fixed" })],
  ["full top", (s) => ({ ...s, top: "full" })],
  ["stretchers", (s) => ({ ...s, top: "stretchers" })],
  ["nailers top and bottom", (s) => ({ ...s, nailers: "both" })],
  ["no toe kick", (s) => ({ ...s, base: "none" })],
  ["MOVENTO runners", (s) => ({ ...s, slides: "movento" })],
  ["graduated drawers", (s) => ({ ...s, drawerFronts: "graduated" })],
  ["finger-notch drawer pulls", (s) => ({ ...s, drawerPull: "notch" })],
  ["two doors, hinged right", (s) => ({ ...s, doors: "two", hingeSide: "right" })],
  ["thicker measured plywood", (s) => ({ ...s, thickness: s.thickness * 1.03, frontThickness: s.frontThickness * 1.03, drawerThickness: s.drawerThickness * 1.04, backThickness: s.backThickness * 0.93 })],
  ["a tight fit and a deep dado", (s) => ({ ...s, fit: 0, dadoDepth: s.thickness * 0.5, backGrooveDepth: s.thickness * 0.4 })],
  ["wide and shallow", (s) => ({ ...s, width: s.width * 1.5, depth: s.depth * 0.8 })],
  ["narrow", (s) => ({ ...s, width: s.width * 0.6 })],
  // The hardware review's fixes, each where it used to go wrong.
  ["back in a rabbet (inset 0)", (s) => ({ ...s, backInset: 0, nailers: "none" })],
  ["toe kick setback on the 37 mm line", (s) => ({ ...s, toeSetback: 38.1 * MM })],
  ["Blum Europe, toe kick setback on the 69 mm line", (s) => ({ ...s, catalog: "eu", toeSetback: 70 * MM })],
  ["dado stop on the 37 mm line, fixed shelves", (s) => ({ ...s, dadoStop: 35 * MM, shelfType: "fixed" })],
  ["nailers 2 in, their edge on a plate hole", (s) => ({ ...s, nailers: "both", nailerHeight: 2 * 25.4 * MM })],
  ["nailers 65 mm, their edge on a plate hole", (s) => ({ ...s, nailers: "both", nailerHeight: 65 * MM })],
  ["22 mm sides: the door covers what the hinge reaches", (s) => ({ ...s, thickness: 22 * MM, frontThickness: 22 * MM })],
  ["boring distance 3 mm", (s) => ({ ...s, cupDistance: 3 * MM })],
  ["taller, three adjustable shelves among the hinges", (s) => ({ ...s, shelfType: "adjustable", shelves: 3, height: s.height * 1.4 })],
  ["taller, inset, fixed shelves among the hinges", (s) => ({ ...s, front: "inset", shelfType: "fixed", shelves: 3, height: s.height * 1.4 })],
];

describe("the generated cabinet goes together", () => {
  for (const metric of [false, true]) {
    for (const preset of PRESETS) {
      it(`${preset.label} (${metric ? "metric" : "inch"}): no two parts share space, every part is a closed solid, in every variant`, () => {
        let built = 0;
        const wrong: string[] = [];
        for (const [variant, change] of VARIANTS) {
          const s = change(applyPreset(defaults(metric), preset.id, metric));
          const p = plan(s, metric);
          // A variant this preset cannot be built with is refused with a reason, not drawn.
          if (p.error) {
            expect(p.parts).toEqual([]);
            continue;
          }
          built += 1;
          const solids: Solid[] = [];
          try {
            for (const part of p.parts) {
              for (const c of part.copies) {
                const solid = solidOf(`${c.name ?? part.name}`, part.mesh as PartMesh, c.at as V3);
                solids.push(solid);
                // Closed and the right way out: a positive volume no larger than its blank.
                const blank = part.blank[0] * part.blank[1] * part.blank[2] * 1e9;
                const v = solid.solid.volume();
                if (!(v > blank * 0.05 && v <= blank * (1 + 1e-5))) wrong.push(`${variant}: ${part.name} has a volume of ${v.toFixed(0)} mm3 in a blank of ${blank.toFixed(0)}`);
                // The blank is the part's box.
                for (let k = 0; k < 3; k++) if (Math.abs(solid.hi[k] - solid.lo[k] - part.blank[k] * 1000) > 0.005) wrong.push(`${variant}: ${part.name} is not the size of its blank`);
              }
            }
            for (const c of clashes(solids, NOISE)) wrong.push(`${variant}: ${c}`);
            // Inside the cabinet's box: nothing past its sides, top, floor or back.
            for (const q of solids) {
              if (q.lo[0] < -1e-3 || q.hi[0] > s.width * 1000 + 1e-3) wrong.push(`${variant}: ${q.name} is past a side`);
              if (q.lo[2] < -1e-3 || q.hi[2] > s.height * 1000 + 1e-3) wrong.push(`${variant}: ${q.name} is under the floor or over the top`);
              if (q.hi[1] > s.depth * 1000 + 1e-3) wrong.push(`${variant}: ${q.name} is past the back`);
            }
          } finally {
            for (const q of solids) q.solid.delete();
          }
        }
        expect(wrong).toEqual([]);
        // Most variants build for every preset.
        expect(built).toBeGreaterThanOrEqual(12);
      }, 120_000);
    }
  }

  it("the check sees an overlap: a part moved 0.2 mm into its neighbour is caught", () => {
    const s = applyPreset(defaults(false), "base", false);
    const p = plan(s, false);
    const make = (nudge: (name: string) => V3) => p.parts.flatMap((part) => part.copies.map((c) => solidOf(part.name, part.mesh as PartMesh, [c.at[0] + nudge(part.name)[0], c.at[1] + nudge(part.name)[1], c.at[2] + nudge(part.name)[2]])));
    const fine = make(() => [0, 0, 0]);
    expect(clashes(fine, NOISE)).toEqual([]);
    // The bottom 0.7 mm to the right: its tongue (0.5 mm short of the dado's floor) is 0.2 mm into the right side.
    const moved = make((name) => (name === "Bottom" ? [0.0007, 0, 0] : [0, 0, 0]));
    const found = clashes(moved, NOISE);
    expect(found.some((c) => /Bottom/.test(c) && /Right side/.test(c))).toBe(true);
    // The back 1 mm lower: into the bottom of its groove.
    const dropped = make((name) => (name === "Back" ? [0, 0, -0.001] : [0, 0, 0]));
    expect(clashes(dropped, NOISE).some((c) => /Back/.test(c))).toBe(true);
    for (const q of [...fine, ...moved, ...dropped]) q.solid.delete();
  }, 60_000);

  it("a row's base frame: rails and sleepers share no space, in dados and butted, plywood and lumber", () => {
    for (const metric of [false, true]) {
      const U = metric ? 0.001 : 0.0254;
      const widths = metric ? [600, 450, 900] : [24, 18, 36];
      const row: Cab[] = [];
      for (const w of widths) {
        const size = { width: w * U, depth: (metric ? 560 : 23.25) * U };
        row.push({ id: row.length + 1, name: `Cab ${row.length + 1}`, ...size, height: (metric ? 770 : 30.5) * U, world: row.length ? placeNext(row[row.length - 1], size, "right") : IDENTITY });
      }
      const base = baseDefaults(metric);
      for (const change of [(b: typeof base) => b, (b: typeof base) => ({ ...b, joint: "butt" }), (b: typeof base) => ({ ...b, stock: "lumber" }), (b: typeof base) => ({ ...b, stock: "saw" }), (b: typeof base) => ({ ...b, ends: "both" })]) {
        const b = change(base) as typeof base;
        const p = planBase(row, b);
        if (p.error) continue;
        const solids = p.parts.flatMap((part) => part.copies.map((c) => solidOf(c.name ?? part.name, part.mesh as PartMesh, c.at as V3)));
        expect(solids.length).toBeGreaterThan(4);
        expect(clashes(solids, NOISE)).toEqual([]);
        // The frame is no longer than the row and no taller than its height.
        for (const q of solids) {
          expect(q.lo[0]).toBeGreaterThanOrEqual(-1e-3);
          expect(q.hi[0]).toBeLessThanOrEqual(p.length * 1000 + 1e-3);
          expect(q.hi[2]).toBeLessThanOrEqual(b.height * 1000 + 1e-3);
        }
        for (const q of solids) q.solid.delete();
      }
    }
  }, 60_000);
});
