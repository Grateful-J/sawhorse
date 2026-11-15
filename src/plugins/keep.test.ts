// What the cabinet generator keeps in the document: compact, bounded to the 64 KB a plugin's
// document store holds, and read with suspicion (a .shz can come from anyone).
import { describe, expect, it } from "vitest";
import { BASELINE } from "../../plugins/cabinet-generator/baseline.js";
import { applyPreset, defaults, normalize, PRESETS } from "../../plugins/cabinet-generator/cabinet.js";
import { BUDGET, describes, keep, keptFor, keptMetric, liveKeysOf, pack, prune, stampOf, strangers, unpack, validFrame, type Kept } from "../../plugins/cabinet-generator/keep.js";
import { DOC_QUOTA } from "./store";

const frame = { linear: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [1.2345678901234, -0.5, 0.1016] as [number, number, number] };

describe("kept cabinets", () => {
  it("every preset, in both units, comes back exactly as it went in", () => {
    for (const metric of [false, true]) {
      for (const p of PRESETS) {
        const s = { ...applyPreset(defaults(metric), p.id, metric), name: `${p.name} 7`, width: metric ? 0.583 : 0.5207 };
        expect(unpack(pack(s, metric), metric), `${p.id} ${metric ? "mm" : "in"}`).toEqual(s);
      }
    }
  });

  it("keeps only what differs from the baseline: about a fifth of the whole", () => {
    const s = applyPreset(defaults(false), "drawers", false);
    const packed = pack(s, false);
    // Exactly the settings that differ from the baseline, each with its value: none missing, none extra.
    // (A setting newer than the baseline counts only when it is not its default.)
    const base = BASELINE.in as Record<string, unknown>;
    const filled = normalize({ ...base }, false) as unknown as Record<string, unknown>;
    const differ = Object.fromEntries(Object.entries(s).filter(([k, v]) => base[k] !== v && !(!(k in base) && filled[k] === v)));
    expect(packed.d).toEqual(differ);
    expect(Object.keys(differ).length).toBeGreaterThan(0);
    expect(Object.keys(differ).length).toBeLessThan(Object.keys(s).length / 3);
    expect(JSON.stringify({ ...packed, frame }).length).toBeLessThan(JSON.stringify({ sizes: s, frame }).length / 3);
    // A metric cabinet says so, and is read against the metric baseline.
    expect(pack(defaults(true), true)).toEqual({ d: {}, m: 1 });
  });

  it("reads a cabinet kept whole by an older version, and nothing from junk", () => {
    const s = applyPreset(defaults(false), "sink", false);
    expect(unpack({ sizes: s, frame }, false)).toEqual(normalize({ ...s }, false));
    for (const junk of [null, undefined, 3, "x", {}, { d: [1, 2] }, { d: null }]) expect(unpack(junk as never, false)).toBeNull();
    // Junk values inside are normalized away, never trusted.
    const odd = unpack({ d: { width: "wide", layout: "rocket", shelves: -4e9 } }, false)!;
    expect(odd.width).toBe(BASELINE.in.width);
    expect(odd.layout).toBe(normalize(null, false).layout);
  });

  it("the baseline is frozen: the values cabinets are kept against never change", () => {
    expect(Object.isFrozen(BASELINE) && Object.isFrozen(BASELINE.in) && Object.isFrozen(BASELINE.mm)).toBe(true);
    // Any edit to baseline.js changes this checksum; a new default goes in cabinet.js, not here.
    const json = JSON.stringify(BASELINE);
    let h = 0x811c9dc5;
    for (const ch of json) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    expect([json.length, h.toString(16)]).toEqual([2532, "22b309a2"]);
    expect([BASELINE.in.width, BASELINE.in.thickness, BASELINE.mm.depth, BASELINE.mm.backThickness]).toEqual([24 * 0.0254, (23 / 32) * 0.0254, 0.56, 0.006]);
  });
});

describe("frames read from a document", () => {
  it("takes a real frame (copied, not shared) and refuses anything else", () => {
    const f = validFrame(frame)!;
    expect(f).toEqual(frame);
    expect(f.linear[0]).not.toBe(frame.linear[0]);
    for (const bad of [
      null,
      "frame",
      { linear: [[1, 0, 0], [0, 1, 0]], translation: [0, 0, 0] },
      { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0] },
      { linear: [[1, 0, 0], [0, 1, 0], [0, 0, Number.NaN]], translation: [0, 0, 0] },
      { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, Infinity, 0] },
      { linear: [[1, 0, 0], [0, 1, 0], [0, 0, "1"]], translation: [0, 0, 0] },
      // Flat: no inverse.
      { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 0]], translation: [0, 0, 0] },
    ])
      expect(validFrame(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("the document store stays under its quota", () => {
  it("drops the oldest entries no longer in the model first, never a live one", () => {
    const all: Record<string, string> = { n1: "a".repeat(100), n2: "b".repeat(100), n3: "c".repeat(100), n4: "d".repeat(100) };
    prune(all, new Set(["n1", "n4"]), 250);
    expect(Object.keys(all)).toEqual(["n1", "n4"]);
    // Under budget: nothing goes.
    const small: Record<string, string> = { n1: "a", n2: "b" };
    expect(Object.keys(prune(small, new Set(), 1000))).toEqual(["n1", "n2"]);
    // Live entries over budget stay (the caller hears the store refuse, and warns).
    const live: Record<string, string> = { n1: "a".repeat(500) };
    expect(Object.keys(prune(live, new Set(["n1"]), 10))).toEqual(["n1"]);
  });

  it("a kitchen of 60 cabinets and its edit history fits, with the base frames, in 64 KB", () => {
    const all: Record<string, unknown> = {};
    const live = new Set<string>();
    let id = 1;
    // 60 cabinets, each edited 10 times (every edit is a new instance; the old ones stay for Undo).
    for (let c = 0; c < 60; c++) {
      for (let e = 0; e < 10; e++) {
        const s = { ...applyPreset(defaults(false), PRESETS[c % PRESETS.length].id, false), name: `Cabinet ${c + 1}`, width: (12 + e + (c % 7) * 3) * 0.0254 };
        all[`n${id}`] = { ...pack(s, false), frame: { ...frame, translation: [c * 0.6, 0, 0] } };
        if (e === 9) live.add(`n${id}`);
        id++;
        prune(all, live, BUDGET.cabinets);
      }
    }
    expect(JSON.stringify(all).length).toBeLessThanOrEqual(BUDGET.cabinets);
    for (const k of live) expect(all[k], k).toBeDefined();
    expect(BUDGET.cabinets + BUDGET.bases).toBeLessThan(DOC_QUOTA);
  });
});

describe("each entry is tied to the parts it was made with", () => {
  const ids = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);
  const sized = (width: number, p: number): Kept => ({ ...pack({ ...defaults(false), width: width * 0.0254 }, false), frame, ...stampOf(ids(p, 7)) });

  it("keeps the parts as a run (or every id when they are not one)", () => {
    expect(stampOf([9, 10, 11, 12, 13, 14, 15])).toEqual({ p: 9, n: 7 });
    expect(stampOf([15, 9, 11, 10, 12, 13, 14])).toEqual({ p: 9, n: 7 });
    expect(stampOf([9, 4294967297, 4294967298])).toEqual({ p: 9, k: [9, 4294967297, 4294967298] });
    expect(stampOf([])).toEqual({});
    expect(strangers({ p: 9, n: 7 }, [9, 12, 15, 16, 40])).toEqual([16, 40]);
    expect(strangers({ p: 9, k: [9, 30] }, [9, 30, 31])).toEqual([31]);
    // An entry from an older file says nothing about its parts: nothing is a stranger, and it describes any instance.
    expect(strangers({}, [1, 2])).toEqual([]);
    expect(describes({ d: {} } as Kept, [])).toBe(true);
  });

  it("an edit made inside an open cabinet, undone: the earlier entry is read, and the later again on Redo", () => {
    const all: Record<string, Kept> = {};
    keep(all, 17, sized(24, 18));
    // Rebuilt in place: the same instance, new parts. The 24 in entry moves aside, for Undo.
    keep(all, 17, sized(30, 41));
    expect(Object.keys(all)).toEqual(["n17/18", "n17"]);
    // Now (parts 41..47): 30 wide.
    expect(unpack(keptFor(all, 17, ids(41, 7))!.kept, false)!.width).toBeCloseTo(30 * 0.0254, 12);
    // Undone (parts 18..24 back): 24 wide, from the entry moved aside.
    const undone = keptFor(all, 17, ids(18, 7))!;
    expect(undone.key).toBe("n17/18");
    expect(unpack(undone.kept, false)!.width).toBeCloseTo(24 * 0.0254, 12);
    // A part deleted by hand does not make it a stranger.
    expect(keptFor(all, 17, ids(42, 6))!.key).toBe("n17");
    // Rebuilt again with the same parts (no change of parts): no history entry.
    keep(all, 17, sized(30, 41));
    expect(Object.keys(all)).toEqual(["n17/18", "n17"]);
  });

  it("an id handed out again after an Undo, to a part of another cabinet, is not taken for a cabinet", () => {
    const all: Record<string, Kept> = {};
    keep(all, 17, sized(24, 18));
    // Node 17 is now "Back rail A" of another cabinet: it has no parts of its own.
    expect(keptFor(all, 17, [])).toBeNull();
    // Or a group holding other things.
    expect(keptFor(all, 17, [90, 91])).toBeNull();
    // An entry from an older file is taken as it was.
    expect(keptFor<Kept>({ n17: { d: {} } }, 17, [])).not.toBeNull();
  });

  it("the entries kept for the model now are never pruned: every node's, and each earlier entry that describes its parts", () => {
    const all: Record<string, Kept> = {};
    keep(all, 17, sized(24, 18));
    keep(all, 17, sized(30, 41));
    keep(all, 60, sized(18, 61));
    const nodes = [{ id: 17, parent: null }, ...ids(18, 7).map((id) => ({ id, parent: 17 }))];
    const live = liveKeysOf(all as Record<string, unknown>, nodes);
    expect([...live].filter((k) => k in all).sort()).toEqual(["n17", "n17/18"]);
    // With the later parts in the model instead, the earlier entry is not live.
    const later = liveKeysOf(all as Record<string, unknown>, [{ id: 17, parent: null }, ...ids(41, 7).map((id) => ({ id, parent: 17 }))]);
    expect(later.has("n17/18")).toBe(false);
  });

  it("prune drops the oldest first, an earlier state of a cabinet edited in place like a cabinet replaced (Undo needs the newest)", () => {
    const all: Record<string, string> = { n1: "a".repeat(100), "n2/5": "b".repeat(100), n3: "c".repeat(100), "n2/9": "d".repeat(100), n2: "e".repeat(100) };
    prune(all, new Set(["n2"]), 330);
    expect(Object.keys(all)).toEqual(["n3", "n2/9", "n2"]);
  });

  it("a kitchen of 60 cabinets, each edited 10 times in place and replaced, fits, and every entry the model needs stays", () => {
    const all: Record<string, Kept> = {};
    let id = 1;
    /** Each cabinet's instance now, and its parts now. */
    const now = new Map<number, number>();
    for (let c = 0; c < 60; c++) {
      let inst = id++;
      for (let e = 0; e < 10; e++) {
        const s = { ...applyPreset(defaults(false), PRESETS[c % PRESETS.length].id, false), name: `Cabinet ${c + 1}`, width: (12 + e + (c % 7) * 3) * 0.0254 };
        // Every other edit made inside the open cabinet (same instance, new parts: the odd ones), the rest from outside (a new instance).
        if (e > 0 && e % 2 === 0) inst = id++;
        const p = id;
        id += 30;
        keep(all, inst, { ...pack(s, false), frame: { ...frame, translation: [c * 0.6, 0, 0] }, ...stampOf(ids(p, 30)) });
        now.set(c, inst);
        const nodes = [...now.values()].flatMap((i) => [{ id: i, parent: null }, ...ids(all[`n${i}`].p!, 30).map((k) => ({ id: k, parent: i }))]);
        prune(all, liveKeysOf(all as Record<string, unknown>, nodes), BUDGET.cabinets);
      }
    }
    expect(JSON.stringify(all).length).toBeLessThanOrEqual(BUDGET.cabinets);
    for (const inst of now.values()) expect(keptFor(all, inst, ids(all[`n${inst}`].p!, 30)), `n${inst}`).not.toBeNull();
    // The newest earlier state is kept (the next Undo needs it), the oldest are gone.
    const last = now.get(59)!;
    expect(Object.keys(all).some((k) => k.startsWith(`n${last}/`))).toBe(true);
    expect(Object.keys(all).some((k) => k.startsWith(`n${now.get(0)}/`))).toBe(false);
  });

  it("a cabinet is planned in its own units: the flag it was kept with, not the document's now", () => {
    expect(keptMetric(pack(defaults(false), false), true)).toBe(false);
    expect(keptMetric(pack(defaults(true), true), false)).toBe(true);
    // Kept whole by an older version: the document's.
    expect(keptMetric({ sizes: defaults(true) }, true)).toBe(true);
    expect(keptMetric({ sizes: defaults(true) }, false)).toBe(false);
  });
});
