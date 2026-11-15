import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";

// A sheet's job sheet (src/nesting/jobsheet.ts), driven as a person would: a Base cabinet from
// the Cabinet generator, nested on 4 x 4 plywood with CNC spacing; the Nesting section's Job
// sheet for a router sheet, with a box ticked; then CNC files, which saves each sheet's DXF and
// then one file of job sheets for them all, each naming its DXF and listing exactly its cut
// layers.

const CABINET = "com.sawhorse3d.cabinet-generator";
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  // io=basic: saves become downloads Playwright can read.
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
}

async function enableCabinet(page: Page) {
  await page.getByRole("tab", { name: "Plugins" }).click();
  const row = page.locator(`.plugin-row[data-plugin="${CABINET}"]`);
  await row.locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Enable" }).click();
  await expect(row).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

/** Files the page downloads while `click` runs (io=basic saves are downloads), in order. */
async function downloads(page: Page, count: number, click: () => Promise<void>): Promise<{ name: string; text: string }[]> {
  const got: Download[] = [];
  const done = new Promise<void>((resolve) => {
    const on = (d: Download) => {
      got.push(d);
      if (got.length === count) {
        page.off("download", on);
        resolve();
      }
    };
    page.on("download", on);
  });
  await click();
  await done;
  return Promise.all(got.map(async (d) => ({ name: d.suggestedFilename(), text: readFileSync((await d.path())!, "utf8") })));
}

/** The layer table of a DXF, but layer 0. */
const layerNames = (text: string) => [...text.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]).filter((l) => l !== "0");

test("a router sheet's job sheet in the Nesting section, and one file of job sheets after the DXFs that CNC files saves", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await enableCabinet(page);
  const panel = `${CABINET}/cabinet`;
  await page.locator(`[data-panel="${panel}"] [data-field="preset"]`).selectOption("base");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  // Generating a cabinet can take a while on a busy machine.
  await expect(page.locator("#hint")).toContainText("Made Base", { timeout: 20_000 });
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.getByRole("button", { name: "Nesting ›" }).click();
  const section = page.getByTestId("nesting");
  await section.getByRole("button", { name: "Stock…" }).click();
  const dlg = page.getByRole("dialog", { name: "Stock" });
  await dlg.getByRole("button", { name: /Use 4 × 4 plywood/ }).click();
  await dlg.getByRole("button", { name: "Done" }).click();
  await section.getByRole("button", { name: "CNC spacing" }).click();
  const row = page.locator('[data-testid="nesting"] > .btnrow');
  await expect(row.getByRole("button", { name: "CNC files" })).toBeEnabled();
  await expect(row).not.toHaveAttribute("data-blocked", "true");

  // CNC setup: the compression bit is the profile bit; the Job sheet tab gives the pockets the
  // down-cut, and the hold-down width is Sawhorse's default.
  await section.getByRole("button", { name: "CNC setup…" }).click();
  const setup = page.getByRole("dialog", { name: "CNC setup" });
  await setup.getByRole("tab", { name: "Tools" }).click();
  await setup.getByLabel("Profile bit: Amana 46170, 1/4 in compression").check();
  await setup.getByRole("tab", { name: "Job sheet" }).click();
  await expect(setup.locator('[data-field="job-pocket"]')).toHaveValue("seed-downcut");
  await expect(setup.getByTestId("hold-down-note")).toContainText("not a standard");
  await setup.getByRole("button", { name: "Done" }).click();

  // The carcass sheet's job sheet: the sides' dados, back groove and holes.
  const sides = section.locator("figure.nest-piece").filter({ has: page.locator('[data-tag]') }).nth(1);
  await sides.getByRole("button", { name: "Job sheet" }).click();
  const js = sides.getByTestId("job-sheet");
  await expect(js).toBeVisible();
  await expect(js.getByTestId("job-file")).toContainText(" CNC.dxf");
  for (const layer of ["STOCK", "LABELS", "PROFILE_THRU", "POCKET_6.35MM", "POCKET_7.94MM"]) await expect(js.locator(`li[data-layer="${layer}"]`)).toBeVisible();
  // The back's 0.227 in groove is too narrow for the 1/4 in down-cut: flagged, and cut with the end mill.
  const groove = js.locator('li[data-layer="POCKET_7.94MM"]');
  await expect(groove.getByTestId("job-warnings")).toContainText("is not narrower than the narrowest shape on this layer");
  await expect(groove.getByTestId("job-bit")).toContainText("1/8 in end mill");
  await expect(js.getByTestId("job-order")).toContainText(/\d bits?, \d tool changes?/);
  const profile = js.locator('li[data-layer="PROFILE_THRU"]');
  await profile.getByRole("checkbox").check();
  await expect(js.getByRole("heading", { name: /Layers: 1 of \d+ with a toolpath/ })).toBeVisible();
  // STOCK and LABELS are reference: no box to tick.
  await expect(js.locator('li[data-layer="STOCK"]').getByRole("checkbox")).toHaveCount(0);
  await expect(js.locator('li[data-layer="STOCK"]')).toContainText("reference: no toolpath");

  // CNC files: the DXFs, then one file of job sheets for them all.
  const n = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: { saw?: boolean }[] };
  const sheets = n.pieces.filter((p) => !p.saw).length;
  const files = await downloads(page, sheets + 1, async () => {
    await row.getByRole("button", { name: "CNC files" }).click();
    const warning = page.getByRole("dialog", { name: "The nesting has problems" });
    await expect(warning).toContainText("confirm you own");
    await expect(warning).toContainText("cutting length");
    await expect(warning.getByRole("button", { name: "Open CNC setup..." })).toBeVisible();
    await warning.getByRole("button", { name: "Save the CNC files anyway" }).click();
  });
  const dxfs = files.slice(0, sheets);
  const jobs = files[sheets];
  expect(dxfs.some((f) => f.text.includes("__POCKET_WITH_1_8_IN_END_MILL_D3P175MM_OWNERSHIP_UNCONFIRMED"))).toBe(true);
  expect(dxfs.every((f) => / CNC\.dxf$/.test(f.name))).toBe(true);
  expect(jobs.name).toMatch(/ job sheets \d{4}-\d\d-\d\d\.txt$/);
  expect(jobs.text).toMatch(/default\s+name/);
  // One job sheet per DXF, in order, each naming its DXF and with a box for each cut layer.
  const each = jobs.text.split("\n\f\n").slice(1);
  expect(each).toHaveLength(sheets);
  dxfs.forEach((dxf, i) => {
    const job = each[i];
    expect(job).toContain(`DXF            ${dxf.name}\n`);
    const ticks = [...job.matchAll(/^\[ \] (\S+)/gm)].map((m) => m[1]);
    expect(ticks).toEqual(layerNames(dxf.text).filter((l) => l !== "STOCK" && l !== "LABELS"));
    expect(job).toContain("STOCK (reference: no toolpath)");
    expect(job).toMatch(/is\s+only\s+what\s+was\s+entered\s+for\s+the\s+stock,\s+not\s+a\s+measurement/);
    expect(job).not.toContain("CHOOSE A BIT");
  });
  await expect(page.locator("#hint")).toContainText(`Saved the job sheets for ${sheets} sheets as`);
});
