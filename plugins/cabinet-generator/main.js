// @ts-check
// Cabinet generator: a frameless cabinet from its sizes, ready for a CNC router.
//
// The panel is laid out like a cabinet shop's order form: a starting point, a name, then
// numbered groups (size, layout, fronts, materials, construction, hardware, CNC, cuts), each
// saying in one line what is in it while closed.
//
// Two modes. With nothing of ours selected the panel holds the settings for a NEW cabinet,
// and Generate adds it beside the model. Select a cabinet this plugin made (a click, or a
// double-click into it) and the panel shows THAT cabinet's settings (kept in the document by
// its instance id); every change rebuilds it in place, one undo step each. Click empty space
// to go back to a new cabinet.
//
// Every part is a named component on a plywood material with its grain set (doors, faces and
// sides as asked, the hidden parts free to turn), so the cut list nests it as sheet goods.
//
// Sizes are metres inside; the panel shows and reads them in the document's units.
import { events, model, storage, ui, units } from "sawhorse";
import { applyPreset, BINS, binRoom, exactThickness, flatImportOp, isMetric, issue, MATERIALS, phrase, plan, normalize, PRESETS, runnerLine, summary } from "./cabinet.js";
import { BUDGET, pack, prune, unpack, validFrame } from "./keep.js";
import { apply, applyVector, BASE_LUMBER, boxesOf, cncLength, edgesOf, ladderPicture, sawStripDefaults, compose, cutRows, IDENTITY, invert, lineUp, lumberDefaults, normalizeBase, placeNext, planBase, rightOf, rowLayout, rowOf, TOUCH, translation, unturned } from "./row.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("sawhorse").Field} Field */

const metric = () => isMetric(units.system());

/** The settings for a new cabinet (kept for next time). */
let draft = normalize(/** @type {Partial<Sizes> | null} */ (await storage.app.get("sizes")), metric());
/** What the panel shows: the draft, or the selected cabinet's settings. */
let sizes = draft;
/** The cabinet being edited (its instance id), or null for a new one. */
let editing = /** @type {number | null} */ (null);
/** Which group is open ("" for none). */
let view = /** @type {string} */ ((await storage.app.get("view")) ?? "");

/** @typedef {import("./row.js").Frame} Frame */

/** Each cabinet's settings (what differs from the baseline, keep.js) and frame (where its own
 * origin is, in its component's coordinates), by instance id ("n12"), in the document. Old
 * ids stay while there is room, so an undone update finds its cabinet again.
 * @typedef {import("./keep.js").Kept} Kept */
const CABINETS = "cabinets";
async function cabinets() {
  const all = await storage.document.get(CABINETS);
  return /** @type {Record<string, Kept>} */ (all && typeof all === "object" && !Array.isArray(all) ? all : {});
}
/** The keys ("n12") of every group and instance in the model: entries for them are kept. */
async function liveKeys() {
  return new Set((await model.nodes()).map((n) => `n${n.id}`));
}
/** Keep a cabinet's settings and frame. Rejects when the document's store is full even after
 * the entries for cabinets no longer in the model went: the caller says so, as a warning.
 * @param {number} id @param {Sizes} s @param {Frame} frame */
async function remember(id, s, frame) {
  const all = await cabinets();
  delete all[`n${id}`];
  all[`n${id}`] = { ...pack(s, metric()), frame };
  await storage.document.set(CABINETS, prune(all, await liveKeys(), BUDGET.cabinets));
}
/** Keep it, and say so if it cannot be kept (the cabinet is made either way). @param {number} id @param {Sizes} s @param {Frame} frame */
async function rememberOrWarn(id, s, frame) {
  try {
    await remember(id, s, frame);
    return true;
  } catch (e) {
    await ui.notify(`${s.name} is made, but its settings could not be kept in the document (${e instanceof Error ? e.message : String(e)}): it will not be edited as a cabinet. Delete cabinets you no longer need, or save and reopen.`, { kind: "warning" });
    return false;
  }
}

/** A store record read from the document, or an empty one. @param {unknown} v */
const record = (v) => /** @type {Record<string, any>} */ (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * Everything a sync reads, read once and together (the calls go out at once): the groups and
 * instances, the selection (each item as the node it starts from), the open context, and what
 * is kept in the document. A sync used to ask for the whole node list three times and the
 * store five times for each click.
 * @typedef {{ nodes: import("sawhorse").Node[], byId: Map<number, import("sawhorse").Node>, starts: (number | null)[], context: number | null, cabinets: Record<string, Kept>, bases: Record<string, any>, last: number | null, legacy: number | null }} Snapshot
 * @returns {Promise<Snapshot>}
 */
async function snapshot() {
  const [nodes, sel, doc, cabs, bs, last, legacy] = await Promise.all([
    model.nodes(),
    model.selection(),
    model.document(),
    storage.document.get(CABINETS),
    storage.document.get(BASES),
    storage.document.get(LAST),
    storage.document.get("cabinet"),
  ]);
  // A solid or a face selected starts from the group or instance it is in.
  const starts = await Promise.all(
    sel.map(async (it) => {
      if (it.kind === "instance" || it.kind === "group") return it.id;
      if (it.kind === "solid") return (await model.solid(it.id))?.parent ?? null;
      if (it.kind === "face") return (await model.solid(it.solid))?.parent ?? null;
      return null;
    }),
  );
  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    starts,
    context: doc.context,
    cabinets: record(cabs),
    bases: record(bs),
    last: typeof last === "number" ? last : null,
    legacy: typeof legacy === "number" ? legacy : null,
  };
}

/** The cabinet of ours the selection is in (or, with nothing selected, the one open for
 * editing), with its settings; null when the selection is anything else.
 * @param {Snapshot} [snap] */
async function focused(snap) {
  const { cabinets: all, legacy, byId, starts, context } = snap ?? (await snapshot());
  // A document from before settings were kept per cabinet names its one cabinet.
  const ours = (/** @type {number} */ id) => all[`n${id}`] !== undefined || id === legacy;
  /** @param {number | null | undefined} id */
  const climb = (id) => {
    for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) if (n.kind === "instance" && ours(n.id)) return n;
    return null;
  };
  /** @type {import("sawhorse").Node | null} */
  let hit = null;
  for (const start of starts) {
    const n = climb(start);
    // Anything else in the selection, or two cabinets: not one cabinet to edit.
    if (!n || (hit && hit.id !== n.id)) return null;
    hit = n;
  }
  if (!starts.length) hit = climb(context);
  // A cabinet made before frames were kept was one assembly: its parts sit at its origin.
  return hit ? { node: hit, sizes: unpack(all[`n${hit.id}`], metric()), frame: validFrame(all[`n${hit.id}`]?.frame) ?? IDENTITY } : null;
}

/** A node's frame in the model: its parents' transforms, outermost first, then its own.
 * @param {Map<number, import("sawhorse").Node>} byId @param {number | null | undefined} id @returns {Frame} */
function worldOf(byId, id) {
  let m = IDENTITY;
  for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) m = compose(/** @type {Frame} */ (n.transform), m);
  return m;
}

/** A cabinet of ours where it stands: its box and its own axes in the model (`world`), its
 * node, settings, kept frame, and its parent's frame in the model.
 * @typedef {import("./row.js").Cab & { node: import("sawhorse").Node, sizes: Sizes, frame: Frame, parent: Frame }} Placed */
/** Every cabinet of ours in the model, and the nodes by id. @param {Snapshot} [snap] */
async function placed(snap) {
  const { cabinets: all, byId } = snap ?? (await snapshot());
  /** @type {Placed[]} */
  const list = [];
  for (const [key, kept] of Object.entries(all)) {
    const node = byId.get(Number(key.slice(1)));
    const s = unpack(kept, metric());
    if (!node || node.kind !== "instance" || !s) continue;
    // A frame that cannot be read (a damaged or hand-made document): its parts sit at its origin.
    const frame = validFrame(kept.frame) ?? IDENTITY;
    const parent = worldOf(byId, node.parent);
    const world = compose(compose(parent, /** @type {Frame} */ (node.transform)), frame);
    list.push({ id: node.id, name: node.name ?? s.name, width: s.width, depth: s.depth, height: s.height, world, node, sizes: s, frame, parent });
  }
  return { list, byId };
}

/** The transform op that moves a cabinet to stand at `world` (in its parent's axes, as ops take it). @param {Placed} c @param {Frame} world */
const moveTo = (c, world) => /** @type {import("sawhorse").Transform} */ (compose(compose(compose(invert(c.parent), world), invert(c.frame)), invert(/** @type {Frame} */ (c.node.transform))));
/** The transform op that slides a node by `v` (model axes). @param {Frame} parent @param {[number, number, number]} v */
const slide = (parent, v) => /** @type {import("sawhorse").Transform} */ (compose(compose(invert(parent), translation(v)), parent));

/** Where a new cabinet goes: against the last cabinet worked on, or apart. Kept for next time.
 * @typedef {import("./row.js").Place | "apart"} PlaceNew */
let place = /** @type {PlaceNew} */ ((await storage.app.get("place")) ?? "right");
let filler = /** @type {number} */ ((await storage.app.get("filler")) ?? (metric() ? 75 * MM : 3 * IN));
/** The cabinet a new one goes against (the one edited, else the last made or edited), named. @type {{ id: number, name: string } | null} */
let anchor = null;
const LAST = "last";

/** The last update sent to each panel, as JSON: one saying nothing new is not sent (most syncs
 * change nothing a panel shows). Forgotten when the panel's body is replaced. */
const lastSent = new Map();
/** @param {import("sawhorse").Panel} p @param {Record<string, Record<string, unknown>>} fields */
async function send(p, fields) {
  const key = JSON.stringify(fields);
  if (lastSent.get(p.id) === key) return;
  lastSent.set(p.id, key);
  await p.update({ fields });
}

/** A drawer box of any kind (drawers, or the trash pull-out). */
const hasDrawers = () => sizes.layout === "drawers" || sizes.layout === "mixed" || sizes.layout === "trash";
const isTrash = () => sizes.layout === "trash";
const hasDoors = () => sizes.layout === "doors" || sizes.layout === "mixed";
const hasShelves = () => sizes.layout === "doors" || sizes.layout === "mixed" || sizes.layout === "shelves";
const drawerHoles = () => sizes.drawerPull === "center" || sizes.drawerPull === "top";

/** The runner lengths of the chosen runner and catalogue, with Automatic first. */
const runnerOptions = () => [
  { value: "0", label: "Automatic: longest that fits" },
  ...runnerLine(sizes).lengths.map((r) => ({ value: String(r.nl), label: `${r.nl} mm${sizes.catalog === "us" ? ` (${Math.round(r.nl / 25.4)} in)` : ""} · ${r.part}` })),
];
/** "Base 1" -> "Base 2"; a name without a number at its end stays. @param {string} name */
const nextName = (name) => name.replace(/(\d+)$/, (d) => String(Number(d) + 1));
/** Panel values into sizes: a select's value is text, and two selects stand for two settings. @param {Record<string, unknown>} values */
const read = (values) => {
  const v = { ...values };
  if (typeof v.runner === "string") v.runner = Number(v.runner) || 0;
  // Blum's boring distance is in millimetres whatever the document's units.
  if (typeof v.cupDistance === "string") v.cupDistance = Number(v.cupDistance) * MM;
  if (v.joinery === "dado" || v.joinery === "butt") v.dados = v.joinery === "dado";
  if (v.backType === "groove" || v.backType === "butt") Object.assign(v, { back: true, backMount: v.backType });
  else if (v.backType === "none") v.back = false;
  for (const k of ["preset", "view", "joinery", "backType", "place", "filler", ...SECTIONS.map((x) => x.id)]) delete v[k];
  return normalize({ ...sizes, .../** @type {Partial<Sizes>} */ (v) }, metric());
};

/** @param {string} id @param {string} label @param {number} value */
const len = (id, label, value) => /** @type {Field} */ ({ type: "number", id, label, unit: "length", value, min: 0 });
/** @param {string} id @param {string} label @param {string} value @param {[string, string][]} options */
const pick = (id, label, value, options) => /** @type {Field} */ ({ type: "select", id, label, value, options: options.map(([v, l]) => ({ value: v, label: l })) });
/** One line of help under a field. @param {string} text */
const help = (text) => /** @type {Field} */ ({ type: "note", text, tone: "info" });
/** A small heading inside a group, in capitals so it reads apart from help. @param {string} text */
const heading = (text) => /** @type {Field} */ ({ type: "note", text: text.toUpperCase() });

const f = (/** @type {number} */ m) => units.format(m);
const stock = (/** @type {number} */ m) => exactThickness(m, metric()).replace(/ (in|mm)$/, "");

/** The panel's groups, in a cabinet shop's order. Each says what is in it while closed. */
const SECTIONS = [
  { id: "secSize", label: "1 · Size", applies: () => true, summary: () => `${f(sizes.width)} × ${f(sizes.height)} × ${f(sizes.depth)} · ${sizes.base === "toekick" ? `${f(sizes.toeKick)} toe kick` : "no toe kick"}` },
  {
    id: "secLayout",
    label: "2 · Layout",
    applies: () => true,
    summary: () => {
      const s = sizes;
      const shelves = s.shelves ? `${s.shelves} ${s.shelfType === "adjustable" ? "adjustable" : "fixed"} ${s.shelves === 1 ? "shelf" : "shelves"}` : "no shelves";
      const drawers = `${s.drawers} ${s.drawers === 1 ? "drawer" : "drawers"}`;
      if (s.layout === "doors") return `Doors · ${shelves}`;
      if (s.layout === "shelves") return `Open · ${shelves}`;
      if (s.layout === "drawers") return `${drawers} · ${s.drawerFronts === "graduated" ? `${f(s.drawerFront)} top, rest equal` : "equal fronts"}`;
      if (s.layout === "mixed") return `${drawers} over a door · ${shelves}`;
      return `Trash · ${s.trashBins === "one" ? "one bin" : s.trashBins === "side" ? "two side by side" : "two front to back"} · ${s.bin === "custom" ? "measured bins" : BINS[s.bin].label.replace("Rev-A-Shelf ", "")}`;
    },
  },
  {
    id: "secFronts",
    label: "3 · Fronts and pulls",
    applies: () => sizes.layout !== "shelves",
    summary: () => `${sizes.front === "overlay" ? "Full overlay" : "Inset"} · ${f(sizes.gap)} gaps${hasDoors() ? ` · hinged ${sizes.doors === "two" ? "both sides" : sizes.hingeSide}` : ""}`,
  },
  {
    id: "secMaterials",
    label: "4 · Materials",
    applies: () => true,
    summary: () => [`${stock(sizes.thickness)} carcass`, ...(hasDrawers() ? [`${stock(sizes.frontThickness)} faces`, `${stock(sizes.drawerThickness)} boxes`] : []), `${stock(sizes.backThickness)} back`].join(" · "),
  },
  {
    id: "secBuild",
    label: "5 · Construction",
    applies: () => true,
    summary: () => [sizes.dados ? "Blind dados" : "Butt joints", !sizes.back ? "no back" : sizes.backMount === "groove" ? "back in a groove" : "back between the sides", sizes.top === "stretchers" ? "stretchers" : "full top", ...(sizes.nailers !== "none" ? ["nailers"] : [])].join(" · "),
  },
  {
    id: "secHardware",
    label: "6 · Hardware",
    applies: () => sizes.layout !== "shelves" || sizes.shelfType === "adjustable",
    summary: () => [sizes.hardware ? "Holes drilled" : "No hardware holes", ...(hasDrawers() ? [runnerLine(sizes).name] : []), ...(hasDoors() ? ["Blum CLIP top"] : [])].join(" · "),
  },
  { id: "secCnc", label: "7 · CNC", applies: () => true, summary: () => `${exactThickness(sizes.bit, metric())} bit · ${exactThickness(sizes.fit, metric())} joint clearance` },
  { id: "secCuts", label: "8 · Cuts and holes", applies: () => true, summary: () => "Every cut and hole, and how it is made" },
];

/** The fields of the open group. @returns {Field[]} */
function details() {
  const s = sizes;
  /** @type {Field[]} */
  const out = [];
  if (view === "secSize") {
    out.push(len("width", "Width", s.width), len("height", "Height", s.height), len("depth", "Depth", s.depth));
    out.push(pick("base", "Toe kick", s.base, [["toekick", "Notched into the sides"], ["none", "None (on a separate base)"]]));
    if (s.base === "toekick") out.push(len("toeKick", "Kick height", s.toeKick), len("toeSetback", "Kick setback", s.toeSetback));
    out.push(help("Height includes the toe kick. Depth is the box, without the doors."));
  } else if (view === "secLayout") {
    out.push(pick("layout", "Style", s.layout, [["doors", "Doors and shelves"], ["drawers", "Drawers"], ["mixed", "Drawers over a door"], ["trash", "Trash pull-out"], ["shelves", "Open shelves"]]));
    if (hasShelves()) {
      out.push({ type: "number", id: "shelves", label: "Shelves", unit: "count", value: s.shelves, min: 0, max: 20 });
      if (s.shelves) out.push(pick("shelfType", "Shelf type", s.shelfType, [["adjustable", "Adjustable, on 5 mm pins"], ["fixed", "Fixed, in dados"]]));
    }
    if (s.layout === "drawers" || s.layout === "mixed") out.push({ type: "number", id: "drawers", label: "Drawers", unit: "count", value: s.drawers, min: 0, max: 8 });
    if (s.layout === "drawers") out.push(pick("drawerFronts", "Drawer heights", s.drawerFronts, [["equal", "All equal"], ["graduated", "Short top drawer, rest equal"]]));
    if (s.layout === "mixed" || (s.layout === "drawers" && s.drawerFronts === "graduated")) out.push(len("drawerFront", s.layout === "mixed" ? "Drawer face height" : "Top face height", s.drawerFront));
    if (hasDoors()) {
      out.push(pick("doors", "Doors", s.doors, [["auto", "Automatic: a pair over 24 in"], ["one", "Single"], ["two", "Double"]]));
      if (s.doors !== "two") out.push(pick("hingeSide", "Hinge side", s.hingeSide, [["left", "Left"], ["right", "Right"]]));
    }
    if (isTrash()) {
      out.push(pick("trashBins", "Bins", s.trashBins, [["deep", "Two, front to back"], ["side", "Two, side by side"], ["one", "One"]]));
      out.push(pick("bin", "Bin", s.bin, [...Object.entries(BINS).map(([k, b]) => /** @type {[string, string]} */ ([k, b.label])), ["custom", "Other: measure it"]]));
      if (s.bin === "custom") {
        out.push(len("binWidth", "Cutout, side to side", s.binWidth), len("binLength", "Cutout, front to back", s.binLength), len("binHeight", "Frame height", s.binHeight));
        const room = binRoom(s, metric());
        out.push(help(`Measure the bin just under its rim for the cutout, and the rim's height with the bin standing on the floor for the frame.${room ? ` This cabinet takes cutouts up to ${f(room.across)} × ${f(room.deep)}.` : ""}`));
      } else {
        const b = BINS[s.bin];
        out.push(help(`Each bin hangs by its rim in a cutout sized from Rev-A-Shelf's drawing (${b.cut[0]} × ${b.cut[1]} in minimum opening), its bottom 1/4 in off the tray floor. Other brands differ: pick Other and measure.`));
      }
      out.push(len("trayHeight", "Tray side height", s.trayHeight));
    }
  } else if (view === "secFronts") {
    out.push(pick("front", "Mounting", s.front, [["overlay", "Full overlay"], ["inset", "Inset"]]), len("gap", "Reveal gap", s.gap));
    out.push(help(s.front === "overlay" ? "Gap between fronts; half of it at the cabinet's edges." : "Gap all round each front, inside the opening."));
    if (hasDoors()) {
      out.push(heading("Door pull"));
      out.push(pick("doorPull", "Pull", s.doorPull, [["vertical", "Vertical"], ["horizontal", "Horizontal"], ["none", "None"]]));
      if (s.doorPull !== "none") {
        out.push(pick("doorPullFrom", "Measure from", s.doorPullFrom, [["top", "Top (base cabinets)"], ["bottom", "Bottom (wall cabinets)"]]));
        out.push(len("doorPullEnd", s.doorPullFrom === "top" ? "From the top" : "From the bottom", s.doorPullEnd), len("doorPullEdge", "From the edge", s.doorPullEdge), len("doorPullSpacing", "Hole spacing", s.doorPullSpacing));
        out.push(help("To the nearer hole, on the edge away from the hinges. Spacing is centre to centre."));
      }
    }
    if (hasDrawers()) {
      out.push(heading("Drawer pull"));
      out.push(pick("drawerPull", "Pull", s.drawerPull, [["center", "Centred"], ["top", "Near the top"], ["notch", "Finger notch"], ["none", "None"]]));
      if (s.drawerPull === "notch") out.push(len("notchWidth", "Notch width", s.notchWidth), len("notchDepth", "Notch depth", s.notchDepth));
      else if (drawerHoles()) {
        if (s.drawerPull === "top") out.push(len("drawerPullFromTop", "From the top", s.drawerPullFromTop));
        out.push(len("pullSpacing", "Hole spacing", s.pullSpacing));
      }
    }
    if ((hasDoors() && s.doorPull !== "none") || (hasDrawers() && drawerHoles())) {
      out.push(len("pullHole", "Pull hole", s.pullHole));
      if (!s.hardware) out.push(help("Pull holes are drilled when Hardware > Drill holes is on."));
    }
  } else if (view === "secMaterials") {
    out.push(len("thickness", hasDoors() ? "Carcass, doors" : "Carcass", s.thickness));
    if (hasDrawers()) out.push(len("frontThickness", "Drawer faces", s.frontThickness), len("drawerThickness", "Drawer boxes", s.drawerThickness));
    out.push(len("backThickness", hasDrawers() ? "Back, bottoms" : "Back", s.backThickness));
    out.push(help(`Measure each sheet: every joint is cut to it. "3/4" plywood is usually 23/32. For a 4 × 4 bed: Nesting › Stock › Use 4 × 4 plywood.`));
    out.push(heading("Grain"));
    if (hasDoors() || isTrash()) out.push(pick("grainDoors", isTrash() ? "Pull-out front" : "Doors", s.grainDoors, [["vertical", "Vertical"], ["horizontal", "Across"]]));
    if (hasDrawers() && !isTrash()) out.push(pick("grainFronts", "Drawer faces", s.grainFronts, [["horizontal", "Across"], ["vertical", "Vertical"]]));
    out.push(pick("grainSides", "Sides", s.grainSides, [["vertical", "Vertical"], ["any", "Free to turn"]]));
    out.push(pick("grainHidden", "Inside parts", s.grainHidden, [["any", "Free to turn"], ["length", "Along their length"]]));
    out.push(help("Free to turn lets nesting rotate a part to save plywood: the bottom, stretchers, back, toe kick, nailers and drawer boxes. Shelves always run along their span, where plywood is stiffest."));
  } else if (view === "secBuild") {
    out.push(pick("joinery", "Joinery", s.dados ? "dado" : "butt", [["dado", "Blind dados"], ["butt", "Butt joints"]]));
    if (s.dados) {
      out.push(len("dadoDepth", "Dado depth", s.dadoDepth), len("dadoStop", "Dado stop", s.dadoStop));
      out.push(help("Dados stop short of the front so they don't show; the rails are notched to match."));
    }
    out.push(pick("top", "Top", s.top, [["full", "Full panel"], ["stretchers", "Two stretchers"]]));
    if (s.top === "stretchers") out.push(len("stretcher", "Stretcher width", s.stretcher), help("Front and rear, under the countertop: open for a sink."));
    out.push(pick("backType", "Back", !s.back ? "none" : s.backMount, [["groove", "In a groove"], ["butt", "Between the sides"], ["none", "None"]]));
    if (s.back && s.backMount === "groove") {
      out.push(len("backGrooveDepth", "Groove depth", s.backGrooveDepth), len("backInset", "Back inset", s.backInset));
      out.push(help("How far the groove sits in from the rear edge."));
    }
    out.push(pick("nailers", "Rear nailers", s.nailers, [["none", "None"], ["top", "Top"], ["both", "Top and bottom"]]));
    if (s.nailers !== "none") out.push(len("nailerHeight", "Nailer height", s.nailerHeight), help("Boards behind the back, to screw the cabinet to the wall."));
  } else if (view === "secHardware") {
    out.push({ type: "checkbox", id: "hardware", label: "Drill hinge, runner and pull holes", value: s.hardware });
    if (hasDrawers()) {
      out.push(heading("Drawer runners"));
      out.push(pick("slides", "Runners", s.slides, [["tandem", "Blum TANDEM"], ["movento", "Blum MOVENTO"]]));
      out.push(pick("catalog", "Catalogue", s.catalog, [["us", "Blum Inc. (US, inch lengths)"], ["eu", "Blum Europe (mm lengths)"]]));
      out.push({ type: "select", id: "runner", label: "Length", value: String(s.runner), options: runnerOptions() });
    }
    if (hasDoors()) {
      out.push(heading("Hinges"));
      out.push(len("hingeInset", "From top, bottom", s.hingeInset));
      const k = String(Math.round((s.cupDistance / MM) * 2) / 2);
      const ks = ["3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7"];
      out.push(pick("cupDistance", "Boring distance", k, (ks.includes(k) ? ks : [...ks, k]).map((x) => [x, `${x} mm${x === "5" ? " · 16 mm overlay" : ""}`])));
      out.push(help("The cup's edge to the door's edge. Cuts and holes compares the overlay it gives with your door's."));
    }
    if (s.shelfType === "adjustable" && hasShelves() && s.shelves) out.push(heading("Shelf pins"), help("5 mm holes, 10 deep, in rows 37 mm from the front and the back, 32 mm apart: five around each shelf. Drilled whenever shelves are adjustable."));
  } else if (view === "secCnc") {
    out.push(len("bit", "Bit diameter", s.bit), len("fit", "Joint clearance", s.fit));
    out.push(help("Clearance is added to every dado and groove over the stock. Grooves and holes smaller than the bit are listed in Cuts and holes, for a smaller bit."));
    out.push(help("To cut: Nesting › CNC spacing, then CNC files for a DXF per sheet."));
  } else if (view === "secCuts") {
    out.push({ type: "table", id: "holes", columns: ["Part", "What", "Hole", "Depth", "How"], rows: [], align: ["left", "left", "right", "right", "left"] });
  }
  return out;
}

/** The whole panel for the sizes and the open group. @returns {Field[]} */
function body() {
  /** @type {Field[]} */
  const out = [
    {
      type: "select",
      id: "preset",
      label: "Start from",
      value: "",
      options: [{ value: "", label: "Choose a cabinet..." }, ...PRESETS.map((p) => ({ value: p.id, label: p.label }))],
    },
    { type: "text", id: "name", label: "Name", value: sizes.name, placeholder: "Sink base 1" },
  ];
  if (anchor) {
    const by = anchor.name;
    out.push(
      pick("place", editing === null ? "Place" : "Place a copy", place, [
        ["right", `Right of ${by}, at its row's end`],
        ["left", `Left of ${by}, at its row's start`],
        ["cornerRight", `Around the corner, right of ${by}'s row`],
        ["cornerLeft", `Around the corner, left of ${by}'s row`],
        ["apart", "Apart, beside the model"],
      ]),
    );
    if (place === "cornerRight" || place === "cornerLeft") out.push(len("filler", "Corner filler", filler), help("From the corner cabinet's carcass front to the new one's side, for its doors and pulls to clear; a filler strip covers it."));
  }
  for (const sec of SECTIONS) {
    if (!sec.applies()) continue;
    out.push({ type: "section", id: sec.id, label: sec.label, summary: sec.summary(), value: view === sec.id });
    if (view === sec.id) out.push(...details());
  }
  out.push({ type: "button", id: "generate", label: "Generate cabinet", primary: true }, { type: "note", id: "status", text: "" }, { type: "note", id: "summary", text: "" });
  return out;
}

/** The ids the panel shows now, to rebuild it only when they change. */
let shown = "";
const idsOf = (/** @type {Field[]} */ fields) => fields.map((x) => ("id" in x && x.id ? `${x.id}:${x.type === "select" ? x.options.map((o) => o.value).join("|") : ""}` : "")).join(",");

/** Rebuild the panel when what it shows changes, then say what Generate will do. */
async function refresh() {
  const b = body();
  const ids = idsOf(b);
  if (ids !== shown) {
    shown = ids;
    lastSent.delete("cabinet");
    await panel.setBody(b);
  }
  await explain();
}

const panel = await ui.registerPanel({
  id: "cabinet",
  title: "Cabinet",
  body: body(),
  onChange: (id, values) => {
    // A group's heading: open it (closing the one that was), or close it.
    if (SECTIONS.some((x) => x.id === id)) {
      view = values[id] ? id : "";
      void storage.app.set("view", view);
      return refresh();
    }
    // Where the next cabinet goes: not a setting of this one.
    if (id === "place" || id === "filler") {
      if (id === "place") place = /** @type {PlaceNew} */ (String(values.place));
      else if (typeof values.filler === "number" && values.filler >= 0) filler = values.filler;
      void storage.app.set(id, id === "place" ? place : filler);
      shown = "";
      return refresh();
    }
    const before = sizes;
    if (id === "preset") {
      const p = String(values.preset ?? "");
      if (!p) return;
      sizes = applyPreset(read(values), p, metric());
      // Its values are new: rebuild with them.
      shown = "";
    } else {
      sizes = read(values);
      // Another runner has other lengths: back to Automatic.
      if ((id === "slides" || id === "catalog") && sizes.runner && !runnerLine(sizes).lengths.some((r) => r.nl === sizes.runner)) sizes = { ...sizes, runner: 0 };
      // Fields whose label or options name another choice are rebuilt with it.
      if (["doorPullFrom", "layout", "slides", "catalog", "front", "trashBins", "shelves", "drawerFronts", "top", "backType", "joinery", "nailers", "base", "drawerPull", "doorPull", "doors"].includes(id) || before.runner !== sizes.runner) shown = "";
    }
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    if (editing === null) {
      draft = sizes;
      void storage.app.set("sizes", sizes);
    } else liveUpdate();
    return refresh();
  },
  onAction: (id, values) => {
    if (id !== "generate") return;
    sizes = read(values);
    return generate("new");
  },
});
shown = idsOf(body());

/** Keep the note, the summary and the button saying what Generate will do. */
async function explain() {
  const wrong = issue(sizes, metric());
  const what = phrase(sizes, units.format, metric());
  const planned = wrong ? null : plan(sizes, metric());
  /** @type {Record<string, Record<string, unknown>>} */
  const fields = {
    generate: { label: editing === null ? "Generate cabinet" : "Add another like this", disabled: !!wrong },
    status: wrong
      ? { text: editing === null ? wrong : `${wrong} The cabinet keeps its last good build.`, tone: "warning" }
      : editing === null
        ? { text: `Adds ${sizes.name}: ${what}${anchor && place !== "apart" ? `, ${place === "right" ? "right of" : place === "left" ? "left of" : "around the corner from"} ${anchor.name}'s row` : ""}.`, tone: "info" }
        : { text: `Editing ${sizes.name}: changes apply as you make them (Ctrl+Z undoes each). Click empty space for a new cabinet.`, tone: "info" },
    summary: { text: planned ? summary(sizes, planned, metric()) : "" },
  };
  // Each group's heading says what is in it now.
  for (const sec of SECTIONS) if (sec.applies()) fields[sec.id] = { summary: sec.summary() };
  if (view === "secCuts") fields.holes = { rows: planned ? planned.rows : [] };
  await send(panel, fields);
}

/** The sync running now, and whether another was asked for while it ran. */
let syncing = /** @type {Promise<void> | null} */ (null);
let syncAgain = false;
/**
 * The selection moved or the model changed: bring both panels up to date. One at a time: the
 * events come in bursts (a rebuild is a selection change and a document change), and two
 * syncs reading the model at once could finish out of order, the older one last, leaving the
 * panel saying what was true before (a row changed under its base frame, shown unchanged).
 * One asked for while one runs makes one more run after it, with the model as it is then.
 */
function sync() {
  // A cabinet or frame being made: it syncs when it is done, and once more after that.
  if (holds) {
    syncAgain = true;
    return Promise.resolve();
  }
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        syncAgain = false;
        await syncOnce();
      } while (syncAgain);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Changes to the model under way (a cabinet or frame made, cabinets lined up). */
let holds = 0;
/**
 * Make a change with no sync in the middle of it: a sync that read the model between the
 * batch and the settings kept for it saw a cabinet with no settings, took it for someone
 * else's, and put the new-cabinet draft in the panel, which the update then kept (a cabinet
 * edited live came out named and sized as the next new one). Waits for a sync running now;
 * syncs asked for meanwhile run once, after.
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function exclusive(fn) {
  holds++;
  try {
    while (syncing) await syncing;
    return await fn();
  } finally {
    holds--;
    if (!holds && syncAgain) void sync();
  }
}

/** Edit the cabinet the selection is in, or go back to a new one; then the rows panel. */
async function syncOnce() {
  const snap = await snapshot();
  const f = await focused(snap);
  const id = f ? f.node.id : null;
  // The cabinet a new one goes against: this one, else the last one made or edited (kept in
  // the document only when one is made or rebuilt: a click writes nothing).
  if (id !== null) lastId = id;
  const was = anchor;
  anchor = anchorCabinet(id, snap);
  // The Place labels name it: redraw only when that changes. A rebuilt cabinet has a new id
  // and the same name; redrawing then would throw away what is being typed in the panel.
  if (!!was !== !!anchor || was?.name !== anchor?.name) shown = "";
  if (id !== editing) {
    editing = id;
    sizes = f ? (f.sizes ?? sizes) : draft;
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    shown = "";
    await refresh();
  } else await refresh();
  await rowsSync(snap);
}

/** The cabinet selected or worked on last in this session (the document keeps the last made). */
let lastId = /** @type {number | null} */ (null);

/** The cabinet a new one goes against, if it is still in the model.
 * @param {number | null} editingId @param {Snapshot} snap */
function anchorCabinet(editingId, snap) {
  for (const id of [editingId, lastId, snap.last]) {
    if (id == null || !snap.cabinets[`n${id}`]) continue;
    const n = snap.byId.get(id);
    if (n) return { id, name: n.name ?? unpack(snap.cabinets[`n${id}`], metric())?.name ?? "the last cabinet" };
  }
  return null;
}

/** Each material a batch adds, once: those the model lacks (so a stock chosen for one is kept). */
async function materialsToAdd() {
  const have = new Set((await model.materials()).map((m) => m.name));
  return (/** @type {{ name: string, color: [number, number, number, number] }[]} */ list) => {
    const out = list.filter((m) => !have.has(m.name));
    for (const m of out) have.add(m.name);
    return out;
  };
}

/** Add parts to a batch at `frame`, each part's grain set through its first copy; returns the
 * copies, to wrap into a component. @param {import("sawhorse").Batch} batch
 * @param {import("./cabinet.js").Part[]} parts @param {Frame} frame
 * @param {{ name: string, color: [number, number, number, number] }[]} materials */
function addParts(batch, parts, frame, materials) {
  const imported = batch.op(flatImportOp(parts, frame, materials));
  /** @type {import("sawhorse").Item[]} */
  const items = [];
  let k = 0;
  for (const part of parts) {
    const first = imported.get(`groups.${k}`);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: imported.get(`groups.${k++}`) });
    // "length" is every part's grain until said otherwise.
    if (part.grain !== "length") batch.op({ op: "set_grain", part: { node: first }, grain: part.grain });
  }
  return items;
}

/** The open group or component's frame in the model (where new parts are made). */
async function contextFrame() {
  const ctx = (await model.document()).context;
  if (ctx == null) return IDENTITY;
  return worldOf(new Map((await model.nodes()).map((n) => [n.id, n])), ctx);
}

let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
let building = false;
let again = false;
/** Rebuild the cabinet being edited a moment after the last change (one rebuild at a time). */
function liveUpdate() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (building) {
      again = true;
      return;
    }
    building = true;
    try {
      if (editing !== null && !issue(sizes, metric())) await generate("update");
    } catch (e) {
      await ui.notify(`Could not update the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    } finally {
      building = false;
      if (again) {
        again = false;
        liveUpdate();
      }
    }
  }, 250);
}

/**
 * Make the cabinet: a new one beside the model, or the edited one again in its place. One
 * batch, one undo step: the parts at the top level (so each part's grain is set through its
 * instance), then wrapped into the cabinet's component. A cabinet open for editing (double-
 * clicked) is rebuilt from inside instead: new parts in, old parts out, the same cabinet.
 * @param {"new" | "update"} mode
 */
function generate(mode = /** @type {"new" | "update"} */ ("new")) {
  return exclusive(() => generateNow(mode));
}

/** @param {"new" | "update"} mode */
async function generateNow(mode) {
  const planned = plan(sizes, metric());
  if (planned.error) {
    await ui.notify(planned.error, { kind: "warning" });
    return;
  }
  const f0 = mode === "update" ? await focused() : null;
  const own = f0 && f0.node.id === editing ? f0.node : null;
  if (mode === "update" && !own) return;
  const inside = !!own && (await model.document()).context === own.id;
  const name = mode === "new" && editing !== null ? nextName(sizes.name) : sizes.name;
  const made = { ...sizes, name };
  const f = units.format;
  const label = `${name} ${f(made.width)} x ${f(made.height)} x ${f(made.depth)}`;
  const batch = model.batch(own ? "Update cabinet" : "Generate cabinet");
  /** Where the cabinet's origin goes, in the coordinates the new parts are made in. @type {Frame} */
  let frame;
  /** Where a new cabinet went against another: the way its row goes on from there. @type {PlaceNew | null} */
  let turned = null;
  if (own && f0) {
    frame = inside ? f0.frame : compose(/** @type {Frame} */ (own.transform), f0.frame);
    const old = f0.sizes;
    if (old) {
      // A deeper or shallower box keeps its back where it was: on the wall.
      if (Math.abs(old.depth - made.depth) > 1e-9) frame = compose(frame, translation([0, old.depth - made.depth, 0]));
      // A wider or narrower one moves the cabinets right of it in its row along with its side.
      const dw = made.width - old.width;
      if (Math.abs(dw) > 1e-9) {
        const { list } = await placed();
        const me = list.find((c) => c.id === own.id);
        if (me) for (const c of rightOf(list, own.id)) batch.transform([{ node: c.id }], slide(c.parent, applyVector(me.world, [dw, 0, 0])));
      }
    }
  } else {
    const { list } = await placed();
    const at = anchor && place !== "apart" ? list.find((c) => c.id === anchor?.id) : undefined;
    if (at && place !== "apart") {
      // Against the anchor's row, at the end the place names.
      const row = rowOf(list, at.id);
      const end = place === "right" || place === "cornerRight" ? row[row.length - 1] : row[0];
      frame = compose(invert(await contextFrame()), placeNext(end, made, place, filler));
      if (place === "cornerRight") turned = "right";
      else if (place === "cornerLeft") turned = "left";
    } else {
      const b = await model.bounds();
      frame = { ...IDENTITY, translation: b ? [b.max[0] + (metric() ? 50 * MM : 2 * IN), b.min[1], 0] : [0, 0, 0] };
    }
  }
  const items = addParts(batch, planned.parts, frame, (await materialsToAdd())(Object.values(MATERIALS)));
  // The old parts or the old cabinet go last: deleted first, their ids would be free for the
  // new parts, and the batch would number them differently from the same ops one by one.
  /** @type {import("sawhorse").Ref | null} */
  let cabinet = null;
  if (inside && own) {
    // Gathered into one group and deleted with it: one deletion inside an open component is
    // far quicker than one per part.
    const old = (await model.nodes()).filter((n) => n.parent === own.id).map((n) => ({ node: n.id }));
    if (old.length) {
      const g = batch.op({ op: "make_group", items: old });
      batch.op({ op: "delete_node", node: g.get("group") });
    }
  } else {
    cabinet = batch.makeComponent(items, label);
    batch.rename({ node: cabinet.node }, name);
    if (own) batch.delete({ node: own.id });
  }
  try {
    const result = await batch.commit();
    const id = cabinet ? /** @type {number} */ (result.value(cabinet.node)) : /** @type {number} */ (own?.id);
    // A new component's own coordinates are the model's: its origin is where the parts went.
    await rememberOrWarn(id, made, frame);
    if (own) {
      editing = id;
      // Rebuilt, it has a new id: new cabinets still go against it.
      lastId = id;
      await storage.document.set(LAST, id);
    } else {
      // The next new cabinet gets the next number ("Base 1", then "Base 2"), and goes against this one.
      draft = { ...made, name: nextName(name) };
      void storage.app.set("sizes", draft);
      lastId = id;
      await storage.document.set(LAST, id);
      // Around a corner, the row goes on down the new wall: right of a right turn, left of a left one.
      if (turned) {
        place = turned;
        void storage.app.set("place", place);
      }
    }
    // Selected and the panels up to date before it says so: a click on empty space after the
    // message is never undone by the selection landing after it.
    if (cabinet) await model.select([{ kind: "instance", id }]);
    await syncOnce();
    if (!own) {
      const list = planned.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
      await ui.notify(`Made ${name}: ${list}. It is selected, so changes now apply to it; click empty space for a new cabinet.`);
    }
  } catch (e) {
    await ui.notify(`Could not ${own ? "update" : "make"} the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    await syncOnce();
  }
}

// --- rows and base frames -------------------------------------------------------------------
//
// A second panel. Select a cabinet: it names the row the cabinet stands in (cabinets side by
// side, backs in line) and plans the base frame for it, with its cut list; select several to
// line them up. Select a base frame: its own settings, every change rebuilding it in place.

/** @typedef {import("./row.js").BaseSizes} BaseSizes */
/** Each base frame's settings and frame (as a cabinet's), the row it was made for (its
 * length, depth and fingerprint), by instance id, in the document.
 * @typedef {{ sizes: Partial<BaseSizes>, frame: Frame, length: number, depth: number, fit: string }} KeptBase */
const BASES = "bases";
async function bases() {
  const all = await storage.document.get(BASES);
  return /** @type {Record<string, KeptBase>} */ (all && typeof all === "object" && !Array.isArray(all) ? all : {});
}
/** @param {number} id @param {KeptBase} kept */
async function rememberBase(id, kept) {
  const all = await bases();
  delete all[`n${id}`];
  all[`n${id}`] = kept;
  await storage.document.set(BASES, prune(all, await liveKeys(), BUDGET.bases));
}

/** A base frame of ours where it stands. @typedef {{ id: number, node: import("sawhorse").Node, sizes: BaseSizes, world: Frame, kept: KeptBase }} PlacedBase */
/** @param {Map<number, import("sawhorse").Node>} byId @param {Snapshot} [snap] */
async function placedBases(byId, snap) {
  /** @type {PlacedBase[]} */
  const out = [];
  for (const [key, kept] of Object.entries(snap ? snap.bases : await bases())) {
    const node = byId.get(Number(key.slice(1)));
    if (!node || node.kind !== "instance" || !kept || typeof kept !== "object") continue;
    // Read with suspicion: a frame, a length and a depth, or it is not one of ours.
    const frame = validFrame(kept.frame);
    if (!frame || !(kept.length > 0 && Number.isFinite(kept.length)) || !(kept.depth > 0 && Number.isFinite(kept.depth))) continue;
    const world = compose(compose(worldOf(byId, node.parent), /** @type {Frame} */ (node.transform)), frame);
    out.push({ id: node.id, node, sizes: normalizeBase(kept.sizes, metric()), world, kept: { ...kept, frame, fit: typeof kept.fit === "string" ? kept.fit : "" } });
  }
  return out;
}

/** A cabinet stands on a base frame: turned its way, its bottom on the frame's top, its back
 * on the frame's back line, and over the frame's length. @param {PlacedBase} base @param {Placed} c */
function standsOn(base, c) {
  const r = compose(invert(base.world), c.world);
  if (!unturned(r)) return false;
  const [x, y, z] = r.translation;
  return Math.abs(z - base.sizes.height) < TOUCH && Math.abs(y + c.depth - base.kept.depth) < TOUCH && x < base.kept.length - TOUCH && x + c.width > TOUCH;
}

/** Where a row's joints are, its length and depth: to tell when it changed under its frame. @param {Placed[]} row */
const fingerprint = (row) => {
  const { starts, length, depth } = rowLayout(row);
  return [...starts, length, depth].map((v) => Math.round(v / TOUCH)).join(",");
};

/** What the rows panel shows: nothing of ours; a row (from a selected cabinet); or a base frame.
 * @typedef {{ kind: "none" } | { kind: "row", row: Placed[], selected: Placed[], base: PlacedBase | null } | { kind: "base", base: PlacedBase, row: Placed[] }} RowView */
/** @type {RowView} */
let rowView = { kind: "none" };
/** The base frame settings for a new frame (kept for next time). */
let baseDraft = normalizeBase(/** @type {Partial<BaseSizes> | null} */ (await storage.app.get("base")), metric());
/** What the fields show: the draft, or the selected frame's settings. */
let baseSizes = baseDraft;
/** The plan the rows panel shows now (null: none, or one that cannot be made). @type {ReturnType<typeof planBase> | null} */
let plannedNow = null;
/** The rows panel is registered: until then the selection has nothing to update. */
let rowsReady = false;
/** The preview tool while it is the active tool. @type {import("sawhorse").Tool | null} */
let previewing = null;

/** What the selection is, for the rows panel. @returns {Promise<RowView>} */
async function rowFocus(/** @type {Snapshot} */ snap) {
  const { list, byId } = await placed(snap);
  const frames = await placedBases(byId, snap);
  const ours = (/** @type {number} */ id) => list.some((c) => c.id === id) || frames.some((b) => b.id === id);
  /** @param {number | null | undefined} id */
  const climb = (id) => {
    for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) if (n.kind === "instance" && ours(n.id)) return n.id;
    return null;
  };
  const ids = new Set();
  for (const start of snap.starts) {
    const id = climb(start);
    if (id == null) return { kind: "none" };
    ids.add(id);
  }
  if (!snap.starts.length) {
    const id = climb(snap.context);
    if (id != null) ids.add(id);
  }
  const base = frames.find((b) => ids.has(b.id));
  if (base) {
    const on = list.find((c) => standsOn(base, c));
    return { kind: "base", base, row: on ? rowOf(list, on.id) : [] };
  }
  const selected = list.filter((c) => ids.has(c.id));
  if (!selected.length) return { kind: "none" };
  const row = rowOf(list, selected[0].id);
  return { kind: "row", row, selected, base: frames.find((b) => row.some((c) => standsOn(b, c))) ?? null };
}

/** The base frame's fields. @param {BaseSizes} b @returns {Field[]} */
function baseFields(b) {
  /** @type {Field[]} */
  const out = [len("height", "Height", b.height), len("setback", "Toe setback", b.setback), len("backInset", "Back inset", b.backInset)];
  out.push(pick("ends", "Ends", b.ends, [["none", "Against walls or cabinets"], ["left", "Left end shows"], ["right", "Right end shows"], ["both", "Both ends show"]]));
  out.push(help("An end that shows is set back like the front, so the toe space turns the corner."));
  out.push(pick("stock", "Stock", b.stock, [["plywood", "Plywood strips (CNC)"], ["saw", "Plywood strips, long rails on the track saw"], ["lumber", "Lumber"]]), len("thickness", "Thickness", b.thickness));
  out.push(pick("joints", "Sleepers", b.joints, [["dado", "In dados in the rails"], ["butt", "Butted between the rails"]]));
  if (b.joints === "dado") out.push(len("dadoDepth", "Dado depth", b.dadoDepth));
  out.push(len("spacing", "Sleepers at most", b.spacing), len("maxLength", "Longest piece", b.maxLength));
  out.push(
    help(
      b.stock === "plywood"
        ? `Sleepers: centre to centre, and one under every joint between cabinets. Longest piece: ${f(cncLength(metric()))} fits a 4 × 4 sheet inside the CNC trim; a longer row is split into ladders at the joints between cabinets. Plywood strips nest with the carcass.`
        : b.stock === "saw"
          ? `Sleepers: centre to centre, and one under every joint between cabinets. Longest piece: ${f(sawStripDefaults(metric()).maxLength)} fits a 4 × 8 inside the track saw's trim. Rails longer than ${f(cncLength(metric()))} are ripped on the track saw (Nesting › Track saw what won't fit); the sleepers stay on the CNC.`
          : "Sleepers: centre to centre, and one under every joint between cabinets. Longest piece: the boards you buy; a longer row is split into ladders at the joints between cabinets.",
    ),
  );
  return out;
}

/** The rows panel for what is selected. @returns {Field[]} */
function rowsBody() {
  const v = rowView;
  /** @type {Field[]} */
  const out = [];
  if (v.kind === "none") {
    out.push({ type: "note", id: "row", text: "Select a cabinet to see its row and plan the base frame it stands on. Select two or more to line them up.", tone: "info" });
    out.push(help("Rows build themselves: Cabinet › Place puts each new cabinet against the last one, its back in line."));
    return out;
  }
  out.push({ type: "note", id: "row", text: "", tone: "info" });
  if (v.kind === "row" && v.selected.length > 1 && rowOf(v.selected, v.selected[0].id).length < v.selected.length) {
    out.push({ type: "button", id: "lineUp", label: "Line up the selected cabinets" }, help("The longest row among them stays put; the others butt against its ends in the order they stand, backs in line, on its floor."));
  }
  if (v.kind === "row" && v.base) {
    out.push({ type: "button", id: "selectBase", label: `Select ${v.base.node.name ?? "its base frame"}` });
    return out;
  }
  out.push(heading("Base frame"), ...baseFields(baseSizes));
  if (v.kind === "row") out.push({ type: "button", id: "makeBase", label: "Put the row on a base frame", primary: true });
  else out.push({ type: "button", id: "refit", label: "Fit to the row again" });
  out.push({ type: "button", id: "previewBase", label: "Show it in the model" });
  out.push({ type: "note", id: "baseStatus", text: "" });
  if (typeof OffscreenCanvas !== "undefined") out.push({ type: "image", id: "ladderPic", src: BLANK_PNG, alt: "The base frame from above, dimensioned", width: 320 });
  out.push({ type: "table", id: "ladderLayout", columns: ["Ladder", "Length", "Sleeper centres from its left end"], rows: [], align: ["left", "right", "left"] });
  out.push(heading("Cut list"), { type: "table", id: "baseCuts", columns: ["Part", "Qty", "Length", "Width", "Thick"], rows: [], align: ["left", "right", "right", "right", "right"] });
  out.push({ type: "note", id: "baseTotal", text: "" });
  out.push({ type: "table", id: "baseNotes", columns: ["Step", "How"], rows: [], align: ["left", "left"] });
  return out;
}

/** Each cabinet's top above the floor once on the frame (a toe kick comes off its box). @param {Placed[]} row @param {BaseSizes} b */
const topsOnFrame = (row, b) => {
  /** @type {Map<number, number>} the first exact top of each, by the half millimetre */
  const tops = new Map();
  for (const c of row) {
    const top = b.height + c.sizes.height - (c.sizes.base === "toekick" ? c.sizes.toeKick : 0);
    if (!tops.has(Math.round(top / TOUCH))) tops.set(Math.round(top / TOUCH), top);
  }
  return [...tops.values()];
};

/** Fill in the row line, the plan's status and its cut list. */
async function explainRows() {
  const v = rowView;
  plannedNow = null;
  if (v.kind === "none") return;
  /** @type {Record<string, Record<string, unknown>>} */
  const fields = {};
  const row = v.row;
  if (!row.length) fields.row = { text: `No cabinets stand on ${v.kind === "base" ? (v.base.node.name ?? "this frame") : "it"} now.`, tone: "warning" };
  else {
    const lay = rowLayout(row);
    const on = v.kind === "row" && v.base ? ` · on ${v.base.node.name ?? "a base frame"}` : "";
    fields.row = { text: `Row of ${row.length}: ${row.map((c) => c.name).join(", ")} · ${f(lay.length)} long, ${f(lay.depth)} deep${on}`, tone: "info" };
  }
  if (!(v.kind === "row" && v.base)) {
    const p = row.length ? planBase(row, baseSizes) : null;
    /** @type {Record<string, unknown>} */
    let status;
    if (!p) status = { text: "Select the row's cabinets to make a frame for them.", tone: "warning" };
    else if (p.error) status = { text: p.error, tone: "warning" };
    else {
      const kicks = row.filter((c) => c.sizes.base === "toekick");
      const tops = topsOnFrame(row, baseSizes).map((t) => f(t));
      const parts = [`${p.ladders} ${p.ladders === 1 ? "ladder" : "ladders"}, ${p.sleepers} sleepers, ${f(baseSizes.height)} tall.`];
      if (kicks.length) parts.push(`${kicks.length === row.length ? "The cabinets' toe kicks come off" : `${kicks.map((c) => c.name).join(", ")} ${kicks.length === 1 ? "loses its" : "lose their"} toe kick${kicks.length === 1 ? "" : "s"}`}: each box is its kick shorter and stays where it is.`);
      parts.push(`Tops at ${tops.join(", ")} above the floor.`);
      // Rails a 4 x 4 bed cannot take go to the track saw; their dados would be hand work.
      const bed = cncLength(metric());
      const long = baseSizes.stock !== "lumber" && p.layout.ladders.some((l) => l.x1 - l.x0 > bed + 1e-9);
      if (long) parts.push(`Rails over ${f(bed)} are cut on the track saw (Nesting › Track saw what won't fit)${baseSizes.joints === "dado" ? ", and their dados by hand (CNC files lists them)" : ""}.`);
      if (v.kind === "base") {
        const stale = fingerprint(row) !== v.base.kept.fit;
        fields.refit = { disabled: !stale };
        status = stale ? { text: "The row has changed since this frame was made: Fit to the row again.", tone: "warning" } : { text: `${parts.join(" ")} Changes apply as you make them (Ctrl+Z undoes each).`, tone: "info" };
      } else status = { text: parts.join(" "), tone: "info" };
    }
    if (v.kind === "row") fields.makeBase = { disabled: !p || !!p.error };
    fields.baseStatus = status;
    const cuts = p && !p.error ? cutRows(p.parts) : [];
    fields.baseCuts = { rows: cuts.map((r) => [r.name, r.qty, f(r.length), f(r.width), stock(r.thickness)]) };
    const pieces = cuts.reduce((n, r) => n + r.qty, 0);
    const run = cuts.reduce((n, r) => n + r.qty * r.length, 0);
    fields.baseTotal = { text: cuts.length ? `${pieces} pieces, ${f(run)} of ${f(baseSizes.height)} ${baseSizes.stock === "plywood" ? `strips of ${stock(baseSizes.thickness)} plywood` : `by ${stock(baseSizes.thickness)} lumber`}. They are in the Cut list too, as Base front rail, Base back rail and Base sleeper.` : "" };
    fields.baseNotes = { rows: p && !p.error ? p.notes : [] };
    fields.ladderLayout = { rows: p && !p.error ? p.layout.ladders.map((l) => [l.tag, f(l.x1 - l.x0), l.sleepers.map((x) => f(x + p.layout.thickness / 2 - l.x0)).join(", ")]) : [] };
    if (typeof OffscreenCanvas !== "undefined") {
      const src = p && !p.error ? await pictureOf(p.layout, p.length) : BLANK_PNG;
      if (src) fields.ladderPic = { src };
    }
    plannedNow = p && !p.error ? p : null;
  }
  await send(rowsPanel, fields);
}

/** A 1 x 1 white PNG: the picture's place before there is a frame to draw. */
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
/** The last picture drawn, by what it shows, so an unchanged plan is not drawn again. */
let picture = { key: "", src: BLANK_PNG };

/** The frame from above, dimensioned, as a PNG data URL (twice the size it shows, for a sharp
 * picture; half that when it would be over the panel's 256 KB). Null when it cannot be drawn.
 * @param {import("./row.js").Layout} layout @param {number} length */
async function pictureOf(layout, length) {
  const key = JSON.stringify([layout, length, units.system()]);
  if (key === picture.key) return picture.src;
  for (const scale of [2, 1]) {
    try {
      const pic = ladderPicture(layout, length, f, 640);
      const canvas = new OffscreenCanvas(Math.ceil(pic.width * scale), Math.ceil(pic.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pic.width, pic.height);
      for (const r of pic.rects) {
        if (r.kind === "outline") {
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#8a8a8a";
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = r.kind === "rail" ? "#d9b98c" : "#e8d3b0";
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#5a4630";
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
      }
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const l of pic.lines) {
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
      }
      ctx.stroke();
      ctx.fillStyle = "#1a1a1a";
      for (const t of pic.texts) {
        ctx.font = `${t.size}px sans-serif`;
        ctx.textAlign = t.align;
        ctx.fillText(t.text, t.x, t.y);
      }
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const src = `data:image/png;base64,${btoa(bin)}`;
      if (src.length > 250_000 && scale > 1) continue;
      picture = { key, src };
      return src;
    } catch {
      return null;
    }
  }
  return null;
}

let rowsShown = "";
async function rowsRefresh() {
  const b = rowsBody();
  const ids = idsOf(b);
  if (ids !== rowsShown) {
    rowsShown = ids;
    lastSent.delete("rows");
    await rowsPanel.setBody(b);
  }
  await explainRows();
  await showPreview();
}

/** The selection moved or the model changed: show the row or the base frame it is in. */
async function rowsSync(/** @type {Snapshot} */ snap) {
  if (!rowsReady) return;
  const was = rowView;
  rowView = await rowFocus(snap);
  const wasBase = was.kind === "base" ? was.base.id : null;
  const isBase = rowView.kind === "base" ? rowView.base.id : null;
  if (wasBase !== isBase) {
    baseSizes = rowView.kind === "base" ? rowView.base.sizes : baseDraft;
    rowsShown = "";
  }
  await rowsRefresh();
}

/** Panel values into base frame sizes; picking lumber or plywood starts its thickness, length and joints over. @param {string} id @param {Record<string, unknown>} values */
function readBase(id, values) {
  /** @type {Record<string, unknown>} */
  const v = {};
  for (const k of Object.keys(baseSizes)) if (k in values) v[k] = values[k];
  let next = normalizeBase({ ...baseSizes, .../** @type {Partial<BaseSizes>} */ (v) }, metric());
  if (id === "stock") {
    const d = next.stock === "lumber" ? lumberDefaults(metric()) : next.stock === "saw" ? { ...normalizeBase(null, metric()), ...sawStripDefaults(metric()) } : normalizeBase(null, metric());
    // Plywood starts at the row's carcass stock.
    const carcass = rowView.kind !== "none" && rowView.row[0] ? rowView.row[0].sizes.thickness : d.thickness;
    next = { ...next, thickness: next.stock === "lumber" ? d.thickness : carcass, maxLength: d.maxLength, joints: d.joints };
  }
  return next;
}

const rowsPanel = await ui.registerPanel({
  id: "rows",
  title: "Rows and base frames",
  body: rowsBody(),
  onChange: (id, values) => {
    baseSizes = readBase(id, values);
    if (["stock", "joints"].includes(id)) rowsShown = "";
    if (rowView.kind === "base") liveBase();
    else {
      baseDraft = baseSizes;
      void storage.app.set("base", baseDraft);
    }
    return rowsRefresh();
  },
  onAction: async (id) => {
    const v = rowView;
    if (id === "lineUp" && v.kind === "row") return lineUpCabinets(v.selected);
    if (id === "selectBase" && v.kind === "row" && v.base) return model.select([{ kind: "instance", id: v.base.id }]);
    if (id === "makeBase" && v.kind === "row") return buildBase(v.row, baseSizes, null);
    if (id === "refit" && v.kind === "base") return buildBase(v.row, baseSizes, v.base);
    if (id === "previewBase" && (v.kind === "row" || v.kind === "base")) return ui.activateTool("frame");
  },
});
rowsShown = idsOf(rowsBody());
rowsReady = true;

let baseTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Rebuild the selected base frame a moment after the last change. */
function liveBase() {
  if (baseTimer) clearTimeout(baseTimer);
  baseTimer = setTimeout(async () => {
    baseTimer = null;
    const v = rowView;
    if (v.kind !== "base" || !v.row.length) return;
    try {
      await buildBase(v.row, baseSizes, v.base);
    } catch (e) {
      await ui.notify(`Could not update the base frame: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    }
  }, 250);
}

// --- the frame drawn in the model before it is made -------------------------------------------


/** Draw the planned frame where it will go, and each cabinet where it will stand on it; or
 * nothing when the tool is not active or there is no plan. */
async function showPreview() {
  const tool = previewing;
  if (!tool) return;
  const v = rowView;
  const p = plannedNow;
  if (!p || (v.kind !== "row" && v.kind !== "base") || !v.row.length || (v.kind === "row" && v.base)) {
    await tool.setView({ overlay: [], labels: [], status: "Select a cabinet of a row with no base frame (or a base frame) to see its frame here." });
    return;
  }
  const row = v.row;
  const inv0 = invert(row[0].world);
  const bottom = (/** @type {Placed} */ c) => apply(inv0, c.world.translation)[2];
  const floor = v.kind === "base" ? apply(inv0, v.base.world.translation)[2] : Math.min(...row.map(bottom));
  const baseWorld = compose(row[0].world, translation([p.at[0], p.at[1], floor]));
  /** @type {[number, number, number][]} */
  const frame = [];
  for (const b of boxesOf(p.parts)) for (const [a, c] of edgesOf(b)) frame.push(apply(baseWorld, a), apply(baseWorld, c));
  // Each cabinet where it will stand: on the frame, its box its toe kick shorter.
  /** @type {[number, number, number][]} */
  const boxes = [];
  for (const c of row) {
    const h = c.sizes.base === "toekick" ? c.sizes.height - c.sizes.toeKick : c.sizes.height;
    const lift = floor + baseSizes.height - bottom(c);
    const at = compose(translation(applyVector(row[0].world, [0, 0, lift])), c.world);
    for (const [a, b] of edgesOf({ min: [0, 0, 0], max: [c.width, c.depth, h] })) boxes.push(apply(at, a), apply(at, b));
  }
  const labels = p.layout.ladders.map((l) => ({ at: apply(baseWorld, [(l.x0 + l.x1) / 2, p.layout.front, baseSizes.height]), text: `${l.tag}: ${f(l.x1 - l.x0)}, ${l.sleepers.length} sleepers` }));
  await tool.setView({
    overlay: [
      { kind: "segments", points: frame, color: "accent", width: 2 },
      { kind: "segments", points: boxes, color: "preview", dashed: true },
    ],
    labels,
    status: v.kind === "base" ? `${v.base.node.name ?? "The base frame"} as its settings now make it. Change them in Rows and base frames; Esc or another tool to leave.` : `The base frame for ${row.length} ${row.length === 1 ? "cabinet" : "cabinets"}, and where they will stand on it. Click to make it; Esc or another tool to leave.`,
  });
}

await ui.registerTool({
  id: "frame",
  onActivate: async (tool) => {
    previewing = tool;
    await showPreview();
  },
  onDeactivate: async (tool) => {
    previewing = null;
    await tool.setView({ overlay: [], labels: [], status: null });
  },
  onEvent: async (e) => {
    if (e.type !== "click") return;
    const v = rowView;
    if (v.kind === "row" && !v.base && plannedNow) await buildBase(v.row, baseSizes, null);
  },
});

/** Butt the selected cabinets into one row: one undo step. @param {Placed[]} selected */
function lineUpCabinets(/** @type {Placed[]} */ selected) {
  return exclusive(() => lineUpNow(selected));
}
/** @param {Placed[]} selected */
async function lineUpNow(selected) {
  const moved = lineUp(selected);
  if (!moved.size) {
    await ui.notify("They stand in one row already.");
    return;
  }
  const batch = model.batch("Line up cabinets");
  for (const c of selected) {
    const world = moved.get(c.id);
    if (world) batch.transform([{ node: c.id }], moveTo(c, world));
  }
  try {
    await batch.commit();
    await ui.notify(`Lined up ${selected.length} cabinets in one row, backs in line.`);
  } catch (e) {
    await ui.notify(`Could not line them up: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
  }
  await syncOnce();
}

/**
 * Put a row on a base frame (or make its frame again): one batch, one undo step. Each cabinet
 * with a toe kick is rebuilt without it, its box the kick shorter; every cabinet is lifted onto
 * the frame's top; the frame's parts go under them, wrapped into its component.
 * @param {Placed[]} row @param {BaseSizes} b @param {PlacedBase | null} old
 */
function buildBase(row, b, old) {
  return exclusive(() => buildBaseNow(row, b, old));
}
/** @param {Placed[]} row @param {BaseSizes} b @param {PlacedBase | null} old */
async function buildBaseNow(row, b, old) {
  if (!row.length) return;
  const p = planBase(row, b);
  if (p.error) {
    await ui.notify(p.error, { kind: "warning" });
    return;
  }
  const ctxId = (await model.document()).context;
  const kicks = row.filter((c) => c.sizes.base === "toekick");
  const nested = kicks.find((c) => c.node.parent !== ctxId);
  if (nested) {
    await ui.notify(`${nested.name} has a toe kick and is inside a group: open the group, or take it out, to rebuild it without its kick.`, { kind: "warning" });
    return;
  }
  const ctx = await contextFrame();
  const inv0 = invert(row[0].world);
  const bottom = (/** @type {Placed} */ c) => apply(inv0, c.world.translation)[2];
  // The floor, in the first cabinet's axes: under the old frame, else where the cabinets stand.
  const floor = old ? apply(inv0, old.world.translation)[2] : Math.min(...row.map(bottom));
  const baseWorld = compose(row[0].world, translation([p.at[0], p.at[1], floor]));
  const batch = model.batch(old ? "Update base frame" : "Base frame");
  const add = await materialsToAdd();
  /** @type {{ c: Placed, s: Sizes, frame: Frame, ref: import("sawhorse").Ref }[]} */
  const rebuilt = [];
  for (const c of row) {
    const up = applyVector(row[0].world, [0, 0, floor + b.height - bottom(c)]);
    if (c.sizes.base === "toekick") {
      const s = { ...c.sizes, name: c.name, base: /** @type {const} */ ("none"), height: c.sizes.height - c.sizes.toeKick };
      const planned = plan(s, metric());
      if (planned.error) {
        await ui.notify(`${c.name} without its toe kick: ${planned.error}`, { kind: "warning" });
        return;
      }
      // Its origin goes from the floor to the frame's top: the box stays put when the frame is its kick tall.
      const frame = compose(invert(ctx), compose(translation(up), c.world));
      const items = addParts(batch, planned.parts, frame, add(Object.values(MATERIALS)));
      const ref = batch.makeComponent(items, `${s.name} ${f(s.width)} x ${f(s.height)} x ${f(s.depth)}`);
      batch.rename({ node: ref.node }, c.name);
      rebuilt.push({ c, s, frame, ref });
    } else if (Math.abs(up[0]) + Math.abs(up[1]) + Math.abs(up[2]) > 1e-9) batch.transform([{ node: c.id }], slide(c.parent, up));
  }
  const name = old?.node.name ?? `Base frame ${Object.keys(await bases()).length + 1}`;
  const frame = compose(invert(ctx), baseWorld);
  const items = addParts(batch, p.parts, frame, add(b.stock === "lumber" ? [BASE_LUMBER] : [MATERIALS.carcass]));
  const ref = batch.makeComponent(items, `${name} ${f(p.length)}`);
  batch.rename({ node: ref.node }, name);
  // The old frame and the old cabinets go last (as in generate).
  if (old) batch.delete({ node: old.id });
  for (const r of rebuilt) batch.delete({ node: r.c.id });
  try {
    const result = await batch.commit();
    const last = await storage.document.get(LAST);
    for (const r of rebuilt) {
      const id = /** @type {number} */ (result.value(r.ref.node));
      await rememberOrWarn(id, r.s, r.frame);
      if (last === r.c.id) await storage.document.set(LAST, id);
      if (lastId === r.c.id) lastId = id;
    }
    const id = /** @type {number} */ (result.value(ref.node));
    try {
      await rememberBase(id, { sizes: b, frame, length: p.length, depth: p.depth, fit: fingerprint(row) });
    } catch (e) {
      await ui.notify(`${name} is made, but its settings could not be kept in the document (${e instanceof Error ? e.message : String(e)}): it will not be edited as a base frame.`, { kind: "warning" });
    }
    await model.select([{ kind: "instance", id }]);
    await syncOnce();
    if (!old) await ui.notify(`Made ${name} under ${row.length} ${row.length === 1 ? "cabinet" : "cabinets"}: ${p.ladders} ${p.ladders === 1 ? "ladder" : "ladders"}, ${p.sleepers} sleepers. It is selected: its cut list is in Rows and base frames, and changes apply to it.`);
  } catch (e) {
    await ui.notify(`Could not ${old ? "update" : "make"} the base frame: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    await syncOnce();
  }
}

await ui.registerCommand({ id: "generate", run: () => generate("new") });
events.on("selectionChanged", () => sync());
events.on("documentChanged", () => sync());
events.on("documentOpened", () => sync());
await sync();
