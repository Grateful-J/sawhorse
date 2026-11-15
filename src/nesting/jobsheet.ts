// A sheet's job sheet: what to send to the CAM program besides the file and its layer names.
// One per router sheet, in the PDF booklet, in the Nesting section, and as a text file beside
// the sheet's DXF (CNC files). It says:
// - the sheet as its DXF file name and its label inside the file name it, its stock, the
//   thickness to type (measured, never the stock's number), the XY datum and Z zero;
// - a tick box for every layer in the file (exactly the DXF's layers, `dxfLayers`), with the
//   toolpath, the depth, the bit (CNC setup > Job sheet), whether that bit fits the narrowest
//   shape on the layer in this sheet (measured from the parts), and the dial, RPM, feed, ramp
//   and depth per pass from `feedsForLayer`, each with its confidence, and every warning;
// - the cut order and the tool changes: drills and pockets, then cutouts, then profiles
//   (docs/CNC-CABINETS.md, "Give each layer its toolpath"), the layers that share a bit
//   together within that;
// - the parts, smallest first, with the face that is up and the ones narrow enough to need
//   hold-down most (a CNC setup width: Sawhorse's default, not a standard);
// - FLIP_ notes, the track saw's sheets (only named), and the compression bit's first pass.
// Nothing here is a number of its own: the feeds come from src/cam/shop.ts, the rules from
// the docs, the sizes from the nesting and the measured cuts.
import type { Grain, Nesting, Placement, StockPiece } from "../kernel/types";
import { confidenceOf, CHART_DEPTH, COMMUNITY, type Sourced } from "../cam/data";
import { bothUnits, chiploadText, ipmToMmMin, type FeedsResult, type Warning } from "../cam/feeds";
import { holdDownOf, JOB_KINDS, type JobKind } from "../cam/jobs";
import { layerJob } from "../cam/layers";
import { SOURCES, type Confidence, type Source, type SourceId } from "../cam/sources";
import { feedsForLayer, machineOf, profileTool, routerOf, tableOf, toolById, type Shop } from "../cam/shop";
import { seedField, type Tool } from "../cam/tools";
import { MATERIALS } from "../cam/chipload";
import { dxfLayers, featureLayers, overcutLoop, pieceLabel, pocketOvercut } from "./dxf";
import { cncFileName, notchRectangles, routerShare, spacingNeeded } from "./cnc";
import { dims, exactU, fineU, len, pieceNumber, placedSize, sizeUnit, type Units } from "./format";
import type { BlankFeatures } from "./machine";
import type { MeasuredNest } from "./measure";

type P2 = [number, number];

// ---------------------------------------------------------------------------------------
// The narrowest place in a shape

/** 1 micron: two coordinates this close are one grid line. */
const GRID = 1e-6;
/** 0.2 mm: a strip this narrow is drawing noise (a joint clearance), not a place a bit must
 * reach (the same as the hand work list's, src/nesting/cnc.ts). */
const SLIVER = 2e-4;
/** A grid larger than this is measured by its convex hull instead. */
const MAX_CELLS = 40_000;

function rectilinear(loop: readonly P2[]): boolean {
  return loop.length >= 4 && loop.every((p, i) => {
    const q = loop[(i + 1) % loop.length];
    return Math.abs(p[0] - q[0]) <= GRID || Math.abs(p[1] - q[1]) <= GRID;
  });
}

function within(u: number, v: number, loop: readonly P2[]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ui, vi] = loop[i];
    const [uj, vj] = loop[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

function lines(values: number[]): number[] {
  const out: number[] = [];
  for (const x of [...values].sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > GRID) out.push(x);
  return out;
}

/** The narrowest width of a convex hull (rotating calipers): for a shape that is not made of
 * runs along its sides. An upper bound on its narrowest place. */
function hullWidth(pts: readonly P2[]): number {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const hi: P2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
    hi.push(p);
  }
  const h = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  if (h.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l <= 1e-12) continue;
    let far = 0;
    for (const p of h) far = Math.max(far, Math.abs(cross(a, b, p)) / l);
    best = Math.min(best, far);
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * The narrowest place a bit must fit in a shape: across a dado or groove, its width; in an L
 * of two dados, the narrower arm's. On a grid of the shape's own lines (and those of `others`),
 * each cell of the shape is as wide as the lesser of its row's and its column's runs through
 * the shape, and the shape as narrow as its narrowest cell. `others` are outlines that are cut
 * anyway (a deeper pocket crossing this one, an opening, the waste outside a notched part): a
 * run goes on through them, so the strip of a dado left between a crossing groove and the
 * part's edge is not taken for a slot. A cell narrower than 0.2 mm is not measured. A shape
 * whose edges do not all run along its sides is measured by its convex hull (`approx`).
 */
export function narrowestWidth(loop: readonly P2[], others: readonly (readonly P2[])[] = [], mayCut?: (u: number, v: number) => boolean): { width: number; approx: boolean } {
  if (!rectilinear(loop)) return { width: hullWidth(loop), approx: true };
  const marks = others.filter(rectilinear);
  const us = lines([...loop, ...marks.flat()].map((p) => p[0]));
  const vs = lines([...loop, ...marks.flat()].map((p) => p[1]));
  const nu = us.length - 1;
  const nv = vs.length - 1;
  if (nu < 1 || nv < 1 || nu * nv > MAX_CELLS) return { width: hullWidth(loop), approx: true };
  // 2: the shape; 1: cut anyway; 0: not cut.
  const state: number[][] = [];
  for (let i = 0; i < nu; i++) {
    state.push([]);
    for (let j = 0; j < nv; j++) {
      const u = (us[i] + us[i + 1]) / 2;
      const v = (vs[j] + vs[j + 1]) / 2;
      state[i].push(within(u, v, loop) ? 2 : marks.some((m) => within(u, v, m)) || mayCut?.(u, v) ? 1 : 0);
    }
  }
  let best = Infinity;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      if (state[i][j] !== 2 || us[i + 1] - us[i] < SLIVER || vs[j + 1] - vs[j] < SLIVER) continue;
      let a = i;
      let b = i;
      while (a > 0 && state[a - 1][j]) a--;
      while (b < nu - 1 && state[b + 1][j]) b++;
      let c = j;
      let d = j;
      while (c > 0 && state[i][c - 1]) c--;
      while (d < nv - 1 && state[i][d + 1]) d++;
      best = Math.min(best, Math.min(us[b + 1] - us[a], vs[d + 1] - vs[c]));
    }
  }
  if (!Number.isFinite(best)) {
    const xs = loop.map((p) => p[0]);
    const ys = loop.map((p) => p[1]);
    return { width: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), approx: false };
  }
  return { width: best, approx: false };
}

// ---------------------------------------------------------------------------------------
// The job sheet

/** A shape on a layer in this sheet, and how narrow it is. */
export interface LayerShape {
  tag: string;
  name: string;
  width: number;
  /** Measured by its convex hull: it is not made of runs along its sides. */
  approx: boolean;
  /** What is measured: "the gap between parts", "a notch", or the shape itself. */
  what: string;
}

export interface FeedLine {
  label: string;
  value: string;
  /** How far to trust it (null: nothing to trust, or a value you typed). */
  conf: Confidence | null;
  /** Where it comes from, in words. */
  from: string;
}

export type LayerKind = "profile" | JobKind;

export interface JobLayer {
  name: string;
  /** False for STOCK and LABELS: reference only, no toolpath. */
  cut: boolean;
  toolpath: string;
  depth: string;
  flip: boolean;
  /** Which of CNC setup's bits it takes. */
  kind: LayerKind | null;
  tool: Tool | null;
  /** Why this bit, in words ("the pocket bit"). */
  toolWhy: string;
  shapes: number;
  /** The narrowest shape on the layer in this sheet. */
  narrowest: LayerShape | null;
  /** The bit is narrower than the narrowest shape (null: no bit, or its diameter unknown). */
  fits: boolean | null;
  /** The bit that was set for the layer and does not fit, when another was used instead. */
  tooWide: Tool | null;
  /** What the fit check says: a bit too wide, the smallest bit that fits, or none. */
  fitNotes: string[];
  feeds: FeedLine[];
  warnings: Warning[];
}

export interface CutStep {
  tool: Tool;
  layers: string[];
  phase: string;
  /** A tool change before this step (not before the first). */
  change: boolean;
  /** The first step of the second setup (FLIP_ layers, after the parts are turned over). */
  secondSetup: boolean;
}

export interface JobPart {
  tag: string;
  name: string;
  cabinet: string | null;
  /** Width × length × thickness, in the document's units. */
  size: string;
  width: number;
  length: number;
  thickness: number;
  grain: Grain;
  /** Which face is up on the router, and why. */
  faceUp: string;
  /** As narrow as the hold-down width or narrower. */
  holdDown: boolean;
  /** Cuts on FLIP_ layers. */
  flip: boolean;
  /** Edge banding, when Sawhorse knows it (later): null prints a line to write on. */
  banding: string | null;
}

export interface JobSheet {
  /** The sheet's number in the whole nesting (`StockPiece.index`). */
  index: number;
  /** The sheet's DXF, as CNC files names it. */
  file: string;
  /** Its label inside the DXF ("2. Sheet 1 of 2 - 4 x 4 sheet, 3/4 - Cabinet plywood"). */
  label: string;
  /** "2. Sheet 1 of 2", as the part labels say it. */
  number: string;
  stock: string;
  thickness: string;
  datum: string;
  zZero: string;
  setup: string;
  layers: JobLayer[];
  order: CutStep[];
  changes: number;
  /** Layers with no bit, left out of the order. */
  unordered: string[];
  parts: JobPart[];
  holdDown: string;
  flip: string[];
  saw: string | null;
  compression: string | null;
  /** What could not be measured or known. */
  notes: string[];
  metric: boolean;
}

export interface JobSheetInput {
  /** The router's sheets (`routerShare`), as the CNC files are written from. */
  n: Nesting;
  /** The sheet, its index in `n.pieces`. */
  index: number;
  /** The cuts measured on the router's sheets (null: they could not be). */
  measured: MeasuredNest | null;
  shop: Shop;
  units: Units;
  /** The sheet's DXF file name (`cncFileName`). */
  file: string;
  /** The cabinet a part is in (null: none). */
  ownerOf: (q: Placement) => string | null;
  /** The whole nesting, for the track saw's sheets (default: `n`). */
  all?: Nesting;
  /** Edge banding for a part, when Sawhorse knows it (a hook for later; default none). */
  banding?: (q: Placement) => string | null;
}

const src = (id: SourceId) => SOURCES[id] as Source;
const RANK: Confidence[] = ["low", "medium", "high"];
const lower = (...cs: (Confidence | null)[]): Confidence | null => (cs.some((c) => c === null) ? null : cs.reduce((a, b) => (RANK.indexOf(a!) <= RANK.indexOf(b!) ? a : b), "high" as Confidence));
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const num = (v: number) => Math.round(v).toLocaleString("en-US");

/** The toolpath a layer takes (docs/CNC-CABINETS.md, "Give each layer its toolpath"). */
function toolpathOf(name: string): { toolpath: string; kind: LayerKind | null; cut: boolean } {
  const flip = name.startsWith("FLIP_");
  const n = flip ? name.slice(5) : name;
  if (n === "STOCK") return { toolpath: "None: the sheet's outline and its trim line, for measuring. Do not cut.", kind: null, cut: false };
  if (n === "LABELS") return { toolpath: "None: the parts' tags and the sheet's title. Do not cut.", kind: null, cut: false };
  if (n === "PROFILE_THRU") return { toolpath: "Outside profile, through the sheet", kind: "profile", cut: true };
  if (n === "CUTOUT_THRU") return { toolpath: "Inside profile (cutout), through the sheet", kind: "cutout", cut: true };
  if (n.startsWith("POCKET_")) return { toolpath: flip ? "Pocket, in the other face" : "Pocket", kind: "pocket", cut: true };
  if (n.startsWith("DRILL_")) return { toolpath: flip ? "Pocket the circle, in the other face" : "Pocket the circle", kind: "hole", cut: true };
  return { toolpath: "Not a layer Sawhorse writes: check it", kind: null, cut: true };
}

/** "6.35 mm (0.250 in)" in an inch document, "6 mm" in a metric one. */
function depthText(m: number, metric: boolean): string {
  const mm = `${Number((m * 1000).toFixed(2))} mm`;
  return metric ? mm : `${mm} (${(m / 0.0254).toFixed(3)} in)`;
}

const THROUGH = "Through: this sheet's measured thickness plus about 0.5 mm (0.02 in), into the spoilboard";

/** A bit as the job sheet names it: "1/4 in down-cut (0.25 in, 6.35 mm)". */
export function bitName(t: Tool, metric: boolean): string {
  if (t.diameter === null) return `${t.name} (diameter not typed)`;
  const inch = `${Number((t.diameter / 0.0254).toFixed(4))} in`;
  const mm = `${Number((t.diameter * 1000).toFixed(2))} mm`;
  return `${t.name} (${metric ? `${mm}, ${inch}` : `${inch}, ${mm}`})`;
}

/** Each shape on each cut layer of a sheet, with how narrow it is. */
function layerShapes(piece: StockPiece, measured: MeasuredNest | null): Map<string, LayerShape[]> {
  const out = new Map<string, LayerShape[]>();
  const add = (layer: string, s: LayerShape) => out.set(layer, [...(out.get(layer) ?? []), s]);
  const e = pocketOvercut(piece);
  // Every part's outline, and the gap the bit runs in between parts.
  for (const q of piece.placements) {
    const f = measured?.features.get(q.tag);
    if (piece.placements.length > 1) add("PROFILE_THRU", { tag: q.tag, name: q.name, width: piece.kerf, approx: false, what: "the gap between parts" });
    else add("PROFILE_THRU", { tag: q.tag, name: q.name, width: Infinity, approx: false, what: "its outline" });
    if (f?.profile) {
      for (const r of notchRectangles(f.profile, q.dx, q.dy) ?? []) add("PROFILE_THRU", { tag: q.tag, name: q.name, width: Math.min(r.u1 - r.u0, r.v1 - r.v0), approx: false, what: "a notch in its outline" });
    }
    if (!f) continue;
    const l = featureLayers(f);
    const outside = f.profile && f.profile.length >= 3 ? f.profile : null;
    // Waste outside a notched outline is cut anyway.
    const mayCut = outside ? (u: number, v: number) => u > 0 && v > 0 && u < q.dx && v < q.dy && !within(u, v, outside) : undefined;
    const face = (pockets: BlankFeatures["pockets"], names: string[]) => {
      pockets.forEach((k, i) => {
        // A pocket as the file draws it (past the part's edge where it reaches it), with the
        // deeper pockets that cross it and the openings: cut whatever this one is.
        const drawn = overcutLoop(k.loop, q.dx, q.dy, e);
        const others = [...pockets.filter((o) => o !== k && o.depth >= k.depth - GRID).map((o) => overcutLoop(o.loop, q.dx, q.dy, e)), ...f.cutouts];
        const w = narrowestWidth(drawn, others, mayCut);
        add(names[i], { tag: q.tag, name: q.name, width: w.width, approx: w.approx, what: "its narrowest place" });
      });
    };
    face(f.pockets, l.pockets);
    face(f.flip.pockets, l.flipPockets);
    f.drills.forEach((h, i) => add(l.drills[i], { tag: q.tag, name: q.name, width: h.diameter, approx: false, what: "the hole" }));
    f.flip.drills.forEach((h, i) => add(l.flipDrills[i], { tag: q.tag, name: q.name, width: h.diameter, approx: false, what: "the hole" }));
    for (const c of f.cutouts) {
      const w = narrowestWidth(c);
      add("CUTOUT_THRU", { tag: q.tag, name: q.name, width: w.width, approx: w.approx, what: "the opening's narrowest place" });
    }
  }
  return out;
}

/** The bit CNC setup gives a kind of layer, and why. */
function bitFor(shop: Shop, kind: LayerKind): { tool: Tool | null; why: string } {
  if (kind === "profile") {
    const t = profileTool(shop);
    return { tool: t, why: t ? "the profile bit (CNC setup > Tools)" : "no profile bit is chosen (CNC setup > Tools > Profile bit)" };
  }
  const id = shop.jobs.tools[kind];
  if (kind === "cutout" && id === null) {
    const t = profileTool(shop);
    return { tool: t, why: t ? "the profile bit, as CNC setup > Job sheet sets cutouts" : "cutouts take the profile bit, and none is chosen (CNC setup > Tools > Profile bit)" };
  }
  const label = JOB_KINDS.find((k) => k.id === kind)!.label.replace(/ \(.*\)$/, "").toLowerCase();
  const t = toolById(shop, id);
  return { tool: t, why: t ? `the bit for ${label} (CNC setup > Job sheet)` : `no bit is set for ${label} (CNC setup > Job sheet)` };
}

const fitsIn = (t: Tool | null, w: number) => (t && t.diameter !== null ? t.diameter < w - 1e-9 : null);

/** The smallest bit in the library narrower than `w`, or null. */
function smallestFit(shop: Shop, w: number): Tool | null {
  const ok = shop.tools.filter((t) => t.diameter !== null && t.diameter < w - 1e-9);
  return ok.sort((a, b) => a.diameter! - b.diameter!)[0] ?? null;
}

/** A sourced value's confidence and its source, in words. */
function fromText(s: Sourced): string {
  const x = src(s.src);
  return `${x.maker}, ${x.document}`;
}

/** The feeds of one layer as lines, each with its confidence. */
function feedLines(res: FeedsResult, tool: Tool, shop: Shop, metric: boolean): FeedLine[] {
  const out: FeedLine[] = [];
  const ipm = (v: number) => (metric ? `${num(ipmToMmMin(v))} mm/min (${num(v)} IPM)` : `${num(v)} IPM (${num(ipmToMmMin(v))} mm/min)`);
  const table = tableOf(shop);
  const rpmConf: Confidence | null = res.dial ? confidenceOf(res.dial.rpm) : null;
  if (res.dial && table) out.push({ label: "Dial", value: `${res.dial.dial}: ${num(res.dial.rpm.value)} RPM`, conf: rpmConf, from: fromText(res.dial.rpm) });
  else if (res.rpm) out.push({ label: "RPM", value: `${num(res.rpm)} RPM`, conf: null, from: "the RPM typed in CNC setup > Machine" });
  else out.push({ label: "RPM", value: "not known: type your router's RPM in CNC setup > Machine", conf: null, from: "" });
  const clConf = res.start ? confidenceOf(res.start.from) : null;
  if (res.start) out.push({ label: "Chipload", value: chiploadText(res.chipload ?? res.start.chipload, metric), conf: clConf, from: fromText(res.start.from) });
  if (res.feedIpm !== null) {
    out.push({ label: "Feed", value: ipm(res.feedIpm), conf: lower(clConf, rpmConf), from: `RPM × ${tool.flutes} flutes × chipload (Amana, Onsrud, Freud)` });
  } else out.push({ label: "Feed", value: "not worked out: see the warnings", conf: null, from: "" });
  if (res.rampIpm !== null) out.push({ label: "Ramp", value: `${ipm(res.rampIpm)}, the feed ÷ ${tool.flutes} flutes`, conf: lower(clConf, rpmConf, src("amana-a1").confidence), from: `${src("amana-a1").maker}'s ramp feed; ramp in rather than plunge` });
  if (res.firstPass) {
    const seed = seedField(tool, "upcut");
    out.push({
      label: "First pass",
      value: `deeper than ${bothUnits(res.firstPass.deeperThan, metric, 4)}${res.firstPass.feedIpm !== null ? `, at ${ipm(res.firstPass.feedIpm)}` : ""}`,
      conf: seed ? confidenceOf(seed) : null,
      from: seed ? `the bit's up-cut length and tolerance (${fromText(seed)})` : "the bit's up-cut length as typed in CNC setup > Tools",
    });
  }
  if (res.depth.recommended !== null) {
    const half = res.depth.rule === "half";
    out.push({
      label: res.firstPass ? "Later passes" : "Depth per pass",
      value: `${half ? "about" : "at most"} ${bothUnits(res.depth.recommended, metric, 4)}`,
      conf: half ? confidenceOf(COMMUNITY.halfD) : confidenceOf(CHART_DEPTH.basis),
      from: half ? "half the bit's diameter, a Shapeoko community rule" : "1 × the bit's diameter, the bit makers' charts' basis",
    });
  }
  return out;
}

/** The cut order: drills and pockets, then cutouts, then profiles, then the FLIP_ layers in a
 * second setup; within each, the layers that share a bit together, the bits ordered so the
 * fewest changes are made (each phase's order tried; few bits, so it is quick). */
function cutOrder(layers: JobLayer[]): { order: CutStep[]; changes: number; unordered: string[] } {
  const phases: { label: string; flip: boolean; test: (l: JobLayer) => boolean }[] = [
    { label: "drills and pockets", flip: false, test: (l) => !l.flip && (l.kind === "pocket" || l.kind === "narrow" || l.kind === "hole") },
    { label: "cutouts", flip: false, test: (l) => !l.flip && l.kind === "cutout" },
    { label: "profiles", flip: false, test: (l) => !l.flip && l.kind === "profile" },
    { label: "second setup: the other face", flip: true, test: (l) => l.flip },
  ];
  const unordered = layers.filter((l) => l.cut && !l.tool).map((l) => l.name);
  type Group = { tool: Tool; layers: string[] };
  const groups = phases.map((ph) => {
    const gs: Group[] = [];
    for (const l of layers) {
      if (!l.cut || !l.tool || !ph.test(l)) continue;
      const g = gs.find((x) => x.tool.id === l.tool!.id);
      if (g) g.layers.push(l.name);
      else gs.push({ tool: l.tool, layers: [l.name] });
    }
    return gs;
  });
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 || xs.length > 6 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
  // Best (fewest changes) per last bit after each phase.
  let states: { last: string | null; cost: number; seq: Group[][] }[] = [{ last: null, cost: 0, seq: [] }];
  for (const gs of groups) {
    if (!gs.length) {
      states = states.map((s) => ({ ...s, seq: [...s.seq, []] }));
      continue;
    }
    const next = new Map<string, { last: string | null; cost: number; seq: Group[][] }>();
    for (const s of states) {
      for (const p of perms(gs)) {
        const cost = s.cost + (s.last !== null && s.last !== p[0].tool.id ? 1 : 0) + p.length - 1;
        const last = p[p.length - 1].tool.id;
        const had = next.get(last);
        if (!had || cost < had.cost) next.set(last, { last, cost, seq: [...s.seq, p] });
      }
    }
    states = [...next.values()];
  }
  const best = states.reduce((a, b) => (b.cost < a.cost ? b : a), states[0]);
  const order: CutStep[] = [];
  let prev: string | null = null;
  let flipped = false;
  best.seq.forEach((gs, k) => {
    for (const g of gs) {
      const second = phases[k].flip && !flipped;
      if (second) flipped = true;
      order.push({ tool: g.tool, layers: g.layers, phase: phases[k].label, change: prev !== null && prev !== g.tool.id, secondSetup: second });
      prev = g.tool.id;
    }
  });
  return { order, changes: best.cost, unordered };
}

/** Which face is up on the router, from the part's measured cuts (src/nesting/machine.ts
 * draws each part with the face its cuts are in up), in the docs' words ("Know which face is
 * up"): a door's hinge cups are in its back, a carcass part's dados and holes in its inside. */
export function faceUp(f: BlankFeatures | undefined, measured: boolean): string {
  if (!measured) return "Not known: its cuts could not be measured. Check the model before cutting.";
  if (!f) return "Either face: no cuts in its faces.";
  const blind = f.pockets.length + f.drills.filter((d) => !d.through).length;
  const flip = f.flip.pockets.length + f.flip.drills.length ? " Then turn it over for the cuts on FLIP_ layers." : "";
  if (f.drills.some((d) => !d.through && Math.abs(d.diameter - 0.035) < 1e-5)) return `Back face up: its 35 mm hinge cups are in it, so the show face is down.${flip}`;
  if (blind) return `The face with its dados, grooves and holes up (on a carcass part, the inside face).${flip}`;
  if (flip) return `The face with no cuts up first.${flip}`;
  return f.profile ? "Either face: no cuts in its faces. Turned over, its notched outline is its mirror image." : "Either face: no cuts in its faces.";
}

/** The job sheet of one router sheet. */
export function jobSheet(input: JobSheetInput): JobSheet {
  const { n, index, measured, shop, units, file, ownerOf } = input;
  const piece = n.pieces[index];
  const metric = sizeUnit(units) === "mm";
  const features = measured?.features;
  const names = dxfLayers(n, "lwpolyline", features, { piece: index });
  const shapes = layerShapes(piece, measured);
  const material = MATERIALS.find((m) => m.id === shop.jobs.material)!;
  const thick = `${exactU(piece.thickness, units)}${metric ? "" : ` (${Number((piece.thickness * 1000).toFixed(2))} mm)`}`;
  const notes: string[] = [];
  if (!measured) notes.push("The cuts inside the parts could not be measured: the file has their outlines only, and so has this sheet.");
  else {
    const skipped = piece.placements.filter((q) => measured.skipped.includes(q.name)).map((q) => `${q.tag} ${q.name}`);
    if (skipped.length) notes.push(`Cuts were left out on ${skipped.join(", ")}: they could not be placed on the part. Check it against the model before cutting.`);
  }

  const layers: JobLayer[] = names.map((name) => {
    const { toolpath, kind, cut } = toolpathOf(name);
    const job = layerJob(name);
    const flip = name.startsWith("FLIP_");
    const list = (shapes.get(name) ?? []).filter((s) => Number.isFinite(s.width));
    const count = name === "PROFILE_THRU" ? piece.placements.length : (shapes.get(name) ?? []).length;
    const narrowest = list.length ? list.reduce((a, b) => (b.width < a.width ? b : a)) : null;
    const depth = !cut ? "" : !job ? "" : job.depth === null ? THROUGH : `${depthText(job.depth, metric)}, from the top of the sheet (the number in the layer's name)`;
    const layer: JobLayer = { name, cut, toolpath, depth, flip, kind, tool: null, toolWhy: "", shapes: count, narrowest, fits: null, tooWide: null, fitNotes: [], feeds: [], warnings: [] };
    if (!cut || !kind) return layer;
    let pick = bitFor(shop, kind);
    const w = narrowest?.width ?? Infinity;
    const where = narrowest ? `${narrowest.tag} ${narrowest.name}, ${narrowest.what}` : "";
    const wide = (t: Tool) => `${bitName(t, metric)} is not narrower than the narrowest shape on this layer: ${bothUnits(w, metric, 3)} (${where}${narrowest?.approx ? ", measured across its widest outline: check the drawing" : ""}).`;
    // A pocket too narrow for the pocket bit is a narrow groove: the narrow-groove bit's.
    if (kind === "pocket" && pick.tool && fitsIn(pick.tool, w) === false) {
      const narrow = bitFor(shop, "narrow");
      layer.tooWide = pick.tool;
      layer.fitNotes.push(`The pocket bit, ${wide(pick.tool)}`);
      if (narrow.tool && fitsIn(narrow.tool, w)) {
        layer.fitNotes.push(`Cut this layer with the narrow-groove bit, ${bitName(narrow.tool, metric)} (CNC setup > Job sheet).`);
        layer.kind = "narrow";
        pick = narrow;
      }
    }
    layer.tool = pick.tool;
    layer.toolWhy = pick.why;
    layer.fits = narrowest ? fitsIn(pick.tool, w) : pick.tool && pick.tool.diameter !== null ? true : null;
    if (pick.tool && layer.fits === false && layer.tooWide !== pick.tool) layer.fitNotes.push(`${layer.kind === "narrow" ? "The narrow-groove bit, " : "This bit, "}${wide(pick.tool)}`);
    if (layer.fits === false || (!pick.tool && narrowest)) {
      const s = smallestFit(shop, w);
      layer.fitNotes.push(s ? `The smallest bit in your library that fits: ${bitName(s, metric)}.` : `No bit in your library is narrower than ${bothUnits(w, metric, 3)}: add one in CNC setup > Tools.`);
    }
    if (pick.tool && pick.tool.diameter === null) layer.fitNotes.push(`Type ${pick.tool.name}'s cutting diameter (CNC setup > Tools): Sawhorse cannot check it fits.`);
    if (kind === "profile" && pick.tool && pick.tool.diameter !== null && piece.placements.length > 1 && piece.kerf < spacingNeeded(pick.tool.diameter) - 1e-9 && layer.fits !== false) {
      layer.fitNotes.push(`The parts are ${fineU(piece.kerf, units)} apart; the spacing check wants the bit plus 1/16 in, ${fineU(spacingNeeded(pick.tool.diameter), units)}: the CAM program may cut around neighbouring parts as one.`);
    }
    if (!pick.tool) return layer;
    const res = feedsForLayer(pick.tool, shop.jobs.material, name, { thickness: piece.thickness, metric }, shop);
    if (res) {
      layer.feeds = feedLines(res, pick.tool, shop, metric);
      layer.warnings = res.warnings;
    }
    return layer;
  });

  const { order, changes, unordered } = cutOrder(layers);
  const threshold = holdDownOf(shop.jobs, metric);
  const parts: JobPart[] = piece.placements
    .map((q) => {
      const [w, l] = placedSize(q);
      const f = features?.get(q.tag);
      const known = !!measured && !measured.skipped.includes(q.name);
      return {
        tag: q.tag,
        name: q.name,
        cabinet: ownerOf(q),
        size: `${dims(w, l, units)} × ${fineU(q.size[0], units)}`,
        width: Math.min(w, l),
        length: Math.max(w, l),
        thickness: q.size[0],
        grain: q.grain,
        faceUp: faceUp(f, known),
        holdDown: Math.min(w, l) <= threshold + 1e-9,
        flip: !!f && f.flip.pockets.length + f.flip.drills.length > 0,
        banding: input.banding?.(q) ?? null,
      };
    })
    .sort((a, b) => a.width * a.length - b.width * b.length || a.width - b.width || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const flipParts = parts.filter((p) => p.flip);
  const flip = flipParts.length
    ? [
        `${flipParts.map((p) => `${p.tag} ${p.name}`).join(", ")} ${flipParts.length === 1 ? "has" : "have"} cuts in the other face, on the FLIP_ layers: a second setup after the part is turned over.`,
        "A FLIP_ shape is drawn where its cut is when you look down through the part from the face that is up. After you turn the part over, those cuts are at the mirror image of that place: try the flip on scrap first, and turn the part the same way every time.",
      ]
    : [];
  const saws = (input.all ?? n).pieces.filter((p) => p.saw);
  const saw = saws.length
    ? `${saws.length === 1 ? "Sheet" : "Sheets"} ${saws.map((p) => `${p.index}`).join(", ")} ${saws.length === 1 ? "is" : "are"} cut on the track saw, not the router: no DXF and no job sheet. ${saws.length === 1 ? "Its" : "Their"} cut sequence is in the Nesting section and the PDF, and any dados and holes on ${saws.length === 1 ? "its" : "their"} parts are in the track saw hand work list.`
    : null;
  const comp = layers.find((l) => l.tool?.type === "compression");
  let compression: string | null = null;
  if (comp?.tool) {
    const t = comp.tool;
    const deeper = t.upcut !== null ? ` For ${t.name}: deeper than ${bothUnits(t.upcut + (t.upcutTol ?? 0), metric, 4)}, its up-cut length${t.upcutTol ? " and its tolerance" : ""}.` : ` Type ${t.name}'s up-cut length in CNC setup > Tools: Sawhorse cannot say how deep its first pass must be.`;
    const on = layers.filter((l) => l.tool?.type === "compression").map((l) => l.name);
    compression = `The compression bit (${on.join(", ")}): its first pass must be deeper than its up-cut section, or the top face chips. A bit reseller's guide, quoted in Sawhorse's feeds research: "Compression bits fail when the first pass is too shallow … take the first pass deeper than the upcut tip (usually about one bit diameter)".${deeper}`;
  }
  const machine = machineOf(shop);
  const router = routerOf(shop);
  const table = tableOf(shop);
  return {
    index: piece.index,
    file,
    label: pieceLabel(piece),
    number: `${piece.index}. ${pieceNumber(piece)}`,
    stock: `${piece.stock}${piece.material ? ` · ${piece.material}` : ""}: ${len(piece.width, units)} × ${len(piece.length, units)} ${sizeUnit(units)}`,
    thickness: `Measure this sheet with calipers and type what you measure as the job's thickness. ${thick} is only what was entered for the stock, not a measurement.`,
    datum: `The sheet's lower-left corner is 0,0: set the job's X and Y zero at that corner of the real sheet, square to the machine. The outer rectangle on STOCK is the sheet, ${Number((piece.length * 1000).toFixed(2))} x ${Number((piece.width * 1000).toFixed(2))} mm (X by Y): measure it after the import. The file is in millimetres.`,
    zZero: "On the top of the sheet. Pocket and hole depths are measured down from the face that is up.",
    setup: `Feeds for ${material.label} (CNC setup > Job sheet), on the ${machine.name}, ${router ? `${router.name}${router.tables.length > 1 && table ? ` (${table.label})` : ""}` : `your router at ${shop.rpm ? `${num(shop.rpm)} RPM` : "an RPM not typed yet"}`}. Every value is a starting point: the scrap test in CNC setup > Feeds finds yours.`,
    layers,
    order,
    changes,
    unordered,
    parts,
    holdDown: `Flagged: ${fineU(threshold, units)} wide or narrower, the hold-down width in CNC setup > Job sheet${shop.jobs.holdDown === null ? " (Sawhorse's default, not a standard: none was found)" : ""}. The last pass of a profile frees each part: give every profile tabs or a skin, or hold every part with a vacuum table. Put screws and clamps only where nothing is cut.`,
    flip,
    saw,
    compression,
    notes,
    metric,
  };
}

// ---------------------------------------------------------------------------------------
// As text

/** Lines of at most `width` characters (a longer word stands alone), every one after the
 * first indented by `indent` within that width. */
function wrapText(s: string, width: number, indent = ""): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : out.length ? `${indent}${word}` : word;
    if (next.length > width && line) {
      out.push(line);
      line = `${indent}${word}`;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** A labelled field: "    Bit            1/4 in down-cut ...", wrapped under its value. */
function field(label: string, value: string, pad = 4): string[] {
  const head = `${" ".repeat(pad)}${label.padEnd(15)}`;
  return wrapText(value, 92 - head.length).map((l, i) => `${i ? " ".repeat(head.length) : head}${l}`);
}

/** One line of the cut order: "3. Amana 46170 (6.35 mm): PROFILE_THRU (profiles)". */
export function stepText(s: CutStep, k: number, metric: boolean): string {
  return `${k + 1}. ${bitName(s.tool, metric)}: ${s.layers.join(", ")} (${s.phase})`;
}

/** A warning as the job sheet prints it: "Stop: ..." or "Check: ...". */
export function warningText(w: Warning): string {
  return `${w.level === "stop" ? "Stop" : "Check"}: ${w.text}`;
}

/** A feed line: "113 IPM (2,870 mm/min) [high: RPM × 2 flutes × chipload]". */
export function feedText(f: FeedLine): string {
  return `${f.value}${f.conf ? ` [${f.conf}${f.from ? `: ${f.from}` : ""}]` : f.from ? ` [${f.from}]` : ""}`;
}

/** The order's summary: "3 bits, 2 tool changes". */
export function orderSummary(js: JobSheet): string {
  const bits = new Set(js.order.map((s) => s.tool.id)).size;
  return `${plural(bits, "bit")}, ${plural(js.changes, "tool change")}`;
}

/** The job sheet as a plain-text file, to travel beside the sheet's DXF. */
export function jobSheetText(js: JobSheet, title: string): string {
  const out: string[] = [];
  const rule = "-".repeat(92);
  const head = (s: string) => out.push("", s.toUpperCase(), rule);
  out.push(`${title}: job sheet for ${js.number}`, "=".repeat(92));
  out.push(...field("DXF", js.file, 0));
  out.push(...field("Label in file", js.label, 0));
  out.push(...field("Stock", js.stock, 0));
  out.push(...field("Thickness", js.thickness, 0));
  out.push(...field("XY zero", js.datum, 0));
  out.push(...field("Z zero", js.zZero, 0));
  out.push(...field("Feeds", js.setup, 0));
  for (const n of js.notes) out.push(...wrapText(`! ${n}`, 92, "  "));

  head(`Layers (${js.layers.length}): tick each one when it has its toolpath`);
  out.push(...wrapText("Every layer except STOCK and LABELS must have a toolpath: a layer with shapes and no toolpath is a cut that will not be made. This list is the file's own layers, in its order.", 92));
  for (const l of js.layers) {
    out.push("", `[ ] ${l.name}${l.cut ? ` (${plural(l.shapes, "shape")})` : ""}`);
    out.push(...field("Toolpath", l.toolpath));
    if (!l.cut) continue;
    if (l.depth) out.push(...field("Depth", l.depth));
    out.push(...field("Bit", l.tool ? `${bitName(l.tool, js.metric)}: ${l.toolWhy}` : l.toolWhy));
    if (l.narrowest) out.push(...field("Narrowest", `${bothUnits(l.narrowest.width, js.metric, 3)}: ${l.narrowest.tag} ${l.narrowest.name}, ${l.narrowest.what}${l.fits === true ? " (the bit fits)" : ""}`));
    for (const t of l.fitNotes) out.push(...field("Fit", t));
    for (const f of l.feeds) out.push(...field(f.label, feedText(f)));
    for (const w of l.warnings) out.push(...field(w.level === "stop" ? "STOP" : "Check", w.text));
  }

  head(`Cut order: ${orderSummary(js)}`);
  out.push(...wrapText("Drills and pockets first, cutouts next, profiles last, so the parts stay held down while their inside cuts are made. Within that, the layers that share a bit are cut together.", 92));
  js.order.forEach((s, k) => {
    if (s.secondSetup) out.push("    -- second setup: turn the parts over --");
    else if (s.change) out.push("    -- change the bit --");
    out.push(...wrapText(stepText(s, k, js.metric), 92, "     "));
  });
  if (js.unordered.length) out.push(...wrapText(`Not in the order, no bit: ${js.unordered.join(", ")}.`, 92));

  head(`Parts (${js.parts.length}), smallest first`);
  out.push(...wrapText(js.holdDown, 92));
  for (const p of js.parts) {
    out.push("", `${p.holdDown ? "HOLD DOWN " : ""}${p.tag} ${p.name}${p.cabinet ? ` (${p.cabinet})` : ""}: ${p.size}`);
    out.push(...field("Face up", p.faceUp));
  }

  head("FLIP_ layers");
  out.push(...(js.flip.length ? js.flip.flatMap((s) => wrapText(s, 92)) : ["None on this sheet."]));
  if (js.compression) {
    head("Compression bit");
    out.push(...wrapText(js.compression, 92));
  }
  if (js.saw) {
    head("Track saw");
    out.push(...wrapText(js.saw, 92));
  }
  out.push("", rule, ...wrapText("Made by Sawhorse. Every feed is a starting point from CNC setup, with its confidence in brackets: find your number with the scrap test before cutting a full sheet. docs/CNC-CABINETS.md, \"Job sheet and part labels\".", 92), "");
  return out.join("\n");
}

/** The job sheet's file: plain text, beside the sheet's DXF. */
export const JOB_SHEET_TYPE = { description: "Job sheet (text)", mime: "text/plain", extensions: [".txt"] };

/** The job sheet's file name: the DXF's, with " job.txt" for ".dxf", so the two sort together. */
export function jobFileName(dxf: string): string {
  return `${dxf.replace(/\.dxf$/i, "")} job.txt`;
}

/** Every router sheet's job sheet, each named for the DXF that CNC files writes for it.
 * `all` is the whole nesting; `measured`, its router share's cuts (null: not measured). */
export function jobSheets(all: Nesting, measured: MeasuredNest | null, shop: Shop, units: Units, title: string, ownerOf: (q: Placement) => string | null): JobSheet[] {
  const n = routerShare(all);
  return n.pieces.map((_, i) => jobSheet({ n, index: i, measured, shop, units, file: cncFileName(title, n, i, measured?.features, ownerOf), ownerOf, all }));
}
