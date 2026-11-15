import { expect, test, type Page } from "@playwright/test";

// The cabinet generator's Joinery and Line boring fields (plugins/cabinet-generator/cabinet.js
// DOWEL, CONFIRMAT, LINE_BORE), driven as a person would: blind dados and pins around each shelf
// to start; Dowels takes the dado fields away, and Cuts and holes lists the sides' dowel holes for
// the router and the rails' end holes for a jig; Confirmat screws offers Häfele's two
// self-countersinking lengths and says plainly whose layout the screws take; Full height says so
// in the group's summary and in the pin row; the cabinet made with Confirmat screws carries them
// to the Shopping list by Häfele's part number, and back on blind dados they are gone.

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

const root = (page: Page) => page.locator(`[data-panel="${panel}"]`);
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

test("joinery and line boring: dados to start; dowels for the router and a jig; Confirmat with Häfele's lengths and layout said plainly; full height; the screws on the shopping list", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  // A wall cabinet: 12 in deep, a full top, two adjustable shelves behind doors.
  await fld(page, "preset").selectOption("wall");
  await expect(section(page, "secBuild")).toContainText("Blind dados");
  await expect(section(page, "secBuild")).not.toContainText("full-height pins");
  await openSection(page, "secBuild");
  await expect(fld(page, "joinery")).toHaveValue("dado");
  await expect(fld(page, "joinery").locator("option")).toHaveText(["Blind dados", "Butt joints", "Dowels", "Confirmat screws"]);
  await expect(fld(page, "lineBoring")).toHaveValue("shelves");
  await expect(fld(page, "dadoDepth")).toHaveCount(1);

  // Dowels: no dado fields; Häfele's layout and its assembly dowel's depths in the help.
  await fld(page, "joinery").selectOption("dowels");
  await expect(fld(page, "dadoDepth")).toHaveCount(0);
  await expect(section(page, "secBuild")).toContainText("Dowels");
  await expect(root(page)).toContainText("The depths are Häfele's for its 8 mm assembly dowel.");
  await openSection(page, "secCuts");
  const holes = table(page, "holes");
  // The sides' holes for the router: 8 mm, 11 deep; the rails' ends for a jig: 8 mm, 25 deep.
  const sideRows = holes.filter({ hasText: "Dowel holes for the" });
  await expect(sideRows).toHaveCount(2);
  await expect(sideRows.first()).toContainText("8 mm");
  await expect(sideRows.first()).toContainText("11 mm");
  await expect(sideRows.first()).toContainText("CNC");
  const jig = holes.filter({ hasText: "for a doweling jig" });
  await expect(jig).toHaveCount(2);
  await expect(jig.first()).toContainText("3 at 37, 165 and 267.8 mm (1.457, 6.496 and 10.543 in) from its front edge");
  await expect(jig.first()).toContainText("25 mm");
  await expect(jig.first()).toContainText("Jig");
  await expect(holes.filter({ hasText: "Blind dados" })).toHaveCount(0);

  // Confirmat screws: Häfele's two self-countersinking lengths; the layout said for what it is.
  await openSection(page, "secBuild");
  await fld(page, "joinery").selectOption("confirmat");
  await expect(fld(page, "confirmatLength")).toHaveValue("50");
  await expect(fld(page, "confirmatLength").locator("option")).toHaveText(["7 x 50 mm · Häfele 264.44.190", "7 x 70 mm · Häfele 264.44.194"]);
  await expect(root(page)).toContainText("Placed by Häfele's dowel layout; no confirmat spacing was found in a maker's document.");
  await expect(section(page, "secBuild")).toContainText("Confirmat screws");

  // Full height: the group says so, and so does the pin row.
  await fld(page, "lineBoring").selectOption("full");
  await expect(section(page, "secBuild")).toContainText("full-height pins");
  await expect(root(page)).toContainText("Blum Process 32's 775 mm side, generalised");
  await openSection(page, "secCuts");
  await expect(holes.filter({ hasText: "Shelf pin holes" })).toContainText("the full height, the lowest 46.5 mm above the bottom of the box");
  const thru = holes.filter({ hasText: "Confirmat through holes for the" });
  await expect(thru).toHaveCount(2);
  await expect(thru.first()).toContainText("7 mm");
  await expect(thru.first()).toContainText("through");
  await expect(holes.filter({ hasText: "Confirmat pilot holes" }).first()).toContainText("per the screw maker");

  await action(page, "generate").click();
  await expect.poll(() => tops(page)).toBe(1);
  await expect(note(page, "status")).toContainText("Editing Wall 1");

  // The shopping list: the top's and the bottom's screws, 3 a joint, 2 joints each: 12.
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.locator(".cutlist .btnrow").getByRole("button", { name: "Shopping list ›" }).click();
  const screws = shopRow(page, "264.44.190");
  await expect(screws).toContainText("Needs 12 ·");

  // Back to blind dados on the cabinet: rebuilt, and the screws leave the list.
  await page.getByRole("tab", { name: "Plugins" }).click();
  await openSection(page, "secBuild");
  await fld(page, "joinery").selectOption("dado");
  await expect(section(page, "secBuild")).toContainText("Blind dados");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(screws).toHaveCount(0);
});
