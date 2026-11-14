// @ts-check
// Cabinet generator: a frameless cabinet from its sizes, ready for a CNC router.
//
// The panel starts small, like a cabinet shop's order form: a starting point (base, drawer
// base, sink base, wall, ...), the name and sizes, the style, two switches (hidden dados,
// hardware holes) and Generate, with one line on what it comes to. The details are one group
// at a time under "Details": construction, stock, fronts and hardware, drawer runners, and
// every cut. A field shows only when it applies (no toe kick, no toe kick height).
//
// Joinery is butt joints or blind ("hidden") dados cut to the measured stock thickness plus a
// fit. Layouts add a door (a pair over 24 in), drawer boxes on Blum TANDEM 563H or MOVENTO
// 763H runners, or both. Hardware holes are drilled into the parts so the DXF carries them;
// holes a router cannot reach are listed for a jig. Every part is a named component on a
// plywood material, so the cut list nests it as sheet goods. The whole cabinet is one batch,
// so one Ctrl+Z takes it away. Generating again while the cabinet this plugin made is
// selected replaces it in place.
//
// Sizes are metres inside; the panel shows and reads them in the document's units.
import { events, model, storage, ui, units } from "sawhorse";
import { applyPreset, importOp, isMetric, issue, MATERIALS, phrase, plan, normalize, PRESETS, RUNNERS, summary } from "./cabinet.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("sawhorse").Field} Field */

const metric = () => isMetric(units.system());

/** @type {Sizes} */
let sizes = normalize(/** @type {Partial<Sizes> | null} */ (await storage.app.get("sizes")), metric());
/** Which group of details shows. */
let view = /** @type {string} */ ((await storage.app.get("view")) ?? "none");

/** The cabinet this plugin made last in this document, if it is the selection. */
async function selectedOwnCabinet() {
  const mine = /** @type {number | null} */ (await storage.document.get("cabinet"));
  if (mine === null) return null;
  const sel = await model.selection();
  if (sel.length !== 1 || sel[0].kind !== "instance" || sel[0].id !== mine) return null;
  return (await model.nodes()).find((n) => n.id === mine) ?? null;
}

const hasDrawers = () => sizes.layout === "drawers" || sizes.layout === "mixed";
const hasDoors = () => sizes.layout === "doors" || sizes.layout === "mixed";
const hasFronts = () => sizes.layout !== "shelves";
const drawerHoles = () => sizes.drawerPull === "center" || sizes.drawerPull === "top";

/** The runner lengths of the chosen runner, with Automatic first. */
const runnerOptions = () => [
  { value: "0", label: "Automatic (longest that fits)" },
  ...RUNNERS[sizes.slides].lengths.map((r) => ({ value: String(r.nl), label: `${r.nl} mm (${Math.round(r.nl / 25.4)} in), ${r.part}` })),
];
/** "Base 1" -> "Base 2"; a name without a number at its end stays. @param {string} name */
const nextName = (name) => name.replace(/(\d+)$/, (d) => String(Number(d) + 1));
/** Panel values into sizes: a select's value is text. @param {Record<string, unknown>} values */
const read = (values) => {
  const v = { ...values };
  if (typeof v.runner === "string") v.runner = Number(v.runner) || 0;
  delete v.preset;
  delete v.view;
  return normalize({ ...sizes, .../** @type {Partial<Sizes>} */ (v) }, metric());
};

/** @param {string} id @param {string} label @param {number} value */
const len = (id, label, value) => /** @type {Field} */ ({ type: "number", id, label, unit: "length", value, min: 0 });
/** @param {string} id @param {string} label @param {string} value @param {[string, string][]} options */
const pick = (id, label, value, options) => /** @type {Field} */ ({ type: "select", id, label, value, options: options.map(([v, l]) => ({ value: v, label: l })) });
/** @param {string} text */
const heading = (text) => /** @type {Field} */ ({ type: "note", text });

/** The groups of details, those that apply. */
function views() {
  /** @type {[string, string][]} */
  const out = [
    ["none", "None, just the basics"],
    ["build", "Construction: base, back, joints"],
    ["stock", "Stock thicknesses"],
  ];
  if (hasFronts()) out.push(["fronts", "Fronts, pulls and hinges"]);
  if (hasDrawers()) out.push(["drawers", "Drawer runners"]);
  out.push(["cuts", "Every cut and hole"]);
  return out;
}

/** The fields of the open group of details. @returns {Field[]} */
function details() {
  const s = sizes;
  /** @type {Field[]} */
  const f = [];
  if (view === "build") {
    f.push(pick("base", "Base", s.base, [["toekick", "Toe kick (sides notched)"], ["none", "None: sits on a separate base"]]));
    if (s.base === "toekick") f.push(len("toeKick", "Toe kick height", s.toeKick), len("toeSetback", "Toe kick depth", s.toeSetback));
    f.push({ type: "checkbox", id: "back", label: "Back panel", value: s.back });
    if (s.back) {
      f.push(pick("backMount", "Back fits", s.backMount, [["groove", "In grooves (sides, top, bottom)"], ["butt", "Between the sides, at the back"]]));
      if (s.backMount === "groove") f.push(len("backInset", "Back in from the rear edge", s.backInset), len("backGrooveDepth", "Back groove depth", s.backGrooveDepth));
    }
    if (s.dados) f.push(len("dadoDepth", "Dado depth", s.dadoDepth), len("dadoStop", "Dados stop short of the front by", s.dadoStop));
    f.push(len("fit", "Fit (groove over the stock)", s.fit), len("bit", "Bit diameter", s.bit));
  } else if (view === "stock") {
    f.push(len("thickness", hasDoors() ? "Cabinet and doors" : "Cabinet", s.thickness));
    if (hasDrawers()) f.push(len("frontThickness", "Drawer fronts", s.frontThickness), len("drawerThickness", "Drawer boxes", s.drawerThickness));
    f.push(len("backThickness", hasDrawers() ? "Back and drawer bottoms" : "Back", s.backThickness));
    f.push({ type: "note", text: "Measure each sheet: every joint is cut to these. For a 4 x 4 bed: Nesting > Stock... > Use 4 x 4 plywood.", tone: "info" });
  } else if (view === "fronts") {
    f.push(pick("front", "Fronts", s.front, [["overlay", "Full overlay"], ["inset", "Inset"]]), len("gap", "Gap between fronts", s.gap));
    if (hasDoors()) {
      f.push(heading("Doors"));
      if (!s.hardware) f.push({ type: "note", text: "Tick Drill hardware holes for hinge cups and a pull.", tone: "info" });
      else {
        f.push(len("hingeInset", "Hinges in from the top and bottom", s.hingeInset), len("cupDistance", "Cup boring distance (3 to 7 mm)", s.cupDistance));
        f.push(pick("doorPull", "Pull", s.doorPull, [["vertical", "Vertical, on the opening edge"], ["horizontal", "Horizontal, on the opening edge"], ["none", "None"]]));
        if (s.doorPull !== "none") {
          f.push(pick("doorPullFrom", "Measured from", s.doorPullFrom, [["top", "The top (base cabinets)"], ["bottom", "The bottom (wall cabinets)"]]));
          f.push(len("doorPullEnd", "Nearer hole from that end", s.doorPullEnd), len("doorPullEdge", "Holes from the opening edge", s.doorPullEdge), len("doorPullSpacing", "Spacing (centre to centre)", s.doorPullSpacing));
        }
      }
    }
    if (hasDrawers()) {
      f.push(heading("Drawers"));
      f.push(pick("drawerPull", "Pull", s.drawerPull, [["center", "Two holes, centred"], ["top", "Two holes, down from the top"], ["notch", "No pull: a finger notch"], ["none", "None"]]));
      if (s.drawerPull === "notch") f.push(len("notchWidth", "Notch width", s.notchWidth), len("notchDepth", "Notch depth", s.notchDepth));
      else if (drawerHoles() && !s.hardware) f.push({ type: "note", text: "Tick Drill hardware holes for the pull holes.", tone: "info" });
      else if (drawerHoles()) {
        if (s.drawerPull === "top") f.push(len("drawerPullFromTop", "Down from the top", s.drawerPullFromTop));
        f.push(len("pullSpacing", "Spacing (centre to centre)", s.pullSpacing));
      }
    }
    if (s.hardware && ((hasDoors() && s.doorPull !== "none") || (hasDrawers() && drawerHoles()))) f.push(len("pullHole", "Pull hole diameter", s.pullHole));
  } else if (view === "drawers") {
    f.push(pick("slides", "Runners", s.slides, [["tandem", RUNNERS.tandem.name], ["movento", RUNNERS.movento.name]]));
    f.push({ type: "select", id: "runner", label: "Runner length", value: String(s.runner), options: runnerOptions() });
  } else if (view === "cuts") {
    f.push({ type: "table", id: "holes", columns: ["Part", "What", "Hole", "Depth", "How"], rows: [], align: ["left", "left", "right", "right", "left"] });
  }
  return f;
}

/** The whole panel for the sizes and the open details. @returns {Field[]} */
function body() {
  const s = sizes;
  /** @type {Field[]} */
  const f = [
    {
      type: "select",
      id: "preset",
      label: "Start from",
      value: "",
      options: [{ value: "", label: "Choose a cabinet to start from..." }, ...PRESETS.map((p) => ({ value: p.id, label: p.label }))],
    },
    { type: "text", id: "name", label: "Name", value: s.name, placeholder: "Sink base 1" },
    len("width", "Width", s.width),
    len("height", "Height", s.height),
    len("depth", "Depth", s.depth),
    pick("layout", "Style", s.layout, [["doors", "Doors and shelves"], ["drawers", "Drawers"], ["mixed", "Drawers over a door"], ["shelves", "Open shelves"]]),
  ];
  if (s.layout !== "drawers") f.push({ type: "number", id: "shelves", label: "Fixed shelves", unit: "count", value: s.shelves, min: 0, max: 20 });
  if (hasDrawers()) f.push({ type: "number", id: "drawers", label: "Drawers", unit: "count", value: s.drawers, min: 0, max: 8 });
  f.push(
    { type: "checkbox", id: "dados", label: "Hidden (blind) dado joints", value: s.dados },
    { type: "checkbox", id: "hardware", label: "Drill hardware holes", value: s.hardware },
    { type: "select", id: "view", label: "Details", value: view, options: views().map(([value, label]) => ({ value, label })) },
    ...details(),
    { type: "button", id: "generate", label: "Generate cabinet", primary: true },
    { type: "note", id: "status", text: "" },
    { type: "note", id: "summary", text: "" },
  );
  return f;
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
    if (id === "view") {
      view = String(values.view ?? "none");
      void storage.app.set("view", view);
      return refresh();
    }
    if (id === "preset") {
      const p = String(values.preset ?? "");
      if (!p) return;
      sizes = applyPreset(read(values), p, metric());
      void storage.app.set("sizes", sizes);
      // Its values are new: rebuild with them.
      shown = "";
      return refresh();
    }
    const before = sizes;
    sizes = read(values);
    // Another runner has other lengths: back to Automatic.
    if (id === "slides" && sizes.runner && !RUNNERS[sizes.slides].lengths.some((r) => r.nl === sizes.runner)) sizes = { ...sizes, runner: 0 };
    if (!views().some(([v]) => v === view)) view = "none";
    void storage.app.set("sizes", sizes);
    if (before.runner !== sizes.runner && id === "slides") shown = "";
    return refresh();
  },
  onAction: (id, values) => {
    if (id !== "generate") return;
    sizes = read(values);
    return generate();
  },
});
shown = idsOf(body());

/** Keep the note, the summary and the button saying what Generate will do. */
async function explain() {
  const wrong = issue(sizes, metric());
  const own = await selectedOwnCabinet();
  const what = phrase(sizes, units.format, metric());
  const planned = wrong ? null : plan(sizes, metric());
  /** @type {Record<string, Record<string, unknown>>} */
  const fields = {
    generate: { label: own ? "Update selected cabinet" : "Generate cabinet", disabled: !!wrong },
    status: wrong ? { text: wrong, tone: "warning" } : { text: own ? `Replaces the selected cabinet with ${what}.` : `Adds a cabinet: ${what}.`, tone: "info" },
    summary: { text: planned ? summary(sizes, planned, metric()) : "" },
  };
  if (view === "cuts") fields.holes = { rows: planned ? planned.rows : [] };
  await panel.update({ fields });
}

async function generate() {
  const planned = plan(sizes, metric());
  if (planned.error) {
    await ui.notify(planned.error, { kind: "warning" });
    return;
  }
  const own = await selectedOwnCabinet();
  const f = units.format;
  const label = `${sizes.name} ${f(sizes.width)} x ${f(sizes.height)} x ${f(sizes.depth)}`;
  const batch = model.batch(own ? "Update cabinet" : "Generate cabinet");
  /** @type {import("sawhorse").Vec3 | import("sawhorse").Transform} */
  let at = [0, 0, 0];
  if (own) {
    at = own.transform;
    batch.delete({ node: own.id });
  } else {
    const b = await model.bounds();
    if (b) at = [b.max[0] + (metric() ? 50 * MM : 2 * IN), b.min[1], 0];
  }
  // Define only the materials the model lacks, so a stock chosen for one is kept.
  const have = new Set((await model.materials()).map((m) => m.name));
  const materials = Object.values(MATERIALS).filter((m) => !have.has(m.name));
  const cabinet = batch.op(importOp(planned.parts, at, label, sizes.name, materials));
  try {
    const result = await batch.commit();
    const id = /** @type {number} */ (result.value(cabinet.node));
    await storage.document.set("cabinet", id);
    await model.select([{ kind: "instance", id }]);
    const made = planned.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
    await ui.notify(`${own ? "Updated the cabinet" : "Made a cabinet"}: ${made}. The cut list lists every part.`);
    // The next new cabinet gets the next number ("Base 1", then "Base 2").
    if (!own) {
      const next = nextName(sizes.name);
      if (next !== sizes.name) {
        sizes = { ...sizes, name: next };
        void storage.app.set("sizes", sizes);
        await panel.update({ values: { name: next } });
      }
    }
  } catch (e) {
    await ui.notify(`Could not make the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
  }
  await explain();
}

await ui.registerCommand({ id: "generate", run: generate });
events.on("selectionChanged", () => explain());
events.on("documentOpened", () => explain());
await explain();
