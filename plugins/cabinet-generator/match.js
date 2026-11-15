// @ts-check
// Grain-matched fronts: a cabinet's doors and drawer fronts cut from one panel in the order
// they stand, so the grain runs on from one front into the next, the way a cabinet maker cuts
// a stack of drawer fronts (and a drawer front over a door) from one board in sequence.
//
// Each front of the stack gets the part attribute `together` (docs/format.md, "Kept
// together"): one key, its place in the stack, and which way the stack runs against the
// grain. The nesting then lays the fronts out as one block, in that order, a kerf apart,
// their grain lined up, and never splits it between sheets. Pure, so it is tested on its own.
//
// The rule, from what grain matching needs:
// - One column of fronts. Every front spans the same width at the same place across the
//   cabinet. A pair of doors stands side by side, not in the stack: refused.
// - One way of grain. Vertical grain (running up the cabinet) continues along the grain: the
//   fronts are cut end to end, each crosscut off the next (`along`). Grain across the cabinet
//   continues across it: the fronts are cut side by side, each ripped off the next (`across`),
//   which matches only because they are one width and lined up. Doors vertical and drawer
//   faces across (the defaults) cannot be one stack: refused, with what to change.
// - One panel. The fronts are one thickness (the doors' stock and the drawer faces' stock),
//   and with a door in the stack the drawer fronts take the doors' material, so the nesting
//   cuts them from the same sheets.
// - The order, so that on the sheet each front's edge lies against the edge it meets in the
//   cabinet. The nesting lays a block out from its corner in index order; the router's file
//   (src/nesting/machine.ts) draws a front with its top toward that corner when the stack runs
//   along the grain (vertical grain: the length runs with the file's x, from the face cut, the
//   inside, mirrored), and away from it when it runs across (the height runs with the sheet's y).
//   So vertical grain is indexed from the top front down, grain across from the bottom front up;
//   either way each front's bottom edge meets the top edge of the front below it.
//   src/nesting/grainmatch.wasm.test.ts measures it from the pull holes through the kernel.
//
// The gap between neighbours on the sheet is the nesting's kerf (the gap the router leaves
// between parts, at least the bit's width: 3/8 in with CNC spacing for a 1/4 in bit), so the
// grain jumps by that width between fronts; the cabinet's reveal gap is a different number and
// adds nothing here. No published allowance for either was found, so none is invented.

/** The parts that open: doors and drawer fronts (cabinet.js names them so). */
const FRONTS = new Set(["Door", "Left door", "Right door", "Drawer front"]);

/** The key every cabinet's stack carries: a block is one key in one cabinet, so each cabinet
 * (each copy too) is its own block. */
export const MATCH_KEY = "Grain-matched fronts";

/** How close two fronts' edges must be to count as one column (metres). */
const SAME = 1e-6;

/**
 * @typedef {import("./cabinet.js").Part} Part
 * @typedef {import("./cabinet.js").Sizes} Sizes
 */

/** Which way a front's grain runs on the cabinet, as the settings say. @param {Sizes} s @param {string} name */
function runOf(s, name) {
  if (/door$/i.test(name)) return s.grainDoors;
  return s.layout === "trash" ? s.grainDoors : s.grainFronts;
}

/** A length as the panel shows it: millimetres, and inches beside. @param {number} m */
const both = (m) => `${Math.round(m * 1e4) / 10} mm (${(m / 0.0254).toFixed(3)} in)`;

/**
 * The parts with grain matching applied: each front of the stack its own part (one copy, so
 * each takes its own place), carrying `together`. Unchanged when matching is off or there are
 * fewer than two fronts. Throws, saying why, when the fronts cannot be one stack.
 * @param {Part[]} parts @param {Sizes} s @returns {Part[]}
 */
export function matchFronts(parts, s) {
  if (!s.grainMatch) return parts;
  /** @type {{ part: Part, copy: { at: [number, number, number], name?: string } }[]} */
  const fronts = [];
  for (const part of parts) if (FRONTS.has(part.name)) for (const copy of part.copies) fronts.push({ part, copy });
  if (fronts.length < 2) return parts;
  if (fronts.some((f) => f.part.name === "Left door" || f.part.name === "Right door")) {
    throw new Error("Grain-matched fronts run up one column of fronts, and a pair of doors stands side by side. Pick a single door (Fronts and pulls › Doors), or turn grain matching off.");
  }
  const x0 = fronts[0].copy.at[0];
  const w = fronts[0].part.blank[0];
  if (fronts.some((f) => Math.abs(f.copy.at[0] - x0) > SAME || Math.abs(f.part.blank[0] - w) > SAME)) {
    throw new Error("Grain-matched fronts run up one column of fronts, one width at one place across the cabinet; these are not.");
  }
  const runs = new Set(fronts.map((f) => runOf(s, f.part.name)));
  if (runs.size > 1) {
    throw new Error(
      `Grain-matched fronts need the grain to run one way up the stack: the doors' grain is ${s.grainDoors === "vertical" ? "vertical" : "across"} and the drawer faces' ${s.grainFronts === "vertical" ? "vertical" : "across"}. Make them the same (Materials › Grain), or turn grain matching off.`,
    );
  }
  const t = fronts[0].part.blank[1];
  if (fronts.some((f) => Math.abs(f.part.blank[1] - t) > SAME)) {
    throw new Error(`Grain-matched fronts are cut from one panel, so the doors and the drawer faces must be one thickness: they are ${both(s.thickness)} and ${both(s.frontThickness)} (Materials).`);
  }
  const stack = runs.has("vertical") ? "along" : "across";
  const door = fronts.find((f) => /door$/i.test(f.part.name));
  const material = door ? door.part.material : fronts[0].part.material;
  // Along the grain from the top front down; across it from the bottom front up (see above).
  const order = [...fronts].sort((a, b) => (stack === "along" ? b.copy.at[2] - a.copy.at[2] : a.copy.at[2] - b.copy.at[2]));
  /** @type {Map<Part, Part[]>} */
  const split = new Map();
  order.forEach((f, index) => {
    /** @type {Part} */
    const one = { ...f.part, material, copies: [f.copy], together: { key: MATCH_KEY, index, stack } };
    split.set(f.part, [...(split.get(f.part) ?? []), one]);
  });
  // Each front part where it was, as its copies in the order they were made.
  return parts.flatMap((p) => {
    const ones = split.get(p);
    if (!ones) return [p];
    return p.copies.map((c) => /** @type {Part} */ (ones.find((o) => o.copies[0] === c)));
  });
}
