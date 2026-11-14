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
import { applyPreset, exactThickness, importOp, isMetric, issue, MATERIALS, phrase, plan, normalize, PRESETS, runnerLine, summary } from "./cabinet.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {import("./cabinet.js").Sizes} Sizes */
/** @typedef {import("sawhorse").Field} Field */

const metric = () => isMetric(units.system());

/** @type {Sizes} */
let sizes = normalize(/** @type {Partial<Sizes> | null} */ (await storage.app.get("sizes")), metric());
/** Which group is open ("" for none). */
let view = /** @type {string} */ ((await storage.app.get("view")) ?? "");

/** The cabinet this plugin made last in this document, if it is the selection. */
async function selectedOwnCabinet() {
  const mine = /** @type {number | null} */ (await storage.document.get("cabinet"));
  if (mine === null) return null;
  const sel = await model.selection();
  if (sel.length !== 1 || sel[0].kind !== "instance" || sel[0].id !== mine) return null;
  return (await model.nodes()).find((n) => n.id === mine) ?? null;
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
      return `Trash pull-out · ${s.trashBins === "one" ? "one bin" : s.trashBins === "side" ? "two bins side by side" : "two bins front to back"}`;
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
      out.push(len("binWidth", "Cutout width", s.binWidth), len("binLength", "Cutout length", s.binLength), len("binHeight", "Lip height", s.binHeight), len("trayHeight", "Tray sides", s.trayHeight));
      out.push(help("Measure your bins: the cutout just under the lip, and the lip's height with the bin standing on the tray."));
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
    if ((id === "slides" || id === "catalog") && sizes.runner && !runnerLine(sizes).lengths.some((r) => r.nl === sizes.runner)) sizes = { ...sizes, runner: 0 };
    if (!SECTIONS.some((x) => x.id === view && x.applies())) view = "";
    void storage.app.set("sizes", sizes);
    // Fields whose label or options name another choice are rebuilt with it.
    if (["doorPullFrom", "layout", "slides", "catalog", "front"].includes(id) || before.runner !== sizes.runner) shown = "";
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
    status: wrong ? { text: wrong, tone: "warning" } : { text: own ? `Replaces the selected cabinet: ${what}.` : `Adds ${sizes.name}: ${what}.`, tone: "info" },
    summary: { text: planned ? summary(sizes, planned, metric()) : "" },
  };
  // Each group's heading says what is in it now.
  for (const sec of SECTIONS) if (sec.applies()) fields[sec.id] = { summary: sec.summary() };
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
