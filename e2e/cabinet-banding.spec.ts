import { expect, test, type Page } from "@playwright/test";

// The cabinet generator's Edge banding group (plugins/cabinet-generator/cabinet.js bandPart),
// driven as a person would: off to start; on, it lists each banded part finished and cut; a band
// that would leave less than 3 mm of wood beside a hinge cup is refused with what to change; the
// cabinet made with it carries its band by the metre to the Cut list (its rows say "edge
// banding", its note says what the sizes are) and to the Shopping list; turned off on the
// cabinet, the band is gone from both.

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
const table = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-table="${id}"] tbody tr`);
const section = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-section="${id}"]`);
async function openSection(page: Page, id: string) {
  const head = section(page, id);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}
type GNode = { id: number; parent: number | null };
const tops = async (page: Page) => (await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { nodes: GNode[] } } }).__sawhorse.graph())).nodes.filter((n) => n.parent === null).length;
const shopRow = (page: Page, text: string) => page.locator("[data-testid=shopping] li[data-shop-row]", { hasText: text });

test("edge banding: off to start; on, each banded part finished and cut; a cup too near the raw edge refused; the band in the cut list and the shopping list", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  // A door-and-shelf base, as it starts.
  await fld(page, "preset").selectOption("base");
  await expect(section(page, "secBand")).toContainText("Off · cut at the finished sizes");
  await openSection(page, "secBand");
  await expect(fld(page, "bandFronts")).toHaveCount(0);

  // On: one 1 mm band on the doors, the carcass's front edges and the shelf.
  // A click (the group redraws with its fields, so the box is a new one after it).
  await fld(page, "band").click();
  await expect(fld(page, "band")).toBeChecked();
  await expect(fld(page, "bandFronts")).toHaveValue("1");
  await expect(fld(page, "bandFronts").locator("option").nth(1)).toHaveText("Band 1 · 1 mm x 15/16 in");
  await expect(section(page, "secBand")).toContainText("fronts 1 mm · carcass edges 1 mm · shelves 1 mm");
  const door = table(page, "bandRows").filter({ hasText: /^Door/ });
  await expect(door).toContainText("all four");
  // 23 7/8 x 30 3/8 in finished; a millimetre less on each edge cut.
  await expect(door).toContainText("23.875 × 30.375 in");
  await expect(door).toContainText("23.796 × 30.296 in");
  await expect(table(page, "bandRows").filter({ hasText: "Rear stretcher" })).toHaveCount(0);
  await expect(note(page, "bandTotal")).toContainText("m of 1 mm x 15/16 in");

  // A 3 mm band on the doors leaves 2 mm of wood beside a cup bored 5 mm from the edge: refused,
  // with the boring distance that works.
  await fld(page, "band1Size").selectOption("3");
  await expect(note(page, "status")).toContainText("Set Boring distance to at least 6 mm, or band the doors with a thinner band.");
  await expect(action(page, "generate")).toBeDisabled();
  await fld(page, "band1Size").selectOption("1");
  await expect(action(page, "generate")).toBeEnabled();

  await action(page, "generate").click();
  await expect.poll(() => tops(page)).toBe(1);
  await expect(note(page, "status")).toContainText("Editing Base 1");

  // The cut list: the banded parts say so, and the note says what their sizes are.
  await page.getByRole("tab", { name: "Cut list" }).click();
  const list = page.getByTestId("cutlist");
  await expect(list.locator('tr[data-part="Door"]')).toContainText("edge banding 1 mm x 15/16 in, 2.858 m a piece");
  await expect(list.locator('tr[data-part="Back"]')).not.toContainText("edge banding");
  await expect(page.getByTestId("cutlist-note")).toContainText("Sizes as drawn, rounded to the nearest 1/16 in. A part noted \"edge banding\" is drawn at its cut size");

  // The shopping list: the band by the metre, for the whole cabinet.
  await page.locator(".cutlist .btnrow").getByRole("button", { name: "Shopping list ›" }).click();
  const band = shopRow(page, "Edge banding, 1 mm x 15/16 in");
  await expect(band).toBeVisible();
  await expect(band).toContainText(/Needs \d+\.\d+ m/);

  // Off on the cabinet: rebuilt unbanded; the band leaves both lists.
  await page.getByRole("tab", { name: "Plugins" }).click();
  await openSection(page, "secBand");
  await fld(page, "band").click();
  await expect(fld(page, "band")).not.toBeChecked();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(band).toHaveCount(0);
  await expect(page.locator('[data-testid=shopping] [data-category="banding"]')).toContainText("No part carries edge banding.");
  await expect(list.locator('tr[data-part="Door"]')).not.toContainText("edge banding");
  await expect(page.getByTestId("cutlist-note")).toContainText("Edge banding is not included");
});
