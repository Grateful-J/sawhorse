import { expect, test, type Page } from "@playwright/test";

// Grain-matched fronts (plugins/cabinet-generator/match.js, the kernel's `together`), driven as
// a person would: off to start; ticked in Fronts and pulls, a drawer base's fronts come out of
// the nesting as one block on one sheet, in the order they stand, a kerf apart; a drawer base
// over a pair of doors is refused with what to change; unticked, the fronts are nested on their
// own again.

const CABINET = "com.sawhorse3d.cabinet-generator";
const panel = `${CABINET}/cabinet`;
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
  await page.getByRole("tab", { name: "Plugins" }).click();
  const row = page.locator(`.plugin-row[data-plugin="${CABINET}"]`);
  await row.locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Enable" }).click();
  await expect(row).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

const fld = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-field="${id}"]`);
const note = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-note="${id}"]`);
const action = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-action="${id}"]`);
const section = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-section="${id}"]`);
async function openSection(page: Page, id: string) {
  const head = section(page, id);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}
type GNode = { id: number; parent: number | null };
const tops = async (page: Page) => (await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { nodes: GNode[] } } }).__sawhorse.graph())).nodes.filter((n) => n.parent === null).length;

interface Place {
  tag: string;
  name: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  turned: boolean;
  together?: { key: string; index: number; n: number; of: number; stack: string };
}
interface Nest {
  pieces: { index: number; kerf: number; placements: Place[] }[];
  unplaced: { tag: string; reason: string }[];
}
const nest = (page: Page): Promise<Nest> => page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never);

test("grain-matched fronts: off to start; a pair of doors refused; on, one block in order a kerf apart; off again, on their own", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  // A drawer over a pair of doors: the fronts are not one column, so matching is refused.
  await fld(page, "preset").selectOption("mixed");
  await openSection(page, "secFronts");
  await expect(fld(page, "grainMatch")).not.toBeChecked();
  await expect(section(page, "secFronts")).not.toContainText("grain-matched");
  // A click (the group redraws with its fields, so the box is a new one after it).
  await fld(page, "grainMatch").click();
  await expect(fld(page, "grainMatch")).toBeChecked();
  await expect(section(page, "secFronts")).toContainText("grain-matched");
  await expect(note(page, "status")).toContainText("a pair of doors stands side by side");
  await expect(action(page, "generate")).toBeDisabled();

  // A drawer base: three fronts in one column, grain across.
  await fld(page, "preset").selectOption("drawers");
  await openSection(page, "secFronts");
  await expect(fld(page, "grainMatch")).toBeChecked();
  await expect(action(page, "generate")).toBeEnabled();
  await action(page, "generate").click();
  await expect.poll(() => tops(page)).toBe(1);
  await expect(note(page, "status")).toContainText("Editing");

  // The nesting: the three drawer fronts, one block on one sheet, bottom first (grain across),
  // ripped one off the next a kerf apart, lined up.
  const kept = async () => (await nest(page)).pieces.flatMap((p) => p.placements).filter((q) => q.together).length;
  await expect.poll(kept).toBe(3);
  const n = await nest(page);
  expect(n.unplaced).toEqual([]);
  const sheets = n.pieces.filter((p) => p.placements.some((q) => q.together));
  expect(sheets).toHaveLength(1);
  const b = sheets[0].placements.filter((q) => q.together).sort((p, q) => p.together!.n - q.together!.n);
  expect(b.map((q) => [q.name, q.together!.index, q.together!.stack])).toEqual([
    ["Drawer front", 0, "across"],
    ["Drawer front", 1, "across"],
    ["Drawer front", 2, "across"],
  ]);
  for (let i = 1; i < b.length; i++) {
    expect(Math.abs(b[i].y - (b[i - 1].y + b[i - 1].dy + sheets[0].kerf))).toBeLessThan(1e-9);
    expect(b[i].x).toBe(b[i - 1].x);
  }

  // Off on the cabinet: rebuilt, its fronts nested on their own, nothing kept together.
  await fld(page, "grainMatch").click();
  await expect(fld(page, "grainMatch")).not.toBeChecked();
  await expect.poll(kept).toBe(0);
  const fronts = (await nest(page)).pieces.flatMap((p) => p.placements).filter((q) => q.name === "Drawer front");
  expect(fronts).toHaveLength(3);
});
