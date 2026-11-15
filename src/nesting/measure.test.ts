import { describe, expect, it } from "vitest";
import type { FaceInfo, Nesting, V3 } from "../kernel/types";
import { smallNesting } from "./fixture";
import { measureNest, type Measurer } from "./measure";

const IN = 0.0254;

/** The six faces of a box with its corner at the origin: thickness along x, width y, length z. */
function boxFaces(t: number, w: number, l: number): { info: FaceInfo; ring: V3[] }[] {
  const face = (id: number, normal: V3, ring: V3[]) => ({ info: { id, normal, origin: ring[0] } as FaceInfo, ring });
  return [
    face(0, [-1, 0, 0], [[0, 0, 0], [0, 0, l], [0, w, l], [0, w, 0]]),
    face(1, [1, 0, 0], [[t, 0, 0], [t, w, 0], [t, w, l], [t, 0, l]]),
    face(2, [0, -1, 0], [[0, 0, 0], [t, 0, 0], [t, 0, l], [0, 0, l]]),
    face(3, [0, 1, 0], [[0, w, 0], [0, w, l], [t, w, l], [t, w, 0]]),
    face(4, [0, 0, -1], [[0, 0, 0], [0, w, 0], [t, w, 0], [t, 0, 0]]),
    face(5, [0, 0, 1], [[0, 0, l], [t, 0, l], [t, w, l], [0, w, l]]),
  ];
}

/** A model that holds a plain box for each of `solids` and nothing else. */
function model(solids: Record<number, [number, number, number]>): Measurer {
  return {
    async faces(object) {
      const s = solids[object];
      if (!s) throw new Error(`no solid ${object}`);
      return boxFaces(...s).map((f) => f.info);
    },
    async outline(_part, owner, index) {
      return [boxFaces(...solids[owner])[index].ring];
    },
  };
}

describe("measuring a nesting against the model", () => {
  // The fixture's shelves are nodes 3 and 4, its back panel node 6.
  const n: Nesting = smallNesting();
  const shelf: [number, number, number] = [0.75 * IN, 11 * IN, 34.5 * IN];
  const tags = n.pieces.flatMap((p) => p.placements.map((q) => ({ tag: q.tag, name: q.name, node: "node" in q.item ? q.item.node : -1 })));

  it("a part whose solids are all there is measured, and a plain box is not named", async () => {
    const objects = tags.map((t, i) => ({ id: 100 + i, parent: t.node }));
    const solids = Object.fromEntries(objects.map((o) => [o.id, shelf] as const));
    const m = await measureNest(model(solids), objects, n);
    expect(m.skipped).toEqual([]);
  });

  it("a part whose solids are no longer in the model is named, never passed off as a plain rectangle", async () => {
    // The nesting is older than the model: the second shelf (node 4) has been deleted.
    const kept = tags.filter((t) => t.node !== 4);
    const objects = kept.map((t, i) => ({ id: 100 + i, parent: t.node }));
    const solids = Object.fromEntries(objects.map((o) => [o.id, shelf] as const));
    const m = await measureNest(model(solids), objects, n);
    expect(m.skipped).toEqual(["Shelf"]);
    expect(m.features.has("1b")).toBe(false);
    // Every part gone: every name, once.
    const none = await measureNest(model({}), [], n);
    expect(none.skipped).toEqual([...new Set(tags.map((t) => t.name))]);
  });

  it("a solid the kernel cannot read is named too", async () => {
    const objects = tags.map((t, i) => ({ id: 100 + i, parent: t.node }));
    // The model knows none of them: reading their faces is refused.
    const m = await measureNest(model({}), objects, n);
    expect(m.skipped).toEqual([...new Set(tags.map((t) => t.name))]);
  });
});
