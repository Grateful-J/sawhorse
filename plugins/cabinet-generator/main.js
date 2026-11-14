// @ts-check
// Cabinet generator: a frameless cabinet from its sizes.
//
// The default is today's shelf cabinet (butt joints, no hardware). Layouts add a door,
// drawer boxes, or both. Blind dados and hinge, slide and pull holes are off until asked
// for. Every part is a named component. The whole cabinet is one batch, so one Ctrl+Z
// takes it away. Generating again while the cabinet this plugin made is selected replaces
// it in place.
//
// Sizes are metres inside; the panel shows and reads them in the document's units.
import { events, model, storage, ui, units } from "sawhorse";
import { importOp, isMetric, issue, phrase, plan, normalize } from "./cabinet.js";

const IN = 0.0254;
const MM = 0.001;

/** @typedef {import("./cabinet.js").Sizes} Sizes */

const metric = () => isMetric(units.system());

/** @type {Sizes} */
let sizes = normalize(/** @type {Partial<Sizes> | null} */ (await storage.app.get("sizes")), metric());

/** The cabinet this plugin made last in this document, if it is the selection. */
async function selectedOwnCabinet() {
  const mine = /** @type {number | null} */ (await storage.document.get("cabinet"));
  if (mine === null) return null;
  const sel = await model.selection();
  if (sel.length !== 1 || sel[0].kind !== "instance" || sel[0].id !== mine) return null;
  return (await model.nodes()).find((n) => n.id === mine) ?? null;
}

const drawersOff = () => sizes.layout === "shelves" || sizes.layout === "doors";
const shelvesOff = () => sizes.layout === "drawers";
const frontOff = () => sizes.layout === "shelves";

const panel = await ui.registerPanel({
  id: "cabinet",
  title: "Cabinet",
  body: [
    { type: "number", id: "width", label: "Width", unit: "length", value: sizes.width, min: 0 },
    { type: "number", id: "height", label: "Height", unit: "length", value: sizes.height, min: 0 },
    { type: "number", id: "depth", label: "Depth", unit: "length", value: sizes.depth, min: 0 },
    { type: "number", id: "thickness", label: "Stock", unit: "length", value: sizes.thickness, min: 0 },
    {
      type: "select",
      id: "layout",
      label: "Layout",
      value: sizes.layout,
      options: [
        { value: "shelves", label: "Shelves" },
        { value: "doors", label: "Door and shelves" },
        { value: "drawers", label: "Drawers" },
        { value: "mixed", label: "Drawers and a door" },
      ],
    },
    {
      type: "select",
      id: "front",
      label: "Fronts",
      value: sizes.front,
      disabled: frontOff(),
      options: [
        { value: "overlay", label: "Overlay" },
        { value: "inset", label: "Inset" },
      ],
    },
    { type: "number", id: "shelves", label: "Shelves", unit: "count", value: sizes.shelves, min: 0, max: 20, disabled: shelvesOff() },
    { type: "number", id: "drawers", label: "Drawers", unit: "count", value: sizes.drawers, min: 0, max: 8, disabled: drawersOff() },
    { type: "checkbox", id: "back", label: "Back panel", value: sizes.back },
    { type: "number", id: "toeKick", label: "Toe kick", unit: "length", value: sizes.toeKick, min: 0 },
    { type: "checkbox", id: "dados", label: "Blind dados", value: sizes.dados },
    { type: "checkbox", id: "hardware", label: "Hardware holes", value: sizes.hardware },
    { type: "number", id: "hingeInset", label: "Hinge inset", unit: "length", value: sizes.hingeInset, min: 0, disabled: !sizes.hardware },
    { type: "number", id: "slideClearance", label: "Slide clearance", unit: "length", value: sizes.slideClearance, min: 0, disabled: !sizes.hardware },
    { type: "number", id: "slideSetback", label: "Slide setback", unit: "length", value: sizes.slideSetback, min: 0, disabled: !sizes.hardware },
    {
      type: "select",
      id: "pull",
      label: "Pull",
      value: sizes.pull,
      disabled: !sizes.hardware,
      options: [
        { value: "face", label: "Face" },
        { value: "undermount", label: "Undermount" },
      ],
    },
    { type: "number", id: "pullSpacing", label: "Pull spacing", unit: "length", value: sizes.pullSpacing, min: 0, disabled: !sizes.hardware },
    { type: "table", id: "holes", columns: ["Part", "Where", "Diameter", "Depth"], rows: [], align: ["left", "left", "right", "right"] },
    { type: "button", id: "generate", label: "Generate cabinet", primary: true },
    { type: "note", id: "status", text: "" },
  ],
  onChange: (_id, values) => {
    sizes = normalize({ ...sizes, .../** @type {Partial<Sizes>} */ (values) }, metric());
    void storage.app.set("sizes", sizes);
    return explain();
  },
  onAction: (id, values) => {
    if (id !== "generate") return;
    sizes = normalize({ ...sizes, .../** @type {Partial<Sizes>} */ (values) }, metric());
    return generate();
  },
});

/** Keep the note and the button saying what Generate will do. */
async function explain() {
  const wrong = issue(sizes, metric());
  const own = await selectedOwnCabinet();
  const what = phrase(sizes, units.format, metric());
  const planned = wrong ? null : plan(sizes, metric());
  await panel.update({
    fields: {
      generate: { label: own ? "Update selected cabinet" : "Generate cabinet", disabled: !!wrong },
      shelves: { disabled: shelvesOff() },
      drawers: { disabled: drawersOff() },
      front: { disabled: frontOff() },
      hingeInset: { disabled: !sizes.hardware },
      slideClearance: { disabled: !sizes.hardware },
      slideSetback: { disabled: !sizes.hardware },
      pull: { disabled: !sizes.hardware },
      pullSpacing: { disabled: !sizes.hardware },
      holes: { rows: sizes.hardware && planned ? planned.rows : [] },
      status: wrong
        ? { text: wrong, tone: "warning" }
        : { text: own ? `Replaces the selected cabinet with ${what}.` : `Adds a cabinet: ${what}.`, tone: "info" },
    },
  });
}

async function generate() {
  const planned = plan(sizes, metric());
  if (planned.error) {
    await ui.notify(planned.error, { kind: "warning" });
    return;
  }
  const own = await selectedOwnCabinet();
  const f = units.format;
  const label = `Cabinet ${f(sizes.width)} x ${f(sizes.height)} x ${f(sizes.depth)}`;
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
  const cabinet = batch.op(importOp(planned.parts, at, label, "Cabinet"));
  try {
    const result = await batch.commit();
    const id = /** @type {number} */ (result.value(cabinet.node));
    await storage.document.set("cabinet", id);
    await model.select([{ kind: "instance", id }]);
    const made = planned.parts.map((p) => (p.copies.length > 1 ? `${p.name} x ${p.copies.length}` : p.name)).join(", ");
    await ui.notify(`${own ? "Updated the cabinet" : "Made a cabinet"}: ${made}. The cut list lists every part.`);
  } catch (e) {
    await ui.notify(`Could not make the cabinet: ${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
  }
  await explain();
}

await ui.registerCommand({ id: "generate", run: generate });
events.on("selectionChanged", () => explain());
events.on("documentOpened", () => explain());
await explain();
