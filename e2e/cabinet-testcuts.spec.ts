import { expect, test, type Page } from "@playwright/test";

// The cabinet generator's Test cuts group (plugins/cabinet-generator/testcuts.js): a test is
// added beside the model as its own assembly on the tag Test cuts, in one undo step, without
// taking the panel away from the cabinet it was showing; the joint ladders' picks set Joint
// clearance, to new cabinets or, one undo step, to the cabinet being edited.

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
const hint = (page: Page) => page.locator("#hint");
async function openSection(page: Page, id: string) {
  const head = section(page, id);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}

type GNode = { id: number; kind: string; name: string | null; label: string; parent: number | null; tag: string | null };
const graph = (page: Page) => page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { context: number | null; nodes: GNode[] } } }).__sawhorse.graph());
const tops = async (page: Page) => (await graph(page)).nodes.filter((n) => n.parent === null);
/** Select a top-level node from the Outliner, back on the Plugins tab after. */
async function outline(page: Page, name: string) {
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: name }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
}

test("a test goes beside the model on the tag Test cuts, one undo step, and the ladders' pick sets Joint clearance", async ({ page }) => {
  await start(page);
  await openSection(page, "secTests");
  // The machine check, as it starts: what it proves, the stock, what to measure.
  await expect(note(page, "testProves")).toContainText("its axes are square");
  await expect(table(page, "testRows").first()).toContainText("Slot width");
  await expect(table(page, "testRows").nth(1)).toContainText("4.000 in (101.6 mm)");
  await expect(note(page, "testArea")).toContainText("Test cuts · Machine check: 1 part");

  // The joint ladders: three coupons of five dados, the steps round 0.008 in.
  await fld(page, "testKind").selectOption("ladders");
  await expect(table(page, "testCuts")).toHaveCount(15);
  await expect(table(page, "testCuts").first()).toContainText("0.004 in");
  await expect(action(page, "applyFit")).toBeDisabled();
  await action(page, "makeTest").click();
  await expect(hint(page)).toContainText("Added Test cuts · Joint ladders beside the model, on the tag Test cuts");
  await expect.poll(async () => (await tops(page)).map((n) => [n.name, n.tag])).toEqual([["Test cuts · Joint ladders", "Test cuts"]]);

  // Picks that disagree set nothing; picks that agree set it, for new cabinets.
  await fld(page, "fit_dado").selectOption("2");
  await fld(page, "fit_back").selectOption("3");
  await expect(note(page, "fitStatus")).toContainText("The ladders disagree");
  await expect(action(page, "applyFit")).toBeDisabled();
  await fld(page, "fit_back").selectOption("2");
  await fld(page, "fit_bottom").selectOption("4");
  await expect(action(page, "applyFit")).toBeDisabled();
  await fld(page, "fit_bottom").selectOption("");
  await fld(page, "fit_dado").selectOption("4");
  await fld(page, "fit_back").selectOption("4");
  await expect(action(page, "applyFit")).toBeEnabled();
  await expect(action(page, "applyFit")).toHaveText("Set Joint clearance to 0.016 in (new cabinets)");
  await action(page, "applyFit").dblclick();
  await expect(hint(page)).toContainText("Joint clearance is 0.016 in for new cabinets");
  await expect(section(page, "secCnc")).toContainText("0.016 in joint clearance");
  // The ladders in the model were cut at 0.004 to 0.020: the picks still name those.
  await expect(note(page, "fitStatus")).toContainText("cut at 0.004 in to 0.020 in; Add makes 0.012 in to 0.028 in now");
  await expect(fld(page, "fit_dado").locator("option").nth(1)).toHaveText("Dado 1 · 0.004 in");

  // A cabinet, edited: a mini drawer from its settings goes beside it and the panel stays on it.
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(hint(page)).toContainText("Made Cabinet 1");
  await expect(note(page, "status")).toContainText("Editing Cabinet 1");
  // The pick set while it is edited: Cabinet 1 rebuilt with it, one undo step.
  await expect(section(page, "secCnc")).toContainText("0.016 in joint clearance");
  await fld(page, "fit_dado").selectOption("5");
  await expect(action(page, "applyFit")).toHaveText("Set Joint clearance to 0.020 in (Cabinet 1)");
  await action(page, "applyFit").click();
  await expect(hint(page)).toContainText("Joint clearance is 0.020 in for Cabinet 1");
  await expect(section(page, "secCnc")).toContainText("0.020 in joint clearance");
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+z");
  // An Undo of a rebuild leaves nothing selected (as for any edit): select it again.
  await outline(page, "Cabinet 1");
  await expect(note(page, "status")).toContainText("Editing Cabinet 1");
  await expect(section(page, "secCnc")).toContainText("0.016 in joint clearance");
  await fld(page, "testKind").selectOption("drawer");
  await expect(note(page, "testArea")).toContainText("Test cuts · Mini drawer (10 × 4 3/4 × 23 1/4)");
  await action(page, "makeTest").dblclick();
  await expect(hint(page)).toContainText("Added Test cuts · Mini drawer");
  await page.waitForTimeout(800);
  expect((await tops(page)).map((n) => n.name)).toEqual(["Test cuts · Joint ladders", "Cabinet 1", "Test cuts · Mini drawer"]);
  await expect(note(page, "status")).toContainText("Editing Cabinet 1");
  // One undo step takes it away; the cabinet stays.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await tops(page)).map((n) => n.name)).toEqual(["Test cuts · Joint ladders", "Cabinet 1"]);
  // A refused test says why: drawer box stock too thick for Blum.
  await openSection(page, "secLayout");
  await fld(page, "layout").selectOption("drawers");
  await openSection(page, "secMaterials");
  await fld(page, "drawerThickness").fill("3/4");
  await fld(page, "drawerThickness").press("Enter");
  await openSection(page, "secTests");
  await expect(note(page, "testStatus")).toContainText("takes drawer sides 12 to 16 mm (15/32 to 5/8 in) thick");
  await expect(action(page, "makeTest")).toBeDisabled();
});
