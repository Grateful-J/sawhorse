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

/** @typedef {{ linear: number[][], translation: [number, number, number] }} Frame */
/** @type {Frame} */
const IDENTITY = { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0] };
/** a after b. @param {Frame} a @param {Frame} b @returns {Frame} */
const compose = (a, b) => ({
  linear: a.linear.map((row) => [0, 1, 2].map((c) => row[0] * b.linear[0][c] + row[1] * b.linear[1][c] + row[2] * b.linear[2][c])),
  translation: /** @type {[number, number, number]} */ ([0, 1, 2].map((r) => a.linear[r][0] * b.translation[0] + a.linear[r][1] * b.translation[1] + a.linear[r][2] * b.translation[2] + a.translation[r])),
});

/** Each cabinet's settings and frame (where its own origin is, in its component's
 * coordinates), by instance id ("n12"), in the document. Old ids stay, so an undone update
 * finds its cabinet again; the 200 newest are kept.
 * @typedef {{ sizes: Partial<Sizes>, frame: Frame }} Kept */
const CABINETS = "cabinets";
async function cabinets() {
  return /** @type {Record<string, Kept>} */ ((await storage.document.get(CABINETS)) ?? {});
}
/** @param {number} id @param {Sizes} s @param {Frame} frame */
async function remember(id, s, frame) {
  const all = await cabinets();
  delete all[`n${id}`];
  all[`n${id}`] = { sizes: s, frame };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
  await storage.document.set(CABINETS, all);
}

/** The cabinet of ours the selection is in (or, with nothing selected, the one open for
 * editing), with its settings; null when the selection is anything else. */
async function focused() {
  const all = await cabinets();
  // A document from before settings were kept per cabinet names its one cabinet.
  const legacy = /** @type {number | null} */ (await storage.document.get("cabinet"));
  const ours = (/** @type {number} */ id) => all[`n${id}`] !== undefined || id === legacy;
  const nodes = await model.nodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** @param {number | null | undefined} id */
  const climb = (id) => {
    for (let n = id == null ? undefined : byId.get(id); n; n = n.parent == null ? undefined : byId.get(n.parent)) if (n.kind === "instance" && ours(n.id)) return n;
    return null;
  };
  const sel = await model.selection();
  /** @type {import("sawhorse").Node | null} */
  let hit = null;
  for (const it of sel) {
    let start = /** @type {number | null} */ (null);
    if (it.kind === "instance" || it.kind === "group") start = it.id;
    else if (it.kind === "solid") start = (await model.solid(it.id))?.parent ?? null;
    else if (it.kind === "face") start = (await model.solid(it.solid))?.parent ?? null;
    const n = climb(start);
    // Anything else in the selection, or two cabinets: not one cabinet to edit.
    if (!n || (hit && hit.id !== n.id)) return null;
    hit = n;
  }
  if (!sel.length) hit = climb((await model.document()).context);
  // A cabinet made before frames were kept was one assembly: its parts sit at its origin.
  return hit ? { node: hit, sizes: all[`n${hit.id}`]?.sizes ?? null, frame: all[`n${hit.id}`]?.frame ?? IDENTITY } : null;
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
  for (const k of ["preset", "view", "joinery", "backType", ...SECTIONS.map((x) => x.id)]) delete v[k];
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
        ? { text: `Adds ${sizes.name}: ${what}.`, tone: "info" }
        : { text: `Editing ${sizes.name}: changes apply as you make them (Ctrl+Z undoes each). Click empty space for a new cabinet.`, tone: "info" },
    summary: { text: planned ? summary(sizes, planned, metric()) : "" },
  };
  // Each group's heading says what is in it now.
  for (const sec of SECTIONS) if (sec.applies()) fields[sec.id] = { summary: sec.summary() };
  if (view === "secCuts") fields.holes = { rows: planned ? planned.rows : [] };
  await panel.update({ fields });
}

/** The selection moved: edit the cabinet it is in, or go back to a new one. */
async function sync() {
  const f = await focused();
  const id = f ? f.node.id : null;
  if (id !== editing) {
    editing = id;
    sizes = f ? normalize(f.sizes ?? sizes, metric()) : draft;
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    shown = "";
    await refresh();
  } else await explain();
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
async function generate(mode = "new") {
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
  if (own && f0) frame = inside ? f0.frame : compose(/** @type {Frame} */ (own.transform), f0.frame);
  else {
    const b = await model.bounds();
    frame = { ...IDENTITY, translation: b ? [b.max[0] + (metric() ? 50 * MM : 2 * IN), b.min[1], 0] : [0, 0, 0] };
  }
  // Define only the materials the model lacks, so a stock chosen for one is kept.
  const have = new Set((await model.materials()).map((m) => m.name));
  const materials = Object.values(MATERIALS).filter((m) => !have.has(m.name));
  const imported = batch.op(flatImportOp(planned.parts, frame, materials));
  /** @type {import("sawhorse").Item[]} */
  const items = [];
  let k = 0;
  for (const part of planned.parts) {
    const first = imported.get(`groups.${k}`);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: imported.get(`groups.${k++}`) });
    // "length" is every part's grain until said otherwise.
    if (part.grain !== "length") batch.op({ op: "set_grain", part: { node: first }, grain: part.grain });
  }
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
    await remember(id, made, frame);
    if (own) {
      editing = id;
    } else {
      // The next new cabinet gets the next number ("Base 1", then "Base 2").
      draft = { ...made, name: nextName(name) };
      void storage.app.set("sizes", draft);
      const list = planned.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
      await ui.notify(`Made ${name}: ${list}. It is selected, so changes now apply to it; click empty space for a new cabinet.`);
    }
    if (cabinet) await model.select([{ kind: "instance", id }]);
  } catch (e) {
    await ui.notify(`Could not ${own ? "update" : "make"} the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
  }
  await sync();
}

await ui.registerCommand({ id: "generate", run: () => generate("new") });
events.on("selectionChanged", () => sync());
events.on("documentChanged", () => sync());
events.on("documentOpened", () => sync());
await sync();
