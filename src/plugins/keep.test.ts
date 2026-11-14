// What the cabinet generator keeps in the document: compact, bounded to the 64 KB a plugin's
// document store holds, and read with suspicion (a .shz can come from anyone).
import { describe, expect, it } from "vitest";
import { BASELINE } from "../../plugins/cabinet-generator/baseline.js";
import { applyPreset, defaults, normalize, PRESETS } from "../../plugins/cabinet-generator/cabinet.js";
import { BUDGET, pack, prune, unpack, validFrame } from "../../plugins/cabinet-generator/keep.js";
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
    const differ = Object.fromEntries(Object.entries(s).filter(([k, v]) => (BASELINE.in as Record<string, unknown>)[k] !== v));
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
