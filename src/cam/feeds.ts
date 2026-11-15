// The feeds and speeds calculator: from a bit, a material and a cut, the starting chipload,
// the router dial and its RPM, the feed, the ramp, the depth per pass, and the warnings.
// Pure: the machine and the router come in resolved (src/cam/shop.ts reads them from the
// shop). Every number used comes from src/cam/data.ts or chipload.ts, each with its source.
//
// Formulas (Amana A1–A4, Onsrud O1–O4, Freud page 2; high):
//   feed = RPM × flutes × chipload         chipload = feed ÷ (RPM × flutes)
//   ramp feed = feed ÷ flutes (Amana)
//   depth of cut over 1 × D: feed × 0.75; over 2 × D: feed × 0.5 (Amana, Onsrud, Freud)
import { CHART_FIGURES, MAKERS, MAKER_SOURCES, MATERIALS, START_ROWS, figureCounts, figureDia, inPerTooth, makerOf, type BitType, type ChartFigure, type DepthRule, type MaterialId, type StartRow } from "./chipload";
import { CHART_DEPTH, COMMUNITY, EIGHTH_HALF, FORSTNER_35, HINGE_BIT_MAX, HPL_FACTOR, M_PER_IN, ONION_SKIN, PLUNGE_HALF, confidenceOf, metres, type DialStep, type DialTable, type Router, type Sourced } from "./data";
import type { Hole, Operation } from "./layers";
import { SOURCES, type Confidence, type Source, type SourceId } from "./sources";
import type { Tool } from "./tools";

// ---------------------------------------------------------------------------------------
// Formulas

/** Feed per minute, in the unit the chipload is in (in/tooth gives IPM, mm/tooth mm/min). */
export function feedRate(rpm: number, flutes: number, chipload: number): number {
  return rpm * flutes * chipload;
}

/** Chipload per tooth from a feed (in the feed's unit). */
export function chiploadOf(feed: number, rpm: number, flutes: number): number {
  return feed / (rpm * flutes);
}

/** Amana's ramp-down feed. */
export function rampFeed(feed: number, flutes: number): number {
  return feed / flutes;
}

export const ipmToMmMin = (ipm: number) => ipm * 25.4;
export const mmMinToIpm = (mm: number) => mm / 25.4;

/** The charts' derate for a pass deeper than the bit's diameter: 1, 0.75 or 0.5, or null
 * past 3 × D, where no chart goes. */
export function depthFactor(depth: number, diameter: number): number | null {
  const r = depth / diameter;
  const eps = 1e-9;
  if (r <= CHART_DEPTH.basis.value + eps) return 1;
  if (r <= 2 + eps) return CHART_DEPTH.over1D.value;
  if (r <= 3 + eps) return CHART_DEPTH.over2D.value;
  return null;
}

// ---------------------------------------------------------------------------------------
// Inputs and results

/** The machine as the calculator needs it. */
export interface MachineView {
  id: string;
  name: string;
  /** Warn above this feed (IPM), with where the number comes from (null: typed by you). */
  feedWarn: { ipm: number; sourced: Sourced | null } | null;
  /** A shank limit typed for a custom machine (metres), over the router's. */
  maxShank: number | null;
}

/** The router: a built-in one and its dial table, or an RPM you typed. */
export interface Spindle {
  router: Router | null;
  table: DialTable | null;
  /** Your router's RPM, when it is not a built-in one. */
  rpm: number | null;
}

export interface FeedsOptions {
  /** A dial picked by hand (null: the calculator picks). */
  dial?: number | null;
  /** The depth per pass you plan (metres; null: the recommended one). */
  depth?: number | null;
  /** A compression bit's first pass (metres). */
  firstPass?: number | null;
  /** How deep the cut goes in all: a pocket's depth (metres). */
  cutDepth?: number | null;
  /** The sheet's measured thickness (metres). */
  thickness?: number | null;
  /** The hole being pocketed. */
  hole?: Hole | null;
  /** A feed you mean to run (IPM), to check its chipload. */
  feedIpm?: number | null;
  /** Say lengths in millimetres first (a metric document). */
  metric?: boolean;
}

export type WarningId = "compression-first-pass" | "compression-upcut-unknown" | "compression-depth-unknown" | "downcut-underside" | "feed" | "chipload-low" | "rubbing" | "chipload-high" | "collet" | "shank-unknown" | "hinge-bit" | "hole-size" | "hole-depth" | "upcut-face" | "too-deep" | "no-rpm" | "no-flutes" | "no-figure";

export interface Warning {
  id: WarningId;
  /** stop: do not cut like this. caution: check before you cut. */
  level: "stop" | "caution";
  text: string;
  src: SourceId[];
}

export interface Note {
  text: string;
  src: SourceId[];
}

/** One input to a feed: what it is, its source (null: you typed it) and its confidence. */
export interface FeedInput {
  what: string;
  src: SourceId | null;
  confidence: Confidence | null;
}

export interface FeedsResult {
  /** Every chart figure for this bit and material, makers first. */
  figures: ChartFigure[];
  /** The bit makers' own figures among them. */
  makerFigures: ChartFigure[];
  /** The lowest and highest of the bit makers' figures (in/tooth), and how far apart. */
  makerRange: { min: number; max: number; spread: number } | null;
  /** The starting chipload (in/tooth) and where it comes from. */
  start: { chipload: number; from: Sourced; row: StartRow | null; why: string } | null;
  /** The dial and RPM (dial null: an RPM you typed). */
  dial: DialStep | null;
  autoDial: boolean;
  rpm: number | null;
  /** The feed derate for the depth per pass (1 up to 1 × D). */
  depthFactor: number | null;
  /** The chipload at the cut (in/tooth): the start × the derate, or your feed's. */
  chipload: number | null;
  feedIpm: number | null;
  feedMmMin: number | null;
  rampIpm: number | null;
  /** What the feed is made of, each with its source; its confidence is the lowest of them. */
  feedFrom: FeedInput[];
  feedConfidence: Confidence | null;
  /** The feed's inputs and Amana's ramp formula. */
  rampFrom: FeedInput[];
  /** The depth per pass: the one used, the recommended one, and why. */
  depth: { used: number | null; recommended: number | null; rule: DepthRule | "chart"; chartBasis: number | null; community: number | null };
  /** A compression bit's first pass: deeper than this (metres), at this feed. */
  firstPass: { deeperThan: number; feedIpm: number | null } | null;
  warnings: Warning[];
  notes: Note[];
}

const EPS_M = 1e-5; // 0.01 mm: diameters match within this

/** The chart figures for a bit and a material (all sources), bit makers first. */
export function figuresFor(tool: Tool, material: MaterialId): ChartFigure[] {
  if (tool.diameter === null) return [];
  const d = tool.diameter;
  const out = CHART_FIGURES.filter((f) => f.kinds.includes(tool.type) && f.materials.includes(material) && Math.abs(figureDia(f) - d) <= EPS_M && (f.flutes === null || tool.flutes === null || f.flutes === tool.flutes));
  const maker = (f: ChartFigure) => (MAKER_SOURCES.includes(f.src) ? 0 : 1);
  return out.sort((a, b) => maker(a) - maker(b));
}

/** The tool types whose rows can stand in for each other: Amana's and Onsrud's spiral charts
 * cover up-cut, down-cut (and so end mill) bits together; compression has its own. */
function family(t: BitType): BitType[] {
  return t === "compression" ? ["compression"] : t === "oflute" ? [] : ["upcut", "downcut", "endmill"];
}

/** The §8a row nearest a bit that has none of its own: the same diameter and material, the
 * same type first, then the same family (any flute count). Its dial and depth rule are used. */
export function matchingRowFor(tool: Tool, material: MaterialId): StartRow | null {
  if (tool.diameter === null) return null;
  const at = START_ROWS.filter((r) => Math.abs(r.diaIn * M_PER_IN - tool.diameter!) <= EPS_M && r.materials.includes(material));
  return at.find((r) => r.kinds.includes(tool.type)) ?? at.find((r) => r.kinds.some((k) => family(tool.type).includes(k))) ?? null;
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
/** The lowest of some confidences (null: none). */
export function lowest(cs: (Confidence | null)[]): Confidence | null {
  const known = cs.filter((c): c is Confidence => c !== null);
  return known.length ? known.reduce((a, b) => (RANK[b] < RANK[a] ? b : a)) : null;
}

const makerLabel = (src: SourceId) => MAKERS.find((m) => m.id === makerOf(src))?.label ?? (SOURCES[src] as Source).maker;
const rpmText = (v: number) => v.toLocaleString("en-US");

/** The research's starting row for a bit and material, if it has one (§8a). */
export function startRowFor(tool: Tool, material: MaterialId): StartRow | null {
  if (tool.diameter === null || tool.flutes === null) return null;
  return START_ROWS.find((r) => r.kinds.includes(tool.type) && r.flutes === tool.flutes && Math.abs(r.diaIn * M_PER_IN - tool.diameter!) <= EPS_M && r.materials.includes(material)) ?? null;
}

/** A length both ways, the document's unit first: "0.2756 in (7.00 mm)". */
export function bothUnits(m: number, metric = false, digits = 4): string {
  const inch = `${(m / M_PER_IN).toFixed(digits)} in`;
  const mm = `${(m * 1000).toFixed(2)} mm`;
  return metric ? `${mm} (${inch})` : `${inch} (${mm})`;
}

/** A chipload both ways: "0.0031 in/tooth (0.079 mm/tooth)". */
export function chiploadText(inch: number, metric = false): string {
  const a = `${inch.toFixed(4)} in/tooth`;
  const b = `${(inch * 25.4).toFixed(3)} mm/tooth`;
  return metric ? `${b} (${a})` : `${a} (${b})`;
}

/** Feeds and speeds for one bit, material and cut, on one machine and router. */
export function computeFeeds(tool: Tool, material: MaterialId, op: Operation, machine: MachineView, spindle: Spindle, opts: FeedsOptions = {}): FeedsResult {
  const warnings: Warning[] = [];
  const notes: Note[] = [];
  const fmtIn = (m: number, digits = 4) => bothUnits(m, opts.metric, digits);
  const fmtCl = (v: number) => chiploadText(v, opts.metric);
  const mat = MATERIALS.find((m) => m.id === material)!;
  const D = tool.diameter;
  const flutes = tool.flutes;
  const eighth = D !== null && D <= 0.125 * M_PER_IN + EPS_M;

  // Chipload: the charts, and the starting value.
  const figures = tool.type === "oflute" ? [] : figuresFor(tool, material);
  const makerFigures = figures.filter((f) => figureCounts(f, tool.name));
  const clMin = (f: ChartFigure) => inPerTooth(f.min, f.unit);
  const clMax = (f: ChartFigure) => inPerTooth(f.max, f.unit);
  let makerRange: FeedsResult["makerRange"] = null;
  if (makerFigures.length) {
    const min = Math.min(...makerFigures.map(clMin));
    const max = Math.max(...makerFigures.map(clMax));
    makerRange = { min, max, spread: max / min };
  }
  const row = tool.type === "oflute" ? null : startRowFor(tool, material);
  // A bit with no row of its own runs at the dial of the nearest row (§8a), else near 18,000.
  const near = row ?? (tool.type === "oflute" ? null : matchingRowFor(tool, material));
  const floor = COMMUNITY.rubbingFloor.value;
  let start: FeedsResult["start"] = null;
  if (row) {
    start = { chipload: row.chipload.value, from: row.chipload, row, why: `The research's starting value for this job (§8a: ${row.job}).` };
  } else if (makerFigures.length) {
    const lowOf = (fs: ChartFigure[]) => fs.reduce((a, b) => (clMin(b) < clMin(a) ? b : a));
    const dialWhy = near ? ` It runs at the dial §8a uses for its nearest row ("${near.job}", ${rpmText(near.rpm.value)} RPM on Carbide's shop-page table).` : ` It runs near ${rpmText(CHART_DEPTH.rpm.value)} RPM, the charts' speed (§8b).`;
    if (eighth) {
      // §8b: half of Amana's printed 1/8 in figure on a light machine; §8a keeps it above the floor.
      const amana = makerFigures.filter((f) => makerOf(f.src) === "amana");
      const base = lowOf(amana.length ? amana : makerFigures);
      const half = clMin(base) * EIGHTH_HALF.value;
      const chip = half >= floor ? half : Math.min(clMin(base), floor);
      const floored = half < floor;
      const said = `${makerLabel(base.src)}'s ${base.bit}, ${base.column}: ${base.min} ${base.unit}`;
      start = {
        chipload: chip,
        from: { value: chip, unit: "in/tooth", src: "report8b", confidence: "low", note: `Half of ${said}${floored ? `, kept at the ${floor} in/tooth rubbing floor` : ""}` },
        row: null,
        why: `§8b: on a light machine, a 1/8 in bit starts at half of ${amana.length ? "Amana's" : "the lowest bit maker's"} printed figure (${said}).${floored ? ` Half would be under the ${floor} in/tooth rubbing floor the research keeps to (§8a), so it starts at the floor.` : ""}${dialWhy}`,
      };
    } else {
      const low = lowOf(makerFigures);
      start = {
        chipload: clMin(low),
        from: { value: low.min, unit: low.unit, src: low.src, note: `${makerLabel(low.src)}, ${low.bit}, ${low.column}` },
        row: null,
        why: `§8a rule 1: the lowest bit maker's figure for this bit and material (${makerLabel(low.src)}, ${low.bit}, ${low.column}).${dialWhy}`,
      };
    }
  }
  if (tool.type === "oflute") {
    warnings.push({ id: "no-figure", level: "caution", text: "No bit maker's chipload for an O-flute in wood, MDF or laminate was found (Amana's O-flute charts are for aluminum and plastic). Sawhorse does not know a starting value: ask the bit's maker.", src: ["amana-a1"] });
  } else if (!figures.length) {
    warnings.push({
      id: "no-figure",
      level: "caution",
      text: D === null ? "Type the bit's cutting diameter." : `No chart figure for a ${fmtIn(D, 4)} ${tool.type} bit in ${mat.label.toLowerCase()}. Sawhorse carries the 1/8 in and 1/4 in chart rows, and Rennie's 6 mm: for this bit, ask its maker.`,
      src: [],
    });
  } else if (!start) {
    warnings.push({ id: "no-figure", level: "caution", text: "Only a reseller or the community gives a figure for this bit and material, no bit maker: Sawhorse gives no starting value. The figures are listed below.", src: figures.map((f) => f.src) });
  }
  if (flutes === null) warnings.push({ id: "no-flutes", level: "caution", text: "Type the bit's number of flutes: the feed is RPM × flutes × chipload.", src: ["amana-a1"] });

  // Depth per pass.
  const rule: DepthRule | "chart" = near?.depth ?? "chart";
  const chartBasis = D === null ? null : D * CHART_DEPTH.basis.value;
  const community = D === null ? null : D * COMMUNITY.halfD.value;
  const recommended = D === null ? null : rule === "half" ? community : chartBasis;
  const used = opts.depth ?? recommended;
  const factor = used !== null && D !== null ? depthFactor(used, D) : 1;
  if (used !== null && D !== null && factor === null) {
    warnings.push({ id: "too-deep", level: "stop", text: `A pass of ${fmtIn(used, 3)} is more than 3 × the bit's diameter: no chart goes that deep. Take shallower passes.`, src: ["amana-charts"] });
  }

  // Speed: a dial on the router's table, or the RPM you typed.
  const warn = machine.feedWarn?.ipm ?? null;
  const cl = (c: number) => c * (factor ?? 0);
  let dial: DialStep | null = null;
  let autoDial = false;
  let rpm: number | null = null;
  if (spindle.table) {
    const steps = [...spindle.table.steps].sort((a, b) => a.dial - b.dial);
    const picked = opts.dial != null ? steps.find((s) => Math.abs(s.dial - opts.dial!) < 1e-9) : undefined;
    if (picked) dial = picked;
    else {
      autoDial = true;
      const target = near?.rpm.value ?? CHART_DEPTH.rpm.value;
      let i = 0;
      for (let k = 1; k < steps.length; k++) if (Math.abs(steps[k].rpm.value - target) < Math.abs(steps[i].rpm.value - target)) i = k;
      // Step down while the feed would be over the machine's limit: the chipload stays.
      if (start && flutes !== null && warn !== null && factor) while (i > 0 && feedRate(steps[i].rpm.value, flutes, cl(start.chipload)) > warn) i--;
      dial = steps[i];
    }
    rpm = dial.rpm.value;
    const range = spindle.router?.range;
    if (range && (rpm < range.low.value || rpm > range.high.value)) {
      notes.push({ text: `Dial ${dial.dial} (${rpmText(rpm)} RPM on this table) is outside the ${rpmText(range.low.value)}–${rpmText(range.high.value)} RPM range ${spindle.router!.name}'s maker states: the real speed there is the least certain.`, src: [dial.rpm.src, range.low.src] });
    }
  } else if (spindle.rpm !== null && spindle.rpm > 0) {
    rpm = spindle.rpm;
  } else {
    warnings.push({ id: "no-rpm", level: "caution", text: "Type your router's RPM in Machine.", src: [] });
  }

  // Feed, and what it is made of.
  let chipload: number | null = null;
  let feedIpm: number | null = null;
  const feedFrom: FeedInput[] = [];
  const rpmInput: FeedInput = dial ? { what: `dial ${dial.dial}, ${rpmText(dial.rpm.value)} RPM`, src: dial.rpm.src, confidence: confidenceOf(dial.rpm) } : { what: "the RPM you typed", src: null, confidence: null };
  if (opts.feedIpm != null && opts.feedIpm > 0) {
    feedIpm = opts.feedIpm;
    feedFrom.push({ what: "the feed you typed", src: null, confidence: null });
    if (rpm !== null && flutes !== null) {
      chipload = chiploadOf(feedIpm, rpm, flutes);
      feedFrom.push(rpmInput, { what: "chipload = feed ÷ (RPM × flutes)", src: "amana-a1", confidence: "high" });
    }
  } else if (start && factor !== null && rpm !== null && flutes !== null) {
    chipload = cl(start.chipload);
    feedIpm = feedRate(rpm, flutes, chipload);
    feedFrom.push({ what: "the starting chipload", src: start.from.src, confidence: confidenceOf(start.from) }, rpmInput, { what: "feed = RPM × flutes × chipload", src: "amana-a1", confidence: "high" });
    if (factor < 1) feedFrom.push({ what: `× ${factor} for a pass deeper than the bit's diameter`, src: "amana-charts", confidence: "high" });
  }
  const rampIpm = feedIpm !== null && flutes !== null ? rampFeed(feedIpm, flutes) : null;
  const rampFrom: FeedInput[] = rampIpm === null ? [] : [...feedFrom, { what: "ramp = feed ÷ flutes", src: "amana-a1", confidence: "high" }];

  // The rubbing floor: 0.001 in/tooth, which may drop to 0.0005 for 1/8 in and smaller bits.
  const rubbing = (c: number, who: string): boolean => {
    const small = COMMUNITY.rubbingFloorSmall.value;
    if (c < (eighth ? small : floor) - 1e-12) {
      warnings.push({ id: "rubbing", level: "stop", text: `${who}${fmtCl(c)} is under ${eighth ? `${small} in/tooth, the lowest the cited minimum may drop to for a 1/8 in bit` : `${floor} in/tooth, the commonly cited minimum`} (low confidence): the bit rubs instead of cutting, heats and dulls, and wood can burn.`, src: ["atoz", "freud"] });
      return true;
    }
    if (eighth && c < floor - 1e-12) {
      warnings.push({ id: "rubbing", level: "caution", text: `${who}${fmtCl(c)} is under ${floor} in/tooth, the commonly cited minimum; the same source says it "may need to be lowered to 0.0005" for 1/8 in and smaller bits (low confidence). In the scrap test, dust instead of chips means it rubs.`, src: ["atoz"] });
      return true;
    }
    return false;
  };

  // A compression bit: the first pass must be deeper than the up-cut part.
  let firstPass: FeedsResult["firstPass"] = null;
  if (tool.type === "compression") {
    const cut = op === "hole" ? (opts.hole?.depth ?? opts.thickness ?? null) : op === "pocket" ? (opts.cutDepth ?? null) : (opts.thickness ?? null);
    if (tool.upcut === null) {
      warnings.push({ id: "compression-upcut-unknown", level: "caution", text: "Type this compression bit's up-cut length (from its maker's drawing, or measured from the tip to where the flutes change direction): its first pass must be deeper than that, or the top face chips.", src: ["crs-melamine"] });
    } else {
      const tol = tool.upcutTol ?? 0;
      const deeperThan = tool.upcut + tol;
      // With no first pass typed, the depth per pass is the first pass.
      const typed = opts.firstPass ?? opts.depth ?? null;
      const fromDepth = opts.firstPass == null && opts.depth != null;
      const fpDepth = typed !== null && typed > deeperThan + 1e-9 ? typed : deeperThan;
      const fpFactor = D !== null ? depthFactor(fpDepth, D) : null;
      const fpChip = start && fpFactor ? start.chipload * fpFactor : null;
      const fpFeed = fpChip !== null && rpm !== null && flutes !== null ? feedRate(rpm, flutes, fpChip) : null;
      firstPass = { deeperThan, feedIpm: fpFeed };
      const what = `the up-cut part (${fmtIn(tool.upcut)}${tol ? ` ± ${fmtIn(tol, 3)}` : ""})`;
      if (cut !== null && cut <= deeperThan + 1e-9) {
        const thin = op === "profile";
        warnings.push({
          id: "compression-first-pass",
          level: "stop",
          text: `This cut is ${fmtIn(cut, 3)} deep, no deeper than ${what}: the compression bit cuts it as an up-cut bit and the top face chips. Use a down-cut bit${op === "pocket" ? " for pockets and dados this shallow" : ""}.${thin ? " A down-cut keeps the top face, but it pushes the skin off the bottom face where nothing holds it: on a sheet faced on both sides, cut it on a flat spoilboard and look at the bottom face of a test part." : ""}`,
          src: ["crs-melamine", "amana-a5", "c3d-251"],
        });
      } else if (typed !== null && typed <= deeperThan + 1e-9) {
        warnings.push({
          id: "compression-first-pass",
          level: "stop",
          text: fromDepth
            ? `With no first pass typed, your depth per pass (${fmtIn(typed, 3)}) is the first pass, and it is not deeper than ${what}: the top laminate chips. Type a first pass deeper than ${fmtIn(deeperThan, 4)}, then take the later passes at your depth.`
            : `A first pass of ${fmtIn(typed, 3)} is not deeper than ${what}: the top laminate chips. Make the first pass deeper than ${fmtIn(deeperThan, 4)}.`,
          src: ["crs-melamine", "amana-a5"],
        });
      }
      if (op === "pocket" && opts.cutDepth == null) {
        warnings.push({ id: "compression-depth-unknown", level: "caution", text: `Type the pocket's depth: a compression bit cuts a pocket no deeper than ${what} as an up-cut bit, and the top face chips. Dados that shallow (a 1/4 in dado is) want the down-cut bit.`, src: ["crs-melamine", "c3d-251"] });
      }
      // The first pass's own feed: its chipload, and the machine's limit.
      if (fpChip !== null) rubbing(fpChip, "The first pass's chipload, ");
      // Said once: when the later passes are over the limit too, their warning covers it.
      const mainOver = feedIpm !== null && warn !== null && feedIpm > warn + 1e-9;
      if (!mainOver && fpFeed !== null && warn !== null && fpFeed > warn + 1e-9) {
        const said = machine.feedWarn?.sourced ? `${warn} IPM, a forum figure: Carbide 3D does not publish one (low confidence)` : `${warn} IPM, the limit you typed`;
        warnings.push({ id: "feed", level: "caution", text: `The first pass, at ${fpFeed.toFixed(0)} IPM, is over this machine's ${said}. Turn the router's dial down.`, src: machine.feedWarn?.sourced ? [machine.feedWarn.sourced.src] : [] });
      }
    }
    notes.push({ text: '"Compression bits fail when the first pass is too shallow … take the first pass deeper than the upcut tip (usually about one bit diameter)."', src: ["crs-melamine"] });
    notes.push({
      text: `A user reports Carbide Create's library cutting compression bits in plywood ${COMMUNITY.ccLibraryDepthLow.value}–${COMMUNITY.ccLibraryDepthHigh.value} in deep a pass (low confidence): far shallower than an up-cut part, so the bit cuts as an up-cut bit.`,
      src: ["forum-46692"],
    });
  }

  // The feed against the machine's limit.
  if (feedIpm !== null && warn !== null && feedIpm > warn + 1e-9) {
    const said = machine.feedWarn?.sourced ? `${warn} IPM, a forum figure: Carbide 3D does not publish one (low confidence)` : `${warn} IPM, the limit you typed`;
    warnings.push({ id: "feed", level: "caution", text: `${feedIpm.toFixed(0)} IPM is over this machine's ${said}. Turn the router's dial down: the feed drops and the chipload stays the same.`, src: machine.feedWarn?.sourced ? [machine.feedWarn.sourced.src] : [] });
  }

  // The chipload against the floor and the makers'.
  if (chipload !== null && !rubbing(chipload, "") && makerRange && factor) {
    const low = makerRange.min * factor;
    if (chipload < low - 1e-12) {
      const lowest = makerFigures.find((f) => Math.abs(clMin(f) - makerRange!.min) < 1e-12)!;
      const below = start && opts.feedIpm == null && start.chipload * factor < low - 1e-12;
      const why = below ? ` The research starts below it on purpose: ${start!.from.note ?? "see its source"} (${confidenceOf(start!.from)} confidence). In the scrap test, chips mean it cuts, dust means it rubs.` : "";
      warnings.push({ id: "chipload-low", level: "caution", text: `${fmtCl(chipload)} is below the lowest bit maker's figure for this bit and material (${fmtCl(low)}, ${makerLabel(lowest.src)}'s ${lowest.bit}): too small a chip rubs, heats the edge and dulls the bit.${why}`, src: below ? ["freud", "toolstoday", lowest.src, start!.from.src] : ["freud", "toolstoday", lowest.src] });
    } else {
      // Against the bit's own maker, or else the most conservative maker's highest figure.
      const own = tool.maker ? makerFigures.filter((f) => makerOf(f.src) === tool.maker) : [];
      const byMaker = new Map<string, number>();
      for (const f of makerFigures) byMaker.set(makerOf(f.src)!, Math.max(byMaker.get(makerOf(f.src)!) ?? 0, clMax(f)));
      const ownMax = own.length ? Math.max(...own.map(clMax)) : null;
      const [consMaker, consMax] = [...byMaker.entries()].reduce((a, b) => (b[1] < a[1] ? b : a));
      const ref = ownMax ?? consMax;
      if (chipload > ref * factor + 1e-12) {
        const name = (id: string) => MAKERS.find((m) => m.id === id)!.label;
        const said = ownMax !== null ? `${name(tool.maker!)}'s own figure for this bit and material (${fmtCl(ref * factor)}), ${(chipload / (ref * factor)).toFixed(1)} times it` : `the most conservative bit maker's figure for this bit and material (${name(consMaker)}'s ${fmtCl(ref * factor)}; the highest, ${fmtCl(makerRange.max * factor)}, is another maker's chart for its own bits)`;
        warnings.push({ id: "chipload-high", level: "caution", text: `${fmtCl(chipload)} is above ${said}: the bit can break or the cut tear. Slow the feed or raise the dial.`, src: (ownMax !== null ? own : makerFigures).map((f) => f.src) });
      }
    }
  }

  // The shank against the collet.
  const r = spindle.router;
  const maxShank = machine.maxShank ?? (r?.maxShank ? metres(r.maxShank) : null);
  if (tool.shank === null) {
    warnings.push({ id: "shank-unknown", level: "caution", text: `Type the bit's shank: Sawhorse cannot check it fits ${r ? `the ${r.name}'s collet` : "your router's collet"}.`, src: [] });
  } else if (maxShank !== null && tool.shank > maxShank + EPS_M) {
    warnings.push({ id: "collet", level: "stop", text: `A ${fmtIn(tool.shank, 3)} shank is larger than ${r && machine.maxShank === null ? `the ${r.name} takes (${r.maxShank!.note ?? fmtIn(maxShank, 3)})` : `the ${fmtIn(maxShank, 3)} you typed`}.`, src: r?.maxShank && machine.maxShank === null ? [r.maxShank.src] : [] });
  } else if (r?.collets && !r.collets.some((c) => Math.abs(metres(c) - tool.shank!) <= EPS_M)) {
    warnings.push({ id: "collet", level: "stop", text: `No collet for a ${fmtIn(tool.shank, 4)} shank: the ${r.name}'s maker lists ${r.collets.map((c) => `${c.value} in`).join(" and ")}. A bit in a collet of another size can slip or fly out.`, src: [r.collets[0].src] });
  } else if (r && !r.collets && machine.maxShank === null) {
    warnings.push({ id: "shank-unknown", level: "caution", text: `The research did not find the ${r.name}'s collet sizes: check its manual for a ${fmtIn(tool.shank, 3)} collet.`, src: [] });
  } else if (!r && machine.maxShank === null) {
    warnings.push({ id: "shank-unknown", level: "caution", text: `Sawhorse does not know what shank your router takes: check it has a ${fmtIn(tool.shank, 3)} collet, or type its largest shank in a Custom machine.`, src: [] });
  }

  // Holes: pocket them with an end mill smaller than the hole, never a hinge-boring bit.
  const hingeBit = /forstner|hinge|\bcups?\b|35\s*mm/i.test(tool.name);
  if (op === "hole" || hingeBit) {
    const slowest = spindle.table ? Math.min(...spindle.table.steps.map((s) => s.rpm.value)) : spindle.rpm;
    const why = `Amana's 35 mm hinge-boring bit is rated ${rpmText(HINGE_BIT_MAX.value)} RPM at most and "Not to be used in … hand held routers"; Würth runs a Forstner over 35 mm at ${FORSTNER_35.value} rpm in MDF${slowest ? `. This router's slowest setting is ${rpmText(slowest)} RPM` : ""}.`;
    if (hingeBit) warnings.push({ id: "hinge-bit", level: "stop", text: `Never put a Forstner or hinge-boring bit in the router: pocket the hole with an end mill. ${why}`, src: ["amana-203431", "wurth", "freud"] });
    else if (opts.hole && Math.abs(opts.hole.diameter - 0.035) < EPS_M) notes.push({ text: `Pocket the 35 mm cups with an end mill, never a Forstner or hinge-boring bit. ${why}`, src: ["amana-203431", "wurth"] });
  }
  if (op === "hole") {
    const h = opts.hole ?? null;
    if (!h) warnings.push({ id: "hole-size", level: "caution", text: "Pick the hole layer to check the bit against the hole.", src: [] });
    else {
      if (D !== null && D >= h.diameter - 1e-9) {
        warnings.push({ id: "hole-size", level: "stop", text: `A ${fmtIn(D, 4)} bit cannot pocket a ${(h.diameter * 1000).toFixed(2)} mm hole: the end mill must be smaller than the hole.`, src: [] });
      }
      const depth = h.depth ?? opts.thickness ?? null;
      if (depth === null) warnings.push({ id: "hole-depth", level: "caution", text: "This hole goes through the sheet: type the sheet's thickness to check the bit's flutes reach.", src: [] });
      else if (tool.cuttingLength === null) warnings.push({ id: "hole-depth", level: "caution", text: `Type the bit's cutting length: its flutes must reach ${(depth * 1000).toFixed(1)} mm deep.`, src: ["freud"] });
      else if (tool.cuttingLength < depth - 1e-9) {
        warnings.push({ id: "hole-depth", level: "stop", text: `The flutes are ${(tool.cuttingLength * 1000).toFixed(1)} mm long and the hole is ${(depth * 1000).toFixed(1)} mm deep: the shank would rub. Use a bit with longer flutes, or bore as deep as they reach and finish by hand.`, src: ["freud"] });
      }
    }
    notes.push({ text: `Enter each hole with a ramp or a helix, not a straight plunge. The community ramps in at about ${COMMUNITY.rampAngle.value}° (low confidence; no bit maker's angle was found). No bit maker gives how much smaller than the hole the end mill should be.`, src: ["forum-85436"] });
  }

  // An up-cut bit lifts a laminate face; a down-cut pushes the bottom face's skin off.
  if (mat.faced && tool.type === "upcut") {
    warnings.push({ id: "upcut-face", level: "stop", text: `Never use an up-cut bit on a finished face of ${mat.label.toLowerCase()}: it lifts the face and chips it ("for finished top surfaces use a downcut … or a compression bit"). Up-cut is for faces that never show.`, src: ["report8a", "crs-52-200", "crs-melamine"] });
  } else if (mat.faced && tool.type === "endmill") {
    warnings.push({ id: "upcut-face", level: "caution", text: `If this end mill is an up-cut spiral, it lifts the face of ${mat.label.toLowerCase()} and can chip it ("for finished top surfaces use a downcut … or a compression bit"). Look at the edge of a test cut.`, src: ["crs-52-200", "crs-melamine"] });
  }
  if (mat.faced && tool.type === "downcut" && op === "profile") {
    warnings.push({ id: "downcut-underside", level: "caution", text: `A down-cut bit cut through ${mat.label.toLowerCase()} pushes the skin off the bottom face, where nothing supports it. For profiles and cutouts through a faced sheet use a compression bit, on a flat spoilboard.`, src: ["crs-melamine"] });
  }

  if (tool.type === "downcut") notes.push({ text: 'A down-cut bit packs the chips into the cut: "Care must be used to have adequate chip evacuation."', src: ["c3d-251"] });
  if (material === "hpl-mdf" && start?.row) notes.push({ text: `The HPL figure is derived: Amana's MDF/Laminate value × ${HPL_FACTOR.value} (Rennie's HPL against its MDF row). Rennie's chart excludes compression bits.`, src: ["report8a", "rennie", "amana-a1"] });
  if (op === "profile") notes.push({ text: `For small parts that might move on the last pass, leave an onion skin: cut ${ONION_SKIN.value} in less than the sheet's measured thickness, then clean it up.`, src: ["laguna"] });
  notes.push({ text: "Every bit maker's chart assumes an industrial machine at 18,000 RPM and a pass 1 × the bit's diameter deep.", src: ["amana-a1", "onsrud-o1", "freud"] });

  return {
    figures,
    makerFigures,
    makerRange,
    start,
    dial,
    autoDial,
    rpm,
    depthFactor: factor,
    chipload,
    feedIpm,
    feedMmMin: feedIpm === null ? null : ipmToMmMin(feedIpm),
    rampIpm,
    feedFrom,
    feedConfidence: lowest(feedFrom.map((f) => f.confidence)),
    rampFrom,
    depth: { used, recommended, rule, chartBasis, community },
    firstPass,
    warnings,
    notes,
  };
}

/** The plunge rules of thumb, for the panel. */
export const PLUNGE = { half: PLUNGE_HALF, low: COMMUNITY.plungeLow, high: COMMUNITY.plungeHigh, ramp: COMMUNITY.rampAngle };
