// Read each nested part's faces and keep only the cuts that sit inside its blank.
import type { CutList, CutOptions, FaceInfo, Item, Nesting, Placement, V3 } from "../kernel/types";
import { machineBlank, type BlankFeatures, type FaceLoop } from "./machine";

export interface Measurer {
  faces(object: number): Promise<FaceInfo[]>;
  outline(part: "face", owner: number, index: number): Promise<V3[][]>;
  /** The cut list: each part's own thickness, width and length directions. With it a cabinet
   * turned to any angle, and a square part, are measured; without it only parts that lie
   * along the model's axes are. */
  cutList?(options: CutOptions): Promise<CutList>;
}

const itemKey = (item: Item) => ("object" in item ? `o${item.object}` : `n${item.node}`);

export interface MeasuredNest {
  features: Map<string, BlankFeatures>;
  /** Part names whose extra cuts were left out. */
  skipped: string[];
  /** Part names with cuts in both faces (a second setup). */
  flipped: string[];
}

/** Solids that belong to a placement: the solid itself, or the solids of an instance. */
function solidsOf(objects: { id: number; parent: number | null }[], q: Placement): number[] {
  const item = q.item;
  if ("object" in item) return [item.object];
  const node = item.node;
  return objects.filter((o) => o.parent === node).map((o) => o.id);
}

/** A ring's area in the plane normal to `n` (Newell). */
function ringArea(ring: V3[], n: V3): number {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return Math.abs(x * n[0] + y * n[1] + z * n[2]) / 2;
}

/**
 * Pockets, drills and notched outlines for a nesting, measured from the model.
 * A glue-up strip is left as its rectangle: the strip is not the whole part.
 * A part that cannot be read, or whose solids are not in the model, is named in `skipped` and
 * keeps its rectangle.
 */
export async function measureNest(kernel: Measurer, objects: { id: number; parent: number | null }[], nesting: Nesting): Promise<MeasuredNest> {
  const cache = new Map<number, FaceLoop[]>();
  const features = new Map<string, BlankFeatures>();
  const skipped: string[] = [];
  const flipped: string[] = [];
  const note = (list: string[], name: string) => {
    if (!list.includes(name)) list.push(name);
  };
  const loopsOf = async (id: number): Promise<FaceLoop[]> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const faces = await kernel.faces(id);
    const loops: FaceLoop[] = [];
    for (const face of faces) {
      const rings = (await kernel.outline("face", id, face.id)).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      // The outer ring encloses the most area; the rest are holes in the face.
      let outer = 0;
      rings.forEach((r, i) => {
        if (ringArea(r, face.normal) > ringArea(rings[outer], face.normal)) outer = i;
      });
      loops.push({ points: rings[outer], holes: rings.filter((_, i) => i !== outer), normal: face.normal, origin: face.origin });
    }
    cache.set(id, loops);
    return loops;
  };
  // Each part's directions, read with its faces so both describe the same model.
  const frames = new Map<string, [V3, V3, V3]>();
  try {
    const list = await kernel.cutList?.({ rounding: "sixteenth", visible_only: false });
    for (const row of list?.rows ?? []) for (const o of row.occurrences) frames.set(itemKey(o.item), o.axes);
  } catch {
    // Without them, parts along the axes are still measured and the rest are named.
  }
  for (const piece of nesting.pieces) {
    for (const q of piece.placements) {
      if (q.strip) continue;
      try {
        const ids = solidsOf(objects, q);
        const loops: FaceLoop[] = [];
        for (const id of ids) loops.push(...(await loopsOf(id)));
        // A part with no solids to read is not in the model any more (the nesting is older than
        // the model): named, never passed off as a plain rectangle.
        if (!loops.length) {
          note(skipped, q.name);
          continue;
        }
        const feat = machineBlank(q.size, loops, q.turned, frames.get(itemKey(q.item)));
        if (feat.skipped) note(skipped, q.name);
        if (feat.flip.pockets.length || feat.flip.drills.length) note(flipped, q.name);
        if (feat.profile || feat.cutouts.length || feat.pockets.length || feat.drills.length || feat.flip.pockets.length || feat.flip.drills.length) features.set(q.tag, feat);
      } catch {
        note(skipped, q.name);
      }
    }
  }
  return { features, skipped, flipped };
}
