// The assembly a cut-list piece is in: its outermost group or component (a cabinet, a base
// frame). The cut list By assembly puts each piece under it, and the CNC file names say it.
import type { Item } from "../kernel/types";

export interface Assembly {
  /** The node: two assemblies with one name are still two. */
  id: number;
  /** Its name, else what the Outliner shows for it. */
  name: string;
}

interface Node {
  id: number;
  parent: number | null;
  name: string | null;
  label: string;
}

/**
 * A lookup over one scene graph, built once (a cut list asks for every piece): the outermost
 * node above a piece.
 * - A piece that is a group or a component (a node) is in the outermost node ABOVE it: a
 *   cabinet's side is in the cabinet, and a part standing on its own at the top is in nothing.
 * - A piece that is a solid is in the outermost node that holds it, the one it sits directly in
 *   included: solids drawn straight inside a top-level group are that group's parts.
 */
export function assemblyIndex(graph: { nodes: readonly Node[]; objects: readonly { id: number; parent: number | null }[] }): (item: Item) => Assembly | null {
  const nodes = new Map(graph.nodes.map((g) => [g.id, g]));
  const parentOf = new Map(graph.objects.map((o) => [o.id, o.parent]));
  const tops = new Map<number, Node | null>();
  const topOf = (start: number): Node | null => {
    const hit = tops.get(start);
    if (hit !== undefined) return hit;
    let top = nodes.get(start) ?? null;
    for (let guard = 0; top && top.parent !== null && nodes.has(top.parent) && guard < 4096; guard++) top = nodes.get(top.parent)!;
    tops.set(start, top);
    return top;
  };
  return (item) => {
    const solid = "object" in item;
    const start = solid ? (parentOf.get(item.object) ?? null) : item.node;
    if (start === null) return null;
    const top = topOf(start);
    if (!top || (!solid && top.id === start)) return null;
    return { id: top.id, name: top.name ?? top.label };
  };
}
