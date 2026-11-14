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
}

/** Solids that belong to a placement: the solid itself, or the solids of an instance. */
function solidsOf(objects: { id: number; parent: number | null }[], q: Placement): number[] {
  const item = q.item;
  if ("object" in item) return [item.object];
  const node = item.node;
  return objects.filter((o) => o.parent === node).map((o) => o.id);
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
  const note = (name: string) => {
    if (!skipped.includes(name)) skipped.push(name);
  };
  const loopsOf = async (id: number): Promise<FaceLoop[]> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const faces = await kernel.faces(id);
    const loops: FaceLoop[] = [];
    for (const face of faces) {
      const rings = await kernel.outline("face", id, face.id);
      for (const ring of rings) {
        if (ring.length >= 3) loops.push({ points: ring, normal: face.normal, origin: face.origin });
      }
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
        if (feat.skipped) note(q.name);
        if (feat.profile || feat.pockets.length || feat.drills.length) features.set(q.tag, feat);
      } catch {
        note(q.name);
      }
    }
  }
  return { features, skipped };
}
