// @ts-check
// Frameless cabinet layouts. Sizes are metres. The default (shelves, no dados, no
// hardware) is the original butt-jointed cabinet, so a shop that never opts in gets
// the same parts as before.
import { partMesh } from "./mesh.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {"shelves" | "doors" | "drawers" | "mixed"} Layout */
/** @typedef {"overlay" | "inset"} Front */
/** @typedef {"face" | "undermount"} Pull */
/**
 * @typedef {{
 *   width: number, height: number, depth: number, thickness: number,
 *   shelves: number, back: boolean, toeKick: number,
 *   layout: Layout, drawers: number, front: Front,
 *   dados: boolean, hardware: boolean,
 *   hingeInset: number, slideClearance: number, slideSetback: number,
 *   pull: Pull, pullSpacing: number,
 * }} Sizes
 */
/** @typedef {import("./mesh.js").Prism} Prism */
/** @typedef {import("./mesh.js").Hole} Hole */
/** @typedef {[number, number, number]} V3 */
/** @typedef {V3 | { linear: number[][], translation: V3 }} At */
/**
 * @typedef {{
 *   name: string,
 *   blank: V3,
 *   copies: { at: At, name?: string }[],
 *   mesh: import("./mesh.js").Mesh,
 * }} Part
 */

/** @param {string} system */
export const isMetric = (system) => system === "mm" || system === "cm" || system === "m";

/** @param {boolean} metric @returns {Sizes} */
export function defaults(metric) {
  return metric
    ? {
        width: 600 * MM, height: 720 * MM, depth: 560 * MM, thickness: 18 * MM,
        shelves: 1, back: true, toeKick: 100 * MM,
        layout: "shelves", drawers: 3, front: "overlay",
        dados: false, hardware: false,
        hingeInset: 100 * MM, slideClearance: 21 * MM, slideSetback: 37 * MM,
        pull: "face", pullSpacing: 96 * MM,
      }
    : {
        width: 24 * IN, height: 34.5 * IN, depth: 24 * IN, thickness: 0.75 * IN,
        shelves: 1, back: true, toeKick: 4 * IN,
        layout: "shelves", drawers: 3, front: "overlay",
        dados: false, hardware: false,
        hingeInset: 3.5 * IN, slideClearance: (13 / 16) * IN, slideSetback: 1.5 * IN,
        pull: "face", pullSpacing: 3 * IN,
      };
}

/** @param {Partial<Sizes> | null | undefined} saved @param {boolean} metric @returns {Sizes} */
export function normalize(saved, metric) {
  const d = defaults(metric);
  const s = saved && typeof saved === "object" ? { ...d, ...saved } : d;
  const layout = ["shelves", "doors", "drawers", "mixed"].includes(s.layout) ? s.layout : d.layout;
  const front = s.front === "inset" ? "inset" : "overlay";
  const pull = s.pull === "undermount" ? "undermount" : "face";
  return {
    ...s,
    layout,
    front,
    pull,
    shelves: Math.round(Number(s.shelves) || 0),
    drawers: Math.round(Number(s.drawers) || 0),
    back: !!s.back,
    dados: !!s.dados,
    hardware: !!s.hardware,
  };
}

/** @param {boolean} metric */
const backT = (metric) => (metric ? 6 * MM : 0.25 * IN);
/** @param {boolean} metric */
const toeSetback = (metric) => (metric ? 75 * MM : 3 * IN);
/** @param {boolean} metric */
const revealOf = (metric) => (metric ? 3 * MM : 0.125 * IN);
/** @param {boolean} metric */
const stopOf = (metric) => (metric ? 12 * MM : 0.5 * IN);
const cupDia = 35 * MM;
const cupEdge = 22 * MM;
const holeDia = 5 * MM;

/**
 * What Generate will say it is making, for the default shelf cabinet word for word.
 * @param {Sizes} s @param {(m: number) => string} format @param {boolean} metric
 */
export function phrase(s, format, metric) {
  const toe = s.toeKick > 0 ? `, ${format(s.toeKick)} toe kick` : "";
  const back = s.back ? ", back" : "";
  if (s.layout === "shelves" && !s.dados && !s.hardware) {
    const n = s.shelves;
    return `${format(s.width)} x ${format(s.height)} x ${format(s.depth)}, ${n} ${n === 1 ? "shelf" : "shelves"}${back}${toe}`;
  }
  const layout = s.layout === "doors" ? "door and shelves" : s.layout === "drawers" ? `${s.drawers} ${s.drawers === 1 ? "drawer" : "drawers"}` : `${s.drawers} ${s.drawers === 1 ? "drawer" : "drawers"} and a door`;
  const extra = `${s.dados ? ", blind dados" : ""}${s.hardware ? ", hardware" : ""}`;
  return `${format(s.width)} x ${format(s.height)} x ${format(s.depth)}, ${layout}${back}${toe}${extra}`;
}

/** @param {Sizes} s @param {boolean} metric @returns {string | null} */
export function issue(s, metric) {
  return plan(s, metric).error;
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ error: string | null, parts: Part[], rows: string[][] }}
 */
export function plan(s, metric) {
  const error = validate(s, metric);
  if (error) return { error, parts: [], rows: [] };
  try {
    return { error: null, ...build(s, metric) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), parts: [], rows: [] };
  }
}

/** @param {Sizes} s @param {boolean} metric */
function validate(s, metric) {
  if (!(s.thickness > 0)) return "The stock needs a thickness.";
  if (!(s.width > 2 * s.thickness)) return "The width must be more than two thicknesses.";
  if (!(s.depth > s.thickness + (s.back ? backT(metric) : 0))) return "The cabinet is not deep enough for its back.";
  if (!(s.toeKick >= 0)) return "The toe kick cannot be negative.";
  if (!Number.isInteger(s.shelves) || s.shelves < 0 || s.shelves > 20) return "Shelves: a whole number from 0 to 20.";
  if (!Number.isInteger(s.drawers) || s.drawers < 0 || s.drawers > 8) return "Drawers: a whole number from 0 to 8.";
  const needsDrawers = s.layout === "drawers" || s.layout === "mixed";
  if (needsDrawers && s.drawers < 1) return "This layout needs at least one drawer.";
  const fit = openings(s, metric);
  if (typeof fit === "string") return fit;
  if (s.dados) {
    const stop = stopOf(metric);
    if (!(stop > 0) || stop >= fit.innerD - s.thickness) return "The cabinet is not deep enough for a blind dado to stop short of the front.";
  }
  return null;
}

/**
 * @param {Sizes} s @param {boolean} metric
 * @returns {string | {
 *   t: number, b: number, innerW: number, innerD: number, floor: number, ceiling: number,
 *   reveal: number, bands: { z0: number, z1: number, kind: "drawer" | "door" }[],
 * }}
 */
function openings(s, metric) {
  const t = s.thickness;
  const b = s.back ? backT(metric) : 0;
  const innerW = s.width - 2 * t;
  const innerD = s.depth - b;
  const floor = s.toeKick + t;
  const ceiling = s.height - t;
  const interior = ceiling - floor;
  if (!(interior > 0)) return "It is not tall enough for a top and a bottom over the toe kick.";
  const reveal = revealOf(metric);
  /** @type {{ z0: number, z1: number, kind: "drawer" | "door" }[]} */
  const bands = [];
  if (s.layout === "shelves" || s.layout === "doors") {
    const need = s.shelves * t;
    if (!(interior > need)) return "It is not tall enough for its shelves.";
    if (s.layout === "doors") bands.push({ z0: floor, z1: ceiling, kind: "door" });
  } else if (s.layout === "drawers") {
    const share = interior / s.drawers;
    if (!(share > t + reveal)) return "The drawers are too short for the stock.";
    for (let i = 0; i < s.drawers; i++) bands.push({ z0: floor + i * share, z1: floor + (i + 1) * share, kind: "drawer" });
  } else {
    const n = s.drawers + 1;
    const share = interior / n;
    if (!(share > t + reveal)) return "The drawers and the door are too short for the stock.";
    for (let i = 0; i < s.drawers; i++) bands.push({ z0: floor + i * share, z1: floor + (i + 1) * share, kind: "drawer" });
    const z0 = floor + s.drawers * share;
    if (!(ceiling - z0 > s.shelves * t)) return "The opening above the drawers is not tall enough for its shelves.";
    bands.push({ z0, z1: ceiling, kind: "door" });
  }
  return { t, b, innerW, innerD, floor, ceiling, reveal, bands };
}

/** A circle of radius r at c sits strictly between two consecutive cut planes.
 * @param {number[]} cuts @param {number} c @param {number} r */
function inGap(cuts, c, r) {
  const xs = [...cuts].sort((a, b) => a - b);
  const a = c - r;
  const b = c + r;
  for (let i = 0; i < xs.length - 1; i++) if (a > xs[i] + 1e-9 && b < xs[i + 1] - 1e-9) return true;
  return false;
}

/** @param {V3} size @param {Prism[]} prisms @param {Hole[]} holes @param {string} name */
function meshOf(name, size, prisms, holes) {
  return partMesh(name, size, prisms, holes);
}

/**
 * @param {Sizes} s
 * @param {boolean} metric
 * @returns {{ parts: Part[], rows: string[][] }}
 */
function build(s, metric) {
  const fit = openings(s, metric);
  if (typeof fit === "string") throw new Error(fit);
  const { t, b, innerW, innerD, floor, ceiling, reveal, bands } = fit;
  const dado = t / 3;
  const stop = stopOf(metric);
  /** @type {Part[]} */
  const parts = [];
  /** @type {string[][]} */
  const rows = [];
  /**
   * @param {string} name
   * @param {V3} blank
   * @param {Prism[]} prisms
   * @param {Hole[]} holes
   * @param {{ at: At, name?: string }} copy
   */
  const add = (name, blank, prisms, holes, copy) => {
    let part = parts.find((p) => p.name === name);
    if (!part) {
      part = { name, blank, copies: [], mesh: meshOf(name, blank, prisms, holes) };
      parts.push(part);
    }
    part.copies.push(copy);
  };
  /** @param {string} part @param {string} where @param {number} dia @param {number} depth */
  const note = (part, where, dia, depth) => rows.push([part, where, `${Math.round(dia * 1000)} mm`, `${Math.round(depth * 1000)} mm`]);

  // Rails the sides are grooved for: top, bottom, and the shelves of a door or shelf bay.
  /** @type {{ z: number, name: string }[]} */
  const rails = [{ z: s.toeKick, name: "Bottom" }, { z: s.height - t, name: "Top" }];
  const shelfZs = shelfHeights(s, floor, ceiling, bands);
  shelfZs.forEach((z, i) => rails.push({ z, name: `Shelf ${i + 1}` }));

  /** @type {Prism[]} */
  const sidePrisms = [];
  if (s.dados) {
    for (const rail of rails) {
      sidePrisms.push({ min: [0, stop, rail.z], max: [dado, s.depth, rail.z + t] });
    }
  }
  /** @type {Hole[]} */
  const sideHoles = [];
  if (s.hardware) {
    const drawers = bands.filter((x) => x.kind === "drawer");
    const yCuts = s.dados ? [0, stop, s.depth] : [0, s.depth];
    const zCuts = [0, s.height, ...(s.dados ? rails.flatMap((rail) => [rail.z, rail.z + t]) : [])];
    const depth = Math.min(12 * MM, t / 2);
    drawers.forEach((band, i) => {
      const box = drawerBox(s, metric, band, innerW, innerD, t);
      for (const [end, y] of /** @type {[string, number][]} */ ([
        ["front", s.slideSetback],
        ["rear", box.boxD - s.slideSetback],
      ])) {
        const z = box.z + t / 2;
        if (!inGap(yCuts, y, holeDia / 2) || !inGap(zCuts, z, holeDia / 2)) {
          throw new Error(`Drawer ${i + 1} slide hole (${end}) lands on a joint or the edge of the side. Move the slide setback, or turn hardware off.`);
        }
        sideHoles.push({ axis: 0, at: 0, inward: 1, center: [y, z], radius: holeDia / 2, depth });
        note("Side", `Drawer ${i + 1} slide, ${end}`, holeDia, depth);
      }
    });
  }

  const sideBlank = /** @type {V3} */ ([t, s.depth, s.height]);
  const mirror = /** @type {At} */ ({ linear: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [t, 0, 0] });
  add("Side", sideBlank, sidePrisms, sideHoles, { at: mirror, name: "Left side" });
  add("Side", sideBlank, sidePrisms, sideHoles, { at: [s.width - t, 0, 0], name: "Right side" });

  /** @param {number} len */
  const railBlank = (len) => /** @type {V3} */ ([len, innerD, t]);
  /** @param {number} z @param {string} name @param {string} copyName */
  const addRail = (z, name, copyName) => {
    if (!s.dados) {
      add(name, railBlank(innerW), [], [], { at: [t, 0, z], name: copyName });
      return;
    }
    const len = innerW + 2 * dado;
    /** @type {Prism[]} */
    const notches = [
      { min: [0, 0, 0], max: [dado, stop, t] },
      { min: [len - dado, 0, 0], max: [len, stop, t] },
    ];
    add(name, railBlank(len), notches, [], { at: [t - dado, 0, z], name: copyName });
  };
  addRail(s.height - t, "Top", "Top");
  addRail(s.toeKick, "Bottom", "Bottom");
  shelfZs.forEach((z, i) => addRail(z, "Shelf", `Shelf ${i + 1}`));

  if (s.back) {
    add("Back", [innerW, b, s.height - s.toeKick], [], [], { at: [t, s.depth - b, s.toeKick], name: "Back" });
  }
  if (s.toeKick > 0) {
    add("Toe kick", [innerW, t, s.toeKick], [], [], { at: [t, toeSetback(metric), 0], name: "Toe kick" });
  }

  const doorBand = bands.find((x) => x.kind === "door");
  if (doorBand) addFront(s, metric, "Door", "Door", doorBand, innerW, reveal, t, add, note);

  const drawers = bands.filter((x) => x.kind === "drawer");
  drawers.forEach((band, i) => {
    const n = i + 1;
    addFront(s, metric, "Drawer front", `Drawer ${n}`, band, innerW, reveal, t, add, note);
    addDrawerBox(s, metric, band, n, innerW, innerD, t, b, add);
  });

  return { parts, rows };
}

/** @param {Sizes} s @param {number} floor @param {number} ceiling @param {{ z0: number, z1: number, kind: string }[]} bands */
function shelfHeights(s, floor, ceiling, bands) {
  const door = bands.find((x) => x.kind === "door");
  const z0 = s.layout === "mixed" && door ? door.z0 : floor;
  const z1 = s.layout === "mixed" && door ? door.z1 : ceiling;
  const count = s.layout === "drawers" ? 0 : s.shelves;
  if (!count) return [];
  const t = s.thickness;
  const gap = (z1 - z0 - count * t) / (count + 1);
  return Array.from({ length: count }, (_, i) => z0 + gap * (i + 1) + t * i);
}

/**
 * @param {Sizes} s @param {boolean} metric @param {{ z0: number, z1: number }} band
 * @param {number} innerW @param {number} innerD @param {number} t
 */
function drawerBox(s, metric, band, innerW, innerD, t) {
  const reveal = revealOf(metric);
  const share = band.z1 - band.z0;
  const boxH = share - reveal - t;
  const boxW = innerW - 2 * s.slideClearance;
  const setback = metric ? 25 * MM : IN;
  const boxD = innerD - setback;
  const z = band.z0 + (share - boxH) / 2;
  return { boxH, boxW, boxD, z, x: t + s.slideClearance };
}

/**
 * @param {Sizes} s @param {boolean} metric @param {string} def @param {string} copy
 * @param {{ z0: number, z1: number }} band
 * @param {number} innerW @param {number} reveal @param {number} t
 * @param {Function} add
 * @param {Function} note
 */
function addFront(s, metric, def, copy, band, innerW, reveal, t, add, note) {
  const e = t - reveal;
  let x = reveal;
  let z = Math.max(s.toeKick + reveal, band.z0 - e);
  let fw = s.width - 2 * reveal;
  let fh = Math.min(s.height - reveal, band.z1 + e) - z;
  let y = /** @type {number} */ (-t);
  if (s.front === "inset") {
    x = t + reveal;
    z = band.z0 + reveal;
    fw = innerW - 2 * reveal;
    fh = band.z1 - band.z0 - 2 * reveal;
    y = reveal;
  }
  if (!(fw > t) || !(fh > t)) throw new Error(`${copy} has no room once the reveal is taken off.`);
  const blank = /** @type {V3} */ ([fw, t, fh]);
  /** @type {Hole[]} */
  const holes = [];
  const depth = Math.min(12 * MM, t / 2);
  if (s.hardware && def === "Door") {
    const r = cupDia / 2;
    // A short door cannot keep the typed inset: the cups would overlap. Pull them in until they clear.
    const gap = 4 * MM;
    const maxInset = (fh - cupDia - gap) / 2;
    if (!(maxInset > r && cupEdge - r > 0 && cupEdge + r < fw)) {
      throw new Error("The door is too small for two hinge cups. Make it taller, or turn hardware off.");
    }
    const inset = Math.min(s.hingeInset, maxInset);
    for (const cz of [inset, fh - inset]) {
      holes.push({ axis: 1, at: 0, inward: 1, center: [cupEdge, cz], radius: r, depth });
      note("Door", "Hinge cup", cupDia, depth);
    }
  }
  if (s.hardware && def === "Drawer front") {
    const r = holeDia / 2;
    const span = s.pullSpacing;
    if (!(span / 2 + r < fw / 2)) throw new Error(`${copy} is too narrow for pull holes this far apart.`);
    if (s.pull === "undermount") {
      if (!(t / 2 - r > 0)) throw new Error("The stock is too thin for an undermount pull hole.");
      for (const cx of [fw / 2 - span / 2, fw / 2 + span / 2]) {
        holes.push({ axis: 2, at: 0, inward: 1, center: [cx, t / 2], radius: r, depth });
        note(def, "Undermount pull", holeDia, depth);
      }
    } else {
      if (!(fh / 2 - r > 0)) throw new Error(`${copy} is too short for a pull.`);
      for (const cx of [fw / 2 - span / 2, fw / 2 + span / 2]) {
        holes.push({ axis: 1, at: t, inward: -1, center: [cx, fh / 2], radius: r, depth });
        note(def, "Pull", holeDia, depth);
      }
    }
  }
  add(def, blank, [], holes, { at: [x, y, z], name: copy });
}

/**
 * @param {Sizes} s @param {boolean} metric
 * @param {{ z0: number, z1: number }} band
 * @param {number} n @param {number} innerW @param {number} innerD @param {number} t @param {number} bottomT
 * @param {Function} add
 */
function addDrawerBox(s, metric, band, n, innerW, innerD, t, bottomT, add) {
  const box = drawerBox(s, metric, band, innerW, innerD, t);
  if (!(box.boxH > 2 * t) || !(box.boxW > 2 * t) || !(box.boxD > 2 * t)) throw new Error(`Drawer ${n} is too small for its box.`);
  const { boxH, boxW, boxD, z, x } = box;
  const dado = t / 3;
  const g0 = t / 2;
  const g1 = g0 + bottomT;
  if (s.dados && !(g1 < boxH)) throw new Error(`Drawer ${n} is too short for a bottom groove.`);
  /** @type {Prism[]} */
  const sideGroove = s.dados ? [{ min: [0, 0, g0], max: [dado, boxD, g1] }] : [];
  const sideBlank = /** @type {V3} */ ([t, boxD, boxH]);
  const left = /** @type {At} */ ({ linear: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [x + t, 0, z] });
  add("Drawer side", sideBlank, sideGroove, [], { at: left, name: `Drawer ${n} left` });
  add("Drawer side", sideBlank, sideGroove, [], { at: [x + boxW - t, 0, z], name: `Drawer ${n} right` });

  const span = boxW - 2 * t;
  const endBlank = /** @type {V3} */ ([span, t, boxH]);
  /** @type {Prism[]} */
  const endGroove = s.dados ? [{ min: [0, 0, g0], max: [span, dado, g1] }] : [];
  const frontAt = /** @type {At} */ ({ linear: [[1, 0, 0], [0, -1, 0], [0, 0, 1]], translation: [x + t, t, z] });
  add("Drawer box front", endBlank, endGroove, [], { at: frontAt, name: `Drawer ${n} box front` });
  add("Drawer box back", endBlank, endGroove, [], { at: [x + t, boxD - t, z], name: `Drawer ${n} box back` });

  if (s.dados) {
    const bw = span + 2 * dado;
    const bd = boxD - 2 * t + 2 * dado;
    add("Drawer bottom", [bw, bd, bottomT], [], [], { at: [x + t - dado, t - dado, z + g0], name: `Drawer ${n} bottom` });
  } else {
    add("Drawer bottom", [span, boxD - 2 * t, bottomT], [], [], { at: [x + t, t, z + g0], name: `Drawer ${n} bottom` });
  }
}

/**
 * The import op: one component per part, one assembly, one undo step.
 * @param {Part[]} parts
 * @param {At | undefined} at
 * @param {string} assemblyName
 * @param {string} instanceName
 */
export function importOp(parts, at, assemblyName, instanceName) {
  /** @param {At | undefined} place */
  const xform = (place) => {
    if (place && typeof place === "object" && "linear" in place) return place;
    const p = /** @type {V3} */ (place ?? [0, 0, 0]);
    return { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: p };
  };
  /** @type {{ name: string, items: import("./mesh.js").Mesh[], children?: Record<string, unknown>[] }[]} */
  const definitions = parts.map((p) => ({ name: p.name, items: [p.mesh] }));
  /** @type {Record<string, unknown>[]} */
  const children = [];
  parts.forEach((p, i) => {
    for (const c of p.copies) {
      /** @type {Record<string, unknown>} */
      const child = { kind: "instance", definition: i, xform: xform(c.at) };
      if (c.name) child.name = c.name;
      children.push(child);
    }
  });
  definitions.push({ name: assemblyName, items: [], children });
  /** @type {Record<string, unknown>} */
  const node = { kind: "instance", definition: definitions.length - 1, xform: xform(at) };
  node.name = instanceName;
  return { op: "import", definitions, nodes: [node] };
}
