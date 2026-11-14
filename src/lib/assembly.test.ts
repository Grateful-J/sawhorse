import { describe, expect, it } from "vitest";
import { assemblyIndex } from "./assembly";

const node = (id: number, parent: number | null, name: string | null, label = "Group") => ({ id, parent, name, label });

describe("the assembly a piece is in", () => {
  // Base 1 (node 1) holds two component parts (2, 3) and a sub-assembly (4) holding part 5;
  // a second cabinet with the SAME name (node 10) holds part 11; a top-level group (20) holds
  // two solids drawn straight inside it (objects 100, 101); part 30 stands on its own, and so
  // does solid 102.
  const graph = {
    nodes: [node(1, null, "Base 1"), node(2, 1, "Left side"), node(3, 1, "Right side"), node(4, 1, "Drawer 1"), node(5, 4, "Drawer 1 front"), node(10, null, "Base 1"), node(11, 10, "Left side"), node(20, null, null, "Group"), node(30, null, "Loose shelf")],
    objects: [
      { id: 100, parent: 20 },
      { id: 101, parent: 20 },
      { id: 102, parent: null },
      { id: 103, parent: 2 },
      { id: 104, parent: 30 },
    ],
  };
  const of = assemblyIndex(graph);

  it("a part that is a group or component is in the outermost node above it", () => {
    expect(of({ node: 2 })).toEqual({ id: 1, name: "Base 1" });
    expect(of({ node: 5 })).toEqual({ id: 1, name: "Base 1" });
    // The sub-assembly itself, listed as a part, is in the cabinet too.
    expect(of({ node: 4 })).toEqual({ id: 1, name: "Base 1" });
  });

  it("a part standing on its own at the top is in nothing", () => {
    expect(of({ node: 30 })).toBeNull();
    expect(of({ node: 1 })).toBeNull();
    expect(of({ object: 102 })).toBeNull();
    // Not in the model at all.
    expect(of({ node: 999 })).toBeNull();
    expect(of({ object: 999 })).toBeNull();
  });

  it("a solid drawn straight inside a top-level group is that group's part", () => {
    expect(of({ object: 100 })).toEqual({ id: 20, name: "Group" });
    expect(of({ object: 101 })).toEqual({ id: 20, name: "Group" });
    // And a solid deeper down is in the outermost node, like any piece.
    expect(of({ object: 103 })).toEqual({ id: 1, name: "Base 1" });
    expect(of({ object: 104 })).toEqual({ id: 30, name: "Loose shelf" });
  });

  it("two assemblies with one name are two", () => {
    const a = of({ node: 2 });
    const b = of({ node: 11 });
    expect(a?.name).toBe(b?.name);
    expect(a?.id).not.toBe(b?.id);
  });
});
