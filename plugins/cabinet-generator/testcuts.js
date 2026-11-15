// @ts-check
// Test cuts: small pieces that prove a setup before a real cabinet is cut from good sheets.
//
// A test proves something only if it goes through the same code as the cabinet it stands for:
// - the mini drawer and the mini door ARE cabinets, planned by `plan()` from the cabinet's own
//   settings, with only what shrinks them changed (width, height, depth for the door, the
//   layout, one drawer or one door, no toe kick, no nailers, stretchers where they fit). The
//   runner is pinned to the one the real cabinet takes, so its screw holes, the box and its
//   hook holes are the real cabinet's;
// - the machine check and the joint ladders are coupons: plain parts whose cuts are sized by
//   the planner's own formulas (stock plus joint clearance, the dado and groove depths, the
//   bit) and built by the same mesh builder (`partMesh`) and hole check (`holeClear`), so they
//   reach the DXF on the same layers as the cabinet's cuts.
// Whatever the planner refuses is refused here, with its message.
//
// Edge banding: the mini drawer and the mini door are banded as the cabinet is, since they are
// planned by `plan()`: each banded edge's blank a band short, every hole where it is in the
// finished part. Band them before measuring. The machine check and the joint ladders are never
// banded: they test the machine and the joints, and have no edge that shows.
//
// Lengths are metres inside. The guide's numbers are for calipers: inches to 0.001 with
// millimetres, or millimetres, whatever the document's display precision.
import { BLUM, CUP, MATERIALS, PIN, PLATE_HOLE, WEB, backInsetOf, holeClear, plan, runnerLine, validate } from "./cabinet.js";
import { partMesh } from "./mesh.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("./cabinet.js").Part} Part */
/** @typedef {import("./mesh.js").Prism} Prism */
/** @typedef {import("./mesh.js").Hole} Hole */
/** @typedef {[number, number, number]} V3 */
/** @typedef {"machine" | "ladders" | "drawer" | "door"} TestKind */
/** @typedef {"dado" | "back" | "bottom"} LadderKind */

/** The tag every test assembly is put on: hide it (Tags pane) and tick Visible only in the Cut
 * list, and Nesting and CNC files leave the tests out. */
export const TEST_TAG = "Test cuts";
/** @type {TestKind[]} */
export const TEST_KINDS = ["machine", "ladders", "drawer", "door"];
/** @type {Record<TestKind, string>} */
export const TEST_TITLES = { machine: "Machine check", ladders: "Joint ladders", drawer: "Mini drawer", door: "Mini door" };

/** A joint ladder has this many dados. */
export const LADDER_STEPS = 5;
/** The marks that name each dado: round dimples a little wider than the bit (so a drilling or
 * a pocket toolpath with the same bit makes them), this deep, one for dado 1, two for dado 2 ... */
const MARK_DEPTH = 2 * MM;
const MARK_OVER = 1 * MM;
/** Never within this of a dado's width. */
const MARK_CLEAR = 0.25 * MM;
/** A sheet's side for the squareness figure: 4 ft. */
const SHEET = 48 * IN;

const r2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;
/** A length to measure: millimetres, or inches to 0.001 with millimetres. @param {number} m @param {boolean} metric */
export const measureText = (m, metric) => (metric ? `${r2(m / MM)} mm` : `${(m / IN).toFixed(3)} in (${r2(m / MM)} mm)`);
/** A joint clearance: millimetres, or inches to 0.001. @param {number} m @param {boolean} metric */
export const clearanceText = (m, metric) => (metric ? `${r2(m / MM)} mm` : `${(m / IN).toFixed(3)} in`);
/** An area: square feet with square metres, or square metres. @param {number} a @param {boolean} metric */
export const areaText = (a, metric) => (metric ? `${a.toFixed(2)} m²` : `${(a / (IN * IN * 144)).toFixed(1)} sq ft (${a.toFixed(2)} m²)`);
/** Round up to a step. @param {number} m @param {number} step */
const ceilTo = (m, step) => Math.ceil(m / step - 1e-6) * step;

/**
 * The joint clearances a ladder tries: five, a step apart (0.1 mm; 0.004 in in an inch
 * document), one under the current Joint clearance and three over it, moved to stay within the
 * panel's 0 to 1 mm.
 * @param {number} fit @param {boolean} metric @returns {number[]}
 */
export function clearanceSteps(fit, metric) {
  const step = metric ? 0.1 * MM : 0.004 * IN;
  const most = 1 * MM;
  const start = Math.max(0, Math.min(fit - step, most - (LADDER_STEPS - 1) * step));
  return Array.from({ length: LADDER_STEPS }, (_, k) => start + k * step);
}

/** Steps read from a document: five finite clearances from 0 to 1 mm, rising; else null. @param {unknown} v @returns {number[] | null} */
export function validSteps(v) {
  if (!Array.isArray(v) || v.length !== LADDER_STEPS) return null;
  if (!v.every((x, i) => typeof x === "number" && Number.isFinite(x) && x >= -1e-12 && x <= 1 * MM + 1e-12 && (i === 0 || x > v[i - 1]))) return null;
  return /** @type {number[]} */ ([...v]);
}

/**
 * The joint ladders as they were cut, kept in the document when they are added: each ladder's
 * kind and name, the mating stock's thickness then, and each dado's width as cut; the steps;
 * and the node the ladders were added as, so a record whose ladders are gone (undone, deleted)
 * is not used.
 * @typedef {{ kind: LadderKind, name: string, mating: number, widths: number[] }} CutLadder
 * @typedef {{ steps: number[], ladders: CutLadder[], node: number }} LadderRecord
 */
/** @type {Record<LadderKind, string>} */
const LADDER_NAMES = { dado: "Dado ladder", back: "Back groove ladder", bottom: "Drawer bottom ladder" };
/** The stock a ladder's mating piece is, in these settings: the carcass for the dado, the back plywood for the grooves.
 * @param {LadderKind} kind @param {Sizes} s */
export const matingNow = (kind, s) => (kind === "dado" ? s.thickness : s.backThickness);
const stockWord = (/** @type {LadderKind} */ kind) => (kind === "dado" ? "carcass" : "back");

/** The record of ladders just cut. @param {TestCut} t @param {number} node @returns {LadderRecord} */
export function ladderRecord(t, node) {
  return { steps: [...t.steps], ladders: t.coupons.map((c) => ({ kind: c.kind, name: c.name, mating: c.mating, widths: [...c.widths] })), node };
}

/** A record read from a document, checked: else null. @param {unknown} v @returns {LadderRecord | null} */
export function validLadderRecord(v) {
  if (!v || typeof v !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (v);
  const steps = validSteps(r.steps);
  if (!steps || typeof r.node !== "number" || !Number.isInteger(r.node) || !Array.isArray(r.ladders) || !r.ladders.length || r.ladders.length > 3) return null;
  /** @type {CutLadder[]} */
  const ladders = [];
  for (const l of r.ladders) {
    if (!l || typeof l !== "object") return null;
    const { kind, mating, widths } = /** @type {Record<string, unknown>} */ (l);
    if (kind !== "dado" && kind !== "back" && kind !== "bottom") return null;
    if (ladders.some((x) => x.kind === kind)) return null;
    if (typeof mating !== "number" || !(mating > 0 && mating <= 2 * IN)) return null;
    if (!Array.isArray(widths) || widths.length !== LADDER_STEPS || !widths.every((w, i) => typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 2 * IN + 1 * MM && (i === 0 || w > widths[i - 1]))) return null;
    ladders.push({ kind, name: LADDER_NAMES[kind], mating, widths: /** @type {number[]} */ ([...widths]) });
  }
  return { steps, ladders, node: r.node };
}

/**
 * The ladders the picks name: this session's record while its ladders are in the model (its
 * write to the document may have failed), else the document's while its ladders are; else none,
 * so an Undo of the Add, or the ladders deleted, names nothing.
 * @param {LadderRecord | null} mine @param {LadderRecord | null} kept @param {(node: number) => boolean} there
 */
export function liveLadders(mine, kept, there) {
  if (mine && there(mine.node)) return mine;
  if (kept && there(kept.node)) return kept;
  return null;
}

/** The choices for a ladder's pick: each dado by its width as cut and the clearance it is with the
 * stock typed now, then all too tight or all loose. @param {CutLadder} l @param {Sizes} s @param {boolean} metric @returns {[string, string][]} */
export function pickOptions(l, s, metric) {
  const now = matingNow(l.kind, s);
  return [["", "Not tried yet"], ...l.widths.map((w, k) => /** @type {[string, string]} */ ([String(k + 1), `Dado ${k + 1} · ${metric ? `${r2(w / MM)} mm` : `${(w / IN).toFixed(3)} in`} wide · ${clearanceText(w - now, metric)} now`])), ["tight", "All too tight"], ["loose", "All loose"]];
}

/**
 * What the picks come to. A dado that fit is a width, cut then: the clearance is that width less
 * the mating stock typed NOW (the panel asks you to measure and retype it), held to the panel's
 * 0 to 1 mm. The ladders must agree to a micrometre to set one Joint clearance.
 * @param {CutLadder[]} ladders @param {Record<string, string>} picks @param {Sizes} s @param {boolean} metric
 * @returns {{ value: number | null, text: string, tone: "info" | "warning" }}
 */
export function fitFromPicks(ladders, picks, s, metric) {
  const c = (/** @type {number} */ v) => clearanceText(v, metric);
  const M = (/** @type {number} */ v) => (metric ? `${r2(v / MM)} mm` : `${(v / IN).toFixed(3)} in`);
  const changed = ladders
    .filter((l) => Math.abs(l.mating - matingNow(l.kind, s)) > 1e-9)
    .map((l) => `The ${stockWord(l.kind)} stock was ${M(l.mating)} when the ${l.name} was cut; it is ${M(matingNow(l.kind, s))} now, so each dado's clearance is its width less ${M(matingNow(l.kind, s))}.`);
  const tail = changed.length ? ` ${changed.join(" ")}` : "";
  const tried = ladders.filter((l) => picks[l.kind]);
  if (!tried.length) return { value: null, text: `Cut the ladders, slide the mating stock into each dado, and pick the one it goes into with hand pressure.${tail}`, tone: "info" };
  const tight = tried.find((l) => picks[l.kind] === "tight");
  if (tight) return { value: null, text: `${tight.name}: even dado ${tight.widths.length} (${M(tight.widths[tight.widths.length - 1])} wide) is too tight, so that sheet is thicker than ${M(tight.widths[tight.widths.length - 1])}. Measure it again, type what it measures in 4 · Materials, and cut the ladder again.${tail}`, tone: "warning" };
  const loose = tried.find((l) => picks[l.kind] === "loose");
  if (loose) return { value: null, text: `${loose.name}: even dado 1 (${M(loose.widths[0])} wide) is loose, so that sheet is well under ${M(loose.widths[0])}. Measure it again, type what it measures in 4 · Materials, and cut the ladder again.${tail}`, tone: "warning" };
  const got = tried.map((l) => {
    const k = Number(picks[l.kind]) - 1;
    const w = l.widths[k];
    return { l, k, w, raw: w - matingNow(l.kind, s) };
  });
  if (got.some((g) => Math.abs(g.raw - got[0].raw) > 1e-6)) {
    const said = got.map((g) => `${g.l.name}, dado ${g.k + 1} (${c(g.raw)})`).join("; ");
    const backOnly = got.every((g) => g.l.kind !== "dado");
    const why = backOnly
      ? "The two back-plywood ladders try the same back plywood in grooves of the same widths, so they should agree: look at the two jobs' groove toolpaths (the bit, its diameter in the CAM program, Z zero) before the stock."
      : "One Joint clearance serves every dado and groove, so the difference is in the stock: measure the sheets again, type what they measure in 4 · Materials, and cut the ladders again.";
    return { value: null, text: `The ladders disagree: ${said}. ${why}${tail}`, tone: "warning" };
  }
  const raw = got[0].raw;
  const v = Math.max(0, Math.min(1 * MM, raw));
  const names = got.map((g) => `dado ${g.k + 1} on the ${g.l.name}`).join(" and ");
  if (raw < -1e-9) return { value: v, text: `${names[0].toUpperCase()}${names.slice(1)} (${M(got[0].w)} wide) is narrower than the stock typed now (${M(matingNow(got[0].l.kind, s))}): a clearance of ${c(raw)}, held to 0, the least the panel takes. The sheet is likely thinner than typed: measure it again.${tail}`, tone: "warning" };
  if (raw > 1 * MM + 1e-9) return { value: v, text: `${names[0].toUpperCase()}${names.slice(1)} (${M(got[0].w)} wide) is a clearance of ${c(raw)} over the stock typed now, held to 1 mm, the most the panel takes. The sheet is likely thicker than typed: measure it again.${tail}`, tone: "warning" };
  const same = Math.abs(v - s.fit) < 1e-9;
  return { value: same ? null : v, text: `${names[0].toUpperCase()}${names.slice(1)} (${M(got[0].w)} wide): a Joint clearance of ${c(v)}${same ? ", which it is already" : ` (it is ${c(s.fit)} now)`}.${tail}`, tone: "info" };
}

/** The area of plywood the parts are, every copy: the two larger sides of each blank. @param {Part[]} parts */
export function partArea(parts) {
  return parts.reduce((a, p) => {
    const [, b, c] = [...p.blank].sort((x, y) => x - y);
    return a + b * c * p.copies.length;
  }, 0);
}

/** A coupon: one part, one copy, free to turn on the sheet. @param {string} name @param {string} material @param {V3} blank @param {Prism[]} prisms @param {Hole[]} holes @returns {Part} */
function coupon(name, material, blank, prisms, holes) {
  for (const h of holes) if (!holeClear(blank, prisms, h)) throw new Error(`${name}: a mark lands on a dado or an edge.`);
  let mesh;
  try {
    mesh = partMesh(name, blank, prisms, holes);
  } catch (e) {
    throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { name, material, blank, copies: [{ at: [0, 0, 0], name }], mesh, grain: "none" };
}

/**
 * The machine check: a square (100 mm, 4 in in an inch document) cut out of the carcass stock
 * by its profile; a slot one bit wide and 50 mm (2 in) long, cut in one pass; a square pocket
 * 6 mm (1/4 in) deep. Cuts in its top face.
 * @param {Sizes} s @param {boolean} metric
 */
export function machineCheck(s, metric) {
  const wrong = validate(s, metric);
  if (wrong) return { error: wrong, part: null, spec: null };
  const t = s.thickness;
  const spec = {
    side: metric ? 100 * MM : 4 * IN,
    slot: { width: s.bit, length: metric ? 50 * MM : 2 * IN, depth: metric ? 3 * MM : 0.125 * IN },
    pocket: { side: metric ? 30 * MM : 1.25 * IN, depth: metric ? 6 * MM : 0.25 * IN },
  };
  if (!(t - spec.pocket.depth >= WEB - 1e-9)) return { error: `The machine check's pocket is ${measureText(spec.pocket.depth, metric)} deep: the carcass stock must be at least ${measureText(spec.pocket.depth + WEB, metric)} thick for it.`, part: null, spec: null };
  const a = spec.side;
  const { slot, pocket } = spec;
  /** @type {Prism[]} */
  const prisms = [
    { min: [a / 2 - slot.length / 2, 0.7 * a - slot.width / 2, t - slot.depth], max: [a / 2 + slot.length / 2, 0.7 * a + slot.width / 2, t] },
    { min: [a / 2 - pocket.side / 2, 0.3 * a - pocket.side / 2, t - pocket.depth], max: [a / 2 + pocket.side / 2, 0.3 * a + pocket.side / 2, t] },
  ];
  try {
    return { error: null, part: coupon("Machine check", MATERIALS.carcass.name, [a, a, t], prisms, []), spec };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), part: null, spec: null };
  }
}

/**
 * One coupon per joint whose stock differs, each with a dado per clearance step:
 * - the carcass dado, in carcass stock, its width the carcass stock plus the step (with Blind
 *   dados on);
 * - the back's groove, in carcass stock, the back stock plus the step (a back in a groove,
 *   set in from the rear edge: at 0 it is a rabbet, with nothing to fit);
 * - the drawer bottom's groove, in drawer box stock, the back stock plus the step, as deep as
 *   the planner cuts it (half the box stock, at most 1/4 in).
 * Each dado runs out of the coupon's rear edge and stops short of its front edge, like a
 * side's blind dado; in front of dado k are k dimples, so each dado is named on the wood.
 * @param {Sizes} s @param {boolean} metric @param {number[]} [steps] the clearances (else the steps round the current one)
 */
export function ladderCoupons(s, metric, steps = clearanceSteps(s.fit, metric)) {
  const wrong = validate(s, metric);
  /** @type {{ kind: LadderKind, name: string, part: Part, host: string, mating: string, stock: number, matingStock: number, depth: number, widths: number[] }[]} */
  const coupons = [];
  /** @type {string[]} */
  const skipped = [];
  if (wrong) return { error: wrong, coupons, skipped, steps };
  const t = s.thickness;
  const bT = s.backThickness;
  const ds = s.drawerThickness;
  /** @type {{ kind: LadderKind, name: string, material: string, host: string, mating: string, stock: number, matingStock: number, depth: number }[]} */
  const want = [];
  if (s.dados) want.push({ kind: "dado", name: "Dado ladder", material: MATERIALS.carcass.name, host: "carcass", mating: "an offcut of the same carcass sheet", stock: t, matingStock: t, depth: s.dadoDepth });
  else skipped.push("Dado ladder: Butt joints, no dados to fit.");
  if (s.back && s.backMount === "groove" && backInsetOf(s) > 1e-9) want.push({ kind: "back", name: "Back groove ladder", material: MATERIALS.carcass.name, host: "carcass", mating: "a piece of the back plywood", stock: t, matingStock: bT, depth: s.backGrooveDepth });
  else skipped.push(`Back groove ladder: ${!s.back ? "no back" : s.backMount !== "groove" ? "the back sits between the sides, not in a groove" : "a back inset of 0 is a rabbet, with nothing to fit"}.`);
  // The drawer bottom's groove as build() cuts it: half the box stock, at most 1/4 in.
  want.push({ kind: "bottom", name: "Drawer bottom ladder", material: MATERIALS.box.name, host: "drawer box", mating: "a piece of the back plywood (the drawer bottoms' stock)", stock: ds, matingStock: bT, depth: Math.min(ds / 2, 0.25 * IN) });
  for (const w of want) {
    const widths = steps.map((c) => w.matingStock + c);
    try {
      coupons.push({ ...w, part: ladderPart(w.name, w.material, w.stock, w.depth, widths, s.bit, metric), widths });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), coupons: [], skipped, steps };
    }
  }
  return { error: null, coupons, skipped, steps };
}

/**
 * A ladder coupon: `widths` dados, `depth` deep in stock `stock`, side by side with 5/8 in
 * (16 mm) of wood between them and at the ends; each runs 2 in (50 mm) from the rear edge and
 * stops behind a strip that holds its dimples.
 * @param {string} name @param {string} material @param {number} stock @param {number} depth @param {number[]} widths @param {number} bit @param {boolean} metric
 */
function ladderPart(name, material, stock, depth, widths, bit, metric) {
  if (!(depth > 0 && stock - depth >= WEB - 1e-9)) throw new Error(`${name}: a ${measureText(depth, metric)} groove leaves less than 3 mm of a ${measureText(stock, metric)} stock.`);
  const gap = metric ? 16 * MM : (5 / 8) * IN;
  const run = metric ? 50 * MM : 2 * IN;
  const n = widths.length;
  const wMax = Math.max(...widths);
  // A dimple as wide as its dado would touch the grid line the dado's edge draws across the
  // strip, and the mesh could not hold it: then it is made a little wider than the widest dado.
  const markD = widths.some((w) => Math.abs(w - (bit + MARK_OVER)) < MARK_CLEAR) ? wMax + 2 * MARK_CLEAR : bit + MARK_OVER;
  const strip = WEB + n * markD + (n - 1) * WEB + WEB;
  const L = 2 * gap + n * wMax + (n - 1) * gap;
  const W = strip + run;
  /** @type {Prism[]} */
  const prisms = [];
  /** @type {Hole[]} */
  const holes = [];
  widths.forEach((w, k) => {
    const cx = gap + wMax / 2 + k * (wMax + gap);
    prisms.push({ min: [cx - w / 2, strip, stock - depth], max: [cx + w / 2, W, stock] });
    for (let j = 0; j <= k; j++) holes.push({ axis: 2, at: stock, inward: -1, center: [cx, WEB + markD / 2 + j * (markD + WEB)], radius: markD / 2, depth: MARK_DEPTH });
  });
  return coupon(name, material, [L, W, stock], prisms, holes);
}

const hasDrawer = (/** @type {Sizes} */ s) => s.layout === "drawers" || s.layout === "mixed" || s.layout === "trash";

/**
 * Plan with each top in turn (stretchers save plywood where they fit), the first that builds.
 * @param {Sizes} s @param {boolean} metric @param {(p: ReturnType<typeof plan>) => boolean} [accept]
 */
function planEither(s, metric, accept = () => true) {
  let error = "";
  for (const top of /** @type {const} */ (["stretchers", "full"])) {
    const t = { ...s, top };
    const p = plan(t, metric);
    if (!p.error && accept(p)) return { sizes: t, planned: p, error: null };
    error ||= p.error ?? "";
  }
  return { sizes: s, planned: null, error: error || null };
}

/**
 * The smallest value from `start` by `step` (at most `count` of them, none past `most`) whose
 * sizes build; null with the last refusal when none does.
 * @param {(v: number) => Sizes} at @param {number} start @param {number} step @param {number} most @param {boolean} metric @param {(p: ReturnType<typeof plan>, v: number) => boolean} [accept]
 */
function smallest(at, start, step, most, metric, accept = () => true) {
  let error = /** @type {string | null} */ (null);
  for (let k = 0; k < 200; k++) {
    const v = start + k * step;
    if (v > most + 1e-9 && k) break;
    const r = planEither(at(v), metric, (p) => accept(p, v));
    if (r.planned) return { value: v, ...r };
    error = r.error ?? error;
  }
  return { value: NaN, sizes: null, planned: null, error };
}

/**
 * The mini drawer: the real cabinet's runner (Automatic is the one its own inside depth takes)
 * and its depth, catalogue, stock, clearance, front and pulls; one drawer, no toe kick, no
 * nailers, and the narrowest and shortest opening the planner takes. Blum sizes the box from
 * the opening (inside width the opening less 42 mm), so a narrow box is the same fit.
 * @param {Sizes} s @param {boolean} metric
 */
export function miniDrawer(s, metric) {
  // The real drawer's runner: a cabinet without drawers is planned as one with a drawer.
  const realSizes = hasDrawer(s) ? s : { ...s, layout: /** @type {const} */ ("drawers"), drawers: 1, drawerFronts: /** @type {const} */ ("equal") };
  const real = plan(realSizes, metric);
  if (real.error || !real.runner) return { error: `${hasDrawer(s) ? s.name : `${s.name} with a drawer`}: ${real.error ?? "no runner fits"}`, sizes: null, planned: null, runner: null };
  const runner = real.runner;
  const R = runnerLine(s);
  const t = s.thickness;
  /** @type {Sizes} */
  const base = { ...s, name: TEST_TITLES.drawer, layout: "drawers", drawers: 1, drawerFronts: "equal", base: "none", nailers: "none", runner: runner.nl };
  const hStep = metric ? 5 * MM : 0.25 * IN;
  const wStep = metric ? 10 * MM : 0.5 * IN;
  // Lower bounds the planner holds to: a box at least 60 mm tall under Blum's height deduction,
  // and an inside width of at least 170 mm (the locking devices) once 42 mm is taken off.
  const h0 = ceilTo(2 * t + (60 + R.heightDeduct) * MM, hStep);
  const w0 = ceilTo(2 * t + (BLUM.minInside + BLUM.insideDeduct) * MM, wStep);
  const wide = Math.max(s.width, w0);
  const tall = smallest((h) => ({ ...base, width: wide, height: h }), h0, hStep, Math.max(s.height, h0 + 24 * IN), metric);
  if (!tall.planned) return { error: `${TEST_TITLES.drawer}: ${tall.error}`, sizes: null, planned: null, runner };
  const narrow = smallest((w) => ({ ...base, width: w, height: tall.value }), w0, wStep, wide, metric);
  if (!narrow.planned || !narrow.sizes) return { error: `${TEST_TITLES.drawer}: ${narrow.error}`, sizes: null, planned: null, runner };
  return { error: null, sizes: narrow.sizes, planned: narrow.planned, runner };
}

/** The planner laid out two rows of shelf pins (front and rear): a shelf sits on four pins.
 * @param {ReturnType<typeof plan>} p */
const twoPinRows = (p) => p.rows.some((r) => r[0] === "Sides" && /^Shelf pin holes, rows /.test(r[1]));
/** No hinge cup was moved off its place to clear something: the test door's cups are where the
 * cabinet's door's are, from its ends. @param {ReturnType<typeof plan>} p */
const cupsInPlace = (p) => !p.rows.some((r) => /^Hinge cup, .*\(moved /.test(r[1]));

/**
 * The mini door: one door with the real front type, gap, boring distance, hinge inset, pull
 * and hinge side (a pair's left door), and one adjustable shelf on pins; no toe kick, no
 * nailers. About 12 in (300 mm) wide, or the cabinet's width when it is narrower: room for a
 * hand and a screwdriver at the plates. As short, then as shallow, as the planner takes, with
 * two rows of pins (a shelf sits on four) unless the cabinet's own depth gives one.
 * @param {Sizes} s @param {boolean} metric
 */
export function miniDoor(s, metric) {
  const t = s.thickness;
  const width = Math.min(s.width, metric ? 300 * MM : 12 * IN);
  /** @type {Sizes} */
  const base = { ...s, name: TEST_TITLES.door, layout: "doors", doors: "one", hingeSide: s.doors === "two" ? "left" : s.hingeSide, shelves: 1, shelfType: "adjustable", base: "none", nailers: "none", width };
  const step = metric ? 5 * MM : 0.25 * IN;
  const start = ceilTo(2 * t + 50 * MM, step);
  const most = Math.max(s.height, start + 48 * IN);
  // Short enough to save plywood, tall enough that no cup is moved to clear the other (a cup moved
  // on the test door but not on yours would prove nothing); failing that, the shortest it takes.
  const placed = smallest((h) => ({ ...base, height: h }), start, step, most, metric, cupsInPlace);
  const tall = placed.planned ? placed : smallest((h) => ({ ...base, height: h }), start, step, most, metric);
  if (!tall.planned) return { error: `${TEST_TITLES.door}: ${tall.error}`, sizes: null, planned: null };
  const d0 = Math.min(metric ? 100 * MM : 4 * IN, s.depth);
  const inPlace = placed.planned ? cupsInPlace : () => true;
  const deep = smallest((d) => ({ ...base, height: tall.value, depth: d }), d0, metric ? 10 * MM : 0.5 * IN, s.depth, metric, (p, d) => inPlace(p) && (twoPinRows(p) || d >= s.depth - 1e-9));
  if (!deep.planned || !deep.sizes) return { error: `${TEST_TITLES.door}: ${deep.error}`, sizes: null, planned: null };
  return { error: null, sizes: deep.sizes, planned: deep.planned };
}

/**
 * A test, ready for the model and the panel.
 * @typedef {{
 *   error: string | null,
 *   kind: TestKind,
 *   name: string,
 *   parts: Part[],
 *   area: number,
 *   size: V3 | null,
 *   proves: string,
 *   stock: string,
 *   rows: string[][],
 *   holes: string[][],
 *   columns: string[],
 *   steps: number[],
 *   coupons: { kind: LadderKind, name: string, widths: number[], depth: number, mating: number }[],
 *   skipped: string[],
 *   sizes: Sizes | null,
 * }} TestCut
 */

/**
 * A test from the cabinet's settings: its parts (laid out in the assembly's own axes), and what
 * the panel says: what it proves, the stock to cut it from, the measurements with the values
 * expected and what to change when one is off.
 * @param {TestKind} kind @param {Sizes} s @param {boolean} metric
 * @param {number[]} [steps] a ladder's clearances (else the five round the current one)
 * @returns {TestCut}
 */
export function testCut(kind, s, metric, steps) {
  const L = (/** @type {number} */ m) => measureText(m, metric);
  /** @type {TestCut} */
  const out = { error: null, kind, name: `${TEST_TAG} · ${TEST_TITLES[kind]}`, parts: [], area: 0, size: null, proves: "", stock: "", rows: [], holes: [], columns: [], steps: [], coupons: [], skipped: [], sizes: null };
  if (kind === "machine") {
    const m = machineCheck(s, metric);
    out.columns = ["Cut", "Size", "Depth", "Toolpath"];
    out.proves = "That the machine moves the distances the file says, its axes are square, the bit cuts the width you think, and depths are measured from where you zero Z. Cut it first, before any test in real sheet goods.";
    out.stock = `Any flat scrap at least ${metric ? "130 × 130 mm" : "5 × 5 in"}: MDF is cheapest. It is drawn in Cabinet plywood at the carcass thickness, so it nests on that sheet; set the CAM job's thickness to the scrap's measured thickness.`;
    if (m.error || !m.part || !m.spec) return { ...out, error: m.error };
    const { side: a, slot, pocket } = m.spec;
    const diag = a * Math.SQRT2;
    out.parts = [m.part];
    out.rows = [
      ["Slot width (calipers), first", L(slot.width), "The slot is one pass, so its width is your bit's real cutting width, runout included. Type it as the tool's diameter in the CAM program and as 7 · CNC › Bit diameter, then cut the square again before you judge it."],
      ["Square: the side along X, the side along Y (mark which ran along X before you unclamp)", L(a), "For gross errors only. 25.4 times too big or too small: the CAM program's units. Several millimetres off: the CAM job's units or scale, or the machine (its belts or drive): check them with your machine maker's support documents. A small difference here is measurement and the bit's deflection, not scale: do not change the machine's calibration from a 100 mm part. An outside profile cut with a tool diameter typed larger than the bit's comes out larger by the difference. To check the scale, measure a long cut, 500 mm or more, against what the file says: the mini drawer's sides are your cabinet's depth."],
      ["Square: both diagonals", `${L(diag)}, the two equal`, `Unequal by clearly more than you can measure: the axes are not square. Each 0.1 mm between the diagonals is ${metric ? `${r2((0.1 * MM * SHEET) / diag / MM)} mm` : `${((0.1 * MM * SHEET) / diag / IN).toFixed(3)} in`} out of square across a 4 ft sheet: square the machine as its maker's documents say.`],
      ["Pocket depth (depth gauge, from the top face)", L(pocket.depth), "Off by the same amount as the slot's depth: Z zero. Zero Z on the top of the stock, or, with Z zeroed on the bed, type the stock's measured thickness in the CAM job: the depth is off by the difference."],
      ["Slot depth", L(slot.depth), "As the pocket."],
    ];
    out.holes = [
      ["Outline", `${L(a)} square`, "through", "Outside profile"],
      ["Slot", `${L(slot.width)} wide (the bit), ${L(slot.length)} long overall`, L(slot.depth), "Pocket: one pass. If the CAM program makes no toolpath for a shape as wide as the tool, cut this slot as a profile on its centre line (this slot only: never for a joint ladder, whose dados would all come out one bit wide)."],
      ["Pocket", `${L(pocket.side)} square`, L(pocket.depth), "Pocket"],
    ];
  } else if (kind === "ladders") {
    const lad = ladderCoupons(s, metric, steps);
    out.columns = ["Ladder", "Dado", "Clearance", "Width"];
    out.steps = lad.steps;
    out.skipped = lad.skipped;
    out.proves = "Which joint clearance slides together with hand pressure in the sheets you will cut. Sheets vary in thickness by sheet and lot, so this also catches a sheet thicker or thinner than you typed. Cut these in the real sheet goods: the strip left after breaking a sheet down for the bed is free test material.";
    if (lad.error) return { ...out, error: lad.error };
    out.stock = lad.coupons.map((c) => `${c.name}: cut from the ${c.host} sheet (${L(c.stock)}), tried with ${c.mating}.`).join(" ");
    out.parts = lad.coupons.map((c) => c.part);
    out.coupons = lad.coupons.map((c) => ({ kind: c.kind, name: c.name, widths: c.widths, depth: c.depth, mating: c.matingStock }));
    out.rows = [
      ["The mating stock in each dado", "One dado takes it with hand pressure: no mallet, no wobble", "Pick that dado below and press Set Joint clearance. Dado 1 has one dimple in front of it, dado 5 five."],
      ["Each dado's width (calipers)", "As listed below", "All wider (or all narrower) by the same amount: the bit is not the size the CAM program thinks (Machine check: the slot)."],
      ["Each dado's depth", lad.coupons.map((c) => `${c.name.replace(/ ladder$/, "")}: ${L(c.depth)}`).join("; "), "Off: Z zero or the CAM job's thickness (Machine check: the pocket)."],
    ];
    // A dado narrower than the bit cannot be cut with it, as plan() says for the cabinet's grooves
    // ("Change bit"): each such ladder says the bit it needs. Never a profile on a centre line: it
    // would cut every dado one bit wide, and the pick would mean nothing.
    const small = 3 * MM;
    for (const c of lad.coupons) {
      const narrow = c.widths[0];
      if (!(narrow < s.bit - 1e-9)) continue;
      out.rows.push([`Bit for the ${c.name}`, `narrower than ${L(narrow)} (dado 1)${small < narrow - 1e-9 ? ": 1/8 in (3 mm) is" : ""}`, `The ${L(s.bit)} bit cannot cut it. Cut its pocket layer with a smaller end mill, its diameter typed in the CAM program, as pockets: never as a profile on a centre line, which would cut every dado one bit wide.`]);
    }
    out.holes = lad.coupons.flatMap((c) => c.widths.map((w, k) => [c.name, `Dado ${k + 1} (${k + 1} ${k ? "dimples" : "dimple"})`, clearanceText(lad.steps[k], metric), L(w)]));
  } else {
    const mini = kind === "drawer" ? miniDrawer(s, metric) : miniDoor(s, metric);
    // The planner's own rows, with what it does not drill and why (its last column).
    out.columns = ["Part", "What", "Hole", "Depth", "How"];
    const planned = mini.planned;
    // What is drilled: every hole with hardware on, but with inset fronts the runner screws and
    // the hinge plates are listed and not drilled (Blum's inset tables).
    const drilled = s.hardware && s.front === "overlay";
    if (kind === "drawer") {
      out.proves = drilled
        ? "That the drawer runs: the runner fits its screw holes, the box's width, length and height suit it, its rear hooks find their holes and the locking devices fit. The runner and the depth are your cabinet's, so the holes and the box length are exactly its; only the width and the height are smaller, and Blum sizes the box from the opening, so the fit is the same."
        : `That the drawer runs: the box's width, length and height suit the runner${s.hardware ? ", its rear hooks find their holes" : ""} and the locking devices fit. The runner and the depth are your cabinet's; only the width and the height are smaller, and Blum sizes the box from the opening, so the fit is the same. ${s.hardware ? "The runner screw holes are not drilled with inset fronts: place the runners by Blum's inset setback." : "Hardware holes are off: no runner screw or hook holes are drilled."}`;
      out.stock = "Cheap MDF or plywood of the thicknesses in 4 · Materials (carcass, drawer front, drawer box, back), for function. Buy the runners, locking devices and screws first.";
    } else {
      out.proves = drilled
        ? "That the hinge cups, the mounting plates and the reveal come out as on your doors (the same front type, gap, boring distance, hinge inset and pull), and that a shelf pin fits its hole and a shelf sits flat on four pins."
        : `That ${s.hardware ? "the hinge cups and " : ""}the reveal come out as on your doors (the same front type, gap, boring distance, hinge inset and pull), and that a shelf pin fits its hole and a shelf sits flat on four pins. ${s.hardware ? "The mounting plate holes are not drilled with inset fronts: place the plates by Blum's inset tables." : "Hardware holes are off: no cups or plate holes are drilled."}`;
      out.stock = "Cheap MDF or plywood of the thicknesses in 4 · Materials, for function. Buy two hinges, two mounting plates and four shelf pins first.";
    }
    if (mini.error || !planned || !mini.sizes) return { ...out, error: mini.error };
    const ms = mini.sizes;
    out.sizes = ms;
    out.parts = planned.parts;
    out.size = [ms.width, ms.depth, ms.height];
    const of = (/** @type {string} */ name) => planned.parts.filter((p) => p.name === name);
    if (kind === "drawer") {
      const R = runnerLine(ms);
      const runner = /** @type {import("./cabinet.js").RunnerLength} */ (planned.runner);
      const side = of("Drawer side")[0];
      const sides = of("Drawer side").flatMap((p) => p.copies.map((c) => c.at[0]));
      const outside = Math.max(...sides) + side.blank[0] - Math.min(...sides);
      const sub = of("Drawer sub-front")[0];
      const innerW = ms.width - 2 * ms.thickness;
      out.rows = [
        ["The runner", `${R.name} ${runner.part}, ${runner.nl} mm${ms.catalog === "us" ? ` (${Math.round(runner.nl / 25.4)} in)` : ""}: the one your cabinet takes`, "Buy that one: a different length has other screw holes and another box."],
        ["Drawer box, outside width", L(outside), `The opening (${L(innerW)}) less ${BLUM.insideDeduct} mm inside, Blum's rule, plus the two sides. Tight or loose on the runners: measure the drawer box stock again (4 · Materials).`],
        ["Drawer box length", L(side.blank[1]), `${R.boxShort ? `The runner less ${R.boxShort} mm` : "The runner's length"} (Blum). Off: the CAM job's scale (Machine check).`],
        ["Drawer box height", L(sub.blank[2]), `The opening less ${R.heightDeduct} mm (Blum), rounded down.`],
        ["Each side's length (a long cut: the machine's scale)", L(ms.depth), "Your cabinet's depth. Off by more than you can measure: the CAM job's units or scale, or the machine (its belts or drive): check them with your machine maker's support documents."],
        ...(!ms.hardware
          ? [["Hardware holes", "Off in 6 · Hardware: no runner screw or rear hook holes are drilled", "Turn Drill hinge, runner and pull holes on to test them."]]
          : drilled
            ? [["Runner screw holes and rear hook holes", "As listed below (Cuts and holes)", "Off: X and Y zero, or the scale (Machine check)."]]
            : [
                ["Runner screw holes", "Not drilled with inset fronts (listed below)", "Place the runners by Blum's inset setback (the front's thickness further back), by hand."],
                ["Rear hook holes", "As listed below (Cuts and holes)", "Off: X and Y zero, or the scale (Machine check)."],
              ]),
        ["The drawer in its runners", "Runs in and out freely, closes fully, the front's gaps even", "Fit the locking devices (listed below) and adjust them as Blum's instructions say. Rubbing: the box's width, above."],
      ];
      const ours = new Set(["Drawer", "Drawer box", "Drawer back", "Drawer front", "Left and right sides"]);
      out.holes = planned.rows.filter((r) => ours.has(r[0]));
    } else {
      const door = planned.parts.find((p) => p.copies.some((c) => c.name === "Door"));
      // The finished door's edge: a banded door's copy sits at its blank's corner, a band in. A
      // door is banded all round with one band.
      const x0 = door ? door.copies[0].at[0] - (door.offset?.[0] ?? 0) : ms.gap / 2;
      const band = door?.bands?.[0];
      const sideBand = planned.parts.find((p) => p.name === "Left side")?.bands?.[0];
      const moved = planned.rows.filter((r) => /^Hinge cup, .*\(moved /.test(r[1]));
      out.rows = [
        ["Hinge cup centre, from the door's hinge edge", band ? `${L(CUP.radius * MM + ms.cupDistance)} from the banded edge (${L(CUP.radius * MM + ms.cupDistance - band.thickness)} from the raw edge, before banding)` : L(CUP.radius * MM + ms.cupDistance), `${CUP.radius} mm plus the boring distance${band ? ", from the finished edge, as Blum measures it" : ""}. Off: the door turned or mirrored in the CAM program, or X and Y zero.${band ? " Off by about the band's thickness once banded: the band is not the thickness typed in Edge banding (measure it with calipers)." : ""}`],
        ["Hinge cup depth", `${CUP.depth} mm`, "Off: Z zero or the CAM job's thickness (Machine check)."],
        ["Hinge cup centres, from the door's ends", moved.length ? `${L(ms.hingeInset)} (From top, bottom), but ${moved.length === 1 ? "one cup moved" : `${moved.length} cups moved`}: see the rows below that say moved` : `${L(ms.hingeInset)} (From top, bottom)`, "Off at both ends the same way: the door turned end for end."],
        ...(ms.front === "overlay"
          ? [["Mounting plate holes", `${PLATE_HOLE.dia} mm, ${PLATE_HOLE.depth} deep, ${CUP.plateSpacing} mm apart, ${CUP.plateSetback} mm from the side's ${sideBand ? `finished front edge (${L(CUP.plateSetback * MM - sideBand.thickness)} from the raw edge, before banding)` : "front edge"}`, "Off: X and Y zero."]]
          : [["Mounting plates", "Not drilled with inset fronts (listed below)", "Place them by Blum's inset tables, by hand."]]),
        // The door as planned: where its edge is (half the gap, or less of the side where the
        // hinge cannot reach that far), not what the gap alone would give.
        ms.front === "overlay"
          ? ["The gap round the door, closed", `${L(x0)} at each edge of the cabinet; the door covers ${L(ms.thickness - x0)} of each side`, "Even but wrong: the boring distance (the Overlay row below says which matches). Uneven: the hinges' adjusting screws."]
          : ["The gap round the door, closed", `${L(x0 - ms.thickness)} all round, inside the opening`, "Uneven: the hinges' adjusting screws. Even but wrong: the door's size (Machine check: the square)."],
        ["Shelf pins", `${PIN.dia} mm holes, ${PIN.depth} deep: a pin pushes in by hand and the shelf sits flat on four`, "Tight or loose: the end mill that bores the 5 mm holes is not the size the CAM program thinks."],
      ];
      // Blum asks for the top and bottom hinges to be farther apart than the door is wide; a short
      // test door cannot be, and the planner says so.
      if (planned.rows.some((r) => r[4] === "Check" && /less than the door is wide/.test(r[1]))) out.rows.push(["Hinge spacing", "Blum asks for the top and bottom hinges to be farther apart than the door is wide (the Check row below)", `This short test door cannot be. ${moved.length ? "The rows below say which cup moved, and why" : "No cup moved for it: the cups are placed from the door's hinge edge and ends, as on your doors"}.`]);
      if (!ms.hardware) out.rows = [["Hardware holes", "Off in 6 · Hardware: no cups or plate holes are drilled", "Turn Drill hinge, runner and pull holes on to test the hinges."], ...out.rows.filter((r) => !/^(Hinge cup|Mounting plate)/.test(r[0]))];
      const ours = new Set(["Door", "Doors", "Left side", "Right side", "Sides"]);
      out.holes = planned.rows.filter((r) => ours.has(r[0]));
    }
    // Banding on: the test is banded as the cabinet is (the same planner), so band it before
    // measuring or fitting: its holes are placed from the finished edges.
    if (planned.parts.some((p) => p.bands)) {
      out.rows.unshift(["Edge banding", `Band the parts the rows below say (Edge band) with the bands you will use, before you measure or fit anything: they are cut as your cabinet's are, each banded edge a band short, every hole placed from the finished edge`, "Measure a banded part across its bands: it should be its finished size. Off by a band or two: the band is not the thickness typed in Edge banding (measure it with calipers)."]);
      out.holes = [...out.holes, ...planned.rows.filter((r) => r[0] === "Edge banding")];
    }
  }
  // Coupons side by side, 1 in (25 mm) apart, in the assembly's axes.
  if (kind === "machine" || kind === "ladders") {
    const gap = metric ? 25 * MM : 1 * IN;
    let x = 0;
    out.parts = out.parts.map((p) => {
      const at = /** @type {V3} */ ([x, 0, 0]);
      x += p.blank[0] + gap;
      return { ...p, copies: [{ at, name: p.name }] };
    });
    const width = x - gap;
    out.size = [width, Math.max(...out.parts.map((p) => p.blank[1])), Math.max(...out.parts.map((p) => p.blank[2]))];
  }
  out.area = partArea(out.parts);
  return out;
}
