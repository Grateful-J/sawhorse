// Rebuild the small hardware fit model with the current kernel and cabinet planner.
// npm run wasm && node scripts/make-hardware-demo.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, flatImportOp, MATERIALS, plan } from "../plugins/cabinet-generator/cabinet.js";
import { miniDrawer } from "../plugins/cabinet-generator/testcuts.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "examples/cnc-hardware-demo");
const IN = .0254;
const common = {
  ...defaults(false),
  thickness: .75 * IN, frontThickness: .75 * IN,
  drawerThickness: .5 * IN, backThickness: .25 * IN,
  runner: 457, slides: "tandem", catalog: "us", depth: 19 * IN,
  base: "none", back: false, nailers: "none", top: "stretchers", stretcher: 2 * IN,
  drawerPull: "none", doorPull: "none", cupDistance: .0065,
};
const mini = miniDrawer({ ...common, frontThickness: .5 * IN }, false);
assert.equal(mini.error, null);
assert.equal(mini.runner.part, "563H4570B");
assert.equal(mini.runner.nl, 457);
const rigs = [
  { name: "18 inch TANDEM slide test", sizes: { ...mini.sizes, name: "18 inch TANDEM slide test" }, at: [0, 0, 0] },
  // The narrow door saves material; its height leaves the hinges farther apart than its width.
  { name: "3-4 inch Blum hinge test", sizes: { ...common, name: "3-4 inch Blum hinge test", layout: "doors", doors: "one", width: 4 * IN, height: 11.25 * IN, depth: 4.25 * IN, shelves: 0 }, at: [14 * IN, 0, 0] },
];
const mod = await import(new URL("../src/wasm/pkg/sawhorse_wasm.js", import.meta.url));
mod.initSync({ module: readFileSync(path.join(root, "src/wasm/pkg/sawhorse_wasm_bg.wasm")) });
const d = mod.document_new();
const stocks = [
  { thickness: .75 * IN, width: 24 * IN, length: 36 * IN, name: "Demo 3-4 plywood", color: MATERIALS.carcass.color },
  { thickness: .5 * IN, width: 12 * IN, length: 24 * IN, name: "Demo 1-2 plywood", color: MATERIALS.box.color },
  { thickness: .25 * IN, width: 10 * IN, length: 20 * IN, name: "Demo 1-4 plywood", color: MATERIALS.back.color },
];
const csv = [["Assembly", "Part", "Qty", "Thickness (in)", "Width (in)", "Length (in)"]];
const hardware = new Map();
let netArea = 0;
const areaByStock = new Map();
const summaries = [];
for (const rig of rigs) {
  const p = plan(rig.sizes, false);
  assert.equal(p.error, null, `${rig.name}: ${p.error}`);
  assert(!p.rows.some((r) => r[4] === "Check"), `${rig.name}: ${JSON.stringify(p.rows.filter((r) => r[4] === "Check"))}`);
  const parts = p.parts.map((part) => {
    const sorted = [...part.blank].sort((a, b) => a - b);
    const stock = stocks.find((s) => Math.abs(s.thickness - sorted[0]) < 1e-8);
    assert(stock, `${part.name}: unexpected thickness`);
    const area = sorted[1] * sorted[2] * part.copies.length;
    netArea += area;
    areaByStock.set(stock.name, (areaByStock.get(stock.name) ?? 0) + area);
    csv.push([rig.name, part.name, part.copies.length, ...sorted.map((v) => Number((v / IN).toFixed(6)))]);
    for (const item of part.bom ?? []) {
      const key = JSON.stringify([item.item, item.sku, item.unit]);
      const old = hardware.get(key);
      hardware.set(key, { ...item, qty: (old?.qty ?? 0) + item.qty * part.copies.length });
    }
    return { ...part, material: stock.name };
  });
  const ops = [flatImportOp(parts, rig.at, stocks)];
  let k = 0;
  const items = [];
  for (const part of parts) {
    const node = { $ref: 0, path: `groups.${k}` };
    if (part.grain !== "length") ops.push({ op: "set_grain", part: { node }, grain: part.grain });
    if (part.bom?.length) ops.push({ op: "set_bom", part: { node }, bom: part.bom });
    for (const _copy of part.copies) items.push({ node: { $ref: 0, path: `groups.${k++}` } });
  }
  ops.push({ op: "make_component", items, name: rig.name });
  d.apply_named_batch(JSON.stringify({ name: rig.name, ops }));
  summaries.push({ name: rig.name, sizeInches: [rig.sizes.width, rig.sizes.depth, rig.sizes.height].map((v) => Number((v / IN).toFixed(4))), settings: rig.sizes, operations: p.rows });
}
for (const stock of stocks) {
  d.apply_op(JSON.stringify({ op: "define_stock", stock: { ...stock, kind: "sheet", grain: "none", nominal: null } }));
  d.apply_op(JSON.stringify({ op: "set_material_stock", material: stock.name, stock: stock.name }));
}
const lib = JSON.parse(d.stock_library());
d.apply_op(JSON.stringify({ op: "set_nest_settings", settings: { ...lib.settings, sheetSize: null, algorithm: "maxrects", kerf: .375 * IN, trim: .25 * IN } }));
// Search small scraps, in half-inch increments, within the 4 x 4 router's footprint.
// This is the smallest rectangle our nester finds on this grid, not a packing optimum proof.
for (const stock of stocks) {
  const candidates = [];
  for (let w = 4; w <= 24; w += .5) for (let l = Math.max(w, 4); l <= 48; l += .5) {
    const area = w * l * IN * IN;
    if (area >= areaByStock.get(stock.name) && area <= stock.width * stock.length + 1e-9) candidates.push({ w, l, area });
  }
  candidates.sort((a, b) => a.area - b.area || Math.abs(a.l - a.w) - Math.abs(b.l - b.w));
  let found = false;
  for (const c of candidates) {
    const trial = { ...stock, width: c.w * IN, length: c.l * IN };
    d.apply_op(JSON.stringify({ op: "define_stock", stock: { ...trial, kind: "sheet", grain: "none", nominal: null }, replace: stock.name }));
    const trialNest = JSON.parse(d.nest("{}"));
    if (!trialNest.unplaced.length && trialNest.pieces.filter((p) => p.stock === stock.name).length === 1) {
      stock.width = trial.width;
      stock.length = trial.length;
      found = true;
      break;
    }
  }
  assert(found, `${stock.name}: no single scrap fits`);
}
const nest = JSON.parse(d.nest("{}"));
assert.deepEqual(nest.unplaced, []);
assert.equal(nest.pieces.length, 3, "Each thickness must fit on its one small scrap sheet");
const cuts = JSON.parse(d.cut_list("{}"));
assert(cuts.rows.every((r) => !r.not_solid && !r.uncounted), "Every demo part must be a counted solid");
const bytes = d.save_shz("frac-in", new Uint8Array(), "");
const reopened = mod.document_new();
reopened.open_shz(bytes);
assert.equal(JSON.parse(reopened.state_json()).stats.hash, JSON.parse(d.state_json()).stats.hash);
assert.deepEqual(JSON.parse(reopened.nest("{}")).unplaced, []);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "18-inch-slides-and-3-4-inch-door.shz"), bytes);
const quote = (v) => `"${String(v).replaceAll('"', '""')}"`;
writeFileSync(path.join(out, "cut-list.csv"), csv.map((r) => r.map(quote).join(",")).join("\n") + "\n");
const summary = { netAreaSquareFeet: Number((netArea / IN ** 2 / 144).toFixed(3)), stockSheets: stocks.map(({ color, ...s }) => ({ ...s, sizeInches: [s.thickness, s.width, s.length].map((v) => Number((v / IN).toFixed(4))) })), hardware: [...hardware.values()], rigs: summaries };
writeFileSync(path.join(out, "settings-and-checks.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Saved and reopened ${bytes.length} bytes; ${cuts.rows.reduce((s, r) => s + r.qty, 0)} parts; ${summary.netAreaSquareFeet} sq ft net; three scrap sheets.`);
