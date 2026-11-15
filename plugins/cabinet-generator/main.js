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
// sides as asked, the hidden parts free to turn), so the cut list nests it as sheet goods, and
// carries the hardware it takes (hinges on a door, runners on a drawer front, pins on a shelf)
// for the shopping list.
//
// Sizes are metres inside; the panel shows and reads them in the document's units.
import { events, model, storage, ui, units } from "sawhorse";
import { applyPreset, BAND, bandList, END_NOTCH, BINS, binRoom, exactThickness, flatImportOp, isMetric, issue, MATERIALS, phrase, plan, normalize, PRESETS, runnerLine, summary } from "./cabinet.js";
import { BUDGET, describes, keep, keptFor, keptMetric, liveKeysOf, pack, prune, stampOf, strangers, unpack, validFrame } from "./keep.js";
import { clearanceText, areaText, fitFromPicks, ladderRecord, liveLadders, partArea, pickOptions, testCut, TEST_TAG, TEST_TITLES, validLadderRecord } from "./testcuts.js";
import { apply, applyVector, BASE_LUMBER, boxesOf, cncLength, edgesOf, freeName, ladderPicture, nextName, rigid, sawStripDefaults, compose, cutRows, IDENTITY, invert, lineUp, lumberDefaults, normalizeBase, placeNext, planBase, reach, rightOf, rowLayout, rowOf, TOUCH, translation, unturned } from "./row.js";
import { APPLIANCES, KCMA, openingStart, OTR, planCabinet, rowChecks, trimChecks, trimEnds } from "./trim.js";

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
/** The entry the panel was filled from ("n12|40": its key and first part): when an Undo brings
 * back an earlier state of the same instance, this changes and the panel is filled again. */
let editingKey = /** @type {string | null} */ (null);
/** The edited cabinet's settings as built (null when they were never kept), and its units. */
let kept = /** @type {Sizes | null} */ (null);
let keptUnits = false;
/** The row checks for the cabinet being edited (trim.js rowChecks), as of the last sync. @type {string[]} */
let aroundChecks = [];
/** Why the edited cabinet is not rebuilt as the panel changes (null: it is), and whether a
 * press of "replace" rebuilds it anyway. */
let why = /** @type {string | null} */ (null);
let replace = /** @type {string | null} */ (null);
/** The units the panel's settings are planned in: the edited cabinet's own, else the document's. */
const planMetric = () => (editing !== null ? keptUnits : metric());
/** The names of the cabinets in the model, so a new one gets a name of its own. */
let taken = /** @type {Set<string>} */ (new Set());
/** Which group is open ("" for none). */
let view = /** @type {string} */ ((await storage.app.get("view")) ?? "");

/** The test the Test cuts group shows (kept for next time). @type {import("./testcuts.js").TestKind} */
let testKind = /** @type {import("./testcuts.js").TestKind} */ ("machine");
{
  const saved = await storage.app.get("testKind");
  if (saved === "machine" || saved === "ladders" || saved === "drawer" || saved === "door") testKind = saved;
}
/** The last joint ladders added to this model, as cut (kept in the document), while they are in it; or null. */
let ladderCut = /** @type {import("./testcuts.js").LadderRecord | null} */ (null);
/** The dado picked on each ladder: "1" to "5", "tight", "loose", or "" (not tried). */
let picks = /** @type {Record<string, string>} */ ({});
/** The Test cuts group's own fields: not settings of the cabinet. */
const TEST_FIELDS = ["testKind", "fit_dado", "fit_back", "fit_bottom"];
const LADDERS = "ladders";

/** @typedef {import("./row.js").Frame} Frame */

/** Each cabinet's settings (what differs from the baseline, keep.js), frame (where its own
 * origin is, in its component's coordinates) and the parts it was made with, by instance id
 * ("n12"), in the document. Old ids stay while there is room, so an undone update finds its
 * cabinet again; so do the earlier states of a cabinet rebuilt in place ("n12/40").
 * @typedef {import("./keep.js").Kept} Kept */
const CABINETS = "cabinets";
async function cabinets() {
  const all = await storage.document.get(CABINETS);
  return /** @type {Record<string, Kept>} */ (all && typeof all === "object" && !Array.isArray(all) ? all : {});
}
/** Each node's children (ids), by its id. @param {import("sawhorse").Node[]} nodes */
function childrenOf(nodes) {
  /** @type {Map<number, number[]>} */
  const kids = new Map();
  for (const n of nodes) if (n.parent != null) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id]);
  return kids;
}
/** A cabinet's entry as kept: its settings in its own units, its frame, the parts it is made with.
 * @param {Sizes} s @param {boolean} m @param {Frame} frame @param {number[]} kids @returns {Kept} */
const entry = (s, m, frame, kids) => ({ ...pack(s, m), frame, ...stampOf(kids) });
/** Keep cabinets' entries, in one write. Rejects when the document's store is full even after
 * the entries for cabinets no longer in the model went: the caller says so, as a warning.
 * @param {[number, Kept][]} list */
async function remember(list) {
  const all = await cabinets();
  for (const [id, e] of list) keep(all, id, e);
  await storage.document.set(CABINETS, prune(all, liveKeysOf(all, await model.nodes()), BUDGET.cabinets));
}
/** Keep them, and say so if they cannot be kept (the cabinet is made either way). @param {string} name @param {[number, Kept][]} list */
async function rememberOrWarn(name, list) {
  try {
    await remember(list);
    return true;
  } catch (e) {
    await ui.notify(`${name} is made, but its settings could not be kept in the document (${e instanceof Error ? e.message : String(e)}): it will not be edited as a cabinet. Delete cabinets you no longer need, or save and reopen.`, { kind: "warning" });
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
 * @typedef {{ nodes: import("sawhorse").Node[], byId: Map<number, import("sawhorse").Node>, kids: Map<number, number[]>, copies: Map<number, number[]>, starts: (number | null)[], context: number | null, cabinets: Record<string, Kept>, bases: Record<string, any>, last: number | null, legacy: number | null, ladders: import("./testcuts.js").LadderRecord | null }} Snapshot
 * @returns {Promise<Snapshot>}
 */
async function snapshot() {
  const [nodes, sel, doc, cabs, bs, last, legacy, ladders] = await Promise.all([
    model.nodes(),
    model.selection(),
    model.document(),
    storage.document.get(CABINETS),
    storage.document.get(BASES),
    storage.document.get(LAST),
    storage.document.get("cabinet"),
    storage.document.get(LADDERS),
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
  /** The instances of each component definition. @type {Map<number, number[]>} */
  const copies = new Map();
  for (const n of nodes) if (n.kind === "instance" && n.definition != null) copies.set(n.definition, [...(copies.get(n.definition) ?? []), n.id]);
  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    kids: childrenOf(nodes),
    copies,
    starts,
    context: doc.context,
    cabinets: record(cabs),
    bases: record(bs),
    last: typeof last === "number" ? last : null,
    legacy: typeof legacy === "number" ? legacy : null,
    ladders: validLadderRecord(ladders),
  };
}

/**
 * What is kept for an instance, if it is a cabinet of ours: its own entry (or, after an edit
 * in place was undone, the earlier one that describes its parts now), or, for a copy of a
 * cabinet (Move with Ctrl, copy and paste: another instance of its component), the
 * cabinet's. `owner` is the instance the entry is kept under.
 * @param {Snapshot} snap @param {import("sawhorse").Node} node
 * @returns {{ key: string, kept: Kept, owner: number } | null}
 */
function entryOf(snap, node) {
  if (node.kind !== "instance") return null;
  const own = keptFor(snap.cabinets, node.id, snap.kids.get(node.id) ?? []);
  if (own) return { ...own, owner: node.id };
  if (node.definition == null) return null;
  for (const other of snap.copies.get(node.definition) ?? []) {
    if (other === node.id) continue;
    const o = keptFor(snap.cabinets, other, snap.kids.get(other) ?? []);
    if (o) return { ...o, owner: other };
  }
  return null;
}

/** A cabinet of ours as the panel edits it: its node, its settings (null for a cabinet whose
 * settings were never kept), its frame, its own units, and the entry it was read from.
 * @typedef {{ node: import("sawhorse").Node, sizes: Sizes | null, frame: Frame, metric: boolean, key: string, owner: number, kept: Kept | null }} Focus */
/** @param {Snapshot} snap @param {import("sawhorse").Node} node @returns {Focus | null} */
function focusOf(snap, node) {
  const e = entryOf(snap, node);
  // A document from before settings were kept per cabinet names its one cabinet.
  if (!e) return node.kind === "instance" && node.id === snap.legacy ? { node, sizes: null, frame: IDENTITY, metric: metric(), key: "legacy", owner: node.id, kept: null } : null;
  const m = keptMetric(e.kept, metric());
  const s = unpack(e.kept, m);
  // A cabinet made before frames were kept was one assembly: its parts sit at its origin.
  return s ? { node, sizes: { ...s, name: node.name ?? s.name }, frame: validFrame(e.kept.frame) ?? IDENTITY, metric: m, key: `${e.key}|${e.kept.p ?? ""}`, owner: e.owner, kept: e.kept } : null;
}

/** The cabinet of ours the selection is in (or, with nothing selected, the one open for
 * editing), with its settings; null when the selection is anything else.
 * @param {Snapshot} [snap] @returns {Promise<Focus | null>} */
async function focused(snap) {
  const sn = snap ?? (await snapshot());
  const { byId, starts, context } = sn;
  /** @param {number | null | undefined} id */
  const climb = (id) => {
    for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) {
      const f = focusOf(sn, n);
      if (f) return f;
    }
    return null;
  };
  /** @type {Focus | null} */
  let hit = null;
  for (const start of starts) {
    const f = climb(start);
    // Anything else in the selection, or two cabinets: not one cabinet to edit.
    if (!f || (hit && hit.node.id !== f.node.id)) return null;
    hit = f;
  }
  if (!starts.length) hit = climb(context);
  return hit;
}

/** A node's frame in the model: its parents' transforms, outermost first, then its own.
 * @param {Map<number, import("sawhorse").Node>} byId @param {number | null | undefined} id @returns {Frame} */
function worldOf(byId, id) {
  let m = IDENTITY;
  for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) m = compose(/** @type {Frame} */ (n.transform), m);
  return m;
}

/** A cabinet of ours where it stands: its box and its own axes in the model (`world`), its
 * node, settings (in its own units, `metric`), kept frame, its parent's frame in the model,
 * and the entry it was read from.
 * @typedef {import("./row.js").Cab & { node: import("sawhorse").Node, sizes: Sizes, frame: Frame, parent: Frame, metric: boolean, owner: number, kept: Kept }} Placed */
/** Every cabinet of ours in the model (copies too), and the nodes by id. @param {Snapshot} [snap] */
async function placed(snap) {
  const sn = snap ?? (await snapshot());
  const { byId } = sn;
  /** @type {Placed[]} */
  const list = [];
  for (const node of sn.nodes) {
    const e = node.kind === "instance" ? focusOf(sn, node) : null;
    if (!e || !e.sizes || !e.kept) continue;
    // A frame that cannot be read (a damaged or hand-made document): its parts sit at its origin.
    const frame = e.frame;
    const parent = worldOf(byId, node.parent);
    const world = compose(compose(parent, /** @type {Frame} */ (node.transform)), frame);
    const s = e.sizes;
    list.push({ id: node.id, name: s.name, width: s.width, depth: s.depth, height: s.height, world, ends: trimEnds(s), node, sizes: s, frame, parent, metric: e.metric, owner: e.owner, kept: e.kept });
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
/** Panel values into sizes: a select's value is text, and two selects stand for two settings. @param {Record<string, unknown>} values */
const read = (values) => {
  const v = { ...values };
  if (typeof v.runner === "string") v.runner = Number(v.runner) || 0;
  if (typeof v.bandCount === "string") v.bandCount = Number(v.bandCount) || 1;
  // Blum's boring distance is in millimetres whatever the document's units.
  if (typeof v.cupDistance === "string") v.cupDistance = Number(v.cupDistance) * MM;
  if (v.joinery === "dado" || v.joinery === "butt") v.dados = v.joinery === "dado";
  if (v.backType === "groove" || v.backType === "butt") Object.assign(v, { back: true, backMount: v.backType });
  else if (v.backType === "none") v.back = false;
  for (const k of ["preset", "view", "joinery", "backType", "place", "filler", ...TEST_FIELDS, ...SECTIONS.map((x) => x.id)]) delete v[k];
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
  { id: "secTests", label: "9 · Test cuts", applies: () => true, summary: () => `${TEST_TITLES[testKind]} · prove the setup before the real sheet` },
  { id: "secBand", label: "10 · Edge banding", applies: () => true, summary: () => bandSummary() },
  { id: "secTrim", label: "11 · Ends, fillers and openings", applies: () => true, summary: () => trimSummary() },
];

/** What the Ends, fillers and openings group says while closed. */
function trimSummary() {
  const s = sizes;
  /** @type {string[]} */
  const out = [];
  for (const [side, kind, w] of /** @type {const} */ ([["left", s.endLeft, s.fillerLeft], ["right", s.endRight, s.fillerRight]])) {
    if (kind === "panel") out.push(`${side} end panel`);
    else if (kind === "filler" || kind === "scribe") out.push(`${side} ${kind === "scribe" ? "scribe filler" : "filler"} ${f(w)}`);
  }
  for (const [side, kind, w] of /** @type {const} */ ([["left", s.openLeft, s.openLeftWidth], ["right", s.openRight, s.openRightWidth]])) if (kind !== "none") out.push(`${APPLIANCES[kind].short.toLowerCase()} ${side}${w > 0 ? ` ${f(w)}` : ""}`);
  if (s.base === "toekick" && s.kickSkin !== "none") out.push("kick skin");
  if (s.sinkWidth > 0 || s.sinkApron) out.push(s.sinkApron ? "farmhouse sink" : `${f(s.sinkWidth)} sink`);
  if (s.otr) out.push("over a microwave");
  if (!out.length) return "Nothing beside it: no end panels, fillers or openings";
  const text = out.join(" · ");
  return text[0].toUpperCase() + text.slice(1);
}

/** What the Edge banding group says while closed: off, or which parts take which band. */
function bandSummary() {
  const s = sizes;
  if (!s.band) return "Off · cut at the finished sizes, no edges banded";
  const list = bandList(s, planMetric());
  const mm = (/** @type {import("./cabinet.js").BandPick} */ p) => {
    const b = list[Number(p) - 1];
    return b ? `${Math.round((b.thickness / MM) * 100) / 100} mm` : "?";
  };
  const on = /** @type {[import("./cabinet.js").BandPick, string][]} */ ([
    [s.bandFronts, "fronts"],
    [s.bandCarcass, "carcass edges"],
    [s.bandShelves, "shelves"],
  ]).filter(([p]) => p !== "none");
  return on.length ? on.map(([p, w]) => `${w} ${mm(p)}`).join(" · ") : "On · no part picked";
}

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
      out.push(pick("doors", "Doors", s.doors, [["auto", `Automatic: a pair over ${metric() ? "609.6 mm" : "24 in"}`], ["one", "Single"], ["two", "Double"]]));
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
      out.push(pick("hingeClose", "Hinges", s.hingeClose, [["soft", "BLUMOTION (soft close)"], ["self", "Self-closing"]]));
      out.push(help("Which CLIP top hinge the shopping list names: the holes are the same."));
    }
    if (s.shelfType === "adjustable" && hasShelves() && s.shelves) out.push(heading("Shelf pins"), help("5 mm holes, 10 deep, 32 mm apart, five around each shelf: a row 37 mm from the front and a rear row on the same 32 mm grid. Drilled whenever shelves are adjustable."));
  } else if (view === "secCnc") {
    out.push(len("bit", "Bit diameter", s.bit), len("fit", "Joint clearance", s.fit));
    out.push(help("Clearance is added to every dado and groove over the stock. Grooves and holes smaller than the bit are listed in Cuts and holes, for a smaller bit."));
    out.push(help("To cut: Nesting › CNC spacing, then CNC files for a DXF per sheet."));
  } else if (view === "secCuts") {
    out.push({ type: "table", id: "holes", columns: ["Part", "What", "Hole", "Depth", "How"], rows: [], align: ["left", "left", "right", "right", "left"] });
  } else if (view === "secTests") {
    out.push(...testFields());
  } else if (view === "secBand") {
    out.push(...bandFields());
  } else if (view === "secTrim") {
    out.push(...trimFields());
  }
  return out;
}

/** The Ends, fillers and openings group's fields. @returns {Field[]} */
function trimFields() {
  const s = sizes;
  const m = metric();
  /** @type {Field[]} */
  const out = [heading("Sides")];
  /** @type {[string, string][]} */
  const sideOptions = [["none", "Nothing: a cabinet or the bare side"], ["panel", "Finished end panel"], ["filler", "Filler"], ["scribe", "Scribe filler: cut wider, scribed by hand"]];
  out.push(pick("endLeft", "Left side", s.endLeft, sideOptions));
  if (s.endLeft === "filler" || s.endLeft === "scribe") out.push(len("fillerLeft", "Left filler width", s.fillerLeft));
  out.push(pick("endRight", "Right side", s.endRight, sideOptions));
  if (s.endRight === "filler" || s.endRight === "scribe") out.push(len("fillerRight", "Right filler width", s.fillerRight));
  const panels = s.endLeft === "panel" || s.endRight === "panel";
  const fillers = [s.endLeft, s.endRight].some((k) => k === "filler" || k === "scribe");
  const scribes = panels || s.endLeft === "scribe" || s.endRight === "scribe";
  if (panels || fillers) out.push(pick("endStock", panels && fillers ? "End panel and filler stock" : panels ? "End panel stock" : "Filler stock", s.endStock, [["carcass", "Carcass plywood"], ["doors", "Door plywood"]]));
  if (panels) {
    if (s.base === "toekick") out.push(pick("endDown", "Panel bottom", s.endDown, [["floor", "To the floor, over the toe kick"], ["box", "Flush with the cabinet's bottom"]]));
    out.push(pick("endFront", "Panel front", s.endFront, [["doors", "Flush with the door faces"], ["carcass", "Flush with the carcass front"]]));
    out.push(pick("endBand", "Panel edges banded", s.endBand, [["front", "Front edge"], ["frontBottom", "Front and bottom edges"], ["frontTopBottom", "Front, bottom and top edges"], ["none", "None"]]));
    out.push(help(`An end panel is a part of its own on the side's outer face, its grain up, ${exactThickness(s.thickness, m)} thick (the stock's thickness in 4 · Materials). Screw it on from inside the cabinet: Decor's guide uses 1-1/8 in screws. It is not drilled: no source gives a hole pattern. Its edges take the band the carcass front edges take (10 · Edge banding${s.band ? "" : ", off now"}). On a base frame the panel stops at the cabinet's bottom: set the frame's showing end back (Rows and base frames › Ends) so the toe space turns the corner.`));
  }
  if (scribes) {
    out.push(len("endScribe", "Scribe allowance", s.endScribe));
    out.push(help("Your setting, not a standard: how much wider a scribe filler is cut, and how much deeper an end panel is cut at its back edge, to scribe to the wall by hand. The AWS standard allows scribes up to 1-1/2 in (38.1 mm) wide at wall-to-wall installations: wider is warned of."));
  }
  if (fillers) out.push(help(`A filler is a strip ${s.base === "toekick" ? "above the toe kick" : "the cabinet's height"}, its face flush with the carcass front, so doors and drawers clear a wall or the next cabinet: the row counts its width. KraftMaid ships a 3 in filler with each blind corner base; IKEA's planning guide puts at least 50 mm between a cabinet and a wall (its Canadian checklist says 1 in). No general table of filler widths was found. Screw through the cabinet's side into the filler (IKEA); not drilled.`));
  out.push(heading("Appliance openings"));
  /** @type {[string, string][]} */
  const openOptions = [["none", "None"], ...Object.entries(APPLIANCES).map(([k, a]) => /** @type {[string, string]} */ ([k, a.label]))];
  for (const [side, kind, w] of /** @type {const} */ ([["Left", s.openLeft, s.openLeftWidth], ["Right", s.openRight, s.openRightWidth]])) {
    out.push(pick(`open${side}`, `${side} of it`, kind, openOptions));
    if (kind !== "none") out.push(len(`open${side}Width`, `${side} opening width`, w), help(`${APPLIANCES[kind].source} Check your appliance's installation guide: models differ.`));
  }
  out.push(help("An opening is space in the row where no cabinet goes: the next cabinet stands past it, and nothing is cut. Picking a preset sets its width; every check is a warning."));
  if (s.base === "toekick") {
    out.push(heading("Toe kick"));
    out.push(pick("kickSkin", "Toe-kick skin", s.kickSkin, [["none", "None"], ["carcass", "Carcass plywood"], ["doors", "Door plywood"], ["back", "Back plywood"]]));
    if (s.kickSkin !== "none") out.push(help(`A strip in front of the toe kick, as tall as the kick, under the cabinet and its fillers. KCMA A161.1 asks a toe kick to be at least ${m ? `${KCMA.height.mm} mm` : `${KCMA.height.in} in`} high and ${m ? `${KCMA.depth.mm} mm` : `${KCMA.depth.in} in`} deep: less is warned of, never refused.`));
  }
  out.push(heading("Sink and microwave"));
  out.push(len("sinkWidth", "Sink width (0: no sink)", s.sinkWidth), { type: "checkbox", id: "sinkApron", label: "Farmhouse (apron-front) sink", value: s.sinkApron });
  out.push(help("Kohler's spec sheets: a 24 to 25 in sink needs a base at least 27 in (686 mm) wide; 32 to 33 in, 36 in; its 35 in sink, 36 in (which may need modifications); a farmhouse sink, at least 36 in (914 mm). A narrower cabinet is warned of. Check your sink's own spec sheet."));
  if (s.base === "none") {
    out.push({ type: "checkbox", id: "otr", label: "An over-the-range microwave hangs under it", value: s.otr });
    if (s.otr) out.push(help(`${OTR.source} Check your microwave's installation guide.`));
  }
  out.push(heading("Checks"), { type: "note", id: "trimChecks", text: "" });
  return out;
}

/** The Edge banding group's fields. @returns {Field[]} */
function bandFields() {
  const s = sizes;
  /** @type {Field[]} */
  const out = [
    { type: "checkbox", id: "band", label: "Band the edges", value: s.band },
    help("Each banded edge is cut short by its band's thickness, so the part comes out at its size with the band on. Holes, dados and notches stay where they are in the finished part: Blum gives the boring distance from the door's edge and the 37 mm lines from the side's front edge, and with a band on, that edge is the band's face. No maker's rule for this was found: it is the geometry. The model shows the blanks: a banded edge stands a band short, and a size measured in the model is the cut size."),
  ];
  if (!s.band) return out;
  out.push(pick("bandCount", "Bands", String(s.bandCount), [["1", "One band"], ["2", "Two bands"], ["3", "Three bands"]]));
  const raw = /** @type {const} */ ([
    ["band1", s.band1Size, s.band1Thick, s.band1Name, s.band1Width],
    ["band2", s.band2Size, s.band2Thick, s.band2Name, s.band2Width],
    ["band3", s.band3Size, s.band3Thick, s.band3Name, s.band3Width],
  ]).slice(0, Math.max(1, Math.min(3, s.bandCount)));
  raw.forEach(([id, size, thick, name, width], i) => {
    out.push(heading(`Band ${i + 1}`));
    out.push(pick(`${id}Size`, "Thickness", size, [...BAND.sizes.map(([v, , label]) => /** @type {[string, string]} */ ([v, label])), ["custom", "Measured: type it"]]));
    if (size === "custom") out.push({ type: "number", id: `${id}Thick`, label: "Measured thickness", unit: "length", value: thick, min: BAND.minThick, max: BAND.maxThick });
    out.push({ type: "text", id: `${id}Name`, label: "Name or colour", value: name, placeholder: "White PVC" }, len(`${id}Width`, "Width", width));
  });
  out.push(help(`Measure the band with calipers, as you did the plywood, and type what it measures: REHAU's 1 mm band is made to +-0.1 mm. REHAU sells 0.018 in (0.457 mm), 1, 2 and 3 mm, 15/16 in wide among other widths. Sawhorse's own limits, not sourced rules: at most 1/4 in thick, and at least as wide as the stock it covers.`));
  const list = bandList(s, planMetric());
  const which = [["none", "No banding"], ...list.map((b) => /** @type {[string, string]} */ ([String(b.n), `Band ${b.n} · ${b.label}`]))];
  out.push(heading("Which edges"));
  out.push(pick("bandFronts", "Doors and drawer fronts, all four edges", s.bandFronts, /** @type {[string, string][]} */ (which)));
  out.push(pick("bandCarcass", "Front edges of the sides, top, bottom, fixed shelves and front stretcher", s.bandCarcass, /** @type {[string, string][]} */ (which)));
  out.push(pick("bandShelves", "Adjustable shelves, front edge", s.bandShelves, /** @type {[string, string][]} */ (which)));
  out.push(help("The starting choices follow the AWS standard (2009): it counts the \"visible front edges of stretchers, ends, divisions, tops, bottoms, shelves, and nailers\" as exposed, and an adjustable shelf's three hidden edges as concealed. Nailers are not banded here: they sit behind the back, at the rear edge. Doors and drawer fronts are banded all round, as one owner's spec asks (all exposed edges, 3 mm on fronts and 1 mm elsewhere: one spec, not a standard). The rear stretcher, the back, the toe kick, nailers and drawer boxes are never banded. An applied end panel (11 · Ends, fillers and openings) takes the carcass front edges' band on the edges picked there."));
  out.push(heading("Edgebander and waste"));
  out.push(len("bandPremill", "Edgebander pre-mill", s.bandPremill));
  out.push(help("Edgebanders only: what the jointing cutter takes off each edge before the band goes on (Felder and SCM: 0 to 3 mm). Each banded edge's blank is cut that much larger. Iron-on banding: 0."));
  out.push(len("bandWasteEnd", "Waste per banded side", s.bandWasteEnd));
  out.push(help(`Microvellum's default, not a standard: ${metric() ? "25.4 mm" : "1 in"} per banded side, then 5% of the total. Each part carries the ${metric() ? "25.4 mm" : "1 in"} a side; the 5% is the shopping list's banding overage, added once. An edge with a notch at its end (the toe kick, a rail's tongues) counts its whole run: the band runs across the notch and is trimmed by hand at its inside corner.`));
  out.push(heading("Banded parts"), { type: "table", id: "bandRows", columns: ["Part", "Qty", "Banded edges", "Band", "Finished", "Cut", "Band each"], rows: [], align: ["left", "right", "left", "left", "right", "right", "right"] });
  out.push({ type: "note", id: "bandTotal", text: "" });
  return out;
}

/** Fill in the Edge banding group's table: each banded part, finished and cut, and its band.
 * @param {Record<string, Record<string, unknown>>} fields @param {ReturnType<typeof plan> | null} planned */
function explainBand(fields, planned) {
  if (!sizes.band) return;
  const m = planMetric();
  const face = (/** @type {[number, number, number]} */ v) => {
    const thin = v.indexOf(Math.min(...v));
    return v.filter((_, k) => k !== thin).map((x) => (m ? `${Math.round((x / MM) * 10) / 10}` : `${(x / IN).toFixed(3)}`)).join(" × ") + (m ? " mm" : " in");
  };
  const banded = (planned?.parts ?? []).filter((p) => p.bands);
  fields.bandRows = {
    rows: banded.map((p) => {
      const on = /** @type {import("./cabinet.js").PartBand[]} */ (p.bands);
      const metres = (p.bom ?? []).filter((x) => x.unit === "m").reduce((t, x) => t + x.qty, 0);
      const notched = on.some((e) => e.span[0] > 1e-9 || e.span[1] < e.run - 1e-9);
      return [p.name, p.copies.length, `${on.length === 4 ? "all four" : on.map((e) => e.edge).join(", ")}${notched ? " (notched end: trim by hand)" : ""}`, [...new Set(on.map((e) => e.band))].map((n) => `Band ${n}`).join(", "), face(/** @type {[number, number, number]} */ (p.finished)), face(p.blank), `${metres.toFixed(3)} m`];
    }),
  };
  /** @type {Map<string, number>} */
  const total = new Map();
  for (const p of banded) for (const x of p.bom ?? []) if (x.unit === "m") total.set(x.item, (total.get(x.item) ?? 0) + x.qty * p.copies.length);
  fields.bandTotal = {
    text: planned
      ? banded.length
        ? `In all, with waste: ${[...total].map(([item, q]) => `${q.toFixed(2)} m of ${item.replace(/^Edge banding, /, "")}`).join("; ")}. Cut sizes are what the CNC files draw, and what the model shows; the shopping list counts the band.${banded.some((p) => (p.bands ?? []).some((e) => e.span[0] > 1e-9 || e.span[1] < e.run - 1e-9)) ? ` ${END_NOTCH}.` : ""}`
        : "No part of this cabinet is banded: pick a band for a kind of part above."
      : "",
  };
}

// --- test cuts ------------------------------------------------------------------------------
//
// Small pieces that prove a setup before the real sheet (testcuts.js): each planned from the
// panel's settings, through the same planner and mesh builder as the cabinet.

/** The test the group shows, planned from the panel's settings (kept until they change). */
let testMemo = { key: "", value: /** @type {import("./testcuts.js").TestCut | null} */ (null) };
function currentTest() {
  const m = planMetric();
  const key = JSON.stringify([testKind, sizes, m]);
  if (testMemo.key !== key || !testMemo.value) testMemo = { key, value: testCut(testKind, sizes, m) };
  return /** @type {import("./testcuts.js").TestCut} */ (testMemo.value);
}
/** The ladders the picks name: those added to this model (as cut: each dado's width, and the
 * mating stock then), else those Add would make now. */
const pickLadders = () => {
  if (ladderCut) return ladderCut.ladders;
  const t = currentTest();
  return testKind === "ladders" && !t.error ? t.coupons.map((c) => ({ kind: c.kind, name: c.name, mating: c.mating, widths: c.widths })) : [];
};

/** The Test cuts group's fields. @returns {Field[]} */
function testFields() {
  const t = currentTest();
  const m = planMetric();
  /** @type {Field[]} */
  const out = [
    pick("testKind", "Test", testKind, [
      ["machine", `Machine check · scrap, about ${m ? "130 × 130 mm" : "5 × 5 in"}`],
      ["ladders", "Joint ladders · the real sheets"],
      ["drawer", "Mini drawer · its runner and holes"],
      ["door", "Mini door · hinges and shelf pins"],
    ]),
    { type: "note", id: "testProves", text: "", tone: "info" },
    { type: "note", id: "testStock", text: "" },
    heading("Measure"),
    { type: "table", id: "testRows", columns: ["Measure", "Expected", "If it is off"], rows: [], align: ["left", "left", "left"] },
  ];
  if (t.columns.length) out.push({ type: "table", id: "testCuts", columns: t.columns, rows: [], align: t.columns.map(() => /** @type {"left"} */ ("left")) });
  // The picks stay while ladders are in the model, even when the settings now could not make them.
  const ladders = testKind === "ladders" ? pickLadders() : [];
  if (ladders.length) {
    out.push(heading("Which dado fits"));
    for (const l of ladders) out.push(pick(`fit_${l.kind}`, l.name, picks[l.kind] ?? "", pickOptions(l, sizes, m)));
    out.push({ type: "button", id: "applyFit", label: "Set Joint clearance" }, { type: "note", id: "fitStatus", text: "" });
  }
  out.push({ type: "note", id: "testArea", text: "" });
  out.push({ type: "button", id: "makeTest", label: `Add the ${TEST_TITLES[testKind].toLowerCase()} to the model` });
  out.push({ type: "note", id: "testStatus", text: "" });
  return out;
}

/** What the ladders' picks come to (testcuts.js fitFromPicks), and which ladders they name. */
function fitAdvice() {
  const m = planMetric();
  const a = fitFromPicks(pickLadders(), picks, sizes, m);
  const t = currentTest();
  const c = (/** @type {number} */ v) => clearanceText(v, m);
  const steps = ladderCut?.steps;
  const which = !ladderCut
    ? " No ladders were added to this model: the dados named are those Add makes now."
    : !t.error && steps && steps.some((v, k) => Math.abs(v - t.steps[k]) > 1e-9)
      ? ` The ladders in the model were cut at ${c(steps[0])} to ${c(steps[steps.length - 1])} over their stock; Add makes ${c(t.steps[0])} to ${c(t.steps[t.steps.length - 1])} now.`
      : "";
  return { ...a, text: `${a.text}${which}` };
}

/** Fill in the Test cuts group. @param {Record<string, Record<string, unknown>>} fields @param {ReturnType<typeof plan> | null} planned */
function explainTests(fields, planned) {
  const t = currentTest();
  const m = planMetric();
  fields.testProves = { text: t.proves };
  fields.testStock = { text: [t.stock ? `Stock: ${t.stock}` : "", t.skipped.length ? `Not made, nothing to fit with these settings: ${t.skipped.join(" ")}` : ""].filter(Boolean).join(" ") };
  fields.testRows = { rows: t.error ? [] : t.rows };
  if (t.columns.length) fields.testCuts = { rows: t.error ? [] : t.holes };
  const cab = planned ? partArea(planned.parts) : 0;
  const size = t.sizes ? ` (${f(t.sizes.width)} × ${f(t.sizes.height)} × ${f(t.sizes.depth)})` : "";
  const pieces = t.parts.reduce((n, p) => n + p.copies.length, 0);
  const pct = cab ? (t.area / cab) * 100 : 0;
  fields.testArea = { text: t.error ? "" : `${t.name}${size}: ${pieces} ${pieces === 1 ? "part" : "parts"}, ${areaText(t.area, m)} of plywood${cab ? `, ${pct < 1 ? pct.toFixed(1) : Math.round(pct)}% of the ${areaText(cab, m)} in ${sizes.name}` : ""}.` };
  fields.makeTest = { label: `Add the ${TEST_TITLES[testKind].toLowerCase()} to the model`, disabled: !!t.error };
  fields.testStatus = t.error
    ? { text: t.error, tone: "warning" }
    : { text: `It goes beside the model as ${t.name}, on the tag ${TEST_TAG}, and nests with everything shown. To cut one test alone: hide the cabinets, the base frames and the other tests (Outliner), and tick Visible only in the Cut list. For a test cut from MDF, add your MDF sheet at its measured thickness (Stock…) and give the test's parts that sheet (Cut list, right-click, Stock / material…), or it nests on your plywood. To cut only the cabinets: hide the tag ${TEST_TAG} (Tags pane) and tick Visible only.`, tone: "info" };
  if (testKind === "ladders" && pickLadders().length) {
    const a = fitAdvice();
    fields.fitStatus = { text: a.text, tone: a.tone };
    fields.applyFit = { label: a.value === null ? "Set Joint clearance" : `Set Joint clearance to ${clearanceText(a.value, m)} (${editing === null ? "new cabinets" : sizes.name})`, disabled: a.value === null };
  }
}

/**
 * Add a test to the model, beside it, as its own assembly on the tag Test cuts: one undo step.
 * The selection stays where it is, so the panel keeps the cabinet it was showing.
 * @param {import("./testcuts.js").TestKind} kind @param {Sizes} s
 */
async function makeTestNow(kind, s) {
  const m = planMetric();
  const snap = await snapshot();
  // Made in the open context, a test inside one of ours would go with it at its next rebuild.
  const holder = openPath(snap).find((n) => focusOf(snap, n) || baseOf(snap, n));
  if (holder) {
    await ui.notify(`Leave ${holder.name ?? holder.label} first (Esc): a test cut cannot be made inside a cabinet or a base frame.`, { kind: "warning" });
    return;
  }
  const t = testCut(kind, s, m);
  if (t.error) {
    await ui.notify(t.error, { kind: "warning" });
    return;
  }
  const b = await model.bounds();
  /** @type {Frame} */
  const world = { ...IDENTITY, translation: b ? [b.max[0] + (metric() ? 50 * MM : 2 * IN), b.min[1], 0] : [0, 0, 0] };
  const frame = compose(invert(await contextFrame()), world);
  const batch = model.batch(`Test cuts: ${TEST_TITLES[kind]}`);
  const items = addParts(batch, t.parts, frame, (await materialsToAdd())(Object.values(MATERIALS)));
  const label = t.sizes ? `${t.name} ${f(t.sizes.width)} x ${f(t.sizes.height)} x ${f(t.sizes.depth)}` : t.name;
  const ref = batch.makeComponent(items, label);
  batch.rename({ node: ref.node }, t.name);
  batch.setTag([{ node: ref.node }], TEST_TAG);
  /** @type {import("sawhorse").BatchResult} */
  let result;
  try {
    result = await batch.commit();
  } catch (e) {
    await ui.notify(`Could not add ${t.name}: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    await syncOnce();
    return;
  }
  if (kind === "ladders") {
    // The picks name the dados of the ladders just made, by the node they were added as: an
    // Undo of the Add, or the ladders deleted, and the record is no longer used.
    const record = ladderRecord(t, /** @type {number} */ (result.value(ref.node)));
    ladderCut = record;
    picks = {};
    try {
      await storage.document.set(LADDERS, record);
    } catch {
      // Not kept (the store is full): this session still names these ladders while they are in the model.
    }
  }
  await syncOnce();
  const parts = t.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
  await ui.notify(`Added ${t.name} beside the model, on the tag ${TEST_TAG}: ${parts}.`);
}

/**
 * Set Joint clearance to the one the ladders agree on: to the cabinet the panel edits (one
 * rebuild, one undo step, as a change typed in 7 · CNC) or to new cabinets. Says what happened:
 * a cabinet that is not rebuilt from the panel (an older one, one scaled by hand), or whose
 * rebuild was refused, keeps its build, and the message says why.
 * @param {import("sawhorse").Values} values
 */
async function applyFit(values) {
  const a = fitAdvice();
  if (a.value === null) return;
  const v = a.value;
  sizes = { ...read(values), fit: v };
  picks = {};
  const c = clearanceText(v, planMetric());
  if (editing === null) {
    draft = sizes;
    void storage.app.set("sizes", sizes);
    shown = "";
    await refresh();
    await ui.notify(`Joint clearance is ${c} for new cabinets. Cabinets already made keep theirs: select each and set it in 7 · CNC.`);
    return;
  }
  const name = sizes.name;
  if (why) {
    shown = "";
    await refresh();
    await ui.notify(`Joint clearance is ${c} in the panel, but ${name} is not rebuilt: ${why}`, { kind: "warning" });
    return;
  }
  liveUpdate();
  // Built now, not in a moment, so the message says what was built.
  await flushEdit();
  shown = "";
  await refresh();
  const built = editing !== null && kept && Math.abs(kept.fit - v) < 1e-12;
  if (built) await ui.notify(`Joint clearance is ${c} for ${name}, rebuilt with it (Ctrl+Z undoes it). Other cabinets keep theirs: select each and set it in 7 · CNC.`);
  else await ui.notify(`${name} is not rebuilt with a Joint clearance of ${c}: ${why ?? issue({ ...sizes, fit: v }, planMetric()) ?? "the change was refused (the note under Generate says why)"}`, { kind: "warning" });
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
  out.push({ type: "button", id: "generate", label: "Generate cabinet", primary: true });
  if (editing !== null && replace) out.push({ type: "button", id: "replace", label: replace });
  out.push({ type: "note", id: "status", text: "" }, { type: "note", id: "summary", text: "" });
  return out;
}

/** The ids the panel shows now, to rebuild it only when they change. */
let shown = "";
// A select's options by value and label: a label that changes (a ladder's dado, its clearance now) is redrawn.
const idsOf = (/** @type {Field[]} */ fields) => fields.map((x) => ("id" in x && x.id ? `${x.id}:${x.type === "select" ? x.options.map((o) => `${o.value}=${o.label}`).join("|") : ""}` : "")).join(",");

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
    // The Test cuts group's own fields: not settings of the cabinet.
    if (id === "testKind") {
      const k = String(values.testKind);
      if (k === "machine" || k === "ladders" || k === "drawer" || k === "door") testKind = k;
      void storage.app.set("testKind", testKind);
      shown = "";
      return refresh();
    }
    if (id.startsWith("fit_")) {
      picks = { ...picks, [id.slice(4)]: String(values[id] ?? "") };
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
      // Fewer bands: a kind of part that took one no longer listed takes band 1.
      if (id === "bandCount") {
        const n = sizes.bandCount;
        for (const k of /** @type {const} */ (["bandFronts", "bandCarcass", "bandShelves"])) if (sizes[k] !== "none" && Number(sizes[k]) > n) sizes = { ...sizes, [k]: "1" };
      }
      // Another runner has other lengths: back to Automatic.
      if ((id === "slides" || id === "catalog") && sizes.runner && !runnerLine(sizes).lengths.some((r) => r.nl === sizes.runner)) sizes = { ...sizes, runner: 0 };
      // Fields whose label or options name another choice are rebuilt with it.
      // A new opening starts at its preset's width (the maker's), or none to type.
      if (id === "openLeft" && sizes.openLeft !== before.openLeft) sizes = { ...sizes, openLeftWidth: openingStart(sizes.openLeft, planMetric()) };
      if (id === "openRight" && sizes.openRight !== before.openRight) sizes = { ...sizes, openRightWidth: openingStart(sizes.openRight, planMetric()) };
      if (["doorPullFrom", "layout", "slides", "catalog", "front", "trashBins", "shelves", "drawerFronts", "top", "backType", "joinery", "nailers", "base", "drawerPull", "doorPull", "doors", "endLeft", "endRight", "openLeft", "openRight", "kickSkin", "otr", "sinkApron"].includes(id) || before.runner !== sizes.runner) shown = "";
    }
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    if (editing === null) {
      draft = sizes;
      void storage.app.set("sizes", sizes);
    } else if (!why) liveUpdate();
    return refresh();
  },
  onAction: (id, values) =>
    press(async () => {
      if (id === "generate") {
        sizes = read(values);
        // A change still waiting is made first, to the cabinet it was made for.
        await flushEdit();
        return generate("new", sizes);
      }
      if (id === "makeTest") {
        sizes = read(values);
        await flushEdit();
        const s = sizes;
        const kind = testKind;
        return exclusive(() => makeTestNow(kind, s));
      }
      if (id === "applyFit") return applyFit(values);
      if (id === "replace" && editing !== null && replace) {
        sizes = read(values);
        const s = sizes;
        const target = editing;
        await flushEdit();
        return exclusive(() => generateNow("update", s, target, true));
      }
    }),
});
shown = idsOf(body());

/** Keep the note, the summary and the button saying what Generate will do. */
async function explain() {
  const m = planMetric();
  // Planned once, with its ends, fillers and skin: what cannot be built among them is refused too.
  const all = planCabinet(sizes, m);
  const wrong = all.error;
  const what = phrase(sizes, units.format, m);
  const planned = wrong ? null : all;
  /** @type {Record<string, Record<string, unknown>>} */
  const fields = {
    generate: { label: editing === null ? "Generate cabinet" : "Add another like this", disabled: !!wrong },
    status:
      editing !== null && why
        ? { text: why, tone: "warning" }
        : wrong
          ? { text: editing === null ? wrong : `${wrong} The cabinet keeps its last good build.`, tone: "warning" }
          : editing === null
            ? { text: `Adds ${freeName(sizes.name, taken)}: ${what}${anchor && place !== "apart" ? `, ${place === "right" ? "right of" : place === "left" ? "left of" : "around the corner from"} ${anchor.name}'s row` : ""}.`, tone: "info" }
            : { text: `Editing ${sizes.name}: changes apply as you make them (Ctrl+Z undoes each). Click empty space for a new cabinet.`, tone: "info" },
    summary: { text: planned ? summary(sizes, planned, m) : "" },
  };
  if (editing !== null && replace) fields.replace = { disabled: !!wrong };
  // Each group's heading says what is in it now.
  for (const sec of SECTIONS) if (sec.applies()) fields[sec.id] = { summary: sec.summary() };
  if (view === "secCuts") fields.holes = { rows: planned ? planned.rows : [] };
  if (view === "secTests") explainTests(fields, planned);
  if (view === "secBand") explainBand(fields, planned);
  if (view === "secTrim") {
    const warn = [...trimChecks(sizes, m), ...(editing !== null ? aroundChecks : [])];
    fields.trimChecks = warn.length ? { text: warn.join(" "), tone: "warning" } : { text: editing !== null ? "Nothing to warn of." : "Nothing to warn of in its own settings. The cabinets beside and over its openings are checked once it is made.", tone: "info" };
  }
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

/** Changes to the model under way (a cabinet or frame made, cabinets lined up), and the last
 * one queued: each waits for the one before it. */
let holds = 0;
let chain = /** @type {Promise<unknown>} */ (Promise.resolve());
/**
 * Make a change with no sync in the middle of it: a sync that read the model between the
 * batch and the settings kept for it saw a cabinet with no settings, took it for someone
 * else's, and put the new-cabinet draft in the panel, which the update then kept (a cabinet
 * edited live came out named and sized as the next new one). One at a time, in the order
 * asked: two at once both read the model before either changed it (a double-click on
 * Generate made two cabinets in one place). Waits for a sync running now; syncs asked for
 * meanwhile run once, after.
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function exclusive(fn) {
  holds++;
  const run = chain.then(async () => {
    while (syncing) await syncing;
    return fn();
  });
  chain = run.then(
    () => {},
    () => {},
  );
  try {
    return await run;
  } finally {
    holds--;
    if (!holds && syncAgain) void sync();
  }
}

/** A button press (or the frame tool's click, or the command) being handled: a second one
 * meanwhile is dropped, so a double-click does it once. */
let pressing = false;
/** @template T @param {() => Promise<T>} fn @returns {Promise<T | undefined>} */
async function press(fn) {
  if (pressing) return undefined;
  pressing = true;
  try {
    return await fn();
  } finally {
    pressing = false;
  }
}

/** Why a cabinet is not rebuilt as the panel changes, or null. @param {Focus} f @param {Snapshot} snap */
function whyNot(f, snap) {
  const name = f.node.name ?? "This cabinet";
  if (!f.sizes) return `${name} was made by an older version of this plugin, which did not keep its settings: the panel shows the settings for a new cabinet. Set them to what it should be, then press Replace it with these settings.`;
  if (!rigid(worldOf(snap.byId, f.node.id))) return `${name} was scaled or mirrored by hand, so it cannot be rebuilt from its settings: undo that (or delete it and make it again) to change it here.`;
  return null;
}

/** Edit the cabinet the selection is in, or go back to a new one; then the rows panel. */
async function syncOnce() {
  const snap = await snapshot();
  const f = await focused(snap);
  const id = f ? f.node.id : null;
  const key = f ? f.key : null;
  const { list } = await placed(snap);
  taken = new Set(list.map((c) => c.name));
  // What the cabinets around the edited one's openings, and over them, say (Ends, fillers and openings).
  aroundChecks = id !== null && list.some((c) => c.id === id) ? rowChecks(rowOf(list, id), list, metric()) : [];
  // The last joint ladders added, while they are in the model: what the picks name. This session's
  // record first (its write to the document may have failed), then the document's; one whose
  // ladders are gone (an Undo of the Add, deleted) names nothing.
  const cut = liveLadders(ladderCut, snap.ladders, (id) => snap.byId.get(id)?.kind === "instance");
  if (JSON.stringify(cut) !== JSON.stringify(ladderCut)) {
    ladderCut = cut;
    picks = {};
  }
  // The cabinet a new one goes against: this one, else the last one made or edited (kept in
  // the document only when one is made or rebuilt: a click writes nothing).
  if (id !== null) lastId = id;
  const was = anchor;
  anchor = anchorCabinet(id, snap, list);
  // The Place labels name it: redraw only when that changes. A rebuilt cabinet has a new id
  // and the same name; redrawing then would throw away what is being typed in the panel.
  if (!!was !== !!anchor || was?.name !== anchor?.name) shown = "";
  // Another cabinet, or the same one with other parts (an edit in place undone or redone).
  if (id !== editing || key !== editingKey) {
    const same = id !== null && id === editing;
    // A change still waiting for the cabinet the panel showed is made to that cabinet now.
    if (pending && pending.id !== id) void flushEdit();
    editing = id;
    editingKey = key;
    kept = f?.sizes ?? null;
    keptUnits = f ? f.metric : metric();
    why = f ? whyNot(f, snap) : null;
    replace = f && !f.sizes ? "Replace it with these settings" : null;
    // The same cabinet with a change of the panel's still waiting: what was typed stays.
    if (!(same && pending?.id === id)) sizes = f ? (f.sizes ?? draft) : draft;
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    shown = "";
  }
  await refresh();
  await rowsSync(snap);
}

/** The cabinet selected or worked on last in this session (the document keeps the last made). */
let lastId = /** @type {number | null} */ (null);

/** The cabinet a new one goes against, if it is still in the model: the one edited, else the
 * last one worked on, else the newest kept that is still there (an Undo took the last away).
 * @param {number | null} editingId @param {Snapshot} snap @param {Placed[]} list */
function anchorCabinet(editingId, snap, list) {
  const byId = new Map(list.map((c) => [c.id, c]));
  for (const id of [editingId, lastId, snap.last]) {
    const c = id == null ? undefined : byId.get(id);
    if (c) return { id: c.id, name: c.name };
  }
  const keys = Object.keys(snap.cabinets);
  for (let i = keys.length - 1; i >= 0; i--) {
    const m = /^n(\d+)$/.exec(keys[i]);
    const c = m ? byId.get(Number(m[1])) : undefined;
    if (c) return { id: c.id, name: c.name };
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

/** Add parts to a batch at `frame`, each part's grain and hardware (its `bom`, for the shopping
 * list) set through its first copy; returns the copies, to wrap into a component. Set on the
 * part's component, the hardware is counted once per copy: a copied cabinet doubles it, a
 * deleted one takes it away. @param {import("sawhorse").Batch} batch
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
    if (part.bom?.length) batch.op({ op: "set_bom", part: { node: first }, bom: part.bom });
  }
  return items;
}

/** A rebuilt cabinet or frame keeps what was set on it by hand: its tag, and hidden.
 * @param {import("sawhorse").Batch} batch @param {import("sawhorse").Ref} ref @param {import("sawhorse").Node} was */
function carryOver(batch, ref, was) {
  if (was.tag) batch.setTag([{ node: ref.node }], was.tag);
  if (was.hidden) batch.op({ op: "set_hidden", items: [{ node: ref.node }], hidden: true });
}

/** The open group or component's frame in the model (where new parts are made). */
async function contextFrame() {
  const ctx = (await model.document()).context;
  if (ctx == null) return IDENTITY;
  return worldOf(new Map((await model.nodes()).map((n) => [n.id, n])), ctx);
}

/** Whether the selection now is all in one node (the cabinet or frame about to be rebuilt): it
 * is selected again once rebuilt. Not when nothing is selected (empty space was clicked
 * meanwhile), or something else is. @param {Snapshot} snap @param {number} id */
async function selectedIn(snap, id) {
  const sel = await model.selection();
  if (!sel.length) return false;
  for (const it of sel) {
    const start = it.kind === "instance" || it.kind === "group" ? it.id : it.kind === "solid" ? ((await model.solid(it.id))?.parent ?? null) : it.kind === "face" ? ((await model.solid(it.solid))?.parent ?? null) : null;
    let n = start == null ? undefined : snap.byId.get(start);
    while (n && n.id !== id) n = n.parent == null ? undefined : snap.byId.get(n.parent);
    if (!n) return false;
  }
  return true;
}

/** The open group or component and each one holding it, innermost first. @param {Snapshot} snap */
function openPath(snap) {
  const out = [];
  for (let n = snap.context == null ? undefined : snap.byId.get(snap.context); n; n = n.parent == null ? undefined : snap.byId.get(n.parent)) out.push(n);
  return out;
}

/** What the plugin did not make inside a cabinet or frame (it is rebuilt from its settings,
 * and these would go with it), named: nodes not among the parts it was made with, and, when
 * the whole instance is replaced, solids drawn straight into it.
 * @param {Snapshot} snap @param {import("./keep.js").Stamp} stamp @param {number} id @param {boolean} solidsToo */
async function strangersIn(snap, stamp, id, solidsToo) {
  const out = strangers(stamp, snap.kids.get(id) ?? []).map((c) => snap.byId.get(c)?.label ?? "a group");
  if (solidsToo && typeof stamp.p === "number") for (const sol of await model.solids()) if (sol.parent === id) out.push("a solid");
  return out;
}
/** "Cabinet 1 holds a solid and Drawer this plugin did not make" and the rest. @param {string} name @param {string[]} what @param {string} out the way to rebuild anyway */
function holdsText(name, what, out) {
  const list = what.length > 3 ? `${what.slice(0, 3).join(", ")} and ${what.length - 3} more` : what.join(", ");
  return `${name} holds ${what.length === 1 ? "something" : `${what.length} things`} this plugin did not make (${list}): rebuilding it would delete ${what.length === 1 ? "it" : "them"}. Move ${what.length === 1 ? "it" : "them"} out first, or ${out}.`;
}

let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** A change made in the panel, not yet built: the cabinet it is for (its id, which follows it
 * through rebuilds), the settings, and the document it was made in. Bound to its cabinet, not
 * to the panel: a click on another cabinet before it is built does not lose it, or send it
 * there. @type {{ id: number, sizes: Sizes, doc: number } | null} */
let pending = null;
/** Changes handed on to be built and not built yet (their ids follow rebuilds, as pending's). */
const queued = /** @type {Set<{ id: number, sizes: Sizes, doc: number }>} */ (new Set());
/** Counts documents opened: a change made in one is never built in the next. */
let docCount = 0;
/** A cabinet rebuilt from outside has a new id: what is waiting for it follows. @param {number} from @param {number} to */
function retarget(from, to) {
  if (pending && pending.id === from) pending.id = to;
  for (const q of queued) if (q.id === from) q.id = to;
}
/** Rebuild the cabinet being edited a moment after the last change. */
function liveUpdate() {
  if (editing === null) return;
  pending = { id: editing, sizes, doc: docCount };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushEdit(), 250);
}
/** Build the change waiting now, if any (after whatever is being built). */
function flushEdit() {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = pending;
  pending = null;
  if (!p) return Promise.resolve();
  queued.add(p);
  return exclusive(async () => {
    if (p.doc === docCount) await generateNow("update", p.sizes, p.id);
  })
    .catch((e) => ui.notify(`Could not update the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" }))
    .finally(() => queued.delete(p));
}

/** A change to a cabinet was refused: the panel goes back to what the model is. @param {number} id */
async function restore(id) {
  if (pending && pending.id === id) {
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }
  if (editing === id && kept) {
    sizes = kept;
    shown = "";
  }
  await syncOnce();
}

/**
 * Make a new cabinet beside the model. One batch, one undo step: the parts at the top level
 * (so each part's grain is set through its instance), then wrapped into the cabinet's component.
 * @param {"new"} mode @param {Sizes} s
 */
function generate(mode, s) {
  return exclusive(() => generateNow(mode, s));
}

/**
 * Make a cabinet: a new one, or `target` again in its place (one undo step either way). A
 * cabinet open for editing (double-clicked) is rebuilt from inside instead: new parts in, old
 * parts out, the same cabinet.
 * @param {"new" | "update"} mode @param {Sizes} s the settings, read once
 * @param {number | null} [target] the cabinet to rebuild
 * @param {boolean} [force] rebuild it although its settings were never kept, or it holds what the plugin did not make
 */
async function generateNow(mode, s, target = null, force = false) {
  const snap = await snapshot();
  /** @type {Focus | null} */
  let f0 = null;
  if (mode === "update") {
    const node = target == null ? undefined : snap.byId.get(target);
    f0 = node ? focusOf(snap, node) : null;
    // Gone (deleted, or undone): nothing to update.
    if (!f0) return;
  }
  const own = f0 ? f0.node : null;
  // A cabinet is planned in its own units, whatever the document's are now.
  const m = f0 ? f0.metric : metric();
  const planned = planCabinet(s, m);
  if (planned.error) {
    // A live change that cannot be made: the panel's note says why.
    if (mode === "new" || force) await ui.notify(planned.error, { kind: "warning" });
    return;
  }
  const path = openPath(snap);
  const inside = !!own && snap.context === own.id;
  const { list } = await placed(snap);
  if (own && f0) {
    const refuse = async (/** @type {string} */ text) => {
      await ui.notify(text, { kind: "warning" });
      await restore(own.id);
    };
    // Open deeper than the cabinet (a part of it double-clicked): it cannot be rebuilt from there.
    if (!inside && path.some((n) => n.id === own.id)) return refuse("Leave the part (Esc) to change the cabinet.");
    const scaled = whyNot(f0, snap);
    if (scaled && f0.sizes) return refuse(scaled);
    if (!f0.sizes && !force) return;
    if (!force && f0.kept) {
      // The parts of the instance the entry is kept under (a copy's are the same, by their component).
      const extra = await strangersIn(snap, f0.kept, f0.owner, !inside);
      if (extra.length) {
        const text = holdsText(own.name ?? s.name, extra, "press Rebuild it anyway");
        if (editing === own.id) {
          why = text;
          replace = "Rebuild it anyway";
          shown = "";
        }
        await ui.notify(text, { kind: "warning" });
        await refresh();
        return;
      }
    }
    // Open, a wider or narrower cabinet would move the cabinets right of it: they are not in it.
    if (inside && f0.sizes && Math.abs(s.width - f0.sizes.width) > 1e-9 && rightOf(list, own.id).length) return refuse("Close the cabinet (Esc) to change its width: the cabinets right of it move with it.");
    // So would what stands beside it (a filler, an end panel, an opening): one on its left moves the cabinet itself.
    if (inside && f0.sizes) {
      const was = { ends: trimEnds(f0.sizes) };
      const now = { ends: trimEnds(s) };
      const moves = Math.abs(reach(now, "left") - reach(was, "left")) > 1e-9 || (Math.abs(reach(now, "right") - reach(was, "right")) > 1e-9 && rightOf(list, own.id).length);
      if (moves) return refuse("Close the cabinet (Esc) to change what stands beside it: the cabinet, or the cabinets right of it, move with it.");
    }
  } else {
    // Made in the open context, a new cabinet inside one of ours would go with it at its next rebuild.
    const holder = path.find((n) => focusOf(snap, n) || baseOf(snap, n));
    if (holder) {
      await ui.notify(`Leave ${holder.name ?? holder.label} first (Esc): a new cabinet cannot be made inside a cabinet or a base frame.`, { kind: "warning" });
      return;
    }
  }
  const name = mode === "new" ? (editing !== null ? nextName(s.name, new Set(list.map((c) => c.name))) : freeName(s.name, new Set(list.map((c) => c.name)))) : s.name;
  const made = { ...s, name };
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
      // A wider or narrower one moves the cabinets right of it in its row along with its side,
      // and so does more or less beside it (a filler, an end panel, an opening). More or less on
      // its left moves the cabinet itself, and those right of it, by that much.
      const was = { ends: trimEnds(old) };
      const now = { ends: trimEnds(made) };
      const dl = reach(now, "left") - reach(was, "left");
      const dw = dl + made.width + reach(now, "right") - old.width - reach(was, "right");
      if (Math.abs(dl) > 1e-9) frame = compose(frame, translation([dl, 0, 0]));
      if (Math.abs(dw) > 1e-9) {
        const me = list.find((c) => c.id === own.id);
        if (me) for (const c of rightOf(list, own.id)) batch.transform([{ node: c.id }], slide(c.parent, applyVector(me.world, [dw, 0, 0])));
      }
    }
  } else {
    const at = anchor && place !== "apart" ? list.find((c) => c.id === anchor?.id) : undefined;
    if (at && place !== "apart") {
      // Against the anchor's row, at the end the place names.
      const row = rowOf(list, at.id);
      const end = place === "right" || place === "cornerRight" ? row[row.length - 1] : row[0];
      frame = compose(invert(await contextFrame()), placeNext(end, { ...made, ends: trimEnds(made) }, place, filler));
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
    const old = (snap.kids.get(own.id) ?? []).map((c) => ({ node: c }));
    if (old.length) {
      const g = batch.op({ op: "make_group", items: old });
      batch.op({ op: "delete_node", node: g.get("group") });
    }
  } else {
    cabinet = batch.makeComponent(items, label);
    batch.rename({ node: cabinet.node }, name);
    if (own) {
      carryOver(batch, cabinet, own);
      batch.delete({ node: own.id });
    }
  }
  // Rebuilt from outside, the cabinet gets a component of its own: its copies keep the old one,
  // and go on as cabinets with the settings it had.
  const adopt = own && f0?.kept && !inside && f0.owner === own.id && own.definition != null ? (snap.copies.get(own.definition) ?? []).filter((c) => c !== own.id) : [];
  // Selected now, it is selected again once rebuilt.
  const reselect = !!own && !!cabinet && (await selectedIn(snap, own.id));
  /** @type {import("sawhorse").BatchResult} */
  let result;
  try {
    result = await batch.commit();
  } catch (e) {
    await ui.notify(`Could not ${own ? "update" : "make"} the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    if (own) await restore(own.id);
    else await syncOnce();
    return;
  }
  const id = cabinet ? /** @type {number} */ (result.value(cabinet.node)) : /** @type {number} */ (own?.id);
  // Selected before the panels say so: a click on empty space after the message is never
  // undone by the selection landing after it. A rebuilt cabinet is selected again only if it
  // was selected as it was rebuilt, and nothing else is selected since; at once, so a click
  // elsewhere just after is not overridden (no sync runs meanwhile: it waits for this).
  if (cabinet && (!own || (reselect && (await model.selection()).every((it) => it.kind === "instance" && it.id === own.id)))) await model.select([{ kind: "instance", id }]);
  // Open, the entry stays with the instance it is kept under (a copy opened changes the cabinet's component).
  const holder = cabinet || !f0 ? id : f0.owner;
  const kids = childrenOf(await model.nodes());
  // A new component's own coordinates are the model's: its origin is where the parts went.
  const mine = entry(made, m, frame, kids.get(holder) ?? []);
  /** @type {[number, Kept][]} */
  const keepList = [[holder, mine]];
  if (f0?.kept) {
    const { p: _p, n: _n, k: _k, ...was } = f0.kept;
    for (const c of adopt) if (kids.has(c)) keepList.push([c, { ...was, ...stampOf(kids.get(c) ?? []) }]);
  }
  await rememberOrWarn(name, keepList);
  if (own) {
    retarget(own.id, id);
    if (editing === own.id) {
      // Still the cabinet the panel shows: it is what was built (what is typed meanwhile stays).
      editing = id;
      editingKey = `n${holder}|${mine.p ?? ""}`;
      kept = made;
      why = null;
      replace = null;
      shown = "";
    }
    // Rebuilt, it has a new id: new cabinets still go against it.
    lastId = id;
    await storage.document.set(LAST, id);
  } else {
    // The next new cabinet gets the next number ("Base 1", then "Base 2"), and goes against this one.
    draft = { ...made, name: nextName(name, new Set([...list.map((c) => c.name), name])) };
    void storage.app.set("sizes", draft);
    lastId = id;
    await storage.document.set(LAST, id);
    // Around a corner, the row goes on down the new wall: right of a right turn, left of a left one.
    if (turned) {
      place = turned;
      void storage.app.set("place", place);
    }
  }
  await syncOnce();
  if (!own) {
    const parts = planned.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
    await ui.notify(`Made ${name}: ${parts}. It is selected, so changes now apply to it; click empty space for a new cabinet.`);
  }
}

// --- rows and base frames -------------------------------------------------------------------
//
// A second panel. Select a cabinet: it names the row the cabinet stands in (cabinets side by
// side, backs in line) and plans the base frame for it, with its cut list; select several to
// line them up. Select a base frame: its own settings, every change rebuilding it in place.

/** @typedef {import("./row.js").BaseSizes} BaseSizes */
/** Each base frame's settings and frame (as a cabinet's), the row it was made for (its
 * length, depth and fingerprint), and the parts it was made with (keep.js), by instance id,
 * in the document.
 * @typedef {{ sizes: Partial<BaseSizes>, frame: Frame, length: number, depth: number, fit: string, p?: number, n?: number, k?: number[] }} KeptBase */
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
  await storage.document.set(BASES, prune(all, liveKeysOf(all, await model.nodes()), BUDGET.bases));
}
/** What is kept for an instance, if it is a base frame of ours (made with the parts it holds).
 * @param {Snapshot} snap @param {import("sawhorse").Node} node @returns {KeptBase | null} */
function baseOf(snap, node) {
  const kept = node.kind === "instance" ? snap.bases[`n${node.id}`] : undefined;
  return kept && typeof kept === "object" && describes(kept, snap.kids.get(node.id) ?? []) ? kept : null;
}

/** A base frame of ours where it stands. @typedef {{ id: number, node: import("sawhorse").Node, sizes: BaseSizes, world: Frame, kept: KeptBase }} PlacedBase */
/** @param {Map<number, import("sawhorse").Node>} byId @param {Snapshot} snap */
async function placedBases(byId, snap) {
  /** @type {PlacedBase[]} */
  const out = [];
  for (const key of Object.keys(snap.bases)) {
    const node = byId.get(Number(key.slice(1)));
    const kept = node ? baseOf(snap, node) : null;
    if (!node || !kept) continue;
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
  out.push(pick("skin", "Toe-kick skin", b.skin, [["none", "None"], ["carcass", "Carcass plywood"], ["doors", "Door plywood"], ["back", "Back plywood"]]));
  if (b.skin !== "none") out.push(help(`A strip of the row's first cabinet's stock in front of each front rail, as long and as tall. KCMA A161.1 asks a toe kick to be at least ${metric() ? `${KCMA.height.mm} mm` : `${KCMA.height.in} in`} high and ${metric() ? `${KCMA.depth.mm} mm` : `${KCMA.depth.in} in`} deep: less is warned of, never refused.`));
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

/** Whether anything stands beside a cabinet of the row (an end panel, a filler, an opening). @param {Placed[]} row */
const hasPieces = (row) => row.some((c) => c.ends && (c.ends.left.length || c.ends.right.length));

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
  // What stands beside the cabinets (end panels, fillers, openings), along the row, and what its checks say.
  if (hasPieces(v.row)) out.push({ type: "table", id: "rowItems", columns: ["Along the row", "What", "From", "Width"], rows: [], align: ["left", "left", "right", "right"] });
  out.push({ type: "note", id: "rowChecks", text: "" });
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

/** The stock a base frame's toe-kick skin is cut from: the row's first cabinet's carcass, door or
 * back plywood (its measured thickness), or none. @param {Placed[]} row @param {BaseSizes} b */
const skinOf = (row, b) => {
  if (b.skin === "none" || !row[0]) return undefined;
  const s0 = row[0].sizes;
  const of = b.skin === "back" ? MATERIALS.back : b.skin === "doors" ? MATERIALS.doors : MATERIALS.carcass;
  return { thickness: b.skin === "back" ? s0.backThickness : s0.thickness, material: of.name, of };
};

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
    const x0 = lay.items.length ? lay.items[0].x0 : 0;
    const word = { cabinet: "Cabinet", panel: "End panel", filler: "Filler", opening: "Opening" };
    // The table is there only when something stands beside a cabinet (rowsBody).
    if (hasPieces(row)) fields.rowItems = { rows: lay.items.map((it) => [it.label, it.kind === "cabinet" ? word.cabinet : `${word[it.kind]}, ${it.side} of ${row[it.cab].name}`, f(it.x0 - x0), f(it.x1 - it.x0)]) };
  }
  {
    const warn = row.length ? rowChecks(row, (await placed()).list, metric()) : [];
    // KCMA's least toe space, against a frame with a skin (and no frame for this row yet, or this frame).
    const skin = !(v.kind === "row" && v.base) ? skinOf(row, baseSizes) : undefined;
    if (skin) {
      const m = metric();
      const h = m ? KCMA.height.mm * MM : KCMA.height.in * IN;
      const d = m ? KCMA.depth.mm * MM : KCMA.depth.in * IN;
      if (baseSizes.height < h - 1e-6) warn.push(`The frame is ${f(baseSizes.height)} tall: KCMA A161.1 asks a toe kick to be at least ${m ? `${KCMA.height.mm} mm` : `${KCMA.height.in} in`} high.`);
      if (baseSizes.setback - skin.thickness < d - 1e-6 && baseSizes.setback - skin.thickness > 0) warn.push(`With the skin on, the toe space is ${f(baseSizes.setback - skin.thickness)} deep: KCMA A161.1 asks for at least ${m ? `${KCMA.depth.mm} mm` : `${KCMA.depth.in} in`}.`);
    }
    fields.rowChecks = warn.length ? { text: warn.join(" "), tone: "warning" } : { text: "" };
  }
  if (!(v.kind === "row" && v.base)) {
    /** @type {ReturnType<typeof planBase> | null} */
    let p = null;
    /** Why planning failed outright (a row the plan's checks did not foresee), or null. */
    let broke = null;
    try {
      if (row.length) p = planBase(row, baseSizes, undefined, skinOf(row, baseSizes));
    } catch (e) {
      broke = `A base frame cannot be planned for this row: ${e instanceof Error ? e.message : String(e)}`;
    }
    /** @type {Record<string, unknown>} */
    let status;
    if (broke) status = { text: broke, tone: "warning" };
    else if (!p) status = { text: "Select the row's cabinets to make a frame for them.", tone: "warning" };
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
        const held = baseHeld.get(v.base.id);
        fields.refit = { disabled: !stale && !held };
        status = held ? { text: held, tone: "warning" } : stale ? { text: "The row has changed since this frame was made: Fit to the row again.", tone: "warning" } : { text: `${parts.join(" ")} Changes apply as you make them (Ctrl+Z undoes each).`, tone: "info" };
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

/** The base frame the fields show (its id), or null for a new frame's. */
let editingBase = /** @type {number | null} */ (null);
/** The selection moved or the model changed: show the row or the base frame it is in. */
async function rowsSync(/** @type {Snapshot} */ snap) {
  if (!rowsReady) return;
  rowView = await rowFocus(snap);
  const isBase = rowView.kind === "base" ? rowView.base.id : null;
  // Another frame (a frame rebuilt for a change made here keeps what is typed meanwhile).
  if (isBase !== editingBase) {
    // A change still waiting for the frame the fields showed is made to that frame now.
    if (pendingBase && pendingBase.id !== isBase) void flushBase();
    editingBase = isBase;
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
  onAction: (id) =>
    press(async () => {
      const v = rowView;
      if (id === "lineUp" && v.kind === "row") return lineUpCabinets(v.selected.map((c) => c.id));
      if (id === "selectBase" && v.kind === "row" && v.base) return model.select([{ kind: "instance", id: v.base.id }]);
      if (id === "makeBase" && v.kind === "row") return buildBase({ kind: "make", sizes: baseSizes });
      if (id === "refit" && v.kind === "base") {
        // A change waiting for this frame is made by the refit itself.
        if (pendingBase?.id === v.base.id) {
          pendingBase = null;
          if (baseTimer) clearTimeout(baseTimer);
          baseTimer = null;
        }
        return buildBase({ kind: "refit", id: v.base.id, sizes: baseSizes });
      }
      if (id === "previewBase" && (v.kind === "row" || v.kind === "base")) return ui.activateTool("frame");
    }),
});
rowsShown = idsOf(rowsBody());
rowsReady = true;

let baseTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** A change made to a base frame's fields, not yet built: bound to its frame (its id follows
 * rebuilds), as a cabinet's. @type {{ id: number, sizes: BaseSizes, doc: number } | null} */
let pendingBase = null;
const queuedBase = /** @type {Set<{ id: number, sizes: BaseSizes, doc: number }>} */ (new Set());
/** Frames not rebuilt for holding what the plugin did not make, with what the panel says. */
const baseHeld = /** @type {Map<number, string>} */ (new Map());
/** Rebuild the selected base frame a moment after the last change. */
function liveBase() {
  if (rowView.kind !== "base") return;
  pendingBase = { id: rowView.base.id, sizes: baseSizes, doc: docCount };
  if (baseTimer) clearTimeout(baseTimer);
  baseTimer = setTimeout(() => void flushBase(), 250);
}
/** Build the base frame change waiting now, if any (after whatever is being built). */
function flushBase() {
  if (baseTimer) clearTimeout(baseTimer);
  baseTimer = null;
  const p = pendingBase;
  pendingBase = null;
  if (!p) return Promise.resolve();
  queuedBase.add(p);
  return exclusive(async () => {
    if (p.doc === docCount) await buildBaseNow({ kind: "update", id: p.id, sizes: p.sizes });
  })
    .catch((e) => ui.notify(`Could not update the base frame: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" }))
    .finally(() => queuedBase.delete(p));
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
    if (v.kind === "row" && !v.base && plannedNow) await press(() => buildBase({ kind: "make", sizes: baseSizes }));
  },
});

/** Butt the selected cabinets into one row: one undo step. @param {number[]} ids */
function lineUpCabinets(ids) {
  return exclusive(() => lineUpNow(ids));
}
/** @param {number[]} ids */
async function lineUpNow(ids) {
  // Where they stand now, not when the button was pressed: one press lines them up once.
  const { list } = await placed(await snapshot());
  const selected = list.filter((c) => ids.includes(c.id));
  if (selected.length < 2) return;
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
 * @typedef {{ kind: "make", sizes: BaseSizes } | { kind: "refit" | "update", id: number, sizes: BaseSizes }} BaseJob
 * @param {BaseJob} job
 */
function buildBase(job) {
  return exclusive(() => buildBaseNow(job));
}
/** @param {BaseJob} job */
async function buildBaseNow(job) {
  const b = job.sizes;
  // The row and its frame as they are now, not when the change was asked for: a second press
  // finds the frame made, and a change waiting for a frame rebuilt since finds its new id.
  const snap = await snapshot();
  const { list, byId } = await placed(snap);
  /** @type {PlacedBase | null} */
  let old = null;
  /** @type {Placed[]} */
  let row = [];
  if (job.kind === "make") {
    const v = await rowFocus(snap);
    if (v.kind !== "row" || v.base) return;
    row = v.row;
  } else {
    old = (await placedBases(byId, snap)).find((x) => x.id === job.id) ?? null;
    if (!old) return;
    const base = old;
    const on = list.find((c) => standsOn(base, c));
    row = on ? rowOf(list, on.id) : [];
  }
  if (!row.length) return;
  /** @param {string} text */
  const refuse = async (text) => {
    await ui.notify(text, { kind: "warning" });
    // The fields go back to what the frame is.
    if (old && editingBase === old.id) {
      baseSizes = old.sizes;
      rowsShown = "";
    }
    await syncOnce();
  };
  // Made in the open context, a frame inside one of ours would go with it at its next rebuild.
  const holder = openPath(snap).find((n) => focusOf(snap, n) || baseOf(snap, n));
  if (holder) return refuse(`Leave ${holder.name ?? holder.label} first (Esc): a base frame cannot be made or changed inside a cabinet or a base frame.`);
  const p = planBase(row, b, undefined, skinOf(row, b));
  if (p.error) return refuse(p.error);
  const ctxId = snap.context;
  const kicks = row.filter((c) => c.sizes.base === "toekick");
  const nested = kicks.find((c) => c.node.parent !== ctxId);
  if (nested) return refuse(`${nested.name} has a toe kick and is inside a group: open the group, or take it out, to rebuild it without its kick.`);
  for (const c of kicks) {
    if (!rigid(worldOf(byId, c.id))) return refuse(`${c.name} was scaled or mirrored by hand, so it cannot be rebuilt without its toe kick: undo that first.`);
    const extra = await strangersIn(snap, c.kept, c.owner, true);
    if (extra.length) return refuse(holdsText(c.name, extra, "make it with no toe kick yourself"));
  }
  if (old && job.kind === "update") {
    const extra = await strangersIn(snap, old.kept, old.id, true);
    if (extra.length) {
      const text = holdsText(old.node.name ?? "This base frame", extra, "press Fit to the row again to rebuild it anyway");
      baseHeld.set(old.id, text);
      await ui.notify(text, { kind: "warning" });
      await syncOnce();
      return;
    }
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
      // Planned in the cabinet's own units, as an edit of it would be.
      const planned = planCabinet(s, c.metric);
      if (planned.error) return refuse(`${c.name} without its toe kick: ${planned.error}`);
      // Its origin goes from the floor to the frame's top: the box stays put when the frame is its kick tall.
      const frame = compose(invert(ctx), compose(translation(up), c.world));
      const items = addParts(batch, planned.parts, frame, add(Object.values(MATERIALS)));
      const ref = batch.makeComponent(items, `${s.name} ${f(s.width)} x ${f(s.height)} x ${f(s.depth)}`);
      batch.rename({ node: ref.node }, c.name);
      carryOver(batch, ref, c.node);
      rebuilt.push({ c, s, frame, ref });
    } else if (Math.abs(up[0]) + Math.abs(up[1]) + Math.abs(up[2]) > 1e-9) batch.transform([{ node: c.id }], slide(c.parent, up));
  }
  // A new frame is numbered after the frames in the model, with a name not in use.
  const frames = await placedBases(byId, snap);
  const name = old?.node.name ?? freeName(`Base frame ${frames.length + 1}`, new Set(frames.map((x) => x.node.name ?? "")));
  const frame = compose(invert(ctx), baseWorld);
  const skin = skinOf(row, b);
  const items = addParts(batch, p.parts, frame, add([...(b.stock === "lumber" ? [BASE_LUMBER] : [MATERIALS.carcass]), ...(skin ? [skin.of] : [])]));
  const ref = batch.makeComponent(items, `${name} ${f(p.length)}`);
  batch.rename({ node: ref.node }, name);
  if (old) carryOver(batch, ref, old.node);
  // The old frame and the old cabinets go last (as in generate).
  if (old) batch.delete({ node: old.id });
  for (const r of rebuilt) batch.delete({ node: r.c.id });
  // A cabinet rebuilt without its kick gets a component of its own: its copies not in this
  // row keep the old one, and go on as cabinets with the settings it had.
  const rebuiltIds = new Set(rebuilt.map((r) => r.c.id));
  const adopt = rebuilt.flatMap((r) => (r.c.owner === r.c.id && r.c.node.definition != null ? (snap.copies.get(r.c.node.definition) ?? []).filter((x) => !rebuiltIds.has(x)).map((x) => /** @type {[number, Kept]} */ ([x, r.c.kept])) : []));
  const reselect = !!old && (await selectedIn(snap, old.id));
  /** @type {import("sawhorse").BatchResult} */
  let result;
  try {
    result = await batch.commit();
  } catch (e) {
    await ui.notify(`Could not ${old ? "update" : "make"} the base frame: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    if (old && editingBase === old.id) {
      baseSizes = old.sizes;
      rowsShown = "";
    }
    await syncOnce();
    return;
  }
  const id = /** @type {number} */ (result.value(ref.node));
  // A new frame is selected (it says so); a rebuilt one again only if it was selected as it was
  // rebuilt, and nothing else is selected since (at once, as a cabinet).
  if (!old || (reselect && (await model.selection()).every((it) => it.kind === "instance" && it.id === old?.id))) await model.select([{ kind: "instance", id }]);
  const kids = childrenOf(await model.nodes());
  const last = await storage.document.get(LAST);
  /** @type {[number, Kept][]} */
  const keepList = [];
  for (const r of rebuilt) {
    const id = /** @type {number} */ (result.value(r.ref.node));
    keepList.push([id, entry(r.s, r.c.metric, r.frame, kids.get(id) ?? [])]);
    retarget(r.c.id, id);
    if (last === r.c.id) await storage.document.set(LAST, id);
    if (lastId === r.c.id) lastId = id;
  }
  for (const [x, was] of adopt) {
    const { p: _p, n: _n, k: _k, ...rest } = was;
    if (kids.has(x)) keepList.push([x, { ...rest, ...stampOf(kids.get(x) ?? []) }]);
  }
  if (keepList.length) await rememberOrWarn(rebuilt.map((r) => r.c.name).join(", ") || "The cabinet", keepList);
  try {
    await rememberBase(id, { sizes: b, frame, length: p.length, depth: p.depth, fit: fingerprint(row), ...stampOf(kids.get(id) ?? []) });
  } catch (e) {
    await ui.notify(`${name} is made, but its settings could not be kept in the document (${e instanceof Error ? e.message : String(e)}): it will not be edited as a base frame.`, { kind: "warning" });
  }
  if (old) {
    baseHeld.delete(old.id);
    // A change typed while this one was built goes to the new frame, and the fields keep it.
    for (const q of [pendingBase, ...queuedBase]) if (q && q.id === old.id) q.id = id;
    if (editingBase === old.id) editingBase = id;
  }
  await syncOnce();
  if (!old) await ui.notify(`Made ${name} under ${row.length} ${row.length === 1 ? "cabinet" : "cabinets"}: ${p.ladders} ${p.ladders === 1 ? "ladder" : "ladders"}, ${p.sleepers} sleepers. It is selected: its cut list is in Rows and base frames, and changes apply to it.`);
}

await ui.registerCommand({
  id: "generate",
  run: () =>
    press(async () => {
      await flushEdit();
      return generate("new", sizes);
    }),
});
events.on("selectionChanged", () => sync());
events.on("documentChanged", () => sync());
events.on("documentOpened", () => {
  // Ids start over in another document: nothing of this one's is carried into it.
  docCount++;
  pending = null;
  pendingBase = null;
  if (timer) clearTimeout(timer);
  if (baseTimer) clearTimeout(baseTimer);
  timer = baseTimer = null;
  lastId = null;
  editing = null;
  editingKey = null;
  editingBase = null;
  baseHeld.clear();
  picks = {};
  return sync();
});
// Lengths in the summaries and the rows panel are in the document's units: say them again.
events.on("unitsChanged", () => {
  shown = "";
  rowsShown = "";
  lastSent.clear();
  return sync();
});
await sync();
