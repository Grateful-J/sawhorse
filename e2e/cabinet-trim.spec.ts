import { expect, test, type Page } from "@playwright/test";
import { solids } from "./helpers";

// The cabinet generator's Ends, fillers and openings group (plugins/cabinet-generator/trim.js),
// driven as a person would: nothing beside a cabinet to start; a finished end panel is a part of
// its own, in the model and the Cut list; a dishwasher opening is space in the row, so the next
// cabinet stands past it, and the Rows panel lists it; the checks warn (a sink too wide for its
// base, a countertop too low over a dishwasher) and never stop a build.

const CABINET = "com.sawhorse3d.cabinet-generator";
const panel = `${CABINET}/cabinet`;
const rows = `${CABINET}/rows`;
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

const fld = (page: Page, p: string, id: string) => page.locator(`[data-panel="${p}"] [data-field="${id}"]`);
const note = (page: Page, p: string, id: string) => page.locator(`[data-panel="${p}"] [data-note="${id}"]`);
const section = (page: Page, id: string) => page.locator(`[data-panel="${panel}"] [data-section="${id}"]`);
const table = (page: Page, p: string, id: string) => page.locator(`[data-panel="${p}"] [data-table="${id}"] tbody tr`);
async function openSection(page: Page, id: string) {
  const head = section(page, id);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}
async function field(page: Page, section: string, id: string, value: string) {
  await openSection(page, section);
  await fld(page, panel, id).fill(value);
  await fld(page, panel, id).press("Enter");
}
async function choose(page: Page, id: string, value: string) {
  await openSection(page, "secTrim");
  await fld(page, panel, id).selectOption(value);
}
/** The model's extent along x, in inches, to a thousandth. */
const across = async (page: Page) => {
  const ss = await solids(page);
  return Math.round((Math.max(...ss.map((x) => x.max[0])) - Math.min(...ss.map((x) => x.min[0]))) * 1e3) / 1e3;
};

test("ends, fillers and openings: an end panel is a part; a dishwasher opening is space in the row; the checks warn", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await fld(page, panel, "preset").selectOption("base");
  await expect(section(page, "secTrim")).toContainText("Nothing beside it");

  // A finished end on the left, flush with the doors and down to the floor; a GE dishwasher right of it.
  await choose(page, "endLeft", "panel");
  await expect(fld(page, panel, "endDown")).toHaveValue("floor");
  await expect(fld(page, panel, "endBand")).toHaveValue("front");
  await choose(page, "openRight", "dw-ge");
  await expect(section(page, "secTrim")).toContainText(/Left end panel · dishwasher \(ge\) right 24/);
  await expect(note(page, panel, "trimChecks")).toContainText("The cabinets beside and over its openings are checked once it is made.");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Base 1");
  await expect(page.locator("#hint")).toContainText("Left end panel");
  // The panel stands on the box's left side: 23/32 in.
  expect(await across(page)).toBe(24.719);

  // The next cabinet, with nothing beside it, goes right of Base 1: past the 24 in opening.
  await page.keyboard.press("Escape");
  const vp = (await page.locator("main.vp").boundingBox())!;
  await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  await expect(note(page, panel, "status")).toContainText("Adds");
  await choose(page, "endLeft", "none");
  await choose(page, "openRight", "none");
  await expect(section(page, "secTrim")).toContainText("Nothing beside it");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Base 2");
  expect(await across(page)).toBe(72.719);

  // The Rows panel: one row, the opening along it, and nothing to warn of (the tops at 34 1/2 in).
  await expect(note(page, rows, "row")).toContainText("Row of 2: Base 1, Base 2");
  await expect(table(page, rows, "rowItems").filter({ hasText: "Dishwasher (GE)" })).toContainText("Opening, right of Base 1");
  await expect(table(page, rows, "rowItems")).toHaveCount(4);
  await expect(note(page, rows, "rowChecks")).toHaveText("");

  // A 33 in sink in this 24 in base: Kohler's sheets ask for 36 in. A warning: it still builds.
  await field(page, "secTrim", "sinkWidth", "33");
  await expect(note(page, panel, "trimChecks")).toContainText("at least 36 in wide (Kohler's spec sheets)");
  await expect(page.locator(`[data-panel="${panel}"] [data-action="generate"]`)).toBeEnabled();

  // Base 2 an inch lower: the countertop over the dishwasher would be under GE's 34 1/2 in.
  await field(page, "secSize", "height", "33.5");
  await expect(note(page, rows, "rowChecks")).toContainText("Dishwasher (GE) beside Base 1 and Base 2");
  await expect(note(page, rows, "rowChecks")).toContainText("approximately 34 1/2 in");

  // The end panel is in the Cut list, a part of its own.
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist").locator('tr[data-part="Left end panel"]')).toBeVisible();
});
