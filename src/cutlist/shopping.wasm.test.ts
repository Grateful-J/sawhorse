// @vitest-environment node
// The shopping list through the real kernel: the cabinet generator's batch as main.js sends it
// (the parts imported flat, each part's grain and hardware set through its first copy, wrapped
// in one cabinet), then the cut list and the nesting the app reads. A copied cabinet doubles
// its hardware and its sheets; a deleted one takes them away; undo brings them back; a saved
// and reopened model lists the same. Needs `npm run wasm`; skipped without the kernel unless
// REQUIRE_KERNEL is set.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPreset, defaults, flatImportOp, MATERIALS, plan } from "../../plugins/cabinet-generator/cabinet.js";
import type { CutList, Nesting } from "../kernel/types";
import { defaultShopPrefs, itemKey, priceList, shoppingList } from "./shopping";

const pkg = path.resolve(__dirname, "../wasm/pkg");
const built = existsSync(path.join(pkg, "sawhorse_wasm_bg.wasm"));
const run = built || process.env.REQUIRE_KERNEL ? describe : describe.skip;

type Doc = {
  apply_op(json: string): string;
  cut_list(o: string): string;
  undo(): void;
  apply_named_batch(json: string): string;
  nest(o: string): string;
  state_json(): string;
};
type Mod = { initSync(o: { module: Buffer }): void; document_new(): Doc };
async function mod(): Promise<Mod> {
  const m = (await import(/* @vite-ignore */ path.join(pkg, "sawhorse_wasm.js"))) as Mod;
  m.initSync({ module: readFileSync(path.join(pkg, "sawhorse_wasm_bg.wasm")) });
  return m;
}

/** The ops main.js's addParts sends, then the cabinet's component. */
function generate(parts: ReturnType<typeof plan>["parts"], name: string) {
  const ref = (k: number) => ({ $ref: 0, path: `groups.${k}` });
  const ops: Record<string, unknown>[] = [flatImportOp(parts, [0, 0, 0], Object.values(MATERIALS))];
  const items: unknown[] = [];
  let k = 0;
  for (const part of parts) {
    const first = ref(k);
    for (let c = 0; c < part.copies.length; c++) items.push({ node: ref(k++) });
    if (part.grain !== "length") ops.push({ op: "set_grain", part: { node: first }, grain: part.grain });
    if (part.bom?.length) ops.push({ op: "set_bom", part: { node: first }, bom: part.bom });
  }
  ops.push({ op: "make_component", items, name });
  return { name: "Generate cabinet", ops };
}

run("the shopping list through the kernel", () => {
  it("a copied cabinet doubles its hardware and sheets, a deleted one takes them away", async () => {
    const m = await mod();
    const d = m.document_new();
    const s = applyPreset(defaults(false), "mixed", false);
    const p = plan(s, false);
    expect(p.error).toBeNull();
    const made = JSON.parse(d.apply_named_batch(JSON.stringify(generate(p.parts, "Base 1"))));
    const cab = made.outcomes[made.outcomes.length - 1].instance as number;
    const shop = () => {
      const list = JSON.parse(d.cut_list("{}")) as CutList;
      const nest = JSON.parse(d.nest("{}")) as Nesting;
      return shoppingList(list, nest);
    };
    const need = (sh: ReturnType<typeof shop>, sku: string) => sh.rows.find((r) => r.sku === sku)?.need ?? 0;
    const sheets = (sh: ReturnType<typeof shop>) => sh.rows.filter((r) => r.category === "sheet").reduce((n, r) => n + r.need, 0);

    // One drawer over two doors, one loose shelf.
    const one = shop();
    const hinges = p.rows.filter((r) => /door$/.test(r[0]) && r[1].startsWith("Hinge cup")).length;
    expect(hinges).toBe(4);
    expect(need(one, "71B3550")).toBe(hinges);
    expect(need(one, "173L8100")).toBe(hinges);
    expect(need(one, p.runner!.part)).toBe(1);
    expect(need(one, "T51.1901 R")).toBe(1);
    expect(need(one, "T51.1901 L")).toBe(1);
    expect(need(one, "606N")).toBe(4);
    expect(need(one, "662.1150.HG")).toBe(2 * p.runner!.screws.length);
    expect(one.rows.find((r) => r.name === "5 mm shelf pins")!.need).toBe(4);
    expect(one.rows.find((r) => r.sku === "T65.1600.01")).toMatchObject({ category: "tools", need: 1 });
    const oneSheets = sheets(one);
    expect(oneSheets).toBeGreaterThan(0);
    expect(one.unplaced).toBe(0);

    // Copied: twice the hardware, the template still once; at least as many sheets.
    d.apply_op(JSON.stringify({ op: "copy", objects: [], nodes: [cab], xform: { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [1, 0, 0] } }));
    const two = shop();
    for (const r of one.rows.filter((x) => x.category === "hardware")) expect(two.rows.find((x) => x.key === r.key)!.need, r.name).toBe(2 * r.need);
    expect(two.rows.find((r) => r.sku === "T65.1600.01")!.need).toBe(1);
    expect(sheets(two)).toBeGreaterThanOrEqual(oneSheets);

    // The original deleted: the copy's hardware alone, as one cabinet.
    d.apply_op(JSON.stringify({ op: "delete_node", node: cab }));
    const left = shop();
    for (const r of one.rows.filter((x) => x.category !== "sheet")) expect(left.rows.find((x) => x.key === r.key)!.need, r.name).toBe(r.need);
    expect(sheets(left)).toBe(oneSheets);

    // Everything deleted: nothing to buy.
    const top = (JSON.parse(d.state_json()) as { graph: { nodes: { id: number; parent: number | null }[] } }).graph.nodes.filter((n) => n.parent === null);
    for (const n of top) d.apply_op(JSON.stringify({ op: "delete_node", node: n.id }));
    expect(shop().rows).toEqual([]);
    // Undo brings the copy and its hardware back.
    d.undo();
    expect(need(shop(), "71B3550")).toBe(hinges);
  }, 60_000);

  it("prices: the hardware of two cabinets at the shop's prices, unpriced rows left out", async () => {
    const m = await mod();
    const d = m.document_new();
    const p = plan(applyPreset(defaults(false), "drawers", false), false);
    const made = JSON.parse(d.apply_named_batch(JSON.stringify(generate(p.parts, "Drawer base 1"))));
    const cab = made.outcomes[made.outcomes.length - 1].instance as number;
    d.apply_op(JSON.stringify({ op: "copy", objects: [], nodes: [cab], xform: { linear: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [1, 0, 0] } }));
    const list = JSON.parse(d.cut_list("{}")) as CutList;
    const sh = shoppingList(list, JSON.parse(d.nest("{}")) as Nesting);
    const runners = sh.rows.find((r) => r.sku === p.runner!.part)!;
    // Three drawers a cabinet, two cabinets: six pairs.
    expect([runners.need, runners.unit]).toEqual([6, "pair"]);
    const priced = priceList(sh, { ...defaultShopPrefs("USD"), prices: { [itemKey({ item: runners.name, sku: runners.sku, unit: "pair" })]: 30 } });
    expect(priced.total).toBe(180);
    expect(priced.unpriced.length).toBe(priced.rows.length - 1);
    expect(priced.unpriced.every((r) => r.cost === null)).toBe(true);
  }, 60_000);
});
