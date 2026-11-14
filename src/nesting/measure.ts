// Read each nested part's faces and keep only the cuts that sit inside its blank.
import type { FaceInfo, Nesting, Placement, V3 } from "../kernel/types";
import { machineBlank, type BlankFeatures, type FaceLoop } from "./machine";

export interface Measurer {
  faces(object: number): Promise<FaceInfo[]>;
  outline(part: "face", owner: number, index: number): Promise<V3[][]>;
}

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
 * A part that cannot be read is named in `skipped` and keeps its rectangle.
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
  for (const piece of nesting.pieces) {
    for (const q of piece.placements) {
      if (q.strip) continue;
      try {
        const ids = solidsOf(objects, q);
        const loops: FaceLoop[] = [];
        for (const id of ids) loops.push(...(await loopsOf(id)));
        if (!loops.length) continue;
        const feat = machineBlank(q.size, loops, q.turned);
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
